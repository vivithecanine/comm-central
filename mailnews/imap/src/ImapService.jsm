/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["ImapService"];

var { ImapClient } = ChromeUtils.import("resource:///modules/ImapClient.jsm");

/**
 * Set mailnews.imap.jsmodule to true to use this module.
 *
 * @implements {nsIImapService}
 */
class ImapService {
  QueryInterface = ChromeUtils.generateQI(["nsIImapService"]);

  selectFolder(folder, urlListener, msgWindow) {
    this._client.selectFolder(folder, urlListener, msgWindow);
  }

  discoverAllFolders(folder, urlListener, msgWindow) {
    this._client = new ImapClient(
      folder.QueryInterface(Ci.nsIMsgImapMailFolder).imapIncomingServer
    );
    this._client.onOpen = () => {};
    this._client.connect();
  }
}

ImapService.prototype.classID = Components.ID(
  "{2ea8fbe6-029b-4bff-ae05-b794cf955afb}"
);
