/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailKeyRing"];

const { EnigmailLog } = ChromeUtils.import(
  "chrome://openpgp/content/modules/log.jsm"
);
const { EnigmailLocale } = ChromeUtils.import(
  "chrome://openpgp/content/modules/locale.jsm"
);
const { EnigmailFiles } = ChromeUtils.import(
  "chrome://openpgp/content/modules/files.jsm"
);
const { EnigmailTrust } = ChromeUtils.import(
  "chrome://openpgp/content/modules/trust.jsm"
);
const { EnigmailArmor } = ChromeUtils.import(
  "chrome://openpgp/content/modules/armor.jsm"
);
const { EnigmailLazy } = ChromeUtils.import(
  "chrome://openpgp/content/modules/lazy.jsm"
);
const { newEnigmailKeyObj } = ChromeUtils.import(
  "chrome://openpgp/content/modules/keyObj.jsm"
);
const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const { EnigmailCryptoAPI } = ChromeUtils.import(
  "chrome://openpgp/content/modules/cryptoAPI.jsm"
);
const { PgpSqliteDb2 } = ChromeUtils.import(
  "chrome://openpgp/content/modules/sqliteDb.jsm"
);
const { uidHelper } = ChromeUtils.import(
  "chrome://openpgp/content/modules/uidHelper.jsm"
);

const getDialog = EnigmailLazy.loader("enigmail/dialog.jsm", "EnigmailDialog");
const getWindows = EnigmailLazy.loader(
  "enigmail/windows.jsm",
  "EnigmailWindows"
);

var l10n = new Localization(["messenger/openpgp/enigmail.ftl"], true);

const DEFAULT_FILE_PERMS = 0o600;

let gKeyListObj = null;
let gKeyIndex = [];
let gSubkeyIndex = [];
let gLoadingKeys = false;

/*

  This module operates with a Key Store (array) containing objects with the following properties:

  * keyList [Array] of EnigmailKeyObj

  * keySortList [Array]:  used for quickly sorting the keys
    - userId (in lower case)
    - keyId
    - keyNum
  * trustModel: [String]. One of:
            - p: pgp/classical
            - t: always trust
            - a: auto (:0) (default, currently pgp/classical)
            - T: TOFU
            - TP: TOFU+PGP

*/

