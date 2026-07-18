// engine/negotiation.js — the user's own outgoing deals: fee talks -> contract
// talks for a full transfer, and the simpler approval-only flow for a loan
// (fable-plans/plan1.md M7: "User buys: Search/GTN -> approach club -> fee
// negotiation (offer, club counters up to 3 rounds; acceptance threshold
// scales with need...) -> contract talks ... Loans (with wage share)").
//
// Only one negotiation is ever in flight (`state.transfers.negotiation`) —
// simplest possible UI, matching engine/jobs.js's own "apply == instant
// accept" precedent for keeping a first pass narrow. Responses are delayed
// (config/negotiation.js's pickResponseDayOffset — "offers should not be
// instant... usually 3 days... except deadline day, then instant") via
// `state.transfers.pendingOffers`, resolved by core/store.js's daily hook
// calling this file's resolve*Entry functions; deadline day resolves
// synchronously instead of queuing (see submitFeeOffer/submitNegotiationContractOffer).

import { RngStream, deriveSeed } from "../core/rng.js";
import { addDays, isSameDate, toEpochDay } from "../core/clock.js";
import { pickResponseDayOffset, MIN_DAYS_TO_RESPOND } from "../config/negotiation.js";
import { deadlineDays } from "../config/calendar.js";
import { MAX_COUNTER_OFFERS } from "../config/transferai.js";
import { SEASON_LOAN_LENGTH_MONTHS, SHORT_LOAN_LENGTH_MONTHS, LOAN_WAGE_SHARE_PCT, LOAN_APPROVAL_CHANCE_BY_ROLE } from "../config/loan.js";
import { computeWantedFee, feeDecisionChances, rollThreeWay, computeCounterFee } from "./teamdecision.js";
import { computeSigningAsk, decisionChance } from "./playerdecision.js";
import { recomputeValue } from "./value.js";
import { movePlayerToClub } from "./contracts.js";
import { getClubBudget, spendClubBudget, creditClubBudget } from "./clubbudget.js";
import { buildBuyNewsArticle, buildLoanNewsArticle, pushTransferNews } from "./transfernews.js";
import { recordTransferFeePaid } from "./career.js";
import { positionInfo } from "../config/positions.js";
import { SQUAD_ROLE_CYCLE } from "../config/contract.js";

// F3 (fable-plans/plan2.md): "And/Or Player: Select Player" player-exchange
// row on the Approach — Transfer Offer dossier — his adjusted value x0.9
// counts toward the fee (plan2.md F3.4's own wording). No INI table for an
// exchange-player mechanic; 0.9 is the plan's own literal spec, not a guess.
export const EXCHANGE_PLAYER_VALUE_PCT = 0.9;
// Same "position group has room" threshold playerdecision.js's own
// decisionChance already uses for POSITIONAVAILABLEFORMAINROLE (a squad with
// fewer than 4 players sharing a position group has room for one more) —
// reused here rather than inventing a second needs-check shape, since
// plan2.md F3.4 just says "reuse transferai needs check" without naming a
// specific function to call.
const EXCHANGE_NEED_GROUP_SIZE = 4;
function sellingClubNeedsExchangePlayer(state, sellingClub, exchangePlayer) {
  const roster = state.playersByClub.get(sellingClub.id) || [];
  const group = positionInfo(exchangePlayer.position).overallGroup;
  const sameGroupCount = roster.filter((p) => positionInfo(p.position).overallGroup === group).length;
  return sameGroupCount < EXCHANGE_NEED_GROUP_SIZE;
}

let nextOfferId = 1;

/** True if `today` is either transfer window's closing date (config/
 * calendar.js's deadlineDays) — same-day resolution, no queueing. */
function isDeadlineDay(state, today) {
  return deadlineDays(state.seasonStartYear).some((d) => isSameDate(d, today));
}

/** Pushes a delayed-response entry onto state.transfers.pendingOffers —
 * exported for engine/freeagents.js's approach flow to reuse. */
