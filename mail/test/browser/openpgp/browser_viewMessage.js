/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for the display of OpenPGP signed/encrypted state in opened messages.
 */

"use strict";

const {
  open_message_from_file,
  wait_for_message_display_completion,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
const {
  async_plan_for_new_window,
  close_window,
  wait_for_window_focused,
} = ChromeUtils.import("resource://testing-common/mozmill/WindowHelpers.jsm");
const { waitForCondition } = ChromeUtils.import(
  "resource://testing-common/mozmill/utils.jsm"
);
const {
  get_notification_button,
  wait_for_notification_to_show,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/NotificationBoxHelpers.jsm"
);

const { OpenPGPTestUtils } = ChromeUtils.import(
  "resource://testing-common/mozmill/OpenPGPTestUtils.jsm"
);
const { FileUtils } = ChromeUtils.import(
  "resource://gre/modules/FileUtils.jsm"
);
const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

const MSG_TEXT = "Sundays are nothing without callaloo.";

function getMsgBodyTxt(mc) {
  let msgPane = mc.window.document.getElementById("messagepane");
  return msgPane.contentDocument.documentElement.textContent;
}

var aliceAcct;

/**
 * When testing a scenario that should automatically process the OpenPGP
 * contents (it's not suppressed e.g. because of a partial content),
 * then we need to wait for the automatic processing to complete.
 */
async function openpgpProcessed() {
  let [subject] = await TestUtils.topicObserved(
    "document-element-inserted",
    document => {
      return (
        document.ownerGlobal?.location ==
        "chrome://messenger/content/messageWindow.xhtml"
      );
    }
  );

  return BrowserTestUtils.waitForEvent(subject, "openpgpprocessed");
}

/**
 * Set up the base account, identity and keys needed for the tests.
 */
add_task(async function setupTest() {
  aliceAcct = MailServices.accounts.createAccount();
  aliceAcct.incomingServer = MailServices.accounts.createIncomingServer(
    "alice",
    "openpgp.example",
    "pop3"
  );
  let aliceIdentity = MailServices.accounts.createIdentity();
  aliceIdentity.email = "alice@openpgp.example";
  aliceAcct.addIdentity(aliceIdentity);

  // Set up the alice's private key.
  let [id] = await OpenPGPTestUtils.importPrivateKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "data/keys/alice@openpgp.example-0xf231550c4f47e38e-secret.asc"
      )
    )
  );

  aliceIdentity.setUnicharAttribute("openpgp_key_id", id);

  // Import and accept the public key for Bob, our verified sender.
  await OpenPGPTestUtils.importPublicKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "data/keys/bob@openpgp.example-0xfbfcc82a015e7330-pub.asc"
      )
    )
  );
});

/**
 * Test that an unsigned unencrypted message do not show as signed nor encrypted.
 */
add_task(async function testOpenNoPGPSecurity() {
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath("data/eml/unsigned-unencrypted-from-bob-to-alice.eml")
    )
  );

  Assert.ok(getMsgBodyTxt(mc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(mc.window.document),
    "signed icon is not displayed"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(mc.window.document, "ok"),
    "encrypted icon is not displayed"
  );
  close_window(mc);
});

/**
 * Test that a signed (only) message, signed by a verified key, shows as such.
 */
add_task(async function testOpenSignedByVerifiedUnencrypted() {
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/signed-by-0xfbfcc82a015e7330-to-0xf231550c4f47e38e-unencrypted.eml"
      )
    )
  );

  Assert.ok(getMsgBodyTxt(mc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(mc.window.document, "verified"),
    "signed verified icon is displayed"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(mc.window.document, "ok"),
    "encrypted icon is not displayed"
  );
  close_window(mc);
});

/**
 * Test that a signed (only) message, signed by a verified key,
 * but with an mismatching email date, is shown with invalid signature.
 */
add_task(async function testOpenSignedDateMismatch() {
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath("data/eml/signed-mismatch-email-date.eml")
    )
  );

  Assert.ok(getMsgBodyTxt(mc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(mc.window.document, "mismatch"),
    "signed unknown icon is displayed"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(mc.window.document, "ok"),
    "encrypted icon is not displayed"
  );
  close_window(mc);
});

/**
 * Test that opening an unsigned encrypted message shows as such.
 */
add_task(async function testOpenVerifiedUnsignedEncrypted() {
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/unsigned-encrypted-to-0xf231550c4f47e38e-from-0xfbfcc82a015e7330.eml"
      )
    )
  );

  Assert.ok(getMsgBodyTxt(mc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(mc.window.document),
    "signed icon is not displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(mc.window.document, "ok"),
    "encrypted icon is displayed"
  );
  close_window(mc);
});

