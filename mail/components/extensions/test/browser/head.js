/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailConsts } = ChromeUtils.import("resource:///modules/MailConsts.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");
var { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);

var { ExtensionCommon } = ChromeUtils.import(
  "resource://gre/modules/ExtensionCommon.jsm"
);
var { makeWidgetId } = ExtensionCommon;

// There are shutdown issues for which multiple rejections are left uncaught.
// This bug should be fixed, but for the moment this directory is whitelisted.
//
// NOTE: Entire directory whitelisting should be kept to a minimum. Normally you
//       should use "expectUncaughtRejection" to flag individual failures.
const { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/PromiseTestUtils.jsm"
);
PromiseTestUtils.allowMatchingRejectionsGlobally(
  /Message manager disconnected/
);
PromiseTestUtils.allowMatchingRejectionsGlobally(/No matching message handler/);
PromiseTestUtils.allowMatchingRejectionsGlobally(
  /Receiving end does not exist/
);

add_setup(() => check3PaneState(true, true));
registerCleanupFunction(() => {
  let tabmail = document.getElementById("tabmail");
  is(tabmail.tabInfo.length, 1);

  while (tabmail.tabInfo.length > 1) {
    tabmail.closeTab(tabmail.tabInfo[1]);
  }

  // Some tests that open new windows don't return focus to the main window
  // in a way that satisfies mochitest, and the test times out.
  Services.focus.focusedWindow = window;
  // Focus an element in the main window, then blur it again to avoid it
  // hijacking keypresses.
  let searchInput = document.getElementById("searchInput");
  searchInput.focus();
  searchInput.blur();

  MailServices.accounts.accounts.forEach(cleanUpAccount);
  check3PaneState(true, true);
});

async function check3PaneState(folderPaneOpen = null, messagePaneOpen = null) {
  let tab = document.getElementById("tabmail").currentTabInfo;
  if (tab.chromeBrowser.contentDocument.readyState != "complete") {
    await BrowserTestUtils.waitForEvent(
      tab.chromeBrowser.contentWindow,
      "load"
    );
  }

  if (folderPaneOpen !== null) {
    Assert.equal(
      tab.folderPaneVisible,
      folderPaneOpen,
      "State of folder pane splitter is correct"
    );
    tab.folderPaneVisible = folderPaneOpen;
  }

  if (messagePaneOpen !== null) {
    Assert.equal(
      tab.messagePaneVisible,
      messagePaneOpen,
      "State of message pane splitter is correct"
    );
    tab.messagePaneVisible = messagePaneOpen;
  }
}

function createAccount(type = "none") {
  let account;

  if (type == "local") {
    MailServices.accounts.createLocalMailAccount();
    account = MailServices.accounts.FindAccountForServer(
      MailServices.accounts.localFoldersServer
    );
  } else {
    account = MailServices.accounts.createAccount();
    account.incomingServer = MailServices.accounts.createIncomingServer(
      `${account.key}user`,
      "localhost",
      type
    );
  }

  info(`Created account ${account.toString()}`);
  return account;
}

function cleanUpAccount(account) {
  info(`Cleaning up account ${account.toString()}`);
  MailServices.accounts.removeAccount(account, true);
}

function addIdentity(account, email = "mochitest@localhost") {
  let identity = MailServices.accounts.createIdentity();
  identity.email = email;
  account.addIdentity(identity);
  if (!account.defaultIdentity) {
    account.defaultIdentity = identity;
  }
  info(`Created identity ${identity.toString()}`);
  return identity;
}

async function createSubfolder(parent, name) {
  parent.createSubfolder(name, null);
  return parent.getChildNamed(name);
}

function createMessages(folder, makeMessagesArg) {
  if (typeof makeMessagesArg == "number") {
    makeMessagesArg = { count: makeMessagesArg };
  }
  if (!createMessages.messageGenerator) {
    createMessages.messageGenerator = new MessageGenerator();
  }

  let messages = createMessages.messageGenerator.makeMessages(makeMessagesArg);
  let messageStrings = messages.map(message => message.toMboxString());
  folder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  folder.addMessageBatch(messageStrings);
}

async function createMessageFromFile(folder, path) {
  let message = await IOUtils.readUTF8(path);

  // A cheap hack to make this acceptable to addMessageBatch. It works for
  // existing uses but may not work for future uses.
  let fromAddress = message.match(/From: .* <(.*@.*)>/)[0];
  message = `From ${fromAddress}\r\n${message}`;

  folder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  folder.addMessageBatch([message]);
  folder.callFilterPlugins(null);
}

