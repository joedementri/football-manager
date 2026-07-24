// engine/contracts.js — contract renewal (user negotiation + CPU AI),
// expiring-contract warnings, and Bosman departures, ported from
// reference/ini/playercontract.ini via config/contract.js's tables
// (fable-plans/plan1.md M6: "contract renewal UI + AI renewals; expiring-
// contract warnings"; "Bosman: CPU clubs approach your expiring players (and
// you theirs) in Jan").
//
// Scope decisions (documented, same footing as engine/jobs.js's own header):
//   - User renewal is a single-shot offer/response, not iterative fee-talk
//     rounds — matches engine/jobs.js's "apply == instant accept" precedent.
//     Signing bonuses (playercontract.ini's BONUS_* tables) aren't modelled
//     as a separate negotiable term; `contract.signingBonus` stays 0, same
//     as it's been since gen/player.js's M2 placeholder.
//   - "(and you theirs)" — the user approaching a CPU club's own expiring
//     player — needs the full fee/contract negotiation flow M7's Transfers
//     screen builds; this milestone only implements the board's *warning*
//     email about a rival's interest in the user's own players, plus the
//     actual mechanical consequence (losing them) if ignored.
//   - A released/unrenewed player never lands on the user's own club without
//     their consent — every CPU-driven signing in this file explicitly
//     excludes state.club.id as a destination (pickSigningClub's
//     `excludeUserClub`). The user only gains players through their own
//     action (renewal here; M7 adds buying/loans).

import { RngStream, deriveSeed } from "../core/rng.js";
import { toEpochDay, addDays } from "../core/clock.js";
import { seasonStart } from "../config/calendar.js";
import { pickResponseDayOffset, MIN_DAYS_TO_RESPOND } from "../config/negotiation.js";
import { bracketVal } from "../config/value.js";
import { clubOverallTarget } from "../config/playergen.js";
import { computeWage, recomputeWage } from "./wage.js";
import { recomputeValue } from "./value.js";
import { toField, surname } from "./objectives.js";
import {
  NUM_DAYS_FOR_RUNNING_OUT_WARNING, PERCENTAGE_OF_RESIGNING_FEE,
  RENEWAL_PROBABILITIES, RENEWAL_TIER_BY_SQUAD_ROLE, PERCENTAGE_OF_ASK_ACCEPT,
  CONTRACT_LENGTH_PERCENTAGE, OVERALL_ASK_PCT, AGE_ASK_PCT, minBracketVal,
} from "../config/contract.js";
import { releaseGuardGroupFor, SQUAD_FLOOR_TOTAL, RELEASE_PAYOFF_PCT } from "../config/budget.js";
import { buildCpuTransferNewsArticle, pushTransferNews } from "./transfernews.js";

/* ============================================================================
 * Ask + acceptance — shared by both the user's negotiation UI and the CPU
 * auto-renewal roll below.
 * ========================================================================== */

/** The player's wage ask when renewing: their current wage bumped by the
 * overall/age percentage tables. Never below their current wage — a player
 * renewing is asking for *more* or the same, not volunteering a pay cut. */
export function computeAsk(player) {
  const overallPct = minBracketVal(OVERALL_ASK_PCT, player.overall);
  const agePct = minBracketVal(AGE_ASK_PCT, player.age);
  const wage = Math.round(player.contract.wage * (1 + overallPct / 100) * (1 + agePct / 100));
  return { wage: Math.max(player.contract.wage, wage) };
}

/** Acceptance chance (0-1) for `offer` (`{wage, years}`) against `ask`
 * (computeAsk's return) for a squad-role tier ("STARTING11"/"SUB"/
 * "RESERVE" — see config/contract.js's header for how the length table is
 * read). Length only modulates the wage-driven chance by ±50%, keeping wage
 * the dominant lever, same spirit as real FIFA contract UIs. */
