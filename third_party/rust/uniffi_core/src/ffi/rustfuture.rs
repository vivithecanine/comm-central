/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! [`RustFuture`] represents a [`Future`] that can be sent to the foreign code over FFI.
//!
//! This type is not instantiated directly, but via the procedural macros, such as `#[uniffi::export]`.
//!
//! # The big picture
//!
//! We implement async foreign functions using a simplified version of the Future API:
//!
//! 0. At startup, register a [RustFutureContinuationCallback] by calling
//!    rust_future_continuation_callback_set.
//! 1. Call the scaffolding function to get a [RustFutureHandle]
//! 2a. In a loop:
//!   - Call [rust_future_poll]
//!   - Suspend the function until the [rust_future_poll] continuation function is called
//!   - If the continuation was function was called with [RustFuturePoll::Ready], then break
//!     otherwise continue.
//! 2b. If the async function is cancelled, then call [rust_future_cancel].  This causes the
//!     continuation function to be called with [RustFuturePoll::Ready] and the [RustFuture] to
//!     enter a cancelled state.
//! 3. Call [rust_future_complete] to get the result of the future.
//! 4. Call [rust_future_free] to free the future, ideally in a finally block.  This:
//!    - Releases any resources held by the future
//!    - Calls any continuation callbacks that have not been called yet
//!
//! Note: Technically, the foreign code calls the scaffolding versions of the `rust_future_*`
//! functions.  These are generated by the scaffolding macro, specially prefixed, and extern "C",
//! and manually monomorphized in the case of [rust_future_complete].  See
//! `uniffi_macros/src/setup_scaffolding.rs` for details.
//!
//! ## How does `Future` work exactly?
//!
//! A [`Future`] in Rust does nothing. When calling an async function, it just
//! returns a `Future` but nothing has happened yet. To start the computation,
//! the future must be polled. It returns [`Poll::Ready(r)`][`Poll::Ready`] if
//! the result is ready, [`Poll::Pending`] otherwise. `Poll::Pending` basically
//! means:
//!
//! > Please, try to poll me later, maybe the result will be ready!
//!
//! This model is very different than what other languages do, but it can actually
//! be translated quite easily, fortunately for us!
//!
//! But… wait a minute… who is responsible to poll the `Future` if a `Future` does
//! nothing? Well, it's _the executor_. The executor is responsible _to drive_ the
//! `Future`: that's where they are polled.
//!
//! But… wait another minute… how does the executor know when to poll a [`Future`]?
//! Does it poll them randomly in an endless loop? Well, no, actually it depends
//! on the executor! A well-designed `Future` and executor work as follows.
//! Normally, when [`Future::poll`] is called, a [`Context`] argument is
//! passed to it. It contains a [`Waker`]. The [`Waker`] is built on top of a
//! [`RawWaker`] which implements whatever is necessary. Usually, a waker will
//! signal the executor to poll a particular `Future`. A `Future` will clone
//! or pass-by-ref the waker to somewhere, as a callback, a completion, a
//! function, or anything, to the system that is responsible to notify when a
//! task is completed. So, to recap, the waker is _not_ responsible for waking the
//! `Future`, it _is_ responsible for _signaling_ the executor that a particular
//! `Future` should be polled again. That's why the documentation of
//! [`Poll::Pending`] specifies:
//!
//! > When a function returns `Pending`, the function must also ensure that the
//! > current task is scheduled to be awoken when progress can be made.
//!
//! “awakening” is done by using the `Waker`.
//!
//! [`Future`]: https://doc.rust-lang.org/std/future/trait.Future.html
//! [`Future::poll`]: https://doc.rust-lang.org/std/future/trait.Future.html#tymethod.poll
//! [`Pol::Ready`]: https://doc.rust-lang.org/std/task/enum.Poll.html#variant.Ready
//! [`Poll::Pending`]: https://doc.rust-lang.org/std/task/enum.Poll.html#variant.Pending
//! [`Context`]: https://doc.rust-lang.org/std/task/struct.Context.html
//! [`Waker`]: https://doc.rust-lang.org/std/task/struct.Waker.html
//! [`RawWaker`]: https://doc.rust-lang.org/std/task/struct.RawWaker.html

