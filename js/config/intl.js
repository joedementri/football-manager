// config/intl.js — M10 international competitions (World Cup, Euro, Copa
// América, AFCON, Asian Cup): qualifying-group math, tournament shape, and
// calendar dates. Config over code (ground rule #4) — same footing as
// config/calendar.js's own non-INI, plan-authored scheduling decisions (see
// that file's header): there is no international-qualifying-format table in
// any FIFA 17 career-mode INI, so this is a plan-authored simplification of
// the real competitions, scaled to this project's 50-nation world
// (data/nations.json) rather than the real ~200-nation FIFA calendar.
//
// Every qualifying group targets ~4 nations (QUALIFYING_GROUP_TARGET_SIZE);
// group *counts* per confederation fall straight out of nations.json's own
// confed populations (UEFA 28 -> 7 groups, CONMEBOL/CAF 7 -> 2, AFC 5 -> 2,
// CONCACAF 3 -> 1) — see engine/comps/intl.js's seededGroupDraw. Advancers
// are every group winner, automatically, plus enough best-ranked (points-
// per-game, then GD-per-game, so uneven group sizes compare fairly)
// runners-up to reach `fieldSize`.
//
// Two competitions' very first cycle inside this career would need
// qualifying to start *before* July 2014 (Euro 2016's own 2-preceding-season
// window starts season 2013; AFCON 2015's 1-season window starts season
// 2014 -- wait, see engine/comps/intl.js's competitionStartSeason for the
// exact arithmetic): those instances bootstrap (field seeded directly by
// nation prestige, no qualifying run) via `bootstrapFirstCycle`; every later
// cycle qualifies for real.

import { intlBreakWeeks } from "./calendar.js";
import { addDays } from "../core/clock.js";

export const QUALIFYING_GROUP_TARGET_SIZE = 4;

const WEDNESDAY = 3; // World Cup qualifying weekday
const THURSDAY = 4; // every regional competition's qualifying weekday
const MONDAY = 1; // intlBreakWeeks' own break.start weekday

/**
 * @typedef {object} IntlCompetitionConfig
 * @property {string[]} confeds - eligible nations.json `confed`s
 * @property {boolean} hasQualifying - false only for Copa América (no
 *   qualifying at all per data/cups.json's own text — CONMEBOL's 7 nations
 *   all enter the tournament group stage directly)
 * @property {boolean} doubleRoundRobin - qualifying groups play home+away
 *   (true, 2-preceding-season budget of up to 8 matchdays) or a single leg
 *   (false, 1-season budget of up to 4 matchdays)
 * @property {number} qualifyingSeasons - how many seasons' worth of intl
 *   breaks the qualifying phase spans
 * @property {boolean} qualifyingSameSeasonAsTournament - true for AFCON/
 *   Asian Cup: qualifying uses the *tournament's own* season's breaks
 *   (their 2/4-year cycle leaves no clean earlier window); false for
 *   World Cup/Euro, whose 2 preceding seasons both finish before the
 *   tournament season even begins
 * @property {'wc'|'regional'|null} qualifyingWeekday - collision-avoidance:
 *   World Cup qualifiers always land on the Wednesday of a break week,
 *   every regional competition's on the Thursday — since a nation is only
 *   ever in one regional confederation but could simultaneously be
 *   mid-World-Cup-qualifying, this guarantees no nation is ever
 *   double-booked on the same day regardless of how many competitions'
 *   cycles happen to overlap in a given season.
 * @property {number} fieldSize - nations that reach the tournament proper
 * @property {number|null} tournamentGroupSize - group size for the June
 *   tournament phase, or null when the qualifying groups (small
 *   confederations here) already *are* the tournament's group stage — the
 *   June phase is then a straight knockout from the qualifiers.
 * @property {number} tournamentAdvancePerGroup - how many of each June
 *   tournament group advance to the knockout (authored per-competition
 *   rather than derived, so every field size lands on a clean bracket)
 * @property {boolean} bootstrapFirstCycle - see file header
 */
