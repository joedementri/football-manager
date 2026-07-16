// engine/finances.js — Office > Request Funds (fable-plans/plan1.md M7:
// "Request Funds tile moves money wage<->transfer or begs the board (chance
// = board trust)"). No INI models "board trust" anywhere in the reference
// files (playercontract.ini/transfer*.ini are all player-facing, not board-
// facing) — BOARD_TRUST_BASE_CHANCE is authored, scaled by manager.rep
// (1-20, already in the schema since M5), same footing as engine/jobs.js's
// CPU_SACK_CHANCE.

import { RngStream, deriveSeed } from "../core/rng.js";

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
