// config/youth.js — Youth academy tuning (fable-plans/plan1.md M9), ported
// from reference/ini/scout.ini's [YOUTH_SCOUT] (max scouts), [PLAYER_ATTRIBUTES]
// (youth age range, potential tiers, type->position-group odds),
// [SCOUT_REPORT] (tier odds by Judgment, exact-type-match odds by Experience),
// [YOUTH_SQUAD] and [YOUTH_PLAYER_RETIREMENT] sections.
//
// Scout-market primitives (hire/sack cost, monthly salary, pool size/refresh,
// candidate stat range by club tier, mission-duration tiers, the fuzzy
// ovr/pot range table) are NOT duplicated here — config/scouting.js's own
// header already documents that scout.ini's [YOUTH_SCOUT] section (not
// [GTN]) is the literal source of the SCOUT_COST_* table shared by both M8's
// GTN scouts and this milestone's youth scouts, and engine/academy.js reuses
// those exports directly. This project's real FIFA-15 reference screenshot
// (REFERENCE_PICS/more_screens/OFFICE_SCREEN/ms_YOUTH_STAFF_SCREEN.png) also
// shows a youth scout sent on a fixed-duration assignment ("Duration: 9
// Months, Returning: 03/04/2016") — exactly config/scouting.js's own
// MISSION_TIERS (Short/Medium/Long = 3/6/9mo) — so engine/academy.js reuses
// that table too rather than inventing a second duration scale.

export const MAX_YOUTH_SCOUTS = 3; // SCOUT_MAXIMUM_SCOUTS_NUMBER — scout.ini [YOUTH_SCOUT] line 3

// YOUTH_PLAYER_AGE_RANGE_LOW/HIGH — scout.ini [PLAYER_ATTRIBUTES] lines 128-129.
export const YOUTH_PLAYER_MIN_AGE = 15;
export const YOUTH_PLAYER_MAX_AGE = 17;

// TIER_1..4_POTENTIAL_RANGE_0/1 — scout.ini [PLAYER_ATTRIBUTES] lines 133-140.
// Tier 1 is the rarest/best; Tier 4 the most common. plan1.md's own M9
// acceptance line quotes these four ranges verbatim.
export const POTENTIAL_TIERS = [
  { label: "Tier 1", range: [75, 95] },
  { label: "Tier 2", range: [65, 90] },
  { label: "Tier 3", range: [60, 85] },
  { label: "Tier 4", range: [55, 80] },
];

// KNOWLEDGE_LEVEL_1..5_TIER_1..4_PERC — scout.ini [SCOUT_REPORT] lines
// 677-700 ("the higher the scout's knowledge, the better the chances to find
// a player of a higher tier"). Index 0 unused (Judgment stars are 1-5).
export const TIER_ODDS_BY_JUDGMENT = [
  null,
  [1, 2, 15, 82],
  [2, 3, 30, 65],
  [4, 6, 36, 54],
  [6, 8, 50, 36],
  [10, 12, 64, 14],
];

/** Weighted pick of one of the 4 POTENTIAL_TIERS entries, by scout Judgment (1-5). */
export function rollPotentialTier(rng, judgment) {
  const odds = TIER_ODDS_BY_JUDGMENT[judgment];
  const total = odds.reduce((a, b) => a + b, 0);
  let roll = rng.next() * total;
  for (let i = 0; i < odds.length; i++) {
    if (roll < odds[i]) return POTENTIAL_TIERS[i];
    roll -= odds[i];
  }
  return POTENTIAL_TIERS[POTENTIAL_TIERS.length - 1];
}

// PLAYER_TYPES enum — scout.ini [PLAYER_ATTRIBUTES] lines 217-225, labelled
// per plan1.md M9's own example vocabulary ("Attacker, Defensive Minded,
// Goalkeeper, Physically Strong, Skilled...") plus the two types the plan
// didn't name explicitly (Physical Speed labelled "Pacey" to match
// config/scouting.js's own GTN tag name for the same idea; Mentally Strong
// kept verbatim). Order matches the INI's own 0-6 indices.
export const PLAYER_TYPES = [
  { id: "skilled", label: "Skilled" },
  { id: "pacey", label: "Pacey" },
  { id: "physical", label: "Physically Strong" },
  { id: "mental", label: "Mentally Strong" },
  { id: "goalkeeper", label: "Goalkeeper" },
  { id: "attacker", label: "Attacker" },
  { id: "defensive", label: "Defensive Minded" },
];

