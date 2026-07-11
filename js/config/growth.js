// config/growth.js — age→ratio curves ported verbatim from
// reference/ini/playergrowth.ini's CURVE_1..CURVE_7 blocks (AGE_n/RATIO_n
// pairs only). `ratio(age)` says what fraction of a player's potential their
// overall should be at that age; gen/player.js inverts it (potential =
// overall / ratio(age)) to seed a young player's hidden potential the same
// way the plan's M2 section describes ("use playergrowth.ini age-ratio
// curves inverted"). engine/growth.js (M5) will reuse the exact same curves
// — plus the WEIGHT_* attribute-distribution tables this file does not yet
// port, since M2 only needs the age/ratio shape, not growth application —
// to age players forward each season.
//
// Curve→position-group membership matches playergrowth.ini's own POSITION_n
// entries per curve and is cross-referenced in config/positions.js's
// `growthCurve` field (CURVE_5 alone covers both CM and CAM).

export const CURVES = {
  1: { // GK
    ages: [16, 18, 20, 21, 25, 31, 33, 35, 38, 40],
    ratios: [0.56, 0.71, 0.82, 0.86, 0.94, 1, 1, 0.97, 0.87, 0.77],
  },
  2: { // FB/WB
    ages: [16, 18, 20, 23, 25, 28, 30, 33, 35, 36, 40],
    ratios: [0.56, 0.72, 0.8, 0.9, 0.95, 1, 1, 0.95, 0.88, 0.83, 0.61],
  },
  3: { // CB
    ages: [16, 18, 20, 22, 25, 30, 32, 33, 35, 38, 40],
    ratios: [0.56, 0.69, 0.78, 0.84, 0.9, 1, 1, 0.98, 0.91, 0.78, 0.67],
  },
  4: { // CDM
    ages: [16, 18, 20, 23, 29, 31, 33, 34, 37, 40],
    ratios: [0.56, 0.69, 0.79, 0.88, 1, 1, 0.97, 0.94, 0.82, 0.66],
  },
  5: { // CM + CAM
    ages: [16, 17, 19, 22, 25, 26, 28, 30, 32, 33, 37, 40],
    ratios: [0.56, 0.64, 0.76, 0.87, 0.96, 0.98, 1, 1, 0.98, 0.96, 0.8, 0.64],
  },
  6: { // WM / wingers
    ages: [16, 17, 18, 19, 21, 27, 29, 31, 33, 35, 38, 40],
    ratios: [0.56, 0.66, 0.74, 0.8, 0.88, 1, 1, 0.98, 0.94, 0.87, 0.72, 0.6],
  },
  7: { // ST/CF
    ages: [16, 19, 21, 22, 24, 26, 28, 30, 32, 34, 37, 40],
    ratios: [0.56, 0.74, 0.84, 0.88, 0.94, 0.98, 1, 1, 0.98, 0.92, 0.8, 0.64],
  },
};

/** Linear-interpolated ratio(age) for a curve; clamps flat outside the table's range. */
export function ratioForAge(curveId, age) {
  const { ages, ratios } = CURVES[curveId];
  if (age <= ages[0]) return ratios[0];
  if (age >= ages[ages.length - 1]) return ratios[ratios.length - 1];
  for (let i = 0; i < ages.length - 1; i++) {
    if (age >= ages[i] && age <= ages[i + 1]) {
      const span = ages[i + 1] - ages[i];
      const t = span === 0 ? 0 : (age - ages[i]) / span;
      return ratios[i] + (ratios[i + 1] - ratios[i]) * t;
    }
  }
  return ratios[ratios.length - 1];
}

/** True if every curve's ratio table rises to its peak (1) then falls — a
 * basic sanity check dev/tests.html runs so a typo in the ported numbers
 * (e.g. two RATIO_n swapped) shows up immediately rather than silently
 * producing bogus potentials. */
export function curveIsUnimodal(curveId) {
  const { ratios } = CURVES[curveId];
  let peakIdx = 0;
  for (let i = 1; i < ratios.length; i++) if (ratios[i] > ratios[peakIdx]) peakIdx = i;
  for (let i = 1; i <= peakIdx; i++) if (ratios[i] < ratios[i - 1]) return false;
  for (let i = peakIdx + 1; i < ratios.length; i++) if (ratios[i] > ratios[i - 1]) return false;
  return true;
}

/* ============================================================================
 * M5 additions: growth *application* tuning (engine/growth.js), ported from
 * the rest of reference/ini/playergrowth.ini's [PLAYER_GROWTH]/[CURVE_n]
 * blocks — the parts M2 didn't need (M2 only inverted the age->ratio curve
 * to seed a young player's hidden potential; M5 is the milestone that
 * actually *applies* growth twice a season, per plan1.md's "Growth &
 * decline" section).
 * ========================================================================== */

