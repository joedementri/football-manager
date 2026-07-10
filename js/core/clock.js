// core/clock.js — pure calendar-date arithmetic, shared by core/db.js
// (save serialization) and engine/calendar.js (season schedule + Advance).
// Listed in fable-plans/plan1.md's file layout as "core/ ... clock.js";
// M3 is the first milestone that needs real date math beyond display
// formatting (core/format.js), so this is where it lands.
//
// Dates in this project are calendar dates built with the local-time
// constructor `new Date(y, m, d)`, not instants. All arithmetic here goes
// through Date.UTC's y/m/d components (not raw getTime()/DAY_MS division)
// so it's exact regardless of the runtime's timezone offset.

const DAY_MS = 86400000;

/** Date -> integer day count since the Unix epoch (timezone-safe). */
export function toEpochDay(date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;
}

/** Inverse of toEpochDay. */
export function fromEpochDay(n) {
  const utc = new Date(n * DAY_MS);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

/** A new Date offset by `n` calendar days (n may be negative). */
export function addDays(date, n) {
  return fromEpochDay(toEpochDay(date) + n);
}

/** Whole calendar days between two dates (b - a). */
export function daysBetween(a, b) {
  return toEpochDay(b) - toEpochDay(a);
}

/** True if two Dates fall on the same calendar day. */
export function isSameDate(a, b) {
  return toEpochDay(a) === toEpochDay(b);
}

/** True if `date` falls within [start, end] inclusive (calendar days). */
export function isDateInRange(date, start, end) {
  const d = toEpochDay(date);
  return d >= toEpochDay(start) && d <= toEpochDay(end);
}

/**
 * First occurrence of `weekday` (0=Sun..6=Sat) on or after year/monthIndex/day.
 * monthIndex is 0-based (JS Date convention: 0=Jan..11=Dec).
 */
export function firstWeekdayOnOrAfter(year, monthIndex, weekday, day = 1) {
  let d = new Date(year, monthIndex, day);
  while (d.getDay() !== weekday) d = addDays(d, 1);
  return d;
}

/** The n-th (1-based) occurrence of `weekday` in year/monthIndex. */
export function nthWeekdayOfMonth(year, monthIndex, weekday, n) {
  return addDays(firstWeekdayOnOrAfter(year, monthIndex, weekday), (n - 1) * 7);
}
