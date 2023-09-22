/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for receiving minor and major updates to invitations via the imip-bar.
 */

"use strict";

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
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
add_setup(async function () {
  requestLongerTimeout(5);
  const account = MailServices.accounts.createAccount();
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

  const getImipTransport = cal.itip.getImipTransport;
  cal.itip.getImipTransport = () => transport;

  const deleteMgr = Cc["@mozilla.org/calendar/deleted-items-manager;1"].getService(
    Ci.calIDeletedItems
  ).wrappedJSObject;
  const markDeleted = deleteMgr.markDeleted;
  deleteMgr.markDeleted = () => {};

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, true);
    cal.itip.getImipTransport = getImipTransport;
    deleteMgr.markDeleted = markDeleted;
    CalendarTestUtils.removeCalendar(calendar);
  });
});

/**
 * Tests a minor update to an already accepted event.
 */
add_task(async function testMinorUpdateToAccepted() {
  transport.reset();
  const invite = new FileUtils.File(getTestFilePath("data/single-event.eml"));
  const win = await openImipMessage(invite);
  await clickAction(win, "imipAcceptButton");

  await BrowserTestUtils.closeWindow(win);
  await doMinorUpdateTest({
    transport,
    calendar,
    partStat: "ACCEPTED",
  });
});

/**
 * Tests a minor update to an already tentatively accepted event.
 */
add_task(async function testMinorUpdateToTentative() {
  transport.reset();
  const invite = new FileUtils.File(getTestFilePath("data/single-event.eml"));
  const win = await openImipMessage(invite);
  await clickAction(win, "imipTentativeButton");

  await BrowserTestUtils.closeWindow(win);
  await doMinorUpdateTest({ transport, calendar, invite, partStat: "TENTATIVE" });
});

/**
 * Tests a minor update to an already declined event.
 */
add_task(async function testMinorUpdateToDeclined() {
  transport.reset();
  const invite = new FileUtils.File(getTestFilePath("data/single-event.eml"));
  const win = await openImipMessage(invite);
  await clickAction(win, "imipDeclineButton");

  await BrowserTestUtils.closeWindow(win);
  await doMinorUpdateTest({ transport, calendar, invite, partStat: "DECLINED" });
});

/**
 * Tests a major update to an already accepted event.
 */
add_task(async function testMajorUpdateToAcceptedWithResponse() {
  for (const partStat of ["ACCEPTED", "TENTATIVE", "DECLINED"]) {
    transport.reset();
    const invite = new FileUtils.File(getTestFilePath("data/single-event.eml"));
    const win = await openImipMessage(invite);
    await clickAction(win, "imipAcceptButton");

    await BrowserTestUtils.closeWindow(win);
    await doMajorUpdateTest({
      transport,
      identity,
      calendar,
      partStat,
    });
  }
});

/**
 * Tests a major update to an already tentatively accepted event.
 */
add_task(async function testMajorUpdateToTentativeWithResponse() {
  for (const partStat of ["ACCEPTED", "TENTATIVE", "DECLINED"]) {
    transport.reset();
    const invite = new FileUtils.File(getTestFilePath("data/single-event.eml"));
    const win = await openImipMessage(invite);
    await clickAction(win, "imipTentativeButton");

    await BrowserTestUtils.closeWindow(win);
    await doMajorUpdateTest({
      transport,
      identity,
      calendar,
      partStat,
    });
  }
});

/**
 * Tests a major update to an already declined event.
 */
add_task(async function testMajorUpdateToDeclinedWithResponse() {
  for (const partStat of ["ACCEPTED", "TENTATIVE", "DECLINED"]) {
    transport.reset();
    const invite = new FileUtils.File(getTestFilePath("data/single-event.eml"));
    const win = await openImipMessage(invite);
    await clickAction(win, "imipDeclineButton");

    await BrowserTestUtils.closeWindow(win);
    await doMajorUpdateTest({
      transport,
      identity,
      calendar,
      partStat,
    });
  }
});

/**
 * Tests a major update to an already accepted event without replying to the
 * update.
 */
add_task(async function testMajorUpdateToAcceptedWithoutResponse() {
  for (const partStat of ["ACCEPTED", "TENTATIVE", "DECLINED"]) {
    transport.reset();
    const invite = new FileUtils.File(getTestFilePath("data/single-event.eml"));
    const win = await openImipMessage(invite);
    await clickAction(win, "imipAcceptButton");

    await BrowserTestUtils.closeWindow(win);
    await doMajorUpdateTest({
      transport,
      calendar,
      partStat,
      noReply: true,
    });
  }
});

/**
 * Tests a major update to an already tentatively accepted event without replying
 * to the update.
 */
add_task(async function testMajorUpdateToTentativeWithoutResponse() {
  for (const partStat of ["ACCEPTED", "TENTATIVE", "DECLINED"]) {
    transport.reset();
    const invite = new FileUtils.File(getTestFilePath("data/single-event.eml"));
    const win = await openImipMessage(invite);
    await clickAction(win, "imipTentativeButton");

    await BrowserTestUtils.closeWindow(win);
    await doMajorUpdateTest({
      transport,
      calendar,
      partStat,
      noReply: true,
    });
  }
});

/**
 * Tests a major update to an already declined event.
 */
add_task(async function testMajorUpdateToDeclinedWithoutResponse() {
  for (const partStat of ["ACCEPTED", "TENTATIVE", "DECLINED"]) {
    transport.reset();
    const invite = new FileUtils.File(getTestFilePath("data/single-event.eml"));
    const win = await openImipMessage(invite);
    await clickAction(win, "imipDeclineButton");

    await BrowserTestUtils.closeWindow(win);
    await doMajorUpdateTest({
      transport,
      calendar,
      partStat,
      noReply: true,
    });
  }
});
