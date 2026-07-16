// dev/balance.js — M4's headless season auto-sim spot-check, extended by M5
// to chain multiple seasons end-to-end (fable-plans/plan1.md Verification
// section: "dev/balance.html: ... 10-season headless auto-sim producing
// distribution reports (league table spreads, transfer volumes, growth
// trajectories) to eyeball balance" — "transfer volumes" waits on M7,
// everything else here is now real). Runs every league + domestic cup +
// growth/retirement/promotion-relegation/rollover through the exact same
// engine functions core/store.js's Advance button drives (M4's
// engine/sim/worldsim.js, M5's engine/season.js) — there's no "user club"
// here (worldsim.js only ever skips *one* club id, which this file sets to
// a sentinel no real club has), so every fixture in every league, and every
// domestic cup tie, resolves through the same statistical path.

import { generateWorld } from "../js/gen/world.js";
import { buildFixtures, buildLeagueTable, eventsOnDate } from "../js/engine/calendar.js";
import { simulateWorldDay } from "../js/engine/sim/worldsim.js";
import { seasonStart } from "../js/config/calendar.js";
import { addDays, toEpochDay } from "../js/core/clock.js";
import { buildCupState } from "../js/engine/comps/cup.js";
import { applyBoardReview, applyMidSeasonGrowth, rolloverSeason } from "../js/engine/season.js";
import { applyCpuContractRenewals } from "../js/engine/contracts.js";
import { runWeeklyTransferActivity } from "../js/engine/transferai.js";

const SEASON_START_YEAR = 2014;
const NO_USER_CLUB = "__none__"; // worldsim.js only skips a fixture involving state.club.id
const DEFAULT_SEASONS = 5; // enough to see clear growth/promotion trends without the page hanging
const YOUNG_COHORT_SAMPLE = 400; // players age<=19 at kickoff, tracked season-over-season