var EnigmailKeyRing = {
  /**
   * Get the complete list of all public keys, optionally sorted by a column
   *
   * @param  win           - optional |object| holding the parent window for displaying error messages
   * @param  sortColumn    - optional |string| containing the column name for sorting. One of:
   *                            userid, keyid, keyidshort, fpr, keytype, validity, trust, expiry
   * @param  sortDirection - |number| 1 = ascending / -1 = descending
   *
   * @return keyListObj    - |object| { keyList, keySortList } (see above)
   */
  getAllKeys(win, sortColumn, sortDirection) {
    if (gKeyListObj.keySortList.length === 0) {
      loadKeyList(win, sortColumn, sortDirection);
      //getWindows().keyManReloadKeys();
      /* TODO: do we need something similar with TB's future trust behavior?
      if (!gKeyCheckDone) {
        gKeyCheckDone = true;
        runKeyUsabilityCheck();
      }
      */
    } else if (sortColumn) {
      gKeyListObj.keySortList.sort(
        getSortFunction(sortColumn.toLowerCase(), gKeyListObj, sortDirection)
      );
    }

    return gKeyListObj;
  },

  /**
   * get 1st key object that matches a given key ID or subkey ID
   *
   * @param keyId      - String: key Id with 16 characters (preferred) or 8 characters),
   *                             or fingerprint (40 or 32 characters).
   *                             Optionally preceeded with "0x"
   * @param noLoadKeys - Boolean [optional]: do not try to load the key list first
   *
   * @return Object - found KeyObject or null if key not found
   */
  getKeyById(keyId, noLoadKeys) {
    EnigmailLog.DEBUG("keyRing.jsm: getKeyById: " + keyId + "\n");

    if (!keyId) {
      return null;
    }

    if (keyId.search(/^0x/) === 0) {
      keyId = keyId.substr(2);
    }

    if (!noLoadKeys) {
      this.getAllKeys(); // ensure keylist is loaded;
    }

    let keyObj = gKeyIndex[keyId];

    if (keyObj === undefined) {
      keyObj = gSubkeyIndex[keyId];
    }

    return keyObj !== undefined ? keyObj : null;
  },

  /**
   * get all key objects that match a given user ID
   *
   * @param searchTerm   - String: a regular expression to match against all UIDs of the keys.
   *                               The search is always performed case-insensitively
   *                               An empty string will return no result
   * @param onlyValidUid - Boolean: if true (default), invalid (e.g. revoked) UIDs are not matched
   *
   * @return Array of KeyObjects with the found keys (array length is 0 if no key found)
   */
  getKeysByUserId(searchTerm, onlyValidUid = true, allowExpired = false) {
    EnigmailLog.DEBUG("keyRing.jsm: getKeysByUserId: '" + searchTerm + "'\n");
    let s = new RegExp(searchTerm, "i");

    let res = [];

    this.getAllKeys(); // ensure keylist is loaded;

    if (searchTerm === "") {
      return res;
    }
    for (let i in gKeyListObj.keyList) {
      let k = gKeyListObj.keyList[i];

      for (let j in k.userIds) {
        if (k.userIds[j].type === "uid" && k.userIds[j].userId.search(s) >= 0) {
          if (
            !onlyValidUid ||
            !EnigmailTrust.isInvalid(k.userIds[j].keyTrust) ||
            (allowExpired && k.userIds[j].keyTrust == "e")
          ) {
            res.push(k);
            break;
          }
        }
      }
    }
    return res;
  },

  /**
   * Specialized function that takes into account
   * the specifics of email addresses in UIDs.
   *
   * @param emailAddr: String - email address to search for without any angulars
   *                            or names
   *
   * @return KeyObject with the found key, or null if no key found
   */
  async getSecretKeyByEmail(emailAddr) {
    let result = {};
    await this.getAllSecretKeysByEmail(emailAddr, result, true);
    return result.best;
  },

  /**
   * Return the full unfiltered list of keys that are specifics of email
   * addresses in UIDs.
   *
   * @param {String} emailAddr - email address to search for without any
   *   angulars or names.
   *
   * @return {Object | null} - Object with the found keys, or null.
   */
  async getAllSecretKeysByEmail(emailAddr, result, allowExpired) {
    // sanitize email address
    emailAddr = emailAddr.replace(/([\.\[\]\-\\])/g, "\\$1");

    let searchTerm =
      "(<" + emailAddr + ">| " + emailAddr + "$|^" + emailAddr + "$)";

    await this.getAllSecretKeysByUserId(searchTerm, result, allowExpired);
  },

  async getAllSecretKeysByUserId(searchTerm, result, allowExpired) {
    EnigmailLog.DEBUG(
      "keyRing.jsm: getAllSecretKeysByUserId: '" + searchTerm + "'\n"
    );
    let keyList = this.getKeysByUserId(searchTerm, true, true);

    result.all = [];
    result.best = null;

    var nowDate = new Date();
    var nowSecondsSinceEpoch = nowDate.valueOf() / 1000;
    let bestIsExpired = false;

    for (let key of keyList) {
      if (!key.secretAvailable) {
        continue;
      }
      let isPersonal = await PgpSqliteDb2.isAcceptedAsPersonalKey(key.fpr);
      if (!isPersonal) {
        continue;
      }
      if (
        key.getEncryptionValidity("ignoreExpired").keyValid &&
        key.getSigningValidity("ignoreExpired").keyValid
      ) {
        let thisIsExpired =
          key.expiryTime != 0 && key.expiryTime < nowSecondsSinceEpoch;
        if (!allowExpired && thisIsExpired) {
          continue;
        }
        result.all.push(key);
        if (!result.best) {
          result.best = key;
          bestIsExpired = thisIsExpired;
        } else if (
          result.best.algoSym === key.algoSym &&
          result.best.keySize === key.keySize
        ) {
          if (!key.expiryTime || key.expiryTime > result.best.expiryTime) {
            result.best = key;
          }
        } else if (bestIsExpired && !thisIsExpired) {
          if (
            result.best.algoSym.search(/^(DSA|RSA)$/) < 0 &&
            key.algoSym.search(/^(DSA|RSA)$/) === 0
          ) {
            // prefer RSA or DSA over ECC (long-term: change this once ECC keys are widely supported)
            result.best = key;
            bestIsExpired = thisIsExpired;
          } else if (
            key.getVirtualKeySize() > result.best.getVirtualKeySize()
          ) {
            result.best = key;
            bestIsExpired = thisIsExpired;
          }
        }
      }
    }
  },

  /**
   * get a list of keys for a given set of (sub-) key IDs
   *
   * @param keyIdList: Array of key IDs
                       OR String, with space-separated list of key IDs
   */
  getKeyListById(keyIdList) {
    EnigmailLog.DEBUG("keyRing.jsm: getKeyListById: '" + keyIdList + "'\n");
    let keyArr;
    if (typeof keyIdList === "string") {
      keyArr = keyIdList.split(/ +/);
    } else {
      keyArr = keyIdList;
    }

    let ret = [];
    for (let i in keyArr) {
      let r = this.getKeyById(keyArr[i]);
      if (r) {
        ret.push(r);
      }
    }

    return ret;
  },

  /**
   * win: context/parent window
   * passCB: a callback function that will be called if the user needs
   *         to enter a passphrase to unlock a secret key.
   *         For the current API, see passphrasePromptCallback
   */
  importKeyFromFile(
    win,
    passCB,
    inputFile,
    errorMsgObj,
    importedKeysObj,
    pubkey,
    seckey
  ) {
    EnigmailLog.DEBUG(
      "keyRing.jsm: EnigmailKeyRing.importKeyFromFile: fileName=" +
        inputFile.path +
        "\n"
    );
    const cApi = EnigmailCryptoAPI();
    let res;
    let tryAgain;
    let permissive = false;
    do {
      // strict on first attempt, permissive on optional second attempt
      res = cApi.sync(
        cApi.importKeyFromFileAPI(
          win,
          passCB,
          inputFile,
          pubkey,
          seckey,
          permissive
        )
      );

      tryAgain = false;
      let failed = res.exitCode || !res.importedKeys.length;
      if (failed && !permissive) {
        let agreed = getDialog().confirmDlg(
          win,
          EnigmailLocale.getString("confirmPermissiveImport")
        );
        if (agreed) {
          permissive = true;
          tryAgain = true;
        }
      }
    } while (tryAgain);

    if (importedKeysObj) {
      importedKeysObj.keys = res.importedKeys;
    }
    if (!res) {
      return 1;
    }

    if (res.importedKeys.length > 0) {
      EnigmailKeyRing.updateKeys(res.importedKeys);
    }
    EnigmailKeyRing.clearCache();

    return res.exitCode;
  },

  /**
   * empty the key cache, such that it will get loaded next time it is accessed
   *
   * no input or return values
   */
  clearCache() {
    EnigmailLog.DEBUG("keyRing.jsm: EnigmailKeyRing.clearCache\n");
    gKeyListObj = {
      keyList: [],
      keySortList: [],
    };

    gKeyIndex = [];
    gSubkeyIndex = [];
  },

  /**
   * Check if the cache is empty
   *
   * @return  Boolean: true: cache cleared
   */
  getCacheEmpty() {
    return gKeyIndex.length === 0;
  },

  /**
   * Get a list of UserIds for a given key.
   * Only the Only UIDs with highest trust level are returned.
   *
   * @param  String  keyId   key, optionally preceeded with 0x
   *
   * @return Array of String: list of UserIds
   */
  getValidUids(keyId) {
    let r = [];
    let keyObj = this.getKeyById(keyId);

    if (keyObj) {
      const TRUSTLEVELS_SORTED = EnigmailTrust.trustLevelsSorted();
      let hideInvalidUid = true;
      let maxTrustLevel = TRUSTLEVELS_SORTED.indexOf(keyObj.keyTrust);

      if (EnigmailTrust.isInvalid(keyObj.keyTrust)) {
        // pub key not valid (anymore)-> display all UID's
        hideInvalidUid = false;
      }

      for (let i in keyObj.userIds) {
        if (keyObj.userIds[i].type !== "uat") {
          if (hideInvalidUid) {
            let thisTrust = TRUSTLEVELS_SORTED.indexOf(
              keyObj.userIds[i].keyTrust
            );
            if (thisTrust > maxTrustLevel) {
              r = [keyObj.userIds[i].userId];
              maxTrustLevel = thisTrust;
            } else if (thisTrust === maxTrustLevel) {
              r.push(keyObj.userIds[i].userId);
            }
            // else do not add uid
          } else if (
            !EnigmailTrust.isInvalid(keyObj.userIds[i].keyTrust) ||
            !hideInvalidUid
          ) {
            // UID valid  OR  key not valid, but invalid keys allowed
            r.push(keyObj.userIds[i].userId);
          }
        }
      }
    }

    return r;
  },

  /**
   * Export public and possibly secret key(s) to a file
   *
   * @param includeSecretKey  Boolean  - if true, secret keys are exported
   * @param userId            String   - space or comma separated list of keys to export. Specification by
   *                                     key ID, fingerprint, or userId
   * @param outputFile        String or nsIFile - output file name or Object - or NULL
   * @param exitCodeObj       Object   - o.value will contain exit code
   * @param errorMsgObj       Object   - o.value will contain error message from GnuPG
   *
   * @return String - if outputFile is NULL, the key block data; "" if a file is written
   */
  extractKey(includeSecretKey, idArray, outputFile, exitCodeObj, errorMsgObj) {
    EnigmailLog.DEBUG(
      "keyRing.jsm: EnigmailKeyRing.extractKey: " + idArray + "\n"
    );
    exitCodeObj.value = -1;

    if (includeSecretKey) {
      throw new Error("extractKey with secret key not implemented");
    }

    if (!Array.isArray(idArray) || !idArray.length) {
      throw new Error("invalid parameter given to EnigmailKeyRing.extractKey");
    }

    if (idArray.length > 1) {
      throw new Error(
        "keyRing.jsm: EnigmailKeyRing.extractKey: multiple IDs not yet implemented"
      );
    }

    const cApi = EnigmailCryptoAPI();
    let keyBlock = cApi.sync(cApi.getPublicKey(idArray[0]));
    if (!keyBlock) {
      errorMsgObj.value = l10n.formatValueSync("fail-key-extract");
      return "";
    }

    exitCodeObj.value = 0;
    if (outputFile) {
      if (
        !EnigmailFiles.writeFileContents(
          outputFile,
          keyBlock,
          DEFAULT_FILE_PERMS
        )
      ) {
        exitCodeObj.value = -1;
        errorMsgObj.value = l10n.formatValueSync("file-write-failed", {
          output: outputFile,
        });
      }
      return "";
    }
    return keyBlock;
  },

  /**
   * import key from provided key data (synchronous)
   *
   * @param parent          nsIWindow
   * @param isInteractive   Boolean  - if true, display confirmation dialog
   * @param keyBlock        String   - data containing key
   * @param keyId           String   - key ID expected to import (no meaning)
   * @param errorMsgObj     Object   - o.value will contain error message from GnuPG
   * @param importedKeysObj Object   - [OPTIONAL] o.value will contain an array of the FPRs imported
   * @param minimizeKey     Boolean  - [OPTIONAL] minimize key for importing
   * @param limitedUids     Array<String> - [OPTIONAL] restrict importing the key(s) to a given set of UIDs
   *
   * @return Integer -  exit code:
   *      ExitCode == 0  => success
   *      ExitCode > 0   => error
   *      ExitCode == -1 => Cancelled by user
   */
  importKey(
    parent,
    isInteractive,
    keyBlock,
    isBinary,
    keyId,
    errorMsgObj,
    importedKeysObj,
    minimizeKey = false,
    limitedUids = []
  ) {
    const cApi = EnigmailCryptoAPI();
    return cApi.sync(
      this.importKeyAsync(
        parent,
        isInteractive,
        keyBlock,
        isBinary,
        keyId,
        errorMsgObj,
        importedKeysObj,
        minimizeKey,
        limitedUids
      )
    );
  },

  /**
   * import key from provided key data
   *
   * @param parent          nsIWindow
   * @param isInteractive   Boolean  - if true, display confirmation dialog
   * @param keyBlock        String   - data containing key
   * @param keyId           String   - key ID expected to import (no meaning)
   * @param errorMsgObj     Object   - o.value will contain error message from GnuPG
   * @param importedKeysObj Object   - [OPTIONAL] o.value will contain an array of the FPRs imported
   * @param minimizeKey     Boolean  - [OPTIONAL] minimize key for importing
   * @param limitedUids     Array<String> - [OPTIONAL] restrict importing the key(s) to a given set of UIDs
   *
   * @return Integer -  exit code:
   *      ExitCode == 0  => success
   *      ExitCode > 0   => error
   *      ExitCode == -1 => Cancelled by user
   */
  async importKeyAsync(
    parent,
    isInteractive,
    keyBlock,
    isBinary,
    keyId,
    errorMsgObj,
    importedKeysObj,
    minimizeKey = false,
    limitedUids = []
  ) {
    EnigmailLog.DEBUG(
      `keyRing.jsm: EnigmailKeyRing.importKeyAsync('${keyId}', ${isInteractive}, ${minimizeKey})\n`
    );

    var pgpBlock;
    if (!isBinary) {
      const beginIndexObj = {};
      const endIndexObj = {};
      const blockType = EnigmailArmor.locateArmoredBlock(
        keyBlock,
        0,
        "",
        beginIndexObj,
        endIndexObj,
        {}
      );
      if (!blockType) {
        errorMsgObj.value = l10n.formatValueSync("no-pgp-block");
        return 1;
      }

      if (blockType.search(/^(PUBLIC|PRIVATE) KEY BLOCK$/) !== 0) {
        errorMsgObj.value = l10n.formatValueSync("not-first-block");
        return 1;
      }

      pgpBlock = keyBlock.substr(
        beginIndexObj.value,
        endIndexObj.value - beginIndexObj.value + 1
      );
    }

    if (isInteractive) {
      if (
        !getDialog().confirmDlg(
          parent,
          l10n.formatValueSync("import-key-confirm"),
          l10n.formatValueSync("key-man-button-import")
        )
      ) {
        errorMsgObj.value = l10n.formatValueSync("fail-cancel");
        return -1;
      }
    }

    if (limitedUids.length > 0) {
      throw new Error(
        "importKeyAsync with limitedUids: not implemented " + limitedUids
      );
    }

    if (minimizeKey) {
      throw new Error("importKeyAsync with minimizeKey: not implemented");
    }

    const cApi = EnigmailCryptoAPI();
    let result;
    let tryAgain;
    let permissive = false;
    do {
      // strict on first attempt, permissive on optional second attempt
      if (isBinary) {
        result = cApi.sync(
          cApi.importKeyBlockAPI(keyBlock, true, false, permissive)
        ); // public only
      } else {
        result = cApi.sync(
          cApi.importKeyBlockAPI(pgpBlock, true, false, permissive)
        ); // public only
      }

      tryAgain = false;
      let failed = result.exitCode || !result.importedKeys.length;
      if (failed && isInteractive && !permissive) {
        let agreed = getDialog().confirmDlg(
          parent,
          EnigmailLocale.getString("confirmPermissiveImport")
        );
        if (agreed) {
          permissive = true;
          tryAgain = true;
        }
      }
    } while (tryAgain);

    if (importedKeysObj) {
      importedKeysObj.value = result.importedKeys;
    }

    EnigmailKeyRing.clearCache();
    return result.exitCode;
  },

  importKeyDataWithConfirmation(window, preview, keyData, isBinary) {
    let somethingWasImported = false;
    if (preview.length > 0) {
      let exitStatus;
      if (preview.length == 1) {
        exitStatus = getDialog().confirmDlg(
          window,
          l10n.formatValueSync("do-import-one", {
            name: preview[0].name,
            id: preview[0].id,
          })
        );
      } else {
        exitStatus = getDialog().confirmDlg(
          window,
          l10n.formatValueSync("do-import-multiple", {
            key: preview
              .map(function(a) {
                return "\t" + a.name + " (" + a.id + ")";
              })
              .join("\n"),
          })
        );
      }

      if (exitStatus) {
        let errorMsgObj = {};
        try {
          exitStatus = EnigmailKeyRing.importKey(
            window,
            false,
            keyData,
            isBinary,
            "",
            errorMsgObj
          );
        } catch (ex) {
          console.debug(ex);
        }

        if (exitStatus === 0) {
          let keyList = preview.map(a => a.id);
          getDialog().keyImportDlg(window, keyList);
          somethingWasImported = true;
        } else {
          l10n.formatValue("fail-key-import").then(value => {
            getDialog().alert(window, value + "\n" + errorMsgObj.value);
          });
        }
      }
    } else {
      l10n.formatValue("no-key-found").then(value => {
        getDialog().alert(window, value);
      });
    }
    return somethingWasImported;
  },

  /**
   * Generate a new key pair with GnuPG
   *
   * @name:       String     - name part of UID
   * @comment:    String     - comment part of UID (brackets are added)
   * @comment:    String     - email part of UID (<> will be added)
   * @expiryDate: Number     - Unix timestamp of key expiry date; 0 if no expiry
   * @keyLength:  Number     - size of key in bytes (e.g 4096)
   * @keyType:    String     - RSA or ECC
   * @passphrase: String     - password; null if no password
   * @listener:   Object     - {
   *                             function onDataAvailable(data) {...},
   *                             function onStopRequest(exitCode) {...}
   *                           }
   *
   * @return: handle to process
   */
  generateKey(
    name,
    comment,
    email,
    expiryDate,
    keyLength,
    keyType,
    passphrase,
    listener
  ) {
    EnigmailLog.WRITE("keyRing.jsm: generateKey:\n");
    throw new Error("Not implemented");
  },

  /**
   * try to find valid key for encryption to passed email address
   *
   * @param details if not null returns error in details.msg
   *
   * @return: found key ID (without leading "0x") or null
   */
  async getValidKeyForRecipient(emailAddr, details) {
    EnigmailLog.DEBUG(
      'keyRing.jsm: getValidKeyForRecipient(): emailAddr="' + emailAddr + '"\n'
    );
    const FULLTRUSTLEVEL = 2;

    emailAddr = emailAddr.toLowerCase();

    var foundKeyId = null;
    var foundAcceptanceLevel = null;

    let k = this.getAllKeys(null, null);
    let keyList = k.keyList;

    for (var idx = 0; idx < keyList.length; idx++) {
      var keyObj = keyList[idx];

      switch (keyObj.keyTrust) {
        case "e":
        case "r":
          continue;
      }

      let uidMatch = false;
      for (let uid of keyObj.userIds) {
        if (uid.type !== "uid") {
          continue;
        }
        let split = {};
        if (uidHelper.getPartsFromUidStr(uid.userId, split)) {
          let uidEmail = split.email.toLowerCase();
          if (uidEmail === emailAddr) {
            uidMatch = true;
            break;
          }
        }
      }
      if (!uidMatch) {
        continue;
      }
      // key valid for encryption?
      if (!keyObj.keyUseFor.includes("E")) {
        //EnigmailLog.DEBUG("keyRing.jsm: getValidKeyForRecipient():  skip key " + keyObj.keyId + " (not provided for encryption)\n");
        continue; // not valid for encryption => **** CONTINUE the LOOP
      }

      let acceptanceLevel;
      if (keyObj.secretAvailable) {
        let isPersonal = await PgpSqliteDb2.isAcceptedAsPersonalKey(keyObj.fpr);
        if (isPersonal) {
          acceptanceLevel = 3;
        } else {
          acceptanceLevel = -1; // rejected
        }
      } else {
        acceptanceLevel = await this.getKeyAcceptanceLevelForEmail(
          keyObj,
          emailAddr
        );
      }

      if (acceptanceLevel < 1) {
        continue;
      }

      // immediately return if a fully or ultimately trusted key is found
      if (acceptanceLevel >= FULLTRUSTLEVEL) {
        return keyObj.keyId;
      }

      if (foundKeyId != keyObj.keyId) {
        // different matching key found
        if (
          !foundKeyId ||
          (foundKeyId && acceptanceLevel > foundAcceptanceLevel)
        ) {
          foundKeyId = keyObj.keyId;
          foundAcceptanceLevel = acceptanceLevel;
        }
      }
    }

    if (!foundKeyId) {
      if (details) {
        details.msg = "ProblemNoKey";
      }
      let msg = "no key with enough trust level for '" + emailAddr + "' found";
      EnigmailLog.DEBUG(
        "keyRing.jsm: getValidKeyForRecipient():  " + msg + "\n"
      );
    } else {
      EnigmailLog.DEBUG(
        "keyRing.jsm: getValidKeyForRecipient():  key=" +
          keyObj.keyId +
          '" found\n'
      );
    }
    return foundKeyId;
  },

  async getKeyAcceptanceLevelForEmail(keyObj, email) {
    let acceptanceLevel = 0;

    let acceptanceResult = {};
    try {
      await PgpSqliteDb2.getAcceptance(keyObj.fpr, email, acceptanceResult);
    } catch (ex) {
      console.debug("getAcceptance failed: " + ex);
      return null;
    }

    if (acceptanceResult.emailDecided) {
      switch (acceptanceResult.fingerprintAcceptance) {
        case "verified":
          acceptanceLevel = 2;
          break;
        case "unverified":
          acceptanceLevel = 1;
          break;
        case "rejected":
          acceptanceLevel = -1;
          break;
        default:
        case "undecided":
          acceptanceLevel = 0;
          break;
      }
    }
    return acceptanceLevel;
  },

  async getKeyAcceptanceForEmail(keyObj, email) {
    let acceptanceResult = {};

    try {
      await PgpSqliteDb2.getAcceptance(keyObj.fpr, email, acceptanceResult);
    } catch (ex) {
      console.debug("getAcceptance failed: " + ex);
      return null;
    }

    if (acceptanceResult.emailDecided) {
      switch (acceptanceResult.fingerprintAcceptance) {
        case "verified":
        case "unverified":
        case "rejected":
        case "undecided":
          return acceptanceResult.fingerprintAcceptance;
      }
    }

    return "undecided";
  },

  /**
   *  Determine the key ID for a set of given addresses
   *
   * @param {Array<String>} addresses: email addresses
   * @param {Object} details:          holds details for invalid keys:
   *                                   - errArray: {
   *                                       * addr {String}: email addresses
   *                                       * msg {String}:  related error
   *                                       }
   *                                   - keyMap {Object<String>}: map of email addr -> keyID
   * @param {Array<String>} resultingArray: list of found key IDs
   *
   * @return {Boolean}: true if at least one key missing; false otherwise
   */
  async getValidKeysForAllRecipients(addresses, details, resultingArray) {
    if (!addresses) {
      return null;
    }
    // check whether each address is or has a key:
    let keyMissing = false;
    if (details) {
      details.errArray = [];
      details.keyMap = {};
    }
    for (let i = 0; i < addresses.length; i++) {
      let addr = addresses[i];
      if (!addr) {
        continue;
      }
      // try to find current address in key list:
      let keyId = null;
      var errMsg = null;
      if (!addr.includes("@")) {
        throw new Error(
          "getValidKeysForAllRecipients unexpected lookup for non-email addr: " +
            addr
        );
      }

      // try email match:
      var addrErrDetails = {};
      let foundKeyId = await this.getValidKeyForRecipient(addr, addrErrDetails);
      if (details && addrErrDetails.msg) {
        errMsg = addrErrDetails.msg;
      }
      if (foundKeyId) {
        keyId = "0x" + foundKeyId.toUpperCase();
        resultingArray.push(keyId);
        if (details) {
          details.keyMap[addr.toLowerCase()] = keyId;
        }
      } else {
        // no key for this address found
        keyMissing = true;
        if (details) {
          if (!errMsg) {
            errMsg = "ProblemNoKey";
          }
          var detailsElem = {};
          detailsElem.addr = addr;
          detailsElem.msg = errMsg;
          details.errArray.push(detailsElem);
        }
        EnigmailLog.DEBUG(
          'keyRing.jsm: getValidKeysForAllRecipients(): return null (no single valid key found for="' +
            addr +
            '")\n'
        );
      }
    }
    return keyMissing;
  },

  async getMultValidKeysForOneRecipient(emailAddr) {
    EnigmailLog.DEBUG(
      'keyRing.jsm: getMultValidKeysForOneRecipient(): emailAddr="' +
        emailAddr +
        '"\n'
    );
    emailAddr = emailAddr.toLowerCase();
    if (emailAddr.startsWith("<") && emailAddr.endsWith(">")) {
      emailAddr = emailAddr.substr(1, emailAddr.length - 2);
    }

    let found = [];

    let k = this.getAllKeys(null, null);
    let keyList = k.keyList;

    for (var idx = 0; idx < keyList.length; idx++) {
      var keyObj = keyList[idx];

      switch (keyObj.keyTrust) {
        case "e":
        case "r":
          continue;
        default:
          break;
      }

      let uidMatch = false;
      for (let uid of keyObj.userIds) {
        if (uid.type !== "uid") {
          continue;
        }
        let split = {};
        if (uidHelper.getPartsFromUidStr(uid.userId, split)) {
          let uidEmail = split.email.toLowerCase();
          if (uidEmail === emailAddr) {
            uidMatch = true;
            break;
          }
        }
      }
      if (!uidMatch) {
        continue;
      }
      // key valid for encryption?
      if (!keyObj.keyUseFor.includes("E")) {
        //EnigmailLog.DEBUG("keyRing.jsm: getValidKeyForRecipient():  skip key " + keyObj.keyId + " (not provided for encryption)\n");
        continue; // not valid for encryption => **** CONTINUE the LOOP
      }
      if (!keyObj.secretAvailable) {
        keyObj.acceptance = await this.getKeyAcceptanceForEmail(
          keyObj,
          emailAddr
        );
      }
      found.push(keyObj);
    }
    return found;
  },

  /**
   *  Determine the key ID for a set of given addresses
   *
   * @param {string[]} addresses - Email addresses to get key id for.
   *
   * @return {Map<string,keyObj[]>}: map of email addr -> keyObj[]
   */
  async getMultValidKeysForMultRecipients(addresses) {
    if (!addresses) {
      return null;
    }
    let allKeysMap = new Map();
    for (let i = 0; i < addresses.length; i++) {
      let addr = addresses[i].toLowerCase();
      if (!addr) {
        continue;
      }

      if (!addr.includes("@")) {
        throw new Error(
          "getAllRecipientKeys unexpected lookup for non-email addr: " + addr
        );
      }

      let found = await this.getMultValidKeysForOneRecipient(addr);
      if (found) {
        allKeysMap.set(addr, found);
      }
    }
    return allKeysMap;
  },

  /**
   * Rebuild the quick access search indexes after the key list was loaded
   */
  rebuildKeyIndex() {
    gKeyIndex = [];
    gSubkeyIndex = [];

    for (let i in gKeyListObj.keyList) {
      let k = gKeyListObj.keyList[i];
      gKeyIndex[k.keyId] = k;
      gKeyIndex[k.fpr] = k;
      gKeyIndex[k.keyId.substr(-8, 8)] = k;

      // add subkeys
      for (let j in k.subKeys) {
        gSubkeyIndex[k.subKeys[j].keyId] = k;
      }
    }
  },

  /**
   * Update specific keys in the key cache. If the key objects don't exist yet,
   * they will be created
   *
   * @param keys: Array of String - key IDs or fingerprints
   */
  updateKeys(keys) {
    EnigmailLog.DEBUG("keyRing.jsm: updateKeys(" + keys.join(",") + ")\n");
    let uniqueKeys = [...new Set(keys)]; // make key IDs unique

    deleteKeysFromCache(uniqueKeys);

    if (gKeyListObj.keyList.length > 0) {
      loadKeyList(null, null, 1, uniqueKeys);
    } else {
      loadKeyList(null, null, 1);
    }

    getWindows().keyManReloadKeys();
  },
}; //  EnigmailKeyRing

