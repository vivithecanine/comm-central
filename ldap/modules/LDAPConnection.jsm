/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["LDAPConnection"];

ChromeUtils.defineModuleGetter(
  this,
  "LDAPClient",
  "resource:///modules/LDAPClient.jsm"
);

/**
 * A module to manage LDAP connection.
 *
 * @implements {nsILDAPConnection}
 */
class LDAPConnection {
  QueryInterface = ChromeUtils.generateQI(["nsILDAPConnection"]);

  get bindName() {
    return this._bindName;
  }

  init(url, bindName, listener, closure, version) {
    this.client = new LDAPClient(url.host, url.port, url.scheme == "ldaps");
    this._url = url;
    this._bindName = bindName;
    this.client.onOpen = () => {
      listener.onLDAPInit();
    };
    this.client.connect();
  }

  get wrappedJSObject() {
    return this;
  }
}

LDAPConnection.prototype.classID = Components.ID(
  "{f87b71b5-2a0f-4b37-8e4f-3c899f6b8432}"
);
