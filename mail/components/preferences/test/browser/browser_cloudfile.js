/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* eslint-env webextensions */

let { AddonManager } = ChromeUtils.import(
  "resource://gre/modules/AddonManager.jsm"
);
let { cloudFileAccounts } = ChromeUtils.import(
  "resource:///modules/cloudFileAccounts.jsm"
);
let { MockRegistrar } = ChromeUtils.import(
  "resource://testing-common/MockRegistrar.jsm"
);

let extension;
async function startExtension() {
  extension = ExtensionTestUtils.loadExtension({
    async background() {
      browser.test.onMessage.addListener(async message => {
        let accounts = await browser.cloudFile.getAllAccounts();
        for (let account of accounts) {
          await browser.cloudFile.updateAccount(account.id, {
            configured: true,
          });
        }
        browser.test.sendMessage("ready");
      });
    },
    files: {
      "management.html": `<html>
        <body>
          <a id="a" href="https://www.example.com/">Click me!</a>
        </body>
      </html>`,
    },
    manifest: {
      cloud_file: {
        name: "Mochitest",
        management_url: "management.html",
      },
      applications: { gecko: { id: "cloudfile@mochitest" } },
    },
  });

  info("Starting extension");
  await extension.startup();

  if (accountIsConfigured) {
    extension.sendMessage("set configured");
    await extension.awaitMessage("ready");
  }
}

add_task(async () => {
  let weTransfer = await AddonManager.getAddonByID(
    "wetransfer@extensions.thunderbird.net"
  );
  if (!weTransfer) {
    // WeTransfer isn't registered in artifact builds because the wrong
    // built_in_addons.json is used. For the purposes of this test, pretend
    // that it is registered.
    cloudFileAccounts.registerProvider("WeTransfer-Test", {
      displayName: "WeTransfer",
      type: "ext-wetransfer@extensions.thunderbird.net",
    });
    registerCleanupFunction(() => {
      cloudFileAccounts.unregisterProvider("WeTransfer-Test");
    });
  }
});

let accountIsConfigured = false;

// Mock the prompt service. We're going to be asked if we're sure
// we want to remove an account, so let's say yes.

/** @implements {nsIPromptService} */
let mockPromptService = {
  confirmCount: 0,
  confirm() {
    this.confirmCount++;
    return true;
  },
  QueryInterface: ChromeUtils.generateQI(["nsIPromptService"]),
};
/** @implements {nsIExternalProtocolService} */
let mockExternalProtocolService = {
  _loadedURLs: [],
  externalProtocolHandlerExists(aProtocolScheme) {},
  getApplicationDescription(aScheme) {},
  getProtocolHandlerInfo(aProtocolScheme) {},
  getProtocolHandlerInfoFromOS(aProtocolScheme, aFound) {},
  isExposedProtocol(aProtocolScheme) {},
  loadURI(aURI, aWindowContext) {
    this._loadedURLs.push(aURI.spec);
  },
  setProtocolHandlerDefaults(aHandlerInfo, aOSHandlerExists) {},
  urlLoaded(aURL) {
    return this._loadedURLs.includes(aURL);
  },
  QueryInterface: ChromeUtils.generateQI(["nsIExternalProtocolService"]),
};

let originalPromptService = Services.prompt;
Services.prompt = mockPromptService;

let mockExternalProtocolServiceCID = MockRegistrar.register(
  "@mozilla.org/uriloader/external-protocol-service;1",
  mockExternalProtocolService
);

registerCleanupFunction(() => {
  Services.prompt = originalPromptService;
  MockRegistrar.unregister(mockExternalProtocolServiceCID);
});

