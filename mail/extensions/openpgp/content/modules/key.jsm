/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailKey"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  EnigmailCryptoAPI: "chrome://openpgp/content/modules/cryptoAPI.jsm",
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  EnigmailKeyRing: "chrome://openpgp/content/modules/keyRing.jsm",
  EnigmailDialog: "chrome://openpgp/content/modules/dialog.jsm",
});

XPCOMUtils.defineLazyGetter(this, "l10n", () => {
  return new Localization(["messenger/openpgp/openpgp.ftl"], true);
});

var EnigmailKey = {
  /**
   * Format a key fingerprint
   * @fingerprint |string|  -  unformatted OpenPGP fingerprint
   *
   * @return |string| - formatted string
   */
  formatFpr(fingerprint) {
    //EnigmailLog.DEBUG("key.jsm: EnigmailKey.formatFpr(" + fingerprint + ")\n");
    // format key fingerprint
    let r = "";
    const fpr = fingerprint.match(
      /(....)(....)(....)(....)(....)(....)(....)(....)(....)?(....)?/
    );
    if (fpr && fpr.length > 2) {
      fpr.shift();
      r = fpr.join(" ");
    }

    return r;
  },

  // Extract public key from Status Message
  extractPubkey(statusMsg) {
    const matchb = statusMsg.match(/(^|\n)NO_PUBKEY (\w{8})(\w{8})/);
    if (matchb && matchb.length > 3) {
      EnigmailLog.DEBUG(
        "Enigmail.extractPubkey: NO_PUBKEY 0x" + matchb[3] + "\n"
      );
      return matchb[2] + matchb[3];
    }
    return null;
  },

  /**
   * import a revocation certificate form a given keyblock string.
   * Ask the user before importing the cert, and display an error
   * message in case of failures.
   */
  importRevocationCert(keyId, keyBlockStr) {
    let key = EnigmailKeyRing.getKeyById(keyId);

    if (key) {
      if (key.keyTrust === "r") {
        // Key has already been revoked
        l10n
          .formatValue("revoke-key-already-revoked", {
            keyId,
          })
          .then(value => {
            EnigmailDialog.info(null, value);
          });
      } else {
        let userId = key.userId + " - 0x" + key.keyId;
        if (
          !EnigmailDialog.confirmDlg(
            null,
            l10n.formatValueSync("revoke-key-question", { userId }),
            l10n.formatValueSync("key-man-button-revoke-key")
          )
        ) {
          return;
        }

        let errorMsgObj = {};
        // TODO this will certainly not work yet, because RNP requires
        // calling a different function for importing revocation
        // signatures, see RNP.importRevImpl
        if (
          EnigmailKeyRing.importKey(
            null,
            false,
            keyBlockStr,
            false,
            keyId,
            errorMsgObj
          ) > 0
        ) {
          EnigmailDialog.alert(null, errorMsgObj.value);
        }
      }
    } else {
      // Suitable key for revocation certificate is not present in keyring
      l10n
        .formatValue("revoke-key-not-present", {
          keyId,
        })
        .then(value => {
          EnigmailDialog.alert(null, value);
        });
    }
  },

  _keyListCache: new Map(),
  _keyListCacheMaxEntries: 50,
  _keyListCacheMaxKeySize: 30720,

  /**
   * Get details (key ID, UID) of the data contained in a OpenPGP key block
   *
   * @param {string} keyBlockStr - the contents of one or more public keys
   * @param {Object} errorMsgObj - obj.value will contain an error message in case of failures
   * @param {Boolean} interactive - if in interactive mode, may display dialogs (default: true)
   * @param {Boolean} pubkey - load public keys from the given block
   * @param {Boolean} seckey - load secret keys from the given block
   *
   * @return {Object[]} an array of objects with the following structure:
   *          - id (key ID)
   *          - fpr
   *          - name (the UID of the key)
   *          - state (one of "old" [existing key], "new" [new key], "invalid" [key cannot not be imported])
   */
  async getKeyListFromKeyBlock(
    keyBlockStr,
    errorMsgObj,
    interactive,
    pubkey,
    seckey,
    withPubKey = false
  ) {
    EnigmailLog.DEBUG("key.jsm: getKeyListFromKeyBlock\n");
    errorMsgObj.value = "";

    let cacheEntry = this._keyListCache.get(keyBlockStr);
    if (cacheEntry) {
      // Remove and re-insert to move entry to the end of insertion order,
      // so we know which entry was used least recently.
      this._keyListCache.delete(keyBlockStr);
      this._keyListCache.set(keyBlockStr, cacheEntry);

      if (cacheEntry.error) {
        errorMsgObj.value = cacheEntry.error;
        return null;
      }
      return cacheEntry.data;
    }

    // We primarily want to cache single keys that are found in email
    // attachments. We shouldn't attempt to cache larger key blocks
    // that are likely arriving from explicit import attempts.
    let updateCache = keyBlockStr.length < this._keyListCacheMaxKeySize;

    if (
      updateCache &&
      this._keyListCache.size >= this._keyListCacheMaxEntries
    ) {
      // Remove oldest entry, make room for new entry.
      this._keyListCache.delete(this._keyListCache.keys().next().value);
    }

    const cApi = EnigmailCryptoAPI();
    let keyList;
    let key = {};
    let blocks;
    errorMsgObj.value = "";

    try {
      keyList = await cApi.getKeyListFromKeyBlockAPI(
        keyBlockStr,
        pubkey,
        seckey,
        true,
        withPubKey
      );
    } catch (ex) {
      errorMsgObj.value = ex.toString();
      if (updateCache && !withPubKey) {
        this._keyListCache.set(keyBlockStr, {
          error: errorMsgObj.value,
          data: null,
        });
      }
      return null;
    }

    if (!keyList) {
      if (updateCache) {
        this._keyListCache.set(keyBlockStr, { error: undefined, data: null });
      }
      return null;
    }

    if (interactive && keyList.length === 1) {
      // TODO: not yet tested
      key = keyList[0];
      if ("revoke" in key && !("name" in key)) {
        if (updateCache) {
          this._keyListCache.set(keyBlockStr, { error: undefined, data: [] });
        }
        this.importRevocationCert(key.id, blocks.join("\n"));
        return [];
      }
    }

    if (updateCache) {
      this._keyListCache.set(keyBlockStr, { error: undefined, data: keyList });
    }
    return keyList;
  },

  /**
   * Get details of a key block to import. Works identically as getKeyListFromKeyBlock();
   * except that the input is a file instead of a string
   *
   * @param {nsIFile} file - The file to read.
   * @param {Object} errorMsgObj - Object; obj.value will contain error message.
   *
   * @return {Object[]} An array of objects; see getKeyListFromKeyBlock()
   */
  async getKeyListFromKeyFile(
    file,
    errorMsgObj,
    pubkey,
    seckey,
    withPubKey = false
  ) {
    let contents = await IOUtils.readUTF8(file.path);
    return this.getKeyListFromKeyBlock(
      contents,
      errorMsgObj,
      true,
      pubkey,
      seckey,
      withPubKey
    );
  },

  /**
   * Compare 2 KeyIds of possible different length (short, long, FPR-length, with or without prefixed
   * 0x are accepted)
   *
   * @param keyId1       string
   * @param keyId2       string
   *
   * @return true or false, given the comparison of the last minimum-length characters.
   */
  compareKeyIds(keyId1, keyId2) {
    var keyId1Raw = keyId1.replace(/^0x/, "").toUpperCase();
    var keyId2Raw = keyId2.replace(/^0x/, "").toUpperCase();

    var minlength = Math.min(keyId1Raw.length, keyId2Raw.length);

    if (minlength < keyId1Raw.length) {
      // Limit keyId1 to minlength
      keyId1Raw = keyId1Raw.substr(-minlength, minlength);
    }

    if (minlength < keyId2Raw.length) {
      // Limit keyId2 to minlength
      keyId2Raw = keyId2Raw.substr(-minlength, minlength);
    }

    return keyId1Raw === keyId2Raw;
  },
};
