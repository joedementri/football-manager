// engine/sim/match.js — the interactive user match: owns the live
// `state.matchday` slice's state machine (kickoff -> first half -> halftime
// -> second half -> full time), built on engine/sim/events.js's per-segment
// timeline generation. This is the "sim/match.js" plan1.md M4 calls for,
// orchestrating events.js exactly the way its own header describes: "the
// ticker replays this timeline, but user subs/tactic changes at stoppages
// re-sim the remaining minutes with updated strength — so decisions
// matter". core/store.js's matchday* methods are thin wrappers around the
// functions below (mutate + emit), matching the project's existing
// engine/store split.

import { positionInfo } from "../../config/positions.js";
import { RngStream, deriveSeed } from "../../core/rng.js";
import { resolveUserXI, pickBestAvailableXI } from "./lineup.js";
import { simulateSegment } from "./events.js";
import { computeMatchRating } from "./core.js";
import { applyMatchResult } from "./results.js";
import { resolvePenaltyShootout } from "../comps/knockoututil.js";
import { nationSquadRoster, completeUserKnockoutTie, checkGroupPhaseCompletion } from "../comps/intl.js";

const HALFTIME_MINUTE = 45;
const FULLTIME_MINUTE = 90;
export const MAX_SUBS = 3; // not INI-specified — the standard football substitution limit for this era

/**
 * Builds the live match state for the user's fixture and generates its
 * first-half timeline. The user's side fields state.squad.lineup (their
 * saved team sheet, injury-autofilled — see lineup.js); the CPU opponent
 * always fields its current best-available XI (no CPU tactical subs modelled
 * this milestone, matching sim/quick.js's simplification for every other
 * CPU-vs-CPU match).
 *
 * M10: also drives the user's own national-team matches (plan1.md:
 * "NT matches simmed via the same ticker") — `fixture.isIntl` swaps the
 * roster source (engine/comps/intl.js's nationSquadRoster instead of
 * state.playersByClub) and the "is this my side" check (state.nationalTeam's
 * nationId instead of state.club.id); everything else — timeline
 * generation, subs, ratings — is identical since it only ever deals in
 * plain player-array XIs.
 */
export function createMatchState(state, fixture) {
  const isIntl = !!fixture.isIntl;
  const userTeamId = isIntl ? (state.nationalTeam ? state.nationalTeam.nationId : null) : state.club.id;
  const isUserHome = fixture.homeClubId === userTeamId;
  const homeRoster = isIntl ? nationSquadRoster(state, fixture.homeClubId) : (state.playersByClub.get(fixture.homeClubId) || []);
  const awayRoster = isIntl ? nationSquadRoster(state, fixture.awayClubId) : (state.playersByClub.get(fixture.awayClubId) || []);
  const userLineup = isIntl ? state.nationalTeam.lineup : state.squad.lineup;

  const homeXI = isUserHome ? resolveUserXI(homeRoster, userLineup) : pickBestAvailableXI(homeRoster);
  const awayXI = isUserHome ? pickBestAvailableXI(awayRoster) : resolveUserXI(awayRoster, userLineup);

  const playersById = new Map([...homeRoster, ...awayRoster].map((p) => [p.id, p]));
  const sideOf = new Map();
  const onPitchSince = new Map();
  for (const p of homeXI) { sideOf.set(p.id, "home"); onPitchSince.set(p.id, 0); }
  for (const p of awayXI) { sideOf.set(p.id, "away"); onPitchSince.set(p.id, 0); }

  const matchState = {
    fixture,
    isIntl,
    homeClubId: fixture.homeClubId,
    awayClubId: fixture.awayClubId,
    isUserHome,
    homeRoster, awayRoster, playersById,
    homeXI, awayXI,
    homeBenchUsed: 0, awayBenchUsed: 0,
    rng: new RngStream(deriveSeed(state.seed, `match-${fixture.id}`)),
    timeline: [], // not-yet-revealed events of the in-flight segment, sorted by minute
    log: [], // revealed events, oldest first (the ticker's event feed)
    minute: 0,
    segmentEnd: HALFTIME_MINUTE,
    score: { home: 0, away: 0 },
    sideOf, onPitchSince,
    minutesPlayed: new Map(),
    goals: new Map(), assists: new Map(), yellows: new Set(), reds: new Set(), injuries: new Map(),
    removedIds: new Set(), // sent off / injured off — can't factor into a later regenerated segment
    playing: false,
    speed: 1,
    atHalftime: false,
    finished: false,
    penalties: null, // set at full time only for a drawn intl knockout tie (see finishMatch)
  };
  regenerateSegment(state, matchState);
  return matchState;
}

function clubLookup(state, matchState) {
  const map = matchState.isIntl ? state.nationsById : state.clubsById;
  return {
    homeClub: map.get(matchState.homeClubId),
    awayClub: map.get(matchState.awayClubId),
  };
}