use std::{
    future::Future,
    marker::PhantomData,
    mem,
    ops::Deref,
    panic,
    pin::Pin,
    sync::{Arc, Mutex},
    task::{Context, Poll, Wake},
};

use crate::{rust_call_with_out_status, FfiDefault, LowerReturn, RustCallStatus};

/// Result code for [rust_future_poll].  This is passed to the continuation function.
#[repr(i8)]
#[derive(Debug, PartialEq, Eq)]
pub enum RustFuturePoll {
    /// The future is ready and is waiting for [rust_future_complete] to be called
    Ready = 0,
    /// The future might be ready and [rust_future_poll] should be called again
    MaybeReady = 1,
}

/// Foreign callback that's passed to [rust_future_poll]
///
/// The Rust side of things calls this when the foreign side should call [rust_future_poll] again
/// to continue progress on the future.
pub type RustFutureContinuationCallback = extern "C" fn(callback_data: *const (), RustFuturePoll);

/// Opaque handle for a Rust future that's stored by the foreign language code
#[repr(transparent)]
pub struct RustFutureHandle(*const ());

// === Public FFI API ===

/// Create a new [RustFutureHandle]
///
/// For each exported async function, UniFFI will create a scaffolding function that uses this to
/// create the [RustFutureHandle] to pass to the foreign code.
pub fn rust_future_new<F, T, UT>(future: F, tag: UT) -> RustFutureHandle
where
    // F is the future type returned by the exported async function.  It needs to be Send + `static
    // since it will move between threads for an indeterminate amount of time as the foreign
    // executor calls polls it and the Rust executor wakes it.  It does not need to by `Sync`,
    // since we synchronize all access to the values.
    F: Future<Output = T> + Send + 'static,
    // T is the output of the Future.  It needs to implement [LowerReturn].  Also it must be Send +
    // 'static for the same reason as F.
    T: LowerReturn<UT> + Send + 'static,
    // The UniFfiTag ZST. The Send + 'static bound is to keep rustc happy.
    UT: Send + 'static,
{
    // Create a RustFuture and coerce to `Arc<dyn RustFutureFfi>`, which is what we use to
    // implement the FFI
    let future_ffi = RustFuture::new(future, tag) as Arc<dyn RustFutureFfi<T::ReturnType>>;
    // Box the Arc, to convert the wide pointer into a normal sized pointer so that we can pass it
    // to the foreign code.
    let boxed_ffi = Box::new(future_ffi);
    // We can now create a RustFutureHandle
    RustFutureHandle(Box::into_raw(boxed_ffi) as *mut ())
}

/// Poll a Rust future
///
/// When the future is ready to progress the continuation will be called with the `data` value and
/// a [RustFuturePoll] value. For each [rust_future_poll] call the continuation will be called
/// exactly once.
///
/// # Safety
///
/// The [RustFutureHandle] must not previously have been passed to [rust_future_free]
pub unsafe fn rust_future_poll<ReturnType>(
    handle: RustFutureHandle,
    callback: RustFutureContinuationCallback,
    data: *const (),
) {
    let future = &*(handle.0 as *mut Arc<dyn RustFutureFfi<ReturnType>>);
    future.clone().ffi_poll(callback, data)
}

/// Cancel a Rust future
///
/// Any current and future continuations will be immediately called with RustFuturePoll::Ready.
///
/// This is needed for languages like Swift, which continuation to wait for the continuation to be
/// called when tasks are cancelled.
///
/// # Safety
///
/// The [RustFutureHandle] must not previously have been passed to [rust_future_free]
pub unsafe fn rust_future_cancel<ReturnType>(handle: RustFutureHandle) {
    let future = &*(handle.0 as *mut Arc<dyn RustFutureFfi<ReturnType>>);
    future.clone().ffi_cancel()
}

