// engine/calendar.js — the season calendar: fixture generation across every
// league, the day-by-day Advance loop, and the event lookup the month-view
// calendar overlay and day-strip both read from (fable-plans/plan1.md M3:
// "engine/calendar.js, league fixture generation for all leagues, Advance
// loop"). Pure functions only — core/store.js owns state mutation, per the
// project's "no logic in UI/engine files touches state directly" contract;
// the Store methods that call into this module are the only place
// `state.calendar` actually changes.

import { addDays, toEpochDay, isDateInRange } from "../core/clock.js";
import {
  leagueKickoff, transferWindows, deadlineDays, growthDays,
  boardReviewDate, intlBreakWeeks,
} from "../config/calendar.js";
import { generateLeagueFixtures, buildLeagueTable } from "./comps/league.js";
import { RngStream, deriveSeed } from "../core/rng.js";

/**
 * Generates every league's full season fixture list. Pure function of the
 * save's seed + static league/club data — deliberately NOT persisted in the
 * save (core/db.js), so hydrateFromSave can rebuild it from scratch. Uses
 * its own RNG stream (independent of world-gen's) so it never depends on
 * how many draws player generation happened to consume.
 * @param {object} opts
 * @param {object[]} opts.leagues
 * @param {object[]} opts.clubs
 * @param {number} opts.seed
 * @param {number} opts.seasonStartYear
 * @returns {{ byLeague: Map<string,object[]>, byClub: Map<string,object[]>,
 *             byClubDate: Map<string, Map<number,object>>, byId: Map<string,object> }}
 */
export function buildFixtures({ leagues, clubs, seed, seasonStartYear }) {
  const rng = new RngStream(deriveSeed(seed, "fixtures"));
  const kickoff = leagueKickoff(seasonStartYear);
  const blackoutRanges = intlBreakWeeks(seasonStartYear);
  const clubsByLeague = new Map();
  for (const c of clubs) {
    if (!clubsByLeague.has(c.leagueId)) clubsByLeague.set(c.leagueId, []);
    clubsByLeague.get(c.leagueId).push(c.id);
  }

  const byLeague = new Map();
  const byClub = new Map(clubs.map((c) => [c.id, []]));
  const byClubDate = new Map(clubs.map((c) => [c.id, new Map()]));
  const byId = new Map();

  for (const league of leagues) {
    const clubIds = clubsByLeague.get(league.id) || [];
    const fixtures = generateLeagueFixtures({ league, clubIds, rng, kickoff, blackoutRanges });
    byLeague.set(league.id, fixtures);
    for (const fx of fixtures) {
      byId.set(fx.id, fx);
      byClub.get(fx.homeClubId).push(fx);
      byClub.get(fx.awayClubId).push(fx);
      byClubDate.get(fx.homeClubId).set(toEpochDay(fx.date), fx);
      byClubDate.get(fx.awayClubId).set(toEpochDay(fx.date), fx);
    }
  }
  for (const list of byClub.values()) list.sort((a, b) => toEpochDay(a.date) - toEpochDay(b.date));

  return { byLeague, byClub, byClubDate, byId };
}

/** The fixture (if any) a club plays on a given date. */
export function fixtureOnDate(fixtures, clubId, date) {
  const perDate = fixtures.byClubDate.get(clubId);
  return perDate ? perDate.get(toEpochDay(date)) || null : null;
}

/** Next N upcoming fixtures for a club, strictly after `fromDate`. */
export function upcomingFixtures(fixtures, clubId, fromDate, n) {
  const fromDay = toEpochDay(fromDate);
  return (fixtures.byClub.get(clubId) || [])
    .filter((fx) => toEpochDay(fx.date) > fromDay)
    .slice(0, n);
}

/** Season-wide (non-match) events landing on this date — window open/close,
 * deadline day, growth, board review, international break. Match days are
 * per-club, so they're looked up separately via fixtureOnDate. */
export function eventsOnDate(date, seasonStartYear) {
  const events = [];
  const windows = transferWindows(seasonStartYear);
  const deadlines = deadlineDays(seasonStartYear).map(toEpochDay);
  const growth = growthDays(seasonStartYear).map(toEpochDay);
  const day = toEpochDay(date);

  if (day === toEpochDay(windows.summer.open)) events.push("window-open");
  if (day === toEpochDay(windows.summer.close)) events.push("window-close");
  if (day === toEpochDay(windows.winter.open)) events.push("window-open");
  if (day === toEpochDay(windows.winter.close)) events.push("window-close");
  if (deadlines.includes(day)) events.push("deadline-day");
  if (growth.includes(day)) events.push("growth");
  if (day === toEpochDay(boardReviewDate(seasonStartYear))) events.push("board-review");
  if (intlBreakWeeks(seasonStartYear).some((r) => isDateInRange(date, r.start, r.end))) events.push("intl-break");

  return events;
}

/**
 * Advances from `fromDate` towards `toDate` one day at a time, but halts as
 * soon as it *enters* a day that's a match day for `clubId` — plan1.md's
 * "Multi-day advance stops at any event needing user input (match...)".
 * `fromDate` itself is never treated as a stop (you're already sitting on
 * it — otherwise clicking Advance again from a match day could never move
 * past it).
 * @returns {{ date: Date, stoppedEarly: boolean }}
 */
export function advanceTowards(fixtures, clubId, fromDate, toDate) {
  const targetDay = toEpochDay(toDate);
  let current = fromDate;
  while (toEpochDay(current) < targetDay) {
    current = addDays(current, 1);
    if (fixtureOnDate(fixtures, clubId, current)) return { date: current, stoppedEarly: true };
  }
  return { date: current, stoppedEarly: false };
}

const CAL_DOW_MONDAY_FIRST = 1; // grid weeks start Monday, matching intlBreakWeeks

/**
 * Cells for a full month-view calendar grid (6 weeks x 7 days, Monday-first,
 * padded with the trailing/leading days of neighbouring months).
 * @returns {{ date: Date, inMonth: boolean, isToday: boolean, fixture: object|null, events: string[] }[]}
 */
export function monthCells(year, monthIndex, { fixtures, clubId, seasonStartYear, today }) {
  const firstOfMonth = new Date(year, monthIndex, 1);
  const leadDays = (firstOfMonth.getDay() - CAL_DOW_MONDAY_FIRST + 7) % 7;
  const gridStart = addDays(firstOfMonth, -leadDays);

  const cells = [];
  for (let i = 0; i < 42; i++) {
    const date = addDays(gridStart, i);
    cells.push({
      date,
      inMonth: date.getMonth() === monthIndex,
      isToday: toEpochDay(date) === toEpochDay(today),
      fixture: fixtureOnDate(fixtures, clubId, date),
      events: eventsOnDate(date, seasonStartYear),
    });
  }
  return cells;
}

export { buildLeagueTable };
