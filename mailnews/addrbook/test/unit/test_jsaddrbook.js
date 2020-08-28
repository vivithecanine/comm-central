/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var FILE_NAME = "abook-1.sqlite";
var SCHEME = "jsaddrbook";

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);

var book, contact, list, listCard;
var observer = {
  topics: [
    "addrbook-directory-created",
    "addrbook-directory-updated",
    "addrbook-directory-deleted",
    "addrbook-contact-created",
    "addrbook-contact-updated",
    "addrbook-contact-deleted",
    "addrbook-list-created",
    "addrbook-list-updated",
    "addrbook-list-deleted",
    "addrbook-list-member-added",
    "addrbook-list-member-removed",
  ],
  setUp() {
    for (let topic of this.topics) {
      Services.obs.addObserver(observer, topic);
    }
  },
  cleanUp() {
    for (let topic of this.topics) {
      Services.obs.removeObserver(observer, topic);
    }
  },

  events: [],
  observe(subject, topic, data) {
    this.events.push([topic, subject, data]);
  },
  checkEvents(...events) {
    info(
      "Actual events: " +
        JSON.stringify(
          observer.events.map(e =>
            e.map(a => {
              if (a instanceof Ci.nsIAbDirectory) {
                return `[nsIAbDirectory]`;
              }
              if (a instanceof Ci.nsIAbCard) {
                return `[nsIAbCard]`;
              }
              return a;
            })
          )
        )
    );
    equal(observer.events.length, events.length);

    for (let expectedEvent of events) {
      let actualEvent = observer.events.shift();

      for (let i = 0; i < expectedEvent.length; i++) {
        try {
          expectedEvent[i].QueryInterface(Ci.nsIAbCard);
          ok(actualEvent[i].equals(expectedEvent[i]));
        } catch (ex) {
          if (expectedEvent[i] instanceof Ci.nsIAbDirectory) {
            equal(actualEvent[i].UID, expectedEvent[i].UID);
          } else if (expectedEvent[i] === null) {
            ok(!actualEvent[i]);
          } else if (expectedEvent[i] !== undefined) {
            equal(actualEvent[i], expectedEvent[i]);
          }
        }
      }
    }
  },
};

var baseAddressBookCount;

add_task(async function setUp() {
  let profileDir = do_get_profile();
  observer.setUp();

  let dirs = MailServices.ab.directories;
  // On Mac we might be loading the OS X Address Book. If we are, then we
  // need to take acccount of that here, so that the test still pass on
  // development machines.
  if (
    AppConstants.platform == "macosx" &&
    dirs[0].URI == "moz-abosxdirectory:///"
  ) {
    equal(dirs.length, 3);
    equal(dirs[1].fileName, kPABData.fileName);
    equal(dirs[2].fileName, kCABData.fileName);
  } else {
    equal(dirs.length, 2);
    equal(dirs[0].fileName, kPABData.fileName);
    equal(dirs[1].fileName, kCABData.fileName);
  }
  // Also record the address book counts so that we get the expected counts
  // correct further down in the test.
  baseAddressBookCount = dirs.length;

  // Check the PAB file was created.
  let pabFile = profileDir.clone();
  pabFile.append(kPABData.fileName);
  ok(pabFile.exists());

  // Check the CAB file was created.
  let cabFile = profileDir.clone();
  cabFile.append(kCABData.fileName);
  ok(cabFile.exists());
});

