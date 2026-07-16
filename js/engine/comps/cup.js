// engine/comps/cup.js — domestic cup knockout brackets (fable-plans/plan1.md
// M5 "Competitions": "Domestic cups: knockout with round draws, lower-tier
// entry rounds (FA Cup: L2/L1 enter R1, Championship+EPL R3; League Cup
// similar); single leg + penalties; final at neutral venue"). Every country's
// domestic cup in data/cups.json is simulated (all ~29, same precedent as
// M4 simulating every league regardless of user relevance).
//
// Round pairings are drawn *lazily*, one round at a time, immediately after
// the previous round's ties resolve — a later round's field depends on who
// actually won, so (unlike the league's whole-season-upfront schedule) there
// is no fixed fixture list to generate in one pass. This module only ever
// looks at "today": engine/sim/worldsim.js calls advanceCupsForDate() once
// per day the calendar sweeps through, same shape as its league equivalent.
//
// Per M5's scope decision (recorded here since it affects every user-visible
// cup match): cup ties resolve statistically via engine/sim/quick.js for
// *every* club, including the user's — there is no interactive Match Day
// ticker for cup fixtures this milestone (that stays league-only, matching
// M4's own delivery). Results surface via the Season screen's cup tile
// (ui/render.js) and the end-of-season awards email (engine/awards.js).

import { RngStream, deriveSeed } from "../../core/rng.js";
import { addDays, toEpochDay } from "../../core/clock.js";
import { firstCupRoundDate, nextCupRoundDate } from "../../config/calendar.js";
import { simulateQuickMatch } from "../sim/quick.js";
import { applyMatchResult } from "../sim/results.js";
import { pickBestAvailableXI } from "../sim/lineup.js";
import { roundLabel, resolvePenaltyShootout } from "./knockoututil.js";
import { tacticById } from "../../config/tactics.js";
import { difficultyById } from "../../config/settings.js";

// England's two cups (leagueIds spans all 4 tiers) stagger entry: the two
// lowest tiers (League One/Two) enter Round 1, the top two (Premier League/
// Championship) enter at Round 3 — ported verbatim from plan1.md's own
// text, not an INI (cup entry-round structure isn't in the FIFA 17 files).
// Every other country's cup (2 tiers or fewer) has every club enter Round 1.
const STAGGERED_ENTRY_MIN_LEAGUES = 4;
const LATE_ENTRY_ROUND_INDEX = 2; // 0-based -> "Round 3"
const LATE_ENTRY_TIER_MAX = 2; // tiers 1-2 wait; tiers 3+ start in Round 1

/**
 * Builds one cup's fresh bracket for a season (engine/season.js calls this
 * for every data/cups.json domestic entry at career start and every July 1
 * rollover).
 * @param {object} opts
 * @param {object} opts.cup - data/cups.json domestic entry
 * @param {object[]} opts.clubs - effective clubs (current leagueId already
 *   applied — see engine/season.js's promotion/relegation pass)
 * @param {object[]} opts.leagues - data/leagues.json (for each leagueId's tier)
 * @param {number} opts.seed
 * @param {number} opts.seasonStartYear
 */
export function buildCupState({ cup, clubs, leagues, seed, seasonStartYear }) {
  const tierByLeague = new Map(leagues.map((l) => [l.id, l.tier]));
  const clubsInCup = clubs.filter((c) => cup.leagueIds.includes(c.leagueId));
  const staggered = cup.leagueIds.length >= STAGGERED_ENTRY_MIN_LEAGUES;

  const round1 = staggered
    ? clubsInCup.filter((c) => (tierByLeague.get(c.leagueId) ?? 99) > LATE_ENTRY_TIER_MAX).map((c) => c.id)
    : clubsInCup.map((c) => c.id);
  const lateEntryClubIds = staggered
    ? clubsInCup.filter((c) => (tierByLeague.get(c.leagueId) ?? 99) <= LATE_ENTRY_TIER_MAX).map((c) => c.id)
    : [];

  return {
    id: cup.id,
    name: cup.name,
    seasonStartYear,
    roundIndex: 0,
    nextRoundDate: firstCupRoundDate(seasonStartYear),
    pending: round1,
    lateEntryClubIds,
    lateEntryRound: staggered ? LATE_ENTRY_ROUND_INDEX : -1,
    ties: [], // { id, roundIndex, roundLabel, homeClubId, awayClubId, homeGoals, awayGoals, penalties, winnerClubId, date }
    championClubId: null,
    finished: false,
  };
}

/** Resolves every tie of `cup`'s currently-pending round (today), then draws
 * the next round's pairing from the winners (+ any bye, + late entrants due
 * this round) — or crowns a champion if only one club remains. */