/// Complete a Rust future
///
/// Note: the actually extern "C" scaffolding functions can't be generic, so we generate one for
/// each supported FFI type.
///
/// # Safety
///
/// - The [RustFutureHandle] must not previously have been passed to [rust_future_free]
/// - The `T` param must correctly correspond to the [rust_future_new] call.  It must
///   be `<Output as LowerReturn<UT>>::ReturnType`
pub unsafe fn rust_future_complete<ReturnType>(
    handle: RustFutureHandle,
    out_status: &mut RustCallStatus,
) -> ReturnType {
    let future = &*(handle.0 as *mut Arc<dyn RustFutureFfi<ReturnType>>);
    future.ffi_complete(out_status)
}

/// Free a Rust future, dropping the strong reference and releasing all references held by the
/// future.
///
/// # Safety
///
/// The [RustFutureHandle] must not previously have been passed to [rust_future_free]
pub unsafe fn rust_future_free<ReturnType>(handle: RustFutureHandle) {
    let future = Box::from_raw(handle.0 as *mut Arc<dyn RustFutureFfi<ReturnType>>);
    future.ffi_free()
}

/// Thread-safe storage for [RustFutureContinuationCallback] data
///
/// The basic guarantee is that all data pointers passed in are passed out exactly once to the
/// foreign continuation callback. This enables us to uphold the [rust_future_poll] guarantee.
///
/// [ContinuationDataCell] also tracks cancellation, which is closely tied to continuation data.
#[derive(Debug)]
enum ContinuationDataCell {
    /// No continuations set, neither wake() nor cancel() called.
    Empty,
    /// `wake()` was called when there was no continuation set.  The next time `store` is called,
    /// the continuation should be immediately invoked with `RustFuturePoll::MaybeReady`
    Waked,
    /// The future has been cancelled, any future `store` calls should immediately result in the
    /// continuation being called with `RustFuturePoll::Ready`.
    Cancelled,
    /// Continuation set, the next time `wake()`  is called is called, we should invoke it.
    Set(RustFutureContinuationCallback, *const ()),
}

impl ContinuationDataCell {
    fn new() -> Self {
        Self::Empty
    }

    /// Store new continuation data if we are in the `Empty` state.  If we are in the `Waked` or
    /// `Cancelled` state, call the continuation immediately with the data.
    fn store(&mut self, callback: RustFutureContinuationCallback, data: *const ()) {
        match self {
            Self::Empty => *self = Self::Set(callback, data),
            Self::Set(old_callback, old_data) => {
                log::error!(
                    "store: observed `Self::Set` state.  Is poll() being called from multiple threads at once?"
                );
                old_callback(*old_data, RustFuturePoll::Ready);
                *self = Self::Set(callback, data);
            }
            Self::Waked => {
                *self = Self::Empty;
                callback(data, RustFuturePoll::MaybeReady);
            }
            Self::Cancelled => {
                callback(data, RustFuturePoll::Ready);
            }
        }
    }

    fn wake(&mut self) {
        match self {
            // If we had a continuation set, then call it and transition to the `Empty` state.
            Self::Set(callback, old_data) => {
                let old_data = *old_data;
                let callback = *callback;
                *self = Self::Empty;
                callback(old_data, RustFuturePoll::MaybeReady);
            }
            // If we were in the `Empty` state, then transition to `Waked`.  The next time `store`
            // is called, we will immediately call the continuation.
            Self::Empty => *self = Self::Waked,
            // This is a no-op if we were in the `Cancelled` or `Waked` state.
            _ => (),
        }
    }

    fn cancel(&mut self) {
        if let Self::Set(callback, old_data) = mem::replace(self, Self::Cancelled) {
            callback(old_data, RustFuturePoll::Ready);
        }
    }

    fn is_cancelled(&self) -> bool {
        matches!(self, Self::Cancelled)
    }
}

// ContinuationDataCell is Send + Sync as long we handle the *const () pointer correctly

unsafe impl Send for ContinuationDataCell {}
unsafe impl Sync for ContinuationDataCell {}

