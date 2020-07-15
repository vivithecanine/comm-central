/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["CardDAVDirectory"];

const { AddrBookDirectory } = ChromeUtils.import(
  "resource:///modules/AddrBookDirectory.jsm"
);
const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const { VCardUtils } = ChromeUtils.import("resource:///modules/VCardUtils.jsm");
ChromeUtils.defineModuleGetter(
  this,
  "fixIterator",
  "resource:///modules/iteratorUtils.jsm"
);

/**
 * @extends AddrBookDirectory
 * @implements nsIAbDirectory
 */
class CardDAVDirectory extends AddrBookDirectory {
  /** nsIAbDirectory */

  get supportsMailingLists() {
    return false;
  }

  async modifyCard(card) {
    let oldProperties = this._loadCardProperties(card.UID);

    let newProperties = new Map();
    for (let { name, value } of fixIterator(card.properties, Ci.nsIProperty)) {
      newProperties.set(name, value);
    }

    let sendSucceeded = await this._sendCardToServer(card);
    if (!sendSucceeded) {
      // _etag and _vCard properties have now been updated. Work out what
      // properties changed on the server, and copy them to `card`, but only
      // if they haven't also changed on the client.
      let serverCard = VCardUtils.vCardToAbCard(card.getProperty("_vCard", ""));
      for (let { name, value } of fixIterator(
        serverCard.properties,
        Ci.nsIProperty
      )) {
        if (
          value != newProperties.get(name) &&
          newProperties.get(name) == oldProperties.get(name)
        ) {
          card.setProperty(name, value);
        }
      }

      // Send the card back to the server. This time, the ETag matches what's
      // on the server, so this should succeed.
      await this._sendCardToServer(card);
    }

    // Store in the database.
    super.modifyCard(card);
  }
  deleteCards(cards) {
    super.deleteCards(cards);
    for (let card of cards) {
      this._deleteCardFromServer(card);
    }
  }
  dropCard(card, needToCopyCard) {
    // Ideally, we'd not add the card until it was on the server, but we have
    // to return newCard synchronously.
    let newCard = super.dropCard(card, needToCopyCard);
    this._sendCardToServer(newCard).then(() => super.modifyCard(newCard));
    return newCard;
  }
  addMailList() {
    throw Components.Exception(
      "CardDAVDirectory does not implement addMailList",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }
  editMailListToDatabase() {
    throw Components.Exception(
      "CardDAVDirectory does not implement editMailListToDatabase",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }
  copyMailList() {
    throw Components.Exception(
      "CardDAVDirectory does not implement copyMailList",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }

  get _serverURL() {
    return this.getStringValue("carddav.url", "");
  }
  get _syncToken() {
    return this.getStringValue("carddav.token", "");
  }
  set _syncToken(value) {
    this.setStringValue("carddav.token", value);
  }

  /**
   * Wraps makeRequest, resolving path this directory's server URL, and
   * providing a mechanism to give a username and password specific to this
   * directory.
   *
   * @param {String} path - A path relative to the server URL.
   * @param {Object} details - See makeRequest.
   * @return {Promise<Object>} - See makeRequest.
   */
  _makeRequest(path, details = {}) {
    let serverURI = Services.io.newURI(this._serverURL);
    let uri = serverURI.resolve(path);

    return CardDAVDirectory.makeRequest(uri, details);
  }

  /**
   * Gets or creates the path for storing this card on the server. Cards that
   * already exist on the server have this value in the _href property.
   *
   * @param {nsIAbCard} card
   * @return {String}
   */
  _getCardHref(card) {
    let href = card.getProperty("_href", "");
    if (href) {
      return href;
    }
    href = Services.io.newURI(this._serverURL).resolve(`${card.UID}.vcf`);
    return new URL(href).pathname;
  }

  _multigetRequest(hrefsToFetch) {
    hrefsToFetch = hrefsToFetch.map(
      href => `      <d:href>${xmlEncode(href)}</d:href>`
    );
    let data = `<addressbook-multiget xmlns="urn:ietf:params:xml:ns:carddav" xmlns:d="DAV:">
      <d:prop>
        <d:getetag/>
        <address-data/>
      </d:prop>
      ${hrefsToFetch.join("\n")}
    </addressbook-multiget>`;

    return this._makeRequest("", {
      method: "REPORT",
      body: data,
      headers: {
        Depth: 1,
      },
    });
  }

  /**
   * Converts the card to a vCard and performs a PUT request to store it on the
   * server. Then immediately performs a GET request ensuring the local copy
   * matches the server copy.
   *
   * @param {nsIAbCard} card
   * @returns {boolean} true if the PUT request succeeded without conflict,
   *     false if there was a conflict.
   * @throws if the server responded with anything other than a success or
   *     conflict status code.
   */
  async _sendCardToServer(card) {
    let href = this._getCardHref(card);
    let requestDetails = {
      method: "PUT",
      contentType: "text/vcard",
    };

    let existingVCard = card.getProperty("_vCard", "");
    if (existingVCard) {
      requestDetails.body = VCardUtils.modifyVCard(existingVCard, card);
      let existingETag = card.getProperty("_etag", "");
      if (existingETag) {
        requestDetails.headers = { "If-Match": existingETag };
      }
    } else {
      // TODO 3.0 is the default, should we be able to use other versions?
      requestDetails.body = VCardUtils.abCardToVCard(card, "3.0");
    }
    let response = await this._makeRequest(href, requestDetails);
    let conflictResponse = [409, 412].includes(response.status);
    if (response.status >= 400 && !conflictResponse) {
      throw Components.Exception(
        `Sending card to the server failed, response was ${response.status} ${response.statusText}`,
        Cr.NS_ERROR_FAILURE
      );
    }

    // At this point we *should* be able to make a simple GET request and
    // store the response. But Google moves the data (fair enough) without
    // telling us where it went (c'mon, really?). Fortunately a multiget
    // request at the original location works.

    response = await this._multigetRequest([href]);

    for (let r of response.dom.querySelectorAll("response")) {
      let etag = r.querySelector("getetag").textContent;
      let href = r.querySelector("href").textContent;
      let vCard = normalizeLineEndings(
        r.querySelector("address-data").textContent
      );

      card.setProperty("_etag", etag);
      card.setProperty("_href", href);
      card.setProperty("_vCard", vCard);
    }

    return !conflictResponse;
  }

  /**
   * Deletes card from the server.
   *
   * @param {nsIAbCard} card
   */
  _deleteCardFromServer(card) {
    let href = card.getProperty("_href", "");
    if (!href) {
      return Promise.resolve();
    }

    return this._makeRequest(href, { method: "DELETE" });
  }

  /**
   * Get all cards on the server and add them to this directory. This should
   * be used for the initial population of a directory.
   */
  async fetchAllFromServer() {
    let data = `<propfind xmlns="DAV:" xmlns:cs="http://calendarserver.org/ns/">
      <prop>
        <resourcetype/>
        <cs:getetag/>
      </prop>
    </propfind>`;

    let response = await this._makeRequest("", {
      method: "PROPFIND",
      body: data,
      headers: {
        Depth: 1,
      },
    });

    let hrefsToFetch = [];
    for (let r of response.dom.querySelectorAll("response")) {
      if (!r.querySelector("resourcetype collection")) {
        hrefsToFetch.push(r.querySelector("href").textContent);
      }
    }

    if (hrefsToFetch.length == 0) {
      return;
    }

    response = await this._multigetRequest(hrefsToFetch);

    let abCards = [];

    for (let r of response.dom.querySelectorAll("response")) {
      let etag = r.querySelector("getetag").textContent;
      let href = r.querySelector("href").textContent;
      let vCard = normalizeLineEndings(
        r.querySelector("address-data").textContent
      );

      try {
        let abCard = VCardUtils.vCardToAbCard(vCard);
        abCard.setProperty("_etag", etag);
        abCard.setProperty("_href", href);
        abCard.setProperty("_vCard", vCard);
        abCards.push(abCard);
      } catch (ex) {
        console.error(`Error parsing: ${vCard}`);
        Cu.reportError(ex);
      }
    }

    await this._bulkAddCards(abCards);
    Services.obs.notifyObservers(this, "addrbook-directory-synced");
  }

  /**
   * Compares cards in the directory with cards on the server, and updates the
   * directory to match what is on the server.
   */
  async updateAllFromServer() {
    let data = `<addressbook-query xmlns="urn:ietf:params:xml:ns:carddav" xmlns:d="DAV:">
      <d:prop>
        <d:getetag/>
      </d:prop>
    </addressbook-query>`;

    let response = await this._makeRequest("", {
      method: "REPORT",
      body: data,
      headers: {
        Depth: 1,
      },
    });

    let hrefMap = new Map();
    for (let r of response.dom.querySelectorAll("response")) {
      let etag = r.querySelector("getetag").textContent;
      let href = r.querySelector("href").textContent;

      hrefMap.set(href, etag);
    }

    let cardMap = new Map();
    let hrefsToFetch = [];
    let cardsToAdd = [];
    let cardsToModify = [];
    let cardsToDelete = [];
    for (let card of this.childCards) {
      let href = card.getProperty("_href", "");
      let etag = card.getProperty("_etag", "");

      if (!href || !etag) {
        // Not sure how we got here. Ignore it.
        continue;
      }
      cardMap.set(href, card);
      if (hrefMap.has(href)) {
        if (hrefMap.get(href) != etag) {
          // The card was updated on server.
          hrefsToFetch.push(href);
          cardsToModify.push(href);
        }
      } else {
        // The card doesn't exist on the server.
        cardsToDelete.push(card);
      }
    }

    for (let href of hrefMap.keys()) {
      if (!cardMap.has(href)) {
        // The card is new on the server.
        hrefsToFetch.push(href);
        cardsToAdd.push(href);
      }
    }

    if (cardsToDelete.length > 0) {
      super.deleteCards(cardsToDelete);
    }

    if (hrefsToFetch.length == 0) {
      return;
    }

    response = await this._multigetRequest(hrefsToFetch);

    for (let r of response.dom.querySelectorAll("response")) {
      let etag = r.querySelector("getetag").textContent;
      let href = r.querySelector("href").textContent;
      let vCard = normalizeLineEndings(
        r.querySelector("address-data").textContent
      );

      let abCard = VCardUtils.vCardToAbCard(vCard);
      abCard.setProperty("_etag", etag);
      abCard.setProperty("_href", href);
      abCard.setProperty("_vCard", vCard);

      if (cardsToAdd.includes(href)) {
        super.dropCard(abCard, false);
      } else {
        super.modifyCard(abCard);
      }
    }
  }

  /**
   * Retrieves the current sync token from the server.
   *
   * @see RFC 6578
   */
  async getSyncToken() {
    let data = `<propfind xmlns="DAV:">
      <prop>
         <displayname/>
         <sync-token/>
      </prop>
    </propfind>`;

    let response = await this._makeRequest("", {
      method: "PROPFIND",
      body: data,
    });
    this._syncToken = response.dom.querySelector("sync-token").textContent;
  }

  /**
   * Gets a list of changes on the server since the last call to getSyncToken
   * or updateAllFromServerV2, and updates the directory to match what is on
   * the server.
   *
   * @see RFC 6578
   */
  async updateAllFromServerV2() {
    let syncToken = this._syncToken;
    if (!syncToken) {
      throw new Components.Exception("No sync token", Cr.NS_ERROR_UNEXPECTED);
    }

    let data = `<sync-collection xmlns="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
      <sync-token>${xmlEncode(syncToken)}</sync-token>
      <sync-level>1</sync-level>
      <prop>
        <getetag/>
        <card:address-data/>
      </prop>
    </sync-collection>`;

    let response = await this._makeRequest("", {
      method: "REPORT",
      body: data,
    });
    let dom = response.dom;
    this._syncToken = dom.querySelector("sync-token").textContent;

    let cardsToDelete = [];
    for (let response of dom.querySelectorAll("response")) {
      let href = response.querySelector("href").textContent;
      let status = response.querySelector("response > status");

      let card = this.getCardFromProperty("_href", href, true);
      if (status && status.textContent == "HTTP/1.1 404 Not Found") {
        if (card) {
          cardsToDelete.push(card);
        }
        continue;
      }

      let etag = response.querySelector("getetag").textContent;
      let vCard = normalizeLineEndings(
        response.querySelector("address-data").textContent
      );

      let abCard = VCardUtils.vCardToAbCard(vCard);
      abCard.setProperty("_etag", etag);
      abCard.setProperty("_href", href);
      abCard.setProperty("_vCard", vCard);

      if (card) {
        if (card.getProperty("_etag", "") != etag) {
          super.modifyCard(abCard);
        }
      } else {
        super.dropCard(abCard, false);
      }
    }

    if (cardsToDelete.length > 0) {
      super.deleteCards(cardsToDelete);
    }
  }

  static forFile(fileName) {
    let directory = super.forFile(fileName);
    if (directory instanceof CardDAVDirectory) {
      return directory;
    }
    return undefined;
  }

  /**
   * Make an HTTP request. If the request needs a username and password, the
   * given authPrompt is called.
   *
   * @param {String} uri
   * @param {Object} details
   * @param {String} details.method
   * @param {String} details.header
   * @param {String} details.body
   * @param {String} details.contentType
   * @return {Promise<Object>} - Resolves to an object with getters for:
   *    - status, the HTTP response code
   *    - statusText, the HTTP response message
   *    - text, the returned data as a String
   *    - dom, the returned data parsed into a Document
   */
  static async makeRequest(
    uri,
    { method = "GET", headers = {}, body = null, contentType = "text/xml" }
  ) {
    uri = Services.io.newURI(uri);

    return new Promise((resolve, reject) => {
      let principal = Services.scriptSecurityManager.createContentPrincipal(
        uri,
        {}
      );
      let channel = Services.io.newChannelFromURI(
        uri,
        null,
        principal,
        null,
        Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
        Ci.nsIContentPolicy.TYPE_OTHER
      );
      channel.QueryInterface(Ci.nsIHttpChannel);
      for (let [name, value] of Object.entries(headers)) {
        channel.setRequestHeader(name, value, false);
      }
      channel.notificationCallbacks = notificationCallbacks;
      if (body !== null) {
        let converter = Cc[
          "@mozilla.org/intl/scriptableunicodeconverter"
        ].createInstance(Ci.nsIScriptableUnicodeConverter);
        converter.charset = "UTF-8";
        let stream = converter.convertToInputStream(body.toString());

        channel.QueryInterface(Ci.nsIUploadChannel);
        channel.setUploadStream(stream, contentType, -1);
      }
      channel.requestMethod = method; // Must go after setUploadStream.

      let listener = Cc["@mozilla.org/network/stream-loader;1"].createInstance(
        Ci.nsIStreamLoader
      );
      listener.init({
        onStreamComplete(loader, context, status, resultLength, result) {
          let finalChannel = loader.request.QueryInterface(Ci.nsIHttpChannel);
          if (!Components.isSuccessCode(status)) {
            reject(new Components.Exception("Connection failure", status));
            return;
          }
          if (finalChannel.responseStatus == 401) {
            // We tried to authenticate, but failed.
            reject(
              new Components.Exception(
                "Authorization failure",
                Cr.NS_ERROR_FAILURE
              )
            );
          }
          resolve({
            get status() {
              return finalChannel.responseStatus;
            },
            get statusText() {
              return finalChannel.responseStatusText;
            },
            get text() {
              return new TextDecoder().decode(Uint8Array.from(result));
            },
            get dom() {
              if (this._dom === undefined) {
                try {
                  this._dom = new DOMParser().parseFromString(
                    this.text,
                    "text/xml"
                  );
                } catch (ex) {
                  this._dom = null;
                }
              }
              return this._dom;
            },
          });
        },
      });
      channel.asyncOpen(listener, channel);
    });
  }
}
CardDAVDirectory.prototype.classID = Components.ID(
  "{1fa9941a-07d5-4a6f-9673-15327fc2b9ab}"
);

/**
 * Ensure that `string` always has Windows line-endings. Some functions,
 * notably DOMParser.parseFromString, strip \r, but we want it because \r\n
 * is a part of the vCard specification.
 */
function normalizeLineEndings(string) {
  if (string.includes("\r\n")) {
    return string;
  }
  return string.replace(/\n/g, "\r\n");
}

/**
 * Encode special characters safely for XML.
 */
function xmlEncode(string) {
  return string
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

let notificationCallbacks = {
  QueryInterface: ChromeUtils.generateQI([
    "nsIInterfaceRequestor",
    "nsIAuthPrompt2",
    "nsIChannelEventSink",
  ]),
  getInterface: ChromeUtils.generateQI([
    "nsIAuthPrompt2",
    "nsIChannelEventSink",
  ]),
  promptAuth(channel, level, authInfo) {
    if (authInfo.flags & Ci.nsIAuthInformation.PREVIOUS_FAILED) {
      return false;
    }
    let logins = Services.logins.findLogins(channel.URI.prePath, null, "");
    for (let l of logins) {
      authInfo.username = l.username;
      authInfo.password = l.password;
      return true;
    }

    let savePasswordLabel = null;
    if (Services.prefs.getBoolPref("signon.rememberSignons", true)) {
      savePasswordLabel = Services.strings
        .createBundle("chrome://passwordmgr/locale/passwordmgr.properties")
        .GetStringFromName("rememberPassword");
    }
    let savePassword = {};
    let returnValue = Services.prompt.promptAuth(
      null,
      channel,
      level,
      authInfo,
      savePasswordLabel,
      savePassword
    );
    if (savePassword.value) {
      let newLoginInfo = Cc[
        "@mozilla.org/login-manager/loginInfo;1"
      ].createInstance(Ci.nsILoginInfo);
      newLoginInfo.init(
        channel.URI.prePath,
        null,
        authInfo.realm,
        authInfo.username,
        authInfo.password,
        "",
        ""
      );
      Services.logins.addLogin(newLoginInfo);
    }
    return returnValue;
  },
  asyncOnChannelRedirect(oldChannel, newChannel, flags, callback) {
    /**
     * Copy the given header from the old channel to the new one, ignoring missing headers
     *
     * @param {String} header - The header to copy
     */
    function copyHeader(header) {
      try {
        let headerValue = oldChannel.getRequestHeader(header);
        if (headerValue) {
          newChannel.setRequestHeader(header, headerValue, false);
        }
      } catch (e) {
        if (e.result != Cr.NS_ERROR_NOT_AVAILABLE) {
          // The header could possibly not be available, ignore that
          // case but throw otherwise
          throw e;
        }
      }
    }

    // Make sure we can get/set headers on both channels.
    newChannel.QueryInterface(Ci.nsIHttpChannel);
    oldChannel.QueryInterface(Ci.nsIHttpChannel);

    // If any other header is used, it should be added here. We might want
    // to just copy all headers over to the new channel.
    copyHeader("Authorization");
    copyHeader("Depth");
    copyHeader("Originator");
    copyHeader("Recipient");
    copyHeader("If-None-Match");
    copyHeader("If-Match");

    newChannel.requestMethod = oldChannel.requestMethod;
    callback.onRedirectVerifyCallback(Cr.NS_OK);
  },
};