// 0..6_TO_POS_0..8_PERC — scout.ini [PLAYER_ATTRIBUTES] lines 262-341: each
// type's odds across the 9 position groups. scout.ini's own POS_0..8 order
// (GOALKEEPER, DEF-CENTRE, DEF-WING, MID-DEFENSIVE, MID-OFFENSIVE, MID-WING,
// FWD-CENTRE, FWD-WING, MID-CENTRE) maps 1:1 onto config/positions.js's
// WORKRATE_GROUPS as GK/CB/FB/CDM/CAM/WM/ST_CF/WING/CM respectively.
export const TYPE_POSITION_WEIGHTS = {
  skilled:    { GK: 0, CB: 0, FB: 0, CDM: 10, CAM: 35, WM: 30, ST_CF: 20, WING: 35, CM: 30 },
  pacey:      { GK: 0, CB: 0, FB: 0, CDM: 0, CAM: 0, WM: 30, ST_CF: 20, WING: 35, CM: 0 },
  physical:   { GK: 0, CB: 35, FB: 45, CDM: 10, CAM: 0, WM: 0, ST_CF: 20, WING: 0, CM: 5 },
  mental:     { GK: 0, CB: 5, FB: 5, CDM: 35, CAM: 30, WM: 20, ST_CF: 0, WING: 0, CM: 30 },
  goalkeeper: { GK: 100, CB: 0, FB: 0, CDM: 0, CAM: 0, WM: 0, ST_CF: 0, WING: 0, CM: 0 },
  attacker:   { GK: 0, CB: 0, FB: 5, CDM: 0, CAM: 35, WM: 20, ST_CF: 40, WING: 30, CM: 20 },
  defensive:  { GK: 0, CB: 60, FB: 45, CDM: 45, CAM: 0, WM: 0, ST_CF: 0, WING: 0, CM: 15 },
};

/** Weighted pick of a config/positions.js workrateGroup for a given
 * PLAYER_TYPES id, per TYPE_POSITION_WEIGHTS above. */
export function pickWorkrateGroupForType(rng, typeId) {
  const weights = TYPE_POSITION_WEIGHTS[typeId];
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let roll = rng.next() * total;
  for (const [group, w] of Object.entries(weights)) {
    if (roll < w) return group;
    roll -= w;
  }
  return "CM";
}

// EXPERIENCE_LEVEL_1..5_ALTERNATIVE_0_PERC — scout.ini [SCOUT_REPORT] lines
// 712-735: odds a report's find is exactly the requested type ("Exact
// Match"/Alternative 0) vs a different type, scaling with the scout's
// Experience (plan1.md M9: "player type requested ... honoured with
// probability scaling with Experience", verbatim). Alternatives 1-3 (a
// *specific* different type, per scout.ini/youth_scout.ini's own
// YOUTH_SCOUT_ALTERNATIVE_TYPE_x sub-tables) aren't separately modelled —
// engine/academy.js picks uniformly among the other 6 types instead when the
// exact-match roll fails, since those sub-tables don't document which
// concrete type each of their 4 "alternative slots" maps to.
export const EXACT_TYPE_MATCH_PCT_BY_EXPERIENCE = [null, 30, 45, 58, 65, 80];

// EXPERIENCE_1..5_PERC_FIND_PLAYERS_RANGE_0/1 — scout.ini [SCOUT_REPORT]
// lines 660-673 — is config/scouting.js's own FIND_COUNT_RANGE_BY_EXPERIENCE
// ([1,2]..[5,7]), used as-is by M8's GTN missions. plan1.md M9 caps a youth
// report at "1-3 prospects" verbatim, so this is that same table's shape
// (low experience -> a narrower, lower range; high experience -> wider,
// higher) rescaled to fit inside [1,3] rather than reusing the GTN numbers
// directly.
export const PROSPECTS_PER_REPORT_BY_EXPERIENCE = [null, [1, 1], [1, 2], [1, 2], [2, 3], [2, 3]];

// YOUTH_SQUAD — scout.ini [YOUTH_SQUAD] lines 911-921.
export const MAX_YOUTH_SQUAD_SIZE = 16;
export const MIN_PROMOTION_AGE = 16; // MIN_PLAYER_AGE_FOR_PROMOTION
// MONTHS_TO_UNCOVER_PLAYER_TYPE = 6 (full reveal). This project's
// scouting.level has 3 non-zero rungs (1/2/3, see config/scouting.js), so
// engine/academy.js's monthly tick narrows one level every 3 months
// (MONTHS_BETWEEN_NARROW_STEPS), reaching level 3 — full reveal — at exactly
// month 6, matching MONTHS_TO_UNCOVER_PLAYER_TYPE.
export const MONTHS_TO_UNCOVER_PLAYER_TYPE = 6;
export const MONTHS_BETWEEN_NARROW_STEPS = 3;
export const MONTHS_IN_SQUAD_BEFORE_RETIREMENT = 3;

