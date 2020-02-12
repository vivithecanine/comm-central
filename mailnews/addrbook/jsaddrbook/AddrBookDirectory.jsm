/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ["AddrBookDirectory", "closeConnectionTo"];

ChromeUtils.defineModuleGetter(
  this,
  "FileUtils",
  "resource://gre/modules/FileUtils.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "MailServices",
  "resource:///modules/MailServices.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "Services",
  "resource://gre/modules/Services.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "SimpleEnumerator",
  "resource:///modules/AddrBookUtils.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "fixIterator",
  "resource:///modules/iteratorUtils.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "AddrBookCard",
  "resource:///modules/AddrBookCard.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "AddrBookMailingList",
  "resource:///modules/AddrBookMailingList.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "newUID",
  "resource:///modules/AddrBookUtils.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "toXPCOMArray",
  "resource:///modules/iteratorUtils.jsm"
);

/* This is where the address book manager creates an nsIAbDirectory. We want
 * to do things differently depending on whether or not the directory is a
 * mailing list, so we do this by abusing javascript prototypes.
 * A non-list directory has bookPrototype, a list directory has a
 * AddrBookMailingList prototype, ultimately created by getting the owner
 * directory and calling addressLists on it. This will make more sense and be
 * a lot neater once we stop using one XPCOM interface for two jobs. */

function AddrBookDirectory() {}
AddrBookDirectory.prototype = {
  QueryInterface: ChromeUtils.generateQI([Ci.nsIAbDirectory]),
  classID: Components.ID("{e96ee804-0bd3-472f-81a6-8a9d65277ad3}"),

  _query: null,

  init(uri) {
    this._uri = uri;

    let index = uri.indexOf("?");
    if (index >= 0) {
      this._query = uri.substring(index + 1);
      uri = uri.substring(0, index);
    }
    if (/\/MailList\d+$/.test(uri)) {
      let parent = MailServices.ab.getDirectory(
        uri.substring(0, uri.lastIndexOf("/"))
      );
      for (let list of parent.addressLists.enumerate()) {
        list.QueryInterface(Ci.nsIAbDirectory);
        if (list.URI == uri) {
          this.__proto__ = list;
          return;
        }
      }
      throw Cr.NS_ERROR_UNEXPECTED;
    }

    let fileName = uri.substring("jsaddrbook://".length);
    if (fileName.includes("/")) {
      fileName = fileName.substring(0, fileName.indexOf("/"));
    }
    this.__proto__ =
      directories.get(fileName) || new AddrBookDirectoryInner(fileName);
  },
};

// Keep track of all database connections, and close them at shutdown, since
// nothing else ever tells us to close them.

var connections = new Map();
Services.obs.addObserver(() => {
  for (let connection of connections.values()) {
    connection.asyncClose();
  }
  connections.clear();
  directories.clear();
}, "quit-application");

// Close a connection on demand. This serves as an escape hatch from C++ code.

Services.obs.addObserver(async file => {
  file.QueryInterface(Ci.nsIFile);
  await closeConnectionTo(file);
  Services.obs.notifyObservers(file, "addrbook-close-ab-complete");
}, "addrbook-close-ab");

/**
 * Opens an SQLite connection to `file`, caches the connection, and upgrades
 * the database schema if necessary.
 */
function openConnectionTo(file) {
  let connection = connections.get(file.path);
  if (!connection) {
    connection = Services.storage.openDatabase(file);
    switch (connection.schemaVersion) {
      case 0:
        connection.executeSimpleSQL("PRAGMA journal_mode=WAL");
        connection.executeSimpleSQL(
          "CREATE TABLE cards (uid TEXT PRIMARY KEY, localId INTEGER)"
        );
        connection.executeSimpleSQL(
          "CREATE TABLE properties (card TEXT, name TEXT, value TEXT)"
        );
        connection.executeSimpleSQL(
          "CREATE TABLE lists (uid TEXT PRIMARY KEY, localId INTEGER, name TEXT, nickName TEXT, description TEXT)"
        );
        connection.executeSimpleSQL(
          "CREATE TABLE list_cards (list TEXT, card TEXT, PRIMARY KEY(list, card))"
        );
      // Falls through.
      case 1:
        connection.executeSimpleSQL(
          "CREATE INDEX properties_card ON properties(card)"
        );
        connection.executeSimpleSQL(
          "CREATE INDEX properties_name ON properties(name)"
        );
        connection.schemaVersion = 2;
        break;
    }
    connections.set(file.path, connection);
  }
  return connection;
}

