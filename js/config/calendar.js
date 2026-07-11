// config/calendar.js — season key-date tuning. Ground rule #4 is "port
// tuning numbers from the INI files"; these particular numbers are NOT in
// the FIFA 17 INIs (transfer-window/growth-day *dates* are plan-authored
// decisions, not INI-tunable) — reference/ini/cmsettings.ini's CALSTART_MONTH
// and reference/ini/transfer.ini's DEADLINEDAY_* entries describe *hour-by-
// hour deadline-day activity*, not the calendar dates themselves. So this
// file cites fable-plans/plan1.md directly instead of an .ini filename,
// same convention the file header comment ground rule asks for.
//
// All dates are relative to `seasonStartYear` (the year a season begins,
// e.g. 2014 for the 2014/15 season) so these functions work for any season,
// not just the career's first one.

import { firstWeekdayOnOrAfter, nthWeekdayOfMonth, addDays, isDateInRange } from "../core/clock.js";

const SATURDAY = 6;
const MONDAY = 1;
const TUESDAY = 2;

/** Career/season start: always July 1st (plan1.md ground rule #5 / M3 note). */
export function seasonStart(seasonStartYear) {
  return new Date(seasonStartYear, 6, 1);
}

/** First matchday for every league: first Saturday of August (plan1.md
 * doesn't pin an exact kickoff date — this is the simplest deterministic
 * rule that lands in the right real-world week). */
export function leagueKickoff(seasonStartYear) {
  return firstWeekdayOnOrAfter(seasonStartYear, 7, SATURDAY); // month 7 = August
}

/** Transfer windows (plan1.md "Transfers" core mechanic: "Jul 1–Sep 1 and
 * Jan 1–Feb 1"). Winter window sits in the following calendar year. */
export function transferWindows(seasonStartYear) {
  return {
    summer: { open: new Date(seasonStartYear, 6, 1), close: new Date(seasonStartYear, 8, 1) },
    winter: { open: new Date(seasonStartYear + 1, 0, 1), close: new Date(seasonStartYear + 1, 1, 1) },
  };
}

/** Deadline days are each window's closing date. */
export function deadlineDays(seasonStartYear) {
  const w = transferWindows(seasonStartYear);
  return [w.summer.close, w.winter.close];
}

/** Growth application dates (plan1.md "Growth & decline": "Applied twice per
 * season (Feb 1 and July 1)"). The July 1 date is next season's kickoff/
 * rollover moment. */
export function growthDays(seasonStartYear) {
  return [new Date(seasonStartYear + 1, 1, 1), new Date(seasonStartYear + 1, 6, 1)];
}

/** Board mid-season review (plan1.md "Objectives": "mid-season review") —
 * placed at the winter window's open date, roughly the season's halfway
 * point. Full evaluation logic lands in M5; M3 only needs the date. */
export function boardReviewDate(seasonStartYear) {
  return new Date(seasonStartYear + 1, 0, 1);
}

/** International breaks (plan1.md "Internationals": "qualifiers in intl
 * breaks (Sep/Oct/Nov/Mar)"; "league pauses on break weeks"). Each break is
 * a Monday-to-Sunday week; the 2nd Monday of the month is an arbitrary but
 * stable pick. */
export function intlBreakWeeks(seasonStartYear) {
  const starts = [
    nthWeekdayOfMonth(seasonStartYear, 8, MONDAY, 2), // September
    nthWeekdayOfMonth(seasonStartYear, 9, MONDAY, 2), // October
    nthWeekdayOfMonth(seasonStartYear, 10, MONDAY, 2), // November
    nthWeekdayOfMonth(seasonStartYear + 1, 2, MONDAY, 2), // March
  ];
  return starts.map((start) => ({ start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6) }));
}

/** Domestic cup round dates (plan1.md M5 "Competitions": "Domestic cups:
 * knockout with round draws ... midweek dates" is said of continental comps,
 * extended here to domestic cups too so they never collide with the weekly
 * Saturday league fixtures). Not in any INI (cup *scheduling* is a plan-
 * authored decision, same footing as this file's other non-INI dates — see
 * header). First round: first Tuesday of August; subsequent rounds step 21
 * days at a time (skipping international-break weeks like league fixtures),
 * giving England's deepest bracket (~9 rounds) room to finish by ~April,
 * clear of the July 1 season rollover. engine/comps/cup.js draws each round's
 * pairing from the previous round's results, so round dates are produced
 * lazily (one at a time, via nextCupRoundDate) rather than all upfront —
 * there is no fixed round count to precompute. */
export function firstCupRoundDate(seasonStartYear) {
  return firstWeekdayOnOrAfter(seasonStartYear, 7, TUESDAY); // August
}

export function nextCupRoundDate(fromDate, seasonStartYear) {
  const blackoutRanges = intlBreakWeeks(seasonStartYear);
  let d = addDays(fromDate, 21);
  while (blackoutRanges.some((r) => isDateInRange(d, r.start, r.end))) d = addDays(d, 7);
  return d;
}
