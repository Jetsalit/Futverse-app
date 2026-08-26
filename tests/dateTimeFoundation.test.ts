import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateAgeFromDateOnly,
  calendarDateInTimeZone,
  isSameCalendarDateInTimeZone,
  parseCanonicalDateOnly,
} from "../src/lib/dateTimeFoundation";

test("1. canonical date-only parsing accepts exact Gregorian YYYY-MM-DD", () => {
  assert.deepEqual(
    parseCanonicalDateOnly("2026-08-25"),
    {
      year: 2026,
      month: 8,
      day: 25,
    },
  );

  assert.equal(
    parseCanonicalDateOnly("2026-8-25"),
    null,
  );

  assert.equal(
    parseCanonicalDateOnly("25/08/2026"),
    null,
  );

  assert.equal(
    parseCanonicalDateOnly(""),
    null,
  );
});

test("2. canonical date-only validation rejects impossible calendar dates", () => {
  assert.equal(
    parseCanonicalDateOnly("2026-02-29"),
    null,
  );

  assert.deepEqual(
    parseCanonicalDateOnly("2028-02-29"),
    {
      year: 2028,
      month: 2,
      day: 29,
    },
  );

  assert.equal(
    parseCanonicalDateOnly("2026-04-31"),
    null,
  );

  assert.equal(
    parseCanonicalDateOnly("2026-13-01"),
    null,
  );
});

test("3. leap-year rules preserve Gregorian calendar semantics", () => {
  assert.equal(
    parseCanonicalDateOnly("1900-02-29"),
    null,
  );

  assert.deepEqual(
    parseCanonicalDateOnly("2000-02-29"),
    {
      year: 2000,
      month: 2,
      day: 29,
    },
  );
});

test("4. age is calculated from calendar parts rather than elapsed milliseconds", () => {
  assert.equal(
    calculateAgeFromDateOnly(
      "2009-02-18",
      "2026-02-17",
    ),
    16,
  );

  assert.equal(
    calculateAgeFromDateOnly(
      "2009-02-18",
      "2026-02-18",
    ),
    17,
  );

  assert.equal(
    calculateAgeFromDateOnly(
      "2009-02-18",
      "2026-08-25",
    ),
    17,
  );
});

test("5. future DOB and invalid date-only inputs fail closed", () => {
  assert.equal(
    calculateAgeFromDateOnly(
      "2027-01-01",
      "2026-08-25",
    ),
    null,
  );

  assert.equal(
    calculateAgeFromDateOnly(
      "invalid",
      "2026-08-25",
    ),
    null,
  );

  assert.equal(
    calculateAgeFromDateOnly(
      "2009-02-18",
      "invalid",
    ),
    null,
  );
});

test("6. calendar today is derived in the requested timezone, not from UTC ISO date", () => {
  const instant =
    new Date("2026-08-24T18:30:00.000Z");

  assert.equal(
    calendarDateInTimeZone(
      instant,
      "Asia/Bangkok",
    ),
    "2026-08-25",
  );

  assert.equal(
    calendarDateInTimeZone(
      instant,
      "UTC",
    ),
    "2026-08-24",
  );
});

test("7. same-calendar-day comparison respects the explicit timezone boundary", () => {
  const first =
    new Date("2026-08-24T17:10:00.000Z");

  const second =
    new Date("2026-08-25T16:59:00.000Z");

  assert.equal(
    isSameCalendarDateInTimeZone(
      first,
      second,
      "Asia/Bangkok",
    ),
    true,
  );

  assert.equal(
    isSameCalendarDateInTimeZone(
      first,
      second,
      "UTC",
    ),
    false,
  );
});
test("8. canonical parser remains strict against whitespace and localized digits", () => {
  assert.equal(
    parseCanonicalDateOnly(" 2026-08-25"),
    null,
  );

  assert.equal(
    parseCanonicalDateOnly("2026-08-25 "),
    null,
  );

  assert.equal(
    parseCanonicalDateOnly("๒๐๒๖-๐๘-๒๕"),
    null,
  );
});

test("9. timezone conversion fails closed for invalid Date and invalid timezone", () => {
  assert.equal(
    calendarDateInTimeZone(
      new Date(Number.NaN),
      "Asia/Bangkok",
    ),
    null,
  );

  assert.equal(
    calendarDateInTimeZone(
      new Date("2026-08-25T00:00:00.000Z"),
      "Invalid/FutVerse-TimeZone",
    ),
    null,
  );
});

test("10. explicit timezone preserves the Gregorian calendar across a year boundary", () => {
  const instant =
    new Date("2026-12-31T17:00:00.000Z");

  assert.equal(
    calendarDateInTimeZone(
      instant,
      "Asia/Bangkok",
    ),
    "2027-01-01",
  );

  assert.equal(
    calendarDateInTimeZone(
      instant,
      "UTC",
    ),
    "2026-12-31",
  );
});

test("11. same-calendar comparison fails closed when an input or timezone is invalid", () => {
  const valid =
    new Date("2026-08-25T00:00:00.000Z");

  assert.equal(
    isSameCalendarDateInTimeZone(
      new Date(Number.NaN),
      valid,
      "Asia/Bangkok",
    ),
    false,
  );

  assert.equal(
    isSameCalendarDateInTimeZone(
      valid,
      valid,
      "Invalid/FutVerse-TimeZone",
    ),
    false,
  );
});

test("12. leap-day age changes on the leap birthday using calendar parts", () => {
  assert.equal(
    calculateAgeFromDateOnly(
      "2008-02-29",
      "2028-02-28",
    ),
    19,
  );

  assert.equal(
    calculateAgeFromDateOnly(
      "2008-02-29",
      "2028-02-29",
    ),
    20,
  );
});