/** (Re)generates the not-yet-revealed portion of the in-flight segment —
 * called at match creation, at the start of the second half, and after any
 * mid-segment substitution. */
function regenerateSegment(state, matchState) {
  const { homeClub, awayClub } = clubLookup(state, matchState);
  const { events } = simulateSegment({
    fromMinute: matchState.minute, toMinute: matchState.segmentEnd,
    homeClub, awayClub, homeXI: matchState.homeXI, awayXI: matchState.awayXI, rng: matchState.rng,
  });
  matchState.timeline = events;
}

function removeFromPitch(matchState, playerId, minute) {
  const since = matchState.onPitchSince.get(playerId);
  if (since == null) return; // already off
  matchState.minutesPlayed.set(playerId, (matchState.minutesPlayed.get(playerId) || 0) + (minute - since));
  matchState.onPitchSince.delete(playerId);
  matchState.removedIds.add(playerId);
  matchState.homeXI = matchState.homeXI.filter((p) => p.id !== playerId);
  matchState.awayXI = matchState.awayXI.filter((p) => p.id !== playerId);
}

function applyEvent(matchState, event) {
  if (matchState.removedIds.has(event.playerId)) return; // see events.js header: same-segment edge case guard
  switch (event.type) {
    case "goal":
      matchState.score[event.side] += 1;
      matchState.goals.set(event.playerId, (matchState.goals.get(event.playerId) || 0) + 1);
      if (event.assistId != null && !matchState.removedIds.has(event.assistId)) {
        matchState.assists.set(event.assistId, (matchState.assists.get(event.assistId) || 0) + 1);
      }
      break;
    case "card":
      if (event.cardType === "red") {
        matchState.reds.add(event.playerId);
        removeFromPitch(matchState, event.playerId, event.minute);
      } else if (matchState.yellows.has(event.playerId)) {
        matchState.reds.add(event.playerId); // second yellow -> red
        removeFromPitch(matchState, event.playerId, event.minute);
      } else {
        matchState.yellows.add(event.playerId);
      }
      break;
    case "injury":
      matchState.injuries.set(event.playerId, event.injury);
      removeFromPitch(matchState, event.playerId, event.minute);
      break;
    default: // "chance-miss" — ticker flavour only, no stat effect
      break;
  }
  matchState.log.push(event);
}

/** Advances the ticker by one minute, revealing any events scheduled at it.
 * No-ops while paused at halftime or once finished — the caller (core/
 * store.js's matchdayTick, driven by ui/matchday.js's interval timer) is
 * expected to stop calling this once either becomes true. */
export function tick(state, matchState) {
  if (matchState.finished || matchState.atHalftime) return;
  matchState.minute += 1;
  while (matchState.timeline.length && matchState.timeline[0].minute <= matchState.minute) {
    applyEvent(matchState, matchState.timeline.shift());
  }
  if (matchState.minute >= matchState.segmentEnd) {
    if (matchState.segmentEnd === HALFTIME_MINUTE) {
      matchState.atHalftime = true;
      matchState.playing = false;
    } else {
      finishMatch(state, matchState);
    }
  }
}

/** Starts the second half — any substitution made while paused at halftime
 * is already reflected in matchState.homeXI/awayXI, so this simply
 * generates 45-90's timeline from the current lineups. */
export function continueSecondHalf(state, matchState) {
  if (!matchState.atHalftime || matchState.finished) return;
  matchState.atHalftime = false;
  matchState.segmentEnd = FULLTIME_MINUTE;
  regenerateSegment(state, matchState);
}

/**
 * Substitutes `inPlayerId` on for `outPlayerId` on `side` ("home"/"away").
 * If the match is mid-segment (not paused at halftime, not finished), the
 * remaining not-yet-revealed events are discarded and the segment is
 * re-simulated from the current minute with the updated lineup — plan1.md's
 * "decisions matter". Returns false if the substitution isn't legal (max
 * subs reached, or either player isn't where expected).
 */
