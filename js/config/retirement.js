// config/retirement.js — ported from reference/ini/playerretirement.ini
// (fable-plans/plan1.md M5: "Retirement (playerretirement.ini: age 33+ &
// declining ⇒ announce in Jan, retire in July)"). Two tables:
//   - POSITION_MAPPING: playergrowth.ini's 28 PLAYER_POSITION_n codes
//     collapse onto 6 coarser retirement groups (PM_GK/FB/CB/WINGER/CM/ATT) —
//     config/positions.js's POSITION_CODES share the exact same index
//     ordering (its own header cites the same INI enum), so this table is
//     indexed by positionInfo(code).index directly.
//   - PERCENTAGE_POSMAP_<group>_<ageOffset>: retirement chance (%) by group
//     and age (ageOffset 0 = age 26, per MIN_RETIREMENT_AGE, up to 19 = age 45).

export const MIN_RETIREMENT_AGE = 26;
export const MAX_RETIREMENT_AGE = 45;
export const MIN_GK_RETIREMENT_AGE = 35; // GKs never roll retirement before this age, regardless of the table

// Index = playergrowth.ini's PLAYER_POSITION_n (config/positions.js's
// positionInfo(code).index matches this exactly). Value = retirement group
// 0=PM_GK, 1=PM_FB, 2=PM_CB, 3=PM_WINGER, 4=PM_CM, 5=PM_ATT. Ported verbatim,
// including RCB/CB/LCB's split across PM_FB/PM_CB (playerretirement.ini's own
// POSITION_MAPPING, not a typo we get to silently "fix").
export const POSITION_MAPPING = [
  0, 2, 1, 1, 1, 2, 2, 1, 1, 4, 4, 4, 3, 4, 4, 4, 3, 4, 4, 4, 5, 5, 5, 3, 5, 5, 5, 3,
];

export const RETIREMENT_GROUPS = ["GK", "FB", "CB", "WINGER", "CM", "ATT"];

/** PERCENTAGE_POSMAP_<group>_<ageOffset>, ageOffset 0..19 = age 26..45. */
export const PERCENTAGE_POSMAP = {
  GK: [0, 0, 0, 0, 0, 0, 0, 0, 1, 5, 10, 20, 55, 75, 83, 90, 100, 100, 100, 100],
  FB: [0, 0, 0, 0, 0, 0, 0, 8, 25, 58, 79, 88, 94, 100, 100, 100, 100, 100, 100, 100],
  CB: [0, 0, 0, 0, 0, 0, 0, 0, 12, 25, 50, 70, 83, 93, 100, 100, 100, 100, 100, 100],
  WINGER: [0, 0, 0, 0, 0, 0, 6, 15, 50, 75, 83, 88, 95, 100, 100, 100, 100, 100, 100, 100],
  CM: [0, 0, 0, 0, 0, 0, 0, 5, 15, 35, 52, 74, 87, 93, 100, 100, 100, 100, 100, 100],
  ATT: [0, 0, 0, 0, 0, 0, 0, 5, 16, 39, 65, 78, 89, 100, 100, 100, 100, 100, 100, 100],
};

/** Retirement chance (0-1) for a player of the given position code + age. */
export function retirementChance(positionIndex, age) {
  const group = RETIREMENT_GROUPS[POSITION_MAPPING[positionIndex]];
  if (group === "GK" && age < MIN_GK_RETIREMENT_AGE) return 0;
  if (age < MIN_RETIREMENT_AGE) return 0;
  const offset = Math.min(PERCENTAGE_POSMAP[group].length - 1, age - MIN_RETIREMENT_AGE);
  return PERCENTAGE_POSMAP[group][offset] / 100;
}

// [PLAYER_REGEN] TARGET_AGE_COUNT_n — not used to gate individual regen
// generation (that would require tracking the whole world's live age
// histogram, a much bigger undertaking than plan1.md's M5 scope calls for);
// kept here for reference/future tuning per ground rule #4.
export const TARGET_AGE_COUNT = { 16: 88, 17: 330, 18: 698, 19: 946, 20: 1045, 21: 1130 };
