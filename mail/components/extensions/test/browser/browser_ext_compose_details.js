/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

addIdentity(createAccount());

add_task(async function testHeaders() {
  let extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      function waitForEvent(eventName) {
        return new Promise(resolve => {
          let listener = window => {
            browser.windows[eventName].removeListener(listener);
            resolve(window);
          };
          browser.windows[eventName].addListener(listener);
        });
      }

      async function checkWindow(expected) {
        let state = await browser.compose.getComposeDetails(createdTab.id);
        for (let field of [
          "to",
          "cc",
          "bcc",
          "replyTo",
          "followupTo",
          "newsgroups",
        ]) {
          if (field in expected) {
            browser.test.assertEq(
              expected[field].length,
              state[field].length,
              `${field} has the right number of values`
            );
            for (let i = 0; i < expected[field].length; i++) {
              browser.test.assertEq(expected[field][i], state[field][i]);
            }
          } else {
            browser.test.assertEq(0, state[field].length, `${field} is empty`);
          }
        }
        if (expected.subject) {
          browser.test.assertEq(
            expected.subject,
            state.subject,
            "subject is correct"
          );
        } else {
          browser.test.assertTrue(!state.subject, "subject is empty");
        }

        await new Promise(resolve => {
          browser.test.onMessage.addListener(function listener() {
            browser.test.onMessage.removeListener(listener);
            resolve();
          });
          browser.test.sendMessage("checkWindow", expected);
        });
      }

      let addressBook = await browser.addressBooks.create({
        name: "Baker Street",
      });
      let contacts = {
        sherlock: await browser.contacts.create(addressBook, {
          DisplayName: "Sherlock Holmes",
          PrimaryEmail: "sherlock@bakerstreet.invalid",
        }),
        john: await browser.contacts.create(addressBook, {
          DisplayName: "John Watson",
          PrimaryEmail: "john@bakerstreet.invalid",
        }),
      };
      let list = await browser.mailingLists.create(addressBook, {
        name: "Holmes and Watson",
        description: "Tenants221B",
      });
      await browser.mailingLists.addMember(list, contacts.sherlock);
      await browser.mailingLists.addMember(list, contacts.john);

      // Start a new message.

      let createdWindowPromise = waitForEvent("onCreated");
      await browser.compose.beginNew();
      let createdWindow = await createdWindowPromise;
      let [createdTab] = await browser.tabs.query({
        windowId: createdWindow.id,
      });

      await checkWindow({});

      let tests = [
        {
          // Single input, string.
          input: { to: "Greg Lestrade <greg@bakerstreet.invalid>" },
          expected: { to: ["Greg Lestrade <greg@bakerstreet.invalid>"] },
        },
        {
          // Empty string. Done here so we have something to clear.
          input: { to: "" },
          expected: {},
        },
        {
          // Single input, array with string.
          input: { to: ["John Watson <john@bakerstreet.invalid>"] },
          expected: { to: ["John Watson <john@bakerstreet.invalid>"] },
        },
        {
          // Empty array. Done here so we have something to clear.
          input: { to: [] },
          expected: {},
        },
        {
          // Single input, array with contact.
          input: { to: [{ id: contacts.sherlock, type: "contact" }] },
          expected: { to: ["Sherlock Holmes <sherlock@bakerstreet.invalid>"] },
        },
        {
          // Null input. This should not clear the field.
          input: { to: null },
          expected: { to: ["Sherlock Holmes <sherlock@bakerstreet.invalid>"] },
        },
        {
          // Single input, array with mailing list.
          input: { to: [{ id: list, type: "mailingList" }] },
          expected: { to: ["Holmes and Watson <Tenants221B>"] },
        },
        {
          // Multiple inputs, string.
          input: {
            to:
              "Molly Hooper <molly@bakerstreet.invalid>, Mrs Hudson <mrs_hudson@bakerstreet.invalid>",
          },
          expected: {
            to: [
              "Molly Hooper <molly@bakerstreet.invalid>",
              "Mrs Hudson <mrs_hudson@bakerstreet.invalid>",
            ],
          },
        },
        {
          // Multiple inputs, array with strings.
          input: {
            to: [
              "Irene Adler <irene@bakerstreet.invalid>",
              "Mary Watson <mary@bakerstreet.invalid>",
            ],
          },
          expected: {
            to: [
              "Irene Adler <irene@bakerstreet.invalid>",
              "Mary Watson <mary@bakerstreet.invalid>",
            ],
          },
        },
        {
          // Multiple inputs, mixed.
          input: {
            to: [
              { id: contacts.sherlock, type: "contact" },
              "Mycroft Holmes <mycroft@bakerstreet.invalid>",
            ],
          },
          expected: {
            to: [
              "Sherlock Holmes <sherlock@bakerstreet.invalid>",
              "Mycroft Holmes <mycroft@bakerstreet.invalid>",
            ],
          },
        },
        {
          // A newsgroup, string.
          input: {
            to: "",
            newsgroups: "invalid.fake.newsgroup",
          },
          expected: {
            newsgroups: ["invalid.fake.newsgroup"],
          },
        },
        {
          // Multiple newsgroups, string.
          input: {
            newsgroups: "invalid.fake.newsgroup, invalid.real.newsgroup",
          },
          expected: {
            newsgroups: ["invalid.fake.newsgroup", "invalid.real.newsgroup"],
          },
        },
        {
          // A newsgroup, array with string.
          input: {
            newsgroups: ["invalid.real.newsgroup"],
          },
          expected: {
            newsgroups: ["invalid.real.newsgroup"],
          },
        },
        {
          // Multiple newsgroup, array with string.
          input: {
            newsgroups: ["invalid.fake.newsgroup", "invalid.real.newsgroup"],
          },
          expected: {
            newsgroups: ["invalid.fake.newsgroup", "invalid.real.newsgroup"],
          },
        },
        {
          // Change the subject.
          input: {
            newsgroups: "",
            subject: "This is a test",
          },
          expected: {
            subject: "This is a test",
          },
        },
        {
          // Clear the subject.
          input: {
            subject: "",
          },
          expected: {},
        },
      ];
      for (let test of tests) {
        browser.test.log(`Checking input: ${JSON.stringify(test.input)}`);
        await browser.compose.setComposeDetails(createdTab.id, test.input);
        await checkWindow(test.expected);
      }

      // Clean up.

      let removedWindowPromise = waitForEvent("onRemoved");
      browser.windows.remove(createdWindow.id);
      await removedWindowPromise;

      await browser.addressBooks.delete(addressBook);
      browser.test.notifyPass("finished");
    },
    manifest: {
      permissions: ["accountsRead", "addressBooks", "compose", "messagesRead"],
    },
  });

  extension.onMessage("checkWindow", async expected => {
    await checkComposeHeaders(expected);
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function testBody() {
  // Open an compose window with HTML body.

  let params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  params.composeFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  params.composeFields.body = "<p>This is some <i>HTML</i> text.</p>";

  let htmlWindowPromise = BrowserTestUtils.domWindowOpened();
  MailServices.compose.OpenComposeWindowWithParams(null, params);
  let htmlWindow = await htmlWindowPromise;
  await BrowserTestUtils.waitForEvent(htmlWindow, "load");

  // Open another compose window with plain text body.

  params = Cc["@mozilla.org/messengercompose/composeparams;1"].createInstance(
    Ci.nsIMsgComposeParams
  );
  params.composeFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  params.format = Ci.nsIMsgCompFormat.PlainText;
  params.composeFields.body = "This is some plain text.";

  let plainTextComposeWindowPromise = BrowserTestUtils.domWindowOpened();
  MailServices.compose.OpenComposeWindowWithParams(null, params);
  let plainTextWindow = await plainTextComposeWindowPromise;
  await BrowserTestUtils.waitForEvent(plainTextWindow, "load");

  // Run the extension.

  let extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      let windows = await browser.windows.getAll({
        populate: true,
        windowTypes: ["messageCompose"],
      });
      let [htmlTabId, plainTextTabId] = windows.map(w => w.tabs[0].id);

      let plainTextBodyTag =
        '<body style="font-family: -moz-fixed; white-space: pre-wrap; width: 72ch;">';

      // Get details, HTML message.

      let htmlDetails = await browser.compose.getComposeDetails(htmlTabId);
      browser.test.log(JSON.stringify(htmlDetails));
      browser.test.assertTrue(!htmlDetails.isPlainText);
      browser.test.assertTrue(
        htmlDetails.body.includes("<p>This is some <i>HTML</i> text.</p>")
      );
      browser.test.assertEq(
        "This is some HTML text.",
        htmlDetails.plainTextBody
      );

      // Set details, HTML message.

      await browser.compose.setComposeDetails(htmlTabId, {
        body: htmlDetails.body.replace("<i>HTML</i>", "<code>HTML</code>"),
      });
      htmlDetails = await browser.compose.getComposeDetails(htmlTabId);
      browser.test.log(JSON.stringify(htmlDetails));
      browser.test.assertTrue(!htmlDetails.isPlainText);
      browser.test.assertTrue(
        htmlDetails.body.includes("<p>This is some <code>HTML</code> text.</p>")
      );
      browser.test.assertTrue(
        "This is some HTML text.",
        htmlDetails.plainTextBody
      );

      // Get details, plain text message.

      let plainTextDetails = await browser.compose.getComposeDetails(
        plainTextTabId
      );
      browser.test.log(JSON.stringify(plainTextDetails));
      browser.test.assertTrue(plainTextDetails.isPlainText);
      browser.test.assertTrue(
        plainTextDetails.body.includes(
          plainTextBodyTag + "This is some plain text.</body>"
        )
      );
      browser.test.assertEq(
        "This is some plain text.",
        plainTextDetails.plainTextBody
      );

      // Set details, plain text message.

      await browser.compose.setComposeDetails(plainTextTabId, {
        plainTextBody:
          plainTextDetails.plainTextBody + "\nIndeed, it is plain.",
      });
      plainTextDetails = await browser.compose.getComposeDetails(
        plainTextTabId
      );
      browser.test.log(JSON.stringify(plainTextDetails));
      browser.test.assertTrue(plainTextDetails.isPlainText);
      browser.test.assertTrue(
        plainTextDetails.body.includes(
          plainTextBodyTag +
            "This is some plain text.<br>Indeed, it is plain.</body>"
        )
      );
      browser.test.assertEq(
        "This is some plain text.\nIndeed, it is plain.",
        // Fold Windows line-endings \r\n to \n.
        plainTextDetails.plainTextBody.replace(/\r/g, "")
      );

      // Some things that should fail.

      try {
        await browser.compose.setComposeDetails(plainTextTabId, {
          body: "Trying to set HTML in a plain text message",
        });
        browser.test.fail(
          "calling setComposeDetails with these arguments should throw"
        );
      } catch (ex) {
        browser.test.succeed(`expected exception thrown: ${ex.message}`);
      }

      try {
        await browser.compose.setComposeDetails(htmlTabId, {
          body: "Trying to set HTML",
          plainTextBody: "and plain text at the same time",
        });
        browser.test.fail(
          "calling setComposeDetails with these arguments should throw"
        );
      } catch (ex) {
        browser.test.succeed(`expected exception thrown: ${ex.message}`);
      }

      browser.test.notifyPass("finished");
    },
    manifest: {
      permissions: ["compose"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();

  // Check the HTML message was edited.

  ok(htmlWindow.gMsgCompose.composeHTML);
  let htmlDocument = htmlWindow.GetCurrentEditor().document;
  info(htmlDocument.body.innerHTML);
  is(htmlDocument.querySelectorAll("i").length, 0, "<i> was removed");
  is(htmlDocument.querySelectorAll("code").length, 1, "<code> was added");

  // Close the HTML message.

  let closePromises = [
    // If the window is not marked as dirty, this Promise will never resolve.
    BrowserTestUtils.promiseAlertDialog("extra1"),
    BrowserTestUtils.domWindowClosed(htmlWindow),
  ];
  htmlWindow.DoCommandClose();
  await Promise.all(closePromises);

  // Check the plain text message was edited.

  ok(!plainTextWindow.gMsgCompose.composeHTML);
  let plainTextDocument = plainTextWindow.GetCurrentEditor().document;
  info(plainTextDocument.body.innerHTML);
  ok(/Indeed, it is plain\./.test(plainTextDocument.body.innerHTML));

  // Close the plain text message.

  closePromises = [
    // If the window is not marked as dirty, this Promise will never resolve.
    BrowserTestUtils.promiseAlertDialog("extra1"),
    BrowserTestUtils.domWindowClosed(plainTextWindow),
  ];
  plainTextWindow.DoCommandClose();
  await Promise.all(closePromises);
});