export function substitute(state, matchState, side, outPlayerId, inPlayerId) {
  const usedKey = side === "home" ? "homeBenchUsed" : "awayBenchUsed";
  const xiKey = side === "home" ? "homeXI" : "awayXI";
  const rosterKey = side === "home" ? "homeRoster" : "awayRoster";
  if (matchState.finished || matchState[usedKey] >= MAX_SUBS) return false;
  const outPlayer = matchState[xiKey].find((p) => p.id === outPlayerId);
  const inPlayer = matchState[rosterKey].find((p) => p.id === inPlayerId);
  if (!outPlayer || !inPlayer || matchState.onPitchSince.get(inPlayerId) != null) return false;

  removeFromPitch(matchState, outPlayerId, matchState.minute);
  matchState.removedIds.delete(outPlayerId); // a substitution isn't a "can't play again" event, unlike a red/injury
  matchState[xiKey].push(inPlayer);
  matchState.sideOf.set(inPlayerId, side);
  matchState.onPitchSince.set(inPlayerId, matchState.minute);
  matchState[usedKey] += 1;
  // Logged like any other incident so the full-time report (ui/matchday.js)
  // can list it alongside goals/cards/injuries in one chronological feed.
  matchState.log.push({ minute: matchState.minute, type: "sub", side, playerOutId: outPlayerId, playerInId: inPlayerId });

  if (!matchState.atHalftime && !matchState.finished) regenerateSegment(state, matchState);
  return true;
}

/** Jumps straight to full time, revealing everything at once (the ticker's
 * "instant" speed) — auto-continues through halftime with no lineup change. */
export function simToEnd(state, matchState) {
  while (!matchState.finished) {
    if (matchState.atHalftime) continueSecondHalf(state, matchState);
    else tick(state, matchState);
  }
}

function buildFinalPlayerStats(matchState) {
  const stats = new Map();
  const homeWon = matchState.score.home > matchState.score.away;
  const awayWon = matchState.score.away > matchState.score.home;
  for (const [playerId, side] of matchState.sideOf) {
    const player = matchState.playersById.get(playerId);
    const area = positionInfo(player.position).area;
    const goals = matchState.goals.get(playerId) || 0;
    const assists = matchState.assists.get(playerId) || 0;
    const concededByTeam = side === "home" ? matchState.score.away : matchState.score.home;
    const teamWon = side === "home" ? homeWon : awayWon;
    const teamLost = side === "home" ? awayWon : homeWon;
    const sentOff = matchState.reds.has(playerId);
    const rating = computeMatchRating({
      area, goals, assists, teamWon, teamLost, cleanSheet: concededByTeam === 0, concededByTeam, sentOff, rng: matchState.rng,
    });
    stats.set(playerId, {
      side, minutesPlayed: Math.round(matchState.minutesPlayed.get(playerId) || 0),
      goals, assists, yellow: matchState.yellows.has(playerId) && !sentOff, red: sentOff,
      rating, cleanSheet: concededByTeam === 0, injury: matchState.injuries.get(playerId) || null,
    });
  }
  return stats;
}

function finishMatch(state, matchState) {
  for (const [playerId, since] of matchState.onPitchSince) {
    matchState.minutesPlayed.set(playerId, (matchState.minutesPlayed.get(playerId) || 0) + (FULLTIME_MINUTE - since));
  }
  matchState.onPitchSince.clear();
  matchState.finished = true;
  matchState.playing = false;

  const playerStats = buildFinalPlayerStats(matchState);
  matchState.finalStats = playerStats; // ui/matchday.js's full-time report (ratings, MOM) reads this
  applyMatchResult(state, matchState.fixture, {
    homeGoals: matchState.score.home, awayGoals: matchState.score.away, playerStats,
  });

  // M10: the user's own NT knockout tie needs a winner — a draw goes to
  // penalties (plan1.md: "single leg + penalties", same rule every other
  // knockout competition already uses via engine/comps/knockoututil.js's
  // resolvePenaltyShootout), then engine/comps/intl.js's bracket is told the
  // result so it can advance/crown a champion exactly like a quick-simmed
  // tie would.
  if (matchState.isIntl && matchState.fixture.isIntlKnockout) {
    let winnerNationId;
    let penalties = null;
    if (matchState.score.home !== matchState.score.away) {
      winnerNationId = matchState.score.home > matchState.score.away ? matchState.homeClubId : matchState.awayClubId;
    } else {
      const shootout = resolvePenaltyShootout(matchState.rng, matchState.homeXI, matchState.awayXI);
      penalties = { home: shootout.home, away: shootout.away };
      winnerNationId = shootout.winner === "home" ? matchState.homeClubId : matchState.awayClubId;
    }
    matchState.penalties = penalties; // ui/matchday.js's full-time report shows "Penalties: X-Y" when present
    completeUserKnockoutTie(state, {
      competitionId: matchState.fixture.competitionId,
      homeNationId: matchState.homeClubId, awayNationId: matchState.awayClubId,
      winnerNationId, homeGoals: matchState.score.home, awayGoals: matchState.score.away,
      penalties, date: state.calendar.today,
    });
  } else if (matchState.isIntl) {
    // M10: a qualifying/tournament-group fixture — the deciding result for
    // that phase's final matchday may have just landed here instead of via
    // quick-sim (see engine/comps/intl.js's maybeTransitionGroupPhase); a
    // no-op unless this was in fact the last piece needed.
    checkGroupPhaseCompletion(state, matchState.fixture);
  }
}
