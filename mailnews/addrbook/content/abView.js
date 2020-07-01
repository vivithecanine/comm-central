/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals MailServices, PROTO_TREE_VIEW, Services */

function ABView(directory, searchQuery, listener, sortColumn, sortDirection) {
  this.__proto__.__proto__ = new PROTO_TREE_VIEW();
  this.directory = directory;
  this.listener = listener;

  let directories = directory ? [directory] : MailServices.ab.directories;
  if (searchQuery) {
    searchQuery = searchQuery.replace(/^\?+/, "");
    for (let dir of directories) {
      dir.search(searchQuery, this);
    }
  } else {
    for (let dir of directories) {
      for (let card of dir.childCards) {
        this._rowMap.push(new abViewCard(card));
      }
    }
    if (this.listener) {
      this.listener.onCountChanged(this.rowCount);
    }
  }
  this.sortBy(sortColumn, sortDirection);
}
ABView.prototype = {
  QueryInterface: ChromeUtils.generateQI([
    Ci.nsITreeView,
    Ci.nsIAbDirSearchListener,
    Ci.nsIObserver,
    Ci.nsISupportsWeakReference,
  ]),

  directory: null,
  listener: null,
  _notifications: [
    "addrbook-directory-invalidated",
    "addrbook-contact-created",
    "addrbook-contact-deleted",
    "addrbook-contact-updated",
    "addrbook-list-updated",
    "addrbook-list-member-added",
    "addrbook-list-member-removed",
  ],

  sortColumn: "",
  sortDirection: "",
  collator: new Intl.Collator(undefined, { numeric: true }),

  deleteSelectedCards() {
    let directoryMap = new Map();
    for (let i = 0; i < this.selection.getRangeCount(); i++) {
      let start = {};
      let finish = {};
      this.selection.getRangeAt(i, start, finish);
      for (let j = start.value; j <= finish.value; j++) {
        let card = this.getCardFromRow(j);
        let directoryId = card.directoryId.split("&")[0];
        let cardSet = directoryMap.get(directoryId);
        if (!cardSet) {
          cardSet = new Set();
          directoryMap.set(directoryId, cardSet);
        }
        cardSet.add(card);
      }
    }

    for (let [directoryId, cardSet] of directoryMap) {
      let directory;
      if (this.directory && this.directory.isMailList) {
        // Removes cards from the list instead of deleting them.
        directory = this.directory;
      } else {
        directory = MailServices.ab.getDirectoryFromId(directoryId);
      }

      cardSet = [...cardSet];
      directory.deleteCards(cardSet.filter(card => !card.isMailList));
      for (let card of cardSet.filter(card => card.isMailList)) {
        MailServices.ab.deleteAddressBook(card.mailListURI);
      }
    }
  },
  getCardFromRow(row) {
    return this._rowMap[row] ? this._rowMap[row].card : null;
  },
  sortBy(sortColumn, sortDirection, resort) {
    if (sortColumn == this.sortColumn && !resort) {
      if (sortDirection == this.sortDirection) {
        return;
      }
      this._rowMap.reverse();
    } else {
      this._rowMap.sort((a, b) => {
        let aText = a.getText(sortColumn);
        let bText = b.getText(sortColumn);
        if (sortDirection == "descending") {
          return this.collator.compare(bText, aText);
        }
        return this.collator.compare(aText, bText);
      });
    }

    if (this.tree) {
      this.tree.invalidate();
    }
    this.sortColumn = sortColumn;
    this.sortDirection = sortDirection;
  },

  // nsITreeView

  selectionChanged() {
    if (this.listener) {
      this.listener.onSelectionChanged();
    }
  },
  setTree(tree) {
    this.tree = tree;
    for (let topic of this._notifications) {
      if (tree) {
        Services.obs.addObserver(this, topic, true);
      } else {
        Services.obs.removeObserver(this, topic);
      }
    }
  },

  // nsIAbDirSearchListener

  onSearchFoundCard(card) {
    // Instead of duplicating the insertion code below, just call it.
    this.observe(card, "addrbook-contact-created", this.directory?.UID);
  },
  onSearchFinished(result, errorMsg) {},

  // nsIObserver

  observe(subject, topic, data) {
    if (this.directory && data && this.directory.UID != data) {
      return;
    }

    switch (topic) {
      case "addrbook-directory-invalidated":
        if (subject == this.directory) {
          this._rowMap.length = 0;
          for (let card of this.directory.childCards) {
            this._rowMap.push(new abViewCard(card));
          }
          this.sortBy(this.sortColumn, this.sortDirection, true);
          if (this.listener) {
            this.listener.onCountChanged(this.rowCount);
          }
        }
        break;
      case "addrbook-list-member-added":
        if (!this.directory) {
          break;
        }
      // Falls through.
      case "addrbook-contact-created":
        let viewCard = new abViewCard(subject);
        let sortText = viewCard.getText(this.sortColumn);
        let addIndex = null;
        for (let i = 0; addIndex === null && i < this._rowMap.length; i++) {
          let comparison = this.collator.compare(
            sortText,
            this._rowMap[i].getText(this.sortColumn)
          );
          if (
            (comparison < 0 && this.sortDirection == "ascending") ||
            (comparison >= 0 && this.sortDirection == "descending")
          ) {
            addIndex = i;
          }
        }
        if (addIndex === null) {
          addIndex = this._rowMap.length;
        }
        this._rowMap.splice(addIndex, 0, viewCard);
        if (this.tree) {
          this.tree.rowCountChanged(addIndex, 1);
        }
        if (this.listener) {
          this.listener.onCountChanged(this.rowCount);
        }
        break;

      case "addrbook-list-updated":
        if (!this.directory) {
          break;
        }
      // Falls through.
      case "addrbook-contact-updated": {
        let needsSort = false;
        for (let i = this._rowMap.length - 1; i >= 0; i--) {
          if (this._rowMap[i].card.equals(subject)) {
            this._rowMap[i]._getTextCache = {};
            needsSort = true;
          }
        }
        if (needsSort) {
          this.sortBy(this.sortColumn, this.sortDirection, true);
        }
        break;
      }

      case "addrbook-list-member-removed":
        if (!this.directory) {
          break;
        }
      // Falls through.
      case "addrbook-contact-deleted":
        for (let i = this._rowMap.length - 1; i >= 0; i--) {
          if (this._rowMap[i].card.equals(subject)) {
            this._rowMap.splice(i, 1);
            if (this.tree) {
              this.tree.rowCountChanged(i, -1);
            }
          }
        }
        if (this.listener) {
          this.listener.onCountChanged(this.rowCount);
        }
        break;
    }
  },
};

function abViewCard(card) {
  this.card = card;
  this._getTextCache = {};
}
abViewCard.prototype = {
  _getText(columnID) {
    try {
      switch (columnID) {
        case "addrbook": {
          let { directoryId } = this.card;
          return directoryId.substring(directoryId.indexOf("&") + 1);
        }
        case "GeneratedName":
          return this.card.generateName(
            Services.prefs.getIntPref("mail.addr_book.lastnamefirst", 0)
          );
        case "_PhoneticName":
          return this.card.generatePhoneticName(true);
        case "ChatName":
          return this.card.isMailList ? "" : this.card.generateChatName();
        default:
          return this.card.isMailList
            ? ""
            : this.card.getPropertyAsAString(columnID);
      }
    } catch (ex) {
      return "";
    }
  },
  getText(columnID) {
    if (!(columnID in this._getTextCache)) {
      this._getTextCache[columnID] = this._getText(columnID);
    }
    return this._getTextCache[columnID];
  },
  get id() {
    return this.card.UID;
  },
  get open() {
    return false;
  },
  get level() {
    return 0;
  },
  get children() {
    return [];
  },
  getProperties() {
    return this.card.isMailList ? "MailList" : "";
  },
};