/** [PLAYER_GROWTH] globals, verbatim. */
export const GROWTH_GLOBALS = {
  CURVE_ATTENUATION_PERCENTAGE: 90, // identical across every CURVE_n block
  GROWTH_VARIATION_PERCENTAGE: 10,
  MATCH_RATING_PERCENTAGE_BONUS_BAD: -10,
  MATCH_RATING_PERCENTAGE_BONUS_GOOD: 10,
  MATCH_PLAY_TIME_FOR_MAX_BONUS: 270,
  MATCH_PLAY_TIME_PERCENTAGE_BONUS: 10,
  INJURY_GROWTH_PERCENTAGE_MODIFIER: 5,
  INJURY_DECREASE_PERCENTAGE_MODIFIER: 150,
};

/** [CURVE_n]'s ABOVE_CURVE_* / BELOW_CURVE_* block — identical across every
 * curve in the INI (verified line-by-line), so ported once rather than
 * duplicated per curve. MIN_RATIO is closer to the curve, MAX_RATIO farther. */
export const CURVE_DEVIATION = {
  ABOVE_MIN_RATIO: 0.05, ABOVE_MODIFIER_FOR_MIN_RATIO: 1,
  ABOVE_MAX_RATIO: 0.3, ABOVE_MODIFIER_FOR_MAX_RATIO: 0,
  BELOW_MIN_RATIO: 0.05, BELOW_MODIFIER_FOR_MIN_RATIO: 1,
  BELOW_MAX_RATIO: 0.3, BELOW_MODIFIER_FOR_MAX_RATIO: 1.5,
};

/** Linear-interpolated (clamped) above/below-curve growth modifier for a
 * player sitting `ratio` = |current-expected|/expected away from their
 * curve. Above curve (current >= expected): modifier trends from 1 (right on
 * the curve) down to 0 (well above it) — an overachieving player's growth
 * just stalls rather than being dragged back down hard. Below curve:
 * modifier trends from 1 up to 1.5 — the further behind, the harder the
 * catch-up growth. */
export function curveDeviationModifier(ratio, isAbove) {
  const d = CURVE_DEVIATION;
  const [minR, minM, maxR, maxM] = isAbove
    ? [d.ABOVE_MIN_RATIO, d.ABOVE_MODIFIER_FOR_MIN_RATIO, d.ABOVE_MAX_RATIO, d.ABOVE_MODIFIER_FOR_MAX_RATIO]
    : [d.BELOW_MIN_RATIO, d.BELOW_MODIFIER_FOR_MIN_RATIO, d.BELOW_MAX_RATIO, d.BELOW_MODIFIER_FOR_MAX_RATIO];
  if (ratio <= minR) return minM;
  if (ratio >= maxR) return maxM;
  const t = (ratio - minR) / (maxR - minR);
  return minM + (maxM - minM) * t;
}

/** [CURVE_n]'s WEIGHT_AGE_n / WEIGHT_MENTAL_n / WEIGHT_PHYSICAL_n /
 * WEIGHT_SKILL_n tables — how a growth application's overall-point delta
 * splits across the mental/physical/skill attribute buckets, by age (a
 * *different*, finer age axis than the RATIO_n curve above, ported exactly
 * as the INI has it). plan1.md: "Distribute overall points to attributes
 * using the per-curve age-bracket weights ... mental = reactions,
 * positioning, interceptions, vision, aggression; physical = pace/jump/
 * stamina/strength/balance/agility; skill = the rest". Curve 1 (GK) has no
 * meaningful mental/physical/skill split for goalkeeping attributes —
 * engine/growth.js special-cases GK distribution instead (see its header).
 */