function yieldToUI() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Pearson correlation between final league position (1=best) and average
 * squad prestige — expected notably negative (better position = higher
 * prestige) if the sim is behaving believably. Not a strict pass/fail gate
 * (randomness means upsets happen, per plan1.md's [FOG] factor) — reported
 * as a number for the reader to judge, same spirit as dev/world.html's
 * count tiles. */
function pearson(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxy / Math.sqrt(sxx * syy || 1);
}

/**
 * Builds a headless GameState-shaped object for engine/season.js's
 * functions to run against — everything they read (state.club,
 * state.league, state.manager, state.staticData, state.cups, ...) is
 * present, but `state.club` is the NO_USER_CLUB sentinel so nothing in the
 * simulated world is actually "managed" by anyone: engine/objectives.js's
 * evaluation and engine/jobs.js's market refresh still run every rollover
 * (so a crash there would show up here too) but their outcome is inert —
 * this file only reports on the world, not on a career.
 */
function buildHeadlessState(world, seed) {
  const state = {
    seed,
    seasonStartYear: SEASON_START_YEAR,
    // M6: prestige/baseTransferBudget aren't otherwise meaningful for a
    // sentinel "no one manages this club" — present so engine/season.js's
    // rollover (state.finances, computeWageCeiling) has real numbers to
    // compute against instead of NaN.
    club: { id: NO_USER_CLUB, name: "No Club", shortName: "No Club", boardExpectationTier: "mid-table-safety", prestige: 5, baseTransferBudget: 0 },
    league: { ...world.leagues[0] },
    manager: { name: "Headless Sim", rep: 5, warned: false, sacked: false },
    calendar: { today: seasonStart(SEASON_START_YEAR) },
    players: world.players,
    playersById: new Map(world.players.map((p) => [p.id, p])),
    playersByClub: world.squadsByClub,
    inbox: { emails: [] },
    jobMarket: { vacancies: [] },
    squad: { roster: [] }, // engine/season.js's rollover always refreshes state.squad.roster
    results: new Map(),
    staticData: { leagues: world.leagues, clubs: world.clubs, nations: world.nations, cups: world.cups },
    clubLeague: new Map(world.clubs.map((c) => [c.id, c.leagueId])),
    // M7: no user club means no listings/negotiation ever happen here, but
    // engine/transferai.js's runWeeklyTransferActivity (CPU<->CPU) still
    // needs these fields to exist on any state it's handed.
    transfers: { listings: new Map(), pendingOffers: [], negotiation: null },
    clubTransferBudgets: new Map(),
    news: { transfer: [] },
  };
  state.clubsById = new Map(world.clubs.map((c) => [c.id, c]));
  state.fixtures = buildFixtures({ leagues: world.leagues, clubs: world.clubs, seed, seasonStartYear: state.seasonStartYear });
  state.league.clubs = world.clubs.filter((c) => c.leagueId === state.league.id);
  state.cups = new Map(world.cups.domestic.map((cup) => [
    cup.id, buildCupState({ cup, clubs: world.clubs, leagues: world.leagues, seed, seasonStartYear: state.seasonStartYear }),
  ]));
  return state;
}

/** Advances `state` one full season (today -> next July 1st), running every
 * calendar-day hook engine/season.js exposes — the exact same sequence
 * core/store.js's Store._processCalendarDay drives, just without a Store
 * wrapper (headless, no DOM, no interactive Match Day to resolve since
 * NO_USER_CLUB never has a fixture of its own).
 * @returns {{cupsBeforeRollover: Map, transfersCompleted: number}}
 *   `cupsBeforeRollover` is the cup-brackets Map exactly as it stood
 *   immediately before the rollover call that just fired replaced it with
 *   next season's fresh (round-0) brackets — engine/season.js's
 *   rolloverSeason reassigns `state.cups` outright, so "how did this
 *   season's cups finish" has to be read from this snapshot, not from
 *   `state.cups` after this function returns. `transfersCompleted` is the
 *   season's total CPU<->CPU deals (M7, engine/transferai.js).
 */
async function advanceOneSeason(state, onProgress) {
  const targetDate = seasonStart(state.seasonStartYear + 1);
  let day = state.calendar.today;
  let dayCount = 0;
  let transfersCompleted = 0;
  let cupsBeforeRollover = state.cups;
  while (toEpochDay(day) < toEpochDay(targetDate)) {
    day = addDays(day, 1);
    cupsBeforeRollover = state.cups;
    state.calendar.today = day;
    const events = eventsOnDate(day, state.seasonStartYear);
    if (events.includes("growth")) applyMidSeasonGrowth(state);
    if (events.includes("board-review")) applyBoardReview(state);
    if (events.includes("contract-renewal")) applyCpuContractRenewals(state);
    transfersCompleted += runWeeklyTransferActivity(state, day);
    simulateWorldDay(state, day);
    if (events.includes("season-rollover")) rolloverSeason(state);
    dayCount++;
    if (dayCount % 30 === 0) {
      onProgress(dayCount);
      await yieldToUI();
    }
  }
  return { cupsBeforeRollover, transfersCompleted };
}

async function runMultiSeasonSim({ numSeasons, onProgress }) {
  const seed = Math.floor(Math.random() * 0xffffffff);
  onProgress("Generating world…", 0, 1);
  const world = await generateWorld({ seed, seasonStartYear: SEASON_START_YEAR });

  const state = buildHeadlessState(world, seed);

  const youngCohort = world.players.filter((p) => p.age <= 19).slice(0, YOUNG_COHORT_SAMPLE);
  const overallHistoryById = new Map(youngCohort.map((p) => [p.id, [{ season: SEASON_START_YEAR, overall: p.overall }]]));
  const playerCountHistory = [{ season: SEASON_START_YEAR, count: state.players.length }];
  const englandStaticLeague = new Map(world.clubs.filter((c) => c.leagueId.startsWith("eng-")).map((c) => [c.id, c.leagueId]));
  const movementHistory = [];
  const cupChampionHistory = [];
  const transferVolumeHistory = [];

  for (let s = 0; s < numSeasons; s++) {
    const seasonLabel = `${state.seasonStartYear}/${String(state.seasonStartYear + 1).slice(2)}`;
    const seasonNumber = state.seasonStartYear;
    const { cupsBeforeRollover, transfersCompleted } = await advanceOneSeason(state, (dayCount) => {
      onProgress(`Season ${seasonLabel}… day ${dayCount}`, s * 370 + dayCount, numSeasons * 370);
    });
    transferVolumeHistory.push({ season: seasonNumber, completed: transfersCompleted });

    for (const [id, history] of overallHistoryById) {
      const p = state.playersById.get(id);
      if (p) history.push({ season: state.seasonStartYear, overall: p.overall });
    }
    playerCountHistory.push({ season: state.seasonStartYear, count: state.players.length });

    let moved = 0;
    for (const [clubId, staticLeagueId] of englandStaticLeague) {
      if (state.clubLeague.get(clubId) !== staticLeagueId) moved++;
    }
    movementHistory.push({ season: state.seasonStartYear, movedFromStart: moved });

    const faCup = cupsBeforeRollover.get("eng-fa-cup");
    if (faCup) {
      const champ = state.clubsById.get(faCup.championClubId);
      // Labeled by the season that was just played (captured before
      // advanceOneSeason bumped state.seasonStartYear) — a cup final
      // belongs to the season it was played in, unlike the point-in-time
      // snapshots above (player count/growth), which are meaningfully
      // "as of the Jul 1 that begins the next season".
      cupChampionHistory.push({ season: seasonNumber, champion: champ ? champ.name : "—" });
    }
  }

  return { world, state, overallHistoryById, youngCohort, playerCountHistory, movementHistory, cupChampionHistory, transferVolumeHistory };
}

function renderLeagueTable(league, clubs, fixturesByLeague, results) {
  const table = buildLeagueTable(league, clubs, fixturesByLeague, results);
  const rows = table.map((r) => (
    `<tr><td>${r.position}</td><td>${r.club.name}</td><td class="num">${r.club.prestige}</td>` +
    `<td class="num">${r.pld}</td><td class="num">${r.w}</td><td class="num">${r.d}</td><td class="num">${r.l}</td>` +
    `<td class="num">${r.gf}</td><td class="num">${r.ga}</td><td class="num">${r.gd}</td><td class="num">${r.pts}</td></tr>`
  )).join("");
  return `<table class="tbl"><thead><tr><th>Pos</th><th>Club</th><th>Prestige</th><th>Pld</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderCorrelationSummary(world, state) {
  const rows = world.leagues.map((league) => {
    const clubs = world.clubs.map((c) => ({ ...c, leagueId: state.clubLeague.get(c.id) ?? c.leagueId })).filter((c) => c.leagueId === league.id);
    const table = buildLeagueTable(league, clubs, state.fixtures.byLeague.get(league.id), state.results);
    const positions = table.map((r) => r.position);
    const prestiges = table.map((r) => r.club.prestige);
    const r = pearson(positions, prestiges);
    const half = Math.floor(table.length / 2);
    const topHalfAvg = table.slice(0, half).reduce((s, row) => s + row.club.prestige, 0) / half;
    const botHalfAvg = table.slice(-half).reduce((s, row) => s + row.club.prestige, 0) / half;
    return { league, r, topHalfAvg, botHalfAvg };
  });

  const avgR = rows.reduce((s, x) => s + x.r, 0) / rows.length;
  const believable = rows.filter((x) => x.topHalfAvg > x.botHalfAvg).length;

  const tableRows = rows.map(({ league, r, topHalfAvg, botHalfAvg }) => (
    `<tr><td>${league.country} — ${league.name}</td>` +
    `<td class="num">${topHalfAvg.toFixed(2)}</td><td class="num">${botHalfAvg.toFixed(2)}</td>` +
    `<td class="num ${r < -0.15 ? "ok" : "bad"}">${r.toFixed(2)}</td></tr>`
  )).join("");

  return (
    `<div class="count-tile"><div class="n ${avgR < -0.15 ? "ok" : "bad"}">${avgR.toFixed(2)}</div><div class="l">Avg position/prestige correlation, final season (want notably negative)</div></div>` +
    `<div class="count-tile"><div class="n ${believable === rows.length ? "ok" : "bad"}">${believable}/${rows.length}</div><div class="l">Leagues where top half out-prestiges bottom half</div></div>` +
    `<table class="tbl" style="margin-top:16px"><thead><tr><th>League</th><th>Top-half avg prestige</th><th>Bottom-half avg prestige</th><th>Position↔Prestige r</th></tr></thead><tbody>${tableRows}</tbody></table>`
  );
}

/** Growth trajectory (M5): average overall of the young (age<=19 at
 * kickoff) cohort, season by season — should trend up if
 * engine/growth.js's "play your youngsters" progression is working, and
 * never exceed each player's own potential ceiling. */
function renderGrowthReport(overallHistoryById, youngCohort) {
  const seasons = overallHistoryById.get(youngCohort[0].id).map((h) => h.season);
  const avgOverallBySeason = seasons.map((season) => {
    const vals = [...overallHistoryById.values()].map((h) => h.find((x) => x.season === season)).filter(Boolean).map((x) => x.overall);
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  });
  const potentialsById = new Map(youngCohort.map((p) => [p.id, p.potential]));
  let neverExceedsPotential = true;
  for (const [id, history] of overallHistoryById) {
    const pot = potentialsById.get(id);
    if (history.some((h) => h.overall > pot)) neverExceedsPotential = false;
  }
  const rows = seasons.map((season, i) => `<tr><td>${season}/${String(season + 1).slice(2)}</td><td class="num">${avgOverallBySeason[i].toFixed(2)}</td></tr>`).join("");
  const trendUp = avgOverallBySeason[avgOverallBySeason.length - 1] > avgOverallBySeason[0];
  return (
    `<div class="count-tile"><div class="n ${trendUp ? "ok" : "bad"}">${avgOverallBySeason[0].toFixed(1)} → ${avgOverallBySeason[avgOverallBySeason.length - 1].toFixed(1)}</div><div class="l">Young-cohort (age≤19 at kickoff, n=${youngCohort.length}) avg overall, first → last season</div></div>` +
    `<div class="count-tile"><div class="n ${neverExceedsPotential ? "ok" : "bad"}">${neverExceedsPotential ? "OK" : "VIOLATED"}</div><div class="l">No tracked player's overall ever exceeded their own potential</div></div>` +
    `<table class="tbl" style="margin-top:16px"><thead><tr><th>Season</th><th>Avg overall</th></tr></thead><tbody>${rows}</tbody></table>`
  );
}

