/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* ***** BEGIN LICENSE BLOCK *****
 *
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/licenses/publicdomain/
 *
 * ***** END LICENSE BLOCK ***** */

// IMAP pump

setupIMAPPump();

/*
 * Test parsing of imap uri's with very large UID's.
 */

function run_test() {
  const imapS = Cc[
    "@mozilla.org/messenger/messageservice;1?type=imap"
  ].getService(Ci.nsIMsgMessageService);
  const uri = imapS.getUrlForUri(
    "imap-message://user@localhost/INBOX#4294967168"
  );
  Assert.equal(
    uri.spec,
    "imap://user@localhost:" +
      IMAPPump.server.port +
      "/fetch%3EUID%3E%5EINBOX%3E4294967168"
  );
  teardownIMAPPump();
}
