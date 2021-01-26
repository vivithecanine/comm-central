/* Twofish for GPG
 * Copyright (C) 1998, 2002, 2003 Free Software Foundation, Inc.
 * Written by Matthew Skala <mskala@ansuz.sooke.bc.ca>, July 26, 1998
 * 256-bit key length added March 20, 1999
 * Some modifications to reduce the text size by Werner Koch, April, 1998
 *
 * This file is part of Libgcrypt.
 *
 * Libgcrypt is free software; you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as
 * published by the Free Software Foundation; either version 2.1 of
 * the License, or (at your option) any later version.
 *
 * Libgcrypt is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this program; if not, write to the Free Software
 * Foundation, Inc., 59 Temple Place - Suite 330, Boston, MA 02111-1307, USA
 ********************************************************************
 *
 * This code is a "clean room" implementation, written from the paper
 * _Twofish: A 128-Bit Block Cipher_ by Bruce Schneier, John Kelsey,
 * Doug Whiting, David Wagner, Chris Hall, and Niels Ferguson, available
 * through http://www.counterpane.com/twofish.html
 *
 * For background information on multiplication in finite fields, used for
 * the matrix operations in the key schedule, see the book _Contemporary
 * Abstract Algebra_ by Joseph A. Gallian, especially chapter 22 in the
 * Third Edition.
 *
 * Only the 128- and 256-bit key sizes are supported.  This code is intended
 * for GNU C on a 32-bit system, but it should work almost anywhere.  Loops
 * are unrolled, precomputation tables are used, etc., for maximum speed at
 * some cost in memory consumption. */

#include <config.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h> /* for memcmp() */

#include "types.h"  /* for byte and u32 typedefs */
#include "g10lib.h"
#include "cipher.h"
#include "bufhelp.h"
#include "cipher-internal.h"
#include "cipher-selftest.h"


#define TWOFISH_BLOCKSIZE 16


/* USE_AMD64_ASM indicates whether to use AMD64 assembly code. */
#undef USE_AMD64_ASM
#if defined(__x86_64__) && (defined(HAVE_COMPATIBLE_GCC_AMD64_PLATFORM_AS) || \
    defined(HAVE_COMPATIBLE_GCC_WIN64_PLATFORM_AS))
# define USE_AMD64_ASM 1
#endif

/* USE_ARM_ASM indicates whether to use ARM assembly code. */
#undef USE_ARM_ASM
#if defined(__ARMEL__)
# if defined(HAVE_COMPATIBLE_GCC_ARM_PLATFORM_AS)
#  define USE_ARM_ASM 1
# endif
#endif
# if defined(__AARCH64EL__)
#  ifdef HAVE_COMPATIBLE_GCC_AARCH64_PLATFORM_AS
#   define USE_ARM_ASM 1
#  endif
# endif

/* USE_AVX2 indicates whether to compile with AMD64 AVX2 code. */
#undef USE_AVX2
#if defined(__x86_64__) && (defined(HAVE_COMPATIBLE_GCC_AMD64_PLATFORM_AS) || \
    defined(HAVE_COMPATIBLE_GCC_WIN64_PLATFORM_AS))
# if defined(ENABLE_AVX2_SUPPORT)
#  define USE_AVX2 1
# endif
#endif


/* Prototype for the self-test function. */
static const char *selftest(void);


/* Prototypes for the bulk functions. */
static void _gcry_twofish_ctr_enc (void *context, unsigned char *ctr,
				   void *outbuf_arg, const void *inbuf_arg,
				   size_t nblocks);
static void _gcry_twofish_cbc_dec (void *context, unsigned char *iv,
				   void *outbuf_arg, const void *inbuf_arg,
				   size_t nblocks);
static void _gcry_twofish_cfb_dec (void *context, unsigned char *iv,
				   void *outbuf_arg, const void *inbuf_arg,
				   size_t nblocks);
static size_t _gcry_twofish_ocb_crypt (gcry_cipher_hd_t c, void *outbuf_arg,
				       const void *inbuf_arg, size_t nblocks,
				       int encrypt);
static size_t _gcry_twofish_ocb_auth (gcry_cipher_hd_t c, const void *abuf_arg,
				      size_t nblocks);


/* Structure for an expanded Twofish key.  s contains the key-dependent
 * S-boxes composed with the MDS matrix; w contains the eight "whitening"
 * subkeys, K[0] through K[7].	k holds the remaining, "round" subkeys.  Note
 * that k[i] corresponds to what the Twofish paper calls K[i+8]. */
typedef struct {
   u32 s[4][256], w[8], k[32];

#ifdef USE_AVX2
  int use_avx2;
#endif
} TWOFISH_context;


/* Assembly implementations use SystemV ABI, ABI conversion and additional
 * stack to store XMM6-XMM15 needed on Win64. */
#undef ASM_FUNC_ABI
#if defined(USE_AVX2)
# ifdef HAVE_COMPATIBLE_GCC_WIN64_PLATFORM_AS
#  define ASM_FUNC_ABI __attribute__((sysv_abi))
# else
#  define ASM_FUNC_ABI
# endif
#endif


/* These two tables are the q0 and q1 permutations, exactly as described in
 * the Twofish paper. */

static const byte q0[256] = {
   0xA9, 0x67, 0xB3, 0xE8, 0x04, 0xFD, 0xA3, 0x76, 0x9A, 0x92, 0x80, 0x78,
   0xE4, 0xDD, 0xD1, 0x38, 0x0D, 0xC6, 0x35, 0x98, 0x18, 0xF7, 0xEC, 0x6C,
   0x43, 0x75, 0x37, 0x26, 0xFA, 0x13, 0x94, 0x48, 0xF2, 0xD0, 0x8B, 0x30,
   0x84, 0x54, 0xDF, 0x23, 0x19, 0x5B, 0x3D, 0x59, 0xF3, 0xAE, 0xA2, 0x82,
   0x63, 0x01, 0x83, 0x2E, 0xD9, 0x51, 0x9B, 0x7C, 0xA6, 0xEB, 0xA5, 0xBE,
   0x16, 0x0C, 0xE3, 0x61, 0xC0, 0x8C, 0x3A, 0xF5, 0x73, 0x2C, 0x25, 0x0B,
   0xBB, 0x4E, 0x89, 0x6B, 0x53, 0x6A, 0xB4, 0xF1, 0xE1, 0xE6, 0xBD, 0x45,
   0xE2, 0xF4, 0xB6, 0x66, 0xCC, 0x95, 0x03, 0x56, 0xD4, 0x1C, 0x1E, 0xD7,
   0xFB, 0xC3, 0x8E, 0xB5, 0xE9, 0xCF, 0xBF, 0xBA, 0xEA, 0x77, 0x39, 0xAF,
   0x33, 0xC9, 0x62, 0x71, 0x81, 0x79, 0x09, 0xAD, 0x24, 0xCD, 0xF9, 0xD8,
   0xE5, 0xC5, 0xB9, 0x4D, 0x44, 0x08, 0x86, 0xE7, 0xA1, 0x1D, 0xAA, 0xED,
   0x06, 0x70, 0xB2, 0xD2, 0x41, 0x7B, 0xA0, 0x11, 0x31, 0xC2, 0x27, 0x90,
   0x20, 0xF6, 0x60, 0xFF, 0x96, 0x5C, 0xB1, 0xAB, 0x9E, 0x9C, 0x52, 0x1B,
   0x5F, 0x93, 0x0A, 0xEF, 0x91, 0x85, 0x49, 0xEE, 0x2D, 0x4F, 0x8F, 0x3B,
   0x47, 0x87, 0x6D, 0x46, 0xD6, 0x3E, 0x69, 0x64, 0x2A, 0xCE, 0xCB, 0x2F,
   0xFC, 0x97, 0x05, 0x7A, 0xAC, 0x7F, 0xD5, 0x1A, 0x4B, 0x0E, 0xA7, 0x5A,
   0x28, 0x14, 0x3F, 0x29, 0x88, 0x3C, 0x4C, 0x02, 0xB8, 0xDA, 0xB0, 0x17,
   0x55, 0x1F, 0x8A, 0x7D, 0x57, 0xC7, 0x8D, 0x74, 0xB7, 0xC4, 0x9F, 0x72,
   0x7E, 0x15, 0x22, 0x12, 0x58, 0x07, 0x99, 0x34, 0x6E, 0x50, 0xDE, 0x68,
   0x65, 0xBC, 0xDB, 0xF8, 0xC8, 0xA8, 0x2B, 0x40, 0xDC, 0xFE, 0x32, 0xA4,
   0xCA, 0x10, 0x21, 0xF0, 0xD3, 0x5D, 0x0F, 0x00, 0x6F, 0x9D, 0x36, 0x42,
   0x4A, 0x5E, 0xC1, 0xE0
};

static const byte q1[256] = {
   0x75, 0xF3, 0xC6, 0xF4, 0xDB, 0x7B, 0xFB, 0xC8, 0x4A, 0xD3, 0xE6, 0x6B,
   0x45, 0x7D, 0xE8, 0x4B, 0xD6, 0x32, 0xD8, 0xFD, 0x37, 0x71, 0xF1, 0xE1,
   0x30, 0x0F, 0xF8, 0x1B, 0x87, 0xFA, 0x06, 0x3F, 0x5E, 0xBA, 0xAE, 0x5B,
   0x8A, 0x00, 0xBC, 0x9D, 0x6D, 0xC1, 0xB1, 0x0E, 0x80, 0x5D, 0xD2, 0xD5,
   0xA0, 0x84, 0x07, 0x14, 0xB5, 0x90, 0x2C, 0xA3, 0xB2, 0x73, 0x4C, 0x54,
   0x92, 0x74, 0x36, 0x51, 0x38, 0xB0, 0xBD, 0x5A, 0xFC, 0x60, 0x62, 0x96,
   0x6C, 0x42, 0xF7, 0x10, 0x7C, 0x28, 0x27, 0x8C, 0x13, 0x95, 0x9C, 0xC7,
   0x24, 0x46, 0x3B, 0x70, 0xCA, 0xE3, 0x85, 0xCB, 0x11, 0xD0, 0x93, 0xB8,
   0xA6, 0x83, 0x20, 0xFF, 0x9F, 0x77, 0xC3, 0xCC, 0x03, 0x6F, 0x08, 0xBF,
   0x40, 0xE7, 0x2B, 0xE2, 0x79, 0x0C, 0xAA, 0x82, 0x41, 0x3A, 0xEA, 0xB9,
   0xE4, 0x9A, 0xA4, 0x97, 0x7E, 0xDA, 0x7A, 0x17, 0x66, 0x94, 0xA1, 0x1D,
   0x3D, 0xF0, 0xDE, 0xB3, 0x0B, 0x72, 0xA7, 0x1C, 0xEF, 0xD1, 0x53, 0x3E,
   0x8F, 0x33, 0x26, 0x5F, 0xEC, 0x76, 0x2A, 0x49, 0x81, 0x88, 0xEE, 0x21,
   0xC4, 0x1A, 0xEB, 0xD9, 0xC5, 0x39, 0x99, 0xCD, 0xAD, 0x31, 0x8B, 0x01,
   0x18, 0x23, 0xDD, 0x1F, 0x4E, 0x2D, 0xF9, 0x48, 0x4F, 0xF2, 0x65, 0x8E,
   0x78, 0x5C, 0x58, 0x19, 0x8D, 0xE5, 0x98, 0x57, 0x67, 0x7F, 0x05, 0x64,
   0xAF, 0x63, 0xB6, 0xFE, 0xF5, 0xB7, 0x3C, 0xA5, 0xCE, 0xE9, 0x68, 0x44,
   0xE0, 0x4D, 0x43, 0x69, 0x29, 0x2E, 0xAC, 0x15, 0x59, 0xA8, 0x0A, 0x9E,
   0x6E, 0x47, 0xDF, 0x34, 0x35, 0x6A, 0xCF, 0xDC, 0x22, 0xC9, 0xC0, 0x9B,
   0x89, 0xD4, 0xED, 0xAB, 0x12, 0xA2, 0x0D, 0x52, 0xBB, 0x02, 0x2F, 0xA9,
   0xD7, 0x61, 0x1E, 0xB4, 0x50, 0x04, 0xF6, 0xC2, 0x16, 0x25, 0x86, 0x56,
   0x55, 0x09, 0xBE, 0x91
};

/* These MDS tables are actually tables of MDS composed with q0 and q1,
 * because it is only ever used that way and we can save some time by
 * precomputing.  Of course the main saving comes from precomputing the
 * GF(2^8) multiplication involved in the MDS matrix multiply; by looking
 * things up in these tables we reduce the matrix multiply to four lookups
 * and three XORs.  Semi-formally, the definition of these tables is:
 * mds[0][i] = MDS (q1[i] 0 0 0)^T  mds[1][i] = MDS (0 q0[i] 0 0)^T
 * mds[2][i] = MDS (0 0 q1[i] 0)^T  mds[3][i] = MDS (0 0 0 q0[i])^T
 * where ^T means "transpose", the matrix multiply is performed in GF(2^8)
 * represented as GF(2)[x]/v(x) where v(x)=x^8+x^6+x^5+x^3+1 as described
 * by Schneier et al, and I'm casually glossing over the byte/word
 * conversion issues. */

