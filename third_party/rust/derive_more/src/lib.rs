// These links overwrite the ones in `README.md`
// to become proper intra-doc links in Rust docs.
//! [`From`]: crate::From
//! [`Into`]: crate::Into
//! [`FromStr`]: crate::FromStr
//! [`TryInto`]: crate::TryInto
//! [`IntoIterator`]: crate::IntoIterator
//! [`AsRef`]: crate::AsRef
//!
//! [`Debug`]: crate::Debug
//! [`Display`-like]: crate::Display
//!
//! [`Error`]: crate::Error
//!
//! [`Index`]: crate::Index
//! [`Deref`]: crate::Deref
//! [`Not`-like]: crate::Not
//! [`Add`-like]: crate::Add
//! [`Mul`-like]: crate::Mul
//! [`Sum`-like]: crate::Sum
//! [`IndexMut`]: crate::IndexMut
//! [`DerefMut`]: crate::DerefMut
//! [`AddAssign`-like]: crate::AddAssign
//! [`MulAssign`-like]: crate::MulAssign
//!
//! [`Constructor`]: crate::Constructor
//! [`IsVariant`]: crate::IsVariant
//! [`Unwrap`]: crate::Unwrap
//! [`TryUnwrap`]: crate::TryUnwrap

// The README includes doctests requiring these features. To make sure that
// tests pass when not all features are provided we exclude it when the
// required features are not available.
#![cfg_attr(
    all(
        feature = "add",
        feature = "display",
        feature = "from",
        feature = "into"
    ),
    doc = include_str!("../README.md")
)]
#![cfg_attr(not(feature = "std"), no_std)]
#![cfg_attr(all(not(feature = "std"), feature = "error"), feature(error_in_core))]
#![cfg_attr(docsrs, feature(doc_auto_cfg))]
#![cfg_attr(any(not(docsrs), ci), deny(rustdoc::all))]
#![forbid(non_ascii_idents, unsafe_code)]
#![warn(clippy::nonstandard_macro_braces)]

// Not public, but exported API. For macro expansion internals only.
#[doc(hidden)]
pub mod __private {
    #[cfg(feature = "debug")]
    pub use crate::fmt::{debug_tuple, DebugTuple};

    #[cfg(feature = "error")]
    pub use crate::vendor::thiserror::aserror::AsDynError;
}

// The modules containing error types and other helpers
#[cfg(any(feature = "add", feature = "not"))]
pub mod ops;

#[cfg(feature = "debug")]
mod fmt;

#[cfg(feature = "error")]
mod vendor;

#[cfg(feature = "from_str")]
mod r#str;
#[cfg(feature = "from_str")]
#[doc(inline)]
pub use crate::r#str::FromStrError;

#[cfg(feature = "try_into")]
mod convert;
#[cfg(feature = "try_into")]
#[doc(inline)]
pub use crate::convert::TryIntoError;

#[cfg(feature = "try_unwrap")]
mod try_unwrap;
#[cfg(feature = "try_unwrap")]
#[doc(inline)]
pub use self::try_unwrap::TryUnwrapError;

// When re-exporting traits from std we need to do a pretty crazy trick, because we ONLY want
// to re-export the traits and not derives that are called the same in the std module,
// because those would conflict with our own. The way we do this is by first importing both
// the trait and possible derive into a separate module and re-export them. Then we wildcard import
// all the things from that module into the main module, but we also import our own derive by its
// exact name. Due to the way wildcard imports work in rust, that results in our own derive taking
// precedence over any derive from std. For some reason the named re-export of our own derive
// cannot be in in this (or really any) macro too. It will somehow still consider it a wildcard
// then and will result in this warning ambiguous_glob_reexports, and not actually exporting of our
// derive.
macro_rules! re_export_traits((
    $feature:literal, $new_module_name:ident, $module:path $(, $traits:ident)* $(,)?) => {
        #[cfg(feature = $feature)]
        mod $new_module_name {
            pub use $module::{$($traits),*};
        }

        #[cfg(feature = $feature)]
        #[doc(hidden)]
        pub use crate::$new_module_name::*;

    }
);

re_export_traits!(
    "add",
    add_traits,
    core::ops,
    Add,
    BitAnd,
    BitOr,
    BitXor,
    Sub,
);
re_export_traits!(
    "add_assign",
    add_assign_traits,
    core::ops,
    AddAssign,
    BitAndAssign,
    BitOrAssign,
    BitXorAssign,
    SubAssign,
);
re_export_traits!("as_mut", as_mut_traits, core::convert, AsMut);
re_export_traits!("as_ref", as_ref_traits, core::convert, AsRef);
re_export_traits!("debug", debug_traits, core::fmt, Debug);
re_export_traits!("deref", deref_traits, core::ops, Deref);
re_export_traits!("deref_mut", deref_mut_traits, core::ops, DerefMut);
re_export_traits!(
    "display",
    display_traits,
    core::fmt,
    Binary,
    Display,
    LowerExp,
    LowerHex,
    Octal,
    Pointer,
    UpperExp,
    UpperHex,
);

