/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Uses: chrome://openpgp/content/ui/enigmailCommon.js

"use strict";

// Modules
/* global EnigmailApp: false, EnigmailKeyRing: false, GetEnigmailSvc: false,
   EnigInitCommon: false, EnigSavePrefs: false, EnigFilePicker: false,
   EnigGetFilePath: false, EnigmailWindows: false, PgpSqliteDb2: false */

// Initialize enigmailCommon.
EnigInitCommon("enigmailKeygen");

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);
var EnigmailCryptoAPI = ChromeUtils.import(
  "chrome://openpgp/content/modules/cryptoAPI.jsm"
).EnigmailCryptoAPI;
var { EnigmailFiles } = ChromeUtils.import(
  "chrome://openpgp/content/modules/files.jsm"
);
var OpenPGPMasterpass = ChromeUtils.import(
  "chrome://openpgp/content/modules/masterpass.jsm"
).OpenPGPMasterpass;
var EnigmailDialog = ChromeUtils.import(
  "chrome://openpgp/content/modules/dialog.jsm"
).EnigmailDialog;
var { EnigmailKey } = ChromeUtils.import(
  "chrome://openpgp/content/modules/key.jsm"
);
var { RNP } = ChromeUtils.import("chrome://openpgp/content/modules/RNP.jsm");

// UI variables.
var gIdentity;
var gSubDialog;
var kStartSection;
var kDialog;
var kCurrentSection = "start";
var kGenerating = false;
var kButtonLabel;

// OpenPGP variables.
var gKeygenRequest;
var gAllData = "";
var gGeneratedKey = null;
var kFile = null;

const DEFAULT_FILE_PERMS = 0o600;

// The revocation strings are not localization since the revocation certificate
// will be published to others who may not know the native language of the user.
const revocationFilePrefix1 =
  "This is a revocation certificate for the OpenPGP key:";
const revocationFilePrefix2 = `
A revocation certificate is kind of a "kill switch" to publicly
declare that a key shall no longer be used.  It is not possible
to retract such a revocation certificate once it has been published.

Use it to revoke this key in case of a secret key compromise, or loss of
the secret key, or loss of passphrase of the secret key.

To avoid an accidental use of this file, a colon has been inserted
before the 5 dashes below.  Remove this colon with a text editor
before importing and publishing this revocation certificate.

:`;

var syncl10n = new Localization(["messenger/openpgp/key-wizard.ftl"], true);

// Dialog event listeners.
document.addEventListener("dialogaccept", wizardContinue);
document.addEventListener("dialoghelp", goBack);
document.addEventListener("dialogcancel", onClose);

/**
 * Initialize the keyWizard dialog.
 */
async function init() {
  gIdentity = window.arguments[0].identity;
  gSubDialog = window.arguments[0].gSubDialog;

  kStartSection = document.getElementById("wizardStart");
  kDialog = document.querySelector("dialog");

  document.l10n.setAttributes(
    document.documentElement,
    "key-wizard-dialog-window",
    {
      identity: gIdentity.email,
    }
  );

  // Show the GnuPG radio selection if the pref is enabled.
  if (Services.prefs.getBoolPref("mail.openpgp.allow_external_gnupg")) {
    document.getElementById("externalOpenPgp").removeAttribute("hidden");
  }

  // After the dialog is visible, disable the event listeners causing it to
  // close when clicking on the overlay or hitting the Esc key, and remove the
  // close button from the header. This is necessary to control the escape
  // point and prevent the accidental dismiss of the dialog during important
  // processes, like the generation or importing of a key.
  setTimeout(() => {
    // Check if the attribute is not null. This can be removed after the full
    // conversion of the Key Manager into a SubDialog in Bug 1652537.
    if (gSubDialog) {
      gSubDialog._topDialog._removeDialogEventListeners();
      gSubDialog._topDialog._closeButton.remove();
    }
  }, 150);

  // Switch directly to the create screen if requested by the user.
  if (window.arguments[0].isCreate) {
    document.getElementById("openPgpKeyChoices").value = 0;
    switchSection();
  }

  // Switch directly to the import screen if requested by the user.
  if (window.arguments[0].isImport) {
    document.getElementById("openPgpKeyChoices").value = 1;
    switchSection();
  }
}

/**
 * Intercept the dialogaccept command to implement a wizard like setup workflow.
 *
 * @param {Event} event - The DOM Event.
 */
