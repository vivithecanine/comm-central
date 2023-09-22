/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Test telemetry related to calendar.
 */

const { MailTelemetryForTests } = ChromeUtils.import("resource:///modules/MailGlue.jsm");
const { TelemetryTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TelemetryTestUtils.sys.mjs"
);

/**
 * Check that we're counting calendars and read only calendars.
 */
add_task(async function testCalendarCount() {
  Services.telemetry.clearScalars();

  const calendars = cal.manager.getCalendars();
  const homeCal = calendars.find(cal => cal.name == "Home");
  const readOnly = homeCal.readOnly;
  homeCal.readOnly = true;

  for (let i = 1; i <= 3; i++) {
    calendars[i] = CalendarTestUtils.createCalendar(`Mochitest ${i}`, "memory");
    if (i === 1 || i === 3) {
      calendars[i].readOnly = true;
    }
  }

  await MailTelemetryForTests.reportCalendars();

  const scalars = TelemetryTestUtils.getProcessScalars("parent", true);
  Assert.equal(
    scalars["tb.calendar.calendar_count"].memory,
    3,
    "Count of calendars must be correct."
  );
  Assert.equal(
    scalars["tb.calendar.read_only_calendar_count"].memory,
    2,
    "Count of readonly calendars must be correct."
  );

  Assert.ok(
    !scalars["tb.calendar.calendar_count"].storage,
    "'Home' calendar not included in count while disabled"
  );

  Assert.ok(
    !scalars["tb.calendar.read_only_calendar_count"].storage,
    "'Home' calendar not included in read-only count while disabled"
  );

  for (let i = 1; i <= 3; i++) {
    CalendarTestUtils.removeCalendar(calendars[i]);
  }
  homeCal.readOnly = readOnly;
});

/**
 * Ensure the "Home" calendar is not ignored if it has been used.
 */
add_task(async function testHomeCalendar() {
  const calendar = cal.manager.getCalendars().find(cal => cal.name == "Home");
  const readOnly = calendar.readOnly;
  const disabled = calendar.getProperty("disabled");

  // Test when enabled with no events.
  calendar.setProperty("disabled", false);
  calendar.readOnly = true;
  Services.telemetry.clearScalars();
  await MailTelemetryForTests.reportCalendars();

  let scalars = TelemetryTestUtils.getProcessScalars("parent", true);
  Assert.ok(!scalars["tb.calendar.calendar_count"], "'Home' calendar not counted when unused");
  Assert.ok(
    !scalars["tb.calendar.read_only_calendar_count"],
    "'Home' calendar not included in readonly count when unused"
  );

  // Now test with an event added to the calendar.
  calendar.readOnly = false;

  let event = new CalEvent();
  event.id = "bacd";
  event.title = "Test";
  event.startDate = cal.dtz.now();
  event = await calendar.addItem(event);

  calendar.readOnly = true;

  await TestUtils.waitForCondition(async () => {
    const result = await calendar.getItem("bacd");
    return result;
  }, "item added to calendar");

  Services.telemetry.clearScalars();
  await MailTelemetryForTests.reportCalendars();

  scalars = TelemetryTestUtils.getProcessScalars("parent", true);
  Assert.equal(
    scalars["tb.calendar.calendar_count"].storage,
    1,
    "'Home' calendar counted when there are items"
  );
  Assert.equal(
    scalars["tb.calendar.read_only_calendar_count"].storage,
    1,
    "'Home' calendar included in read-only count when used"
  );

  calendar.readOnly = false;
  await calendar.deleteItem(event);
  calendar.readOnly = readOnly;
  calendar.setProperty("disabled", disabled);
});
