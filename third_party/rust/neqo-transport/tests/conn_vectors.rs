// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

// Tests with the test vectors from the spec.
#![deny(clippy::pedantic)]
#![cfg(not(feature = "fuzzing"))]

use neqo_common::Datagram;
use neqo_transport::{
    Connection, ConnectionParameters, RandomConnectionIdGenerator, State, Version,
};
use test_fixture::{self, addr, now};

use std::cell::RefCell;
use std::rc::Rc;

const INITIAL_PACKET_V2: &[u8] = &[
    0xdd, 0x70, 0x9a, 0x50, 0xc4, 0x08, 0x83, 0x94, 0xc8, 0xf0, 0x3e, 0x51, 0x57, 0x08, 0x00, 0x00,
    0x44, 0x9e, 0x43, 0x91, 0xd8, 0x48, 0x23, 0xb8, 0xe6, 0x10, 0x58, 0x9c, 0x83, 0xc9, 0x2d, 0x0e,
    0x97, 0xeb, 0x7a, 0x6e, 0x50, 0x03, 0xf5, 0x77, 0x64, 0xc5, 0xc7, 0xf0, 0x09, 0x5b, 0xa5, 0x4b,
    0x90, 0x81, 0x8f, 0x1b, 0xfe, 0xec, 0xc1, 0xc9, 0x7c, 0x54, 0xfc, 0x73, 0x1e, 0xdb, 0xd2, 0xa2,
    0x44, 0xe3, 0xb1, 0xe6, 0x39, 0xa9, 0xbc, 0x75, 0xed, 0x54, 0x5b, 0x98, 0x64, 0x93, 0x43, 0xb2,
    0x53, 0x61, 0x5e, 0xc6, 0xb3, 0xe4, 0xdf, 0x0f, 0xd2, 0xe7, 0xfe, 0x9d, 0x69, 0x1a, 0x09, 0xe6,
    0xa1, 0x44, 0xb4, 0x36, 0xd8, 0xa2, 0xc0, 0x88, 0xa4, 0x04, 0x26, 0x23, 0x40, 0xdf, 0xd9, 0x95,
    0xec, 0x38, 0x65, 0x69, 0x4e, 0x30, 0x26, 0xec, 0xd8, 0xc6, 0xd2, 0x56, 0x1a, 0x5a, 0x36, 0x67,
    0x2a, 0x10, 0x05, 0x01, 0x81, 0x68, 0xc0, 0xf0, 0x81, 0xc1, 0x0e, 0x2b, 0xf1, 0x4d, 0x55, 0x0c,
    0x97, 0x7e, 0x28, 0xbb, 0x9a, 0x75, 0x9c, 0x57, 0xd0, 0xf7, 0xff, 0xb1, 0xcd, 0xfb, 0x40, 0xbd,
    0x77, 0x4d, 0xec, 0x58, 0x96, 0x57, 0x54, 0x20, 0x47, 0xdf, 0xfe, 0xfa, 0x56, 0xfc, 0x80, 0x89,
    0xa4, 0xd1, 0xef, 0x37, 0x9c, 0x81, 0xba, 0x3d, 0xf7, 0x1a, 0x05, 0xdd, 0xc7, 0x92, 0x83, 0x40,
    0x77, 0x59, 0x10, 0xfe, 0xb3, 0xce, 0x4c, 0xbc, 0xfd, 0x8d, 0x25, 0x3e, 0xdd, 0x05, 0xf1, 0x61,
    0x45, 0x8f, 0x9d, 0xc4, 0x4b, 0xea, 0x01, 0x7c, 0x31, 0x17, 0xcc, 0xa7, 0x06, 0x5a, 0x31, 0x5d,
    0xed, 0xa9, 0x46, 0x4e, 0x67, 0x2e, 0xc8, 0x0c, 0x3f, 0x79, 0xac, 0x99, 0x34, 0x37, 0xb4, 0x41,
    0xef, 0x74, 0x22, 0x7e, 0xcc, 0x4d, 0xc9, 0xd5, 0x97, 0xf6, 0x6a, 0xb0, 0xab, 0x8d, 0x21, 0x4b,
    0x55, 0x84, 0x0c, 0x70, 0x34, 0x9d, 0x76, 0x16, 0xcb, 0xe3, 0x8e, 0x5e, 0x1d, 0x05, 0x2d, 0x07,
    0xf1, 0xfe, 0xdb, 0x3d, 0xd3, 0xc4, 0xd8, 0xce, 0x29, 0x57, 0x24, 0x94, 0x5e, 0x67, 0xed, 0x2e,
    0xef, 0xcd, 0x9f, 0xb5, 0x24, 0x72, 0x38, 0x7f, 0x31, 0x8e, 0x3d, 0x9d, 0x23, 0x3b, 0xe7, 0xdf,
    0xc7, 0x9d, 0x6b, 0xf6, 0x08, 0x0d, 0xcb, 0xbb, 0x41, 0xfe, 0xb1, 0x80, 0xd7, 0x85, 0x88, 0x49,
    0x7c, 0x3e, 0x43, 0x9d, 0x38, 0xc3, 0x34, 0x74, 0x8d, 0x2b, 0x56, 0xfd, 0x19, 0xab, 0x36, 0x4d,
    0x05, 0x7a, 0x9b, 0xd5, 0xa6, 0x99, 0xae, 0x14, 0x5d, 0x7f, 0xdb, 0xc8, 0xf5, 0x77, 0x75, 0x18,
    0x1b, 0x0a, 0x97, 0xc3, 0xbd, 0xed, 0xc9, 0x1a, 0x55, 0x5d, 0x6c, 0x9b, 0x86, 0x34, 0xe1, 0x06,
    0xd8, 0xc9, 0xca, 0x45, 0xa9, 0xd5, 0x45, 0x0a, 0x76, 0x79, 0xed, 0xc5, 0x45, 0xda, 0x91, 0x02,
    0x5b, 0xc9, 0x3a, 0x7c, 0xf9, 0xa0, 0x23, 0xa0, 0x66, 0xff, 0xad, 0xb9, 0x71, 0x7f, 0xfa, 0xf3,
    0x41, 0x4c, 0x3b, 0x64, 0x6b, 0x57, 0x38, 0xb3, 0xcc, 0x41, 0x16, 0x50, 0x2d, 0x18, 0xd7, 0x9d,
    0x82, 0x27, 0x43, 0x63, 0x06, 0xd9, 0xb2, 0xb3, 0xaf, 0xc6, 0xc7, 0x85, 0xce, 0x3c, 0x81, 0x7f,
    0xeb, 0x70, 0x3a, 0x42, 0xb9, 0xc8, 0x3b, 0x59, 0xf0, 0xdc, 0xef, 0x12, 0x45, 0xd0, 0xb3, 0xe4,
    0x02, 0x99, 0x82, 0x1e, 0xc1, 0x95, 0x49, 0xce, 0x48, 0x97, 0x14, 0xfe, 0x26, 0x11, 0xe7, 0x2c,
    0xd8, 0x82, 0xf4, 0xf7, 0x0d, 0xce, 0x7d, 0x36, 0x71, 0x29, 0x6f, 0xc0, 0x45, 0xaf, 0x5c, 0x9f,
    0x63, 0x0d, 0x7b, 0x49, 0xa3, 0xeb, 0x82, 0x1b, 0xbc, 0xa6, 0x0f, 0x19, 0x84, 0xdc, 0xe6, 0x64,
    0x91, 0x71, 0x3b, 0xfe, 0x06, 0x00, 0x1a, 0x56, 0xf5, 0x1b, 0xb3, 0xab, 0xe9, 0x2f, 0x79, 0x60,
    0x54, 0x7c, 0x4d, 0x0a, 0x70, 0xf4, 0xa9, 0x62, 0xb3, 0xf0, 0x5d, 0xc2, 0x5a, 0x34, 0xbb, 0xe8,
    0x30, 0xa7, 0xea, 0x47, 0x36, 0xd3, 0xb0, 0x16, 0x17, 0x23, 0x50, 0x0d, 0x82, 0xbe, 0xda, 0x9b,
    0xe3, 0x32, 0x7a, 0xf2, 0xaa, 0x41, 0x38, 0x21, 0xff, 0x67, 0x8b, 0x2a, 0x87, 0x6e, 0xc4, 0xb0,
    0x0b, 0xb6, 0x05, 0xff, 0xcc, 0x39, 0x17, 0xff, 0xdc, 0x27, 0x9f, 0x18, 0x7d, 0xaa, 0x2f, 0xce,
    0x8c, 0xde, 0x12, 0x19, 0x80, 0xbb, 0xa8, 0xec, 0x8f, 0x44, 0xca, 0x56, 0x2b, 0x0f, 0x13, 0x19,
    0x14, 0xc9, 0x01, 0xcf, 0xbd, 0x84, 0x74, 0x08, 0xb7, 0x78, 0xe6, 0x73, 0x8c, 0x7b, 0xb5, 0xb1,
    0xb3, 0xf9, 0x7d, 0x01, 0xb0, 0xa2, 0x4d, 0xcc, 0xa4, 0x0e, 0x3b, 0xed, 0x29, 0x41, 0x1b, 0x1b,
    0xa8, 0xf6, 0x08, 0x43, 0xc4, 0xa2, 0x41, 0x02, 0x1b, 0x23, 0x13, 0x2b, 0x95, 0x00, 0x50, 0x9b,
    0x9a, 0x35, 0x16, 0xd4, 0xa9, 0xdd, 0x41, 0xd3, 0xba, 0xcb, 0xcd, 0x42, 0x6b, 0x45, 0x13, 0x93,
    0x52, 0x18, 0x28, 0xaf, 0xed, 0xcf, 0x20, 0xfa, 0x46, 0xac, 0x24, 0xf4, 0x4a, 0x8e, 0x29, 0x73,
    0x30, 0xb1, 0x67, 0x05, 0xd5, 0xd5, 0xf7, 0x98, 0xef, 0xf9, 0xe9, 0x13, 0x4a, 0x06, 0x59, 0x79,
    0x87, 0xa1, 0xdb, 0x46, 0x17, 0xca, 0xa2, 0xd9, 0x38, 0x37, 0x73, 0x08, 0x29, 0xd4, 0xd8, 0x9e,
    0x16, 0x41, 0x3b, 0xe4, 0xd8, 0xa8, 0xa3, 0x8a, 0x7e, 0x62, 0x26, 0x62, 0x3b, 0x64, 0xa8, 0x20,
    0x17, 0x8e, 0xc3, 0xa6, 0x69, 0x54, 0xe1, 0x07, 0x10, 0xe0, 0x43, 0xae, 0x73, 0xdd, 0x3f, 0xb2,
    0x71, 0x5a, 0x05, 0x25, 0xa4, 0x63, 0x43, 0xfb, 0x75, 0x90, 0xe5, 0xea, 0xc7, 0xee, 0x55, 0xfc,
    0x81, 0x0e, 0x0d, 0x8b, 0x4b, 0x8f, 0x7b, 0xe8, 0x2c, 0xd5, 0xa2, 0x14, 0x57, 0x5a, 0x1b, 0x99,
    0x62, 0x9d, 0x47, 0xa9, 0xb2, 0x81, 0xb6, 0x13, 0x48, 0xc8, 0x62, 0x7c, 0xab, 0x38, 0xe2, 0xa6,
    0x4d, 0xb6, 0x62, 0x6e, 0x97, 0xbb, 0x8f, 0x77, 0xbd, 0xcb, 0x0f, 0xee, 0x47, 0x6a, 0xed, 0xd7,
    0xba, 0x8f, 0x54, 0x41, 0xac, 0xaa, 0xb0, 0x0f, 0x44, 0x32, 0xed, 0xab, 0x37, 0x91, 0x04, 0x7d,
    0x90, 0x91, 0xb2, 0xa7, 0x53, 0xf0, 0x35, 0x64, 0x84, 0x31, 0xf6, 0xd1, 0x2f, 0x7d, 0x6a, 0x68,
    0x1e, 0x64, 0xc8, 0x61, 0xf4, 0xac, 0x91, 0x1a, 0x0f, 0x7d, 0x6e, 0xc0, 0x49, 0x1a, 0x78, 0xc9,
    0xf1, 0x92, 0xf9, 0x6b, 0x3a, 0x5e, 0x75, 0x60, 0xa3, 0xf0, 0x56, 0xbc, 0x1c, 0xa8, 0x59, 0x83,
    0x67, 0xad, 0x6a, 0xcb, 0x6f, 0x2e, 0x03, 0x4c, 0x7f, 0x37, 0xbe, 0xeb, 0x9e, 0xd4, 0x70, 0xc4,
    0x30, 0x4a, 0xf0, 0x10, 0x7f, 0x0e, 0xb9, 0x19, 0xbe, 0x36, 0xa8, 0x6f, 0x68, 0xf3, 0x7f, 0xa6,
    0x1d, 0xae, 0x7a, 0xff, 0x14, 0xde, 0xcd, 0x67, 0xec, 0x31, 0x57, 0xa1, 0x14, 0x88, 0xa1, 0x4f,
    0xed, 0x01, 0x42, 0x82, 0x83, 0x48, 0xf5, 0xf6, 0x08, 0xb0, 0xfe, 0x03, 0xe1, 0xf3, 0xc0, 0xaf,
    0x3a, 0xcc, 0xa0, 0xce, 0x36, 0x85, 0x2e, 0xd4, 0x2e, 0x22, 0x0a, 0xe9, 0xab, 0xf8, 0xf8, 0x90,
    0x6f, 0x00, 0xf1, 0xb8, 0x6b, 0xff, 0x85, 0x04, 0xc8, 0xf1, 0x6c, 0x78, 0x4f, 0xd5, 0x2d, 0x25,
    0xe0, 0x13, 0xff, 0x4f, 0xda, 0x90, 0x3e, 0x9e, 0x1e, 0xb4, 0x53, 0xc1, 0x46, 0x4b, 0x11, 0x96,
    0x6d, 0xb9, 0xb2, 0x8e, 0x8f, 0x26, 0xa3, 0xfc, 0x41, 0x9e, 0x6a, 0x60, 0xa4, 0x8d, 0x4c, 0x72,
    0x14, 0xee, 0x9c, 0x6c, 0x6a, 0x12, 0xb6, 0x8a, 0x32, 0xca, 0xc8, 0xf6, 0x15, 0x80, 0xc6, 0x4f,
    0x29, 0xcb, 0x69, 0x22, 0x40, 0x87, 0x83, 0xc6, 0xd1, 0x2e, 0x72, 0x5b, 0x01, 0x4f, 0xe4, 0x85,
    0xcd, 0x17, 0xe4, 0x84, 0xc5, 0x95, 0x2b, 0xf9, 0x9b, 0xc9, 0x49, 0x41, 0xd4, 0xb1, 0x91, 0x9d,
    0x04, 0x31, 0x7b, 0x8a, 0xa1, 0xbd, 0x37, 0x54, 0xec, 0xba, 0xa1, 0x0e, 0xc2, 0x27, 0xde, 0x85,
    0x40, 0x69, 0x5b, 0xf2, 0xfb, 0x8e, 0xe5, 0x6f, 0x6d, 0xc5, 0x26, 0xef, 0x36, 0x66, 0x25, 0xb9,
    0x1a, 0xa4, 0x97, 0x0b, 0x6f, 0xfa, 0x5c, 0x82, 0x84, 0xb9, 0xb5, 0xab, 0x85, 0x2b, 0x90, 0x5f,
    0x9d, 0x83, 0xf5, 0x66, 0x9c, 0x05, 0x35, 0xbc, 0x37, 0x7b, 0xcc, 0x05, 0xad, 0x5e, 0x48, 0xe2,
    0x81, 0xec, 0x0e, 0x19, 0x17, 0xca, 0x3c, 0x6a, 0x47, 0x1f, 0x8d, 0xa0, 0x89, 0x4b, 0xc8, 0x2a,
    0xc2, 0xa8, 0x96, 0x54, 0x05, 0xd6, 0xee, 0xf3, 0xb5, 0xe2, 0x93, 0xa8, 0x8f, 0xda, 0x20, 0x3f,
    0x09, 0xbd, 0xc7, 0x27, 0x57, 0xb1, 0x07, 0xab, 0x14, 0x88, 0x0e, 0xaa, 0x3e, 0xf7, 0x04, 0x5b,
    0x58, 0x0f, 0x48, 0x21, 0xce, 0x6d, 0xd3, 0x25, 0xb5, 0xa9, 0x06, 0x55, 0xd8, 0xc5, 0xb5, 0x5f,
    0x76, 0xfb, 0x84, 0x62, 0x79, 0xa9, 0xb5, 0x18, 0xc5, 0xe9, 0xb9, 0xa2, 0x11, 0x65, 0xc5, 0x09,
    0x3e, 0xd4, 0x9b, 0xaa, 0xac, 0xad, 0xf1, 0xf2, 0x18, 0x73, 0x26, 0x6c, 0x76, 0x7f, 0x67, 0x69,
];