export const GROWTH_WEIGHTS = {
  1: {
    ages: [16, 17, 18, 19, 23, 24, 28, 29, 30, 35, 36, 38, 40],
    mental: [17, 17, 20, 40, 40, 60, 60, 80, 80, 0, 6, 6, 6],
    physical: [66, 66, 60, 40, 40, 20, 20, 0, 0, 88, 88, 82, 80],
    skill: [17, 17, 20, 20, 20, 20, 20, 20, 20, 12, 6, 12, 14],
  },
  2: {
    ages: [16, 17, 20, 22, 23, 24, 25, 27, 32, 33, 34, 36, 38, 40],
    mental: [10, 10, 10, 25, 25, 20, 30, 45, 0, 0, 10, 10, 10, 15],
    physical: [10, 10, 30, 35, 35, 20, 10, 5, 90, 80, 70, 60, 60, 50],
    skill: [80, 80, 60, 40, 40, 60, 60, 50, 10, 20, 20, 30, 30, 35],
  },
  3: {
    ages: [16, 20, 21, 23, 24, 25, 28, 29, 33, 34, 35, 38, 40],
    mental: [10, 10, 15, 20, 20, 30, 50, 50, 0, 0, 10, 10, 15],
    physical: [15, 30, 35, 35, 40, 20, 10, 0, 80, 80, 70, 60, 50],
    skill: [75, 60, 50, 45, 40, 50, 40, 50, 20, 20, 20, 30, 35],
  },
  4: {
    ages: [16, 18, 20, 21, 22, 24, 25, 28, 32, 33, 35, 36, 38, 40],
    mental: [10, 10, 10, 15, 20, 20, 30, 50, 0, 0, 10, 10, 10, 15],
    physical: [10, 25, 30, 35, 35, 40, 20, 10, 90, 80, 70, 60, 60, 50],
    skill: [80, 65, 60, 50, 45, 40, 50, 40, 10, 20, 20, 30, 30, 35],
  },
  5: {
    ages: [16, 19, 21, 22, 24, 25, 27, 32, 34, 36, 38, 40],
    mental: [10, 10, 20, 25, 25, 35, 35, 0, 10, 10, 15, 0],
    physical: [10, 30, 35, 35, 40, 20, 10, 90, 80, 60, 60, 50],
    skill: [80, 60, 45, 40, 35, 45, 55, 10, 20, 30, 30, 0],
  },
  6: {
    ages: [16, 18, 20, 22, 23, 24, 26, 32, 34, 35, 36, 38, 40],
    mental: [5, 10, 10, 20, 20, 20, 40, 0, 0, 10, 10, 10, 15],
    physical: [15, 20, 30, 35, 35, 35, 20, 90, 80, 70, 60, 60, 50],
    skill: [80, 70, 60, 40, 40, 45, 40, 10, 20, 20, 20, 30, 35],
  },
  7: {
    ages: [16, 18, 20, 22, 24, 25, 27, 32, 33, 35, 36, 38, 40],
    mental: [10, 10, 10, 25, 25, 35, 35, 0, 0, 10, 10, 10, 15],
    physical: [10, 25, 30, 35, 40, 20, 10, 90, 80, 70, 60, 60, 50],
    skill: [80, 65, 60, 40, 35, 45, 55, 10, 20, 20, 20, 30, 35],
  },
};

/** Note: table 5/6/7 arrays above have 12/13/13 entries matching each
 * curve's WEIGHTS/WEIGHT_AGE count in the INI (curve 5 has 12 age brackets,
 * not 13 — see WEIGHTS=12 in [CURVE_5]). */

// Outfield attribute -> growth bucket, exactly as plan1.md's "Growth &
// decline" section spells out: "mental = reactions, positioning,
// interceptions, vision, aggression; physical = pace/jump/stamina/strength/
// balance/agility; skill = the rest" ("pace" = both acceleration and
// sprintSpeed, config/attributes.js's PAC group).
export const MENTAL_ATTRIBUTES = ["reactions", "positioning", "interceptions", "vision", "aggression"];
export const PHYSICAL_ATTRIBUTES = ["acceleration", "sprintSpeed", "jumping", "stamina", "strength", "balance", "agility"];
export const SKILL_ATTRIBUTES = [
  "finishing", "shotPower", "longShots", "volleys", "penalties",
  "crossing", "fkAccuracy", "shortPass", "longPass", "curve",
  "ballControl", "dribbling", "composure",
  "headingAcc", "marking", "standTackle", "slideTackle",
];

/** Curve 1 (GK) has no meaningful mental/physical/skill split for goalkeeping
 * attributes, so its growth is instead distributed directly by the GK
 * overall formula's own coefficients (gen/overall.js's computeGkOverall):
 * .21 each for diving/handling/positioning/reflexes, .05 kicking, .11
 * reactions (sums to 1) — engine/growth.js special-cases curve 1 on this. */
export const GK_GROWTH_WEIGHTS = {
  gkDiving: 0.21, gkHandling: 0.21, gkPositioning: 0.21, gkReflexes: 0.21, gkKicking: 0.05, reactions: 0.11,
};

/** Interpolated {mental, physical, skill} split (normalized to sum 1) for a
 * curve+age — mirrors ratioForAge's linear interpolation, flat outside the
 * table's range. */
export function growthWeightsForAge(curveId, age) {
  const t = GROWTH_WEIGHTS[curveId];
  const { ages, mental, physical, skill } = t;
  const interp = (arr) => {
    if (age <= ages[0]) return arr[0];
    if (age >= ages[ages.length - 1]) return arr[arr.length - 1];
    for (let i = 0; i < ages.length - 1; i++) {
      if (age >= ages[i] && age <= ages[i + 1]) {
        const span = ages[i + 1] - ages[i];
        const frac = span === 0 ? 0 : (age - ages[i]) / span;
        return arr[i] + (arr[i + 1] - arr[i]) * frac;
      }
    }
    return arr[arr.length - 1];
  };
  const m = Math.max(0, interp(mental));
  const p = Math.max(0, interp(physical));
  const s = Math.max(0, interp(skill));
  const total = m + p + s || 1;
  return { mental: m / total, physical: p / total, skill: s / total };
}
