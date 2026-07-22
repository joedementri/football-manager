// engine/negotiationlog.js — F4 (fable-plans/plan2.md): TRANSFER NEGOTIATIONS
// screen's backing store (ms_TRANSFER_NEGOTIATIONS_*.png). This engine only
// ever has one live outgoing deal (state.transfers.negotiation) and incoming
// CPU bids already live as state.inbox.emails' transfer-bid actions — so
// "Transfer Offers Sent"/"Transfer Offers Received" are both derived live
// (0-or-1 / 0-or-more rows) from those, never persisted separately.
// state.transfers.negotiations is only a log of *terminal* snapshots
// (Completed/Rejected/Withdrawn) — written exactly once per deal, at the
// moment it resolves — which is what backs "Successful Negotiations" /
// "Unsuccessful Negotiations".

let nextLogId = 1;

// F4 (plan2.md F9's own "save < 10 MB after multi-season careers" budget):
// this log also gains one entry per CPU<->CPU completion (Transfer History's
// "ALL CLUBS" tab — the only structured, playerId/fromClub/toClub/fee-shaped
// record of a completed deal anywhere in this codebase; state.news.transfer's
// own articles are prose-only, no reliable columns to parse back out of
// them). ~40 CPU deals/window x 2 windows/season adds up over a long career,
// so this is capped the same way MAX_TRANSFER_NEWS already caps
// engine/transfernews.js's own list.
const MAX_LOG_ENTRIES = 300;

const TRANSFER_TYPE_LABEL = { transfer: "Purchase", loan: "Loan", "free-agent": "Free Transfer" };

/** Player's contract terms *as they stand right now* — the ledger's
 * "CURRENT" column (see ms_TRANSFER_NEGOTIATIONS_OFFERS_RECEIVED.png: Wage/
 * Contract Length/Bonus always show the player's real current terms, not the
 * negotiation's own working figures, since those describe the *other* side's
 * ask/offer). */
export function currentContractSnapshot(state, player) {
  return {
    wage: player.contract.wage,
    years: Math.max(0, player.contract.endYear - state.seasonStartYear),
    bonus: player.contract.bonusPerGoal || 0,
  };
}

/** Appends one terminal snapshot to state.transfers.negotiations.
 * `outcome` is "success" | "fail"; `offered` (nullable) is
 * {wage,years,bonus} — the terms actually offered, or null while a deal
 * resolved before personal terms were ever discussed (a rejected/withdrawn
 * fee-stage offer). */
export function pushNegotiationLogEntry(state, {
  source, dealType, playerId, fromClubId, toClubId, outcome, negStatus,
  transferFee = null, estimatedWorth = null, current = null, offered = null, date,
}) {
  if (!state.transfers.negotiations) state.transfers.negotiations = [];
  state.transfers.negotiations.unshift({
    id: nextLogId++, source, dealType, transferType: TRANSFER_TYPE_LABEL[dealType] || "Purchase",
    playerId, fromClubId, toClubId, outcome, negStatus,
    transferFee, estimatedWorth, current, offered, date,
  });
  if (state.transfers.negotiations.length > MAX_LOG_ENTRIES) state.transfers.negotiations.length = MAX_LOG_ENTRIES;
}

// Both scoped to the user's own deals (source "sent"/"received") — CPU<->CPU
// completions (source "cpu", see engine/transferai.js's runWeeklyTransferActivity)
// only ever populate Transfer History's own "ALL CLUBS" tab (worldwideCompletedEntries
// below), not this screen — the Negotiations ledger is user-scoped throughout
// (Received/Sent are already inherently user-scoped, being derived from the
// user's own inbox/live negotiation).
export function successfulEntries(state) {
  return (state.transfers.negotiations || []).filter((e) => e.outcome === "success" && e.source !== "cpu");
}
export function unsuccessfulEntries(state) {
  return (state.transfers.negotiations || []).filter((e) => e.outcome === "fail" && e.source !== "cpu");
}

/** ms_TRANSFER_HISTORY_SCREEN.png's "ALL CLUBS" tab — every completed deal
 * anywhere in the world this log has seen (user's own + CPU<->CPU). "MY CLUB"
 * reuses successfulEntries above directly (identical filter). */
export function worldwideCompletedEntries(state) {
  return (state.transfers.negotiations || []).filter((e) => e.outcome === "success");
}

/** Live "Transfer Offers Sent" row (0 or 1) — only once the user has
 * actually submitted at least one offer (n.everSubmitted), and only while
 * still in flight (not yet terminal — a resolved deal has already been
 * logged above and, per core/router.js's own close handling, the live
 * negotiation object doesn't linger once its result banner is dismissed). */
export function sentLedgerRow(state) {
  const n = state.transfers.negotiation;
  if (!n || !n.everSubmitted || n.phase === "completed" || n.phase === "rejected") return null;
  let negStatus;
  if (n.phase === "contract" || n.phase === "contract-waiting") negStatus = "Contract Talks";
  else if (n.phase === "fee" && n.lastFeeResponse === "countered") negStatus = "Counter Received";
  else negStatus = "Awaiting Response";
  return { playerId: n.playerId, fromClubId: state.club.id, toClubId: n.sourceClubId, dealType: n.dealType, negStatus, negotiation: n };
}

/** Live "Transfer Offers Received" rows — every pending incoming-bid email
 * (engine/transferai.js's pushIncomingBidEmail), each carrying its own
 * expiresDate countdown. */
export function receivedLedgerRows(state) {
  return state.inbox.emails
    .filter((e) => e.action && e.action.type === "transfer-bid")
    .map((e) => ({
      playerId: e.action.playerId, fromClubId: state.club.id, toClubId: e.action.buyingClubId,
      dealType: "transfer", negStatus: "Club Reviewing Offer",
      offer: e.action.offer, expiresDate: e.action.expiresDate, bidId: e.action.bidId,
    }));
}
