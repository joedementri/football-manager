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
import { toEpochDay } from "../core/clock.js";
import { seasonStart } from "../config/calendar.js";
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
        signingBonus: 0, squadRole: terms.squadRole || "rotation", warnedExpiry: false,
      };
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