function resolveRound(state, cup, date) {
  const entrants = cup.roundIndex === cup.lateEntryRound
    ? [...cup.pending, ...cup.lateEntryClubIds]
    : cup.pending;

  if (entrants.length <= 1) {
    cup.championClubId = entrants[0] ?? null;
    cup.finished = true;
    return;
  }

  const label = roundLabel(entrants.length, cup.roundIndex);
  const drawRng = new RngStream(deriveSeed(state.seed, `cup-${cup.id}-${cup.seasonStartYear}-r${cup.roundIndex}`));
  const shuffled = drawRng.shuffle(entrants);
  const byeClubId = shuffled.length % 2 === 1 ? shuffled.pop() : null;
  const isFinal = label === "Final" && byeClubId === null;

  const winners = byeClubId ? [byeClubId] : [];
  for (let i = 0; i < shuffled.length; i += 2) {
    const [clubAId, clubBId] = drawRng.chance(0.5) ? [shuffled[i], shuffled[i + 1]] : [shuffled[i + 1], shuffled[i]];
    const homeClub = state.clubsById.get(clubAId);
    const awayClub = state.clubsById.get(clubBId);
    const homeRoster = state.playersByClub.get(clubAId) || [];
    const awayRoster = state.playersByClub.get(clubBId) || [];
    const fixtureId = `cup-${cup.id}-${cup.seasonStartYear}-r${cup.roundIndex}-${clubAId}-${clubBId}`;
    const matchRng = new RngStream(deriveSeed(state.seed, `match-${fixtureId}`));

    // homeClubId/awayClubId (not just `id`) so engine/career.js's My Career
    // club-match record can recognise the user's own club's cup ties too.
    const fixtureObj = { id: fixtureId, homeClubId: clubAId, awayClubId: clubBId };
    // M11: the user's own tactic + designated penalty taker (config/
    // tactics.js, state.squad.penaltyTakerId) apply here too — cup ties are
    // quick-simmed even for the user's club (this file's own header).
    const isUserHome = clubAId === state.club.id, isUserAway = clubBId === state.club.id;
    const userTacticModifier = isUserHome || isUserAway
      ? tacticById(state.squad.tacticId).modifier + difficultyById(state.settings.difficulty).modifier
      : 0;
    const result = simulateQuickMatch({
      fixture: fixtureObj, homeClub, awayClub, homeRoster, awayRoster, rng: matchRng, neutral: isFinal,
      homeTacticModifier: isUserHome ? userTacticModifier : 0,
      awayTacticModifier: isUserAway ? userTacticModifier : 0,
      homePenaltyTakerId: isUserHome ? state.squad.penaltyTakerId : null,
      awayPenaltyTakerId: isUserAway ? state.squad.penaltyTakerId : null,
    });
    applyMatchResult(state, fixtureObj, result);

    let penalties = null;
    let winnerClubId;
    if (result.homeGoals !== result.awayGoals) {
      winnerClubId = result.homeGoals > result.awayGoals ? clubAId : clubBId;
    } else {
      const homeXI = pickBestAvailableXI(homeRoster);
      const awayXI = pickBestAvailableXI(awayRoster);
      const shootout = resolvePenaltyShootout(matchRng, homeXI, awayXI);
      penalties = { home: shootout.home, away: shootout.away };
      winnerClubId = shootout.winner === "home" ? clubAId : clubBId;
    }
    winners.push(winnerClubId);

    cup.ties.push({
      id: fixtureId, roundIndex: cup.roundIndex, roundLabel: label,
      homeClubId: clubAId, awayClubId: clubBId,
      homeGoals: result.homeGoals, awayGoals: result.awayGoals,
      penalties, winnerClubId, neutral: isFinal, date,
    });
  }

  if (winners.length === 1 && (cup.lateEntryRound === -1 || cup.roundIndex >= cup.lateEntryRound)) {
    cup.championClubId = winners[0];
    cup.finished = true;
    return;
  }

  cup.roundIndex += 1;
  cup.pending = winners;
  cup.nextRoundDate = nextCupRoundDate(date, cup.seasonStartYear);
}

/** Called once per day the calendar sweeps through (engine/sim/worldsim.js),
 * for every cup still in progress this season. */
export function advanceCupsForDate(state, date) {
  for (const cup of state.cups.values()) {
    if (cup.finished) continue;
    if (toEpochDay(cup.nextRoundDate) !== toEpochDay(date)) continue;
    resolveRound(state, cup, date);
  }
}

/** The current/most-recent tie involving `clubId`, plus a human label — the
 * Season screen's cup tile (ui/render.js) reads this for the user's own
 * domestic cup instead of the old hardcoded "F.A. Cup — Round 2" stub. */
export function cupStatusForClub(cup, clubId) {
  const myTies = cup.ties.filter((t) => t.homeClubId === clubId || t.awayClubId === clubId);
  const lastTie = myTies[myTies.length - 1] || null;
  const opponentOf = (tie) => (tie.homeClubId === clubId ? tie.awayClubId : tie.homeClubId);

  if (cup.championClubId === clubId) {
    return { roundLabel: "Champions", opponentClubId: null, lastResult: lastTie };
  }
  if (cup.finished) {
    // Someone else won it — this club's own story is whatever its last tie was.
    return lastTie
      ? { roundLabel: `Eliminated — ${lastTie.roundLabel}`, opponentClubId: opponentOf(lastTie), lastResult: lastTie }
      : { roundLabel: "Did not enter", opponentClubId: null, lastResult: null };
  }
  const notYetEntered = cup.lateEntryClubIds.includes(clubId) && cup.roundIndex < cup.lateEntryRound;
  if (notYetEntered) {
    return { roundLabel: `Enters Round ${cup.lateEntryRound + 1}`, opponentClubId: null, lastResult: null };
  }
  const stillIn = cup.pending.includes(clubId) || (notYetEntered === false && cup.lateEntryClubIds.includes(clubId));
  if (!stillIn && lastTie) {
    return { roundLabel: `Eliminated — ${lastTie.roundLabel}`, opponentClubId: opponentOf(lastTie), lastResult: lastTie };
  }
  const upcomingCount = cup.roundIndex === cup.lateEntryRound
    ? cup.pending.length + cup.lateEntryClubIds.length
    : cup.pending.length;
  return { roundLabel: roundLabel(upcomingCount || 2, cup.roundIndex), opponentClubId: lastTie && opponentOf(lastTie), lastResult: lastTie };
}
