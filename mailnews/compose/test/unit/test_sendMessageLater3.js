/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/**
 * Protocol tests for SMTP.
 *
 * For trying to send a message later with no server connected, this test
 * verifies:
 *   - A correct status response.
 *   - A correct state at the end of attempting to send.
 */

load("../../../resources/alertTestUtils.js");

Components.utils.import("resource:///modules/mailServices.js");

var type = null;
var test = null;
var server;
var sentFolder;
var transaction;
var originalData;
var finished = false;
var identity = null;
var testFile = do_get_file("data/429891_testcase.eml");

var kSender = "from@foo.invalid";
var kTo = "to@foo.invalid";

var msgSendLater = Cc["@mozilla.org/messengercompose/sendlater;1"]
  .getService(Ci.nsIMsgSendLater);

function alert(aDialogTitle, aText) {
  dump("Hiding Alert {\n" + aText + "\n} End Alert\n");
}

// This listener handles the post-sending of the actual message and checks the
// sequence and ensures the data is correct.
function msll() {
}

msll.prototype = {
  _initialTotal: 0,
  _errorRaised: false,

  // nsIMsgSendLaterListener
  onStartSending: function (aTotal) {
    this._initialTotal = 1;
    Assert.equal(msgSendLater.sendingMessages, true);
  },
  onMessageStartSending: function (aCurrentMessage, aTotalMessageCount,
                                   aMessageHeader, aIdentity) {
  },
  onMessageSendProgress: function (aCurrentMessage, aTotalMessageCount,
                                   aMessageSendPercent, aMessageCopyPercent) {
  },
  onMessageSendError: function (aCurrentMessage, aMessageHeader, aStatus,
                                aMsg) {
    this._errorRaised = true;
  },
  onStopSending: function (aStatus, aMsg, aTotal, aSuccessful) {
    print("msll onStopSending\n");

    // NS_ERROR_SMTP_SEND_FAILED_REFUSED is 2153066798
    Assert.equal(aStatus, 2153066798);
    Assert.equal(aTotal, 1);
    Assert.equal(aSuccessful, 0);
    Assert.equal(this._initialTotal, 1);
    Assert.equal(this._errorRaised, true);
    Assert.equal(msgSendLater.sendingMessages, false);
    // Check that the send later service still thinks we have messages to send.
    Assert.equal(msgSendLater.hasUnsentMessages(identity), true);

    do_test_finished();
  }
};

function OnStopCopy(aStatus) {
  Assert.equal(aStatus, 0);

  // Check this is false before we start sending
  Assert.equal(msgSendLater.sendingMessages, false);

  let folder = msgSendLater.getUnsentMessagesFolder(identity);

  // Check that the send later service thinks we have messages to send.
  Assert.equal(msgSendLater.hasUnsentMessages(identity), true);

  // Check we have a message in the unsent message folder
  Assert.equal(folder.getTotalMessages(false), 1);

  
  // Now do a comparison of what is in the unsent mail folder
  let msgData = mailTestUtils
    .loadMessageToString(folder, mailTestUtils.firstMsgHdr(folder));

  // Skip the headers etc that mailnews adds
  var pos = msgData.indexOf("From:");
  Assert.notEqual(pos, -1);

  msgData = msgData.substr(pos);

  // Check the data is matching.
  Assert.equal(originalData, msgData);

  do_timeout(0, sendMessageLater);
}

// This function does the actual send later
function sendMessageLater()
{
  // No server for this test, just attempt to send unsent and wait.
  var messageListener = new msll();

  msgSendLater.addListener(messageListener);

  // Send the unsent message
  msgSendLater.sendUnsentMessages(identity);
}

function run_test() {
  registerAlertTestUtils();

  // Test file - for bug 429891
  originalData = IOUtils.loadFileToString(testFile);

  // Ensure we have a local mail account, an normal account and appropriate
  // servers and identities.
  localAccountUtils.loadLocalMailAccount();

  // Check that the send later service thinks we don't have messages to send.
  Assert.equal(msgSendLater.hasUnsentMessages(identity), false);

  MailServices.accounts.setSpecialFolders();

  let account = MailServices.accounts.createAccount();
  let incomingServer = MailServices.accounts.createIncomingServer("test", "localhost", "pop3");

  var smtpServer = getBasicSmtpServer();
  identity = getSmtpIdentity(kSender, smtpServer);

  account.addIdentity(identity);
  account.defaultIdentity = identity;
  account.incomingServer = incomingServer;

  sentFolder = localAccountUtils.rootFolder.createLocalSubfolder("Sent");

  identity.doFcc = false;

  // Now prepare to actually "send" the message later, i.e. dump it in the
  // unsent messages folder.

  var compFields = Cc["@mozilla.org/messengercompose/composefields;1"]
                     .createInstance(Ci.nsIMsgCompFields);

  compFields.from = identity.email;
  compFields.to = kTo;

  var msgSend = Cc["@mozilla.org/messengercompose/send;1"]
                  .createInstance(Ci.nsIMsgSend);

  msgSend.sendMessageFile(identity, "", compFields, testFile,
                          false, false, Ci.nsIMsgSend.nsMsgQueueForLater,
                          null, copyListener, null, null);

  // Now we wait till we get copy notification of completion.
  do_test_pending();
}
