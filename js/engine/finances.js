// engine/finances.js — Office > Request Funds (fable-plans/plan1.md M7:
// "Request Funds tile moves money wage<->transfer or begs the board (chance
// = board trust)"). No INI models "board trust" anywhere in the reference
// files (playercontract.ini/transfer*.ini are all player-facing, not board-
// facing) — BOARD_TRUST_BASE_CHANCE is authored, scaled by manager.rep
// (1-20, already in the schema since M5), same footing as engine/jobs.js's
// CPU_SACK_CHANCE.
//
// F4 (fable-plans/plan2.md) additions: the Finances/Budget Allocation
// screen's live slider (reallocates the *remaining* transfer budget against
// the *surplus* weekly wage budget, not the season's full halves — see
// plan2-decisions.md F4) and the season-long trackers (seasonStartTransfer
// Budget/seasonPurchases/seasonStartWageBill/seasonSalesIncome) the Budget
// Allocation screen's "Starting.../Players Purchased/Change This Season"
// lines read.

import { RngStream, deriveSeed } from "../core/rng.js";
import { BUDGET_SPLIT_RATE } from "../config/budget.js";
import { squadWageBill } from "./wage.js";

const BOARD_TRUST_BASE_CHANCE = 0.5;
const BOARD_TRUST_REP_SCALE = 0.03; // each point of manager rep above/below 10 shifts the chance 3%

/** Moves money between the two halves of the same season budget — always
 * succeeds (it's the manager's own money, just reallocated), never goes
 * negative. */
export function reallocateBudget(state, amount, direction) {
  const amt = Math.max(0, Math.min(amount, direction === "wageToTransfer" ? state.finances.wageCeiling : state.finances.transferBudget));
  if (direction === "wageToTransfer") {
    state.finances.wageCeiling -= amt;
    state.finances.transferBudget += amt;
  } else {
    state.finances.transferBudget -= amt;
    state.finances.wageCeiling += amt;
  }
  return amt;
}

/** Begs the board for extra transfer funds — a real probabilistic roll
 * (deterministic per day/amount, per ground rule #3), not a guaranteed top-up. */
export function requestFundsFromBoard(state, amount) {
  const chance = Math.min(0.9, Math.max(0.05, BOARD_TRUST_BASE_CHANCE + (state.manager.rep - 10) * BOARD_TRUST_REP_SCALE));
  const rng = new RngStream(deriveSeed(state.seed, `funds-${state.calendar.today.getTime()}-${amount}`));
  const granted = rng.chance(chance);
  if (granted) state.finances.transferBudget += amount;
  return { granted, chance };
}

/* ============================================================================
 * F4: Budget Allocation Slider (ms_FINANCES_BUDGET_ALLOCATION.png) — moves
 * money between "Remaining Transfer Budget" (state.finances.transferBudget)
 * and "Surplus Weekly Budget" (wageCeiling minus the roster's current wage
 * bill), at the fixed BUDGET_SPLIT_RATE conversion (config/budget.js's own
 * header derives it from cmsettings.ini's TRANSFER_WAGE_SPLIT_PERCENT=80).
 * ========================================================================== */

/** One "1% step"'s {transferDelta, wageDelta} pair, sized off the pool as it
 * stands *right now* (computed once when the slider is opened, not re-derived
 * per step) — the UI applies the exact same pair on every step and its exact
 * negation to step back, so round-tripping N steps one way then N the other
 * is always identical (no rounding drift), which is what dev/tests.js's own
 * "move 5 right then 5 left" assertion checks. */
export function budgetSplitStepAmounts(state) {
  const wageSurplus = state.finances.wageCeiling - squadWageBill(state.squad.roster);
  const total = state.finances.transferBudget + wageSurplus * BUDGET_SPLIT_RATE;
  const transferDelta = Math.max(1, Math.round(total / 100));
  const wageDelta = Math.max(1, Math.round(transferDelta / BUDGET_SPLIT_RATE));
  return { transferDelta, wageDelta };
}

/** "Current Budget Split: NN:NN" readout — transfer vs wage-converted-to-
 * transfer-equivalent, as a percentage pair (informational only; not used for
 * the step math itself, see budgetSplitStepAmounts's own header). */
