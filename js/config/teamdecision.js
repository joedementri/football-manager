// config/teamdecision.js — ported from reference/ini/transferteamdecision.ini
// (fable-plans/plan1.md M7: fee-negotiation acceptance). This is the INI that
// decides how much a selling club *wants* for a player and how they respond
// to an offered fee.
//
// Two things this file's own numbers don't fully explain on their own,
// documented here rather than silently guessed (same footing as
// config/objectives.js's header):
//
//   - [POINTS_VALUE]'s "base value"/"adjusted value" pair is never given a
//     second formula anywhere in the ported INI set — this project has only
//     one computed player value (engine/value.js's computeValue, itself a
//     verbatim port of playervalues.ini). engine/teamdecision.js therefore
//     anchors BOTH ends of POINTS_VALUE's MIN/MAX interpolation to that same
//     `player.value`: a total decision score of TOTAL_POINTS_CAP.MIN_POINTS
//     (-100) yields value*(1+MIN/100) = value*0.5 ("wants less than it's
//     worth — a desperate sale"), a score of MAX_POINTS (125) yields
//     value*(1+MAX/100) = value*2.25 ("digs in hard"), linear between.
//   - [WANTED_FEE]'s MIN(1,000,000)/MAX(90,000,000) only ever describes MIN
//     as "the minimum fee used to use the min wanted fee table" — read here
//     as the literal switch: wantedFee below MIN uses the (more lenient)
//     MIN_WANTED_TABLE, at or above it uses the (stricter) MAX_WANTED_TABLE.
//     MAX has no documented second use in this file and isn't used for
//     anything beyond that one comparison.

/* ---------------------------------------------------------------------------
 * Score contributions (summed, then clamped by TOTAL_POINTS_CAP)
 * ------------------------------------------------------------------------- */

// [TEAM_OVERALL]: score by the *buying* club's own average overall (a weak
// club approaching makes the selling club dig in for a premium; an elite
// club's approach is accepted more readily, near/under value).
export const TEAM_OVERALL = [
  { max: 30, val: 80 }, { max: 40, val: 70 }, { max: 50, val: 60 }, { max: 60, val: 50 },
  { max: 70, val: 40 }, { max: 75, val: 30 }, { max: 78, val: 20 }, { max: 80, val: 10 },
  { max: 81, val: -20 }, { max: 82, val: -20 }, { max: 83, val: -20 }, { max: 84, val: -20 },
  { max: 85, val: -20 }, { max: 86, val: -20 }, { max: 87, val: -20 }, { max: 88, val: -20 },
  { max: 89, val: -40 }, { max: 90, val: -50 }, { max: 92, val: -50 }, { max: 100, val: -75 },
];

// [TIME_AT_CLUB_MONTHS]: score by months the player has been at the selling
// club (just-signed and long-serving-legend both raise reluctance; a settled
// mid-career player is the easiest to prise away).
export const TIME_AT_CLUB_MONTHS = [
  { max: 3, val: -250 }, { max: 6, val: -100 }, { max: 9, val: -95 }, { max: 14, val: -85 },
  { max: 18, val: -65 }, { max: 24, val: -50 }, { max: 28, val: -40 }, { max: 34, val: -30 },
  { max: 38, val: 0 }, { max: 48, val: 0 }, { max: 60, val: -25 }, { max: 1000, val: -75 },
];

// [SQUAD_SIZE]: score by the selling club's total roster size (a bloated
// squad is more willing to sell).
export const SQUAD_SIZE = [
  { max: 18, val: -100 }, { max: 20, val: -50 }, { max: 24, val: 0 }, { max: 30, val: 25 }, { max: 50, val: 45 },
];

// [FUTURE]: score by remaining potential (potential - overall); a floor
// table read "largest DIFF the value still clears" (descending thresholds,
// first match from the top wins) — below the smallest DIFF, no reluctance
// bonus applies (score 0).
export const FUTURE_UPSIDE = [
  { min: 60, val: -300 }, { min: 40, val: -250 }, { min: 30, val: -200 }, { min: 20, val: -150 },
  { min: 15, val: -100 }, { min: 10, val: -30 }, { min: 5, val: -10 },
];

// [PLAYER_IN_POSITION]: linear between LOW_SCORE (best player at the
// position, rank 1) and HIGH_SCORE (worst, rank >= LIMIT) — see
// engine/teamdecision.js's positionRankScore.
export const PLAYER_IN_POSITION_LOW_SCORE = -75; // rank 1 (best)
export const PLAYER_IN_POSITION_HIGH_SCORE = 100; // rank >= LIMIT (worst)
export const PLAYER_IN_POSITION_LIMIT = 5;

// [TOTAL_POINTS_CAP]
export const TOTAL_POINTS_CAP = { MIN_POINTS: -100, MAX_POINTS: 125 };

// [POINTS_VALUE]: percentage-of-value interpolation bounds (see header).
export const POINTS_VALUE = { MIN: -50, MAX: 125 };

/* ---------------------------------------------------------------------------
 * Offered-fee acceptance (MAX/MIN_WANTED_TABLE)
 * ------------------------------------------------------------------------- */

