/*global EnigInitCommon: false, EnigmailDialog: false */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

// Uses: chrome://openpgp/content/ui/enigmailCommon.js:
/* global EnigGetPref: false, EnigGetString: false, EnigFormatFpr: false, EnigGetTrustLabel: false */
/* global GetEnigmailSvc: false, EnigConfirm: false, EnigAlert: false, EnigShowPhoto: false, EnigFilePicker: false */
/* global enigGetService: false, EnigGetTempDir: false, EnigReadFileContents: false, EnigGetLocalFileApi: false, EnigAlertPref: false */
/* global EnigEditKeyTrust: false, EnigEditKeyExpiry: false, EnigSignKey: false, EnigRevokeKey: false, EnigCreateRevokeCert: false */
/* global EnigLongAlert: false, EnigChangeKeyPwd: false, EnigDownloadKeys: false, EnigSetPref: false, EnigGetTrustCode: false */
/* global ENIG_KEY_DISABLED: false, ENIG_KEY_NOT_VALID: false, ENIG_LOCAL_FILE_CONTRACTID: false */
/* global PgpSqliteDb2: false */

// imported packages
/* global EnigmailLog: false, EnigmailEvents: false, EnigmailKeyRing: false, EnigmailKeyEditor: false */
/* global EnigmailKey: false, EnigmailLocale: false, EnigmailPrefs: false, EnigmailConstants: false */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

// Initialize enigmailCommon
EnigInitCommon("enigmailKeyManager");

var { EnigmailCore } = ChromeUtils.import(
  "chrome://openpgp/content/modules/core.jsm"
);
var { EnigmailStreams } = ChromeUtils.import(
  "chrome://openpgp/content/modules/streams.jsm"
);
var { EnigmailClipboard } = ChromeUtils.import(
  "chrome://openpgp/content/modules/clipboard.jsm"
);
var { EnigmailFuncs } = ChromeUtils.import(
  "chrome://openpgp/content/modules/funcs.jsm"
);
var { EnigmailStdlib } = ChromeUtils.import(
  "chrome://openpgp/content/modules/stdlib.jsm"
);
var { EnigmailWindows } = ChromeUtils.import(
  "chrome://openpgp/content/modules/windows.jsm"
);
var { EnigmailKeyServer } = ChromeUtils.import(
  "chrome://openpgp/content/modules/keyserver.jsm"
);
var { EnigmailWks } = ChromeUtils.import(
  "chrome://openpgp/content/modules/webKey.jsm"
);
var { EnigmailSearchCallback } = ChromeUtils.import(
  "chrome://openpgp/content/modules/searchCallback.jsm"
);
var { EnigmailCompat } = ChromeUtils.import(
  "chrome://openpgp/content/modules/compat.jsm"
);
var { EnigmailCryptoAPI } = ChromeUtils.import(
  "chrome://openpgp/content/modules/cryptoAPI.jsm"
);

var l10n = new Localization(["messenger/openpgp/enigmail.ftl"], true);

const INPUT = 0;
const RESULT = 1;

var gUserList;
var gKeyList;
var gEnigLastSelectedKeys = null;
var gKeySortList = null;
var gSearchInput = null;
var gShowAllKeysElement = null;
var gTreeChildren = null;
var gShowInvalidKeys = null;
var gShowUntrustedKeys = null;
var gShowOthersKeys = null;
var gTimeoutId = {};
var gTreeFuncs = null;

function enigmailKeyManagerLoad() {
  EnigmailLog.DEBUG("enigmailKeyManager.js: enigmailKeyManagerLoad\n");

  // Close the key manager if GnuPG is not available
  if (!EnigmailCore.getService(window)) {
    window.close();
    return;
  }

  gUserList = document.getElementById("pgpKeyList");
  gSearchInput = document.getElementById("filterKey");
  gShowAllKeysElement = document.getElementById("showAllKeys");
  gTreeChildren = document.getElementById("pgpKeyListChildren");
  gShowInvalidKeys = document.getElementById("showInvalidKeys");
  gShowUntrustedKeys = document.getElementById("showUntrustedKeys");
  gShowOthersKeys = document.getElementById("showOthersKeys");
  gTreeFuncs = EnigmailCompat.getTreeCompatibleFuncs(gUserList, gKeyListView);

  window.addEventListener("reload-keycache", reloadKeys);
  EnigmailSearchCallback.setup(gSearchInput, gTimeoutId, applyFilter, 200);

  if (EnigGetPref("keyManShowAllKeys")) {
    gShowAllKeysElement.setAttribute("checked", "true");
  }

  gUserList.addEventListener("click", onListClick, true);
  //document.getElementById("pleaseWait").showPopup(gSearchInput, -1, -1, "tooltip", "after_end", "");
  document.l10n.setAttributes(
    document.getElementById("statusText"),
    "key-man-loading-keys"
  );
  document.getElementById("progressBar").style.visibility = "visible";
  EnigmailEvents.dispatchEvent(loadkeyList, 100, null);

  gUserList.view = gKeyListView;
  gSearchInput.focus();
}

function displayFullList() {
  return gShowAllKeysElement.getAttribute("checked") == "true";
}

function loadkeyList() {
  EnigmailLog.DEBUG("enigmailKeyManager.js: loadkeyList\n");

  sortTree();
  gKeyListView.applyFilter(0);
  document.getElementById("pleaseWait").hidePopup();
  document.getElementById("statusText").value = " ";
  document.getElementById("progressBar").style.visibility = "collapse";
}

function clearKeyCache() {
  EnigmailKeyRing.clearCache();
  refreshKeys();
}

function refreshKeys() {
  EnigmailLog.DEBUG("enigmailKeyManager.js: refreshKeys\n");
  var keyList = getSelectedKeys();
  gEnigLastSelectedKeys = [];
  for (var i = 0; i < keyList.length; i++) {
    gEnigLastSelectedKeys[keyList[i]] = 1;
  }

  buildKeyList(true);
}

function reloadKeys() {
  let i = 0;
  let c = Components.stack;

  while (c) {
    if (c.name == "reloadKeys") {
      i++;
    }
    c = c.caller;
  }

  // detect recursion and don't continue if too much recursion
  // this can happen if the key list is empty
  if (i < 4) {
    buildKeyList(true);
  }
}

function buildKeyList(refresh) {
  EnigmailLog.DEBUG("enigmailKeyManager.js: buildKeyList\n");

  var keyListObj = {};

  if (refresh) {
    EnigmailKeyRing.clearCache();
  }

  keyListObj = EnigmailKeyRing.getAllKeys(
    window,
    getSortColumn(),
    getSortDirection()
  );

  if (!keyListObj.keySortList) {
    return;
  }

  gKeyList = keyListObj.keyList;
  gKeySortList = keyListObj.keySortList;

  gKeyListView.keysRefreshed();
}

