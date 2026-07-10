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