export const INTL_COMPETITIONS = {
  "world-cup": {
    confeds: ["UEFA", "CONMEBOL", "CONCACAF", "AFC", "CAF"],
    hasQualifying: true, doubleRoundRobin: true, qualifyingSeasons: 2, qualifyingSameSeasonAsTournament: false,
    qualifyingWeekday: "wc", fieldSize: 16, tournamentGroupSize: 4, tournamentAdvancePerGroup: 2,
    bootstrapFirstCycle: false,
  },
  euro: {
    confeds: ["UEFA"],
    hasQualifying: true, doubleRoundRobin: true, qualifyingSeasons: 2, qualifyingSameSeasonAsTournament: false,
    qualifyingWeekday: "regional", fieldSize: 8, tournamentGroupSize: 4, tournamentAdvancePerGroup: 2,
    bootstrapFirstCycle: true,
  },
  afcon: {
    confeds: ["CAF"],
    hasQualifying: true, doubleRoundRobin: false, qualifyingSeasons: 1, qualifyingSameSeasonAsTournament: true,
    qualifyingWeekday: "regional", fieldSize: 4, tournamentGroupSize: null, tournamentAdvancePerGroup: null,
    bootstrapFirstCycle: true,
  },
  "asian-cup": {
    confeds: ["AFC"],
    hasQualifying: true, doubleRoundRobin: false, qualifyingSeasons: 1, qualifyingSameSeasonAsTournament: true,
    qualifyingWeekday: "regional", fieldSize: 4, tournamentGroupSize: null, tournamentAdvancePerGroup: null,
    bootstrapFirstCycle: false,
  },
  "copa-america": {
    confeds: ["CONMEBOL"],
    hasQualifying: false, doubleRoundRobin: false, qualifyingSeasons: 0, qualifyingSameSeasonAsTournament: false,
    qualifyingWeekday: null, fieldSize: 7, tournamentGroupSize: 7, tournamentAdvancePerGroup: 4,
    bootstrapFirstCycle: false,
  },
};

/** The [firstSeason, lastSeason] range (inclusive, seasonStartYear units)
 * whose intl breaks supply qualifying matchdays. */
export function qualifyingSeasonRange(comp, tournamentSeasonStartYear) {
  const lastSeason = comp.qualifyingSameSeasonAsTournament ? tournamentSeasonStartYear : tournamentSeasonStartYear - 1;
  const firstSeason = lastSeason - comp.qualifyingSeasons + 1;
  return { firstSeason, lastSeason };
}

/** The season whose July 1 rollover should build this competition's next
 * cycle — the first season of its qualifying window, or (no-qualifying /
 * bootstrap) the tournament season itself. engine/comps/intl.js's rollover
 * hook builds a fresh cycle exactly when this equals (or has already
 * passed) the season just entered. */
export function competitionStartSeason(comp, cycleYear, cupDef) {
  const tournamentSeasonStartYear = cycleYear - 1;
  const isBootstrap = comp.bootstrapFirstCycle && cycleYear === cupDef.firstYear;
  if (!comp.hasQualifying || isBootstrap) return tournamentSeasonStartYear;
  return qualifyingSeasonRange(comp, tournamentSeasonStartYear).firstSeason;
}

/** Smallest cycle year (data/cups.json's firstYear + k*cycleEvery) that is
 * >= minYear. */
export function nextCycleYearOnOrAfter(firstYear, cycleEvery, minYear) {
  if (minYear <= firstYear) return firstYear;
  const steps = Math.ceil((minYear - firstYear) / cycleEvery);
  return firstYear + steps * cycleEvery;
}

function weekdayDateInBreak(breakWeek, weekday) {
  return addDays(breakWeek.start, weekday - MONDAY);
}

/** Every qualifying matchday date, chronological, across the whole
 * qualifying window (config/calendar.js's intlBreakWeeks, one matchday per
 * break week on the competition's own weekday — see qualifyingWeekday
 * above). */
export function qualifyingMatchdayDates(comp, tournamentSeasonStartYear) {
  const { firstSeason, lastSeason } = qualifyingSeasonRange(comp, tournamentSeasonStartYear);
  const weekday = comp.qualifyingWeekday === "wc" ? WEDNESDAY : THURSDAY;
  const dates = [];
  for (let season = firstSeason; season <= lastSeason; season++) {
    for (const week of intlBreakWeeks(season)) dates.push(weekdayDateInBreak(week, weekday));
  }
  return dates;
}

/** June tournament-phase matchdays (group stage + the knockout's first
 * round) — every 4 days from June 1 of the cycle year, no blackout-week
 * skipping needed (domestic football is over for the season by June). */
export function tournamentMatchdayDates(tournamentSeasonStartYear, count) {
  const dates = [];
  let d = new Date(tournamentSeasonStartYear + 1, 5, 1); // June 1
  for (let i = 0; i < count; i++) { dates.push(new Date(d)); d = addDays(d, 4); }
  return dates;
}

/** Subsequent tournament knockout rounds step forward the same 4-day beat. */
export function nextTournamentKnockoutDate(fromDate) {
  return addDays(fromDate, 4);
}
