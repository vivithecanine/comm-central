//! `FromCast` and `IntoCast` implementations for portable 64-bit wide vectors
#[rustfmt::skip]

use crate::*;

impl_from_cast!(
    i8x8[test_v64]: u8x8,
    m8x8,
    i16x8,
    u16x8,
    m16x8,
    i32x8,
    u32x8,
    f32x8,
    m32x8,
    i64x8,
    u64x8,
    f64x8,
    m64x8,
    isizex8,
    usizex8,
    msizex8
);
impl_from_cast!(
    u8x8[test_v64]: i8x8,
    m8x8,
    i16x8,
    u16x8,
    m16x8,
    i32x8,
    u32x8,
    f32x8,
    m32x8,
    i64x8,
    u64x8,
    f64x8,
    m64x8,
    isizex8,
    usizex8,
    msizex8
);
impl_from_cast_mask!(
    m8x8[test_v64]: i8x8,
    u8x8,
    i16x8,
    u16x8,
    m16x8,
    i32x8,
    u32x8,
    f32x8,
    m32x8,
    i64x8,
    u64x8,
    f64x8,
    m64x8,
    isizex8,
    usizex8,
    msizex8
);

impl_from_cast!(
    i16x4[test_v64]: i8x4,
    u8x4,
    m8x4,
    u16x4,
    m16x4,
    i32x4,
    u32x4,
    f32x4,
    m32x4,
    i64x4,
    u64x4,
    f64x4,
    m64x4,
    i128x4,
    u128x4,
    m128x4,
    isizex4,
    usizex4,
    msizex4
);
impl_from_cast!(
    u16x4[test_v64]: i8x4,
    u8x4,
    m8x4,
    i16x4,
    m16x4,
    i32x4,
    u32x4,
    f32x4,
    m32x4,
    i64x4,
    u64x4,
    f64x4,
    m64x4,
    i128x4,
    u128x4,
    m128x4,
    isizex4,
    usizex4,
    msizex4
);
impl_from_cast_mask!(
    m16x4[test_v64]: i8x4,
    u8x4,
    m8x4,
    i16x4,
    u16x4,
    i32x4,
    u32x4,
    f32x4,
    m32x4,
    i64x4,
    u64x4,
    f64x4,
    m64x4,
    i128x4,
    u128x4,
    m128x4,
    isizex4,
    usizex4,
    msizex4
);

impl_from_cast!(
    i32x2[test_v64]: i8x2,
    u8x2,
    m8x2,
    i16x2,
    u16x2,
    m16x2,
    u32x2,
    f32x2,
    m32x2,
    i64x2,
    u64x2,
    f64x2,
    m64x2,
    i128x2,
    u128x2,
    m128x2,
    isizex2,
    usizex2,
    msizex2
);
impl_from_cast!(
    u32x2[test_v64]: i8x2,
    u8x2,
    m8x2,
    i16x2,
    u16x2,
    m16x2,
    i32x2,
    f32x2,
    m32x2,
    i64x2,
    u64x2,
    f64x2,
    m64x2,
    i128x2,
    u128x2,
    m128x2,
    isizex2,
    usizex2,
    msizex2
);
impl_from_cast!(
    f32x2[test_v64]: i8x2,
    u8x2,
    m8x2,
    i16x2,
    u16x2,
    m16x2,
    i32x2,
    u32x2,
    m32x2,
    i64x2,
    u64x2,
    f64x2,
    m64x2,
    i128x2,
    u128x2,
    m128x2,
    isizex2,
    usizex2,
    msizex2
);
impl_from_cast_mask!(
    m32x2[test_v64]: i8x2,
    u8x2,
    m8x2,
    i16x2,
    u16x2,
    m16x2,
    i32x2,
    u32x2,
    f32x2,
    i64x2,
    u64x2,
    f64x2,
    m64x2,
    i128x2,
    u128x2,
    m128x2,
    isizex2,
    usizex2,
    msizex2
);
