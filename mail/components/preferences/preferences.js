/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://gre/modules/AppConstants.jsm");
ChromeUtils.import("resource:///modules/mailServices.js");

window.addEventListener("load", function () {
  let prefWindow = document.getElementById("MailPreferences");
  if (!Services.prefs.getBoolPref("mail.chat.enabled")) {
    let radio =
      document.getAnonymousElementByAttribute(prefWindow, "pane", "paneChat");
    if (radio.selected)
      prefWindow.showPane(document.getElementById("paneGeneral"));
    radio.hidden = true;
  }
});

/**
 * Selects the specified preferences pane
 *
 * @param prefWindow    the prefwindow element to operate on
 * @param aPaneID       ID of prefpane to select
 * @param aTabID        ID of tab to select on the prefpane
 * @param aSubdialogID  ID of button to activate, opening a subdialog
 */
function selectPaneAndTab(prefWindow, aPaneID, aTabID, aSubdialogID) {
  if (aPaneID) {
    let prefPane = document.getElementById(aPaneID);
    let tabOnEvent = false;
    // The prefwindow element selects the pane specified in window.arguments[0]
    // automatically. But let's check it and if the prefs window was already
    // open, the current prefpane may not be the wanted one.
    if (prefWindow.currentPane.id != prefPane.id) {
      if (aTabID && !prefPane.loaded) {
        prefPane.addEventListener("paneload", function showTabOnLoad() {
          showTab(prefPane, aTabID);
        }, {once: true});
        tabOnEvent = true;
      }
      prefWindow.showPane(prefPane);
    }
    if (aTabID && !tabOnEvent)
      showTab(prefPane, aTabID, aSubdialogID);
  }
}

/**
 * Select the specified tab
 *
 * @param aPane         prefpane to operate on
 * @param aTabID        ID of tab to select on the prefpane
 * @param aSubdialogID  ID of button to activate, opening a subdialog
 */
function showTab(aPane, aTabID, aSubdialogID) {
  aPane.querySelector("tabbox").selectedTab = document.getElementById(aTabID);
  if (aSubdialogID)
    setTimeout(function() { document.getElementById(aSubdialogID).click(); }, 0);
}
