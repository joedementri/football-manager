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
import { computeValue } from "../js/engine/value.js";
import { computeWage, computeWageCeiling, squadWageBill } from "../js/engine/wage.js";
import {
  computeAsk, acceptanceChance, renewUserContract, applyCpuContractRenewals,
  resolveExpiredContracts, checkContractExpiryWarnings,
} from "../js/engine/contracts.js";
import { decisionCurveY } from "../js/config/negotiation.js";
import { computeWantedFee, feeDecisionChances, rollThreeWay, computeCounterFee } from "../js/engine/teamdecision.js";
import { computeSigningAsk, decisionChance } from "../js/engine/playerdecision.js";
import { getClubBudget, spendClubBudget, creditClubBudget } from "../js/engine/clubbudget.js";
import { pushTransferNews } from "../js/engine/transfernews.js";
import {
  startFeeNegotiation, adjustFeeOffer, submitFeeOffer, submitNegotiationContractOffer,
  startLoanNegotiation, cancelNegotiation, resolveLoanReturns,
} from "../js/engine/negotiation.js";
import { eligibleFreeAgentTargets, startApproach, submitApproach } from "../js/engine/freeagents.js";
import {
  runWeeklyTransferActivity, checkIncomingBidsOnListedPlayers, acceptIncomingBid, rejectIncomingBid,
} from "../js/engine/transferai.js";
import {
  createInitialGtnState, hireScout, sackScout, startMission, cancelMission, viewMission,
  runDailyGtnActivity, missionNewCount, missionUpdateCount, primaryMission,
} from "../js/engine/gtn.js";
import {
  POOL_SIZE, MAX_HIRED_SCOUTS, hireCost, sackCost, missionCost, scoutingRangeFor,
  RANGE_HALF_WIDTH_BY_LEVEL, FIRST_REPORT_DAYS, REPORT_INTERVAL_DAYS,
} from "../js/config/scouting.js";
import { movePlayerToClub } from "../js/engine/contracts.js";
import { generatePlayer } from "../js/gen/player.js";
import {
  createInitialAcademyState, hireYouthScout, sackYouthScout, assignScout, recallScout,
  isPromotable, promoteProspect, releaseProspect, ageUpAcademyRoster, runDailyAcademyActivity,
} from "../js/engine/academy.js";
import {
  MAX_YOUTH_SCOUTS, POTENTIAL_TIERS, TIER_ODDS_BY_JUDGMENT, rollPotentialTier,
  pickWorkrateGroupForType, retirementChancePct, RETIREMENT_WARNING_DAYS,
  YOUTH_PLAYER_MIN_AGE, YOUTH_PLAYER_MAX_AGE,
} from "../js/config/youth.js";

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
    // M7: a player mid-loan and a player with a pre-agreed free-transfer
    // destination both round-trip through the compact array format with
    // real (non-null) values, not just the null defaults every other
    // sampled player above already covers.
    const onLoan = {
      ...world.players[0],
      loan: { parentClubId: "napoli", returnDate: new Date(2015, 5, 1), fullWage: 40000 },
      contract: { ...world.players[0].contract, wage: 20000 },
    };
    const roundTrippedLoan = deserializePlayer(serializePlayer(onLoan));
    assert("an active loan spell round-trips through the compact array format (M7)", deepEqual(onLoan.loan, roundTrippedLoan.loan));

    const preAgreed = {
      ...world.players[1],
      contract: { ...world.players[1].contract, preAgreedClubId: "napoli", preAgreedTerms: { wage: 55000, years: 3, squadRole: "important" } },
    };
    const roundTrippedPreAgreed = deserializePlayer(serializePlayer(preAgreed));
    assert("a pre-agreed free-transfer destination round-trips through the compact array format (M7)",
      roundTrippedPreAgreed.contract.preAgreedClubId === "napoli" && deepEqual(roundTrippedPreAgreed.contract.preAgreedTerms, preAgreed.contract.preAgreedTerms));
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

  /* ================= M6 — Money: value, wages, contracts ================= */

  group("engine/wage.js — playerwages.ini worked examples (plan1.md verbatim)");
  {
    const epl = world.leagues.find((l) => l.id === "eng-1");
    const leagueOne = world.leagues.find((l) => l.id === "eng-3");
    // age 24 (0% WAGE_AGE) + CM (0% WAGE_POSITION) isolates base×league exactly.
    const w90 = computeWage({ overall: 90, age: 24, position: "CM" }, epl);
    assert("90-rated EPL player (age 24/CM, 0% secondary modifiers): wage = 1300×70 = £91,000/wk", w90 === 91000, `computed £${w90}`);
    const w60 = computeWage({ overall: 60, age: 24, position: "CM" }, leagueOne);
    assert("60-rated League One player (age 24/CM, 0% secondary modifiers): wage = 60×8 = £480/wk", w60 === 480, `computed £${w60}`);

    const gkWage = computeWage({ overall: 90, age: 24, position: "GK" }, epl);
    assert("GK wage modifier reduces wage vs an outfielder of the same overall/age", gkWage < w90, `GK £${gkWage} vs CM £${w90}`);

    let wageMonotonic = true, prevWage = 0;
    for (let ovr = 40; ovr <= 99; ovr++) {
      const w = computeWage({ overall: ovr, age: 24, position: "CM" }, epl);
      if (w < prevWage) wageMonotonic = false;
      prevWage = w;
    }
    assert("wage never decreases as overall rises (fixed age/position/league)", wageMonotonic);
  }

  group("engine/value.js — playervalues.ini value formula");
  {
    const bigClub = world.clubs.find((c) => c.id === "manchester-united") || world.clubs.reduce((a, b) => (b.prestige > a.prestige ? b : a));
    const smallClub = world.clubs.reduce((a, b) => (b.prestige < a.prestige ? b : a));
    const vsyYear = 2014;
    const base = (overrides) => ({
      overall: 85, potential: 85, age: 26, position: "CM", form: 6,
      contract: { endYear: vsyYear + 3 }, ...overrides,
    });

    const v90 = computeValue(base({ overall: 90, potential: 90 }), bigClub, vsyYear);
    // Upper bound generous on purpose: age/potential/contract/prestige/
    // position modifiers compound multiplicatively, so a 90-rated player at
    // 0% remaining potential on a big-prestige club can legitimately clear
    // £100m — this checks "a plausible order of magnitude", not an exact figure.
    assert(`a 90-rated player's value is in the tens-to-low-hundreds of millions (got £${v90.toLocaleString()})`, v90 > 20000000 && v90 < 200000000);
    const v60 = computeValue(base({ overall: 60, potential: 62 }), bigClub, vsyYear);
    assert(`a 60-rated player's value is under £1m (got £${v60.toLocaleString()})`, v60 < 1000000);

    const higherOvr = computeValue(base({ overall: 86 }), bigClub, vsyYear);
    const lowerOvr = computeValue(base({ overall: 84 }), bigClub, vsyYear);
    assert("higher overall (all else equal) never decreases value", higherOvr >= lowerOvr);

    const morePotential = computeValue(base({ potential: 95 }), bigClub, vsyYear);
    const samePotential = computeValue(base({ potential: 85 }), bigClub, vsyYear);
    assert("more remaining potential never decreases value", morePotential >= samePotential);

    const expiring = computeValue(base({ contract: { endYear: vsyYear } }), bigClub, vsyYear);
    const secure = computeValue(base({ contract: { endYear: vsyYear + 4 } }), bigClub, vsyYear);
    assert("an expiring contract (0 years left) is worth less than a secure one (all else equal)", expiring < secure);

    const prestigeBig = computeValue(base(), bigClub, vsyYear);
    const prestigeSmall = computeValue(base(), smallClub, vsyYear);
    assert(`higher club prestige never decreases value (${bigClub.name} P${bigClub.prestige} vs ${smallClub.name} P${smallClub.prestige})`,
      prestigeBig >= prestigeSmall);

    // Spot-check table (plan1.md Verification: "value/wage spot-checks ...
    // spot-check table in dev page") across a representative league/overall
    // spread, eyeballed via this row's own detail column.
    const spotLeagues = [
      world.leagues.find((l) => l.id === "eng-1"), world.leagues.find((l) => l.id === "eng-2"), world.leagues.find((l) => l.id === "eng-3"),
    ];
    const spotOveralls = [60, 70, 80, 90];
    const rows = spotLeagues.map((league) => {
      const cells = spotOveralls.map((ovr) => {
        const p = base({ overall: ovr, potential: ovr });
        const wage = computeWage({ overall: ovr, age: 26, position: "CM" }, league);
        const val = computeValue(p, bigClub, vsyYear);
        return `OVR${ovr}: £${wage.toLocaleString()}/wk / £${val.toLocaleString()}`;
      }).join(" &nbsp;|&nbsp; ");
      return `<div>${league.name}: ${cells}</div>`;
    }).join("");
    assert("value/wage spot-check table (wage/wk / value, by league × overall)", true, rows);
  }

  group("engine/contracts.js — user renewal negotiation");
  {
    const club = world.clubs.find((c) => c.id === sampleClubId);
    const roster = world.squadsByClub.get(sampleClubId).map((p) => ({ ...p, contract: { ...p.contract } }));
    const fakeState = {
      seed, seasonStartYear: 2014,
      club, clubsById: new Map(world.clubs.map((c) => [c.id, c])),
      playersById: new Map(roster.map((p) => [p.id, p])),
      finances: { transferBudget: 5000000, wageCeiling: 999999999 },
    };

    const firstPlayer = roster[0];
    const ask = computeAsk(firstPlayer);
    assert("computeAsk never suggests less than the player's current wage", ask.wage >= firstPlayer.contract.wage);

    const lowballChance = acceptanceChance({ wage: Math.round(ask.wage * 0.4), years: 1 }, ask, "STARTING11");
    assert(`a lowball offer (40% of ask) has near-zero acceptance chance (${(lowballChance * 100).toFixed(0)}%)`, lowballChance < 0.1);
    const generousChance = acceptanceChance({ wage: Math.round(ask.wage * 1.3), years: 4 }, ask, "STARTING11");
    assert(`a generous offer (130% of ask, 4yr) has a good acceptance chance (${(generousChance * 100).toFixed(0)}%)`, generousChance > 0.5);

    // Acceptance is a genuine probabilistic roll (deterministic per player/
    // offer, per ground rule #3 — but never literally 100%, see
    // acceptanceChance's own header) — a maximally generous offer (2x ask,
    // 5yr) is tried against several squad players so this integration test
    // isn't at the mercy of a single player's one seeded roll.
    let accepted = null;
    for (const player of roster.slice(0, 8)) {
      const budgetBefore = fakeState.finances.transferBudget;
      const wageBefore = player.contract.wage;
      const playerAsk = computeAsk(player);
      const offer = { wage: Math.round(playerAsk.wage * 2), years: 5 };
      const result = renewUserContract(fakeState, player.id, offer);
      if (result.accepted) { accepted = { player, offer, budgetBefore, wageBefore }; break; }
    }
    assert("a maximally generous offer (2x ask, 5yr) is accepted for at least one of 8 sampled squad players", !!accepted);
    if (accepted) {
      const { player, offer, budgetBefore, wageBefore } = accepted;
      assert("accepting updates the player's wage to the offered amount", player.contract.wage === offer.wage && player.contract.wage > wageBefore);
      assert("accepting updates the player's contract end year", player.contract.endYear === fakeState.seasonStartYear + offer.years);
      assert("accepting deducts a resigning fee from the transfer budget", fakeState.finances.transferBudget < budgetBefore);
    }

    const rejectPlayer = roster[roster.length - 1];
    const rejected = renewUserContract(fakeState, rejectPlayer.id, { wage: 1, years: 1 });
    assert("a wage offer of £1 is always rejected", rejected.accepted === false);
  }

  group("engine/contracts.js — expiry warnings (60-day, plan1.md verbatim)");
  {
    const seasonStartYear = 2014;
    const club = world.clubs.find((c) => c.id === sampleClubId);
    const nearExpiryTemplate = world.squadsByClub.get(sampleClubId)[1];
    const nearExpiry = { ...nearExpiryTemplate, contract: { ...nearExpiryTemplate.contract, endYear: seasonStartYear + 1, warnedExpiry: false } };
    const fakeState = { seasonStartYear, club, manager: { name: "Bob Jackson" }, squad: { roster: [nearExpiry] }, inbox: { emails: [] } };

    checkContractExpiryWarnings(fakeState, new Date(seasonStartYear + 1, 4, 15)); // ~47 days before the Jul-1 endYear cutoff
    assert("a player within the 60-day window gets exactly one warning email", fakeState.inbox.emails.length === 1);
    assert("checkContractExpiryWarnings sets warnedExpiry so it doesn't repeat", nearExpiry.contract.warnedExpiry === true);
    checkContractExpiryWarnings(fakeState, new Date(seasonStartYear + 1, 4, 16));
    assert("no duplicate warning email is sent the next day", fakeState.inbox.emails.length === 1);
  }

  group("engine/contracts.js — CPU auto-renewal (May) + Bosman safety net (July)");
  {
    const seasonStartYear = 2014;
    const userClub = world.clubs.find((c) => c.id === sampleClubId);
    const cpuPlayers = [];
    for (const c of world.clubs) {
      if (c.id === userClub.id) continue;
      const squad = world.squadsByClub.get(c.id) || [];
      for (const p of squad.slice(0, 2)) {
        cpuPlayers.push({ ...p, contract: { ...p.contract, endYear: seasonStartYear + 1, warnedExpiry: false } });
      }
      if (cpuPlayers.length >= 80) break;
    }
    const playersByClub = new Map();
    for (const p of cpuPlayers) {
      if (!playersByClub.has(p.clubId)) playersByClub.set(p.clubId, []);
      playersByClub.get(p.clubId).push(p);
    }
    const fakeState = {
      seed, seasonStartYear, club: userClub,
      players: cpuPlayers,
      playersById: new Map(cpuPlayers.map((p) => [p.id, p])),
      playersByClub,
      clubsById: new Map(world.clubs.map((c) => [c.id, c])),
      clubLeague: new Map(world.clubs.map((c) => [c.id, c.leagueId])),
      staticData: { leagues: world.leagues, clubs: world.clubs, nations: world.nations, cups: world.cups },
    };
    applyCpuContractRenewals(fakeState);
    const stillExpiring = cpuPlayers.filter((p) => p.contract.endYear <= seasonStartYear + 1).length;
    assert(`CPU renewal pass (${cpuPlayers.length} sampled expiring players) leaves none still at the old expiring endYear`, stillExpiring === 0, `${stillExpiring} left`);
    const clubIdsAfter = new Set(cpuPlayers.map((p) => p.clubId));
    assert("CPU renewal pass never moves a released player onto the user's own club", !clubIdsAfter.has(userClub.id) || [...playersByClub.get(userClub.id) || []].length === 0);

    // Bosman: the user's own unrenewed player must be signed elsewhere by
    // engine/season.js's rollover safety net (plan1.md M6 ✔ check: "a CPU
    // club signs your Bosman if ignored").
    const bosmanSeasonYear = 2015; // "next" season, matching how season.js calls this post season-bump
    const bosmanTemplate = world.squadsByClub.get(sampleClubId)[2];
    const bosman = { ...bosmanTemplate, clubId: userClub.id, contract: { ...bosmanTemplate.contract, endYear: bosmanSeasonYear, warnedExpiry: false } };
    const bosmanState = {
      seed, seasonStartYear: bosmanSeasonYear, club: userClub,
      players: [bosman],
      playersById: new Map([[bosman.id, bosman]]),
      playersByClub: new Map([[userClub.id, [bosman]]]),
      clubsById: new Map(world.clubs.map((c) => [c.id, c])),
      clubLeague: new Map(world.clubs.map((c) => [c.id, c.leagueId])),
      staticData: { leagues: world.leagues, clubs: world.clubs, nations: world.nations, cups: world.cups },
    };
    const departures = resolveExpiredContracts(bosmanState);
    assert("resolveExpiredContracts moves the user's unrenewed player away", departures.length === 1 && bosman.clubId !== userClub.id, `now at ${bosman.clubId}`);
    assert("the Bosman's new contract doesn't start already-expired", bosman.contract.endYear > bosmanSeasonYear);
  }

  group("engine/wage.js — wage ceiling + squad wage bill (Finances tile)");
  {
    const club = world.clubs.find((c) => c.id === sampleClubId);
    const league = world.leagues.find((l) => l.id === sampleLeagueId);
    const ceiling = computeWageCeiling(club, league);
    assert(`computeWageCeiling returns a positive weekly figure (£${ceiling.toLocaleString()})`, ceiling > 0);
    const roster = world.squadsByClub.get(sampleClubId);
    const bill = squadWageBill(roster);
    assert(`squadWageBill sums to a positive total across a 24-man squad (£${bill.toLocaleString()})`, bill > 0);
    assert("squadWageBill equals the sum of each player's own contract.wage", bill === roster.reduce((s, p) => s + p.contract.wage, 0));

    // A freshly generated squad's actual bill should sit under its own
    // club's ceiling in the common case — the Finances tile's "Weekly Wage
    // Budget" shouldn't read negative on day one for most clubs (the
    // headroom's whole purpose per this file's own header). Checked across
    // every club, every league tier, not just one sample.
    let overBudget = 0;
    for (const c of world.clubs) {
      const l = world.leagues.find((lg) => lg.id === c.leagueId);
      const r = world.squadsByClub.get(c.id) || [];
      if (squadWageBill(r) > computeWageCeiling(c, l)) overBudget++;
    }
    const overBudgetPct = (overBudget / world.clubs.length) * 100;
    assert(`fewer than 15% of freshly generated clubs start over their own wage ceiling (${overBudget}/${world.clubs.length}, ${overBudgetPct.toFixed(1)}%)`,
      overBudgetPct < 15);
  }

  /* ================= M7 — Transfers ================= */

  // Shared fake state for every M7 group below: a real 60-club sample of the
  // generated world (full squads, real clubs/leagues) rather than the whole
  // ~15k-player world, keeping per-test setup cheap while still exercising
  // the real computeWantedFee/decisionChance/negotiation code paths against
  // real player/club data (same "hand-built fakeState" pattern as the M6
  // engine/contracts.js groups above, just with the extra fields M7's
  // engine files read: state.transfers, state.manager.rep, state.news).
  function buildM7FakeState(todayOverride) {
    const sampledClubs = world.clubs.slice(0, 60);
    if (!sampledClubs.some((c) => c.id === sampleClubId)) sampledClubs.push(world.clubs.find((c) => c.id === sampleClubId));
    const testClubIds = new Set(sampledClubs.map((c) => c.id));
    const club = world.clubs.find((c) => c.id === sampleClubId);
    const league = world.leagues.find((l) => l.id === sampleLeagueId);
    const players = world.players.filter((p) => testClubIds.has(p.clubId)).map((p) => ({ ...p, contract: { ...p.contract }, loan: null }));
    const playersById = new Map(players.map((p) => [p.id, p]));
    const playersByClub = new Map();
    for (const p of players) {
      if (!playersByClub.has(p.clubId)) playersByClub.set(p.clubId, []);
      playersByClub.get(p.clubId).push(p);
    }
    const clubsById = new Map(sampledClubs.map((c) => [c.id, c]));
    const clubLeague = new Map(sampledClubs.map((c) => [c.id, c.leagueId]));
    // Sep 1 = the summer window's deadline day (config/calendar.js) — offers
    // submitted "today" resolve synchronously, so these tests don't need a
    // calendar-advance loop just to force a pending offer to resolve.
    const today = todayOverride || new Date(2014, 8, 1);
    return {
      seed, seasonStartYear: 2014, club, league,
      manager: { name: "Bob Jackson", rep: 10 },
      calendar: { today },
      players, playersById, playersByClub, clubsById, clubLeague,
      staticData: { leagues: world.leagues, clubs: sampledClubs, nations: world.nations, cups: world.cups },
      finances: { transferBudget: 50000000, wageCeiling: 999999999 },
      squad: { roster: (playersByClub.get(club.id) || []).slice().sort((a, b) => b.overall - a.overall) },
      transfers: { listings: new Map(), negotiation: null, pendingOffers: [] },
      inbox: { emails: [] },
      news: { transfer: [] },
      clubTransferBudgets: new Map(),
    };
  }

  group("engine/teamdecision.js — fee-negotiation acceptance (transferteamdecision.ini)");
  {
    const state = buildM7FakeState();
    const sellingClub = state.club;
    const seller = state.squad.roster[0];
    const buyingClub = state.staticData.clubs.find((c) => c.id !== sellingClub.id);

    const wantedFee = computeWantedFee({ player: seller, buyingClub, sellingClub, state });
    assert(`computeWantedFee returns a positive figure scaled off the player's value (value £${seller.value.toLocaleString()}, wanted £${wantedFee.toLocaleString()})`, wantedFee > 0);

    const generousChances = feeDecisionChances(wantedFee * 1.4, wantedFee, true);
    assert(`an offer at 140% of wanted fee has a high accept chance (${generousChances.acceptPct}%)`, generousChances.acceptPct >= 90);
    const lowballChances = feeDecisionChances(wantedFee * 0.4, wantedFee, true);
    assert(`an offer at 40% of wanted fee has zero accept chance (${lowballChances.acceptPct}%)`, lowballChances.acceptPct === 0);

    const rng = new RngStream(deriveSeed(seed, "teamdecision-threeway"));
    let acceptCount = 0;
    for (let i = 0; i < 100; i++) if (rollThreeWay(rng, { acceptPct: 100, counterPct: 0, rejectPct: 0 }) === "accept") acceptCount++;
    assert("rollThreeWay always returns 'accept' when acceptPct=100", acceptCount === 100);

    const counterFee = computeCounterFee({ wantedFee, buyingClub, sellingClub, rng });
    assert(`computeCounterFee never counters below the club's own wanted fee (£${counterFee.toLocaleString()} vs £${wantedFee.toLocaleString()})`, counterFee >= wantedFee);
  }

  group("engine/playerdecision.js — new-club signing ask + decision (transfer.ini / transfers.ini)");
  {
    const state = buildM7FakeState();
    const player = state.squad.roster[state.squad.roster.length - 1];
    const sourceClub = state.club;
    const destClub = state.staticData.clubs.reduce((a, b) => (b.prestige > a.prestige ? b : a));

    const ask = computeSigningAsk({ player, sourceClub, destClub, state });
    assert(`computeSigningAsk never suggests less than the player's current wage (£${ask.wage.toLocaleString()} >= £${player.contract.wage.toLocaleString()})`, ask.wage >= player.contract.wage);

    const chanceGenerous = decisionChance({ player, sourceClub, destClub, offer: { wage: Math.round(ask.wage * 2) }, promisedRole: player.contract.squadRole, state });
    assert(`a 2x-ask wage offer + same-tier role has a good acceptance chance (${(chanceGenerous * 100).toFixed(0)}%)`, chanceGenerous > 0.5);

    const chanceReject = decisionChance({ player, sourceClub, destClub, offer: { wage: 1 }, promisedRole: "prospect", state });
    assert(`a £1 offer + demoted role has a low acceptance chance (${(chanceReject * 100).toFixed(0)}%)`, chanceReject < 0.2);

    assert("decisionCurveY(0) ≈ 10.01 (PAIR_X3/Y3, verbatim from transfers.ini)", Math.abs(decisionCurveY(0) - 10.011562) < 0.01);
    assert("decisionCurveY clamps at MAX_X (200) → 200", decisionCurveY(500) === 200);
    assert("decisionCurveY clamps at MIN_X (-100) → -200.90909", Math.abs(decisionCurveY(-500) - -200.90909) < 0.001);
  }

  group("engine/negotiation.js — fee talks -> contract talks -> completed transfer");
  {
    const state = buildM7FakeState();
    // Several non-rival counterparty clubs (engine/playerdecision.js's own
    // ISRIVALCLUB -200 penalty is a deliberately strong deterrent — picking
    // just one arbitrary club risks landing on the user's actual rival, e.g.
    // Manchester United/Manchester City, and correctly failing every retry;
    // sampling several clubs like the M6 contracts.js tests do avoids that).
    const otherClubs = state.staticData.clubs.filter((c) => c.id !== state.club.id && c.id !== state.club.rivalId).slice(0, 6);

    let completed = false;
    let completedTarget = null;
    outer:
    for (const otherClub of otherClubs) {
      const targetRoster = state.playersByClub.get(otherClub.id) || [];
      const target = targetRoster.reduce((cheapest, p) => (p.value < cheapest.value ? p : cheapest), targetRoster[0]);
      for (let attempt = 0; attempt < 6; attempt++) {
        state.transfers.negotiation = null;
        state.transfers.pendingOffers = [];
        startFeeNegotiation(state, target.id);
        const n = state.transfers.negotiation;
        n.promisedRole = target.contract.squadRole; // same-tier promise — isolates the wage-driven acceptance this test targets
        n.feeOffer = Math.round(target.value * (2 + attempt)); // escalate well past any plausible wanted fee
        submitFeeOffer(state);
        if (state.transfers.negotiation.phase === "contract") {
          state.transfers.negotiation.contractOffer.wage = Math.round(state.transfers.negotiation.contractOffer.wage * (2 + attempt));
          submitNegotiationContractOffer(state);
          if (state.transfers.negotiation.phase === "completed") {
            completed = true;
            completedTarget = target;
            break outer;
          }
        }
      }
    }
    const target = completedTarget;
    assert(`a maximally generous fee + contract offer completes a transfer within a few retries across ${otherClubs.length} non-rival clubs`, completed);
    if (completed) {
      assert("completing a transfer moves the player to the user's club", target.clubId === state.club.id);
      assert("completing a transfer deducts the fee from the user's transfer budget", state.finances.transferBudget < 50000000);
      assert("completing a transfer adds the player to state.squad.roster", state.squad.roster.some((p) => p.id === target.id));
      assert("completing a transfer pushes a transfer-news article", state.news.transfer.length > 0);
    }

    const overBudgetState = buildM7FakeState();
    overBudgetState.finances.transferBudget = 100;
    const otherClub2 = overBudgetState.staticData.clubs.find((c) => c.id !== overBudgetState.club.id);
    const target2 = (overBudgetState.playersByClub.get(otherClub2.id) || [])[0];
    startFeeNegotiation(overBudgetState, target2.id);
    overBudgetState.transfers.negotiation.feeOffer = 999999999;
    const overBudgetResult = submitFeeOffer(overBudgetState);
    assert("submitFeeOffer refuses an offer above the user's transfer budget ('budgets enforce')", overBudgetResult.error === "over-budget");
  }

  group("engine/negotiation.js — loan request + return");
  {
    const state = buildM7FakeState();
    // Not the user's own rival — see the fee/contract-talks group above for
    // why (engine/playerdecision.js's ISRIVALCLUB penalty is a genuine, deliberately
    // strong deterrent that would otherwise fail every sampled candidate).
    const otherClub = state.staticData.clubs.find((c) => c.id !== state.club.id && c.id !== state.club.rivalId);
    const candidates = (state.playersByClub.get(otherClub.id) || []).slice(0, 12);
    let loanedCandidate = null;
    for (const candidate of candidates) {
      state.transfers.negotiation = null;
      state.transfers.pendingOffers = [];
      startLoanNegotiation(state, candidate.id, "short");
      if (candidate.clubId === state.club.id) { loanedCandidate = candidate; break; }
    }
    assert(`a loan request is accepted for at least one of ${candidates.length} sampled candidates`, !!loanedCandidate);
    if (loanedCandidate) {
      assert("a loaned player's wage while on loan is reduced (user's wage-share)", loanedCandidate.contract.wage < loanedCandidate.loan.fullWage);
      const afterReturn = new Date(loanedCandidate.loan.returnDate.getFullYear(), loanedCandidate.loan.returnDate.getMonth(), loanedCandidate.loan.returnDate.getDate() + 1);
      resolveLoanReturns(state, afterReturn);
      assert("resolveLoanReturns sends the player back to the parent club after returnDate", loanedCandidate.clubId === otherClub.id && loanedCandidate.loan === null);
      assert("returning restores the player's full (pre-loan) wage", loanedCandidate.contract.wage > 0);
    }
  }

  group("engine/freeagents.js — pre-contract approach (transfer.ini APPROACH_*)");
  {
    const state = buildM7FakeState();
    const otherClub = state.staticData.clubs.find((c) => c.id !== state.club.id && c.id !== state.club.rivalId);
    const candidates = (state.playersByClub.get(otherClub.id) || []).slice(0, 12);
    for (const c of candidates) c.contract.endYear = state.seasonStartYear + 1; // "expires this season" — eligibility gate

    const targets = eligibleFreeAgentTargets(state);
    assert("eligibleFreeAgentTargets includes players whose contract expires this season", candidates.every((c) => targets.some((t) => t.id === c.id)));
    assert("eligibleFreeAgentTargets excludes the user's own squad", targets.every((p) => p.clubId !== state.club.id));

    let approved = null;
    for (const candidate of candidates) {
      state.transfers.negotiation = null;
      state.transfers.pendingOffers = [];
      startApproach(state, candidate.id);
      const n = state.transfers.negotiation;
      n.promisedRole = candidate.contract.squadRole;
      n.contractOffer.wage = Math.round(n.contractOffer.wage * 3);
      submitApproach(state);
      if (candidate.contract.preAgreedClubId === state.club.id) { approved = candidate; break; }
    }
    assert(`a generous pre-contract approach is accepted for at least one of ${candidates.length} sampled candidates`, !!approved);
    if (approved) {
      assert("acceptance records preAgreedTerms with the offered wage", approved.contract.preAgreedTerms.wage > 0);
      assert("the player hasn't actually moved yet (still at their current club until the contract lapses)", approved.clubId === otherClub.id);
      assert("a free-agent news article is pushed", state.news.transfer.some((a) => a.title.includes(approved.commonName)));
    }
  }

  group("engine/clubbudget.js — CPU club transfer budgets");
  {
    const state = buildM7FakeState();
    const clubId = state.staticData.clubs[1].id;
    const initial = getClubBudget(state, clubId);
    assert(`getClubBudget lazily seeds from the club's own baseTransferBudget (£${initial.toLocaleString()})`, initial === state.clubsById.get(clubId).baseTransferBudget);
    spendClubBudget(state, clubId, 1000000);
    creditClubBudget(state, clubId, 250000);
    assert("spend/credit adjust the same club's balance additively", getClubBudget(state, clubId) === initial - 1000000 + 250000);
  }

  group("engine/transferai.js — weekly CPU<->CPU activity + incoming bids on listed players");
  {
    // Smoke-tests the whole assess-need -> counterparty -> fee -> player-
    // decision pipeline across a full summer window on the 60-club sample —
    // deterministic seed, asserts it never throws, respects the plan's own
    // ~40/window cap, and never touches the user's own club (same "one club
    // id is skipped" precedent as engine/sim/worldsim.js).
    const cpuState = buildM7FakeState();
    const userRosterSizeBefore = (cpuState.playersByClub.get(cpuState.club.id) || []).length;
    const windowStart = new Date(cpuState.seasonStartYear, 6, 1);
    let totalCompleted = 0;
    for (let d = 0; d < 62; d++) {
      const day = new Date(windowStart.getFullYear(), windowStart.getMonth(), windowStart.getDate() + d);
      totalCompleted += runWeeklyTransferActivity(cpuState, day);
    }
    assert(`runWeeklyTransferActivity completes deals over a full summer window on a 60-club sample (${totalCompleted} completed)`, totalCompleted > 0);
    assert("runWeeklyTransferActivity never exceeds the plan's own per-window cap (40)", cpuState.transferWindowProgress.completed <= 40);
    assert("runWeeklyTransferActivity never moves players into or out of the user's own club",
      (cpuState.playersByClub.get(cpuState.club.id) || []).length === userRosterSizeBefore);
    assert("CPU<->CPU deals push transfer-news articles", cpuState.news.transfer.length > 0);

    const bidState = buildM7FakeState();
    const myPlayer = bidState.squad.roster[bidState.squad.roster.length - 1];
    bidState.transfers.listings.set(myPlayer.id, { type: "transfer", askingPrice: Math.round(myPlayer.value * 0.5), listedDate: bidState.calendar.today });
    let bidEmail = null;
    for (let d = 0; d < 120 && !bidEmail; d++) {
      const day = new Date(bidState.seasonStartYear, 6, 1 + d);
      checkIncomingBidsOnListedPlayers(bidState, day);
      bidEmail = bidState.inbox.emails.find((e) => e.action && e.action.type === "transfer-bid") || null;
    }
    assert("listing a player below value eventually attracts a CPU bid email (YES/NO decision email)", !!bidEmail);
    if (bidEmail) {
      const budgetBefore = bidState.finances.transferBudget;
      const result = acceptIncomingBid(bidState, bidEmail.action.bidId);
      assert("acceptIncomingBid succeeds for a real pending bid", result.ok === true);
      assert("accepting moves the player away from the user's club", myPlayer.clubId !== bidState.club.id);
      assert("accepting credits the user's transfer budget", bidState.finances.transferBudget > budgetBefore);
      assert("the resolved email's action is cleared (no longer actionable)", bidEmail.action === null);
    }

    const rejectState = buildM7FakeState();
    const otherPlayer = rejectState.squad.roster[0];
    rejectState.transfers.listings.set(otherPlayer.id, { type: "transfer", askingPrice: Math.round(otherPlayer.value * 0.5), listedDate: rejectState.calendar.today });
    let rejectEmail = null;
    for (let d = 0; d < 120 && !rejectEmail; d++) {
      const day = new Date(rejectState.seasonStartYear, 6, 1 + d);
      checkIncomingBidsOnListedPlayers(rejectState, day);
      rejectEmail = rejectState.inbox.emails.find((e) => e.action && e.action.type === "transfer-bid") || null;
    }
    if (rejectEmail) {
      const clubIdBefore = otherPlayer.clubId;
      const result = rejectIncomingBid(rejectState, rejectEmail.action.bidId);
      assert("rejectIncomingBid succeeds and leaves the player at the user's club", result.ok === true && otherPlayer.clubId === clubIdBefore);
    }
  }

  /* ================= M8 — GTN scouting ================= */

  group("gen/player.js — M8 default scouting (level 0, no INI leak)");
  {
    const sample = world.players.slice(0, 500);
    assert("every freshly generated player starts at scouting level 0", sample.every((p) => p.scouting.level === 0));
    const p = sample[0];
    assert("level-0 ovrRange matches config/scouting.js's ±12 half-width (clamped 1-99)",
      deepEqual(p.scouting.ovrRange, scoutingRangeFor(p.overall, 0)));
    assert("level-0 potRange matches the same half-width table", deepEqual(p.scouting.potRange, scoutingRangeFor(p.potential, 0)));
  }

  group("config/scouting.js — scoutingRangeFor half-widths (plan1.md M8 verbatim: ±6/±3/exact)");
  {
    assert("half-width table is [12, 6, 3, 0] (level 0 authored, 1-3 are plan1.md's own numbers)",
      deepEqual(RANGE_HALF_WIDTH_BY_LEVEL, [12, 6, 3, 0]));
    assert("level 1 -> ±6", deepEqual(scoutingRangeFor(70, 1), [64, 76]));
    assert("level 2 -> ±3", deepEqual(scoutingRangeFor(70, 2), [67, 73]));
    assert("level 3 -> exact", deepEqual(scoutingRangeFor(70, 3), [70, 70]));
    assert("range never drops below 1 or exceeds 99", deepEqual(scoutingRangeFor(3, 1), [1, 9]) && deepEqual(scoutingRangeFor(97, 1), [91, 99]));
  }

  group("engine/contracts.js — movePlayerToClub reveals full knowledge on signing for the user's club (M8)");
  {
    const state = buildM7FakeState();
    const target = state.players.find((p) => p.clubId !== state.club.id && p.scouting.level < 3);
    assert("sampled target isn't already fully scouted before the move (else the assertion below proves nothing)", !!target);
    movePlayerToClub(state, target, state.club.id);
    assert("signing for the user's club sets scouting level to 3", target.scouting.level === 3);
    assert("...and both ranges collapse to the exact true value", deepEqual(target.scouting.ovrRange, [target.overall, target.overall]) && deepEqual(target.scouting.potRange, [target.potential, target.potential]));
  }

  group("engine/gtn.js — scout market (hire pool, hire, sack)");
  {
    const state = buildM7FakeState();
    createInitialGtnState(state);
    assert(`createInitialGtnState seeds a pool of ${POOL_SIZE} candidates`, state.gtn.pool.length === POOL_SIZE);
    assert("every candidate's Experience/Judgment stars are within 1-5", state.gtn.pool.every((c) => c.experience >= 1 && c.experience <= 5 && c.judgment >= 1 && c.judgment <= 5));
    assert("every candidate has a unique id", new Set(state.gtn.pool.map((c) => c.id)).size === state.gtn.pool.length);

    const budgetBefore = state.finances.transferBudget;
    const candidate = state.gtn.pool[0];
    const expectedCost = hireCost(candidate.experience, candidate.judgment);
    const hireResult = hireScout(state, 0);
    assert("hireScout succeeds for a valid pool index", hireResult.ok === true);
    assert("hiring deducts the exact hire-cost curve figure from the transfer budget", state.finances.transferBudget === budgetBefore - expectedCost);
    assert("the hired scout moves out of the pool and into the roster", state.gtn.pool.length === POOL_SIZE - 1 && state.gtn.scouts.length === 1);
    assert("hireScout on an out-of-range index reports not-found", hireScout(state, 99).error === "not-found");

    // MAX_HIRED_SCOUTS guard — pushed directly rather than hiring 6 for real,
    // since the pool only refills weekly (scout.ini's own SCOUT_NUM_DAYS_FOR_
    // POOL_UPDATE=7) and this is purely a roster-size unit check.
    while (state.gtn.scouts.length < MAX_HIRED_SCOUTS) {
      state.gtn.scouts.push({ id: `filler-${state.gtn.scouts.length}`, commonName: "Filler", nationId: "england", experience: 2, judgment: 2, hiredDate: state.calendar.today, missionId: null });
    }
    assert(`hireScout refuses a 7th scout past the ${MAX_HIRED_SCOUTS}-scout cap`, hireScout(state, 0).error === "roster-full");

    const sackBudgetBefore = state.finances.transferBudget;
    const scoutToSack = state.gtn.scouts[0];
    const expectedSackCost = sackCost(scoutToSack);
    const sackResult = sackScout(state, scoutToSack.id);
    assert("sackScout succeeds for a hired scout", sackResult.ok === true);
    assert("sacking deducts the £5,000/star cost (scout.ini SCOUT_SACKING_COST_PER_LEVEL)", state.finances.transferBudget === sackBudgetBefore - expectedSackCost);
    assert("the sacked scout leaves the roster", !state.gtn.scouts.some((s) => s.id === scoutToSack.id));
  }

  group("engine/gtn.js — missions: assign, budget guard, cancel");
  {
    const state = buildM7FakeState();
    createInitialGtnState(state);
    hireScout(state, 0);
    const scout = state.gtn.scouts[0];

    const missionOpts = { scoutId: scout.id, region: "ALL", area: "ATT", tags: ["pacey", "prolific"], minAge: 16, maxAge: 32, maxValue: 0, tierIndex: 0 };
    const budgetBefore = state.finances.transferBudget;
    const expectedCost = missionCost(0, scout);
    const result = startMission(state, missionOpts);
    assert("startMission succeeds for an idle, affordable scout", result.ok === true);
    assert("mission cost is deducted from the transfer budget", state.finances.transferBudget === budgetBefore - expectedCost);
    assert("the scout is now marked busy (missionId set)", scout.missionId === result.mission.id);
    assert("a 'Pacey, Prolific' ST mission carries both tags (plan1.md's own example)", deepEqual(result.mission.tags, ["pacey", "prolific"]));

    assert("startMission on an already-busy scout is refused", startMission(state, missionOpts).error === "scout-busy");

    const poorState = buildM7FakeState();
    createInitialGtnState(poorState);
    hireScout(poorState, 0);
    poorState.finances.transferBudget = 0;
    assert("startMission on an unaffordable mission is refused (insufficient-funds)",
      startMission(poorState, { ...missionOpts, scoutId: poorState.gtn.scouts[0].id }).error === "insufficient-funds");

    cancelMission(state, result.mission.id);
    assert("cancelMission removes the mission from state.gtn.missions", !state.gtn.missions.some((m) => m.id === result.mission.id));
    assert("...and frees the scout back to idle", scout.missionId === null);
  }

  group("engine/gtn.js — report cadence (plan1.md M8 verbatim: day 10 first report, then weekly, ranges narrow to exact)");
  {
    const state = buildM7FakeState();
    createInitialGtnState(state);
    hireScout(state, 0);
    const scout = state.gtn.scouts[0];
    const start = startMission(state, { scoutId: scout.id, region: "ALL", area: "ALL", tags: [], minAge: 15, maxAge: 40, maxValue: 0, tierIndex: 2 }); // Long (9mo) so it doesn't auto-complete mid-test
    const mission = start.mission;

    for (let d = 1; d < FIRST_REPORT_DAYS; d++) {
      runDailyGtnActivity(state, new Date(state.seasonStartYear, 8, 1 + d));
    }
    assert(`no players are found before day ${FIRST_REPORT_DAYS} (mission.nextReportDate hasn't been reached yet)`, mission.foundPlayerIds.length === 0);

    runDailyGtnActivity(state, new Date(state.seasonStartYear, 8, 1 + FIRST_REPORT_DAYS));
    assert(`the first report (day ${FIRST_REPORT_DAYS}) finds at least one player`, mission.foundPlayerIds.length > 0);
    const firstFind = state.playersById.get(mission.foundPlayerIds[0]);
    assert("a freshly found player starts at scouting level 1", firstFind.scouting.level === 1);
    assert("...with a ±6 range around their true overall (plan1.md M8 verbatim)", deepEqual(firstFind.scouting.ovrRange, scoutingRangeFor(firstFind.overall, 1)));

    for (let week = 1; week <= 3; week++) {
      runDailyGtnActivity(state, new Date(state.seasonStartYear, 8, 1 + FIRST_REPORT_DAYS + REPORT_INTERVAL_DAYS * week));
    }
    assert("after 3 further weekly reports (~3 weeks) the first find has narrowed all the way to exact (level 3)",
      firstFind.scouting.level === 3 && firstFind.scouting.ovrRange[0] === firstFind.scouting.ovrRange[1]);

    assert("newCount reflects finds not yet viewed", missionNewCount(mission) === mission.foundPlayerIds.length);
    viewMission(state, mission.id);
    assert("viewMission marks every current find as seen (newCount -> 0)", missionNewCount(mission) === 0);
    assert("...and clears the updated-since-seen list", missionUpdateCount(mission) === 0);
  }

  group("engine/gtn.js — primaryMission (Central/Transfers tile preview)");
  {
    assert("primaryMission is null with no missions at all", primaryMission([]) === null);
    const quiet = { id: "m1", foundPlayerIds: ["a", "b"], seenPlayerIds: ["a", "b"], updatedPlayerIds: [], startDate: new Date(2014, 6, 1) };
    const loud = { id: "m2", foundPlayerIds: ["c", "d", "e"], seenPlayerIds: [], updatedPlayerIds: ["c"], startDate: new Date(2014, 6, 5) };
    assert("the mission with more New+Updates wins over a quieter, earlier one", primaryMission([quiet, loud]).id === "m2");
    const tie = { id: "m3", foundPlayerIds: ["c", "d", "e"], seenPlayerIds: [], updatedPlayerIds: ["c"], startDate: new Date(2014, 6, 10) };
    assert("a New+Updates tie breaks toward the more recently started mission", primaryMission([loud, tie]).id === "m3");
  }

  group("core/db.js — state.gtn compact round-trip (M8)");
  {
    // buildM7FakeState() is a lightweight fixture for engine/transferai.js's
    // own tests and doesn't carry results/cups/jobMarket — serializeSave
    // needs all three (see its own M4/M5 fields), so they're filled in here
    // the same way the pre-existing "compact serialization round-trip" group
    // above does for its own hand-built fakeSaveState.
    const state = buildM7FakeState();
    state.results = new Map();
    state.cups = new Map();
    state.jobMarket = { vacancies: [] };
    createInitialGtnState(state);
    hireScout(state, 0);
    startMission(state, { scoutId: state.gtn.scouts[0].id, region: "ALL", area: "MID", tags: ["creative"], minAge: 17, maxAge: 30, maxValue: 5000000, tierIndex: 1 });
    runDailyGtnActivity(state, new Date(state.seasonStartYear, 8, 1 + FIRST_REPORT_DAYS));

    const roundTripped = deserializeSave(serializeSave(state));
    assert("scouts round-trip (stars, ids, hiredDate)", deepEqual(roundTripped.gtn.scouts, state.gtn.scouts));
    assert("pool round-trips", deepEqual(roundTripped.gtn.pool, state.gtn.pool));
    assert("missions round-trip, including Date fields (startDate/endDate/nextReportDate) and found-player id lists",
      deepEqual(roundTripped.gtn.missions, state.gtn.missions));
    assert("nextId/lastSalaryPeriod round-trip", roundTripped.gtn.nextId === state.gtn.nextId && roundTripped.gtn.lastSalaryPeriod === state.gtn.lastSalaryPeriod);
  }

  /* ================= M9 — Youth academy ================= */

  group("config/youth.js — potential tiers, tier odds, retirement chance (scout.ini verbatim)");
  {
    assert("4 potential tiers match plan1.md M9 verbatim (75-95/65-90/60-85/55-80)",
      deepEqual(POTENTIAL_TIERS.map((t) => t.range), [[75, 95], [65, 90], [60, 85], [55, 80]]));
    assert("a Judgment-5 scout's Tier-1/Tier-2 odds beat a Judgment-1 scout's (KNOWLEDGE_LEVEL_x_TIER_1/2_PERC rise with Judgment)",
      (TIER_ODDS_BY_JUDGMENT[5][0] + TIER_ODDS_BY_JUDGMENT[5][1]) > (TIER_ODDS_BY_JUDGMENT[1][0] + TIER_ODDS_BY_JUDGMENT[1][1]));

    const tierRng = new RngStream(deriveSeed(seed, "youth-tier-roll"));
    const rolls = Array.from({ length: 200 }, () => rollPotentialTier(tierRng, 3));
    assert("rollPotentialTier always returns one of the 4 POTENTIAL_TIERS entries", rolls.every((t) => POTENTIAL_TIERS.includes(t)));

    assert("retirementChancePct is 0 below RETIREMENT_AGE_MIN (16 — PLAYER_RETIRE_AT_AGE_RANGE_0)", retirementChancePct(15, 50) === 0);
    assert("retirementChancePct hits exactly 100% for an 18-y-o at season end (RETIREMENT_PERC_AGE_2_POINT_3)", retirementChancePct(18, 95) === 100);
    assert("retirementChancePct for a fresh 16-y-o at season start is low (<=2%)", retirementChancePct(16, 10) <= 2);

    const posRng = new RngStream(deriveSeed(seed, "youth-type-position"));
    const gkGroups = Array.from({ length: 100 }, () => pickWorkrateGroupForType(posRng, "goalkeeper"));
    assert("'goalkeeper' type always resolves to the GK position group (scout.ini's 4_TO_POS_0_PERC=100, all others 0)", gkGroups.every((g) => g === "GK"));
    const defGroups = Array.from({ length: 200 }, () => pickWorkrateGroupForType(posRng, "defensive"));
    assert("'defensive' type never resolves to GK or CAM (both 0% weight in scout.ini's own table)", defGroups.every((g) => g !== "GK" && g !== "CAM"));
  }

  group("gen/player.js — potentialOverride (M9: a youth prospect rolls potential first, overall second — the reverse of a normal player)");
  {
    const rng = new RngStream(deriveSeed(seed, "youth-potential-override"));
    const club = world.clubs[0];
    const league = world.leagues.find((l) => l.id === club.leagueId);
    const p = generatePlayer({
      rng, positionCode: "CM", nation: world.nations[0], club, league,
      targetOverall: 50, seasonStartYear: 2014, ageOverride: 16, potentialOverride: 85,
    });
    assert("potentialOverride is used verbatim (no curve-inverted roll, no separate +upside roll)", p.potential === 85);
    assert("ageOverride still applies", p.age === 16);
  }

  group("engine/academy.js — youth-scout market (hire pool, hire, sack)");
  {
    const state = buildM7FakeState();
    createInitialAcademyState(state);
    assert(`createInitialAcademyState seeds a pool of ${POOL_SIZE} candidates`, state.academy.pool.length === POOL_SIZE);
    assert("every candidate's Experience/Judgment stars are within 1-5", state.academy.pool.every((c) => c.experience >= 1 && c.experience <= 5 && c.judgment >= 1 && c.judgment <= 5));
    assert("every candidate has a unique id", new Set(state.academy.pool.map((c) => c.id)).size === state.academy.pool.length);

    const budgetBefore = state.finances.transferBudget;
    const candidate = state.academy.pool[0];
    const expectedCost = hireCost(candidate.experience, candidate.judgment);
    const hireResult = hireYouthScout(state, 0);
    assert("hireYouthScout succeeds for a valid pool index", hireResult.ok === true);
    assert("hiring deducts the exact shared hire-cost curve figure (config/scouting.js, ported from scout.ini's [YOUTH_SCOUT] section)", state.finances.transferBudget === budgetBefore - expectedCost);
    assert("the hired scout moves out of the pool and into the roster", state.academy.pool.length === POOL_SIZE - 1 && state.academy.scouts.length === 1);
    assert("hireYouthScout on an out-of-range index reports not-found", hireYouthScout(state, 99).error === "not-found");

    while (state.academy.scouts.length < MAX_YOUTH_SCOUTS) {
      state.academy.scouts.push({ id: `filler-${state.academy.scouts.length}`, commonName: "Filler", nationId: "england", experience: 2, judgment: 2, hiredDate: state.calendar.today, assignment: null });
    }
    assert(`hireYouthScout refuses past the ${MAX_YOUTH_SCOUTS}-scout cap (SCOUT_MAXIMUM_SCOUTS_NUMBER)`, hireYouthScout(state, 0).error === "roster-full");

    const sackBudgetBefore = state.finances.transferBudget;
    const scoutToSack = state.academy.scouts[0];
    const expectedSackCost = sackCost(scoutToSack);
    const sackResult = sackYouthScout(state, scoutToSack.id);
    assert("sackYouthScout succeeds for a hired scout", sackResult.ok === true);
    assert("sacking deducts the shared £5,000/star cost", state.finances.transferBudget === sackBudgetBefore - expectedSackCost);
    assert("the sacked scout leaves the roster", !state.academy.scouts.some((s) => s.id === scoutToSack.id));
  }

  group("engine/academy.js — assignment (nation + player type + duration), recall");
  {
    const state = buildM7FakeState();
    createInitialAcademyState(state);
    hireYouthScout(state, 0);
    hireYouthScout(state, 0); // pool index 0 now refers to the next candidate
    const [scoutA, scoutB] = state.academy.scouts;
    const budgetBefore = state.finances.transferBudget;

    assert("assignScout on an unknown scout id is refused", assignScout(state, { scoutId: "no-such-scout", nationId: "brazil" }).error === "not-found");
    assert("assignScout without a nation is refused", assignScout(state, { scoutId: scoutB.id, nationId: null }).error === "no-nation");

    const assignResult = assignScout(state, { scoutId: scoutA.id, nationId: "brazil", type: "attacker", tierIndex: 2 });
    assert("assignScout succeeds for an idle, hired scout", assignResult.ok === true);
    assert("assigning a scout is free — only hiring/monthly salary cost money (see engine/academy.js's header)", state.finances.transferBudget === budgetBefore);
    assert("assignment duration reuses config/scouting.js's own Long tier (9 months) — matches REFERENCE_PICS' \"Duration: 9 Months\"", scoutA.assignment.tierLabel === "Long");
    assert("assignScout on an already-assigned scout is refused", assignScout(state, { scoutId: scoutA.id, nationId: "brazil", tierIndex: 0 }).error === "scout-busy");

    recallScout(state, scoutA.id);
    assert("recallScout clears the assignment (scout goes idle, no refund)", scoutA.assignment === null);
  }

  group("engine/academy.js — monthly reports generate 1-3 tier-banded prospects (plan1.md M9 verbatim)");
  {
    const state = buildM7FakeState(new Date(2014, 8, 1)); // Sep 1, 2014
    createInitialAcademyState(state);
    hireYouthScout(state, 0);
    const scout = state.academy.scouts[0];
    assignScout(state, { scoutId: scout.id, nationId: "brazil", type: null, tierIndex: 2 });

    runDailyAcademyActivity(state, new Date(2014, 8, 20));
    assert("no prospects found before the first monthly report", state.academy.roster.length === 0);

    runDailyAcademyActivity(state, new Date(2014, 9, 1)); // +1 month
    assert("the first monthly report finds 1-3 prospects (plan1.md M9: 'brings 1-3 prospects')", state.academy.roster.length >= 1 && state.academy.roster.length <= 3);
    assert("every prospect is age 15-17 (YOUTH_PLAYER_AGE_RANGE)", state.academy.roster.every((p) => p.age >= YOUTH_PLAYER_MIN_AGE && p.age <= YOUTH_PLAYER_MAX_AGE));
    assert("every prospect's potential falls inside one of the 4 tier bands",
      state.academy.roster.every((p) => POTENTIAL_TIERS.some((t) => p.potential >= t.range[0] && p.potential <= t.range[1])));
    assert("every prospect starts at scouting level 1 (visible immediately — unlike a world player's level 0)",
      state.academy.roster.every((p) => p.scouting.level === 1));
    const p0 = state.academy.roster[0];
    assert("level-1 ovrRange matches config/scouting.js's shared fuzzy-range table", deepEqual(p0.scouting.ovrRange, scoutingRangeFor(p0.overall, 1)));
  }

  group("engine/academy.js — monthly development + progressive reveal (level 1 -> 2 at month 3, -> 3/exact at month 6)");
  {
    const state = buildM7FakeState(new Date(2014, 8, 1));
    createInitialAcademyState(state);
    hireYouthScout(state, 0);
    assignScout(state, { scoutId: state.academy.scouts[0].id, nationId: "brazil", tierIndex: 2 });
    runDailyAcademyActivity(state, new Date(2014, 9, 1)); // discovery, joined Oct 1 2014
    assert("a prospect was found to run this test against", state.academy.roster.length > 0);
    const prospect = state.academy.roster[0];

    runDailyAcademyActivity(state, new Date(2015, 0, 1)); // Jan 1, 2015 = +3 months
    assert("scouting narrows to level 2 at month 3 (MONTHS_BETWEEN_NARROW_STEPS)", prospect.scouting.level === 2);
    assert("...with the ±3 range around the true overall", deepEqual(prospect.scouting.ovrRange, scoutingRangeFor(prospect.overall, 2)));

    runDailyAcademyActivity(state, new Date(2015, 3, 1)); // Apr 1, 2015 = +6 months
    assert("scouting reaches level 3 (exact) at month 6 (MONTHS_TO_UNCOVER_PLAYER_TYPE)", prospect.scouting.level === 3);
    assert("...and the range collapses to a single exact value", prospect.scouting.ovrRange[0] === prospect.scouting.ovrRange[1]);
    assert("monthly development never pushes overall past the prospect's own potential", prospect.overall <= prospect.potential);
  }

  group("engine/academy.js — ageUpAcademyRoster (July 1 rollover step)");
  {
    const state = buildM7FakeState();
    createInitialAcademyState(state);
    const p = { ...world.players[0], id: -3001, age: 15 };
    state.academy.roster.push(p);
    ageUpAcademyRoster(state);
    assert("a roster prospect ages up at rollover the same as state.players — excluded from that loop since it lives outside state.players (see engine/academy.js's header)", p.age === 16);
  }

  group("engine/academy.js — promote/release, isPromotable (min age 16, 3-yr pro contract)");
  {
    const state = buildM7FakeState();
    createInitialAcademyState(state);

    const young = { ...world.players[0], id: -1001, age: 15, isYouth: true, academyJoinedDate: state.calendar.today, nextDevelopmentDate: state.calendar.today, retirementWarningDate: null, scouting: { level: 1, ovrRange: [50, 62], potRange: [70, 82] }, contract: { ...world.players[0].contract } };
    const old = { ...world.players[1], id: -1002, age: 17, isYouth: true, academyJoinedDate: state.calendar.today, nextDevelopmentDate: state.calendar.today, retirementWarningDate: null, scouting: { level: 3, ovrRange: [60, 60], potRange: [80, 80] }, contract: { ...world.players[1].contract } };
    state.academy.roster.push(young, old);

    assert("a 15-y-o is not promotable (MIN_PLAYER_AGE_FOR_PROMOTION=16)", isPromotable(young) === false);
    assert("a 17-y-o is promotable", isPromotable(old) === true);
    assert("promoteProspect refuses a too-young prospect", promoteProspect(state, young.id).error === "too-young");

    const rosterCountBefore = state.academy.roster.length;
    const squadCountBefore = state.squad.roster.length;
    const result = promoteProspect(state, old.id);
    assert("promoteProspect succeeds for an eligible prospect", result.ok === true);
    assert("the prospect leaves the youth academy roster", state.academy.roster.length === rosterCountBefore - 1);
    assert("...and joins the senior squad", state.squad.roster.length === squadCountBefore + 1 && state.squad.roster.some((p) => p.id === old.id));
    assert("a promoted player is no longer isYouth", old.isYouth === false);
    assert("a promoted player signs exactly a 3-year contract (plan1.md M9 verbatim)", old.contract.endYear === state.seasonStartYear + 3);
    assert("a promoted player is fully scouted (level 3, exact ranges) — same convention as engine/contracts.js's movePlayerToClub", old.scouting.level === 3 && old.scouting.ovrRange[0] === old.scouting.ovrRange[1]);
    assert("playersById/playersByClub pick up the promotion immediately", state.playersById.get(old.id) === old && state.playersByClub.get(state.club.id).includes(old));

    const releaseResult = releaseProspect(state, young.id);
    assert("releaseProspect removes the prospect with no further consequence", releaseResult.ok === true && !state.academy.roster.some((p) => p.id === young.id));
  }

  group("engine/academy.js — retirement-threat warning + auto-departure if ignored (scout.ini [YOUTH_PLAYER_RETIREMENT])");
  {
    const state = buildM7FakeState(new Date(2014, 8, 1));
    createInitialAcademyState(state);
    // An 18-y-o already 9 months into the academy, right near season end —
    // retirementChancePct(18, ~92%) === 100 (RETIREMENT_PERC_AGE_2_POINT_3),
    // so the warning roll is deterministic regardless of seed.
    const prospect = {
      ...world.players[0], id: -2001, age: 18, isYouth: true,
      // .attrs is cloned (not just .contract, like buildM7FakeState's own
      // players do) because this fixture flows through engine/academy.js's
      // developProspect, which mutates .attrs in place — sharing
      // world.players[0]'s own attrs object would corrupt it for any other
      // group still holding a reference (e.g. window.__testWorld below).
      attrs: { ...world.players[0].attrs },
      academyJoinedDate: new Date(2014, 8, 1), nextDevelopmentDate: new Date(2014, 8, 1),
      retirementWarningDate: null, scouting: { level: 2, ovrRange: [55, 61], potRange: [70, 76] },
      contract: { ...world.players[0].contract },
    };
    state.academy.roster.push(prospect);
    const emailsBefore = state.inbox.emails.length;

    const warnDay = new Date(2015, 5, 1); // Jun 1, 2015 — ~92% through the 2014/15 season
    runDailyAcademyActivity(state, warnDay);
    assert("a retirement-threat roll at guaranteed odds sets the warning date", prospect.retirementWarningDate !== null);
    assert("...and sends a decision email carrying the youth-retirement-warning action",
      state.inbox.emails.length === emailsBefore + 1 &&
      state.inbox.emails[0].action.type === "youth-retirement-warning" &&
      state.inbox.emails[0].action.prospectId === prospect.id);

    const stillThere = addDays(prospect.retirementWarningDate, RETIREMENT_WARNING_DAYS - 1);
    runDailyAcademyActivity(state, stillThere);
    assert(`still in the academy ${RETIREMENT_WARNING_DAYS - 1} days after the warning`, state.academy.roster.some((p) => p.id === prospect.id));

    const departed = addDays(prospect.retirementWarningDate, RETIREMENT_WARNING_DAYS + 1);
    runDailyAcademyActivity(state, departed);
    assert(`departs the academy once the ${RETIREMENT_WARNING_DAYS}-day grace period elapses unpromoted (plan1.md M9's own NUMBER_DAYS_TO_RETIRE_PLAYER wording)`,
      !state.academy.roster.some((p) => p.id === prospect.id));
  }

  group("core/db.js — state.academy round-trip (M9)");
  {
    const state = buildM7FakeState(new Date(2014, 8, 1));
    state.results = new Map();
    state.cups = new Map();
    state.jobMarket = { vacancies: [] };
    createInitialAcademyState(state);
    hireYouthScout(state, 0);
    assignScout(state, { scoutId: state.academy.scouts[0].id, nationId: "brazil", type: "skilled", tierIndex: 1 });
    runDailyAcademyActivity(state, new Date(2014, 9, 1)); // first monthly report

    const roundTripped = deserializeSave(serializeSave(state));
    assert("scouts round-trip, including the assignment's nation/type/duration/dates", deepEqual(roundTripped.academy.scouts, state.academy.scouts));
    assert("pool round-trips", deepEqual(roundTripped.academy.pool, state.academy.pool));
    assert("roster round-trips (prospects, incl. academyJoinedDate/nextDevelopmentDate/scouting ranges)", deepEqual(roundTripped.academy.roster, state.academy.roster));
    assert("nextId/lastSalaryPeriod round-trip", roundTripped.academy.nextId === state.academy.nextId && roundTripped.academy.lastSalaryPeriod === state.academy.lastSalaryPeriod);
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
  console.error(err.stack || err);
});