static const u32 mds[4][256] = {
   {0xBCBC3275, 0xECEC21F3, 0x202043C6, 0xB3B3C9F4, 0xDADA03DB, 0x02028B7B,
    0xE2E22BFB, 0x9E9EFAC8, 0xC9C9EC4A, 0xD4D409D3, 0x18186BE6, 0x1E1E9F6B,
    0x98980E45, 0xB2B2387D, 0xA6A6D2E8, 0x2626B74B, 0x3C3C57D6, 0x93938A32,
    0x8282EED8, 0x525298FD, 0x7B7BD437, 0xBBBB3771, 0x5B5B97F1, 0x474783E1,
    0x24243C30, 0x5151E20F, 0xBABAC6F8, 0x4A4AF31B, 0xBFBF4887, 0x0D0D70FA,
    0xB0B0B306, 0x7575DE3F, 0xD2D2FD5E, 0x7D7D20BA, 0x666631AE, 0x3A3AA35B,
    0x59591C8A, 0x00000000, 0xCDCD93BC, 0x1A1AE09D, 0xAEAE2C6D, 0x7F7FABC1,
    0x2B2BC7B1, 0xBEBEB90E, 0xE0E0A080, 0x8A8A105D, 0x3B3B52D2, 0x6464BAD5,
    0xD8D888A0, 0xE7E7A584, 0x5F5FE807, 0x1B1B1114, 0x2C2CC2B5, 0xFCFCB490,
    0x3131272C, 0x808065A3, 0x73732AB2, 0x0C0C8173, 0x79795F4C, 0x6B6B4154,
    0x4B4B0292, 0x53536974, 0x94948F36, 0x83831F51, 0x2A2A3638, 0xC4C49CB0,
    0x2222C8BD, 0xD5D5F85A, 0xBDBDC3FC, 0x48487860, 0xFFFFCE62, 0x4C4C0796,
    0x4141776C, 0xC7C7E642, 0xEBEB24F7, 0x1C1C1410, 0x5D5D637C, 0x36362228,
    0x6767C027, 0xE9E9AF8C, 0x4444F913, 0x1414EA95, 0xF5F5BB9C, 0xCFCF18C7,
    0x3F3F2D24, 0xC0C0E346, 0x7272DB3B, 0x54546C70, 0x29294CCA, 0xF0F035E3,
    0x0808FE85, 0xC6C617CB, 0xF3F34F11, 0x8C8CE4D0, 0xA4A45993, 0xCACA96B8,
    0x68683BA6, 0xB8B84D83, 0x38382820, 0xE5E52EFF, 0xADAD569F, 0x0B0B8477,
    0xC8C81DC3, 0x9999FFCC, 0x5858ED03, 0x19199A6F, 0x0E0E0A08, 0x95957EBF,
    0x70705040, 0xF7F730E7, 0x6E6ECF2B, 0x1F1F6EE2, 0xB5B53D79, 0x09090F0C,
    0x616134AA, 0x57571682, 0x9F9F0B41, 0x9D9D803A, 0x111164EA, 0x2525CDB9,
    0xAFAFDDE4, 0x4545089A, 0xDFDF8DA4, 0xA3A35C97, 0xEAEAD57E, 0x353558DA,
    0xEDEDD07A, 0x4343FC17, 0xF8F8CB66, 0xFBFBB194, 0x3737D3A1, 0xFAFA401D,
    0xC2C2683D, 0xB4B4CCF0, 0x32325DDE, 0x9C9C71B3, 0x5656E70B, 0xE3E3DA72,
    0x878760A7, 0x15151B1C, 0xF9F93AEF, 0x6363BFD1, 0x3434A953, 0x9A9A853E,
    0xB1B1428F, 0x7C7CD133, 0x88889B26, 0x3D3DA65F, 0xA1A1D7EC, 0xE4E4DF76,
    0x8181942A, 0x91910149, 0x0F0FFB81, 0xEEEEAA88, 0x161661EE, 0xD7D77321,
    0x9797F5C4, 0xA5A5A81A, 0xFEFE3FEB, 0x6D6DB5D9, 0x7878AEC5, 0xC5C56D39,
    0x1D1DE599, 0x7676A4CD, 0x3E3EDCAD, 0xCBCB6731, 0xB6B6478B, 0xEFEF5B01,
    0x12121E18, 0x6060C523, 0x6A6AB0DD, 0x4D4DF61F, 0xCECEE94E, 0xDEDE7C2D,
    0x55559DF9, 0x7E7E5A48, 0x2121B24F, 0x03037AF2, 0xA0A02665, 0x5E5E198E,
    0x5A5A6678, 0x65654B5C, 0x62624E58, 0xFDFD4519, 0x0606F48D, 0x404086E5,
    0xF2F2BE98, 0x3333AC57, 0x17179067, 0x05058E7F, 0xE8E85E05, 0x4F4F7D64,
    0x89896AAF, 0x10109563, 0x74742FB6, 0x0A0A75FE, 0x5C5C92F5, 0x9B9B74B7,
    0x2D2D333C, 0x3030D6A5, 0x2E2E49CE, 0x494989E9, 0x46467268, 0x77775544,
    0xA8A8D8E0, 0x9696044D, 0x2828BD43, 0xA9A92969, 0xD9D97929, 0x8686912E,
    0xD1D187AC, 0xF4F44A15, 0x8D8D1559, 0xD6D682A8, 0xB9B9BC0A, 0x42420D9E,
    0xF6F6C16E, 0x2F2FB847, 0xDDDD06DF, 0x23233934, 0xCCCC6235, 0xF1F1C46A,
    0xC1C112CF, 0x8585EBDC, 0x8F8F9E22, 0x7171A1C9, 0x9090F0C0, 0xAAAA539B,
    0x0101F189, 0x8B8BE1D4, 0x4E4E8CED, 0x8E8E6FAB, 0xABABA212, 0x6F6F3EA2,
    0xE6E6540D, 0xDBDBF252, 0x92927BBB, 0xB7B7B602, 0x6969CA2F, 0x3939D9A9,
    0xD3D30CD7, 0xA7A72361, 0xA2A2AD1E, 0xC3C399B4, 0x6C6C4450, 0x07070504,
    0x04047FF6, 0x272746C2, 0xACACA716, 0xD0D07625, 0x50501386, 0xDCDCF756,
    0x84841A55, 0xE1E15109, 0x7A7A25BE, 0x1313EF91},

   {0xA9D93939, 0x67901717, 0xB3719C9C, 0xE8D2A6A6, 0x04050707, 0xFD985252,
    0xA3658080, 0x76DFE4E4, 0x9A084545, 0x92024B4B, 0x80A0E0E0, 0x78665A5A,
    0xE4DDAFAF, 0xDDB06A6A, 0xD1BF6363, 0x38362A2A, 0x0D54E6E6, 0xC6432020,
    0x3562CCCC, 0x98BEF2F2, 0x181E1212, 0xF724EBEB, 0xECD7A1A1, 0x6C774141,
    0x43BD2828, 0x7532BCBC, 0x37D47B7B, 0x269B8888, 0xFA700D0D, 0x13F94444,
    0x94B1FBFB, 0x485A7E7E, 0xF27A0303, 0xD0E48C8C, 0x8B47B6B6, 0x303C2424,
    0x84A5E7E7, 0x54416B6B, 0xDF06DDDD, 0x23C56060, 0x1945FDFD, 0x5BA33A3A,
    0x3D68C2C2, 0x59158D8D, 0xF321ECEC, 0xAE316666, 0xA23E6F6F, 0x82165757,
    0x63951010, 0x015BEFEF, 0x834DB8B8, 0x2E918686, 0xD9B56D6D, 0x511F8383,
    0x9B53AAAA, 0x7C635D5D, 0xA63B6868, 0xEB3FFEFE, 0xA5D63030, 0xBE257A7A,
    0x16A7ACAC, 0x0C0F0909, 0xE335F0F0, 0x6123A7A7, 0xC0F09090, 0x8CAFE9E9,
    0x3A809D9D, 0xF5925C5C, 0x73810C0C, 0x2C273131, 0x2576D0D0, 0x0BE75656,
    0xBB7B9292, 0x4EE9CECE, 0x89F10101, 0x6B9F1E1E, 0x53A93434, 0x6AC4F1F1,
    0xB499C3C3, 0xF1975B5B, 0xE1834747, 0xE66B1818, 0xBDC82222, 0x450E9898,
    0xE26E1F1F, 0xF4C9B3B3, 0xB62F7474, 0x66CBF8F8, 0xCCFF9999, 0x95EA1414,
    0x03ED5858, 0x56F7DCDC, 0xD4E18B8B, 0x1C1B1515, 0x1EADA2A2, 0xD70CD3D3,
    0xFB2BE2E2, 0xC31DC8C8, 0x8E195E5E, 0xB5C22C2C, 0xE9894949, 0xCF12C1C1,
    0xBF7E9595, 0xBA207D7D, 0xEA641111, 0x77840B0B, 0x396DC5C5, 0xAF6A8989,
    0x33D17C7C, 0xC9A17171, 0x62CEFFFF, 0x7137BBBB, 0x81FB0F0F, 0x793DB5B5,
    0x0951E1E1, 0xADDC3E3E, 0x242D3F3F, 0xCDA47676, 0xF99D5555, 0xD8EE8282,
    0xE5864040, 0xC5AE7878, 0xB9CD2525, 0x4D049696, 0x44557777, 0x080A0E0E,
    0x86135050, 0xE730F7F7, 0xA1D33737, 0x1D40FAFA, 0xAA346161, 0xED8C4E4E,
    0x06B3B0B0, 0x706C5454, 0xB22A7373, 0xD2523B3B, 0x410B9F9F, 0x7B8B0202,
    0xA088D8D8, 0x114FF3F3, 0x3167CBCB, 0xC2462727, 0x27C06767, 0x90B4FCFC,
    0x20283838, 0xF67F0404, 0x60784848, 0xFF2EE5E5, 0x96074C4C, 0x5C4B6565,
    0xB1C72B2B, 0xAB6F8E8E, 0x9E0D4242, 0x9CBBF5F5, 0x52F2DBDB, 0x1BF34A4A,
    0x5FA63D3D, 0x9359A4A4, 0x0ABCB9B9, 0xEF3AF9F9, 0x91EF1313, 0x85FE0808,
    0x49019191, 0xEE611616, 0x2D7CDEDE, 0x4FB22121, 0x8F42B1B1, 0x3BDB7272,
    0x47B82F2F, 0x8748BFBF, 0x6D2CAEAE, 0x46E3C0C0, 0xD6573C3C, 0x3E859A9A,
    0x6929A9A9, 0x647D4F4F, 0x2A948181, 0xCE492E2E, 0xCB17C6C6, 0x2FCA6969,
    0xFCC3BDBD, 0x975CA3A3, 0x055EE8E8, 0x7AD0EDED, 0xAC87D1D1, 0x7F8E0505,
    0xD5BA6464, 0x1AA8A5A5, 0x4BB72626, 0x0EB9BEBE, 0xA7608787, 0x5AF8D5D5,
    0x28223636, 0x14111B1B, 0x3FDE7575, 0x2979D9D9, 0x88AAEEEE, 0x3C332D2D,
    0x4C5F7979, 0x02B6B7B7, 0xB896CACA, 0xDA583535, 0xB09CC4C4, 0x17FC4343,
    0x551A8484, 0x1FF64D4D, 0x8A1C5959, 0x7D38B2B2, 0x57AC3333, 0xC718CFCF,
    0x8DF40606, 0x74695353, 0xB7749B9B, 0xC4F59797, 0x9F56ADAD, 0x72DAE3E3,
    0x7ED5EAEA, 0x154AF4F4, 0x229E8F8F, 0x12A2ABAB, 0x584E6262, 0x07E85F5F,
    0x99E51D1D, 0x34392323, 0x6EC1F6F6, 0x50446C6C, 0xDE5D3232, 0x68724646,
    0x6526A0A0, 0xBC93CDCD, 0xDB03DADA, 0xF8C6BABA, 0xC8FA9E9E, 0xA882D6D6,
    0x2BCF6E6E, 0x40507070, 0xDCEB8585, 0xFE750A0A, 0x328A9393, 0xA48DDFDF,
    0xCA4C2929, 0x10141C1C, 0x2173D7D7, 0xF0CCB4B4, 0xD309D4D4, 0x5D108A8A,
    0x0FE25151, 0x00000000, 0x6F9A1919, 0x9DE01A1A, 0x368F9494, 0x42E6C7C7,
    0x4AECC9C9, 0x5EFDD2D2, 0xC1AB7F7F, 0xE0D8A8A8},

   {0xBC75BC32, 0xECF3EC21, 0x20C62043, 0xB3F4B3C9, 0xDADBDA03, 0x027B028B,
    0xE2FBE22B, 0x9EC89EFA, 0xC94AC9EC, 0xD4D3D409, 0x18E6186B, 0x1E6B1E9F,
    0x9845980E, 0xB27DB238, 0xA6E8A6D2, 0x264B26B7, 0x3CD63C57, 0x9332938A,
    0x82D882EE, 0x52FD5298, 0x7B377BD4, 0xBB71BB37, 0x5BF15B97, 0x47E14783,
    0x2430243C, 0x510F51E2, 0xBAF8BAC6, 0x4A1B4AF3, 0xBF87BF48, 0x0DFA0D70,
    0xB006B0B3, 0x753F75DE, 0xD25ED2FD, 0x7DBA7D20, 0x66AE6631, 0x3A5B3AA3,
    0x598A591C, 0x00000000, 0xCDBCCD93, 0x1A9D1AE0, 0xAE6DAE2C, 0x7FC17FAB,
    0x2BB12BC7, 0xBE0EBEB9, 0xE080E0A0, 0x8A5D8A10, 0x3BD23B52, 0x64D564BA,
    0xD8A0D888, 0xE784E7A5, 0x5F075FE8, 0x1B141B11, 0x2CB52CC2, 0xFC90FCB4,
    0x312C3127, 0x80A38065, 0x73B2732A, 0x0C730C81, 0x794C795F, 0x6B546B41,
    0x4B924B02, 0x53745369, 0x9436948F, 0x8351831F, 0x2A382A36, 0xC4B0C49C,
    0x22BD22C8, 0xD55AD5F8, 0xBDFCBDC3, 0x48604878, 0xFF62FFCE, 0x4C964C07,
    0x416C4177, 0xC742C7E6, 0xEBF7EB24, 0x1C101C14, 0x5D7C5D63, 0x36283622,
    0x672767C0, 0xE98CE9AF, 0x441344F9, 0x149514EA, 0xF59CF5BB, 0xCFC7CF18,
    0x3F243F2D, 0xC046C0E3, 0x723B72DB, 0x5470546C, 0x29CA294C, 0xF0E3F035,
    0x088508FE, 0xC6CBC617, 0xF311F34F, 0x8CD08CE4, 0xA493A459, 0xCAB8CA96,
    0x68A6683B, 0xB883B84D, 0x38203828, 0xE5FFE52E, 0xAD9FAD56, 0x0B770B84,
    0xC8C3C81D, 0x99CC99FF, 0x580358ED, 0x196F199A, 0x0E080E0A, 0x95BF957E,
    0x70407050, 0xF7E7F730, 0x6E2B6ECF, 0x1FE21F6E, 0xB579B53D, 0x090C090F,
    0x61AA6134, 0x57825716, 0x9F419F0B, 0x9D3A9D80, 0x11EA1164, 0x25B925CD,
    0xAFE4AFDD, 0x459A4508, 0xDFA4DF8D, 0xA397A35C, 0xEA7EEAD5, 0x35DA3558,
    0xED7AEDD0, 0x431743FC, 0xF866F8CB, 0xFB94FBB1, 0x37A137D3, 0xFA1DFA40,
    0xC23DC268, 0xB4F0B4CC, 0x32DE325D, 0x9CB39C71, 0x560B56E7, 0xE372E3DA,
    0x87A78760, 0x151C151B, 0xF9EFF93A, 0x63D163BF, 0x345334A9, 0x9A3E9A85,
    0xB18FB142, 0x7C337CD1, 0x8826889B, 0x3D5F3DA6, 0xA1ECA1D7, 0xE476E4DF,
    0x812A8194, 0x91499101, 0x0F810FFB, 0xEE88EEAA, 0x16EE1661, 0xD721D773,
    0x97C497F5, 0xA51AA5A8, 0xFEEBFE3F, 0x6DD96DB5, 0x78C578AE, 0xC539C56D,
    0x1D991DE5, 0x76CD76A4, 0x3EAD3EDC, 0xCB31CB67, 0xB68BB647, 0xEF01EF5B,
    0x1218121E, 0x602360C5, 0x6ADD6AB0, 0x4D1F4DF6, 0xCE4ECEE9, 0xDE2DDE7C,
    0x55F9559D, 0x7E487E5A, 0x214F21B2, 0x03F2037A, 0xA065A026, 0x5E8E5E19,
    0x5A785A66, 0x655C654B, 0x6258624E, 0xFD19FD45, 0x068D06F4, 0x40E54086,
    0xF298F2BE, 0x335733AC, 0x17671790, 0x057F058E, 0xE805E85E, 0x4F644F7D,
    0x89AF896A, 0x10631095, 0x74B6742F, 0x0AFE0A75, 0x5CF55C92, 0x9BB79B74,
    0x2D3C2D33, 0x30A530D6, 0x2ECE2E49, 0x49E94989, 0x46684672, 0x77447755,
    0xA8E0A8D8, 0x964D9604, 0x284328BD, 0xA969A929, 0xD929D979, 0x862E8691,
    0xD1ACD187, 0xF415F44A, 0x8D598D15, 0xD6A8D682, 0xB90AB9BC, 0x429E420D,
    0xF66EF6C1, 0x2F472FB8, 0xDDDFDD06, 0x23342339, 0xCC35CC62, 0xF16AF1C4,
    0xC1CFC112, 0x85DC85EB, 0x8F228F9E, 0x71C971A1, 0x90C090F0, 0xAA9BAA53,
    0x018901F1, 0x8BD48BE1, 0x4EED4E8C, 0x8EAB8E6F, 0xAB12ABA2, 0x6FA26F3E,
    0xE60DE654, 0xDB52DBF2, 0x92BB927B, 0xB702B7B6, 0x692F69CA, 0x39A939D9,
    0xD3D7D30C, 0xA761A723, 0xA21EA2AD, 0xC3B4C399, 0x6C506C44, 0x07040705,
    0x04F6047F, 0x27C22746, 0xAC16ACA7, 0xD025D076, 0x50865013, 0xDC56DCF7,
    0x8455841A, 0xE109E151, 0x7ABE7A25, 0x139113EF},

   {0xD939A9D9, 0x90176790, 0x719CB371, 0xD2A6E8D2, 0x05070405, 0x9852FD98,
    0x6580A365, 0xDFE476DF, 0x08459A08, 0x024B9202, 0xA0E080A0, 0x665A7866,
    0xDDAFE4DD, 0xB06ADDB0, 0xBF63D1BF, 0x362A3836, 0x54E60D54, 0x4320C643,
    0x62CC3562, 0xBEF298BE, 0x1E12181E, 0x24EBF724, 0xD7A1ECD7, 0x77416C77,
    0xBD2843BD, 0x32BC7532, 0xD47B37D4, 0x9B88269B, 0x700DFA70, 0xF94413F9,
    0xB1FB94B1, 0x5A7E485A, 0x7A03F27A, 0xE48CD0E4, 0x47B68B47, 0x3C24303C,
    0xA5E784A5, 0x416B5441, 0x06DDDF06, 0xC56023C5, 0x45FD1945, 0xA33A5BA3,
    0x68C23D68, 0x158D5915, 0x21ECF321, 0x3166AE31, 0x3E6FA23E, 0x16578216,
    0x95106395, 0x5BEF015B, 0x4DB8834D, 0x91862E91, 0xB56DD9B5, 0x1F83511F,
    0x53AA9B53, 0x635D7C63, 0x3B68A63B, 0x3FFEEB3F, 0xD630A5D6, 0x257ABE25,
    0xA7AC16A7, 0x0F090C0F, 0x35F0E335, 0x23A76123, 0xF090C0F0, 0xAFE98CAF,
    0x809D3A80, 0x925CF592, 0x810C7381, 0x27312C27, 0x76D02576, 0xE7560BE7,
    0x7B92BB7B, 0xE9CE4EE9, 0xF10189F1, 0x9F1E6B9F, 0xA93453A9, 0xC4F16AC4,
    0x99C3B499, 0x975BF197, 0x8347E183, 0x6B18E66B, 0xC822BDC8, 0x0E98450E,
    0x6E1FE26E, 0xC9B3F4C9, 0x2F74B62F, 0xCBF866CB, 0xFF99CCFF, 0xEA1495EA,
    0xED5803ED, 0xF7DC56F7, 0xE18BD4E1, 0x1B151C1B, 0xADA21EAD, 0x0CD3D70C,
    0x2BE2FB2B, 0x1DC8C31D, 0x195E8E19, 0xC22CB5C2, 0x8949E989, 0x12C1CF12,
    0x7E95BF7E, 0x207DBA20, 0x6411EA64, 0x840B7784, 0x6DC5396D, 0x6A89AF6A,
    0xD17C33D1, 0xA171C9A1, 0xCEFF62CE, 0x37BB7137, 0xFB0F81FB, 0x3DB5793D,
    0x51E10951, 0xDC3EADDC, 0x2D3F242D, 0xA476CDA4, 0x9D55F99D, 0xEE82D8EE,
    0x8640E586, 0xAE78C5AE, 0xCD25B9CD, 0x04964D04, 0x55774455, 0x0A0E080A,
    0x13508613, 0x30F7E730, 0xD337A1D3, 0x40FA1D40, 0x3461AA34, 0x8C4EED8C,
    0xB3B006B3, 0x6C54706C, 0x2A73B22A, 0x523BD252, 0x0B9F410B, 0x8B027B8B,
    0x88D8A088, 0x4FF3114F, 0x67CB3167, 0x4627C246, 0xC06727C0, 0xB4FC90B4,
    0x28382028, 0x7F04F67F, 0x78486078, 0x2EE5FF2E, 0x074C9607, 0x4B655C4B,
    0xC72BB1C7, 0x6F8EAB6F, 0x0D429E0D, 0xBBF59CBB, 0xF2DB52F2, 0xF34A1BF3,
    0xA63D5FA6, 0x59A49359, 0xBCB90ABC, 0x3AF9EF3A, 0xEF1391EF, 0xFE0885FE,
    0x01914901, 0x6116EE61, 0x7CDE2D7C, 0xB2214FB2, 0x42B18F42, 0xDB723BDB,
    0xB82F47B8, 0x48BF8748, 0x2CAE6D2C, 0xE3C046E3, 0x573CD657, 0x859A3E85,
    0x29A96929, 0x7D4F647D, 0x94812A94, 0x492ECE49, 0x17C6CB17, 0xCA692FCA,
    0xC3BDFCC3, 0x5CA3975C, 0x5EE8055E, 0xD0ED7AD0, 0x87D1AC87, 0x8E057F8E,
    0xBA64D5BA, 0xA8A51AA8, 0xB7264BB7, 0xB9BE0EB9, 0x6087A760, 0xF8D55AF8,
    0x22362822, 0x111B1411, 0xDE753FDE, 0x79D92979, 0xAAEE88AA, 0x332D3C33,
    0x5F794C5F, 0xB6B702B6, 0x96CAB896, 0x5835DA58, 0x9CC4B09C, 0xFC4317FC,
    0x1A84551A, 0xF64D1FF6, 0x1C598A1C, 0x38B27D38, 0xAC3357AC, 0x18CFC718,
    0xF4068DF4, 0x69537469, 0x749BB774, 0xF597C4F5, 0x56AD9F56, 0xDAE372DA,
    0xD5EA7ED5, 0x4AF4154A, 0x9E8F229E, 0xA2AB12A2, 0x4E62584E, 0xE85F07E8,
    0xE51D99E5, 0x39233439, 0xC1F66EC1, 0x446C5044, 0x5D32DE5D, 0x72466872,
    0x26A06526, 0x93CDBC93, 0x03DADB03, 0xC6BAF8C6, 0xFA9EC8FA, 0x82D6A882,
    0xCF6E2BCF, 0x50704050, 0xEB85DCEB, 0x750AFE75, 0x8A93328A, 0x8DDFA48D,
    0x4C29CA4C, 0x141C1014, 0x73D72173, 0xCCB4F0CC, 0x09D4D309, 0x108A5D10,
    0xE2510FE2, 0x00000000, 0x9A196F9A, 0xE01A9DE0, 0x8F94368F, 0xE6C742E6,
    0xECC94AEC, 0xFDD25EFD, 0xAB7FC1AB, 0xD8A8E0D8}
};

