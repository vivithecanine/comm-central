/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {
  CALENDARNAME,
  closeAllEventDialogs,
  controller,
  createCalendar,
  deleteCalendars,
  goToDate,
  handleOccurrencePrompt,
} = ChromeUtils.import("resource://testing-common/calendar/CalendarUtils.jsm");

var { saveAndCloseItemDialog, setData } = ChromeUtils.import(
  "resource://testing-common/calendar/ItemEditingHelpers.jsm"
);

var { dayView, weekView, multiweekView, monthView } = CalendarTestUtils;

const HOUR = 8;

add_task(async function testBiweeklyRecurrence() {
  createCalendar(controller, CALENDARNAME);
  await CalendarTestUtils.setCalendarView(window, "day");
  await goToDate(window, 2009, 1, 31);

  // Create biweekly event.
  let eventBox = dayView.getHourBoxAt(controller.window, HOUR);
  let { dialogWindow, iframeWindow } = await CalendarTestUtils.editNewEvent(window, eventBox);
  await setData(dialogWindow, iframeWindow, { title: "Event", repeat: "bi.weekly" });
  await saveAndCloseItemDialog(dialogWindow);

  // Check day view.
  await CalendarTestUtils.setCalendarView(window, "day");
  for (let i = 0; i < 4; i++) {
    await dayView.waitForEventBoxAt(controller.window, 1);
    await CalendarTestUtils.calendarViewForward(window, 14);
  }

  // Check week view.
  await CalendarTestUtils.setCalendarView(window, "week");
  await goToDate(window, 2009, 1, 31);

  for (let i = 0; i < 4; i++) {
    await weekView.waitForEventBoxAt(controller.window, 7, 1);
    await CalendarTestUtils.calendarViewForward(window, 2);
  }

  // Check multiweek view.
  await CalendarTestUtils.setCalendarView(window, "multiweek");
  await goToDate(window, 2009, 1, 31);

  // Always two occurrences in view, 1st and 3rd or 2nd and 4th week.
  for (let i = 0; i < 5; i++) {
    await multiweekView.waitForItemAt(controller.window, (i % 2) + 1, 7, 1);
    Assert.ok(multiweekView.getItemAt(controller.window, (i % 2) + 3, 7, 1));
    await CalendarTestUtils.calendarViewForward(window, 1);
  }

  // Check month view.
  await CalendarTestUtils.setCalendarView(window, "month");
  await goToDate(window, 2009, 1, 31);

  // January
  await monthView.waitForItemAt(controller.window, 5, 7, 1);
  await CalendarTestUtils.calendarViewForward(window, 1);

  // February
  await monthView.waitForItemAt(controller.window, 2, 7, 1);
  Assert.ok(monthView.getItemAt(controller.window, 4, 7, 1));
  await CalendarTestUtils.calendarViewForward(window, 1);

  // March
  await monthView.waitForItemAt(controller.window, 2, 7, 1);

  let box = monthView.getItemAt(controller.window, 4, 7, 1);
  Assert.ok(box);

  // Delete event.
  controller.click(box);
  handleOccurrencePrompt(controller, box, "delete", true);

  await monthView.waitForNoItemAt(controller.window, 4, 7, 1);

  Assert.ok(true, "Test ran to completion");
});

registerCleanupFunction(function teardownModule() {
  deleteCalendars(controller, CALENDARNAME);
  closeAllEventDialogs();
});