function getSelectedKeys() {
  let selList = [];
  let rangeCount = gUserList.view.selection.getRangeCount();
  for (let i = 0; i < rangeCount; i++) {
    let start = {};
    let end = {};
    gUserList.view.selection.getRangeAt(i, start, end);
    for (let c = start.value; c <= end.value; c++) {
      try {
        //selList.push(gUserList.view.getItemAtIndex(c).getAttribute("keyNum"));
        selList.push(gKeyListView.getFilteredRow(c).keyNum);
      } catch (ex) {
        return [];
      }
    }
  }
  return selList;
}

function getSelectedKeyIds() {
  let keyList = getSelectedKeys();

  let a = [];
  for (let i in keyList) {
    a.push(gKeyList[keyList[i]].keyId);
  }

  return a;
}

function enigmailKeyMenu() {
  var keyList = getSelectedKeys();
  if (keyList.length == 1 && gKeyList[keyList[0]].secretAvailable) {
    document.getElementById("bcRevoke").removeAttribute("collapsed");
    document.getElementById("bcEditKey").removeAttribute("collapsed");
  } else {
    document.getElementById("bcRevoke").setAttribute("collapsed", "true");
    document.getElementById("bcEditKey").setAttribute("collapsed", "true");
  }

  if (keyList.length == 1 && gKeyList[keyList[0]].photoAvailable) {
    document.getElementById("bcViewPhoto").removeAttribute("collapsed");
  } else {
    document.getElementById("bcViewPhoto").setAttribute("collapsed", "true");
  }

  if (enigGetClipboard().length > 0) {
    document.getElementById("bcClipbrd").removeAttribute("disabled");
  } else {
    document.getElementById("bcClipbrd").setAttribute("disabled", "true");
  }

  if (keyList.length == 1) {
    document.getElementById("bcOneKey").removeAttribute("disabled");
    document.getElementById("bcDeleteKey").removeAttribute("disabled");
    document.getElementById("bcNoKey").removeAttribute("disabled");
  } else {
    if (keyList.length === 0) {
      document.getElementById("bcNoKey").setAttribute("disabled", "true");
    } else {
      document.getElementById("bcNoKey").removeAttribute("disabled");
    }
    document.getElementById("bcOneKey").setAttribute("disabled", "true");
    document.getElementById("bcDeleteKey").setAttribute("disabled", "true");
  }
}

function onListClick(event) {
  if (event.detail > 2) {
    return;
  }

  if (event.type === "click") {
    // Mouse event
    let { col } = gTreeFuncs.getCellAt(event.clientX, event.clientY);

    if (!col) {
      // not clicked on a valid column (e.g. scrollbar)
      return;
    }
  }

  if (event.detail != 2) {
    return;
  }

  // do not propagate double clicks
  event.stopPropagation();
  enigmailKeyDetails();
}

function enigmailSelectAllKeys() {
  gUserList.view.selection.selectAll();
}

function enigmailKeyDetails() {
  var keyList = getSelectedKeys();
  if (keyList.length > 0) {
    if (
      EnigmailWindows.openKeyDetails(window, gKeyList[keyList[0]].keyId, false)
    ) {
      refreshKeys();
    }
  }
}

function enigmailDeleteKey() {
  var keyList = getSelectedKeys();
  var deleteSecret = false;

  var enigmailSvc = GetEnigmailSvc();
  if (!enigmailSvc) {
    return;
  }

  if (keyList.length == 1) {
    // one key selected
    var userId = gKeyList[keyList[0]].userId;
    if (gKeyList[keyList[0]].secretAvailable) {
      if (
        !EnigConfirm(
          l10n.formatValueSync("delete-secret-key", {
            userId,
          }),
          EnigGetString("dlg.button.delete")
        )
      ) {
        return;
      }
      deleteSecret = true;
    } else if (
      !EnigConfirm(
        l10n.formatValueSync("delete-pub-key", {
          userId,
        }),
        EnigGetString("dlg.button.delete")
      )
    ) {
      return;
    }
  } else {
    // several keys selected
    for (var i = 0; i < keyList.length; i++) {
      if (gKeyList[keyList[i]].secretAvailable) {
        deleteSecret = true;
      }
    }

    if (deleteSecret) {
      if (
        !EnigConfirm(
          l10n.formatValueSync("delete-mix"),
          EnigGetString("dlg.button.delete")
        )
      ) {
        return;
      }
    } else if (
      !EnigConfirm(
        l10n.formatValueSync("deleteSelectedPubKey"),
        EnigGetString("dlg.button.delete")
      )
    ) {
      return;
    }
  }

  const cApi = EnigmailCryptoAPI();
  for (let j in keyList) {
    let fpr = gKeyList[keyList[j]].fpr;
    cApi.sync(cApi.deleteKey(fpr, deleteSecret));
    cApi.sync(PgpSqliteDb2.deleteAcceptance(fpr));
  }
  clearKeyCache();
}

function enigCreateKeyMsg() {
  var enigmailSvc = GetEnigmailSvc();
  if (!enigmailSvc) {
    return;
  }

  var keyList = getSelectedKeyIds();
  if (keyList.length === 0) {
    document.l10n.formatValue("no-key-selected").then(value => {
      EnigAlert(value);
    });
    return;
  }

  var tmpDir = EnigGetTempDir();
  var tmpFile;
  try {
    tmpFile = Cc[ENIG_LOCAL_FILE_CONTRACTID].createInstance(
      EnigGetLocalFileApi()
    );
    tmpFile.initWithPath(tmpDir);
    if (!(tmpFile.isDirectory() && tmpFile.isWritable())) {
      EnigAlert(EnigGetString("noTempDir"));
      return;
    }
  } catch (ex) {}
  tmpFile.append("key.asc");
  tmpFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);

  // save file
  var exitCodeObj = {};
  var errorMsgObj = {};

  var keyIdArray = [];
  for (let id of keyList) {
    keyIdArray.push("0x" + id);
  }

  EnigmailKeyRing.extractKey(
    false,
    keyIdArray,
    tmpFile,
    exitCodeObj,
    errorMsgObj
  );
  if (exitCodeObj.value !== 0) {
    EnigAlert(errorMsgObj.value);
    return;
  }

  // create attachment
  var ioServ = Services.io;
  var tmpFileURI = ioServ.newFileURI(tmpFile);
  var keyAttachment = Cc[
    "@mozilla.org/messengercompose/attachment;1"
  ].createInstance(Ci.nsIMsgAttachment);
  keyAttachment.url = tmpFileURI.spec;
  if (keyList.length == 1) {
    keyAttachment.name = "0x" + keyList[0] + ".asc";
  } else {
    keyAttachment.name = "pgpkeys.asc";
  }
  keyAttachment.temporary = true;
  keyAttachment.contentType = "application/pgp-keys";

  // create Msg
  var msgCompFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  msgCompFields.addAttachment(keyAttachment);

  var msgCompSvc = Cc["@mozilla.org/messengercompose;1"].getService(
    Ci.nsIMsgComposeService
  );

  var msgCompParam = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  msgCompParam.composeFields = msgCompFields;
  msgCompParam.identity = EnigmailFuncs.getDefaultIdentity();
  msgCompParam.type = Ci.nsIMsgCompType.New;
  msgCompParam.format = Ci.nsIMsgCompFormat.Default;
  msgCompParam.originalMsgURI = "";
  msgCompSvc.OpenComposeWindowWithParams("", msgCompParam);
}