async function promiseAnimationFrame(win = window) {
  await new Promise(win.requestAnimationFrame);
  // dispatchToMainThread throws if used as the first argument of Promise.
  return new Promise(resolve => Services.tm.dispatchToMainThread(resolve));
}

async function focusWindow(win) {
  if (Services.focus.activeWindow == win) {
    return;
  }

  let promise = new Promise(resolve => {
    win.addEventListener(
      "focus",
      function() {
        resolve();
      },
      { capture: true, once: true }
    );
  });

  win.focus();
  await promise;
}

function promisePopupShown(popup) {
  return new Promise(resolve => {
    if (popup.state == "open") {
      resolve();
    } else {
      let onPopupShown = event => {
        popup.removeEventListener("popupshown", onPopupShown);
        resolve();
      };
      popup.addEventListener("popupshown", onPopupShown);
    }
  });
}

function getPanelForNode(node) {
  while (node.localName != "panel") {
    node = node.parentNode;
  }
  return node;
}

function awaitBrowserLoaded(browser) {
  if (
    browser.ownerGlobal.document.readyState === "complete" &&
    browser.currentURI.spec !== "about:blank"
  ) {
    return Promise.resolve();
  }
  return BrowserTestUtils.browserLoaded(browser);
}

var awaitExtensionPanel = async function(
  extension,
  win = window,
  awaitLoad = true
) {
  let { originalTarget: browser } = await BrowserTestUtils.waitForEvent(
    win.document,
    "WebExtPopupLoaded",
    true,
    event => event.detail.extension.id === extension.id
  );

  await Promise.all([
    promisePopupShown(getPanelForNode(browser)),
    awaitLoad && awaitBrowserLoaded(browser),
  ]);

  return browser;
};

function getBrowserActionPopup(extension, win = window) {
  return win.document.getElementById("webextension-remote-preload-panel");
}

function closeBrowserAction(extension, win = window) {
  let popup = getBrowserActionPopup(extension, win);
  let hidden = BrowserTestUtils.waitForEvent(popup, "popuphidden");
  popup.hidePopup();

  return hidden;
}

async function openNewMailWindow(options = {}) {
  if (!options.newAccountWizard) {
    Services.prefs.setBoolPref(
      "mail.provider.suppress_dialog_on_startup",
      true
    );
  }

  let win = window.openDialog(
    "chrome://messenger/content/messenger.xhtml",
    "_blank",
    "chrome,all,dialog=no"
  );
  await Promise.all([
    BrowserTestUtils.waitForEvent(win, "focus", true),
    BrowserTestUtils.waitForEvent(win, "activate", true),
  ]);

  return win;
}

async function openComposeWindow(account) {
  let params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  let composeFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);

  params.identity = account.defaultIdentity;
  params.composeFields = composeFields;

  let composeWindowPromise = BrowserTestUtils.domWindowOpened(
    undefined,
    async win => {
      await BrowserTestUtils.waitForEvent(win, "load");
      if (
        win.document.documentURI !=
        "chrome://messenger/content/messengercompose/messengercompose.xhtml"
      ) {
        return false;
      }
      await BrowserTestUtils.waitForEvent(win, "compose-editor-ready");
      return true;
    }
  );
  MailServices.compose.OpenComposeWindowWithParams(null, params);
  return composeWindowPromise;
}

async function openMessageInTab(msgHdr) {
  if (!msgHdr.QueryInterface(Ci.nsIMsgDBHdr)) {
    throw new Error("No message passed to openMessageInTab");
  }

  // Ensure the behaviour pref is set to open a new tab. It is the default,
  // but you never know.
  let oldPrefValue = Services.prefs.getIntPref("mail.openMessageBehavior");
  Services.prefs.setIntPref(
    "mail.openMessageBehavior",
    MailConsts.OpenMessageBehavior.NEW_TAB
  );
  MailUtils.displayMessages([msgHdr]);
  Services.prefs.setIntPref("mail.openMessageBehavior", oldPrefValue);

  let win = Services.wm.getMostRecentWindow("mail:3pane");
  let tab = win.document.getElementById("tabmail").currentTabInfo;
  await BrowserTestUtils.waitForEvent(tab.chromeBrowser, "MsgLoaded");
  return tab;
}

async function openMessageInWindow(msgHdr) {
  if (!msgHdr.QueryInterface(Ci.nsIMsgDBHdr)) {
    throw new Error("No message passed to openMessageInWindow");
  }

  let messageWindowPromise = BrowserTestUtils.domWindowOpenedAndLoaded(
    undefined,
    async win =>
      win.document.documentURI ==
      "chrome://messenger/content/messageWindow.xhtml"
  );
  MailUtils.openMessageInNewWindow(msgHdr);

  let messageWindow = await messageWindowPromise;
  await BrowserTestUtils.waitForEvent(messageWindow, "MsgLoaded");
  return messageWindow;
}

