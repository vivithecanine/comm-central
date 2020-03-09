/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { toXPCOMArray } = ChromeUtils.import(
  "resource:///modules/iteratorUtils.jsm"
);
var { ExtensionTestUtils } = ChromeUtils.import(
  "resource://testing-common/ExtensionXPCShellUtils.jsm"
);
ExtensionTestUtils.init(this);

var { Gloda } = ChromeUtils.import("resource:///modules/gloda/GlodaPublic.jsm");
var { GlodaIndexer } = ChromeUtils.import(
  "resource:///modules/gloda/GlodaIndexer.jsm"
);

// Create some folders and populate them.
let account, rootFolder;
let subFolders = {};
add_task(async function setup() {
  GlodaIndexer._INDEX_INTERVAL = 0;

  account = createAccount();
  rootFolder = account.incomingServer.rootFolder;
  rootFolder.createSubfolder("test1", null);
  rootFolder.createSubfolder("test2", null);
  for (let folder of rootFolder.subFolders) {
    subFolders[folder.name] = folder;
  }
  createMessages(subFolders.test1, 9);
  createMessages(subFolders.test2, 9);

  let messages = [...subFolders.test1.messages];
  // NB: Here, the messages are zero-indexed. In the test they're one-indexed.
  messages[0].markRead(true);
  messages[1].markFlagged(true);
  messages[6].markFlagged(true);

  subFolders.test1.addKeywordsToMessages(
    toXPCOMArray(messages.slice(0, 1), Ci.nsIMutableArray),
    "notATag"
  );
  subFolders.test1.addKeywordsToMessages(
    toXPCOMArray(messages.slice(2, 4), Ci.nsIMutableArray),
    "$label2"
  );
  subFolders.test1.addKeywordsToMessages(
    toXPCOMArray(messages.slice(3, 6), Ci.nsIMutableArray),
    "$label3"
  );

  addIdentity(account, messages[5].author.replace(/.*<(.*)>/, "$1"));
  addIdentity(account, messages[2].recipients.replace(/.*<(.*)>/, "$1"));
  Gloda._initMyIdentities();

  // Wait for Gloda to re-index the added messages.
  await new Promise(resolve => {
    let waiting = false;
    GlodaIndexer.addListener(function indexListener(status) {
      if (status == Gloda.kIndexerIdle && !GlodaIndexer.indexing && waiting) {
        GlodaIndexer.removeListener(indexListener);
        resolve();
      }
    });
    waiting = true;
  });

  registerCleanupFunction(() => GlodaIndexer._shutdown());
});

add_task(async function() {
  let extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      let [accountId] = await new Promise(resolve => {
        browser.test.onMessage.addListener(function listener(...args) {
          browser.test.onMessage.removeListener(listener);
          resolve(args);
        });
      });

      // Check all messages are returned.
      let { messages } = await browser.messages.query({});
      browser.test.assertEq(18, messages.length);

      let folder = { accountId, path: "/test1" };

      // Query messages from test1. No messages from test2 should be returned.
      // We'll use these messages as a reference for further tests.
      let { messages: referenceMessages } = await browser.messages.query({
        folder,
      });
      browser.test.assertEq(9, referenceMessages.length);
      browser.test.assertTrue(
        referenceMessages.every(m => m.folder.path == "/test1")
      );

      // Dump the reference messages to the console for easier debugging.
      browser.test.log("Reference messages:");
      for (let m of referenceMessages) {
        let date = m.date.toISOString().substring(0, 10);
        let author = m.author.replace(/"(.*)".*/, "$1").padEnd(16, " ");
        let recipients = m.recipients[0]
          .replace(/(.*) <.*>/, "$1")
          .padEnd(16, " ");
        browser.test.log(
          `[${m.id}] ${date} From: ${author} To: ${recipients} Subject: ${m.subject}`
        );
      }

      let subtest = async function(queryInfo, ...expectedMessageIndices) {
        browser.test.log("Testing " + JSON.stringify(queryInfo));
        queryInfo.folder = folder;
        let { messages: actualMessages } = await browser.messages.query(
          queryInfo
        );

        browser.test.assertEq(
          expectedMessageIndices.length,
          actualMessages.length,
          "Correct number of messages"
        );
        for (let index of expectedMessageIndices) {
          // browser.test.log(`Looking for message ${index}`);
          if (!actualMessages.some(am => am.id == index)) {
            browser.test.fail(`Message ${index} was not returned`);
            browser.test.log(
              "These messages were returned: " + actualMessages.map(am => am.id)
            );
          }
        }
      };

      // Date range query. The messages are 0 days old, 2 days old, 4 days old, etc..
      let today = new Date();
      let date1 = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() - 5
      );
      let date2 = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() - 11
      );
      await subtest({ fromDate: today });
      await subtest({ fromDate: date1 }, 1, 2, 3);
      await subtest({ fromDate: date2 }, 1, 2, 3, 4, 5, 6);
      await subtest({ toDate: date1 }, 4, 5, 6, 7, 8, 9);
      await subtest({ toDate: date2 }, 7, 8, 9);
      await subtest({ fromDate: date1, toDate: date2 });
      await subtest({ fromDate: date2, toDate: date1 }, 4, 5, 6);

      // Unread query. Only message 1 has been read.
      await subtest({ unread: false }, 1);
      await subtest({ unread: true }, 2, 3, 4, 5, 6, 7, 8, 9);

      // Flagged query. Messages 2 and 7 are flagged.
      await subtest({ flagged: true }, 2, 7);
      await subtest({ flagged: false }, 1, 3, 4, 5, 6, 8, 9);

      // Subject query.
      let keyword = referenceMessages[1].subject.split(" ")[1];
      await subtest({ subject: keyword }, 2);
      await subtest({ fullText: keyword }, 2);

      // Author query.
      keyword = referenceMessages[2].author.replace('"', "").split(" ")[0];
      await subtest({ author: keyword }, 3);
      await subtest({ fullText: keyword }, 3);

      // Recipients query.
      keyword = referenceMessages[7].recipients[0].split(" ")[0];
      await subtest({ recipients: keyword }, 8);
      await subtest({ fullText: keyword }, 8);
      await subtest({ body: keyword }, 8);

      // From Me and To Me. These use the identities added to account.
      await subtest({ fromMe: true }, 6);
      await subtest({ toMe: true }, 3);

      // Tags query.
      await subtest({ tags: { mode: "any", tags: { notATag: true } } });
      await subtest({ tags: { mode: "any", tags: { $label2: true } } }, 3, 4);
      await subtest(
        { tags: { mode: "any", tags: { $label3: true } } },
        4,
        5,
        6
      );
      await subtest(
        { tags: { mode: "any", tags: { $label2: true, $label3: true } } },
        3,
        4,
        5,
        6
      );
      await subtest({
        tags: { mode: "all", tags: { $label1: true, $label2: true } },
      });
      await subtest(
        { tags: { mode: "all", tags: { $label2: true, $label3: true } } },
        4
      );

      browser.test.notifyPass("finished");
    },
    manifest: { permissions: ["accountsRead", "messagesRead"] },
  });

  await extension.startup();
  extension.sendMessage(account.key);
  await extension.awaitFinish("finished");
  await extension.unload();
});

registerCleanupFunction(() => {
  // Make sure any open address book database is given a chance to close.
  Services.obs.notifyObservers(null, "quit-application");
});