export function acceptanceChance(offer, ask, tier) {
  const wagePct = ask.wage > 0 ? (offer.wage / ask.wage) * 100 : 100;
  const wageChance = bracketVal(PERCENTAGE_OF_ASK_ACCEPT, wagePct) / 100;
  const lengthTable = CONTRACT_LENGTH_PERCENTAGE[tier] || CONTRACT_LENGTH_PERCENTAGE.SUB;
  const lengthIdx = Math.min(lengthTable.length, Math.max(1, Math.round(offer.years))) - 1;
  const lengthChance = lengthTable[lengthIdx] / 100;
  return Math.max(0, Math.min(1, wageChance * (0.5 + 0.5 * lengthChance)));
}

export function renewalTierFor(player) {
  return RENEWAL_TIER_BY_SQUAD_ROLE[player.contract.squadRole] || "SUB";
}

/* ============================================================================
 * User renewal (Office ▸ Contracts)
 * ========================================================================== */

/**
 * @param {object} state
 * @param {number} playerId
 * @param {{wage:number, years:number}} offer
 * @returns {{accepted:boolean, chance:number, ask:{wage:number}}}
 */
export function renewUserContract(state, playerId, offer) {
  const player = state.playersById.get(playerId);
  const ask = computeAsk(player);
  const chance = acceptanceChance(offer, ask, renewalTierFor(player));
  const rng = new RngStream(deriveSeed(
    state.seed, `renew-${state.seasonStartYear}-${player.id}-${offer.wage}-${offer.years}`,
  ));
  const accepted = rng.chance(chance);
  if (accepted) {
    const fee = Math.round(player.value * PERCENTAGE_OF_RESIGNING_FEE / 100);
    player.contract.wage = Math.round(offer.wage);
    player.contract.endYear = state.seasonStartYear + Math.round(offer.years);
    player.contract.warnedExpiry = false;
    state.finances.transferBudget -= fee;
    recomputeValue(player, state.clubsById.get(player.clubId), state.seasonStartYear);
  }
  return { accepted, chance, ask };
}

/* ============================================================================
 * F4-fixes (fable-plans/plan2-decisions.md): renewal offers now take a real
 * 3-6 day round trip (same MIN_DAYS_TO_RESPOND/pickResponseDayOffset window
 * every other deal type in this codebase already uses — buy-side fee/
 * contract talks, loans, free-agent approaches) instead of resolving the
 * instant they're sent. `renewUserContract` above is unchanged (still a pure
 * synchronous roll-and-apply, still exactly what dev/tests.js's own M6 unit
 * test exercises) — resolveRenewalOfferEntry just calls it once the delay
 * elapses, so this is additive, not a rewrite of the underlying acceptance
 * math. Needed so Sell Players' Status column has something real to observe
 * ("Offered: ..." while pending) rather than a state that's already resolved
 * by the time any other screen could show it.
 * ========================================================================== */

let nextRenewalOfferId = 1;

/** Submits a renewal offer for `playerId` — queues a delayed response rather
 * than resolving synchronously. Refuses if that player already has one in
 * flight (guards against stacking offers on the same player). */
export function submitRenewalOffer(state, playerId, offer) {
  const player = state.playersById.get(playerId);
  if (!player) return { error: "not-found" };
  if (player.contract.pendingOffer) return { error: "already-pending" };
  const today = state.calendar.today;
  const wage = Math.round(offer.wage);
  const years = Math.round(offer.years);
  const rng = new RngStream(deriveSeed(state.seed, `renewalsched-${toEpochDay(today)}-${playerId}`));
  const dueDate = addDays(today, MIN_DAYS_TO_RESPOND + pickResponseDayOffset(rng));
  player.contract.pendingOffer = { wage, years, dueDate };
  state.transfers.pendingOffers.push({ id: nextRenewalOfferId++, type: "renewal-response", playerId, dueDate, offer: { wage, years } });
  return { ok: true, dueDate };
}

function buildRenewalResponseEmail({ club, managerName, player, accepted, today }) {
  return {
    from: "ASSISTANT MANAGER", to: toField(managerName), cc: "Assistant Manager", crest: `crest-${club.id}`,
    date: new Date(today), read: false,
    subject: `[Contract] ${player.commonName}'s renewal talks`,
    body: accepted
      ? [`Boss,`, `${player.commonName} has agreed to sign a new contract with us.`]
      : [`Boss,`, `${player.commonName} has turned down the terms we offered. You can go back to him with a new offer any time.`],
  };
}