/**
 * Closes the SQLite connection to `file` and removes it from the cache.
 */
function closeConnectionTo(file) {
  directories.delete(file.leafName);
  let connection = connections.get(file.path);
  if (connection) {
    return new Promise(resolve => {
      connection.asyncClose({
        complete() {
          resolve();
        },
      });
      connections.delete(file.path);
    });
  }
  return Promise.resolve();
}

// One AddrBookDirectoryInner exists for each address book, multiple
// AddrBookDirectory objects (e.g. queries) can use it as their prototype.

var directories = new Map();

/**
 * Prototype for nsIAbDirectory objects that aren't mailing lists.
 *
 * @implements {nsIAbDirectory}
 */
function AddrBookDirectoryInner(fileName) {
  for (let child of Services.prefs.getChildList("ldap_2.servers.")) {
    if (
      child.endsWith(".filename") &&
      Services.prefs.getStringPref(child) == fileName
    ) {
      this.dirPrefId = child.substring(0, child.length - ".filename".length);
      break;
    }
  }
  if (!this.dirPrefId) {
    throw Cr.NS_ERROR_UNEXPECTED;
  }

  // Make sure we always have a file. If a file is not created, the
  // filename may be accidentally reused.
  let file = FileUtils.getFile("ProfD", [fileName]);
  if (!file.exists()) {
    file.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0o644);
  }

  directories.set(fileName, this);
  this._inner = this;
  this._fileName = fileName;
}
AddrBookDirectoryInner.prototype = {
  QueryInterface: ChromeUtils.generateQI([Ci.nsIAbDirectory]),
  classID: Components.ID("{e96ee804-0bd3-472f-81a6-8a9d65277ad3}"),

  _uid: null,
  _nextCardId: null,
  _nextListId: null,
  get _prefBranch() {
    if (!this.dirPrefId) {
      throw Cr.NS_ERROR_NOT_AVAILABLE;
    }
    return Services.prefs.getBranch(`${this.dirPrefId}.`);
  },
  get _dbConnection() {
    let file = FileUtils.getFile("ProfD", [this.fileName]);
    let connection = openConnectionTo(file);

    Object.defineProperty(this._inner, "_dbConnection", {
      enumerable: true,
      value: connection,
      writable: false,
    });
    return connection;
  },
  get _lists() {
    let listCache = new Map();
    let selectStatement = this._dbConnection.createStatement(
      "SELECT uid, localId, name, nickName, description FROM lists"
    );
    while (selectStatement.executeStep()) {
      listCache.set(selectStatement.row.uid, {
        uid: selectStatement.row.uid,
        localId: selectStatement.row.localId,
        name: selectStatement.row.name,
        nickName: selectStatement.row.nickName,
        description: selectStatement.row.description,
      });
    }
    selectStatement.finalize();

    Object.defineProperty(this._inner, "_lists", {
      enumerable: true,
      value: listCache,
      writable: false,
    });
    return listCache;
  },
  get _cards() {
    let cardCache = new Map();
    let cardStatement = this._dbConnection.createStatement(
      "SELECT uid, localId FROM cards"
    );
    while (cardStatement.executeStep()) {
      cardCache.set(cardStatement.row.uid, {
        uid: cardStatement.row.uid,
        localId: cardStatement.row.localId,
        properties: new Map(),
      });
    }
    cardStatement.finalize();
    let propertiesStatement = this._dbConnection.createStatement(
      "SELECT card, name, value FROM properties"
    );
    while (propertiesStatement.executeStep()) {
      let card = cardCache.get(propertiesStatement.row.card);
      if (card) {
        card.properties.set(
          propertiesStatement.row.name,
          propertiesStatement.row.value
        );
      }
    }
    propertiesStatement.finalize();

    Object.defineProperty(this._inner, "_cards", {
      enumerable: true,
      value: cardCache,
      writable: false,
    });
    return cardCache;
  },

  _getNextCardId() {
    if (this._inner._nextCardId === null) {
      let value = 0;
      let selectStatement = this._dbConnection.createStatement(
        "SELECT MAX(localId) AS localId FROM cards"
      );
      if (selectStatement.executeStep()) {
        value = selectStatement.row.localId;
      }
      this._inner._nextCardId = value;
      selectStatement.finalize();
    }
    this._inner._nextCardId++;
    return this._inner._nextCardId.toString();
  },
  _getNextListId() {
    if (this._inner._nextListId === null) {
      let value = 0;
      let selectStatement = this._dbConnection.createStatement(
        "SELECT MAX(localId) AS localId FROM lists"
      );
      if (selectStatement.executeStep()) {
        value = selectStatement.row.localId;
      }
      this._inner._nextListId = value;
      selectStatement.finalize();
    }
    this._inner._nextListId++;
    return this._inner._nextListId.toString();
  },
  _getCard({ uid, localId = null }) {
    let card = new AddrBookCard();
    card.directoryId = this.uuid;
    card._uid = uid;
    card.localId = localId;
    card._properties = this._loadCardProperties(uid);
    return card.QueryInterface(Ci.nsIAbCard);
  },
  _loadCardProperties(uid) {
    if (this._inner.hasOwnProperty("_cards")) {
      let cachedCard = this._inner._cards.get(uid);
      if (cachedCard) {
        return new Map(cachedCard.properties);
      }
    }
    let properties = new Map();
    let propertyStatement = this._dbConnection.createStatement(
      "SELECT name, value FROM properties WHERE card = :card"
    );
    propertyStatement.params.card = uid;
    while (propertyStatement.executeStep()) {
      properties.set(propertyStatement.row.name, propertyStatement.row.value);
    }
    propertyStatement.finalize();
    return properties;
  },
  _saveCardProperties(card) {
    let cachedCard;
    if (this._inner.hasOwnProperty("_cards")) {
      cachedCard = this._inner._cards.get(card.UID);
      cachedCard.properties.clear();
    }

    this._dbConnection.beginTransaction();
    let deleteStatement = this._dbConnection.createStatement(
      "DELETE FROM properties WHERE card = :card"
    );
    deleteStatement.params.card = card.UID;
    deleteStatement.execute();
    let insertStatement = this._dbConnection.createStatement(
      "INSERT INTO properties VALUES (:card, :name, :value)"
    );
    for (let { name, value } of fixIterator(card.properties, Ci.nsIProperty)) {
      if (value !== null && value !== undefined && value !== "") {
        insertStatement.params.card = card.UID;
        insertStatement.params.name = name;
        insertStatement.params.value = value;
        insertStatement.execute();
        insertStatement.reset();

        if (cachedCard) {
          cachedCard.properties.set(name, value);
        }
      }
    }
    this._dbConnection.commitTransaction();
    deleteStatement.finalize();
    insertStatement.finalize();
  },
  _saveList(list) {
    // Ensure list cache exists.
    this._lists;

    let replaceStatement = this._dbConnection.createStatement(
      "REPLACE INTO lists (uid, localId, name, nickName, description) " +
        "VALUES (:uid, :localId, :name, :nickName, :description)"
    );
    replaceStatement.params.uid = list._uid;
    replaceStatement.params.localId = list._localId;
    replaceStatement.params.name = list._name;
    replaceStatement.params.nickName = list._nickName;
    replaceStatement.params.description = list._description;
    replaceStatement.execute();
    replaceStatement.finalize();

    this._lists.set(list._uid, {
      uid: list._uid,
      localId: list._localId,
      name: list._name,
      nickName: list._nickName,
      description: list._description,
    });
  },
  async _bulkAddCards(cards) {
    let usedUIDs = new Set();
    let cardStatement = this._dbConnection.createStatement(
      "INSERT INTO cards (uid, localId) VALUES (:uid, :localId)"
    );
    let propertiesStatement = this._dbConnection.createStatement(
      "INSERT INTO properties VALUES (:card, :name, :value)"
    );
    let cardArray = cardStatement.newBindingParamsArray();
    let propertiesArray = propertiesStatement.newBindingParamsArray();
    for (let card of cards) {
      let uid = card.UID;
      if (!uid || usedUIDs.has(uid)) {
        // A card cannot have the same UID as one that already exists.
        // Assign a new UID to avoid losing data.
        uid = newUID();
      }
      usedUIDs.add(uid);
      let localId = this._getNextCardId();
      let cardParams = cardArray.newBindingParams();
      cardParams.bindByName("uid", uid);
      cardParams.bindByName("localId", localId);
      cardArray.addParams(cardParams);

      let cachedCard;
      if (this._inner.hasOwnProperty("_cards")) {
        cachedCard = {
          uid,
          localId,
          properties: new Map(),
        };
        this._inner._cards.set(uid, cachedCard);
      }

      for (let { name, value } of fixIterator(
        card.properties,
        Ci.nsIProperty
      )) {
        if (
          [
            "DbRowID",
            "LowercasePrimaryEmail",
            "LowercaseSecondEmail",
            "RecordKey",
            "UID",
          ].includes(name)
        ) {
          continue;
        }
        let propertiesParams = propertiesArray.newBindingParams();
        propertiesParams.bindByName("card", uid);
        propertiesParams.bindByName("name", name);
        propertiesParams.bindByName("value", value);
        propertiesArray.addParams(propertiesParams);

        if (cachedCard) {
          cachedCard.properties.set(name, value);
        }
      }
    }
    try {
      this._dbConnection.beginTransaction();
      if (cardArray.length > 0) {
        cardStatement.bindParameters(cardArray);
        await new Promise((resolve, reject) => {
          cardStatement.executeAsync({
            handleError(error) {
              this._error = error;
            },
            handleCompletion(status) {
              if (status == Ci.mozIStorageStatementCallback.REASON_ERROR) {
                reject(
                  Components.Exception(this._error.message, Cr.NS_ERROR_FAILURE)
                );
              } else {
                resolve();
              }
            },
          });
        });
        cardStatement.finalize();
      }
      if (propertiesArray.length > 0) {
        propertiesStatement.bindParameters(propertiesArray);
        await new Promise((resolve, reject) => {
          propertiesStatement.executeAsync({
            handleError(error) {
              this._error = error;
            },
            handleCompletion(status) {
              if (status == Ci.mozIStorageStatementCallback.REASON_ERROR) {
                reject(
                  Components.Exception(this._error.message, Cr.NS_ERROR_FAILURE)
                );
              } else {
                resolve();
              }
            },
          });
        });
        propertiesStatement.finalize();
      }
      this._dbConnection.commitTransaction();
    } catch (ex) {
      this._dbConnection.rollbackTransaction();
      throw ex;
    }
  },

  /* nsIAbDirectory */

  get readOnly() {
    return false;
  },
  get isRemote() {
    return false;
  },
  get isSecure() {
    return false;
  },
  get propertiesChromeURI() {
    return "chrome://messenger/content/addressbook/abAddressBookNameDialog.xhtml";
  },
  get dirName() {
    return this.getLocalizedStringValue("description", "");
  },
  set dirName(value) {
    let oldValue = this.dirName;
    this.setLocalizedStringValue("description", value);
    MailServices.ab.notifyItemPropertyChanged(this, "DirName", oldValue, value);
  },
  get dirType() {
    return 101;
  },
  get fileName() {
    return this._fileName;
  },
  get UID() {
    if (!this._uid) {
      if (this._prefBranch.getPrefType("uid") == Services.prefs.PREF_STRING) {
        this._inner._uid = this._prefBranch.getStringPref("uid");
      } else {
        this._inner._uid = newUID();
        this._prefBranch.setStringPref("uid", this._inner._uid);
      }
    }
    return this._inner._uid;
  },
  get URI() {
    return this._uri;
  },
  get position() {
    return this._prefBranch.getIntPref("position", 1);
  },
  get uuid() {
    return `${this.dirPrefId}&${this.dirName}`;
  },
  get childNodes() {
    let lists = Array.from(
      this._lists.values(),
      list =>
        new AddrBookMailingList(
          list.uid,
          this,
          list.localId,
          list.name,
          list.nickName,
          list.description
        ).asDirectory
    );
    return new SimpleEnumerator(lists);
  },
  get childCards() {
    let results = Array.from(
      this._lists.values(),
      list =>
        new AddrBookMailingList(
          list.uid,
          this,
          list.localId,
          list.name,
          list.nickName,
          list.description
        ).asCard
    ).concat(Array.from(this._cards.values(), card => this._getCard(card)));

    if (this._query) {
      if (!this._processedQuery) {
        // Process the query string into a tree of conditions to match.
        let lispRegexp = /^\((and|or|not|([^\)]*)(\)+))/;
        let index = 0;
        let rootQuery = { children: [], op: "or" };
        let currentQuery = rootQuery;

        while (true) {
          let match = lispRegexp.exec(this._query.substring(index));
          if (!match) {
            break;
          }
          index += match[0].length;

          if (["and", "or", "not"].includes(match[1])) {
            // For the opening bracket, step down a level.
            let child = {
              parent: currentQuery,
              children: [],
              op: match[1],
            };
            currentQuery.children.push(child);
            currentQuery = child;
          } else {
            currentQuery.children.push(match[2]);

            // For each closing bracket except the first, step up a level.
            for (let i = match[3].length - 1; i > 0; i--) {
              currentQuery = currentQuery.parent;
            }
          }
        }
        this._processedQuery = rootQuery;
      }

      results = results.filter(card => {
        let properties;
        if (card.isMailList) {
          properties = new Map([
            ["DisplayName", card.displayName],
            ["NickName", card.getProperty("NickName")],
            ["Notes", card.getProperty("Notes")],
          ]);
        } else {
          properties = this._loadCardProperties(card.UID);
        }
        let matches = b => {
          if (typeof b == "string") {
            let [name, condition, value] = b.split(",");
            if (name == "IsMailList" && condition == "=") {
              return card.isMailList == (value == "TRUE");
            }

            if (!properties.has(name)) {
              return condition == "!ex";
            }
            if (condition == "ex") {
              return true;
            }

            value = decodeURIComponent(value).toLowerCase();
            let cardValue = properties.get(name).toLowerCase();
            switch (condition) {
              case "=":
                return cardValue == value;
              case "!=":
                return cardValue != value;
              case "lt":
                return cardValue < value;
              case "gt":
                return cardValue > value;
              case "bw":
                return cardValue.startsWith(value);
              case "ew":
                return cardValue.endsWith(value);
              case "c":
                return cardValue.includes(value);
              case "!c":
                return !cardValue.includes(value);
              case "~=":
              case "regex":
              default:
                return false;
            }
          }
          if (b.op == "or") {
            return b.children.some(bb => matches(bb));
          }
          if (b.op == "and") {
            return b.children.every(bb => matches(bb));
          }
          if (b.op == "not") {
            return !matches(b.children[0]);
          }
          return false;
        };

        return matches(this._processedQuery);
      }, this);
    }
    return new SimpleEnumerator(results);
  },
  get isQuery() {
    return !!this._query;
  },
  get supportsMailingLists() {
    return true;
  },
  get addressLists() {
    let lists = Array.from(
      this._lists.values(),
      list =>
        new AddrBookMailingList(
          list.uid,
          this,
          list.localId,
          list.name,
          list.nickName,
          list.description
        ).asDirectory
    );
    return toXPCOMArray(lists, Ci.nsIMutableArray);
  },

  generateName(generateFormat, bundle) {
    return this.dirName;
  },
  cardForEmailAddress(emailAddress) {
    return (
      this.getCardFromProperty("PrimaryEmail", emailAddress, false) ||
      this.getCardFromProperty("SecondEmail", emailAddress, false)
    );
  },
  getCardFromProperty(property, value, caseSensitive) {
    let sql = caseSensitive
      ? "SELECT card FROM properties WHERE name = :name AND value = :value LIMIT 1"
      : "SELECT card FROM properties WHERE name = :name AND LOWER(value) = LOWER(:value) LIMIT 1";
    let selectStatement = this._dbConnection.createStatement(sql);
    selectStatement.params.name = property;
    selectStatement.params.value = value;
    let result = null;
    if (selectStatement.executeStep()) {
      result = this._getCard({ uid: selectStatement.row.card });
    }
    selectStatement.finalize();
    return result;
  },
  getCardsFromProperty(property, value, caseSensitive) {
    let sql = caseSensitive
      ? "SELECT card FROM properties WHERE name = :name AND value = :value"
      : "SELECT card FROM properties WHERE name = :name AND LOWER(value) = LOWER(:value)";
    let selectStatement = this._dbConnection.createStatement(sql);
    selectStatement.params.name = property;
    selectStatement.params.value = value;
    let results = [];
    while (selectStatement.executeStep()) {
      results.push(this._getCard({ uid: selectStatement.row.card }));
    }
    selectStatement.finalize();
    return new SimpleEnumerator(results);
  },
  deleteDirectory(directory) {
    let list = this._lists.get(directory.UID);
    list = new AddrBookMailingList(
      list.uid,
      this,
      list.localId,
      list.name,
      list.nickName,
      list.description
    );

    let deleteListStatement = this._dbConnection.createStatement(
      "DELETE FROM lists WHERE uid = :uid"
    );
    deleteListStatement.params.uid = directory.UID;
    deleteListStatement.execute();
    deleteListStatement.finalize();

    if (this._inner.hasOwnProperty("_lists")) {
      this._inner._lists.delete(directory.UID);
    }

    this._dbConnection.executeSimpleSQL(
      "DELETE FROM list_cards WHERE list NOT IN (SELECT DISTINCT uid FROM lists)"
    );
    MailServices.ab.notifyDirectoryItemDeleted(this, list.asCard);
    MailServices.ab.notifyDirectoryItemDeleted(list.asDirectory, list.asCard);
    MailServices.ab.notifyDirectoryDeleted(this, directory);
  },
  hasCard(card) {
    return this._lists.has(card.UID) || this._cards.has(card.UID);
  },
  hasDirectory(dir) {
    return this._lists.has(dir.UID);
  },
  hasMailListWithName(name) {
    for (let list of this._lists.values()) {
      if (list.name == name) {
        return true;
      }
    }
    return false;
  },
  addCard(card) {
    return this.dropCard(card, false);
  },
  modifyCard(card) {
    let oldProperties = this._loadCardProperties(card.UID);
    let newProperties = new Map();
    for (let { name, value } of fixIterator(card.properties, Ci.nsIProperty)) {
      newProperties.set(name, value);
    }
    this._saveCardProperties(card);
    for (let [name, oldValue] of oldProperties.entries()) {
      if (!newProperties.has(name)) {
        MailServices.ab.notifyItemPropertyChanged(card, name, oldValue, null);
      }
    }
    for (let [name, newValue] of newProperties.entries()) {
      let oldValue = oldProperties.get(name);
      if (oldValue == null && newValue == "") {
        continue;
      }
      if (oldValue != newValue) {
        MailServices.ab.notifyItemPropertyChanged(
          card,
          name,
          oldValue,
          newValue
        );
      }
    }
    Services.obs.notifyObservers(card, "addrbook-contact-updated", this.UID);
  },
  deleteCards(cards) {
    if (cards === null) {
      throw Cr.NS_ERROR_INVALID_POINTER;
    }

    let deleteCardStatement = this._dbConnection.createStatement(
      "DELETE FROM cards WHERE uid = :uid"
    );
    for (let card of cards.enumerate(Ci.nsIAbCard)) {
      deleteCardStatement.params.uid = card.UID;
      deleteCardStatement.execute();
      deleteCardStatement.reset();

      if (this._inner.hasOwnProperty("_cards")) {
        this._inner._cards.delete(card.UID);
      }
    }
    this._dbConnection.executeSimpleSQL(
      "DELETE FROM properties WHERE card NOT IN (SELECT DISTINCT uid FROM cards)"
    );
    for (let card of cards.enumerate(Ci.nsIAbCard)) {
      MailServices.ab.notifyDirectoryItemDeleted(this, card);
    }

    // We could just delete all non-existent cards from list_cards, but a
    // notification should be fired for each one. Let the list handle that.
    for (let list of this.childNodes) {
      list.deleteCards(cards);
    }

    deleteCardStatement.finalize();
  },
  dropCard(card, needToCopyCard) {
    if (!card.UID) {
      throw new Error("Card must have a UID to be added to this directory.");
    }

    let newCard = new AddrBookCard();
    newCard.directoryId = this.uuid;
    newCard.localId = this._getNextCardId();
    newCard._uid = needToCopyCard ? newUID() : card.UID;

    let insertStatement = this._dbConnection.createStatement(
      "INSERT INTO cards (uid, localId) VALUES (:uid, :localId)"
    );
    insertStatement.params.uid = newCard.UID;
    insertStatement.params.localId = newCard.localId;
    insertStatement.execute();
    insertStatement.finalize();

    if (this._inner.hasOwnProperty("_cards")) {
      this._inner._cards.set(newCard._uid, {
        uid: newCard._uid,
        localId: newCard.localId,
        properties: new Map(),
      });
    }

    for (let { name, value } of fixIterator(card.properties, Ci.nsIProperty)) {
      if (
        [
          "DbRowID",
          "LowercasePrimaryEmail",
          "LowercaseSecondEmail",
          "RecordKey",
          "UID",
        ].includes(name)
      ) {
        // These properties are either stored elsewhere (DbRowID, UID), or no
        // longer needed. Don't store them.
        continue;
      }
      newCard.setProperty(name, value);
    }
    this._saveCardProperties(newCard);

    MailServices.ab.notifyDirectoryItemAdded(this, newCard);
    Services.obs.notifyObservers(newCard, "addrbook-contact-created", this.UID);

    return newCard;
  },
  useForAutocomplete(identityKey) {
    return (
      Services.prefs.getBoolPref("mail.enable_autocomplete") &&
      this.getBoolValue("enable_autocomplete", true)
    );
  },
  addMailList(list) {
    if (!list.isMailList) {
      throw Cr.NS_ERROR_UNEXPECTED;
    }

    let newList = new AddrBookMailingList(
      newUID(),
      this,
      this._getNextListId(),
      list.dirName || "",
      list.listNickName || "",
      list.description || ""
    );
    this._saveList(newList);

    let newListDirectory = newList.asDirectory;
    MailServices.ab.notifyDirectoryItemAdded(this, newList.asCard);
    MailServices.ab.notifyDirectoryItemAdded(this, newListDirectory);
    return newListDirectory;
  },
  editMailListToDatabase(listCard) {
    // Deliberately not implemented, this isn't a mailing list.
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },
  copyMailList(srcList) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },
  getIntValue(name, defaultValue) {
    return this._prefBranch.getIntPref(name, defaultValue);
  },
  getBoolValue(name, defaultValue) {
    return this._prefBranch.getBoolPref(name, defaultValue);
  },
  getStringValue(name, defaultValue) {
    return this._prefBranch.getStringPref(name, defaultValue);
  },
  getLocalizedStringValue(name, defaultValue) {
    if (this._prefBranch.getPrefType(name) == Ci.nsIPrefBranch.PREF_INVALID) {
      return defaultValue;
    }
    return this._prefBranch.getComplexValue(name, Ci.nsIPrefLocalizedString)
      .data;
  },
  setIntValue(name, value) {
    this._prefBranch.setIntPref(name, value);
  },
  setBoolValue(name, value) {
    this._prefBranch.setBoolPref(name, value);
  },
  setStringValue(name, value) {
    this._prefBranch.setStringPref(name, value);
  },
  setLocalizedStringValue(name, value) {
    let valueLocal = Cc["@mozilla.org/pref-localizedstring;1"].createInstance(
      Ci.nsIPrefLocalizedString
    );
    valueLocal.data = value;
    this._prefBranch.setComplexValue(
      name,
      Ci.nsIPrefLocalizedString,
      valueLocal
    );
  },
};