function wizardContinue(event) {
  event.preventDefault();

  // Pretty impossible scenario but just in case if no radio button is
  // currently selected, bail out.
  if (!document.getElementById("openPgpKeyChoices").value) {
    return;
  }

  // Trigger an action based on the currently visible section.
  if (kCurrentSection != "start") {
    wizardNextStep();
    return;
  }

  // Disable the `Continue` button.
  kDialog.getButton("accept").setAttribute("disabled", true);

  kStartSection.addEventListener("transitionend", switchSection);
  kStartSection.classList.add("hide");
}

/**
 * Separated method dealing with the section switching to allow the removal of
 * the event listener to prevent stacking.
 */
function switchSection() {
  kStartSection.setAttribute("hidden", true);
  kStartSection.removeEventListener("transitionend", switchSection);

  // Save the current label of the accept button in order to restore it later.
  kButtonLabel = kDialog.getButton("accept").label;

  // Update the UI based on the radiogroup selection.
  switch (document.getElementById("openPgpKeyChoices").value) {
    case "0":
      wizardCreateKey();
      break;

    case "1":
      wizardImportKey();
      break;

    case "2":
      wizardExternalKey();
      break;
  }

  // Show the `Go Back` button.
  kDialog.getButton("help").removeAttribute("hidden");
}

/**
 * Handle the next step of the wizard based on the currently visible section.
 */
async function wizardNextStep() {
  switch (kCurrentSection) {
    case "create":
      await openPgpKeygenStart();
      break;

    case "import":
      await openPgpImportStart();
      break;

    case "importComplete":
      openPgpImportComplete();
      break;

    case "external":
      break;
  }
}

/**
 * Go back to the initial view of the wizard.
 */
function goBack() {
  let section = document.querySelector(".wizard-section:not([hidden])");
  section.addEventListener("transitionend", backToStart);
  section.classList.add("hide-reverse");
}

/**
 * Hide the currently visible section at the end of the animation, remove the
 * listener to prevent stacking, and trigger the reveal of the first section.
 *
 * @param {Event} event - The DOM Event.
 */
function backToStart(event) {
  // Hide the `Go Back` button.
  kDialog.getButton("help").setAttribute("hidden", true);

  // Enable the `Continue` button.
  kDialog.getButton("accept").removeAttribute("disabled");
  kDialog.getButton("accept").label = kButtonLabel;
  kDialog.getButton("accept").classList.remove("primary");

  // Reset the import section.
  document.getElementById("openPgpImportWarning").collapsed = true;
  document.getElementById("importKeyIntro").hidden = false;
  document.getElementById("importKeyListContainer").collapsed = true;

  event.target.setAttribute("hidden", true);
  event.target.removeEventListener("transitionend", backToStart);

  // Reset section key.
  kCurrentSection = "start";

  revealSection("wizardStart");
}

/**
 * Show the Key Creation section.
 */
async function wizardCreateKey() {
  kCurrentSection = "create";
  revealSection("wizardCreateKey");

  let createLabel = await document.l10n.formatValue("openpgp-keygen-button");

  kDialog.getButton("accept").label = createLabel;
  kDialog.getButton("accept").classList.add("primary");

  if (!gIdentity.fullName) {
    document.getElementById("openPgpWarning").collapsed = false;
    document.l10n.setAttributes(
      document.getElementById("openPgpWarningDescription"),
      "openpgp-keygen-long-expiry"
    );
    return;
  }

  kDialog.getButton("accept").removeAttribute("disabled");
}

/**
 * Show the Key Import section.
 */
function wizardImportKey() {
  kCurrentSection = "import";
  revealSection("wizardImportKey");
}

/**
 * Show the Key Setup via external smartcard section.
 */
function wizardExternalKey() {
  kCurrentSection = "external";
  revealSection("wizardExternalKey");
}

/**
 * Animate the reveal of a section of the wizard.
 *
 * @param {string} id - The id of the section to reveal.
 */
function revealSection(id) {
  let section = document.getElementById(id);
  section.removeAttribute("hidden");

  // Timeout to animate after the hidden attribute has been removed.
  setTimeout(() => {
    section.classList.remove("hide", "hide-reverse");
  });

  resizeDialog();
}

/**
 * Enable or disable the elements based on the radiogroup selection.
 *
 * @param {Event} event - The DOM event triggered on change.
 */
function onExpirationChange(event) {
  document
    .getElementById("expireInput")
    .toggleAttribute("disabled", event.target.value != 0);
  document.getElementById("timeScale").disabled = event.target.value != 0;

  validateExpiration();
}