/************************ INTERNAL FUNCTIONS ************************/

function sortByUserId(keyListObj, sortDirection) {
  return function(a, b) {
    return a.userId < b.userId ? -sortDirection : sortDirection;
  };
}

const sortFunctions = {
  keyid(keyListObj, sortDirection) {
    return function(a, b) {
      return a.keyId < b.keyId ? -sortDirection : sortDirection;
    };
  },

  keyidshort(keyListObj, sortDirection) {
    return function(a, b) {
      return a.keyId.substr(-8, 8) < b.keyId.substr(-8, 8)
        ? -sortDirection
        : sortDirection;
    };
  },

  fpr(keyListObj, sortDirection) {
    return function(a, b) {
      return keyListObj.keyList[a.keyNum].fpr < keyListObj.keyList[b.keyNum].fpr
        ? -sortDirection
        : sortDirection;
    };
  },

  keytype(keyListObj, sortDirection) {
    return function(a, b) {
      return keyListObj.keyList[a.keyNum].secretAvailable <
        keyListObj.keyList[b.keyNum].secretAvailable
        ? -sortDirection
        : sortDirection;
    };
  },

  validity(keyListObj, sortDirection) {
    return function(a, b) {
      return EnigmailTrust.trustLevelsSorted().indexOf(
        EnigmailTrust.getTrustCode(keyListObj.keyList[a.keyNum])
      ) <
        EnigmailTrust.trustLevelsSorted().indexOf(
          EnigmailTrust.getTrustCode(keyListObj.keyList[b.keyNum])
        )
        ? -sortDirection
        : sortDirection;
    };
  },

  trust(keyListObj, sortDirection) {
    return function(a, b) {
      return EnigmailTrust.trustLevelsSorted().indexOf(
        keyListObj.keyList[a.keyNum].ownerTrust
      ) <
        EnigmailTrust.trustLevelsSorted().indexOf(
          keyListObj.keyList[b.keyNum].ownerTrust
        )
        ? -sortDirection
        : sortDirection;
    };
  },

  expiry(keyListObj, sortDirection) {
    return function(a, b) {
      return keyListObj.keyList[a.keyNum].expiryTime <
        keyListObj.keyList[b.keyNum].expiryTime
        ? -sortDirection
        : sortDirection;
    };
  },
};