export function scheduleResponse(state, today, type, payload) {
  const rng = new RngStream(deriveSeed(state.seed, `nego-${toEpochDay(today)}-${nextOfferId}`));
  const dueDate = addDays(today, MIN_DAYS_TO_RESPOND + pickResponseDayOffset(rng));
  const entry = { id: nextOfferId++, type, dueDate, ...payload };
  state.transfers.pendingOffers.push(entry);
  return entry;
}

function refreshUserRoster(state) {
  state.squad.roster = (state.playersByClub.get(state.club.id) || []).slice().sort((a, b) => b.overall - a.overall);
}

/* ============================================================================
 * Fee talks
 * ========================================================================== */

/** Opens a fresh fee negotiation for `playerId` (must belong to another
 * club). Seeds the first offer a little under the computed wanted fee — the
 * exact wanted fee is never shown to the user (the club will still haggle
 * even at 100% of it), only the response. */
export function startFeeNegotiation(state, playerId) {
  const player = state.playersById.get(playerId);
  if (!player || player.clubId === state.club.id) return;
  const sellingClub = state.clubsById.get(player.clubId);
  const wantedFee = computeWantedFee({ player, buyingClub: state.club, sellingClub, state });
  state.transfers.negotiation = {
    playerId, sourceClubId: player.clubId, dealType: "transfer",
    phase: "fee", round: 1,
    feeOffer: Math.round(wantedFee * 0.85),
    lastFeeResponse: null, counterFee: null,
    promisedRole: "none",
    contractOffer: null, lastContractResponse: null,
    loanLength: "season",
    result: null,
    // F3: player-exchange (Approach Offer dossier's "And/Or Player" row) —
    // exchangePlayerId is the user's own squad player offered alongside cash;
    // exchangeCreditApplied is locked in on the *first* fee submission (see
    // submitFeeOffer below) so later counter-rounds don't silently re-roll
    // whether the selling club still "needs" the same exchange player.
    exchangePlayerId: null, exchangeCreditApplied: 0, exchangeRejectedNote: false,
    // F3: loan-only cosmetic terms (Approach — Loan Offer dossier).
    loanBonusPerGoal: 0, loanFutureFee: null,
  };
}

export function adjustFeeOffer(state, deltaPct) {
  const n = state.transfers.negotiation;
  if (!n || n.phase !== "fee") return;
  const player = state.playersById.get(n.playerId);
  const step = Math.max(10000, Math.round(player.value * deltaPct));
  n.feeOffer = Math.max(0, n.feeOffer + step);
}

export function cycleNegotiationRole(state, delta) {
  const n = state.transfers.negotiation;
  if (!n) return;
  const idx = Math.min(SQUAD_ROLE_CYCLE.length - 1, Math.max(0, SQUAD_ROLE_CYCLE.indexOf(n.promisedRole) + delta));
  n.promisedRole = SQUAD_ROLE_CYCLE[idx];
}

/** F3: player-exchange picker (Approach Offer's "And/Or Player" row). */
export function setExchangePlayer(state, playerId) {
  const n = state.transfers.negotiation;
  if (!n || n.phase !== "fee") return;
  n.exchangePlayerId = playerId;
  n.exchangeRejectedNote = false;
}
export function clearExchangePlayer(state) {
  const n = state.transfers.negotiation;
  if (!n) return;
  n.exchangePlayerId = null;
  n.exchangeRejectedNote = false;
}

