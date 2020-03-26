/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionTestUtils } = ChromeUtils.import(
  "resource://testing-common/ExtensionXPCShellUtils.jsm"
);
ExtensionTestUtils.init(this);

var imapd = ChromeUtils.import("resource://testing-common/mailnews/Imapd.jsm");
var { nsMailServer } = ChromeUtils.import(
  "resource://testing-common/mailnews/Maild.jsm"
);
var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

add_task(async function test_accounts() {
  let extension = ExtensionTestUtils.loadExtension({
    async background() {
      function awaitMessage(messageToSend) {
        return new Promise(resolve => {
          browser.test.onMessage.addListener(function listener(...args) {
            browser.test.onMessage.removeListener(listener);
            resolve(args);
          });
          if (messageToSend) {
            browser.test.sendMessage(messageToSend);
          }
        });
      }

      function assertDeepEqual(expected, actual) {
        if (Array.isArray(expected)) {
          browser.test.assertTrue(Array.isArray(actual));
          browser.test.assertEq(expected.length, actual.length);
          for (let i = 0; i < expected.length; i++) {
            assertDeepEqual(expected[i], actual[i]);
          }
          return;
        }

        let expectedKeys = Object.keys(expected);
        let actualKeys = Object.keys(actual);
        // Ignore any extra keys on the actual object.
        browser.test.assertTrue(expectedKeys.length <= actualKeys.length);

        for (let key of expectedKeys) {
          browser.test.assertTrue(
            actualKeys.includes(key),
            `Key ${key} exists`
          );
          if (expected[key] === null) {
            browser.test.assertTrue(actual[key] === null);
            continue;
          }
          if (["array", "object"].includes(typeof expected[key])) {
            assertDeepEqual(expected[key], actual[key]);
            continue;
          }
          browser.test.assertEq(expected[key], actual[key]);
        }
      }

      let [account1Id] = await awaitMessage();
      let result1 = await browser.accounts.list();
      browser.test.assertEq(1, result1.length);
      assertDeepEqual(
        {
          id: account1Id,
          name: "Local Folders",
          type: "none",
          folders: [
            {
              accountId: account1Id,
              name: "Trash",
              path: "/Trash",
              type: "trash",
            },
            {
              accountId: account1Id,
              name: "Outbox",
              path: "/Unsent Messages",
              type: "outbox",
            },
          ],
        },
        result1[0]
      );

      let [account2Id] = await awaitMessage("create account 2");
      let result2 = await browser.accounts.list();
      browser.test.assertEq(2, result2.length);
      assertDeepEqual(result1[0], result2[0]);
      assertDeepEqual(
        {
          id: account2Id,
          name: "Mail for xpcshell@localhost",
          type: "imap",
          folders: [
            {
              accountId: account2Id,
              name: "Inbox",
              path: "/INBOX",
              type: "inbox",
            },
          ],
        },
        result2[1]
      );

      let result3 = await browser.accounts.get(account1Id);
      assertDeepEqual(result1[0], result3);
      let result4 = await browser.accounts.get(account2Id);
      assertDeepEqual(result2[1], result4);

      await awaitMessage("create folders");
      let result5 = await browser.accounts.get(account1Id);
      let platformInfo = await browser.runtime.getPlatformInfo();
      assertDeepEqual(
        [
          {
            accountId: account1Id,
            name: "Trash",
            path: "/Trash",
            subFolders: [
              {
                accountId: account1Id,
                name: "foo 'bar'(!)",
                path: "/Trash/foo 'bar'(!)",
              },
              {
                accountId: account1Id,
                name: "Ϟ",
                // This character is not supported on Windows, so it gets hashed,
                // by NS_MsgHashIfNecessary.
                path: platformInfo.os == "win" ? "/Trash/b52bc214" : "/Trash/Ϟ",
              },
            ],
            type: "trash",
          },
          {
            accountId: account1Id,
            name: "Outbox",
            path: "/Unsent Messages",
            type: "outbox",
          },
        ],
        result5.folders
      );

      // Check we can access the folders through folderPathToURI.
      for (let folder of result5.folders) {
        await browser.messages.list(folder);
      }

      let result6 = await browser.accounts.get(account2Id);
      assertDeepEqual(
        [
          {
            accountId: account2Id,
            name: "Inbox",
            path: "/INBOX",
            subFolders: [
              {
                accountId: account2Id,
                name: "foo 'bar'(!)",
                path: "/INBOX/foo 'bar'(!)",
              },
              {
                accountId: account2Id,
                name: "Ϟ",
                path: "/INBOX/&A94-",
              },
            ],
            type: "inbox",
          },
          {
            // The trash folder magically appears at this point.
            // It wasn't here before.
            accountId: "account2",
            name: "Trash",
            path: "/Trash",
            type: "trash",
          },
        ],
        result6.folders
      );

      // Check we can access the folders through folderPathToURI.
      for (let folder of result6.folders) {
        await browser.messages.list(folder);
      }

      browser.test.notifyPass("finished");
    },
    manifest: {
      permissions: ["accountsRead", "messagesRead"],
    },
  });

  let daemon = new imapd.imapDaemon();
  let server = new nsMailServer(function createHandler(d) {
    return new imapd.IMAP_RFC3501_handler(d);
  }, daemon);
  server.start();

  let account1 = createAccount();

  await extension.startup();
  extension.sendMessage(account1.key);

  await extension.awaitMessage("create account 2");
  let account2 = MailServices.accounts.createAccount();
  addIdentity(account2);
  let iServer = MailServices.accounts.createIncomingServer(
    "user",
    "localhost",
    "imap"
  );
  iServer.port = server.port;
  iServer.username = "user";
  iServer.password = "password";
  account2.incomingServer = iServer;

  extension.sendMessage(account2.key);

  await extension.awaitMessage("create folders");
  let inbox1 = [...account1.incomingServer.rootFolder.subFolders][0];
  // Test our code can handle characters that might be escaped.
  inbox1.createSubfolder("foo 'bar'(!)", null);
  inbox1.createSubfolder("Ϟ", null); // Test our code can handle unicode.

  let inbox2 = [...account2.incomingServer.rootFolder.subFolders][0];
  inbox2.QueryInterface(Ci.nsIMsgImapMailFolder).hierarchyDelimiter = "/";
  // Test our code can handle characters that might be escaped.
  inbox2.createSubfolder("foo 'bar'(!)", null);
  await PromiseTestUtils.promiseFolderAdded("foo 'bar'(!)");
  inbox2.createSubfolder("Ϟ", null); // Test our code can handle unicode.
  await PromiseTestUtils.promiseFolderAdded("Ϟ");

  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();

  cleanUpAccount(account1);
  cleanUpAccount(account2);
});

