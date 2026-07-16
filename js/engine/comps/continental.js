// engine/comps/continental.js — M10 continental club competitions (European
// Champions Cup, European Trophy, South American Champions Cup — plan1.md's
// "Continental" section). Per the milestone's own scope decision (mirroring
// M5's domestic-cup precedent, engine/comps/cup.js's header): every tie
// resolves statistically via engine/sim/quick.js, including the user's own
// club — there is no interactive Match Day ticker for continental fixtures.
//
// Qualification (plan1.md verbatim: "seeded from prior-season league
// positions across all European leagues in data") is computed once per
// rollover (engine/season.js) from each confederation's clubs, ranked by
// (league prestige desc, final league position asc); Season 1 has no prior
// season yet, so it bootstraps from each club's own static `prestige` field
// instead (core/store.js's createCareerState calls createInitialContinentalState
// for this). Group stage reuses engine/comps/league.js's round-robin
// generator and buildLeagueTable verbatim (a competition group IS just a
// 4-team mini-league); the knockout stage reuses engine/comps/
// knockoututil.js's penalty-shootout/round-label helpers, with its own
// (simpler than domestic cup's) bracket walk since 16 clubs always halves
// evenly down to a champion — no byes/staggered entry needed.

import { RngStream, deriveSeed } from "../../core/rng.js";
import { toEpochDay } from "../../core/clock.js";
import {
  continentalGroupMatchdayDates, firstContinentalKnockoutDate, nextContinentalKnockoutDate,
} from "../../config/calendar.js";
import { doubleRoundRobinRounds, buildLeagueTable } from "./league.js";
import { roundLabel, resolvePenaltyShootout } from "./knockoututil.js";
import { simulateQuickMatch } from "../sim/quick.js";
import { applyMatchResult } from "../sim/results.js";
import { pickBestAvailableXI } from "../sim/lineup.js";

/** [judgment call, see plan] Champions Cup / South American Cup: 8 groups of
 * 4 (plan1.md's own "8 groups of 4" for the Champions Cup, extended to the
 * South American analogue the plan says mirrors it), top 2 per group
 * advance. European Trophy: 12 groups of 4 (48 teams — the plan's own team
 * count), top-1 per group + best-4 runners-up (ranked by pts then GD, fair
 * since every continental group here is uniformly sized) advance — both cut
 * down to a clean 16-team Round of 16 field. */
export const COMPETITIONS = [
  { id: "euro-champions-cup", name: "European Champions Cup", confeds: ["UEFA"], fieldSize: 32, groupSize: 4, rankSlice: [0, 32] },
  { id: "euro-trophy", name: "European Trophy", confeds: ["UEFA"], fieldSize: 48, groupSize: 4, rankSlice: [32, 80], bestRunnersUp: 4 },
  { id: "south-american-champions-cup", name: "South American Champions Cup", confeds: ["CONMEBOL"], fieldSize: 32, groupSize: 4, rankSlice: [0, 32] },
];

function leaguePrestigeAvg(league) {
  return (league.prestige[0] + league.prestige[1]) / 2;
}

/** Ranks every club of the given confederation(s) by (league prestige desc,
 * final league position asc, static club prestige desc as a last-resort
 * tiebreak) — `tableByLeague` is null at career-start bootstrap (no prior
 * season exists yet), in which case every club ties on "position" and the
 * ranking falls back to prestige alone. */
function rankClubsForConfeds(clubs, leaguesById, nationsByName, confeds, tableByLeague) {
  return clubs
    .filter((c) => {
      const league = leaguesById.get(c.leagueId);
      const nation = league && nationsByName.get(league.country);
      return nation && confeds.includes(nation.confed);
    })
    .map((c) => {
      const league = leaguesById.get(c.leagueId);
      const table = tableByLeague ? tableByLeague.get(league.id) : null;
      const row = table && table.find((r) => r.club.id === c.id);
      return {
        clubId: c.id, avgPrestige: leaguePrestigeAvg(league),
        position: row ? row.position : 999, staticPrestige: c.prestige,
      };
    })
    .sort((a, b) => b.avgPrestige - a.avgPrestige || a.position - b.position || b.staticPrestige - a.staticPrestige)
    .map((r) => r.clubId);
}