/** Resolves a queued `{type:"renewal-response", playerId, offer}` entry —
 * `core/store.js`'s `_resolvePendingTransferOffers` calls this once `dueDate`
 * arrives. Stale-guarded (matches every other resolver in this codebase): if
 * the pending flag is somehow already gone (shouldn't happen — nothing else
 * clears it), this is a no-op. */
export function resolveRenewalOfferEntry(state, entry) {
  const player = state.playersById.get(entry.playerId);
  if (!player || !player.contract.pendingOffer) return;
  const result = renewUserContract(state, entry.playerId, entry.offer);
  player.contract.pendingOffer = null;
  state.inbox.emails.unshift(buildRenewalResponseEmail({
    club: state.club, managerName: state.manager.name, player, accepted: result.accepted, today: state.calendar.today,
  }));
}

/* ============================================================================
 * Expiring-contract warning email (daily check, user squad only)
 * ========================================================================== */

function buildContractWarningEmail({ player, club, managerName, today, daysLeft }) {
  return {
    from: "ASSISTANT MANAGER", to: toField(managerName), cc: "Assistant Manager", crest: `crest-${club.id}`,
    date: new Date(today), read: false,
    subject: `[Contract] ${player.commonName}'s deal is running out`,
    body: [
      "Boss,",
      `${player.commonName}'s contract with us expires in ${daysLeft} days. If we don't agree new terms soon, he'll be free to talk to other clubs and could leave for nothing.`,
      "Head to Office › Contracts if you want to open renewal talks.",
    ],
  };
}

/** Daily hook (core/store.js's _processCalendarDay): warns once per player
 * (contract.warnedExpiry gate) the first day their contract is within
 * NUM_DAYS_FOR_RUNNING_OUT_WARNING of expiring. */
export function checkContractExpiryWarnings(state, today) {
  const emails = [];
  for (const player of state.squad.roster) {
    if (player.contract.warnedExpiry) continue;
    const daysLeft = toEpochDay(seasonStart(player.contract.endYear)) - toEpochDay(today);
    if (daysLeft > NUM_DAYS_FOR_RUNNING_OUT_WARNING || daysLeft < 0) continue;
    player.contract.warnedExpiry = true;
    emails.push(buildContractWarningEmail({ player, club: state.club, managerName: state.manager.name, today, daysLeft }));
  }
  if (emails.length) state.inbox.emails.unshift(...emails);
}

/* ============================================================================
 * January board review: Bosman-approach flavour email (mechanical
 * consequence lands at the July rollover via resolveExpiredContracts below).
 * ========================================================================== */

function buildBosmanApproachEmail({ player, club, managerName, today }) {
  return {
    from: `${club.name.toUpperCase()} BOARD`, to: toField(managerName), cc: "Assistant Manager", crest: `crest-${club.id}`,
    date: new Date(today), read: false,
    subject: `[Contract] Interest in ${player.commonName}`,
    body: [
      `Dear Mr. ${surname(managerName)},`,
      `We've been informed that at least one other club is monitoring ${player.commonName}'s situation ahead of his contract expiring this summer.`,
      "If you want to keep him, we'd strongly advise opening renewal talks before the season is out — once he's out of contract, we won't be able to stop him leaving for nothing.",
    ],
  };
}

/** Every user-squad player whose contract expires *this* season (i.e. lapses
 * at the upcoming July rollover) gets one flavour email at the January
 * board-review date. */
export function buildBosmanApproachEmails(state) {
  return state.squad.roster
    .filter((p) => p.contract.endYear === state.seasonStartYear + 1)
    .map((player) => buildBosmanApproachEmail({ player, club: state.club, managerName: state.manager.name, today: state.calendar.today }));
}

/* ============================================================================
 * Signing a released/expired player with a new (never the user's own) club
 * ========================================================================== */

