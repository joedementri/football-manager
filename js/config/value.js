// config/value.js — ported from reference/ini/playervalues.ini's [NEW]
// method (METHOD=1 — the "Defined values" path; [CLASSIC]'s magic-number/
// power formula is not used). engine/value.js applies these tables to
// compute a player's market value: a base value by overall rating,
// multiplied by one (1 + pct/100) factor per modifier below.
//
// Every bracket table here uses the INI's own convention verbatim: each row
// is "<= this threshold", read in ascending order, first match wins (e.g.
// [AGE]'s "AGE_1 = 17 // Players inclusively less than this age"). The
// [FORM]/[MORALE] tables are the one exception — form/morale are already
// discrete 1-10 scales in this project's Player schema, so those are plain
// index lookups, not brackets.

/** Shared bracket-lookup: first entry (ascending by `.max`) where x <= max. */
export function bracketVal(table, x) {
  for (const row of table) if (x <= row.max) return row.val;
  return table[table.length - 1].val;
}

// [RATINGRANGE]: base value (£) by overall rating.
export const RATING_VALUE = [
  { max: 5, val: 1000 }, { max: 40, val: 14000 }, { max: 50, val: 23000 }, { max: 51, val: 28500 },
  { max: 52, val: 34000 }, { max: 53, val: 41000 }, { max: 54, val: 50000 }, { max: 55, val: 60000 },
  { max: 56, val: 70000 }, { max: 57, val: 81000 }, { max: 58, val: 92000 }, { max: 59, val: 107000 },
  { max: 60, val: 128000 }, { max: 61, val: 156000 }, { max: 62, val: 192500 }, { max: 63, val: 229000 },
  { max: 64, val: 296000 }, { max: 65, val: 360000 }, { max: 66, val: 425000 }, { max: 67, val: 496000 },
  { max: 68, val: 590000 }, { max: 69, val: 696000 }, { max: 70, val: 915500 }, { max: 71, val: 1125000 },
  { max: 72, val: 1450000 }, { max: 73, val: 1975000 }, { max: 74, val: 2312500 }, { max: 75, val: 2800000 },
  { max: 76, val: 3600000 }, { max: 77, val: 4750000 }, { max: 78, val: 5800000 }, { max: 79, val: 7000000 },
  { max: 80, val: 9750000 }, { max: 81, val: 11500000 }, { max: 82, val: 13700000 }, { max: 83, val: 16000000 },
  { max: 84, val: 19800000 }, { max: 85, val: 22800000 }, { max: 86, val: 26850000 }, { max: 87, val: 30900000 },
  { max: 88, val: 36000000 }, { max: 89, val: 41500000 }, { max: 90, val: 46500000 }, { max: 91, val: 52000000 },
  { max: 92, val: 58000000 }, { max: 93, val: 63500000 }, { max: 94, val: 69500000 }, { max: 95, val: 77000000 },
  { max: 96, val: 84000000 }, { max: 97, val: 88000000 }, { max: 98, val: 93000000 }, { max: 99, val: 97000000 },
  { max: 100, val: 100000000 },
];

// [AGE]: percentage change by age. GK_AGE_MOD/GK_MIN_AGE_MOD shift a
// goalkeeper's *lookup* age younger from GK_MIN_AGE_MOD onward (keepers peak
// later than outfielders — playervalues.ini applies the [AGE] table to
// age+GK_AGE_MOD for them past that threshold).
export const AGE_VALUE_PCT = [
  { max: 17, val: 5 }, { max: 18, val: 10 }, { max: 19, val: 25 }, { max: 22, val: 48 }, { max: 23, val: 48 },
  { max: 24, val: 48 }, { max: 25, val: 42 }, { max: 26, val: 40 }, { max: 27, val: 35 }, { max: 28, val: 30 },
  { max: 29, val: 25 }, { max: 30, val: 20 }, { max: 31, val: 10 }, { max: 32, val: 0 }, { max: 33, val: -20 },
  { max: 34, val: -40 }, { max: 35, val: -60 }, { max: 36, val: -98 }, { max: 39, val: -100 }, { max: 100, val: -1000 },
];
export const GK_AGE_MOD = -3;
export const GK_MIN_AGE_MOD = 28;

// [POTENTIAL]: percentage change by remaining potential (potential - overall).
export const POTENTIAL_VALUE_PCT = [
  { max: 1, val: 15 }, { max: 2, val: 20 }, { max: 3, val: 25 }, { max: 4, val: 30 }, { max: 5, val: 35 },
  { max: 6, val: 40 }, { max: 7, val: 45 }, { max: 8, val: 55 }, { max: 9, val: 65 }, { max: 10, val: 75 },
  { max: 11, val: 90 }, { max: 12, val: 100 }, { max: 13, val: 120 }, { max: 20, val: 160 }, { max: 30, val: 190 },
  { max: 50, val: 235 },
];

// [CONTRACT]: percentage change by years remaining on the contract.
export const CONTRACT_VALUE_PCT = [
  { max: 0, val: -70 }, { max: 1, val: -50 }, { max: 2, val: 10 }, { max: 3, val: 20 }, { max: 4, val: 20 },
  { max: 6, val: 20 }, { max: 8, val: 20 }, { max: 10, val: 20 }, { max: 11, val: 20 }, { max: 100, val: 20 },
];

// [FORM]: percentage change by form (1-10 scale — direct index, not a
// bracket; index 0 = form 1).
export const FORM_VALUE_PCT = [-60, -60, -60, -45, -30, 0, 15, 35, 55, 80];

// [CLUB_PRESTIGE]: percentage change by club prestige (1-10 scale).
export const CLUB_PRESTIGE_VALUE_PCT = [
  { max: 1, val: 5 }, { max: 2, val: 10 }, { max: 3, val: 12 }, { max: 6, val: 14 }, { max: 7, val: 16 }, { max: 10, val: 18 },
];

// [POSITION]: percentage change by position code. RF/LF have no entry in the
// INI (only CF is listed for that central-forward slot) — treated as CF's
// modifier, the nearest forward code, same "verbatim port, sane fallback for
// an unlisted entry" convention config/retirement.js's header describes.
export const POSITION_VALUE_PCT = {
  GK: -15, SW: -18, RWB: -18, RB: -18, RCB: -15, CB: -15, LCB: -15, LB: -18, LWB: -18,
  RDM: -15, CDM: -15, LDM: -15, RM: 10, RCM: 10, CM: 10, LCM: 10, LM: 10,
  RAM: 15, CAM: 15, LAM: 15, RF: 15, CF: 15, LF: 15, LW: 15, RW: 15, RS: 18, ST: 18, LS: 18,
};