async function promiseMessageLoaded(browser, msgHdr) {
  let messageURI = msgHdr.folder.getUriForMsg(msgHdr);
  messageURI = MailServices.messageServiceFromURI(messageURI).getUrlForUri(
    messageURI,
    null
  );

  if (
    browser.webProgress?.isLoadingDocument ||
    !browser.currentURI?.equals(messageURI)
  ) {
    await BrowserTestUtils.browserLoaded(
      browser,
      null,
      uri => uri == messageURI.spec
    );
  }
}

/**
 * Check the headers of an open compose window against expected values.
 *
 * @param {Object} expected - A dictionary of expected headers.
 *    Omit headers that should have no value.
 * @param {string[]} [fields.to]
 * @param {string[]} [fields.cc]
 * @param {string[]} [fields.bcc]
 * @param {string[]} [fields.replyTo]
 * @param {string[]} [fields.followupTo]
 * @param {string[]} [fields.newsgroups]
 * @param {string} [fields.subject]
 */
async function checkComposeHeaders(expected) {
  let composeWindows = [...Services.wm.getEnumerator("msgcompose")];
  is(composeWindows.length, 1);
  let composeDocument = composeWindows[0].document;
  let composeFields = composeWindows[0].gMsgCompose.compFields;

  await new Promise(resolve => composeWindows[0].setTimeout(resolve));

  if ("identityId" in expected) {
    is(composeWindows[0].getCurrentIdentityKey(), expected.identityId);
  }

  if (expected.attachVCard) {
    is(
      expected.attachVCard,
      composeFields.attachVCard,
      "attachVCard in window should be correct"
    );
  }

  let checkField = (fieldName, elementId) => {
    let pills = composeDocument
      .getElementById(elementId)
      .getElementsByTagName("mail-address-pill");

    if (fieldName in expected) {
      is(
        pills.length,
        expected[fieldName].length,
        `${fieldName} has the right number of pills`
      );
      for (let i = 0; i < expected[fieldName].length; i++) {
        is(pills[i].label, expected[fieldName][i]);
      }
    } else {
      is(pills.length, 0, `${fieldName} is empty`);
    }
  };

  checkField("to", "addressRowTo");
  checkField("cc", "addressRowCc");
  checkField("bcc", "addressRowBcc");
  checkField("replyTo", "addressRowReply");
  checkField("followupTo", "addressRowFollowup");
  checkField("newsgroups", "addressRowNewsgroups");

  let subject = composeDocument.getElementById("msgSubject").value;
  if ("subject" in expected) {
    is(subject, expected.subject, "subject is correct");
  } else {
    is(subject, "", "subject is empty");
  }

  if (expected.overrideDefaultFcc) {
    if (expected.overrideDefaultFccFolder) {
      let server = MailServices.accounts.getAccount(
        expected.overrideDefaultFccFolder.accountId
      ).incomingServer;
      let rootURI = server.rootFolder.URI;
      is(
        rootURI + expected.overrideDefaultFccFolder.path,
        composeFields.fcc,
        "fcc should be correct"
      );
    } else {
      ok(
        composeFields.fcc.startsWith("nocopy://"),
        "fcc should start with nocopy://"
      );
    }
  } else {
    is("", composeFields.fcc, "fcc should be empty");
  }

  if (expected.additionalFccFolder) {
    let server = MailServices.accounts.getAccount(
      expected.additionalFccFolder.accountId
    ).incomingServer;
    let rootURI = server.rootFolder.URI;
    is(
      rootURI + expected.additionalFccFolder.path,
      composeFields.fcc2,
      "fcc2 should be correct"
    );
  } else {
    ok(
      composeFields.fcc2 == "" || composeFields.fcc2.startsWith("nocopy://"),
      "fcc2 should not contain a folder uri"
    );
  }

  if (expected.hasOwnProperty("priority")) {
    is(
      composeFields.priority.toLowerCase(),
      expected.priority == "normal" ? "" : expected.priority,
      "priority in composeFields should be correct"
    );
  }

  if (expected.hasOwnProperty("returnReceipt")) {
    is(
      composeFields.returnReceipt,
      expected.returnReceipt,
      "returnReceipt in composeFields should be correct"
    );
    for (let item of composeDocument.querySelectorAll(`menuitem[command="cmd_toggleReturnReceipt"],
    toolbarbutton[command="cmd_toggleReturnReceipt"]`)) {
      is(
        item.getAttribute("checked") == "true",
        expected.returnReceipt,
        "returnReceipt in window should be correct"
      );
    }
  }

  if (expected.hasOwnProperty("deliveryStatusNotification")) {
    is(
      composeFields.DSN,
      !!expected.deliveryStatusNotification,
      "deliveryStatusNotification in composeFields should be correct"
    );
    is(
      composeDocument.getElementById("dsnMenu").getAttribute("checked") ==
        "true",
      !!expected.deliveryStatusNotification,
      "deliveryStatusNotification in window should be correct"
    );
  }

  if (expected.hasOwnProperty("deliveryFormat")) {
    const deliveryFormats = {
      auto: Ci.nsIMsgCompSendFormat.Auto,
      plaintext: Ci.nsIMsgCompSendFormat.PlainText,
      html: Ci.nsIMsgCompSendFormat.HTML,
      both: Ci.nsIMsgCompSendFormat.Both,
    };
    const formatToId = new Map([
      [Ci.nsIMsgCompSendFormat.PlainText, "format_plain"],
      [Ci.nsIMsgCompSendFormat.HTML, "format_html"],
      [Ci.nsIMsgCompSendFormat.Both, "format_both"],
      [Ci.nsIMsgCompSendFormat.Auto, "format_auto"],
    ]);
    let expectedFormat = deliveryFormats[expected.deliveryFormat || "auto"];
    is(
      expectedFormat,
      composeFields.deliveryFormat,
      "deliveryFormat in composeFields should be correct"
    );
    for (let [format, id] of formatToId.entries()) {
      let menuitem = composeDocument.getElementById(id);
      is(
        format == expectedFormat,
        menuitem.getAttribute("checked") == "true",
        "checked state of the deliveryFormat menu item <${id}> in window should be correct"
      );
    }
  }
}

