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
  boardReviewDate, cpuContractRenewalDate, intlBreakWeeks,
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
 *             byClubDate: Map<string, Map<number,object>>, byId: Map<string,object>,
 *             byDate: Map<number,object[]> }}
 */
export function buildFixtures({ leagues, clubs, seed, seasonStartYear }) {
  // Season-scoped RNG key (M5): a career now regenerates fixtures every July
  // 1 rollover (engine/season.js) with the same save seed but a new
  // seasonStartYear — without the year in the key, every season would
  // reshuffle from the exact same starting draw.
  const rng = new RngStream(deriveSeed(seed, `fixtures-${seasonStartYear}`));
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
  const byDate = new Map();

  for (const league of leagues) {
    const clubIds = clubsByLeague.get(league.id) || [];
    const fixtures = generateLeagueFixtures({ league, clubIds, rng, kickoff, blackoutRanges, seasonStartYear });
    byLeague.set(league.id, fixtures);
    for (const fx of fixtures) {
      byId.set(fx.id, fx);
      byClub.get(fx.homeClubId).push(fx);
      byClub.get(fx.awayClubId).push(fx);
      byClubDate.get(fx.homeClubId).set(toEpochDay(fx.date), fx);
      byClubDate.get(fx.awayClubId).set(toEpochDay(fx.date), fx);
      const day = toEpochDay(fx.date);
      if (!byDate.has(day)) byDate.set(day, []);
      byDate.get(day).push(fx);
    }
  }
  for (const list of byClub.values()) list.sort((a, b) => toEpochDay(a.date) - toEpochDay(b.date));

  return { byLeague, byClub, byClubDate, byId, byDate };
}

/** The fixture (if any) a club plays on a given date. */
export function fixtureOnDate(fixtures, clubId, date) {
  const perDate = fixtures.byClubDate.get(clubId);
  return perDate ? perDate.get(toEpochDay(date)) || null : null;
}

/** Every fixture (any club, any league) scheduled on a given date — the
 * cross-league index engine/sim/worldsim.js's per-day batch simulation
 * (M4) walks as the calendar advances. */
export function fixturesOnDate(fixtures, date) {
  return fixtures.byDate.get(toEpochDay(date)) || [];
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
  const [growthFeb1, growthJul1] = growthDays(seasonStartYear).map(toEpochDay);
  const day = toEpochDay(date);

  if (day === toEpochDay(windows.summer.open)) events.push("window-open");
  if (day === toEpochDay(windows.summer.close)) events.push("window-close");
  if (day === toEpochDay(windows.winter.open)) events.push("window-open");
  if (day === toEpochDay(windows.winter.close)) events.push("window-close");
  if (deadlines.includes(day)) events.push("deadline-day");
  // Feb 1 is a mid-season growth application only; Jul 1 is also next
  // season's kickoff, so it gets the fuller "season-rollover" event instead
  // (engine/season.js's rolloverSeason applies growth as one step of that
  // larger pipeline — see its header for the ordering).
  if (day === growthFeb1) events.push("growth");
  if (day === growthJul1) events.push("season-rollover");
  if (day === toEpochDay(boardReviewDate(seasonStartYear))) events.push("board-review");
  if (day === toEpochDay(cpuContractRenewalDate(seasonStartYear))) events.push("contract-renewal");
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
 *
 * `onEnterDay(date)`, if given, runs for every day the walk steps into
 * (including the final halting day), *before* the match-day check — M4's
 * hook for core/store.js to batch-simulate that date's non-user fixtures
 * (engine/sim/worldsim.js) as the calendar sweeps past them, so every
 * league's table fills in even on days the user's own club doesn't play.
 *
 * `extraStop(date)`, if given, is checked alongside the club fixture check —
 * M10's hook for core/store.js to also halt on the user's own national-team
 * fixture (engine/comps/intl.js's intlFixtureOnDate), so accepting an NT job
 * doesn't lose the "Advance stops for a match you play" guarantee just
 * because it isn't a club fixture.
 * @returns {{ date: Date, stoppedEarly: boolean }}
 */
export function advanceTowards(fixtures, clubId, fromDate, toDate, onEnterDay, extraStop) {
  const targetDay = toEpochDay(toDate);
  let current = fromDate;
  while (toEpochDay(current) < targetDay) {
    current = addDays(current, 1);
    if (onEnterDay) onEnterDay(current);
    if (fixtureOnDate(fixtures, clubId, current) || (extraStop && extraStop(current))) return { date: current, stoppedEarly: true };
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
