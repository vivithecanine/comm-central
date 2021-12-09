/**
 * This test checks to see if the pop3 password failure is handled correctly.
 * The steps are:
 *   - Have an invalid password in the password database.
 *   - Check we get a prompt asking what to do.
 *   - Check retry does what it should do.
 *   - Check cancel does what it should do.
 *   - Re-initiate connection, this time select enter new password, check that
 *     we get a new password prompt and can enter the password.
 */

/* import-globals-from ../../../test/resources/logHelper.js */
/* import-globals-from ../../../test/resources/alertTestUtils.js */
/* import-globals-from ../../../test/resources/passwordStorage.js */
/* import-globals-from ../../../test/resources/MailTestUtils.jsm */
/* import-globals-from ../../../test/resources/asyncTestUtils.js */
load("../../../resources/logHelper.js");
load("../../../resources/alertTestUtils.js");
load("../../../resources/passwordStorage.js");
load("../../../resources/MailTestUtils.jsm");
load("../../../resources/asyncTestUtils.js");

var server;
var daemon;
var incomingServer;
var attempt = 0;

var kUserName = "testpop3";
var kInvalidPassword = "pop3test";
var kValidPassword = "testpop3";

/* exported alert, confirmEx, promptPasswordPS */
function alert(aDialogText, aText) {
  // The first few attempts may prompt about the password problem, the last
  // attempt shouldn't.
  Assert.ok(attempt < 4);

  // Log the fact we've got an alert, but we don't need to test anything here.
  info("Alert Title: " + aDialogText + "\nAlert Text: " + aText);
}

function confirmEx(
  aDialogTitle,
  aText,
  aButtonFlags,
  aButton0Title,
  aButton1Title,
  aButton2Title,
  aCheckMsg,
  aCheckState
) {
  switch (++attempt) {
    // First attempt, retry.
    case 1:
      info("Attempting retry");
      return 0;
    // Second attempt, cancel.
    case 2:
      info("Cancelling login attempt");
      return 1;
    // Third attempt, retry.
    case 3:
      info("Attempting Retry");
      return 0;
    // Fourth attempt, enter a new password.
    case 4:
      info("Enter new password");
      return 2;
    default:
      do_throw("unexpected attempt number " + attempt);
      return 1;
  }
}

function promptPasswordPS(
  aParent,
  aDialogTitle,
  aText,
  aPassword,
  aCheckMsg,
  aCheckState
) {
  if (attempt == 4) {
    aPassword.value = kValidPassword;
    aCheckState.value = true;
    return true;
  }
  return false;
}

function getPopMail() {
  do_test_pending();

  MailServices.pop3.GetNewMail(
    gDummyMsgWindow,
    urlListener,
    localAccountUtils.inboxFolder,
    incomingServer
  );

  server.performTest();
  return false;
}

var urlListener = {
  OnStartRunningUrl(url) {},
  OnStopRunningUrl(url, result) {
    try {
      server.playTransaction();

      // On the last attempt, we should have successfully got one mail.
      Assert.equal(
        localAccountUtils.inboxFolder.getTotalMessages(false),
        attempt == 4 ? 1 : 0
      );

      // nsPop3Protocol.cpp returns two different status codes based on if there
      // were password failures before the cancel. Pop3Client.jsm doesn't make
      // the distinction.
      let result2 = Services.prefs.getBoolPref("mailnews.pop3.jsmodule", false)
        ? Cr.NS_ERROR_FAILURE
        : Cr.NS_BINDING_ABORTED;

      // If we've just cancelled, expect failure rather than success.
      Assert.equal(result, attempt == 2 ? result2 : 0);
    } catch (e) {
      // If we have an error, clean up nicely before we throw it.
      server.stop();

      var thread = gThreadManager.currentThread;
      while (thread.hasPendingEvents()) {
        thread.processNextEvent(true);
      }

      do_throw(e);
    }
    do_test_finished();
  },
};

add_task(async function() {
  // Disable new mail notifications
  Services.prefs.setBoolPref("mail.biff.play_sound", false);
  Services.prefs.setBoolPref("mail.biff.show_alert", false);
  Services.prefs.setBoolPref("mail.biff.show_tray_icon", false);
  Services.prefs.setBoolPref("mail.biff.animate_dock_icon", false);
  Services.prefs.setBoolPref("signon.debug", true);

  // Prepare files for passwords (generated by a script in bug 1018624).
  await setupForPassword("signons-mailnews1.8.json");

  registerAlertTestUtils();

  // Set up the Server
  var serverArray = setupServerDaemon();
  daemon = serverArray[0];
  server = serverArray[1];
  var handler = serverArray[2];
  server.start();

  // Login information needs to match the one stored in the signons json file.
  handler.kUsername = kUserName;
  handler.kPassword = kValidPassword;

  // Set up the basic accounts and folders.
  // We would use createPop3ServerAndLocalFolders() however we want to have
  // a different username and NO password for this test (as we expect to load
  // it from the signons json file in which the login information is stored).
  localAccountUtils.loadLocalMailAccount();

  incomingServer = MailServices.accounts.createIncomingServer(
    kUserName,
    "localhost",
    "pop3"
  );

  incomingServer.port = server.port;

  // Check that we haven't got any messages in the folder, if we have its a test
  // setup issue.
  Assert.equal(localAccountUtils.inboxFolder.getTotalMessages(false), 0);

  daemon.setMessages(["message1.eml"]);
});

add_task(function getMail1() {
  info("Get Mail 1");

  // Now get mail
  getPopMail();

  info("Got Mail 1");

  Assert.equal(attempt, 2);

  // Check that we haven't forgotten the login even though we've retried and cancelled.
  let logins = Services.logins.findLogins(
    "mailbox://localhost",
    null,
    "mailbox://localhost"
  );

  Assert.equal(logins.length, 1);
  Assert.equal(logins[0].username, kUserName);
  Assert.equal(logins[0].password, kInvalidPassword);

  server.resetTest();
});

add_task(function getMail2() {
  info("Get Mail 2");

  // Now get the mail
  getPopMail();
  info("Got Mail 2");

  // Now check the new one has been saved.
  let logins = Services.logins.findLogins(
    "mailbox://localhost",
    null,
    "mailbox://localhost"
  );

  Assert.equal(logins.length, 1);
  Assert.equal(logins[0].username, kUserName);
  Assert.equal(logins[0].password, kValidPassword);
});
