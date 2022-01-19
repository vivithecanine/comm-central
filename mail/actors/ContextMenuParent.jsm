/* vim: set ts=2 sw=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["ContextMenuParent"];

class ContextMenuParent extends JSWindowActorParent {
  receiveMessage(message) {
    if (message.name != "contextmenu") {
      return;
    }

    let browser = this.manager.rootFrameLoader.ownerElement;
    let win = browser.ownerGlobal.top;

    // Send events from a message display browser to about:3pane or
    // about:message if possible.
    let tabmail = win.document.getElementById("tabmail");
    if (tabmail?.currentTabInfo.browser?.contentWindow?.openContextMenu) {
      tabmail.currentTabInfo.browser.contentWindow.openContextMenu(
        message,
        browser,
        this
      );
      return;
    }

    // Otherwise, send them to the outer window.
    if ("openContextMenu" in win) {
      win.openContextMenu(message, browser, this);
    }
  }

  hiding() {
    try {
      this.sendAsyncMessage("ContextMenu:Hiding", {});
    } catch (e) {
      // This will throw if the content goes away while the
      // context menu is still open.
    }
  }
}