// YOUTH_PLAYER_RETIREMENT — scout.ini lines 925-960. Age buckets map onto
// PLAYER_RETIRE_AT_AGE_RANGE (16-18): bucket 0 = age 16, bucket 1 = age 17,
// bucket 2 = age 18+ (guaranteed departure by the season's final checkpoint —
// RETIREMENT_PERC_AGE_2_POINT_3 = 100 — matching MIN_PLAYER_AGE_FOR_PROMOTION
// giving the user a full 16-17 window to act before that).
export const RETIREMENT_AGE_MIN = 16;
export const RETIREMENT_PERC_BY_AGE_BUCKET = [
  [0, 2, 4, 6],
  [7, 9, 12, 15],
  [15, 20, 25, 100],
];
export const RETIREMENT_WARNING_DAYS = 7; // NUMBER_DAYS_TO_RETIRE_PLAYER

export function retirementAgeBucket(age) {
  return Math.min(2, Math.max(0, age - RETIREMENT_AGE_MIN));
}

/** Interpolates scout.ini's 4 season-progress checkpoints (20/50/75/90% —
 * POINT_0..3_PERCENTAGE_IN_SEASON) into a continuous percentage so
 * engine/academy.js's monthly tick (the natural cadence already used for
 * development/narrowing) can roll a single number instead of needing to hit
 * 4 discrete calendar checkpoints exactly — a plan-authored smoothing of the
 * same table, same footing as config/scouting.js's own documented
 * departures from a literal day-by-day INI table. Returns 0 below age 16
 * (PLAYER_RETIRE_AT_AGE_RANGE_0) — no retirement-threat roll below that. */
export function retirementChancePct(age, seasonProgressPct) {
  if (age < RETIREMENT_AGE_MIN) return 0;
  const bucket = retirementAgeBucket(age);
  const checkpoints = [20, 50, 75, 90];
  const percs = RETIREMENT_PERC_BY_AGE_BUCKET[bucket];
  if (seasonProgressPct <= checkpoints[0]) return percs[0];
  if (seasonProgressPct >= checkpoints[checkpoints.length - 1]) return percs[percs.length - 1];
  for (let i = 0; i < checkpoints.length - 1; i++) {
    if (seasonProgressPct >= checkpoints[i] && seasonProgressPct <= checkpoints[i + 1]) {
      const t = (seasonProgressPct - checkpoints[i]) / (checkpoints[i + 1] - checkpoints[i]);
      return percs[i] + (percs[i + 1] - percs[i]) * t;
    }
  }
  return percs[percs.length - 1];
}

// KNOWLEDGE_1..5_UNLOCK_ATTRIB_RANGE_0/1 — scout.ini [SCOUT_REPORT] lines
// 747-760 ("min/max player attributes to unlock"), averaged per Judgment
// level and re-keyed onto this project's 0-3 scouting.level (not a 1-5
// Judgment star) since a youth prospect's own reveal progresses with time
// (engine/academy.js's monthly tick), not with any one scout's stars — see
// this file's own header. Level 3 unlocks all 34 (ALL_ATTRIBUTES.length —
// 29 outfield + 5 GK, config/attributes.js), matching "fully scouted ->
// exact" everywhere else in this project.
export const ATTR_UNLOCK_COUNT_BY_LEVEL = [0, 14, 22, 34];

// INITIAL_SCOUT_VARIANCE_PERCENTAGE / KNOWLEDGE_x_VARIANCE_PERCENTAGE
// (scout.ini [SCOUT_REPORT] lines 762-770) describe a *narrow* 3-7% band once
// an attribute is unlocked — far tighter than REFERENCE_PICS/more_screens/
// OFFICE_SCREEN/ms_YOUTH_ACADEMY_YOUTH_SQUAD_PLAYER_ATTRIBUTES.png actually
// shows (e.g. "Short Passing 44-84", a ~40% band on an unlocked attribute).
// ui/youthui.js's fuzzy display follows the screenshot's visual shape
// (wide-then-narrowing) rather than the letter of those two percentages.
export const ATTR_VARIANCE_PCT_BY_LEVEL = [0, 35, 18, 0];
