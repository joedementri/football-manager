// gen/player.js — generates one Player record per the schema in
// fable-plans/plan1.md, following the plan's "Player generation" steps:
// position (passed in by gen/squad.js, which owns squad-shape), target
// overall from club/league, age, potential (playergrowth.ini curves
// inverted), attributes (archetype template + noise, scaled to hit the
// target overall), height/weight/workrates/weak-foot/skill-moves (scout.ini
// tables via config/playergen.js).
//
// Value/wage/contract here are a deliberately simple placeholder — the plan
// assigns the real port of playervalues.ini/playerwages.ini to M6
// ("engine/value.js", "engine/wage.js"); M2 only needs the Player schema's
// fields populated with *something* plausible so Squad List/Bio can render
// them, not the calibrated formula. `recomputeOverall` documents the
// schema's "COMPUTED — never stored stale" contract: overall is cached on
// the player object at generation time, and any future code that mutates
// `attrs` (engine/growth.js in M5) must call it again.

import { positionInfo } from "../config/positions.js";
import { ratioForAge } from "../config/growth.js";
import {
  pickAge, pickHeightWeight, pickWorkrate, pickWeakFoot, pickSkillMoves,
  WORKRATE_CHANCE,
} from "../config/playergen.js";
import { computeOverall, WEIGHTS } from "./overall.js";
import { randomName } from "./names.js";
import { ARCHETYPES } from "./archetypes.js";

let nextPlayerId = 1;
export function resetPlayerIdCounter(start = 1) {
  nextPlayerId = start;
}

/** overall is computed, never trusted stale — call after any attrs mutation. */
export function recomputeOverall(player) {
  player.overall = computeOverall(player.attrs, positionInfo(player.position).overallGroup);
  return player.overall;
}

const GK_ADJUST_WEIGHTS = { gkDiving: 1, gkHandling: 1, gkPositioning: 1, gkReflexes: 1, gkKicking: 1, reactions: 1 };

function pickAdjustableAttribute(attrs, overallGroup, step) {
  const weights = overallGroup === "GK" ? GK_ADJUST_WEIGHTS : WEIGHTS[overallGroup];
  let best = null;
  let bestWeight = -1;
  for (const [name, w] of Object.entries(weights)) {
    const val = attrs[name];
    const room = step > 0 ? 99 - val : val - 1;
    if (room > 0 && w > bestWeight) {
      best = name;
      bestWeight = w;
    }
  }
  return best;
}

/** Builds noisy attrs from a position archetype, then scales/nudges them so
 * computeOverall(attrs) lands exactly on targetOverall (plan1.md: "solve:
 * scale attrs so the computed overall hits the target (iterate ×2)"). */
function sampleAttributesForTarget(rng, overallGroup, targetOverall) {
  const archetype = ARCHETYPES[overallGroup];
  const attrs = {};
  for (const [name, mean] of Object.entries(archetype)) {
    attrs[name] = Math.round(Math.min(99, Math.max(1, rng.gaussian(mean, 7))));
  }

  for (let pass = 0; pass < 3; pass++) {
    const current = computeOverall(attrs, overallGroup);
    if (current === targetOverall) break;
    const scale = Math.min(1.6, Math.max(0.5, targetOverall / Math.max(1, current)));
    for (const name of Object.keys(attrs)) {
      attrs[name] = Math.round(Math.min(99, Math.max(1, attrs[name] * scale)));
    }
  }

  // Scaling clamps at the 1/99 boundary, so a residual gap can remain —
  // nudge the single highest-weight attribute with headroom until exact.
  let current = computeOverall(attrs, overallGroup);
  let guard = 0;
  while (current !== targetOverall && guard < 40) {
    const step = targetOverall > current ? 1 : -1;
    const name = pickAdjustableAttribute(attrs, overallGroup, step);
    if (!name) break;
    attrs[name] = Math.min(99, Math.max(1, attrs[name] + step));
    current = computeOverall(attrs, overallGroup);
    guard++;
  }

  return attrs;
}

function pickFoot(rng) {
  return rng.chance(0.77) ? "R" : "L";
}

// Realistic neighbouring positions for altPositions — a player who mostly
// plays one slot can plausibly also cover these. Not sourced from an INI
// (there's no such table in the FIFA 17 files); authored from football
// knowledge like the other gen/player.js archetype data plan1.md sanctions.
const ADJACENT_POSITIONS = {
  GK: [],
  SW: ["CB", "RCB", "LCB"], RCB: ["CB", "SW", "RB"], CB: ["RCB", "LCB", "SW"], LCB: ["CB", "SW", "LB"],
  RWB: ["RB", "RM"], RB: ["RWB", "RCB"], LB: ["LWB", "LCB"], LWB: ["LB", "LM"],
  RDM: ["CDM", "RCM"], CDM: ["RDM", "LDM", "CM"], LDM: ["CDM", "LCM"],
  RCM: ["CM", "RDM", "RAM"], CM: ["RCM", "LCM", "CDM"], LCM: ["CM", "LDM", "LAM"],
  RAM: ["CAM", "RCM", "RW"], CAM: ["RAM", "LAM", "CM", "CF"], LAM: ["CAM", "LCM", "LW"],
  RM: ["RWB", "RW", "RCM"], LM: ["LWB", "LW", "LCM"],
  RW: ["RM", "RAM", "RS"], LW: ["LM", "LAM", "LS"],
  RF: ["CF", "RS", "RW"], CF: ["ST", "CAM", "RF", "LF"], LF: ["CF", "LS", "LW"],
  RS: ["ST", "RW", "RF"], ST: ["CF", "RS", "LS"], LS: ["ST", "LW", "LF"],
};