function createNewMail() {
  var keyList = getSelectedKeys();
  if (keyList.length === 0) {
    document.l10n.formatValue("no-key-selected").then(value => {
      EnigmailDialog.info(window, value);
    });
    return;
  }

  var addresses = [];
  var rangeCount = gUserList.view.selection.getRangeCount();
  var start = {};
  var end = {};
  var keyType, keyNum, r, i;

  for (i = 0; i < rangeCount; i++) {
    gUserList.view.selection.getRangeAt(i, start, end);

    for (r = start.value; r <= end.value; r++) {
      try {
        keyType = gUserList.view.getItemAtIndex(r).getAttribute("keytype");
        keyNum = gUserList.view.getItemAtIndex(r).getAttribute("keyNum");

        if (keyType == "uid") {
          var uidNum = Number(
            gUserList.view.getItemAtIndex(r).getAttribute("uidNum")
          );
          addresses.push(gKeyList[keyNum].userIds[uidNum].userId);
        } else {
          addresses.push(gKeyList[keyNum].userId);
        }
      } catch (ex) {}
    }
  }

  // create Msg
  var msgCompFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  msgCompFields.to = addresses.join(", ");

  var msgCompSvc = Cc["@mozilla.org/messengercompose;1"].getService(
    Ci.nsIMsgComposeService
  );

  var msgCompParam = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  msgCompParam.composeFields = msgCompFields;
  msgCompParam.identity = EnigmailFuncs.getDefaultIdentity();
  msgCompParam.type = Ci.nsIMsgCompType.New;
  msgCompParam.format = Ci.nsIMsgCompFormat.Default;
  msgCompParam.originalMsgURI = "";
  msgCompSvc.OpenComposeWindowWithParams("", msgCompParam);
}

/*
function enigEditKeyTrust() {
  var keyList = getSelectedKeys();
  if (keyList.length === 0) {
    EnigmailDialog.info(window, EnigGetString("noKeySelected"));
    return;
  }
  var userIdList = [];
  var keyIds = [];
  for (var i = 0; i < keyList.length; i++) {
    userIdList.push(gKeyList[keyList[i]].userId);
    keyIds.push(gKeyList[keyList[i]].keyId);
  }

  if (EnigEditKeyTrust(userIdList, keyIds)) {
    refreshKeys();
  }
}
*/

/*
function enigEditKeyExpiry() {
  var keyList = getSelectedKeys();
  if (keyList.length === 0) {
    EnigmailDialog.info(window, EnigGetString("noKeySelected"));
    return;
  }
  var userIdList = [];
  var keyIds = [];
  for (var i = 0; i < keyList.length; i++) {
    userIdList.push(gKeyList[keyList[i]].userId);
    keyIds.push(gKeyList[keyList[i]].keyId);
  }

  if (EnigEditKeyExpiry(userIdList, keyIds)) {
    refreshKeys();
  }
}
*/

/*
function enigSignKey() {
  var keyList = getSelectedKeys();
  if (keyList.length === 0) {
    EnigmailDialog.info(window, EnigGetString("noKeySelected"));
    return;
  }
  if (
    EnigSignKey(gKeyList[keyList[0]].userId, gKeyList[keyList[0]].keyId, null)
  ) {
    refreshKeys();
  }
}
*/

/*
function enigmailRevokeKey() {
  var keyList = getSelectedKeys();
  EnigRevokeKey(
    gKeyList[keyList[0]].keyId,
    gKeyList[keyList[0]].userId,
    function(success) {
      if (success) {
        refreshKeys();
      }
    }
  );
}

function enigCreateRevokeCert() {
  var keyList = getSelectedKeys();

  EnigCreateRevokeCert(gKeyList[keyList[0]].keyId, gKeyList[keyList[0]].userId);
}
*/

async function enigmailExportKeys() {
  var keyList = getSelectedKeys();
  if (keyList.length === 0) {
    EnigmailDialog.info(
      window,
      await document.l10n.formatValue("no-key-selected")
    );
    return;
  }

  // check whether we want to export a private key anywhere in the key list
  var secretFound = false;
  for (var i = 0; i < keyList.length && !secretFound; ++i) {
    if (gKeyList[keyList[i]].secretAvailable) {
      secretFound = true;
    }
  }

  var exportSecretKey = false;
  if (secretFound) {
    // double check that also the pivate keys shall be exported
    var r = EnigmailDialog.msgBox(window, {
      msgtext: await document.l10n.formatValue("export-secret-key"),
      dialogTitle: EnigGetString("enigConfirm2"),
      button1: await document.l10n.formatValue("key-man-button-export-pub-key"),
      button2: await document.l10n.formatValue("key-man-button-export-sec-key"),
      cancelButton: ":cancel",
      iconType: EnigmailConstants.ICONTYPE_QUESTION,
    });
    switch (r) {
      case 0: // export pub key only
        break;
      case 1: // export secret key
        exportSecretKey = true;
        break;
      default:
        // cancel
        return;
    }
  }

  var enigmailSvc = GetEnigmailSvc();
  if (!enigmailSvc) {
    return;
  }
  var defaultFileName;
  if (keyList.length == 1) {
    defaultFileName = gKeyList[keyList[0]].userId.replace(/[<>]/g, "");
    if (exportSecretKey) {
      defaultFileName =
        defaultFileName +
        " " +
        `(0x${gKeyList[keyList[0]].keyId}` +
        " " +
        "pub-sec.asc";
    } else {
      defaultFileName =
        defaultFileName +
        " " +
        `(0x${gKeyList[keyList[0]].keyId})` +
        " " +
        "pub.asc";
    }
  } else if (exportSecretKey) {
    defaultFileName =
      (await document.l10n.formatValue("default-pub-sec-key-filename")) +
      ".asc";
  } else {
    defaultFileName =
      (await document.l10n.formatValue("default-pub-key-filename")) + ".asc";
  }

  var FilePickerLabel = "";

  if (exportSecretKey) {
    FilePickerLabel = await document.l10n.formatValue("export-keypair-to-file");
  } else {
    FilePickerLabel = await document.l10n.formatValue("export-to-file");
  }
  var outFile = EnigFilePicker(
    FilePickerLabel,
    "",
    true,
    "*.asc",
    defaultFileName,
    [await document.l10n.formatValue("ascii-armor-file"), "*.asc"]
  );
  if (!outFile) {
    return;
  }

  var exitCodeObj = {};
  var errorMsgObj = {};

  let keyList2 = getSelectedKeyIds();
  var keyIdArray = [];
  for (let id of keyList2) {
    keyIdArray.push("0x" + id);
  }

  EnigmailKeyRing.extractKey(
    exportSecretKey,
    keyIdArray,
    outFile,
    exitCodeObj,
    errorMsgObj
  );
  if (exitCodeObj.value !== 0) {
    EnigAlert(
      (await document.l10n.formatValue("save-keys-failed")) +
        "\n\n" +
        errorMsgObj.value
    );
  } else {
    EnigmailDialog.info(
      window,
      await document.l10n.formatValue("save-keys-ok")
    );
  }
}

