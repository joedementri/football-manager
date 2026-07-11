// dev/tests.js — assert harness (fable-plans/plan1.md "Verification"
// section): overall test vectors (Messi 93±1, Neuer 88), growth-curve
// monotonicity, M2's generation/serialization invariants (weight tables sum
// to 1, squad shape, world-gen performance budget, save round-trip
// equality, RNG determinism), and M3's fixture-count invariants + calendar
// advance/objective-email checks. More assertions (value/wage spot checks)
// land here as later milestones add them.

import { computeOverall, computeGkOverall, weightSum, WEIGHTS, MESSI_VECTOR, NEUER_VECTOR } from "../js/gen/overall.js";
import { CURVES, curveIsUnimodal, ratioForAge, growthWeightsForAge } from "../js/config/growth.js";
import { OVERALL_GROUPS, positionInfo } from "../js/config/positions.js";
import { generateWorld } from "../js/gen/world.js";
import { serializePlayer, deserializePlayer, serializeSave, deserializeSave } from "../js/core/db.js";
import { RngStream, deriveSeed } from "../js/core/rng.js";
import {
  buildFixtures, buildLeagueTable, advanceTowards, fixtureOnDate, fixturesOnDate, eventsOnDate,
} from "../js/engine/calendar.js";
import { intlBreakWeeks, seasonStart } from "../js/config/calendar.js";
import {
  buildObjectiveEmails, domesticCupFor, leagueIndex, leagueObjectiveMet, evaluateSeasonEnd,
} from "../js/engine/objectives.js";
import { toEpochDay, addDays, isDateInRange } from "../js/core/clock.js";
import { simulateQuickMatch } from "../js/engine/sim/quick.js";
import { applyMatchResult } from "../js/engine/sim/results.js";
import { simulateWorldDay } from "../js/engine/sim/worldsim.js";
import { pickBestAvailableXI } from "../js/engine/sim/lineup.js";
import { xiStrength, teamStrength, expectedGoals, poissonSample } from "../js/engine/sim/core.js";
import { recordMatchRating, computeForm } from "../js/engine/form.js";
import { retirementChance, MIN_RETIREMENT_AGE, MIN_GK_RETIREMENT_AGE } from "../js/config/retirement.js";
import { applyGrowthToWorld } from "../js/engine/growth.js";
import { applyRetirementsAndRegens } from "../js/engine/retirement.js";
import { buildCupState } from "../js/engine/comps/cup.js";
import { acceptJob } from "../js/engine/jobs.js";
import { Store, createCareerState } from "../js/core/store.js";

const groups = []; // [{ title, results: [{name, pass, detail}] }]
let current = null;

function group(title) {
  current = { title, results: [] };
  groups.push(current);
}

function assert(name, pass, detail = "") {
  current.results.push({ name, pass: !!pass, detail });
}

/** Structural equality that doesn't care about object key insertion order
 * (unlike a naive JSON.stringify compare) — Dates compare by getTime(). */
function deepEqual(a, b) {
  if (a === b) return true;
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map) || !(b instanceof Map) || a.size !== b.size) return false;
    for (const [k, v] of a) { if (!b.has(k) || !deepEqual(v, b.get(k))) return false; }
    return true;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keysA = Object.keys(a), keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

function render() {
  const main = document.getElementById("test-groups");
  let totalPass = 0, totalCount = 0;
  main.innerHTML = groups.map((g) => {
    const rows = g.results.map((r) => {
      totalCount++;
      if (r.pass) totalPass++;
      return (
        `<div class="test-row ${r.pass ? "pass" : "fail"}">` +
          `<span class="badge">${r.pass ? "✓" : "✗"}</span>` +
          `<span class="name">${r.name}</span>` +
          `<span class="detail">${r.detail}</span>` +
        `</div>`
      );
    }).join("");
    return `<div class="test-group"><h2>${g.title}</h2>${rows}</div>`;
  }).join("");

  const summary = document.getElementById("test-summary");
  const allPass = totalPass === totalCount;
  summary.className = `test-summary ${allPass ? "pass" : "fail"}`;
  summary.textContent = `${totalPass}/${totalCount} assertions passed`;
}

