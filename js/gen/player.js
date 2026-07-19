// gen/player.js — generates one Player record per the schema in
// fable-plans/plan1.md, following the plan's "Player generation" steps:
// position (passed in by gen/squad.js, which owns squad-shape), target
// overall from club/league, age, potential (playergrowth.ini curves
// inverted), attributes (archetype template + noise, scaled to hit the
// target overall), height/weight/workrates/weak-foot/skill-moves (scout.ini
// tables via config/playergen.js).
//
// Wage/value use M6's real playerwages.ini/playervalues.ini ports
// (engine/wage.js's computeWage, engine/value.js's computeValue) — contract
// years remain a plausible plan-authored roll (there's no INI table for "how
// many years does a freshly generated player already have left"), which
// computeValue's [CONTRACT] modifier then reads. `recomputeOverall`
// documents the schema's "COMPUTED — never stored stale" contract: overall
// is cached on the player object at generation time, and any future code
// that mutates `attrs` (engine/growth.js in M5) must call it again.

import { positionInfo } from "../config/positions.js";
import { ratioForAge } from "../config/growth.js";
import {
  pickAge, pickHeightWeight, pickWorkrate, pickWeakFoot, pickSkillMoves,
  WORKRATE_CHANCE,
} from "../config/playergen.js";
import { computeOverall, WEIGHTS } from "./overall.js";
import { randomName } from "./names.js";
import { ARCHETYPES } from "./archetypes.js";
import { computeWage } from "../engine/wage.js";
import { computeValue } from "../engine/value.js";
import { scoutingRangeFor } from "../config/scouting.js";

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
 * @param {object} opts.league - a data/leagues.json entry (engine/wage.js's computeWage needs wageModifier)
 * @param {number} [opts.potentialOverride] - M9, engine/academy.js: a youth
 *   prospect's potential is rolled *first* (config/youth.js's tier bands),
 *   with targetOverall then derived from it (see that file's own
 *   generateProspect) — the reverse of this function's normal flow, which
 *   derives potential from overall via the curve. When set, skips this
 *   function's own overall->potential inversion (and the young-player
 *   "upside" roll, which would otherwise fight the caller's own tier roll)
 *   and uses the given value directly (still clamped to [overall, 99]).
 */
export function generatePlayer(opts) {
  const { rng, positionCode, nation, club, league, targetOverall, seasonStartYear, ageOverride, potentialOverride } = opts;
  const info = positionInfo(positionCode);
  const overallGroup = info.overallGroup;

  // ageOverride (M5, engine/retirement.js): a regen is always generated at a
  // fixed 16-18, not this module's normal 17-36 career-wide age distribution.
  const age = ageOverride ?? pickAge(rng);
  const birthDate = new Date(seasonStartYear - age, rng.int(0, 11), rng.int(1, 28));

  const overall = Math.round(Math.min(94, Math.max(40, targetOverall)));
  const attrs = sampleAttributesForTarget(rng, overallGroup, overall);

  let potential;
  if (potentialOverride != null) {
    potential = Math.round(potentialOverride);
  } else {
    const curveRatio = ratioForAge(info.growthCurve, age);
    potential = Math.round(overall / curveRatio);
    if (age <= 23 && rng.chance(0.12)) potential += rng.int(3, 10);
  }
  potential = Math.min(99, Math.max(overall, potential));

  const { heightCm, weightKg } = pickHeightWeight(rng, overallGroup);
  const workrateChance = WORKRATE_CHANCE[info.workrateGroup];
  const workRateAtt = pickWorkrate(rng, workrateChance.att);
  const workRateDef = pickWorkrate(rng, workrateChance.def);
  const weakFoot = pickWeakFoot(rng);
  const skillMoves = pickSkillMoves(rng, overall, info.workrateGroup);

  const name = randomName(rng, nation);
  const joinedClubYear = seasonStartYear - rng.int(0, Math.max(0, age - 17));

  // Contract length has no INI source (there's no table for "how many years
  // does a freshly generated player already have left") — a plausible
  // plan-authored roll, same footing as config/playergen.js's other authored
  // formulas. Wage/value are the real M6 ports (engine/wage.js,
  // engine/value.js); value needs the contract's years-remaining, so the
  // contract object is built before it.
  const contractYears = rng.int(1, 5);
  const wage = computeWage({ overall, age, position: positionCode }, league);
  const contract = {
    wage,
    endYear: seasonStartYear + contractYears,
    signingBonus: 0,
    squadRole: "rotation", // gen/squad.js assigns the real role once the full squad is known
    warnedExpiry: false,
    // M7: engine/freeagents.js's pre-contract approach — null until a free-
    // agent approach is accepted (see engine/contracts.js's signWithNewClub).
    preAgreedClubId: null,
    preAgreedTerms: null,
  };
  const value = computeValue({ overall, potential, age, position: positionCode, form: 5, contract }, club, seasonStartYear);

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
    contract,
    value,
    form: 5,
    morale: 7,
    fitness: 100,
    injury: null,
    loan: null, // M7: engine/negotiation.js's active loan spell — {parentClubId, returnDate, fullWage} while out on loan
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
    // M8: nobody starts fully known — generation stays club-agnostic (this
    // file never sees which club the user picked, see the header's "keep
    // generation and consumption strictly separated"). core/store.js's
    // createCareerState raises the user's own starting squad to level 3
    // right after world-gen; engine/contracts.js's movePlayerToClub does the
    // same the moment any player later joins the user's club.
    // F3-fixes: assignedDate/totalDays are set only by engine/gtn.js's
    // startPlayerScout (a direct single-player scout task) and drive
    // engine/scoutrange.js's continuous day-by-day narrowing; null here
    // means "not on that path yet" — see that file's own header.
    scouting: { level: 0, ovrRange: scoutingRangeFor(overall, 0), potRange: scoutingRangeFor(potential, 0), assignedDate: null, totalDays: null },
    // Set true by engine/retirement.js (M5) once a player's retirement roll
    // hits at the January board-review date; they actually retire (and a
    // regen replaces them) at the July 1 rollover — plan1.md: "announce in
    // Jan, retire in July".
    retiringAnnounced: false,
  };
}
