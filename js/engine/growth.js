// engine/growth.js — applies player growth/decline twice a season (fable-
// plans/plan1.md M5 "Growth & decline", ported from reference/ini/
// playergrowth.ini via config/growth.js's curves + weight tables). Called on
// both growth dates (config/calendar.js's growthDays: Feb 1 and Jul 1) for
// every player in the world — same "simulate everyone, not just the user's
// squad" precedent M4 set for match sim.
//
// Per-player pipeline (plan1.md, verbatim order):
//   1. expected = potential * ratioForAge(curve, age)
//   2. delta = (expected - current) * CURVE_ATTENUATION_PERCENTAGE, then the
//      above/below-curve modifier (config/growth.js's curveDeviationModifier)
//   3. ±GROWTH_VARIATION_PERCENTAGE random variance, match-rating bonus
//      (±10%, from this growth period's average rating), playtime bonus
//      (up to +10%, linear to 270 minutes this period) — all three additive
//      percentages on the calculated growth, per the INI's own wording
//      ("bonus added to the calculated growth ... as percentage of the
//      calculated growth")
//   4. injury attenuation (growth x5% / decline x150%) if currently injured
//   5. distribute the resulting overall-point delta across attributes via
//      the mental/physical/skill bucket weights (GK uses its own formula
//      coefficients instead — see config/growth.js's GK_GROWTH_WEIGHTS)
//
// player.growthPeriod {minutes, ratingSum, ratingCount} is this milestone's
// one schema addition (gen/player.js seeds it empty, engine/sim/results.js
// accumulates it match-by-match, this module consumes + resets it).

import { positionInfo } from "../config/positions.js";
import { recomputeOverall } from "../gen/player.js";
import { WEIGHTS } from "../gen/overall.js";
import { RngStream, deriveSeed } from "../core/rng.js";
import {
  ratioForAge, curveDeviationModifier, growthWeightsForAge,
  GROWTH_GLOBALS, MENTAL_ATTRIBUTES, PHYSICAL_ATTRIBUTES, SKILL_ATTRIBUTES, GK_GROWTH_WEIGHTS,
} from "../config/growth.js";
import { PLAYER_EVAL } from "../config/form.js";

const FLOOR_WEIGHT_FOR_UNWEIGHTED_ATTR = 0.15; // an attribute absent from a position's overall-weight table still nudges a little, for realism/variety

function bucketAttributeWeights(overallGroup, bucketAttrs) {
  const table = WEIGHTS[overallGroup] || {};
  const raw = bucketAttrs.map((name) => table[name] ?? FLOOR_WEIGHT_FOR_UNWEIGHTED_ATTR);
  const total = raw.reduce((a, b) => a + b, 0) || 1;
  return bucketAttrs.map((name, i) => [name, raw[i] / total]);
}

/** Per-attribute growth weights (sum to 1) for one player's position + age —
 * GK gets its own formula-coefficient split; outfielders get the
 * mental/physical/skill bucket split scaled by how much each attribute
 * matters to *their* position's overall (gen/overall.js's WEIGHTS table),
 * so growth naturally concentrates on the attributes that move their
 * overall the most, same spirit as gen/player.js's generation-time solver. */
function attributeGrowthWeights(overallGroup, curveId, age) {
  if (curveId === 1) return Object.entries(GK_GROWTH_WEIGHTS);
  const { mental, physical, skill } = growthWeightsForAge(curveId, age);
  return [
    ...bucketAttributeWeights(overallGroup, MENTAL_ATTRIBUTES).map(([n, w]) => [n, w * mental]),
    ...bucketAttributeWeights(overallGroup, PHYSICAL_ATTRIBUTES).map(([n, w]) => [n, w * physical]),
    ...bucketAttributeWeights(overallGroup, SKILL_ATTRIBUTES).map(([n, w]) => [n, w * skill]),
  ];
}

/** Largest-remainder rounding: distributes an integer `total` across
 * `shares` (fractional, summing to ~1) so the rounded parts sum back to
 * `total` exactly, instead of independent Math.round() calls drifting off
 * by a point or two. */
function distributeIntegerly(total, weights) {
  const raw = weights.map(([name, w]) => [name, w * total]);
  const floors = raw.map(([name, v]) => [name, Math.trunc(v)]);
  let remainder = total - floors.reduce((s, [, v]) => s + v, 0);
  const remainders = raw.map(([name, v], i) => [name, v - floors[i][1]]).sort((a, b) => b[1] - a[1]);
  const out = new Map(floors);
  for (let i = 0; i < remainders.length && remainder !== 0; i++) {
    const [name] = remainders[i];
    out.set(name, out.get(name) + Math.sign(remainder));
    remainder -= Math.sign(remainder);
  }
  return out;
}