async function openContextMenu(selector = "#img1", win = window) {
  let contentAreaContextMenu = win.document.getElementById("mailContext");
  let popupShownPromise = BrowserTestUtils.waitForEvent(
    contentAreaContextMenu,
    "popupshown"
  );
  let tabmail = document.getElementById("tabmail");
  await BrowserTestUtils.synthesizeMouseAtCenter(
    selector,
    { type: "mousedown", button: 2 },
    tabmail.selectedBrowser
  );
  await BrowserTestUtils.synthesizeMouseAtCenter(
    selector,
    { type: "contextmenu" },
    tabmail.selectedBrowser
  );
  await popupShownPromise;
  return contentAreaContextMenu;
}

async function openContextMenuInPopup(extension, selector, win = window) {
  let contentAreaContextMenu = win.document.getElementById("mailContext");
  let stack = getBrowserActionPopup(extension, win);
  let browser = stack.querySelector("browser");
  // Ensure that the document layout has been flushed before triggering the mouse event
  // (See Bug 1519808 for a rationale).
  await browser.ownerGlobal.promiseDocumentFlushed(() => {});
  let popupShownPromise = BrowserTestUtils.waitForEvent(
    contentAreaContextMenu,
    "popupshown"
  );
  await BrowserTestUtils.synthesizeMouseAtCenter(
    selector,
    { type: "mousedown", button: 2 },
    browser
  );
  await BrowserTestUtils.synthesizeMouseAtCenter(
    selector,
    { type: "contextmenu" },
    browser
  );
  await popupShownPromise;
  return contentAreaContextMenu;
}

async function closeExtensionContextMenu(
  itemToSelect,
  modifiers = {},
  win = window
) {
  let contentAreaContextMenu = win.document.getElementById("mailContext");
  let popupHiddenPromise = BrowserTestUtils.waitForEvent(
    contentAreaContextMenu,
    "popuphidden"
  );
  if (itemToSelect) {
    itemToSelect.closest("menupopup").activateItem(itemToSelect, modifiers);
  } else {
    contentAreaContextMenu.hidePopup();
  }
  await popupHiddenPromise;

  // Bug 1351638: parent menu fails to close intermittently, make sure it does.
  contentAreaContextMenu.hidePopup();
}

async function openSubmenu(submenuItem, win = window) {
  const submenu = submenuItem.menupopup;
  const shown = BrowserTestUtils.waitForEvent(submenu, "popupshown");
  submenuItem.openMenu(true);
  await shown;
  return submenu;
}

async function closeContextMenu(contextMenu) {
  let contentAreaContextMenu =
    contextMenu || document.getElementById("mailContext");
  let popupHiddenPromise = BrowserTestUtils.waitForEvent(
    contentAreaContextMenu,
    "popuphidden"
  );
  contentAreaContextMenu.hidePopup();
  await popupHiddenPromise;
}

