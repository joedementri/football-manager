// engine/playerdecision.js — a *new*-club signing ask + accept/reject
// decision, ported from reference/ini/transfer.ini's PLAYER_WAGE_DEMAND_*/
// PLAYER_WAGE_DECISION_* and reference/ini/transfers.ini's
// [TRANSFERS_PLAYER_DECISION_POINTS] via config/negotiation.js's M7 additions
// (fable-plans/plan1.md M7: "player asks wage = f(current wage, new club
// prestige, role promise) and length ... acceptance via decision points").
// Pure; shared by engine/negotiation.js (user buys), engine/freeagents.js
// (pre-contract approaches), and engine/transferai.js (CPU↔CPU signings) —
// see config/negotiation.js's header for exactly which decision-point factors
// are ported vs documented-skipped.

import { positionInfo } from "../config/positions.js";
import { minBracketVal } from "../config/contract.js";
import { clubOverallTarget } from "../config/playergen.js";
import { leagueForClub } from "./teamdecision.js";
import {
  WAGE_DEMAND_TEAM_OVR_DIFF, WAGE_DECISION_SCORE, PLAYER_DECISION_SCORE_LOWER, PLAYER_DECISION_SCORE_UPPER,
  MIN_AGE_TO_BE_VETERAN, DECISION_POINTS, MANAGER_PRESTIGE_SCORE, TEAM_LEVEL_STAR_RANK_SCORE, decisionCurveY,
} from "../config/negotiation.js";

const SQUAD_ROLE_TIER = { prospect: 0, rotation: 1, important: 2, crucial: 3 };

/** The player's wage ask for a move to `destClub`, scaled off the
 * destination's strength relative to their current club (transfer.ini's
 * PLAYER_WAGE_DEMAND_TEAM_OVR_DIFF/PERC_INC) — never below their current
 * wage, same "never a pay cut" floor as engine/contracts.js's computeAsk. */
export function computeSigningAsk({ player, sourceClub, destClub, state }) {
  const sourceLeague = leagueForClub(state, sourceClub.id);
  const destLeague = leagueForClub(state, destClub.id);
  const sourceOverall = clubOverallTarget(sourceClub, sourceLeague).mean;
  const destOverall = clubOverallTarget(destClub, destLeague).mean;
  const demandPct = minBracketVal(WAGE_DEMAND_TEAM_OVR_DIFF, destOverall - sourceOverall);
  const wage = Math.max(player.contract.wage, Math.round(player.contract.wage * (1 + demandPct / 100)));
  return { wage, years: 3 };
}

/** GOODROLEOFFER/ROLETOOHIGH/ROLETOOLOW/REALLYBADROLEOFFER — comparing the
 * promised squad role against the player's current one (this project's own
 * prospect/rotation/important/crucial tiers, standing in for the INI's
 * separate BESTPLAYERFORPOSITION/TOPXPLAYERONCURRENTTEAM squad-analysis
 * cluster — see config/negotiation.js's header). REALLYBADROLEOFFER
 * (-1750, wildly outside every other constant's -400..200 range) reads as a
 * hard-override sentinel ("this offer is refused outright"), not a literal
 * addend — same idiom as config/value.js's AGE_VALUE_PCT -1000 row. */
function roleFitScore(player, promisedRole) {
  const current = SQUAD_ROLE_TIER[player.contract.squadRole] ?? 1;
  const promised = SQUAD_ROLE_TIER[promisedRole] ?? 1;
  const delta = promised - current;
  if (delta <= -3) return { hardReject: true, score: 0 };
  if (delta < 0) return { hardReject: false, score: DECISION_POINTS.ROLETOOLOW };
  if (delta > 1) return { hardReject: false, score: DECISION_POINTS.ROLETOOHIGH };
  return { hardReject: false, score: DECISION_POINTS.GOODROLEOFFER };
}

/** Index-maps state.manager.rep (1-20) onto MANAGER_PRESTIGE_SCORE's 10
 * buckets — see config/negotiation.js's header on why this is an index
 * mapping rather than a recovered INI boundary table. Only applies when the
 * destination is the user's own club (this factor is about trusting *this*
 * human manager, not a CPU one). */
function managerPrestigeScore(rep) {
  const idx = Math.min(MANAGER_PRESTIGE_SCORE.length - 1, Math.max(0, Math.floor(((rep - 1) / 19) * (MANAGER_PRESTIGE_SCORE.length - 1))));
  return MANAGER_PRESTIGE_SCORE[idx];
}

/** Index-maps club.prestige (1-10) onto TEAM_LEVEL_STAR_RANK_SCORE's 13
 * buckets — applies to every destination, user or CPU. */
function teamLevelScore(prestige) {
  const idx = Math.min(TEAM_LEVEL_STAR_RANK_SCORE.length - 1, Math.max(0, Math.round(((prestige - 1) / 9) * (TEAM_LEVEL_STAR_RANK_SCORE.length - 1))));
  return TEAM_LEVEL_STAR_RANK_SCORE[idx];
}

/**
 * 0-1 chance `player` accepts `offer` (`{wage}`) to join `destClub` from
 * `sourceClub` under `promisedRole`.
 */
export function decisionChance({ player, sourceClub, destClub, offer, promisedRole, state }) {
  const ask = computeSigningAsk({ player, sourceClub, destClub, state });
  const wagePctDelta = ask.wage > 0 ? ((offer.wage - ask.wage) / ask.wage) * 100 : 0;
  const wageScore = minBracketVal(WAGE_DECISION_SCORE, wagePctDelta);

  const role = roleFitScore(player, promisedRole);
  if (role.hardReject) return 0;

  let score = wageScore + role.score;
  if (destClub.rivalId && destClub.rivalId === sourceClub.id) score += DECISION_POINTS.ISRIVALCLUB;

  const destRoster = state.playersByClub.get(destClub.id) || [];
  const group = positionInfo(player.position).overallGroup;
  const sameGroupCount = destRoster.filter((p) => positionInfo(p.position).overallGroup === group).length;
  score += sameGroupCount < 4 ? DECISION_POINTS.POSITIONAVAILABLEFORMAINROLE : DECISION_POINTS.POSITIONNOTAVAILABLEFORMAINROLE;

  if (player.age >= MIN_AGE_TO_BE_VETERAN) score += DECISION_POINTS.ISVETERANPLAYER;

  if (destClub.id === state.club.id) score += managerPrestigeScore(state.manager.rep);
  score += teamLevelScore(destClub.prestige);

  if (sourceClub.id === state.club.id && state.transfers.listings.has(player.id)) score += DECISION_POINTS.ISTRANSFERLISTED;

  const y = decisionCurveY(score);
  if (y <= PLAYER_DECISION_SCORE_LOWER) return 0;
  if (y >= PLAYER_DECISION_SCORE_UPPER) return 1;
  return (y - PLAYER_DECISION_SCORE_LOWER) / (PLAYER_DECISION_SCORE_UPPER - PLAYER_DECISION_SCORE_LOWER);
}
