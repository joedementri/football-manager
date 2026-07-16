// config/negotiation.js — deferred negotiation response timing, ported from
// reference/ini/transfers.ini's [TRANSFERS_TRANSFER_TIMING] and
// [TRANSFERS_DEADLINEDAY], plus reference/ini/transfer.ini's APPROACH_*
// fields. Governs how long a submitted offer (contract renewal now;
// transfer bids in M7) takes to come back with an answer — user feedback:
// "Transfer offers and contract offers should not be instant... take 2-5
// days (usually 3 though)... Exception being on transfer deadline day, then
// everything is instant (system is 10 hours...)".
//
// Reconciling that with the actual ported numbers below: transfers.ini's
// own MIN/MAX_DAYS_TO_RESPOND is 3-6 (not 2-5), with a 3-tier
// CONTRACT_CHANCE_OF_OFFER escalation (20%/33%/100%) that front-loads
// resolution toward the *minimum* of the window rather than spreading it
// uniformly — RESPONSE_DAY_WEIGHTS below reproduces that "usually resolves
// early" shape directly off the real 3-6 day bounds (verbatim from the INI)
// rather than the user's own recalled 2-5 day figure, per their explicit
// "I want to use actual ini values" instruction elsewhere in the same
// message. TOTALNUMHOURS=10 is exact and matches the user's own count.

// [TRANSFERS_TRANSFER_TIMING]
export const MIN_DAYS_TO_RESPOND = 3;
export const MAX_DAYS_TO_RESPOND = 6;
export const MIN_DAYS_TO_EXPIRE_OFFER = 7; // an offer nobody ever resolves (shouldn't happen) is dropped after this many days as a safety net

// Weighted day offsets (0 = MIN_DAYS_TO_RESPOND) a resolution is drawn from —
// authored to front-load toward the minimum, the shape CONTRACT_CHANCE_OF_OFFER_0/1/2
// (20%/33%/100% chance-per-day-waited) implies without reproducing that
// exact multi-day Bernoulli process (undocumented beyond the 3 checkpoints,
// same "documented simplification" footing as config/objectives.js's header).
export const RESPONSE_DAY_WEIGHTS = [45, 25, 20, 10]; // days 3,4,5,6 respectively

// [TRANSFERS_DEADLINEDAY]
export const DEADLINE_DAY_TOTAL_HOURS = 10;
// [TRANSFERS_TRANSFER_TIMING] MIN/MAX_HOURS_TO_RESPOND_DEADLINEDAY = 1: any
// offer live on deadline day resolves within a single hour-tick.
export const DEADLINE_DAY_RESPONSE_HOURS = 1;

// transfer.ini [TRANSFER] APPROACH_* — the <6-months free-transfer approach
// mechanic (this project's own addition on top of a straight renewal: see
// engine/freeagents.js).
export const APPROACH_MIN_DAYS_BETWEEN_CPU_APPROACH = 10; // cooldown after a rejected/expired approach before the player can be approached again
export const APPROACH_USER_RESPONSE_MIN_DAYS = 1;
export const APPROACH_USER_RESPONSE_MAX_DAYS = 7;
// Not an exact INI match (no single field names "chance of a <6mo approach
// per day" in the reference files) — transfer.ini's own general
// CHANCE_PER_DAY (used for a related day-by-day negotiation roll) is reused
// here rather than inventing an unrelated number.
export const APPROACH_CHANCE_PER_DAY = 20;

/** Weighted pick of a response day-offset (0-based from MIN_DAYS_TO_RESPOND). */
export function pickResponseDayOffset(rng) {
  const total = RESPONSE_DAY_WEIGHTS.reduce((a, b) => a + b, 0);
  let roll = rng.next() * total;
  for (let i = 0; i < RESPONSE_DAY_WEIGHTS.length; i++) {
    roll -= RESPONSE_DAY_WEIGHTS[i];
    if (roll <= 0) return i;
  }
  return RESPONSE_DAY_WEIGHTS.length - 1;
}

/* ============================================================================
 * M7 additions — a new club's wage ask/acceptance (engine/playerdecision.js).
 * Ported from reference/ini/transfer.ini's [TRANSFER] wage-decision tables and
 * reference/ini/transfers.ini's [TRANSFERS_PLAYER_DECISION]/
 * [TRANSFERS_PLAYER_DECISION_POINTS]. These are a DIFFERENT pair of tables
 * from config/contract.js's OVERALL_ASK_PCT/AGE_ASK_PCT/PERCENTAGE_OF_ASK_ACCEPT
 * (those are the *renewal* curves — same club, M6); the tables below are named
 * distinctly in the INIs (PLAYER_WAGE_DEMAND_*, PLAYER_WAGE_DECISION_*) for a
 * *new*-club signing, where "how much more do I want" scales off the
 * destination club's own strength, not the player's current-club situation.
 * ========================================================================== */

// transfer.ini PLAYER_WAGE_DEMAND_TEAM_OVR_DIFF_n/PERC_INC_n: wage-ask bump
// (%) by (destination club's average overall - source club's average
// overall). Ascending-minimum-threshold reading, same convention as
// config/contract.js's minBracketVal (imported from there rather than
// re-implemented — see engine/playerdecision.js).
export const WAGE_DEMAND_TEAM_OVR_DIFF = [
  { min: -100, val: 0 }, { min: -10, val: 0 }, { min: -3, val: 15 }, { min: 0, val: 30 }, { min: 5, val: 50 }, { min: 20, val: 80 },
];