/**
 * Enable or disable the #keySize input field based on the current selection of
 * the #keyType radio group.
 *
 * @param {Event} event - The DOM Event.
 */
function onKeyTypeChange(event) {
  document.getElementById("keySize").disabled = event.target.value == "ECC";
}

/**
 * Intercept the cancel event to prevent accidental closing if the generation of
 * a key is currently in progress.
 *
 * @param {Event} event - The DOM event.
 */
function onClose(event) {
  if (kGenerating) {
    event.preventDefault();
  }

  window.arguments[0].cancelCallback();
}

/**
 * Validate the expiration time of a newly generated key when the user changes
 * values. Disable the "Generate Key" button and show an alert if the selected
 * value is less than 1 day or more than 100 years.
 */
async function validateExpiration() {
  // If the key doesn't have an expiration date, hide the warning message and
  // enable the "Generate Key" button.
  if (document.getElementById("openPgpKeygeExpiry").value == 1) {
    document.getElementById("openPgpWarning").collapsed = true;
    kDialog.getButton("accept").removeAttribute("disabled");
    return;
  }

  // Calculate the selected expiration date.
  let expiryTime =
    Number(document.getElementById("expireInput").value) *
    Number(document.getElementById("timeScale").value);

  // If the expiration date exceeds 100 years.
  if (expiryTime > 36500) {
    document.getElementById("openPgpWarning").collapsed = false;
    document.l10n.setAttributes(
      document.getElementById("openPgpWarningDescription"),
      "openpgp-keygen-long-expiry"
    );
    kDialog.getButton("accept").setAttribute("disabled", true);
    resizeDialog();
    return;
  }

  // If the expiration date is shorter than 1 day.
  if (expiryTime <= 0) {
    document.getElementById("openPgpWarning").collapsed = false;
    document.l10n.setAttributes(
      document.getElementById("openPgpWarningDescription"),
      "openpgp-keygen-short-expiry"
    );
    kDialog.getButton("accept").setAttribute("disabled", true);
    resizeDialog();
    return;
  }

  // If the previous conditions are false, hide the warning message and
  // enable the "Generate Key" button since the expiration date is valid.
  document.getElementById("openPgpWarning").collapsed = true;
  kDialog.getButton("accept").removeAttribute("disabled");
}

/**
 * Resize the dialog to account for the newly visible sections. The timeout is
 * neccessary in order to wait until the end of revealing animations.
 */
function resizeDialog() {
  // Timeout to trigger the dialog resize after the reveal animation completed.
  setTimeout(() => {
    // Check if the attribute is not null. This can be removed after the full
    // conversion of the Key Manager into a SubDialog in Bug 1652537.
    if (gSubDialog) {
      gSubDialog._topDialog.resizeVertically();
    } else {
      sizeToContent();
    }
  }, 230);
}

/**
 * Start the generation of a new OpenPGP Key.
 */
async function openPgpKeygenStart() {
  let openPgpWarning = document.getElementById("openPgpWarning");
  let openPgpWarningText = document.getElementById("openPgpWarningDescription");
  openPgpWarning.collapsed = true;

  // If a key generation request is already pending, warn the user and
  // don't proceed.
  if (gKeygenRequest) {
    let req = gKeygenRequest.QueryInterface(Ci.nsIRequest);

    if (req.isPending()) {
      openPgpWarning.collapsed = false;
      document.l10n.setAttributes(openPgpWarningText, "openpgp-keygen-ongoing");
      return;
    }
  }

  // Reset global variables to be sure.
  gGeneratedKey = null;
  gAllData = "";

  let enigmailSvc = GetEnigmailSvc();
  if (!enigmailSvc) {
    openPgpWarning.collapsed = false;
    document.l10n.setAttributes(
      openPgpWarningText,
      "openpgp-keygen-error-core"
    );
    closeOverlay();

    throw new Error("GetEnigmailSvc failed");
  }

  // Show wizard overlay before the start of the generation process. This is
  // necessary because the generation happens synchronously and blocks the UI.
  // We need to show the overlay before it, otherwise it would flash and freeze.
  // This should be moved after the Services.prompt.confirmEx() method
  // once Bug 1617444 is implemented.
  let overlay = document.getElementById("wizardOverlay");
  overlay.removeAttribute("hidden");
  overlay.classList.remove("hide");

  // Ask for confirmation before triggering the generation of a new key.
  document.l10n.setAttributes(
    document.getElementById("wizardOverlayQuestion"),
    "openpgp-key-confirm",
    {
      identity: `${gIdentity.fullName} <b>"${gIdentity.email}"</b>`,
    }
  );

  document.l10n.setAttributes(
    document.getElementById("wizardOverlayTitle"),
    "openpgp-keygen-progress-title"
  );
}