/// Wraps the actual future we're polling
struct WrappedFuture<F, T, UT>
where
    // See rust_future_new for an explanation of these trait bounds
    F: Future<Output = T> + Send + 'static,
    T: LowerReturn<UT> + Send + 'static,
    UT: Send + 'static,
{
    // Note: this could be a single enum, but that would make it easy to mess up the future pinning
    // guarantee.   For example you might want to call `std::mem::take()` to try to get the result,
    // but if the future happened to be stored that would move and break all internal references.
    future: Option<F>,
    result: Option<Result<T::ReturnType, RustCallStatus>>,
}

impl<F, T, UT> WrappedFuture<F, T, UT>
where
    // See rust_future_new for an explanation of these trait bounds
    F: Future<Output = T> + Send + 'static,
    T: LowerReturn<UT> + Send + 'static,
    UT: Send + 'static,
{
    fn new(future: F) -> Self {
        Self {
            future: Some(future),
            result: None,
        }
    }

    // Poll the future and check if it's ready or not
    fn poll(&mut self, context: &mut Context<'_>) -> bool {
        if self.result.is_some() {
            true
        } else if let Some(future) = &mut self.future {
            // SAFETY: We can call Pin::new_unchecked because:
            //    - This is the only time we get a &mut to `self.future`
            //    - We never poll the future after it's moved (for example by using take())
            //    - We never move RustFuture, which contains us.
            //    - RustFuture is private to this module so no other code can move it.
            let pinned = unsafe { Pin::new_unchecked(future) };
            // Run the poll and lift the result if it's ready
            let mut out_status = RustCallStatus::default();
            let result: Option<Poll<T::ReturnType>> = rust_call_with_out_status(
                &mut out_status,
                // This closure uses a `&mut F` value, which means it's not UnwindSafe by
                // default.  If the future panics, it may be in an invalid state.
                //
                // However, we can safely use `AssertUnwindSafe` since a panic will lead the `None`
                // case below and we will never poll the future again.
                panic::AssertUnwindSafe(|| match pinned.poll(context) {
                    Poll::Pending => Ok(Poll::Pending),
                    Poll::Ready(v) => T::lower_return(v).map(Poll::Ready),
                }),
            );
            match result {
                Some(Poll::Pending) => false,
                Some(Poll::Ready(v)) => {
                    self.future = None;
                    self.result = Some(Ok(v));
                    true
                }
                None => {
                    self.future = None;
                    self.result = Some(Err(out_status));
                    true
                }
            }
        } else {
            log::error!("poll with neither future nor result set");
            true
        }
    }

    fn complete(&mut self, out_status: &mut RustCallStatus) -> T::ReturnType {
        let mut return_value = T::ReturnType::ffi_default();
        match self.result.take() {
            Some(Ok(v)) => return_value = v,
            Some(Err(call_status)) => *out_status = call_status,
            None => *out_status = RustCallStatus::cancelled(),
        }
        self.free();
        return_value
    }

    fn free(&mut self) {
        self.future = None;
        self.result = None;
    }
}

// If F and T are Send, then WrappedFuture is too
//
// Rust will not mark it Send by default when T::ReturnType is a raw pointer.  This is promising
// that we will treat the raw pointer properly, for example by not returning it twice.
unsafe impl<F, T, UT> Send for WrappedFuture<F, T, UT>
where
    // See rust_future_new for an explanation of these trait bounds
    F: Future<Output = T> + Send + 'static,
    T: LowerReturn<UT> + Send + 'static,
    UT: Send + 'static,
{
}

/// Future that the foreign code is awaiting
struct RustFuture<F, T, UT>
where
    // See rust_future_new for an explanation of these trait bounds
    F: Future<Output = T> + Send + 'static,
    T: LowerReturn<UT> + Send + 'static,
    UT: Send + 'static,
{
    // This Mutex should never block if our code is working correctly, since there should not be
    // multiple threads calling [Self::poll] and/or [Self::complete] at the same time.
    future: Mutex<WrappedFuture<F, T, UT>>,
    continuation_data: Mutex<ContinuationDataCell>,
    // UT is used as the generic parameter for [LowerReturn].
    // Let's model this with PhantomData as a function that inputs a UT value.
    _phantom: PhantomData<fn(UT) -> ()>,
}