/** F3: loan-only cosmetic terms (Approach — Loan Offer dossier). */
export function adjustLoanBonusPerGoal(state, deltaPct) {
  const n = state.transfers.negotiation;
  if (!n) return;
  n.loanBonusPerGoal = Math.max(0, Math.min(50, n.loanBonusPerGoal + deltaPct));
}
export function cycleLoanLength(state) {
  const n = state.transfers.negotiation;
  if (!n) return;
  n.loanLength = n.loanLength === "season" ? "short" : "season";
}
export function adjustLoanFutureFee(state, deltaAbs) {
  const n = state.transfers.negotiation;
  if (!n) return;
  const next = (n.loanFutureFee || 0) + deltaAbs;
  n.loanFutureFee = next <= 0 ? null : next; // back to "Not Set" once stepped down to 0
}
export function clearLoanFutureFee(state) {
  const n = state.transfers.negotiation;
  if (!n) return;
  n.loanFutureFee = null;
}

function applyFeeResolution(state, playerId, feeOffer, round, exchangeCredit = 0) {
  const n = state.transfers.negotiation;
  if (!n || n.playerId !== playerId || n.phase !== "fee-waiting") return;
  const player = state.playersById.get(playerId);
  const sellingClub = state.clubsById.get(n.sourceClubId);
  const wantedFee = computeWantedFee({ player, buyingClub: state.club, sellingClub, state });
  // F3: the selling club's accept/counter/reject roll judges the *effective*
  // offer (cash + any accepted exchange-player credit), while n.feeOffer
  // itself stays the pure cash figure the "Offered Transfer Sum" row shows
  // and completeTransfer() actually deducts from the budget.
  const chances = feeDecisionChances(feeOffer + exchangeCredit, wantedFee, round === 1);
  const rng = new RngStream(deriveSeed(state.seed, `fee-${state.seasonStartYear}-${playerId}-${round}-${feeOffer}`));
  const outcome = rollThreeWay(rng, chances);
  if (outcome === "accept") {
    n.phase = "contract";
    n.lastFeeResponse = "accepted";
    const ask = computeSigningAsk({ player, sourceClub: sellingClub, destClub: state.club, state });
    n.contractOffer = { wage: ask.wage, years: 3, bonusPerGoal: 0, signingOnFee: 0 };
  } else if (outcome === "counter" && n.round < MAX_COUNTER_OFFERS) {
    n.lastFeeResponse = "countered";
    n.counterFee = computeCounterFee({ wantedFee, buyingClub: state.club, sellingClub, rng });
    n.round += 1;
    n.phase = "fee";
    n.feeOffer = n.counterFee;
  } else {
    n.phase = "rejected";
    n.lastFeeResponse = "rejected";
  }
}

/** Resolves a queued `{type:"fee-response", playerId, feeOffer, round, exchangeCredit}` entry. */
export function resolveFeeOfferEntry(state, entry) {
  applyFeeResolution(state, entry.playerId, entry.feeOffer, entry.round, entry.exchangeCredit || 0);
}

/** Submits the current fee offer — resolves same-day on deadline day,
 * otherwise queues a delayed response (see this file's header). Locks in
 * the exchange-player credit (if any) on the *first* round only — see
 * negotiation object's own header comment above. */
export function submitFeeOffer(state) {
  const n = state.transfers.negotiation;
  if (!n || n.phase !== "fee") return { error: "no-negotiation" };
  if (n.feeOffer > state.finances.transferBudget) return { error: "over-budget" };

  if (n.round === 1 && n.exchangePlayerId != null) {
    const exchangePlayer = state.playersById.get(n.exchangePlayerId);
    const sellingClub = state.clubsById.get(n.sourceClubId);
    if (exchangePlayer && sellingClubNeedsExchangePlayer(state, sellingClub, exchangePlayer)) {
      n.exchangeCreditApplied = Math.round(exchangePlayer.value * EXCHANGE_PLAYER_VALUE_PCT);
    } else {
      n.exchangeCreditApplied = 0;
      n.exchangeRejectedNote = true;
      n.exchangePlayerId = null;
    }
  }

  const { playerId, feeOffer, round, exchangeCreditApplied } = n;
  n.phase = "fee-waiting";
  if (isDeadlineDay(state, state.calendar.today)) {
    applyFeeResolution(state, playerId, feeOffer, round, exchangeCreditApplied);
  } else {
    scheduleResponse(state, state.calendar.today, "fee-response", { playerId, feeOffer, round, exchangeCredit: exchangeCreditApplied });
  }
  return { ok: true };
}