const INITIAL_PACKET_V1: &[u8] = &[
    0xc0, 0x00, 0x00, 0x00, 0x01, 0x08, 0x83, 0x94, 0xc8, 0xf0, 0x3e, 0x51, 0x57, 0x08, 0x00, 0x00,
    0x44, 0x9e, 0x7b, 0x9a, 0xec, 0x34, 0xd1, 0xb1, 0xc9, 0x8d, 0xd7, 0x68, 0x9f, 0xb8, 0xec, 0x11,
    0xd2, 0x42, 0xb1, 0x23, 0xdc, 0x9b, 0xd8, 0xba, 0xb9, 0x36, 0xb4, 0x7d, 0x92, 0xec, 0x35, 0x6c,
    0x0b, 0xab, 0x7d, 0xf5, 0x97, 0x6d, 0x27, 0xcd, 0x44, 0x9f, 0x63, 0x30, 0x00, 0x99, 0xf3, 0x99,
    0x1c, 0x26, 0x0e, 0xc4, 0xc6, 0x0d, 0x17, 0xb3, 0x1f, 0x84, 0x29, 0x15, 0x7b, 0xb3, 0x5a, 0x12,
    0x82, 0xa6, 0x43, 0xa8, 0xd2, 0x26, 0x2c, 0xad, 0x67, 0x50, 0x0c, 0xad, 0xb8, 0xe7, 0x37, 0x8c,
    0x8e, 0xb7, 0x53, 0x9e, 0xc4, 0xd4, 0x90, 0x5f, 0xed, 0x1b, 0xee, 0x1f, 0xc8, 0xaa, 0xfb, 0xa1,
    0x7c, 0x75, 0x0e, 0x2c, 0x7a, 0xce, 0x01, 0xe6, 0x00, 0x5f, 0x80, 0xfc, 0xb7, 0xdf, 0x62, 0x12,
    0x30, 0xc8, 0x37, 0x11, 0xb3, 0x93, 0x43, 0xfa, 0x02, 0x8c, 0xea, 0x7f, 0x7f, 0xb5, 0xff, 0x89,
    0xea, 0xc2, 0x30, 0x82, 0x49, 0xa0, 0x22, 0x52, 0x15, 0x5e, 0x23, 0x47, 0xb6, 0x3d, 0x58, 0xc5,
    0x45, 0x7a, 0xfd, 0x84, 0xd0, 0x5d, 0xff, 0xfd, 0xb2, 0x03, 0x92, 0x84, 0x4a, 0xe8, 0x12, 0x15,
    0x46, 0x82, 0xe9, 0xcf, 0x01, 0x2f, 0x90, 0x21, 0xa6, 0xf0, 0xbe, 0x17, 0xdd, 0xd0, 0xc2, 0x08,
    0x4d, 0xce, 0x25, 0xff, 0x9b, 0x06, 0xcd, 0xe5, 0x35, 0xd0, 0xf9, 0x20, 0xa2, 0xdb, 0x1b, 0xf3,
    0x62, 0xc2, 0x3e, 0x59, 0x6d, 0x11, 0xa4, 0xf5, 0xa6, 0xcf, 0x39, 0x48, 0x83, 0x8a, 0x3a, 0xec,
    0x4e, 0x15, 0xda, 0xf8, 0x50, 0x0a, 0x6e, 0xf6, 0x9e, 0xc4, 0xe3, 0xfe, 0xb6, 0xb1, 0xd9, 0x8e,
    0x61, 0x0a, 0xc8, 0xb7, 0xec, 0x3f, 0xaf, 0x6a, 0xd7, 0x60, 0xb7, 0xba, 0xd1, 0xdb, 0x4b, 0xa3,
    0x48, 0x5e, 0x8a, 0x94, 0xdc, 0x25, 0x0a, 0xe3, 0xfd, 0xb4, 0x1e, 0xd1, 0x5f, 0xb6, 0xa8, 0xe5,
    0xeb, 0xa0, 0xfc, 0x3d, 0xd6, 0x0b, 0xc8, 0xe3, 0x0c, 0x5c, 0x42, 0x87, 0xe5, 0x38, 0x05, 0xdb,
    0x05, 0x9a, 0xe0, 0x64, 0x8d, 0xb2, 0xf6, 0x42, 0x64, 0xed, 0x5e, 0x39, 0xbe, 0x2e, 0x20, 0xd8,
    0x2d, 0xf5, 0x66, 0xda, 0x8d, 0xd5, 0x99, 0x8c, 0xca, 0xbd, 0xae, 0x05, 0x30, 0x60, 0xae, 0x6c,
    0x7b, 0x43, 0x78, 0xe8, 0x46, 0xd2, 0x9f, 0x37, 0xed, 0x7b, 0x4e, 0xa9, 0xec, 0x5d, 0x82, 0xe7,
    0x96, 0x1b, 0x7f, 0x25, 0xa9, 0x32, 0x38, 0x51, 0xf6, 0x81, 0xd5, 0x82, 0x36, 0x3a, 0xa5, 0xf8,
    0x99, 0x37, 0xf5, 0xa6, 0x72, 0x58, 0xbf, 0x63, 0xad, 0x6f, 0x1a, 0x0b, 0x1d, 0x96, 0xdb, 0xd4,
    0xfa, 0xdd, 0xfc, 0xef, 0xc5, 0x26, 0x6b, 0xa6, 0x61, 0x17, 0x22, 0x39, 0x5c, 0x90, 0x65, 0x56,
    0xbe, 0x52, 0xaf, 0xe3, 0xf5, 0x65, 0x63, 0x6a, 0xd1, 0xb1, 0x7d, 0x50, 0x8b, 0x73, 0xd8, 0x74,
    0x3e, 0xeb, 0x52, 0x4b, 0xe2, 0x2b, 0x3d, 0xcb, 0xc2, 0xc7, 0x46, 0x8d, 0x54, 0x11, 0x9c, 0x74,
    0x68, 0x44, 0x9a, 0x13, 0xd8, 0xe3, 0xb9, 0x58, 0x11, 0xa1, 0x98, 0xf3, 0x49, 0x1d, 0xe3, 0xe7,
    0xfe, 0x94, 0x2b, 0x33, 0x04, 0x07, 0xab, 0xf8, 0x2a, 0x4e, 0xd7, 0xc1, 0xb3, 0x11, 0x66, 0x3a,
    0xc6, 0x98, 0x90, 0xf4, 0x15, 0x70, 0x15, 0x85, 0x3d, 0x91, 0xe9, 0x23, 0x03, 0x7c, 0x22, 0x7a,
    0x33, 0xcd, 0xd5, 0xec, 0x28, 0x1c, 0xa3, 0xf7, 0x9c, 0x44, 0x54, 0x6b, 0x9d, 0x90, 0xca, 0x00,
    0xf0, 0x64, 0xc9, 0x9e, 0x3d, 0xd9, 0x79, 0x11, 0xd3, 0x9f, 0xe9, 0xc5, 0xd0, 0xb2, 0x3a, 0x22,
    0x9a, 0x23, 0x4c, 0xb3, 0x61, 0x86, 0xc4, 0x81, 0x9e, 0x8b, 0x9c, 0x59, 0x27, 0x72, 0x66, 0x32,
    0x29, 0x1d, 0x6a, 0x41, 0x82, 0x11, 0xcc, 0x29, 0x62, 0xe2, 0x0f, 0xe4, 0x7f, 0xeb, 0x3e, 0xdf,
    0x33, 0x0f, 0x2c, 0x60, 0x3a, 0x9d, 0x48, 0xc0, 0xfc, 0xb5, 0x69, 0x9d, 0xbf, 0xe5, 0x89, 0x64,
    0x25, 0xc5, 0xba, 0xc4, 0xae, 0xe8, 0x2e, 0x57, 0xa8, 0x5a, 0xaf, 0x4e, 0x25, 0x13, 0xe4, 0xf0,
    0x57, 0x96, 0xb0, 0x7b, 0xa2, 0xee, 0x47, 0xd8, 0x05, 0x06, 0xf8, 0xd2, 0xc2, 0x5e, 0x50, 0xfd,
    0x14, 0xde, 0x71, 0xe6, 0xc4, 0x18, 0x55, 0x93, 0x02, 0xf9, 0x39, 0xb0, 0xe1, 0xab, 0xd5, 0x76,
    0xf2, 0x79, 0xc4, 0xb2, 0xe0, 0xfe, 0xb8, 0x5c, 0x1f, 0x28, 0xff, 0x18, 0xf5, 0x88, 0x91, 0xff,
    0xef, 0x13, 0x2e, 0xef, 0x2f, 0xa0, 0x93, 0x46, 0xae, 0xe3, 0x3c, 0x28, 0xeb, 0x13, 0x0f, 0xf2,
    0x8f, 0x5b, 0x76, 0x69, 0x53, 0x33, 0x41, 0x13, 0x21, 0x19, 0x96, 0xd2, 0x00, 0x11, 0xa1, 0x98,
    0xe3, 0xfc, 0x43, 0x3f, 0x9f, 0x25, 0x41, 0x01, 0x0a, 0xe1, 0x7c, 0x1b, 0xf2, 0x02, 0x58, 0x0f,
    0x60, 0x47, 0x47, 0x2f, 0xb3, 0x68, 0x57, 0xfe, 0x84, 0x3b, 0x19, 0xf5, 0x98, 0x40, 0x09, 0xdd,
    0xc3, 0x24, 0x04, 0x4e, 0x84, 0x7a, 0x4f, 0x4a, 0x0a, 0xb3, 0x4f, 0x71, 0x95, 0x95, 0xde, 0x37,
    0x25, 0x2d, 0x62, 0x35, 0x36, 0x5e, 0x9b, 0x84, 0x39, 0x2b, 0x06, 0x10, 0x85, 0x34, 0x9d, 0x73,
    0x20, 0x3a, 0x4a, 0x13, 0xe9, 0x6f, 0x54, 0x32, 0xec, 0x0f, 0xd4, 0xa1, 0xee, 0x65, 0xac, 0xcd,
    0xd5, 0xe3, 0x90, 0x4d, 0xf5, 0x4c, 0x1d, 0xa5, 0x10, 0xb0, 0xff, 0x20, 0xdc, 0xc0, 0xc7, 0x7f,
    0xcb, 0x2c, 0x0e, 0x0e, 0xb6, 0x05, 0xcb, 0x05, 0x04, 0xdb, 0x87, 0x63, 0x2c, 0xf3, 0xd8, 0xb4,
    0xda, 0xe6, 0xe7, 0x05, 0x76, 0x9d, 0x1d, 0xe3, 0x54, 0x27, 0x01, 0x23, 0xcb, 0x11, 0x45, 0x0e,
    0xfc, 0x60, 0xac, 0x47, 0x68, 0x3d, 0x7b, 0x8d, 0x0f, 0x81, 0x13, 0x65, 0x56, 0x5f, 0xd9, 0x8c,
    0x4c, 0x8e, 0xb9, 0x36, 0xbc, 0xab, 0x8d, 0x06, 0x9f, 0xc3, 0x3b, 0xd8, 0x01, 0xb0, 0x3a, 0xde,
    0xa2, 0xe1, 0xfb, 0xc5, 0xaa, 0x46, 0x3d, 0x08, 0xca, 0x19, 0x89, 0x6d, 0x2b, 0xf5, 0x9a, 0x07,
    0x1b, 0x85, 0x1e, 0x6c, 0x23, 0x90, 0x52, 0x17, 0x2f, 0x29, 0x6b, 0xfb, 0x5e, 0x72, 0x40, 0x47,
    0x90, 0xa2, 0x18, 0x10, 0x14, 0xf3, 0xb9, 0x4a, 0x4e, 0x97, 0xd1, 0x17, 0xb4, 0x38, 0x13, 0x03,
    0x68, 0xcc, 0x39, 0xdb, 0xb2, 0xd1, 0x98, 0x06, 0x5a, 0xe3, 0x98, 0x65, 0x47, 0x92, 0x6c, 0xd2,
    0x16, 0x2f, 0x40, 0xa2, 0x9f, 0x0c, 0x3c, 0x87, 0x45, 0xc0, 0xf5, 0x0f, 0xba, 0x38, 0x52, 0xe5,
    0x66, 0xd4, 0x45, 0x75, 0xc2, 0x9d, 0x39, 0xa0, 0x3f, 0x0c, 0xda, 0x72, 0x19, 0x84, 0xb6, 0xf4,
    0x40, 0x59, 0x1f, 0x35, 0x5e, 0x12, 0xd4, 0x39, 0xff, 0x15, 0x0a, 0xab, 0x76, 0x13, 0x49, 0x9d,
    0xbd, 0x49, 0xad, 0xab, 0xc8, 0x67, 0x6e, 0xef, 0x02, 0x3b, 0x15, 0xb6, 0x5b, 0xfc, 0x5c, 0xa0,
    0x69, 0x48, 0x10, 0x9f, 0x23, 0xf3, 0x50, 0xdb, 0x82, 0x12, 0x35, 0x35, 0xeb, 0x8a, 0x74, 0x33,
    0xbd, 0xab, 0xcb, 0x90, 0x92, 0x71, 0xa6, 0xec, 0xbc, 0xb5, 0x8b, 0x93, 0x6a, 0x88, 0xcd, 0x4e,
    0x8f, 0x2e, 0x6f, 0xf5, 0x80, 0x01, 0x75, 0xf1, 0x13, 0x25, 0x3d, 0x8f, 0xa9, 0xca, 0x88, 0x85,
    0xc2, 0xf5, 0x52, 0xe6, 0x57, 0xdc, 0x60, 0x3f, 0x25, 0x2e, 0x1a, 0x8e, 0x30, 0x8f, 0x76, 0xf0,
    0xbe, 0x79, 0xe2, 0xfb, 0x8f, 0x5d, 0x5f, 0xbb, 0xe2, 0xe3, 0x0e, 0xca, 0xdd, 0x22, 0x07, 0x23,
    0xc8, 0xc0, 0xae, 0xa8, 0x07, 0x8c, 0xdf, 0xcb, 0x38, 0x68, 0x26, 0x3f, 0xf8, 0xf0, 0x94, 0x00,
    0x54, 0xda, 0x48, 0x78, 0x18, 0x93, 0xa7, 0xe4, 0x9a, 0xd5, 0xaf, 0xf4, 0xaf, 0x30, 0x0c, 0xd8,
    0x04, 0xa6, 0xb6, 0x27, 0x9a, 0xb3, 0xff, 0x3a, 0xfb, 0x64, 0x49, 0x1c, 0x85, 0x19, 0x4a, 0xab,
    0x76, 0x0d, 0x58, 0xa6, 0x06, 0x65, 0x4f, 0x9f, 0x44, 0x00, 0xe8, 0xb3, 0x85, 0x91, 0x35, 0x6f,
    0xbf, 0x64, 0x25, 0xac, 0xa2, 0x6d, 0xc8, 0x52, 0x44, 0x25, 0x9f, 0xf2, 0xb1, 0x9c, 0x41, 0xb9,
    0xf9, 0x6f, 0x3c, 0xa9, 0xec, 0x1d, 0xde, 0x43, 0x4d, 0xa7, 0xd2, 0xd3, 0x92, 0xb9, 0x05, 0xdd,
    0xf3, 0xd1, 0xf9, 0xaf, 0x93, 0xd1, 0xaf, 0x59, 0x50, 0xbd, 0x49, 0x3f, 0x5a, 0xa7, 0x31, 0xb4,
    0x05, 0x6d, 0xf3, 0x1b, 0xd2, 0x67, 0xb6, 0xb9, 0x0a, 0x07, 0x98, 0x31, 0xaa, 0xf5, 0x79, 0xbe,
    0x0a, 0x39, 0x01, 0x31, 0x37, 0xaa, 0xc6, 0xd4, 0x04, 0xf5, 0x18, 0xcf, 0xd4, 0x68, 0x40, 0x64,
    0x7e, 0x78, 0xbf, 0xe7, 0x06, 0xca, 0x4c, 0xf5, 0xe9, 0xc5, 0x45, 0x3e, 0x9f, 0x7c, 0xfd, 0x2b,
    0x8b, 0x4c, 0x8d, 0x16, 0x9a, 0x44, 0xe5, 0x5c, 0x88, 0xd4, 0xa9, 0xa7, 0xf9, 0x47, 0x42, 0x41,
    0xe2, 0x21, 0xaf, 0x44, 0x86, 0x00, 0x18, 0xab, 0x08, 0x56, 0x97, 0x2e, 0x19, 0x4c, 0xd9, 0x34,
];