impl<F, T, UT> RustFuture<F, T, UT>
where
    // See rust_future_new for an explanation of these trait bounds
    F: Future<Output = T> + Send + 'static,
    T: LowerReturn<UT> + Send + 'static,
    UT: Send + 'static,
{
    fn new(future: F, _tag: UT) -> Arc<Self> {
        Arc::new(Self {
            future: Mutex::new(WrappedFuture::new(future)),
            continuation_data: Mutex::new(ContinuationDataCell::new()),
            _phantom: PhantomData,
        })
    }

    fn poll(self: Arc<Self>, callback: RustFutureContinuationCallback, data: *const ()) {
        let ready = self.is_cancelled() || {
            let mut locked = self.future.lock().unwrap();
            let waker: std::task::Waker = Arc::clone(&self).into();
            locked.poll(&mut Context::from_waker(&waker))
        };
        if ready {
            callback(data, RustFuturePoll::Ready)
        } else {
            self.continuation_data.lock().unwrap().store(callback, data);
        }
    }

    fn is_cancelled(&self) -> bool {
        self.continuation_data.lock().unwrap().is_cancelled()
    }

    fn wake(&self) {
        self.continuation_data.lock().unwrap().wake();
    }

    fn cancel(&self) {
        self.continuation_data.lock().unwrap().cancel();
    }

    fn complete(&self, call_status: &mut RustCallStatus) -> T::ReturnType {
        self.future.lock().unwrap().complete(call_status)
    }

    fn free(self: Arc<Self>) {
        // Call cancel() to send any leftover data to the continuation callback
        self.continuation_data.lock().unwrap().cancel();
        // Ensure we drop our inner future, releasing all held references
        self.future.lock().unwrap().free();
    }
}

impl<F, T, UT> Wake for RustFuture<F, T, UT>
where
    // See rust_future_new for an explanation of these trait bounds
    F: Future<Output = T> + Send + 'static,
    T: LowerReturn<UT> + Send + 'static,
    UT: Send + 'static,
{
    fn wake(self: Arc<Self>) {
        self.deref().wake()
    }

    fn wake_by_ref(self: &Arc<Self>) {
        self.deref().wake()
    }
}

/// RustFuture FFI trait.  This allows `Arc<RustFuture<F, T, UT>>` to be cast to
/// `Arc<dyn RustFutureFfi<T::ReturnType>>`, which is needed to implement the public FFI API.  In particular, this
/// allows you to use RustFuture functionality without knowing the concrete Future type, which is
/// unnamable.
///
/// This is parametrized on the ReturnType rather than the `T` directly, to reduce the number of
/// scaffolding functions we need to generate.  If it was parametrized on `T`, then we would need
/// to create a poll, cancel, complete, and free scaffolding function for each exported async
/// function.  That would add ~1kb binary size per exported function based on a quick estimate on a
/// x86-64 machine . By parametrizing on `T::ReturnType` we can instead monomorphize by hand and
/// only create those functions for each of the 13 possible FFI return types.
#[doc(hidden)]
trait RustFutureFfi<ReturnType> {
    fn ffi_poll(self: Arc<Self>, callback: RustFutureContinuationCallback, data: *const ());
    fn ffi_cancel(&self);
    fn ffi_complete(&self, call_status: &mut RustCallStatus) -> ReturnType;
    fn ffi_free(self: Arc<Self>);
}

