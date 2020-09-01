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

#ifndef STREAM_SIG_H_
#define STREAM_SIG_H_

#include <stdint.h>
#include <stdbool.h>
#include <sys/types.h>
#include "rnp.h"
#include "stream-common.h"

/* information about the validated signature */
typedef struct pgp_signature_info_t {
    pgp_signature_t *sig;       /* signature, or NULL if there were parsing error */
    pgp_key_t *      signer;    /* signer's public key if found */
    bool             valid;     /* signature is cryptographically valid (but may be expired) */
    bool             unknown;   /* signature is unknown - parsing error, wrong version, etc */
    bool             no_signer; /* no signer's public key available */
    bool             expired;   /* signature is expired */
    bool             signer_valid;  /* assume that signing key is valid */
    bool             ignore_expiry; /* ignore signer's key expiration time */
} pgp_signature_info_t;

typedef std::vector<pgp_signature_t> pgp_signature_list_t;

/**
 * @brief Check whether signature packet matches one-pass signature packet.
 * @param sig pointer to the read signature packet
 * @param onepass pointer to the read one-pass signature packet
 * @return true if sig corresponds to onepass or false otherwise
 */
bool signature_matches_onepass(pgp_signature_t *sig, pgp_one_pass_sig_t *onepass);

/**
 * @brief Get v4 signature's subpacket of the specified type
 * @param sig loaded or populated signature, could not be NULL
 * @param type type of the subpacket to lookup for
 * @return pointer to the subpacket structure or NULL if it was not found or error occurred
 */
pgp_sig_subpkt_t *signature_get_subpkt(pgp_signature_t *sig, pgp_sig_subpacket_type_t type);
const pgp_sig_subpkt_t *signature_get_subpkt(const pgp_signature_t *  sig,
                                             pgp_sig_subpacket_type_t type);

/**
 * @brief Add subpacket of the specified type to v4 signature
 * @param sig loaded or populated signature, could not be NULL
 * @param type type of the subpacket
 * @param datalen length of the subpacket body
 * @param reuse replace already existing subpacket of the specified type if any
 * @return pointer to the subpacket structure or NULL if error occurred
 */
pgp_sig_subpkt_t *signature_add_subpkt(pgp_signature_t *        sig,
                                       pgp_sig_subpacket_type_t type,
                                       size_t                   datalen,
                                       bool                     reuse);

/**
 * @brief Remove signature's subpacket
 * @param sig loaded or populated signature, could not be NULL
 * @param subpkt subpacket to remove. If not in the subpackets list then no action is taken.
 */
void signature_remove_subpkt(pgp_signature_t *sig, pgp_sig_subpkt_t *subpkt);

/**
 * @brief Get type of the signature.
 * @param sig loaded or populated signature, could not be NULL
 * @return type of the signature
 */
pgp_sig_type_t signature_get_type(const pgp_signature_t *sig);

/**
 * @brief Check whether signature has signing key fingerprint
 * @param sig loaded or populated v4 signature, could not be NULL
 * @return true if fingerprint is available or false otherwise
 */
bool signature_has_keyfp(const pgp_signature_t *sig);

/**
 * @brief Get signing key's fingerprint if it is available
 * @param sig loaded or populated v4 signature, could not be NULL
 * @param fp reference to the fingerprint structure
 * @return true if fingerprint is available and returned or false otherwise
 */
bool signature_get_keyfp(const pgp_signature_t *sig, pgp_fingerprint_t &fp);

/**
 * @brief Set signing key fingerprint
 * @param sig v4 signature being populated
 * @param fp fingerprint structure
 * @return true on success or false otherwise;
 */
bool signature_set_keyfp(pgp_signature_t *sig, const pgp_fingerprint_t &fp);

/**
 * @brief Check whether signature has signing key id
 * @param sig populated or loaded signature
 * @return true if key id available (via v3 field, or v4 key id/key fp subpacket)
 */
bool signature_has_keyid(const pgp_signature_t *sig);

/**
 * @brief Get signature's signing key id
 * @param sig populated or loaded signature
 * @param id reference to return key identifier
 * @return true on success or false otherwise
 */
bool signature_get_keyid(const pgp_signature_t *sig, pgp_key_id_t &id);

/**
 * @brief Set the signature's key id
 * @param sig signature being populated. Version should be set prior of setting key id.
 * @param id reference to key identifier
 * @return true on success or false otherwise
 */
