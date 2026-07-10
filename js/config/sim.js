// config/sim.js — match-simulation tuning, ported from reference/ini/
// simsettings.ini (fable-plans/plan1.md M4: "sim/quick.js for the world,
// sim/match.js+events.js ..."). Ground rule #4: numbers below are copied
// straight from the INI's [SCORE]/[CARD]/[INJURY]/[FATIGUE]/[INFLUENCE]/
// [MATCH_RATINGS]/[*_ATTRIBS]/[*_WEIGHT] sections; only the plumbing that
// turns them into JS-usable shapes is authored.
//
// Attribute-ID mapping: simsettings.ini's [MATCH_RATINGS] comment block
// lists attribute IDs 0-32 by FIFA's internal attribute enum. Most map
// 1:1 onto config/attributes.js's 29 names; two don't and are handled here
// explicitly:
//   - id 9 (TACTICAL_AWARENESS) has no analog in this project's schema
//     (plan1.md's attribute list, and config/attributes.js's 29 names,
//     never separate "tactical awareness" from "positioning" — real FIFA
//     15 itself didn't either; that split came later). Any *_ATTRIBS term
//     referencing id 9 is dropped (weight 0) rather than double-counted
//     onto "positioning" (id 10, already its own separate term).
//   - id 100 ("FORM") maps to the player's live 1-10 `form` field, rescaled
//     to the 0-99 attribute range the other terms live on (form*10-5) so
//     the linear combiner treats it consistently.
// This map is intentionally partial — only the attributes actually
// referenced by an ATTRIB_n slot below need an entry.
export const ATTR_ID_TO_NAME = {
  0: "acceleration", 1: "sprintSpeed", 2: "agility", 3: "balance",
  4: "jumping", 5: "stamina", 6: "strength", 7: "reactions", 8: "aggression",
  9: null, // TACTICAL_AWARENESS — no analog, see header
  10: "positioning", 11: "vision", 12: "ballControl", 13: "crossing",
  14: "dribbling", 15: "finishing", 16: "fkAccuracy", 17: "headingAcc",
  18: "longPass", 19: "shortPass", 20: "marking", 21: "shotPower",
  22: "longShots", 23: "standTackle", 24: "slideTackle", 25: "volleys",
  26: "curve", 27: "penalties",
  28: "gkDiving", 29: "gkHandling", 30: "gkKicking", 31: "gkReflexes", 32: "gkPositioning",
  100: "form",
};

/** [SCORE]: NUM_SCALES/SCALE_n + MIN/MAX_CHANCES_STRONG/WEAK_n, indexed 1-8. */
export const SCORE_SCALES = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 10.0, 100.0];
export const CHANCES_STRONG = [
  [2, 4], [3, 4], [4, 5], [4, 5], [4, 6], [5, 6], [5, 6], [5, 7],
];
export const CHANCES_WEAK = [
  [2, 3], [2, 3], [1, 3], [1, 3], [1, 2], [1, 2], [1, 2], [0, 2],
];

/** Bucket index (0-7) for a given overall-strength gap, per [SCORE]'s scale table. */
export function scoreScaleBucket(gap) {
  const abs = Math.abs(gap);
  for (let i = 0; i < SCORE_SCALES.length; i++) if (abs <= SCORE_SCALES[i]) return i;
  return SCORE_SCALES.length - 1;
}

/** [CARD] */
export const CARD = {
  MAX_CARDS: 4, PERC_CHANCE: 50, PERC_DROP: 10, CHANCEOF_RED: 3, CHANCEOF_TWOREDS: 2,
};

/** [INJURY] (simsettings.ini's percentage/severity/energy-drop table; the
 * plan's "Fitness & injuries" section gives the days-out ranges directly —
 * ported in engine/fitness.js, not here, since the INI itself only tracks
 * energy loss, not days out). */
export const INJURY = {
  MAX_INJURIES: 2, PERC_CHANCE: 15, PERC_DROP: 10,
  PERC_LIGHT: 80, PERC_MEDIUM: 13, PERC_SEVERE: 7,
  ENGYDRP_LIGHT: [10, 30], ENGYDRP_MEDIUM: [35, 55], ENGYDRP_SEVERE: [60, 90],
};

