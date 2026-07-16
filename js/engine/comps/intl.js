// engine/comps/intl.js — M10 internationals: qualifying groups + summer
// tournaments for all 5 data/cups.json competitions (World Cup, Euro, Copa
// América, AFCON, Asian Cup), national-team squads (top-rated players per
// nation, or the user's own selection once they hold an NT job — M10
// checkpoint C), and call-up emails. Every nation's fixture resolves
// statistically via engine/sim/quick.js by default — same reused pipeline
// as engine/comps/continental.js, since simulateQuickMatch/applyMatchResult
// only ever need a `{prestige}`-bearing "team" record and a roster array,
// and nations.json already has `.prestige`. Checkpoint C wires in the one
// exception: the user's own nation's matches, once they manage one, play out
// on the live Match Day ticker (engine/sim/match.js) exactly like their
// club's — this file only needs to *skip* resolving that one fixture when
// asked (see resolveIntlFixture's callers).
//
// See config/intl.js's header for the qualifying-group math and the
// bootstrap rule; see this file's own buildQualifyingGroups/
// transitionQualifyingToTournament for how it's actually assembled.

import { RngStream, deriveSeed } from "../../core/rng.js";
import { toEpochDay, addDays } from "../../core/clock.js";
import { doubleRoundRobinRounds, buildLeagueTable } from "./league.js";
import { roundLabel, resolvePenaltyShootout } from "./knockoututil.js";
import { simulateQuickMatch } from "../sim/quick.js";
import { applyMatchResult } from "../sim/results.js";
import { pickBestAvailableXI } from "../sim/lineup.js";
import { toField, surname } from "../objectives.js";
import {
  INTL_COMPETITIONS, QUALIFYING_GROUP_TARGET_SIZE,
  qualifyingMatchdayDates, tournamentMatchdayDates, nextTournamentKnockoutDate,
  nextCycleYearOnOrAfter, competitionStartSeason,
} from "../../config/intl.js";

const SQUAD_SIZE = 23;

/** A nation's matchday squad: the user's own saved selection (M10 checkpoint
 * C, state.nationalTeam) if this is their nation, else the top `SQUAD_SIZE`
 * players by overall — plan1.md's "NT squads = top-rated players per
 * nation". Re-filters state.players fresh every call rather than caching,
 * same "cheap enough not to need its own index" footing as
 * engine/sim/lineup.js's own pickBestAvailableXI. */
export function nationSquadRoster(state, nationId) {
  if (state.nationalTeam && state.nationalTeam.nationId === nationId && state.nationalTeam.squadPlayerIds.length) {
    const roster = state.nationalTeam.squadPlayerIds.map((id) => state.playersById.get(id)).filter(Boolean);
    if (roster.length) return roster;
  }
  return state.players
    .filter((p) => p.nationId === nationId)
    .sort((a, b) => b.overall - a.overall)
    .slice(0, SQUAD_SIZE);
}

function rankNationIdsForConfed(nations, confed) {
  return nations.filter((n) => n.confed === confed).sort((a, b) => b.prestige - a.prestige).map((n) => n.id);
}

/** Real-competition "pot" draw, same spirit as engine/comps/continental.js's
 * own seededGroupDraw — sort by rank, deal one member per group from each
 * band of `numGroups`, shuffling within a band. Tolerant of band counts not
 * dividing evenly (nation counts per confederation are small and uneven,
 * 3-28), unlike continental's exact-multiple club fields. */
function seededGroupDraw(rng, rankedIds, targetSize) {
  const numGroups = Math.max(1, Math.ceil(rankedIds.length / targetSize));
  const groups = Array.from({ length: numGroups }, () => []);
  for (let i = 0; i < rankedIds.length; i += numGroups) {
    const band = rankedIds.slice(i, i + numGroups);
    rng.shuffle(band).forEach((id, idx) => groups[idx].push(id));
  }
  return groups;
}

/** Group finish quality, normalized so uneven group sizes compare fairly
 * (points-per-game, then goal-difference-per-game). */
function byPpgThenGdpg(a, b) {
  const appg = a.pld ? a.pts / a.pld : 0, bppg = b.pld ? b.pts / b.pld : 0;
  if (bppg !== appg) return bppg - appg;
  const agpg = a.pld ? a.gd / a.pld : 0, bgpg = b.pld ? b.gd / b.pld : 0;
  return bgpg - agpg;
}

