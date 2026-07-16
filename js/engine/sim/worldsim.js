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
import { advanceCupsForDate } from "../comps/cup.js";
import { advanceContinentalForDate } from "../comps/continental.js";
import { advanceIntlForDate } from "../comps/intl.js";
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

  // Domestic cup ties (M5): every club's cup fixtures resolve statistically,
  // including the user's own (see engine/comps/cup.js's header for the
  // scope decision — no interactive Match Day ticker for cup matches this
  // milestone).
  if (state.cups) advanceCupsForDate(state, date);

  // M10: continental club competitions — same "every tie resolves
  // statistically, including the user's own club" scope decision (see
  // engine/comps/continental.js's header).
  advanceContinentalForDate(state, date);

  // M10: internationals — every nation's fixture resolves statistically
  // here too; checkpoint C passes the user's own nation id in a skip-set so
  // core/store.js can open the live Match Day ticker for it instead (same
  // "the user's own club fixture is left for Match Day" pattern this
  // function already applies above).
  const skipNationIds = state.nationalTeam ? new Set([state.nationalTeam.nationId]) : null;
  advanceIntlForDate(state, date, skipNationIds);
}
