// engine/teamdecision.js — fee-negotiation acceptance, ported from
// reference/ini/transferteamdecision.ini via config/teamdecision.js's tables
// (fable-plans/plan1.md M7: "acceptance threshold scales with need, contract
// length, transfer-listed status" for the user's own buys; "selling club
// accepts if (surplus player) or (bid >= value x need-factor)" for CPU↔CPU).
// Pure functions — shared by engine/negotiation.js (user fee talks) and
// engine/transferai.js (CPU↔CPU), same reuse spirit as engine/contracts.js's
// computeAsk/acceptanceChance being shared by the user-renewal and CPU-renewal
// paths.

import { positionInfo } from "../config/positions.js";
import { clubOverallTarget } from "../config/playergen.js";
import { bracketVal } from "../config/value.js";
import {
  TEAM_OVERALL, TIME_AT_CLUB_MONTHS, SQUAD_SIZE, FUTURE_UPSIDE,
  PLAYER_IN_POSITION_LOW_SCORE, PLAYER_IN_POSITION_HIGH_SCORE, PLAYER_IN_POSITION_LIMIT,
  TOTAL_POINTS_CAP, POINTS_VALUE, WANTED_FEE, wantedFeeBucketIndex,
  MAX_WANTED_TABLE, MIN_WANTED_TABLE,
} from "../config/teamdecision.js";
import { MIN_COUNTER_OFFER_FEE_CAP, MAX_COUNTER_OFFER_FEE_CAP, TEAM_PRESTIGE_DIFF_PERCENT } from "../config/transferai.js";

/** League for a club id, reading the current season's promotion/relegation
 * override map (core/store.js's `state.clubLeague` — see its header) —
 * shared by every M7 engine file that needs a club's league:
 * engine/playerdecision.js, engine/transferai.js. */
export function leagueForClub(state, clubId) {
  const leagueId = state.clubLeague.get(clubId);
  return state.staticData.leagues.find((l) => l.id === leagueId);
}

function futureUpsideScore(diff) {
  for (const row of FUTURE_UPSIDE) if (diff >= row.min) return row.val;
  return 0;
}

/** [PLAYER_IN_POSITION]: linear between LOW_SCORE (this player is the best of
 * their position group at the selling club) and HIGH_SCORE (worst, at or
 * beyond LIMIT) — "position group" reads config/positions.js's overallGroup
 * (a squad only has 1-3 players sharing an exact position code, too small a
 * sample; overallGroup is the same grouping gen/squad.js's own slot planner
 * and gen/overall.js's weight tables use). */
function positionRankScore(player, sellingRoster) {
  const group = positionInfo(player.position).overallGroup;
  const sameGroup = sellingRoster.filter((p) => positionInfo(p.position).overallGroup === group);
  const sorted = [...sameGroup].sort((a, b) => b.overall - a.overall);
  const rank = sorted.findIndex((p) => p.id === player.id) + 1; // 1 = best
  if (rank <= 0) return 0;
  const t = Math.min(1, (rank - 1) / (PLAYER_IN_POSITION_LIMIT - 1));
  return PLAYER_IN_POSITION_LOW_SCORE + t * (PLAYER_IN_POSITION_HIGH_SCORE - PLAYER_IN_POSITION_LOW_SCORE);
}

/**
 * The selling club's "wanted fee" for `player` — see config/teamdecision.js's
 * header for how the summed score maps onto a %-of-`player.value` multiplier.
 * @param {object} opts
 * @param {object} opts.player
 * @param {object} opts.buyingClub
 * @param {object} opts.sellingClub
 * @param {object} opts.state
 */
export function computeWantedFee({ player, buyingClub, sellingClub, state }) {
  const buyingLeague = leagueForClub(state, buyingClub.id);
  const buyerOverall = clubOverallTarget(buyingClub, buyingLeague).mean;
  const teamOverallScore = bracketVal(TEAM_OVERALL, buyerOverall);

  // Months at club approximated from joinedClubYear (this project doesn't
  // track a join month) — mid-year offset (+6) avoids a systematic bias
  // toward either extreme of the TIME_AT_CLUB_MONTHS brackets.
  const monthsAtClub = Math.max(0, (state.seasonStartYear - player.joinedClubYear) * 12 + 6);
  const timeScore = bracketVal(TIME_AT_CLUB_MONTHS, monthsAtClub);

  const sellingRoster = state.playersByClub.get(sellingClub.id) || [];
  const squadScore = bracketVal(SQUAD_SIZE, sellingRoster.length);

  const upside = Math.max(0, player.potential - player.overall);
  const futureScore = futureUpsideScore(upside);

  const posScore = positionRankScore(player, sellingRoster);

  const rawScore = teamOverallScore + timeScore + squadScore + futureScore + posScore;
  const totalScore = Math.min(TOTAL_POINTS_CAP.MAX_POINTS, Math.max(TOTAL_POINTS_CAP.MIN_POINTS, rawScore));

  const t = (totalScore - TOTAL_POINTS_CAP.MIN_POINTS) / (TOTAL_POINTS_CAP.MAX_POINTS - TOTAL_POINTS_CAP.MIN_POINTS);
  const pct = POINTS_VALUE.MIN + t * (POINTS_VALUE.MAX - POINTS_VALUE.MIN);

  return Math.max(1000, Math.round(player.value * (1 + pct / 100)));
}

/** Accept/counter/reject percentages for an offered fee against the selling
 * club's wanted fee — `isFirstOffer` picks the Initial vs Counter column
 * (config/teamdecision.js's MAX/MIN_WANTED_TABLE). */
export function feeDecisionChances(offerFee, wantedFee, isFirstOffer) {
  const pctOffered = wantedFee > 0 ? (offerFee / wantedFee) * 100 : 100;
  const bucketIdx = wantedFeeBucketIndex(pctOffered);
  const table = wantedFee < WANTED_FEE.MIN ? MIN_WANTED_TABLE : MAX_WANTED_TABLE;
  const row = table[bucketIdx];
  return isFirstOffer
    ? { acceptPct: row.acceptInitial, counterPct: row.counterInitial, rejectPct: row.rejectInitial }
    : { acceptPct: row.acceptCounter, counterPct: row.counterCounter, rejectPct: row.rejectCounter };
}

/** Weighted 3-way roll off a {acceptPct,counterPct,rejectPct} triple. */
export function rollThreeWay(rng, chances) {
  const total = chances.acceptPct + chances.counterPct + chances.rejectPct;
  if (total <= 0) return "reject";
  let roll = rng.next() * total;
  if (roll < chances.acceptPct) return "accept";
  roll -= chances.acceptPct;
  if (roll < chances.counterPct) return "counter";
  return "reject";
}

/** Counter-fee value when the selling club counters (transfer.ini's
 * MIN/MAX_COUNTER_OFFER_FEE_CAP, gated by TEAM_PRESTIGE_DIFF_PERCENT — a much
 * bigger buying club emboldens a higher ask above the club's own wanted fee). */
export function computeCounterFee({ wantedFee, buyingClub, sellingClub, rng }) {
  const prestigeGapPct = sellingClub.prestige > 0
    ? ((buyingClub.prestige - sellingClub.prestige) / sellingClub.prestige) * 100 : 0;
  const cap = prestigeGapPct >= TEAM_PRESTIGE_DIFF_PERCENT ? MAX_COUNTER_OFFER_FEE_CAP : MIN_COUNTER_OFFER_FEE_CAP;
  const premiumPct = rng.float(0, cap);
  return Math.round(wantedFee * (1 + premiumPct / 100));
}
