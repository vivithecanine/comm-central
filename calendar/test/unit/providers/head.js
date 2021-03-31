/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { CalendarTestUtils } = ChromeUtils.import(
  "resource://testing-common/mozmill/CalendarTestUtils.jsm"
);
var { CalEvent } = ChromeUtils.import("resource:///modules/CalEvent.jsm");
var { PromiseUtils } = ChromeUtils.import("resource://gre/modules/PromiseUtils.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

// The tests in this directory each do the same thing, with slight variations as needed for each
// calendar provider. The core of the test lives in this file and the tests call it when ready.

let manager = cal.getCalendarManager();

do_get_profile();
add_task(async () => {
  await new Promise(resolve => manager.startup({ onResult: resolve }));
  await new Promise(resolve => cal.getTimezoneService().startup({ onResult: resolve }));
  manager.addCalendarObserver(calendarObserver);
});

let calendarObserver = {
  QueryInterface: ChromeUtils.generateQI(["calIObserver"]),

  /* calIObserver */

  _batchCount: 0,
  _batchRequired: true,
  onStartBatch() {
    info(`onStartBatch ${++this._batchCount}`);
    Assert.equal(this._batchCount, 1, "onStartBatch must not occur in a batch");
  },
  onEndBatch() {
    info(`onEndBatch ${this._batchCount--}`);
    Assert.equal(this._batchCount, 0, "onEndBatch must occur in a batch");
  },
  onLoad(calendar) {
    info(`onLoad ${calendar.id}`);
    Assert.equal(this._batchCount, 0, "onLoad must not occur in a batch");
    if (this._onLoadPromise) {
      this._onLoadPromise.resolve();
    }
  },
  onAddItem(item) {
    info(`onAddItem ${item.calendar.id} ${item.id}`);
    if (this._batchRequired) {
      Assert.equal(this._batchCount, 1, "onAddItem must occur in a batch");
    }
    if (this._onAddItemPromise) {
      this._onAddItemPromise.resolve();
    }
  },
  onModifyItem(newItem, oldItem) {
    info(`onModifyItem ${newItem.calendar.id} ${newItem.id}`);
    if (this._batchRequired) {
      Assert.equal(this._batchCount, 1, "onModifyItem must occur in a batch");
    }
    if (this._onModifyItemPromise) {
      this._onModifyItemPromise.resolve();
    }
  },
  onDeleteItem(deletedItem) {
    info(`onDeleteItem ${deletedItem.calendar.id} ${deletedItem.id}`);
    if (this._onDeleteItemPromise) {
      this._onDeleteItemPromise.resolve();
    }
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
  let calendar = manager.createCalendar(type, Services.io.newURI(url));
  calendar.name = type + (useCache ? " with cache" : " without cache");
  calendar.id = cal.getUUID();
  calendar.setProperty("cache.enabled", useCache);

  manager.registerCalendar(calendar);
  calendar = manager.getCalendarById(calendar.id);
  return calendar;
}

/**
 * Wraps calICalendar's getItem method in a Promise.
 *
 * @param {calICalendar} calendar
 * @param {string} uid
 * @returns {Promise} - resolves to calIItemBase or null
 */
function getItem(calendar, uid) {
  return new Promise(resolve => {
    calendar.getItem(uid, {
      _item: null,
      onGetResult(c, status, itemType, detail, items) {
        this._item = items[0];
      },
      onOperationComplete() {
        resolve(this._item);
      },
    });
  });
}

/**
 * Creates an event and adds it to the given calendar.
 *
 * @param {calICalendar} calendar
 * @returns {calIEvent}
 */
async function runAddItem(calendar) {
  let event = new CalEvent();
  event.id = "6b7dd6f6-d6f0-4e93-a953-bb5473c4c47a";
  event.title = "New event";
  event.startDate = cal.createDateTime("20200303T205500Z");
  event.endDate = cal.createDateTime("20200303T210200Z");

  calendarObserver._onAddItemPromise = PromiseUtils.defer();
  calendarObserver._onModifyItemPromise = PromiseUtils.defer();
  calendar.addItem(event, null);
  await Promise.any([
    calendarObserver._onAddItemPromise.promise,
    calendarObserver._onModifyItemPromise.promise,
  ]);

  return event;
}

/**
 * Modifies the event from runAddItem.
 *
 * @param {calICalendar} calendar
 */
async function runModifyItem(calendar) {
  let event = await getItem(calendar, "6b7dd6f6-d6f0-4e93-a953-bb5473c4c47a");

  let clone = event.clone();
  clone.title = "Modified event";

  calendarObserver._onModifyItemPromise = PromiseUtils.defer();
  calendar.modifyItem(clone, event, null);
  await calendarObserver._onModifyItemPromise.promise;
}

/**
 * Deletes the event from runAddItem.
 *
 * @param {calICalendar} calendar
 */
async function runDeleteItem(calendar) {
  let event = await getItem(calendar, "6b7dd6f6-d6f0-4e93-a953-bb5473c4c47a");

  calendarObserver._onDeleteItemPromise = PromiseUtils.defer();
  calendar.deleteItem(event, null);
  await calendarObserver._onDeleteItemPromise.promise;
}