function getSortFunction(type, keyListObj, sortDirection) {
  return (sortFunctions[type] || sortByUserId)(keyListObj, sortDirection);
}

/**
 * Load the key list into memory and return it sorted by a specified column
 *
 * @param win        - |object|  holding the parent window for displaying error messages
 * @param sortColumn - |string|  containing the column name for sorting. One of:
 *                               userid, keyid, keyidshort, fpr, keytype, validity, trust, expiry.
 *                              Null will sort by userid.
 * @param sortDirection - |number| 1 = ascending / -1 = descending
 * @param onlyKeys   - |array| of Strings: if defined, only (re-)load selected key IDs
 *
 * no return value
 */
function loadKeyList(win, sortColumn, sortDirection, onlyKeys = null) {
  EnigmailLog.DEBUG("keyRing.jsm: loadKeyList( " + onlyKeys + ")\n");

  if (gLoadingKeys) {
    waitForKeyList();
    return;
  }
  gLoadingKeys = true;

  try {
    const cApi = EnigmailCryptoAPI();
    cApi
      .getKeys(onlyKeys)
      .then(keyList => {
        createAndSortKeyList(
          keyList,
          sortColumn,
          sortDirection,
          onlyKeys === null
        );
        gLoadingKeys = false;
      })
      .catch(e => {
        EnigmailLog.ERROR(`keyRing.jsm: loadKeyList: error ${e}
`);
        gLoadingKeys = false;
      });
    waitForKeyList();
  } catch (ex) {
    EnigmailLog.ERROR("keyRing.jsm: loadKeyList: exception: " + ex.toString());
  }
}

