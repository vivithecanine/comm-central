/*
 * Copyright (c) 2017-2020, [Ribose Inc](https://www.ribose.com).
 * Copyright (c) 2009 The NetBSD Foundation, Inc.
 * All rights reserved.
 *
 * This code is originally derived from software contributed to
 * The NetBSD Foundation by Alistair Crooks (agc@netbsd.org), and
 * carried further by Ribose Inc (https://www.ribose.com).
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * ``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED
 * TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDERS OR CONTRIBUTORS
 * BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */
/*
 * Copyright (c) 2005-2008 Nominet UK (www.nic.uk)
 * All rights reserved.
 * Contributors: Ben Laurie, Rachel Willmer. The Contributors have asserted
 * their moral rights under the UK Copyright Design and Patents Act 1988 to
 * be recorded as the authors of this copyright work.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License.
 *
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
#ifndef TYPES_H_
#define TYPES_H_

#include <stdint.h>
#include <string>
#include <vector>
#include <array>
#include <cstring>

#include <rnp/rnp_def.h>
#include "list.h"
#include "crypto/common.h"

/* SHA1 Hash Size */
#define PGP_SHA1_HASH_SIZE 20

/* Maximum length of the packet header */
#define PGP_MAX_HEADER_SIZE 6

/** pgp_map_t
 */
typedef struct {
    int         type;
    const char *string;
} pgp_map_t;

typedef struct {
    uint8_t     mask;
    const char *string;
} pgp_bit_map_t;

typedef struct pgp_crypt_t pgp_crypt_t;

/** pgp_hash_t */
typedef struct pgp_hash_t pgp_hash_t;

/** Revocation Reason type */
typedef uint8_t pgp_ss_rr_code_t;

/** pgp_fingerprint_t */
typedef struct pgp_fingerprint_t {
    uint8_t  fingerprint[PGP_FINGERPRINT_SIZE];
    unsigned length;
    bool     operator==(const pgp_fingerprint_t &src) const;
    bool     operator!=(const pgp_fingerprint_t &src) const;
} pgp_fingerprint_t;

namespace std {
template <> struct hash<pgp_fingerprint_t> {
    std::size_t
    operator()(pgp_fingerprint_t const &fp) const noexcept
    {
        /* since fingerprint value is hash itself, we may use it's low bytes */
        size_t res = 0;
        std::memcpy(&res, fp.fingerprint, sizeof(res));
        return res;
    }
};
} // namespace std

typedef std::array<uint8_t, PGP_KEY_GRIP_SIZE> pgp_key_grip_t;

typedef std::array<uint8_t, PGP_KEY_ID_SIZE> pgp_key_id_t;

namespace rnp {
class rnp_exception : public std::exception {
    rnp_result_t code_;

  public:
    rnp_exception(rnp_result_t code = RNP_ERROR_GENERIC) : code_(code){};
    virtual const char *
    what() const throw()
    {
        return "rnp_exception";
    };
    rnp_result_t
    code()
    {
        return code_;
    };
};
} // namespace rnp

/**
 * Type to keep public/secret key mpis without any openpgp-dependent data.
 */
typedef struct pgp_key_material_t {
    pgp_pubkey_alg_t alg;    /* algorithm of the key */
    bool             secret; /* secret part of the key material is populated */

    union {
        pgp_rsa_key_t rsa;
        pgp_dsa_key_t dsa;
        pgp_eg_key_t  eg;
        pgp_ec_key_t  ec;
    };
} pgp_key_material_t;

/**
 * Type to keep signature without any openpgp-dependent data.
 */
typedef struct pgp_signature_material_t {
    union {
        pgp_rsa_signature_t rsa;
        pgp_dsa_signature_t dsa;
        pgp_ec_signature_t  ecc;
        pgp_eg_signature_t  eg;
    };
} pgp_signature_material_t;

/**
 * Type to keep pk-encrypted data without any openpgp-dependent data.
 */
typedef struct pgp_encrypted_material_t {
    union {
        pgp_rsa_encrypted_t  rsa;
        pgp_eg_encrypted_t   eg;
        pgp_sm2_encrypted_t  sm2;
        pgp_ecdh_encrypted_t ecdh;
    };
} pgp_encrypted_material_t;