// [WANTED_FEE]
export const WANTED_FEE = { MIN: 1000000, MAX: 90000000 };

// [MAX_WANTED_TABLE_PERC]: "% of wanted fee offered" bucket thresholds,
// descending — first bucket (from the top) the offered % is >= wins.
export const WANTED_TABLE_PERC_BUCKETS = [10000000, 140, 130, 120, 110, 100, 90, 80, 70, 60, 50, -10000000];

// [MAX_WANTED_TABLE] / [MIN_WANTED_TABLE]: per-bucket ACCEPT/COUNTER/REJECT %
// for the first offer (Initial) and every subsequent counter-offer (Counter).
// Index 0 = bucket 1 (>=140% i.e. the 10000000 sentinel row is never reached
// in practice) .. index 11 = bucket 12 (<50%).
export const MAX_WANTED_TABLE = [
  { acceptInitial: 100, counterInitial: 0, rejectInitial: 0, acceptCounter: 100, counterCounter: 0, rejectCounter: 0 },
  { acceptInitial: 100, counterInitial: 0, rejectInitial: 0, acceptCounter: 100, counterCounter: 0, rejectCounter: 0 },
  { acceptInitial: 100, counterInitial: 0, rejectInitial: 0, acceptCounter: 100, counterCounter: 0, rejectCounter: 0 },
  { acceptInitial: 90, counterInitial: 10, rejectInitial: 0, acceptCounter: 90, counterCounter: 10, rejectCounter: 0 },
  { acceptInitial: 75, counterInitial: 25, rejectInitial: 0, acceptCounter: 80, counterCounter: 20, rejectCounter: 0 },
  { acceptInitial: 40, counterInitial: 60, rejectInitial: 0, acceptCounter: 60, counterCounter: 40, rejectCounter: 0 },
  { acceptInitial: 20, counterInitial: 80, rejectInitial: 0, acceptCounter: 35, counterCounter: 65, rejectCounter: 0 },
  { acceptInitial: 10, counterInitial: 90, rejectInitial: 0, acceptCounter: 15, counterCounter: 85, rejectCounter: 0 },
  { acceptInitial: 0, counterInitial: 100, rejectInitial: 0, acceptCounter: 0, counterCounter: 100, rejectCounter: 0 },
  { acceptInitial: 0, counterInitial: 80, rejectInitial: 20, acceptCounter: 0, counterCounter: 80, rejectCounter: 20 },
  { acceptInitial: 0, counterInitial: 0, rejectInitial: 100, acceptCounter: 0, counterCounter: 0, rejectCounter: 100 },
  { acceptInitial: 0, counterInitial: 0, rejectInitial: 100, acceptCounter: 0, counterCounter: 0, rejectCounter: 100 },
];

export const MIN_WANTED_TABLE = [
  { acceptInitial: 100, counterInitial: 0, rejectInitial: 0, acceptCounter: 100, counterCounter: 0, rejectCounter: 0 },
  { acceptInitial: 100, counterInitial: 0, rejectInitial: 0, acceptCounter: 100, counterCounter: 0, rejectCounter: 0 },
  { acceptInitial: 100, counterInitial: 0, rejectInitial: 0, acceptCounter: 100, counterCounter: 0, rejectCounter: 0 },
  { acceptInitial: 100, counterInitial: 0, rejectInitial: 0, acceptCounter: 100, counterCounter: 0, rejectCounter: 0 },
  { acceptInitial: 100, counterInitial: 0, rejectInitial: 0, acceptCounter: 90, counterCounter: 10, rejectCounter: 0 },
  { acceptInitial: 70, counterInitial: 30, rejectInitial: 0, acceptCounter: 80, counterCounter: 20, rejectCounter: 0 },
  { acceptInitial: 40, counterInitial: 60, rejectInitial: 0, acceptCounter: 50, counterCounter: 50, rejectCounter: 0 },
  { acceptInitial: 20, counterInitial: 80, rejectInitial: 0, acceptCounter: 30, counterCounter: 70, rejectCounter: 0 },
  { acceptInitial: 10, counterInitial: 75, rejectInitial: 15, acceptCounter: 15, counterCounter: 70, rejectCounter: 15 },
  { acceptInitial: 10, counterInitial: 75, rejectInitial: 15, acceptCounter: 10, counterCounter: 75, rejectCounter: 15 },
  { acceptInitial: 0, counterInitial: 0, rejectInitial: 100, acceptCounter: 0, counterCounter: 0, rejectCounter: 100 },
  { acceptInitial: 0, counterInitial: 0, rejectInitial: 100, acceptCounter: 0, counterCounter: 0, rejectCounter: 100 },
];

/** First bucket (1-based) whose threshold the offered % is >= (descending scan). */
export function wantedFeeBucketIndex(pctOffered) {
  for (let i = 0; i < WANTED_TABLE_PERC_BUCKETS.length; i++) {
    if (pctOffered >= WANTED_TABLE_PERC_BUCKETS[i]) return i;
  }
  return WANTED_TABLE_PERC_BUCKETS.length - 1;
}