async function getUtilsJS() {
  let response = await fetch(getRootDirectory(gTestPath) + "utils.js");
  return response.text();
}

async function checkContent(browser, expected) {
  await SpecialPowers.spawn(browser, [expected], expected => {
    let body = content.document.body;
    Assert.ok(body, "body");
    let computedStyle = content.getComputedStyle(body);

    if ("backgroundColor" in expected) {
      Assert.equal(
        computedStyle.backgroundColor,
        expected.backgroundColor,
        "backgroundColor"
      );
    }
    if ("color" in expected) {
      Assert.equal(computedStyle.color, expected.color, "color");
    }
    if ("foo" in expected) {
      Assert.equal(body.getAttribute("foo"), expected.foo, "foo");
    }
    if ("textContent" in expected) {
      // In message display, we only really want the message body, but the
      // document body also has headers. For the purposes of these tests,
      // we can just select an descendant node, since what really matters is
      // whether (or not) a script ran, not the exact result.
      body = body.querySelector(".moz-text-flowed") ?? body;
      Assert.equal(body.textContent, expected.textContent, "textContent");
    }
  });
}

function contentTabOpenPromise(tabmail, url) {
  return new Promise(resolve => {
    let tabMonitor = {
      onTabTitleChanged(aTab) {},
      onTabClosing(aTab) {},
      onTabPersist(aTab) {},
      onTabRestored(aTab) {},
      onTabSwitched(aNewTab, aOldTab) {},
      async onTabOpened(aTab) {
        let newBrowser = aTab.linkedBrowser;
        let urlMatches = urlToMatch => urlToMatch == url;

        let result = BrowserTestUtils.browserLoaded(
          newBrowser,
          false,
          urlMatches
        ).then(() => aTab);

        let reporterListener = {
          QueryInterface: ChromeUtils.generateQI([
            "nsIWebProgressListener",
            "nsISupportsWeakReference",
          ]),
          onStateChange() {},
          onProgressChange() {},
          onLocationChange(
            /* in nsIWebProgress*/ aWebProgress,
            /* in nsIRequest*/ aRequest,
            /* in nsIURI*/ aLocation
          ) {
            if (aLocation.spec == url) {
              aTab.browser.removeProgressListener(reporterListener);
              tabmail.unregisterTabMonitor(tabMonitor);
              TestUtils.executeSoon(() => resolve(result));
            }
          },
          onStatusChange() {},
          onSecurityChange() {},
          onContentBlockingEvent() {},
        };
        aTab.browser.addProgressListener(reporterListener);
      },
    };
    tabmail.registerTabMonitor(tabMonitor);
  });
}

/**
 * @typedef ConfigData
 * @property {string} actionType - type of action button in underscore notation
 * @property {string} window - the window to perform the test in
 * @property {string} [testType] - supported tests are "open-with-mouse-click" and
 *   "open-with-menu-command"
 * @property {string} [default_area] - area to be used for the test
 * @property {boolean} [use_default_popup] - select if the default_popup should be
 *  used for the test
 * @property {boolean} [disable_button] - select if the button should be disabled
 * @property {function} [backend_script] - custom backend script to be used for the
 *  test, will override the default backend_script of the selected test
 * @property {function} [background_script] - custom background script to be used for the
 *  test, will override the default background_script of the selected test
 * @property {[string]} [permissions] - custom permissions to be used for the test,
 *  must not be specified together with testType
 */

/**
 * Creates an extension with an action button and either runs one of the default
 * tests, or loads a custom background script and a custom backend scripts to run
 * an arbitrary test.
 *
 * @param {ConfigData} configData - test configuration
 */