/**
 * @param {object[]} clubs - this season's effective clubs (engine/season.js's
 *   clubsThisSeason, i.e. league membership as it stood *this* season —
 *   European qualification is earned by the table the club actually played
 *   in, independent of any subsequent promotion/relegation move)
 * @param {object[]} leagues
 * @param {object[]} nations
 * @param {Map<string,object[]>|null} tableByLeague - engine/comps/league.js
 *   tables from the season that just finished, or null at career-start bootstrap
 * @returns {Record<string,string[]>} competition id -> qualified club ids
 */
export function qualifyContinentalFields({ clubs, leagues, nations, tableByLeague }) {
  const leaguesById = new Map(leagues.map((l) => [l.id, l]));
  const nationsByName = new Map(nations.map((n) => [n.name, n]));
  const rankedByConfed = new Map();
  const fields = {};
  for (const comp of COMPETITIONS) {
    const key = comp.confeds.join("+");
    if (!rankedByConfed.has(key)) {
      rankedByConfed.set(key, rankClubsForConfeds(clubs, leaguesById, nationsByName, comp.confeds, tableByLeague));
    }
    const ranked = rankedByConfed.get(key);
    fields[comp.id] = ranked.slice(comp.rankSlice[0], comp.rankSlice[1]);
  }
  return fields;
}

/** Real-competition "pot" draw: sort by qualification rank, deal one club
 * from each band of `numGroups` (pot 1 = strongest, pot 2 = next, ...) into
 * each group, shuffling within a band so the draw isn't always literally
 * rank order — same spirit as domestic cup's own seeded-but-random draw. */
function seededGroupDraw(rng, rankedClubIds, groupSize) {
  const numGroups = Math.ceil(rankedClubIds.length / groupSize);
  const groups = Array.from({ length: numGroups }, () => []);
  for (let band = 0; band < groupSize; band++) {
    const bandMembers = rankedClubIds.slice(band * numGroups, (band + 1) * numGroups);
    rng.shuffle(bandMembers).forEach((clubId, groupIdx) => groups[groupIdx].push(clubId));
  }
  return groups;
}

/** Builds one competition's fresh group-stage state for a season. */
function buildCompetitionState(comp, qualifiedClubIds, seed, seasonStartYear) {
  const drawRng = new RngStream(deriveSeed(seed, `continental-draw-${comp.id}-${seasonStartYear}`));
  const groupClubIdLists = seededGroupDraw(drawRng, qualifiedClubIds, comp.groupSize);
  const matchdayDates = continentalGroupMatchdayDates(seasonStartYear);

  const groups = groupClubIdLists.map((clubIds, groupIdx) => {
    const rounds = doubleRoundRobinRounds(clubIds);
    const fixtures = [];
    rounds.forEach((round, roundIdx) => {
      const matchday = roundIdx + 1;
      const date = matchdayDates[roundIdx];
      round.forEach(({ home, away }) => {
        fixtures.push({
          id: `continental-${comp.id}-${seasonStartYear}-g${groupIdx}-md${matchday}-${home}-${away}`,
          matchday, date, homeClubId: home, awayClubId: away,
        });
      });
    });
    return { clubIds, fixtures };
  });

  return {
    id: comp.id, name: comp.name, seasonStartYear,
    phase: "group", groups, matchdayDates, knockout: null,
  };
}

/** Career-start bootstrap (no prior season exists) — engine/season.js's own
 * rollover rebuild (see rebuildContinentalForRollover below) is the steady
 * -state path from season 2 onward. */
export function createInitialContinentalState(state) {
  const { clubs, leagues, nations } = state.staticData;
  const fields = qualifyContinentalFields({ clubs, leagues, nations, tableByLeague: null });
  const competitions = {};
  for (const comp of COMPETITIONS) {
    competitions[comp.id] = buildCompetitionState(comp, fields[comp.id], state.seed, state.seasonStartYear);
  }
  const continental = { competitions };
  state.continental = continental;
  return continental;
}

