/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use crate::backend::{CodeType, Literal};
use paste::paste;

macro_rules! impl_code_type_for_miscellany {
    ($T:ty, $class_name:literal, $canonical_name:literal) => {
        paste! {
            #[derive(Debug)]
            pub struct $T;

            impl CodeType for $T  {
                fn type_label(&self) -> String {
                    $class_name.into()
                }

                fn canonical_name(&self) -> String {
                   $canonical_name.into()
               }

                fn literal(&self, _literal: &Literal) -> String {
                    unreachable!()
                }
            }
        }
    };
}

impl_code_type_for_miscellany!(TimestampCodeType, "java.time.Instant", "Timestamp");

impl_code_type_for_miscellany!(DurationCodeType, "java.time.Duration", "Duration");
