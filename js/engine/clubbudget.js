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
//
// F4 (fable-plans/plan2.md, config/budget.js): the lazy seed is floored at
// the club's own league's LEAGUE_BUDGET_MIN — a floor only (see
// config/budget.js's own header for why the MAX table isn't enforced here).

import { leagueBudgetMin } from "../config/budget.js";

function clubLeague(state, clubId) {
  const club = state.clubsById.get(clubId);
  if (!club) return null;
  const leagueId = state.clubLeague ? state.clubLeague.get(clubId) ?? club.leagueId : club.leagueId;
  return state.staticData?.leagues.find((l) => l.id === leagueId) || null;
}

export function getClubBudget(state, clubId) {
  if (!state.clubTransferBudgets) state.clubTransferBudgets = new Map();
  if (!state.clubTransferBudgets.has(clubId)) {
    const club = state.clubsById.get(clubId);
    const base = club ? club.baseTransferBudget : 0;
    const floor = leagueBudgetMin(clubLeague(state, clubId));
    state.clubTransferBudgets.set(clubId, Math.max(base, floor));
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