typedef struct pgp_s2k_t {
    pgp_s2k_usage_t usage{};

    /* below fields may not all be valid, depending on the usage field above */
    pgp_s2k_specifier_t specifier{};
    pgp_hash_alg_t      hash_alg{};
    uint8_t             salt[PGP_SALT_SIZE];
    unsigned            iterations{};
    /* GnuPG custom s2k data */
    pgp_s2k_gpg_extension_t gpg_ext_num{};
    uint8_t                 gpg_serial_len{};
    uint8_t                 gpg_serial[16];
    /* Experimental s2k data */
    std::vector<uint8_t> experimental{};
} pgp_s2k_t;

typedef struct pgp_key_protection_t {
    pgp_s2k_t         s2k{};         /* string-to-key kdf params */
    pgp_symm_alg_t    symm_alg{};    /* symmetric alg */
    pgp_cipher_mode_t cipher_mode{}; /* block cipher mode */
    uint8_t           iv[PGP_MAX_BLOCK_SIZE];
} pgp_key_protection_t;

/** Struct to hold a key packet. May contain public or private key/subkey */
typedef struct pgp_key_pkt_t {
    pgp_pkt_type_t   tag;           /* packet tag: public key/subkey or private key/subkey */
    pgp_version_t    version;       /* Key packet version */
    uint32_t         creation_time; /* Key creation time */
    pgp_pubkey_alg_t alg;
    uint16_t         v3_days; /* v2/v3 validity time */

    uint8_t *hashed_data; /* key's hashed data used for signature calculation */
    size_t   hashed_len;

    pgp_key_material_t material;

    /* secret key data, if available. sec_len == 0, sec_data == NULL for public key/subkey */
    pgp_key_protection_t sec_protection;
    uint8_t *            sec_data;
    size_t               sec_len;

    pgp_key_pkt_t()
        : tag(PGP_PKT_RESERVED), version(PGP_VUNKNOWN), creation_time(0), alg(PGP_PKA_NOTHING),
          v3_days(0), hashed_data(NULL), hashed_len(0), material({}), sec_protection({}),
          sec_data(NULL), sec_len(0){};
    pgp_key_pkt_t(const pgp_key_pkt_t &src, bool pubonly = false);
    pgp_key_pkt_t(pgp_key_pkt_t &&src);
    pgp_key_pkt_t &operator=(pgp_key_pkt_t &&src);
    pgp_key_pkt_t &operator=(const pgp_key_pkt_t &src);
    ~pgp_key_pkt_t();
} pgp_key_pkt_t;

typedef struct pgp_key_t pgp_key_t;

/** Struct to hold userid or userattr packet. We don't parse userattr now, just storing the
 *  binary blob as it is. It may be distinguished by tag field.
 */
typedef struct pgp_userid_pkt_t {
    pgp_pkt_type_t tag;
    uint8_t *      uid;
    size_t         uid_len;

    pgp_userid_pkt_t() : tag(PGP_PKT_RESERVED), uid(NULL), uid_len(0){};
    pgp_userid_pkt_t(const pgp_userid_pkt_t &src);
    pgp_userid_pkt_t(pgp_userid_pkt_t &&src);
    pgp_userid_pkt_t &operator=(pgp_userid_pkt_t &&src);
    pgp_userid_pkt_t &operator=(const pgp_userid_pkt_t &src);
    bool              operator==(const pgp_userid_pkt_t &src) const;
    bool              operator!=(const pgp_userid_pkt_t &src) const;
    ~pgp_userid_pkt_t();
} pgp_userid_pkt_t;

typedef struct pgp_signature_t pgp_signature_t;