/**
 * Test that opening an attached encrypted message has no effect
 * on security status icons of the parent message window.
 */
add_task(async function testOpenForwardedEncrypted() {
  let mc = await open_message_from_file(
    new FileUtils.File(getTestFilePath("data/eml/fwd-unsigned-encrypted.eml"))
  );

  Assert.ok(
    getMsgBodyTxt(mc).includes("wrapper message with plain text"),
    "wrapper message text should be shown"
  );
  Assert.ok(
    !getMsgBodyTxt(mc).includes(MSG_TEXT),
    "message text should not be shown"
  );
  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(mc.window.document),
    "signed icon is not displayed"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(mc.window.document, "ok"),
    "encrypted icon is not displayed"
  );

  let newWindowPromise = async_plan_for_new_window("mail:messageWindow");
  EventUtils.synthesizeMouseAtCenter(
    mc.e("attachmentName"),
    { clickCount: 1 },
    mc.window
  );
  let mc2 = await newWindowPromise;
  wait_for_message_display_completion(mc2, true);
  wait_for_window_focused(mc2.window);

  // Check properties of the opened attachment window.
  Assert.ok(
    getMsgBodyTxt(mc2).includes(MSG_TEXT),
    "message text should be shown"
  );
  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(mc2.window.document),
    "signed icon is not displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(mc2.window.document, "ok"),
    "encrypted icon is displayed"
  );
  close_window(mc2);

  wait_for_window_focused(mc.window);

  // Ensure there were no side effects for the primary window.
  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(mc.window.document),
    "signed icon is still not displayed"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(mc.window.document, "ok"),
    "encrypted icon is still not displayed"
  );

  close_window(mc);
});

/**
 * Test that opening a message that is signed by a verified key shows as such.
 */
add_task(async function testOpenSignedByVerifiedEncrypted() {
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/signed-by-0xfbfcc82a015e7330-encrypted-to-0xf231550c4f47e38e.eml"
      )
    )
  );

  Assert.ok(getMsgBodyTxt(mc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(mc.window.document, "verified"),
    "signed verified icon is displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(mc.window.document, "ok"),
    "encrypted icon is displayed"
  );
  close_window(mc);
});

/**
 * Test that opening a message signed (only) by an unverified key shows as such.
 */
add_task(async function testOpenSignedByUnverifiedUnencrypted() {
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/signed-by-0x3099ff1238852b9f-to-0xf231550c4f47e38e-unencrypted.eml"
      )
    )
  );

  Assert.ok(getMsgBodyTxt(mc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(mc.window.document, "unknown"),
    "signed unknown icon is displayed"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(mc.window.document, "ok"),
    "encrypted icon is not displayed"
  );
  close_window(mc);
});

/**
 * Test that opening a message signed (only) with extra outer layer
 * doesn't show signature state.
 */
add_task(async function testOpenSignedWithOuterLayer() {
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath("data/eml/signed-with-mailman-footer.eml")
    )
  );

  Assert.ok(getMsgBodyTxt(mc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(mc.window.document),
    "signed icon is not displayed"
  );
  close_window(mc);
});

/**
 * Test that opening a message encrypted (only) shows as such.
 */
add_task(async function testOpenUnverifiedUnsignedEncrypted() {
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/unsigned-encrypted-to-0xf231550c4f47e38e-from-0x3099ff1238852b9f.eml"
      )
    )
  );

  Assert.ok(getMsgBodyTxt(mc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(mc.window.document),
    "signed icon is not displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(mc.window.document, "ok"),
    "encrypted icon is displayed"
  );
  close_window(mc);
});

/**
 * Test that opening an encrypted message signed by an unverified key is shown
 * as it should.
 */
add_task(async function testOpenSignedByUnverifiedEncrypted() {
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/signed-by-0x3099ff1238852b9f-encrypted-to-0xf231550c4f47e38e.eml"
      )
    )
  );

  Assert.ok(getMsgBodyTxt(mc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(mc.window.document, "unknown"),
    "signed unknown icon is displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(mc.window.document, "ok"),
    "encrypted icon is displayed"
  );
  close_window(mc);
});

/**
 * Test that the message is properly reloaded and the message security icon is
 * updated if the user changes the signature acceptance level.
 */