async function run_popup_test(configData) {
  if (!configData.actionType) {
    throw new Error("Mandatory configData.actionType is missing");
  }
  if (!configData.window) {
    throw new Error("Mandatory configData.window is missing");
  }

  // Get camelCase API names from action type.
  configData.apiName = configData.actionType.replace(/_([a-z])/g, function(g) {
    return g[1].toUpperCase();
  });
  let backend_script = configData.backend_script;

  let extensionDetails = {
    files: {
      "popup.html": `<!DOCTYPE html>
                      <html>
                        <head>
                          <title>Popup</title>
                        </head>
                        <body>
                          <p>Hello</p>
                          <script src="popup.js"></script>
                        </body>
                      </html>`,
      "popup.js": async function() {
        // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
        await new Promise(resolve => window.setTimeout(resolve, 1000));
        await browser.runtime.sendMessage("popup opened");
        await new Promise(resolve => window.setTimeout(resolve));
        window.close();
      },
      "utils.js": await getUtilsJS(),
      "helper.js": function() {
        window.actionType = browser.runtime.getManifest().description;
        // Get camelCase API names from action type.
        window.apiName = window.actionType.replace(/_([a-z])/g, function(g) {
          return g[1].toUpperCase();
        });
        window.getPopupOpenedPromise = function() {
          return new Promise(resolve => {
            const handleMessage = async (message, sender, sendResponse) => {
              if (message && message == "popup opened") {
                sendResponse();
                window.setTimeout(resolve);
                browser.runtime.onMessage.removeListener(handleMessage);
              }
            };
            browser.runtime.onMessage.addListener(handleMessage);
          });
        };
      },
    },
    manifest: {
      applications: {
        gecko: {
          id: `${configData.actionType}@mochi.test`,
        },
      },
      description: configData.actionType,
      background: { scripts: ["utils.js", "helper.js", "background.js"] },
    },
    useAddonManager: "temporary",
  };

  switch (configData.testType) {
    case "open-with-mouse-click":
      backend_script = async function(extension, configData) {
        let win = configData.window;

        await extension.startup();
        await promiseAnimationFrame(win);
        await new Promise(resolve => win.setTimeout(resolve));
        await extension.awaitMessage("ready");

        let buttonId = `${configData.actionType}_mochi_test-${configData.apiName}-toolbarbutton`;
        let toolbarId;
        switch (configData.actionType) {
          case "compose_action":
            toolbarId = "composeToolbar2";
            if (configData.default_area == "formattoolbar") {
              toolbarId = "FormatToolbar";
            }
            break;
          case "browser_action":
            toolbarId = "mail-bar3";
            if (configData.default_area == "tabstoolbar") {
              toolbarId = "tabbar-toolbar";
            }
            break;
          case "message_display_action":
            toolbarId = "header-view-toolbar";
            break;
          default:
            throw new Error(
              `Unsupported configData.actionType: ${configData.actionType}`
            );
        }

        let toolbar = win.document.getElementById(toolbarId);
        let button = win.document.getElementById(buttonId);
        ok(button, "Button created");
        is(toolbar.id, button.parentNode.id, "Button added to toolbar");
        if (toolbar.hasAttribute("customizable")) {
          ok(
            toolbar.currentSet.split(",").includes(buttonId),
            `Button should have been added to currentSet property of toolbar ${toolbarId}`
          );
          ok(
            toolbar
              .getAttribute("currentset")
              .split(",")
              .includes(buttonId),
            `Button should have been added to currentset attribute of toolbar ${toolbarId}`
          );
        }
        ok(
          Services.xulStore
            .getValue(win.location.href, toolbarId, "currentset")
            .split(",")
            .includes(buttonId),
          `Button should have been added to currentset xulStore of toolbar ${toolbarId}`
        );

        let icon = button.querySelector(".toolbarbutton-icon");
        is(
          getComputedStyle(icon).listStyleImage,
          `url("chrome://messenger/content/extension.svg")`,
          "Default icon"
        );
        let label = button.querySelector(".toolbarbutton-text");
        is(label.value, "This is a test", "Correct label");

        let clickedPromise;
        if (!configData.disable_button) {
          clickedPromise = extension.awaitMessage("actionButtonClicked");
        }
        EventUtils.synthesizeMouseAtCenter(button, { clickCount: 1 }, win);
        if (configData.disable_button) {
          // We're testing that nothing happens. Give it time to potentially happen.
          // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
          await new Promise(resolve => win.setTimeout(resolve, 500));
        } else {
          await clickedPromise;
          await promiseAnimationFrame(win);
          await new Promise(resolve => win.setTimeout(resolve));
          is(win.document.getElementById(buttonId), button);
          label = button.querySelector(".toolbarbutton-text");
          is(label.value, "New title", "Correct label");
        }

        // Check the open state of the action button.
        await TestUtils.waitForCondition(
          () => button.getAttribute("open") != "true",
          "Button should not have open state after the popup closed."
        );

        await extension.unload();
        await promiseAnimationFrame(win);
        await new Promise(resolve => win.setTimeout(resolve));

        ok(!win.document.getElementById(buttonId), "Button destroyed");
        ok(
          !Services.xulStore
            .getValue(win.location.href, toolbarId, "currentset")
            .split(",")
            .includes(buttonId),
          `Button should have been removed from currentset xulStore of toolbar ${toolbarId}`
        );
      };
      if (configData.use_default_popup) {
        // With popup.
        extensionDetails.files["background.js"] = async function() {
          browser.test.log("popup background script ran");
          let popupPromise = window.getPopupOpenedPromise();
          browser.test.sendMessage("ready");
          await popupPromise;
          await browser[window.apiName].setTitle({ title: "New title" });
          browser.test.sendMessage("actionButtonClicked");
        };
      } else if (configData.disable_button) {
        // Without popup and disabled button.
        extensionDetails.files["background.js"] = async function() {
          browser.test.log("nopopup & button disabled background script ran");
          browser[window.apiName].onClicked.addListener(async (tab, info) => {
            browser.test.fail(
              "Should not have seen the onClicked event for a disabled button"
            );
          });
          browser[window.apiName].disable();
          browser.test.sendMessage("ready");
        };
      } else {
        // Without popup.
        extensionDetails.files["background.js"] = async function() {
          browser.test.log("nopopup background script ran");
          browser[window.apiName].onClicked.addListener(async (tab, info) => {
            browser.test.assertEq("object", typeof tab);
            browser.test.assertEq("object", typeof info);
            browser.test.assertEq(0, info.button);
            browser.test.assertTrue(Array.isArray(info.modifiers));
            browser.test.assertEq(0, info.modifiers.length);
            browser.test.log(`Tab ID is ${tab.id}`);
            await browser[window.apiName].setTitle({ title: "New title" });
            await new Promise(resolve => window.setTimeout(resolve));
            browser.test.sendMessage("actionButtonClicked");
          });
          browser.test.sendMessage("ready");
        };
      }
      break;

    case "open-with-menu-command":
      extensionDetails.manifest.permissions = ["menus"];
      backend_script = async function(extension, configData) {
        let win = configData.window;
        let buttonId = `${configData.actionType}_mochi_test-${configData.apiName}-toolbarbutton`;
        let menuId = "toolbar-context-menu";
        if (
          configData.actionType == "compose_action" &&
          configData.default_area == "formattoolbar"
        ) {
          menuId = "format-toolbar-context-menu";
        }
        if (configData.actionType == "message_display_action") {
          menuId = "header-toolbar-context-menu";
        }

        extension.onMessage("triggerClick", async () => {
          let button = win.document.getElementById(buttonId);
          let menu = win.document.getElementById(menuId);
          let onShownPromise = extension.awaitMessage("onShown");
          let shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
          EventUtils.synthesizeMouseAtCenter(
            button,
            { type: "contextmenu" },
            win
          );
          await shownPromise;
          await onShownPromise;
          await new Promise(resolve => win.setTimeout(resolve));

          let menuitem = win.document.getElementById(
            `${configData.actionType}_mochi_test-menuitem-_testmenu`
          );
          Assert.ok(menuitem);
          menuitem.parentNode.activateItem(menuitem);

          // Sometimes, the popup will open then instantly disappear. It seems to
          // still be hiding after the previous appearance. If we wait a little bit,
          // this doesn't happen.
          // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
          await new Promise(r => win.setTimeout(r, 250));
          extension.sendMessage();
        });

        await extension.startup();
        await extension.awaitFinish();

        // Check the open state of the action button.
        let button = win.document.getElementById(buttonId);
        await TestUtils.waitForCondition(
          () => button.getAttribute("open") != "true",
          "Button should not have open state after the popup closed."
        );

        await extension.unload();
      };
      if (configData.use_default_popup) {
        // With popup.
        extensionDetails.files["background.js"] = async function() {
          browser.test.log("popup background script ran");
          await new Promise(resolve => {
            browser.menus.create(
              {
                id: "testmenu",
                title: `Open ${window.actionType}`,
                contexts: [window.actionType],
                command: `_execute_${window.actionType}`,
              },
              resolve
            );
          });

          await browser.menus.onShown.addListener((...args) => {
            browser.test.sendMessage("onShown", args);
          });

          let popupPromise = window.getPopupOpenedPromise();
          await window.sendMessage("triggerClick");
          await popupPromise;

          browser.test.notifyPass();
        };
      } else if (configData.disable_button) {
        // Without popup and disabled button.
        extensionDetails.files["background.js"] = async function() {
          browser.test.log("nopopup & button disabled background script ran");
          await new Promise(resolve => {
            browser.menus.create(
              {
                id: "testmenu",
                title: `Open ${window.actionType}`,
                contexts: [window.actionType],
                command: `_execute_${window.actionType}`,
              },
              resolve
            );
          });

          await browser.menus.onShown.addListener((...args) => {
            browser.test.sendMessage("onShown", args);
          });

          browser[window.apiName].onClicked.addListener(async (tab, info) => {
            browser.test.fail(
              "Should not have seen the onClicked event for a disabled button"
            );
          });

          await browser[window.apiName].disable();
          await window.sendMessage("triggerClick");
          browser.test.notifyPass();
        };
      } else {
        // Without popup.
        extensionDetails.files["background.js"] = async function() {
          browser.test.log("nopopup background script ran");
          await new Promise(resolve => {
            browser.menus.create(
              {
                id: "testmenu",
                title: `Open ${window.actionType}`,
                contexts: [window.actionType],
                command: `_execute_${window.actionType}`,
              },
              resolve
            );
          });

          await browser.menus.onShown.addListener((...args) => {
            browser.test.sendMessage("onShown", args);
          });

          let clickPromise = new Promise(resolve => {
            let listener = async (tab, info) => {
              browser[window.apiName].onClicked.removeListener(listener);
              browser.test.assertEq("object", typeof tab);
              browser.test.assertEq("object", typeof info);
              browser.test.assertEq(0, info.button);
              browser.test.assertTrue(Array.isArray(info.modifiers));
              browser.test.assertEq(0, info.modifiers.length);
              browser.test.log(`Tab ID is ${tab.id}`);
              resolve();
            };
            browser[window.apiName].onClicked.addListener(listener);
          });
          await window.sendMessage("triggerClick");
          await clickPromise;

          browser.test.notifyPass();
        };
      }
      break;
  }

  extensionDetails.manifest[configData.actionType] = {
    default_title: "This is a test",
  };
  if (configData.use_default_popup) {
    extensionDetails.manifest[configData.actionType].default_popup =
      "popup.html";
  }
  if (configData.default_area) {
    extensionDetails.manifest[configData.actionType].default_area =
      configData.default_area;
  }
  if (configData.hasOwnProperty("background")) {
    extensionDetails.files["background.js"] = configData.background_script;
  }
  if (configData.hasOwnProperty("permissions")) {
    extensionDetails.manifest.permissions = configData.permissions;
  }
  if (configData.default_windows) {
    extensionDetails.manifest[configData.actionType].default_windows =
      configData.default_windows;
  }

  let extension = ExtensionTestUtils.loadExtension(extensionDetails);
  await backend_script(extension, configData);
}

