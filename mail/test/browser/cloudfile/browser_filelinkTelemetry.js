/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Test telemetry related to filelink.
 */

let { TelemetryTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TelemetryTestUtils.sys.mjs"
);
let { gMockCloudfileManager } = ChromeUtils.import(
  "resource://testing-common/mozmill/CloudfileHelpers.jsm"
);
let {
  add_attachments,
  add_cloud_attachments,
  close_compose_window,
  open_compose_new_mail,
  setup_msg_contents,
} = ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");
let { wait_for_notification_to_stop } = ChromeUtils.import(
  "resource://testing-common/mozmill/NotificationBoxHelpers.jsm"
);
let { cloudFileAccounts } = ChromeUtils.import(
  "resource:///modules/cloudFileAccounts.jsm"
);
var { MockFilePicker } = SpecialPowers;

let cloudType = "default";
let kInsertNotificationPref =
  "mail.compose.big_attachments.insert_notification";

let maxSize =
  Services.prefs.getIntPref("mail.compose.big_attachments.threshold_kb") * 1024;

add_setup(function () {
  requestLongerTimeout(2);

  gMockCloudfileManager.register(cloudType);
  MockFilePicker.init(window);

  Services.prefs.setBoolPref(kInsertNotificationPref, true);
});

registerCleanupFunction(function () {
  gMockCloudfileManager.unregister(cloudType);
  MockFilePicker.cleanup();
  Services.prefs.clearUserPref(kInsertNotificationPref);
});

let kBoxId = "compose-notification-bottom";

/**
 * Check that we're counting file size uploaded.
 */
add_task(async function test_filelink_uploaded_size() {
  Services.telemetry.clearScalars();
  let testFile1Size = 495;
  let testFile2Size = 637;
  let totalSize = testFile1Size + testFile2Size;

  MockFilePicker.setFiles(
    collectFiles(["./data/testFile1", "./data/testFile2"])
  );

  let provider = cloudFileAccounts.getProviderForType(cloudType);
  let cwc = await open_compose_new_mail(window);
  let account = cloudFileAccounts.createAccount(cloudType);

  await add_cloud_attachments(cwc, account, false);
  gMockCloudfileManager.resolveUploads();
  await wait_for_notification_to_stop(cwc, kBoxId, "bigAttachmentUploading");

  let scalars = TelemetryTestUtils.getProcessScalars("parent", true);
  Assert.equal(
    scalars["tb.filelink.uploaded_size"][provider.displayName],
    totalSize,
    "Count of uploaded size must be correct."
  );
  await close_compose_window(cwc);
});

/**
 * Check that we're counting filelink suggestion ignored.
 */
add_task(async function test_filelink_ignored() {
  Services.telemetry.clearScalars();

  let cwc = await open_compose_new_mail(window);
  await setup_msg_contents(
    cwc,
    "test@example.org",
    "Testing ignoring filelink suggestion",
    "Hello! "
  );

  // Multiple big attachments should be counted as one ignoring.
  await add_attachments(cwc, "https://www.example.com/1", maxSize);
  await add_attachments(cwc, "https://www.example.com/2", maxSize + 10);
  await add_attachments(cwc, "https://www.example.com/3", maxSize - 1);
  let aftersend = BrowserTestUtils.waitForEvent(cwc, "aftersend");
  // Send Later to avoid uncatchable errors from the SMTP code.
  cwc.goDoCommand("cmd_sendLater");
  await aftersend;
  let scalars = TelemetryTestUtils.getProcessScalars("parent");
  Assert.equal(
    scalars["tb.filelink.ignored"],
    1,
    "Count of ignored times must be correct."
  );
});
