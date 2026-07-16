// engine/season.js — the M5 "Full season loop" orchestrator (fable-plans/
// plan1.md M5): the January board-review hook and the July 1 rollover
// pipeline, both driven by core/store.js's advanceToDate day loop
// (config/calendar.js's `board-review` and `season-rollover` events). Every
// other M5 module (growth, retirement, comps/cup, objectives, awards, jobs)
// does one focused thing in isolation; this file is the one place that
// calls them in the right order and feeds one's output into the next's
// input, so no other module needs to know about the rest.
//
// Rollover order follows plan1.md's own bullet list verbatim: "awards,
// growth application, age++, retirements ..., regens ..., promotion/
// relegation applied, new fixtures, budgets reset, contracts −1yr" — read as
// growth *before* age++ (a player's growth for the season just ending must
// use their *current* age, not next season's), and standings/objectives/
// awards computed from the season that's ending *before* promotion/
// relegation moves anyone or a new schedule overwrites `state.fixtures`.

import { buildFixtures } from "./calendar.js";
import { buildLeagueTable } from "./comps/league.js";
import { buildCupState, cupStatusForClub } from "./comps/cup.js";
import { rebuildContinentalForRollover } from "./comps/continental.js";
import { refreshIntlCompetitionsForRollover } from "./comps/intl.js";
import {
  buildObjectiveEmails, domesticCupFor, leagueIndex, leagueObjectiveMet,
  evaluateSeasonEnd, buildSeasonEndEmail, buildMidSeasonReviewEmail,
} from "./objectives.js";
import { applyGrowthToWorld } from "./growth.js";
import { announceRetirements, applyRetirementsAndRegens } from "./retirement.js";
import { buildSeasonAwardsEmail } from "./awards.js";
import { refreshJobMarket } from "./jobs.js";
import { refreshNtJobMarket } from "./ntjobs.js";
import { computeForm } from "./form.js";
import { recomputeAllValues } from "./value.js";
import { computeWageCeiling } from "./wage.js";
import { buildBosmanApproachEmails, resolveExpiredContracts, buildBosmanDepartureEmailsForUser } from "./contracts.js";
import { resetAllClubBudgets } from "./clubbudget.js";
import { ageUpAcademyRoster } from "./academy.js";

/** clubs.json entries with `.leagueId` overridden by the current-season
 * clubLeague map (M5: promotion/relegation moves clubs between leagues
 * across seasons, but data/clubs.json's own `leagueId` is static — see
 * core/store.js's header for why a separate override map exists). */
function effectiveClubs(staticClubs, clubLeague) {
  return staticClubs.map((c) => ({ ...c, leagueId: clubLeague.get(c.id) ?? c.leagueId }));
}

/** January board-review date: mid-season objective check-in (email either
 * way — reassurance or warning) plus playerretirement.ini's retirement
 * *announcements* (actual retirement/regen waits for the July rollover). */
export function applyBoardReview(state) {
  const league = state.league;
  const fixturesForLeague = state.fixtures.byLeague.get(league.id) || [];
  const table = buildLeagueTable(league, state.league.clubs, fixturesForLeague, state.results);
  const row = table.find((r) => r.club.id === state.club.id);
  const idx = row ? leagueIndex(row.position, state.league.clubs.length) : 50;
  const onTrack = leagueObjectiveMet(state.club.boardExpectationTier, idx, "check1");
  state.manager.warned = !onTrack;
  state.inbox.emails.unshift(buildMidSeasonReviewEmail({
    club: state.club, managerName: state.manager.name, index: idx, onTrack, today: state.calendar.today,
  }));

  announceRetirements(state, state.seed, `retire-announce-${state.seasonStartYear}`);

  // M6 "Bosman: CPU clubs approach your expiring players ... in Jan" — a
  // flavour email per user-squad player whose contract lapses this season;
  // the actual departure (if the user never renews) lands at the July
  // rollover via resolveExpiredContracts below.
  state.inbox.emails.unshift(...buildBosmanApproachEmails(state));
}

/** February 1 mid-season growth application (config/calendar.js's
 * growthDays()[0]) — the July 1 application is folded into rolloverSeason
 * below instead, since plan1.md's bullet order needs it to run before age++.
 * M6: value is recomputed for the whole world right after (overall/potential
 * just changed) — see engine/value.js's header on why wage is never touched
 * here the same way. */
export function applyMidSeasonGrowth(state) {
  applyGrowthToWorld(state, state.seed, `growth-${state.seasonStartYear}-02-01`);
  recomputeAllValues(state);
}