/* ============================================================================
 * Contract talks (fee already agreed)
 * ========================================================================== */

export function adjustNegotiationContractWage(state, deltaPct) {
  const n = state.transfers.negotiation;
  if (!n || n.phase !== "contract" || !n.contractOffer) return;
  const player = state.playersById.get(n.playerId);
  const sellingClub = state.clubsById.get(n.sourceClubId);
  const ask = computeSigningAsk({ player, sourceClub: sellingClub, destClub: state.club, state });
  n.contractOffer.wage = Math.max(player.contract.wage, Math.round((n.contractOffer.wage + ask.wage * deltaPct) / 10) * 10);
}

export function adjustNegotiationContractYears(state, delta) {
  const n = state.transfers.negotiation;
  if (!n || !n.contractOffer) return;
  n.contractOffer.years = Math.min(5, Math.max(1, n.contractOffer.years + delta));
}

// F3: "Bonus Per Goal"/"Signing On Fee" rows (ms_CONTRACTS_SCREEN_CONTRACT_
// NEGOTIATION.png) — cosmetic contract terms, same footing as engine/
// contracts.js's own header note ("signing bonuses aren't modelled as a
// separate negotiable term" — still true here: neither field feeds
// acceptanceChance/decisionChance, F6's own audit pass owns wiring
// BONUS_ACCEPTANCE_BASE_VALUE for real per plan2.md F6.2). Signing On Fee is
// paid from the transfer budget at completion (see completeTransfer below);
// Bonus Per Goal is stored on the contract but has no payout loop yet
// (matches F6.3 MORALE's own note that the *payout* mechanic is F6 territory).
export function adjustNegotiationContractBonus(state, deltaPct) {
  const n = state.transfers.negotiation;
  if (!n || !n.contractOffer) return;
  n.contractOffer.bonusPerGoal = Math.max(0, Math.min(50, (n.contractOffer.bonusPerGoal || 0) + deltaPct));
}
export function adjustNegotiationSigningFee(state, deltaAbs) {
  const n = state.transfers.negotiation;
  if (!n || !n.contractOffer) return;
  n.contractOffer.signingOnFee = Math.max(0, (n.contractOffer.signingOnFee || 0) + deltaAbs);
}

/** "Do Not Specify" (promisedRole "none") isn't a real persisted squadRole
 * tier (gen/squad.js's own quartile-based roles never produce it) — resolved
 * to the same neutral tier this engine defaulted every negotiation to before
 * F3 introduced the explicit "none" choice. Exported so engine/freeagents.js's
 * approach flow (a separate module, same promisedRole vocabulary) applies the
 * identical fallback rather than persisting "none" itself. */
export function resolvedSquadRole(promisedRole) {
  return promisedRole && promisedRole !== "none" ? promisedRole : "important";
}

function applyContractResolution(state, playerId, contractOffer, promisedRole) {
  const n = state.transfers.negotiation;
  if (!n || n.playerId !== playerId || n.phase !== "contract-waiting") return;
  const player = state.playersById.get(playerId);
  const sellingClub = state.clubsById.get(n.sourceClubId);
  const chance = decisionChance({ player, sourceClub: sellingClub, destClub: state.club, offer: contractOffer, promisedRole, state });
  const rng = new RngStream(deriveSeed(state.seed, `nc-${state.seasonStartYear}-${playerId}-${contractOffer.wage}-${contractOffer.years}`));
  const accepted = rng.chance(chance);
  n.lastContractResponse = accepted ? "accepted" : "rejected";
  if (accepted) completeTransfer(state);
  else n.phase = "rejected";
}

