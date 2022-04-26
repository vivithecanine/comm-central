/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["getGnuPGAPI"];

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

Services.scriptloader.loadSubScript(
  "chrome://openpgp/content/modules/cryptoAPI/interface.js",
  null,
  "UTF-8"
); /* global CryptoAPI */

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  EnigmailConstants: "chrome://openpgp/content/modules/constants.jsm",
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
});

/**
 * GnuPG implementation of CryptoAPI
 */

class GnuPGCryptoAPI extends CryptoAPI {
  constructor() {
    super();
    this.api_name = "GnuPG";
  }

  /**
   * Get the list of all knwn keys (including their secret keys)
   * @param {Array of String} onlyKeys: [optional] only load data for specified key IDs
   *
   * @return {Promise<Array of Object>}
   */
  async getKeys(onlyKeys = null) {
    throw new Error("Not implemented");
  }

  /**
   * Obtain signatures for a given set of key IDs.
   *
   * @param {String}  keyId:            space-separated list of key IDs
   * @param {Boolean} ignoreUnknownUid: if true, filter out unknown signer's UIDs
   *
   * @return {Promise<Array of Object>} - see extractSignatures()
   */
  async getKeySignatures(keyId, ignoreUnknownUid = false) {
    EnigmailLog.DEBUG(`gnupg.js: getKeySignatures: ${keyId}\n`);
    throw new Error("Not implemented");
  }

  /**
   * Obtain signatures for a given key.
   *
   * @param {KeyObj}  keyObj:           the signatures of this key will be returned
   * @param {Boolean} ignoreUnknownUid: if true, filter out unknown signer's UIDs
   *
   * @return {Promise<Array of Object>} - see extractSignatures()
   */
  async getKeyObjSignatures(keyObj, ignoreUnknownUid = false) {
    throw new Error("Not implemented");
  }

  /**
   * Export the minimum key for the public key object:
   * public key, primary user ID, newest encryption subkey
   *
   * @param {String} fpr:                a single FPR
   * @param {String} email:              [optional] the email address of the desired user ID.
   *                                     If the desired user ID cannot be found or is not valid, use the primary UID instead
   * @param {Array<Number>} subkeyDates: [optional] remove subkeys with sepcific creation Dates
   *
   * @return {Promise<Object>}:
   *    - exitCode (0 = success)
   *    - errorMsg (if exitCode != 0)
   *    - keyData: BASE64-encded string of key data
   */
  async getMinimalPubKey(fpr, email, subkeyDates) {
    EnigmailLog.DEBUG(`gnupg.js: getMinimalPubKey: ${fpr}\n`);
    throw new Error("Not implemented");
  }

  async importKeyBlockAPI(keyBlock) {
    return null;
  }

  /**
   * Import key(s) from a file
   *
   * @param {nsIFile} inputFile:  the file holding the keys
   *
   * @return {Object} or null in case no data / error:
   *   - {Number}          exitCode:        result code (0: OK)
   *   - {Array of String) importedKeys:    imported fingerprints
   *   - {String}          errorMsg:        human readable error message
   *   - {Number}          importSum:       total number of processed keys
   *   - {Number}          importUnchanged: number of unchanged keys
   */
  async importKeyFromFileAPI(inputFile) {
    throw new Error("Not implemented");
  }

  /**
   * Export secret key(s) to a file
   *
   * @param {String}  keyId      Specification by fingerprint or keyID
   * @param {Boolean} minimalKey  if true, reduce key to minimum required
   *
   * @return {Object}:
   *   - {Number} exitCode:  result code (0: OK)
   *   - {String} keyData:   ASCII armored key data material
   *   - {String} errorMsg:  error message in case exitCode !== 0
   */

  async extractSecretKey(keyId, minimalKey) {
    throw new Error("Not implemented");
  }

  /**
   *
   * @param {byte} byteData    The encrypted data
   *
   * @return {String or null} - the name of the attached file
   */

  async getFileName(byteData) {
    EnigmailLog.DEBUG(`gnupg.js: getFileName()\n`);
    throw new Error("Not implemented");
  }

  /**
   *
   * @param {Path} filePath    The signed file
   * @param {Path} sigPath       The signature to verify
   *
   * @return {Promise<String>} - A message from the verification.
   *
   * Use Promise.catch to handle failed verifications.
   * The message will be an error message in this case.
   */

  async verifyAttachment(filePath, sigPath) {
    EnigmailLog.DEBUG(`gnupg.js: verifyAttachment()\n`);
    throw new Error("Not implemented");
  }

  /**
   *
   * @param {Bytes}  encrypted     The encrypted data
   *
   * @return {Promise<Object>} - Return object with decryptedData and
   * status information
   *
   * Use Promise.catch to handle failed decryption.
   * retObj.errorMsg will be an error message in this case.
   */

  async decryptAttachment(encrypted) {
    EnigmailLog.DEBUG(`gnupg.js: decryptAttachment()\n`);
    throw new Error("Not implemented");
  }

  /**
   *
   * @param {String} encrypted     The encrypted data
   * @param {Object} options       Decryption options
   *
   * @return {Promise<Object>} - Return object with decryptedData and
   * status information
   *
   * Use Promise.catch to handle failed decryption.
   * retObj.errorMsg will be an error message in this case.
   */

  async decrypt(encrypted, options) {
    EnigmailLog.DEBUG(`gnupg.js: decrypt()\n`);
    throw new Error("Not implemented");
  }

  /**
   *
   * @param {String} encrypted     The encrypted data
   * @param {Object} options       Decryption options
   *
   * @return {Promise<Object>} - Return object with decryptedData and
   * status information
   *
   * Use Promise.catch to handle failed decryption.
   * retObj.errorMsg will be an error message in this case.
   */

  async decryptMime(encrypted, options) {
    EnigmailLog.DEBUG(`gnupg.js: decryptMime()\n`);

    // write something to gpg such that the process doesn't get stuck
    if (encrypted.length === 0) {
      encrypted = "NO DATA\n";
    }

    options.noOutput = false;
    options.verifyOnly = false;
    options.uiFlags = EnigmailConstants.UI_PGP_MIME;

    return this.decrypt(encrypted, options);
  }

  /**
   *
   * @param {String} signed        The signed data
   * @param {Object} options       Decryption options
   *
   * @return {Promise<Object>} - Return object with decryptedData and
   * status information
   *
   * Use Promise.catch to handle failed decryption.
   * retObj.errorMsg will be an error message in this case.
   */

  async verifyMime(signed, options) {
    EnigmailLog.DEBUG(`gnupg.js: verifyMime()\n`);

    options.noOutput = true;
    options.verifyOnly = true;
    options.uiFlags = EnigmailConstants.UI_PGP_MIME;

    return this.decrypt(signed, options);
  }

  async getKeyListFromKeyBlockAPI(keyBlockStr) {
    throw new Error("Not implemented");
  }

  async genKey(userId, keyType, keySize, expiryTime, passphrase) {
    throw new Error("GnuPG genKey() not implemented");
  }

  async deleteKey(keyFingerprint, deleteSecret) {
    return null;
  }

  async encryptAndOrSign(plaintext, args, resultStatus) {
    return null;
  }
}

function getGnuPGAPI() {
  return new GnuPGCryptoAPI();
}
