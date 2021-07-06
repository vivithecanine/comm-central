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

const STARTYEAR = 1950;
const EPOCH = 1970;

add_task(async function testAnnualRecurrence() {
  createCalendar(controller, CALENDARNAME);
  await CalendarTestUtils.setCalendarView(window, "day");
  await goToDate(window, STARTYEAR, 1, 1);

  // Create yearly recurring all-day event.
  let eventBox = dayView.getAllDayHeader(window);
  let { dialogWindow, iframeWindow } = await CalendarTestUtils.editNewEvent(window, eventBox);
  await setData(dialogWindow, iframeWindow, { title: "Event", repeat: "yearly" });
  await saveAndCloseItemDialog(dialogWindow);

  let checkYears = [STARTYEAR, STARTYEAR + 1, EPOCH - 1, EPOCH, EPOCH + 1];
  for (let year of checkYears) {
    await goToDate(window, year, 1, 1);
    let date = new Date(Date.UTC(year, 0, 1));
    let column = date.getUTCDay() + 1;

    // day view
    await CalendarTestUtils.setCalendarView(window, "day");
    await dayView.waitForAllDayItemAt(window, 1);

    // week view
    await CalendarTestUtils.setCalendarView(window, "week");
    await weekView.waitForAllDayItemAt(window, column, 1);

    // multiweek view
    await CalendarTestUtils.setCalendarView(window, "multiweek");
    await multiweekView.waitForItemAt(window, 1, column, 1);

    // month view
    await CalendarTestUtils.setCalendarView(window, "month");
    await monthView.waitForItemAt(window, 1, column, 1);
  }

  // Delete event.
  await goToDate(window, checkYears[0], 1, 1);
  await CalendarTestUtils.setCalendarView(window, "day");
  const box = await dayView.waitForAllDayItemAt(window, 1);
  controller.click(box);
  handleOccurrencePrompt(controller, box, "delete", true);
  await TestUtils.waitForCondition(() => !dayView.getAllDayItemAt(window, 1), "No all-day events");

  Assert.ok(true, "Test ran to completion");
});

registerCleanupFunction(function teardownModule() {
  deleteCalendars(controller, CALENDARNAME);
  closeAllEventDialogs();
});