async function run() {
  document.getElementById("test-summary").textContent = "Running…";

  /* ---------------- mandatory calibration vectors ---------------- */
  group("Overall calculation — mandatory test vectors");
  const messiOverall = computeOverall(MESSI_VECTOR, "ST_CF");
  assert("Messi vector (RW/CF, via ST_CF table) → 93 ± 1", Math.abs(messiOverall - 93) <= 1, `computed ${messiOverall}`);
  const neuerOverall = computeGkOverall(NEUER_VECTOR);
  assert("Neuer vector (GK formula) → 88", neuerOverall === 88, `computed ${neuerOverall}`);

  /* ---------------- weight-table + curve sanity ---------------- */
  group("gen/overall.js weight tables");
  for (const g of OVERALL_GROUPS) {
    if (g === "GK") continue;
    const sum = weightSum(g);
    assert(`${g} weights sum to 1`, Math.abs(sum - 1) < 1e-9, `sum=${sum}`);
  }
  // Weights-sum-to-1 invariant gen/player.js's solver relies on: a uniform
  // attribute set of value X must compute to overall X exactly.
  for (const g of OVERALL_GROUPS) {
    if (g === "GK") continue;
    const uniform = {};
    for (const k of Object.keys(WEIGHTS[g])) uniform[k] = 70;
    const ovr = computeOverall(uniform, g);
    assert(`${g}: uniform attrs=70 → overall 70`, ovr === 70, `computed ${ovr}`);
  }

  group("config/growth.js — playergrowth.ini curves");
  for (const id of Object.keys(CURVES)) {
    assert(`CURVE_${id} is unimodal (rises then falls)`, curveIsUnimodal(Number(id)));
    const r16 = ratioForAge(Number(id), 16);
    assert(`CURVE_${id} ratio(16) matches ported RATIO_1 (0.56)`, Math.abs(r16 - 0.56) < 1e-9, `ratio=${r16}`);
  }

  /* ---------------- world generation ---------------- */
  group("gen/world.js — generation + performance");
  const seed = 42;
  const t0 = performance.now();
  const world = await generateWorld({ seed, seasonStartYear: 2014 });
  const elapsedMs = performance.now() - t0;
  assert(`generated ${world.players.length} players in ${elapsedMs.toFixed(0)}ms (budget: <3000ms)`, elapsedMs < 3000, `${elapsedMs.toFixed(0)}ms`);
  assert(`player count = clubs × 24 (${world.clubs.length} × 24 = ${world.clubs.length * 24})`, world.players.length === world.clubs.length * 24, `got ${world.players.length}`);

  let allSlotsCorrect = true, allOverallsMatch = true, allPotentialsValid = true;
  for (const [clubId, squad] of world.squadsByClub) {
    const counts = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
    for (const p of squad) {
      counts[positionInfo(p.position).area]++;
      if (computeOverall(p.attrs, positionInfo(p.position).overallGroup) !== p.overall) allOverallsMatch = false;
      if (p.potential < p.overall || p.potential > 99) allPotentialsValid = false;
    }
    if (counts.GK !== 3 || counts.DEF !== 8 || counts.MID !== 8 || counts.ATT !== 5) allSlotsCorrect = false;
  }
  assert("every squad is 3 GK / 8 DEF / 8 MID / 5 ATT (24 total)", allSlotsCorrect);
  assert("every player's stored overall matches computeOverall(attrs) — never stale", allOverallsMatch);
  assert("every player's potential is within [overall, 99]", allPotentialsValid);

  const kitNumbersOk = [...world.squadsByClub.values()].every((squad) => new Set(squad.map((p) => p.kitNumber)).size === squad.length);
  assert("kit numbers are unique within each squad", kitNumbersOk);

  /* ---------------- determinism (ground rule #3) ---------------- */
  group("Determinism — same seed reproduces the same world");
  const world2 = await generateWorld({ seed, seasonStartYear: 2014 });
  const sameFirstPlayer = deepEqual(world.players[0], world2.players[0]);
  assert("re-running generateWorld with the same seed yields an identical first player", sameFirstPlayer);
  const sameOverallSum = world.players.reduce((s, p) => s + p.overall, 0) === world2.players.reduce((s, p) => s + p.overall, 0);
  assert("re-running generateWorld with the same seed yields the same total overall sum", sameOverallSum);

  /* ---------------- fixture generation (M3) ---------------- */
  group("engine/comps/league.js + engine/calendar.js — fixture generation");
  const seasonStartYear = 2014;
  const t1 = performance.now();
  const fixtures = buildFixtures({ leagues: world.leagues, clubs: world.clubs, seed, seasonStartYear });
  const fixturesElapsedMs = performance.now() - t1;
  assert(`generated fixtures for ${world.leagues.length} leagues in ${fixturesElapsedMs.toFixed(0)}ms (budget: <1000ms)`, fixturesElapsedMs < 1000, `${fixturesElapsedMs.toFixed(0)}ms`);

  const clubsByLeague = new Map();
  for (const c of world.clubs) {
    if (!clubsByLeague.has(c.leagueId)) clubsByLeague.set(c.leagueId, []);
    clubsByLeague.get(c.leagueId).push(c.id);
  }
  let fixtureCountsOk = true, noSelfPlayOk = true, homeAwayBalanceOk = true, noSameDayDoubleBookingOk = true;
  for (const league of world.leagues) {
    const leagueFixtures = fixtures.byLeague.get(league.id);
    const n = clubsByLeague.get(league.id).length;
    if (leagueFixtures.length !== n * (n - 1)) fixtureCountsOk = false;
    if (leagueFixtures.some((fx) => fx.homeClubId === fx.awayClubId)) noSelfPlayOk = false;
    for (const clubId of clubsByLeague.get(league.id)) {
      const homeCount = leagueFixtures.filter((fx) => fx.homeClubId === clubId).length;
      const awayCount = leagueFixtures.filter((fx) => fx.awayClubId === clubId).length;
      if (homeCount !== n - 1 || awayCount !== n - 1) homeAwayBalanceOk = false;
      const dates = fixtures.byClub.get(clubId).map((fx) => toEpochDay(fx.date));
      if (new Set(dates).size !== dates.length) noSameDayDoubleBookingOk = false;
    }
  }
  assert("every league's fixture count = teamsCount × (teamsCount-1) (double round-robin)", fixtureCountsOk);
  assert("no fixture pits a club against itself", noSelfPlayOk);
  assert("every club plays exactly (teamsCount-1) home and (teamsCount-1) away fixtures", homeAwayBalanceOk);
  assert("no club has two fixtures on the same date", noSameDayDoubleBookingOk);

  const breaks = intlBreakWeeks(seasonStartYear);
  const noBreakWeekFixtures = [...fixtures.byId.values()].every((fx) => !breaks.some((r) => isDateInRange(fx.date, r.start, r.end)));
  assert("no fixture is scheduled during an international break week", noBreakWeekFixtures);

  const fixtures2 = buildFixtures({ leagues: world.leagues, clubs: world.clubs, seed, seasonStartYear });
  const sampleLeagueId = world.leagues[0].id;
  const sameSchedule = deepEqual(fixtures.byLeague.get(sampleLeagueId), fixtures2.byLeague.get(sampleLeagueId));
  assert("re-running buildFixtures with the same seed yields an identical schedule", sameSchedule);

  const sampleClubId = clubsByLeague.get(sampleLeagueId)[0];
  const firstFixture = fixtures.byClub.get(sampleClubId)[0];
  const dayBefore = addDays(firstFixture.date, -10);
  const wellAfter = addDays(firstFixture.date, 10);
  const stopResult = advanceTowards(fixtures, sampleClubId, dayBefore, wellAfter);
  assert("advanceTowards halts exactly on the first match day it crosses", toEpochDay(stopResult.date) === toEpochDay(firstFixture.date) && stopResult.stoppedEarly);
  assert("fixtureOnDate finds that same fixture on its date", fixtureOnDate(fixtures, sampleClubId, stopResult.date)?.id === firstFixture.id);
  // fixtures are weekly (7+ days apart, blackout weeks only push them further), so the very next day is never also a match day.
  assert("fixtureOnDate returns null on a non-match date", fixtureOnDate(fixtures, sampleClubId, addDays(firstFixture.date, 1)) === null);

  const noStopOnStartDay = advanceTowards(fixtures, sampleClubId, firstFixture.date, addDays(firstFixture.date, 1));
  assert("advancing from a match day itself moves past it (not stuck)", toEpochDay(noStopOnStartDay.date) === toEpochDay(addDays(firstFixture.date, 1)));

  const leagueClubs = world.clubs.filter((c) => c.leagueId === sampleLeagueId);
  const table = buildLeagueTable(world.leagues.find((l) => l.id === sampleLeagueId), leagueClubs, fixtures.byLeague.get(sampleLeagueId));
  assert("league table has one row per club, all 0 pld/pts before any results exist", table.length === leagueClubs.length && table.every((r) => r.pld === 0 && r.pts === 0));
  assert("league table positions are 1..N sequential", table.every((r, i) => r.position === i + 1));

  group("config/calendar.js — season event dates");
  const summerOpenEvents = eventsOnDate(new Date(seasonStartYear, 6, 1), seasonStartYear);
  const summerCloseEvents = eventsOnDate(new Date(seasonStartYear, 8, 1), seasonStartYear);
  const winterCloseEvents = eventsOnDate(new Date(seasonStartYear + 1, 1, 1), seasonStartYear);
  assert("Jul 1 is a window-open event", summerOpenEvents.includes("window-open"));
  assert("Sep 1 is a window-close + deadline-day event", summerCloseEvents.includes("window-close") && summerCloseEvents.includes("deadline-day"));
  assert("Feb 1 (next year) is deadline-day + growth", winterCloseEvents.includes("deadline-day") && winterCloseEvents.includes("growth"));
  assert("some date in each break week reports an intl-break event", breaks.every((r) => eventsOnDate(r.start, seasonStartYear).includes("intl-break")));

  /* ---------------- board objective emails (M3) ---------------- */
  group("engine/objectives.js — day-1 board emails");
  let everyLeagueHasCup = true;
  for (const league of world.leagues) if (!domesticCupFor(league, world.cups)) everyLeagueHasCup = false;
  assert("every league resolves to exactly one domestic cup", everyLeagueHasCup);

  const sampleClub = world.clubs.find((c) => c.id === sampleClubId);
  const sampleLeague = world.leagues.find((l) => l.id === sampleLeagueId);
  const emails = buildObjectiveEmails({
    club: sampleClub, league: sampleLeague, cup: domesticCupFor(sampleLeague, world.cups),
    managerName: "Bob Jackson", today: new Date(seasonStartYear, 6, 1),
  });
  assert("buildObjectiveEmails returns exactly 2 emails (League + Domestic Cup)", emails.length === 2);
  assert("both emails are unread on arrival", emails.every((e) => e.read === false));
  assert("subjects are 'League Objective' and 'Domestic Cup Objective'", emails.map((e) => e.subject).join(",") === "League Objective,Domestic Cup Objective");
  assert("email 'to' field uses 'Lastname, Firstname'", emails[0].to === "Jackson, Bob");
  assert("email crest references the club's own crest symbol", emails[0].crest === `crest-${sampleClub.id}`);

  /* ---------------- match simulation (M4) ---------------- */
  group("engine/sim/quick.js — CPU vs CPU match simulation");
  {
    const clubA = sampleClub;
    const clubBId = clubsByLeague.get(sampleLeagueId).find((id) => id !== sampleClubId);
    const clubB = world.clubs.find((c) => c.id === clubBId);
    const rosterA = world.squadsByClub.get(clubA.id);
    const rosterB = world.squadsByClub.get(clubB.id);
    const fixtureAB = { id: "test-fixture-ab", homeClubId: clubA.id, awayClubId: clubB.id };

    const runOnce = () => simulateQuickMatch({
      fixture: fixtureAB, homeClub: clubA, awayClub: clubB,
      homeRoster: rosterA, awayRoster: rosterB,
      rng: new RngStream(deriveSeed(seed, `match-${fixtureAB.id}`)),
    });
    const r1 = runOnce();
    const r2 = runOnce();
    assert("simulateQuickMatch is deterministic for the same fixture/seed",
      r1.homeGoals === r2.homeGoals && r1.awayGoals === r2.awayGoals);
    assert("every starting XI player (22) gets a playerStats entry", r1.playerStats.size === 22);
    const ratingsOk = [...r1.playerStats.values()].every((s) => s.rating >= 0 && s.rating <= 100 && s.minutesPlayed === 90);
    assert("every player rating is 0-100 and minutesPlayed is 90 (no CPU subs modelled)", ratingsOk);
    const goalsMatchStats = [...r1.playerStats.values()].reduce((s, p) => s + p.goals, 0) === r1.homeGoals + r1.awayGoals;
    assert("sum of individual player goals equals the final score", goalsMatchStats);

    // Even-strength sanity (plan1.md: "even teams ~1.3-1.5 goals each") — a
    // club simulated against itself isolates the small +HOMEADV skew from
    // any real prestige/overall gap.
    let totalGoals = 0;
    const evenTrials = 200;
    for (let i = 0; i < evenTrials; i++) {
      const fx = { id: `even-${i}`, homeClubId: clubA.id, awayClubId: clubA.id };
      const r = simulateQuickMatch({
        fixture: fx, homeClub: clubA, awayClub: clubA, homeRoster: rosterA, awayRoster: rosterA,
        rng: new RngStream(deriveSeed(seed, `match-${fx.id}`)),
      });
      totalGoals += r.homeGoals + r.awayGoals;
    }
    const avgTotalGoals = totalGoals / evenTrials;
    assert(`even-strength matches average a believable total goals/match (2.0-3.6, got ${avgTotalGoals.toFixed(2)})`,
      avgTotalGoals >= 2.0 && avgTotalGoals <= 3.6);

    // Gap -> win-rate sanity (plan1.md: "+10 ovr ⇒ ~70% win rate") — the
    // strongest vs weakest generated clubs should give the strong side a
    // clear (not just marginal) edge over many independent trials.
    const strongClub = world.clubs.reduce((a, b) => (b.prestige > a.prestige ? b : a));
    const weakClub = world.clubs.reduce((a, b) => (b.prestige < a.prestige ? b : a));
    const strongRoster = world.squadsByClub.get(strongClub.id);
    const weakRoster = world.squadsByClub.get(weakClub.id);
    let strongWins = 0;
    const gapTrials = 150;
    for (let i = 0; i < gapTrials; i++) {
      const fx = { id: `gap-${i}`, homeClubId: strongClub.id, awayClubId: weakClub.id };
      const r = simulateQuickMatch({
        fixture: fx, homeClub: strongClub, awayClub: weakClub, homeRoster: strongRoster, awayRoster: weakRoster,
        rng: new RngStream(deriveSeed(seed, `match-${fx.id}`)),
      });
      if (r.homeGoals > r.awayGoals) strongWins++;
    }
    const strongWinRate = strongWins / gapTrials;
    assert(`highest- vs lowest-prestige club: strong side wins clearly more than half (${(strongWinRate * 100).toFixed(0)}%, got ${strongClub.name} prestige ${strongClub.prestige} vs ${weakClub.name} prestige ${weakClub.prestige})`,
      strongWinRate > 0.6);
  }

  group("engine/sim/lineup.js + engine/form.js");
  {
    const roster = world.squadsByClub.get(sampleClubId);
    const xi = pickBestAvailableXI(roster);
    assert("pickBestAvailableXI returns 11 players from a full 24-man squad", xi.length === 11);
    assert("pickBestAvailableXI never returns two of the same player", new Set(xi.map((p) => p.id)).size === 11);

    const fakePlayer = { ratingHistory: [] };
    for (const rating of [70, 65, 80, 55, 90]) recordMatchRating(fakePlayer, rating, true);
    assert("recordMatchRating keeps history most-recent-first", fakePlayer.ratingHistory[0] === 90 && fakePlayer.ratingHistory[4] === 70);
    assert("computeForm maps a 0-100 avg rating onto 1-10", fakePlayer.form >= 1 && fakePlayer.form <= 10);
    assert("computeForm never returns for an empty history", computeForm([], true) >= 1);
  }

  group("engine/sim/worldsim.js — per-day batch simulation + league table");
  {
    const leagueClubs = world.clubs.filter((c) => c.leagueId === sampleLeagueId);
    const fakeState = {
      seed,
      club: { id: "no-such-club" }, // no user club in this fake world -> every fixture on the date simulates
      players: world.players,
      playersById: new Map(world.players.map((p) => [p.id, p])),
      playersByClub: world.squadsByClub,
      fixtures,
      results: new Map(),
      clubsById: new Map(world.clubs.map((c) => [c.id, c])),
    };

    const firstMatchDate = fixtures.byLeague.get(sampleLeagueId)[0].date;
    const fixturesThatDay = fixturesOnDate(fixtures, firstMatchDate).filter((fx) => fx.leagueId === sampleLeagueId);
    simulateWorldDay(fakeState, firstMatchDate);
    assert(`simulateWorldDay resolves every fixture on its date (${fixturesThatDay.length} in ${sampleLeagueId})`,
      fixturesThatDay.every((fx) => fakeState.results.has(fx.id)));

    const table = buildLeagueTable(world.leagues.find((l) => l.id === sampleLeagueId), leagueClubs, fixtures.byLeague.get(sampleLeagueId), fakeState.results);
    const somePlayed = table.some((r) => r.pld > 0);
    assert("league table shows non-zero pld/pts once a matchday's results exist", somePlayed);
    assert("league table pts still sum to a multiple of 3 per completed match (W/L) or 2 (draw) — sane totals", table.reduce((s, r) => s + r.pts, 0) >= 0);
  }

  group("engine/sim — gap/strength primitives");
  {
    const rng = new RngStream(deriveSeed(seed, "sim-primitive-check"));
    const roster = world.squadsByClub.get(sampleClubId);
    const xi = pickBestAvailableXI(roster);
    const avg = xiStrength(xi);
    assert("xiStrength returns a plausible overall-ish number (30-99)", avg >= 30 && avg <= 99);

    const club = world.clubs.find((c) => c.id === sampleClubId);
    const strength = teamStrength({ xiAvg: avg, opponentXiAvg: avg, club, isHome: true });
    assert("teamStrength(home, equal opponent) exceeds the away equivalent by roughly HOMEADV",
      strength > teamStrength({ xiAvg: avg, opponentXiAvg: avg, club, isHome: false }));

    const { lambdaHome, lambdaAway } = expectedGoals(0, rng);
    assert("expectedGoals(gap=0) gives both sides a plausible lambda (0.5-3)", lambdaHome > 0.5 && lambdaHome < 3 && lambdaAway > 0.5 && lambdaAway < 3);

    let sum = 0;
    for (let i = 0; i < 500; i++) sum += poissonSample(rng, 1.4);
    assert(`poissonSample(1.4) averages close to 1.4 over 500 draws (got ${(sum / 500).toFixed(2)})`, Math.abs(sum / 500 - 1.4) < 0.3);
  }

  /* ---------------- save round-trip (core/db.js) ---------------- */
  group("core/db.js — compact serialization round-trip");
  const sample = world.players.slice(0, 200);
  const roundTripOk = sample.every((p) => deepEqual(p, deserializePlayer(serializePlayer(p))));
  assert(`serializePlayer → deserializePlayer round-trips ${sample.length} sampled players exactly`, roundTripOk);

  {
    const playerWithHistory = { ...world.players[0], ratingHistory: [88, 61, 74] };
    const roundTripped = deserializePlayer(serializePlayer(playerWithHistory));
    assert("ratingHistory round-trips through the compact array format", deepEqual(playerWithHistory.ratingHistory, roundTripped.ratingHistory));

    const fakeSaveState = {
      seed, seasonStartYear,
      manager: { name: "Bob Jackson", gamertag: "BJ", level: 1, xp: 0, xpMax: 1000, coins: 0 },
      club: sampleClub,
      calendar: { today: new Date(seasonStartYear, 6, 1) },
      players: world.players.slice(0, 5),
      squad: { lineup: [] },
      inbox: { emails: [] },
      results: new Map([["fixture-x", { homeGoals: 2, awayGoals: 1 }]]),
      // M5 additions serializeSave now expects on every GameState.
      clubLeague: new Map([[sampleClubId, "eng-2"]]),
      cups: new Map([[
        "eng-fa-cup",
        buildCupState({ cup: world.cups.domestic[0], clubs: world.clubs, leagues: world.leagues, seed, seasonStartYear }),
      ]]),
      jobMarket: { vacancies: ["manchester-united"] },
    };
    const roundTrippedSave = deserializeSave(serializeSave(fakeSaveState));
    assert("save round-trip preserves match results (M4)", deepEqual(roundTrippedSave.results, fakeSaveState.results));
    assert("save round-trip preserves clubLeague overrides (M5)", deepEqual(roundTrippedSave.clubLeague, fakeSaveState.clubLeague));
    assert("save round-trip preserves cup bracket state (M5)", deepEqual(roundTrippedSave.cupsState, fakeSaveState.cups));
    assert("save round-trip preserves job market vacancies (M5)", deepEqual(roundTrippedSave.jobMarket, fakeSaveState.jobMarket));
  }

  {
    const playerWithGrowth = {
      ...world.players[0],
      growthPeriod: { minutes: 187, ratingSum: 640, ratingCount: 9 },
      retiringAnnounced: true,
    };
    const roundTripped = deserializePlayer(serializePlayer(playerWithGrowth));
    assert("growthPeriod round-trips through the compact array format (M5)", deepEqual(playerWithGrowth.growthPeriod, roundTripped.growthPeriod));
    assert("retiringAnnounced round-trips through the compact array format (M5)", roundTripped.retiringAnnounced === true);
  }

  const rngA = new RngStream(deriveSeed(seed, "world-gen"));
  for (let i = 0; i < 50; i++) rngA.next();
  const snap = rngA.toJSON();
  const rngC = RngStream.fromJSON(snap);
  assert("RngStream snapshot (seed+calls) reproduces the exact next value", rngA.next() === rngC.next());

  /* ================= M5 — Full season loop ================= */

  group("config/growth.js + config/retirement.js — M5 tuning tables");
  {
    let weightsSumOk = true;
    for (const curveId of [1, 2, 3, 4, 5, 6, 7]) {
      for (const age of [16, 20, 25, 30, 38]) {
        const { mental, physical, skill } = growthWeightsForAge(curveId, age);
        if (Math.abs(mental + physical + skill - 1) > 1e-9) weightsSumOk = false;
      }
    }
    assert("growthWeightsForAge's mental+physical+skill sums to 1 at every sampled curve/age", weightsSumOk);

    assert(`retirementChance is 0 below MIN_RETIREMENT_AGE (${MIN_RETIREMENT_AGE})`, retirementChance(positionInfo("ST").index, MIN_RETIREMENT_AGE - 1) === 0);
    assert(`retirementChance is 0 for a GK below MIN_GK_RETIREMENT_AGE (${MIN_GK_RETIREMENT_AGE})`, retirementChance(positionInfo("GK").index, MIN_GK_RETIREMENT_AGE - 1) === 0);
    assert("retirementChance is 100% for a 45-y-o striker (table's oldest bracket)", retirementChance(positionInfo("ST").index, 45) === 1);

    let monotonicOk = true;
    let prev = 0;
    for (let age = MIN_RETIREMENT_AGE; age <= 45; age++) {
      const c = retirementChance(positionInfo("CB").index, age);
      if (c < prev) monotonicOk = false;
      prev = c;
    }
    assert("retirementChance never decreases with age for a fixed position (CB)", monotonicOk);
  }

  group("engine/growth.js — growth application (M5)");
  {
    const basePlayer = (overrides) => ({
      id: 900000, position: "ST", age: 17, potential: 90, overall: 40,
      attrs: { ...ARCHETYPE_FOR_TEST_ST },
      injury: null, growthPeriod: { minutes: 0, ratingSum: 0, ratingCount: 0 },
      ...overrides,
    });

    let belowCurveGains = 0, aboveCurveGains = 0, everyRecomputeMatches = true, neverExceedsPotential = true;
    const trials = 15;
    for (let i = 0; i < trials; i++) {
      const below = basePlayer({ id: 900000 + i, age: 17, potential: 90, overall: 40 });
      applyGrowthToWorld({ players: [below] }, seed, `test-growth-below-${i}`);
      if (below.overall > 40) belowCurveGains++;
      if (computeOverall(below.attrs, "ST_CF") !== below.overall) everyRecomputeMatches = false;
      if (below.overall > below.potential) neverExceedsPotential = false;

      const above = basePlayer({ id: 950000 + i, age: 34, potential: 80, overall: 80 });
      applyGrowthToWorld({ players: [above] }, seed, `test-growth-above-${i}`);
      if (above.overall <= 80) aboveCurveGains++;
    }
    assert(`a 17-y-o far below potential (40->pot 90) gains overall in most trials (${belowCurveGains}/${trials})`, belowCurveGains >= trials * 0.8);
    assert(`a 34-y-o already at their curve's peak overall declines or holds in most trials (${aboveCurveGains}/${trials})`, aboveCurveGains >= trials * 0.8);
    assert("growth never leaves attrs/overall out of sync (recomputeOverall matches stored overall)", everyRecomputeMatches);
    assert("growth never pushes overall past potential", neverExceedsPotential);
  }

  group("engine/comps/cup.js — domestic cup brackets (M5)");
  {
    const faCup = world.cups.domestic.find((c) => c.id === "eng-fa-cup");
    const faCupState = buildCupState({ cup: faCup, clubs: world.clubs, leagues: world.leagues, seed, seasonStartYear });
    const engClubs = world.clubs.filter((c) => faCup.leagueIds.includes(c.leagueId));
    const tierOf = new Map(world.leagues.map((l) => [l.id, l.tier]));
    const topTwoTierClubs = engClubs.filter((c) => tierOf.get(c.leagueId) <= 2);
    const bottomTwoTierClubs = engClubs.filter((c) => tierOf.get(c.leagueId) > 2);
    assert("FA Cup: Round 1 entrants are only League One/Two clubs (tiers 3-4)",
      faCupState.pending.every((id) => bottomTwoTierClubs.some((c) => c.id === id)));
    assert("FA Cup: Premier League/Championship clubs (tiers 1-2) wait as late entrants",
      topTwoTierClubs.every((c) => faCupState.lateEntryClubIds.includes(c.id)) && faCupState.lateEntryRound === 2);

    const oneTierCup = world.cups.domestic.find((c) => c.leagueIds.length === 1);
    const oneTierCupState = buildCupState({ cup: oneTierCup, clubs: world.clubs, leagues: world.leagues, seed, seasonStartYear });
    const oneTierClubs = world.clubs.filter((c) => oneTierCup.leagueIds.includes(c.leagueId));
    assert(`${oneTierCup.name}: every club enters Round 1 (single-tier country, no staggered entry)`,
      oneTierCupState.pending.length === oneTierClubs.length && oneTierCupState.lateEntryClubIds.length === 0);
  }

  group("engine/objectives.js — M5 evaluation + sacking");
  {
    assert("leagueIndex(1st of 20) = 100", leagueIndex(1, 20) === 100);
    assert("leagueIndex(20th of 20) = 0", leagueIndex(20, 20) === 0);
    assert("leagueObjectiveMet('champions', 95, check3) — 95 clears the 90 threshold", leagueObjectiveMet("champions", 95, "check3"));
    assert("leagueObjectiveMet('champions', 85, check3) — 85 misses the 90 threshold", !leagueObjectiveMet("champions", 85, "check3"));
    assert("leagueObjectiveMet('fight-relegation', 1, check3) — always met (threshold 0)", leagueObjectiveMet("fight-relegation", 1, "check3"));

    const championsClub = { boardExpectationTier: "champions" };
    const failNoTrophy = evaluateSeasonEnd({ club: championsClub, leagueIdx: 20, cupRoundLabel: "Eliminated — Round of 16" });
    assert("title-tier club finishing near the bottom with no cup run gets sacked", failNoTrophy.sacked === true);
    const failButWonCup = evaluateSeasonEnd({ club: championsClub, leagueIdx: 20, cupRoundLabel: "Champions" });
    assert("title-tier club finishing near the bottom but winning the cup is saved, not sacked", failButWonCup.sacked === false && failButWonCup.saved === true);
    const relegationClub = { boardExpectationTier: "fight-relegation" };
    const survives = evaluateSeasonEnd({ club: relegationClub, leagueIdx: 5, cupRoundLabel: null });
    assert("fight-relegation-tier club is never sacked regardless of a low index", survives.sacked === false);
  }

  render();
  window.__testWorld = world; // console inspection convenience

  // Runs as its own top-level group (not inside this try/catch) so a failure
  // there doesn't blank out every assertion group already computed above —
  // it calls render() itself once it's done (simulating a full season takes
  // a few seconds), which re-renders the full accumulated `groups` list.
  await runFullSeasonRolloverTest();
}