#[cfg(not(feature = "std"))]
re_export_traits!("error", error_traits, core::error, Error);
#[cfg(feature = "std")]
re_export_traits!("error", error_traits, std::error, Error);

re_export_traits!("from", from_traits, core::convert, From);

re_export_traits!("from_str", from_str_traits, core::str, FromStr);

re_export_traits!("index", index_traits, core::ops, Index);

re_export_traits!("index_mut", index_mut_traits, core::ops, IndexMut);

re_export_traits!("into", into_traits, core::convert, Into);

re_export_traits!(
    "into_iterator",
    into_iterator_traits,
    core::iter,
    IntoIterator,
);

re_export_traits!("mul", mul_traits, core::ops, Div, Mul, Rem, Shl, Shr);

#[cfg(feature = "mul_assign")]
re_export_traits!(
    "mul_assign",
    mul_assign_traits,
    core::ops,
    DivAssign,
    MulAssign,
    RemAssign,
    ShlAssign,
    ShrAssign,
);

re_export_traits!("not", not_traits, core::ops, Neg, Not);

re_export_traits!("sum", sum_traits, core::iter, Product, Sum);

re_export_traits!("try_into", try_into_traits, core::convert, TryInto);

// Now re-export our own derives by their exact name to overwrite any derives that the trait
// re-exporting might inadvertently pull into scope.
#[cfg(feature = "add")]
pub use derive_more_impl::{Add, BitAnd, BitOr, BitXor, Sub};

#[cfg(feature = "add_assign")]
pub use derive_more_impl::{
    AddAssign, BitAndAssign, BitOrAssign, BitXorAssign, SubAssign,
};

#[cfg(feature = "as_mut")]
pub use derive_more_impl::AsMut;

#[cfg(feature = "as_ref")]
pub use derive_more_impl::AsRef;

#[cfg(feature = "constructor")]
pub use derive_more_impl::Constructor;

#[cfg(feature = "debug")]
pub use derive_more_impl::Debug;

#[cfg(feature = "deref")]
pub use derive_more_impl::Deref;

#[cfg(feature = "deref_mut")]
pub use derive_more_impl::DerefMut;

#[cfg(feature = "display")]
pub use derive_more_impl::{
    Binary, Display, LowerExp, LowerHex, Octal, Pointer, UpperExp, UpperHex,
};

#[cfg(feature = "error")]
pub use derive_more_impl::Error;

#[cfg(feature = "from")]
pub use derive_more_impl::From;

#[cfg(feature = "from_str")]
pub use derive_more_impl::FromStr;

#[cfg(feature = "index")]
pub use derive_more_impl::Index;

#[cfg(feature = "index_mut")]
pub use derive_more_impl::IndexMut;

#[cfg(feature = "into")]
pub use derive_more_impl::Into;

#[cfg(feature = "into_iterator")]
pub use derive_more_impl::IntoIterator;

#[cfg(feature = "is_variant")]
pub use derive_more_impl::IsVariant;

#[cfg(feature = "mul")]
pub use derive_more_impl::{Div, Mul, Rem, Shl, Shr};

#[cfg(feature = "mul_assign")]
pub use derive_more_impl::{DivAssign, MulAssign, RemAssign, ShlAssign, ShrAssign};

#[cfg(feature = "not")]
pub use derive_more_impl::{Neg, Not};

#[cfg(feature = "sum")]
pub use derive_more_impl::{Product, Sum};

#[cfg(feature = "try_into")]
pub use derive_more_impl::TryInto;

#[cfg(feature = "try_unwrap")]
pub use derive_more_impl::TryUnwrap;

#[cfg(feature = "unwrap")]
pub use derive_more_impl::Unwrap;

// Check if any feature is enabled
#[cfg(not(any(
    feature = "full",
    feature = "add",
    feature = "add_assign",
    feature = "as_mut",
    feature = "as_ref",
    feature = "constructor",
    feature = "debug",
    feature = "deref",
    feature = "deref_mut",
    feature = "display",
    feature = "error",
    feature = "from",
    feature = "from_str",
    feature = "index",
    feature = "index_mut",
    feature = "into",
    feature = "into_iterator",
    feature = "is_variant",
    feature = "mul",
    feature = "mul_assign",
    feature = "not",
    feature = "sum",
    feature = "try_into",
    feature = "try_unwrap",
    feature = "unwrap",
)))]
compile_error!(
    "at least one derive feature must be enabled (or the \"full\" one enabling all the derives)"
);