/*
function enigmailManageUids() {
  var keyList = getSelectedKeys();
  var inputObj = {
    keyId: gKeyList[keyList[0]].keyId,
    ownKey: gKeyList[keyList[0]].secretAvailable,
  };
  var resultObj = {
    refresh: false,
  };
  window.openDialog(
    "chrome://openpgp/content/ui/enigmailManageUidDlg.xhtml",
    "",
    "dialog,modal,centerscreen,resizable=yes",
    inputObj,
    resultObj
  );
  if (resultObj.refresh) {
    refreshKeys();
  }
}
*/

/*
function enigmailChangePwd() {
  var keyList = getSelectedKeys();
  EnigChangeKeyPwd(gKeyList[keyList[0]].keyId, gKeyList[keyList[0]].userId);
}
*/

function enigGetClipboard() {
  return EnigmailClipboard.getClipboardContent(
    window,
    Ci.nsIClipboard.kGlobalClipboard
  );
}

function enigmailImportFromClipbrd() {
  var enigmailSvc = GetEnigmailSvc();
  if (!enigmailSvc) {
    return;
  }

  if (
    !EnigConfirm(
      l10n.formatValueSync("import-from-clip"),
      l10n.formatValueSync("key-man-button-import")
    )
  ) {
    return;
  }

  var cBoardContent = enigGetClipboard();
  var errorMsgObj = {};
  var preview = EnigmailKey.getKeyListFromKeyBlock(
    cBoardContent,
    errorMsgObj,
    true,
    true,
    false
  );
  // should we allow importing secret keys?
  var exitStatus = -1;

  if (preview && preview.length > 0) {
    if (preview.length == 1) {
      exitStatus = EnigmailDialog.confirmDlg(
        window,
        EnigmailLocale.getString("doImportOne", [
          preview[0].name,
          preview[0].id,
        ])
      );
    } else {
      exitStatus = EnigmailDialog.confirmDlg(
        window,
        EnigmailLocale.getString("doImportMultiple", [
          preview
            .map(function(a) {
              return "\t" + a.name + " (" + a.id + ")";
            })
            .join("\n"),
        ])
      );
    }

    if (exitStatus) {
      // import
      EnigmailKeyRing.importKey(
        window,
        false,
        cBoardContent,
        false,
        "",
        errorMsgObj
      );
      var keyList = preview.map(function(a) {
        return a.id;
      });
      EnigmailDialog.keyImportDlg(window, keyList);
      refreshKeys();
    }
  } else {
    EnigmailDialog.alert(window, EnigmailLocale.getString("previewFailed"));
  }
}

function enigmailCopyToClipbrd() {
  var enigmailSvc = GetEnigmailSvc();
  if (!enigmailSvc) {
    return;
  }

  var keyList = getSelectedKeyIds();
  if (keyList.length === 0) {
    document.l10n.formatValue("no-key-selected").then(value => {
      EnigmailDialog.info(window, value);
    });
    return;
  }
  var exitCodeObj = {};
  var errorMsgObj = {};

  var keyIdArray = [];
  for (let id of keyList) {
    keyIdArray.push("0x" + id);
  }

  var keyData = EnigmailKeyRing.extractKey(
    0,
    keyIdArray,
    null,
    exitCodeObj,
    errorMsgObj
  );
  if (exitCodeObj.value !== 0) {
    l10n.formatValue("copy-to-clipbrd-failed").then(value => {
      EnigAlert(value);
    });
    return;
  }
  if (EnigmailClipboard.setClipboardContent(keyData)) {
    EnigmailLog.DEBUG(
      "enigmailKeyManager.js: enigmailImportFromClipbrd: set clipboard data\n"
    );
    l10n.formatValue("copy-to-clipbrd-ok").then(value => {
      EnigmailDialog.info(window, value);
    });
  } else {
    l10n.formatValue("copy-to-clipbrd-failed").then(value => {
      EnigAlert(value);
    });
  }
}

/*
function enigmailSearchKey() {
  var inputObj = {
    searchList: null,
  };
  var resultObj = {};

  EnigDownloadKeys(inputObj, resultObj);

  if (resultObj.importedKeys > 0) {
    refreshKeys();
  }
}

function enigmailUploadKeys() {
  accessKeyServer(EnigmailConstants.UPLOAD_KEY, enigmailUploadKeysCb);
}

function enigmailUploadKeysCb(exitCode, errorMsg, msgBox) {
  if (msgBox) {
    if (exitCode !== 0) {
      EnigAlert(EnigGetString("sendKeysFailed") + "\n" + errorMsg);
    }
  } else {
    return EnigGetString(exitCode === 0 ? "sendKeysOk" : "sendKeysFailed");
  }
  return "";
}

function enigmailUploadToWkd() {
  let selKeyList = getSelectedKeys();
  let keyList = [];
  for (let i = 0; i < selKeyList.length; i++) {
    keyList.push(gKeyList[selKeyList[i]]);
  }

  EnigmailWks.wksUpload(keyList, window)
    .then(result => {
      if (result.length > 0) {
        EnigmailDialog.info(window, EnigmailLocale.getString("sendKeysOk"));
      } else if (keyList.length === 1) {
        EnigmailDialog.alert(
          window,
          EnigmailLocale.getString("sendKeysFailed") +
            "\n\n" +
            EnigmailLocale.getString("noWksIdentity", keyList[0].userId)
        );
      } else {
        EnigmailDialog.alert(
          window,
          EnigmailLocale.getString("wksUpload.noKeySupported")
        );
      }
    })
    .catch(error => {
      EnigmailDialog.alert(
        window.EnigmailLocale.getString("sendKeysFailed") + "\n" + error
      );
    });
}
*/

