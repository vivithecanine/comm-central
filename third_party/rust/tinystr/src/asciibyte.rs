// This file is part of ICU4X. For terms of use, please see the file
// called LICENSE at the top level of the ICU4X source tree
// (online at: https://github.com/unicode-org/icu4x/blob/main/LICENSE ).

#[repr(u8)]
#[allow(dead_code)]
#[derive(PartialEq, Eq, Ord, PartialOrd, Copy, Clone, Hash)]
pub enum AsciiByte {
    B0 = 0,
    B1 = 1,
    B2 = 2,
    B3 = 3,
    B4 = 4,
    B5 = 5,
    B6 = 6,
    B7 = 7,
    B8 = 8,
    B9 = 9,
    B10 = 10,
    B11 = 11,
    B12 = 12,
    B13 = 13,
    B14 = 14,
    B15 = 15,
    B16 = 16,
    B17 = 17,
    B18 = 18,
    B19 = 19,
    B20 = 20,
    B21 = 21,
    B22 = 22,
    B23 = 23,
    B24 = 24,
    B25 = 25,
    B26 = 26,
    B27 = 27,
    B28 = 28,
    B29 = 29,
    B30 = 30,
    B31 = 31,
    B32 = 32,
    B33 = 33,
    B34 = 34,
    B35 = 35,
    B36 = 36,
    B37 = 37,
    B38 = 38,
    B39 = 39,
    B40 = 40,
    B41 = 41,
    B42 = 42,
    B43 = 43,
    B44 = 44,
    B45 = 45,
    B46 = 46,
    B47 = 47,
    B48 = 48,
    B49 = 49,
    B50 = 50,
    B51 = 51,
    B52 = 52,
    B53 = 53,
    B54 = 54,
    B55 = 55,
    B56 = 56,
    B57 = 57,
    B58 = 58,
    B59 = 59,
    B60 = 60,
    B61 = 61,
    B62 = 62,
    B63 = 63,
    B64 = 64,
    B65 = 65,
    B66 = 66,
    B67 = 67,
    B68 = 68,
    B69 = 69,
    B70 = 70,
    B71 = 71,
    B72 = 72,
    B73 = 73,
    B74 = 74,
    B75 = 75,
    B76 = 76,
    B77 = 77,
    B78 = 78,
    B79 = 79,
    B80 = 80,
    B81 = 81,
    B82 = 82,
    B83 = 83,
    B84 = 84,
    B85 = 85,
    B86 = 86,
    B87 = 87,
    B88 = 88,
    B89 = 89,
    B90 = 90,
    B91 = 91,
    B92 = 92,
    B93 = 93,
    B94 = 94,
    B95 = 95,
    B96 = 96,
    B97 = 97,
    B98 = 98,
    B99 = 99,
    B100 = 100,
    B101 = 101,
    B102 = 102,
    B103 = 103,
    B104 = 104,
    B105 = 105,
    B106 = 106,
    B107 = 107,
    B108 = 108,
    B109 = 109,
    B110 = 110,
    B111 = 111,
    B112 = 112,
    B113 = 113,
    B114 = 114,
    B115 = 115,
    B116 = 116,
    B117 = 117,
    B118 = 118,
    B119 = 119,
    B120 = 120,
    B121 = 121,
    B122 = 122,
    B123 = 123,
    B124 = 124,
    B125 = 125,
    B126 = 126,
    B127 = 127,
}

impl AsciiByte {
    // Convert [u8; N] to [AsciiByte; N]
    #[inline]
    pub const unsafe fn to_ascii_byte_array<const N: usize>(bytes: &[u8; N]) -> [AsciiByte; N] {
        *(bytes as *const [u8; N] as *const [AsciiByte; N])
    }
}