add_task(async function addRemoveAccounts() {
  is(cloudFileAccounts.providers.length, 1);
  is(cloudFileAccounts.accounts.length, 0);

  // Load the preferences tab.

  let { prefsDocument, prefsWindow } = await openNewPrefsTab(
    "paneCompose",
    "compositionAttachmentsCategory"
  );

  // Check everything is as it should be.

  let accountList = prefsDocument.getElementById("cloudFileView");
  is(accountList.itemCount, 0);

  let buttonList = prefsDocument.getElementById("addCloudFileAccountButtons");
  ok(!buttonList.hidden);
  is(buttonList.childElementCount, 1);
  is(
    buttonList.children[0].getAttribute("value"),
    "ext-wetransfer@extensions.thunderbird.net"
  );

  let menuButton = prefsDocument.getElementById("addCloudFileAccount");
  ok(menuButton.hidden);
  is(menuButton.itemCount, 1);
  is(
    menuButton.getItemAtIndex(0).getAttribute("value"),
    "ext-wetransfer@extensions.thunderbird.net"
  );

  let removeButton = prefsDocument.getElementById("removeCloudFileAccount");
  ok(removeButton.disabled);

  let cloudFileDefaultPanel = prefsDocument.getElementById(
    "cloudFileDefaultPanel"
  );
  ok(!cloudFileDefaultPanel.hidden);

  let browserWrapper = prefsDocument.getElementById("cloudFileSettingsWrapper");
  is(browserWrapper.childElementCount, 0);

  // Register our test provider.

  await startExtension();
  is(cloudFileAccounts.providers.length, 2);
  is(cloudFileAccounts.accounts.length, 0);

  await new Promise(resolve => prefsWindow.requestAnimationFrame(resolve));

  is(buttonList.childElementCount, 2);
  is(
    buttonList.children[0].getAttribute("value"),
    "ext-wetransfer@extensions.thunderbird.net"
  );
  is(buttonList.children[1].getAttribute("value"), "ext-cloudfile@mochitest");
  is(
    buttonList.children[1].style.listStyleImage,
    `url("chrome://messenger/content/extension.svg")`
  );

  is(menuButton.itemCount, 2);
  is(
    menuButton.getItemAtIndex(0).getAttribute("value"),
    "ext-wetransfer@extensions.thunderbird.net"
  );
  is(
    menuButton.getItemAtIndex(1).getAttribute("value"),
    "ext-cloudfile@mochitest"
  );
  is(
    menuButton.getItemAtIndex(1).getAttribute("image"),
    "chrome://messenger/content/extension.svg"
  );

  // Create a new account.

  EventUtils.synthesizeMouseAtCenter(
    buttonList.children[1],
    { clickCount: 1 },
    prefsWindow
  );
  is(cloudFileAccounts.accounts.length, 1);
  is(cloudFileAccounts.configuredAccounts.length, 0);

  let account = cloudFileAccounts.accounts[0];
  let accountKey = account.accountKey;
  is(cloudFileAccounts.accounts[0].type, "ext-cloudfile@mochitest");

  // Check prefs were updated.

  is(
    Services.prefs.getCharPref(
      `mail.cloud_files.accounts.${accountKey}.displayName`
    ),
    "Mochitest"
  );
  is(
    Services.prefs.getCharPref(`mail.cloud_files.accounts.${accountKey}.type`),
    "ext-cloudfile@mochitest"
  );

  // Check UI was updated.

  is(accountList.itemCount, 1);
  is(accountList.selectedIndex, 0);
  ok(!removeButton.disabled);

  let accountListItem = accountList.selectedItem;
  is(accountListItem.getAttribute("value"), accountKey);
  is(
    accountListItem.style.listStyleImage,
    `url("chrome://messenger/content/extension.svg")`
  );
  is(accountListItem.querySelector("label").value, "Mochitest");
  is(accountListItem.querySelector("image.configuredWarning").hidden, false);

  ok(cloudFileDefaultPanel.hidden);
  is(browserWrapper.childElementCount, 1);

  let browser = browserWrapper.firstElementChild;
  if (
    browser.webProgress?.isLoadingDocument ||
    browser.currentURI?.spec == "about:blank"
  ) {
    await BrowserTestUtils.browserLoaded(browser);
  }
  is(
    browser.currentURI.pathQueryRef,
    `/management.html?accountId=${accountKey}`
  );

  let tabmail = document.getElementById("tabmail");
  let tabCount = tabmail.tabInfo.length;
  BrowserTestUtils.synthesizeMouseAtCenter("a", {}, browser);
  // It might take a moment to get to the external protocol service.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));
  ok(
    mockExternalProtocolService.urlLoaded("https://www.example.com/"),
    "Link click sent to external protocol service."
  );
  is(tabmail.tabInfo.length, tabCount, "No new tab opened");

  // Rename the account.

  EventUtils.synthesizeMouseAtCenter(
    accountListItem,
    { clickCount: 1 },
    prefsWindow
  );

  await new Promise(resolve => prefsWindow.requestAnimationFrame(resolve));

  is(
    prefsDocument.activeElement.closest("input"),
    accountListItem.querySelector("input")
  );
  ok(accountListItem.querySelector("label").hidden);
  ok(!accountListItem.querySelector("input").hidden);
  is(accountListItem.querySelector("input").value, "Mochitest");
  EventUtils.synthesizeKey("VK_RIGHT", undefined, prefsWindow);
  EventUtils.synthesizeKey("!", undefined, prefsWindow);
  EventUtils.synthesizeKey("VK_RETURN", undefined, prefsWindow);

  await new Promise(resolve => prefsWindow.requestAnimationFrame(resolve));

  is(prefsDocument.activeElement, accountList);
  ok(!accountListItem.querySelector("label").hidden);
  is(accountListItem.querySelector("label").value, "Mochitest!");
  ok(accountListItem.querySelector("input").hidden);
  is(
    Services.prefs.getCharPref(
      `mail.cloud_files.accounts.${accountKey}.displayName`
    ),
    "Mochitest!"
  );

  // Start to rename the account, but bail out.

  EventUtils.synthesizeMouseAtCenter(
    accountListItem,
    { clickCount: 1 },
    prefsWindow
  );

  await new Promise(resolve => prefsWindow.requestAnimationFrame(resolve));

  is(
    prefsDocument.activeElement.closest("input"),
    accountListItem.querySelector("input")
  );
  EventUtils.synthesizeKey("O", undefined, prefsWindow);
  EventUtils.synthesizeKey("o", undefined, prefsWindow);
  EventUtils.synthesizeKey("p", undefined, prefsWindow);
  EventUtils.synthesizeKey("s", undefined, prefsWindow);
  EventUtils.synthesizeKey("VK_ESCAPE", undefined, prefsWindow);

  await new Promise(resolve => prefsWindow.requestAnimationFrame(resolve));

  is(prefsDocument.activeElement, accountList);
  ok(!accountListItem.querySelector("label").hidden);
  is(accountListItem.querySelector("label").value, "Mochitest!");
  ok(accountListItem.querySelector("input").hidden);
  is(
    Services.prefs.getCharPref(
      `mail.cloud_files.accounts.${accountKey}.displayName`
    ),
    "Mochitest!"
  );

  // Configure the account.

  account.configured = true;
  accountIsConfigured = true;
  cloudFileAccounts.emit("accountConfigured", account);

  await new Promise(resolve => prefsWindow.requestAnimationFrame(resolve));

  is(accountListItem.querySelector("image.configuredWarning").hidden, true);
  is(cloudFileAccounts.accounts.length, 1);
  is(cloudFileAccounts.configuredAccounts.length, 1);

  // Remove the test provider. The list item, button, and browser should disappear.

  info("Stopping extension");
  await extension.unload();
  is(cloudFileAccounts.providers.length, 1);
  is(cloudFileAccounts.accounts.length, 0);

  await new Promise(resolve => prefsWindow.requestAnimationFrame(resolve));

  is(buttonList.childElementCount, 1);
  is(
    buttonList.children[0].getAttribute("value"),
    "ext-wetransfer@extensions.thunderbird.net"
  );
  is(menuButton.itemCount, 1);
  is(
    menuButton.getItemAtIndex(0).getAttribute("value"),
    "ext-wetransfer@extensions.thunderbird.net"
  );
  is(accountList.itemCount, 0);
  ok(!cloudFileDefaultPanel.hidden);
  is(browserWrapper.childElementCount, 0);

  // Re-add the test provider.

  await startExtension();
  is(cloudFileAccounts.providers.length, 2);
  is(cloudFileAccounts.accounts.length, 1);
  is(cloudFileAccounts.configuredAccounts.length, 1);

  await new Promise(resolve => prefsWindow.requestAnimationFrame(resolve));

  is(buttonList.childElementCount, 2);
  is(
    buttonList.children[0].getAttribute("value"),
    "ext-wetransfer@extensions.thunderbird.net"
  );
  is(buttonList.children[1].getAttribute("value"), "ext-cloudfile@mochitest");

  is(menuButton.itemCount, 2);
  is(
    menuButton.getItemAtIndex(0).getAttribute("value"),
    "ext-wetransfer@extensions.thunderbird.net"
  );
  is(
    menuButton.getItemAtIndex(1).getAttribute("value"),
    "ext-cloudfile@mochitest"
  );

  is(accountList.itemCount, 1);
  is(accountList.selectedIndex, -1);
  ok(removeButton.disabled);

  accountListItem = accountList.getItemAtIndex(0);
  is(
    Services.prefs.getCharPref(
      `mail.cloud_files.accounts.${accountKey}.displayName`
    ),
    "Mochitest!"
  );

  EventUtils.synthesizeMouseAtCenter(
    accountList.getItemAtIndex(0),
    { clickCount: 1 },
    prefsWindow
  );
  ok(!removeButton.disabled);
  EventUtils.synthesizeMouseAtCenter(
    removeButton,
    { clickCount: 1 },
    prefsWindow
  );
  is(mockPromptService.confirmCount, 1);

  ok(
    !Services.prefs.prefHasUserValue(
      `mail.cloud_files.accounts.${accountKey}.displayName`
    )
  );
  ok(
    !Services.prefs.prefHasUserValue(
      `mail.cloud_files.accounts.${accountKey}.type`
    )
  );

  is(cloudFileAccounts.providers.length, 2);
  is(cloudFileAccounts.accounts.length, 0);

  info("Stopping extension");
  await extension.unload();
  is(cloudFileAccounts.providers.length, 1);
  is(cloudFileAccounts.accounts.length, 0);

  // Close the preferences tab.

  await closePrefsTab();
});