/* Signature subpacket, see 5.2.3.1 in RFC 4880 and RFC 4880 bis 02 */
typedef struct pgp_sig_subpkt_t {
    pgp_sig_subpacket_type_t type;         /* type of the subpacket */
    size_t                   len;          /* length of the data */
    uint8_t *                data;         /* raw subpacket data, excluding the header */
    bool                     critical : 1; /* critical flag */
    bool                     hashed : 1;   /* whether subpacket is hashed or not */
    bool                     parsed : 1;   /* whether subpacket was successfully parsed */
    union {
        uint32_t create; /* 5.2.3.4.   Signature Creation Time */
        uint32_t expiry; /* 5.2.3.6.   Key Expiration Time */
                         /* 5.2.3.10.  Signature Expiration Time */
        bool exportable; /* 5.2.3.11.  Exportable Certification */
        struct {
            uint8_t level;
            uint8_t amount;
        } trust; /* 5.2.3.13.  Trust Signature */
        struct {
            const char *str;
            unsigned    len;
        } regexp;       /* 5.2.3.14.  Regular Expression */
        bool revocable; /* 5.2.3.12.  Revocable */
        struct {
            uint8_t *arr;
            unsigned len;
        } preferred; /* 5.2.3.7.  Preferred Symmetric Algorithms */
                     /* 5.2.3.8.  Preferred Hash Algorithms */
                     /* 5.2.3.9.  Preferred Compression Algorithms */
        struct {
            uint8_t          klass;
            pgp_pubkey_alg_t pkalg;
            uint8_t *        fp;
        } revocation_key; /* 5.2.3.15.  Revocation Key */
        uint8_t *issuer;  /* 5.2.3.5.   Issuer */
        struct {
            uint8_t     flags[4];
            unsigned    nlen;
            unsigned    vlen;
            const char *name;
            const char *value;
        } notation; /* 5.2.3.16.  Notation Data */
        struct {
            bool no_modify;
        } ks_prefs; /* 5.2.3.17.  Key Server Preferences */
        struct {
            const char *uri;
            unsigned    len;
        } preferred_ks;   /* 5.2.3.18.  Preferred Key Server */
        bool primary_uid; /* 5.2.3.19.  Primary User ID */
        struct {
            const char *uri;
            unsigned    len;
        } policy;          /* 5.2.3.20.  Policy URI */
        uint8_t key_flags; /* 5.2.3.21.  Key Flags */
        struct {
            const char *uid;
            unsigned    len;
        } signer; /* 5.2.3.22.  Signer's User ID */
        struct {
            pgp_revocation_type_t code;
            const char *          str;
            unsigned              len;
        } revocation_reason; /* 5.2.3.23.  Reason for Revocation */
        uint8_t features;    /* 5.2.3.24.  Features */
        struct {
            pgp_pubkey_alg_t pkalg;
            pgp_hash_alg_t   halg;
            uint8_t *        hash;
            unsigned         hlen;
        } sig_target;         /* 5.2.3.25.  Signature Target */
        pgp_signature_t *sig; /* 5.2.3.27. Embedded Signature */
        struct {
            uint8_t  version;
            uint8_t *fp;
            unsigned len;
        } issuer_fp; /* 5.2.3.28.  Issuer Fingerprint, RFC 4880 bis 04 */
    } fields;        /* parsed contents of the subpacket */

    pgp_sig_subpkt_t()
        : type(PGP_SIG_SUBPKT_UNKNOWN), len(0), data(NULL), critical(false), hashed(false),
          parsed(false), fields({}){};
    pgp_sig_subpkt_t(const pgp_sig_subpkt_t &src);
    pgp_sig_subpkt_t(pgp_sig_subpkt_t &&src);
    pgp_sig_subpkt_t &operator=(pgp_sig_subpkt_t &&src);
    pgp_sig_subpkt_t &operator=(const pgp_sig_subpkt_t &src);
    ~pgp_sig_subpkt_t();
} pgp_sig_subpkt_t;

typedef struct pgp_one_pass_sig_t pgp_one_pass_sig_t;

