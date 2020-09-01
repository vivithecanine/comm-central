/*
 * Copyright (c) 2018, [Ribose Inc](https://www.ribose.com).
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

#include "rnp_tests.h"
#include "support.h"
#include "rnp.h"
#include "crypto/hash.h"
#include "crypto/signatures.h"
#include "pgp-key.h"
#include <time.h>
#include "rnp.h"
#include <librepgp/stream-ctx.h>
#include <librepgp/stream-packet.h>
#include <librepgp/stream-sig.h>
#include <librepgp/stream-key.h>
#include <librepgp/stream-dump.h>
#include <librepgp/stream-armor.h>
#include <librepgp/stream-write.h>

static bool
stream_hash_file(pgp_hash_t *hash, const char *path)
{
    uint8_t      readbuf[1024];
    pgp_source_t src;
    bool         res = false;

    if (init_file_src(&src, path)) {
        return false;
    }

    do {
        size_t read = 0;
        if (!src_read(&src, readbuf, sizeof(readbuf), &read)) {
            goto finish;
        } else if (read == 0) {
            break;
        }

        if (pgp_hash_add(hash, readbuf, read)) {
            goto finish;
        }
    } while (1);

    res = true;
finish:
    src_close(&src);
    return res;
}

TEST_F(rnp_tests, test_stream_memory)
{
    const char *data = "Sample data to test memory streams";
    size_t      datalen;
    pgp_dest_t  memdst;
    void *      mown;
    void *      mcpy;

    datalen = strlen(data) + 1;

    /* populate memory dst and own inner data */
    assert_rnp_success(init_mem_dest(&memdst, NULL, 0));
    assert_rnp_success(memdst.werr);
    dst_write(&memdst, data, datalen);
    assert_rnp_success(memdst.werr);
    assert_int_equal(memdst.writeb, datalen);

    assert_non_null(mcpy = mem_dest_get_memory(&memdst));
    assert_false(memcmp(mcpy, data, datalen));
    assert_non_null(mown = mem_dest_own_memory(&memdst));
    assert_false(memcmp(mown, data, datalen));
    dst_close(&memdst, true);
    /* make sure we own data after close */
    assert_false(memcmp(mown, data, datalen));
    free(mown);
}

TEST_F(rnp_tests, test_stream_memory_discard)
{
    pgp_dest_t   memdst = {};
    char         mem[32];
    const char * hexes = "123456789ABCDEF";
    const size_t hexes_len = 15;

    /* init mem dst and write some data */
    assert_rnp_success(init_mem_dest(&memdst, mem, sizeof(mem)));
    dst_write(&memdst, "Hello", 5);
    assert_int_equal(memdst.writeb, 5);
    dst_write(&memdst, ", ", 2);
    assert_int_equal(memdst.writeb, 7);
    dst_write(&memdst, "world!\n", 7);
    assert_int_equal(memdst.writeb, 14);
    /* Now discard overflowing data and attempt to overflow it */
    mem_dest_discard_overflow(&memdst, true);
    dst_write(&memdst, "Hello, world!\n", 14);
    assert_int_equal(memdst.writeb, 28);
    assert_int_equal(memdst.werr, RNP_SUCCESS);
    dst_write(&memdst, hexes, hexes_len);
    /* While extra data is discarded, writeb is still incremented by hexes_len */
    assert_int_equal(memdst.writeb, 43);
    assert_int_equal(memdst.werr, RNP_SUCCESS);
    assert_int_equal(memcmp(mem, "Hello, world!\nHello, world!\n1234", 32), 0);
    dst_write(&memdst, hexes, hexes_len);
    assert_int_equal(memdst.writeb, 58);
    assert_int_equal(memdst.werr, RNP_SUCCESS);
    assert_int_equal(memcmp(mem, "Hello, world!\nHello, world!\n1234", 32), 0);
    /* Now make sure that error is generated */
    mem_dest_discard_overflow(&memdst, false);
    dst_write(&memdst, hexes, hexes_len);
    assert_int_equal(memdst.writeb, 58);
    assert_int_not_equal(memdst.werr, RNP_SUCCESS);

    dst_close(&memdst, true);
    assert_int_equal(memcmp(mem, "Hello, world!\nHello, world!\n1234", 32), 0);

    /* Now do tests with dynamic memory allocation */
    const size_t bytes = 12345;
    assert_rnp_success(init_mem_dest(&memdst, NULL, bytes));
    for (size_t i = 0; i < bytes / hexes_len; i++) {
        dst_write(&memdst, hexes, hexes_len);
        assert_int_equal(memdst.writeb, (i + 1) * hexes_len);
        assert_int_equal(memdst.werr, RNP_SUCCESS);
    }

    mem_dest_discard_overflow(&memdst, true);
    dst_write(&memdst, hexes, hexes_len);
    assert_int_equal(memdst.writeb, bytes - bytes % hexes_len + hexes_len);
    assert_int_equal(memdst.werr, RNP_SUCCESS);
    mem_dest_discard_overflow(&memdst, false);
    dst_write(&memdst, hexes, hexes_len);
    assert_int_equal(memdst.writeb, bytes - bytes % hexes_len + hexes_len);
    assert_int_not_equal(memdst.werr, RNP_SUCCESS);
    dst_write(&memdst, hexes, hexes_len);
    assert_int_equal(memdst.writeb, bytes - bytes % hexes_len + hexes_len);
    assert_int_not_equal(memdst.werr, RNP_SUCCESS);
    dst_close(&memdst, true);
}

static void
copy_tmp_path(char *buf, size_t buflen, pgp_dest_t *dst)
{
    typedef struct pgp_dest_file_param_t {
        int  fd;
        int  errcode;
        bool overwrite;
        char path[PATH_MAX];
    } pgp_dest_file_param_t;

    pgp_dest_file_param_t *param = (pgp_dest_file_param_t *) dst->param;
    strncpy(buf, param->path, buflen);
}

TEST_F(rnp_tests, test_stream_file)
{
    const char * filename = "dummyfile.dat";
    const char * dirname = "dummydir";
    const char * file2name = "dummydir/dummyfile.dat";
    const char * filedata = "dummy message to be stored in the file";
    const int    iterations = 10000;
    const int    filedatalen = strlen(filedata);
    char         tmpname[PATH_MAX] = {0};
    uint8_t      tmpbuf[1024] = {0};
    pgp_dest_t   dst = {};
    pgp_source_t src = {};

    /* try to read non-existing file */
    assert_rnp_failure(init_file_src(&src, filename));
    assert_rnp_failure(init_file_src(&src, dirname));
    /* create dir */
    assert_int_equal(RNP_MKDIR(dirname, S_IRWXU), 0);
    /* attempt to read or create file in place of directory */
    assert_rnp_failure(init_file_src(&src, dirname));
    assert_rnp_failure(init_file_dest(&dst, dirname, false));
    /* with overwrite flag it must succeed, then delete it */
    assert_rnp_success(init_file_dest(&dst, dirname, true));
    assert_int_equal(file_size(dirname), 0);
    dst_close(&dst, true);
    /* create dir back */
    assert_int_equal(RNP_MKDIR(dirname, S_IRWXU), 0);

    /* write some data to the file and the discard it */
    assert_rnp_success(init_file_dest(&dst, filename, false));
    dst_write(&dst, filedata, filedatalen);
    assert_int_not_equal(file_size(filename), -1);
    dst_close(&dst, true);
    assert_int_equal(file_size(filename), -1);

    /* write some data to the file and make sure it is written */
    assert_rnp_success(init_file_dest(&dst, filename, false));
    dst_write(&dst, filedata, filedatalen);
    assert_int_not_equal(file_size(filename), -1);
    dst_close(&dst, false);
    assert_int_equal(file_size(filename), filedatalen);

    /* attempt to create file over existing without overwrite flag */
    assert_rnp_failure(init_file_dest(&dst, filename, false));
    assert_int_equal(file_size(filename), filedatalen);

    /* overwrite file - it should be truncated, then write bunch of bytes */
    assert_rnp_success(init_file_dest(&dst, filename, true));
    assert_int_equal(file_size(filename), 0);
    for (int i = 0; i < iterations; i++) {
        dst_write(&dst, filedata, filedatalen);
    }
    /* and some smaller writes */
    for (int i = 0; i < 5 * iterations; i++) {
        dst_write(&dst, "zzz", 3);
    }
    dst_close(&dst, false);
    assert_int_equal(file_size(filename), iterations * (filedatalen + 15));

    /* read file back, checking the contents */
    assert_rnp_success(init_file_src(&src, filename));
    for (int i = 0; i < iterations; i++) {
        size_t read = 0;
        assert_true(src_read(&src, tmpbuf, filedatalen, &read));
        assert_int_equal(read, filedatalen);
        assert_int_equal(memcmp(tmpbuf, filedata, filedatalen), 0);
    }
    for (int i = 0; i < 5 * iterations; i++) {
        size_t read = 0;
        assert_true(src_read(&src, tmpbuf, 3, &read));
        assert_int_equal(read, 3);
        assert_int_equal(memcmp(tmpbuf, "zzz", 3), 0);
    }
    src_close(&src);

    /* overwrite and discard - file should be deleted */
    assert_rnp_success(init_file_dest(&dst, filename, true));
    assert_int_equal(file_size(filename), 0);
    for (int i = 0; i < iterations; i++) {
        dst_write(&dst, "hello", 6);
    }
    dst_close(&dst, true);
    assert_int_equal(file_size(filename), -1);

    /* create and populate file in subfolder */
    assert_rnp_success(init_file_dest(&dst, file2name, true));
    assert_int_equal(file_size(file2name), 0);
    for (int i = 0; i < iterations; i++) {
        dst_write(&dst, filedata, filedatalen);
    }
    dst_close(&dst, false);
    assert_int_equal(file_size(file2name), filedatalen * iterations);
    assert_int_equal(unlink(file2name), 0);

    /* create and populate file stream, using tmp name before closing */
    assert_rnp_success(init_tmpfile_dest(&dst, filename, false));
    copy_tmp_path(tmpname, sizeof(tmpname), &dst);
    assert_int_equal(file_size(tmpname), 0);
    assert_int_equal(file_size(filename), -1);
    for (int i = 0; i < iterations; i++) {
        dst_write(&dst, filedata, filedatalen);
    }
    dst_close(&dst, false);
    assert_int_equal(file_size(tmpname), -1);
    assert_int_equal(file_size(filename), filedatalen * iterations);

    /* create and then discard file stream, using tmp name before closing */
    assert_rnp_success(init_tmpfile_dest(&dst, filename, true));
    copy_tmp_path(tmpname, sizeof(tmpname), &dst);
    assert_int_equal(file_size(tmpname), 0);
    dst_write(&dst, filedata, filedatalen);
    /* make sure file was not overwritten */
    assert_int_equal(file_size(filename), filedatalen * iterations);
    dst_close(&dst, true);
    assert_int_equal(file_size(tmpname), -1);
    assert_int_equal(file_size(filename), filedatalen * iterations);

    /* create and then close file stream, using tmp name before closing. No overwrite. */
    assert_rnp_success(init_tmpfile_dest(&dst, filename, false));
    copy_tmp_path(tmpname, sizeof(tmpname), &dst);
    assert_int_equal(file_size(tmpname), 0);
    dst_write(&dst, filedata, filedatalen);
    /* make sure file was not overwritten */
    assert_int_equal(file_size(filename), filedatalen * iterations);
    assert_rnp_failure(dst_finish(&dst));
    dst_close(&dst, false);
    assert_int_equal(file_size(tmpname), filedatalen);
    assert_int_equal(file_size(filename), filedatalen * iterations);
    assert_int_equal(unlink(tmpname), 0);

    /* create and then close file stream, using tmp name before closing. Overwrite existing. */
    assert_rnp_success(init_tmpfile_dest(&dst, filename, true));
    copy_tmp_path(tmpname, sizeof(tmpname), &dst);
    assert_int_equal(file_size(tmpname), 0);
    dst_write(&dst, filedata, filedatalen);
    /* make sure file was not overwritten yet */
    assert_int_equal(file_size(filename), filedatalen * iterations);
    assert_rnp_success(dst_finish(&dst));
    dst_close(&dst, false);
    assert_int_equal(file_size(tmpname), -1);
    assert_int_equal(file_size(filename), filedatalen);

    /* make sure we can overwrite directory */
    assert_rnp_success(init_tmpfile_dest(&dst, dirname, true));
    copy_tmp_path(tmpname, sizeof(tmpname), &dst);
    assert_int_equal(file_size(tmpname), 0);
    dst_write(&dst, filedata, filedatalen);
    /* make sure file was not overwritten yet */
    assert_int_equal(file_size(dirname), -1);
    assert_rnp_success(dst_finish(&dst));
    dst_close(&dst, false);
    assert_int_equal(file_size(tmpname), -1);
    assert_int_equal(file_size(dirname), filedatalen);

    /* cleanup */
    assert_int_equal(unlink(dirname), 0);
}