function buildGroupFixtures({ nationIds, dates, doubleLeg, neutral, idPrefix, competitionId, competitionName }) {
  const allRounds = doubleRoundRobinRounds(nationIds);
  const rounds = doubleLeg ? allRounds : allRounds.slice(0, nationIds.length - 1);
  const fixtures = [];
  rounds.forEach((round, roundIdx) => {
    const date = dates[roundIdx];
    round.forEach(({ home, away }) => {
      fixtures.push({
        id: `${idPrefix}-md${roundIdx + 1}-${home}-${away}`,
        matchday: roundIdx + 1, date, homeClubId: home, awayClubId: away, neutral,
        isIntl: true, competitionId, competitionName,
      });
    });
  });
  return fixtures;
}

function buildQualifyingGroups(comp, nations, seed, cycleYear, compId, compName, dates) {
  const groups = [];
  for (const confed of comp.confeds) {
    const ranked = rankNationIdsForConfed(nations, confed);
    if (ranked.length < 2) continue;
    const rng = new RngStream(deriveSeed(seed, `intl-draw-${compId}-${cycleYear}-${confed}`));
    const nationGroups = seededGroupDraw(rng, ranked, QUALIFYING_GROUP_TARGET_SIZE);
    nationGroups.forEach((nationIds, gi) => {
      groups.push({
        confed, nationIds,
        fixtures: buildGroupFixtures({
          nationIds, dates, doubleLeg: comp.doubleRoundRobin, neutral: false,
          idPrefix: `intl-${compId}-${cycleYear}-${confed}g${gi}`,
          competitionId: compId, competitionName: `${compName} Qualifying`,
        }),
      });
    });
  }
  return groups;
}

function buildKnockoutBracket(entrantIds, firstRoundDate) {
  return { roundIndex: 0, pending: entrantIds, ties: [], championNationId: null, finished: false, nextRoundDate: firstRoundDate };
}

/** Builds the June tournament phase (group stage, if this competition has
 * one, else straight to knockout) from a resolved field of nation ids —
 * shared by the qualifying->tournament transition and by the no-qualifying/
 * bootstrap creation path below. */
function startTournamentPhase({ id, name, comp, cycleYear, tournamentSeasonStartYear, nationIds, seed }) {
  if (!comp.tournamentGroupSize) {
    const firstDate = tournamentMatchdayDates(tournamentSeasonStartYear, 1)[0];
    return {
      id, name, cycleYear, tournamentSeasonStartYear,
      phase: "tournament-knockout", qualifyingGroups: null, qualifyingMatchdayDates: null,
      tournamentGroups: null, tournamentMatchdayDates: null,
      knockout: buildKnockoutBracket(nationIds, firstDate), championNationId: null,
    };
  }

  const rng = new RngStream(deriveSeed(seed, `intl-tourney-draw-${id}-${cycleYear}`));
  const seeded = rng.shuffle(nationIds);
  const groupCount = Math.max(1, Math.round(nationIds.length / comp.tournamentGroupSize));
  const groupIdLists = Array.from({ length: groupCount }, () => []);
  seeded.forEach((nid, i) => groupIdLists[i % groupCount].push(nid));
  const maxRounds = Math.max(...groupIdLists.map((g) => g.length - 1));
  const dates = tournamentMatchdayDates(tournamentSeasonStartYear, maxRounds);
  const groups = groupIdLists.map((nationIds_, gi) => ({
    nationIds: nationIds_,
    fixtures: buildGroupFixtures({
      nationIds: nationIds_, dates, doubleLeg: false, neutral: true,
      idPrefix: `intl-${id}-${cycleYear}-tg${gi}`,
      competitionId: id, competitionName: name,
    }),
  }));

  return {
    id, name, cycleYear, tournamentSeasonStartYear,
    phase: "tournament-group", qualifyingGroups: null, qualifyingMatchdayDates: null,
    tournamentGroups: groups, tournamentMatchdayDates: dates,
    knockout: null, championNationId: null,
  };
}

