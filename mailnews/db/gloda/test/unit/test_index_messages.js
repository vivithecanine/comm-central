/* This file tests our indexing prowess.  This includes both our ability to
 *  properly be triggered by events taking place in thunderbird as well as our
 *  ability to correctly extract/index the right data.
 * In general, if these tests pass, things are probably working quite well.
 *
 * Things we don't test that you think we might test:
 * - Full-text search.  Happens in query testing.
 */

load("../../mailnews/resources/messageGenerator.js");
load("resources/glodaTestHelper.js");

// Whether we can expect fulltext results
var expectFulltextResults = true;

// Create a message generator
var msgGen = new MessageGenerator();
// Create a message scenario generator using that message generator
var scenarios = new MessageScenarioFactory(msgGen);

/* ===== Threading / Conversation Grouping ===== */

var gSynMessages = [];
function allMessageInSameConversation(aSynthMessage, aGlodaMessage, aConvID) {
  if (aConvID === undefined)
    return aGlodaMessage.conversationID;
  do_check_eq(aConvID, aGlodaMessage.conversationID);
  // Cheat and stash the synthetic message (we need them for one of the IMAP
  // tests)
  gSynMessages.push(aSynthMessage);
  return aConvID;
}

// These are overridden by the IMAP tests as needed
var pre_test_threading_hook = function default_pre_test_threading_hook() {
  next_test();
};
var post_test_threading_hook = function default_post_test_threading_hook() {
  next_test();
};

/**
 * Test our conversation/threading logic in the straight-forward direct
 *  reply case, the missing intermediary case, and the siblings with missing
 *  parent case.  We also test all permutations of receipt of those messages.
 * (Also tests that we index new messages.)
 */
function test_threading() {
  indexAndPermuteMessages(scenarios.directReply,
                          allMessageInSameConversation);
  indexAndPermuteMessages(scenarios.missingIntermediary,
                          allMessageInSameConversation);
  indexAndPermuteMessages(scenarios.siblingsMissingParent,
                          allMessageInSameConversation,
                          next_test);
}

/* ===== Fundamental Attributes (per fundattr.js) ===== */

/**
 * Save the synthetic message created in test_attributes_fundamental for the
 *  benefit of test_attributes_fundamental_from_disk.
 */
var fundamentalSyntheticMessage;
/**
 * Save the resulting gloda message id corresponding to the
 *  fundamentalSyntheticMessage.
 */
var fundamentalGlodaMessageId;

/**
 * Test that we extract the 'fundamental attributes' of a message properly
 *  'Fundamental' in this case is talking about the attributes defined/extracted
 *  by gloda's fundattr.js and perhaps the core message indexing logic itself
 *  (which show up as kSpecial* attributes in fundattr.js anyways.)
 */
function test_attributes_fundamental() {
  // create a synthetic message with attachment
  let smsg = msgGen.makeMessage({
    attachments: [
      {filename: 'bob.txt', body: 'I like cheese!'}
    ],
  });
  // save it off for test_attributes_fundamental_from_disk
  fundamentalSyntheticMessage = smsg;

  indexMessages([smsg], verify_attributes_fundamental, next_test);
}

// Overridden by test_index_imap_mesasges
var get_expected_folder_URI = function local_get_expected_folder_URI() {
  return gLocalInboxFolder.URI;
};

function verify_attributes_fundamental(smsg, gmsg) {
  try {
    // save off the message id for test_attributes_fundamental_from_disk
    fundamentalGlodaMessageId = gmsg.id;

    do_check_eq(gmsg.folderURI, get_expected_folder_URI());

    // -- subject
    do_check_eq(smsg.subject, gmsg.conversation.subject);
    do_check_eq(smsg.subject, gmsg.subject);

    // -- contact/identity information
    // - from
    // check the e-mail address
    do_check_eq(gmsg.from.kind, "email");
    do_check_eq(smsg.fromAddress, gmsg.from.value);
    // check the name
    do_check_eq(smsg.fromName, gmsg.from.contact.name);

    // - to
    do_check_eq(smsg.toAddress, gmsg.to[0].value);
    do_check_eq(smsg.toName, gmsg.to[0].contact.name);

    // date
    do_check_eq(smsg.date.valueOf(), gmsg.date.valueOf());
    
    // -- message ID
    do_check_eq(smsg.messageId, gmsg.headerMessageID);

    // -- attachments. We won't have these if we don't have fulltext results
    if (expectFulltextResults) {
      do_check_eq(gmsg.attachmentTypes.length, 1);
      do_check_eq(gmsg.attachmentTypes[0], "text/plain");
      do_check_eq(gmsg.attachmentNames.length, 1);
      do_check_eq(gmsg.attachmentNames[0], "bob.txt");
    }
    else {
      // Make sure we don't actually get attachments!
      do_check_eq(gmsg.attachmentTypes, null);
      do_check_eq(gmsg.attachmentNames, null);
    }
  }
  catch (ex) {
    // print out some info on the various states of the messages...
    dump("***** FUNDAMENTAL ATTRIBUTE NON-MATCH\n");
    ddumpObject(smsg, "smsg", 0);
    ddumpObject(gmsg, "gmsg", 0);
    throw ex;
  }
}

