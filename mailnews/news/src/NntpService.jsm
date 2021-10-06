/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["NntpService"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  Services: "resource://gre/modules/Services.jsm",
  MailServices: "resource:///modules/MailServices.jsm",
  NntpClient: "resource:///modules/NntpClient.jsm",
  NntpNewsGroup: "resource:///modules/NntpNewsGroup.jsm",
});

/**
 * Set the mailnews.nntp.jsmodule pref to true to use this module.
 *
 * @implements {nsINntpService}
 */
class NntpService {
  QueryInterface = ChromeUtils.generateQI(["nsINntpService"]);

  get cacheStorage() {
    if (!this._cacheStorage) {
      this._cacheStorage = Services.cache2.memoryCacheStorage(
        Services.loadContextInfo.custom(false, {})
      );
    }
    return this._cacheStorage;
  }

  generateNewsHeaderValsForPosting(
    newsgroupsList,
    outNewsgroupsHeader,
    outNewsHostHeader
  ) {
    let groups = newsgroupsList.split(",");
    outNewsgroupsHeader.value = newsgroupsList;
    let hosts = groups.map(name => this._findHostFromGroupName(name));
    hosts = [...new Set(hosts)];
    let host = hosts[0];
    if (!host) {
      throw Components.Exception("Host not found", Cr.NS_ERROR_ILLEGAL_VALUE);
    }
    if (hosts.length > 1) {
      throw Components.Exception(
        `Cross posting not allowed, hosts=${hosts.join(",")}`,
        Cr.NS_ERROR_ILLEGAL_VALUE
      );
    }
    outNewsHostHeader.value = host;
  }

  postMessage(messageFile, groupNames, accountKey, urlListener, msgWindow) {
    let server = MailServices.accounts.getAccount(accountKey)?.incomingServer;
    if (!server) {
      // If no matching server, find the first news server and use it.
      server = MailServices.accounts.FindServer("", "", "nntp");
    }
    server = server.QueryInterface(Ci.nsINntpIncomingServer);
    let uri = `news://${server.hostName}/`;
    let client = new NntpClient(server);
    client.connect();

    let runningUrl = Services.io.newURI(uri);

    client.onOpen = () => {
      client.post();
      urlListener?.OnStartRunningUrl(runningUrl, Cr.NS_OK);
    };

    client.onReadyToPost = () => {
      let fstream = Cc[
        "@mozilla.org/network/file-input-stream;1"
      ].createInstance(Ci.nsIFileInputStream);
      // PR_RDONLY
      fstream.init(messageFile, 0x01, 0, 0);
      let sstream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
        Ci.nsIScriptableInputStream
      );
      sstream.init(fstream);

      while (sstream.available()) {
        let chunk = sstream.read(65536);
        client.send(chunk);
      }
      sstream.close();
      fstream.close();
      client.sendEnd();
    };

    client.onDone = () => {
      urlListener?.OnStopRunningUrl(runningUrl, Cr.NS_OK);
    };
  }

  getNewNews(server, uri, getOld, urlListener, msgWindow) {
    // The uri is in the form of news://news.mozilla.org/mozilla.accessibility
    let matches = /.+:\/\/([^:]+):?(\d+)?\/(.+)?/.exec(uri);
    let groupName = matches[3];
    let newsGroup = new NntpNewsGroup(server, groupName);
    newsGroup.getOldMessages = getOld;

    let client = new NntpClient(server);
    client.connect();

    client.onOpen = () => {
      client.getNewNews(groupName, newsGroup, urlListener, msgWindow);
    };

    return client.runningUri;
  }

  getListOfGroupsOnServer(server, msgWindow, getOnlyNew) {
    let client = new NntpClient(server);
    client.connect();

    client.onOpen = () => {
      client.getListOfGroups();
    };

    client.onData = data => {
      server.addNewsgroupToList(data.split(" ")[0]);
    };
  }

  fetchMessage(folder, key, msgWindow, consumer, urlListener) {
    if (!(consumer instanceof Ci.nsIStreamListener)) {
      return;
    }
    let pipe = Cc["@mozilla.org/pipe;1"].createInstance(Ci.nsIPipe);
    pipe.init(true, true, 0, 0);
    let inputStream = pipe.inputStream;
    let outputStream = pipe.outputStream;

    let client = new NntpClient(
      folder.server.QueryInterface(Ci.nsINntpIncomingServer)
    );
    client._urlListener = urlListener;
    client.connect();
    client.onOpen = () => {
      client.getArticleByArticleNumber(folder.name, key);
      consumer.onStartRequest(null);
    };
    client.onData = data => {
      outputStream.write(data, data.length);
      consumer.onDataAvailable(null, inputStream, 0, data.length);
    };
    client.onDone = () => {
      consumer.onStopRequest(null, Cr.NS_OK);
    };
  }

  cancelMessage(cancelUrl, messageUri, consumer, urlListener, msgWindow) {
    if (Services.prefs.getBoolPref("news.cancel.confirm")) {
      let bundle = Services.strings.createBundle(
        "chrome://messenger/locale/news.properties"
      );
      let result = msgWindow.promptDialog.confirmEx(
        null,
        bundle.GetStringFromName("cancelConfirm"),
        Ci.nsIPrompt.STD_YES_NO_BUTTONS,
        null,
        null,
        null,
        null,
        { value: false }
      );
      if (result != 0) {
        // Cancelled.
        return;
      }
    }
    // The cancelUrl is in the form of "news://host/message-id?cancel"
    let url = new URL(cancelUrl);
    let messageId = "<" + decodeURIComponent(url.pathname.slice(1)) + ">";
    let server = MailServices.accounts
      .FindServer("", url.host, "nntp")
      .QueryInterface(Ci.nsINntpIncomingServer);
    let groupName = new URL(messageUri).pathname.slice(1);
    let messageKey = messageUri.split("#")[1];
    let newsFolder = server.findGroup(groupName);
    let from = MailServices.accounts.getFirstIdentityForServer(server).email;
    let bundle = Services.strings.createBundle(
      "chrome://branding/locale/brand.properties"
    );

    let client = new NntpClient(server);
    client.runningUri.msgWindow = msgWindow;
    client.connect();

    client.onOpen = () => {
      client.cancelArticle(urlListener, groupName);
    };

    client.onReadyToPost = () => {
      let content = [
        `From: ${from}`,
        `Newsgroups: ${groupName}`,
        `Subject: cancel ${messageId}`,
        `References: ${messageId}`,
        `Control: cancel ${messageId}`,
        "MIME-Version: 1.0",
        "Content-Type: text/plain",
        "", // body separator
        `This message was cancelled from within ${bundle.GetStringFromName(
          "brandFullName"
        )}`,
      ];
      client.send(content.join("\r\n"));
      client.sendEnd();

      newsFolder.removeMessage(messageKey);
    };
  }

  /**
   * Find the hostname of a NNTP server from a group name.
   * @param {string} groupName - The group name.
   * @returns {string} The corresponding server host.
   */
  _findHostFromGroupName(groupName) {
    for (let server of MailServices.accounts.allServers) {
      if (
        server instanceof Ci.nsINntpIncomingServer &&
        server.containsNewsgroup(groupName)
      ) {
        return server.hostName;
      }
    }
    return "";
  }
}

NntpService.prototype.classID = Components.ID(
  "{b13db263-a219-4168-aeaf-8266f001087e}"
);