/** Builds one competition's fresh runtime for a cycle — either straight
 * into the tournament phase (Copa América's own no-qualifying rule, or a
 * first-cycle bootstrap — config/intl.js's header) or into a qualifying
 * phase whose groups span every eligible confederation. */
function buildCompetitionRuntime({ comp, cupDef, cycleYear, nations, seed }) {
  const tournamentSeasonStartYear = cycleYear - 1;
  const isBootstrap = comp.bootstrapFirstCycle && cycleYear === cupDef.firstYear;

  if (!comp.hasQualifying || isBootstrap) {
    const pool = comp.confeds.flatMap((c) => rankNationIdsForConfed(nations, c));
    const fieldIds = pool.slice(0, comp.fieldSize);
    return startTournamentPhase({ id: cupDef.id, name: cupDef.name, comp, cycleYear, tournamentSeasonStartYear, nationIds: fieldIds, seed });
  }

  const dates = qualifyingMatchdayDates(comp, tournamentSeasonStartYear);
  const groups = buildQualifyingGroups(comp, nations, seed, cycleYear, cupDef.id, cupDef.name, dates);
  return {
    id: cupDef.id, name: cupDef.name, cycleYear, tournamentSeasonStartYear,
    phase: "qualifying", qualifyingGroups: groups, qualifyingMatchdayDates: dates,
    tournamentGroups: null, tournamentMatchdayDates: null,
    knockout: null, championNationId: null,
  };
}

/** One nation's squad, filtered to the user's own club players — plan1.md's
 * "call-ups generate emails when your players leave". Fired once per squad
 * assembly (a fresh qualifying campaign, or the tournament squad being
 * finalized after qualifying) rather than every individual matchday, so the
 * inbox doesn't get spammed with the same call-up repeated every fixture. */
function callUpEmailsForNations(state, nationIds, competitionName) {
  const emails = [];
  for (const nationId of nationIds) {
    const nation = state.nationsById.get(nationId);
    if (!nation) continue;
    for (const p of nationSquadRoster(state, nationId)) {
      if (p.clubId !== state.club.id) continue;
      emails.push({
        from: `${nation.name.toUpperCase()} FOOTBALL FEDERATION`, to: toField(state.manager.name), cc: "Assistant Manager",
        crest: `crest-${state.club.id}`, date: new Date(state.calendar.today), read: false,
        subject: "International Call-Up",
        body: [
          `Dear Mr. ${surname(state.manager.name)},`,
          `${p.commonName} has been called up to the ${nation.name} squad for the ${competitionName}.`,
          "He will report for international duty and may be unavailable for upcoming club fixtures during the break.",
        ],
      });
    }
  }
  return emails;
}

function announceSquadCallUps(state, runtime) {
  const nationIds = runtime.phase === "qualifying" ? runtime.qualifyingGroups.flatMap((g) => g.nationIds)
    : runtime.phase === "tournament-group" ? runtime.tournamentGroups.flatMap((g) => g.nationIds)
    : runtime.knockout ? runtime.knockout.pending : [];
  const emails = callUpEmailsForNations(state, nationIds, runtime.name);
  if (emails.length) state.inbox.emails.unshift(...emails);
}

/** Builds every competition whose qualifying (or, no-qualifying/bootstrap,
 * tournament) window has already begun by `state.seasonStartYear` — the
 * career-start counterpart to refreshIntlCompetitionsForRollover below
 * (core/store.js's createCareerState calls this once, same footing as
 * engine/comps/continental.js's createInitialContinentalState). */
export function createInitialIntlState(state) {
  const { nations, cups } = state.staticData;
  const competitions = {};
  for (const cupDef of cups.international) {
    const comp = INTL_COMPETITIONS[cupDef.id];
    if (!comp) continue;
    const cycleYear = nextCycleYearOnOrAfter(cupDef.firstYear, cupDef.cycleEvery, state.seasonStartYear + 1);
    const startSeason = competitionStartSeason(comp, cycleYear, cupDef);
    if (startSeason > state.seasonStartYear) continue;
    competitions[cupDef.id] = buildCompetitionRuntime({ comp, cupDef, cycleYear, nations, seed: state.seed });
  }
  const intl = { competitions };
  state.intl = intl;
  for (const runtime of Object.values(competitions)) announceSquadCallUps(state, runtime);
  return intl;
}

