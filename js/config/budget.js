// config/budget.js — F4 (fable-plans/plan2.md): Finances/Budget Allocation +
// Sell Players' Release guard. Ported from reference/ini/cmsettings.ini's
// [BUDGET] section and reference/ini/transfer.ini's MIN_PLAYERS_POSITION_*
// fields.

/* ============================================================================
 * cmsettings.ini [BUDGET]
 * ========================================================================== */

// "percentage of player sales that go back to the transfer budget" — banded
// by how forgiving the board is. [JUDGMENT CALL, logged in plan2-decisions.md
// F4] direction of the club-prestige -> tier mapping: a small/lower-league
// club's board is LENIENT (every sale matters, give the manager the money
// back to reinvest); a big, wealthy club's board is STRICT (sale proceeds
// aren't the manager's to keep re-spending, more goes to the club's general
// finances instead). Bucketed off club.prestige (1-10) using the same
// threshold shape config/transferai.js's leagueTier() already established
// (>=8/>=4/else) rather than inventing a new banding style.
export const BOARD_FINANCIAL_STRICTNESS = { lenient: 85, moderate: 75, strict: 60 };
export function boardStrictnessPct(club) {
  if (club.prestige >= 8) return BOARD_FINANCIAL_STRICTNESS.strict;
  if (club.prestige >= 4) return BOARD_FINANCIAL_STRICTNESS.moderate;
  return BOARD_FINANCIAL_STRICTNESS.lenient;
}

// "The default split for transfer/wage budget at the start of a season" —
// used to derive the Budget Allocation slider's £-to-£/week conversion rate
// below, not as a literal season-start action (no code currently re-splits a
// fresh season's budget 80:20 — the club's own baseTransferBudget/
// computeWageCeiling already stand as the two halves).
export const TRANSFER_WAGE_SPLIT_PERCENT = 80;

// "1 unit weekly wage <-> 52-week x split factor of transfer money": reading
// TRANSFER_WAGE_SPLIT_PERCENT as the baseline transfer:wage value ratio
// (80:20 = a "split factor" of 4), so giving up GBP1/week of wage budget buys
// 52 x 4 = GBP208 of one-off transfer budget, and vice versa — this is the
// exchange rate the Budget Allocation Slider (ms_FINANCES_BUDGET_ALLOCATION.png)
// steps by, ported/derived (not a literal INI field) and asserted in
// dev/tests.js.
export const BUDGET_SPLIT_WEEKS_PER_YEAR = 52;
export const BUDGET_SPLIT_FACTOR = TRANSFER_WAGE_SPLIT_PERCENT / (100 - TRANSFER_WAGE_SPLIT_PERCENT); // 80/20 = 4
export const BUDGET_SPLIT_RATE = BUDGET_SPLIT_WEEKS_PER_YEAR * BUDGET_SPLIT_FACTOR; // 208 transfer-GBP per wage-GBP/week

// CARRY_OVER_BUDGET_PERCENT=25 is a flat single figure; BUDGET_CARRY_OVER_
// AMOUNT_LIMIT_n/PERCENT_n is a separate, more granular 8-band table (bigger
// leftover pots carry over a *smaller* percentage — a rollover-time brake on
// runaway budgets). [JUDGMENT CALL, logged]: the banded table is used for the
// season-rollover carry-over of *unspent transfer budget* (rolloverSeason
// below — it's the more specific of the two, and its own naming
// ("BUDGET_CARRY_OVER_*") matches that mechanic verbatim); the flat 25% is
// used for the *wage* side's own leftover ("Surplus Weekly Budget" carrying
// into next season's baseline), since nothing else in this section names a
// wage-specific carry-over table.
export const CARRY_OVER_BUDGET_PERCENT = 25;
export const BUDGET_CARRY_OVER_BANDS = [
  { limit: 1000000, pct: 90 },
  { limit: 2000000, pct: 85 },
  { limit: 5000000, pct: 75 },
  { limit: 10000000, pct: 65 },
  { limit: 20000000, pct: 55 },
  { limit: 40000000, pct: 45 },
  { limit: 75000000, pct: 30 },
  { limit: 90000000, pct: 10 },
  { limit: Infinity, pct: 10 },
];
/** First band whose limit >= amount (ascending-ceiling reading — the INI's
 * own numbered AMOUNT_LIMIT_1..8 / PERCENT_1..8 pairing implies "up to this
 * much, this percentage carries over"). */
export function carryOverPct(amount) {
  for (const band of BUDGET_CARRY_OVER_BANDS) if (amount <= band.limit) return band.pct;
  return BUDGET_CARRY_OVER_BANDS[BUDGET_CARRY_OVER_BANDS.length - 1].pct;
}

// "Percentage Multiplier for transfer budget based on league objective
// performance" — bonus applied to next season's starting transfer budget when
// the club's league finish clears its own objective by a wide margin. No INI
// table defines the "overachieved"/"significantly overachieved" thresholds
// themselves, only these two bonus percentages — [TUNED, logged]: overachieved
// = finished >=10 league-index points clear of the objective's own
// LEAGUE_OBJ_INDEX check3 threshold; significantly overachieved = >=25 points
// clear (engine/season.js's rolloverSeason computes the index and threshold it
// already has on hand from evaluateSeasonEnd's own inputs).
export const TRANSFER_LEAGUE_RESULT_BONUS_PCT = { overachieved: 5, significantlyOverachieved: 10 };
export const OVERACHIEVED_INDEX_MARGIN = 10;
export const SIGNIFICANTLY_OVERACHIEVED_INDEX_MARGIN = 25;