/** [FATIGUE] */
export const FATIGUE = {
  MAXENERGY: 100, GKADJUST: 75, FATIGUEBASE: 21,
};

/** [INFLUENCE] — weights (out of 100) combined into the match-strength score
 * by engine/sim/lineup.js's teamStrength(). FOG/ENERGY carry weight 0 in the
 * INI itself; FOG's effect is instead the "upset" jitter engine/sim/core.js
 * applies when the strength gap is small (see [FOG] RANGE below), and ENERGY
 * (weight 0) is deliberately not modelled as a separate strength term. */
export const INFLUENCE = {
  RATING: 78, HOMEADV: 4, FOG: 0, COMPETITION: 10, ENERGY: 0,
  MATCHIMPORTANCE: 2, DOMESTICPRESTIGE: 6, PRESTIGEMULTIPLER: 5,
};

/** [FOG]: gap (in overall points) below which upset variance kicks in. */
export const FOG_RANGE = 5;

/** [MATCH_RATINGS] */
export const MATCH_RATINGS = {
  MAXRATING: 100, SENDINGOFF: -10, TEAMWIN: 8, TEAMLOSS: -5, RANDOMINC: 6,
  BASE: { DEF: 61, MID: 60, ATT: 60, GK: 62 },
  GOAL: { DEF: 10, MID: 9, ATT: 10, GK: 9 },
  ASSIST: { DEF: 10, MID: 9, ATT: 9, GK: 9 },
  CONCEDED: { DEF: -3, MID: -3, ATT: 0, GK: -4 },
  CLEANSHEET: { DEF: 5, MID: 4, ATT: 0, GK: 6 },
};

/** Player-schema `position` area ("GK"/"DEF"/"MID"/"ATT" — config/positions.js's
 * `area`) is exactly the axis [MATCH_RATINGS] tables are split by. */
export function ratingsAreaOf(positionInfo) {
  return positionInfo.area;
}

/** Generic "weighted linear combiner -> nonlinear selection weight" shape
 * shared by [SHOOTING_ATTRIBS]/[ASSIST_ATTRIBS]/[CARDING_ATTRIBS]/
 * [INJURY_ATTRIBS]/[PENALTY_ATTRIBS]: a handful of attribute IDs each with a
 * VALUE_n influence percentage, plus a POS_n table biasing by player area
 * (-1 none, 0 DEF, 1 MID, 2 ATT, 3 GK), then the resulting 0-100 composite is
 * bucketed into one of 11 tiers and looked up in a WEIGHT_n curve (steeply
 * favouring the top tiers) — this is what makes "a 90 finisher scores far
 * more than 2x as often as a 45 finisher" true, not a plain linear scale. */
function attribsConfig({ terms, posBias, weightCurve }) {
  return { terms, posBias, weightCurve };
}

const POS_INDEX = { DEF: 0, MID: 1, ATT: 2, GK: 3 };

/** [SCORER_WEIGHT]/[ASSIST_WEIGHT]/[CARD_WEIGHT]/[INJURY_WEIGHT]/[PENALTY_WEIGHT],
 * WEIGHT_1..11 (index 0 = bucket 0-9, ... index 10 = bucket 100). */
export const SCORER_WEIGHT = [0, 1, 3, 5, 9, 12, 19, 29, 48, 71, 100];
export const ASSIST_WEIGHT = [0, 1, 3, 5, 7, 12, 21, 32, 50, 70, 100];
export const CARD_WEIGHT = [0, 1, 3, 7, 15, 25, 40, 55, 70, 85, 100];
export const INJURY_WEIGHT = [0, 1, 5, 12, 21, 30, 40, 55, 70, 85, 100];
export const PENALTY_WEIGHT = [0, 1, 3, 5, 10, 15, 25, 35, 50, 70, 100];

/** [SHOOTING_ATTRIBS]: heading(id17,+5), finishing(id15,+66), tactical
 * awareness(id9, dropped — see header), long shots(id22,+9), form(id100,-5
 * energy is separate below); VALUE_0=5 is the POS_n position-bias term. */