async function openPgpKeygenConfirm() {
  document.getElementById("openPgpKeygenConfirm").collapsed = true;
  document.getElementById("openPgpKeygenProcess").removeAttribute("collapsed");

  let openPgpWarning = document.getElementById("openPgpWarning");
  let openPgpWarningText = document.getElementById("openPgpWarningDescription");
  openPgpWarning.collapsed = true;

  kGenerating = true;

  let cApi;
  try {
    let newId = null;
    cApi = EnigmailCryptoAPI();
    newId = cApi.sync(
      cApi.genKey(
        `${gIdentity.fullName} <${gIdentity.email}>`,
        document.getElementById("keyType").value,
        Number(document.getElementById("keySize").value),
        document.getElementById("openPgpKeygeExpiry").value == 1
          ? 0
          : Number(document.getElementById("expireInput").value) *
              Number(document.getElementById("timeScale").value),
        OpenPGPMasterpass.retrieveOpenPGPPassword()
      )
    );
    console.log("created new key with id: " + newId);
    gGeneratedKey = newId;
  } catch (ex) {
    console.log(ex);
  }

  EnigmailWindows.keyManReloadKeys();

  gKeygenRequest = null;
  kGenerating = true;

  // For wathever reason, the key wasn't generated. Show an error message and
  // hide the processing overlay.
  if (!gGeneratedKey) {
    openPgpWarning.collapsed = false;
    document.l10n.setAttributes(
      openPgpWarningText,
      "openpgp-keygen-error-failed"
    );
    closeOverlay();

    throw new Error("key generation failed");
  }

  console.debug("saving new key id " + gGeneratedKey);
  EnigSavePrefs();

  // Hide wizard overlay at the end of the generation process.
  closeOverlay();
  EnigmailKeyRing.clearCache();

  let rev = cApi.sync(cApi.getNewRevocation(`0x${gGeneratedKey}`));
  if (!rev) {
    openPgpWarning.collapsed = false;
    document.l10n.setAttributes(
      openPgpWarningText,
      "openpgp-keygen-error-revocation",
      {
        key: gGeneratedKey,
      }
    );
    closeOverlay();

    throw new Error("failed to obtain revocation for key " + gGeneratedKey);
  }

  let revFull =
    revocationFilePrefix1 +
    "\n\n" +
    gGeneratedKey +
    "\n" +
    revocationFilePrefix2 +
    rev;

  let revFile = EnigmailApp.getProfileDirectory();
  revFile.append(`0x${gGeneratedKey}_rev.asc`);

  // Create a revokation cert in the Thunderbird profile directoy.
  EnigmailFiles.writeFileContents(revFile, revFull, DEFAULT_FILE_PERMS);

  // Key succesfully created. Assign the new key to the current identity, close
  // the dialog and show a confirmation message.
  gIdentity.setUnicharAttribute("openpgp_key_id", gGeneratedKey);
  window.arguments[0].okCallback();
  window.close();
}

/**
 * Cancel the keygen process, ask for confirmation before proceeding.
 */
async function openPgpKeygenCancel() {
  let [abortTitle, abortText] = await document.l10n.formatValues([
    { id: "openpgp-keygen-abort-title" },
    { id: "openpgp-keygen-abort" },
  ]);

  if (
    kGenerating &&
    Services.prompt.confirmEx(
      window,
      abortTitle,
      abortText,
      Services.prompt.STD_YES_NO_BUTTONS,
      "",
      "",
      "",
      "",
      {}
    ) != 0
  ) {
    return;
  }

  closeOverlay();
  gKeygenRequest.kill(false);
  kGenerating = false;
}

/**
 * Close the processing wizard overlay.
 */
function closeOverlay() {
  document.getElementById("openPgpKeygenConfirm").removeAttribute("collapsed");
  document.getElementById("openPgpKeygenProcess").collapsed = true;

  let overlay = document.getElementById("wizardOverlay");

  overlay.addEventListener("transitionend", hideOverlay);
  overlay.classList.add("hide");
}

/**
 * Add the "hidden" attribute tot he processing wizard overlay after the CSS
 * transition ended.
 *
 * @param {Event} event - The DOM Event.
 */
function hideOverlay(event) {
  event.target.setAttribute("hidden", true);
  event.target.removeEventListener("transitionend", hideOverlay);
}

