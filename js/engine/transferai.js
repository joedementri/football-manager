// engine/transferai.js — CPU<->CPU transfer window activity, plus incoming
// CPU bids on the user's own listed players (fable-plans/plan1.md M7:
// "CPU<->CPU: weekly during windows each club: compute needs ... selling
// club accepts if (surplus player) or (bid >= value x need-factor); player
// accepts via decision points ... Generates transfer news ... Cap volume
// (~40 completed CPU transfers/window across top leagues, scaled down for
// minor leagues)"; "User sells: ... CPU bids arrive as emails over following
// days (probability from value vs list price, form, window timing)").
//
// Both the user's own club and its players are always excluded from the
// CPU<->CPU pass below — same "one club id is never touched by the world
// sim" precedent as engine/sim/worldsim.js.

import { RngStream, deriveSeed } from "../core/rng.js";
import { isSameDate, toEpochDay, isDateInRange } from "../core/clock.js";
import { transferWindows, deadlineDays } from "../config/calendar.js";
import { positionInfo, AREAS } from "../config/positions.js";
import { clubOverallTarget } from "../config/playergen.js";
import { money } from "../core/format.js";
import {
  MIN_PLAYERS_PER_AREA, CPU_TRANSFERS_PER_WINDOW_CAP,
  leagueTier, RELOCATION_PROBABILITY, MONTHS_UNTIL_TRANSFER_ALLOWED_CPU,
} from "../config/transferai.js";
import { computeWantedFee, feeDecisionChances, rollThreeWay, leagueForClub } from "./teamdecision.js";
import { computeSigningAsk, decisionChance } from "./playerdecision.js";
import { recomputeValue } from "./value.js";
import { movePlayerToClub } from "./contracts.js";
import { getClubBudget, spendClubBudget, creditClubBudget } from "./clubbudget.js";
import { buildCpuTransferNewsArticle, pushTransferNews } from "./transfernews.js";

const MONDAY = 1;

function currentWindowKey(state, today, windows) {
  if (isDateInRange(today, windows.summer.open, windows.summer.close)) return `${state.seasonStartYear}-summer`;
  if (isDateInRange(today, windows.winter.open, windows.winter.close)) return `${state.seasonStartYear}-winter`;
  return null;
}

/** Weakest area for `club`: a hard depth shortfall (below
 * config/transferai.js's MIN_PLAYERS_PER_AREA) takes priority; otherwise an
 * "upgrade" need — the weakest player in an area more than 3 below the
 * league's mean overall (plan1.md's own "upgrade if starter below league
 * mean -3"). Null if the squad has no real need this week. */
function assessNeed(club, league, roster) {
  const counts = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (const p of roster) counts[positionInfo(p.position).area]++;
  for (const area of AREAS) if (counts[area] < MIN_PLAYERS_PER_AREA[area]) return area;

  const { mean } = clubOverallTarget(club, league);
  let worstArea = null, worstGap = 3;
  for (const area of AREAS) {
    const areaPlayers = roster.filter((p) => positionInfo(p.position).area === area);
    if (!areaPlayers.length) continue;
    const weakest = Math.min(...areaPlayers.map((p) => p.overall));
    const gap = mean - weakest;
    if (gap > worstGap) { worstGap = gap; worstArea = area; }
  }
  return worstArea;
}

/** Picks another club as this week's negotiating counterparty, weighted by
 * the simplified 3-tier RELOCATION_PROBABILITY (config/transferai.js). */
function pickCounterpartyClub(state, rng, club, league) {
  const clubTier = leagueTier(league);
  const weighted = [];
  for (const c of state.staticData.clubs) {
    if (c.id === club.id || c.id === state.club.id) continue;
    const cLeague = leagueForClub(state, c.id);
    if (!cLeague) continue;
    const prob = RELOCATION_PROBABILITY[clubTier][leagueTier(cLeague)];
    if (prob > 0) weighted.push({ club: c, weight: prob });
  }
  const total = weighted.reduce((s, w) => s + w.weight, 0);
  if (total <= 0) return null;
  let roll = rng.next() * total;
  for (const w of weighted) {
    roll -= w.weight;
    if (roll <= 0) return w.club;
  }
  return weighted[weighted.length - 1].club;
}

