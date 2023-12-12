/*
 * Copyright © 2013 Intel Corporation
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice (including the next
 * paragraph) shall be included in all copies or substantial portions of the
 * Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

/**
 * \file builtin_type_macros.h
 *
 * This contains definitions for all GLSL built-in types, regardless of what
 * language version or extension might provide them.
 */

DECL_TYPE(error,  GL_INVALID_ENUM, GLSL_TYPE_ERROR, 0, 0)
DECL_TYPE(void,   GL_INVALID_ENUM, GLSL_TYPE_VOID,  0, 0)

#define DECL_VEC_TYPE(stype, vtype, btype, etype, ...)               \
   DECL_TYPE(stype,      etype ##__VA_ARGS__,         btype, 1, 1)   \
   DECL_TYPE(vtype ## 2, etype ##_VEC2 ##__VA_ARGS__, btype, 2, 1)   \
   DECL_TYPE(vtype ## 3, etype ##_VEC3 ##__VA_ARGS__, btype, 3, 1)   \
   DECL_TYPE(vtype ## 4, etype ##_VEC4 ##__VA_ARGS__, btype, 4, 1)   \
   DECL_TYPE(vtype ## 8,  0, btype, 8, 1)   \
   DECL_TYPE(vtype ## 16, 0, btype, 16, 1)

DECL_VEC_TYPE(bool,      bvec,   GLSL_TYPE_BOOL,    GL_BOOL)
DECL_VEC_TYPE(int,       ivec,   GLSL_TYPE_INT,     GL_INT)
DECL_VEC_TYPE(uint,      uvec,   GLSL_TYPE_UINT,    GL_UNSIGNED_INT)
DECL_VEC_TYPE(float,     vec,    GLSL_TYPE_FLOAT,   GL_FLOAT)
DECL_VEC_TYPE(float16_t, f16vec, GLSL_TYPE_FLOAT16, GL_FLOAT16, _NV)
DECL_VEC_TYPE(double,    dvec,   GLSL_TYPE_DOUBLE,  GL_DOUBLE)
DECL_VEC_TYPE(int64_t,   i64vec, GLSL_TYPE_INT64,   GL_INT64, _ARB)
DECL_VEC_TYPE(uint64_t,  u64vec, GLSL_TYPE_UINT64,  GL_UNSIGNED_INT64, _ARB)
DECL_VEC_TYPE(int16_t,   i16vec, GLSL_TYPE_INT16,   GL_INT16, _NV)
DECL_VEC_TYPE(uint16_t,  u16vec, GLSL_TYPE_UINT16,  GL_UNSIGNED_INT16, _NV)
DECL_VEC_TYPE(int8_t,    i8vec,  GLSL_TYPE_INT8,    GL_INT8, _NV)
DECL_VEC_TYPE(uint8_t,   u8vec,  GLSL_TYPE_UINT8,   GL_UNSIGNED_INT8, _NV)

DECL_TYPE(mat2,   GL_FLOAT_MAT2,   GLSL_TYPE_FLOAT, 2, 2)
DECL_TYPE(mat3,   GL_FLOAT_MAT3,   GLSL_TYPE_FLOAT, 3, 3)
DECL_TYPE(mat4,   GL_FLOAT_MAT4,   GLSL_TYPE_FLOAT, 4, 4)

DECL_TYPE(mat2x3, GL_FLOAT_MAT2x3, GLSL_TYPE_FLOAT, 3, 2)
DECL_TYPE(mat2x4, GL_FLOAT_MAT2x4, GLSL_TYPE_FLOAT, 4, 2)
DECL_TYPE(mat3x2, GL_FLOAT_MAT3x2, GLSL_TYPE_FLOAT, 2, 3)
DECL_TYPE(mat3x4, GL_FLOAT_MAT3x4, GLSL_TYPE_FLOAT, 4, 3)
DECL_TYPE(mat4x2, GL_FLOAT_MAT4x2, GLSL_TYPE_FLOAT, 2, 4)
DECL_TYPE(mat4x3, GL_FLOAT_MAT4x3, GLSL_TYPE_FLOAT, 3, 4)

DECL_TYPE(f16mat2,   GL_FLOAT16_MAT2_AMD,   GLSL_TYPE_FLOAT16, 2, 2)
DECL_TYPE(f16mat3,   GL_FLOAT16_MAT3_AMD,   GLSL_TYPE_FLOAT16, 3, 3)
DECL_TYPE(f16mat4,   GL_FLOAT16_MAT4_AMD,   GLSL_TYPE_FLOAT16, 4, 4)

DECL_TYPE(f16mat2x3, GL_FLOAT16_MAT2x3_AMD, GLSL_TYPE_FLOAT16, 3, 2)
DECL_TYPE(f16mat2x4, GL_FLOAT16_MAT2x4_AMD, GLSL_TYPE_FLOAT16, 4, 2)
DECL_TYPE(f16mat3x2, GL_FLOAT16_MAT3x2_AMD, GLSL_TYPE_FLOAT16, 2, 3)
DECL_TYPE(f16mat3x4, GL_FLOAT16_MAT3x4_AMD, GLSL_TYPE_FLOAT16, 4, 3)
DECL_TYPE(f16mat4x2, GL_FLOAT16_MAT4x2_AMD, GLSL_TYPE_FLOAT16, 2, 4)
DECL_TYPE(f16mat4x3, GL_FLOAT16_MAT4x3_AMD, GLSL_TYPE_FLOAT16, 3, 4)

DECL_TYPE(dmat2,   GL_DOUBLE_MAT2,   GLSL_TYPE_DOUBLE, 2, 2)
DECL_TYPE(dmat3,   GL_DOUBLE_MAT3,   GLSL_TYPE_DOUBLE, 3, 3)
DECL_TYPE(dmat4,   GL_DOUBLE_MAT4,   GLSL_TYPE_DOUBLE, 4, 4)

DECL_TYPE(dmat2x3, GL_DOUBLE_MAT2x3, GLSL_TYPE_DOUBLE, 3, 2)
DECL_TYPE(dmat2x4, GL_DOUBLE_MAT2x4, GLSL_TYPE_DOUBLE, 4, 2)
DECL_TYPE(dmat3x2, GL_DOUBLE_MAT3x2, GLSL_TYPE_DOUBLE, 2, 3)
DECL_TYPE(dmat3x4, GL_DOUBLE_MAT3x4, GLSL_TYPE_DOUBLE, 4, 3)
DECL_TYPE(dmat4x2, GL_DOUBLE_MAT4x2, GLSL_TYPE_DOUBLE, 2, 4)
DECL_TYPE(dmat4x3, GL_DOUBLE_MAT4x3, GLSL_TYPE_DOUBLE, 3, 4)

DECL_TYPE(sampler,           GL_SAMPLER_1D,                   GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_1D,   0, 0, GLSL_TYPE_VOID)
DECL_TYPE(sampler1D,         GL_SAMPLER_1D,                   GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_1D,   0, 0, GLSL_TYPE_FLOAT)
DECL_TYPE(sampler2D,         GL_SAMPLER_2D,                   GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_2D,   0, 0, GLSL_TYPE_FLOAT)
DECL_TYPE(sampler3D,         GL_SAMPLER_3D,                   GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_3D,   0, 0, GLSL_TYPE_FLOAT)
DECL_TYPE(samplerCube,       GL_SAMPLER_CUBE,                 GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_CUBE, 0, 0, GLSL_TYPE_FLOAT)
DECL_TYPE(sampler1DArray,    GL_SAMPLER_1D_ARRAY,             GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_1D,   0, 1, GLSL_TYPE_FLOAT)
DECL_TYPE(sampler2DArray,    GL_SAMPLER_2D_ARRAY,             GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_2D,   0, 1, GLSL_TYPE_FLOAT)
DECL_TYPE(samplerCubeArray,  GL_SAMPLER_CUBE_MAP_ARRAY,       GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_CUBE, 0, 1, GLSL_TYPE_FLOAT)
DECL_TYPE(sampler2DRect,     GL_SAMPLER_2D_RECT,              GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_RECT, 0, 0, GLSL_TYPE_FLOAT)
DECL_TYPE(samplerBuffer,     GL_SAMPLER_BUFFER,               GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_BUF,  0, 0, GLSL_TYPE_FLOAT)
DECL_TYPE(sampler2DMS,       GL_SAMPLER_2D_MULTISAMPLE,       GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_MS,   0, 0, GLSL_TYPE_FLOAT)
DECL_TYPE(sampler2DMSArray,  GL_SAMPLER_2D_MULTISAMPLE_ARRAY, GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_MS,   0, 1, GLSL_TYPE_FLOAT)

DECL_TYPE(isampler1D,        GL_INT_SAMPLER_1D,                   GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_1D,   0, 0, GLSL_TYPE_INT)
DECL_TYPE(isampler2D,        GL_INT_SAMPLER_2D,                   GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_2D,   0, 0, GLSL_TYPE_INT)
DECL_TYPE(isampler3D,        GL_INT_SAMPLER_3D,                   GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_3D,   0, 0, GLSL_TYPE_INT)
DECL_TYPE(isamplerCube,      GL_INT_SAMPLER_CUBE,                 GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_CUBE, 0, 0, GLSL_TYPE_INT)
DECL_TYPE(isampler1DArray,   GL_INT_SAMPLER_1D_ARRAY,             GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_1D,   0, 1, GLSL_TYPE_INT)
DECL_TYPE(isampler2DArray,   GL_INT_SAMPLER_2D_ARRAY,             GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_2D,   0, 1, GLSL_TYPE_INT)
DECL_TYPE(isamplerCubeArray, GL_INT_SAMPLER_CUBE_MAP_ARRAY,       GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_CUBE, 0, 1, GLSL_TYPE_INT)
DECL_TYPE(isampler2DRect,    GL_INT_SAMPLER_2D_RECT,              GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_RECT, 0, 0, GLSL_TYPE_INT)
DECL_TYPE(isamplerBuffer,    GL_INT_SAMPLER_BUFFER,               GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_BUF,  0, 0, GLSL_TYPE_INT)
DECL_TYPE(isampler2DMS,      GL_INT_SAMPLER_2D_MULTISAMPLE,       GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_MS,   0, 0, GLSL_TYPE_INT)
DECL_TYPE(isampler2DMSArray, GL_INT_SAMPLER_2D_MULTISAMPLE_ARRAY, GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_MS,   0, 1, GLSL_TYPE_INT)

DECL_TYPE(usampler1D,        GL_UNSIGNED_INT_SAMPLER_1D,                   GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_1D,   0, 0, GLSL_TYPE_UINT)
DECL_TYPE(usampler2D,        GL_UNSIGNED_INT_SAMPLER_2D,                   GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_2D,   0, 0, GLSL_TYPE_UINT)
DECL_TYPE(usampler3D,        GL_UNSIGNED_INT_SAMPLER_3D,                   GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_3D,   0, 0, GLSL_TYPE_UINT)
DECL_TYPE(usamplerCube,      GL_UNSIGNED_INT_SAMPLER_CUBE,                 GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_CUBE, 0, 0, GLSL_TYPE_UINT)
DECL_TYPE(usampler1DArray,   GL_UNSIGNED_INT_SAMPLER_1D_ARRAY,             GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_1D,   0, 1, GLSL_TYPE_UINT)
DECL_TYPE(usampler2DArray,   GL_UNSIGNED_INT_SAMPLER_2D_ARRAY,             GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_2D,   0, 1, GLSL_TYPE_UINT)
DECL_TYPE(usamplerCubeArray, GL_UNSIGNED_INT_SAMPLER_CUBE_MAP_ARRAY,       GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_CUBE, 0, 1, GLSL_TYPE_UINT)
DECL_TYPE(usampler2DRect,    GL_UNSIGNED_INT_SAMPLER_2D_RECT,              GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_RECT, 0, 0, GLSL_TYPE_UINT)
DECL_TYPE(usamplerBuffer,    GL_UNSIGNED_INT_SAMPLER_BUFFER,               GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_BUF,  0, 0, GLSL_TYPE_UINT)
DECL_TYPE(usampler2DMS,      GL_UNSIGNED_INT_SAMPLER_2D_MULTISAMPLE,       GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_MS,   0, 0, GLSL_TYPE_UINT)
DECL_TYPE(usampler2DMSArray, GL_UNSIGNED_INT_SAMPLER_2D_MULTISAMPLE_ARRAY, GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_MS,   0, 1, GLSL_TYPE_UINT)

DECL_TYPE(sampler1DShadow,        GL_SAMPLER_1D_SHADOW,             GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_1D,       1, 0, GLSL_TYPE_FLOAT)
DECL_TYPE(sampler2DShadow,        GL_SAMPLER_2D_SHADOW,             GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_2D,       1, 0, GLSL_TYPE_FLOAT)
DECL_TYPE(samplerCubeShadow,      GL_SAMPLER_CUBE_SHADOW,           GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_CUBE,     1, 0, GLSL_TYPE_FLOAT)
DECL_TYPE(sampler1DArrayShadow,   GL_SAMPLER_1D_ARRAY_SHADOW,       GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_1D,       1, 1, GLSL_TYPE_FLOAT)
DECL_TYPE(sampler2DArrayShadow,   GL_SAMPLER_2D_ARRAY_SHADOW,       GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_2D,       1, 1, GLSL_TYPE_FLOAT)
DECL_TYPE(samplerCubeArrayShadow, GL_SAMPLER_CUBE_MAP_ARRAY_SHADOW, GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_CUBE,     1, 1, GLSL_TYPE_FLOAT)
DECL_TYPE(sampler2DRectShadow,    GL_SAMPLER_2D_RECT_SHADOW,        GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_RECT,     1, 0, GLSL_TYPE_FLOAT)

DECL_TYPE(samplerExternalOES,     GL_SAMPLER_EXTERNAL_OES,          GLSL_TYPE_SAMPLER, GLSL_SAMPLER_DIM_EXTERNAL, 0, 0, GLSL_TYPE_FLOAT)

DECL_TYPE(image1D,         GL_IMAGE_1D,                                GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_1D,     0, 0, GLSL_TYPE_FLOAT)
DECL_TYPE(image2D,         GL_IMAGE_2D,                                GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_2D,     0, 0, GLSL_TYPE_FLOAT)
DECL_TYPE(image3D,         GL_IMAGE_3D,                                GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_3D,     0, 0, GLSL_TYPE_FLOAT)
DECL_TYPE(image2DRect,     GL_IMAGE_2D_RECT,                           GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_RECT,   0, 0, GLSL_TYPE_FLOAT)
DECL_TYPE(imageCube,       GL_IMAGE_CUBE,                              GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_CUBE,   0, 0, GLSL_TYPE_FLOAT)
DECL_TYPE(imageBuffer,     GL_IMAGE_BUFFER,                            GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_BUF,    0, 0, GLSL_TYPE_FLOAT)
DECL_TYPE(image1DArray,    GL_IMAGE_1D_ARRAY,                          GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_1D,     0, 1, GLSL_TYPE_FLOAT)
DECL_TYPE(image2DArray,    GL_IMAGE_2D_ARRAY,                          GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_2D,     0, 1, GLSL_TYPE_FLOAT)
DECL_TYPE(imageCubeArray,  GL_IMAGE_CUBE_MAP_ARRAY,                    GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_CUBE,   0, 1, GLSL_TYPE_FLOAT)
DECL_TYPE(image2DMS,       GL_IMAGE_2D_MULTISAMPLE,                    GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_MS,     0, 0, GLSL_TYPE_FLOAT)
DECL_TYPE(image2DMSArray,  GL_IMAGE_2D_MULTISAMPLE_ARRAY,              GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_MS,     0, 1, GLSL_TYPE_FLOAT)
DECL_TYPE(iimage1D,        GL_INT_IMAGE_1D,                            GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_1D,     0, 0, GLSL_TYPE_INT)
DECL_TYPE(iimage2D,        GL_INT_IMAGE_2D,                            GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_2D,     0, 0, GLSL_TYPE_INT)
DECL_TYPE(iimage3D,        GL_INT_IMAGE_3D,                            GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_3D,     0, 0, GLSL_TYPE_INT)
DECL_TYPE(iimage2DRect,    GL_INT_IMAGE_2D_RECT,                       GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_RECT,   0, 0, GLSL_TYPE_INT)
DECL_TYPE(iimageCube,      GL_INT_IMAGE_CUBE,                          GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_CUBE,   0, 0, GLSL_TYPE_INT)
DECL_TYPE(iimageBuffer,    GL_INT_IMAGE_BUFFER,                        GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_BUF,    0, 0, GLSL_TYPE_INT)
DECL_TYPE(iimage1DArray,   GL_INT_IMAGE_1D_ARRAY,                      GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_1D,     0, 1, GLSL_TYPE_INT)
DECL_TYPE(iimage2DArray,   GL_INT_IMAGE_2D_ARRAY,                      GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_2D,     0, 1, GLSL_TYPE_INT)
DECL_TYPE(iimageCubeArray, GL_INT_IMAGE_CUBE_MAP_ARRAY,                GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_CUBE,   0, 1, GLSL_TYPE_INT)
DECL_TYPE(iimage2DMS,      GL_INT_IMAGE_2D_MULTISAMPLE,                GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_MS,     0, 0, GLSL_TYPE_INT)
DECL_TYPE(iimage2DMSArray, GL_INT_IMAGE_2D_MULTISAMPLE_ARRAY,          GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_MS,     0, 1, GLSL_TYPE_INT)
DECL_TYPE(uimage1D,        GL_UNSIGNED_INT_IMAGE_1D,                   GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_1D,     0, 0, GLSL_TYPE_UINT)
DECL_TYPE(uimage2D,        GL_UNSIGNED_INT_IMAGE_2D,                   GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_2D,     0, 0, GLSL_TYPE_UINT)
DECL_TYPE(uimage3D,        GL_UNSIGNED_INT_IMAGE_3D,                   GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_3D,     0, 0, GLSL_TYPE_UINT)
DECL_TYPE(uimage2DRect,    GL_UNSIGNED_INT_IMAGE_2D_RECT,              GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_RECT,   0, 0, GLSL_TYPE_UINT)
DECL_TYPE(uimageCube,      GL_UNSIGNED_INT_IMAGE_CUBE,                 GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_CUBE,   0, 0, GLSL_TYPE_UINT)
DECL_TYPE(uimageBuffer,    GL_UNSIGNED_INT_IMAGE_BUFFER,               GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_BUF,    0, 0, GLSL_TYPE_UINT)
DECL_TYPE(uimage1DArray,   GL_UNSIGNED_INT_IMAGE_1D_ARRAY,             GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_1D,     0, 1, GLSL_TYPE_UINT)
DECL_TYPE(uimage2DArray,   GL_UNSIGNED_INT_IMAGE_2D_ARRAY,             GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_2D,     0, 1, GLSL_TYPE_UINT)
DECL_TYPE(uimageCubeArray, GL_UNSIGNED_INT_IMAGE_CUBE_MAP_ARRAY,       GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_CUBE,   0, 1, GLSL_TYPE_UINT)
DECL_TYPE(uimage2DMS,      GL_UNSIGNED_INT_IMAGE_2D_MULTISAMPLE,       GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_MS,     0, 0, GLSL_TYPE_UINT)
DECL_TYPE(uimage2DMSArray, GL_UNSIGNED_INT_IMAGE_2D_MULTISAMPLE_ARRAY, GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_MS,     0, 1, GLSL_TYPE_UINT)

DECL_TYPE(subpassInput,    0,                                          GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_SUBPASS,    0, 0, GLSL_TYPE_FLOAT)
DECL_TYPE(subpassInputMS,  0,                                          GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_SUBPASS_MS, 0, 0, GLSL_TYPE_FLOAT)
DECL_TYPE(isubpassInput,   0,                                          GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_SUBPASS,    0, 0, GLSL_TYPE_INT)
DECL_TYPE(isubpassInputMS, 0,                                          GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_SUBPASS_MS, 0, 0, GLSL_TYPE_INT)
DECL_TYPE(usubpassInput,   0,                                          GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_SUBPASS,    0, 0, GLSL_TYPE_UINT)
DECL_TYPE(usubpassInputMS, 0,                                          GLSL_TYPE_IMAGE, GLSL_SAMPLER_DIM_SUBPASS_MS, 0, 0, GLSL_TYPE_UINT)

DECL_TYPE(atomic_uint, GL_UNSIGNED_INT_ATOMIC_COUNTER, GLSL_TYPE_ATOMIC_UINT, 1, 1)

STRUCT_TYPE(gl_DepthRangeParameters)
STRUCT_TYPE(gl_PointParameters)
STRUCT_TYPE(gl_MaterialParameters)
STRUCT_TYPE(gl_LightSourceParameters)
STRUCT_TYPE(gl_LightModelParameters)
STRUCT_TYPE(gl_LightModelProducts)
STRUCT_TYPE(gl_LightProducts)
STRUCT_TYPE(gl_FogParameters)