/** engine/season.js's July 1 rollover calls this with the season that just
 * finished (clubsThisSeason + its tableByLeague), rebuilding every
 * competition fresh for the upcoming season — same footing as
 * engine/comps/cup.js's own buildCupState rebuild. */
export function rebuildContinentalForRollover(state, { clubsThisSeason, leagues, nations, tableByLeague, newSeasonStartYear }) {
  const fields = qualifyContinentalFields({ clubs: clubsThisSeason, leagues, nations, tableByLeague });
  const competitions = {};
  for (const comp of COMPETITIONS) {
    competitions[comp.id] = buildCompetitionState(comp, fields[comp.id], state.seed, newSeasonStartYear);
  }
  state.continental = { competitions };
}

function resolveGroupMatchdayFixtures(state, compState, date) {
  const day = toEpochDay(date);
  for (const group of compState.groups) {
    for (const fx of group.fixtures) {
      if (toEpochDay(fx.date) !== day) continue;
      const homeClub = state.clubsById.get(fx.homeClubId);
      const awayClub = state.clubsById.get(fx.awayClubId);
      const homeRoster = state.playersByClub.get(fx.homeClubId) || [];
      const awayRoster = state.playersByClub.get(fx.awayClubId) || [];
      const rng = new RngStream(deriveSeed(state.seed, `match-${fx.id}`));
      const result = simulateQuickMatch({ fixture: fx, homeClub, awayClub, homeRoster, awayRoster, rng });
      applyMatchResult(state, fx, result);
    }
  }
}

function buildKnockoutBracket(entrantClubIds, firstRoundDate) {
  return { roundIndex: 0, pending: entrantClubIds, ties: [], championClubId: null, finished: false, nextRoundDate: firstRoundDate };
}

function transitionToKnockout(state, compState) {
  const comp = COMPETITIONS.find((c) => c.id === compState.id);
  const groupTables = compState.groups.map((g) => {
    const clubs = g.clubIds.map((id) => state.clubsById.get(id));
    return buildLeagueTable({ id: "group" }, clubs, g.fixtures, state.results);
  });

  let advancers;
  if (comp.bestRunnersUp) {
    const winners = groupTables.map((t) => t[0].club.id);
    const runnersUp = groupTables.map((t) => t[1])
      .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
    advancers = [...winners, ...runnersUp.slice(0, comp.bestRunnersUp).map((r) => r.club.id)];
  } else {
    advancers = groupTables.flatMap((t) => [t[0].club.id, t[1].club.id]);
  }

  compState.phase = "knockout";
  compState.knockout = buildKnockoutBracket(advancers, firstContinentalKnockoutDate(compState.seasonStartYear));
}

function resolveKnockoutRound(state, compState, date) {
  const bracket = compState.knockout;
  const entrants = bracket.pending;
  if (entrants.length <= 1) {
    bracket.championClubId = entrants[0] ?? null;
    bracket.finished = true;
    compState.phase = "finished";
    return;
  }

  const label = roundLabel(entrants.length, bracket.roundIndex);
  const drawRng = new RngStream(deriveSeed(state.seed, `continental-ko-${compState.id}-${compState.seasonStartYear}-r${bracket.roundIndex}`));
  const shuffled = drawRng.shuffle(entrants);
  const isFinal = label === "Final";
  const winners = [];

  for (let i = 0; i < shuffled.length; i += 2) {
    const [clubAId, clubBId] = drawRng.chance(0.5) ? [shuffled[i], shuffled[i + 1]] : [shuffled[i + 1], shuffled[i]];
    const homeClub = state.clubsById.get(clubAId);
    const awayClub = state.clubsById.get(clubBId);
    const homeRoster = state.playersByClub.get(clubAId) || [];
    const awayRoster = state.playersByClub.get(clubBId) || [];
    const fixtureId = `continental-ko-${compState.id}-${compState.seasonStartYear}-r${bracket.roundIndex}-${clubAId}-${clubBId}`;
    const matchRng = new RngStream(deriveSeed(state.seed, `match-${fixtureId}`));

    const result = simulateQuickMatch({
      fixture: { id: fixtureId }, homeClub, awayClub, homeRoster, awayRoster, rng: matchRng, neutral: isFinal,
    });
    applyMatchResult(state, { id: fixtureId }, result);

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

    bracket.ties.push({
      id: fixtureId, roundIndex: bracket.roundIndex, roundLabel: label,
      homeClubId: clubAId, awayClubId: clubBId,
      homeGoals: result.homeGoals, awayGoals: result.awayGoals,
      penalties, winnerClubId, neutral: isFinal, date,
    });
  }

  if (winners.length === 1) {
    bracket.championClubId = winners[0];
    bracket.finished = true;
    compState.phase = "finished";
    return;
  }

  bracket.roundIndex += 1;
  bracket.pending = winners;
  bracket.nextRoundDate = nextContinentalKnockoutDate(date, compState.seasonStartYear);
}