add_task(async function createAddressBook() {
  let dirPrefId = MailServices.ab.newAddressBook(
    "new book",
    "",
    Ci.nsIAbManager.JS_DIRECTORY_TYPE
  );
  book = MailServices.ab.getDirectoryFromId(dirPrefId);
  observer.checkEvents(["addrbook-directory-created", book]);

  // Check nsIAbDirectory properties.
  equal(book.uuid, "ldap_2.servers.newbook&new book");
  ok(!book.readOnly);
  ok(!book.isRemote);
  ok(!book.isSecure);
  equal(book.dirName, "new book");
  equal(book.dirType, Ci.nsIAbManager.JS_DIRECTORY_TYPE);
  equal(book.fileName, FILE_NAME);
  equal(book.UID.length, 36);
  equal(book.URI, `${SCHEME}://${FILE_NAME}`);
  equal(book.isMailList, false);
  equal(book.supportsMailingLists, true);
  equal(book.dirPrefId, "ldap_2.servers.newbook");

  // Check enumerations.
  equal(Array.from(book.childNodes).length, 0);
  equal(Array.from(book.childCards).length, 0);

  // Check prefs.
  equal(
    Services.prefs.getStringPref("ldap_2.servers.newbook.description"),
    "new book"
  );
  equal(
    Services.prefs.getIntPref("ldap_2.servers.newbook.dirType"),
    Ci.nsIAbManager.JS_DIRECTORY_TYPE
  );
  equal(
    Services.prefs.getStringPref("ldap_2.servers.newbook.filename"),
    FILE_NAME
  );
  equal(Services.prefs.getStringPref("ldap_2.servers.newbook.uid"), book.UID);
  equal(MailServices.ab.directories.length, baseAddressBookCount + 1);

  // Check the file was created.
  let dbFile = Services.dirsvc.get("ProfD", Ci.nsIFile);
  dbFile.append(FILE_NAME);
  ok(dbFile.exists());
});

add_task(async function editAddressBook() {
  book.dirName = "updated book";
  observer.checkEvents(["addrbook-directory-updated", book, "DirName"]);
  equal(book.dirName, "updated book");
  equal(
    Services.prefs.getStringPref("ldap_2.servers.newbook.description"),
    "updated book"
  );
});

add_task(async function createContact() {
  contact = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
    Ci.nsIAbCard
  );
  contact.displayName = "a new contact";
  contact.firstName = "new";
  contact.lastName = "contact";
  contact.primaryEmail = "test@invalid";
  contact = book.addCard(contact);
  observer.checkEvents(["addrbook-contact-created", contact, book.UID]);

  // Check enumerations.
  let childCards = Array.from(book.childCards, cc =>
    cc.QueryInterface(Ci.nsIAbCard)
  );
  equal(childCards.length, 1);
  ok(childCards[0].equals(contact));

  // Check nsIAbCard properties.
  equal(contact.directoryId, book.uuid);
  equal(contact.UID.length, 36);
  equal(contact.firstName, "new");
  equal(contact.lastName, "contact");
  equal(contact.displayName, "a new contact");
  equal(contact.primaryEmail, "test@invalid");
  equal(contact.isMailList, false);
  let modifiedDate = parseInt(contact.getProperty("LastModifiedDate", ""), 10);
  Assert.lessOrEqual(modifiedDate, Date.now() / 1000);
  Assert.greater(modifiedDate, Date.now() / 1000 - 10);

  // Check nsIAbCard methods.
  equal(
    contact.generateName(Ci.nsIAbCard.GENERATE_DISPLAY_NAME),
    "a new contact"
  );
  equal(
    contact.generateName(Ci.nsIAbCard.GENERATE_LAST_FIRST_ORDER),
    "contact, new"
  );
  equal(
    contact.generateName(Ci.nsIAbCard.GENERATE_FIRST_LAST_ORDER),
    "new contact"
  );
});

add_task(async function editContact() {
  contact.firstName = "updated";
  contact.lastName = "contact";
  contact.setProperty("LastModifiedDate", 0);
  book.modifyCard(contact);
  observer.checkEvents(["addrbook-contact-updated", contact, book.UID]);
  equal(contact.firstName, "updated");
  equal(contact.lastName, "contact");
  let modifiedDate = parseInt(contact.getProperty("LastModifiedDate", ""), 10);
  Assert.lessOrEqual(modifiedDate, Date.now() / 1000);
  Assert.greater(modifiedDate, Date.now() / 1000 - 10);
});

