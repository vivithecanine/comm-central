/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for handling exceptions to recurring event invitations via the imip-bar.
 */

"use strict";

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { FileUtils } = ChromeUtils.import("resource://gre/modules/FileUtils.jsm");
var { MailServices } = ChromeUtils.import("resource:///modules/MailServices.jsm");

var { CalendarTestUtils } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarTestUtils.jsm"
);

let identity;
let calendar;
let transport;

/**
 * Initialize account, identity and calendar.
 */
add_setup(async function() {
  requestLongerTimeout(5);
  let account = MailServices.accounts.createAccount();
  account.incomingServer = MailServices.accounts.createIncomingServer(
    "receiver",
    "example.com",
    "imap"
  );
  identity = MailServices.accounts.createIdentity();
  identity.email = "receiver@example.com";
  account.addIdentity(identity);

  await CalendarTestUtils.setCalendarView(window, "month");
  window.goToDate(cal.createDateTime("20220316T191602Z"));

  calendar = CalendarTestUtils.createCalendar("Test");
  transport = new EmailTransport(account, identity);
  let getImipTransport = cal.itip.getImipTransport;
  cal.itip.getImipTransport = () => transport;

  let deleteMgr = Cc["@mozilla.org/calendar/deleted-items-manager;1"].getService(
    Ci.calIDeletedItems
  ).wrappedJSObject;

  let markDeleted = deleteMgr.markDeleted;
  deleteMgr.markDeleted = () => {};

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, true);
    cal.itip.getImipTransport = getImipTransport;
    deleteMgr.markDeleted = markDeleted;
    CalendarTestUtils.removeCalendar(calendar);
  });
});

/**
 * Tests a minor update exception to an already accepted recurring event.
 */
add_task(async function testMinorUpdateExceptionToAccepted() {
  transport.reset();
  let invite = new FileUtils.File(getTestFilePath("data/repeat-event.eml"));
  let win = await openImipMessage(invite);
  await clickAction(win, "imipAcceptRecurrencesButton");

  await BrowserTestUtils.closeWindow(win);
  await doMinorExceptionTest({
    transport,
    calendar,
    partStat: "ACCEPTED",
  });
});

/**
 * Tests a minor update exception to an already tentatively accepted recurring
 * event.
 */
add_task(async function testMinorUpdateExceptionToTentative() {
  transport.reset();
  let invite = new FileUtils.File(getTestFilePath("data/repeat-event.eml"));
  let win = await openImipMessage(invite);
  await clickAction(win, "imipTentativeRecurrencesButton");

  await BrowserTestUtils.closeWindow(win);
  await doMinorExceptionTest({
    transport,
    calendar,
    partStat: "TENTATIVE",
  });
});

/**
 * Tests a minor update exception to an already decliend recurring decliend
 * event.
 */
add_task(async function testMinorUpdateExceptionToDeclined() {
  transport.reset();
  let invite = new FileUtils.File(getTestFilePath("data/repeat-event.eml"));
  let win = await openImipMessage(invite);
  await clickAction(win, "imipDeclineRecurrencesButton");

  await BrowserTestUtils.closeWindow(win);
  await doMinorExceptionTest({
    transport,
    calendar,
    partStat: "DECLINED",
  });
});

/**
 * Tests a major update exception to an already accepted event.
 */
add_task(async function testMajorExceptionToAcceptedWithResponse() {
  for (let partStat of ["ACCEPTED", "TENTATIVE", "DECLINED"]) {
    transport.reset();
    let invite = new FileUtils.File(getTestFilePath("data/repeat-event.eml"));
    let win = await openImipMessage(invite);
    await clickAction(win, "imipAcceptRecurrencesButton");

    await BrowserTestUtils.closeWindow(win);
    await doMajorExceptionTest({
      transport,
      identity,
      calendar,
      partStat,
    });
  }
});

/**
 * Tests a major update exception to an already tentatively accepted event.
 */
add_task(async function testMajorExceptionToTentativeWithResponse() {
  for (let partStat of ["ACCEPTED", "TENTATIVE", "DECLINED"]) {
    transport.reset();
    let invite = new FileUtils.File(getTestFilePath("data/repeat-event.eml"));
    let win = await openImipMessage(invite);
    await clickAction(win, "imipTentativeRecurrencesButton");

    await BrowserTestUtils.closeWindow(win);
    await doMajorExceptionTest({
      transport,
      identity,
      calendar,
      partStat,
    });
  }
});

/**
 * Tests a major update exception to an already declined event.
 */
add_task(async function testMajorExceptionToDeclinedWithResponse() {
  for (let partStat of ["ACCEPTED", "TENTATIVE", "DECLINED"]) {
    transport.reset();
    let invite = new FileUtils.File(getTestFilePath("data/repeat-event.eml"));
    let win = await openImipMessage(invite);
    await clickAction(win, "imipDeclineRecurrencesButton");

    await BrowserTestUtils.closeWindow(win);
    await doMajorExceptionTest({
      transport,
      identity,
      calendar,
      isRecurring: true,
      partStat,
    });
  }
});

/**
 * Tests a major update exception to an already accepted event without sending
 * a reply.
 */
add_task(async function testMajorExecptionToAcceptedWithoutResponse() {
  for (let partStat of ["ACCEPTED", "TENTATIVE", "DECLINED"]) {
    transport.reset();
    let invite = new FileUtils.File(getTestFilePath("data/repeat-event.eml"));
    let win = await openImipMessage(invite);
    await clickMenuAction(
      win,
      "imipAcceptRecurrencesButton",
      "imipAcceptRecurrencesButton_AcceptDontSend"
    );

    await BrowserTestUtils.closeWindow(win);
    await doMajorExceptionTest({
      transport,
      calendar,
      isRecurring: true,
      partStat,
      noReply: true,
    });
  }
});

/**
 * Tests a major update exception to an already tentatively accepted event
 * without sending a reply.
 */
add_task(async function testMajorUpdateToTentativeWithoutResponse() {
  for (let partStat of ["ACCEPTED", "TENTATIVE", "DECLINED"]) {
    transport.reset();
    let invite = new FileUtils.File(getTestFilePath("data/repeat-event.eml"));
    let win = await openImipMessage(invite);
    await clickMenuAction(
      win,
      "imipTentativeRecurrencesButton",
      "imipTentativeRecurrencesButton_TentativeDontSend"
    );

    await BrowserTestUtils.closeWindow(win);
    await doMajorExceptionTest({
      transport,
      calendar,
      isRecurring: true,
      partStat,
      noReply: true,
    });
  }
});

/**
 * Tests a major update exception to a declined event without sending a reply.
 */
add_task(async function testMajorUpdateToDeclinedWithoutResponse() {
  for (let partStat of ["ACCEPTED", "TENTATIVE", "DECLINED"]) {
    transport.reset();
    let invite = new FileUtils.File(getTestFilePath("data/repeat-event.eml"));
    let win = await openImipMessage(invite);
    await clickMenuAction(
      win,
      "imipDeclineRecurrencesButton",
      "imipDeclineRecurrencesButton_DeclineDontSend"
    );

    await BrowserTestUtils.closeWindow(win);
    await doMajorExceptionTest({
      transport,
      calendar,
      isRecurring: true,
      partStat,
      noReply: true,
    });
  }
});
