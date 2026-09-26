import assert from "node:assert/strict";
import test from "node:test";

import {
  formatThaiDateLong,
  formatThaiDateShort,
  formatThaiDateWithWeekday,
  formatThaiMonthYear,
  formatThaiTime,
  formatThaiWeekdayShort,
} from "../src/lib/thaiDateTimePresentation";

test("formats Gregorian 2026 dates with the Buddhist Era year and Thai month names", () => {
  const canonicalDate = "2026-09-26";

  assert.equal(formatThaiDateLong(canonicalDate), "26 กันยายน 2569");
  assert.equal(formatThaiDateShort(canonicalDate), "26 ก.ย. 2569");
  assert.equal(
    formatThaiDateWithWeekday(canonicalDate),
    "วันเสาร์ที่ 26 กันยายน 2569",
  );
  assert.equal(formatThaiMonthYear(canonicalDate), "กันยายน 2569");
  assert.match(formatThaiWeekdayShort(canonicalDate), /^(?:ส\.|เสาร์)$/);
  assert.equal(canonicalDate, "2026-09-26");
});

test("formats Bangkok wall-clock times as 24-hour Thai times without AM or PM", () => {
  const formatted = formatThaiTime("09:00");

  assert.equal(formatted, "09:00 น.");
  assert.doesNotMatch(formatted, /\b(?:AM|PM)\b/i);
});

test("formats instants in Asia/Bangkok", () => {
  const instant = new Date("2026-09-26T02:00:00.000Z");
  const bangkokMidnight = new Date("2026-09-25T17:00:00.000Z");

  assert.equal(formatThaiDateLong(instant), "26 กันยายน 2569");
  assert.equal(formatThaiTime(instant), "09:00 น.");
  assert.equal(formatThaiDateLong(bangkokMidnight), "26 กันยายน 2569");
});

test("formats midnight on the 24-hour clock", () => {
  assert.equal(formatThaiTime("00:00"), "00:00 น.");
});

test("does not normalize invalid canonical dates or malformed clock values", () => {
  assert.equal(formatThaiDateLong("2026-02-30"), "—");
  assert.equal(formatThaiTime("25:00"), "—");
  assert.equal(formatThaiTime("9:00"), "—");
});