/*
function enigmailReceiveKey() {
  accessKeyServer(EnigmailConstants.DOWNLOAD_KEY, enigmailReceiveKeyCb);
}
*/

function userAcceptsWarning(warningMessage) {
  if (!EnigGetPref("warnRefreshAll")) {
    return true;
  }

  let checkedObj = {};

  let confirm =
    EnigmailDialog.msgBox(
      window,
      {
        msgtext: warningMessage,
        checkboxLabel: EnigGetString("dlgNoPrompt"),
        button1: EnigGetString("dlg.button.continue"),
        cancelButton: ":cancel",
        iconType: EnigmailConstants.ICONTYPE_QUESTION,
        dialogTitle: EnigmailLocale.getString("enigConfirm2"),
      },
      checkedObj
    ) === 0;

  if (checkedObj.value) {
    EnigSetPref("warnRefreshAll", false);
  }
  return confirm;
}

/*
function userAcceptsRefreshWarning() {
  if (EnigmailPrefs.getPref("keyRefreshOn") === true) {
    return userAcceptsWarning(EnigGetString("refreshKeyServiceOn.warn"));
  }
  return userAcceptsWarning(EnigGetString("refreshKey.warn"));
}

function enigmailRefreshAllKeys() {
  if (userAcceptsRefreshWarning() === true) {
    accessKeyServer(EnigmailConstants.REFRESH_KEY, enigmailReceiveKeyCb);
  }
}
*/

/*
// Iterate through contact emails and download them
function enigmailDowloadContactKeysEngine() {
  let abManager = Cc["@mozilla.org/abmanager;1"].getService(Ci.nsIAbManager);
  let emails = [];

  for (let addressBook of abManager.directories) {
    if (addressBook instanceof Ci.nsIAbDirectory) {
      // or nsIAbItem or nsIAbCollection
      // ask for confirmation for each address book:
      var doIt = EnigmailDialog.confirmDlg(
        window,
        EnigGetString("downloadContactsKeys.importFrom", addressBook.dirName),
        EnigGetString("dlgYes"),
        EnigGetString("dlg.button.skip")
      );
      if (!doIt) {
        continue; // SKIP this address book
      }

      for (let card of addressBook.childCards) {
        try {
          let email = card.getPropertyAsAString("PrimaryEmail");
          if (email && email.includes("@")) {
            emails.push(email);
          }
        } catch (e) {}

        try {
          let email = card.getPropertyAsAString("SecondEmail");
          if (email && email.includes("@")) {
            emails.push(email);
          }
        } catch (e) {}
      }
    }
  }

  // list of emails might be empty here, in which case we do nothing
  if (emails.length <= 0) {
    return;
  }

  // sort the e-mail array
  emails.sort();

  //remove duplicates
  var i = 0;
  while (i < emails.length - 1) {
    if (emails[i] == emails[i + 1]) {
      emails.splice(i, 1);
    } else {
      i = i + 1;
    }
  }

  var inputObj = {
    searchList: emails,
    autoKeyServer: EnigmailPrefs.getPref("autoKeyServerSelection")
      ? EnigmailPrefs.getPref("keyserver").split(/[ ,;]/g)[0]
      : null,
  };
  var resultObj = {};

  EnigmailWindows.downloadKeys(window, inputObj, resultObj);

  if (resultObj.importedKeys > 0) {
    refreshKeys();
  }
}

function enigmailDownloadContactKeys() {
  var doIt = EnigmailDialog.confirmPref(
    window,
    EnigGetString("downloadContactsKeys.warn"),
    "warnDownloadContactKeys",
    EnigGetString("dlg.button.continue"),
    EnigGetString("dlg.button.cancel")
  );

  if (doIt) {
    enigmailDowloadContactKeysEngine();
  }
}
*/

function displayResult(arrayOfMsgText) {
  EnigmailDialog.info(window, arrayOfMsgText.join("\n"));
}

/*
function enigmailReceiveKeyCb(exitCode, errorMsg, msgBox) {
  EnigmailLog.DEBUG("enigmailKeyManager.js: enigmailReceiveKeyCb\n");
  if (msgBox) {
    if (exitCode === 0) {
      refreshKeys();
      EnigmailEvents.dispatchEvent(displayResult, 100, [
        EnigGetString("receiveKeysOk"),
        errorMsg,
      ]);
    } else {
      EnigmailEvents.dispatchEvent(displayResult, 100, [
        EnigGetString("receiveKeysFailed"),
        errorMsg,
      ]);
    }
  } else {
    return EnigGetString(
      exitCode === 0 ? "receiveKeysOk" : "receiveKeysFailed"
    );
  }
  return "";
}
*/

function enigmailImportKeysFromUrl() {
  var value = {
    value: "",
  };
  if (
    EnigmailDialog.promptValue(
      window,
      l10n.formatValueSync("import-from-url"),
      value
    )
  ) {
    var p = new Promise(function(resolve, reject) {
      var cbFunc = function(data) {
        EnigmailLog.DEBUG("enigmailImportKeysFromUrl: _cbFunc()\n");
        var errorMsgObj = {};

        var preview = EnigmailKey.getKeyListFromKeyBlock(
          data,
          errorMsgObj,
          true,
          true,
          false
        );
        // should we allow importing secret keys?
        var exitStatus = -1;

        if (preview && preview.length > 0) {
          if (preview.length == 1) {
            exitStatus = EnigmailDialog.confirmDlg(
              window,
              EnigmailLocale.getString("doImportOne", [
                preview[0].name,
                preview[0].id,
              ])
            );
          } else {
            exitStatus = EnigmailDialog.confirmDlg(
              window,
              EnigmailLocale.getString("doImportMultiple", [
                preview
                  .map(function(a) {
                    return "\t" + a.name + " (" + a.id + ")";
                  })
                  .join("\n"),
              ])
            );
          }

          if (exitStatus) {
            EnigmailKeyRing.importKey(
              window,
              false,
              data,
              false,
              "",
              errorMsgObj
            );
            errorMsgObj.preview = preview;
            resolve(errorMsgObj);
          }
        } else {
          EnigmailDialog.alert(
            window,
            EnigmailLocale.getString("previewFailed")
          );
        }
      };

      try {
        var bufferListener = EnigmailStreams.newStringStreamListener(cbFunc);
        var ioServ = Services.io;
        var msgUri = ioServ.newURI(value.value);

        var channel = EnigmailStreams.createChannel(msgUri);
        channel.asyncOpen(bufferListener, msgUri);
      } catch (ex) {
        var err = {
          value: ex,
        };
        reject(err);
      }
    });

    p.then(function(errorMsgObj) {
      var keyList = errorMsgObj.preview.map(function(a) {
        return a.id;
      });
      EnigmailDialog.keyImportDlg(window, keyList);
      refreshKeys();
    }).catch(function(reason) {
      EnigmailDialog.alert(
        window,
        EnigGetString("generalError", [reason.value])
      );
    });
  }
}

