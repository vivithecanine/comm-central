/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#[cfg(feature = "enable_profiler")]
pub mod profiler;

#[cfg(feature = "enable_profiler")]
pub use profiler::{load, register_thread_with_profiler};

#[cfg(not(feature = "enable_profiler"))]
mod disabled;

#[cfg(not(feature = "enable_profiler"))]
pub use disabled::{load, register_thread_with_profiler};