add_task(async function testUpdateMessageSignature() {
  // Setup the message.
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/signed-by-0xfbfcc82a015e7330-to-0xf231550c4f47e38e-unencrypted.eml"
      )
    )
  );

  // Verify current signature acceptance.
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(mc.window.document, "verified"),
    "signed verified icon is displayed"
  );

  let popupshown = BrowserTestUtils.waitForEvent(
    mc.e("messageSecurityPanel"),
    "popupshown"
  );
  EventUtils.synthesizeMouseAtCenter(
    mc.e("encryptionTechBtn"),
    { clickCount: 1 },
    mc.window
  );
  // Wait for the popup panel and signature button to become visible otherwise
  // we can't click on it.
  await popupshown;

  // Open the Key Properties dialog and change the signature acceptance.
  let dialogPromise = BrowserTestUtils.domWindowOpened(null, async win => {
    await BrowserTestUtils.waitForEvent(win, "load");

    if (
      win.document.documentURI !=
      "chrome://openpgp/content/ui/keyDetailsDlg.xhtml"
    ) {
      return false;
    }

    if (Services.focus.activeWindow != win) {
      await BrowserTestUtils.waitForEvent(win, "focus");
    }

    EventUtils.synthesizeMouseAtCenter(
      win.document.querySelector("#acceptUnverified"),
      {},
      win
    );

    let closedPromise = BrowserTestUtils.domWindowClosed(win);
    win.document.documentElement.querySelector("dialog").acceptDialog();
    await closedPromise;
    return true;
  });

  // This will open the key details, the domWindowOpened handler
  // will catch it and execute the changes.
  EventUtils.synthesizeMouseAtCenter(
    mc.e("viewSignatureKey"),
    { clickCount: 1 },
    mc.window
  );

  // Wait until we are done with keyDetailsDlg.
  await dialogPromise;

  // Wait for the signedHdrIcon state to change.

  // Verify the new acceptance level is correct.
  await TestUtils.waitForCondition(
    () => OpenPGPTestUtils.hasSignedIconState(mc.window.document, "unverified"),
    "signed unverified icon should be displayed"
  );
  close_window(mc);
});

// After test testUpdateMessageSignature acceptance of Bob's key
// has changed from verified to unverified.

/**
 * Test that a signed (only) inline PGP message with UTF-8 characters
 * can be correctly verified.
 */
add_task(async function testOpenSignedInlineWithUTF8() {
  let opengpgprocessed = openpgpProcessed();
  let mc = await open_message_from_file(
    new FileUtils.File(getTestFilePath("data/eml/alice-utf.eml"))
  );
  await opengpgprocessed;

  Assert.ok(
    getMsgBodyTxt(mc).includes("£35.00"),
    "UTF-8 character found in message"
  );
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(mc.window.document, "unverified"),
    "signed unverified icon is displayed"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(mc.window.document, "ok"),
    "encrypted icon is not displayed"
  );
  close_window(mc);
});

/**
 * Test that a signed (only) inline PGP message with leading whitespace
 * can be correctly verified.
 */
add_task(async function testOpenSignedInlineWithLeadingWS() {
  let opengpgprocessed = openpgpProcessed();
  let mc = await open_message_from_file(
    new FileUtils.File(getTestFilePath("data/eml/signed-inline-indented.eml"))
  );
  await opengpgprocessed;

  Assert.ok(
    getMsgBodyTxt(mc).includes("indent test with £"),
    "expected text should be found in message"
  );
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(mc.window.document, "unverified"),
    "signed unverified icon is displayed"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(mc.window.document, "ok"),
    "encrypted icon is not displayed"
  );
  close_window(mc);
});

/**
 * Test that an encrypted inline message, with nbsp encoded as qp
 * in the PGP separator line, is trimmed and decrypted.
 */
add_task(async function testDecryptInlineWithNBSPasQP() {
  let opengpgprocessed = openpgpProcessed();
  let mc = await open_message_from_file(
    new FileUtils.File(getTestFilePath("data/eml/bob-enc-inline-nbsp-qp.eml"))
  );
  await opengpgprocessed;

  Assert.ok(
    getMsgBodyTxt(mc).includes("My real name is not Bob."),
    "Secret text should be contained in message"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(mc.window.document, "ok"),
    "Encrypted icon should be displayed"
  );
  close_window(mc);
});

/**
 * Test that an inline message, encoded as html message, with nbsp
 * encoded as qp in the PGP separator line, is trimmed and decrypted.
 */
add_task(async function testDecryptHtmlWithNBSP() {
  let opengpgprocessed = openpgpProcessed();
  let mc = await open_message_from_file(
    new FileUtils.File(getTestFilePath("data/eml/bob-enc-html-nbsp.eml"))
  );
  await opengpgprocessed;

  Assert.ok(
    getMsgBodyTxt(mc).includes("My real name is not Bob."),
    "Secret text should be contained in message"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(mc.window.document, "ok"),
    "Encrypted icon should be displayed"
  );
  close_window(mc);
});

registerCleanupFunction(async function tearDown() {
  MailServices.accounts.removeAccount(aliceAcct, true);
  await OpenPGPTestUtils.removeKeyById("0xf231550c4f47e38e", true);
});
