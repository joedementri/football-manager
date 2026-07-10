// config/playergen.js — tuning tables for gen/player.js and gen/squad.js.
//
// Two different provenances live in this file, kept clearly separated:
//
// 1) Ported verbatim from reference/ini/scout.ini's [PLAYER_ATTRIBUTES]
//    section: work-rate chance tables (POS_n_ATT/DEF_WORKRATE_*_CHANCE),
//    the weak-foot star distribution, the skill-move "factor" tables
//    (FACTOR_n_SKILL_LEVEL_*_CHANCE) and their position modifiers. These are
//    numbers straight out of the game files — see the per-table comments
//    for exactly which INI lines they come from.
//
// 2) Authored by the implementing model (plan1.md sanctions this explicitly:
//    "This data is authored by the implementing model from public
//    knowledge"): the league/club target-overall formula, age distribution,
//    height/weight ranges and squad slot templates. plan1.md gives two
//    illustrative anchors for the overall formula (EPL mean 74 σ5, League
//    Two mean 58 σ4) and a couple of height examples (GK/CB 184-200cm,
//    wingers/fullbacks shorter) — everything here is calibrated to fit
//    those, not invented from nothing, but there is no INI table for "how
//    good is a lower-mid-table Ligue 1 side's average player" so this part
//    is a formula, not a port.

import { WORKRATE_GROUPS } from "./positions.js";

/* ------------------------------------------------------------------------
 * 1) Ported from scout.ini [PLAYER_ATTRIBUTES]
 * ---------------------------------------------------------------------- */

// POS_n_ATT/DEF_WORKRATE_{LOW,MED,HIGH}_CHANCE, n=0..8 (scout.ini lines
// 149-203). Order there is GK, FB(LB/RB/LWB/RWB), CB, WM(LM/RM), CDM, CM,
// CAM, WING(LW/RW), ST/CF — exactly WORKRATE_GROUPS's order.
const WORKRATE_CHANCE_BY_INDEX = [
  { att: [50, 50, 0], def: [50, 50, 0] }, // GK
  { att: [35, 45, 20], def: [10, 60, 30] }, // FB
  { att: [50, 45, 5], def: [10, 50, 40] }, // CB
  { att: [25, 50, 25], def: [50, 40, 10] }, // WM
  { att: [55, 35, 10], def: [15, 50, 35] }, // CDM
  { att: [25, 55, 20], def: [25, 50, 25] }, // CM
  { att: [20, 50, 30], def: [50, 45, 5] }, // CAM
  { att: [20, 55, 25], def: [65, 30, 5] }, // WING
  { att: [10, 55, 35], def: [75, 20, 5] }, // ST_CF
];
export const WORKRATE_CHANCE = Object.fromEntries(
  WORKRATE_GROUPS.map((g, i) => [g, WORKRATE_CHANCE_BY_INDEX[i]])
);

/** Weighted-random pick of "Low"|"Medium"|"High" from a [low,med,high] % table. */
export function pickWorkrate(rng, chances) {
  const roll = rng.next() * (chances[0] + chances[1] + chances[2]);
  if (roll < chances[0]) return "Low";
  if (roll < chances[0] + chances[1]) return "Medium";
  return "High";
}

// WEAKFOOT_ABILITY_LEVEL_{1..5}_CHANCE (scout.ini lines 388-392).
export const WEAKFOOT_CHANCE = [10, 35, 30, 15, 10];

// FACTOR_{1..10}_SKILL_LEVEL_{1..5}_CHANCE (scout.ini lines 397-455) — a
// player's skill-move star rating is drawn from one of these 10
// distributions, chosen by a "factor" bucket 1-10. The INI does not
// document how the bucket is chosen; we derive it from overall (better
// players skew to higher buckets) shifted by the position modifier below,
// which is the intent the bucket numbers clearly encode (bucket 1 is almost
// all 2-star, bucket 10 is mostly 3-4 star with a real chance of 5).
export const SKILLMOVE_FACTOR_TABLE = [
  [18, 77, 4, 1, 0],
  [15, 74, 8, 3, 0],
  [12, 72, 12, 4, 0],
  [10, 64, 20, 5, 1],
  [8, 52, 30, 8, 2],
  [3, 27, 58, 8, 4],
  [0, 23, 60, 11, 6],
  [0, 7, 68, 16, 9],
  [0, 2, 69, 17, 12],
  [0, 0, 66, 20, 14],
];