/**
 * Runs one day's worth of CPU<->CPU transfer activity: a weekly cadence
 * (Mondays) while a window is open, with a hard per-window completed-deal
 * cap enforced via `state.transferWindowProgress` (reset whenever the
 * current window key changes) so the plan's "~40/window" budget holds
 * regardless of how many Mondays a window spans. Deadline day processes
 * whatever's left of that budget in one go, regardless of weekday.
 * @returns {number} deals completed this call (0 most days)
 */
export function runWeeklyTransferActivity(state, today) {
  const windows = transferWindows(state.seasonStartYear);
  const windowKey = currentWindowKey(state, today, windows);
  if (!windowKey) return 0;

  if (!state.transferWindowProgress || state.transferWindowProgress.key !== windowKey) {
    state.transferWindowProgress = { key: windowKey, completed: 0 };
  }
  const progress = state.transferWindowProgress;
  if (progress.completed >= CPU_TRANSFERS_PER_WINDOW_CAP) return 0;

  const isDeadline = deadlineDays(state.seasonStartYear).some((d) => isSameDate(d, today));
  if (!isDeadline && today.getDay() !== MONDAY) return 0;

  const rng = new RngStream(deriveSeed(state.seed, `transferai-${toEpochDay(today)}`));
  const remaining = CPU_TRANSFERS_PER_WINDOW_CAP - progress.completed;
  const batchTarget = isDeadline ? remaining : Math.min(remaining, Math.ceil(CPU_TRANSFERS_PER_WINDOW_CAP / 8));

  const tiers = { top: [], medium: [], lower: [] };
  for (const c of state.staticData.clubs) {
    if (c.id === state.club.id) continue;
    const league = leagueForClub(state, c.id);
    if (league) tiers[leagueTier(league)].push(c);
  }
  const order = [...rng.shuffle(tiers.top), ...rng.shuffle(tiers.medium), ...rng.shuffle(tiers.lower)];

  let completed = 0;
  for (const club of order) {
    if (completed >= batchTarget) break;
    const league = leagueForClub(state, club.id);
    if (!league) continue;
    const roster = state.playersByClub.get(club.id) || [];
    const need = assessNeed(club, league, roster);
    if (!need) continue;

    const counterparty = pickCounterpartyClub(state, rng, club, league);
    if (!counterparty) continue;
    const targetRoster = state.playersByClub.get(counterparty.id) || [];
    const candidates = targetRoster.filter((p) => {
      if (positionInfo(p.position).area !== need) return false;
      const monthsAtClub = (state.seasonStartYear - p.joinedClubYear) * 12 + 6;
      return monthsAtClub >= MONTHS_UNTIL_TRANSFER_ALLOWED_CPU;
    });
    if (!candidates.length) continue;
    const target = candidates.reduce((best, p) => (p.overall > best.overall ? p : best), candidates[0]);

    const wantedFee = computeWantedFee({ player: target, buyingClub: club, sellingClub: counterparty, state });
    if (wantedFee > getClubBudget(state, club.id)) continue;

    // CPU<->CPU offers the full wanted fee outright (no user watching to
    // haggle for) — feeDecisionChances still gates on squad/role/potential
    // reluctance via the bucket the fee itself lands in.
    const outcome = rollThreeWay(rng, feeDecisionChances(wantedFee, wantedFee, true));
    if (outcome !== "accept") continue;

    const ask = computeSigningAsk({ player: target, sourceClub: counterparty, destClub: club, state });
    const chance = decisionChance({ player: target, sourceClub: counterparty, destClub: club, offer: ask, promisedRole: "rotation", state });
    if (!rng.chance(chance)) continue;

    spendClubBudget(state, club.id, wantedFee);
    creditClubBudget(state, counterparty.id, wantedFee);
    movePlayerToClub(state, target, club.id);
    target.contract = {
      wage: ask.wage, endYear: state.seasonStartYear + ask.years,
      signingBonus: 0, squadRole: "rotation", warnedExpiry: false,
    };
    recomputeValue(target, club, state.seasonStartYear);

    pushTransferNews(state, buildCpuTransferNewsArticle({ player: target, fromClub: counterparty, toClub: club, fee: wantedFee, today }));
    completed++;
    progress.completed++;
  }
  return completed;
}

/* ============================================================================
 * Incoming bids on the user's own listed players
 * ========================================================================== */

function hasPendingBidEmail(state, playerId) {
  return state.inbox.emails.some((e) => e.action && e.action.type === "transfer-bid" && e.action.playerId === playerId);
}