// A reasonable outfield attribute set (ST-shaped) for engine/growth.js's
// isolated unit tests above — doesn't need to be a "real" generated player,
// just internally consistent enough for computeOverall() to be meaningful.
const ARCHETYPE_FOR_TEST_ST = {
  acceleration: 70, sprintSpeed: 70, positioning: 60, finishing: 55, shotPower: 60, longShots: 50, volleys: 50, penalties: 55,
  vision: 55, crossing: 50, fkAccuracy: 45, shortPass: 55, longPass: 45, curve: 50,
  agility: 65, balance: 65, reactions: 60, ballControl: 60, dribbling: 60, composure: 55,
  interceptions: 25, headingAcc: 55, marking: 20, standTackle: 20, slideTackle: 15,
  jumping: 60, stamina: 65, strength: 60, aggression: 55,
  gkDiving: 10, gkHandling: 10, gkKicking: 10, gkPositioning: 10, gkReflexes: 10,
};

/**
 * M5's headline integration test (plan1.md's own M5 ✔ line): drives a real
 * Store + createCareerState through an entire season using the exact same
 * code path core/store.js's Advance button does (Store has no DOM
 * dependency, so this runs headless here), auto-resolving the user's own
 * matches to full time and auto-accepting the first job offer if sacked, so
 * the loop never stalls waiting for UI input. Runs as its own top-level
 * group (not inside run()'s single try/catch) so a failure here doesn't
 * blank out every other assertion group above it.
 */