/** CPU<->CPU transfer volume per season (M7's own plan1.md line: "Cap volume
 * (~40 completed CPU transfers/window across top leagues, scaled down for
 * minor leagues) for performance and realism" — two windows/season, so a
 * believable season total sits somewhere under the ~80/season theoretical
 * ceiling, comfortably above zero). */
function renderTransferReport(transferVolumeHistory) {
  const rows = transferVolumeHistory.map((h) => `<tr><td>${h.season}/${String(h.season + 1).slice(2)}</td><td class="num">${h.completed}</td></tr>`).join("");
  const avg = transferVolumeHistory.reduce((s, h) => s + h.completed, 0) / transferVolumeHistory.length;
  const believable = avg > 0 && avg <= 80;
  return (
    `<div class="count-tile"><div class="n ${believable ? "ok" : "bad"}">${avg.toFixed(1)}</div><div class="l">Avg completed CPU&lt;-&gt;CPU transfers/season (believable range: 1-80, i.e. up to the ~40/window cap x2 windows)</div></div>` +
    `<table class="tbl" style="margin-top:16px"><thead><tr><th>Season</th><th>Completed CPU&lt;-&gt;CPU transfers</th></tr></thead><tbody>${rows}</tbody></table>`
  );
}

function renderRolloverReport(playerCountHistory, movementHistory, cupChampionHistory) {
  const countRows = playerCountHistory.map((h) => `<tr><td>${h.season}</td><td class="num">${h.count}</td></tr>`).join("");
  const moveRows = movementHistory.map((h) => `<tr><td>${h.season}/${String(h.season + 1).slice(2)}</td><td class="num">${h.movedFromStart}</td></tr>`).join("");
  const champRows = cupChampionHistory.map((h) => `<tr><td>${h.season}/${String(h.season + 1).slice(2)}</td><td>${h.champion}</td></tr>`).join("");
  const stable = playerCountHistory.every((h) => h.count === playerCountHistory[0].count);
  return (
    `<div class="count-tile"><div class="n ${stable ? "ok" : "bad"}">${stable ? "STABLE" : "DRIFTED"}</div><div class="l">World player count across every rollover (retirements 1-for-1 replaced by regens)</div></div>` +
    `<div style="display:flex;gap:24px;flex-wrap:wrap;margin-top:16px">` +
      `<div><h3>Player count</h3><table class="tbl">${countRows}</table></div>` +
      `<div><h3>English pyramid: clubs moved from their starting division (cumulative)</h3><table class="tbl">${moveRows}</table></div>` +
      `<div><h3>F.A. Cup champion by season</h3><table class="tbl">${champRows}</table></div>` +
    `</div>`
  );
}

