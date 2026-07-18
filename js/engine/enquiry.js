// engine/enquiry.js — F3 (fable-plans/plan2.md): the Search Results/
// Shortlist action menu's "Enquire about <name>" row. Resolves instantly (no
// delayed response queue, unlike a real fee negotiation) — reuses engine/
// teamdecision.js's wanted-fee scoring to phrase a rough asking range, or
// refuse outright for a club that clearly isn't selling.
//
// [TUNED] "not for sale" threshold: transferteamdecision.ini has no explicit
// enquiry mechanic to port (only a fee-response table for an *offered*
// amount) — refusing outright below a raw team-decision score of -50 is
// plan2.md's own §A6 worked example for exactly this ledger entry, so it's
// used verbatim rather than inventing a different number.
import { money } from "../core/format.js";
import { computeWantedFee, computeTeamDecisionScore } from "./teamdecision.js";

export const ENQUIRY_REFUSE_THRESHOLD = -50;
export const ENQUIRY_RANGE_PCT = 12.5; // wanted fee +/- 12.5%, plan2.md F3.3's own wording

export function submitEnquiry(state, playerId) {
  const player = state.playersById.get(playerId);
  if (!player || player.clubId === state.club.id) return null;
  const sellingClub = state.clubsById.get(player.clubId);
  const score = computeTeamDecisionScore({ player, buyingClub: state.club, sellingClub, state });

  if (!state.transfers.enquiries) state.transfers.enquiries = new Map();
  const today = state.calendar.today;

  if (score <= ENQUIRY_REFUSE_THRESHOLD) {
    const result = { refused: true, date: today };
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
  const result = { refused: false, lo, hi, date: today };
  state.transfers.enquiries.set(playerId, result);
  state.inbox.emails.unshift({
    from: sellingClub.name.toUpperCase(), to: "Assistant Manager", cc: "Assistant Manager", crest: `crest-${sellingClub.id}`,
    date: new Date(today), read: false,
    subject: `[Transfer] Enquiry: ${player.commonName}`,
    body: [`We made contact with ${sellingClub.name} about ${player.commonName}.`, `They indicated a fee in the region of ${money(lo)} - ${money(hi)} would be required.`],
  });
  return result;
}
