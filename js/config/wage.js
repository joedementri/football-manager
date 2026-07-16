// config/wage.js — ported from reference/ini/playerwages.ini
// (fable-plans/plan1.md M6: "Port value/wage tables"). The [WAGE_LEAGUE]
// table is NOT ported here — data/leagues.json's `wageModifier` field
// already carries those exact per-league values (authored in M1 straight
// from this same INI's LEAGUE_MODIFIER_<id> rows), so engine/wage.js reads
// `league.wageModifier` directly instead of duplicating the table.
//
// Bracket tables use the same "first entry (ascending by .max) where
// x <= max" convention as config/value.js (see that file's header) — reused
// here via its exported `bracketVal` rather than a second copy.

// [WAGE_RATINGRANGE]: base weekly wage (£) by overall rating.
export const WAGE_RATING_BASE = [
  { max: 10, val: 20 }, { max: 35, val: 40 }, { max: 44, val: 45 }, { max: 54, val: 50 }, { max: 60, val: 60 },
  { max: 63, val: 80 }, { max: 66, val: 120 }, { max: 69, val: 250 }, { max: 72, val: 300 }, { max: 75, val: 420 },
  { max: 78, val: 500 }, { max: 81, val: 600 }, { max: 83, val: 650 }, { max: 85, val: 850 }, { max: 87, val: 1000 },
  { max: 90, val: 1300 }, { max: 92, val: 1800 }, { max: 95, val: 2000 }, { max: 97, val: 3000 }, { max: 100, val: 5000 },
];

// [WAGE_AGE]: percentage change by age.
export const WAGE_AGE_PCT = [
  { max: 16, val: -60 }, { max: 19, val: -35 }, { max: 21, val: -10 }, { max: 24, val: 0 }, { max: 25, val: 10 },
  { max: 27, val: 15 }, { max: 29, val: 20 }, { max: 34, val: 15 }, { max: 38, val: -15 }, { max: 100, val: -20 },
];

// [WAGE_POSITION]: percentage change by position code. RF/LF/LS share their
// listed neighbour (CF/ST) — same "unlisted code, nearest neighbour"
// convention config/value.js's POSITION_VALUE_PCT documents.
export const WAGE_POSITION_PCT = {
  GK: -30, SW: -10, RWB: -10, RB: -10, RCB: -10, CB: -10, LCB: -10, LB: -10, LWB: -10,
  RDM: -10, CDM: -10, LDM: -10, RM: 0, RCM: 0, CM: 0, LCM: 0, LM: 0, RAM: 0, CAM: 0, LAM: 0,
  RF: 10, CF: 10, LF: 10, RW: 10, RS: 10, ST: 10, LS: 10, LW: 10,
};