bool signature_set_keyid(pgp_signature_t *sig, const pgp_key_id_t &id);

/**
 * @brief Get signature's creation time
 * @param sig pointer to the loaded or populated signature.
 * @return time in seconds since the Jan 1, 1970 UTC. 0 is the default value and returned even
 *         if creation time is not available
 */
uint32_t signature_get_creation(const pgp_signature_t *sig);

/**
 * @brief Set signature's creation time
 * @param sig signature being populated
 * @param ctime creation time in seconds since the Jan 1, 1970 UTC.
 * @return true on success or false otherwise
 */
bool signature_set_creation(pgp_signature_t *sig, uint32_t ctime);

/**
 * @brief Get the signature's expiration time
 * @param sig populated or loaded signature
 * @return expiration time in seconds since the creation time. 0 if signature never expires.
 */
uint32_t signature_get_expiration(const pgp_signature_t *sig);

/**
 * @brief Set the signature's expiration time
 * @param sig signature being populated
 * @param etime expiration time
 * @return true on success or false otherwise
 */
bool signature_set_expiration(pgp_signature_t *sig, uint32_t etime);

/**
 * @brief Check whether signature has key expiration
 * @param sig populated or loaded signature
 * @return true if signature has key expiration time or false otherwise
 */
bool signature_has_key_expiration(const pgp_signature_t *sig);

/**
 * @brief Get the key expiration time
 * @param sig populated or loaded signature
 * @return expiration time in seconds since the creation time. 0 if key never expires.
 */
uint32_t signature_get_key_expiration(const pgp_signature_t *sig);

/**
 * @brief Set the key expiration time
 * @param sig signature being populated
 * @param etime expiration time
 * @return true on success or false otherwise
 */
bool signature_set_key_expiration(pgp_signature_t *sig, uint32_t etime);

/**
 * @brief Check whether signature has key flags
 * @param sig populated or loaded signature
 * @return true if key flags are available or false otherwise
 */
bool signature_has_key_flags(const pgp_signature_t *sig);

/**
 * @brief Get the key flags
 * @param sig populated or loaded signature
 * @return byte of key flags. If there is no corresponding subpackets then 0 is returned.
 */
uint8_t signature_get_key_flags(const pgp_signature_t *sig);

/**
 * @brief Set the key flags
 * @param sig signature being populated
 * @param flags byte of key flags
 * @return true on success or false otherwise
 */
bool signature_set_key_flags(pgp_signature_t *sig, uint8_t flags);

/**
 * @brief Get the primary user id flag
 * @param sig populated or loaded signature
 * @return true if user id is marked as primary or false otherwise
 */
bool signature_get_primary_uid(pgp_signature_t *sig);

/**
 * @brief Set the primary user id flag
 * @param sig signature being populated
 * @param primary true if user id should be marked as primary
 * @return true on success or false otherwise
 */
bool signature_set_primary_uid(pgp_signature_t *sig, bool primary);

bool signature_has_preferred_symm_algs(const pgp_signature_t *sig);

bool signature_get_preferred_symm_algs(const pgp_signature_t *sig,
                                       uint8_t **             algs,
                                       size_t *               count);

bool signature_set_preferred_symm_algs(pgp_signature_t *sig, uint8_t algs[], size_t len);

bool signature_has_preferred_hash_algs(const pgp_signature_t *sig);

bool signature_get_preferred_hash_algs(const pgp_signature_t *sig,
                                       uint8_t **             algs,
                                       size_t *               count);

bool signature_set_preferred_hash_algs(pgp_signature_t *sig, uint8_t algs[], size_t len);

bool signature_has_preferred_z_algs(const pgp_signature_t *sig);

bool signature_get_preferred_z_algs(const pgp_signature_t *sig, uint8_t **algs, size_t *count);

bool signature_set_preferred_z_algs(pgp_signature_t *sig, uint8_t algs[], size_t len);

bool signature_has_key_server_prefs(const pgp_signature_t *sig);

uint8_t signature_get_key_server_prefs(const pgp_signature_t *sig);

bool signature_set_key_server_prefs(pgp_signature_t *sig, uint8_t prefs);

bool signature_set_preferred_key_server(pgp_signature_t *sig, const char *uri);

bool signature_has_trust(const pgp_signature_t *sig);