/** Moves a player between clubs mid-simulation, keeping state.playersByClub
 * (the live index engine/sim/worldsim.js's lineup selection reads) in sync —
 * needed because this can fire mid-season (May CPU renewals), not just at
 * the July rollover where a full index rebuild follows regardless. Exported
 * for reuse by M7's engine/negotiation.js, engine/freeagents.js and
 * engine/transferai.js — every player move in the game funnels through this
 * one function rather than each transfer path re-syncing playersByClub itself. */
export function movePlayerToClub(state, player, newClubId) {
  const oldList = state.playersByClub.get(player.clubId);
  if (oldList) {
    const idx = oldList.indexOf(player);
    if (idx !== -1) oldList.splice(idx, 1);
  }
  player.clubId = newClubId;
  if (!state.playersByClub.has(newClubId)) state.playersByClub.set(newClubId, []);
  state.playersByClub.get(newClubId).push(player);

  // M8: signing for the user's own club always reveals a player fully —
  // every path that acquires a player for state.club.id (negotiation.js's
  // fee-talk completion, freeagents.js's lapsed pre-contract, this file's
  // own Bosman safety net) funnels through here, so this is the one place
  // that needs to raise scouting.level rather than each of those files
  // remembering to do it themselves.
  if (newClubId === state.club.id) {
    player.scouting = { level: 3, ovrRange: [player.overall, player.overall], potRange: [player.potential, player.potential] };
  }
}

/** Weighted pick toward clubs whose generation-time mean overall is close to
 * the player's own — a plausible landing spot without the full transfer-AI
 * matching M7's Transfers screen builds (see this file's header). */
function pickSigningClub(state, player, { excludeClubId }) {
  const leaguesById = new Map(state.staticData.leagues.map((l) => [l.id, l]));
  const candidates = state.staticData.clubs.filter((c) => c.id !== excludeClubId && c.id !== state.club.id);
  const weighted = candidates.map((c) => {
    const league = leaguesById.get(state.clubLeague.get(c.id) ?? c.leagueId);
    const gap = clubOverallTarget(c, league).mean - player.overall;
    return { club: c, league, weight: 1 / (1 + gap * gap) };
  });
  const total = weighted.reduce((s, w) => s + w.weight, 0);
  return { weighted, total };
}

function rollSigningClub(state, player, rng, excludeClubId) {
  const { weighted, total } = pickSigningClub(state, player, { excludeClubId });
  if (!weighted.length) return null;
  let roll = rng.next() * total;
  for (const w of weighted) {
    roll -= w.weight;
    if (roll <= 0) return w;
  }
  return weighted[weighted.length - 1];
}

/** Signs a released/expired player to a freshly-picked club on a 2-4 year
 * deal, updating clubId/contract/value in place. Returns the new club (or
 * null if — practically impossible with ~600 clubs in the world — no
 * candidate exists, in which case the old contract is flatly extended so the
 * player isn't left in a broken state).
 *
 * M7 (engine/freeagents.js): if the player pre-agreed a free move while still
 * under contract (`player.contract.preAgreedClubId`), that destination is
 * honored here instead of the random pickSigningClub roll below — this is the
 * one place both this milestone's "user approaches a free agent" and M6's
 * "CPU club signs your Bosman if ignored" mechanics meet. */
function signWithNewClub(state, player, rng) {
  if (player.contract.preAgreedClubId != null) {
    const club = state.clubsById.get(player.contract.preAgreedClubId);
    const terms = player.contract.preAgreedTerms;
    if (club && terms) {
      movePlayerToClub(state, player, club.id);
      player.contract = {
        wage: terms.wage, endYear: state.seasonStartYear + terms.years,
        signingBonus: terms.signingBonus || 0, squadRole: terms.squadRole || "rotation", warnedExpiry: false,
      };
      if (terms.signingBonus && club.id === state.club.id) state.finances.transferBudget -= terms.signingBonus;
      recomputeValue(player, club, state.seasonStartYear);
      return club;
    }
  }
  const picked = rollSigningClub(state, player, rng, player.clubId);
  if (!picked) {
    player.contract.endYear += 2;
    return null;
  }
  movePlayerToClub(state, player, picked.club.id);
  player.contract = {
    wage: computeWage(player, picked.league),
    endYear: state.seasonStartYear + 1 + rng.int(1, 3),
    signingBonus: 0,
    squadRole: "rotation",
    warnedExpiry: false,
  };
  recomputeValue(player, picked.club, state.seasonStartYear);
  return picked.club;
}