export function resolveContractOfferEntry(state, entry) {
  applyContractResolution(state, entry.playerId, entry.contractOffer, entry.promisedRole);
}

export function submitNegotiationContractOffer(state) {
  const n = state.transfers.negotiation;
  if (!n || n.phase !== "contract") return { error: "no-negotiation" };
  const { playerId, promisedRole } = n;
  const contractOffer = { ...n.contractOffer };
  n.phase = "contract-waiting";
  if (isDeadlineDay(state, state.calendar.today)) {
    applyContractResolution(state, playerId, contractOffer, promisedRole);
  } else {
    scheduleResponse(state, state.calendar.today, "contract-response", { playerId, contractOffer, promisedRole });
  }
  return { ok: true };
}

/* ============================================================================
 * Completion
 * ========================================================================== */

function completeTransfer(state) {
  const n = state.transfers.negotiation;
  const player = state.playersById.get(n.playerId);
  const sellingClub = state.clubsById.get(n.sourceClubId);
  // n.feeOffer is always the pure-cash figure (see submitFeeOffer's own
  // comment) — the exchange player's credited value is a separate transfer,
  // not cash, so it's never part of the budget debit/credit below.
  const fee = n.feeOffer;

  state.finances.transferBudget -= fee;
  creditClubBudget(state, sellingClub.id, fee);
  recordTransferFeePaid(state, { fee, playerId: player.id }); // M11 My Career: "Record Transfer Fee"

  if (n.exchangeCreditApplied > 0 && n.exchangePlayerId != null) {
    const exchangePlayer = state.playersById.get(n.exchangePlayerId);
    if (exchangePlayer) {
      movePlayerToClub(state, exchangePlayer, sellingClub.id);
      recomputeValue(exchangePlayer, sellingClub, state.seasonStartYear);
    }
  }

  movePlayerToClub(state, player, state.club.id);
  player.contract = {
    wage: n.contractOffer.wage, endYear: state.seasonStartYear + n.contractOffer.years,
    signingBonus: n.contractOffer.signingOnFee || 0, squadRole: resolvedSquadRole(n.promisedRole), warnedExpiry: false,
  };
  if (n.contractOffer.signingOnFee) state.finances.transferBudget -= n.contractOffer.signingOnFee;
  recomputeValue(player, state.club, state.seasonStartYear);
  refreshUserRoster(state);

  pushTransferNews(state, buildBuyNewsArticle({ player, fromClub: sellingClub, toClub: state.club, fee, today: state.calendar.today }));
  n.phase = "completed";
  n.result = "completed";
}

function completeLoan(state) {
  const n = state.transfers.negotiation;
  const player = state.playersById.get(n.playerId);
  const parentClubId = player.clubId;
  const parentClub = state.clubsById.get(parentClubId);

  movePlayerToClub(state, player, state.club.id);
  const months = n.loanLength === "short" ? SHORT_LOAN_LENGTH_MONTHS : SEASON_LOAN_LENGTH_MONTHS;
  const today = state.calendar.today;
  const returnDate = new Date(today.getFullYear(), today.getMonth() + months, today.getDate());
  const fullWage = player.contract.wage;
  // F3: bonusPerGoal/futureFee are cosmetic loan terms (Approach — Loan
  // Offer dossier) with no payout/option-to-buy loop wired yet, same
  // documented-not-modelled footing as completeTransfer's own signingOnFee
  // comment — stored on the loan record so the Team Sheet/Negotiations
  // ledger (F4) can display them, not silently dropped.
  player.loan = { parentClubId, returnDate, fullWage, bonusPerGoal: n.loanBonusPerGoal || 0, futureFee: n.loanFutureFee };
  player.contract = { ...player.contract, wage: Math.round(fullWage * (1 - LOAN_WAGE_SHARE_PCT / 100)) };
  refreshUserRoster(state);

  pushTransferNews(state, buildLoanNewsArticle({ player, fromClub: parentClub, toClub: state.club, today }));
  n.phase = "completed";
  n.result = "completed";
}