bool signature_get_trust(const pgp_signature_t *sig, uint8_t *level, uint8_t *amount);

bool signature_set_trust(pgp_signature_t *sig, uint8_t level, uint8_t amount);

bool signature_get_revocable(const pgp_signature_t *sig);

bool signature_set_revocable(pgp_signature_t *sig, bool revocable);

bool signature_set_features(pgp_signature_t *sig, uint8_t features);

bool signature_set_signer_uid(pgp_signature_t *sig, uint8_t *uid, size_t len);

bool signature_set_embedded_sig(pgp_signature_t *sig, pgp_signature_t *esig);

bool signature_add_notation_data(pgp_signature_t *sig,
                                 bool             readable,
                                 const char *     name,
                                 const char *     value);

bool signature_has_key_server(const pgp_signature_t *sig);

char *signature_get_key_server(const pgp_signature_t *sig);

bool signature_has_revocation_reason(const pgp_signature_t *sig);

bool signature_get_revocation_reason(const pgp_signature_t *sig,
                                     pgp_revocation_type_t *code,
                                     char **                reason);

bool signature_set_revocation_reason(pgp_signature_t *     sig,
                                     pgp_revocation_type_t code,
                                     const char *          reason);

/**
 * @brief Fill signature's hashed data. This includes all the fields from signature which are
 *        hashed after the previous document or key fields.
 * @param sig Signature being populated
 * @return true if sig->hashed_data is filled up correctly or false otherwise
 */
bool signature_fill_hashed_data(pgp_signature_t *sig);

/**
 * @brief Hash key packet. Used in signatures and v4 fingerprint calculation.
 * @param key key packet, must be populated
 * @param hash pointer to initialized hash context
 * @return true if sig->hashed_data is filled up correctly or false otherwise
 */
bool signature_hash_key(const pgp_key_pkt_t *key, pgp_hash_t *hash);

bool signature_hash_userid(const pgp_userid_pkt_t *uid,
                           pgp_hash_t *            hash,
                           pgp_version_t           sigver);

bool signature_hash_signature(pgp_signature_t *sig, pgp_hash_t *hash);

bool signature_hash_certification(const pgp_signature_t * sig,
                                  const pgp_key_pkt_t *   key,
                                  const pgp_userid_pkt_t *userid,
                                  pgp_hash_t *            hash);

bool signature_hash_binding(const pgp_signature_t *sig,
                            const pgp_key_pkt_t *  key,
                            const pgp_key_pkt_t *  subkey,
                            pgp_hash_t *           hash);

bool signature_hash_direct(const pgp_signature_t *sig,
                           const pgp_key_pkt_t *  key,
                           pgp_hash_t *           hash);

/**
 * @brief Check signature, including the expiration time, key validity and so on.
 *
 * @param sinfo populated signature info structure. Method will set flags valid, no_signer,
 *              expired.
 * @param hash populated hash
 * @return RNP_SUCCESS if all checks were passed, RNP_ERROR_SIGNATURE_INVALID for invalid sig,
 *         RNP_ERROR_SIGNATURE_EXPIRED for expired signature. Other error code means problems
 *         during the signature validation (out of memory, wrong parameters, etc).
 */
rnp_result_t signature_check(pgp_signature_info_t *sinfo, pgp_hash_t *hash);

rnp_result_t signature_check_certification(pgp_signature_info_t *  sinfo,
                                           const pgp_key_pkt_t *   key,
                                           const pgp_userid_pkt_t *uid);

rnp_result_t signature_check_binding(pgp_signature_info_t *sinfo,
                                     const pgp_key_pkt_t * key,
                                     pgp_key_t *           subkey);

rnp_result_t signature_check_direct(pgp_signature_info_t *sinfo, const pgp_key_pkt_t *key);

rnp_result_t signature_check_subkey_revocation(pgp_signature_info_t *sinfo,
                                               const pgp_key_pkt_t * key,
                                               const pgp_key_pkt_t * subkey);

/**
 * @brief Parse stream with signatures to the signatures list.
 *        Can handle binary or armored stream with signatures, including stream with multiple
 * armored signatures.
 *
 * @param src signatures stream, cannot be NULL.
 * @param sigs on success parsed signature structures will be put here.
 * @return RNP_SUCCESS or error code otherwise.
 */
rnp_result_t process_pgp_signatures(pgp_source_t *src, pgp_signature_list_t &sigs);

#endif