// PLAYER_POSITION_{0..9}_SKILLMOVE_MODIFIER (scout.ini lines 460-469): GK,
// LB/RB, CB, LM/RM, CDM, CM, CAM, CF, LW/RW, ST. CF and ST both carry
// modifier 4, so ST_CF collapses cleanly into one entry.
export const SKILLMOVE_POSITION_MODIFIER = {
  GK: -90, FB: -35, CB: -65, WM: 1, CDM: -45, CM: -10, CAM: 5, WING: 7, ST_CF: 4,
};

/** 1-5 skill-move star rating for a player of the given overall + workrate group. */
export function pickSkillMoves(rng, overall, workrateGroup) {
  const baseBucket = Math.round(overall / 10); // 1..10, better players → higher bucket
  const shift = Math.round(SKILLMOVE_POSITION_MODIFIER[workrateGroup] / 12);
  const bucket = Math.min(10, Math.max(1, baseBucket + shift));
  const dist = SKILLMOVE_FACTOR_TABLE[bucket - 1];
  const total = dist[0] + dist[1] + dist[2] + dist[3] + dist[4];
  let roll = rng.next() * total;
  for (let level = 0; level < 5; level++) {
    if (roll < dist[level]) return level + 1;
    roll -= dist[level];
  }
  return 5;
}

/** 1-5 weak-foot star rating (global distribution, not position-split in the INI). */
export function pickWeakFoot(rng) {
  const total = WEAKFOOT_CHANCE.reduce((a, b) => a + b, 0);
  let roll = rng.next() * total;
  for (let level = 0; level < 5; level++) {
    if (roll < WEAKFOOT_CHANCE[level]) return level + 1;
    roll -= WEAKFOOT_CHANCE[level];
  }
  return 5;
}

/* ------------------------------------------------------------------------
 * 2) Authored formulas (calibrated to plan1.md's anchors)
 * ---------------------------------------------------------------------- */

/**
 * Target-overall mean/spread for a club, given its league's prestige range
 * and the club's own 1-10 prestige. Calibrated so an England-tier-1-average
 * club (prestige ~8) lands close to the plan's "EPL mean 74 σ5" anchor and
 * an England-tier-4-average club (prestige ~2.5) lands close to "League Two
 * mean 58 σ4".
 */
export function clubOverallTarget(club, league) {
  const avgPrestige = (league.prestige[0] + league.prestige[1]) / 2;
  const leagueMean = 49 + avgPrestige * 3.2;
  const leagueSpread = 3.0 + avgPrestige * 0.28;
  const mean = leagueMean + (club.prestige - avgPrestige) * 1.8;
  const spread = leagueSpread + Math.max(0, club.prestige - avgPrestige) * 0.15;
  return { mean, spread: Math.max(3, spread) };
}

/** Age distribution: gaussian centered in the 22-29 peak-density band, clamped 17-36. */
export function pickAge(rng) {
  return Math.round(Math.min(36, Math.max(17, rng.gaussian(25.5, 4.2))));
}

// Height (cm) range per overall group; weight is derived from height, not
// listed separately, per plan1.md's "GK/CB 184-200cm; wingers/fullbacks
// shorter" example.
export const HEIGHT_RANGE = {
  GK: [185, 200],
  CB: [182, 196],
  FB: [172, 186],
  CDM: [178, 190],
  CM: [175, 186],
  CAM: [172, 183],
  WM_WING: [168, 180],
  ST_CF: [175, 190],
};

export function pickHeightWeight(rng, overallGroup) {
  const [lo, hi] = HEIGHT_RANGE[overallGroup];
  const heightCm = Math.round(rng.float(lo, hi));
  const weightKg = Math.round(heightCm - 100 + rng.gaussian(0, 3.5));
  return { heightCm, weightKg: Math.min(98, Math.max(58, weightKg)) };
}

// Squad slot templates for a 24-man squad (3 GK / 8 DEF / 8 MID / 5 ATT per
// plan1.md's player-generation section). Each slot is a position code;
// gen/squad.js applies a little rng variety on top (fullback <-> wingback,
// centre-back left/right/centre labelling) rather than using these fixed
// codes literally every time.
export const SQUAD_TEMPLATE = {
  GK: ["GK", "GK", "GK"],
  DEF: ["RB", "RCB", "CB", "LCB", "LB", "CB", "RB", "LB"],
  MID: ["CDM", "RCM", "LCM", "CAM", "RM", "LM", "CDM", "CM"],
  ATT: ["ST", "ST", "CF", "RW", "LW"],
};