/* The exp_to_poly and poly_to_exp tables are used to perform efficient
 * operations in GF(2^8) represented as GF(2)[x]/w(x) where
 * w(x)=x^8+x^6+x^3+x^2+1.  We care about doing that because it's part of the
 * definition of the RS matrix in the key schedule.  Elements of that field
 * are polynomials of degree not greater than 7 and all coefficients 0 or 1,
 * which can be represented naturally by bytes (just substitute x=2).  In that
 * form, GF(2^8) addition is the same as bitwise XOR, but GF(2^8)
 * multiplication is inefficient without hardware support.  To multiply
 * faster, I make use of the fact x is a generator for the nonzero elements,
 * so that every element p of GF(2)[x]/w(x) is either 0 or equal to (x)^n for
 * some n in 0..254.  Note that that caret is exponentiation in GF(2^8),
 * *not* polynomial notation.  So if I want to compute pq where p and q are
 * in GF(2^8), I can just say:
 *    1. if p=0 or q=0 then pq=0
 *    2. otherwise, find m and n such that p=x^m and q=x^n
 *    3. pq=(x^m)(x^n)=x^(m+n), so add m and n and find pq
 * The translations in steps 2 and 3 are looked up in the tables
 * poly_to_exp (for step 2) and exp_to_poly (for step 3).  To see this
 * in action, look at the CALC_S macro.  As additional wrinkles, note that
 * one of my operands is always a constant, so the poly_to_exp lookup on it
 * is done in advance; I included the original values in the comments so
 * readers can have some chance of recognizing that this *is* the RS matrix
 * from the Twofish paper.  I've only included the table entries I actually
 * need; I never do a lookup on a variable input of zero and the biggest
 * exponents I'll ever see are 254 (variable) and 237 (constant), so they'll
 * never sum to more than 491.	I'm repeating part of the exp_to_poly table
 * so that I don't have to do mod-255 reduction in the exponent arithmetic.
 * Since I know my constant operands are never zero, I only have to worry
 * about zero values in the variable operand, and I do it with a simple
 * conditional branch.	I know conditionals are expensive, but I couldn't
 * see a non-horrible way of avoiding them, and I did manage to group the
 * statements so that each if covers four group multiplications. */

