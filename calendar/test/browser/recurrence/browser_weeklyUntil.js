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
  helpersForController,
  invokeNewEventDialog,
  switchToView,
  viewForward,
} = ChromeUtils.import("resource://testing-common/mozmill/CalendarUtils.jsm");

var elib = ChromeUtils.import("resource://testing-common/mozmill/elementslib.jsm");

var { menulistSelect, saveAndCloseItemDialog, setData } = ChromeUtils.import(
  "resource://testing-common/mozmill/ItemEditingHelpers.jsm"
);

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

var { dayView, weekView, multiweekView, monthView } = CalendarTestUtils;

const ENDDATE = cal.createDateTime("20090126T000000Z"); // Last Monday in month.
const HOUR = 8;

add_task(async function testWeeklyUntilRecurrence() {
  createCalendar(controller, CALENDARNAME);
  switchToView(controller, "day");
  goToDate(controller, 2009, 1, 5); // Monday

  // Create weekly recurring event.
  let eventBox = dayView.getHourBox(controller.window, HOUR);
  await invokeNewEventDialog(controller, eventBox, async (eventWindow, iframeWindow) => {
    await setData(eventWindow, iframeWindow, { title: "Event", repeat: setRecurrence });
    saveAndCloseItemDialog(eventWindow);
  });

  // Check day view.
  for (let week = 0; week < 3; week++) {
    // Monday
    await dayView.waitForEventBox(controller.window);
    viewForward(controller, 2);

    // Wednesday
    await dayView.waitForEventBox(controller.window);
    viewForward(controller, 2);

    // Friday
    await dayView.waitForEventBox(controller.window);
    viewForward(controller, 3);
  }

  // Monday, last occurrence
  await dayView.waitForEventBox(controller.window);
  viewForward(controller, 2);

  // Wednesday
  await dayView.waitForNoEvents(controller.window);

  // Check week view.
  switchToView(controller, "week");
  goToDate(controller, 2009, 1, 5);
  for (let week = 0; week < 3; week++) {
    // Monday
    await weekView.waitForEventBox(controller.window, 2);

    // Wednesday
    await weekView.waitForEventBox(controller.window, 4);

    // Friday
    await weekView.waitForEventBox(controller.window, 6);

    viewForward(controller, 1);
  }

  // Monday, last occurrence
  await weekView.waitForEventBox(controller.window, 2);
  // Wednesday
  await weekView.waitForNoEvents(controller.window, 4);

  // Check multiweek view.
  switchToView(controller, "multiweek");
  goToDate(controller, 2009, 1, 5);
  for (let week = 1; week < 4; week++) {
    // Monday
    await multiweekView.waitForItemAt(controller.window, week, 2);
    // Wednesday
    await multiweekView.waitForItemAt(controller.window, week, 4);
    // Friday
    await multiweekView.waitForItemAt(controller.window, week, 6);
  }

  // Monday, last occurrence
  await multiweekView.waitForItemAt(controller.window, 4, 2);

  // Wednesday
  await multiweekView.waitForNoItemsAt(controller.window, 4, 4);

  // Check month view.
  switchToView(controller, "month");
  goToDate(controller, 2009, 1, 5);
  // starts on week 2 in month-view
  for (let week = 2; week < 5; week++) {
    // Monday
    await monthView.waitForItemAt(controller.window, week, 2);
    // Wednesday
    await monthView.waitForItemAt(controller.window, week, 4);
    // Friday
    await monthView.waitForItemAt(controller.window, week, 6);
  }

  // Monday, last occurrence
  await monthView.waitForItemAt(controller.window, 5, 2);

  // Wednesday
  await monthView.waitForNoItemsAt(controller.window, 5, 4);

  // Delete event.
  let box = new elib.Elem(monthView.getItemAt(controller.window, 2, 2));
  controller.click(box);
  handleOccurrencePrompt(controller, box, "delete", true);
  await monthView.waitForNoItemsAt(controller.window, 2, 2);

  Assert.ok(true, "Test ran to completion");
});

async function setRecurrence(recurrenceWindow) {
  let recurrenceDocument = recurrenceWindow.document;

  // weekly
  await menulistSelect(recurrenceDocument.getElementById("period-list"), "1");

  let mon = cal.l10n.getDateFmtString("day.2.Mmm");
  let wed = cal.l10n.getDateFmtString("day.4.Mmm");
  let fri = cal.l10n.getDateFmtString("day.6.Mmm");

  let dayPicker = recurrenceDocument.getElementById("daypicker-weekday");

  // Starting from Monday so it should be checked.
  Assert.ok(dayPicker.querySelector(`[label="${mon}"]`).checked, "mon checked");
  // Check Wednesday and Friday too.
  EventUtils.synthesizeMouseAtCenter(
    dayPicker.querySelector(`[label="${wed}"]`),
    {},
    recurrenceWindow
  );
  EventUtils.synthesizeMouseAtCenter(
    dayPicker.querySelector(`[label="${fri}"]`),
    {},
    recurrenceWindow
  );

  // Set until date.
  EventUtils.synthesizeMouseAtCenter(
    recurrenceDocument.getElementById("recurrence-range-until"),
    {},
    recurrenceWindow
  );

  // Delete previous date.
  let untilInput = recurrenceDocument.getElementById("repeat-until-date");
  untilInput.focus();
  EventUtils.synthesizeKey("a", { accelKey: true }, recurrenceWindow);
  untilInput.focus();
  EventUtils.synthesizeKey("VK_DELETE", {}, recurrenceWindow);

  let endDateString = cal.dtz.formatter.formatDateShort(ENDDATE);
  EventUtils.sendString(endDateString, recurrenceWindow);

  // Move focus to ensure the date is selected.
  untilInput.focus();
  EventUtils.synthesizeKey("VK_TAB", {}, recurrenceWindow);

  // Close dialog.
  EventUtils.synthesizeMouseAtCenter(
    recurrenceDocument.querySelector("dialog").getButton("accept"),
    {},
    recurrenceWindow
  );
}

registerCleanupFunction(function teardownModule() {
  deleteCalendars(controller, CALENDARNAME);
  closeAllEventDialogs();
});