TEST_F(rnp_tests, test_stream_signatures)
{
    rnp_key_store_t * pubring;
    rnp_key_store_t * secring;
    pgp_signature_t   sig;
    pgp_hash_t        hash_orig;
    pgp_hash_t        hash_forged;
    pgp_hash_t        hash;
    pgp_hash_alg_t    halg;
    pgp_source_t      sigsrc;
    pgp_key_id_t      keyid = {};
    pgp_key_t *       key = NULL;
    rng_t             rng;
    pgp_fingerprint_t fp;

    /* we need rng for key validation */
    assert_true(rng_init(&rng, RNG_SYSTEM));
    /* load keys */
    pubring = new rnp_key_store_t(PGP_KEY_STORE_GPG, "data/test_stream_signatures/pub.asc");
    assert_true(rnp_key_store_load_from_path(pubring, NULL));
    /* load signature */
    assert_rnp_success(init_file_src(&sigsrc, "data/test_stream_signatures/source.txt.sig"));
    assert_rnp_success(stream_parse_signature(&sigsrc, &sig));
    src_close(&sigsrc);
    /* hash signed file */
    halg = sig.halg;
    assert_true(pgp_hash_create(&hash_orig, halg));
    assert_true(stream_hash_file(&hash_orig, "data/test_stream_signatures/source.txt"));
    /* hash forged file */
    assert_true(pgp_hash_create(&hash_forged, halg));
    assert_true(
      stream_hash_file(&hash_forged, "data/test_stream_signatures/source_forged.txt"));
    /* find signing key */
    assert_true(signature_get_keyid(&sig, keyid));
    assert_non_null(key = rnp_key_store_get_key_by_id(pubring, keyid, NULL));
    /* validate signature and fields */
    assert_true(pgp_hash_copy(&hash, &hash_orig));
    assert_int_equal(signature_get_creation(&sig), 1522241943);
    assert_rnp_success(signature_validate(&sig, pgp_key_get_material(key), &hash));
    /* check forged file */
    assert_true(pgp_hash_copy(&hash, &hash_forged));
    assert_rnp_failure(signature_validate(&sig, pgp_key_get_material(key), &hash));
    /* now let's create signature and sign file */

    /* load secret key */
    secring = new rnp_key_store_t(PGP_KEY_STORE_GPG, "data/test_stream_signatures/sec.asc");
    assert_true(rnp_key_store_load_from_path(secring, NULL));
    assert_non_null(key = rnp_key_store_get_key_by_id(secring, keyid, NULL));
    assert_true(pgp_key_is_secret(key));
    /* fill signature */
    uint32_t create = time(NULL);
    uint32_t expire = 123456;
    sig = {};
    sig.version = PGP_V4;
    sig.halg = halg;
    sig.palg = pgp_key_get_alg(key);
    sig.type = PGP_SIG_BINARY;
    assert_true(signature_set_keyfp(&sig, pgp_key_get_fp(key)));
    assert_true(signature_set_keyid(&sig, pgp_key_get_keyid(key)));
    assert_true(signature_set_creation(&sig, create));
    assert_true(signature_set_expiration(&sig, expire));
    assert_true(signature_fill_hashed_data(&sig));
    /* try to sign without decrypting of the secret key */
    assert_true(pgp_hash_copy(&hash, &hash_orig));
    assert_rnp_failure(signature_calculate(&sig, pgp_key_get_material(key), &hash, &rng));
    /* now unlock the key and sign */
    pgp_password_provider_t pswd_prov = {.callback = rnp_password_provider_string,
                                         .userdata = (void *) "password"};
    assert_true(pgp_key_unlock(key, &pswd_prov));
    assert_true(pgp_hash_copy(&hash, &hash_orig));
    assert_rnp_success(signature_calculate(&sig, pgp_key_get_material(key), &hash, &rng));
    /* now verify signature */
    assert_true(pgp_hash_copy(&hash, &hash_orig));
    /* validate signature and fields */
    assert_int_equal(signature_get_creation(&sig), create);
    assert_int_equal(signature_get_expiration(&sig), expire);
    assert_true(signature_has_keyfp(&sig));
    assert_true(signature_get_keyfp(&sig, fp));
    assert_true(fp == pgp_key_get_fp(key));
    assert_rnp_success(signature_validate(&sig, pgp_key_get_material(key), &hash));
    /* cleanup */
    delete pubring;
    delete secring;
    pgp_hash_finish(&hash_orig, NULL);
    pgp_hash_finish(&hash_forged, NULL);
    rng_destroy(&rng);
}

TEST_F(rnp_tests, test_stream_signatures_revoked_key)
{
    pgp_signature_t sig = {};
    pgp_source_t    sigsrc = {0};

    /* load signature */
    assert_rnp_success(
      init_file_src(&sigsrc, "data/test_stream_signatures/revoked-key-sig.gpg"));
    assert_rnp_success(stream_parse_signature(&sigsrc, &sig));
    src_close(&sigsrc);
    /* get revocation */
    pgp_revocation_type_t code = PGP_REVOCATION_NO_REASON;
    char *                reason = NULL;
    assert_true(signature_get_revocation_reason(&sig, &code, &reason));
    assert_non_null(reason);
    /* check revocation */
    assert_int_equal(code, PGP_REVOCATION_RETIRED);
    assert_string_equal(reason, "For testing!");
    /* cleanup */
    free(reason);
}

