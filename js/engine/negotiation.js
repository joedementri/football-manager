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
    promisedRole: "important",
    contractOffer: null, lastContractResponse: null,
    loanLength: "season",
    result: null,
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
  const tiers = ["prospect", "rotation", "important", "crucial"];
  const idx = Math.min(tiers.length - 1, Math.max(0, tiers.indexOf(n.promisedRole) + delta));
  n.promisedRole = tiers[idx];
}

function applyFeeResolution(state, playerId, feeOffer, round) {
  const n = state.transfers.negotiation;
  if (!n || n.playerId !== playerId || n.phase !== "fee-waiting") return;
  const player = state.playersById.get(playerId);
  const sellingClub = state.clubsById.get(n.sourceClubId);
  const wantedFee = computeWantedFee({ player, buyingClub: state.club, sellingClub, state });
  const chances = feeDecisionChances(feeOffer, wantedFee, round === 1);
  const rng = new RngStream(deriveSeed(state.seed, `fee-${state.seasonStartYear}-${playerId}-${round}-${feeOffer}`));
  const outcome = rollThreeWay(rng, chances);
  if (outcome === "accept") {
    n.phase = "contract";
    n.lastFeeResponse = "accepted";
    const ask = computeSigningAsk({ player, sourceClub: sellingClub, destClub: state.club, state });
    n.contractOffer = { wage: ask.wage, years: 3 };
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

/** Resolves a queued `{type:"fee-response", playerId, feeOffer, round}` entry. */
export function resolveFeeOfferEntry(state, entry) {
  applyFeeResolution(state, entry.playerId, entry.feeOffer, entry.round);
}

/** Submits the current fee offer — resolves same-day on deadline day,
 * otherwise queues a delayed response (see this file's header). */
export function submitFeeOffer(state) {
  const n = state.transfers.negotiation;
  if (!n || n.phase !== "fee") return { error: "no-negotiation" };
  if (n.feeOffer > state.finances.transferBudget) return { error: "over-budget" };
  const { playerId, feeOffer, round } = n;
  n.phase = "fee-waiting";
  if (isDeadlineDay(state, state.calendar.today)) {
    applyFeeResolution(state, playerId, feeOffer, round);
  } else {
    scheduleResponse(state, state.calendar.today, "fee-response", { playerId, feeOffer, round });
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
  const fee = n.feeOffer;

  state.finances.transferBudget -= fee;
  creditClubBudget(state, sellingClub.id, fee);
  recordTransferFeePaid(state, { fee, playerId: player.id }); // M11 My Career: "Record Transfer Fee"

  movePlayerToClub(state, player, state.club.id);
  player.contract = {
    wage: n.contractOffer.wage, endYear: state.seasonStartYear + n.contractOffer.years,
    signingBonus: 0, squadRole: n.promisedRole, warnedExpiry: false,
  };
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
  player.loan = { parentClubId, returnDate, fullWage };
  player.contract = { ...player.contract, wage: Math.round(fullWage * (1 - LOAN_WAGE_SHARE_PCT / 100)) };
  refreshUserRoster(state);

  pushTransferNews(state, buildLoanNewsArticle({ player, fromClub: parentClub, toClub: state.club, today }));
  n.phase = "completed";
  n.result = "completed";
}

/* ============================================================================
 * Loans — a single approval roll (club + player), no fee/contract talk phases
 * ========================================================================== */

export function startLoanNegotiation(state, playerId, loanLength) {
  const player = state.playersById.get(playerId);
  if (!player || player.clubId === state.club.id) return;
  state.transfers.negotiation = {
    playerId, sourceClubId: player.clubId, dealType: "loan",
    phase: "loan-waiting", round: 1, feeOffer: 0,
    lastFeeResponse: null, counterFee: null, promisedRole: player.contract.squadRole,
    contractOffer: null, lastContractResponse: null,
    loanLength: loanLength || "season",
    result: null,
  };
  const resolvedLoanLength = state.transfers.negotiation.loanLength;
  if (isDeadlineDay(state, state.calendar.today)) {
    applyLoanResolution(state, playerId, resolvedLoanLength);
  } else {
    scheduleResponse(state, state.calendar.today, "loan-response", { playerId, loanLength: resolvedLoanLength });
  }
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
