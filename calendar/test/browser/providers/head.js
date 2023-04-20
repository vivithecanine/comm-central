/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

SimpleTest.requestCompleteLog();

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { CalendarTestUtils } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarTestUtils.jsm"
);
var { handleDeleteOccurrencePrompt } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarUtils.jsm"
);

var { saveAndCloseItemDialog, setData } = ChromeUtils.import(
  "resource://testing-common/calendar/ItemEditingHelpers.jsm"
);

let calendarObserver = {
  QueryInterface: ChromeUtils.generateQI(["calIObserver"]),

  /* calIObserver */

  _batchCount: 0,
  _batchRequired: true,
  onStartBatch(calendar) {
    info(`onStartBatch ${calendar?.id} ${++this._batchCount}`);
    Assert.equal(
      calendar,
      this._expectedCalendar,
      "onStartBatch should occur on the expected calendar"
    );
  },
  onEndBatch(calendar) {
    info(`onEndBatch ${calendar?.id} ${this._batchCount--}`);
    Assert.equal(
      calendar,
      this._expectedCalendar,
      "onEndBatch should occur on the expected calendar"
    );
  },
  onLoad(calendar) {
    info(`onLoad ${calendar.id}`);
    Assert.equal(calendar, this._expectedCalendar, "onLoad should occur on the expected calendar");
    if (this._onLoadPromise) {
      this._onLoadPromise.resolve();
    }
  },
  onAddItem(item) {
    info(`onAddItem ${item.calendar.id} ${item.id}`);
    if (this._batchRequired) {
      Assert.equal(this._batchCount, 1, "onAddItem must occur in a batch");
    }
  },
  onModifyItem(newItem, oldItem) {
    info(`onModifyItem ${newItem.calendar.id} ${newItem.id}`);
    if (this._batchRequired) {
      Assert.equal(this._batchCount, 1, "onModifyItem must occur in a batch");
    }
  },
  onDeleteItem(deletedItem) {
    info(`onDeleteItem ${deletedItem.calendar.id} ${deletedItem.id}`);
  },
  onError(calendar, errNo, message) {},
  onPropertyChanged(calendar, name, value, oldValue) {},
  onPropertyDeleting(calendar, name) {},
};

/**
 * Create and register a calendar.
 *
 * @param {string} type - The calendar provider to use.
 * @param {string} url - URL of the server.
 * @param {boolean} useCache - Should this calendar have offline storage?
 * @returns {calICalendar}
 */
function createCalendar(type, url, useCache) {
  let calendar = cal.manager.createCalendar(type, Services.io.newURI(url));
  calendar.name = type + (useCache ? " with cache" : " without cache");
  calendar.id = cal.getUUID();
  calendar.setProperty("cache.enabled", useCache);
  calendar.setProperty("calendar-main-default", true);

  cal.manager.registerCalendar(calendar);
  calendar = cal.manager.getCalendarById(calendar.id);
  calendarObserver._expectedCalendar = calendar;
  calendar.addObserver(calendarObserver);

  info(`Created calendar ${calendar.id}`);
  return calendar;
}

/**
 * Unregister a calendar.
 *
 * @param {calICalendar} calendar
 */
function removeCalendar(calendar) {
  calendar.removeObserver(calendarObserver);
  cal.manager.removeCalendar(calendar);
}

let alarmService = Cc["@mozilla.org/calendar/alarm-service;1"].getService(Ci.calIAlarmService);

let alarmObserver = {
  QueryInterface: ChromeUtils.generateQI(["calIAlarmServiceObserver"]),

  /* calIAlarmServiceObserver */

  _alarmCount: 0,
  onAlarm(item, alarm) {
    info("onAlarm");
    this._alarmCount++;
  },
  onRemoveAlarmsByItem(item) {},
  onRemoveAlarmsByCalendar(calendar) {},
  onAlarmsLoaded(calendar) {},
};
alarmService.addObserver(alarmObserver);
registerCleanupFunction(async () => {
  alarmService.removeObserver(alarmObserver);
});

/**
 * Tests the creation, firing, dismissal, modification and deletion of an event with an alarm.
 * Also checks that the number of events in the unifinder is correct at each stage.
 *
 * Passing this test requires the active calendar to fire notifications in the correct sequence.
 */