async function run_action_button_order_test(configs, window, actionType) {
  // Get camelCase API names from action type.
  let apiName = actionType.replace(/_([a-z])/g, function(g) {
    return g[1].toUpperCase();
  });

  function get_id(name) {
    return `${name}_mochi_test-${apiName}-toolbarbutton`;
  }

  function test_buttons(configs, window, toolbars) {
    for (let toolbarId of toolbars) {
      let expected = configs
        .filter(e => e.toolbar == toolbarId)
        .map(e => get_id(e.name));
      let buttons = window.document.querySelectorAll(
        `#${toolbarId} toolbarbutton[id$="${get_id("")}"]`
      );
      Assert.equal(
        expected.length,
        buttons.length,
        `Should find the correct number of buttons in ${toolbarId} toolbar`
      );
      for (let i = 0; i < buttons.length; i++) {
        Assert.equal(
          expected[i],
          buttons[i].id,
          `Should find the correct button at location #${i}`
        );
      }
    }
  }

  // Create extension data.
  let toolbars = new Set();
  for (let config of configs) {
    toolbars.add(config.toolbar);
    config.extensionData = {
      useAddonManager: "permanent",
      manifest: {
        applications: {
          gecko: {
            id: `${config.name}@mochi.test`,
          },
        },
        [actionType]: {
          default_title: config.name,
        },
      },
    };
    if (config.area) {
      config.extensionData.manifest[actionType].default_area = config.area;
    }
    if (config.default_windows) {
      config.extensionData.manifest[actionType].default_windows =
        config.default_windows;
    }
  }

  // Test order of buttons after first install.
  for (let config of configs) {
    config.extension = ExtensionTestUtils.loadExtension(config.extensionData);
    await config.extension.startup();
  }
  test_buttons(configs, window, toolbars);

  // Disable all buttons.
  for (let config of configs) {
    let addon = await AddonManager.getAddonByID(config.extension.id);
    await addon.disable();
  }
  test_buttons([], window, toolbars);

  // Re-enable all buttons in reversed order, displayed order should not change.
  for (let config of [...configs].reverse()) {
    let addon = await AddonManager.getAddonByID(config.extension.id);
    await addon.enable();
  }
  test_buttons(configs, window, toolbars);

  // Re-install all extensions in reversed order, displayed order should not change.
  for (let config of [...configs].reverse()) {
    config.extension2 = ExtensionTestUtils.loadExtension(config.extensionData);
    await config.extension2.startup();
  }
  test_buttons(configs, window, toolbars);

  // Remove all extensions.
  for (let config of [...configs].reverse()) {
    await config.extension.unload();
    await config.extension2.unload();
  }
  test_buttons([], window, toolbars);
}