/** Nudges the single highest-weight attribute with headroom by ±1 until the
 * recomputed overall matches `target` (bounded iterations) — the same
 * "solve for the target" idea gen/player.js's generation-time sampler uses,
 * needed here because bucket-weighted distribution + integer rounding +
 * 1-99 clamping can leave a residual point or two of drift. */
function nudgeTowardTarget(player, overallGroup, target) {
  const weights = overallGroup === "GK"
    ? Object.entries(GK_GROWTH_WEIGHTS)
    : Object.entries(WEIGHTS[overallGroup] || {});
  let current = recomputeOverall(player);
  let guard = 0;
  while (current !== target && guard < 40) {
    const step = target > current ? 1 : -1;
    let best = null, bestWeight = -1;
    for (const [name, w] of weights) {
      const val = player.attrs[name];
      const room = step > 0 ? 99 - val : val - 1;
      if (room > 0 && w > bestWeight) { best = name; bestWeight = w; }
    }
    if (!best) break;
    player.attrs[best] = Math.min(99, Math.max(1, player.attrs[best] + step));
    current = recomputeOverall(player);
    guard++;
  }
}

/** Applies one growth-period's worth of change to a single player. `rng`
 * should be a per-player-deterministic stream (see applyGrowthToWorld). */
function applyGrowthToPlayer(player, rng) {
  const info = positionInfo(player.position);
  const curveId = info.growthCurve;
  const age = player.age;

  const expected = player.potential * ratioForAge(curveId, age);
  const current = player.overall;
  const ratio = Math.abs(current - expected) / Math.max(1, expected);
  const modifier = curveDeviationModifier(ratio, current >= expected);
  const rawDelta = (expected - current) * (GROWTH_GLOBALS.CURVE_ATTENUATION_PERCENTAGE / 100) * modifier;

  const variancePct = rng.float(-GROWTH_GLOBALS.GROWTH_VARIATION_PERCENTAGE, GROWTH_GLOBALS.GROWTH_VARIATION_PERCENTAGE) / 100;

  const gp = player.growthPeriod;
  const avgRating = gp.ratingCount > 0 ? gp.ratingSum / gp.ratingCount : null;
  let ratingBonusPct = 0;
  if (avgRating != null) {
    if (avgRating < PLAYER_EVAL.BAD) ratingBonusPct = GROWTH_GLOBALS.MATCH_RATING_PERCENTAGE_BONUS_BAD / 100;
    else if (avgRating >= PLAYER_EVAL.NEUTRAL) ratingBonusPct = GROWTH_GLOBALS.MATCH_RATING_PERCENTAGE_BONUS_GOOD / 100;
  }
  const playtimeBonusPct = (GROWTH_GLOBALS.MATCH_PLAY_TIME_PERCENTAGE_BONUS / 100)
    * Math.min(1, gp.minutes / GROWTH_GLOBALS.MATCH_PLAY_TIME_FOR_MAX_BONUS);

  let delta = rawDelta * (1 + variancePct + ratingBonusPct + playtimeBonusPct);

  if (player.injury) {
    delta *= delta > 0
      ? GROWTH_GLOBALS.INJURY_GROWTH_PERCENTAGE_MODIFIER / 100
      : GROWTH_GLOBALS.INJURY_DECREASE_PERCENTAGE_MODIFIER / 100;
  }

  const target = Math.round(Math.min(player.potential, Math.max(1, current + delta)));
  const totalPointDelta = target - current;

  if (totalPointDelta !== 0) {
    const weights = attributeGrowthWeights(info.overallGroup, curveId, age);
    const perAttr = distributeIntegerly(totalPointDelta, weights);
    for (const [name, d] of perAttr) {
      if (!d) continue;
      player.attrs[name] = Math.min(99, Math.max(1, player.attrs[name] + d));
    }
    nudgeTowardTarget(player, info.overallGroup, target);
  }

  player.growthPeriod = { minutes: 0, ratingSum: 0, ratingCount: 0 };
}

/**
 * Applies growth to every player in the world (fable-plans/plan1.md: growth
 * runs on both Feb 1 and Jul 1 — engine/calendar.js's `growthDays`; Jul 1's
 * application happens as part of engine/season.js's rollover, *before*
 * age++, per the plan's own bullet ordering).
 * @param {object} state
 * @param {number} seed
 * @param {string} label - RNG-stream namespace (e.g. `growth-2015-02-01`) so
 *   each growth date draws its own deterministic sequence.
 */
export function applyGrowthToWorld(state, seed, label) {
  for (const player of state.players) {
    const rng = new RngStream(deriveSeed(seed, `${label}-${player.id}`));
    applyGrowthToPlayer(player, rng);
  }
}