static const u16 poly_to_exp[256] = {
   492,
   0x00, 0x01, 0x17, 0x02, 0x2E, 0x18, 0x53, 0x03, 0x6A, 0x2F, 0x93, 0x19,
   0x34, 0x54, 0x45, 0x04, 0x5C, 0x6B, 0xB6, 0x30, 0xA6, 0x94, 0x4B, 0x1A,
   0x8C, 0x35, 0x81, 0x55, 0xAA, 0x46, 0x0D, 0x05, 0x24, 0x5D, 0x87, 0x6C,
   0x9B, 0xB7, 0xC1, 0x31, 0x2B, 0xA7, 0xA3, 0x95, 0x98, 0x4C, 0xCA, 0x1B,
   0xE6, 0x8D, 0x73, 0x36, 0xCD, 0x82, 0x12, 0x56, 0x62, 0xAB, 0xF0, 0x47,
   0x4F, 0x0E, 0xBD, 0x06, 0xD4, 0x25, 0xD2, 0x5E, 0x27, 0x88, 0x66, 0x6D,
   0xD6, 0x9C, 0x79, 0xB8, 0x08, 0xC2, 0xDF, 0x32, 0x68, 0x2C, 0xFD, 0xA8,
   0x8A, 0xA4, 0x5A, 0x96, 0x29, 0x99, 0x22, 0x4D, 0x60, 0xCB, 0xE4, 0x1C,
   0x7B, 0xE7, 0x3B, 0x8E, 0x9E, 0x74, 0xF4, 0x37, 0xD8, 0xCE, 0xF9, 0x83,
   0x6F, 0x13, 0xB2, 0x57, 0xE1, 0x63, 0xDC, 0xAC, 0xC4, 0xF1, 0xAF, 0x48,
   0x0A, 0x50, 0x42, 0x0F, 0xBA, 0xBE, 0xC7, 0x07, 0xDE, 0xD5, 0x78, 0x26,
   0x65, 0xD3, 0xD1, 0x5F, 0xE3, 0x28, 0x21, 0x89, 0x59, 0x67, 0xFC, 0x6E,
   0xB1, 0xD7, 0xF8, 0x9D, 0xF3, 0x7A, 0x3A, 0xB9, 0xC6, 0x09, 0x41, 0xC3,
   0xAE, 0xE0, 0xDB, 0x33, 0x44, 0x69, 0x92, 0x2D, 0x52, 0xFE, 0x16, 0xA9,
   0x0C, 0x8B, 0x80, 0xA5, 0x4A, 0x5B, 0xB5, 0x97, 0xC9, 0x2A, 0xA2, 0x9A,
   0xC0, 0x23, 0x86, 0x4E, 0xBC, 0x61, 0xEF, 0xCC, 0x11, 0xE5, 0x72, 0x1D,
   0x3D, 0x7C, 0xEB, 0xE8, 0xE9, 0x3C, 0xEA, 0x8F, 0x7D, 0x9F, 0xEC, 0x75,
   0x1E, 0xF5, 0x3E, 0x38, 0xF6, 0xD9, 0x3F, 0xCF, 0x76, 0xFA, 0x1F, 0x84,
   0xA0, 0x70, 0xED, 0x14, 0x90, 0xB3, 0x7E, 0x58, 0xFB, 0xE2, 0x20, 0x64,
   0xD0, 0xDD, 0x77, 0xAD, 0xDA, 0xC5, 0x40, 0xF2, 0x39, 0xB0, 0xF7, 0x49,
   0xB4, 0x0B, 0x7F, 0x51, 0x15, 0x43, 0x91, 0x10, 0x71, 0xBB, 0xEE, 0xBF,
   0x85, 0xC8, 0xA1
};

static const byte exp_to_poly[492 + 256] = {
   0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x4D, 0x9A, 0x79, 0xF2,
   0xA9, 0x1F, 0x3E, 0x7C, 0xF8, 0xBD, 0x37, 0x6E, 0xDC, 0xF5, 0xA7, 0x03,
   0x06, 0x0C, 0x18, 0x30, 0x60, 0xC0, 0xCD, 0xD7, 0xE3, 0x8B, 0x5B, 0xB6,
   0x21, 0x42, 0x84, 0x45, 0x8A, 0x59, 0xB2, 0x29, 0x52, 0xA4, 0x05, 0x0A,
   0x14, 0x28, 0x50, 0xA0, 0x0D, 0x1A, 0x34, 0x68, 0xD0, 0xED, 0x97, 0x63,
   0xC6, 0xC1, 0xCF, 0xD3, 0xEB, 0x9B, 0x7B, 0xF6, 0xA1, 0x0F, 0x1E, 0x3C,
   0x78, 0xF0, 0xAD, 0x17, 0x2E, 0x5C, 0xB8, 0x3D, 0x7A, 0xF4, 0xA5, 0x07,
   0x0E, 0x1C, 0x38, 0x70, 0xE0, 0x8D, 0x57, 0xAE, 0x11, 0x22, 0x44, 0x88,
   0x5D, 0xBA, 0x39, 0x72, 0xE4, 0x85, 0x47, 0x8E, 0x51, 0xA2, 0x09, 0x12,
   0x24, 0x48, 0x90, 0x6D, 0xDA, 0xF9, 0xBF, 0x33, 0x66, 0xCC, 0xD5, 0xE7,
   0x83, 0x4B, 0x96, 0x61, 0xC2, 0xC9, 0xDF, 0xF3, 0xAB, 0x1B, 0x36, 0x6C,
   0xD8, 0xFD, 0xB7, 0x23, 0x46, 0x8C, 0x55, 0xAA, 0x19, 0x32, 0x64, 0xC8,
   0xDD, 0xF7, 0xA3, 0x0B, 0x16, 0x2C, 0x58, 0xB0, 0x2D, 0x5A, 0xB4, 0x25,
   0x4A, 0x94, 0x65, 0xCA, 0xD9, 0xFF, 0xB3, 0x2B, 0x56, 0xAC, 0x15, 0x2A,
   0x54, 0xA8, 0x1D, 0x3A, 0x74, 0xE8, 0x9D, 0x77, 0xEE, 0x91, 0x6F, 0xDE,
   0xF1, 0xAF, 0x13, 0x26, 0x4C, 0x98, 0x7D, 0xFA, 0xB9, 0x3F, 0x7E, 0xFC,
   0xB5, 0x27, 0x4E, 0x9C, 0x75, 0xEA, 0x99, 0x7F, 0xFE, 0xB1, 0x2F, 0x5E,
   0xBC, 0x35, 0x6A, 0xD4, 0xE5, 0x87, 0x43, 0x86, 0x41, 0x82, 0x49, 0x92,
   0x69, 0xD2, 0xE9, 0x9F, 0x73, 0xE6, 0x81, 0x4F, 0x9E, 0x71, 0xE2, 0x89,
   0x5F, 0xBE, 0x31, 0x62, 0xC4, 0xC5, 0xC7, 0xC3, 0xCB, 0xDB, 0xFB, 0xBB,
   0x3B, 0x76, 0xEC, 0x95, 0x67, 0xCE, 0xD1, 0xEF, 0x93, 0x6B, 0xD6, 0xE1,
   0x8F, 0x53, 0xA6, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x4D,
   0x9A, 0x79, 0xF2, 0xA9, 0x1F, 0x3E, 0x7C, 0xF8, 0xBD, 0x37, 0x6E, 0xDC,
   0xF5, 0xA7, 0x03, 0x06, 0x0C, 0x18, 0x30, 0x60, 0xC0, 0xCD, 0xD7, 0xE3,
   0x8B, 0x5B, 0xB6, 0x21, 0x42, 0x84, 0x45, 0x8A, 0x59, 0xB2, 0x29, 0x52,
   0xA4, 0x05, 0x0A, 0x14, 0x28, 0x50, 0xA0, 0x0D, 0x1A, 0x34, 0x68, 0xD0,
   0xED, 0x97, 0x63, 0xC6, 0xC1, 0xCF, 0xD3, 0xEB, 0x9B, 0x7B, 0xF6, 0xA1,
   0x0F, 0x1E, 0x3C, 0x78, 0xF0, 0xAD, 0x17, 0x2E, 0x5C, 0xB8, 0x3D, 0x7A,
   0xF4, 0xA5, 0x07, 0x0E, 0x1C, 0x38, 0x70, 0xE0, 0x8D, 0x57, 0xAE, 0x11,
   0x22, 0x44, 0x88, 0x5D, 0xBA, 0x39, 0x72, 0xE4, 0x85, 0x47, 0x8E, 0x51,
   0xA2, 0x09, 0x12, 0x24, 0x48, 0x90, 0x6D, 0xDA, 0xF9, 0xBF, 0x33, 0x66,
   0xCC, 0xD5, 0xE7, 0x83, 0x4B, 0x96, 0x61, 0xC2, 0xC9, 0xDF, 0xF3, 0xAB,
   0x1B, 0x36, 0x6C, 0xD8, 0xFD, 0xB7, 0x23, 0x46, 0x8C, 0x55, 0xAA, 0x19,
   0x32, 0x64, 0xC8, 0xDD, 0xF7, 0xA3, 0x0B, 0x16, 0x2C, 0x58, 0xB0, 0x2D,
   0x5A, 0xB4, 0x25, 0x4A, 0x94, 0x65, 0xCA, 0xD9, 0xFF, 0xB3, 0x2B, 0x56,
   0xAC, 0x15, 0x2A, 0x54, 0xA8, 0x1D, 0x3A, 0x74, 0xE8, 0x9D, 0x77, 0xEE,
   0x91, 0x6F, 0xDE, 0xF1, 0xAF, 0x13, 0x26, 0x4C, 0x98, 0x7D, 0xFA, 0xB9,
   0x3F, 0x7E, 0xFC, 0xB5, 0x27, 0x4E, 0x9C, 0x75, 0xEA, 0x99, 0x7F, 0xFE,
   0xB1, 0x2F, 0x5E, 0xBC, 0x35, 0x6A, 0xD4, 0xE5, 0x87, 0x43, 0x86, 0x41,
   0x82, 0x49, 0x92, 0x69, 0xD2, 0xE9, 0x9F, 0x73, 0xE6, 0x81, 0x4F, 0x9E,
   0x71, 0xE2, 0x89, 0x5F, 0xBE, 0x31, 0x62, 0xC4, 0xC5, 0xC7, 0xC3, 0xCB,
};


/* The table constants are indices of
 * S-box entries, preprocessed through q0 and q1. */
static byte calc_sb_tbl[512] = {
    0xA9, 0x75, 0x67, 0xF3, 0xB3, 0xC6, 0xE8, 0xF4,
    0x04, 0xDB, 0xFD, 0x7B, 0xA3, 0xFB, 0x76, 0xC8,
    0x9A, 0x4A, 0x92, 0xD3, 0x80, 0xE6, 0x78, 0x6B,
    0xE4, 0x45, 0xDD, 0x7D, 0xD1, 0xE8, 0x38, 0x4B,
    0x0D, 0xD6, 0xC6, 0x32, 0x35, 0xD8, 0x98, 0xFD,
    0x18, 0x37, 0xF7, 0x71, 0xEC, 0xF1, 0x6C, 0xE1,
    0x43, 0x30, 0x75, 0x0F, 0x37, 0xF8, 0x26, 0x1B,
    0xFA, 0x87, 0x13, 0xFA, 0x94, 0x06, 0x48, 0x3F,
    0xF2, 0x5E, 0xD0, 0xBA, 0x8B, 0xAE, 0x30, 0x5B,
    0x84, 0x8A, 0x54, 0x00, 0xDF, 0xBC, 0x23, 0x9D,
    0x19, 0x6D, 0x5B, 0xC1, 0x3D, 0xB1, 0x59, 0x0E,
    0xF3, 0x80, 0xAE, 0x5D, 0xA2, 0xD2, 0x82, 0xD5,
    0x63, 0xA0, 0x01, 0x84, 0x83, 0x07, 0x2E, 0x14,
    0xD9, 0xB5, 0x51, 0x90, 0x9B, 0x2C, 0x7C, 0xA3,
    0xA6, 0xB2, 0xEB, 0x73, 0xA5, 0x4C, 0xBE, 0x54,
    0x16, 0x92, 0x0C, 0x74, 0xE3, 0x36, 0x61, 0x51,
    0xC0, 0x38, 0x8C, 0xB0, 0x3A, 0xBD, 0xF5, 0x5A,
    0x73, 0xFC, 0x2C, 0x60, 0x25, 0x62, 0x0B, 0x96,
    0xBB, 0x6C, 0x4E, 0x42, 0x89, 0xF7, 0x6B, 0x10,
    0x53, 0x7C, 0x6A, 0x28, 0xB4, 0x27, 0xF1, 0x8C,
    0xE1, 0x13, 0xE6, 0x95, 0xBD, 0x9C, 0x45, 0xC7,
    0xE2, 0x24, 0xF4, 0x46, 0xB6, 0x3B, 0x66, 0x70,
    0xCC, 0xCA, 0x95, 0xE3, 0x03, 0x85, 0x56, 0xCB,
    0xD4, 0x11, 0x1C, 0xD0, 0x1E, 0x93, 0xD7, 0xB8,
    0xFB, 0xA6, 0xC3, 0x83, 0x8E, 0x20, 0xB5, 0xFF,
    0xE9, 0x9F, 0xCF, 0x77, 0xBF, 0xC3, 0xBA, 0xCC,
    0xEA, 0x03, 0x77, 0x6F, 0x39, 0x08, 0xAF, 0xBF,
    0x33, 0x40, 0xC9, 0xE7, 0x62, 0x2B, 0x71, 0xE2,
    0x81, 0x79, 0x79, 0x0C, 0x09, 0xAA, 0xAD, 0x82,
    0x24, 0x41, 0xCD, 0x3A, 0xF9, 0xEA, 0xD8, 0xB9,
    0xE5, 0xE4, 0xC5, 0x9A, 0xB9, 0xA4, 0x4D, 0x97,
    0x44, 0x7E, 0x08, 0xDA, 0x86, 0x7A, 0xE7, 0x17,
    0xA1, 0x66, 0x1D, 0x94, 0xAA, 0xA1, 0xED, 0x1D,
    0x06, 0x3D, 0x70, 0xF0, 0xB2, 0xDE, 0xD2, 0xB3,
    0x41, 0x0B, 0x7B, 0x72, 0xA0, 0xA7, 0x11, 0x1C,
    0x31, 0xEF, 0xC2, 0xD1, 0x27, 0x53, 0x90, 0x3E,
    0x20, 0x8F, 0xF6, 0x33, 0x60, 0x26, 0xFF, 0x5F,
    0x96, 0xEC, 0x5C, 0x76, 0xB1, 0x2A, 0xAB, 0x49,
    0x9E, 0x81, 0x9C, 0x88, 0x52, 0xEE, 0x1B, 0x21,
    0x5F, 0xC4, 0x93, 0x1A, 0x0A, 0xEB, 0xEF, 0xD9,
    0x91, 0xC5, 0x85, 0x39, 0x49, 0x99, 0xEE, 0xCD,
    0x2D, 0xAD, 0x4F, 0x31, 0x8F, 0x8B, 0x3B, 0x01,
    0x47, 0x18, 0x87, 0x23, 0x6D, 0xDD, 0x46, 0x1F,
    0xD6, 0x4E, 0x3E, 0x2D, 0x69, 0xF9, 0x64, 0x48,
    0x2A, 0x4F, 0xCE, 0xF2, 0xCB, 0x65, 0x2F, 0x8E,
    0xFC, 0x78, 0x97, 0x5C, 0x05, 0x58, 0x7A, 0x19,
    0xAC, 0x8D, 0x7F, 0xE5, 0xD5, 0x98, 0x1A, 0x57,
    0x4B, 0x67, 0x0E, 0x7F, 0xA7, 0x05, 0x5A, 0x64,
    0x28, 0xAF, 0x14, 0x63, 0x3F, 0xB6, 0x29, 0xFE,
    0x88, 0xF5, 0x3C, 0xB7, 0x4C, 0x3C, 0x02, 0xA5,
    0xB8, 0xCE, 0xDA, 0xE9, 0xB0, 0x68, 0x17, 0x44,
    0x55, 0xE0, 0x1F, 0x4D, 0x8A, 0x43, 0x7D, 0x69,
    0x57, 0x29, 0xC7, 0x2E, 0x8D, 0xAC, 0x74, 0x15,
    0xB7, 0x59, 0xC4, 0xA8, 0x9F, 0x0A, 0x72, 0x9E,
    0x7E, 0x6E, 0x15, 0x47, 0x22, 0xDF, 0x12, 0x34,
    0x58, 0x35, 0x07, 0x6A, 0x99, 0xCF, 0x34, 0xDC,
    0x6E, 0x22, 0x50, 0xC9, 0xDE, 0xC0, 0x68, 0x9B,
    0x65, 0x89, 0xBC, 0xD4, 0xDB, 0xED, 0xF8, 0xAB,
    0xC8, 0x12, 0xA8, 0xA2, 0x2B, 0x0D, 0x40, 0x52,
    0xDC, 0xBB, 0xFE, 0x02, 0x32, 0x2F, 0xA4, 0xA9,
    0xCA, 0xD7, 0x10, 0x61, 0x21, 0x1E, 0xF0, 0xB4,
    0xD3, 0x50, 0x5D, 0x04, 0x0F, 0xF6, 0x00, 0xC2,
    0x6F, 0x16, 0x9D, 0x25, 0x36, 0x86, 0x42, 0x56,
    0x4A, 0x55, 0x5E, 0x09, 0xC1, 0xBE, 0xE0, 0x91
};

