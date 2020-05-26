/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);
var { ExtensionParent } = ChromeUtils.import(
  "resource://gre/modules/ExtensionParent.jsm"
);

/* globals reporterListener */

function loadRequestedUrl() {
  let browser = document.getElementById("requestFrame");
  browser.addProgressListener(reporterListener, Ci.nsIWebProgress.NOTIFY_ALL);
  browser.addEventListener("DOMTitleChanged", () => {
    let docTitle = browser.contentDocument.title
      ? browser.contentDocument.title.trim()
      : "";
    let docElement = document.documentElement;
    // If the document title is blank, add the default title.
    if (!docTitle) {
      docTitle = docElement.getAttribute("defaultTabTitle");
    }

    if (docElement.hasAttribute("titlepreface")) {
      docTitle = docElement.getAttribute("titlepreface") + docTitle;
    }

    // If we're on Mac, don't display the separator and the modifier.
    if (AppConstants.platform != "macosx") {
      docTitle +=
        docElement.getAttribute("titlemenuseparator") +
        docElement.getAttribute("titlemodifier");
    }

    document.title = docTitle;
  });

  // This window does double duty. If window.arguments[0] is a string, it's
  // probably being called by browser.identity.launchWebAuthFlowInParent.

  // Otherwise, it's probably being called by browser.windows.create, with an
  // array of URLs to open in tabs. We'll only attempt to open the first,
  // which is consistent with Firefox behaviour.

  if (typeof window.arguments[0] == "string") {
    browser.src = window.arguments[0];
  } else {
    ExtensionParent.apiManager.emit("extension-browser-inserted", browser);
    browser.src =
      window.arguments[1].wrappedJSObject.tabs[0].tabParams.contentPage;
  }
}

// Fake it 'til you make it.
var gBrowser = {
  get webNavigation() {
    let browser = document.getElementById("requestFrame");
    return browser.webNavigation;
  },
};