const INITIAL_PACKET_29: &[u8] = &[
    0xcd, 0xff, 0x00, 0x00, 0x1d, 0x08, 0x83, 0x94, 0xc8, 0xf0, 0x3e, 0x51, 0x57, 0x08, 0x00, 0x00,
    0x44, 0x9e, 0x9c, 0xdb, 0x99, 0x0b, 0xfb, 0x66, 0xbc, 0x6a, 0x93, 0x03, 0x2b, 0x50, 0xdd, 0x89,
    0x73, 0x97, 0x2d, 0x14, 0x94, 0x21, 0x87, 0x4d, 0x38, 0x49, 0xe3, 0x70, 0x8d, 0x71, 0x35, 0x4e,
    0xa3, 0x3b, 0xcd, 0xc3, 0x56, 0xf3, 0xea, 0x6e, 0x2a, 0x1a, 0x1b, 0xd7, 0xc3, 0xd1, 0x40, 0x03,
    0x8d, 0x3e, 0x78, 0x4d, 0x04, 0xc3, 0x0a, 0x2c, 0xdb, 0x40, 0xc3, 0x25, 0x23, 0xab, 0xa2, 0xda,
    0xfe, 0x1c, 0x1b, 0xf3, 0xd2, 0x7a, 0x6b, 0xe3, 0x8f, 0xe3, 0x8a, 0xe0, 0x33, 0xfb, 0xb0, 0x71,
    0x3c, 0x1c, 0x73, 0x66, 0x1b, 0xb6, 0x63, 0x97, 0x95, 0xb4, 0x2b, 0x97, 0xf7, 0x70, 0x68, 0xea,
    0xd5, 0x1f, 0x11, 0xfb, 0xf9, 0x48, 0x9a, 0xf2, 0x50, 0x1d, 0x09, 0x48, 0x1e, 0x6c, 0x64, 0xd4,
    0xb8, 0x55, 0x1c, 0xd3, 0xce, 0xa7, 0x0d, 0x83, 0x0c, 0xe2, 0xae, 0xee, 0xc7, 0x89, 0xef, 0x55,
    0x1a, 0x7f, 0xbe, 0x36, 0xb3, 0xf7, 0xe1, 0x54, 0x9a, 0x9f, 0x8d, 0x8e, 0x15, 0x3b, 0x3f, 0xac,
    0x3f, 0xb7, 0xb7, 0x81, 0x2c, 0x9e, 0xd7, 0xc2, 0x0b, 0x4b, 0xe1, 0x90, 0xeb, 0xd8, 0x99, 0x56,
    0x26, 0xe7, 0xf0, 0xfc, 0x88, 0x79, 0x25, 0xec, 0x6f, 0x06, 0x06, 0xc5, 0xd3, 0x6a, 0xa8, 0x1b,
    0xeb, 0xb7, 0xaa, 0xcd, 0xc4, 0xa3, 0x1b, 0xb5, 0xf2, 0x3d, 0x55, 0xfa, 0xef, 0x5c, 0x51, 0x90,
    0x57, 0x83, 0x38, 0x4f, 0x37, 0x5a, 0x43, 0x23, 0x5b, 0x5c, 0x74, 0x2c, 0x78, 0xab, 0x1b, 0xae,
    0x0a, 0x18, 0x8b, 0x75, 0xef, 0xbd, 0xe6, 0xb3, 0x77, 0x4e, 0xd6, 0x12, 0x82, 0xf9, 0x67, 0x0a,
    0x9d, 0xea, 0x19, 0xe1, 0x56, 0x61, 0x03, 0xce, 0x67, 0x5a, 0xb4, 0xe2, 0x10, 0x81, 0xfb, 0x58,
    0x60, 0x34, 0x0a, 0x1e, 0x88, 0xe4, 0xf1, 0x0e, 0x39, 0xea, 0xe2, 0x5c, 0xd6, 0x85, 0xb1, 0x09,
    0x29, 0x63, 0x6d, 0x4f, 0x02, 0xe7, 0xfa, 0xd2, 0xa5, 0xa4, 0x58, 0x24, 0x9f, 0x5c, 0x02, 0x98,
    0xa6, 0xd5, 0x3a, 0xcb, 0xe4, 0x1a, 0x7f, 0xc8, 0x3f, 0xa7, 0xcc, 0x01, 0x97, 0x3f, 0x7a, 0x74,
    0xd1, 0x23, 0x7a, 0x51, 0x97, 0x4e, 0x09, 0x76, 0x36, 0xb6, 0x20, 0x39, 0x97, 0xf9, 0x21, 0xd0,
    0x7b, 0xc1, 0x94, 0x0a, 0x6f, 0x2d, 0x0d, 0xe9, 0xf5, 0xa1, 0x14, 0x32, 0x94, 0x61, 0x59, 0xed,
    0x6c, 0xc2, 0x1d, 0xf6, 0x5c, 0x4d, 0xdd, 0x11, 0x15, 0xf8, 0x64, 0x27, 0x25, 0x9a, 0x19, 0x6c,
    0x71, 0x48, 0xb2, 0x5b, 0x64, 0x78, 0xb0, 0xdc, 0x77, 0x66, 0xe1, 0xc4, 0xd1, 0xb1, 0xf5, 0x15,
    0x9f, 0x90, 0xea, 0xbc, 0x61, 0x63, 0x62, 0x26, 0x24, 0x46, 0x42, 0xee, 0x14, 0x8b, 0x46, 0x4c,
    0x9e, 0x61, 0x9e, 0xe5, 0x0a, 0x5e, 0x3d, 0xdc, 0x83, 0x62, 0x27, 0xca, 0xd9, 0x38, 0x98, 0x7c,
    0x4e, 0xa3, 0xc1, 0xfa, 0x7c, 0x75, 0xbb, 0xf8, 0x8d, 0x89, 0xe9, 0xad, 0xa6, 0x42, 0xb2, 0xb8,
    0x8f, 0xe8, 0x10, 0x7b, 0x7e, 0xa3, 0x75, 0xb1, 0xb6, 0x48, 0x89, 0xa4, 0xe9, 0xe5, 0xc3, 0x8a,
    0x1c, 0x89, 0x6c, 0xe2, 0x75, 0xa5, 0x65, 0x8d, 0x25, 0x0e, 0x2d, 0x76, 0xe1, 0xed, 0x3a, 0x34,
    0xce, 0x7e, 0x3a, 0x3f, 0x38, 0x3d, 0x0c, 0x99, 0x6d, 0x0b, 0xed, 0x10, 0x6c, 0x28, 0x99, 0xca,
    0x6f, 0xc2, 0x63, 0xef, 0x04, 0x55, 0xe7, 0x4b, 0xb6, 0xac, 0x16, 0x40, 0xea, 0x7b, 0xfe, 0xdc,
    0x59, 0xf0, 0x3f, 0xee, 0x0e, 0x17, 0x25, 0xea, 0x15, 0x0f, 0xf4, 0xd6, 0x9a, 0x76, 0x60, 0xc5,
    0x54, 0x21, 0x19, 0xc7, 0x1d, 0xe2, 0x70, 0xae, 0x7c, 0x3e, 0xcf, 0xd1, 0xaf, 0x2c, 0x4c, 0xe5,
    0x51, 0x98, 0x69, 0x49, 0xcc, 0x34, 0xa6, 0x6b, 0x3e, 0x21, 0x6b, 0xfe, 0x18, 0xb3, 0x47, 0xe6,
    0xc0, 0x5f, 0xd0, 0x50, 0xf8, 0x59, 0x12, 0xdb, 0x30, 0x3a, 0x8f, 0x05, 0x4e, 0xc2, 0x3e, 0x38,
    0xf4, 0x4d, 0x1c, 0x72, 0x5a, 0xb6, 0x41, 0xae, 0x92, 0x9f, 0xec, 0xc8, 0xe3, 0xce, 0xfa, 0x56,
    0x19, 0xdf, 0x42, 0x31, 0xf5, 0xb4, 0xc0, 0x09, 0xfa, 0x0c, 0x0b, 0xbc, 0x60, 0xbc, 0x75, 0xf7,
    0x6d, 0x06, 0xef, 0x15, 0x4f, 0xc8, 0x57, 0x70, 0x77, 0xd9, 0xd6, 0xa1, 0xd2, 0xbd, 0x9b, 0xf0,
    0x81, 0xdc, 0x78, 0x3e, 0xce, 0x60, 0x11, 0x1b, 0xea, 0x7d, 0xa9, 0xe5, 0xa9, 0x74, 0x80, 0x69,
    0xd0, 0x78, 0xb2, 0xbe, 0xf4, 0x8d, 0xe0, 0x4c, 0xab, 0xe3, 0x75, 0x5b, 0x19, 0x7d, 0x52, 0xb3,
    0x20, 0x46, 0x94, 0x9e, 0xca, 0xa3, 0x10, 0x27, 0x4b, 0x4a, 0xac, 0x0d, 0x00, 0x8b, 0x19, 0x48,
    0xc1, 0x08, 0x2c, 0xdf, 0xe2, 0x08, 0x3e, 0x38, 0x6d, 0x4f, 0xd8, 0x4c, 0x0e, 0xd0, 0x66, 0x6d,
    0x3e, 0xe2, 0x6c, 0x45, 0x15, 0xc4, 0xfe, 0xe7, 0x34, 0x33, 0xac, 0x70, 0x3b, 0x69, 0x0a, 0x9f,
    0x7b, 0xf2, 0x78, 0xa7, 0x74, 0x86, 0xac, 0xe4, 0x4c, 0x48, 0x9a, 0x0c, 0x7a, 0xc8, 0xdf, 0xe4,
    0xd1, 0xa5, 0x8f, 0xb3, 0xa7, 0x30, 0xb9, 0x93, 0xff, 0x0f, 0x0d, 0x61, 0xb4, 0xd8, 0x95, 0x57,
    0x83, 0x1e, 0xb4, 0xc7, 0x52, 0xff, 0xd3, 0x9c, 0x10, 0xf6, 0xb9, 0xf4, 0x6d, 0x8d, 0xb2, 0x78,
    0xda, 0x62, 0x4f, 0xd8, 0x00, 0xe4, 0xaf, 0x85, 0x54, 0x8a, 0x29, 0x4c, 0x15, 0x18, 0x89, 0x3a,
    0x87, 0x78, 0xc4, 0xf6, 0xd6, 0xd7, 0x3c, 0x93, 0xdf, 0x20, 0x09, 0x60, 0x10, 0x4e, 0x06, 0x2b,
    0x38, 0x8e, 0xa9, 0x7d, 0xcf, 0x40, 0x16, 0xbc, 0xed, 0x7f, 0x62, 0xb4, 0xf0, 0x62, 0xcb, 0x6c,
    0x04, 0xc2, 0x06, 0x93, 0xd9, 0xa0, 0xe3, 0xb7, 0x4b, 0xa8, 0xfe, 0x74, 0xcc, 0x01, 0x23, 0x78,
    0x84, 0xf4, 0x0d, 0x76, 0x5a, 0xe5, 0x6a, 0x51, 0x68, 0x8d, 0x98, 0x5c, 0xf0, 0xce, 0xae, 0xf4,
    0x30, 0x45, 0xed, 0x8c, 0x3f, 0x0c, 0x33, 0xbc, 0xed, 0x08, 0x53, 0x7f, 0x68, 0x82, 0x61, 0x3a,
    0xcd, 0x3b, 0x08, 0xd6, 0x65, 0xfc, 0xe9, 0xdd, 0x8a, 0xa7, 0x31, 0x71, 0xe2, 0xd3, 0x77, 0x1a,
    0x61, 0xdb, 0xa2, 0x79, 0x0e, 0x49, 0x1d, 0x41, 0x3d, 0x93, 0xd9, 0x87, 0xe2, 0x74, 0x5a, 0xf2,
    0x94, 0x18, 0xe4, 0x28, 0xbe, 0x34, 0x94, 0x14, 0x85, 0xc9, 0x34, 0x47, 0x52, 0x0f, 0xfe, 0x23,
    0x1d, 0xa2, 0x30, 0x4d, 0x6a, 0x0f, 0xd5, 0xd0, 0x7d, 0x08, 0x37, 0x22, 0x02, 0x36, 0x96, 0x61,
    0x59, 0xbe, 0xf3, 0xcf, 0x90, 0x4d, 0x72, 0x23, 0x24, 0xdd, 0x85, 0x25, 0x13, 0xdf, 0x39, 0xae,
    0x03, 0x0d, 0x81, 0x73, 0x90, 0x8d, 0xa6, 0x36, 0x47, 0x86, 0xd3, 0xc1, 0xbf, 0xcb, 0x19, 0xea,
    0x77, 0xa6, 0x3b, 0x25, 0xf1, 0xe7, 0xfc, 0x66, 0x1d, 0xef, 0x48, 0x0c, 0x5d, 0x00, 0xd4, 0x44,
    0x56, 0x26, 0x9e, 0xbd, 0x84, 0xef, 0xd8, 0xe3, 0xa8, 0xb2, 0xc2, 0x57, 0xee, 0xc7, 0x60, 0x60,
    0x68, 0x28, 0x48, 0xcb, 0xf5, 0x19, 0x4b, 0xc9, 0x9e, 0x49, 0xee, 0x75, 0xe4, 0xd0, 0xd2, 0x54,
    0xba, 0xd4, 0xbf, 0xd7, 0x49, 0x70, 0xc3, 0x0e, 0x44, 0xb6, 0x55, 0x11, 0xd4, 0xad, 0x0e, 0x6e,
    0xc7, 0x39, 0x8e, 0x08, 0xe0, 0x13, 0x07, 0xee, 0xee, 0xa1, 0x4e, 0x46, 0xcc, 0xd8, 0x7c, 0xf3,
    0x6b, 0x28, 0x52, 0x21, 0x25, 0x4d, 0x8f, 0xc6, 0xa6, 0x76, 0x5c, 0x52, 0x4d, 0xed, 0x00, 0x85,
    0xdc, 0xa5, 0xbd, 0x68, 0x8d, 0xdf, 0x72, 0x2e, 0x2c, 0x0f, 0xaf, 0x9d, 0x0f, 0xb2, 0xce, 0x7a,
    0x0c, 0x3f, 0x2c, 0xee, 0x19, 0xca, 0x0f, 0xfb, 0xa4, 0x61, 0xca, 0x8d, 0xc5, 0xd2, 0xc8, 0x17,
    0x8b, 0x07, 0x62, 0xcf, 0x67, 0x13, 0x55, 0x58, 0x49, 0x4d, 0x2a, 0x96, 0xf1, 0xa1, 0x39, 0xf0,
    0xed, 0xb4, 0x2d, 0x2a, 0xf8, 0x9a, 0x9c, 0x91, 0x22, 0xb0, 0x7a, 0xcb, 0xc2, 0x9e, 0x5e, 0x72,
    0x2d, 0xf8, 0x61, 0x5c, 0x34, 0x37, 0x02, 0x49, 0x10, 0x98, 0x47, 0x8a, 0x38, 0x9c, 0x98, 0x72,
    0xa1, 0x0b, 0x0c, 0x98, 0x75, 0x12, 0x5e, 0x25, 0x7c, 0x7b, 0xfd, 0xf2, 0x7e, 0xef, 0x40, 0x60,
    0xbd, 0x3d, 0x00, 0xf4, 0xc1, 0x4f, 0xd3, 0xe3, 0x49, 0x6c, 0x38, 0xd3, 0xc5, 0xd1, 0xa5, 0x66,
    0x8c, 0x39, 0x35, 0x0e, 0xff, 0xbc, 0x2d, 0x16, 0xca, 0x17, 0xbe, 0x4c, 0xe2, 0x9f, 0x02, 0xed,
    0x96, 0x95, 0x04, 0xdd, 0xa2, 0xa8, 0xc6, 0xb9, 0xff, 0x91, 0x9e, 0x69, 0x3e, 0xe7, 0x9e, 0x09,
    0x08, 0x93, 0x16, 0xe7, 0xd1, 0xd8, 0x9e, 0xc0, 0x99, 0xdb, 0x3b, 0x2b, 0x26, 0x87, 0x25, 0xd8,
    0x88, 0x53, 0x6a, 0x4b, 0x8b, 0xf9, 0xae, 0xe8, 0xfb, 0x43, 0xe8, 0x2a, 0x4d, 0x91, 0x9d, 0x48,
    0x18, 0x02, 0x77, 0x1a, 0x44, 0x9b, 0x30, 0xf3, 0xfa, 0x22, 0x89, 0x85, 0x26, 0x07, 0xb6, 0x60,
];

fn make_server(v: Version) -> Connection {
    test_fixture::fixture_init();
    Connection::new_server(
        test_fixture::DEFAULT_KEYS,
        test_fixture::DEFAULT_ALPN,
        Rc::new(RefCell::new(RandomConnectionIdGenerator::new(5))),
        ConnectionParameters::default().versions(v, vec![v]),
    )
    .expect("create a default server")
}

fn process_client_initial(v: Version, packet: &[u8]) {
    let mut server = make_server(v);

    let dgram = Datagram::new(addr(), addr(), packet);
    assert_eq!(*server.state(), State::Init);
    let out = server.process(Some(dgram), now());
    assert_eq!(*server.state(), State::Handshaking);
    assert!(out.dgram().is_some());
}

#[test]
fn process_client_initial_v2() {
    process_client_initial(Version::Version2, INITIAL_PACKET_V2);
}

#[test]
fn process_client_initial_v1() {
    process_client_initial(Version::Version1, INITIAL_PACKET_V1);
}

#[test]
fn process_client_initial_29() {
    process_client_initial(Version::Draft29, INITIAL_PACKET_29);
}
