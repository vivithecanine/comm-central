/**
 * This test checks to see if the imap password failure is handled correctly.
 * The steps are:
 *   - Have an invalid password in the password database.
 *   - Check we get a prompt asking what to do.
 *   - Check retry does what it should do.
 *   - Check cancel does what it should do.
 *   - Re-initiate connection, this time select enter new password, check that
 *     we get a new password prompt and can enter the password.
 */

/* import-globals-from ../../../test/resources/alertTestUtils.js */
/* import-globals-from ../../../test/resources/passwordStorage.js */
load("../../../resources/alertTestUtils.js");
load("../../../resources/passwordStorage.js");

var kUserName = "user";
var kInvalidPassword = "imaptest";
var kValidPassword = "password";

var incomingServer, server;
var attempt = 0;

function confirmExPS(
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
      dump("\nAttempting retry\n");
      return 0;
    // Second attempt, cancel.
    case 2:
      dump("\nCancelling login attempt\n");
      return 1;
    // Third attempt, retry.
    case 3:
      dump("\nAttempting Retry\n");
      return 0;
    // Fourth attempt, enter a new password.
    case 4:
      dump("\nEnter new password\n");
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

add_task(async function() {
  do_test_pending();

  // Prepare files for passwords (generated by a script in bug 1018624).
  await setupForPassword("signons-mailnews1.8-imap.json");

  registerAlertTestUtils();

  let daemon = new ImapDaemon();
  daemon.createMailbox("Subscribed", { subscribed: true });
  server = makeServer(daemon, "", {
    // Make username of server match the singons.txt file
    // (pw there is intentionally invalid)
    kUsername: kUserName,
    kPassword: kValidPassword,
  });
  server.setDebugLevel(fsDebugAll);

  incomingServer = createLocalIMAPServer(server.port);

  // PerformExpand expects us to already have a password loaded into the
  // incomingServer when we call it, so force a get password call to get it
  // out of the signons file (first removing the value that
  // createLocalIMAPServer puts in there).
  incomingServer.password = "";
  let password = incomingServer.getPasswordWithUI(
    "Prompt Message",
    "Prompt Title"
  );

  // The fake server expects one password, but we're feeding it an invalid one
  // initially so that we can check what happens when password is denied.
  Assert.equal(password, kInvalidPassword);

  // First step, try and perform a subscribe where we won't be able to log in.
  // This covers attempts 1 and 2 in confirmEx.
  dump("\nperformExpand 1\n\n");

  incomingServer.performExpand(gDummyMsgWindow);
  server.performTest("SUBSCRIBE");

  dump("\nfinished subscribe 1\n\n");

  Assert.equal(attempt, 2);

  let rootFolder = incomingServer.rootFolder;
  Assert.ok(rootFolder.containsChildNamed("Inbox"));
  Assert.ok(!rootFolder.containsChildNamed("Subscribed"));

  // Check that we haven't forgotten the login even though we've retried and cancelled.
  let logins = Services.logins.findLogins(
    "imap://localhost",
    null,
    "imap://localhost"
  );

  Assert.equal(logins.length, 1);
  Assert.equal(logins[0].username, kUserName);
  Assert.equal(logins[0].password, kInvalidPassword);

  server.resetTest();

  dump("\nperformExpand 2\n\n");

  incomingServer.performExpand(gDummyMsgWindow);
  server.performTest("SUBSCRIBE");

  dump("\nfinished subscribe 2\n");

  Assert.ok(rootFolder.containsChildNamed("Inbox"));
  Assert.ok(rootFolder.containsChildNamed("Subscribed"));

  // Now check the new one has been saved.
  logins = Services.logins.findLogins(
    "imap://localhost",
    null,
    "imap://localhost"
  );

  Assert.equal(logins.length, 1);
  Assert.equal(logins[0].username, kUserName);
  Assert.equal(logins[0].password, kValidPassword);

  // Remove the login via the incoming server.
  incomingServer.forgetPassword();
  logins = Services.logins.findLogins(
    "imap://localhost",
    null,
    "imap://localhost"
  );

  Assert.equal(logins.length, 0);

  do_timeout(500, endTest);
});

function endTest() {
  incomingServer.closeCachedConnections();
  server.stop();

  var thread = gThreadManager.currentThread;
  while (thread.hasPendingEvents()) {
    thread.processNextEvent(true);
  }

  do_test_finished();
}