typedef struct pgp_signature_t {
  private:
    pgp_sig_type_t       type_;
    std::vector<uint8_t> preferred(pgp_sig_subpacket_type_t type) const;
    void set_preferred(const std::vector<uint8_t> &data, pgp_sig_subpacket_type_t type);

  public:
    pgp_version_t version;
    /* common v3 and v4 fields */
    pgp_pubkey_alg_t palg;
    pgp_hash_alg_t   halg;
    uint8_t          lbits[2];
    uint8_t *        hashed_data;
    size_t           hashed_len;
    uint8_t *        material_buf; /* raw signature material */
    size_t           material_len; /* raw signature material length */

    /* v3 - only fields */
    uint32_t     creation_time;
    pgp_key_id_t signer;

    /* v4 - only fields */
    std::vector<pgp_sig_subpkt_t> subpkts;

    pgp_signature_t()
        : type_(PGP_SIG_BINARY), version(PGP_VUNKNOWN), palg(PGP_PKA_NOTHING),
          halg(PGP_HASH_UNKNOWN), hashed_data(NULL), hashed_len(0), material_buf(NULL),
          material_len(0), creation_time(0){};
    pgp_signature_t(const pgp_signature_t &src);
    pgp_signature_t(pgp_signature_t &&src);
    pgp_signature_t &operator=(pgp_signature_t &&src);
    pgp_signature_t &operator=(const pgp_signature_t &src);
    bool             operator==(const pgp_signature_t &src) const;
    bool             operator!=(const pgp_signature_t &src) const;
    ~pgp_signature_t();

    /* @brief Get signature's type */
    pgp_sig_type_t
    type() const
    {
        return type_;
    };
    void
    set_type(pgp_sig_type_t atype)
    {
        type_ = atype;
    };

    /**
     * @brief Get v4 signature's subpacket of the specified type and hashedness.
     * @param stype subpacket type.
     * @param hashed If true (default), then will search for subpacket only in hashed (i.e.
     * covered by signature) area, otherwise will search in both hashed and non-hashed areas.
     * @return pointer to the subpacket, or NULL if subpacket was not found.
     */
    pgp_sig_subpkt_t *      get_subpkt(pgp_sig_subpacket_type_t stype, bool hashed = true);
    const pgp_sig_subpkt_t *get_subpkt(pgp_sig_subpacket_type_t stype,
                                       bool                     hashed = true) const;
    /* @brief Check whether v4 signature has subpacket of the specified type/hashedness */
    bool has_subpkt(pgp_sig_subpacket_type_t stype, bool hashed = true) const;
    /* @brief Check whether signature has signing key id (via v3 field, or v4 key id/key fp
     * subpacket) */
    bool has_keyid() const;
    /**
     * @brief Get signer's key id if available. Availability may be checked via has_keyid().
     * @return signer's key id if available, or throws an exception otherwise.
     */
    pgp_key_id_t keyid() const;
    /** @brief Set the signer's key id for the signature being populated. Version should be set
     *         prior of setting key id. */
    void set_keyid(const pgp_key_id_t &id);
    /**
     * @brief Check whether signature has valid issuer fingerprint subpacket.
     * @return true if there is one, and it can be safely returned via keyfp() method or false
     *         otherwise.
     */
    bool has_keyfp() const;
    /**
     * @brief Get signing key's fingerprint if it is available. Availability may be checked via
     *        has_keyfp() method.
     * @return fingerprint or throws an error if it is unavailable.
     */
    pgp_fingerprint_t keyfp() const;

    /** @brief Set signing key's fingerprint. Works only for signatures with version 4 and up,
     *         so version should be set prior to fingerprint. */
    void set_keyfp(const pgp_fingerprint_t &fp);

    /**
     * @brief Get signature's creation time
     * @return time in seconds since the Jan 1, 1970 UTC. 0 is the default value and returned
     *         even if creation time is not available
     */
    uint32_t creation() const;

    /**
     * @brief Set signature's creation time
     * @param ctime creation time in seconds since the Jan 1, 1970 UTC.
     */
    void set_creation(uint32_t ctime);

    /**
     * @brief Get the signature's expiration time
     * @return expiration time in seconds since the creation time. 0 if signature never
     * expires.
     */
    uint32_t expiration() const;

    /**
     * @brief Set the signature's expiration time
     * @param etime expiration time
     */
    void set_expiration(uint32_t etime);

    /**
     * @brief Get the key expiration time
     * @return expiration time in seconds since the creation time. 0 if key never expires.
     */
    uint32_t key_expiration() const;

    /**
     * @brief Set the key expiration time
     * @param etime expiration time
     */
    void set_key_expiration(uint32_t etime);

    /**
     * @brief Get the key flags
     * @return byte of key flags. If there is no corresponding subpackets then 0 is returned.
     */
    uint8_t key_flags() const;

    /**
     * @brief Set the key flags
     * @param flags byte of key flags
     */
    void set_key_flags(uint8_t flags);

    /**
     * @brief Get the primary user id flag
     * @return true if user id is marked as primary or false otherwise
     */
    bool primary_uid() const;

    /**
     * @brief Set the primary user id flag
     * @param primary true if user id should be marked as primary
     */
    void set_primary_uid(bool primary);

    /** @brief Get preferred symmetric algorithms if any. If there are no ones then empty
     *         vector is returned. */
    std::vector<uint8_t> preferred_symm_algs() const;

    /** @brief Set the preferred symmetric algorithms. If empty vector is passed then
     *         corresponding subpacket is deleted. */
    void set_preferred_symm_algs(const std::vector<uint8_t> &algs);

    /** @brief Get preferred hash algorithms if any. If there are no ones then empty vector is
     *         returned.*/
    std::vector<uint8_t> preferred_hash_algs() const;

    /** @brief Set the preferred hash algorithms. If empty vector is passed then corresponding
     *         subpacket is deleted. */
    void set_preferred_hash_algs(const std::vector<uint8_t> &algs);

    /** @brief Get preferred compression algorithms if any. If there are no ones then empty
     *         vector is returned.*/
    std::vector<uint8_t> preferred_z_algs() const;

    /** @brief Set the preferred compression algorithms. If empty vector is passed then
     *         corresponding subpacket is deleted. */
    void set_preferred_z_algs(const std::vector<uint8_t> &algs);

    /** @brief Get key server preferences flags. If subpacket is not available then 0 is
     *         returned. */
    uint8_t key_server_prefs() const;

    /** @brief Set key server preferences flags. */
    void set_key_server_prefs(uint8_t prefs);

    /** @brief Get preferred key server URI, if available. Otherwise empty string is returned.
     */
    std::string key_server() const;

    /** @brief Set preferred key server URI. If it is empty string then subpacket is deleted if
     *         it is available. */
    void set_key_server(const std::string &uri);

    /** @brief Get trust level, if available. Otherwise will return 0. See RFC 4880, 5.2.3.14.
     *         for the detailed information on trust level and amount.
     */
    uint8_t trust_level() const;

    /** @brief Get trust amount, if available. Otherwise will return 0. See RFC 4880, 5.2.3.14.
     *         for the detailed information on trust level and amount.
     */
    uint8_t trust_amount() const;

    /** @brief Set the trust level and amount. See RFC 4880, 5.2.3.14.
     *         for the detailed information on trust level and amount.
     */
    void set_trust(uint8_t level, uint8_t amount);

    /** @brief check whether signature is revocable. True by default.
     */
    bool revocable() const;

    /** @brief Set the signature's revocability status.
     */
    void set_revocable(bool status);

    /** @brief Get the key/subkey revocation reason in humand-readable form. If there is no
     * revocation reason subpacket, then empty string will be returned.
     */
    std::string revocation_reason() const;

    /** @brief Get the key/subkey revocation code. If there is no revocation reason subpacket,
     *         then PGP_REVOCATION_NO_REASON will be rerturned. See the RFC 4880, 5.2.3.24 for
     *         the detailed explanation.
     */
    pgp_revocation_type_t revocation_code() const;

    /** @brief Set the revocation reason and code for key/subkey revocation signature. See the
     *         RFC 4880, 5.2.3.24 for the detailed explanation.
     */
    void set_revocation_reason(pgp_revocation_type_t code, const std::string &reason);

    /**
     * @brief Check whether signer's key supports certain feature(s). Makes sense only for
     * self-signature, for more details see the RFC 4880bis, 5.2.3.25. If there is no
     * corresponding subpacket then false will be returned.
     * @param flags one or more flags, combined via bitwise OR operation.
     * @return true if key is claimed to support all of the features listed in flags, or false
     * otherwise
     */
    bool key_has_features(pgp_key_feature_t flags) const;

    /**
     * @brief Set the features supported by the signer's key, makes sense only for
     * self-signature. For more details see the RFC 4880bis, 5.2.3.25.
     * @param flags one or more flags, combined via bitwise OR operation.
     */
    void set_key_features(pgp_key_feature_t flags);

    /** @brief Get signer's user id, if available. Otherwise empty string is returned. See the
     *         RFC 4880bis, 5.2.3.23 for details.
     */
    std::string signer_uid() const;

    /**
     * @brief Set the signer's uid, responcible for the signature creation. See the RFC
     * 4880bis, 5.2.3.23 for details.
     */
    void set_signer_uid(const std::string &uid);

    /**
     * @brief Add subpacket of the specified type to v4 signature
     * @param type type of the subpacket
     * @param datalen length of the subpacket body
     * @param reuse replace already existing subpacket of the specified type if any
     * @return reference to the subpacket structure or throws an exception
     */
    pgp_sig_subpkt_t &add_subpkt(pgp_sig_subpacket_type_t type, size_t datalen, bool reuse);

    /**
     * @brief Remove signature's subpacket
     * @param subpkt subpacket to remove. If not in the subpackets list then no action is
     * taken.
     */
    void remove_subpkt(pgp_sig_subpkt_t *subpkt);

    /**
     * @brief Check whether signature packet matches one-pass signature packet.
     * @param onepass reference to the read one-pass signature packet
     * @return true if sig corresponds to onepass or false otherwise
     */
    bool matches_onepass(const pgp_one_pass_sig_t &onepass) const;
} pgp_signature_t;