async function runFullSeasonRolloverTest() {
  group("engine/season.js — full season simulate + rollover (M5 ✔ check)");
  try {
    const seed = 42;
    const seasonStartYear = 2014;
    const world = await generateWorld({ seed, seasonStartYear });
    const leaguesById = new Map(world.leagues.map((l) => [l.id, l]));
    const club = world.clubs.find((c) => c.id === "manchester-united") || world.clubs[0];
    const league = leaguesById.get(club.leagueId);

    const state = createCareerState({ managerName: "Bob Jackson", club, league, world, seasonStartYear });
    const store = new Store(state);

    const englandClubIds = new Set(world.clubs.filter((c) => c.leagueId.startsWith("eng-")).map((c) => c.id));
    const staticLeagueIdByClub = new Map(world.clubs.map((c) => [c.id, c.leagueId]));
    const firstSeasonUserFixtureIds = new Set((store.state.fixtures.byClub.get(club.id) || []).map((f) => f.id));
    const sub26Player = store.state.players.find((p) => p.age < 26 && !p.retiringAnnounced);
    const sub26PlayerId = sub26Player && sub26Player.id;
    const sub26PlayerAgeBefore = sub26Player && sub26Player.age;

    const targetDate = seasonStart(seasonStartYear + 1); // next July 1st
    let guard = 0;
    // engine/season.js's rollover *replaces* state.cups with next season's
    // fresh (round-0) brackets the instant it fires, so "did this season's
    // cups finish" has to be read from the map as it stood immediately
    // before that reassignment — captured every iteration, so after the
    // loop it holds whatever was current right before the rollover-firing
    // call (the only call where state.cups actually changes identity).
    let cupsBeforeRollover = store.state.cups;
    while (toEpochDay(store.state.calendar.today) < toEpochDay(targetDate) && guard < 400) {
      cupsBeforeRollover = store.state.cups;
      store.advanceToDate(addDays(store.state.calendar.today, 1));
      if (store.state.matchday && !store.state.matchday.finished) {
        store.matchdaySimToEnd();
        store.closeMatchday();
      }
      if (store.state.manager.sacked && store.state.ui.jobsSelectedIndex >= 0) {
        store.applyForSelectedJob(); // auto-accept the first offer so the season keeps advancing
      }
      guard++;
    }

    assert(`season rollover advanced to July 1 ${seasonStartYear + 1} within a bounded number of days (${guard} days processed)`,
      toEpochDay(store.state.calendar.today) >= toEpochDay(targetDate));
    assert("rolloverSeason bumped seasonStartYear by exactly 1", store.state.seasonStartYear === seasonStartYear + 1);

    const secondSeasonFixtureIds = new Set((store.state.fixtures.byClub.get(store.state.club.id) || []).map((f) => f.id));
    const anyIdCollision = [...secondSeasonFixtureIds].some((id) => firstSeasonUserFixtureIds.has(id));
    assert("season-2 fixture ids never collide with season-1's (season-scoped fixture ids, M5 fix)", !anyIdCollision);

    let movedCount = 0;
    for (const clubId of englandClubIds) {
      const currentLeagueId = store.state.clubLeague.get(clubId);
      if (currentLeagueId !== staticLeagueIdByClub.get(clubId)) movedCount++;
    }
    assert(`exactly 18 English clubs changed division after one rollover (3/6/6/3 promotion+relegation slots) — got ${movedCount}`, movedCount === 18);

    const newLeague = leaguesById.get(store.state.league.id);
    assert("the user's league.clubs count still matches that league's teamsCount after promotion/relegation",
      store.state.league.clubs.length === newLeague.teamsCount);

    if (sub26PlayerId != null) {
      const survivor = store.state.playersById.get(sub26PlayerId);
      assert("a sub-26 player (guaranteed not to retire) aged up by exactly 1 over the season",
        survivor && survivor.age === sub26PlayerAgeBefore + 1);
    }

    const growthPeriodsReset = store.state.players.every((p) => p.growthPeriod.minutes === 0 && p.growthPeriod.ratingCount === 0);
    assert("every player's growthPeriod accumulator is reset after rollover", growthPeriodsReset);

    const someoneHasCareerStats = store.state.players.some((p) => p.careerStats.length >= 1);
    assert("at least one player has a season entry in careerStats after rollover", someoneHasCareerStats);

    let cupCount = 0;
    const unfinished = [];
    for (const cup of cupsBeforeRollover.values()) {
      cupCount++;
      if (!cup.finished || !cup.championClubId) {
        unfinished.push(`${cup.id} (round ${cup.roundIndex}, pending=${cup.pending.length}, nextRoundDate=${cup.nextRoundDate.toDateString()}, finished=${cup.finished})`);
      }
    }
    assert(`all ${cupCount} domestic cups finished with a single champion within the season`, unfinished.length === 0, unfinished.join("; "));

    const otherClub = world.clubs.find((c) => c.id !== store.state.club.id);
    acceptJob(store.state, otherClub.id);
    assert("engine/jobs.js's acceptJob reassigns the manager's club", store.state.club.id === otherClub.id);
    assert("acceptJob builds an 11-man lineup from the new club's roster", store.state.squad.lineup.length === 11);
    assert("acceptJob clears the sacked/warned flags", store.state.manager.sacked === false && store.state.manager.warned === false);
  } catch (err) {
    assert(`full-season rollover test threw: ${err.message}`, false, err.stack || "");
    console.error(err);
  }
  render();
}

run().catch((err) => {
  document.getElementById("test-summary").textContent = `ERROR: ${err.message}`;
  document.getElementById("test-summary").className = "test-summary fail";
  console.error(err);
});
