// Based on unstable std::sync::OnceLock.
//
// Source: https://github.com/rust-lang/rust/blob/8e9c93df464b7ada3fc7a1c8ccddd9dcb24ee0a0/library/std/src/sync/once_lock.rs

use core::cell::UnsafeCell;
use core::mem::MaybeUninit;
use core::sync::atomic::{AtomicBool, Ordering};
use std::sync::Once;

pub(crate) struct OnceLock<T> {
    once: Once,
    // Once::is_completed requires Rust 1.43, so use this to track of whether they have been initialized.
    is_initialized: AtomicBool,
    value: UnsafeCell<MaybeUninit<T>>,
    // Unlike std::sync::OnceLock, we don't need PhantomData here because
    // we don't use #[may_dangle].
}

unsafe impl<T: Sync + Send> Sync for OnceLock<T> {}
unsafe impl<T: Send> Send for OnceLock<T> {}

impl<T> OnceLock<T> {
    /// Creates a new empty cell.
    #[must_use]
    pub(crate) const fn new() -> Self {
        Self {
            once: Once::new(),
            is_initialized: AtomicBool::new(false),
            value: UnsafeCell::new(MaybeUninit::uninit()),
        }
    }

    /// Gets the contents of the cell, initializing it with `f` if the cell
    /// was empty.
    ///
    /// Many threads may call `get_or_init` concurrently with different
    /// initializing functions, but it is guaranteed that only one function
    /// will be executed.
    ///
    /// # Panics
    ///
    /// If `f` panics, the panic is propagated to the caller, and the cell
    /// remains uninitialized.
    ///
    /// It is an error to reentrantly initialize the cell from `f`. The
    /// exact outcome is unspecified. Current implementation deadlocks, but
    /// this may be changed to a panic in the future.
    pub(crate) fn get_or_init<F>(&self, f: F) -> &T
    where
        F: FnOnce() -> T,
    {
        // Fast path check
        if self.is_initialized() {
            // SAFETY: The inner value has been initialized
            return unsafe { self.get_unchecked() };
        }
        self.initialize(f);

        debug_assert!(self.is_initialized());

        // SAFETY: The inner value has been initialized
        unsafe { self.get_unchecked() }
    }

    #[inline]
    fn is_initialized(&self) -> bool {
        self.is_initialized.load(Ordering::Acquire)
    }

    #[cold]
    fn initialize<F>(&self, f: F)
    where
        F: FnOnce() -> T,
    {
        let slot = self.value.get().cast::<T>();
        let is_initialized = &self.is_initialized;

        self.once.call_once(|| {
            let value = f();
            unsafe {
                slot.write(value);
            }
            is_initialized.store(true, Ordering::Release);
        });
    }

    /// # Safety
    ///
    /// The value must be initialized
    unsafe fn get_unchecked(&self) -> &T {
        debug_assert!(self.is_initialized());
        &*self.value.get().cast::<T>()
    }
}

impl<T> Drop for OnceLock<T> {
    fn drop(&mut self) {
        if self.is_initialized() {
            // SAFETY: The inner value has been initialized
            unsafe { self.value.get().cast::<T>().drop_in_place() };
        }
    }
}
