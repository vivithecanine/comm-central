/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This tests various methods and attributes on nsIMsgAccountManager.
 */
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

add_task(async function () {
  // Create a couple of test accounts.
  const acc1 = MailServices.accounts.createAccount();
  acc1.incomingServer = MailServices.accounts.createIncomingServer(
    "bob_imap",
    "imap.example.com",
    "imap"
  );
  const id1 = MailServices.accounts.createIdentity();
  id1.email = "bob_imap@example.com";
  acc1.addIdentity(id1);

  const acc2 = MailServices.accounts.createAccount();
  acc2.incomingServer = MailServices.accounts.createIncomingServer(
    "bob_pop3",
    "pop3.EXAMPLE.com.",
    "pop3"
  );
  const id2 = MailServices.accounts.createIdentity();
  id2.email = "bob_pop3@example.com";
  acc2.addIdentity(id2);

  // Add an identity shared by both accounts.
  const id3 = MailServices.accounts.createIdentity();
  id3.email = "bob_common@example.com";
  acc1.addIdentity(id3);
  acc2.addIdentity(id3);

  // The special "Local Folders" account and server (server type is "none").
  MailServices.accounts.createLocalMailAccount();

  // Setup done. Now check that things are as we expect.

  // At this point we should have 3 accounts and servers (imap, pop, local).
  Assert.equal(MailServices.accounts.accounts.length, 3);
  Assert.equal(MailServices.accounts.allServers.length, 3);

  // The identities we explicitly created.
  Assert.equal(MailServices.accounts.allIdentities.length, 3);

  // Check we find the right number of identities associated with each server.
  Assert.equal(
    MailServices.accounts.getIdentitiesForServer(acc1.incomingServer).length,
    2
  );
  Assert.equal(
    MailServices.accounts.getIdentitiesForServer(acc2.incomingServer).length,
    2
  );
  Assert.equal(
    MailServices.accounts.getIdentitiesForServer(
      MailServices.accounts.localFoldersServer
    ).length,
    0
  );

  // id1 and id2 are on separate accounts (and servers).
  Assert.equal(MailServices.accounts.getServersForIdentity(id1).length, 1);
  Assert.equal(MailServices.accounts.getServersForIdentity(id2).length, 1);
  // id3 is shared.
  Assert.equal(MailServices.accounts.getServersForIdentity(id3).length, 2);

  // Does allFolders return the default folders we'd expect?
  // IMAP has Inbox only.
  // POP3 and local accounts both have Inbox and Trash.
  Assert.equal(MailServices.accounts.allFolders.length, 1 + 2 + 2);

  // Let's ditch the IMAP account.
  MailServices.accounts.removeAccount(acc1);

  Assert.equal(MailServices.accounts.accounts.length, 2);
  Assert.equal(MailServices.accounts.allServers.length, 2);

  // It should have taken the imap-specific identity with it.
  Assert.equal(MailServices.accounts.allIdentities.length, 2);

  // Test a special hostname.
  const acc4 = MailServices.accounts.createAccount();
  acc4.incomingServer = MailServices.accounts.createIncomingServer(
    "bob_unavail",
    "0.0.0.0.", // Note ending dot which would not do anything for an IP.
    "pop3"
  );
  const id4 = MailServices.accounts.createIdentity();
  id4.email = "bob_unavail@example.com";
  acc4.addIdentity(id4);

  Assert.equal(
    MailServices.accounts.accounts.length,
    3,
    "acc4 should be in accounts"
  );

  // Test that an account with empty server hostname doesn't even get listed.
  const serverKey = acc4.incomingServer.key;
  Services.prefs.setStringPref(`mail.server.${serverKey}.hostname`, "");
  MailServices.accounts.unloadAccounts();
  MailServices.accounts.loadAccounts();
  Assert.equal(
    MailServices.accounts.accounts.length,
    2,
    "invalid acc4 should have been removed"
  );
  Assert.equal(
    Services.prefs.getCharPref("mail.accountmanager.accounts"),
    "account2,account3"
  );
});