export const SHOOTING_ATTRIBS = attribsConfig({
  terms: [
    { attr: ATTR_ID_TO_NAME[17], value: 5 },
    { attr: ATTR_ID_TO_NAME[15], value: 66 },
    { attr: ATTR_ID_TO_NAME[9], value: -10 }, // dropped (null attr)
    { attr: ATTR_ID_TO_NAME[22], value: 9 },
    { attr: ATTR_ID_TO_NAME[100], value: -5 }, // negative = bad form raises incident odds, per INI comment
  ],
  posBias: { pos: 5, POS_1: 2, POS_2: 1, POS_3: 0, POS_4: -1 }, // GK=2? no: order is ATT,MID,DEF,noSetting per file
  weightCurve: SCORER_WEIGHT,
});

/** [ASSIST_ATTRIBS]'s CHANCEOFASSIST: chance any given goal has an assister at all. */
export const CHANCE_OF_ASSIST = 65;

/** [ASSIST_ATTRIBS]: vision(id11,+47), crossing(id13,+7), short pass(id19,+21), aggression(id8,-15). */
export const ASSIST_ATTRIBS = attribsConfig({
  terms: [
    { attr: ATTR_ID_TO_NAME[11], value: 47 },
    { attr: ATTR_ID_TO_NAME[13], value: 7 },
    { attr: ATTR_ID_TO_NAME[19], value: 21 },
    { attr: ATTR_ID_TO_NAME[8], value: -15 },
  ],
  posBias: { pos: 5, POS_1: 1, POS_2: 2, POS_3: 0, POS_4: 3 },
  weightCurve: ASSIST_WEIGHT,
});

/** [CARDING_ATTRIBS]: aggression(id8,+45), agility(id2,-5), stamina(id5,-10),
 * standing tackle(id23,+10), sliding tackle(id24,+20). */
export const CARDING_ATTRIBS = attribsConfig({
  terms: [
    { attr: ATTR_ID_TO_NAME[8], value: 45 },
    { attr: ATTR_ID_TO_NAME[2], value: -5 },
    { attr: ATTR_ID_TO_NAME[5], value: -10 },
    { attr: ATTR_ID_TO_NAME[23], value: 10 },
    { attr: ATTR_ID_TO_NAME[24], value: 20 },
  ],
  posBias: { pos: 5, POS_1: 0, POS_2: 1, POS_3: 2, POS_4: -1 },
  weightCurve: CARD_WEIGHT,
});

/** [INJURY_ATTRIBS]: aggression(id8,+10), agility(id2,-10), balance(id3,-10),
 * reactions(id7,-5), stamina(id5,-25), strength(id6,-10), sliding tackle(id24,-5). */
export const INJURY_ATTRIBS = attribsConfig({
  terms: [
    { attr: ATTR_ID_TO_NAME[8], value: 10 },
    { attr: ATTR_ID_TO_NAME[2], value: -10 },
    { attr: ATTR_ID_TO_NAME[3], value: -10 },
    { attr: ATTR_ID_TO_NAME[7], value: -5 },
    { attr: ATTR_ID_TO_NAME[5], value: -25 },
    { attr: ATTR_ID_TO_NAME[6], value: -10 },
    { attr: ATTR_ID_TO_NAME[24], value: -5 },
  ],
  posBias: { pos: 5, POS_1: 1, POS_2: 2, POS_3: 0, POS_4: 3 },
  weightCurve: INJURY_WEIGHT,
});

/** [PENALTY_ATTRIBS]: penalties(id27,+75), finishing(id15,+25). */
export const PENALTY_ATTRIBS = attribsConfig({
  terms: [
    { attr: ATTR_ID_TO_NAME[27], value: 75 },
    { attr: ATTR_ID_TO_NAME[15], value: 25 },
  ],
  posBias: { pos: 0, POS_1: 2, POS_2: 1, POS_3: 0, POS_4: 3 },
  weightCurve: PENALTY_WEIGHT,
});

// Not in simsettings.ini (the [PENALTY_ATTRIBS]/[PENALTY_WEIGHT] tables say
// *who* takes a penalty, never *how often* a goal is one) — authored from
// real-world football's ~8-10% of goals being penalties, same footing as
// other authored-not-ported constants in this codebase (e.g. gen/playergen.js's
// age distribution).
export const PENALTY_CHANCE_OF_GOAL = 9;

export { POS_INDEX };
