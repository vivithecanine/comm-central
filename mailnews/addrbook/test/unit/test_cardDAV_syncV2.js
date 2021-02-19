/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

async function subtest() {
  // Put some cards on the server.
  CardDAVServer.putCardInternal(
    "keep-me.vcf",
    "BEGIN:VCARD\r\nUID:keep-me\r\nFN:I'm going to stay.\r\nEND:VCARD\r\n"
  );
  CardDAVServer.putCardInternal(
    "change-me.vcf",
    "BEGIN:VCARD\r\nUID:change-me\r\nFN:I'm going to be changed.\r\nEND:VCARD\r\n"
  );
  CardDAVServer.putCardInternal(
    "delete-me.vcf",
    "BEGIN:VCARD\r\nUID:delete-me\r\nFN:I'm going to be deleted.\r\nEND:VCARD\r\n"
  );

  let directory = initDirectory();

  // We'll only use this for the initial sync, so I think it's okay to use
  // _bulkAddCards and not get a notification for every contact.
  info("Initial sync with server.");
  await directory.fetchAllFromServer();

  let lastSyncToken = directory._syncToken;
  info(`Token is: ${lastSyncToken}`);

  info("Cards:");
  let cardMap = new Map();
  let oldETags = new Map();
  for (let card of directory.childCards) {
    info(card.displayName);
    info(card.getProperty("_href", ""));
    info(card.getProperty("_etag", ""));

    cardMap.set(card.UID, card);
    oldETags.set(card.UID, card.getProperty("_etag", ""));
  }

  Assert.equal(cardMap.size, 3);
  Assert.deepEqual([...cardMap.keys()].sort(), [
    "change-me",
    "delete-me",
    "keep-me",
  ]);
  Assert.equal(
    cardMap.get("change-me").displayName,
    "I'm going to be changed."
  );

  // Make some changes on the server.

  CardDAVServer.putCardInternal(
    "change-me.vcf",
    "BEGIN:VCARD\r\nUID:change-me\r\nFN:I've been changed.\r\nEND:VCARD\r\n"
  );
  CardDAVServer.deleteCardInternal("delete-me.vcf");
  CardDAVServer.putCardInternal(
    "new.vcf",
    "BEGIN:VCARD\r\nUID:new\r\nFN:I'm new!\r\nEND:VCARD\r\n"
  );

  // Sync with the server.

  info("Second sync with server.");

  observer.init();
  await directory.updateAllFromServerV2();
  Assert.notEqual(directory._syncToken, lastSyncToken);
  lastSyncToken = directory._syncToken;
  observer.checkAndClearNotifications({
    "addrbook-contact-created": ["new"],
    "addrbook-contact-updated": ["change-me"],
    "addrbook-contact-deleted": ["delete-me"],
  });

  info("Cards:");
  cardMap.clear();
  for (let card of directory.childCards) {
    info(card.displayName);
    info(card.getProperty("_href", ""));
    info(card.getProperty("_etag", ""));

    cardMap.set(card.UID, card);
  }

  Assert.equal(cardMap.size, 3);
  Assert.deepEqual([...cardMap.keys()].sort(), ["change-me", "keep-me", "new"]);

  Assert.equal(
    cardMap.get("keep-me").getProperty("_etag", ""),
    oldETags.get("keep-me")
  );

  Assert.equal(cardMap.get("change-me").displayName, "I've been changed.");
  Assert.notEqual(
    cardMap.get("change-me").getProperty("_etag", ""),
    oldETags.get("change-me")
  );
  oldETags.set("change-me", cardMap.get("change-me").getProperty("_etag", ""));

  Assert.equal(cardMap.get("new").displayName, "I'm new!");
  oldETags.set("new", cardMap.get("new").getProperty("_etag", ""));

  oldETags.delete("delete-me");

  // Double-check that what we have matches what's on the server.

  await checkCardsOnServer({
    "change-me": {
      etag: cardMap.get("change-me").getProperty("_etag", ""),
      href: cardMap.get("change-me").getProperty("_href", ""),
      vCard: cardMap.get("change-me").getProperty("_vCard", ""),
    },
    "keep-me": {
      etag: cardMap.get("keep-me").getProperty("_etag", ""),
      href: cardMap.get("keep-me").getProperty("_href", ""),
      vCard: cardMap.get("keep-me").getProperty("_vCard", ""),
    },
    new: {
      etag: cardMap.get("new").getProperty("_etag", ""),
      href: cardMap.get("new").getProperty("_href", ""),
      vCard: cardMap.get("new").getProperty("_vCard", ""),
    },
  });

  info("Third sync with server. No changes expected.");

  await directory.updateAllFromServerV2();
  // This time the token should NOT change, there's been no contact with the
  // server since last time.
  Assert.equal(directory._syncToken, lastSyncToken);
  lastSyncToken = directory._syncToken;

  observer.checkAndClearNotifications({
    "addrbook-contact-created": [],
    "addrbook-contact-updated": [],
    "addrbook-contact-deleted": [],
  });

  // Delete a card on the client.

  info("Deleting a card on the client.");

  try {
    directory.deleteCards([cardMap.get("new")]);
    Assert.ok(!directory.readOnly, "read-only directory should throw.");
    observer.checkAndClearNotifications({
      "addrbook-contact-created": [],
      "addrbook-contact-updated": [],
      "addrbook-contact-deleted": ["new"],
    });

    await checkCardsOnServer({
      "change-me": {
        etag: cardMap.get("change-me").getProperty("_etag", ""),
        href: cardMap.get("change-me").getProperty("_href", ""),
        vCard: cardMap.get("change-me").getProperty("_vCard", ""),
      },
      "keep-me": {
        etag: cardMap.get("keep-me").getProperty("_etag", ""),
        href: cardMap.get("keep-me").getProperty("_href", ""),
        vCard: cardMap.get("keep-me").getProperty("_vCard", ""),
      },
    });
  } catch (ex) {
    Assert.ok(directory.readOnly, "read-write directory should not throw");
  }

  // Change a card on the client.

  info("Changing a card on the client.");

  try {
    let changeMeCard = cardMap.get("change-me");
    changeMeCard.displayName = "I've been changed again!";
    directory.modifyCard(changeMeCard);
    Assert.ok(!directory.readOnly, "read-only directory should throw.");

    Assert.equal(
      await observer.waitFor("addrbook-contact-updated"),
      "change-me"
    );

    await checkCardsOnServer({
      "change-me": {
        etag: changeMeCard.getProperty("_etag", ""),
        href: changeMeCard.getProperty("_href", ""),
        vCard: changeMeCard.getProperty("_vCard", ""),
      },
      "keep-me": {
        etag: cardMap.get("keep-me").getProperty("_etag", ""),
        href: cardMap.get("keep-me").getProperty("_href", ""),
        vCard: cardMap.get("keep-me").getProperty("_vCard", ""),
      },
    });
  } catch (ex) {
    Assert.ok(directory.readOnly, "read-write directory should not throw");
  }

  // Add a new card on the client.

  info("Adding a new card on the client.");

  try {
    let newCard = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
      Ci.nsIAbCard
    );
    newCard.displayName = "I'm another new contact.";
    newCard.UID = "another-new";
    newCard = directory.addCard(newCard);
    Assert.ok(!directory.readOnly, "read-only directory should throw.");
    observer.checkAndClearNotifications({
      "addrbook-contact-created": ["another-new"],
      "addrbook-contact-updated": [],
      "addrbook-contact-deleted": [],
    });

    Assert.equal(
      await observer.waitFor("addrbook-contact-updated"),
      "another-new"
    );

    await checkCardsOnServer({
      "another-new": {
        etag: newCard.getProperty("_etag", ""),
        href: newCard.getProperty("_href", ""),
        vCard: newCard.getProperty("_vCard", ""),
      },
      "change-me": {
        etag: cardMap.get("change-me").getProperty("_etag", ""),
        href: cardMap.get("change-me").getProperty("_href", ""),
        vCard: cardMap.get("change-me").getProperty("_vCard", ""),
      },
      "keep-me": {
        etag: cardMap.get("keep-me").getProperty("_etag", ""),
        href: cardMap.get("keep-me").getProperty("_href", ""),
        vCard: cardMap.get("keep-me").getProperty("_vCard", ""),
      },
    });
  } catch (ex) {
    Assert.ok(directory.readOnly, "read-write directory should not throw");
  }

  info("Fourth sync with server. No changes expected.");

  await directory.updateAllFromServerV2();
  if (directory.readOnly) {
    Assert.equal(directory._syncToken, lastSyncToken);
  } else {
    Assert.notEqual(directory._syncToken, lastSyncToken);
  }

  observer.checkAndClearNotifications({
    "addrbook-contact-created": [],
    "addrbook-contact-updated": [],
    "addrbook-contact-deleted": [],
  });

  await clearDirectory();
}

add_task(async function testNormal() {
  await subtest();
});

add_task(async function testGoogle() {
  CardDAVServer.mimicGoogle = true;
  await subtest();
  CardDAVServer.mimicGoogle = false;
});

add_task(async function testReadOnly() {
  Services.prefs.setBoolPref("ldap_2.servers.carddav.readOnly", true);
  await subtest();
  Services.prefs.clearUserPref("ldap_2.servers.carddav.readOnly");
});
