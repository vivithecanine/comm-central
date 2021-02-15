/*
 * Copyright (c) 2020, [Ribose Inc](https://www.ribose.com).
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *
 * 1.  Redistributions of source code must retain the above copyright notice,
 *     this list of conditions and the following disclaimer.
 *
 * 2.  Redistributions in binary form must reproduce the above copyright notice,
 *     this list of conditions and the following disclaimer in the documentation
 *     and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

#include <rnp/rnp.h>
#include "string.h"

#ifdef RNP_RUN_TESTS
int verify_detached_LLVMFuzzerTestOneInput(const uint8_t *data, size_t size);
int
verify_detached_LLVMFuzzerTestOneInput(const uint8_t *data, size_t size)
#else
int
LLVMFuzzerTestOneInput(const uint8_t *data, size_t size)
#endif
{
    rnp_ffi_t    ffi = NULL;
    rnp_input_t  input = NULL;
    rnp_input_t  msg_input = NULL;
    rnp_result_t ret;

    ret = rnp_ffi_create(&ffi, "GPG", "GPG");
    ret = rnp_input_from_memory(&input, data, size, false);
    const char *msg = "message";
    ret = rnp_input_from_memory(&msg_input, (const uint8_t *) msg, strlen(msg), true);

    rnp_op_verify_t verify = NULL;
    ret = rnp_op_verify_detached_create(&verify, ffi, msg_input, input);
    ret = rnp_op_verify_execute(verify);
    ret = rnp_op_verify_destroy(verify);

    rnp_input_destroy(input);
    rnp_input_destroy(msg_input);
    rnp_ffi_destroy(ffi);

    return 0;
}