/**
 * Update the global key sort-list (quick index to keys)
 *
 * no return value
 */
function updateSortList() {
  gKeyListObj.keySortList = [];
  for (let i = 0; i < gKeyListObj.keyList.length; i++) {
    let keyObj = gKeyListObj.keyList[i];
    gKeyListObj.keySortList.push({
      userId: keyObj.userId ? keyObj.userId.toLowerCase() : "",
      keyId: keyObj.keyId,
      fpr: keyObj.fpr,
      keyNum: i,
    });
  }
}

/**
 * Delete a set of keys from the key cache. Does not rebuild key indexes.
 * Not found keys are skipped.
 *
 * @param keyList: Array of Strings: key IDs (or fpr) to delete
 *
 * @return Array of deleted key objects
 */

function deleteKeysFromCache(keyList) {
  EnigmailLog.DEBUG(
    "keyRing.jsm: deleteKeysFromCache(" + keyList.join(",") + ")\n"
  );

  let deleted = [];
  let foundKeys = [];
  for (let keyId of keyList) {
    let k = EnigmailKeyRing.getKeyById(keyId, true);
    if (k) {
      foundKeys.push(k);
    }
  }

  for (let k of foundKeys) {
    let foundIndex = -1;
    for (let i = 0; i < gKeyListObj.keyList.length; i++) {
      if (gKeyListObj.keyList[i].fpr == k.fpr) {
        foundIndex = i;
        break;
      }
    }
    if (foundIndex >= 0) {
      gKeyListObj.keyList.splice(foundIndex, 1);
      deleted.push(k);
    }
  }

  return deleted;
}