function initiateAcKeyTransfer() {
  EnigmailWindows.inititateAcSetupMessage();
}

//
// ----- key filtering functionality  -----
//

function applyFilter() {
  gKeyListView.applyFilter(0);
}

function enigmailToggleShowAll() {
  EnigSetPref("keyManShowAllKeys", displayFullList());

  if (!gSearchInput.value || gSearchInput.value.length === 0) {
    gKeyListView.applyFilter(0);
  }
}

function determineHiddenKeys(
  keyObj,
  showInvalidKeys,
  showUntrustedKeys,
  showOthersKeys
) {
  var show = true;

  const INVALID_KEYS = "ierdD";
  const UNTRUSTED_KEYS = "n-";

  if (!showInvalidKeys && INVALID_KEYS.includes(EnigGetTrustCode(keyObj))) {
    show = false;
  }
  if (!showUntrustedKeys && UNTRUSTED_KEYS.includes(keyObj.ownerTrust)) {
    show = false;
  }
  if (!showOthersKeys && !keyObj.secretAvailable) {
    show = false;
  }

  return show;
}

//
// ----- keyserver related functionality ----
//
function accessKeyServer(accessType, callbackFunc) {
  var enigmailSvc = GetEnigmailSvc();
  if (!enigmailSvc) {
    return;
  }

  const ioService = Services.io;
  if (ioService && ioService.offline) {
    document.l10n.formatValue("need-online").then(value => {
      EnigmailDialog.alert(window, value);
    });
    return;
  }

  let inputObj = {};
  let resultObj = {};
  let selKeyList = getSelectedKeys();
  let keyList = [];
  for (let i = 0; i < selKeyList.length; i++) {
    keyList.push(gKeyList[selKeyList[i]]);
  }

  if (accessType !== EnigmailConstants.REFRESH_KEY && selKeyList.length === 0) {
    if (
      EnigmailDialog.confirmDlg(
        window,
        l10n.formatValueSync("refresh-all-question"),
        l10n.formatValueSync("key-man-button-refresh-all")
      )
    ) {
      accessType = EnigmailConstants.DOWNLOAD_KEY;
      EnigmailDialog.alertPref(
        window,
        l10n.formatValueSync("refresh-key-warn"),
        "warnRefreshAll"
      );
    } else {
      return;
    }
  }

  let keyServer = EnigmailPrefs.getPref("autoKeyServerSelection")
    ? EnigmailPrefs.getPref("keyserver").split(/[ ,;]/g)[0]
    : null;
  if (!keyServer) {
    switch (accessType) {
      case EnigmailConstants.REFRESH_KEY:
        inputObj.upload = false;
        inputObj.keyId = "All keys";
        break;
      case EnigmailConstants.DOWNLOAD_KEY:
        inputObj.upload = false;
        inputObj.keyId = keyList
          .map(k => {
            try {
              return EnigmailFuncs.stripEmail(k.userId);
            } catch (x) {
              return "0x" + k.fpr;
            }
          })
          .join(", ");
        break;
      case EnigmailConstants.UPLOAD_KEY:
        inputObj.upload = true;
        inputObj.keyId = keyList
          .map(k => {
            try {
              return EnigmailFuncs.stripEmail(k.userId);
            } catch (x) {
              return "0x" + k.fpr;
            }
          })
          .join(", ");
        break;
      default:
        inputObj.upload = true;
        inputObj.keyId = "";
    }

    window.openDialog(
      "chrome://openpgp/content/ui/enigmailKeyserverDlg.xhtml",
      "",
      "dialog,modal,centerscreen",
      inputObj,
      resultObj
    );
    keyServer = resultObj.value;
  }

  if (keyServer.length === 0) {
    return;
  }

  if (accessType !== EnigmailConstants.REFRESH_KEY) {
    inputObj.keyServer = keyServer;
    inputObj.accessType = accessType;
    inputObj.keyId = keyList.map(k => {
      return "0x" + k.fpr;
    });
    window.openDialog(
      "chrome://openpgp/content/ui/enigRetrieveProgress.xhtml",
      "",
      "dialog,modal,centerscreen",
      inputObj,
      resultObj
    );

    if (resultObj.result) {
      callbackFunc(resultObj.exitCode, resultObj.errorMsg, false);
    }
  } else {
    EnigmailKeyServer.refresh(keyServer);
  }
}

function getSortDirection() {
  return gUserList.getAttribute("sortDirection") == "ascending" ? 1 : -1;
}

function sortTree(column) {
  var columnName;
  var order = getSortDirection();

  //if the column is passed and it's already sorted by that column, reverse sort
  if (column) {
    columnName = column.id;
    if (gUserList.getAttribute("sortResource") == columnName) {
      order *= -1;
    } else {
      document
        .getElementById(gUserList.getAttribute("sortResource"))
        .removeAttribute("sortDirection");
      order = 1;
    }
  } else {
    columnName = gUserList.getAttribute("sortResource");
  }
  gUserList.setAttribute(
    "sortDirection",
    order == 1 ? "ascending" : "descending"
  );
  let col = document.getElementById(columnName);
  if (col) {
    col.setAttribute("sortDirection", order == 1 ? "ascending" : "descending");
    gUserList.setAttribute("sortResource", columnName);
  } else {
    gUserList.setAttribute("sortResource", "enigUserNameCol");
  }
  buildKeyList(false);
}

function getSortColumn() {
  switch (gUserList.getAttribute("sortResource")) {
    case "enigUserNameCol":
      return "userid";
    case "keyCol":
      return "keyid";
    case "expCol":
      return "expiry";
    case "fprCol":
      return "fpr";
    default:
      return "?";
  }
}

/***************************** TreeView for user list ***********************************/
/**
 * gKeyListView implements the nsITreeView interface for the displayed list.
 *
 * For speed reasons, we use two lists:
 * - keyViewList:   contains the full list of pointers to all  keys and rows that are
 *                  potentially displayed ordered according to the sort column
 * - keyFilterList: contains the indexes to keyViewList of the keys that are displayed
 *                  according to the current filter criteria.
 */