/** pgp_rawpacket_t */
typedef struct pgp_rawpacket_t {
    pgp_pkt_type_t       tag;
    std::vector<uint8_t> raw;

    pgp_rawpacket_t() = default;
    pgp_rawpacket_t(const uint8_t *data, size_t len, pgp_pkt_type_t tag)
        : tag(tag),
          raw(data ? std::vector<uint8_t>(data, data + len) : std::vector<uint8_t>()){};
    pgp_rawpacket_t(const pgp_signature_t &sig);
    pgp_rawpacket_t(pgp_key_pkt_t &key);
    pgp_rawpacket_t(const pgp_userid_pkt_t &uid);
} pgp_rawpacket_t;

typedef enum {
    /* first octet */
    PGP_KEY_SERVER_NO_MODIFY = 0x80
} pgp_key_server_prefs_t;

/** pgp_one_pass_sig_t */
typedef struct pgp_one_pass_sig_t {
    uint8_t          version;
    pgp_sig_type_t   type;
    pgp_hash_alg_t   halg;
    pgp_pubkey_alg_t palg;
    pgp_key_id_t     keyid;
    unsigned         nested;
} pgp_one_pass_sig_t;

typedef struct pgp_literal_hdr_t {
    uint8_t  format;
    char     fname[256];
    uint8_t  fname_len;
    uint32_t timestamp;
} pgp_literal_hdr_t;