/** engine/season.js's July 1 rollover calls this every season — a no-op for
 * any competition whose current cycle is still mid-flight (or hasn't
 * reached its start season yet), and builds a fresh runtime the instant a
 * new cycle's window opens. */
export function refreshIntlCompetitionsForRollover(state, { newSeasonStartYear }) {
  const { nations, cups } = state.staticData;
  state.intl = state.intl || { competitions: {} };
  for (const cupDef of cups.international) {
    const comp = INTL_COMPETITIONS[cupDef.id];
    if (!comp) continue;
    const existing = state.intl.competitions[cupDef.id];
    if (existing && existing.tournamentSeasonStartYear >= newSeasonStartYear) continue;

    const cycleYear = nextCycleYearOnOrAfter(cupDef.firstYear, cupDef.cycleEvery, newSeasonStartYear + 1);
    const startSeason = competitionStartSeason(comp, cycleYear, cupDef);
    if (startSeason > newSeasonStartYear) continue;

    const runtime = buildCompetitionRuntime({ comp, cupDef, cycleYear, nations, seed: state.seed });
    state.intl.competitions[cupDef.id] = runtime;
    announceSquadCallUps(state, runtime);
  }
}

/**
 * Resolves one nation-vs-nation fixture. `skipNationIds`, if given, lets the
 * caller withhold the user's own nation's fixture (M10 checkpoint C: it
 * plays out on the live Match Day ticker instead) — a no-op set otherwise.
 * @returns {boolean} true if the fixture was actually resolved (false if skipped)
 */
function resolveIntlFixture(state, fx, skipNationIds) {
  if (skipNationIds && (skipNationIds.has(fx.homeClubId) || skipNationIds.has(fx.awayClubId))) return false;
  const homeNation = state.nationsById.get(fx.homeClubId);
  const awayNation = state.nationsById.get(fx.awayClubId);
  const homeRoster = nationSquadRoster(state, fx.homeClubId);
  const awayRoster = nationSquadRoster(state, fx.awayClubId);
  const rng = new RngStream(deriveSeed(state.seed, `match-${fx.id}`));
  const result = simulateQuickMatch({ fixture: fx, homeClub: homeNation, awayClub: awayNation, homeRoster, awayRoster, rng, neutral: !!fx.neutral });
  applyMatchResult(state, fx, result);
  return true;
}

function transitionQualifyingToTournament(state, runtime) {
  const comp = INTL_COMPETITIONS[runtime.id];
  const tables = runtime.qualifyingGroups.map((g) => {
    const nationObjs = g.nationIds.map((id) => state.nationsById.get(id));
    return buildLeagueTable({ id: "group" }, nationObjs, g.fixtures, state.results);
  });
  const winners = tables.map((t) => t[0].club.id);
  const runnersUp = tables.filter((t) => t.length > 1).map((t) => t[1]).sort(byPpgThenGdpg);
  const neededExtra = Math.max(0, comp.fieldSize - winners.length);
  const advancers = [...winners, ...runnersUp.slice(0, neededExtra).map((r) => r.club.id)];

  const built = startTournamentPhase({
    id: runtime.id, name: runtime.name, comp, cycleYear: runtime.cycleYear,
    tournamentSeasonStartYear: runtime.tournamentSeasonStartYear, nationIds: advancers, seed: state.seed,
  });
  Object.assign(runtime, built);
  announceSquadCallUps(state, runtime);
}

function transitionTournamentGroupToKnockout(state, runtime) {
  const comp = INTL_COMPETITIONS[runtime.id];
  const advancers = runtime.tournamentGroups.flatMap((g) => {
    const nationObjs = g.nationIds.map((id) => state.nationsById.get(id));
    const table = buildLeagueTable({ id: "group" }, nationObjs, g.fixtures, state.results);
    return table.slice(0, comp.tournamentAdvancePerGroup).map((r) => r.club.id);
  });
  const lastDate = runtime.tournamentMatchdayDates[runtime.tournamentMatchdayDates.length - 1];
  runtime.phase = "tournament-knockout";
  runtime.knockout = buildKnockoutBracket(advancers, nextTournamentKnockoutDate(lastDate));
}