/** Called once per day the calendar sweeps through (engine/sim/worldsim.js),
 * same shape as engine/comps/cup.js's advanceCupsForDate. */
export function advanceContinentalForDate(state, date) {
  if (!state.continental) return;
  const day = toEpochDay(date);
  for (const compState of Object.values(state.continental.competitions)) {
    if (!compState || compState.phase === "finished") continue;
    if (compState.phase === "group") {
      const idx = compState.matchdayDates.findIndex((d) => toEpochDay(d) === day);
      if (idx === -1) continue;
      resolveGroupMatchdayFixtures(state, compState, date);
      if (idx === compState.matchdayDates.length - 1) transitionToKnockout(state, compState);
    } else if (compState.phase === "knockout") {
      if (toEpochDay(compState.knockout.nextRoundDate) !== day) continue;
      resolveKnockoutRound(state, compState, date);
    }
  }
}

/** The current/most-recent status of `clubId` in one competition — mirrors
 * engine/comps/cup.js's cupStatusForClub for reuse by the Season screen's
 * continental carousel page (ui/render.js). */
export function continentalStatusForClub(compState, clubId) {
  if (!compState) return { inCompetition: false };
  if (compState.phase === "group") {
    const inGroup = compState.groups.some((g) => g.clubIds.includes(clubId));
    return inGroup ? { inCompetition: true, roundLabel: "Group Stage", opponentClubId: null, lastResult: null } : { inCompetition: false };
  }

  const bracket = compState.knockout;
  const myTies = bracket.ties.filter((t) => t.homeClubId === clubId || t.awayClubId === clubId);
  const lastTie = myTies[myTies.length - 1] || null;
  const opponentOf = (tie) => (tie.homeClubId === clubId ? tie.awayClubId : tie.homeClubId);
  const everQualified = lastTie != null || bracket.pending.includes(clubId) || bracket.championClubId === clubId;
  if (!everQualified) return { inCompetition: false };

  if (bracket.championClubId === clubId) return { inCompetition: true, roundLabel: "Champions", opponentClubId: null, lastResult: lastTie };
  if (bracket.finished) {
    return { inCompetition: true, roundLabel: `Eliminated — ${lastTie.roundLabel}`, opponentClubId: opponentOf(lastTie), lastResult: lastTie };
  }
  const stillIn = bracket.pending.includes(clubId);
  if (!stillIn) {
    return { inCompetition: true, roundLabel: `Eliminated — ${lastTie.roundLabel}`, opponentClubId: opponentOf(lastTie), lastResult: lastTie };
  }
  return {
    inCompetition: true, roundLabel: roundLabel(bracket.pending.length, bracket.roundIndex),
    opponentClubId: lastTie && opponentOf(lastTie), lastResult: lastTie,
  };
}

/** The one continental competition `clubId` is (or was, this season) part
 * of, if any — a club can only ever qualify for one (Champions Cup and
 * Trophy are non-overlapping slices of the same UEFA ranking; the South
 * American Cup only ever contains CONMEBOL clubs). */
export function findClubContinentalCompetition(state, clubId) {
  if (!state.continental) return null;
  for (const compState of Object.values(state.continental.competitions)) {
    if (!compState) continue;
    const status = continentalStatusForClub(compState, clubId);
    if (status.inCompetition) return { compState, status };
  }
  return null;
}