async function importSecretKey() {
  let [importTitle, importType] = await document.l10n.formatValues([
    { id: "import-key-file" },
    { id: "gnupg-file" },
  ]);

  kFile = EnigmailDialog.filePicker(
    window,
    importTitle,
    "",
    false,
    "*.asc",
    "",
    [importType, "*.asc;*.gpg;*.pgp"]
  );

  if (!kFile) {
    return;
  }

  // Interrupt if the file size is larger than 5MB.
  if (kFile.fileSize > 5000000) {
    document.l10n.setAttributes(
      document.getElementById("openPgpImportWarningDescription"),
      "import-error-file-size"
    );

    document.getElementById("openPgpImportWarning").collapsed = false;

    resizeDialog();
    return;
  }

  let errorMsgObj = {};
  // Fetch the list of all the available keys inside the selected files.
  let importKeys = EnigmailKey.getKeyListFromKeyFile(
    kFile,
    errorMsgObj,
    false,
    true
  );

  if (!importKeys || !importKeys.length || errorMsgObj.value) {
    document.l10n.setAttributes(
      document.getElementById("openPgpImportWarningDescription"),
      "import-error-failed",
      { error: errorMsgObj.value }
    );

    document.getElementById("openPgpImportWarning").collapsed = false;

    resizeDialog();
    return;
  }

  // Hide the warning notification and the intro section.
  document.getElementById("openPgpImportWarning").collapsed = true;
  document.getElementById("importKeyIntro").hidden = true;

  document.l10n.setAttributes(
    document.getElementById("keyListCount"),
    "openpgp-import-key-list-amount",
    { count: importKeys.length }
  );

  document.getElementById(
    "importKeyListContainer"
  ).collapsed = !importKeys.length;

  let keyList = document.getElementById("importKeyList");
  // Clear any possible existing key previously appended to the DOM.
  for (let node of keyList.children) {
    keyList.removeChild(node);
  }

  // List all the keys fetched from the file.
  for (let key of importKeys) {
    let container = document.createXULElement("hbox");
    container.classList.add("key-import-row", "selected");

    let titleContainer = document.createXULElement("vbox");

    let id = document.createXULElement("label");
    id.classList.add("openpgp-key-id");
    id.value = `0x${key.id}`;

    let name = document.createXULElement("label");
    name.classList.add("openpgp-key-name");
    name.value = key.name;

    titleContainer.appendChild(id);
    titleContainer.appendChild(name);

    // Allow users to treat imported keys as "Personal".
    let checkbox = document.createXULElement("checkbox");
    checkbox.setAttribute("id", `${key.id}-set-personal`);
    document.l10n.setAttributes(checkbox, "import-key-personal-checkbox");
    checkbox.checked = true;

    container.appendChild(titleContainer);
    container.appendChild(checkbox);

    keyList.appendChild(container);
  }

  resizeDialog();

  kDialog.getButton("accept").removeAttribute("disabled");
  kDialog.getButton("accept").classList.add("primary");
}

