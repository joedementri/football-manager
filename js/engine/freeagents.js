// engine/freeagents.js — the pre-contract "approach" mechanic named in
// config/negotiation.js's header (transfer.ini's APPROACH_* constants,
// ported in M6 but unused until now). Fable-plans/plan1.md M7: "free agents
// included" in user buys.
//
// M6 already makes every out-of-contract player land instantly at a new CPU
// club (engine/contracts.js's signWithNewClub — never an idle "free agent
// pool" sitting around). Rather than reworking that, the user can approach
// any player (at any other club) whose contract expires *this season* —
// same "expires this season" definition engine/contracts.js's own
// buildBosmanApproachEmails already uses — pre-agree wage/years/role now, and
// if accepted the player is guaranteed to join for free the moment their
// contract actually lapses (engine/contracts.js's signWithNewClub honors
// `player.contract.preAgreedClubId` ahead of its own random pick).
//
// Not enforced (documented, not a silent gap): transfer.ini's
// APPROACH_MIN_DAYS_BETWEEN_CPU_APPROACH cooldown after a rejected approach —
// doing so would need a new persisted per-player field for a minor anti-spam
// nicety; a rejected approach can simply be retried immediately.

import { RngStream, deriveSeed } from "../core/rng.js";
import { isSameDate } from "../core/clock.js";
import { deadlineDays } from "../config/calendar.js";
import { positionInfo } from "../config/positions.js";
import { computeSigningAsk, decisionChance } from "./playerdecision.js";
import { scheduleResponse, resolvedSquadRole } from "./negotiation.js";
import { buildFreeAgentNewsArticle, pushTransferNews } from "./transfernews.js";
import { pushNegotiationLogEntry, currentContractSnapshot } from "./negotiationlog.js";

/** Players anywhere (never the user's own squad) whose contract expires next
 * July and who haven't already pre-agreed a move — the Free Agents overlay's
 * browse list. */
export function eligibleFreeAgentTargets(state, { positionGroup, maxAge } = {}) {
  return state.players.filter((p) => {
    if (p.clubId === state.club.id) return false;
    if (p.contract.endYear !== state.seasonStartYear + 1) return false;
    if (p.contract.preAgreedClubId != null) return false;
    if (positionGroup && positionInfo(p.position).overallGroup !== positionGroup) return false;
    if (maxAge && p.age > maxAge) return false;
    return true;
  });
}

/** Opens an approach (reuses state.transfers.negotiation — only one deal in
 * flight at a time, same scope decision as engine/negotiation.js's fee/
 * contract talks). Skips straight to a contract-offer phase — there's no fee,
 * that's the entire point of a free-transfer approach. */
export function startApproach(state, playerId) {
  const player = state.playersById.get(playerId);
  if (!player || player.clubId === state.club.id) return;
  if (player.contract.endYear !== state.seasonStartYear + 1) return;
  if (player.contract.preAgreedClubId != null) return;
  const sourceClub = state.clubsById.get(player.clubId);
  const ask = computeSigningAsk({ player, sourceClub, destClub: state.club, state });
  state.transfers.negotiation = {
    playerId, sourceClubId: player.clubId, dealType: "free-agent",
    phase: "contract", round: 1, feeOffer: 0,
    lastFeeResponse: null, counterFee: null,
    promisedRole: "none",
    contractOffer: { wage: ask.wage, years: 3, bonusPerGoal: 0, signingOnFee: 0 },
    lastContractResponse: null, loanLength: null, result: null,
    exchangePlayerId: null, exchangeCreditApplied: 0, exchangeRejectedNote: false,
    loanBonusPerGoal: 0, loanFutureFee: null,
    everSubmitted: false,
  };
}

function applyApproachResolution(state, playerId, contractOffer, promisedRole) {
  const n = state.transfers.negotiation;
  if (!n || n.playerId !== playerId || n.phase !== "approach-waiting") return;
  const player = state.playersById.get(playerId);
  const sourceClub = state.clubsById.get(n.sourceClubId);
  const chance = decisionChance({ player, sourceClub, destClub: state.club, offer: contractOffer, promisedRole, state });
  const rng = new RngStream(deriveSeed(state.seed, `approach-${state.seasonStartYear}-${playerId}-${contractOffer.wage}`));
  const accepted = rng.chance(chance);
  n.lastContractResponse = accepted ? "accepted" : "rejected";
  const currentSnapshot = currentContractSnapshot(state, player);
  const offeredSnapshot = { wage: contractOffer.wage, years: contractOffer.years, bonus: contractOffer.bonusPerGoal || 0 };
  if (accepted) {
    player.contract.preAgreedClubId = state.club.id;
    player.contract.preAgreedTerms = {
      wage: contractOffer.wage, years: contractOffer.years, squadRole: resolvedSquadRole(promisedRole),
      signingBonus: contractOffer.signingOnFee || 0,
    };
    pushTransferNews(state, buildFreeAgentNewsArticle({ player, toClub: state.club, today: state.calendar.today }));
    pushNegotiationLogEntry(state, {
      source: "sent", dealType: "free-agent", playerId, fromClubId: sourceClub.id, toClubId: state.club.id,
      outcome: "success", negStatus: "Completed", transferFee: 0, estimatedWorth: player.value,
      current: currentSnapshot, offered: offeredSnapshot, date: state.calendar.today,
    });
    n.phase = "completed";
    n.result = "completed";
  } else {
    n.phase = "rejected";
    pushNegotiationLogEntry(state, {
      source: "sent", dealType: "free-agent", playerId, fromClubId: sourceClub.id, toClubId: state.club.id,
      outcome: "fail", negStatus: "Rejected", transferFee: 0, estimatedWorth: player.value,
      current: currentSnapshot, offered: offeredSnapshot, date: state.calendar.today,
    });
  }
}

/** Resolves a queued `{type:"approach-response", playerId, contractOffer, promisedRole}` entry. */
export function resolveApproachEntry(state, entry) {
  applyApproachResolution(state, entry.playerId, entry.contractOffer, entry.promisedRole);
}

export function submitApproach(state) {
  const n = state.transfers.negotiation;
  if (!n || n.dealType !== "free-agent" || n.phase !== "contract") return { error: "no-negotiation" };
  const { playerId, promisedRole } = n;
  const contractOffer = { ...n.contractOffer };
  const isDeadline = deadlineDays(state.seasonStartYear).some((d) => isSameDate(d, state.calendar.today));
  n.phase = "approach-waiting";
  n.everSubmitted = true;
  if (isDeadline) applyApproachResolution(state, playerId, contractOffer, promisedRole);
  else scheduleResponse(state, state.calendar.today, "approach-response", { playerId, contractOffer, promisedRole });
  return { ok: true };
}
