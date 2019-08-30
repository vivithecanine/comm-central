/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals MsgOpenNewWindowForFolder */

let { BrowserTestUtils } = ChromeUtils.import(
  "resource://testing-common/BrowserTestUtils.jsm"
);

add_task(async () => {
  let extension = ExtensionTestUtils.loadExtension({
    async background() {
      let listener = {
        waitingPromises: [],
        waitForEvent() {
          return new Promise(resolve => {
            listener.waitingPromises.push(resolve);
          });
        },
        checkWaiting() {
          if (listener.waitingPromises.length < 1) {
            browser.test.fail("Unexpected event fired");
          }
        },
        created(win) {
          listener.checkWaiting();
          listener.waitingPromises.shift()(["onCreated", win]);
        },
        focusChanged(windowId) {
          listener.checkWaiting();
          listener.waitingPromises.shift()(["onFocusChanged", windowId]);
        },
        removed(windowId) {
          listener.checkWaiting();
          listener.waitingPromises.shift()(["onRemoved", windowId]);
        },
      };
      browser.windows.onCreated.addListener(listener.created);
      browser.windows.onFocusChanged.addListener(listener.focusChanged);
      browser.windows.onRemoved.addListener(listener.removed);

      let firstWindow = await browser.windows.getCurrent();
      browser.test.assertEq("normal", firstWindow.type);

      let currentWindows = await browser.windows.getAll();
      browser.test.assertEq(1, currentWindows.length);
      browser.test.assertEq(firstWindow.id, currentWindows[0].id);

      // Open a new mail window.

      let createdWindowPromise = listener.waitForEvent();
      let focusChangedPromise1 = listener.waitForEvent();
      let focusChangedPromise2 = listener.waitForEvent();
      let eventName, createdWindow, windowId;

      browser.test.sendMessage("openWindow");
      [eventName, createdWindow] = await createdWindowPromise;
      browser.test.assertEq("onCreated", eventName);
      browser.test.assertEq("normal", createdWindow.type);

      [eventName, windowId] = await focusChangedPromise1;
      browser.test.assertEq("onFocusChanged", eventName);
      browser.test.assertEq(browser.windows.WINDOW_ID_NONE, windowId);

      [eventName, windowId] = await focusChangedPromise2;
      browser.test.assertEq("onFocusChanged", eventName);
      browser.test.assertEq(createdWindow.id, windowId);

      currentWindows = await browser.windows.getAll();
      browser.test.assertEq(2, currentWindows.length);
      browser.test.assertEq(firstWindow.id, currentWindows[0].id);
      browser.test.assertEq(createdWindow.id, currentWindows[1].id);

      // Focus the first window.

      let platformInfo = await browser.runtime.getPlatformInfo();

      let focusChangedPromise3;
      if (["mac", "win"].includes(platformInfo.os)) {
        // Mac and Windows don't fire this event. Pretend they do.
        focusChangedPromise3 = Promise.resolve([
          "onFocusChanged",
          browser.windows.WINDOW_ID_NONE,
        ]);
      } else {
        focusChangedPromise3 = listener.waitForEvent();
      }
      let focusChangedPromise4 = listener.waitForEvent();

      browser.test.sendMessage("switchWindows");
      [eventName, windowId] = await focusChangedPromise3;
      browser.test.assertEq("onFocusChanged", eventName);
      browser.test.assertEq(browser.windows.WINDOW_ID_NONE, windowId);

      [eventName, windowId] = await focusChangedPromise4;
      browser.test.assertEq("onFocusChanged", eventName);
      browser.test.assertEq(firstWindow.id, windowId);

      // Close the first window.

      let removedWindowPromise = listener.waitForEvent();

      browser.test.sendMessage("closeWindow");
      [eventName, windowId] = await removedWindowPromise;
      browser.test.assertEq("onRemoved", eventName);
      browser.test.assertEq(createdWindow.id, windowId);

      currentWindows = await browser.windows.getAll();
      browser.test.assertEq(1, currentWindows.length);
      browser.test.assertEq(firstWindow.id, currentWindows[0].id);

      browser.windows.onCreated.removeListener(listener.created);
      browser.windows.onFocusChanged.removeListener(listener.focusChanged);
      browser.windows.onRemoved.removeListener(listener.removed);

      browser.test.notifyPass();
    },
  });

  let account = createAccount();

  await extension.startup();

  await extension.awaitMessage("openWindow");
  let newWindowPromise = BrowserTestUtils.domWindowOpened();
  MsgOpenNewWindowForFolder(account.incomingServer.rootFolder.URI);
  let newWindow = await newWindowPromise;

  await extension.awaitMessage("switchWindows");
  window.focus();

  await extension.awaitMessage("closeWindow");
  newWindow.close();

  await extension.awaitFinish();
  await extension.unload();

  cleanUpAccount(account);
});