/* Macro to perform one column of the RS matrix multiplication.  The
 * parameters a, b, c, and d are the four bytes of output; i is the index
 * of the key bytes, and w, x, y, and z, are the column of constants from
 * the RS matrix, preprocessed through the poly_to_exp table. */

#define CALC_S(a, b, c, d, i, w, x, y, z) \
   { \
      tmp = poly_to_exp[key[i]]; \
      (a) ^= exp_to_poly[tmp + (w)]; \
      (b) ^= exp_to_poly[tmp + (x)]; \
      (c) ^= exp_to_poly[tmp + (y)]; \
      (d) ^= exp_to_poly[tmp + (z)]; \
   }

/* Macros to calculate the key-dependent S-boxes for a 128-bit key using
 * the S vector from CALC_S.  CALC_SB_2 computes a single entry in all
 * four S-boxes, where i is the index of the entry to compute, and a and b
 * are the index numbers preprocessed through the q0 and q1 tables
 * respectively.  CALC_SB is simply a convenience to make the code shorter;
 * it calls CALC_SB_2 four times with consecutive indices from i to i+3,
 * using the remaining parameters two by two. */

#define CALC_SB_2(i, a, b) \
   ctx->s[0][i] = mds[0][q0[(a) ^ sa] ^ se]; \
   ctx->s[1][i] = mds[1][q0[(b) ^ sb] ^ sf]; \
   ctx->s[2][i] = mds[2][q1[(a) ^ sc] ^ sg]; \
   ctx->s[3][i] = mds[3][q1[(b) ^ sd] ^ sh]

#define CALC_SB(i, a, b, c, d, e, f, g, h) \
   CALC_SB_2 (i, a, b); CALC_SB_2 ((i)+1, c, d); \
   CALC_SB_2 ((i)+2, e, f); CALC_SB_2 ((i)+3, g, h)

/* Macros exactly like CALC_SB and CALC_SB_2, but for 256-bit keys. */

#define CALC_SB256_2(i, a, b) \
   ctx->s[0][i] = mds[0][q0[q0[q1[(b) ^ sa] ^ se] ^ si] ^ sm]; \
   ctx->s[1][i] = mds[1][q0[q1[q1[(a) ^ sb] ^ sf] ^ sj] ^ sn]; \
   ctx->s[2][i] = mds[2][q1[q0[q0[(a) ^ sc] ^ sg] ^ sk] ^ so]; \
   ctx->s[3][i] = mds[3][q1[q1[q0[(b) ^ sd] ^ sh] ^ sl] ^ sp];

#define CALC_SB256(i, a, b, c, d, e, f, g, h) \
   CALC_SB256_2 (i, a, b); CALC_SB256_2 ((i)+1, c, d); \
   CALC_SB256_2 ((i)+2, e, f); CALC_SB256_2 ((i)+3, g, h)

/* Macros to calculate the whitening and round subkeys.  CALC_K_2 computes the
 * last two stages of the h() function for a given index (either 2i or 2i+1).
 * a, b, c, and d are the four bytes going into the last two stages.  For
 * 128-bit keys, this is the entire h() function and a and c are the index
 * preprocessed through q0 and q1 respectively; for longer keys they are the
 * output of previous stages.  j is the index of the first key byte to use.
 * CALC_K computes a pair of subkeys for 128-bit Twofish, by calling CALC_K_2
 * twice, doing the Pseudo-Hadamard Transform, and doing the necessary
 * rotations.  Its parameters are: a, the array to write the results into,
 * j, the index of the first output entry, k and l, the preprocessed indices
 * for index 2i, and m and n, the preprocessed indices for index 2i+1.
 * CALC_K256_2 expands CALC_K_2 to handle 256-bit keys, by doing two
 * additional lookup-and-XOR stages.  The parameters a and b are the index
 * preprocessed through q0 and q1 respectively; j is the index of the first
 * key byte to use.  CALC_K256 is identical to CALC_K but for using the
 * CALC_K256_2 macro instead of CALC_K_2. */

#define CALC_K_2(a, b, c, d, j) \
     mds[0][q0[a ^ key[(j) + 8]] ^ key[j]] \
   ^ mds[1][q0[b ^ key[(j) + 9]] ^ key[(j) + 1]] \
   ^ mds[2][q1[c ^ key[(j) + 10]] ^ key[(j) + 2]] \
   ^ mds[3][q1[d ^ key[(j) + 11]] ^ key[(j) + 3]]

#define CALC_K(a, j, k, l, m, n) \
   x = CALC_K_2 (k, l, k, l, 0); \
   y = CALC_K_2 (m, n, m, n, 4); \
   y = (y << 8) + (y >> 24); \
   x += y; y += x; ctx->a[j] = x; \
   ctx->a[(j) + 1] = (y << 9) + (y >> 23)

#define CALC_K256_2(a, b, j) \
   CALC_K_2 (q0[q1[b ^ key[(j) + 24]] ^ key[(j) + 16]], \
	     q1[q1[a ^ key[(j) + 25]] ^ key[(j) + 17]], \
	     q0[q0[a ^ key[(j) + 26]] ^ key[(j) + 18]], \
	     q1[q0[b ^ key[(j) + 27]] ^ key[(j) + 19]], j)

#define CALC_K256(a, j, k, l, m, n) \
   x = CALC_K256_2 (k, l, 0); \
   y = CALC_K256_2 (m, n, 4); \
   y = (y << 8) + (y >> 24); \
   x += y; y += x; ctx->a[j] = x; \
   ctx->a[(j) + 1] = (y << 9) + (y >> 23)



/* Perform the key setup.  Note that this works only with 128- and 256-bit
 * keys, despite the API that looks like it might support other sizes. */

static gcry_err_code_t
do_twofish_setkey (TWOFISH_context *ctx, const byte *key, const unsigned keylen)
{
  int i, j, k;

  /* Temporaries for CALC_K. */
  u32 x, y;

  /* The S vector used to key the S-boxes, split up into individual bytes.
   * 128-bit keys use only sa through sh; 256-bit use all of them. */
  byte sa = 0, sb = 0, sc = 0, sd = 0, se = 0, sf = 0, sg = 0, sh = 0;
  byte si = 0, sj = 0, sk = 0, sl = 0, sm = 0, sn = 0, so = 0, sp = 0;

  /* Temporary for CALC_S. */
  unsigned int tmp;

  /* Flags for self-test. */
  static int initialized = 0;
  static const char *selftest_failed=0;

  /* Check key length. */
  if( ( ( keylen - 16 ) | 16 ) != 16 )
    return GPG_ERR_INV_KEYLEN;

  /* Do self-test if necessary. */
  if (!initialized)
    {
      initialized = 1;
      selftest_failed = selftest ();
      if( selftest_failed )
        log_error("%s\n", selftest_failed );
    }
  if( selftest_failed )
    return GPG_ERR_SELFTEST_FAILED;

  /* Compute the first two words of the S vector.  The magic numbers are
   * the entries of the RS matrix, preprocessed through poly_to_exp.	The
   * numbers in the comments are the original (polynomial form) matrix
   * entries. */
  CALC_S (sa, sb, sc, sd, 0, 0x00, 0x2D, 0x01, 0x2D); /* 01 A4 02 A4 */
  CALC_S (sa, sb, sc, sd, 1, 0x2D, 0xA4, 0x44, 0x8A); /* A4 56 A1 55 */
  CALC_S (sa, sb, sc, sd, 2, 0x8A, 0xD5, 0xBF, 0xD1); /* 55 82 FC 87 */
  CALC_S (sa, sb, sc, sd, 3, 0xD1, 0x7F, 0x3D, 0x99); /* 87 F3 C1 5A */
  CALC_S (sa, sb, sc, sd, 4, 0x99, 0x46, 0x66, 0x96); /* 5A 1E 47 58 */
  CALC_S (sa, sb, sc, sd, 5, 0x96, 0x3C, 0x5B, 0xED); /* 58 C6 AE DB */
  CALC_S (sa, sb, sc, sd, 6, 0xED, 0x37, 0x4F, 0xE0); /* DB 68 3D 9E */
  CALC_S (sa, sb, sc, sd, 7, 0xE0, 0xD0, 0x8C, 0x17); /* 9E E5 19 03 */
  CALC_S (se, sf, sg, sh, 8, 0x00, 0x2D, 0x01, 0x2D); /* 01 A4 02 A4 */
  CALC_S (se, sf, sg, sh, 9, 0x2D, 0xA4, 0x44, 0x8A); /* A4 56 A1 55 */
  CALC_S (se, sf, sg, sh, 10, 0x8A, 0xD5, 0xBF, 0xD1); /* 55 82 FC 87 */
  CALC_S (se, sf, sg, sh, 11, 0xD1, 0x7F, 0x3D, 0x99); /* 87 F3 C1 5A */
  CALC_S (se, sf, sg, sh, 12, 0x99, 0x46, 0x66, 0x96); /* 5A 1E 47 58 */
  CALC_S (se, sf, sg, sh, 13, 0x96, 0x3C, 0x5B, 0xED); /* 58 C6 AE DB */
  CALC_S (se, sf, sg, sh, 14, 0xED, 0x37, 0x4F, 0xE0); /* DB 68 3D 9E */
  CALC_S (se, sf, sg, sh, 15, 0xE0, 0xD0, 0x8C, 0x17); /* 9E E5 19 03 */

  if (keylen == 32)  /* 256-bit key */
    {
      /* Calculate the remaining two words of the S vector */
      CALC_S (si, sj, sk, sl, 16, 0x00, 0x2D, 0x01, 0x2D); /* 01 A4 02 A4 */
      CALC_S (si, sj, sk, sl, 17, 0x2D, 0xA4, 0x44, 0x8A); /* A4 56 A1 55 */
      CALC_S (si, sj, sk, sl, 18, 0x8A, 0xD5, 0xBF, 0xD1); /* 55 82 FC 87 */
      CALC_S (si, sj, sk, sl, 19, 0xD1, 0x7F, 0x3D, 0x99); /* 87 F3 C1 5A */
      CALC_S (si, sj, sk, sl, 20, 0x99, 0x46, 0x66, 0x96); /* 5A 1E 47 58 */
      CALC_S (si, sj, sk, sl, 21, 0x96, 0x3C, 0x5B, 0xED); /* 58 C6 AE DB */
      CALC_S (si, sj, sk, sl, 22, 0xED, 0x37, 0x4F, 0xE0); /* DB 68 3D 9E */
      CALC_S (si, sj, sk, sl, 23, 0xE0, 0xD0, 0x8C, 0x17); /* 9E E5 19 03 */
      CALC_S (sm, sn, so, sp, 24, 0x00, 0x2D, 0x01, 0x2D); /* 01 A4 02 A4 */
      CALC_S (sm, sn, so, sp, 25, 0x2D, 0xA4, 0x44, 0x8A); /* A4 56 A1 55 */
      CALC_S (sm, sn, so, sp, 26, 0x8A, 0xD5, 0xBF, 0xD1); /* 55 82 FC 87 */
      CALC_S (sm, sn, so, sp, 27, 0xD1, 0x7F, 0x3D, 0x99); /* 87 F3 C1 5A */
      CALC_S (sm, sn, so, sp, 28, 0x99, 0x46, 0x66, 0x96); /* 5A 1E 47 58 */
      CALC_S (sm, sn, so, sp, 29, 0x96, 0x3C, 0x5B, 0xED); /* 58 C6 AE DB */
      CALC_S (sm, sn, so, sp, 30, 0xED, 0x37, 0x4F, 0xE0); /* DB 68 3D 9E */
      CALC_S (sm, sn, so, sp, 31, 0xE0, 0xD0, 0x8C, 0x17); /* 9E E5 19 03 */

      /* Compute the S-boxes. */
      for(i=j=0,k=1; i < 256; i++, j += 2, k += 2 )
        {
          CALC_SB256_2( i, calc_sb_tbl[j], calc_sb_tbl[k] );
	}

      /* Calculate whitening and round subkeys. */
      for (i = 0; i < 8; i += 2)
	{
	  CALC_K256 ( w, i, q0[i], q1[i], q0[i + 1], q1[i + 1] );
	}
      for (j = 0; j < 32; j += 2, i += 2)
	{
	  CALC_K256 ( k, j, q0[i], q1[i], q0[i + 1], q1[i + 1] );
	}
    }
  else
    {
      /* Compute the S-boxes. */
      for(i=j=0,k=1; i < 256; i++, j += 2, k += 2 )
        {
          CALC_SB_2( i, calc_sb_tbl[j], calc_sb_tbl[k] );
        }

      /* Calculate whitening and round subkeys. */
      for (i = 0; i < 8; i += 2)
	{
	  CALC_K ( w, i, q0[i], q1[i], q0[i + 1], q1[i + 1] );
	}
      for (j = 0; j < 32; j += 2, i += 2)
	{
	  CALC_K ( k, j, q0[i], q1[i], q0[i + 1], q1[i + 1] );
	}
    }

  return 0;
}

