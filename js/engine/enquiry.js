// engine/enquiry.js — F3 (fable-plans/plan2.md): the Search Results/
// Shortlist action menu's "Enquire about <name>" row. F3-fixes: no longer
// resolves instantly — it's a request that takes 1-3 days for the club to
// answer (owner: "the enquire should be a request, and within 1-3 days of
// simming... the club will send you an email... stating if they want to
// sell and if so for how much"), same delayed-response queue
// (state.transfers.pendingOffers) engine/negotiation.js's own fee/contract
// offers already use — including that file's "instant on deadline day"
// exception (owner's own "or next sim hour on transfer day": nothing left to
// wait on once the window's about to close). Reuses engine/teamdecision.js's
// wanted-fee scoring to phrase a rough asking range, or refuse outright for
// a club that clearly isn't selling. The resolved answer is kept in
// state.transfers.enquiries (persisted — F3-fixes: previously deliberately
// session-only, but the owner wants it remembered for the Approach dossier).
//
// [TUNED] "not for sale" threshold: transferteamdecision.ini has no explicit
// enquiry mechanic to port (only a fee-response table for an *offered*
// amount) — refusing outright below a raw team-decision score of -50 is
// plan2.md's own §A6 worked example for exactly this ledger entry, so it's
// used verbatim rather than inventing a different number.
import { money } from "../core/format.js";
import { computeWantedFee, computeTeamDecisionScore } from "./teamdecision.js";
import { deadlineDays } from "../config/calendar.js";
import { isSameDate, addDays, toEpochDay } from "../core/clock.js";
import { RngStream, deriveSeed } from "../core/rng.js";

export const ENQUIRY_REFUSE_THRESHOLD = -50;
export const ENQUIRY_RANGE_PCT = 12.5; // wanted fee +/- 12.5%, plan2.md F3.3's own wording
export const ENQUIRY_MIN_DAYS = 1;
export const ENQUIRY_MAX_DAYS = 3; // owner: "within 1-3 days of simming"

let nextEnquiryId = 1;

/** Same check engine/negotiation.js's own isDeadlineDay uses (config/
 * calendar.js's deadlineDays) — kept as a private duplicate rather than
 * exported/shared since it's a one-line lookup, same footing as that file's
 * own "not worth a shared helper" call. */
function isDeadlineDay(state, today) {
  return deadlineDays(state.seasonStartYear).some((d) => isSameDate(d, today));
}

function resolveEnquiry(state, playerId) {
  const player = state.playersById.get(playerId);
  const sellingClub = player ? state.clubsById.get(player.clubId) : null;
  // The player may have moved clubs (or been sold to a rival) while the
  // request was in flight — quietly drop the pending placeholder rather than
  // resolving against a club that no longer sells them.
  if (!player || !sellingClub) {
    state.transfers.enquiries.delete(playerId);
    return null;
  }
  const score = computeTeamDecisionScore({ player, buyingClub: state.club, sellingClub, state });
  const today = state.calendar.today;

  if (score <= ENQUIRY_REFUSE_THRESHOLD) {
    const result = { resolved: true, refused: true, date: today };
    state.transfers.enquiries.set(playerId, result);
    state.inbox.emails.unshift({
      from: sellingClub.name.toUpperCase(), to: "Assistant Manager", cc: "Assistant Manager", crest: `crest-${sellingClub.id}`,
      date: new Date(today), read: false,
      subject: `[Transfer] Enquiry: ${player.commonName}`,
      body: [`We made contact with ${sellingClub.name} about ${player.commonName}.`, `${sellingClub.name} have made it clear that ${player.commonName} is not for sale.`],
    });
    return result;
  }

  const wantedFee = computeWantedFee({ player, buyingClub: state.club, sellingClub, state });
  const lo = Math.round(wantedFee * (1 - ENQUIRY_RANGE_PCT / 100));
  const hi = Math.round(wantedFee * (1 + ENQUIRY_RANGE_PCT / 100));
  const result = { resolved: true, refused: false, lo, hi, date: today };
  state.transfers.enquiries.set(playerId, result);
  state.inbox.emails.unshift({
    from: sellingClub.name.toUpperCase(), to: "Assistant Manager", cc: "Assistant Manager", crest: `crest-${sellingClub.id}`,
    date: new Date(today), read: false,
    subject: `[Transfer] Enquiry: ${player.commonName}`,
    body: [`We made contact with ${sellingClub.name} about ${player.commonName}.`, `They indicated a fee in the region of ${money(lo)} - ${money(hi)} would be required.`],
  });
  return result;
}

/** core/store.js's _resolvePendingTransferOffers dispatch target for a
 * queued "enquiry-response" entry — same convention as engine/negotiation.js's
 * resolveFeeOfferEntry etc. */
export function resolveEnquiryEntry(state, entry) {
  resolveEnquiry(state, entry.playerId);
}

/** Submits an enquiry request — marks it pending immediately (so the Search
 * Report status line can say "Awaiting a response" right away) and queues
 * the real answer 1-3 simulated days out, or resolves it on the spot if
 * `today` is already a transfer deadline day. */
export function submitEnquiry(state, playerId) {
  const player = state.playersById.get(playerId);
  if (!player || player.clubId === state.club.id) return null;
  if (!state.transfers.enquiries) state.transfers.enquiries = new Map();
  const today = state.calendar.today;
  state.transfers.enquiries.set(playerId, { resolved: false, date: today });

  if (isDeadlineDay(state, today)) {
    resolveEnquiry(state, playerId);
    return state.transfers.enquiries.get(playerId);
  }

  const rng = new RngStream(deriveSeed(state.seed, `enquiry-${playerId}-${toEpochDay(today)}`));
  const dueDate = addDays(today, rng.int(ENQUIRY_MIN_DAYS, ENQUIRY_MAX_DAYS));
  state.transfers.pendingOffers.push({ id: nextEnquiryId++, type: "enquiry-response", dueDate, playerId });
  return state.transfers.enquiries.get(playerId);
}