/** Crowns a champion (1 entrant left) or advances to the next round — shared
 * by resolveKnockoutRound (every tie already resolved same-day via
 * quick-sim) and completeUserKnockoutTie below (the round's last outstanding
 * tie was the user's own, just finished on the live Match Day ticker). */
function finalizeRound(runtime, bracket, winners, date) {
  bracket.roundPairings = null;
  bracket.roundWinners = null;
  if (winners.length === 1) {
    bracket.championNationId = winners[0];
    bracket.finished = true;
    runtime.phase = "finished";
    runtime.championNationId = winners[0];
    return;
  }
  bracket.roundIndex += 1;
  bracket.pending = winners;
  bracket.nextRoundDate = nextTournamentKnockoutDate(date);
}

function resolveKnockoutRound(state, runtime, date, skipNationIds) {
  const bracket = runtime.knockout;
  const entrants = bracket.pending;
  if (entrants.length <= 1) {
    bracket.championNationId = entrants[0] ?? null;
    bracket.finished = true;
    runtime.phase = "finished";
    runtime.championNationId = bracket.championNationId;
    return;
  }

  const label = roundLabel(entrants.length, bracket.roundIndex);
  const drawRng = new RngStream(deriveSeed(state.seed, `intl-ko-${runtime.id}-${runtime.cycleYear}-r${bracket.roundIndex}`));
  const shuffled = drawRng.shuffle(entrants);
  const winners = [];
  const pairings = [];

  for (let i = 0; i < shuffled.length; i += 2) {
    const [aId, bId] = drawRng.chance(0.5) ? [shuffled[i], shuffled[i + 1]] : [shuffled[i + 1], shuffled[i]];
    pairings.push({ aId, bId });
    // The user's own tie (M10 checkpoint C): left pending — the pairing is
    // already drawn (so core/store.js's intlFixtureOnDate can find it and
    // open the live Match Day ticker), but the *result* waits for
    // completeUserKnockoutTie, called once that ticker match finishes.
    if (skipNationIds && (skipNationIds.has(aId) || skipNationIds.has(bId))) {
      winners.push(null);
      continue;
    }
    const homeNation = state.nationsById.get(aId);
    const awayNation = state.nationsById.get(bId);
    const homeRoster = nationSquadRoster(state, aId);
    const awayRoster = nationSquadRoster(state, bId);
    const fixtureId = `intl-ko-${runtime.id}-${runtime.cycleYear}-r${bracket.roundIndex}-${aId}-${bId}`;
    const matchRng = new RngStream(deriveSeed(state.seed, `match-${fixtureId}`));

    const result = simulateQuickMatch({
      fixture: { id: fixtureId }, homeClub: homeNation, awayClub: awayNation, homeRoster, awayRoster, rng: matchRng, neutral: true,
    });
    applyMatchResult(state, { id: fixtureId }, result);

    let penalties = null;
    let winnerId;
    if (result.homeGoals !== result.awayGoals) {
      winnerId = result.homeGoals > result.awayGoals ? aId : bId;
    } else {
      const shootout = resolvePenaltyShootout(matchRng, pickBestAvailableXI(homeRoster), pickBestAvailableXI(awayRoster));
      penalties = { home: shootout.home, away: shootout.away };
      winnerId = shootout.winner === "home" ? aId : bId;
    }
    winners.push(winnerId);

    bracket.ties.push({
      id: fixtureId, roundIndex: bracket.roundIndex, roundLabel: label,
      homeNationId: aId, awayNationId: bId,
      homeGoals: result.homeGoals, awayGoals: result.awayGoals,
      penalties, winnerNationId: winnerId, neutral: true, date,
    });
  }

  if (winners.some((w) => w === null)) {
    // Waiting on the user's own tie — persist the draw + partial results so
    // completeUserKnockoutTie can find "which pairing is mine" and finish
    // the round once that ticker match ends.
    bracket.roundLabel = label;
    bracket.roundPairings = pairings;
    bracket.roundWinners = winners;
    return;
  }
  finalizeRound(runtime, bracket, winners, date);
}

