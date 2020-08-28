/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported ltnInitMailIdentitiesRow, ltnGetMailIdentitySelection,
 *          ltnSaveMailIdentitySelection, ltnNotifyOnIdentitySelection
 */

/* global MozElements */

/* import-globals-from ../../base/content/calendar-ui-utils.js */

var { fixIterator } = ChromeUtils.import("resource:///modules/iteratorUtils.jsm");
var { MailServices } = ChromeUtils.import("resource:///modules/MailServices.jsm");
var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

/**
 * Initialize the email identity row. Shared between the calendar creation
 * dialog and the calendar properties dialog.
 *
 * @param {calICalendar} aCalendar    The calendar being created or edited.
 */
function ltnInitMailIdentitiesRow(aCalendar) {
  if (!aCalendar) {
    document.getElementById("calendar-email-identity-row").toggleAttribute("hidden", true);
  }

  let imipIdentityDisabled = aCalendar.getProperty("imip.identity.disabled");
  document
    .getElementById("calendar-email-identity-row")
    .toggleAttribute("hidden", imipIdentityDisabled);

  if (imipIdentityDisabled) {
    // If the imip identity is disabled, we don't have to set up the
    // menulist.
    return;
  }

  // If there is no transport but also no organizer id, then the
  // provider has not statically configured an organizer id. This is
  // basically what happens when "None" is selected.
  let menuPopup = document.getElementById("email-identity-menupopup");

  // Remove all children from the email list to avoid duplicates if the list
  // has already been populated during a previous step in the calendar
  // creation wizard.
  while (menuPopup.hasChildNodes()) {
    menuPopup.lastChild.remove();
  }

  addMenuItem(menuPopup, cal.l10n.getLtnString("imipNoIdentity"), "none");
  let identities;
  if (aCalendar && aCalendar.aclEntry && aCalendar.aclEntry.hasAccessControl) {
    identities = [...fixIterator(aCalendar.aclEntry.getOwnerIdentities(), Ci.nsIMsgIdentity)];
  } else {
    identities = MailServices.accounts.allIdentities;
  }
  for (let identity of identities) {
    addMenuItem(menuPopup, identity.identityName, identity.key);
  }
  try {
    let sel = aCalendar.getProperty("imip.identity");
    if (sel) {
      sel = sel.QueryInterface(Ci.nsIMsgIdentity);
    }
    menuListSelectItem("email-identity-menulist", sel ? sel.key : "none");
  } catch (exc) {
    // Don't select anything if the identity can't be found
  }
}

/**
 * Returns the selected email identity. Shared between the calendar creation
 * dialog and the calendar properties dialog.
 *
 * @param {calICalendar} aCalendar    The calendar for the identity selection.
 * @returns {string}                  The key of the selected nsIMsgIdentity or 'none'.
 */
function ltnGetMailIdentitySelection(aCalendar) {
  let sel = "none";
  if (aCalendar) {
    let imipIdentityDisabled = aCalendar.getProperty("imip.identity.disabled");
    let selItem = document.getElementById("email-identity-menulist").selectedItem;
    if (!imipIdentityDisabled && selItem) {
      sel = selItem.getAttribute("value");
    }
  }
  return sel;
}

/**
 * Persists the selected email identity. Shared between the calendar creation
 * dialog and the calendar properties dialog.
 *
 * @param {calICalendar} aCalendar    The calendar for the identity selection.
 */
function ltnSaveMailIdentitySelection(aCalendar) {
  if (aCalendar) {
    let sel = ltnGetMailIdentitySelection(aCalendar);
    // no imip.identity.key will default to the default account/identity, whereas
    // an empty key indicates no imip; that identity will not be found
    aCalendar.setProperty("imip.identity.key", sel == "none" ? "" : sel);
  }
}

/**
 * Displays a warning if the user doesn't assign an email identity to a
 * calendar. Shared between the calendar creation dialog and the calendar
 * properties dialog.
 *
 * @param {calICalendar} aCalendar    The calendar for the identity selection.
 */
function ltnNotifyOnIdentitySelection(aCalendar) {
  let notificationBox = document.getElementById("no-identity-notification");
  while (notificationBox.firstChild) {
    notificationBox.firstChild.remove();
  }
  let gNotification = {};
  XPCOMUtils.defineLazyGetter(gNotification, "notificationbox", () => {
    return new MozElements.NotificationBox(element => {
      element.setAttribute("flex", "1");
      notificationBox.append(element);
    });
  });

  let msg = cal.l10n.getLtnString("noIdentitySelectedNotification");
  let sel = ltnGetMailIdentitySelection(aCalendar);

  if (sel == "none") {
    gNotification.notificationbox.appendNotification(
      msg,
      "noIdentitySelected",
      null,
      gNotification.notificationbox.PRIORITY_WARNING_MEDIUM
    );
  } else {
    gNotification.notificationbox.removeAllNotifications();
  }
}