/* ----- Per-league transfer-budget floor -----
 * LEAGUE_BUDGET_MIN_<iniLeagueId> — data/leagues.json's own `iniLeagueId`
 * field (added at world-authoring time) keys straight into these verbatim, no
 * translation table needed. LEAGUE_BUDGET_MAX_* also exists in the INI, but
 * several already-authored clubs (e.g. Portsmouth, League Two, deliberately
 * carrying a parachute-payment-sized budget for their division) sit above it
 * — enforcing it as a live ceiling would silently nerf that characterful,
 * already-audited world data (data/clubs.json), so only the MIN is enforced
 * as a floor (engine/clubbudget.js); the MAX table is ported for reference
 * only. Logged in plan2-decisions.md F4. */
export const LEAGUE_BUDGET_MIN_BY_INI_ID = {
  13: 18000000, // England Premier League
  53: 3000000, // Spain Primera
  31: 2000000, // Italy Serie A
  19: 4000000, // Germany Bundesliga 1
  16: 3000000, // France Ligue 1
  10: 1000000, // Netherlands
  14: 2500000, // England Championship
  20: 800000, // Germany Bundesliga 2
  32: 700000, // Italy Serie B
  83: 1500000, // Korea
  308: 900000, // Portugal
  54: 700000, // Spain Segunda A
  56: 500000, // Sweden
  189: 2000000, // Switzerland
  39: 3250000, // MLS
  17: 700000, // France Ligue 2
  341: 1000000, // Mexico
  7: 500000, // Brazil
  335: 500000, // Chile
  336: 500000, // Colombia
  67: 2000000, // Russia
  80: 500000, // Austria
  4: 1000000, // Belgium
  1: 500000, // Denmark
  41: 500000, // Norway
  68: 1500000, // Turkey
  60: 600000, // England League One
  66: 500000, // Poland
  350: 1500000, // Saudi Arabia
  351: 2000000, // Australia
  353: 100000, // Argentina
  61: 500000, // England League Two
  50: 500000, // Scotland
  65: 500000, // Ireland
};
export const LEAGUE_BUDGET_MIN_DEFAULT = 100000;
export function leagueBudgetMin(league) {
  return LEAGUE_BUDGET_MIN_BY_INI_ID[league?.iniLeagueId] ?? LEAGUE_BUDGET_MIN_DEFAULT;
}
export const LEAGUE_BUDGET_MAX_BY_INI_ID = {
  13: 30000000, 14: 15000000, 60: 5000000, 61: 1500000,
};
export const LEAGUE_BUDGET_MAX_TOP = 35000000;
export const LEAGUE_BUDGET_MAX_SECOND = 7000000;

/* ============================================================================
 * transfer.ini MIN_PLAYERS_POSITION_* — Sell Players' Release guard.
 * Collapsed onto 8 groups covering all 28 position codes exactly once (the
 * INI names literal FIFA labels — GK/RB/CB/LB/RM/CM/LM/ST — not this
 * project's own area/overallGroup groupings, so a fresh, explicit code list
 * per group is used rather than reusing config/positions.js's coarser
 * `area`/`overallGroup`, neither of which lines up 1:1 with these 8 rows).
 * ========================================================================== */
export const RELEASE_GUARD_GROUPS = [
  { label: "GK", min: 2, codes: ["GK"] },
  { label: "RB", min: 2, codes: ["RWB", "RB"] },
  { label: "CB", min: 4, codes: ["SW", "RCB", "CB", "LCB"] },
  { label: "LB", min: 2, codes: ["LWB", "LB"] },
  { label: "RM", min: 2, codes: ["RM", "RW"] },
  { label: "CM", min: 4, codes: ["RDM", "CDM", "LDM", "RCM", "CM", "LCM", "RAM", "CAM", "LAM"] },
  { label: "LM", min: 2, codes: ["LM", "LW"] },
  { label: "ST", min: 3, codes: ["RF", "CF", "LF", "RS", "ST", "LS"] },
];
export function releaseGuardGroupFor(positionCode) {
  return RELEASE_GUARD_GROUPS.find((g) => g.codes.includes(positionCode));
}
// [PLAN-TEXT CORRECTION, logged in plan2-decisions.md F4] plan2.md F4.1's own
// build note guessed "squad ... / 16 total" — cmsettings.ini's [DEFAULTS] DOES
// have a real total-squad floor after all (MIN_SQUAD_SIZE=18), so the real
// INI value wins over the plan's own guess, per §A1/§A2. MAX_SQUAD_SIZE=52 is
// the same section's squad ceiling — used as the "PLAYERS IN SQUAD" header's
// "n/NN" denominator (ms_SELL_PLAYERS_SCREEN.png's own captured save shows
// "18/42", a number specific to that save, not chased — see plan2-decisions.md).
export const SQUAD_FLOOR_TOTAL = 18; // cmsettings.ini [DEFAULTS] MIN_SQUAD_SIZE
export const MAX_SQUAD_SIZE = 52; // cmsettings.ini [DEFAULTS] MAX_SQUAD_SIZE

// plan2.md F4.1's own literal spec ("releasing pays off 50% of remaining
// contract [TUNED]").
export const RELEASE_PAYOFF_PCT = 50;
