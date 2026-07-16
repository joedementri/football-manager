// engine/clubbudget.js — CPU clubs' own transfer budgets (fable-plans/
// plan1.md M7's own ✔ check: "budgets enforce" — the user's side already has
// `state.finances.transferBudget` since M6; this is the CPU-club equivalent,
// needed so CPU↔CPU deals (engine/transferai.js) and a CPU club receiving a
// fee from the user (engine/negotiation.js) both spend/gain real money
// instead of an unlimited pot).
//
// Lazily initialized per club (from data/clubs.json's own baseTransferBudget,
// the same field state.finances already seeds from at career/rollover start)
// rather than eagerly computed for all ~600 clubs every rollover — most
// clubs never transact in a given window, so there's no reason to pre-size a
// full-world ledger up front.

export function getClubBudget(state, clubId) {
  if (!state.clubTransferBudgets) state.clubTransferBudgets = new Map();
  if (!state.clubTransferBudgets.has(clubId)) {
    const club = state.clubsById.get(clubId);
    state.clubTransferBudgets.set(clubId, club ? club.baseTransferBudget : 0);
  }
  return state.clubTransferBudgets.get(clubId);
}

export function spendClubBudget(state, clubId, amount) {
  const bal = getClubBudget(state, clubId);
  state.clubTransferBudgets.set(clubId, bal - amount);
}

export function creditClubBudget(state, clubId, amount) {
  const bal = getClubBudget(state, clubId);
  state.clubTransferBudgets.set(clubId, bal + amount);
}

/** Called from engine/season.js's July 1 rollover ("budgets reset", same
 * bullet the user's own state.finances reset already lives on) — clearing
 * the map means the next getClubBudget() call for any club lazily
 * re-seeds from baseTransferBudget, same "reset to the club's own baseline"
 * behavior as the user's own finances reset. */
export function resetAllClubBudgets(state) {
  state.clubTransferBudgets = new Map();
}
