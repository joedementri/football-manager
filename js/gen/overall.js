// gen/overall.py -> gen/overall.js — computes a player's `overall` from their
// raw attributes. Per fable-plans/plan1.md's Overall calculation section:
// a weighted sum of attributes with one weight table per position group,
// weights summing to 1, result rounded. The GK formula is given exactly by
// the plan and ported verbatim; the ST_CF table starts from the plan's
// given ST coefficients (finishing .18, positioning .13, headingAcc .10 …)
// and is calibrated — as the plan instructs — against the mandatory Messi
// vector, landing at 93 (see MESSI_VECTOR/computeOverall below, and
// dev/tests.html for the assertion). The plan's ST list is explicitly
// partial ("…") and sums to ~1.05 on its own, so the numbers here are
// adjusted (not copied 1:1) to (a) sum to exactly 1 and (b) hit the test
// vector — both required by the plan.
//
// The other 6 outfield groups (CB, FB, CDM, CM, CAM, WM_WING) have no INI
// source or plan-given coefficients — plan1.md sanctions authoring this
// data ("authored by the implementing model from public knowledge") — so
// they're built the same way (concentrate weight on each group's real-world
// defining attributes, sum to 1) but aren't covered by a mandatory test
// vector. dev/tests.html still sanity-checks every table sums to 1 and that
// a uniform attribute set of value X returns overall X (a weights-sum-to-1
// invariant), since that's what gen/player.js's target-overall solver relies on.

import { positionInfo } from "../config/positions.js";

export const WEIGHTS = {
  GK: null, // special formula below, not a weighted sum of the outfield attrs

  CB: {
    marking: 0.16, standTackle: 0.14, interceptions: 0.12, headingAcc: 0.10,
    strength: 0.09, reactions: 0.08, jumping: 0.07, slideTackle: 0.06,
    aggression: 0.05, sprintSpeed: 0.04, acceleration: 0.03, shortPass: 0.03,
    ballControl: 0.02, balance: 0.01,
  },

  FB: {
    sprintSpeed: 0.13, standTackle: 0.12, acceleration: 0.11, marking: 0.11,
    stamina: 0.09, crossing: 0.08, interceptions: 0.08, reactions: 0.06,
    shortPass: 0.06, agility: 0.05, ballControl: 0.04, dribbling: 0.03,
    slideTackle: 0.02, strength: 0.01, jumping: 0.01,
  },

  CDM: {
    interceptions: 0.16, standTackle: 0.13, marking: 0.11, strength: 0.09,
    shortPass: 0.09, stamina: 0.08, reactions: 0.08, aggression: 0.07,
    ballControl: 0.05, longPass: 0.05, headingAcc: 0.04, jumping: 0.03,
    vision: 0.02,
  },

  CM: {
    shortPass: 0.16, vision: 0.12, stamina: 0.11, ballControl: 0.10,
    reactions: 0.09, longPass: 0.08, dribbling: 0.07, interceptions: 0.06,
    standTackle: 0.05, shotPower: 0.04, sprintSpeed: 0.03, acceleration: 0.03,
    strength: 0.03, curve: 0.03,
  },

  CAM: {
    vision: 0.16, shortPass: 0.12, dribbling: 0.11, ballControl: 0.11,
    curve: 0.07, positioning: 0.07, reactions: 0.07, agility: 0.06,
    finishing: 0.06, longShots: 0.05, fkAccuracy: 0.03, crossing: 0.03,
    acceleration: 0.03, sprintSpeed: 0.02, composure: 0.01,
  },

  WM_WING: {
    sprintSpeed: 0.16, acceleration: 0.13, dribbling: 0.11, crossing: 0.11,
    agility: 0.09, ballControl: 0.09, curve: 0.06, stamina: 0.06,
    shortPass: 0.05, finishing: 0.04, positioning: 0.04, reactions: 0.04,
    vision: 0.02,
  },

  // Calibrated against the Messi vector (plan1.md): started from the plan's
  // partial ST list, redistributed to sum to 1.
  ST_CF: {
    finishing: 0.19, positioning: 0.14, ballControl: 0.11, reactions: 0.10,
    dribbling: 0.09, acceleration: 0.06, sprintSpeed: 0.05, agility: 0.05,
    balance: 0.04, composure: 0.04, shotPower: 0.04, headingAcc: 0.02,
    volleys: 0.02, longShots: 0.02, curve: 0.01, shortPass: 0.01, vision: 0.01,
  },
};

/**
 * GK overall — the exact formula given by plan1.md, verified against Neuer
 * (div 88, han 85, pos 90, ref 86, kick 91, reactions 88 → 87.5 → 88):
 *   ovr = .21*(div+han+pos+ref) + .05*kick + .11*reactions
 */
export function computeGkOverall(attrs) {
  const raw =
    0.21 * (attrs.gkDiving + attrs.gkHandling + attrs.gkPositioning + attrs.gkReflexes) +
    0.05 * attrs.gkKicking +
    0.11 * attrs.reactions;
  return Math.round(raw);
}

/** Weighted-sum overall for a given outfield overallGroup ("CB","FB",...). */
export function computeOverall(attrs, overallGroup) {
  if (overallGroup === "GK") return computeGkOverall(attrs);
  const weights = WEIGHTS[overallGroup];
  if (!weights) throw new Error(`no overall weight table for group "${overallGroup}"`);
  let sum = 0;
  for (const [attr, w] of Object.entries(weights)) sum += (attrs[attr] ?? 0) * w;
  return Math.round(sum);
}

/** Overall for a player object with a known position code (looks up its overallGroup). */
export function computeOverallForPosition(attrs, positionCode) {
  return computeOverall(attrs, positionInfo(positionCode).overallGroup);
}

export function weightSum(overallGroup) {
  const weights = WEIGHTS[overallGroup];
  if (!weights) return 1; // GK's formula isn't a sum-to-1 table
  return Object.values(weights).reduce((a, b) => a + b, 0);
}

/* ---------------------------- mandatory test vectors ---------------------------- */

export const MESSI_VECTOR = {
  acceleration: 96, sprintSpeed: 90,
  positioning: 92, finishing: 94, longShots: 88, penalties: 76, shotPower: 80, volleys: 85,
  crossing: 84, curve: 89, fkAccuracy: 90, longPass: 76, shortPass: 89, vision: 90,
  agility: 94, balance: 95, ballControl: 96, dribbling: 96, reactions: 94, composure: 95,
  headingAcc: 71, interceptions: 22, marking: 25, standTackle: 21, slideTackle: 20,
  aggression: 48, jumping: 73, stamina: 77, strength: 60,
};

export const NEUER_VECTOR = {
  gkDiving: 88, gkHandling: 85, gkPositioning: 90, gkReflexes: 86, gkKicking: 91, reactions: 88,
};
