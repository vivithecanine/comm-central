/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { cleanUpHostName, isLegalHostNameOrIP } = ChromeUtils.import(
  "resource:///modules/hostnameUtils.jsm"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { OAuth2Providers } = ChromeUtils.import(
  "resource:///modules/OAuth2Providers.jsm"
);

var gSmtpServer;
var gSmtpUsername;
var gSmtpDescription;
var gSmtpUsernameLabel;
var gSmtpHostname;
var gSmtpPort;
var gSmtpAuthMethod;
var gSmtpSocketType;
var gPort;
var gDefaultPort;

window.addEventListener("DOMContentLoaded", onLoad);
document.addEventListener("dialogaccept", onAccept);

function onLoad() {
  gSmtpServer = window.arguments[0].server;
  initSmtpSettings(gSmtpServer);
}

function onAccept(event) {
  if (!isLegalHostNameOrIP(cleanUpHostName(gSmtpHostname.value))) {
    let prefsBundle = document.getElementById("bundle_prefs");
    let brandBundle = document.getElementById("bundle_brand");
    let alertTitle = brandBundle.getString("brandShortName");
    let alertMsg = prefsBundle.getString("enterValidServerName");
    Services.prompt.alert(window, alertTitle, alertMsg);

    window.arguments[0].result = false;
    event.preventDefault();
    return;
  }

  // If we didn't have an SMTP server to initialize with,
  // we must be creating one.
  try {
    if (!gSmtpServer) {
      gSmtpServer = MailServices.smtp.createServer();
      window.arguments[0].addSmtpServer = gSmtpServer.key;
    }

    saveSmtpSettings(gSmtpServer);
  } catch (ex) {
    Cu.reportError("Error saving smtp server: " + ex);
  }

  window.arguments[0].result = true;
}

function initSmtpSettings(server) {
  gSmtpUsername = document.getElementById("smtpUsername");
  gSmtpDescription = document.getElementById("smtp.description");
  gSmtpUsernameLabel = document.getElementById("smtpUsernameLabel");
  gSmtpHostname = document.getElementById("smtp.hostname");
  gSmtpPort = document.getElementById("smtp.port");
  gSmtpAuthMethod = document.getElementById("smtp.authMethod");
  gSmtpSocketType = document.getElementById("smtp.socketType");
  gDefaultPort = document.getElementById("smtp.defaultPort");
  gPort = document.getElementById("smtp.port");

  if (server) {
    gSmtpHostname.value = server.hostname;
    gSmtpDescription.value = server.description;
    gSmtpPort.value = server.port;
    gSmtpUsername.value = server.username;
    gSmtpAuthMethod.value = server.authMethod;
    gSmtpSocketType.value = server.socketType < 4 ? server.socketType : 1;
  } else {
    // New server, load default values.
    gSmtpAuthMethod.value = Services.prefs.getIntPref(
      "mail.smtpserver.default.authMethod"
    );
    gSmtpSocketType.value = Services.prefs.getIntPref(
      "mail.smtpserver.default.try_ssl"
    );
  }

  // Although sslChanged will set a label for cleartext password,
  // we need to use the long label so that we can size the dialog.
  setLabelFromStringBundle("authMethod-no", "authNo");
  setLabelFromStringBundle(
    "authMethod-password-encrypted",
    "authPasswordEncrypted"
  );
  setLabelFromStringBundle(
    "authMethod-password-cleartext",
    "authPasswordCleartextInsecurely"
  );
  setLabelFromStringBundle("authMethod-kerberos", "authKerberos");
  setLabelFromStringBundle("authMethod-ntlm", "authNTLM");
  setLabelFromStringBundle("authMethod-oauth2", "authOAuth2");
  setLabelFromStringBundle("authMethod-anysecure", "authAnySecure");
  setLabelFromStringBundle("authMethod-any", "authAny");

  window.sizeToContent();

  sslChanged(false);
  authMethodChanged(false);

  if (MailServices.smtp.defaultServer) {
    onLockPreference();
  }

  // Hide OAuth2 option if we can't use it.
  let details = OAuth2Providers.getHostnameDetails(server.hostname);
  document.getElementById("authMethod-oauth2").hidden = !details;

  // Hide deprecated/hidden auth options, unless selected
  hideUnlessSelected(document.getElementById("authMethod-anysecure"));
  hideUnlessSelected(document.getElementById("authMethod-any"));

  // "STARTTLS, if available" is vulnerable to MITM attacks so we shouldn't
  // allow users to choose it anymore. Hide the option unless the user already
  // has it set.
  hideUnlessSelected(document.getElementById("connectionSecurityType-1"));
}

function hideUnlessSelected(element) {
  element.hidden = !element.selected;
}

function setLabelFromStringBundle(elementID, stringName) {
  document.getElementById(elementID).label = document
    .getElementById("bundle_messenger")
    .getString(stringName);
}

// Disables xul elements that have associated preferences locked.
function onLockPreference() {
  try {
    let allPrefElements = {
      hostname: gSmtpHostname,
      description: gSmtpDescription,
      port: gSmtpPort,
      authMethod: gSmtpAuthMethod,
      try_ssl: gSmtpSocketType,
    };
    disableIfLocked(allPrefElements);
  } catch (e) {
    // non-fatal
    Cu.reportError("Error while getting locked prefs: " + e);
  }
}

/**
 * Does the work of disabling an element given the array which contains xul id/prefstring pairs.
 *
 * @param prefstrArray  array of XUL elements to check
 *
 * TODO: try to merge this with disableIfLocked function in am-offline.js (bug 755885)
 */
function disableIfLocked(prefstrArray) {
  let finalPrefString =
    "mail.smtpserver." + MailServices.smtp.defaultServer.key + ".";
  let smtpPrefBranch = Services.prefs.getBranch(finalPrefString);

  for (let prefstring in prefstrArray) {
    if (smtpPrefBranch.prefIsLocked(prefstring)) {
      prefstrArray[prefstring].disabled = true;
    }
  }
}

function saveSmtpSettings(server) {
  // dump("Saving to " + server + "\n");
  if (server) {
    server.hostname = cleanUpHostName(gSmtpHostname.value);
    server.description = gSmtpDescription.value;
    server.port = gSmtpPort.value;
    server.authMethod = gSmtpAuthMethod.value;
    server.username = gSmtpUsername.value;
    server.socketType = gSmtpSocketType.value;
  }
}

function authMethodChanged(userAction) {
  var noUsername = gSmtpAuthMethod.value == Ci.nsMsgAuthMethod.none;
  gSmtpUsername.disabled = noUsername;
  gSmtpUsernameLabel.disabled = noUsername;
}

/**
 * Resets the default port to SMTP or SMTPS, dependending on
 * the |gSmtpSocketType| value, and sets the port to use to this default,
 * if that's appropriate.
 *
 * @param userAction  false for dialog initialization,
 *                    true for user action.
 */
function sslChanged(userAction) {
  const DEFAULT_SMTP_PORT = "587";
  const DEFAULT_SMTPS_PORT = "465";
  var socketType = gSmtpSocketType.value;
  var otherDefaultPort;
  var prevDefaultPort = gDefaultPort.value;

  if (socketType == Ci.nsMsgSocketType.SSL) {
    gDefaultPort.value = DEFAULT_SMTPS_PORT;
    otherDefaultPort = DEFAULT_SMTP_PORT;
  } else {
    gDefaultPort.value = DEFAULT_SMTP_PORT;
    otherDefaultPort = DEFAULT_SMTPS_PORT;
  }

  // If the port is not set,
  // or the user is causing the default port to change,
  //   and the port is set to the default for the other protocol,
  // then set the port to the default for the new protocol.
  if (
    gPort.value == 0 ||
    (userAction &&
      gDefaultPort.value != prevDefaultPort &&
      gPort.value == otherDefaultPort)
  ) {
    gPort.value = gDefaultPort.value;
  }

  // switch "insecure password" label
  setLabelFromStringBundle(
    "authMethod-password-cleartext",
    socketType == Ci.nsMsgSocketType.SSL ||
      socketType == Ci.nsMsgSocketType.alwaysSTARTTLS
      ? "authPasswordCleartextViaSSL"
      : "authPasswordCleartextInsecurely"
  );
}