/**
 * We want to make sure that all of the fundamental properties also are there
 *  when we load them from disk.  Nuke our cache, query the message back up.
 *  We previously used getMessagesByMessageID to get the message back, but he
 *  does not perform a full load-out like a query does, so we need to use our
 *  query mechanism for this.
 */
function test_attributes_fundamental_from_disk() {
  nukeGlodaCachesAndCollections();

  let query = Gloda.newQuery(Gloda.NOUN_MESSAGE).id(fundamentalGlodaMessageId);
  queryExpect(query, [fundamentalSyntheticMessage],
      verify_attributes_fundamental_from_disk,
      function (smsg) { return smsg.messageId; } );
}

/**
 * We are just a wrapper around verify_attributes_fundamental, adapting the
 *  return callback from getMessagesByMessageID.
 *
 * @param aGlodaMessageLists This should be [[theGlodaMessage]].
 */
function verify_attributes_fundamental_from_disk(aGlodaMessage) {
  // return the message id for test_attributes_fundamental_from_disk's benefit
  verify_attributes_fundamental(fundamentalSyntheticMessage,
                                aGlodaMessage);
  return aGlodaMessage.headerMessageID;
}

/* ===== Explicit Attributes (per explattr.js) ===== */

function expl_attr_twiddle_star(aMsgHdr, aDesiredState) {
  aMsgHdr.markFlagged(aDesiredState);
}

function expl_attr_verify_star(smsg, gmsg, aExpectedState) {
  do_check_eq(gmsg.starred, aExpectedState);
}

function expl_attr_twiddle_read(aMsgHdr, aDesiredState) {
  aMsgHdr.markRead(!aMsgHdr.isRead);
}

function expl_attr_verify_read(smsg, gmsg, aExpectedState) {
  do_check_eq(gmsg.read, aExpectedState);
}

function expl_attr_twiddle_tags(aMsgHdr, aTagMods) {
  // TODO: twiddle tags
}

function expl_attr_verify_tags(smsg, gmsg, aExpectedTags) {
  // TODO: verify tags
}

var explicitAttributeTwiddlings = [
  // toggle starred
  [expl_attr_twiddle_star, expl_attr_verify_star, true],
  [expl_attr_twiddle_star, expl_attr_verify_star, false],
  // toggle read/unread
  [expl_attr_twiddle_read, expl_attr_verify_read, true],
  [expl_attr_twiddle_read, expl_attr_verify_read, false]/*,
  // twiddle tags
  [expl_attr_twiddle_tags, expl_attr_verify_tags,
   [1, "funky"], ["funky"]],
  [expl_attr_twiddle_tags, expl_attr_verify_tags,
   [1, "town"], ["funky", "town"]],
  [expl_attr_twiddle_tags, expl_attr_verify_tags,
   [-1, "funky"], ["town"]],
  [expl_attr_twiddle_tags, expl_attr_verify_tags,
   [-1, "town"], []],
*/
];


function test_attributes_explicit() {
  let smsg = msgGen.makeMessage();

  twiddleAndTest(smsg, explicitAttributeTwiddlings);
}

function do_moveMessage(aMsgHdr, aDestFolder) {
  gCopyService.CopyMessages(aMsgHdr.folder,
    toXPCOMArray(aMsgHdr, Components.interfaces.nsIMutableArray),
    aDestFolder, true, null, null, true);
}

function verify_messageLocation(aMsgHdr, aMessage, aDestFolder) {
  do_check_eq(aMessage.folderURI, aDestFolder.URI);
}

/* ===== Message Moving ===== */
const gCopyService = Cc["@mozilla.org/messenger/messagecopyservice;1"]
                      .getService(Ci.nsIMsgCopyService);

function test_message_moving() {
  let rootFolder = gLocalIncomingServer.rootMsgFolder;
  let destFolder = rootFolder.addSubfolder("move1");

  let moveTestActions = [
    [do_moveMessage, verify_messageLocation, destFolder],
    [do_moveMessage, verify_messageLocation, gLocalInboxFolder],
  ];

  let smsg = msgGen.makeMessage();
  twiddleAndTest(smsg, moveTestActions);
}

/* ===== Message Deletion ===== */
function test_message_deletion() {
}

/* ===== Folder Move/Rename/Copy (Single and Nested) ===== */


var tests = [
  function pre_test_threading() { pre_test_threading_hook(); },
  test_threading,
  function post_test_threading() { post_test_threading_hook(); },
  test_attributes_fundamental,
  test_attributes_fundamental_from_disk,
  test_attributes_explicit,
];

function run_test() {
  glodaHelperRunTests(tests);
}