/** Called by engine/sim/match.js's finishMatch once the user's own NT
 * knockout tie finishes on the live Match Day ticker (M10 checkpoint C) —
 * the counterpart to resolveKnockoutRound's quick-simmed ties above, same
 * `bracket.ties` shape, same round-finalization rule. */
export function completeUserKnockoutTie(state, { competitionId, homeNationId, awayNationId, winnerNationId, homeGoals, awayGoals, penalties, date }) {
  const runtime = state.intl.competitions[competitionId];
  const bracket = runtime.knockout;
  const idx = bracket.roundPairings.findIndex((p) => p.aId === homeNationId && p.bId === awayNationId);
  bracket.roundWinners[idx] = winnerNationId;

  const fixtureId = `intl-ko-${runtime.id}-${runtime.cycleYear}-r${bracket.roundIndex}-${homeNationId}-${awayNationId}`;
  bracket.ties.push({
    id: fixtureId, roundIndex: bracket.roundIndex, roundLabel: bracket.roundLabel,
    homeNationId, awayNationId, homeGoals, awayGoals, penalties: penalties || null,
    winnerNationId, neutral: true, date,
  });

  if (bracket.roundWinners.every((w) => w != null)) finalizeRound(runtime, bracket, bracket.roundWinners, date);
}

/** Called once per day the calendar sweeps through (engine/sim/worldsim.js),
 * same shape as engine/comps/cup.js's advanceCupsForDate /
 * engine/comps/continental.js's advanceContinentalForDate. `skipNationIds`
 * (M10 checkpoint C) withholds the user's own nation's fixture so
 * core/store.js can open the live Match Day ticker for it instead. */
/**
 * Checks whether every fixture of a group phase's *last* matchday has an
 * actual result yet, and if so transitions to the next phase. Deliberately
 * NOT just "did we reach the last matchday index" — when the user's own
 * fixture on that final matchday is deferred to the live Match Day ticker
 * (skipNationIds), it may still be unplayed at the moment every other
 * group's fixtures resolve. This same check runs again (see
 * checkGroupPhaseCompletion below, called from engine/sim/match.js's
 * finishMatch) once that ticker match actually ends, so the transition
 * never fires on stale/incomplete standings.
 */
function maybeTransitionGroupPhase(state, runtime) {
  if (runtime.phase === "qualifying") {
    const lastDay = toEpochDay(runtime.qualifyingMatchdayDates[runtime.qualifyingMatchdayDates.length - 1]);
    const allDone = runtime.qualifyingGroups.every((g) => g.fixtures.every((f) => toEpochDay(f.date) !== lastDay || state.results.has(f.id)));
    if (allDone) transitionQualifyingToTournament(state, runtime);
  } else if (runtime.phase === "tournament-group") {
    const lastDay = toEpochDay(runtime.tournamentMatchdayDates[runtime.tournamentMatchdayDates.length - 1]);
    const allDone = runtime.tournamentGroups.every((g) => g.fixtures.every((f) => toEpochDay(f.date) !== lastDay || state.results.has(f.id)));
    if (allDone) transitionTournamentGroupToKnockout(state, runtime);
  }
}

/** Called by engine/sim/match.js's finishMatch once the user's own group-
 * phase (qualifying or tournament-group) fixture finishes on the live Match
 * Day ticker — the group-phase counterpart to completeUserKnockoutTie
 * above. A no-op unless that fixture happened to be the deciding one. */
export function checkGroupPhaseCompletion(state, fixture) {
  const runtime = state.intl.competitions[fixture.competitionId];
  if (runtime && (runtime.phase === "qualifying" || runtime.phase === "tournament-group")) {
    maybeTransitionGroupPhase(state, runtime);
  }
}

