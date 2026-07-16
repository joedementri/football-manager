// config/positions.js — the 28 FIFA position codes and every grouping the
// generation/growth/scouting systems key off. Ground rule #4 (config over
// code): this is authored directly from reference/ini/playergrowth.ini's
// PLAYER_POSITION_* enum comment (lines 57-84) — that list is the "28 FIFA
// position codes (GK…LW)" the Player schema in fable-plans/plan1.md refers
// to (it literally starts at GK and ends at LW), so player.position and
// player.altPositions always draw from POSITION_CODES below, never a
// hand-rolled list.
//
// Three independent groupings hang off the same 28 codes, each ported from
// a different INI table that slices positions differently:
//   - overallGroup  → the 8 weight-table groups gen/overall.js uses
//                     ("GK, CB, FB/WB, CDM, CM, CAM, WM/wingers, ST/CF" per
//                     plan1.md's Overall calculation section).
//   - growthCurve   → the 7 CURVE_n blocks of playergrowth.ini (config/growth.js
//                     reads this to know which curve's age→ratio table
//                     applies to a position; CURVE_5 covers both CM and CAM,
//                     which is why growthCurve is coarser than overallGroup).
//   - workrateGroup → the 9 POS_n groups scout.ini's [PLAYER_ATTRIBUTES]
//                     workrate tables use (splits WM/wingers into WM and
//                     WING, unlike overallGroup).

export const POSITION_CODES = [
  "GK", "SW", "RWB", "RB", "RCB", "CB", "LCB", "LB", "LWB",
  "RDM", "CDM", "LDM", "RM", "RCM", "CM", "LCM", "LM",
  "RAM", "CAM", "LAM", "RF", "CF", "LF", "RW", "RS", "ST", "LS", "LW",
];

// index must match playergrowth.ini's PLAYER_POSITION_* numbering exactly —
// engine/growth.js (M5) will need that number to read CURVE_n's POSITION_x list.
const IDX = Object.fromEntries(POSITION_CODES.map((c, i) => [c, i]));

function info(code, { area, overallGroup, growthCurve, workrateGroup, side, label }) {
  return { code, index: IDX[code], area, overallGroup, growthCurve, workrateGroup, side, label };
}