function pickBiddingClub(state, rng, player) {
  const weighted = [];
  for (const c of state.staticData.clubs) {
    if (c.id === state.club.id) continue;
    const league = leagueForClub(state, c.id);
    if (!league) continue;
    const gap = clubOverallTarget(c, league).mean - player.overall;
    weighted.push({ club: c, weight: 1 / (1 + gap * gap) });
  }
  const total = weighted.reduce((s, w) => s + w.weight, 0);
  if (total <= 0) return null;
  let roll = rng.next() * total;
  for (const w of weighted) {
    roll -= w.weight;
    if (roll <= 0) return w.club;
  }
  return weighted[weighted.length - 1].club;
}

function pushIncomingBidEmail(state, { player, buyingClub, offer, today }) {
  const bidId = `bid-${player.id}-${toEpochDay(today)}`;
  state.inbox.emails.unshift({
    from: buyingClub.name.toUpperCase(), to: "Assistant Manager", cc: "Assistant Manager", crest: `crest-${buyingClub.id}`,
    date: new Date(today), read: false,
    subject: `[Transfer] Bid received for ${player.commonName}`,
    body: [
      `${buyingClub.name} have made an offer of ${money(offer)} for ${player.commonName}.`,
      "Do you want to accept this bid?",
    ],
    action: { type: "transfer-bid", bidId, playerId: player.id, buyingClubId: buyingClub.id, offer },
  });
}

/** Daily check: for every player the user has listed (state.transfers.listings),
 * a small chance a CPU club sends a bid email with Accept/Reject actions
 * (plan1.md: "probability from value vs list price, form, window timing"). */
export function checkIncomingBidsOnListedPlayers(state, today) {
  const windows = transferWindows(state.seasonStartYear);
  if (!currentWindowKey(state, today, windows)) return;
  if (!state.transfers.listings.size) return;

  const rng = new RngStream(deriveSeed(state.seed, `incoming-${toEpochDay(today)}`));
  for (const [playerId, listing] of state.transfers.listings) {
    const player = state.playersById.get(playerId);
    if (!player || player.clubId !== state.club.id) continue;
    if (hasPendingBidEmail(state, playerId)) continue;

    const priceRatio = listing.askingPrice > 0 ? player.value / listing.askingPrice : 1;
    const baseChance = 0.03 * Math.min(2, priceRatio) * (0.6 + player.form / 10);
    if (!rng.chance(baseChance)) continue;

    const buyingClub = pickBiddingClub(state, rng, player);
    if (!buyingClub) continue;
    const offer = Math.round(listing.askingPrice * rng.float(0.7, 1.05));
    const ask = computeSigningAsk({ player, sourceClub: state.club, destClub: buyingClub, state });
    const chance = decisionChance({ player, sourceClub: state.club, destClub: buyingClub, offer: ask, promisedRole: "rotation", state });
    if (chance < 0.2) continue; // not worth emailing the user about an offer the player would refuse anyway

    pushIncomingBidEmail(state, { player, buyingClub, offer, today });
  }
}

export function acceptIncomingBid(state, bidId) {
  const email = state.inbox.emails.find((e) => e.action && e.action.bidId === bidId);
  if (!email) return { error: "not-found" };
  const { playerId, buyingClubId, offer } = email.action;
  const player = state.playersById.get(playerId);
  if (!player || player.clubId !== state.club.id) return { error: "stale" };
  const buyingClub = state.clubsById.get(buyingClubId);

  state.finances.transferBudget += offer;
  spendClubBudget(state, buyingClubId, offer);
  movePlayerToClub(state, player, buyingClubId);
  const ask = computeSigningAsk({ player, sourceClub: state.club, destClub: buyingClub, state });
  player.contract = {
    wage: ask.wage, endYear: state.seasonStartYear + ask.years,
    signingBonus: 0, squadRole: "rotation", warnedExpiry: false,
  };
  recomputeValue(player, buyingClub, state.seasonStartYear);
  state.transfers.listings.delete(playerId);
  state.squad.roster = (state.playersByClub.get(state.club.id) || []).slice().sort((a, b) => b.overall - a.overall);

  email.read = true;
  email.action = null;
  pushTransferNews(state, buildCpuTransferNewsArticle({ player, fromClub: state.club, toClub: buyingClub, fee: offer, today: state.calendar.today }));
  return { ok: true };
}

export function rejectIncomingBid(state, bidId) {
  const email = state.inbox.emails.find((e) => e.action && e.action.bidId === bidId);
  if (!email) return { error: "not-found" };
  email.read = true;
  email.action = null;
  return { ok: true };
}