static gcry_err_code_t
twofish_setkey (void *context, const byte *key, unsigned int keylen,
                cipher_bulk_ops_t *bulk_ops)
{
  TWOFISH_context *ctx = context;
  unsigned int hwfeatures = _gcry_get_hw_features ();
  int rc;

  rc = do_twofish_setkey (ctx, key, keylen);

#ifdef USE_AVX2
  ctx->use_avx2 = 0;
  if ((hwfeatures & HWF_INTEL_AVX2) && (hwfeatures & HWF_INTEL_FAST_VPGATHER))
    {
      ctx->use_avx2 = 1;
    }
#endif

  /* Setup bulk encryption routines.  */
  memset (bulk_ops, 0, sizeof(*bulk_ops));
  bulk_ops->cbc_dec = _gcry_twofish_cbc_dec;
  bulk_ops->cfb_dec = _gcry_twofish_cfb_dec;
  bulk_ops->ctr_enc = _gcry_twofish_ctr_enc;
  bulk_ops->ocb_crypt = _gcry_twofish_ocb_crypt;
  bulk_ops->ocb_auth  = _gcry_twofish_ocb_auth;

  (void)hwfeatures;

  _gcry_burn_stack (23+6*sizeof(void*));
  return rc;
}


#ifdef USE_AVX2
/* Assembler implementations of Twofish using AVX2.  Process 16 block in
   parallel.
 */
extern void _gcry_twofish_avx2_ctr_enc(const TWOFISH_context *ctx,
				       unsigned char *out,
				       const unsigned char *in,
				       unsigned char *ctr) ASM_FUNC_ABI;

extern void _gcry_twofish_avx2_cbc_dec(const TWOFISH_context *ctx,
				       unsigned char *out,
				       const unsigned char *in,
				       unsigned char *iv) ASM_FUNC_ABI;

extern void _gcry_twofish_avx2_cfb_dec(const TWOFISH_context *ctx,
				       unsigned char *out,
				       const unsigned char *in,
				       unsigned char *iv) ASM_FUNC_ABI;

extern void _gcry_twofish_avx2_ocb_enc(const TWOFISH_context *ctx,
				       unsigned char *out,
				       const unsigned char *in,
				       unsigned char *offset,
				       unsigned char *checksum,
				       const u64 Ls[16]) ASM_FUNC_ABI;

extern void _gcry_twofish_avx2_ocb_dec(const TWOFISH_context *ctx,
				       unsigned char *out,
				       const unsigned char *in,
				       unsigned char *offset,
				       unsigned char *checksum,
				       const u64 Ls[16]) ASM_FUNC_ABI;

extern void _gcry_twofish_avx2_ocb_auth(const TWOFISH_context *ctx,
					const unsigned char *abuf,
					unsigned char *offset,
					unsigned char *checksum,
					const u64 Ls[16]) ASM_FUNC_ABI;
#endif


#ifdef USE_AMD64_ASM

/* Assembly implementations of Twofish. */
extern void _gcry_twofish_amd64_encrypt_block(const TWOFISH_context *c,
					      byte *out, const byte *in);

extern void _gcry_twofish_amd64_decrypt_block(const TWOFISH_context *c,
					      byte *out, const byte *in);

/* These assembly implementations process three blocks in parallel. */
extern void _gcry_twofish_amd64_ctr_enc(const TWOFISH_context *c, byte *out,
					const byte *in, byte *ctr);

extern void _gcry_twofish_amd64_cbc_dec(const TWOFISH_context *c, byte *out,
					const byte *in, byte *iv);

extern void _gcry_twofish_amd64_cfb_dec(const TWOFISH_context *c, byte *out,
					const byte *in, byte *iv);

extern void _gcry_twofish_amd64_ocb_enc(const TWOFISH_context *ctx, byte *out,
					const byte *in, byte *offset,
					byte *checksum, const u64 Ls[3]);

extern void _gcry_twofish_amd64_ocb_dec(const TWOFISH_context *ctx, byte *out,
					const byte *in, byte *offset,
					byte *checksum, const u64 Ls[3]);

extern void _gcry_twofish_amd64_ocb_auth(const TWOFISH_context *ctx,
					 const byte *abuf, byte *offset,
					 byte *checksum, const u64 Ls[3]);

static inline void
twofish_amd64_encrypt_block(const TWOFISH_context *c, byte *out, const byte *in)
{
  _gcry_twofish_amd64_encrypt_block(c, out, in);
}

static inline void
twofish_amd64_decrypt_block(const TWOFISH_context *c, byte *out, const byte *in)
{
  _gcry_twofish_amd64_decrypt_block(c, out, in);
}

static inline void
twofish_amd64_ctr_enc(const TWOFISH_context *c, byte *out, const byte *in,
                      byte *ctr)
{
  _gcry_twofish_amd64_ctr_enc(c, out, in, ctr);
}

static inline void
twofish_amd64_cbc_dec(const TWOFISH_context *c, byte *out, const byte *in,
                      byte *iv)
{
  _gcry_twofish_amd64_cbc_dec(c, out, in, iv);
}

static inline void
twofish_amd64_cfb_dec(const TWOFISH_context *c, byte *out, const byte *in,
                      byte *iv)
{
  _gcry_twofish_amd64_cfb_dec(c, out, in, iv);
}

static inline void
twofish_amd64_ocb_enc(const TWOFISH_context *ctx, byte *out, const byte *in,
		      byte *offset, byte *checksum, const u64 Ls[3])
{
  _gcry_twofish_amd64_ocb_enc(ctx, out, in, offset, checksum, Ls);
}

static inline void
twofish_amd64_ocb_dec(const TWOFISH_context *ctx, byte *out, const byte *in,
		      byte *offset, byte *checksum, const u64 Ls[3])
{
  _gcry_twofish_amd64_ocb_dec(ctx, out, in, offset, checksum, Ls);
}

static inline void
twofish_amd64_ocb_auth(const TWOFISH_context *ctx, const byte *abuf,
		       byte *offset, byte *checksum, const u64 Ls[3])
{
  _gcry_twofish_amd64_ocb_auth(ctx, abuf, offset, checksum, Ls);
}

#elif defined(USE_ARM_ASM)

/* Assembly implementations of Twofish. */
extern void _gcry_twofish_arm_encrypt_block(const TWOFISH_context *c,
					      byte *out, const byte *in);

extern void _gcry_twofish_arm_decrypt_block(const TWOFISH_context *c,
					      byte *out, const byte *in);

#else /*!USE_AMD64_ASM && !USE_ARM_ASM*/

/* Macros to compute the g() function in the encryption and decryption
 * rounds.  G1 is the straight g() function; G2 includes the 8-bit
 * rotation for the high 32-bit word. */

#define G1(a) \
     (ctx->s[0][(a) & 0xFF]) ^ (ctx->s[1][((a) >> 8) & 0xFF]) \
   ^ (ctx->s[2][((a) >> 16) & 0xFF]) ^ (ctx->s[3][(a) >> 24])

#define G2(b) \
     (ctx->s[1][(b) & 0xFF]) ^ (ctx->s[2][((b) >> 8) & 0xFF]) \
   ^ (ctx->s[3][((b) >> 16) & 0xFF]) ^ (ctx->s[0][(b) >> 24])

/* Encryption and decryption Feistel rounds.  Each one calls the two g()
 * macros, does the PHT, and performs the XOR and the appropriate bit
 * rotations.  The parameters are the round number (used to select subkeys),
 * and the four 32-bit chunks of the text. */

#define ENCROUND(n, a, b, c, d) \
   x = G1 (a); y = G2 (b); \
   x += y; y += x + ctx->k[2 * (n) + 1]; \
   (c) ^= x + ctx->k[2 * (n)]; \
   (c) = ((c) >> 1) + ((c) << 31); \
   (d) = (((d) << 1)+((d) >> 31)) ^ y

#define DECROUND(n, a, b, c, d) \
   x = G1 (a); y = G2 (b); \
   x += y; y += x; \
   (d) ^= y + ctx->k[2 * (n) + 1]; \
   (d) = ((d) >> 1) + ((d) << 31); \
   (c) = (((c) << 1)+((c) >> 31)); \
   (c) ^= (x + ctx->k[2 * (n)])

/* Encryption and decryption cycles; each one is simply two Feistel rounds
 * with the 32-bit chunks re-ordered to simulate the "swap" */

#define ENCCYCLE(n) \
   ENCROUND (2 * (n), a, b, c, d); \
   ENCROUND (2 * (n) + 1, c, d, a, b)

#define DECCYCLE(n) \
   DECROUND (2 * (n) + 1, c, d, a, b); \
   DECROUND (2 * (n), a, b, c, d)

/* Macros to convert the input and output bytes into 32-bit words,
 * and simultaneously perform the whitening step.  INPACK packs word
 * number n into the variable named by x, using whitening subkey number m.
 * OUTUNPACK unpacks word number n from the variable named by x, using
 * whitening subkey number m. */

#define INPACK(n, x, m) \
   x = buf_get_le32(in + (n) * 4); \
   x ^= ctx->w[m]

#define OUTUNPACK(n, x, m) \
   x ^= ctx->w[m]; \
   buf_put_le32(out + (n) * 4, x)

#endif /*!USE_AMD64_ASM*/


/* Encrypt one block.  in and out may be the same. */

#ifdef USE_AMD64_ASM

static unsigned int
twofish_encrypt (void *context, byte *out, const byte *in)
{
  TWOFISH_context *ctx = context;
  twofish_amd64_encrypt_block(ctx, out, in);
  return /*burn_stack*/ (4*sizeof (void*));
}

#elif defined(USE_ARM_ASM)

static unsigned int
twofish_encrypt (void *context, byte *out, const byte *in)
{
  TWOFISH_context *ctx = context;
  _gcry_twofish_arm_encrypt_block(ctx, out, in);
  return /*burn_stack*/ (4*sizeof (void*));
}

#else /*!USE_AMD64_ASM && !USE_ARM_ASM*/

static void
do_twofish_encrypt (const TWOFISH_context *ctx, byte *out, const byte *in)
{
  /* The four 32-bit chunks of the text. */
  u32 a, b, c, d;

  /* Temporaries used by the round function. */
  u32 x, y;

  /* Input whitening and packing. */
  INPACK (0, a, 0);
  INPACK (1, b, 1);
  INPACK (2, c, 2);
  INPACK (3, d, 3);

  /* Encryption Feistel cycles. */
  ENCCYCLE (0);
  ENCCYCLE (1);
  ENCCYCLE (2);
  ENCCYCLE (3);
  ENCCYCLE (4);
  ENCCYCLE (5);
  ENCCYCLE (6);
  ENCCYCLE (7);

  /* Output whitening and unpacking. */
  OUTUNPACK (0, c, 4);
  OUTUNPACK (1, d, 5);
  OUTUNPACK (2, a, 6);
  OUTUNPACK (3, b, 7);
}

static unsigned int
twofish_encrypt (void *context, byte *out, const byte *in)
{
  TWOFISH_context *ctx = context;
  do_twofish_encrypt (ctx, out, in);
  return /*burn_stack*/ (24+3*sizeof (void*));
}

#endif /*!USE_AMD64_ASM && !USE_ARM_ASM*/


/* Decrypt one block.  in and out may be the same. */

#ifdef USE_AMD64_ASM

static unsigned int
twofish_decrypt (void *context, byte *out, const byte *in)
{
  TWOFISH_context *ctx = context;
  twofish_amd64_decrypt_block(ctx, out, in);
  return /*burn_stack*/ (4*sizeof (void*));
}

#elif defined(USE_ARM_ASM)

static unsigned int
twofish_decrypt (void *context, byte *out, const byte *in)
{
  TWOFISH_context *ctx = context;
  _gcry_twofish_arm_decrypt_block(ctx, out, in);
  return /*burn_stack*/ (4*sizeof (void*));
}

#else /*!USE_AMD64_ASM && !USE_ARM_ASM*/

static void
do_twofish_decrypt (const TWOFISH_context *ctx, byte *out, const byte *in)
{
  /* The four 32-bit chunks of the text. */
  u32 a, b, c, d;

  /* Temporaries used by the round function. */
  u32 x, y;

  /* Input whitening and packing. */
  INPACK (0, c, 4);
  INPACK (1, d, 5);
  INPACK (2, a, 6);
  INPACK (3, b, 7);

  /* Encryption Feistel cycles. */
  DECCYCLE (7);
  DECCYCLE (6);
  DECCYCLE (5);
  DECCYCLE (4);
  DECCYCLE (3);
  DECCYCLE (2);
  DECCYCLE (1);
  DECCYCLE (0);

  /* Output whitening and unpacking. */
  OUTUNPACK (0, a, 0);
  OUTUNPACK (1, b, 1);
  OUTUNPACK (2, c, 2);
  OUTUNPACK (3, d, 3);
}

