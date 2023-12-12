#![cfg_attr(not(feature = "std"), feature(lang_items, start))]
#![cfg_attr(not(feature = "std"), no_std)]

#[cfg_attr(not(feature = "std"), start)]
fn start(_argc: isize, _argv: *const *const u8) -> isize {
    0
}
#[lang = "eh_personality"]
#[no_mangle]
#[cfg(not(feature = "std"))]
pub extern "C" fn rust_eh_personality() {}
#[panic_handler]
#[cfg(not(feature = "std"))]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    unsafe {
        libc::abort();
    }
}

use displaydoc::Display;

/// this type is pretty swell
struct FakeType;

static_assertions::assert_impl_all!(FakeType: core::fmt::Display);

#[cfg(feature = "std")]
fn main() {}