export function budgetSplitPct(transferBudget, wageCeiling, roster) {
  const wageSurplus = wageCeiling - squadWageBill(roster);
  const total = transferBudget + wageSurplus * BUDGET_SPLIT_RATE;
  if (total <= 0) return [50, 50];
  const transferPct = Math.round((100 * transferBudget) / total);
  return [transferPct, 100 - transferPct];
}

/** Applies one step (direction +1 = move toward transfer, -1 = move toward
 * wage) to a {transferBudget, wageCeiling} draft object in place, clamped so
 * neither side can be pushed below zero (wageCeiling can't drop below the
 * roster's own committed wage bill — you can't reallocate wages you're
 * already contractually paying). */
export function applyBudgetSplitStep(draft, direction, stepAmounts, minWageCeiling) {
  const nextTransfer = draft.transferBudget + direction * stepAmounts.transferDelta;
  const nextWageCeiling = draft.wageCeiling - direction * stepAmounts.wageDelta;
  if (nextTransfer < 0 || nextWageCeiling < minWageCeiling) return false;
  draft.transferBudget = nextTransfer;
  draft.wageCeiling = nextWageCeiling;
  return true;
}

/** F4-fixes (owner report: "the bar ... should be a slider the user can grab
 * and move 0:100"): sets the split directly to an arbitrary percentage,
 * unlike applyBudgetSplitStep's fixed-amount steps — a click/drag position
 * has no "round-trip must be bit-exact" requirement the way repeated
 * stepping does, so recomputing straight from the pool total each call is
 * fine (and simpler than trying to reuse a fixed step size for an arbitrary
 * jump). Clamped the same way applyBudgetSplitStep is: wageCeiling never
 * drops below the roster's own committed wage bill. */
export function budgetSplitFromPct(draft, roster, pct, minWageCeiling) {
  const wageBill = squadWageBill(roster);
  const wageSurplus = draft.wageCeiling - wageBill;
  const total = draft.transferBudget + wageSurplus * BUDGET_SPLIT_RATE;
  const clampedPct = Math.max(0, Math.min(100, pct));
  const nextTransfer = Math.max(0, Math.round((total * clampedPct) / 100));
  const nextWageSurplus = (total - nextTransfer) / BUDGET_SPLIT_RATE;
  const nextWageCeiling = Math.max(minWageCeiling, wageBill + nextWageSurplus);
  draft.transferBudget = nextTransfer;
  draft.wageCeiling = nextWageCeiling;
}

/* ============================================================================
 * F4: season-long trackers behind the Budget Allocation screen's "Starting
 * Transfer Budget / Players Purchased / Starting Weekly Wages / Change This
 * Season" lines — snapshotted at createCareerState/rolloverSeason, mutated as
 * the season's own transfer activity happens.
 * ========================================================================== */

/** Called once at createCareerState, at every July 1 rollover, and when the
 * user accepts a new job — reads state.playersByClub directly (not
 * state.squad.roster, which a couple of call sites haven't refreshed for the
 * new club yet at the point this needs to run) so the wage-bill snapshot is
 * always for the *current* state.club, regardless of call-site ordering. */
export function snapshotSeasonFinances(state) {
  const roster = state.playersByClub.get(state.club.id) || [];
  state.finances.seasonStartTransferBudget = state.finances.transferBudget;
  state.finances.seasonPurchases = 0;
  state.finances.seasonStartWageBill = squadWageBill(roster);
  state.finances.seasonSalesIncome = 0;
}

/** engine/negotiation.js's completeTransfer calls this with the cash fee +
 * any signing-on fee paid — both are transfer-budget spend "on acquiring a
 * player," which is what the Budget Allocation screen's green "Players
 * Purchased" line means (not release payoffs, which offload a player rather
 * than acquire one). */
export function recordSeasonPurchase(state, amount) {
  state.finances.seasonPurchases = (state.finances.seasonPurchases || 0) + amount;
}

/** engine/transferai.js's acceptIncomingBid calls this with the fee received
 * for one of the user's own players — accumulates the pool
 * BOARD_FINANCIAL_STRICTNESS's sales-return % carries into next season's
 * starting transfer budget (engine/season.js's rolloverSeason). */
export function recordSeasonSalesIncome(state, amount) {
  state.finances.seasonSalesIncome = (state.finances.seasonSalesIncome || 0) + amount;
}
