// engine/sim/results.js — applies one finished match's aggregate outcome to
// the GameState: the fixture's scoreline (state.results, which
// engine/comps/league.js's buildLeagueTable reads), and every involved
// player's season stats, form, fitness and injuries (plan1.md M4: "league
// tables, results, form, fitness, injuries, per-player season stats all
// update"). Shared by engine/sim/quick.js's batch CPU-vs-CPU sims and
// engine/sim/match.js's interactive user match, since both ultimately
// produce the same `{ homeGoals, awayGoals, playerStats }` shape (see
// quick.js's header) — this is the single place that shape turns into state
// mutation, matching the project's "engine functions own mutation, not the
// callers" contract.

import { positionInfo } from "../../config/positions.js";
import { recordMatchRating } from "../form.js";
import { matchFatigueLoss } from "../fitness.js";

// Clean-sheet season-stat credit follows the same DEF/MID/GK-yes,ATT-no
// split as [MATCH_RATINGS]' CLEANSHEET_* bonuses (config/sim.js's
// MATCH_RATINGS.CLEANSHEET table gives attackers 0 — strikers don't get
// "clean sheet" credit even when their team keeps one).
const CLEANSHEET_CREDIT_AREAS = new Set(["GK", "DEF", "MID"]);

/**
 * @param {object} state - the live GameState (core/store.js)
 * @param {object} fixture - the engine/calendar.js fixture this result is for
 * @param {{ homeGoals:number, awayGoals:number, playerStats:Map }} result
 */
export function applyMatchResult(state, fixture, result) {
  state.results.set(fixture.id, { homeGoals: result.homeGoals, awayGoals: result.awayGoals });

  for (const [playerId, stat] of result.playerStats) {
    const player = state.playersById.get(playerId);
    if (!player) continue;

    const prevApps = player.seasonStats.apps;
    player.seasonStats.apps += 1;
    player.seasonStats.goals += stat.goals;
    player.seasonStats.assists += stat.assists;
    if (stat.cleanSheet && CLEANSHEET_CREDIT_AREAS.has(positionInfo(player.position).area)) {
      player.seasonStats.cleanSheets += 1;
    }
    if (stat.yellow) player.seasonStats.yellows += 1;
    if (stat.red) player.seasonStats.reds += 1;
    player.seasonStats.avgRating = prevApps > 0
      ? (player.seasonStats.avgRating * prevApps + stat.rating) / player.seasonStats.apps
      : stat.rating;

    const isUserClub = player.clubId === state.club.id;
    recordMatchRating(player, stat.rating, isUserClub);

    player.fitness = Math.max(0, player.fitness - matchFatigueLoss(player, stat.minutesPlayed));
    if (stat.injury) {
      player.injury = { type: stat.injury.type, daysLeft: stat.injury.daysLeft };
      player.fitness = Math.max(0, player.fitness - stat.injury.energyDrop);
    }
  }
}