/* ============================================================================
 * F4 (fable-plans/plan2.md): Sell Players' "Release" action. This engine has
 * no idle `clubId=null` free-agent state anywhere (see this file's own
 * header + engine/freeagents.js's header) — a released player lands
 * immediately at a new CPU club, reusing rollSigningClub above exactly like
 * a lapsed Bosman does (pickSigningClub already excludes state.club.id, so
 * the roll can never hand the player straight back to the user).
 * ========================================================================== */

/** Months remaining on `endYear`'s contract from `state.calendar.today` —
 * same boundary engine/contracts.js's own expiry-warning check uses
 * (seasonStart(endYear)), just expressed as a month count. */
function remainingContractMonths(state, endYear) {
  const today = state.calendar.today;
  const expiry = seasonStart(endYear);
  let months = (expiry.getFullYear() - today.getFullYear()) * 12 + (expiry.getMonth() - today.getMonth());
  if (expiry.getDate() < today.getDate()) months -= 1;
  return Math.max(0, months);
}

/** Non-null (a short reason string) when Release is currently blocked for
 * `player` — either their own position group would drop below transfer.ini's
 * MIN_PLAYERS_POSITION_* floor, or the whole squad would drop below plan2.md
 * F4.1's own literal 16-player floor (config/budget.js's SQUAD_FLOOR_TOTAL). */
export function releaseGuardReason(state, player) {
  if (state.squad.roster.length <= SQUAD_FLOOR_TOTAL) return "Squad Size too Small to Release";
  const group = releaseGuardGroupFor(player.position);
  if (group) {
    const count = state.squad.roster.filter((p) => group.codes.includes(p.position)).length;
    if (count <= group.min) return "Squad Size too Small to Release";
  }
  return null;
}

/** Releases `playerId` from the user's own squad: pays off RELEASE_PAYOFF_PCT
 * of his remaining contract (wage x weeks-remaining) from the transfer
 * budget, then signs him to a freshly-rolled CPU club exactly like a lapsed
 * Bosman departure (signWithNewClub's own rollSigningClub call above).
 * Returns {error} if the guard blocks it, else {ok, payoff, newClub}. */
export function releasePlayer(state, playerId) {
  const player = state.playersById.get(playerId);
  if (!player || player.clubId !== state.club.id) return { error: "not-found" };
  const reason = releaseGuardReason(state, player);
  if (reason) return { error: "blocked", reason };

  const monthsLeft = remainingContractMonths(state, player.contract.endYear);
  const weeksLeft = Math.round((monthsLeft / 12) * 52);
  const payoff = Math.round(player.contract.wage * weeksLeft * (RELEASE_PAYOFF_PCT / 100));
  state.finances.transferBudget -= payoff;

  const oldClub = state.club;
  const rng = new RngStream(deriveSeed(state.seed, `release-${state.seasonStartYear}-${playerId}`));
  const picked = rollSigningClub(state, player, rng, oldClub.id);
  const newClub = picked ? picked.club : null;
  if (newClub) {
    movePlayerToClub(state, player, newClub.id);
    player.contract = {
      wage: computeWage(player, picked.league),
      endYear: state.seasonStartYear + 1 + rng.int(1, 3),
      signingBonus: 0, squadRole: "rotation", warnedExpiry: false,
    };
    recomputeValue(player, newClub, state.seasonStartYear);
    pushTransferNews(state, buildCpuTransferNewsArticle({ player, fromClub: oldClub, toClub: newClub, fee: 0, today: state.calendar.today }));
  } else {
    // Practically impossible with ~600 clubs in the world (see
    // rollSigningClub's own header) — extend the contract rather than leave
    // the player in a broken clubless state.
    player.contract.endYear += 2;
  }

  state.transfers.listings.delete(playerId);
  if (state.transfers.disallowedBids) state.transfers.disallowedBids.delete(playerId);
  state.squad.roster = (state.playersByClub.get(oldClub.id) || []).slice().sort((a, b) => b.overall - a.overall);
  return { ok: true, payoff, newClub };
}