async function runTestAlarms() {
  let today = cal.dtz.now();
  let start = today.clone();
  start.day++;
  start.hour = start.minute = start.second = 0;
  let end = start.clone();
  end.hour++;
  let repeatUntil = start.clone();
  repeatUntil.day += 15;

  await CalendarTestUtils.setCalendarView(window, "multiweek");
  await CalendarTestUtils.goToToday(window);
  Assert.equal(window.unifinderTreeView.rowCount, 0, "unifinder event count");

  alarmObserver._alarmCount = 0;

  let alarmDialogPromise = BrowserTestUtils.promiseAlertDialog(
    undefined,
    "chrome://calendar/content/calendar-alarm-dialog.xhtml",
    {
      async callback(alarmWindow) {
        info("Alarm dialog opened");
        let alarmDocument = alarmWindow.document;

        let list = alarmDocument.getElementById("alarm-richlist");
        let items = list.querySelectorAll(`richlistitem[is="calendar-alarm-widget-richlistitem"]`);
        await TestUtils.waitForCondition(() => items.length);
        Assert.equal(items.length, 1);

        await new Promise(resolve => alarmWindow.setTimeout(resolve, 500));

        let dismissButton = alarmDocument.querySelector("#alarm-dismiss-all-button");
        EventUtils.synthesizeMouseAtCenter(dismissButton, {}, alarmWindow);
      },
    }
  );
  let { dialogWindow, iframeWindow } = await CalendarTestUtils.editNewEvent(window);
  await setData(dialogWindow, iframeWindow, {
    title: "test event",
    startdate: start,
    starttime: start,
    enddate: end,
    endtime: end,
    reminder: "2days",
    repeat: "weekly",
  });

  await saveAndCloseItemDialog(dialogWindow);
  await alarmDialogPromise;
  info("Alarm dialog closed");

  await new Promise(r => setTimeout(r, 2000));
  Assert.equal(window.unifinderTreeView.rowCount, 1, "there should be one event in the unifinder");

  Assert.equal(
    [...Services.wm.getEnumerator("Calendar:AlarmWindow")].length,
    0,
    "alarm dialog did not reappear"
  );
  Assert.equal(alarmObserver._alarmCount, 1, "only one alarm");
  alarmObserver._alarmCount = 0;

  let eventBox = await CalendarTestUtils.multiweekView.waitForItemAt(
    window,
    start.weekday == 0 ? 2 : 1, // Sunday's event is next week.
    start.weekday + 1,
    1
  );
  Assert.ok(!!eventBox.item.parentItem.alarmLastAck);

  ({ dialogWindow, iframeWindow } = await CalendarTestUtils.editItemOccurrences(window, eventBox));
  await setData(dialogWindow, iframeWindow, {
    title: "modified test event",
    repeat: "weekly",
    repeatuntil: repeatUntil,
  });

  await saveAndCloseItemDialog(dialogWindow);

  Assert.equal(window.unifinderTreeView.rowCount, 1, "there should be one event in the unifinder");

  Services.focus.focusedWindow = window;

  await new Promise(resolve => setTimeout(resolve, 2000));
  Assert.equal(
    [...Services.wm.getEnumerator("Calendar:AlarmWindow")].length,
    0,
    "alarm dialog should not reappear"
  );
  Assert.equal(alarmObserver._alarmCount, 0, "there should not be any remaining alarms");
  alarmObserver._alarmCount = 0;

  eventBox = await CalendarTestUtils.multiweekView.waitForItemAt(
    window,
    start.weekday == 0 ? 2 : 1, // Sunday's event is next week.
    start.weekday + 1,
    1
  );
  Assert.ok(!!eventBox.item.parentItem.alarmLastAck);

  EventUtils.synthesizeMouseAtCenter(eventBox, {}, window);
  eventBox.focus();
  window.calendarController.onSelectionChanged({ detail: window.currentView().getSelectedItems() });
  await handleDeleteOccurrencePrompt(window, window.currentView(), true);

  await CalendarTestUtils.multiweekView.waitForNoItemAt(
    window,
    start.weekday == 0 ? 2 : 1, // Sunday's event is next week.
    start.weekday + 1,
    1
  );
  Assert.equal(window.unifinderTreeView.rowCount, 0, "there should be no events in the unifinder");
}

