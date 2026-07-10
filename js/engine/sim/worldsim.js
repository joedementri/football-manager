// engine/sim/worldsim.js — the per-day batch simulation hook core/store.js's
// advanceToDate/advanceOneDay run for every day the calendar sweeps through
// (via engine/calendar.js's advanceTowards `onEnterDay` callback). Every
// fixture across every league on that date resolves through sim/quick.js —
// except the user's own club's fixture, which is left untouched for the
// Match Day overlay (engine/sim/match.js) to play out interactively.
// This is what makes plan1.md M4's "all leagues' tables fill in believably"
// true: nothing about a league's table depends on whether the user
// personally follows it.

import { fixturesOnDate } from "../calendar.js";
import { simulateQuickMatch } from "./quick.js";
import { applyMatchResult } from "./results.js";
import { applyDailyRecoveryToAll } from "../fitness.js";
import { RngStream, deriveSeed } from "../../core/rng.js";

/**
 * @param {object} state - the live GameState (core/store.js)
 * @param {Date} date - the day just entered
 */
export function simulateWorldDay(state, date) {
  applyDailyRecoveryToAll(state.players);

  const fixtures = fixturesOnDate(state.fixtures, date);
  for (const fixture of fixtures) {
    if (fixture.homeClubId === state.club.id || fixture.awayClubId === state.club.id) continue;

    const homeClub = state.clubsById.get(fixture.homeClubId);
    const awayClub = state.clubsById.get(fixture.awayClubId);
    const homeRoster = state.playersByClub.get(fixture.homeClubId) || [];
    const awayRoster = state.playersByClub.get(fixture.awayClubId) || [];
    const rng = new RngStream(deriveSeed(state.seed, `match-${fixture.id}`));

    const result = simulateQuickMatch({ fixture, homeClub, awayClub, homeRoster, awayRoster, rng });
    applyMatchResult(state, fixture, result);
  }
}