export const POSITION_INFO = {
  GK: info("GK", { area: "GK", overallGroup: "GK", growthCurve: 1, workrateGroup: "GK", side: "C", label: "Goalkeeper" }),

  SW: info("SW", { area: "DEF", overallGroup: "CB", growthCurve: 3, workrateGroup: "CB", side: "C", label: "Sweeper" }),
  RCB: info("RCB", { area: "DEF", overallGroup: "CB", growthCurve: 3, workrateGroup: "CB", side: "R", label: "Centre Back" }),
  CB: info("CB", { area: "DEF", overallGroup: "CB", growthCurve: 3, workrateGroup: "CB", side: "C", label: "Centre Back" }),
  LCB: info("LCB", { area: "DEF", overallGroup: "CB", growthCurve: 3, workrateGroup: "CB", side: "L", label: "Centre Back" }),

  RWB: info("RWB", { area: "DEF", overallGroup: "FB", growthCurve: 2, workrateGroup: "FB", side: "R", label: "Right Wing Back" }),
  RB: info("RB", { area: "DEF", overallGroup: "FB", growthCurve: 2, workrateGroup: "FB", side: "R", label: "Right Back" }),
  LB: info("LB", { area: "DEF", overallGroup: "FB", growthCurve: 2, workrateGroup: "FB", side: "L", label: "Left Back" }),
  LWB: info("LWB", { area: "DEF", overallGroup: "FB", growthCurve: 2, workrateGroup: "FB", side: "L", label: "Left Wing Back" }),

  RDM: info("RDM", { area: "MID", overallGroup: "CDM", growthCurve: 4, workrateGroup: "CDM", side: "R", label: "Defensive Midfielder" }),
  CDM: info("CDM", { area: "MID", overallGroup: "CDM", growthCurve: 4, workrateGroup: "CDM", side: "C", label: "Defensive Midfielder" }),
  LDM: info("LDM", { area: "MID", overallGroup: "CDM", growthCurve: 4, workrateGroup: "CDM", side: "L", label: "Defensive Midfielder" }),

  RCM: info("RCM", { area: "MID", overallGroup: "CM", growthCurve: 5, workrateGroup: "CM", side: "R", label: "Central Midfielder" }),
  CM: info("CM", { area: "MID", overallGroup: "CM", growthCurve: 5, workrateGroup: "CM", side: "C", label: "Central Midfielder" }),
  LCM: info("LCM", { area: "MID", overallGroup: "CM", growthCurve: 5, workrateGroup: "CM", side: "L", label: "Central Midfielder" }),

  RAM: info("RAM", { area: "MID", overallGroup: "CAM", growthCurve: 5, workrateGroup: "CAM", side: "R", label: "Attacking Midfielder" }),
  CAM: info("CAM", { area: "MID", overallGroup: "CAM", growthCurve: 5, workrateGroup: "CAM", side: "C", label: "Attacking Midfielder" }),
  LAM: info("LAM", { area: "MID", overallGroup: "CAM", growthCurve: 5, workrateGroup: "CAM", side: "L", label: "Attacking Midfielder" }),

  RM: info("RM", { area: "MID", overallGroup: "WM_WING", growthCurve: 6, workrateGroup: "WM", side: "R", label: "Right Midfielder" }),
  LM: info("LM", { area: "MID", overallGroup: "WM_WING", growthCurve: 6, workrateGroup: "WM", side: "L", label: "Left Midfielder" }),
  RW: info("RW", { area: "ATT", overallGroup: "WM_WING", growthCurve: 6, workrateGroup: "WING", side: "R", label: "Right Winger" }),
  LW: info("LW", { area: "ATT", overallGroup: "WM_WING", growthCurve: 6, workrateGroup: "WING", side: "L", label: "Left Winger" }),

  RF: info("RF", { area: "ATT", overallGroup: "ST_CF", growthCurve: 7, workrateGroup: "ST_CF", side: "R", label: "Forward" }),
  CF: info("CF", { area: "ATT", overallGroup: "ST_CF", growthCurve: 7, workrateGroup: "ST_CF", side: "C", label: "Centre Forward" }),
  LF: info("LF", { area: "ATT", overallGroup: "ST_CF", growthCurve: 7, workrateGroup: "ST_CF", side: "L", label: "Forward" }),
  RS: info("RS", { area: "ATT", overallGroup: "ST_CF", growthCurve: 7, workrateGroup: "ST_CF", side: "R", label: "Striker" }),
  ST: info("ST", { area: "ATT", overallGroup: "ST_CF", growthCurve: 7, workrateGroup: "ST_CF", side: "C", label: "Striker" }),
  LS: info("LS", { area: "ATT", overallGroup: "ST_CF", growthCurve: 7, workrateGroup: "ST_CF", side: "L", label: "Striker" }),
};

export function positionInfo(code) {
  const p = POSITION_INFO[code];
  if (!p) throw new Error(`unknown position code "${code}"`);
  return p;
}

/** The 8 gen/overall.js weight-table groups, each with its member position codes. */
export const OVERALL_GROUPS = ["GK", "CB", "FB", "CDM", "CM", "CAM", "WM_WING", "ST_CF"];

/** The 9 scout.ini [PLAYER_ATTRIBUTES] workrate groups. */
export const WORKRATE_GROUPS = ["GK", "FB", "CB", "WM", "CDM", "CM", "CAM", "WING", "ST_CF"];

/** Squad-sheet area a position belongs to, for gen/squad.js's slot planner. */
export const AREAS = ["GK", "DEF", "MID", "ATT"];

export function codesForOverallGroup(group) {
  return POSITION_CODES.filter((c) => POSITION_INFO[c].overallGroup === group);
}

// M9 (engine/academy.js): youth-scout "player type" requests resolve to a
// workrateGroup first (config/youth.js's TYPE_POSITION_WEIGHTS, ported from
// scout.ini's own type->position-group table), then a concrete code here.
export function codesForWorkrateGroup(group) {
  return POSITION_CODES.filter((c) => POSITION_INFO[c].workrateGroup === group);
}