/** The full July 1 season-rollover pipeline. */
export function rolloverSeason(state) {
  const { leagues, clubs, nations, cups } = state.staticData;
  const leaguesById = new Map(leagues.map((l) => [l.id, l]));
  const nationsById = new Map(nations.map((n) => [n.id, n]));
  const nationsByName = new Map(nations.map((n) => [n.name, n]));

  const clubsThisSeason = effectiveClubs(clubs, state.clubLeague);
  const clubsByIdThisSeason = new Map(clubsThisSeason.map((c) => [c.id, c]));

  /* ---- 1. Final standings for every league, before anything moves ---- */
  const positionByClub = new Map();
  const tableByLeague = new Map();
  for (const league of leagues) {
    const leagueClubs = clubsThisSeason.filter((c) => c.leagueId === league.id);
    const fixturesForLeague = state.fixtures.byLeague.get(league.id) || [];
    const table = buildLeagueTable(league, leagueClubs, fixturesForLeague, state.results);
    tableByLeague.set(league.id, table);
    for (const row of table) positionByClub.set(row.club.id, { position: row.position, numClubs: leagueClubs.length });
  }

  /* ---- 2. Domestic cup outcomes (this season's state.cups is finished by
   *      now — cup rounds run Aug-~Feb, long before the July rollover) ---- */
  const userLeague = leaguesById.get(state.league.id);
  const userCup = domesticCupFor(userLeague, cups);
  const userCupRuntime = userCup ? state.cups.get(userCup.id) : null;
  const userCupStatus = userCupRuntime ? cupStatusForClub(userCupRuntime, state.club.id) : { roundLabel: null };

  /* ---- 3. Objectives evaluation + awards (user's league/cup only — same
   *      scope as what the user actually sees on the Season screen) ---- */
  const userPos = positionByClub.get(state.club.id);
  const userLeagueIdx = userPos ? leagueIndex(userPos.position, userPos.numClubs) : 50;
  const verdict = evaluateSeasonEnd({ club: state.club, leagueIdx: userLeagueIdx, cupRoundLabel: userCupStatus.roundLabel });
  state.manager.rep = Math.min(20, Math.max(1, state.manager.rep + verdict.repDelta));
  state.inbox.emails.unshift(buildSeasonEndEmail({ club: state.club, managerName: state.manager.name, verdict, today: state.calendar.today }));

  const userLeagueClubIds = new Set(clubsThisSeason.filter((c) => c.leagueId === state.league.id).map((c) => c.id));
  const userLeaguePlayers = state.players.filter((p) => userLeagueClubIds.has(p.clubId));
  const cupChampionName = userCupRuntime?.championClubId ? clubsByIdThisSeason.get(userCupRuntime.championClubId)?.name : null;
  state.inbox.emails.unshift(buildSeasonAwardsEmail({
    league: userLeague, table: tableByLeague.get(userLeague.id), leaguePlayers: userLeaguePlayers,
    cupName: userCup?.name || null, cupChampionName, managerClub: state.club, managerName: state.manager.name, today: state.calendar.today,
  }));

  const sackedClubId = verdict.sacked ? state.club.id : null;
  if (verdict.sacked) state.manager.sacked = true;

  /* ---- 4. Job market refresh (CPU sackings + the user's own vacancy) ---- */
  refreshJobMarket(state, { positionByClub, seed: state.seed, seasonStartYear: state.seasonStartYear, sackedClubId });
  // M10: the NT job market — a no-op below the reputation threshold (see
  // engine/ntjobs.js's own header).
  refreshNtJobMarket(state, { seed: state.seed, seasonStartYear: state.seasonStartYear });

  /* ---- 5. Growth application (before age++, per plan1.md's bullet order) ---- */
  applyGrowthToWorld(state, state.seed, `growth-${state.seasonStartYear}-07-01`);

  /* ---- 6. Age up ---- */
  for (const p of state.players) p.age += 1;
  // M9: state.academy.roster lives outside state.players (see
  // engine/academy.js's header) — aged up here too so a youth prospect
  // discovered at 15 eventually reaches MIN_PROMOTION_AGE.
  ageUpAcademyRoster(state);

  // M6: value recomputed once growth + age-up have both landed for the
  // season that's ending (engine/value.js's header explains why wage isn't
  // touched the same way — it only ever changes via a real contract event).
  recomputeAllValues(state);

  /* ---- 7. Retirements + regens (announced back in January) ---- */
  applyRetirementsAndRegens(state, {
    clubsById: clubsByIdThisSeason, leaguesById, nationsById, nationsByName,
    seed: state.seed, seasonStartYear: state.seasonStartYear + 1,
  });

  /* ---- 8. Promotion / relegation (data/leagues.json's promotion/relegation
   *      slots — see engine/season.js's header for why this reads the
   *      pre-move standings computed in step 1) ---- */
  for (const league of leagues) {
    const table = tableByLeague.get(league.id);
    if (league.promotion) {
      for (const row of table.slice(0, league.promotion.slots)) state.clubLeague.set(row.club.id, league.promotion.to);
    }
    if (league.relegation) {
      for (const row of table.slice(-league.relegation.slots)) state.clubLeague.set(row.club.id, league.relegation.to);
    }
  }

  /* ---- 9. Season stats -> career history, form/growth-period reset ---- */
  for (const p of state.players) {
    p.careerStats.push({ season: state.seasonStartYear, ...p.seasonStats });
    p.seasonStats = { apps: 0, goals: 0, assists: 0, cleanSheets: 0, avgRating: 0, yellows: 0, reds: 0 };
    p.ratingHistory = [];
    p.form = computeForm([], p.clubId === state.club.id);
    p.growthPeriod = { minutes: 0, ratingSum: 0, ratingCount: 0 };
  }

  /* ---- 10. Bump the season; the user's own club may have changed division ---- */
  const newSeasonStartYear = state.seasonStartYear + 1;
  state.seasonStartYear = newSeasonStartYear;
  const newUserLeagueId = state.clubLeague.get(state.club.id);
  if (newUserLeagueId && newUserLeagueId !== state.league.id) state.league = leaguesById.get(newUserLeagueId);

  /* ---- 11. New fixtures + cup brackets for the new season ---- */
  const clubsNextSeason = effectiveClubs(clubs, state.clubLeague);
  state.fixtures = buildFixtures({ leagues, clubs: clubsNextSeason, seed: state.seed, seasonStartYear: state.seasonStartYear });
  state.cups = new Map(cups.domestic.map((cup) => [
    cup.id, buildCupState({ cup, clubs: clubsNextSeason, leagues, seed: state.seed, seasonStartYear: state.seasonStartYear }),
  ]));
  // M10: continental clubs (Champions Cup/Trophy/South American Cup) —
  // qualification is seeded from *this* season's clubs/table (clubsThisSeason,
  // tableByLeague, both still in scope from step 1 above), same "earned by
  // the table you actually played in" rationale as engine/comps/
  // continental.js's own header, then the fresh competition instances
  // themselves are dated for the *upcoming* season.
  rebuildContinentalForRollover(state, {
    clubsThisSeason, leagues, nations, tableByLeague, newSeasonStartYear,
  });
  // M10: internationals — a no-op most seasons (see engine/comps/intl.js's
  // own header); builds whichever competitions' qualifying/tournament
  // window opens this exact season.
  refreshIntlCompetitionsForRollover(state, { newSeasonStartYear });

  state.clubsById = new Map(clubsNextSeason.map((c) => [c.id, c]));
  state.league.clubs = clubsNextSeason.filter((c) => c.leagueId === state.league.id);
  state.league.table = buildLeagueTable(state.league, state.league.clubs, state.fixtures.byLeague.get(state.league.id), state.results);

  /* ---- 12. Budgets reset + contracts "-1yr" (M6, plan1.md's own rollover
   *      bullet order: "new fixtures, budgets reset, contracts -1yr"). The
   *      real CPU renewal AI already ran back in May (engine/contracts.js's
   *      applyCpuContractRenewals, config/calendar.js's
   *      cpuContractRenewalDate) — resolveExpiredContracts here is the
   *      safety net for anyone still expired, chiefly the user's own
   *      unrenewed players ("a CPU club signs your Bosman if ignored"). ---- */
  state.finances = { transferBudget: state.club.baseTransferBudget, wageCeiling: computeWageCeiling(state.club, state.league) };
  // M7: every CPU club's own transfer budget resets alongside the user's own
  // (same "budgets reset" rollover bullet) — resetAllClubBudgets just clears
  // the map, so the next getClubBudget() call for any club lazily reseeds
  // from baseTransferBudget rather than carrying last season's spend forward.
  resetAllClubBudgets(state);
  const bosmanDepartures = resolveExpiredContracts(state);
  state.inbox.emails.unshift(...buildBosmanDepartureEmailsForUser(state, bosmanDepartures, clubsByIdThisSeason));

  /* ---- 13. New-season board objective emails ---- */
  const newCup = domesticCupFor(state.league, cups);
  state.inbox.emails.unshift(...buildObjectiveEmails({
    club: state.club, league: state.league, cup: newCup, managerName: state.manager.name, today: state.calendar.today,
  }));
  state.manager.warned = false;

  /* ---- 14. Rebuild player indices (retirements/regens/Bosman moves changed state.players) ---- */
  state.playersById = new Map(state.players.map((p) => [p.id, p]));
  state.playersByClub = new Map();
  for (const p of state.players) {
    if (!state.playersByClub.has(p.clubId)) state.playersByClub.set(p.clubId, []);
    state.playersByClub.get(p.clubId).push(p);
  }
  state.squad.roster = (state.playersByClub.get(state.club.id) || []).slice().sort((a, b) => b.overall - a.overall);
}