add_task(async function accountListOverflow() {
  is(cloudFileAccounts.providers.length, 1);
  is(cloudFileAccounts.accounts.length, 0);

  // Register our test provider.

  await startExtension();
  is(cloudFileAccounts.providers.length, 2);
  is(cloudFileAccounts.accounts.length, 0);

  // Load the preferences tab.

  let { prefsDocument, prefsWindow } = await openNewPrefsTab(
    "paneCompose",
    "compositionAttachmentsCategory"
  );

  let accountList = prefsDocument.getElementById("cloudFileView");
  is(accountList.itemCount, 0);

  let buttonList = prefsDocument.getElementById("addCloudFileAccountButtons");
  ok(!buttonList.hidden);
  is(buttonList.childElementCount, 2);
  is(buttonList.children[0].getAttribute("value"), "ext-cloudfile@mochitest");

  let menuButton = prefsDocument.getElementById("addCloudFileAccount");
  ok(menuButton.hidden);

  // Add new accounts until the list overflows. The list of buttons should be hidden
  // and the button with the drop-down should appear.

  let count = 0;
  do {
    EventUtils.synthesizeMouseAtCenter(
      buttonList.children[0],
      { clickCount: 1 },
      prefsWindow
    );
    await new Promise(resolve => setTimeout(resolve));
    if (buttonList.hidden) {
      break;
    }
  } while (++count < 25);

  ok(count < 24); // If count reaches 25, we have a problem.
  ok(!menuButton.hidden);

  // Remove the added accounts. The list of buttons should not reappear and the
  // button with the drop-down should remain.

  let removeButton = prefsDocument.getElementById("removeCloudFileAccount");
  do {
    EventUtils.synthesizeMouseAtCenter(
      accountList.getItemAtIndex(0),
      { clickCount: 1 },
      prefsWindow
    );
    EventUtils.synthesizeMouseAtCenter(
      removeButton,
      { clickCount: 1 },
      prefsWindow
    );
    await new Promise(resolve => setTimeout(resolve));
  } while (--count > 0);

  ok(buttonList.hidden);
  ok(!menuButton.hidden);

  // Close the preferences tab.

  await closePrefsTab();
  info("Stopping extension");
  await extension.unload();
  Services.prefs.deleteBranch("mail.cloud_files.accounts");
});