impl<F, T, UT> RustFutureFfi<T::ReturnType> for RustFuture<F, T, UT>
where
    // See rust_future_new for an explanation of these trait bounds
    F: Future<Output = T> + Send + 'static,
    T: LowerReturn<UT> + Send + 'static,
    UT: Send + 'static,
{
    fn ffi_poll(self: Arc<Self>, callback: RustFutureContinuationCallback, data: *const ()) {
        self.poll(callback, data)
    }

    fn ffi_cancel(&self) {
        self.cancel()
    }

    fn ffi_complete(&self, call_status: &mut RustCallStatus) -> T::ReturnType {
        self.complete(call_status)
    }

    fn ffi_free(self: Arc<Self>) {
        self.free();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{test_util::TestError, Lift, RustBuffer, RustCallStatusCode};
    use once_cell::sync::OnceCell;
    use std::task::Waker;

    // Sender/Receiver pair that we use for testing
    struct Channel {
        result: Option<Result<String, TestError>>,
        waker: Option<Waker>,
    }

    struct Sender(Arc<Mutex<Channel>>);

    impl Sender {
        fn wake(&self) {
            let inner = self.0.lock().unwrap();
            if let Some(waker) = &inner.waker {
                waker.wake_by_ref();
            }
        }

        fn send(&self, value: Result<String, TestError>) {
            let mut inner = self.0.lock().unwrap();
            if inner.result.replace(value).is_some() {
                panic!("value already sent");
            }
            if let Some(waker) = &inner.waker {
                waker.wake_by_ref();
            }
        }
    }

    struct Receiver(Arc<Mutex<Channel>>);

    impl Future for Receiver {
        type Output = Result<String, TestError>;

        fn poll(
            self: Pin<&mut Self>,
            context: &mut Context<'_>,
        ) -> Poll<Result<String, TestError>> {
            let mut inner = self.0.lock().unwrap();
            match &inner.result {
                Some(v) => Poll::Ready(v.clone()),
                None => {
                    inner.waker = Some(context.waker().clone());
                    Poll::Pending
                }
            }
        }
    }

    // Create a sender and rust future that we can use for testing
    fn channel() -> (Sender, Arc<dyn RustFutureFfi<RustBuffer>>) {
        let channel = Arc::new(Mutex::new(Channel {
            result: None,
            waker: None,
        }));
        let rust_future = RustFuture::new(Receiver(channel.clone()), crate::UniFfiTag);
        (Sender(channel), rust_future)
    }

    /// Poll a Rust future and get an OnceCell that's set when the continuation is called
    fn poll(rust_future: &Arc<dyn RustFutureFfi<RustBuffer>>) -> Arc<OnceCell<RustFuturePoll>> {
        let cell = Arc::new(OnceCell::new());
        let cell_ptr = Arc::into_raw(cell.clone()) as *const ();
        rust_future.clone().ffi_poll(poll_continuation, cell_ptr);
        cell
    }

    extern "C" fn poll_continuation(data: *const (), code: RustFuturePoll) {
        let cell = unsafe { Arc::from_raw(data as *const OnceCell<RustFuturePoll>) };
        cell.set(code).expect("Error setting OnceCell");
    }

    fn complete(rust_future: Arc<dyn RustFutureFfi<RustBuffer>>) -> (RustBuffer, RustCallStatus) {
        let mut out_status_code = RustCallStatus::default();
        let return_value = rust_future.ffi_complete(&mut out_status_code);
        (return_value, out_status_code)
    }

    #[test]
    fn test_success() {
        let (sender, rust_future) = channel();

        // Test polling the rust future before it's ready
        let continuation_result = poll(&rust_future);
        assert_eq!(continuation_result.get(), None);
        sender.wake();
        assert_eq!(continuation_result.get(), Some(&RustFuturePoll::MaybeReady));

        // Test polling the rust future when it's ready
        let continuation_result = poll(&rust_future);
        assert_eq!(continuation_result.get(), None);
        sender.send(Ok("All done".into()));
        assert_eq!(continuation_result.get(), Some(&RustFuturePoll::MaybeReady));

        // Future polls should immediately return ready
        let continuation_result = poll(&rust_future);
        assert_eq!(continuation_result.get(), Some(&RustFuturePoll::Ready));

        // Complete the future
        let (return_buf, call_status) = complete(rust_future);
        assert_eq!(call_status.code, RustCallStatusCode::Success);
        assert_eq!(
            <String as Lift<crate::UniFfiTag>>::try_lift(return_buf).unwrap(),
            "All done"
        );
    }

    #[test]
    fn test_error() {
        let (sender, rust_future) = channel();

        let continuation_result = poll(&rust_future);
        assert_eq!(continuation_result.get(), None);
        sender.send(Err("Something went wrong".into()));
        assert_eq!(continuation_result.get(), Some(&RustFuturePoll::MaybeReady));

        let continuation_result = poll(&rust_future);
        assert_eq!(continuation_result.get(), Some(&RustFuturePoll::Ready));

        let (_, call_status) = complete(rust_future);
        assert_eq!(call_status.code, RustCallStatusCode::Error);
        unsafe {
            assert_eq!(
                <TestError as Lift<crate::UniFfiTag>>::try_lift_from_rust_buffer(
                    call_status.error_buf.assume_init()
                )
                .unwrap(),
                TestError::from("Something went wrong"),
            )
        }
    }

    // Once `complete` is called, the inner future should be released, even if wakers still hold a
    // reference to the RustFuture
    #[test]
    fn test_cancel() {
        let (_sender, rust_future) = channel();

        let continuation_result = poll(&rust_future);
        assert_eq!(continuation_result.get(), None);
        rust_future.ffi_cancel();
        // Cancellation should immediately invoke the callback with RustFuturePoll::Ready
        assert_eq!(continuation_result.get(), Some(&RustFuturePoll::Ready));

        // Future polls should immediately invoke the callback with RustFuturePoll::Ready
        let continuation_result = poll(&rust_future);
        assert_eq!(continuation_result.get(), Some(&RustFuturePoll::Ready));

        let (_, call_status) = complete(rust_future);
        assert_eq!(call_status.code, RustCallStatusCode::Cancelled);
    }

    // Once `free` is called, the inner future should be released, even if wakers still hold a
    // reference to the RustFuture
    #[test]
    fn test_release_future() {
        let (sender, rust_future) = channel();
        // Create a weak reference to the channel to use to check if rust_future has dropped its
        // future.
        let channel_weak = Arc::downgrade(&sender.0);
        drop(sender);
        // Create an extra ref to rust_future, simulating a waker that still holds a reference to
        // it
        let rust_future2 = rust_future.clone();

        // Complete the rust future
        rust_future.ffi_free();
        // Even though rust_future is still alive, the channel shouldn't be
        assert!(Arc::strong_count(&rust_future2) > 0);
        assert_eq!(channel_weak.strong_count(), 0);
        assert!(channel_weak.upgrade().is_none());
    }

    // If `free` is called with a continuation still stored, we should call it them then.
    //
    // This shouldn't happen in practice, but it seems like good defensive programming
    #[test]
    fn test_complete_with_stored_continuation() {
        let (_sender, rust_future) = channel();

        let continuation_result = poll(&rust_future);
        rust_future.ffi_free();
        assert_eq!(continuation_result.get(), Some(&RustFuturePoll::Ready));
    }

    // Test what happens if we see a `wake()` call while we're polling the future.  This can
    // happen, for example, with futures that are handled by a tokio thread pool.  We should
    // schedule another poll of the future in this case.
    #[test]
    fn test_wake_during_poll() {
        let mut first_time = true;
        let future = std::future::poll_fn(move |ctx| {
            if first_time {
                first_time = false;
                // Wake the future while we are in the middle of polling it
                ctx.waker().clone().wake();
                Poll::Pending
            } else {
                // The second time we're polled, we're ready
                Poll::Ready("All done".to_owned())
            }
        });
        let rust_future: Arc<dyn RustFutureFfi<RustBuffer>> =
            RustFuture::new(future, crate::UniFfiTag);
        let continuation_result = poll(&rust_future);
        // The continuation function should called immediately
        assert_eq!(continuation_result.get(), Some(&RustFuturePoll::MaybeReady));
        // A second poll should finish the future
        let continuation_result = poll(&rust_future);
        assert_eq!(continuation_result.get(), Some(&RustFuturePoll::Ready));
        let (return_buf, call_status) = complete(rust_future);
        assert_eq!(call_status.code, RustCallStatusCode::Success);
        assert_eq!(
            <String as Lift<crate::UniFfiTag>>::try_lift(return_buf).unwrap(),
            "All done"
        );
    }
}