/* ============================================================================
 * Loans — F3 gave the Approach — Loan Offer dossier real editable terms
 * (Bonus Per Goal, Loan Length, Future Fee) ahead of a single approval roll,
 * so — unlike plan1 M7's original "one-shot, resolves immediately" loan
 * request — there's now a real editable `phase: "loan"` before submission,
 * mirroring startFeeNegotiation/submitFeeOffer's own two-step shape.
 * ========================================================================== */

export function startLoanNegotiation(state, playerId, loanLength) {
  const player = state.playersById.get(playerId);
  if (!player || player.clubId === state.club.id) return;
  state.transfers.negotiation = {
    playerId, sourceClubId: player.clubId, dealType: "loan",
    phase: "loan", round: 1, feeOffer: 0,
    lastFeeResponse: null, counterFee: null, promisedRole: player.contract.squadRole,
    contractOffer: null, lastContractResponse: null,
    loanLength: loanLength || "season",
    result: null,
    exchangePlayerId: null, exchangeCreditApplied: 0, exchangeRejectedNote: false,
    loanBonusPerGoal: 0, loanFutureFee: null,
  };
}

/** Submits the Loan Offer dossier's current terms — resolves same-day on
 * deadline day, otherwise queues a delayed response, same shape as
 * submitFeeOffer above. */
export function submitLoanOffer(state) {
  const n = state.transfers.negotiation;
  if (!n || n.dealType !== "loan" || n.phase !== "loan") return { error: "no-negotiation" };
  const { playerId, loanLength } = n;
  n.phase = "loan-waiting";
  if (isDeadlineDay(state, state.calendar.today)) {
    applyLoanResolution(state, playerId, loanLength);
  } else {
    scheduleResponse(state, state.calendar.today, "loan-response", { playerId, loanLength });
  }
  return { ok: true };
}

function applyLoanResolution(state, playerId, loanLength) {
  const n = state.transfers.negotiation;
  if (!n || n.playerId !== playerId || n.phase !== "loan-waiting") return;
  const player = state.playersById.get(playerId);
  const sellingClub = state.clubsById.get(n.sourceClubId);
  const rng = new RngStream(deriveSeed(state.seed, `loan-${state.seasonStartYear}-${playerId}-${loanLength}`));
  const approvalChance = LOAN_APPROVAL_CHANCE_BY_ROLE[player.contract.squadRole] ?? 0.5;
  if (!rng.chance(approvalChance)) {
    n.phase = "rejected";
    return;
  }
  const chance = decisionChance({
    player, sourceClub: sellingClub, destClub: state.club,
    offer: { wage: player.contract.wage }, promisedRole: player.contract.squadRole, state,
  });
  if (!rng.chance(chance)) {
    n.phase = "rejected";
    return;
  }
  n.loanLength = loanLength;
  completeLoan(state);
}

export function resolveLoanRequestEntry(state, entry) {
  applyLoanResolution(state, entry.playerId, entry.loanLength);
}

export function cancelNegotiation(state) {
  state.transfers.negotiation = null;
}

/* ============================================================================
 * Loan returns — daily hook, independent of the pendingOffers queue (driven
 * by player.loan.returnDate, not a scheduled response)
 * ========================================================================== */

export function resolveLoanReturns(state, today) {
  let userRosterChanged = false;
  for (const player of state.players) {
    if (!player.loan) continue;
    if (toEpochDay(player.loan.returnDate) > toEpochDay(today)) continue;
    const { parentClubId, fullWage } = player.loan;
    if (player.clubId === state.club.id || parentClubId === state.club.id) userRosterChanged = true;
    movePlayerToClub(state, player, parentClubId);
    player.contract = { ...player.contract, wage: fullWage };
    player.loan = null;
  }
  if (userRosterChanged) refreshUserRoster(state);
}