add_task(async function accountListOrder() {
  is(cloudFileAccounts.providers.length, 1);
  is(cloudFileAccounts.accounts.length, 0);

  for (let [key, displayName] of [
    ["someKey1", "carl's Account"],
    ["someKey2", "Amber's Account"],
    ["someKey3", "alice's Account"],
    ["someKey4", "Bob's Account"],
  ]) {
    Services.prefs.setCharPref(
      `mail.cloud_files.accounts.${key}.type`,
      "ext-cloudfile@mochitest"
    );
    Services.prefs.setCharPref(
      `mail.cloud_files.accounts.${key}.displayName`,
      displayName
    );
  }

  // Register our test provider.

  await startExtension();
  is(cloudFileAccounts.providers.length, 2);
  is(cloudFileAccounts.accounts.length, 4);

  let { prefsDocument } = await openNewPrefsTab(
    "paneCompose",
    "compositionAttachmentsCategory"
  );

  let accountList = prefsDocument.getElementById("cloudFileView");
  is(accountList.itemCount, 4);

  is(accountList.getItemAtIndex(0).value, "someKey3");
  is(accountList.getItemAtIndex(1).value, "someKey2");
  is(accountList.getItemAtIndex(2).value, "someKey4");
  is(accountList.getItemAtIndex(3).value, "someKey1");

  await closePrefsTab();
  info("Stopping extension");
  await extension.unload();
  Services.prefs.deleteBranch("mail.cloud_files.accounts");
});