typedef struct pgp_aead_hdr_t {
    int            version;                    /* version of the AEAD packet */
    pgp_symm_alg_t ealg;                       /* underlying symmetric algorithm */
    pgp_aead_alg_t aalg;                       /* AEAD algorithm, i.e. EAX, OCB, etc */
    int            csize;                      /* chunk size bits */
    uint8_t        iv[PGP_AEAD_MAX_NONCE_LEN]; /* initial vector for the message */
    size_t         ivlen;                      /* iv length */
} pgp_aead_hdr_t;

/** litdata_type_t */
typedef enum {
    PGP_LDT_BINARY = 'b',
    PGP_LDT_TEXT = 't',
    PGP_LDT_UTF8 = 'u',
    PGP_LDT_LOCAL = 'l',
    PGP_LDT_LOCAL2 = '1'
} pgp_litdata_enum;

/** public-key encrypted session key packet */
typedef struct pgp_pk_sesskey_t {
    unsigned         version{};
    pgp_key_id_t     key_id{};
    pgp_pubkey_alg_t alg{};

    pgp_encrypted_material_t material{};
} pgp_pk_sesskey_t;

/** pkp_sk_sesskey_t */
typedef struct pgp_sk_sesskey_t {
    unsigned       version{};
    pgp_symm_alg_t alg{};
    pgp_s2k_t      s2k{};
    uint8_t        enckey[PGP_MAX_KEY_SIZE + PGP_AEAD_MAX_TAG_LEN + 1]{};
    unsigned       enckeylen{};
    /* v5 specific fields */
    pgp_aead_alg_t aalg{};
    uint8_t        iv[PGP_MAX_BLOCK_SIZE]{};
    unsigned       ivlen{};
} pgp_sk_sesskey_t;

/* user revocation info */
typedef struct pgp_revoke_t {
    uint32_t              uid;    /* index in uid array */
    pgp_revocation_type_t code;   /* revocation code */
    std::string           reason; /* revocation reason */
} pgp_revoke_t;