static unsigned int
twofish_decrypt (void *context, byte *out, const byte *in)
{
  TWOFISH_context *ctx = context;

  do_twofish_decrypt (ctx, out, in);
  return /*burn_stack*/ (24+3*sizeof (void*));
}

#endif /*!USE_AMD64_ASM && !USE_ARM_ASM*/



/* Bulk encryption of complete blocks in CTR mode.  This function is only
   intended for the bulk encryption feature of cipher.c.  CTR is expected to be
   of size TWOFISH_BLOCKSIZE. */
static void
_gcry_twofish_ctr_enc(void *context, unsigned char *ctr, void *outbuf_arg,
		      const void *inbuf_arg, size_t nblocks)
{
  TWOFISH_context *ctx = context;
  unsigned char *outbuf = outbuf_arg;
  const unsigned char *inbuf = inbuf_arg;
  unsigned char tmpbuf[TWOFISH_BLOCKSIZE];
  unsigned int burn, burn_stack_depth = 0;

#ifdef USE_AVX2
  if (ctx->use_avx2)
    {
      int did_use_avx2 = 0;

      /* Process data in 16 block chunks. */
      while (nblocks >= 16)
        {
          _gcry_twofish_avx2_ctr_enc(ctx, outbuf, inbuf, ctr);

          nblocks -= 16;
          outbuf += 16 * TWOFISH_BLOCKSIZE;
          inbuf  += 16 * TWOFISH_BLOCKSIZE;
          did_use_avx2 = 1;
        }

      if (did_use_avx2)
        {
          /* twofish-avx2 assembly code does not use stack */
          if (nblocks == 0)
            burn_stack_depth = 0;
        }
    }
#endif

#ifdef USE_AMD64_ASM
  {
    /* Process data in 3 block chunks. */
    while (nblocks >= 3)
      {
        twofish_amd64_ctr_enc(ctx, outbuf, inbuf, ctr);

        nblocks -= 3;
        outbuf += 3 * TWOFISH_BLOCKSIZE;
        inbuf += 3 * TWOFISH_BLOCKSIZE;

        burn = 8 * sizeof(void*);
        if (burn > burn_stack_depth)
          burn_stack_depth = burn;
      }

    /* Use generic code to handle smaller chunks... */
    /* TODO: use caching instead? */
  }
#endif

  for ( ;nblocks; nblocks-- )
    {
      /* Encrypt the counter. */
      burn = twofish_encrypt(ctx, tmpbuf, ctr);
      if (burn > burn_stack_depth)
        burn_stack_depth = burn;

      /* XOR the input with the encrypted counter and store in output.  */
      cipher_block_xor(outbuf, tmpbuf, inbuf, TWOFISH_BLOCKSIZE);
      outbuf += TWOFISH_BLOCKSIZE;
      inbuf  += TWOFISH_BLOCKSIZE;
      /* Increment the counter.  */
      cipher_block_add(ctr, 1, TWOFISH_BLOCKSIZE);
    }

  wipememory(tmpbuf, sizeof(tmpbuf));
  _gcry_burn_stack(burn_stack_depth);
}


/* Bulk decryption of complete blocks in CBC mode.  This function is only
   intended for the bulk encryption feature of cipher.c. */
static void
_gcry_twofish_cbc_dec(void *context, unsigned char *iv, void *outbuf_arg,
		      const void *inbuf_arg, size_t nblocks)
{
  TWOFISH_context *ctx = context;
  unsigned char *outbuf = outbuf_arg;
  const unsigned char *inbuf = inbuf_arg;
  unsigned char savebuf[TWOFISH_BLOCKSIZE];
  unsigned int burn, burn_stack_depth = 0;

#ifdef USE_AVX2
  if (ctx->use_avx2)
    {
      int did_use_avx2 = 0;

      /* Process data in 16 block chunks. */
      while (nblocks >= 16)
        {
          _gcry_twofish_avx2_cbc_dec(ctx, outbuf, inbuf, iv);

          nblocks -= 16;
          outbuf += 16 * TWOFISH_BLOCKSIZE;
          inbuf  += 16 * TWOFISH_BLOCKSIZE;
          did_use_avx2 = 1;
        }

      if (did_use_avx2)
        {
          /* twofish-avx2 assembly code does not use stack */
          if (nblocks == 0)
            burn_stack_depth = 0;
        }
    }
#endif

#ifdef USE_AMD64_ASM
  {
    /* Process data in 3 block chunks. */
    while (nblocks >= 3)
      {
        twofish_amd64_cbc_dec(ctx, outbuf, inbuf, iv);

        nblocks -= 3;
        outbuf += 3 * TWOFISH_BLOCKSIZE;
        inbuf += 3 * TWOFISH_BLOCKSIZE;

        burn = 9 * sizeof(void*);
        if (burn > burn_stack_depth)
          burn_stack_depth = burn;
      }

    /* Use generic code to handle smaller chunks... */
  }
#endif

  for ( ;nblocks; nblocks-- )
    {
      /* INBUF is needed later and it may be identical to OUTBUF, so store
         the intermediate result to SAVEBUF.  */
      burn = twofish_decrypt (ctx, savebuf, inbuf);
      if (burn > burn_stack_depth)
        burn_stack_depth = burn;

      cipher_block_xor_n_copy_2(outbuf, savebuf, iv, inbuf, TWOFISH_BLOCKSIZE);
      inbuf += TWOFISH_BLOCKSIZE;
      outbuf += TWOFISH_BLOCKSIZE;
    }

  wipememory(savebuf, sizeof(savebuf));
  _gcry_burn_stack(burn_stack_depth);
}


/* Bulk decryption of complete blocks in CFB mode.  This function is only
   intended for the bulk encryption feature of cipher.c. */
static void
_gcry_twofish_cfb_dec(void *context, unsigned char *iv, void *outbuf_arg,
		    const void *inbuf_arg, size_t nblocks)
{
  TWOFISH_context *ctx = context;
  unsigned char *outbuf = outbuf_arg;
  const unsigned char *inbuf = inbuf_arg;
  unsigned int burn, burn_stack_depth = 0;

#ifdef USE_AVX2
  if (ctx->use_avx2)
    {
      int did_use_avx2 = 0;

      /* Process data in 16 block chunks. */
      while (nblocks >= 16)
        {
          _gcry_twofish_avx2_cfb_dec(ctx, outbuf, inbuf, iv);

          nblocks -= 16;
          outbuf += 16 * TWOFISH_BLOCKSIZE;
          inbuf  += 16 * TWOFISH_BLOCKSIZE;
          did_use_avx2 = 1;
        }

      if (did_use_avx2)
        {
          /* twofish-avx2 assembly code does not use stack */
          if (nblocks == 0)
            burn_stack_depth = 0;
        }
    }
#endif

#ifdef USE_AMD64_ASM
  {
    /* Process data in 3 block chunks. */
    while (nblocks >= 3)
      {
        twofish_amd64_cfb_dec(ctx, outbuf, inbuf, iv);

        nblocks -= 3;
        outbuf += 3 * TWOFISH_BLOCKSIZE;
        inbuf += 3 * TWOFISH_BLOCKSIZE;

        burn = 8 * sizeof(void*);
        if (burn > burn_stack_depth)
          burn_stack_depth = burn;
      }

    /* Use generic code to handle smaller chunks... */
  }
#endif

  for ( ;nblocks; nblocks-- )
    {
      burn = twofish_encrypt(ctx, iv, iv);
      if (burn > burn_stack_depth)
        burn_stack_depth = burn;

      cipher_block_xor_n_copy(outbuf, iv, inbuf, TWOFISH_BLOCKSIZE);
      outbuf += TWOFISH_BLOCKSIZE;
      inbuf += TWOFISH_BLOCKSIZE;
    }

  _gcry_burn_stack(burn_stack_depth);
}

/* Bulk encryption/decryption of complete blocks in OCB mode. */
static size_t
_gcry_twofish_ocb_crypt (gcry_cipher_hd_t c, void *outbuf_arg,
			const void *inbuf_arg, size_t nblocks, int encrypt)
{
#ifdef USE_AMD64_ASM
  TWOFISH_context *ctx = (void *)&c->context.c;
  unsigned char *outbuf = outbuf_arg;
  const unsigned char *inbuf = inbuf_arg;
  unsigned int burn, burn_stack_depth = 0;
  u64 blkn = c->u_mode.ocb.data_nblocks;

#ifdef USE_AVX2
  if (ctx->use_avx2)
    {
      int did_use_avx2 = 0;
      u64 Ls[16];
      unsigned int n = 16 - (blkn % 16);
      u64 *l;
      int i;

      if (nblocks >= 16)
	{
	  for (i = 0; i < 16; i += 8)
	    {
	      /* Use u64 to store pointers for x32 support (assembly function
	       * assumes 64-bit pointers). */
	      Ls[(i + 0 + n) % 16] = (uintptr_t)(void *)c->u_mode.ocb.L[0];
	      Ls[(i + 1 + n) % 16] = (uintptr_t)(void *)c->u_mode.ocb.L[1];
	      Ls[(i + 2 + n) % 16] = (uintptr_t)(void *)c->u_mode.ocb.L[0];
	      Ls[(i + 3 + n) % 16] = (uintptr_t)(void *)c->u_mode.ocb.L[2];
	      Ls[(i + 4 + n) % 16] = (uintptr_t)(void *)c->u_mode.ocb.L[0];
	      Ls[(i + 5 + n) % 16] = (uintptr_t)(void *)c->u_mode.ocb.L[1];
	      Ls[(i + 6 + n) % 16] = (uintptr_t)(void *)c->u_mode.ocb.L[0];
	    }

	  Ls[(7 + n) % 16] = (uintptr_t)(void *)c->u_mode.ocb.L[3];
	  l = &Ls[(15 + n) % 16];

	  /* Process data in 16 block chunks. */
	  while (nblocks >= 16)
	    {
	      blkn += 16;
	      *l = (uintptr_t)(void *)ocb_get_l(c, blkn - blkn % 16);

	      if (encrypt)
		_gcry_twofish_avx2_ocb_enc(ctx, outbuf, inbuf, c->u_iv.iv,
					  c->u_ctr.ctr, Ls);
	      else
		_gcry_twofish_avx2_ocb_dec(ctx, outbuf, inbuf, c->u_iv.iv,
					  c->u_ctr.ctr, Ls);

	      nblocks -= 16;
	      outbuf += 16 * TWOFISH_BLOCKSIZE;
	      inbuf  += 16 * TWOFISH_BLOCKSIZE;
	      did_use_avx2 = 1;
	    }
	}

      if (did_use_avx2)
	{
	  /* twofish-avx2 assembly code does not use stack */
	  if (nblocks == 0)
	    burn_stack_depth = 0;
	}
    }
#endif

  {
    /* Use u64 to store pointers for x32 support (assembly function
      * assumes 64-bit pointers). */
    u64 Ls[3];

    /* Process data in 3 block chunks. */
    while (nblocks >= 3)
      {
	Ls[0] = (uintptr_t)(const void *)ocb_get_l(c, blkn + 1);
	Ls[1] = (uintptr_t)(const void *)ocb_get_l(c, blkn + 2);
	Ls[2] = (uintptr_t)(const void *)ocb_get_l(c, blkn + 3);
	blkn += 3;

	if (encrypt)
	  twofish_amd64_ocb_enc(ctx, outbuf, inbuf, c->u_iv.iv, c->u_ctr.ctr,
				Ls);
	else
	  twofish_amd64_ocb_dec(ctx, outbuf, inbuf, c->u_iv.iv, c->u_ctr.ctr,
				Ls);

	nblocks -= 3;
	outbuf += 3 * TWOFISH_BLOCKSIZE;
	inbuf  += 3 * TWOFISH_BLOCKSIZE;

	burn = 8 * sizeof(void*);
	if (burn > burn_stack_depth)
	  burn_stack_depth = burn;
      }

    /* Use generic code to handle smaller chunks... */
  }

  c->u_mode.ocb.data_nblocks = blkn;

  if (burn_stack_depth)
    _gcry_burn_stack (burn_stack_depth + 4 * sizeof(void *));
#else
  (void)c;
  (void)outbuf_arg;
  (void)inbuf_arg;
  (void)encrypt;
#endif

  return nblocks;
}

