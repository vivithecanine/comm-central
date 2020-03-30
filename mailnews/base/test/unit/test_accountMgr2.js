/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This tests various methods and attributes on nsIMsgAccountManager.
 */
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

const { fixIterator } = ChromeUtils.import(
  "resource:///modules/iteratorUtils.jsm"
);

add_task(async function() {
  let mgr = MailServices.accounts;

  // Create a couple of test accounts.
  let acc1 = mgr.createAccount();
  acc1.incomingServer = mgr.createIncomingServer(
    "bob_imap",
    "imap.example.com",
    "imap"
  );
  let id1 = mgr.createIdentity();
  id1.email = "bob_imap@example.com";
  acc1.addIdentity(id1);

  let acc2 = mgr.createAccount();
  acc2.incomingServer = mgr.createIncomingServer(
    "bob_pop3",
    "pop3.example.com",
    "pop3"
  );
  let id2 = mgr.createIdentity();
  id2.email = "bob_pop3@example.com";
  acc2.addIdentity(id2);

  // Add an identity shared by both accounts.
  let id3 = mgr.createIdentity();
  id3.email = "bob_common@example.com";
  acc1.addIdentity(id3);
  acc2.addIdentity(id3);

  // The special "Local Folders" account and server (server type is "none").
  mgr.createLocalMailAccount();

  // Setup done. Now check that things are as we expect.

  let allServers = [...fixIterator(mgr.allServers, Ci.nsIMsgIncomingServer)];

  // At this point we should have 3 accounts and servers (imap, pop, local).
  Assert.equal(mgr.accounts.length, 3);
  Assert.equal(allServers.length, 3);

  // The identities we explicitly created.
  Assert.equal(mgr.allIdentities.length, 3);
});
