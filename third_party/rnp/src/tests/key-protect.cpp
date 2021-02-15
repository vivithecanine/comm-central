/*
 * Copyright (c) 2017-2019 [Ribose Inc](https://www.ribose.com).
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

#include "../librekey/key_store_pgp.h"
#include "pgp-key.h"

#include "rnp_tests.h"
#include "support.h"
#include "crypto/hash.h"

/* This test loads a .gpg keyring and tests protect/unprotect functionality.
 * There is also some lock/unlock testing in here, since the two are
 * somewhat related.
 */
TEST_F(rnp_tests, test_key_protect_load_pgp)
{
    pgp_key_t *        key = NULL;
    static const char *keyids[] = {"7bc6709b15c23a4a", // primary
                                   "1ed63ee56fadc34d",
                                   "1d7e8a5393c997a8",
                                   "8a05b89fad5aded1",
                                   "2fcadf05ffa501bb", // primary
                                   "54505a936a4a970e",
                                   "326ef111425d14a5"};

    // load our keyring and do some quick checks
    {
        pgp_source_t     src = {};
        rnp_key_store_t *ks = new rnp_key_store_t();

        assert_rnp_success(init_file_src(&src, "data/keyrings/1/secring.gpg"));
        assert_rnp_success(rnp_key_store_pgp_read_from_src(ks, &src));
        src_close(&src);

        for (size_t i = 0; i < ARRAY_SIZE(keyids); i++) {
            pgp_key_t * key = NULL;
            const char *keyid = keyids[i];
            assert_non_null(key = rnp_tests_get_key_by_id(ks, keyid, NULL));
            assert_non_null(key);
            // all keys in this keyring are encrypted and thus should be both protected and
            // locked initially
            assert_true(key->is_protected());
            assert_true(key->is_locked());
        }

        pgp_key_t *tmp = NULL;
        assert_non_null(tmp = rnp_tests_get_key_by_id(ks, keyids[0], NULL));

        // steal this key from the store
        key = new pgp_key_t(*tmp);
        assert_non_null(key);
        delete ks;
    }

    // confirm that this key is indeed RSA
    assert_int_equal(key->alg(), PGP_PKA_RSA);

    // confirm key material is currently all NULL (in other words, the key is locked)
    assert_true(mpi_empty(key->material().rsa.d));
    assert_true(mpi_empty(key->material().rsa.p));
    assert_true(mpi_empty(key->material().rsa.q));
    assert_true(mpi_empty(key->material().rsa.u));

    // try to unprotect with a failing password provider
    pgp_password_provider_t pprov = {.callback = failing_password_callback, .userdata = NULL};
    assert_false(key->unprotect(pprov));

    // try to unprotect with an incorrect password
    pprov = {.callback = string_copy_password_callback, .userdata = (void *) "badpass"};
    assert_false(key->unprotect(pprov));

    // unprotect with the correct password
    pprov = {.callback = string_copy_password_callback, .userdata = (void *) "password"};
    assert_true(key->unprotect(pprov));
    assert_false(key->is_protected());

    // should still be locked
    assert_true(key->is_locked());

    // confirm secret key material is still NULL
    assert_true(mpi_empty(key->material().rsa.d));
    assert_true(mpi_empty(key->material().rsa.p));
    assert_true(mpi_empty(key->material().rsa.q));
    assert_true(mpi_empty(key->material().rsa.u));

    // unlock (no password required since the key is not protected)
    pprov = {.callback = asserting_password_callback, .userdata = NULL};
    assert_true(key->unlock(pprov));
    assert_false(key->is_locked());

    // secret key material should be available
    assert_false(mpi_empty(key->material().rsa.d));
    assert_false(mpi_empty(key->material().rsa.p));
    assert_false(mpi_empty(key->material().rsa.q));
    assert_false(mpi_empty(key->material().rsa.u));

    // save the secret MPIs for some later comparisons
    pgp_mpi_t d = key->material().rsa.d;
    pgp_mpi_t p = key->material().rsa.p;
    pgp_mpi_t q = key->material().rsa.q;
    pgp_mpi_t u = key->material().rsa.u;

    // confirm that packets[0] is no longer encrypted
    {
        pgp_source_t     memsrc = {};
        rnp_key_store_t *ks = new rnp_key_store_t();
        pgp_rawpacket_t &pkt = key->rawpkt();

        assert_rnp_success(init_mem_src(&memsrc, pkt.raw.data(), pkt.raw.size(), false));
        assert_rnp_success(rnp_key_store_pgp_read_from_src(ks, &memsrc));
        src_close(&memsrc);

        // grab the first key
        pgp_key_t *reloaded_key = NULL;
        assert_non_null(reloaded_key = rnp_tests_get_key_by_id(ks, keyids[0], NULL));
        assert_non_null(reloaded_key);

        // should not be locked, nor protected
        assert_false(reloaded_key->is_locked());
        assert_false(reloaded_key->is_protected());
        // secret key material should not be NULL
        assert_false(mpi_empty(reloaded_key->material().rsa.d));
        assert_false(mpi_empty(reloaded_key->material().rsa.p));
        assert_false(mpi_empty(reloaded_key->material().rsa.q));
        assert_false(mpi_empty(reloaded_key->material().rsa.u));

        // compare MPIs of the reloaded key, with the unlocked key from earlier
        assert_true(mpi_equal(&key->material().rsa.d, &reloaded_key->material().rsa.d));
        assert_true(mpi_equal(&key->material().rsa.p, &reloaded_key->material().rsa.p));
        assert_true(mpi_equal(&key->material().rsa.q, &reloaded_key->material().rsa.q));
        assert_true(mpi_equal(&key->material().rsa.u, &reloaded_key->material().rsa.u));
        // negative test to try to ensure the above is a valid test
        assert_false(mpi_equal(&key->material().rsa.d, &reloaded_key->material().rsa.p));

        // lock it
        assert_true(reloaded_key->lock());
        assert_true(reloaded_key->is_locked());
        // confirm that secret MPIs are NULL again
        assert_true(mpi_empty(reloaded_key->material().rsa.d));
        assert_true(mpi_empty(reloaded_key->material().rsa.p));
        assert_true(mpi_empty(reloaded_key->material().rsa.q));
        assert_true(mpi_empty(reloaded_key->material().rsa.u));
        // unlock it (no password, since it's not protected)
        pgp_password_provider_t pprov = {.callback = asserting_password_callback,
                                         .userdata = NULL};
        assert_true(reloaded_key->unlock(pprov));
        assert_false(reloaded_key->is_locked());
        // compare MPIs of the reloaded key, with the unlocked key from earlier
        assert_true(mpi_equal(&key->material().rsa.d, &reloaded_key->material().rsa.d));
        assert_true(mpi_equal(&key->material().rsa.p, &reloaded_key->material().rsa.p));
        assert_true(mpi_equal(&key->material().rsa.q, &reloaded_key->material().rsa.q));
        assert_true(mpi_equal(&key->material().rsa.u, &reloaded_key->material().rsa.u));

        delete ks;
    }

    // lock
    assert_true(key->lock());

    // try to protect (will fail when key is locked)
    pprov = {.callback = string_copy_password_callback, .userdata = (void *) "newpass"};
    assert_false(key->add_protection(key->format, {}, pprov));
    assert_false(key->is_protected());

    // unlock
    pprov = {.callback = asserting_password_callback, .userdata = NULL};
    assert_true(key->unlock(pprov));
    assert_false(key->is_locked());

    // try to protect with a failing password provider
    pprov = {.callback = failing_password_callback, .userdata = NULL};
    assert_false(key->add_protection(key->format, {}, pprov));
    assert_false(key->is_protected());

    // (re)protect with a new password
    pprov = {.callback = string_copy_password_callback, .userdata = (void *) "newpass"};
    assert_true(key->add_protection(key->format, {}, pprov));
    assert_true(key->is_protected());

    // lock
    assert_true(key->lock());
    assert_true(key->is_locked());

    // try to unlock with old password
    pprov = {.callback = string_copy_password_callback, .userdata = (void *) "password"};
    assert_false(key->unlock(pprov));
    assert_true(key->is_locked());

    // unlock with new password
    pprov = {.callback = string_copy_password_callback, .userdata = (void *) "newpass"};
    assert_true(key->unlock(pprov));
    assert_false(key->is_locked());

    // compare secret MPIs with those from earlier
    assert_true(mpi_equal(&key->material().rsa.d, &d));
    assert_true(mpi_equal(&key->material().rsa.p, &p));
    assert_true(mpi_equal(&key->material().rsa.q, &q));
    assert_true(mpi_equal(&key->material().rsa.u, &u));

    // cleanup
    delete key;
}