add_task(async function createMailingList() {
  list = Cc["@mozilla.org/addressbook/directoryproperty;1"].createInstance(
    Ci.nsIAbDirectory
  );
  list.isMailList = true;
  list.dirName = "new list";
  list = book.addMailList(list);
  // Skip checking events temporarily, until listCard is defined.

  // Check enumerations.
  let childNodes = Array.from(book.childNodes, cn =>
    cn.QueryInterface(Ci.nsIAbDirectory)
  );
  equal(childNodes.length, 1);
  equal(childNodes[0].UID, list.UID); // TODO Object equality doesn't work because of XPCOM.
  let childCards = Array.from(book.childCards, cc =>
    cc.QueryInterface(Ci.nsIAbCard)
  );
  equal(childCards.length, 2);
  if (childCards[0].isMailList) {
    listCard = childCards[0];
    ok(childCards[1].equals(contact));
  } else {
    ok(childCards[0].equals(contact));
    listCard = childCards[1];
  }
  equal(listCard.UID, list.UID);

  observer.checkEvents(["addrbook-list-created", list, book.UID]);

  // Check nsIAbDirectory properties.
  equal(list.dirName, "new list");
  equal(list.UID.length, 36);
  equal(list.URI, `${SCHEME}://${FILE_NAME}/${list.UID}`);
  equal(list.isMailList, true);
  equal(list.supportsMailingLists, false);

  // Check list enumerations.
  equal(Array.from(list.childNodes).length, 0);
  equal(Array.from(list.childCards).length, 0);

  // Check nsIAbCard properties.
  equal(listCard.firstName, "");
  equal(listCard.lastName, "new list");
  equal(listCard.primaryEmail, "");
  equal(listCard.displayName, "new list");
});

add_task(async function editMailingList() {
  list.dirName = "updated list";
  list.editMailListToDatabase(null);
  observer.checkEvents(["addrbook-list-updated", list, book.UID]);
  equal("updated list", list.dirName);
});

add_task(async function addMailingListMember() {
  list.addCard(contact);
  observer.checkEvents(["addrbook-list-member-added", contact, list.UID]);

  // Check list enumerations.
  equal(Array.from(list.childNodes).length, 0);
  let childCards = Array.from(list.childCards, cc =>
    cc.QueryInterface(Ci.nsIAbCard)
  );
  equal(childCards.length, 1);
  ok(childCards[0].equals(contact));
});

add_task(async function removeMailingListMember() {
  list.deleteCards([contact]);
  observer.checkEvents(["addrbook-list-member-removed", contact, list.UID]);

  // Check list enumerations.
  equal(Array.from(list.childNodes).length, 0);
  equal(Array.from(list.childCards).length, 0);
});

add_task(async function deleteMailingList() {
  book.deleteDirectory(list);
  observer.checkEvents(["addrbook-list-deleted", list, book.UID]);
});

add_task(async function deleteContact() {
  book.deleteCards([contact]);
  observer.checkEvents(["addrbook-contact-deleted", contact, book.UID]);

  // Check enumerations.
  equal(Array.from(book.childNodes).length, 0);
  equal(Array.from(book.childCards).length, 0);
});

// Tests that the UID on a new contact can be set.
add_task(async function createContactWithUID() {
  let contactWithUID = Cc[
    "@mozilla.org/addressbook/cardproperty;1"
  ].createInstance(Ci.nsIAbCard);
  contactWithUID.UID = "I'm a UID!";
  contactWithUID = book.addCard(contactWithUID);
  equal("I'm a UID!", contactWithUID.UID, "New contact has the UID we set");

  Assert.throws(() => {
    // Set the UID after it already exists.
    contactWithUID.UID = "This should not be possible";
  }, /NS_ERROR_FAILURE/);

  // Setting the UID to it's existing value should not fail.
  contactWithUID.UID = contactWithUID.UID; // eslint-disable-line no-self-assign

  book.deleteCards([contactWithUID]);
  observer.events.length = 0;
});

add_task(async function deleteAddressBook() {
  let deletePromise = promiseDirectoryRemoved();
  MailServices.ab.deleteAddressBook(book.URI);
  await deletePromise;

  observer.checkEvents(["addrbook-directory-deleted", book, null]);
  ok(!Services.prefs.prefHasUserValue("ldap_2.servers.newbook.dirType"));
  ok(!Services.prefs.prefHasUserValue("ldap_2.servers.newbook.description"));
  ok(!Services.prefs.prefHasUserValue("ldap_2.servers.newbook.filename"));
  ok(!Services.prefs.prefHasUserValue("ldap_2.servers.newbook.uid"));
  let dbFile = Services.dirsvc.get("ProfD", Ci.nsIFile);
  dbFile.append(FILE_NAME);
  ok(!dbFile.exists());
  equal(MailServices.ab.directories.length, baseAddressBookCount);
  Assert.throws(() => {
    MailServices.ab.getDirectory(`${SCHEME}://${FILE_NAME}`);
  }, /NS_ERROR_FAILURE/);
});

add_task(async function cleanUp() {
  observer.checkEvents();
  observer.cleanUp();
});