TEST_F(rnp_tests, test_stream_key_load)
{
    pgp_source_t               keysrc = {0};
    pgp_dest_t                 keydst = {0};
    pgp_key_sequence_t         keyseq;
    pgp_key_id_t               keyid = {};
    pgp_fingerprint_t          keyfp;
    pgp_transferable_key_t *   key = NULL;
    pgp_transferable_subkey_t *skey = NULL;

    /* public keyring, read-save-read-save armored-read */
    assert_rnp_success(init_file_src(&keysrc, "data/keyrings/1/pubring.gpg"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    assert_true(keyseq.keys.size() > 1);
    src_close(&keysrc);

    assert_rnp_success(init_file_dest(&keydst, "keyout.gpg", true));
    assert_rnp_success(write_pgp_keys(keyseq, &keydst, false));
    dst_close(&keydst, false);

    assert_rnp_success(init_file_src(&keysrc, "keyout.gpg"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    src_close(&keysrc);

    assert_rnp_success(init_file_dest(&keydst, "keyout.asc", true));
    assert_rnp_success(write_pgp_keys(keyseq, &keydst, true));
    dst_close(&keydst, false);

    assert_rnp_success(init_file_src(&keysrc, "keyout.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    src_close(&keysrc);

    /* secret keyring */
    assert_rnp_success(init_file_src(&keysrc, "data/keyrings/1/secring.gpg"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    assert_true(keyseq.keys.size() > 1);
    src_close(&keysrc);

    assert_rnp_success(init_file_dest(&keydst, "keyout-sec.gpg", true));
    assert_rnp_success(write_pgp_keys(keyseq, &keydst, false));
    dst_close(&keydst, false);

    assert_rnp_success(init_file_src(&keysrc, "keyout-sec.gpg"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    src_close(&keysrc);

    assert_rnp_success(init_file_dest(&keydst, "keyout-sec.asc", true));
    assert_rnp_success(write_pgp_keys(keyseq, &keydst, true));
    dst_close(&keydst, false);

    assert_rnp_success(init_file_src(&keysrc, "keyout-sec.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    src_close(&keysrc);

    /* armored v3 public key */
    assert_rnp_success(init_file_src(&keysrc, "data/keyrings/4/rsav3-p.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    assert_int_equal(keyseq.keys.size(), 1);
    assert_non_null(key = &keyseq.keys.front());
    assert_rnp_success(pgp_keyid(keyid, &key->key));
    assert_true(cmp_keyid(keyid, "7D0BC10E933404C9"));
    assert_false(cmp_keyid(keyid, "1D0BC10E933404C9"));
    src_close(&keysrc);

    /* armored v3 secret key */
    assert_rnp_success(init_file_src(&keysrc, "data/keyrings/4/rsav3-s.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    assert_int_equal(keyseq.keys.size(), 1);
    assert_non_null(key = &keyseq.keys.front());
    assert_rnp_success(pgp_keyid(keyid, &key->key));
    assert_true(cmp_keyid(keyid, "7D0BC10E933404C9"));
    src_close(&keysrc);

    /* rsa/rsa public key */
    assert_rnp_success(init_file_src(&keysrc, "data/test_stream_key_load/rsa-rsa-pub.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    assert_int_equal(keyseq.keys.size(), 1);
    assert_non_null(key = &keyseq.keys.front());
    assert_rnp_success(pgp_fingerprint(keyfp, &key->key));
    assert_true(cmp_keyfp(keyfp, "6BC04A5A3DDB35766B9A40D82FB9179118898E8B"));
    assert_rnp_success(pgp_keyid(keyid, &key->key));
    assert_true(cmp_keyid(keyid, "2FB9179118898E8B"));
    assert_int_equal(key->subkeys.size(), 1);
    assert_non_null(key->subkeys[0].subkey.hashed_data);
    src_close(&keysrc);

    /* rsa/rsa secret key */
    assert_rnp_success(init_file_src(&keysrc, "data/test_stream_key_load/rsa-rsa-sec.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    assert_int_equal(keyseq.keys.size(), 1);
    assert_non_null(key = &keyseq.keys.front());
    assert_rnp_success(pgp_fingerprint(keyfp, &key->key));
    assert_true(cmp_keyfp(keyfp, "6BC04A5A3DDB35766B9A40D82FB9179118898E8B"));
    assert_rnp_success(pgp_keyid(keyid, &key->key));
    assert_true(cmp_keyid(keyid, "2FB9179118898E8B"));
    assert_int_equal(key->subkeys.size(), 1);
    assert_non_null(key->subkeys[0].subkey.hashed_data);
    src_close(&keysrc);

    /* dsa/el-gamal public key */
    assert_rnp_success(init_file_src(&keysrc, "data/test_stream_key_load/dsa-eg-pub.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    assert_int_equal(keyseq.keys.size(), 1);
    assert_non_null(key = &keyseq.keys.front());
    assert_rnp_success(pgp_fingerprint(keyfp, &key->key));
    assert_true(cmp_keyfp(keyfp, "091C44CE9CFBC3FF7EC7A64DC8A10A7D78273E10"));
    assert_int_equal(key->subkeys.size(), 1);
    assert_non_null(skey = &key->subkeys.front());
    assert_rnp_success(pgp_keyid(keyid, &skey->subkey));
    assert_true(cmp_keyid(keyid, "02A5715C3537717E"));
    src_close(&keysrc);

    /* dsa/el-gamal secret key */
    assert_rnp_success(init_file_src(&keysrc, "data/test_stream_key_load/dsa-eg-sec.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    assert_int_equal(keyseq.keys.size(), 1);
    assert_non_null(key = &keyseq.keys.front());
    assert_int_equal(key->subkeys.size(), 1);
    assert_non_null(key->subkeys[0].subkey.hashed_data);
    src_close(&keysrc);

    /* curve 25519 ecc public key */
    assert_rnp_success(init_file_src(&keysrc, "data/test_stream_key_load/ecc-25519-pub.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    assert_int_equal(keyseq.keys.size(), 1);
    assert_non_null(key = &keyseq.keys.front());
    assert_rnp_success(pgp_fingerprint(keyfp, &key->key));
    assert_true(cmp_keyfp(keyfp, "21FC68274AAE3B5DE39A4277CC786278981B0728"));
    src_close(&keysrc);

    /* curve 25519 ecc secret key */
    assert_rnp_success(init_file_src(&keysrc, "data/test_stream_key_load/ecc-25519-sec.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    assert_int_equal(keyseq.keys.size(), 1);
    assert_non_null(key = &keyseq.keys.front());
    assert_true(key->subkeys.empty());
    src_close(&keysrc);

    /* eddsa/x25519 ecc public key */
    assert_rnp_success(init_file_src(&keysrc, "data/test_stream_key_load/ecc-x25519-pub.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    assert_int_equal(keyseq.keys.size(), 1);
    assert_non_null(key = &keyseq.keys.front());
    assert_rnp_success(pgp_fingerprint(keyfp, &key->key));
    assert_true(cmp_keyfp(keyfp, "4C9738A6F2BE4E1A796C9B7B941822A0FC1B30A5"));
    assert_int_equal(key->subkeys.size(), 1);
    assert_non_null(skey = &key->subkeys.front());
    assert_rnp_success(pgp_keyid(keyid, &skey->subkey));
    assert_true(cmp_keyid(keyid, "C711187E594376AF"));
    src_close(&keysrc);

    /* eddsa/x25519 ecc secret key */
    assert_rnp_success(init_file_src(&keysrc, "data/test_stream_key_load/ecc-x25519-sec.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    assert_int_equal(keyseq.keys.size(), 1);
    assert_non_null(key = &keyseq.keys.front());
    assert_int_equal(key->subkeys.size(), 1);
    assert_non_null(key->subkeys[0].subkey.hashed_data);
    src_close(&keysrc);

    /* p-256 ecc public key */
    assert_rnp_success(init_file_src(&keysrc, "data/test_stream_key_load/ecc-p256-pub.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    assert_int_equal(keyseq.keys.size(), 1);
    assert_non_null(key = &keyseq.keys.front());
    assert_rnp_success(pgp_fingerprint(keyfp, &key->key));
    assert_true(cmp_keyfp(keyfp, "B54FDEBBB673423A5D0AA54423674F21B2441527"));
    assert_non_null(skey = &key->subkeys.front());
    assert_rnp_success(pgp_keyid(keyid, &skey->subkey));
    assert_true(cmp_keyid(keyid, "37E285E9E9851491"));
    src_close(&keysrc);

    /* p-256 ecc secret key */
    assert_rnp_success(init_file_src(&keysrc, "data/test_stream_key_load/ecc-p256-sec.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    assert_int_equal(keyseq.keys.size(), 1);
    assert_non_null(key = &keyseq.keys.front());
    assert_int_equal(key->subkeys.size(), 1);
    assert_non_null(key->subkeys[0].subkey.hashed_data);
    src_close(&keysrc);

    /* p-384 ecc public key */
    assert_rnp_success(init_file_src(&keysrc, "data/test_stream_key_load/ecc-p384-pub.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    assert_int_equal(keyseq.keys.size(), 1);
    assert_non_null(key = &keyseq.keys.front());
    assert_rnp_success(pgp_fingerprint(keyfp, &key->key));
    assert_true(cmp_keyfp(keyfp, "AB25CBA042DD924C3ACC3ED3242A3AA5EA85F44A"));
    assert_non_null(skey = &key->subkeys.front());
    assert_rnp_success(pgp_keyid(keyid, &skey->subkey));
    assert_true(cmp_keyid(keyid, "E210E3D554A4FAD9"));
    src_close(&keysrc);

    /* p-384 ecc secret key */
    assert_rnp_success(init_file_src(&keysrc, "data/test_stream_key_load/ecc-p384-sec.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    assert_int_equal(keyseq.keys.size(), 1);
    assert_non_null(key = &keyseq.keys.front());
    assert_int_equal(key->subkeys.size(), 1);
    assert_non_null(key->subkeys[0].subkey.hashed_data);
    src_close(&keysrc);

    /* p-521 ecc public key */
    assert_rnp_success(init_file_src(&keysrc, "data/test_stream_key_load/ecc-p521-pub.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    assert_int_equal(keyseq.keys.size(), 1);
    assert_non_null(key = &keyseq.keys.front());
    assert_rnp_success(pgp_fingerprint(keyfp, &key->key));
    assert_true(cmp_keyfp(keyfp, "4FB39FF6FA4857A4BD7EF5B42092CA8324263B6A"));
    assert_non_null(skey = &key->subkeys.front());
    assert_rnp_success(pgp_keyid(keyid, &skey->subkey));
    assert_true(cmp_keyid(keyid, "9853DF2F6D297442"));
    src_close(&keysrc);

    /* p-521 ecc secret key */
    assert_rnp_success(init_file_src(&keysrc, "data/test_stream_key_load/ecc-p521-sec.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    assert_int_equal(keyseq.keys.size(), 1);
    assert_non_null(key = &keyseq.keys.front());
    assert_int_equal(key->subkeys.size(), 1);
    assert_non_null(key->subkeys[0].subkey.hashed_data);
    src_close(&keysrc);

    /* Brainpool P256 ecc public key */
    assert_rnp_success(init_file_src(&keysrc, "data/test_stream_key_load/ecc-bp256-pub.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    assert_int_equal(keyseq.keys.size(), 1);
    assert_non_null(key = &keyseq.keys.front());
    assert_rnp_success(pgp_fingerprint(keyfp, &key->key));
    assert_true(cmp_keyfp(keyfp, "0633C5F72A198F51E650E4ABD0C8A3DAF9E0634A"));
    assert_non_null(skey = &key->subkeys.front());
    assert_rnp_success(pgp_keyid(keyid, &skey->subkey));
    assert_true(cmp_keyid(keyid, "2EDABB94D3055F76"));
    src_close(&keysrc);

    /* Brainpool P256 ecc secret key */
    assert_rnp_success(init_file_src(&keysrc, "data/test_stream_key_load/ecc-bp256-sec.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    assert_int_equal(keyseq.keys.size(), 1);
    assert_non_null(key = &keyseq.keys.front());
    assert_int_equal(key->subkeys.size(), 1);
    assert_non_null(key->subkeys[0].subkey.hashed_data);
    src_close(&keysrc);

    /* Brainpool P384 ecc public key */
    assert_rnp_success(init_file_src(&keysrc, "data/test_stream_key_load/ecc-bp384-pub.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    assert_int_equal(keyseq.keys.size(), 1);
    assert_non_null(key = &keyseq.keys.front());
    assert_rnp_success(pgp_fingerprint(keyfp, &key->key));
    assert_true(cmp_keyfp(keyfp, "5B8A254C823CED98DECD10ED6CF2DCE85599ADA2"));
    assert_non_null(skey = &key->subkeys.front());
    assert_rnp_success(pgp_keyid(keyid, &skey->subkey));
    assert_true(cmp_keyid(keyid, "CFF1BB6F16D28191"));
    src_close(&keysrc);

    /* Brainpool P384 ecc secret key */
    assert_rnp_success(init_file_src(&keysrc, "data/test_stream_key_load/ecc-bp384-sec.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    assert_int_equal(keyseq.keys.size(), 1);
    assert_non_null(key = &keyseq.keys.front());
    assert_int_equal(key->subkeys.size(), 1);
    assert_non_null(key->subkeys[0].subkey.hashed_data);
    src_close(&keysrc);

    /* Brainpool P512 ecc public key */
    assert_rnp_success(init_file_src(&keysrc, "data/test_stream_key_load/ecc-bp512-pub.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    assert_int_equal(keyseq.keys.size(), 1);
    assert_non_null(key = &keyseq.keys.front());
    assert_rnp_success(pgp_fingerprint(keyfp, &key->key));
    assert_true(cmp_keyfp(keyfp, "4C59AB9272AA6A1F60B85BD0AA5C58D14F7B8F48"));
    assert_non_null(skey = &key->subkeys.front());
    assert_rnp_success(pgp_keyid(keyid, &skey->subkey));
    assert_true(cmp_keyid(keyid, "20CDAA1482BA79CE"));
    src_close(&keysrc);

    /* Brainpool P512 ecc secret key */
    assert_rnp_success(init_file_src(&keysrc, "data/test_stream_key_load/ecc-bp512-sec.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    assert_int_equal(keyseq.keys.size(), 1);
    assert_non_null(key = &keyseq.keys.front());
    assert_int_equal(key->subkeys.size(), 1);
    assert_non_null(key->subkeys[0].subkey.hashed_data);
    src_close(&keysrc);

    /* secp256k1 ecc public key, not supported now */
    assert_rnp_success(init_file_src(&keysrc, "data/test_stream_key_load/ecc-p256k1-pub.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    assert_int_equal(keyseq.keys.size(), 1);
    assert_non_null(key = &keyseq.keys.front());
    assert_rnp_success(pgp_fingerprint(keyfp, &key->key));
    assert_true(cmp_keyfp(keyfp, "81F772B57D4EBFE7000A66233EA5BB6F9692C1A0"));
    assert_non_null(skey = &key->subkeys.front());
    assert_rnp_success(pgp_keyid(keyid, &skey->subkey));
    assert_true(cmp_keyid(keyid, "7635401F90D3E533"));
    src_close(&keysrc);

    /* secp256k1 ecc secret key */
    assert_rnp_success(init_file_src(&keysrc, "data/test_stream_key_load/ecc-p256k1-sec.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    assert_int_equal(keyseq.keys.size(), 1);
    assert_non_null(key = &keyseq.keys.front());
    assert_int_equal(key->subkeys.size(), 1);
    assert_non_null(key->subkeys[0].subkey.hashed_data);
    src_close(&keysrc);
}

static void
buggy_key_load_single(const void *keydata, size_t keylen)
{
    pgp_source_t       memsrc = {0};
    pgp_key_sequence_t keyseq;
    size_t             partlen;
    uint8_t *          dataptr;

    /* try truncated load */
    for (partlen = 1; partlen < keylen; partlen += 15) {
        assert_rnp_success(init_mem_src(&memsrc, keydata, partlen, false));
        if (!process_pgp_keys(&memsrc, keyseq, false)) {
            /* it may succeed if we accidentally hit some packet boundary */
            assert_false(keyseq.keys.empty());
        } else {
            assert_true(keyseq.keys.empty());
        }
        src_close(&memsrc);
    }

    /* try modified load */
    dataptr = (uint8_t *) keydata;
    for (partlen = 1; partlen < keylen; partlen++) {
        dataptr[partlen] ^= 0xff;
        assert_rnp_success(init_mem_src(&memsrc, keydata, keylen, false));
        if (!process_pgp_keys(&memsrc, keyseq, false)) {
            /* it may succeed if we accidentally hit some packet boundary */
            assert_false(keyseq.keys.empty());
        } else {
            assert_true(keyseq.keys.empty());
        }
        src_close(&memsrc);
        dataptr[partlen] ^= 0xff;
    }
}

/* check for memory leaks during buggy key loads */
TEST_F(rnp_tests, test_stream_key_load_errors)
{
    pgp_source_t fsrc = {0};
    pgp_source_t armorsrc = {0};
    pgp_source_t memsrc = {0};

    const char *key_files[] = {"data/keyrings/4/rsav3-p.asc",
                               "data/keyrings/4/rsav3-s.asc",
                               "data/keyrings/1/pubring.gpg",
                               "data/keyrings/1/secring.gpg",
                               "data/test_stream_key_load/dsa-eg-pub.asc",
                               "data/test_stream_key_load/dsa-eg-sec.asc",
                               "data/test_stream_key_load/ecc-25519-pub.asc",
                               "data/test_stream_key_load/ecc-25519-sec.asc",
                               "data/test_stream_key_load/ecc-x25519-pub.asc",
                               "data/test_stream_key_load/ecc-x25519-sec.asc",
                               "data/test_stream_key_load/ecc-p256-pub.asc",
                               "data/test_stream_key_load/ecc-p256-sec.asc",
                               "data/test_stream_key_load/ecc-p384-pub.asc",
                               "data/test_stream_key_load/ecc-p384-sec.asc",
                               "data/test_stream_key_load/ecc-p521-pub.asc",
                               "data/test_stream_key_load/ecc-p521-sec.asc",
                               "data/test_stream_key_load/ecc-bp256-pub.asc",
                               "data/test_stream_key_load/ecc-bp256-sec.asc",
                               "data/test_stream_key_load/ecc-bp384-pub.asc",
                               "data/test_stream_key_load/ecc-bp384-sec.asc",
                               "data/test_stream_key_load/ecc-bp512-pub.asc",
                               "data/test_stream_key_load/ecc-bp512-sec.asc",
                               "data/test_stream_key_load/ecc-p256k1-pub.asc",
                               "data/test_stream_key_load/ecc-p256k1-sec.asc"};

    for (size_t i = 0; i < sizeof(key_files) / sizeof(char *); i++) {
        assert_rnp_success(init_file_src(&fsrc, key_files[i]));
        if (is_armored_source(&fsrc)) {
            assert_rnp_success(init_armored_src(&armorsrc, &fsrc));
            assert_rnp_success(read_mem_src(&memsrc, &armorsrc));
            src_close(&armorsrc);
        } else {
            assert_rnp_success(read_mem_src(&memsrc, &fsrc));
        }
        src_close(&fsrc);
        buggy_key_load_single(mem_src_get_memory(&memsrc), memsrc.size);
        src_close(&memsrc);
    }
}

TEST_F(rnp_tests, test_stream_key_decrypt)
{
    pgp_source_t               keysrc = {0};
    pgp_key_sequence_t         keyseq;
    pgp_transferable_key_t *   key = NULL;
    pgp_transferable_subkey_t *subkey = NULL;

    /* load and decrypt secret keyring */
    assert_rnp_success(init_file_src(&keysrc, "data/keyrings/1/secring.gpg"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    for (auto &key : keyseq.keys) {
        assert_rnp_failure(decrypt_secret_key(&key.key, "passw0rd"));
        assert_rnp_success(decrypt_secret_key(&key.key, "password"));

        for (auto &subkey : key.subkeys) {
            assert_rnp_failure(decrypt_secret_key(&subkey.subkey, "passw0rd"));
            assert_rnp_success(decrypt_secret_key(&subkey.subkey, "password"));
        }
    }
    src_close(&keysrc);

    /* armored v3 secret key */
    assert_rnp_success(init_file_src(&keysrc, "data/keyrings/4/rsav3-s.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    assert_non_null(key = &keyseq.keys.front());
    assert_rnp_failure(decrypt_secret_key(&key->key, "passw0rd"));
    assert_rnp_success(decrypt_secret_key(&key->key, "password"));
    src_close(&keysrc);

    /* rsa/rsa secret key */
    assert_rnp_success(init_file_src(&keysrc, "data/test_stream_key_load/rsa-rsa-sec.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    assert_non_null(key = &keyseq.keys.front());
    assert_rnp_success(decrypt_secret_key(&key->key, "password"));
    assert_non_null(subkey = &key->subkeys.front());
    assert_rnp_success(decrypt_secret_key(&subkey->subkey, "password"));
    src_close(&keysrc);

    /* dsa/el-gamal secret key */
    assert_rnp_success(init_file_src(&keysrc, "data/test_stream_key_load/dsa-eg-sec.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    assert_non_null(key = &keyseq.keys.front());
    assert_rnp_success(decrypt_secret_key(&key->key, "password"));
    assert_non_null(subkey = &key->subkeys.front());
    assert_rnp_success(decrypt_secret_key(&subkey->subkey, "password"));
    src_close(&keysrc);

    /* curve 25519 eddsa ecc secret key */
    assert_rnp_success(init_file_src(&keysrc, "data/test_stream_key_load/ecc-25519-sec.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    assert_non_null(key = &keyseq.keys.front());
    assert_rnp_success(decrypt_secret_key(&key->key, "password"));
    src_close(&keysrc);

    /* x25519 ecc secret key */
    assert_rnp_success(init_file_src(&keysrc, "data/test_stream_key_load/ecc-x25519-sec.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    assert_non_null(key = &keyseq.keys.front());
    assert_rnp_success(decrypt_secret_key(&key->key, "password"));
    assert_non_null(subkey = &key->subkeys.front());
    assert_rnp_success(decrypt_secret_key(&subkey->subkey, "password"));
    src_close(&keysrc);

    /* p-256 ecc secret key */
    assert_rnp_success(init_file_src(&keysrc, "data/test_stream_key_load/ecc-p256-sec.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    assert_non_null(key = &keyseq.keys.front());
    assert_rnp_success(decrypt_secret_key(&key->key, "password"));
    assert_non_null(subkey = &key->subkeys.front());
    assert_rnp_success(decrypt_secret_key(&subkey->subkey, "password"));
    src_close(&keysrc);

    /* p-384 ecc secret key */
    assert_rnp_success(init_file_src(&keysrc, "data/test_stream_key_load/ecc-p384-sec.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    assert_non_null(key = &keyseq.keys.front());
    assert_rnp_success(decrypt_secret_key(&key->key, "password"));
    assert_non_null(subkey = &key->subkeys.front());
    assert_rnp_success(decrypt_secret_key(&subkey->subkey, "password"));
    src_close(&keysrc);

    /* p-521 ecc secret key */
    assert_rnp_success(init_file_src(&keysrc, "data/test_stream_key_load/ecc-p521-sec.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    assert_non_null(key = &keyseq.keys.front());
    assert_rnp_success(decrypt_secret_key(&key->key, "password"));
    assert_non_null(subkey = &key->subkeys.front());
    assert_rnp_success(decrypt_secret_key(&subkey->subkey, "password"));
    src_close(&keysrc);
}

TEST_F(rnp_tests, test_stream_key_encrypt)
{
    pgp_source_t       keysrc = {0};
    pgp_dest_t         keydst = {0};
    uint8_t            keybuf[16384];
    size_t             keylen;
    pgp_key_sequence_t keyseq;
    pgp_key_sequence_t keyseq2;
    rng_t              rng;

    /* we need rng for key encryption */
    assert_true(rng_init(&rng, RNG_SYSTEM));

    /* load and decrypt secret keyring, then re-encrypt and reload keys */
    assert_rnp_success(init_file_src(&keysrc, "data/keyrings/1/secring.gpg"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    src_close(&keysrc);
    for (auto &key : keyseq.keys) {
        assert_rnp_success(decrypt_secret_key(&key.key, "password"));

        for (auto &subkey : key.subkeys) {
            assert_rnp_success(decrypt_secret_key(&subkey.subkey, "password"));
        }

        /* change password and encryption algorithm */
        key.key.sec_protection.symm_alg = PGP_SA_CAMELLIA_192;
        assert_rnp_success(encrypt_secret_key(&key.key, "passw0rd", &rng));
        for (auto &subkey : key.subkeys) {
            subkey.subkey.sec_protection.symm_alg = PGP_SA_CAMELLIA_256;
            assert_rnp_success(encrypt_secret_key(&subkey.subkey, "passw0rd", &rng));
        }
        /* write changed key */
        assert_rnp_success(init_mem_dest(&keydst, keybuf, sizeof(keybuf)));
        assert_rnp_success(write_pgp_key(key, &keydst, false));
        keylen = keydst.writeb;
        dst_close(&keydst, false);
        /* load and decrypt changed key */
        assert_rnp_success(init_mem_src(&keysrc, keybuf, keylen, false));
        assert_rnp_success(process_pgp_keys(&keysrc, keyseq2, false));
        src_close(&keysrc);
        assert_false(keyseq2.keys.empty());
        auto &key2 = keyseq2.keys.front();
        assert_int_equal(key2.key.sec_protection.symm_alg, PGP_SA_CAMELLIA_192);
        assert_rnp_success(decrypt_secret_key(&key2.key, "passw0rd"));

        for (auto &subkey : key2.subkeys) {
            assert_int_equal(subkey.subkey.sec_protection.symm_alg, PGP_SA_CAMELLIA_256);
            assert_rnp_success(decrypt_secret_key(&subkey.subkey, "passw0rd"));
        }
        /* write key without the password */
        key2.key.sec_protection.s2k.usage = PGP_S2KU_NONE;
        assert_rnp_success(encrypt_secret_key(&key2.key, NULL, NULL));
        for (auto &subkey : key2.subkeys) {
            subkey.subkey.sec_protection.s2k.usage = PGP_S2KU_NONE;
            assert_rnp_success(encrypt_secret_key(&subkey.subkey, NULL, NULL));
        }
        /* write changed key */
        assert_rnp_success(init_mem_dest(&keydst, keybuf, sizeof(keybuf)));
        assert_rnp_success(write_pgp_key(key2, &keydst, false));
        keylen = keydst.writeb;
        dst_close(&keydst, false);
        /* load non-encrypted key */
        assert_rnp_success(init_mem_src(&keysrc, keybuf, keylen, false));
        assert_rnp_success(process_pgp_keys(&keysrc, keyseq2, false));
        src_close(&keysrc);
        assert_false(keyseq2.keys.empty());
        auto &key3 = keyseq2.keys.front();
        assert_int_equal(key3.key.sec_protection.s2k.usage, PGP_S2KU_NONE);
        assert_rnp_success(decrypt_secret_key(&key3.key, NULL));

        for (auto &subkey : key3.subkeys) {
            assert_int_equal(subkey.subkey.sec_protection.s2k.usage, PGP_S2KU_NONE);
            assert_rnp_success(decrypt_secret_key(&subkey.subkey, NULL));
        }
    }
    rng_destroy(&rng);
}

TEST_F(rnp_tests, test_stream_key_signatures)
{
    rnp_key_store_t *          pubring;
    pgp_source_t               keysrc = {0};
    pgp_key_sequence_t         keyseq;
    pgp_transferable_key_t *   key = NULL;
    pgp_transferable_userid_t *uid = NULL;
    rng_t                      rng;
    pgp_signature_t *          sig;
    pgp_key_id_t               keyid = {};
    pgp_key_t *                pkey = NULL;
    pgp_hash_t                 hash;
    pgp_signature_info_t       sinfo = {};

    /* we need rng for key validation */
    assert_true(rng_init(&rng, RNG_SYSTEM));

    /* v3 public key */
    pubring = new rnp_key_store_t(PGP_KEY_STORE_GPG, "data/keyrings/4/rsav3-p.asc");
    assert_true(rnp_key_store_load_from_path(pubring, NULL));
    assert_rnp_success(init_file_src(&keysrc, "data/keyrings/4/rsav3-p.asc"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    src_close(&keysrc);
    assert_int_equal(keyseq.keys.size(), 1);
    assert_non_null(key = &keyseq.keys.front());
    assert_non_null(uid = &key->userids.front());
    assert_non_null(sig = &uid->signatures.front());
    assert_true(signature_get_keyid(sig, keyid));
    assert_non_null(pkey = rnp_key_store_get_key_by_id(pubring, keyid, NULL));
    /* check certification signature */
    assert_true(signature_hash_certification(sig, &key->key, &uid->uid, &hash));
    assert_rnp_success(signature_validate(sig, pgp_key_get_material(pkey), &hash));
    /* modify userid and check signature */
    uid->uid.uid[2] = '?';
    assert_true(signature_hash_certification(sig, &key->key, &uid->uid, &hash));
    assert_rnp_failure(signature_validate(sig, pgp_key_get_material(pkey), &hash));
    delete pubring;

    /* keyring */
    pubring = new rnp_key_store_t(PGP_KEY_STORE_GPG, "data/keyrings/1/pubring.gpg");
    assert_true(rnp_key_store_load_from_path(pubring, NULL));
    assert_rnp_success(init_file_src(&keysrc, "data/keyrings/1/pubring.gpg"));
    assert_rnp_success(process_pgp_keys(&keysrc, keyseq, false));
    src_close(&keysrc);

    /* check key signatures */
    for (auto &keyref : keyseq.keys) {
        key = &keyref;

        for (auto &uid : key->userids) {
            /* userid certifications */
            for (auto &sig : uid.signatures) {
                assert_true(signature_get_keyid(&sig, keyid));
                assert_non_null(pkey = rnp_key_store_get_key_by_id(pubring, keyid, NULL));
                /* high level interface */
                sinfo.sig = &sig;
                sinfo.signer = pkey;
                assert_rnp_success(signature_check_certification(&sinfo, &key->key, &uid.uid));
                /* low level check */
                assert_true(signature_hash_certification(&sig, &key->key, &uid.uid, &hash));
                assert_rnp_success(
                  signature_validate(&sig, pgp_key_get_material(pkey), &hash));
                /* modify userid and check signature */
                uid.uid.uid[2] = '?';
                assert_rnp_failure(signature_check_certification(&sinfo, &key->key, &uid.uid));
                assert_true(signature_hash_certification(&sig, &key->key, &uid.uid, &hash));
                assert_rnp_failure(
                  signature_validate(&sig, pgp_key_get_material(pkey), &hash));
            }
        }

        /* subkey binding signatures */
        for (auto &subkey : key->subkeys) {
            sig = &subkey.signatures.front();
            assert_non_null(sig);
            assert_true(signature_get_keyid(sig, keyid));
            assert_non_null(pkey = rnp_key_store_get_key_by_id(pubring, keyid, NULL));
            /* high level interface */
            sinfo.sig = sig;
            sinfo.signer = pkey;
            pgp_key_id_t subid;
            assert_rnp_success(pgp_keyid(subid, &subkey.subkey));
            pgp_key_t *psub = rnp_key_store_get_key_by_id(pubring, subid, NULL);
            assert_non_null(psub);
            assert_rnp_success(signature_check_binding(&sinfo, &key->key, psub));
            /* low level check */
            assert_true(signature_hash_binding(sig, &key->key, &subkey.subkey, &hash));
            assert_rnp_success(signature_validate(sig, pgp_key_get_material(pkey), &hash));
        }
    }

    delete pubring;
    rng_destroy(&rng);
}

static void
validate_key_sigs(const char *path)
{
    rnp_key_store_t *pubring = new rnp_key_store_t(PGP_KEY_STORE_GPG, path);
    assert_true(rnp_key_store_load_from_path(pubring, NULL));
    for (auto &key : pubring->keys) {
        pgp_key_validate(&key, pubring);
        assert_true(key.valid);
    }
    delete pubring;
}

TEST_F(rnp_tests, test_stream_key_signature_validate)
{
    rnp_key_store_t *pubring;
    pgp_key_t *      pkey = NULL;

    /* v3 public key */
    pubring = new rnp_key_store_t(PGP_KEY_STORE_GPG, "data/keyrings/4/rsav3-p.asc");
    assert_true(rnp_key_store_load_from_path(pubring, NULL));
    assert_int_equal(rnp_key_store_get_key_count(pubring), 1);
    pkey = &pubring->keys.front();
    pgp_key_validate(pkey, pubring);
    assert_true(pkey->valid);
    delete pubring;

    /* keyring */
    pubring = new rnp_key_store_t(PGP_KEY_STORE_GPG, "data/keyrings/1/pubring.gpg");
    assert_true(rnp_key_store_load_from_path(pubring, NULL));
    assert_true(rnp_key_store_get_key_count(pubring) > 0);
    int i = 0;
    for (auto &key : pubring->keys) {
        pgp_key_validate(&key, pubring);
        // subkey #2 is expired
        if (i == 2) {
            assert_false(key.valid);
        } else {
            assert_true(key.valid);
        }
        i++;
    }
    delete pubring;

    /* misc key files */
    const char *key_files[] = {"data/test_stream_key_load/dsa-eg-pub.asc",
                               "data/test_stream_key_load/dsa-eg-sec.asc",
                               "data/test_stream_key_load/ecc-25519-pub.asc",
                               "data/test_stream_key_load/ecc-25519-sec.asc",
                               "data/test_stream_key_load/ecc-x25519-pub.asc",
                               "data/test_stream_key_load/ecc-x25519-sec.asc",
                               "data/test_stream_key_load/ecc-p256-pub.asc",
                               "data/test_stream_key_load/ecc-p256-sec.asc",
                               "data/test_stream_key_load/ecc-p384-pub.asc",
                               "data/test_stream_key_load/ecc-p384-sec.asc",
                               "data/test_stream_key_load/ecc-p521-pub.asc",
                               "data/test_stream_key_load/ecc-p521-sec.asc",
                               "data/test_stream_key_load/ecc-bp256-pub.asc",
                               "data/test_stream_key_load/ecc-bp256-sec.asc",
                               "data/test_stream_key_load/ecc-bp384-pub.asc",
                               "data/test_stream_key_load/ecc-bp384-sec.asc",
                               "data/test_stream_key_load/ecc-bp512-pub.asc",
                               "data/test_stream_key_load/ecc-bp512-sec.asc",
                               "data/test_stream_key_load/ecc-p256k1-pub.asc",
                               "data/test_stream_key_load/ecc-p256k1-sec.asc"};

    for (size_t i = 0; i < sizeof(key_files) / sizeof(char *); i++) {
        validate_key_sigs(key_files[i]);
    }
}

TEST_F(rnp_tests, test_stream_verify_no_key)
{
    cli_rnp_t rnp = {0};
    rnp_cfg_t cfg = {};

    /* setup rnp structure and params */
    rnp_cfg_init(&cfg);
    rnp_cfg_setstr(&cfg, CFG_KR_PUB_PATH, "");
    rnp_cfg_setstr(&cfg, CFG_KR_SEC_PATH, "");
    rnp_cfg_setstr(&cfg, CFG_KR_PUB_FORMAT, RNP_KEYSTORE_GPG);
    rnp_cfg_setstr(&cfg, CFG_KR_SEC_FORMAT, RNP_KEYSTORE_GPG);
    assert_true(cli_rnp_init(&rnp, &cfg));
    rnp_cfg_free(&cfg);

    rnp_cfg_t *rnpcfg = cli_rnp_cfg(&rnp);
    /* setup cfg for verification */
    rnp_cfg_setstr(
      rnpcfg, CFG_INFILE, "data/test_stream_verification/verify_encrypted_no_key.pgp");
    rnp_cfg_setstr(rnpcfg, CFG_OUTFILE, "output.dat");
    rnp_cfg_setbool(rnpcfg, CFG_OVERWRITE, true);
    /* setup operation context */
    assert_rnp_success(
      rnp_ffi_set_pass_provider(rnp.ffi, ffi_string_password_provider, (void *) "pass1"));
    /* operation should success if output is not discarded, i.e. operation = decrypt */
    rnp_cfg_setbool(rnpcfg, CFG_NO_OUTPUT, false);
    assert_true(cli_rnp_process_file(&rnp));
    assert_int_equal(file_size("output.dat"), 4);
    /* try second password */
    assert_rnp_success(
      rnp_ffi_set_pass_provider(rnp.ffi, ffi_string_password_provider, (void *) "pass2"));
    assert_true(cli_rnp_process_file(&rnp));
    assert_int_equal(file_size("output.dat"), 4);
    /* decryption/verification fails without password */
    assert_rnp_success(
      rnp_ffi_set_pass_provider(rnp.ffi, ffi_failing_password_provider, NULL));
    assert_false(cli_rnp_process_file(&rnp));
    assert_int_equal(file_size("output.dat"), -1);
    /* decryption/verification fails with wrong password */
    assert_rnp_success(
      rnp_ffi_set_pass_provider(rnp.ffi, ffi_string_password_provider, (void *) "pass_wrong"));
    assert_false(cli_rnp_process_file(&rnp));
    assert_int_equal(file_size("output.dat"), -1);
    /* verification fails if output is discarded, i.e. operation = verify */
    rnp_cfg_setbool(rnpcfg, CFG_NO_OUTPUT, true);
    assert_false(cli_rnp_process_file(&rnp));
    assert_int_equal(file_size("output.dat"), -1);

    /* cleanup */
    cli_rnp_end(&rnp);
}

static bool
check_dump_file_dst(const char *file, bool mpi, bool grip)
{
    pgp_source_t   src;
    pgp_dest_t     dst;
    rnp_dump_ctx_t ctx = {0};

    ctx.dump_mpi = mpi;
    ctx.dump_grips = grip;

    if (init_file_src(&src, file)) {
        return false;
    }
    if (init_mem_dest(&dst, NULL, 0)) {
        return false;
    }
    if (stream_dump_packets(&ctx, &src, &dst)) {
        return false;
    }
    src_close(&src);
    dst_close(&dst, false);
    return true;
}

static bool
check_dump_file_json(const char *file, bool mpi, bool grip)
{
    pgp_source_t   src;
    rnp_dump_ctx_t ctx = {0};
    json_object *  jso = NULL;

    ctx.dump_mpi = mpi;
    ctx.dump_grips = grip;

    if (init_file_src(&src, file)) {
        return false;
    }
    if (stream_dump_packets_json(&ctx, &src, &jso)) {
        return false;
    }
    if (!json_object_is_type(jso, json_type_array)) {
        return false;
    }
    src_close(&src);
    json_object_put(jso);
    return true;
}

static bool
check_dump_file(const char *file, bool mpi, bool grip)
{
    return check_dump_file_dst(file, mpi, grip) && check_dump_file_json(file, mpi, grip);
}

TEST_F(rnp_tests, test_stream_dumper)
{
    pgp_source_t   src;
    pgp_dest_t     dst;
    rnp_dump_ctx_t ctx = {0};

    assert_true(check_dump_file("data/keyrings/1/pubring.gpg", false, false));
    assert_true(check_dump_file("data/keyrings/1/secring.gpg", false, false));
    assert_true(check_dump_file("data/keyrings/4/rsav3-p.asc", false, false));
    assert_true(check_dump_file("data/keyrings/4/rsav3-p.asc", true, true));
    assert_true(check_dump_file("data/keyrings/4/rsav3-s.asc", true, false));
    assert_true(check_dump_file("data/test_repgp/encrypted_text.gpg", true, false));
    assert_true(check_dump_file("data/test_repgp/signed.gpg", true, false));
    assert_true(check_dump_file("data/test_repgp/encrypted_key.gpg", true, false));
    assert_true(check_dump_file("data/test_stream_key_load/dsa-eg-pub.asc", true, true));
    assert_true(check_dump_file("data/test_stream_key_load/dsa-eg-sec.asc", true, true));
    assert_true(check_dump_file("data/test_stream_key_load/ecc-25519-pub.asc", true, true));
    assert_true(check_dump_file("data/test_stream_key_load/ecc-25519-sec.asc", true, true));
    assert_true(check_dump_file("data/test_stream_key_load/ecc-x25519-pub.asc", true, true));
    assert_true(check_dump_file("data/test_stream_key_load/ecc-x25519-sec.asc", true, true));
    assert_true(check_dump_file("data/test_stream_key_load/ecc-p256-pub.asc", true, true));
    assert_true(check_dump_file("data/test_stream_key_load/ecc-p256-sec.asc", true, true));
    assert_true(check_dump_file("data/test_stream_key_load/ecc-p384-pub.asc", true, true));
    assert_true(check_dump_file("data/test_stream_key_load/ecc-p384-sec.asc", true, true));
    assert_true(check_dump_file("data/test_stream_key_load/ecc-p521-pub.asc", true, true));
    assert_true(check_dump_file("data/test_stream_key_load/ecc-p521-sec.asc", true, true));
    assert_true(check_dump_file("data/test_stream_key_load/ecc-bp256-pub.asc", true, true));
    assert_true(check_dump_file("data/test_stream_key_load/ecc-bp256-sec.asc", true, true));
    assert_true(check_dump_file("data/test_stream_key_load/ecc-bp384-pub.asc", true, true));
    assert_true(check_dump_file("data/test_stream_key_load/ecc-bp384-sec.asc", true, true));
    assert_true(check_dump_file("data/test_stream_key_load/ecc-bp512-pub.asc", true, true));
    assert_true(check_dump_file("data/test_stream_key_load/ecc-bp512-sec.asc", true, true));
    assert_true(check_dump_file("data/test_stream_key_load/ecc-p256k1-pub.asc", true, true));
    assert_true(check_dump_file("data/test_stream_key_load/ecc-p256k1-sec.asc", true, true));
    assert_true(check_dump_file("data/test_stream_signatures/source.txt.asc", true, true));
    assert_true(check_dump_file("data/test_stream_signatures/source.txt.asc.asc", true, true));
    assert_true(check_dump_file(
      "data/test_stream_verification/verify_encrypted_no_key.pgp", true, true));

    assert_rnp_success(init_file_src(&src, "data/test_stream_signatures/source.txt"));
    assert_rnp_success(init_mem_dest(&dst, NULL, 0));
    assert_rnp_failure(stream_dump_packets(&ctx, &src, &dst));
    src_close(&src);
    dst_close(&dst, false);
}

TEST_F(rnp_tests, test_stream_z)
{
    pgp_source_t   src;
    pgp_dest_t     dst;
    rnp_dump_ctx_t ctx = {0};

    /* packet dumper will decompress source stream, making less code lines here */
    ctx.dump_mpi = true;
    ctx.dump_packets = true;

    assert_rnp_success(init_file_src(&src, "data/test_stream_z/4gb.bzip2"));
    assert_rnp_success(init_null_dest(&dst));
    assert_rnp_success(stream_dump_packets(&ctx, &src, &dst));
    src_close(&src);
    dst_close(&dst, true);

    assert_rnp_success(init_file_src(&src, "data/test_stream_z/4gb.bzip2.cut"));
    assert_rnp_success(init_null_dest(&dst));
    assert_rnp_failure(stream_dump_packets(&ctx, &src, &dst));
    src_close(&src);
    dst_close(&dst, true);

    assert_rnp_success(init_file_src(&src, "data/test_stream_z/128mb.zlib"));
    assert_rnp_success(init_null_dest(&dst));
    assert_rnp_success(stream_dump_packets(&ctx, &src, &dst));
    src_close(&src);
    dst_close(&dst, true);

    assert_rnp_success(init_file_src(&src, "data/test_stream_z/128mb.zlib.cut"));
    assert_rnp_success(init_null_dest(&dst));
    assert_rnp_failure(stream_dump_packets(&ctx, &src, &dst));
    src_close(&src);
    dst_close(&dst, true);

    assert_rnp_success(init_file_src(&src, "data/test_stream_z/128mb.zip"));
    assert_rnp_success(init_null_dest(&dst));
    assert_rnp_success(stream_dump_packets(&ctx, &src, &dst));
    src_close(&src);
    dst_close(&dst, true);

    assert_rnp_success(init_file_src(&src, "data/test_stream_z/128mb.zip.cut"));
    assert_rnp_success(init_null_dest(&dst));
    assert_rnp_failure(stream_dump_packets(&ctx, &src, &dst));
    src_close(&src);
    dst_close(&dst, true);
}

/* This test checks for GitHub issue #814.
 */
TEST_F(rnp_tests, test_stream_814_dearmor_double_free)
{
    pgp_source_t src;
    pgp_dest_t   dst;
    const char * buf = "-----BEGIN PGP BAD HEADER-----";

    assert_rnp_success(init_mem_src(&src, buf, strlen(buf), false));
    assert_rnp_success(init_null_dest(&dst));
    assert_rnp_failure(rnp_dearmor_source(&src, &dst));
    src_close(&src);
    dst_close(&dst, true);
}

TEST_F(rnp_tests, test_stream_825_dearmor_blank_line)
{
    rnp_key_store_t *keystore = NULL;
    pgp_source_t     src = {};

    keystore = new rnp_key_store_t(PGP_KEY_STORE_GPG, "");
    assert_rnp_success(
      init_file_src(&src, "data/test_stream_armor/extra_line_before_trailer.asc"));
    assert_true(rnp_key_store_load_from_src(keystore, &src, NULL));
    assert_int_equal(rnp_key_store_get_key_count(keystore), 2);
    src_close(&src);
    delete keystore;
}

static bool
try_dearmor(const char *str, int len)
{
    pgp_source_t src = {};
    pgp_dest_t   dst = {};
    bool         res = false;

    if (len < 0) {
        return false;
    }
    if (init_mem_src(&src, str, len, false) != RNP_SUCCESS) {
        goto done;
    }
    if (init_null_dest(&dst) != RNP_SUCCESS) {
        goto done;
    }
    res = rnp_dearmor_source(&src, &dst) == RNP_SUCCESS;
done:
    src_close(&src);
    dst_close(&dst, true);
    return res;
}

TEST_F(rnp_tests, test_stream_dearmor_edge_cases)
{
    const char *HDR = "-----BEGIN PGP PUBLIC KEY BLOCK-----";
    const char *B1 = "mDMEWsN6MBYJKwYBBAHaRw8BAQdAAS+nkv9BdVi0JX7g6d+O201bdKhdowbielOo";
    const char *B2 = "ugCpCfi0CWVjYy0yNTUxOYiUBBMWCAA8AhsDBQsJCAcCAyICAQYVCgkICwIEFgID";
    const char *B3 = "AQIeAwIXgBYhBCH8aCdKrjtd45pCd8x4YniYGwcoBQJcVa/NAAoJEMx4YniYGwco";
    const char *B4 = "lFAA/jMt3RUUb5xt63JW6HFcrYq0RrDAcYMsXAY73iZpPsEcAQDmKbH21LkwoClU";
    const char *B5 = "9RrUJSYZnMla/pQdgOxd7/PjRCpbCg==";
    const char *CRC = "=miZp";
    const char *FTR = "-----END PGP PUBLIC KEY BLOCK-----";
    const char *FTR2 = "-----END PGP WEIRD KEY BLOCK-----";
    char        b64[1024];
    char        msg[1024];
    int         b64len = 0;
    int         len = 0;

    /* fill the body with normal \n line endings */
    b64len = snprintf(b64, sizeof(b64), "%s\n%s\n%s\n%s\n%s", B1, B2, B3, B4, B5);
    assert_true((b64len > 0) && (b64len < (int) sizeof(b64)));

    /* try normal message */
    len = snprintf(msg, sizeof(msg), "%s\n\n%s\n%s\n%s\n", HDR, b64, CRC, FTR);
    assert_true(try_dearmor(msg, len));

    /* no empty line after the headers */
    len = snprintf(msg, sizeof(msg), "%s\n%s\n%s\n%s\n", HDR, b64, CRC, FTR);
    assert_false(try_dearmor(msg, len));

    /* \r\n line ending */
    len = snprintf(msg, sizeof(msg), "%s\r\n\r\n%s\r\n%s\r\n%s\r\n", HDR, b64, CRC, FTR);
    assert_true(try_dearmor(msg, len));

    /* mixed line ending */
    len = snprintf(msg, sizeof(msg), "%s\r\n\n%s\r\n%s\n%s\r\n", HDR, b64, CRC, FTR);
    assert_true(try_dearmor(msg, len));

    /* extra line before the footer */
    len = snprintf(msg, sizeof(msg), "%s\n\n%s\n%s\n\n%s\n", HDR, b64, CRC, FTR);
    assert_true(try_dearmor(msg, len));

    /* extra spaces after the header: allowed by RFC */
    len = snprintf(msg, sizeof(msg), "%s  \t  \n\n%s\n%s\n%s\n", HDR, b64, CRC, FTR);
    assert_true(try_dearmor(msg, len));

    /* extra spaces after the footer: allowed by RFC as well */
    len = snprintf(msg, sizeof(msg), "%s\n\n%s\n%s\n%s \n", HDR, b64, CRC, FTR);
    assert_true(try_dearmor(msg, len));
    len = snprintf(msg, sizeof(msg), "%s\n\n%s\n%s\n%s\t\n", HDR, b64, CRC, FTR);
    assert_true(try_dearmor(msg, len));
    len = snprintf(msg, sizeof(msg), "%s\n\n%s\n%s\n%s\t\t     \t\t \n", HDR, b64, CRC, FTR);
    assert_true(try_dearmor(msg, len));

    /* invalid footer */
    len = snprintf(msg, sizeof(msg), "%s\n\n%s\n%s\n%s\n", HDR, b64, CRC, FTR2);
    assert_false(try_dearmor(msg, len));

    /* extra spaces or chars before the footer - FAIL */
    len = snprintf(msg, sizeof(msg), "%s\n\n%s\n%s\n  %s\n", HDR, b64, CRC, FTR);
    assert_false(try_dearmor(msg, len));
    len = snprintf(msg, sizeof(msg), "%s\n\n%s\n%s\n\t\t %s\n", HDR, b64, CRC, FTR);
    assert_false(try_dearmor(msg, len));
    len = snprintf(msg, sizeof(msg), "%s\n\n%s\n%s\n11111%s\n", HDR, b64, CRC, FTR);
    assert_false(try_dearmor(msg, len));

    /* cuted out or extended b64 padding */
    len = snprintf(msg, sizeof(msg), "%s\n\n%.*s\n%s\n%s\n", HDR, b64len - 1, b64, CRC, FTR);
    assert_false(try_dearmor(msg, len));
    len = snprintf(msg, sizeof(msg), "%s\n\n%.*s\n%s\n%s\n", HDR, b64len - 2, b64, CRC, FTR);
    assert_false(try_dearmor(msg, len));
    len = snprintf(msg, sizeof(msg), "%s\n\n%s==\n%s\n%s\n", HDR, b64, CRC, FTR);
    assert_false(try_dearmor(msg, len));

    /* invalid chars in b64 data */
    char old = b64[30];
    b64[30] = '?';
    len = snprintf(msg, sizeof(msg), "%s\n\n%s\n%s\n%s\n", HDR, b64, CRC, FTR);
    assert_false(try_dearmor(msg, len));
    b64[30] = old;

    /* modified/malformed crc */
    len = snprintf(msg, sizeof(msg), "%s\n\n%s\n=miZq\n%s\n", HDR, b64, FTR);
    assert_false(try_dearmor(msg, len));
    len = snprintf(msg, sizeof(msg), "%s\n\n%s\nmiZp\n%s\n", HDR, b64, FTR);
    assert_false(try_dearmor(msg, len));
    len = snprintf(msg, sizeof(msg), "%s\n\n%s\n==miZp\n%s\n", HDR, b64, FTR);
    assert_false(try_dearmor(msg, len));
    len = snprintf(msg, sizeof(msg), "%s\n\n%s\n=miZpp\n%s\n", HDR, b64, FTR);
    assert_false(try_dearmor(msg, len));
}

static void
add_openpgp_layers(const char *msg, pgp_dest_t &pgpdst, int compr, int encr)
{
    pgp_source_t src = {};
    pgp_dest_t   dst = {};

    assert_rnp_success(init_mem_src(&src, msg, strlen(msg), false));
    assert_rnp_success(init_mem_dest(&dst, NULL, 0));
    assert_rnp_success(rnp_wrap_src(src, dst, "message.txt", time(NULL)));
    src_close(&src);
    assert_rnp_success(init_mem_src(&src, mem_dest_own_memory(&dst), dst.writeb, true));
    dst_close(&dst, false);

    /* add compression layers */
    for (int i = 0; i < compr; i++) {
        pgp_compression_type_t alg = (pgp_compression_type_t)((i % 3) + 1);
        assert_rnp_success(init_mem_dest(&dst, NULL, 0));
        assert_rnp_success(rnp_compress_src(src, dst, alg, 9));
        src_close(&src);
        assert_rnp_success(init_mem_src(&src, mem_dest_own_memory(&dst), dst.writeb, true));
        dst_close(&dst, false);
    }

    /* add encryption layers */
    for (int i = 0; i < encr; i++) {
        assert_rnp_success(init_mem_dest(&dst, NULL, 0));
        assert_rnp_success(rnp_raw_encrypt_src(src, dst, "password"));
        src_close(&src);
        assert_rnp_success(init_mem_src(&src, mem_dest_own_memory(&dst), dst.writeb, true));
        dst_close(&dst, false);
    }

    assert_rnp_success(init_mem_dest(&pgpdst, NULL, 0));
    assert_rnp_success(dst_write_src(&src, &pgpdst));
    src_close(&src);
}

TEST_F(rnp_tests, test_stream_deep_packet_nesting)
{
    const char *message = "message";
    pgp_dest_t  dst = {};

    /* add 30 compression layers and 2 encryption - must fail */
    add_openpgp_layers(message, dst, 30, 2);
#ifdef DUMP_TEST_CASE
    /* remove ifdef if you want to write it to stdout */
    pgp_source_t src = {};
    assert_rnp_success(init_mem_src(&src, mem_dest_get_memory(&dst), dst.writeb, false));
    pgp_dest_t outdst = {};
    assert_rnp_success(init_stdout_dest(&outdst));
    assert_rnp_success(rnp_armor_source(&src, &outdst, PGP_ARMORED_MESSAGE));
    dst_close(&outdst, false);
    src_close(&src);
#endif
    /* decrypt it via FFI for less code */
    rnp_ffi_t ffi = NULL;
    rnp_ffi_create(&ffi, "GPG", "GPG");
    assert_rnp_success(
      rnp_ffi_set_pass_provider(ffi, ffi_string_password_provider, (void *) "password"));

    rnp_input_t input = NULL;
    assert_rnp_success(rnp_input_from_memory(
      &input, (const uint8_t *) mem_dest_get_memory(&dst), dst.writeb, false));
    rnp_output_t output = NULL;
    assert_rnp_success(rnp_output_to_memory(&output, 0));
    assert_rnp_failure(rnp_decrypt(ffi, input, output));
    rnp_input_destroy(input);
    rnp_output_destroy(output);
    dst_close(&dst, false);

    /* add  27 compression & 4 encryption layers - must succeed */
    add_openpgp_layers("message", dst, 27, 4);
#ifdef DUMP_TEST_CASE
    /* remove ifdef if you want to write it to stdout */
    assert_rnp_success(init_mem_src(&src, mem_dest_get_memory(&dst), dst.writeb, false));
    assert_rnp_success(init_stdout_dest(&outdst));
    assert_rnp_success(rnp_armor_source(&src, &outdst, PGP_ARMORED_MESSAGE));
    dst_close(&outdst, false);
    src_close(&src);
#endif
    /* decrypt it via FFI for less code */
    assert_rnp_success(rnp_input_from_memory(
      &input, (const uint8_t *) mem_dest_get_memory(&dst), dst.writeb, false));
    assert_rnp_success(rnp_output_to_memory(&output, 0));
    assert_rnp_success(rnp_decrypt(ffi, input, output));
    rnp_input_destroy(input);
    /* check output */
    uint8_t *buf = NULL;
    size_t   len = 0;
    assert_rnp_success(rnp_output_memory_get_buf(output, &buf, &len, false));
    assert_int_equal(strlen(message), len);
    assert_int_equal(memcmp(buf, message, len), 0);

    rnp_output_destroy(output);
    dst_close(&dst, false);

    rnp_ffi_destroy(ffi);
}