/* Bulk authentication of complete blocks in OCB mode. */
static size_t
_gcry_twofish_ocb_auth (gcry_cipher_hd_t c, const void *abuf_arg,
			size_t nblocks)
{
#ifdef USE_AMD64_ASM
  TWOFISH_context *ctx = (void *)&c->context.c;
  const unsigned char *abuf = abuf_arg;
  unsigned int burn, burn_stack_depth = 0;
  u64 blkn = c->u_mode.ocb.aad_nblocks;

#ifdef USE_AVX2
  if (ctx->use_avx2)
    {
      int did_use_avx2 = 0;
      u64 Ls[16];
      unsigned int n = 16 - (blkn % 16);
      u64 *l;
      int i;

      if (nblocks >= 16)
	{
	  for (i = 0; i < 16; i += 8)
	    {
	      /* Use u64 to store pointers for x32 support (assembly function
	       * assumes 64-bit pointers). */
	      Ls[(i + 0 + n) % 16] = (uintptr_t)(void *)c->u_mode.ocb.L[0];
	      Ls[(i + 1 + n) % 16] = (uintptr_t)(void *)c->u_mode.ocb.L[1];
	      Ls[(i + 2 + n) % 16] = (uintptr_t)(void *)c->u_mode.ocb.L[0];
	      Ls[(i + 3 + n) % 16] = (uintptr_t)(void *)c->u_mode.ocb.L[2];
	      Ls[(i + 4 + n) % 16] = (uintptr_t)(void *)c->u_mode.ocb.L[0];
	      Ls[(i + 5 + n) % 16] = (uintptr_t)(void *)c->u_mode.ocb.L[1];
	      Ls[(i + 6 + n) % 16] = (uintptr_t)(void *)c->u_mode.ocb.L[0];
	    }

	  Ls[(7 + n) % 16] = (uintptr_t)(void *)c->u_mode.ocb.L[3];
	  l = &Ls[(15 + n) % 16];

	  /* Process data in 16 block chunks. */
	  while (nblocks >= 16)
	    {
	      blkn += 16;
	      *l = (uintptr_t)(void *)ocb_get_l(c, blkn - blkn % 16);

	      _gcry_twofish_avx2_ocb_auth(ctx, abuf, c->u_mode.ocb.aad_offset,
					  c->u_mode.ocb.aad_sum, Ls);

	      nblocks -= 16;
	      abuf += 16 * TWOFISH_BLOCKSIZE;
	      did_use_avx2 = 1;
	    }
	}

      if (did_use_avx2)
	{
	  /* twofish-avx2 assembly code does not use stack */
	  if (nblocks == 0)
	    burn_stack_depth = 0;
	}

      /* Use generic code to handle smaller chunks... */
    }
#endif

  {
    /* Use u64 to store pointers for x32 support (assembly function
      * assumes 64-bit pointers). */
    u64 Ls[3];

    /* Process data in 3 block chunks. */
    while (nblocks >= 3)
      {
	Ls[0] = (uintptr_t)(const void *)ocb_get_l(c, blkn + 1);
	Ls[1] = (uintptr_t)(const void *)ocb_get_l(c, blkn + 2);
	Ls[2] = (uintptr_t)(const void *)ocb_get_l(c, blkn + 3);
	blkn += 3;

	twofish_amd64_ocb_auth(ctx, abuf, c->u_mode.ocb.aad_offset,
			      c->u_mode.ocb.aad_sum, Ls);

	nblocks -= 3;
	abuf += 3 * TWOFISH_BLOCKSIZE;

	burn = 8 * sizeof(void*);
	if (burn > burn_stack_depth)
	  burn_stack_depth = burn;
      }

    /* Use generic code to handle smaller chunks... */
  }

  c->u_mode.ocb.aad_nblocks = blkn;

  if (burn_stack_depth)
    _gcry_burn_stack (burn_stack_depth + 4 * sizeof(void *));
#else
  (void)c;
  (void)abuf_arg;
#endif

  return nblocks;
}



/* Run the self-tests for TWOFISH-CTR, tests IV increment of bulk CTR
   encryption.  Returns NULL on success. */
static const char *
selftest_ctr (void)
{
  const int nblocks = 16+1;
  const int blocksize = TWOFISH_BLOCKSIZE;
  const int context_size = sizeof(TWOFISH_context);

  return _gcry_selftest_helper_ctr("TWOFISH", &twofish_setkey,
           &twofish_encrypt, nblocks, blocksize, context_size);
}

/* Run the self-tests for TWOFISH-CBC, tests bulk CBC decryption.
   Returns NULL on success. */
static const char *
selftest_cbc (void)
{
  const int nblocks = 16+2;
  const int blocksize = TWOFISH_BLOCKSIZE;
  const int context_size = sizeof(TWOFISH_context);

  return _gcry_selftest_helper_cbc("TWOFISH", &twofish_setkey,
           &twofish_encrypt, nblocks, blocksize, context_size);
}

/* Run the self-tests for TWOFISH-CFB, tests bulk CBC decryption.
   Returns NULL on success. */
static const char *
selftest_cfb (void)
{
  const int nblocks = 16+2;
  const int blocksize = TWOFISH_BLOCKSIZE;
  const int context_size = sizeof(TWOFISH_context);

  return _gcry_selftest_helper_cfb("TWOFISH", &twofish_setkey,
           &twofish_encrypt, nblocks, blocksize, context_size);
}


/* Test a single encryption and decryption with each key size. */

static const char*
selftest (void)
{
  TWOFISH_context ctx; /* Expanded key. */
  byte scratch[16];    /* Encryption/decryption result buffer. */
  cipher_bulk_ops_t bulk_ops;
  const char *r;

  /* Test vectors for single encryption/decryption.  Note that I am using
   * the vectors from the Twofish paper's "known answer test", I=3 for
   * 128-bit and I=4 for 256-bit, instead of the all-0 vectors from the
   * "intermediate value test", because an all-0 key would trigger all the
   * special cases in the RS matrix multiply, leaving the math untested. */
  static  byte plaintext[16] = {
    0xD4, 0x91, 0xDB, 0x16, 0xE7, 0xB1, 0xC3, 0x9E,
    0x86, 0xCB, 0x08, 0x6B, 0x78, 0x9F, 0x54, 0x19
  };
  static byte key[16] = {
    0x9F, 0x58, 0x9F, 0x5C, 0xF6, 0x12, 0x2C, 0x32,
    0xB6, 0xBF, 0xEC, 0x2F, 0x2A, 0xE8, 0xC3, 0x5A
  };
  static const byte ciphertext[16] = {
    0x01, 0x9F, 0x98, 0x09, 0xDE, 0x17, 0x11, 0x85,
    0x8F, 0xAA, 0xC3, 0xA3, 0xBA, 0x20, 0xFB, 0xC3
  };
  static byte plaintext_256[16] = {
    0x90, 0xAF, 0xE9, 0x1B, 0xB2, 0x88, 0x54, 0x4F,
    0x2C, 0x32, 0xDC, 0x23, 0x9B, 0x26, 0x35, 0xE6
  };
  static byte key_256[32] = {
    0xD4, 0x3B, 0xB7, 0x55, 0x6E, 0xA3, 0x2E, 0x46,
    0xF2, 0xA2, 0x82, 0xB7, 0xD4, 0x5B, 0x4E, 0x0D,
    0x57, 0xFF, 0x73, 0x9D, 0x4D, 0xC9, 0x2C, 0x1B,
    0xD7, 0xFC, 0x01, 0x70, 0x0C, 0xC8, 0x21, 0x6F
  };
  static const byte ciphertext_256[16] = {
    0x6C, 0xB4, 0x56, 0x1C, 0x40, 0xBF, 0x0A, 0x97,
    0x05, 0x93, 0x1C, 0xB6, 0xD4, 0x08, 0xE7, 0xFA
  };

  twofish_setkey (&ctx, key, sizeof(key), &bulk_ops);
  twofish_encrypt (&ctx, scratch, plaintext);
  if (memcmp (scratch, ciphertext, sizeof (ciphertext)))
    return "Twofish-128 test encryption failed.";
  twofish_decrypt (&ctx, scratch, scratch);
  if (memcmp (scratch, plaintext, sizeof (plaintext)))
    return "Twofish-128 test decryption failed.";

  twofish_setkey (&ctx, key_256, sizeof(key_256), &bulk_ops);
  twofish_encrypt (&ctx, scratch, plaintext_256);
  if (memcmp (scratch, ciphertext_256, sizeof (ciphertext_256)))
    return "Twofish-256 test encryption failed.";
  twofish_decrypt (&ctx, scratch, scratch);
  if (memcmp (scratch, plaintext_256, sizeof (plaintext_256)))
    return "Twofish-256 test decryption failed.";

  if ((r = selftest_ctr()) != NULL)
    return r;
  if ((r = selftest_cbc()) != NULL)
    return r;
  if ((r = selftest_cfb()) != NULL)
    return r;

  return NULL;
}

/* More complete test program.	This does 1000 encryptions and decryptions
 * with each of 250 128-bit keys and 2000 encryptions and decryptions with
 * each of 125 256-bit keys, using a feedback scheme similar to a Feistel
 * cipher, so as to be sure of testing all the table entries pretty
 * thoroughly.	We keep changing the keys so as to get a more meaningful
 * performance number, since the key setup is non-trivial for Twofish. */

#ifdef TEST

#include <stdio.h>
#include <string.h>
#include <time.h>

int
main()
{
  TWOFISH_context ctx;     /* Expanded key. */
  int i, j;                /* Loop counters. */
  cipher_bulk_ops_t bulk_ops;

  const char *encrypt_msg; /* Message to print regarding encryption test;
                            * the printf is done outside the loop to avoid
                            * stuffing up the timing. */
  clock_t timer; /* For computing elapsed time. */

  /* Test buffer. */
  byte buffer[4][16] = {
    {0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77,
     0x88, 0x99, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF},
    {0x0F, 0x1E, 0x2D, 0x3C, 0x4B, 0x5A, 0x69, 0x78,
     0x87, 0x96, 0xA5, 0xB4, 0xC3, 0xD2 ,0xE1, 0xF0},
    {0x01, 0x23, 0x45, 0x67, 0x89, 0xAB, 0xCD, 0xEF,
     0xFE, 0xDC, 0xBA, 0x98, 0x76, 0x54 ,0x32, 0x10},
    {0x01, 0x23, 0x45, 0x67, 0x76, 0x54 ,0x32, 0x10,
     0x89, 0xAB, 0xCD, 0xEF, 0xFE, 0xDC, 0xBA, 0x98}
  };

  /* Expected outputs for the million-operation test */
  static const byte test_encrypt[4][16] = {
    {0xC8, 0x23, 0xB8, 0xB7, 0x6B, 0xFE, 0x91, 0x13,
     0x2F, 0xA7, 0x5E, 0xE6, 0x94, 0x77, 0x6F, 0x6B},
    {0x90, 0x36, 0xD8, 0x29, 0xD5, 0x96, 0xC2, 0x8E,
     0xE4, 0xFF, 0x76, 0xBC, 0xE5, 0x77, 0x88, 0x27},
    {0xB8, 0x78, 0x69, 0xAF, 0x42, 0x8B, 0x48, 0x64,
     0xF7, 0xE9, 0xF3, 0x9C, 0x42, 0x18, 0x7B, 0x73},
    {0x7A, 0x88, 0xFB, 0xEB, 0x90, 0xA4, 0xB4, 0xA8,
     0x43, 0xA3, 0x1D, 0xF1, 0x26, 0xC4, 0x53, 0x57}
  };
  static const byte test_decrypt[4][16] = {
    {0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77,
     0x88, 0x99, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF},
    {0x0F, 0x1E, 0x2D, 0x3C, 0x4B, 0x5A, 0x69, 0x78,
     0x87, 0x96, 0xA5, 0xB4, 0xC3, 0xD2 ,0xE1, 0xF0},
    {0x01, 0x23, 0x45, 0x67, 0x89, 0xAB, 0xCD, 0xEF,
     0xFE, 0xDC, 0xBA, 0x98, 0x76, 0x54 ,0x32, 0x10},
    {0x01, 0x23, 0x45, 0x67, 0x76, 0x54 ,0x32, 0x10,
     0x89, 0xAB, 0xCD, 0xEF, 0xFE, 0xDC, 0xBA, 0x98}
  };

  /* Start the timer ticking. */
  timer = clock ();

  /* Encryption test. */
  for (i = 0; i < 125; i++)
    {
      twofish_setkey (&ctx, buffer[0], sizeof (buffer[0]), &bulk_ops);
      for (j = 0; j < 1000; j++)
        twofish_encrypt (&ctx, buffer[2], buffer[2]);
      twofish_setkey (&ctx, buffer[1], sizeof (buffer[1]), &bulk_ops);
      for (j = 0; j < 1000; j++)
        twofish_encrypt (&ctx, buffer[3], buffer[3]);
      twofish_setkey (&ctx, buffer[2], sizeof (buffer[2])*2, &bulk_ops);
      for (j = 0; j < 1000; j++) {
        twofish_encrypt (&ctx, buffer[0], buffer[0]);
        twofish_encrypt (&ctx, buffer[1], buffer[1]);
      }
    }
  encrypt_msg = memcmp (buffer, test_encrypt, sizeof (test_encrypt)) ?
    "encryption failure!\n" : "encryption OK!\n";

  /* Decryption test. */
  for (i = 0; i < 125; i++)
    {
      twofish_setkey (&ctx, buffer[2], sizeof (buffer[2])*2, &bulk_ops);
      for (j = 0; j < 1000; j++) {
        twofish_decrypt (&ctx, buffer[0], buffer[0]);
        twofish_decrypt (&ctx, buffer[1], buffer[1]);
      }
      twofish_setkey (&ctx, buffer[1], sizeof (buffer[1]), &bulk_ops);
      for (j = 0; j < 1000; j++)
        twofish_decrypt (&ctx, buffer[3], buffer[3]);
      twofish_setkey (&ctx, buffer[0], sizeof (buffer[0]), &bulk_ops);
      for (j = 0; j < 1000; j++)
        twofish_decrypt (&ctx, buffer[2], buffer[2]);
    }

  /* Stop the timer, and print results. */
  timer = clock () - timer;
  printf (encrypt_msg);
  printf (memcmp (buffer, test_decrypt, sizeof (test_decrypt)) ?
          "decryption failure!\n" : "decryption OK!\n");
  printf ("elapsed time: %.1f s.\n", (float) timer / CLOCKS_PER_SEC);

  return 0;
}

#endif /* TEST */



gcry_cipher_spec_t _gcry_cipher_spec_twofish =
  {
    GCRY_CIPHER_TWOFISH, {0, 0},
    "TWOFISH", NULL, NULL, 16, 256, sizeof (TWOFISH_context),
    twofish_setkey, twofish_encrypt, twofish_decrypt
  };

gcry_cipher_spec_t _gcry_cipher_spec_twofish128 =
  {
    GCRY_CIPHER_TWOFISH128, {0, 0},
    "TWOFISH128", NULL, NULL, 16, 128, sizeof (TWOFISH_context),
    twofish_setkey, twofish_encrypt, twofish_decrypt
  };
