/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {
  CALENDARNAME,
  CANVAS_BOX,
  EVENTPATH,
  EVENT_BOX,
  closeAllEventDialogs,
  controller,
  createCalendar,
  deleteCalendars,
  goToDate,
  handleOccurrencePrompt,
  helpersForController,
  invokeNewEventDialog,
  switchToView,
  viewForward,
} = ChromeUtils.import("resource://testing-common/mozmill/CalendarUtils.jsm");

var { saveAndCloseItemDialog, setData } = ChromeUtils.import(
  "resource://testing-common/mozmill/ItemEditingHelpers.jsm"
);

var { lookupEventBox } = helpersForController(controller);

const HOUR = 8;

add_task(async function testBiweeklyRecurrence() {
  createCalendar(controller, CALENDARNAME);
  switchToView(controller, "day");
  goToDate(controller, 2009, 1, 31);

  // Create biweekly event.
  let eventBox = lookupEventBox("day", CANVAS_BOX, null, 1, HOUR);
  await invokeNewEventDialog(controller, eventBox, async (eventWindow, iframeWindow) => {
    await setData(eventWindow, iframeWindow, { title: "Event", repeat: "bi.weekly" });
    saveAndCloseItemDialog(eventWindow);
  });

  // Check day view.
  switchToView(controller, "day");
  for (let i = 0; i < 4; i++) {
    controller.waitForElement(lookupEventBox("day", EVENT_BOX, null, 1, null, EVENTPATH));
    viewForward(controller, 14);
  }

  // Check week view.
  switchToView(controller, "week");
  goToDate(controller, 2009, 1, 31);

  for (let i = 0; i < 4; i++) {
    controller.waitForElement(lookupEventBox("week", EVENT_BOX, null, 7, null, EVENTPATH));
    viewForward(controller, 2);
  }

  // Check multiweek view.
  switchToView(controller, "multiweek");
  goToDate(controller, 2009, 1, 31);

  // Always two occurrences in view, 1st and 3rd or 2nd and 4th week.
  for (let i = 0; i < 5; i++) {
    controller.waitForElement(
      lookupEventBox("multiweek", CANVAS_BOX, (i % 2) + 1, 7, null, EVENTPATH)
    );
    Assert.ok(lookupEventBox("multiweek", CANVAS_BOX, (i % 2) + 3, 7, null, EVENTPATH).exists());
    viewForward(controller, 1);
  }

  // Check month view.
  switchToView(controller, "month");
  goToDate(controller, 2009, 1, 31);

  // January
  controller.waitForElement(lookupEventBox("month", CANVAS_BOX, 5, 7, null, EVENTPATH));
  viewForward(controller, 1);

  // February
  controller.waitForElement(lookupEventBox("month", CANVAS_BOX, 2, 7, null, EVENTPATH));
  Assert.ok(lookupEventBox("month", CANVAS_BOX, 4, 7, null, EVENTPATH).exists());
  viewForward(controller, 1);

  // March
  controller.waitForElement(lookupEventBox("month", CANVAS_BOX, 2, 7, null, EVENTPATH));
  Assert.ok(lookupEventBox("month", CANVAS_BOX, 4, 7, null, EVENTPATH).exists());

  // Delete event.
  let box = lookupEventBox("month", CANVAS_BOX, 4, 7, null, EVENTPATH);
  controller.click(box);
  handleOccurrencePrompt(controller, box, "delete", true);
  controller.waitForElementNotPresent(box);

  Assert.ok(true, "Test ran to completion");
});

registerCleanupFunction(function teardownModule() {
  deleteCalendars(controller, CALENDARNAME);
  closeAllEventDialogs();
});
