// engine/sim/lineup.js — picks the 11 players a club actually fields for a
// given matchday, live from its current roster (fitness/injury aware).
// gen/squad.js's pickBestXI only ever runs once, at world-gen time, to draw
// the Squad screen's initial "Default Team Sheet" — it has no notion of
// injuries or fatigue because neither exists yet at that point. Match
// simulation (sim/quick.js, sim/match.js) needs a fresh, availability-aware
// pick every matchday for all ~600 clubs, so it lives here instead of
// reusing that one-shot generator.
//
// Shape: 1 GK / 4 DEF / 4 MID / 2 ATT (a 4-4-2, matching the squad's actual
// slot template from config/playergen.js's SQUAD_TEMPLATE) — only the area
// counts matter to the sim (engine/sim/core.js only ever needs a player's
// area, not their exact slot code), so this doesn't need gen/squad.js's
// full left/right/centre slot-labelling machinery.

import { positionInfo } from "../../config/positions.js";
import { fitnessPerfFactor } from "./core.js";

const XI_SHAPE = { GK: 1, DEF: 4, MID: 4, ATT: 2 };

function available(players) {
  return players.filter((p) => !p.injury);
}

function byEffectiveOverallDesc(a, b) {
  return (b.overall * fitnessPerfFactor(b)) - (a.overall * fitnessPerfFactor(a));
}

function areaOf(p) {
  return positionInfo(p.position).area;
}

/**
 * Best available XI for a club with no fixed team sheet (every CPU club).
 * Falls back to filling shortfalls from whatever's left (e.g. a
 * injury-ravaged squad short of recognised defenders) so it always returns
 * up to 11 players.
 * @param {object[]} roster - the club's full squad (state.playersByClub.get(id))
 * @returns {object[]} up to 11 player objects
 */
export function pickBestAvailableXI(roster) {
  const pool = available(roster).sort(byEffectiveOverallDesc);
  const used = new Set();
  const xi = [];

  for (const [area, count] of Object.entries(XI_SHAPE)) {
    const picks = pool.filter((p) => !used.has(p.id) && areaOf(p) === area).slice(0, count);
    for (const p of picks) { used.add(p.id); xi.push(p); }
  }
  if (xi.length < 11) {
    for (const p of pool) {
      if (xi.length >= 11) break;
      if (!used.has(p.id)) { used.add(p.id); xi.push(p); }
    }
  }
  return xi;
}

/**
 * The user's starting XI: honours their saved team sheet (state.squad.lineup)
 * player-for-player, but autofills any slot whose named player is currently
 * injured with the best available replacement from the same area (plan1.md
 * doesn't gate a Team Sheet *editor* to this milestone, so there's no UI path
 * to benching an injured starter manually yet — this keeps the match from
 * literally fielding someone who can't play).
 * @param {object[]} roster
 * @param {{playerId:number}[]} preferredLineup - state.squad.lineup (11 entries)
 */
export function resolveUserXI(roster, preferredLineup) {
  const byId = new Map(roster.map((p) => [p.id, p]));
  const used = new Set();
  const xi = [];
  const unresolvedAreas = [];

  for (const slot of preferredLineup) {
    const p = byId.get(slot.playerId);
    if (p && !p.injury) { xi.push(p); used.add(p.id); }
    else unresolvedAreas.push(p ? areaOf(p) : "MID");
  }

  if (unresolvedAreas.length) {
    const pool = available(roster).filter((p) => !used.has(p.id)).sort(byEffectiveOverallDesc);
    for (const area of unresolvedAreas) {
      const replacement = pool.find((p) => !used.has(p.id) && areaOf(p) === area)
        || pool.find((p) => !used.has(p.id));
      if (replacement) { xi.push(replacement); used.add(replacement.id); }
    }
  }
  return xi;
}

/** The rest of the club's fit, non-starting roster — substitution candidates
 * for the user's match, strongest first. */
export function pickBench(roster, startingXI) {
  const startingIds = new Set(startingXI.map((p) => p.id));
  return available(roster).filter((p) => !startingIds.has(p.id)).sort(byEffectiveOverallDesc);
}