// transfer.ini PLAYER_WAGE_DECISION_PERC_n/SCORE_n: decision-score
// contribution by (offered wage - ask wage) / ask wage * 100 (a signed
// percentage delta, not a percentage-of-ask ratio — 0 = offered exactly the
// ask). Ascending-minimum-threshold reading (config/contract.js's
// minBracketVal convention).
export const WAGE_DECISION_SCORE = [
  { min: -10000000, val: -250 }, { min: -90, val: -200 }, { min: -80, val: -180 }, { min: -70, val: -150 },
  { min: -60, val: -120 }, { min: -50, val: -80 }, { min: -40, val: -60 }, { min: -30, val: -40 },
  { min: -20, val: -30 }, { min: -10, val: -20 }, { min: 0, val: 50 }, { min: 10, val: 55 },
  { min: 20, val: 60 }, { min: 30, val: 70 }, { min: 40, val: 80 }, { min: 50, val: 90 },
  { min: 60, val: 100 }, { min: 70, val: 120 }, { min: 80, val: 140 }, { min: 90, val: 150 }, { min: 10000000, val: 200 },
];

// transfers.ini [TRANSFERS_PLAYER_DECISION]
export const PLAYER_DECISION_SCORE_LOWER = 100; // MINPLAYERDECISIONSCORELOWERRANGE — below this, 0% chance
export const PLAYER_DECISION_SCORE_UPPER = 130; // MINPLAYERDECISIONSCOREUPPERRANGE — at/above this, 100% chance
export const MIN_AGE_TO_BE_VETERAN = 31; // MINAGETOBEVETERAN

// transfers.ini [TRANSFERS_PLAYER_DECISION_POINTS] — flat point contributions
// (the ones with a clean data hook in this project; HASGRUDGE, nationality-
// match, and the BESTPLAYERFORPOSITION/TOPXPLAYERONCURRENTTEAM squad-analysis
// cluster are skipped — no grudge-tracking or nationality-clustering exists
// anywhere else in the codebase, same "no data hook, don't fabricate one"
// footing as this file's own header on RESPONSE_DAY_WEIGHTS).
export const DECISION_POINTS = {
  ISRIVALCLUB: -200,
  ISTRANSFERLISTED: 175,
  ISVETERANPLAYER: -85,
  POSITIONAVAILABLEFORMAINROLE: 40,
  POSITIONNOTAVAILABLEFORMAINROLE: -30,
  GOODROLEOFFER: 25,
  ROLETOOHIGH: -175,
  ROLETOOLOW: -175,
  REALLYBADROLEOFFER: -1750, // a sentinel, not a literal addend — see engine/playerdecision.js's roleFitScore (same "extreme INI value = hard override" idiom as config/value.js's AGE_VALUE_PCT -1000 row)
};

// transfers.ini MANAGERPRESTIGE_0..9 / TEAMLEVELSTARRANK_0..12: these are
// score tables but the INI never documents the metric->bucket-index boundary
// (same undocumented-checkpoint gap config/objectives.js's header already
// flags for OBJ_INDEX_n) — index-mapped here proportionally across this
// project's own metric ranges (manager.rep 1-20; club.prestige 1-10), same
// "document the mapping, don't invent a fake boundary table" approach.
export const MANAGER_PRESTIGE_SCORE = [3, 6, 9, 12, 15, 18, 20, 24, 28, 35];
export const TEAM_LEVEL_STAR_RANK_SCORE = [-65, -50, -40, -25, -18, -9, 0, 10, 20, 25, 30, 40, 50];

// transfers.ini [TRANSFERS_PLAYER_DECISION_POINTS] PAIR_Xn/PAIR_Yn — the
// piecewise-linear score->Y curve every summed point-contribution total is
// passed through before being compared against PLAYER_DECISION_SCORE_LOWER/UPPER.
export const DECISION_CURVE_X = [-100, -50.68078, -10.84365, 0, 15.60586, 20.46254, 25.82085, 35.42671, 50.53746, 75.5244, 90.3909, 100.759, 115.3811, 127.3779, 150.0, 200.0];
export const DECISION_CURVE_Y = [-200.90909, -170.93389, -40.83471, 10.011562, 39.83471, 56.71074, 78.58677, 89.11572, 110.60331, 128.0909, 140.9256, 150.7603, 160.6364, 175.8595, 185.3884, 200.0];
export const DECISION_CURVE_MIN_X = -100;
export const DECISION_CURVE_MAX_X = 200;

/** Piecewise-linear interpolation through DECISION_CURVE_X/Y, clamped at the ends. */
export function decisionCurveY(x) {
  const clamped = Math.min(DECISION_CURVE_MAX_X, Math.max(DECISION_CURVE_MIN_X, x));
  for (let i = 0; i < DECISION_CURVE_X.length - 1; i++) {
    const x0 = DECISION_CURVE_X[i], x1 = DECISION_CURVE_X[i + 1];
    if (clamped >= x0 && clamped <= x1) {
      const t = (clamped - x0) / (x1 - x0);
      return DECISION_CURVE_Y[i] + t * (DECISION_CURVE_Y[i + 1] - DECISION_CURVE_Y[i]);
    }
  }
  return DECISION_CURVE_Y[DECISION_CURVE_Y.length - 1];
}