let syncChangesTest = {
  async setUp() {
    await CalendarTestUtils.openCalendarTab(window);

    if (document.getElementById("today-pane-panel").collapsed) {
      EventUtils.synthesizeMouseAtCenter(
        document.getElementById("calendar-status-todaypane-button"),
        {}
      );
    }

    if (document.getElementById("agenda-panel").collapsed) {
      EventUtils.synthesizeMouseAtCenter(document.getElementById("today-pane-cycler-next"), {});
    }
  },

  get part1Item() {
    let today = cal.dtz.now();
    let start = today.clone();
    start.day += 9 - start.weekday;
    start.hour = 13;
    start.minute = start.second = 0;
    let end = start.clone();
    end.hour++;

    return CalendarTestUtils.dedent`
      BEGIN:VCALENDAR
      BEGIN:VEVENT
      UID:ad0850e5-8020-4599-86a4-86c90af4e2cd
      SUMMARY:holy cow, a new item!
      DTSTART:${start.icalString}
      DTEND:${end.icalString}
      END:VEVENT
      END:VCALENDAR
      `;
  },

  async runPart1() {
    await CalendarTestUtils.setCalendarView(window, "multiweek");
    await CalendarTestUtils.goToToday(window);

    Assert.ok(
      !CalendarTestUtils.multiweekView.getItemAt(window, 2, 3, 1),
      "there should be no existing item in the calendar"
    );

    calendarObserver._onLoadPromise = PromiseUtils.defer();
    EventUtils.synthesizeMouseAtCenter(document.getElementById("calendar-synchronize-button"), {});
    await calendarObserver._onLoadPromise;

    let item = await CalendarTestUtils.multiweekView.waitForItemAt(window, 2, 3, 1);
    Assert.equal(item.item.title, "holy cow, a new item!", "view should include newly-added item");

    await TestUtils.waitForCondition(() => window.TodayPane.agenda.rowCount == 1);
    let agendaItem = window.TodayPane.agenda.rows[0];
    Assert.equal(
      agendaItem.querySelector(".agenda-listitem-title").textContent,
      "holy cow, a new item!",
      "today pane should include newly-added item"
    );
    Assert.ok(
      !agendaItem.nextElementSibling,
      "there should be no additional items in the today pane"
    );
  },

  get part2Item() {
    let today = cal.dtz.now();
    let start = today.clone();
    start.day += 10 - start.weekday;
    start.hour = 9;
    start.minute = start.second = 0;
    let end = start.clone();
    end.hour++;

    return CalendarTestUtils.dedent`
      BEGIN:VCALENDAR
      BEGIN:VEVENT
      UID:ad0850e5-8020-4599-86a4-86c90af4e2cd
      SUMMARY:a changed item
      DTSTART:${start.icalString}
      DTEND:${end.icalString}
      END:VEVENT
      END:VCALENDAR
      `;
  },

  async runPart2() {
    Assert.ok(
      !CalendarTestUtils.multiweekView.getItemAt(window, 2, 4, 1),
      "there should be no existing item on the specified day"
    );

    calendarObserver._onLoadPromise = PromiseUtils.defer();
    EventUtils.synthesizeMouseAtCenter(document.getElementById("calendar-synchronize-button"), {});
    await calendarObserver._onLoadPromise;

    await CalendarTestUtils.multiweekView.waitForNoItemAt(window, 2, 3, 1);
    let item = await CalendarTestUtils.multiweekView.waitForItemAt(window, 2, 4, 1);
    Assert.equal(item.item.title, "a changed item");

    await TestUtils.waitForCondition(() => window.TodayPane.agenda.rowCount == 1);
    let agendaItem = window.TodayPane.agenda.rows[0];
    Assert.equal(agendaItem.querySelector(".agenda-listitem-title").textContent, "a changed item");
    Assert.ok(!agendaItem.nextElementSibling);
  },

  async runPart3() {
    calendarObserver._onLoadPromise = PromiseUtils.defer();
    await calendarListContextMenu(
      document.querySelector("#calendar-list > li:nth-child(2)"),
      "list-calendar-context-reload"
    );
    await calendarObserver._onLoadPromise;

    await CalendarTestUtils.multiweekView.waitForNoItemAt(window, 2, 3, 1);
    await CalendarTestUtils.multiweekView.waitForNoItemAt(window, 2, 4, 1);

    await TestUtils.waitForCondition(() => window.TodayPane.agenda.rowCount == 0);
  },
};

async function calendarListContextMenu(target, menuItem) {
  await new Promise(r => setTimeout(r));
  window.focus();
  await TestUtils.waitForCondition(
    () => Services.focus.focusedWindow == window,
    "waiting for window to be focused"
  );

  let contextMenu = document.getElementById("list-calendars-context-menu");
  let shownPromise = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(target, { type: "contextmenu" });
  await shownPromise;

  if (menuItem) {
    let hiddenPromise = BrowserTestUtils.waitForEvent(contextMenu, "popuphidden");
    contextMenu.activateItem(document.getElementById(menuItem));
    await hiddenPromise;
  }
}
