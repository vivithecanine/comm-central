/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

this.tabs = class extends ExtensionAPI {
  getAPI(context) {
    return {
      tabs: {
        connect(tabId, connectInfo) {
          let name = "";
          if (connectInfo && connectInfo.name !== null) {
            name = connectInfo.name;
          }
          let recipient = {
            extensionId: context.extension.id,
            tabId,
          };
          if (connectInfo && connectInfo.frameId !== null) {
            recipient.frameId = connectInfo.frameId;
          }
          return context.messenger.connect(
            context.messageManager,
            name,
            recipient
          );
        },

        sendMessage(tabId, message, options, responseCallback) {
          let recipient = {
            extensionId: context.extension.id,
            tabId,
          };
          if (options && options.frameId !== null) {
            recipient.frameId = options.frameId;
          }
          return context.messenger.sendMessage(
            context.messageManager,
            message,
            recipient,
            responseCallback
          );
        },
      },
    };
  }
};