function createAndSortKeyList(
  keyList,
  sortColumn,
  sortDirection,
  resetKeyCache
) {
  EnigmailLog.DEBUG("keyRing.jsm: createAndSortKeyList()\n");

  if (typeof sortColumn !== "string") {
    sortColumn = "userid";
  }
  if (!sortDirection) {
    sortDirection = 1;
  }

  if (!("keyList" in gKeyListObj) || resetKeyCache) {
    gKeyListObj.keyList = [];
    gKeyListObj.keySortList = [];
    gKeyListObj.trustModel = "?";
  }

  gKeyListObj.keyList = gKeyListObj.keyList.concat(
    keyList.map(k => {
      return newEnigmailKeyObj(k);
    })
  );

  // update the quick index for sorting keys
  updateSortList();

  // create a hash-index on key ID (8 and 16 characters and fingerprint)
  // in a single array

  EnigmailKeyRing.rebuildKeyIndex();

  gKeyListObj.keySortList.sort(
    getSortFunction(sortColumn.toLowerCase(), gKeyListObj, sortDirection)
  );
}

/*
function runKeyUsabilityCheck() {
  EnigmailLog.DEBUG("keyRing.jsm: runKeyUsabilityCheck()\n");

  EnigmailTimer.setTimeout(function() {
    try {
      let msg = getKeyUsability().keyExpiryCheck();

      if (msg && msg.length > 0) {
        getDialog().info(null, msg);
      } else {
        getKeyUsability().checkOwnertrust();
      }
    } catch (ex) {
      EnigmailLog.DEBUG(
        "keyRing.jsm: runKeyUsabilityCheck: exception " +
          ex.message +
          "\n" +
          ex.stack +
          "\n"
      );
    }
  }, 60 * 1000); // 1 minute
}
*/

function waitForKeyList() {
  let mainThread = Services.tm.mainThread;
  while (gLoadingKeys) {
    mainThread.processNextEvent(true);
  }
}

EnigmailKeyRing.clearCache();