add_task(async function test_identities() {
  let account = createAccount();
  let identity0 = addIdentity(account, "id0@invalid");
  let identity1 = addIdentity(account, "id1@invalid");
  let identity2 = addIdentity(account, "id2@invalid");
  identity2.label = "A label";
  identity2.fullName = "Identity 2!";
  identity2.organization = "Dis Organization";
  identity2.replyTo = "reply@invalid";

  equal(account.defaultIdentity.key, identity0.key);

  let extension = ExtensionTestUtils.loadExtension({
    async background() {
      let accounts = await browser.accounts.list();
      browser.test.assertEq(1, accounts.length);

      const [{ id: accountId, identities }] = accounts;
      const identityIds = identities.map(i => i.id);
      browser.test.assertEq(3, identities.length);

      browser.test.assertEq(accountId, identities[0].accountId);
      browser.test.assertEq("id0@invalid", identities[0].email);
      browser.test.assertEq(accountId, identities[1].accountId);
      browser.test.assertEq("id1@invalid", identities[1].email);
      browser.test.assertEq(accountId, identities[2].accountId);
      browser.test.assertEq("id2@invalid", identities[2].email);
      browser.test.assertEq("A label", identities[2].label);
      browser.test.assertEq("Identity 2!", identities[2].name);
      browser.test.assertEq("Dis Organization", identities[2].organization);
      browser.test.assertEq("reply@invalid", identities[2].replyTo);

      await browser.accounts.setDefaultIdentity(accountId, identityIds[2]);

      let { identities: newIdentities } = await browser.accounts.get(accountId);
      browser.test.assertEq(3, newIdentities.length);
      browser.test.assertEq(identityIds[2], newIdentities[0].id);
      browser.test.assertEq(identityIds[0], newIdentities[1].id);
      browser.test.assertEq(identityIds[1], newIdentities[2].id);

      await browser.accounts.setDefaultIdentity(accountId, identityIds[1]);

      ({ identities: newIdentities } = await browser.accounts.get(accountId));
      browser.test.assertEq(3, newIdentities.length);
      browser.test.assertEq(identityIds[1], newIdentities[0].id);
      browser.test.assertEq(identityIds[2], newIdentities[1].id);
      browser.test.assertEq(identityIds[0], newIdentities[2].id);

      browser.test.notifyPass("finished");
    },
    manifest: {
      permissions: ["accountsRead"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();

  equal(account.defaultIdentity.key, identity1.key);

  cleanUpAccount(account);
});