typedef struct pgp_user_prefs_t {
    // preferred symmetric algs (pgp_symm_alg_t)
    std::vector<uint8_t> symm_algs{};
    // preferred hash algs (pgp_hash_alg_t)
    std::vector<uint8_t> hash_algs{};
    // preferred compression algs (pgp_compression_type_t)
    std::vector<uint8_t> z_algs{};
    // key server preferences (pgp_key_server_prefs_t)
    std::vector<uint8_t> ks_prefs{};
    // preferred key server
    std::string key_server{};

    void set_symm_algs(const std::vector<uint8_t> &algs);
    void add_symm_alg(pgp_symm_alg_t alg);
    void set_hash_algs(const std::vector<uint8_t> &algs);
    void add_hash_alg(pgp_hash_alg_t alg);
    void set_z_algs(const std::vector<uint8_t> &algs);
    void add_z_alg(pgp_compression_type_t alg);
    void set_ks_prefs(const std::vector<uint8_t> &prefs);
    void add_ks_pref(pgp_key_server_prefs_t pref);
} pgp_user_prefs_t;

/** information about the signature */
typedef struct pgp_subsig_t {
    uint32_t         uid;         /* index in userid array in key for certification sig */
    pgp_signature_t  sig;         /* signature packet */
    pgp_rawpacket_t  rawpkt;      /* signature's rawpacket */
    uint8_t          trustlevel;  /* level of trust */
    uint8_t          trustamount; /* amount of trust */
    uint8_t          key_flags;   /* key flags for certification/direct key sig */
    pgp_user_prefs_t prefs;       /* user preferences for certification sig */
    bool             validated;   /* signature was validated */
    bool             valid;       /* signature was validated and is valid */
} pgp_subsig_t;

typedef struct pgp_userid_t {
    pgp_userid_pkt_t pkt;    /* User ID or User Attribute packet as it was loaded */
    pgp_rawpacket_t  rawpkt; /* Raw packet contents */
    std::string      str;    /* Human-readable representation of the userid */
} pgp_userid_t;

struct rnp_keygen_ecc_params_t {
    pgp_curve_t curve;
};

struct rnp_keygen_rsa_params_t {
    uint32_t modulus_bit_len;
};

struct rnp_keygen_dsa_params_t {
    size_t p_bitlen;
    size_t q_bitlen;
};

struct rnp_keygen_elgamal_params_t {
    size_t key_bitlen;
};

/* structure used to hold context of key generation */
typedef struct rnp_keygen_crypto_params_t {
    // Asymmteric algorithm that user requesed key for
    pgp_pubkey_alg_t key_alg;
    // Hash to be used for key signature
    pgp_hash_alg_t hash_alg;
    // Pointer to initialized RNG engine
    rng_t *rng;
    union {
        struct rnp_keygen_ecc_params_t     ecc;
        struct rnp_keygen_rsa_params_t     rsa;
        struct rnp_keygen_dsa_params_t     dsa;
        struct rnp_keygen_elgamal_params_t elgamal;
    };
} rnp_keygen_crypto_params_t;

typedef struct rnp_selfsig_cert_info_t {
    uint8_t          userid[MAX_ID_LENGTH]{}; /* userid, required */
    uint8_t          key_flags{};             /* key flags */
    uint32_t         key_expiration{}; /* key expiration time (sec), 0 = no expiration */
    pgp_user_prefs_t prefs{};          /* user preferences, optional */
    bool             primary : 1;      /* mark this as the primary user id */
} rnp_selfsig_cert_info_t;

typedef struct rnp_selfsig_binding_info_t {
    uint8_t  key_flags;
    uint32_t key_expiration;
} rnp_selfsig_binding_info_t;

typedef struct rnp_keygen_primary_desc_t {
    rnp_keygen_crypto_params_t crypto{};
    rnp_selfsig_cert_info_t    cert{};
} rnp_keygen_primary_desc_t;

typedef struct rnp_keygen_subkey_desc_t {
    rnp_keygen_crypto_params_t crypto;
    rnp_selfsig_binding_info_t binding;
} rnp_keygen_subkey_desc_t;

typedef struct rnp_key_protection_params_t {
    pgp_symm_alg_t    symm_alg;
    pgp_cipher_mode_t cipher_mode;
    unsigned          iterations;
    pgp_hash_alg_t    hash_alg;
} rnp_key_protection_params_t;

typedef struct rnp_action_keygen_t {
    struct {
        rnp_keygen_primary_desc_t   keygen;
        rnp_key_protection_params_t protection;
    } primary;
    struct {
        rnp_keygen_subkey_desc_t    keygen;
        rnp_key_protection_params_t protection;
    } subkey;
} rnp_action_keygen_t;

#endif /* TYPES_H_ */