function pickAltPositions(rng, positionCode) {
  const candidates = ADJACENT_POSITIONS[positionCode] || [];
  if (candidates.length === 0) return [];
  const count = rng.chance(0.15) ? 2 : rng.chance(0.55) ? 1 : 0;
  return rng.shuffle(candidates).slice(0, Math.min(count, candidates.length));
}

/**
 * @param {object} opts
 * @param {import("../core/rng.js").RngStream} opts.rng
 * @param {string} opts.positionCode - one of config/positions.js's POSITION_CODES
 * @param {object} opts.nation - a data/nations.json entry
 * @param {object} opts.club - a data/clubs.json entry
 * @param {number} opts.targetOverall - sampled by gen/squad.js from clubOverallTarget
 * @param {number} opts.seasonStartYear - e.g. 2014 for the 2014/15 season
 * @param {number} opts.wageModifier - league.wageModifier (placeholder wage calc)
 */
export function generatePlayer(opts) {
  const { rng, positionCode, nation, club, targetOverall, seasonStartYear, wageModifier, ageOverride } = opts;
  const info = positionInfo(positionCode);
  const overallGroup = info.overallGroup;

  // ageOverride (M5, engine/retirement.js): a regen is always generated at a
  // fixed 16-18, not this module's normal 17-36 career-wide age distribution.
  const age = ageOverride ?? pickAge(rng);
  const birthDate = new Date(seasonStartYear - age, rng.int(0, 11), rng.int(1, 28));

  const overall = Math.round(Math.min(94, Math.max(40, targetOverall)));
  const attrs = sampleAttributesForTarget(rng, overallGroup, overall);

  const curveRatio = ratioForAge(info.growthCurve, age);
  let potential = Math.round(overall / curveRatio);
  if (age <= 23 && rng.chance(0.12)) potential += rng.int(3, 10);
  potential = Math.min(99, Math.max(overall, potential));

  const { heightCm, weightKg } = pickHeightWeight(rng, overallGroup);
  const workrateChance = WORKRATE_CHANCE[info.workrateGroup];
  const workRateAtt = pickWorkrate(rng, workrateChance.att);
  const workRateDef = pickWorkrate(rng, workrateChance.def);
  const weakFoot = pickWeakFoot(rng);
  const skillMoves = pickSkillMoves(rng, overall, info.workrateGroup);

  const name = randomName(rng, nation);
  const joinedClubYear = seasonStartYear - rng.int(0, Math.max(0, age - 17));

  // Placeholder economics — M6 (engine/value.js, engine/wage.js) replaces
  // these with the full playervalues.ini/playerwages.ini ports.
  const wage = Math.round(Math.pow(overall / 50, 4) * 400 * (wageModifier / 30));
  const value = Math.round(wage * 220 * (1 + Math.max(0, 23 - age) * 0.04));
  const contractYears = rng.int(1, 5);

  return {
    id: nextPlayerId++,
    firstName: name.firstName,
    lastName: name.lastName,
    commonName: name.commonName,
    nationId: nation.id,
    clubId: club.id,
    natTeamId: null,
    age,
    birthDate,
    heightCm,
    weightKg,
    position: positionCode,
    altPositions: pickAltPositions(rng, positionCode),
    foot: pickFoot(rng),
    weakFoot,
    skillMoves,
    workRateAtt,
    workRateDef,
    attrs,
    overall,
    potential,
    joinedClubYear,
    contract: {
      wage,
      endYear: seasonStartYear + contractYears,
      signingBonus: 0,
      squadRole: "rotation", // gen/squad.js assigns the real role once the full squad is known
    },
    value,
    form: 5,
    morale: 7,
    fitness: 100,
    injury: null,
    // Most-recent-first match-rating history engine/form.js's rolling form
    // average reads from (M4) — empty at generation time, capped at 10 by
    // recordMatchRating as matches get played.
    ratingHistory: [],
    seasonStats: { apps: 0, goals: 0, assists: 0, cleanSheets: 0, avgRating: 0, yellows: 0, reds: 0 },
    careerStats: [],
    // Minutes + rating accumulated since the last growth application
    // (engine/growth.js, M5) — reset every Feb 1/Jul 1; feeds the
    // match-rating/playtime growth bonuses (plan1.md: "match-rating bonus
    // ±10% ... playtime bonus up to +10%").
    growthPeriod: { minutes: 0, ratingSum: 0, ratingCount: 0 },
    kitNumber: null, // assigned by gen/squad.js once the full 24-man list exists
    isYouth: false,
    scouting: { level: 3, ovrRange: [overall, overall], potRange: [potential, potential] },
    // Set true by engine/retirement.js (M5) once a player's retirement roll
    // hits at the January board-review date; they actually retire (and a
    // regen replaces them) at the July 1 rollover — plan1.md: "announce in
    // Jan, retire in July".
    retiringAnnounced: false,
  };
}