async function openPgpImportStart() {
  if (!kFile) {
    return;
  }

  kGenerating = true;

  // Show the overlay.
  let overlay = document.getElementById("wizardImportOverlay");
  overlay.removeAttribute("hidden");
  overlay.classList.remove("hide");

  let resultKeys = {};
  let errorMsgObj = {};
  let exitCode = EnigmailKeyRing.importKeyFromFile(
    window,
    passphrasePromptCallback,
    kFile,
    errorMsgObj,
    resultKeys,
    false,
    true
  );

  // Interrupt if something went wrong.
  if (exitCode !== 0) {
    overlay.addEventListener("transitionend", hideOverlay);
    overlay.classList.add("hide");

    document.l10n.setAttributes(
      document.getElementById("openPgpImportWarningDescription"),
      "openpgp-import-keys-failed",
      { error: errorMsgObj.value }
    );

    document.getElementById("openPgpImportWarning").collapsed = false;

    resizeDialog();
    return;
  }

  let keyList = document.getElementById("importKeyListRecap");
  // Clear the improted keys from the DOM.
  for (let node of keyList.children) {
    keyList.removeChild(node);
  }

  // Set any of the previously checked keys as personal.
  for (let keyId of resultKeys.keys) {
    if (keyId.search(/^0x/) === 0) {
      keyId = keyId.substr(2).toUpperCase();
    }

    let key = EnigmailKeyRing.getKeyById(keyId);

    if (key && key.fpr) {
      // If the checkbox was checked, update the acceptance of the key.
      if (document.getElementById(`${key.keyId}-set-personal`).checked) {
        PgpSqliteDb2.acceptAsPersonalKey(key.fpr);
      }

      let container = document.createXULElement("hbox");
      container.classList.add("key-import-row");

      // Start key info section.
      let grid = document.createXULElement("hbox");
      grid.classList.add("extra-information-label");

      // Key identity.
      let identityLabel = document.createXULElement("label");
      identityLabel.classList.add("extra-information-label-type");
      document.l10n.setAttributes(
        identityLabel,
        "openpgp-import-identity-label"
      );

      let identityValue = document.createXULElement("label");
      identityValue.value = key.userId;

      grid.appendChild(identityLabel);
      grid.appendChild(identityValue);

      // Key fingerprint.
      let fingerprintLabel = document.createXULElement("label");
      document.l10n.setAttributes(
        fingerprintLabel,
        "openpgp-import-fingerprint-label"
      );
      fingerprintLabel.classList.add("extra-information-label-type");

      let fingerprintInput = document.createXULElement("label");
      fingerprintInput.value = EnigmailKey.formatFpr(key.fpr);

      grid.appendChild(fingerprintLabel);
      grid.appendChild(fingerprintInput);

      // Key creation date.
      let createdLabel = document.createXULElement("label");
      document.l10n.setAttributes(createdLabel, "openpgp-import-created-label");
      createdLabel.classList.add("extra-information-label-type");

      let createdValue = document.createXULElement("label");
      createdValue.value = key.created;

      grid.appendChild(createdLabel);
      grid.appendChild(createdValue);

      // Key bits.
      let bitsLabel = document.createXULElement("label");
      bitsLabel.classList.add("extra-information-label-type");
      document.l10n.setAttributes(bitsLabel, "openpgp-import-bits-label");

      let bitsValue = document.createXULElement("label");
      bitsValue.value = key.keySize;

      grid.appendChild(bitsLabel);
      grid.appendChild(bitsValue);
      // End key info section.

      let info = document.createXULElement("button");
      info.classList.add("openpgp-image-btn", "openpgp-props-btn");
      document.l10n.setAttributes(info, "openpgp-import-key-props");
      info.addEventListener("command", () => {
        window.arguments[0].keyDetailsDialog(key.keyId);
      });

      container.appendChild(grid);
      container.appendChild(info);

      keyList.appendChild(container);
    }
  }

  // Hide the previous key list container and title.
  document.getElementById("importKeyListContainer").collapsed = true;
  document.getElementById("importKeyTitle").hidden = true;

  // Update the dialog buttons for the final stage.
  kDialog.getButton("help").setAttribute("hidden", true);
  kDialog.getButton("cancel").setAttribute("hidden", true);

  // Update the `Continue` button.
  document.l10n.setAttributes(
    kDialog.getButton("accept"),
    "openpgp-keygen-import-complete"
  );
  kCurrentSection = "importComplete";

  // Show the recently built key list.
  document.getElementById("importKeyListSuccess").collapsed = false;

  // Hide the loading overlay.
  overlay.addEventListener("transitionend", hideOverlay);
  overlay.classList.add("hide");

  resizeDialog();

  kGenerating = false;
}

function openPgpImportComplete() {
  window.arguments[0].okImportCallback();
  window.close();
}

/**
 * Opens a prompt asking the user to enter the passphrase for a given key id.
 *
 * @param {Object} win - The current window.
 * @param {string} keyId - The ID of the imported key.
 * @param {Object} resultFlags - Keep track of the cancelled action.
 *
 * @returns {string} - The entered passphrase or empty.
 */
function passphrasePromptCallback(win, keyId, resultFlags) {
  let passphrase = { value: "" };

  // We need to fetch these strings synchronously in order to properly work with
  // the RNP key import method, which is not async.
  let title = syncl10n.formatValueSync("openpgp-passphrase-prompt-title");
  let message = syncl10n.formatValueSync("openpgp-passphrase-prompt", {
    key: keyId,
  });

  let prompt = Services.prompt.promptPassword(
    win,
    title,
    message,
    passphrase,
    null,
    {}
  );

  if (!prompt) {
    let overlay = document.getElementById("wizardImportOverlay");
    overlay.addEventListener("transitionend", hideOverlay);
    overlay.classList.add("hide");
    kGenerating = false;
  }

  resultFlags.canceled = !prompt;
  return !prompt ? "" : passphrase.value;
}