export function advanceIntlForDate(state, date, skipNationIds = null) {
  if (!state.intl) return;
  const day = toEpochDay(date);
  for (const runtime of Object.values(state.intl.competitions)) {
    if (!runtime || runtime.phase === "finished") continue;

    if (runtime.phase === "qualifying") {
      const idx = runtime.qualifyingMatchdayDates.findIndex((d) => toEpochDay(d) === day);
      if (idx === -1) continue;
      for (const group of runtime.qualifyingGroups) {
        for (const fx of group.fixtures) {
          if (toEpochDay(fx.date) === day) resolveIntlFixture(state, fx, skipNationIds);
        }
      }
      if (idx === runtime.qualifyingMatchdayDates.length - 1) maybeTransitionGroupPhase(state, runtime);
    } else if (runtime.phase === "tournament-group") {
      const idx = runtime.tournamentMatchdayDates.findIndex((d) => toEpochDay(d) === day);
      if (idx === -1) continue;
      for (const group of runtime.tournamentGroups) {
        for (const fx of group.fixtures) {
          if (toEpochDay(fx.date) === day) resolveIntlFixture(state, fx, skipNationIds);
        }
      }
      if (idx === runtime.tournamentMatchdayDates.length - 1) maybeTransitionGroupPhase(state, runtime);
    } else if (runtime.phase === "tournament-knockout") {
      if (toEpochDay(runtime.knockout.nextRoundDate) !== day) continue;
      resolveKnockoutRound(state, runtime, date, skipNationIds);
    }
  }
}

/** The nation-fixture (if any) scheduled for `nationId` on `date`, across
 * every live competition — core/store.js's advance loop uses this to know
 * whether to stop early and open the Match Day ticker for the user's own
 * nation (M10 checkpoint C), same role engine/calendar.js's fixtureOnDate
 * plays for the user's club. */
export function intlFixtureOnDate(state, nationId, date) {
  if (!state.intl) return null;
  const day = toEpochDay(date);
  for (const runtime of Object.values(state.intl.competitions)) {
    if (!runtime) continue;
    if (runtime.phase === "qualifying") {
      for (const group of runtime.qualifyingGroups) {
        if (!group.nationIds.includes(nationId)) continue;
        const fx = group.fixtures.find((f) => toEpochDay(f.date) === day && (f.homeClubId === nationId || f.awayClubId === nationId));
        if (fx) return fx;
      }
    } else if (runtime.phase === "tournament-group") {
      for (const group of runtime.tournamentGroups) {
        if (!group.nationIds.includes(nationId)) continue;
        const fx = group.fixtures.find((f) => toEpochDay(f.date) === day && (f.homeClubId === nationId || f.awayClubId === nationId));
        if (fx) return fx;
      }
    } else if (runtime.phase === "tournament-knockout" && runtime.knockout && !runtime.knockout.finished) {
      const bracket = runtime.knockout;
      if (toEpochDay(bracket.nextRoundDate) !== day) continue;
      // core/store.js's advance loop always runs *today's* simulation
      // (worldsim.js's onEnterDay, which calls resolveKnockoutRound) before
      // checking this stop condition — so by the time we get here, today's
      // pairing has already been drawn (bracket.roundPairings) even though
      // the user's own tie was left unresolved (see resolveKnockoutRound's
      // skipNationIds guard).
      if (!bracket.roundPairings) continue;
      const pairing = bracket.roundPairings.find((p) => p.aId === nationId || p.bId === nationId);
      if (!pairing) continue;
      return {
        id: `intl-ko-${runtime.id}-${runtime.cycleYear}-r${bracket.roundIndex}-${pairing.aId}-${pairing.bId}`,
        isIntl: true, isIntlKnockout: true, competitionId: runtime.id, competitionName: `${runtime.name} — ${bracket.roundLabel}`,
        homeClubId: pairing.aId, awayClubId: pairing.bId, date,
      };
    }
  }
  return null;
}

/** Current cup progress (if any) for `nationId`, across every live
 * competition — used by M10 checkpoint C's Squad screen NATL tile. */
export function findNationCompetitionStatus(state, nationId) {
  if (!state.intl) return null;
  for (const runtime of Object.values(state.intl.competitions)) {
    if (!runtime) continue;
    const involved = runtime.phase === "qualifying" ? runtime.qualifyingGroups.some((g) => g.nationIds.includes(nationId))
      : runtime.phase === "tournament-group" ? runtime.tournamentGroups.some((g) => g.nationIds.includes(nationId))
      : runtime.knockout ? (runtime.knockout.pending.includes(nationId) || runtime.knockout.championNationId === nationId
        || runtime.knockout.ties.some((t) => t.homeNationId === nationId || t.awayNationId === nationId))
      : false;
    if (involved) return runtime;
  }
  return null;
}