async function init() {
  const progressEl = document.getElementById("balance-progress");
  const summaryEl = document.getElementById("balance-summary");
  const growthEl = document.getElementById("balance-growth");
  const rolloverEl = document.getElementById("balance-rollover");
  const transfersEl = document.getElementById("balance-transfers");
  const tablesEl = document.getElementById("balance-tables");
  const runBtn = document.getElementById("balance-run");
  const seasonsInput = document.getElementById("balance-seasons");

  async function run() {
    runBtn.disabled = true;
    summaryEl.innerHTML = "";
    growthEl.innerHTML = "";
    rolloverEl.innerHTML = "";
    transfersEl.innerHTML = "";
    tablesEl.innerHTML = "";
    const numSeasons = Math.max(1, Math.min(15, Number(seasonsInput.value) || DEFAULT_SEASONS));
    const { world, state, overallHistoryById, youngCohort, playerCountHistory, movementHistory, cupChampionHistory, transferVolumeHistory } = await runMultiSeasonSim({
      numSeasons,
      onProgress: (label, done, total) => {
        progressEl.textContent = `${label} (${Math.round((done / Math.max(1, total)) * 100)}%)`;
      },
    });
    progressEl.textContent = `Done — ${numSeasons} season(s) simulated (Jul ${SEASON_START_YEAR} → Jul ${state.seasonStartYear}).`;

    summaryEl.className = "counts";
    summaryEl.innerHTML = renderCorrelationSummary(world, state);
    growthEl.className = "counts";
    growthEl.innerHTML = renderGrowthReport(overallHistoryById, youngCohort);
    rolloverEl.innerHTML = renderRolloverReport(playerCountHistory, movementHistory, cupChampionHistory);
    transfersEl.innerHTML = renderTransferReport(transferVolumeHistory);

    // Full standings for the 3 highest-prestige leagues (the ones a reader
    // can eyeball fastest), using the *final* season's effective club->league
    // membership (promotion/relegation may have reshuffled who's in them).
    const effectiveClubs = world.clubs.map((c) => ({ ...c, leagueId: state.clubLeague.get(c.id) ?? c.leagueId }));
    const topLeagues = [...world.leagues].sort((a, b) => (b.prestige[0] + b.prestige[1]) - (a.prestige[0] + a.prestige[1])).slice(0, 3);
    tablesEl.innerHTML = topLeagues.map((league) => {
      const clubs = effectiveClubs.filter((c) => c.leagueId === league.id);
      return `<div class="league-group"><h2>${league.country} — ${league.name} (final season)</h2>${renderLeagueTable(league, clubs, state.fixtures.byLeague.get(league.id), state.results)}</div>`;
    }).join("");

    runBtn.disabled = false;
    window.__balanceResult = { world, state }; // console inspection convenience
  }

  runBtn.addEventListener("click", run);
  run();
}

init().catch((err) => {
  document.getElementById("balance-progress").textContent = `ERROR: ${err.message}`;
  console.error(err);
});