/* ============================================================================
 * CPU auto-renewal (May 1, config/calendar.js's cpuContractRenewalDate)
 * ========================================================================== */

function rollRenewalOutcome(rng, tier) {
  const table = RENEWAL_PROBABILITIES[tier] || RENEWAL_PROBABILITIES.SUB;
  const entries = Object.entries(table);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = rng.next() * total;
  for (const [key, w] of entries) {
    roll -= w;
    if (roll <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

/** Every non-user-club player whose contract expires this season rolls
 * playercontract.ini's RENEWAL_PROBABILITIES_<tier> table: either a fresh
 * 1-5yr deal at their computed ask, or release (signWithNewClub finds them a
 * new home immediately — see this file's header on why it's never the
 * user's own club). */
export function applyCpuContractRenewals(state) {
  const rng = new RngStream(deriveSeed(state.seed, `cpu-renew-${state.seasonStartYear}`));
  const leaguesById = new Map(state.staticData.leagues.map((l) => [l.id, l]));
  for (const player of state.players) {
    if (player.clubId === state.club.id) continue; // user's squad: manual renewal only
    if (player.contract.endYear !== state.seasonStartYear + 1) continue;
    const outcome = rollRenewalOutcome(rng, renewalTierFor(player));
    if (outcome === "none") {
      signWithNewClub(state, player, rng);
      continue;
    }
    const club = state.clubsById.get(player.clubId);
    const league = leaguesById.get(state.clubLeague.get(player.clubId) ?? club.leagueId);
    const ask = computeAsk(player);
    player.contract.wage = ask.wage;
    player.contract.endYear = state.seasonStartYear + 1 + Number(outcome);
    player.contract.warnedExpiry = false;
    recomputeWage(player, league); // ask is wage-formula-shaped already, but recomputeWage keeps it exactly formula-consistent post-bump
    recomputeValue(player, club, state.seasonStartYear);
  }
}

/* ============================================================================
 * July rollover: Bosman safety net (engine/season.js's "budgets reset,
 * contracts -1yr" step) — resolves *any* still-expired contract (the user's
 * own unrenewed players; CPU stragglers whose club-league mapping changed
 * after May's pass) by signing them elsewhere.
 * ========================================================================== */

function buildBosmanDepartureEmail({ player, fromClub, toClub, managerName, today }) {
  return {
    from: `${fromClub.name.toUpperCase()} BOARD`, to: toField(managerName), cc: "Assistant Manager", crest: `crest-${fromClub.id}`,
    date: new Date(today), read: false,
    subject: `[Contract] ${player.commonName} leaves on a free transfer`,
    body: [
      `Dear Mr. ${surname(managerName)},`,
      `As his contract was allowed to run down, ${player.commonName} has left the club on a free transfer, signing for ${toClub.name}.`,
      "We'll need to plan for his absence — the January and summer transfer windows are the place to do it.",
    ],
  };
}

/** @returns {{player, fromClubId, toClub}[]} every player moved this way, for engine/season.js to email the user about its own losses. */
export function resolveExpiredContracts(state) {
  const rng = new RngStream(deriveSeed(state.seed, `bosman-${state.seasonStartYear}`));
  const departures = [];
  for (const player of state.players) {
    if (player.contract.endYear > state.seasonStartYear) continue;
    const fromClubId = player.clubId;
    const toClub = signWithNewClub(state, player, rng);
    if (toClub) departures.push({ player, fromClubId, toClub });
  }
  return departures;
}

export function buildBosmanDepartureEmailsForUser(state, departures, fromClubsById) {
  return departures
    .filter((d) => d.fromClubId === state.club.id)
    .map((d) => buildBosmanDepartureEmail({
      player: d.player, fromClub: fromClubsById.get(d.fromClubId), toClub: d.toClub,
      managerName: state.manager.name, today: state.calendar.today,
    }));
}