var gKeyListView = {
  keyViewList: [],
  keyFilterList: [],

  //// nsITreeView implementation

  rowCount: 0,
  selection: null,

  canDrop(index, orientation, dataTransfer) {
    return false;
  },

  cycleCell(row, col) {},
  cycleHeader(col) {},
  drop(row, orientation, dataTransfer) {},

  getCellProperties(row, col) {
    let r = this.getFilteredRow(row);
    if (!r) {
      return "";
    }

    let keyObj = gKeyList[r.keyNum];
    if (!keyObj) {
      return "";
    }

    let keyTrustStyle = "";

    switch (r.rowType) {
      case "key":
      case "uid":
        switch (keyObj.keyTrust) {
          case "q":
            keyTrustStyle = "enigmail_keyValid_unknown";
            break;
          case "i":
            keyTrustStyle = "enigmail_keyValid_invalid";
            break;
          case "d":
            keyTrustStyle = "enigmail_keyValid_disabled";
            break;
          case "r":
            keyTrustStyle = "enigmail_keyValid_revoked";
            break;
          case "e":
            keyTrustStyle = "enigmail_keyValid_expired";
            break;
          case "n":
            keyTrustStyle = "enigmail_keyTrust_untrusted";
            break;
          case "m":
            keyTrustStyle = "enigmail_keyTrust_marginal";
            break;
          case "f":
            keyTrustStyle = "enigmail_keyTrust_full";
            break;
          case "u":
            keyTrustStyle = "enigmail_keyTrust_ultimate";
            break;
          case "-":
            keyTrustStyle = "enigmail_keyTrust_unknown";
            break;
          default:
            keyTrustStyle = "enigmail_keyTrust_unknown";
            break;
        }

        if (keyObj.keyUseFor.includes("D")) {
          keyTrustStyle = "enigmail_keyValid_disabled";
        }

        if (
          (keyObj.keyTrust.length > 0 &&
            ENIG_KEY_NOT_VALID.includes(keyObj.keyTrust.charAt(0))) ||
          keyObj.keyUseFor.includes("D")
        ) {
          keyTrustStyle += " enigKeyInactive";
        }

        if (r.rowType === "key" && keyObj.secretAvailable) {
          keyTrustStyle += " enigmailOwnKey";
        }
        break;
    }

    return keyTrustStyle;
  },

  getCellText(row, col) {
    let r = this.getFilteredRow(row);
    if (!r) {
      return "";
    }
    let keyObj = gKeyList[r.keyNum];
    if (!keyObj) {
      return "???";
    }

    switch (r.rowType) {
      case "key":
        switch (col.id) {
          case "enigUserNameCol":
            return keyObj.userId;
          case "keyCol":
            return keyObj.keyId;
          case "expCol":
            return keyObj.expiry;
          case "fprCol":
            return keyObj.fprFormatted;
        }
        break;
      case "uid":
        switch (col.id) {
          case "enigUserNameCol":
            return keyObj.userIds[r.uidNum].userId;
        }
        break;
    }

    return "";
  },
  getCellValue(row, col) {
    return "";
  },
  getColumnProperties(col) {
    return "";
  },

  getImageSrc(row, col) {
    let r = this.getFilteredRow(row);
    if (!r) {
      return null;
    }
    //let keyObj = gKeyList[r.keyNum];

    return null;
  },

  /**
   * indentation level for rows
   */
  getLevel(row) {
    let r = this.getFilteredRow(row);
    if (!r) {
      return 0;
    }

    switch (r.rowType) {
      case "key":
        return 0;
      case "uid":
        return 1;
    }

    return 0;
  },

  getParentIndex(idx) {
    return -1;
  },
  getProgressMode(row, col) {},

  getRowProperties(row) {
    return "";
  },
  hasNextSibling(rowIndex, afterIndex) {
    return false;
  },
  isContainer(row) {
    let r = this.getFilteredRow(row);
    if (!r) {
      return false;
    }
    switch (r.rowType) {
      case "key":
        return true;
    }

    return false;
  },
  isContainerEmpty(row) {
    let r = this.getFilteredRow(row);
    if (!r) {
      return true;
    }
    switch (r.rowType) {
      case "key":
        return !r.hasSubUID;
    }
    return true;
  },
  isContainerOpen(row) {
    return this.getFilteredRow(row).isOpen;
  },
  isEditable(row, col) {
    return false;
  },
  isSelectable(row, col) {
    return true;
  },
  isSeparator(index) {
    return false;
  },
  isSorted() {
    return false;
  },
  performAction(action) {},
  performActionOnCell(action, row, col) {},
  performActionOnRow(action, row) {},
  selectionChanged() {},
  // void setCellText(in long row, in nsITreeColumn col, in AString value);
  // void setCellValue(in long row, in nsITreeColumn col, in AString value);
  setTree(treebox) {
    this.treebox = treebox;
  },

  toggleOpenState(row) {
    let r = this.getFilteredRow(row);
    if (!r) {
      return;
    }
    let realRow = this.keyFilterList[row];
    switch (r.rowType) {
      case "key":
        if (r.isOpen) {
          let i = 0;
          while (
            this.getFilteredRow(row + 1 + i) &&
            this.getFilteredRow(row + 1 + i).keyNum === r.keyNum
          ) {
            ++i;
          }

          this.keyViewList.splice(realRow + 1, i);
          r.isOpen = false;
          this.applyFilter(row);
        } else {
          this.appendUids("uid", r.keyNum, realRow, this.keyViewList[row]);

          r.isOpen = true;
          this.applyFilter(row);
        }
        break;
    }
  },

  /**
   * add UIDs for a given key to key view
   *
   * @param uidType: String - one of uid (user ID), uat (photo)
   * @param keyNum:  Number - index of key in gKeyList
   * @param realRow: Number - index of row in keyViewList (i.e. without filter)
   *
   * @return Number: number of UIDs added
   */
  appendUids(uidType, keyNum, realRow, parentRow) {
    let keyObj = gKeyList[keyNum];
    let uidAdded = 0;

    for (let i = 1; i < keyObj.userIds.length; i++) {
      if (keyObj.userIds[i].type === uidType) {
        ++uidAdded;
        this.keyViewList.splice(realRow + uidAdded, 0, {
          rowType: uidType,
          keyNum,
          parent: parentRow,
          uidNum: i,
        });
      }
    }

    return uidAdded;
  },

  /**
   * Reload key list entirely
   */
  keysRefreshed() {
    this.keyViewList = [];
    this.keyFilterList = [];
    for (let i = 0; i < gKeySortList.length; i++) {
      this.keyViewList.push({
        row: i,
        rowType: "key",
        fpr: gKeySortList[i].fpr,
        keyNum: gKeySortList[i].keyNum,
        isOpen: false,
        hasSubUID: gKeyList[gKeySortList[i].keyNum].userIds.length > 1,
      });
    }

    this.applyFilter(0);
    let oldRowCount = this.rowCount;
    this.rowCount = this.keyViewList.length;
    gTreeFuncs.rowCountChanged(0, this.rowCount - oldRowCount);
  },

  /**
   * If no search term is entered, decide which keys to display
   *
   * @return array of keyNums (= display some keys) or null (= display ALL keys)
   */
  showOrHideAllKeys() {
    var hideNode = !displayFullList();
    var initHint = document.getElementById("emptyTree");
    var showInvalidKeys = gShowInvalidKeys.getAttribute("checked") == "true";
    var showUntrustedKeys =
      gShowUntrustedKeys.getAttribute("checked") == "true";
    var showOthersKeys = gShowOthersKeys.getAttribute("checked") == "true";

    document.getElementById("nothingFound").hidePopup();
    if (hideNode) {
      initHint.showPopup(gTreeChildren, -1, -1, "tooltip", "after_end", "");
      return [];
    }
    initHint.hidePopup();

    if (showInvalidKeys && showUntrustedKeys && showOthersKeys) {
      return null;
    }

    let keyShowList = [];
    for (let i = 0; i < gKeyList.length; i++) {
      if (
        determineHiddenKeys(
          gKeyList[i],
          showInvalidKeys,
          showUntrustedKeys,
          showOthersKeys
        )
      ) {
        keyShowList.push(i);
      }
    }

    return keyShowList;
  },

  /**
   * Search for keys that match filter criteria
   *
   * @return array of keyNums (= display some keys) or null (= display ALL keys)
   */
  getFilteredKeys() {
    let searchTxt = gSearchInput.value;

    if (!searchTxt || searchTxt.length === 0) {
      return this.showOrHideAllKeys();
    }

    if (!gKeyList) {
      return [];
    }
    let showInvalidKeys = gShowInvalidKeys.getAttribute("checked") == "true";
    let showUntrustedKeys =
      gShowUntrustedKeys.getAttribute("checked") == "true";
    let showOthersKeys = gShowOthersKeys.getAttribute("checked") == "true";

    document.getElementById("emptyTree").hidePopup();

    // skip leading 0x in case we search for a key:
    if (searchTxt.length > 2 && searchTxt.substr(0, 2).toLowerCase() == "0x") {
      searchTxt = searchTxt.substr(2);
    }

    searchTxt = searchTxt.toLowerCase();
    searchTxt = searchTxt.replace(/^(\s*)(.*)/, "$2").replace(/\s+$/, ""); // trim spaces

    // check if we search for a full fingerprint (with optional spaces every 4 letters)
    var fpr = null;
    if (searchTxt.length == 49) {
      // possible fingerprint with spaces?
      if (
        searchTxt.search(/^[0-9a-f ]*$/) >= 0 &&
        searchTxt[4] == " " &&
        searchTxt[9] == " " &&
        searchTxt[14] == " " &&
        searchTxt[19] == " " &&
        searchTxt[24] == " " &&
        searchTxt[29] == " " &&
        searchTxt[34] == " " &&
        searchTxt[39] == " " &&
        searchTxt[44] == " "
      ) {
        fpr = searchTxt.replace(/ /g, "");
      }
    } else if (searchTxt.length == 40) {
      // possible fingerprint without spaces
      if (searchTxt.search(/^[0-9a-f ]*$/) >= 0) {
        fpr = searchTxt;
      }
    }

    let keyShowList = [];

    for (let i = 0; i < gKeyList.length; i++) {
      let keyObj = gKeyList[i];
      let uid = keyObj.userId;
      let showKey = false;

      // does a user ID (partially) match?
      for (let idx = 0; idx < keyObj.userIds.length; idx++) {
        uid = keyObj.userIds[idx].userId;
        if (uid.toLowerCase().includes(searchTxt)) {
          showKey = true;
        }
      }

      // does the full fingerprint (without spaces) match?
      // - no partial match check because this is special for the collapsed spaces inside the fingerprint
      if (showKey === false && fpr && keyObj.fpr.toLowerCase() == fpr) {
        showKey = true;
      }
      // does the fingerprint (partially) match?
      if (showKey === false && keyObj.fpr.toLowerCase().includes(searchTxt)) {
        showKey = true;
      }
      // does a sub key of (partially) match?
      if (showKey === false) {
        for (
          let subKeyIdx = 0;
          subKeyIdx < keyObj.subKeys.length;
          subKeyIdx++
        ) {
          let subkey = keyObj.subKeys[subKeyIdx].keyId;
          if (subkey.toLowerCase().includes(searchTxt)) {
            showKey = true;
          }
        }
      }
      // take option to show invalid/untrusted... keys into account
      if (
        showKey &&
        determineHiddenKeys(
          keyObj,
          showInvalidKeys,
          showUntrustedKeys,
          showOthersKeys
        )
      ) {
        keyShowList.push(i);
      }
    }

    return keyShowList;
  },

  /**
   * Trigger re-displaying the list of keys and apply a filter
   *
   * @param selectedRow: Number - the row that is currently selected or
   *                     clicked on
   */
  applyFilter(selectedRow) {
    let keyDisplayList = this.getFilteredKeys();

    this.keyFilterList = [];
    if (keyDisplayList === null) {
      for (let i = 0; i < this.keyViewList.length; i++) {
        this.keyFilterList.push(i);
      }

      this.adjustRowCount(this.keyViewList.length, selectedRow);
    } else {
      for (let i = 0; i < this.keyViewList.length; i++) {
        if (keyDisplayList.includes(this.keyViewList[i].keyNum)) {
          this.keyFilterList.push(i);
        }
      }

      this.adjustRowCount(this.keyFilterList.length, selectedRow);
    }
  },

  /**
   * Re-calculate the row count and instruct the view to update
   */

  adjustRowCount(newRowCount, selectedRow) {
    if (this.rowCount === newRowCount) {
      gTreeFuncs.invalidate();
      return;
    }

    let delta = newRowCount - this.rowCount;
    this.rowCount = newRowCount;
    gTreeFuncs.rowCountChanged(selectedRow, delta);
  },

  /**
   * Determine the row object from the a filtered row number
   *
   * @param row: Number - row number of displayed (=filtered) list
   *
   * @return Object: keyViewList entry of corresponding row
   */

  getFilteredRow(row) {
    let r = this.keyFilterList[row];
    if (r !== undefined) {
      return this.keyViewList[r];
    }
    return null;
  },

  treebox: null,
};
