/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that the compose window initializes with the signature correctly
 * under various circumstances.
 */

"use strict";

var {
  close_compose_window,
  get_compose_body,
  open_compose_new_mail,
} = ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");

var kHtmlPref = "mail.identity.default.compose_html";
var kReplyOnTopPref = "mail.identity.default.reply_on_top";
var kReplyOnTop = 1;
var kSigBottomPref = "mail.identity.default.sig_bottom";

/**
 * Regression test for bug 762413 - tests that when we're set to reply above,
 * with the signature below the reply, we initialize the compose window such
 * that there is a <br> node above the signature. This allows the user to
 * insert text before the signature.
 */
add_task(function test_on_reply_above_signature_below_reply() {
  let origHtml = Services.prefs.getBoolPref(kHtmlPref);
  let origReplyOnTop = Services.prefs.getIntPref(kReplyOnTopPref);
  let origSigBottom = Services.prefs.getBoolPref(kSigBottomPref);

  Services.prefs.setBoolPref(kHtmlPref, false);
  Services.prefs.setIntPref(kReplyOnTopPref, kReplyOnTop);
  Services.prefs.setBoolPref(kSigBottomPref, false);

  let cw = open_compose_new_mail();
  let mailBody = get_compose_body(cw);

  let node = mailBody.firstChild;
  Assert.equal(
    node.localName,
    "br",
    "Expected a BR node to start the compose body."
  );

  Services.prefs.setBoolPref(kHtmlPref, origHtml);
  Services.prefs.setIntPref(kReplyOnTopPref, origReplyOnTop);
  Services.prefs.setBoolPref(kSigBottomPref, origSigBottom);

  close_compose_window(cw);
});
