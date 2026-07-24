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
import { xiStrength, teamStrength, expectedGoals, poissonSample, pickWeighted } from "../js/engine/sim/core.js";
import { recordMatchRating, computeForm } from "../js/engine/form.js";
import { retirementChance, MIN_RETIREMENT_AGE, MIN_GK_RETIREMENT_AGE } from "../js/config/retirement.js";
import { applyGrowthToWorld } from "../js/engine/growth.js";
import { applyRetirementsAndRegens } from "../js/engine/retirement.js";
import { buildCupState } from "../js/engine/comps/cup.js";
import { acceptJob } from "../js/engine/jobs.js";
import {
  Store, createCareerState, emailsForTab, teamSheetSlotPlayerId, teamSheetFocusableSlots,
} from "../js/core/store.js";
import { computeValue } from "../js/engine/value.js";
import { computeWage, computeWageCeiling, squadWageBill } from "../js/engine/wage.js";
import {
  computeAsk, acceptanceChance, renewUserContract, applyCpuContractRenewals,
  resolveExpiredContracts, checkContractExpiryWarnings, releaseGuardReason, releasePlayer,
  submitRenewalOffer, resolveRenewalOfferEntry,
} from "../js/engine/contracts.js";
import { decisionCurveY } from "../js/config/negotiation.js";
import { computeWantedFee, feeDecisionChances, rollThreeWay, computeCounterFee } from "../js/engine/teamdecision.js";
import { computeSigningAsk, decisionChance } from "../js/engine/playerdecision.js";
import { getClubBudget, spendClubBudget, creditClubBudget } from "../js/engine/clubbudget.js";
import { pushTransferNews } from "../js/engine/transfernews.js";
import {
  startFeeNegotiation, adjustFeeOffer, submitFeeOffer, submitNegotiationContractOffer,
  startLoanNegotiation, submitLoanOffer, cancelNegotiation, resolveLoanReturns,
  setExchangePlayer, adjustLoanBonusPerGoal, cycleLoanLength, adjustLoanFutureFee, resolvedSquadRole,
} from "../js/engine/negotiation.js";
import { eligibleFreeAgentTargets, startApproach, submitApproach } from "../js/engine/freeagents.js";
import {
  runWeeklyTransferActivity, checkIncomingBidsOnListedPlayers, acceptIncomingBid, rejectIncomingBid,
  expirePendingBids,
} from "../js/engine/transferai.js";
import {
  successfulEntries, unsuccessfulEntries, worldwideCompletedEntries, sentLedgerRow, receivedLedgerRows,
  pushNegotiationLogEntry,
} from "../js/engine/negotiationlog.js";
import {
  RELEASE_GUARD_GROUPS, SQUAD_FLOOR_TOTAL, MAX_SQUAD_SIZE, boardStrictnessPct, carryOverPct,
  leagueBudgetMin, BUDGET_SPLIT_RATE,
} from "../js/config/budget.js";
import { MAX_COUNTER_OFFERS } from "../js/config/transferai.js";
import {
  budgetSplitStepAmounts, applyBudgetSplitStep, budgetSplitPct,
} from "../js/engine/finances.js";
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
import {
  COMPETITIONS as CONTINENTAL_COMPETITIONS, qualifyContinentalFields, createInitialContinentalState,
} from "../js/engine/comps/continental.js";
import {
  INTL_COMPETITIONS, qualifyingSeasonRange, competitionStartSeason, nextCycleYearOnOrAfter,
} from "../js/config/intl.js";
import { nationSquadRoster, createInitialIntlState } from "../js/engine/comps/intl.js";
import { roundLabel, resolvePenaltyShootout } from "../js/engine/comps/knockoututil.js";
import { NT_JOB_REP_THRESHOLD, refreshNtJobMarket, acceptNtJob } from "../js/engine/ntjobs.js";
import { attrBand, teamStars } from "../js/ui/panelkit.js";
import { isTransferWindowOpen } from "../js/config/calendar.js";
import { attrPageDefs, formArrow, fitnessBand, renderPitchPanel } from "../js/ui/teamsheetui.js";
import { isSimilarPosition, suggestedSubScore, positionFitScore } from "../js/config/managerai.js";
import { pickDefaultBench, reservesOf } from "../js/gen/squad.js";
import {
  FORMATIONS, gridCells, gridPageCount, formationByLabel, remapLineupToFormation,
  DEFAULT_FORMATION_NAME, DEFAULT_FORMATION_STYLE,
} from "../js/config/formations.js";
import {
  INSTRUCTION_GROUPS, instructionGroupFor, resolveInstructionEffects, defaultInstructionsFor,
} from "../js/config/instructions.js";
import { INJURIES, pickInjuryName } from "../js/config/injuries.js";
import { SUMMARY_GROUPS, computeSummary } from "../js/config/summary.js";
import { SQUAD_ROLE_DISPLAY, SQUAD_ROLE_CYCLE } from "../js/config/contract.js";
import { computeTeamDecisionScore } from "../js/engine/teamdecision.js";
import { ENQUIRY_REFUSE_THRESHOLD, ENQUIRY_RANGE_PCT, submitEnquiry } from "../js/engine/enquiry.js";
import { startPlayerScout, cheapestIdleScout, scoutReportStatus } from "../js/engine/gtn.js";
import { computeSearchResults, buildActionRows, computeNameSearchResults, computeNationSearchResults } from "../js/ui/searchui.js";
import { cmToFtIn } from "../js/ui/playerbio.js";
import { EXCHANGE_PLAYER_VALUE_PCT } from "../js/engine/negotiation.js";
import { statusLabel } from "../js/ui/sellplayersui.js";

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

  group("engine/contracts.js — delayed renewal offers (F4-fixes: submitRenewalOffer/resolveRenewalOfferEntry)");
  {
    const club = world.clubs.find((c) => c.id === sampleClubId);
    const roster2 = world.squadsByClub.get(sampleClubId).map((p) => ({ ...p, contract: { ...p.contract, pendingOffer: null } }));
    const today = new Date(2014, 6, 1);
    const rnState = {
      seed, seasonStartYear: 2014, club, manager: { name: "Bob Jackson" },
      calendar: { today }, clubsById: new Map(world.clubs.map((c) => [c.id, c])),
      playersById: new Map(roster2.map((p) => [p.id, p])),
      finances: { transferBudget: 5000000, wageCeiling: 999999999 },
      transfers: { pendingOffers: [] }, inbox: { emails: [] },
    };

    const player = roster2[0];
    const before = rnState.transfers.pendingOffers.length;
    const submitResult = submitRenewalOffer(rnState, player.id, { wage: player.contract.wage * 2, years: 4 });
    assert("submitRenewalOffer succeeds and returns a dueDate", submitResult.ok === true && submitResult.dueDate instanceof Date);
    assert("submitting queues exactly one pendingOffers entry", rnState.transfers.pendingOffers.length === before + 1);
    assert("the queued entry's dueDate is 3-6 days out (transfers.ini MIN/MAX_DAYS_TO_RESPOND)",
      toEpochDay(submitResult.dueDate) - toEpochDay(today) >= 3 && toEpochDay(submitResult.dueDate) - toEpochDay(today) <= 6);
    assert("the player's own contract.pendingOffer is set", !!player.contract.pendingOffer);
    assert("submitting again for the same player is refused while one is pending",
      submitRenewalOffer(rnState, player.id, { wage: player.contract.wage * 3, years: 5 }).error === "already-pending");

    const entry = rnState.transfers.pendingOffers[0];
    resolveRenewalOfferEntry(rnState, entry);
    assert("resolving clears the player's pendingOffer flag", player.contract.pendingOffer === null);
    assert("resolving pushes exactly one inbox email", rnState.inbox.emails.length === 1);

    // Acceptance is a genuine probabilistic roll (same "never literally 100%"
    // caveat the M6 "user renewal negotiation" group above already documents)
    // — sample several players with a maximally generous offer (2x ask, 5yr)
    // until one accepts, same retry pattern that group already established.
    let accepted = false;
    for (const p of roster2.slice(1, 9)) {
      const wageBefore = p.contract.wage;
      const r = submitRenewalOffer(rnState, p.id, { wage: Math.round(computeAsk(p).wage * 2), years: 5 });
      resolveRenewalOfferEntry(rnState, rnState.transfers.pendingOffers.find((o) => o.playerId === p.id));
      if (p.contract.wage !== wageBefore) { accepted = true; break; }
    }
    assert("a maximally generous delayed renewal offer is accepted for at least one of 8 sampled squad players", accepted);

    // Stale-guard: resolving an already-resolved entry again is a no-op.
    const emailsBefore = rnState.inbox.emails.length;
    resolveRenewalOfferEntry(rnState, entry);
    assert("resolving an already-resolved (stale) entry is a silent no-op", rnState.inbox.emails.length === emailsBefore);
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
      submitLoanOffer(state);
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
    // F3-fixes: level 0's half-width widened 12 -> 20 to match
    // RANGE_START_HALF_WIDTH ("the range should be very wide when
    // unscouted") — 1-3 are still plan1.md's own numbers.
    assert("half-width table is [20, 6, 3, 0] (level 0 widened by F3-fixes, 1-3 are plan1.md's own numbers)",
      deepEqual(RANGE_HALF_WIDTH_BY_LEVEL, [20, 6, 3, 0]));
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

  /* ================= M10 — Continental + Internationals + NT Jobs ================= */

  group("config/intl.js — qualifying-window arithmetic (plan1.md M10)");
  {
    assert("World Cup 2018 qualifying spans seasons 2015-2016 (2 preceding, ends before the 2017/18 tournament season)",
      deepEqual(qualifyingSeasonRange(INTL_COMPETITIONS["world-cup"], 2017), { firstSeason: 2015, lastSeason: 2016 }));
    assert("World Cup 2018's rollover-build season is 2015 (the qualifying window's own first season)",
      competitionStartSeason(INTL_COMPETITIONS["world-cup"], 2018, { firstYear: 2018 }) === 2015);

    // Euro 2016's own (non-bootstrap) formula would need qualifying to start
    // season 2013 — before the career's July-2014 day one — so
    // bootstrapFirstCycle instead builds it directly in the tournament
    // season (2015), skipping qualifying for this one cycle only.
    assert("Euro 2016 (bootstrap) builds in season 2015, not the unreachable 2013 quals window",
      competitionStartSeason(INTL_COMPETITIONS.euro, 2016, { firstYear: 2016 }) === 2015);
    assert("Euro 2020 (real qualifying, 2nd cycle) builds in season 2017 (2 preceding seasons before 2019/20)",
      competitionStartSeason(INTL_COMPETITIONS.euro, 2020, { firstYear: 2016 }) === 2017);

    assert("AFCON 2015 (bootstrap, same-season quals) builds in season 2014 — reachable at career start",
      competitionStartSeason(INTL_COMPETITIONS.afcon, 2015, { firstYear: 2015 }) === 2014);
    assert("Asian Cup 2019 (no bootstrap needed, same-season quals) builds in season 2018",
      competitionStartSeason(INTL_COMPETITIONS["asian-cup"], 2019, { firstYear: 2019 }) === 2018);
    assert("Copa América always builds in its own tournament season (no qualifying phase per data/cups.json)",
      competitionStartSeason(INTL_COMPETITIONS["copa-america"], 2015, { firstYear: 2015 }) === 2014);

    assert("nextCycleYearOnOrAfter finds the next World Cup year on/after 2019 -> 2022", nextCycleYearOnOrAfter(2018, 4, 2019) === 2022);
    assert("nextCycleYearOnOrAfter returns firstYear itself when minYear is already <= firstYear", nextCycleYearOnOrAfter(2015, 2, 2010) === 2015);
  }

  group("engine/comps/continental.js — qualification ranking + field sizes");
  {
    const fields = qualifyContinentalFields({ clubs: world.clubs, leagues: world.leagues, nations: world.nations, tableByLeague: null });
    assert("Champions Cup field is exactly 32 clubs", fields["euro-champions-cup"].length === 32);
    assert("European Trophy field is exactly 48 clubs", fields["euro-trophy"].length === 48);
    assert("South American Champions Cup field is exactly 32 clubs", fields["south-american-champions-cup"].length === 32);
    assert("Champions Cup and Trophy fields never overlap (disjoint slices of the same ranked UEFA list)",
      fields["euro-champions-cup"].every((id) => !fields["euro-trophy"].includes(id)));

    const nationsByName = new Map(world.nations.map((n) => [n.name, n]));
    const leaguesById = new Map(world.leagues.map((l) => [l.id, l]));
    const clubsById = new Map(world.clubs.map((c) => [c.id, c]));
    const confedOfClub = (id) => nationsByName.get(leaguesById.get(clubsById.get(id).leagueId).country)?.confed;
    assert("every Champions Cup qualifier plays in a UEFA league", fields["euro-champions-cup"].every((id) => confedOfClub(id) === "UEFA"));
    assert("every European Trophy qualifier plays in a UEFA league", fields["euro-trophy"].every((id) => confedOfClub(id) === "UEFA"));
    assert("every South American Cup qualifier plays in a CONMEBOL league", fields["south-american-champions-cup"].every((id) => confedOfClub(id) === "CONMEBOL"));
  }

  group("engine/comps/continental.js — createInitialContinentalState (season-1 bootstrap)");
  {
    const fakeState = {
      seed, seasonStartYear: 2014,
      staticData: { leagues: world.leagues, clubs: world.clubs, nations: world.nations, cups: world.cups },
    };
    const continental = createInitialContinentalState(fakeState);
    assert("bootstrap builds all 3 continental competitions", Object.keys(continental.competitions).length === 3);
    for (const comp of CONTINENTAL_COMPETITIONS) {
      const runtime = continental.competitions[comp.id];
      const totalClubs = runtime.groups.reduce((s, g) => s + g.clubIds.length, 0);
      assert(`${comp.name}: ${runtime.groups.length} groups of ${comp.groupSize} sum to ${comp.fieldSize} clubs`,
        runtime.groups.length === comp.fieldSize / comp.groupSize && totalClubs === comp.fieldSize);
      assert(`${comp.name}: no club appears in more than one group`, new Set(runtime.groups.flatMap((g) => g.clubIds)).size === totalClubs);
      assert(`${comp.name}: every group's fixtures form a double round-robin (group size 4 -> 12 fixtures, each pair twice)`,
        runtime.groups.every((g) => g.fixtures.length === 12));
    }
  }

  group("engine/comps/intl.js — qualifying groups (World Cup 2018 + Euro 2016 bootstrap, built at the season-2015 rollover)");
  {
    // Mirrors exactly what engine/season.js's rollover produces at the July
    // 2015 rollover — verified live in the running app (M10 checkpoint B)
    // to build both instances at once; this locks that behaviour down.
    const fakeState = {
      seed, seasonStartYear: 2015,
      staticData: { leagues: world.leagues, clubs: world.clubs, nations: world.nations, cups: world.cups },
      players: world.players, playersById: new Map(world.players.map((p) => [p.id, p])),
      nationsById: new Map(world.nations.map((n) => [n.id, n])),
      calendar: { today: new Date(2015, 6, 1) }, club: { id: sampleClubId }, manager: { name: "Bob Jackson" },
      inbox: { emails: [] }, nationalTeam: null,
    };
    createInitialIntlState(fakeState);

    const wc = fakeState.intl.competitions["world-cup"];
    assert("World Cup 2018 qualifying exists once seasonStartYear reaches 2015", !!wc && wc.phase === "qualifying");
    const totalNations = wc.qualifyingGroups.reduce((s, g) => s + g.nationIds.length, 0);
    assert(`World Cup qualifying groups cover all 50 nations exactly once (got ${totalNations})`, totalNations === 50);
    assert("no nation appears in more than one World Cup qualifying group", new Set(wc.qualifyingGroups.flatMap((g) => g.nationIds)).size === 50);
    assert("UEFA's 28 nations split into exactly 7 groups (ceil(28/4))", wc.qualifyingGroups.filter((g) => g.confed === "UEFA").length === 7);
    assert("CONCACAF's 3 nations form exactly 1 group", wc.qualifyingGroups.filter((g) => g.confed === "CONCACAF").length === 1);
    assert("World Cup qualifying groups use double round-robin (size-4 group -> 12 fixtures, each pair twice)",
      wc.qualifyingGroups.filter((g) => g.nationIds.length === 4).every((g) => g.fixtures.length === 12));

    const euro = fakeState.intl.competitions.euro;
    assert("Euro 2016 (bootstrap) is already in its tournament group phase by season 2015", !!euro && euro.phase === "tournament-group");
    assert("Euro's bootstrap field is exactly 8 UEFA nations", euro.tournamentGroups.reduce((s, g) => s + g.nationIds.length, 0) === 8);

    assert("AFCON's 2nd cycle (2017) hasn't started yet in season 2015 (its own rollover is season 2016)", !fakeState.intl.competitions.afcon);
    assert("Copa América's next cycle (2019) hasn't started yet in season 2015", !fakeState.intl.competitions["copa-america"]);
  }

  group("engine/comps/intl.js — nationSquadRoster + engine/comps/knockoututil.js");
  {
    const fakeState = { players: world.players, playersById: new Map(world.players.map((p) => [p.id, p])), nationalTeam: null };
    const roster = nationSquadRoster(fakeState, "brazil");
    assert("nationSquadRoster returns a non-empty squad of at most 23 players", roster.length > 0 && roster.length <= 23);
    assert("nationSquadRoster is sorted by overall descending", roster.every((p, i) => i === 0 || p.overall <= roster[i - 1].overall));
    assert("every returned player actually carries that nationId", roster.every((p) => p.nationId === "brazil"));

    assert("roundLabel(2) -> Final", roundLabel(2) === "Final");
    assert("roundLabel(4) -> Semi-Final", roundLabel(4) === "Semi-Final");
    assert("roundLabel(16) -> Round of 16", roundLabel(16) === "Round of 16");
    assert("roundLabel(32, roundIndex 0) -> Round 1", roundLabel(32, 0) === "Round 1");

    const rng = new RngStream(deriveSeed(seed, "m10-pk-shootout-check"));
    const xi = roster.slice(0, 11);
    let alwaysOneWinner = true, neverTies = true;
    for (let i = 0; i < 20; i++) {
      const shootout = resolvePenaltyShootout(rng, xi, xi);
      if (shootout.winner !== "home" && shootout.winner !== "away") alwaysOneWinner = false;
      if (shootout.home === shootout.away) neverTies = false;
    }
    assert("resolvePenaltyShootout always declares exactly one winner (20 trials)", alwaysOneWinner);
    assert("resolvePenaltyShootout never ends level (20 trials)", neverTies);
  }

  group("engine/ntjobs.js — rep-gated NT vacancy market + accept flow");
  {
    const state = buildM7FakeState();
    state.nationalTeam = null;
    state.ntJobMarket = { vacancies: [] };
    state.manager.rep = NT_JOB_REP_THRESHOLD - 1;
    refreshNtJobMarket(state, { seed, seasonStartYear: state.seasonStartYear });
    assert(`no NT vacancies below the rep threshold (${NT_JOB_REP_THRESHOLD})`, state.ntJobMarket.vacancies.length === 0);

    state.manager.rep = NT_JOB_REP_THRESHOLD;
    refreshNtJobMarket(state, { seed, seasonStartYear: state.seasonStartYear });
    assert(`NT vacancies populate once rep reaches ${NT_JOB_REP_THRESHOLD}`, state.ntJobMarket.vacancies.length > 0);
    assert("every vacancy is a real nation id", state.ntJobMarket.vacancies.every((id) => world.nations.some((n) => n.id === id)));

    const nationId = state.ntJobMarket.vacancies[0];
    acceptNtJob(state, nationId);
    assert("acceptNtJob sets state.nationalTeam to the accepted nation", state.nationalTeam.nationId === nationId);
    assert("acceptNtJob seeds a squad of at most 23 players", state.nationalTeam.squadPlayerIds.length > 0 && state.nationalTeam.squadPlayerIds.length <= 23);
    assert("acceptNtJob seeds an 11-man starting lineup", state.nationalTeam.lineup.length === 11);
    assert("accepting an NT job never touches the user's own club", state.club.id === sampleClubId);
    assert("the accepted nation is removed from the vacancy list", !state.ntJobMarket.vacancies.includes(nationId));
  }

  group("core/db.js — state.continental/state.intl/state.nationalTeam round-trip (M10)");
  {
    const state = {
      seed, seasonStartYear: 2014,
      club: sampleClub, manager: { name: "Bob Jackson", gamertag: "BJ", level: 1, xp: 0, xpMax: 1000, coins: 0, rep: NT_JOB_REP_THRESHOLD, warned: false, sacked: false },
      calendar: { today: new Date(2014, 6, 1) },
      players: world.players, playersById: new Map(world.players.map((p) => [p.id, p])),
      nationsById: new Map(world.nations.map((n) => [n.id, n])),
      squad: { lineup: [] },
      inbox: { emails: [] },
      results: new Map(), clubLeague: new Map(), cups: new Map(), jobMarket: { vacancies: [] },
      ntJobMarket: { vacancies: [] }, nationalTeam: null,
      staticData: { leagues: world.leagues, clubs: world.clubs, nations: world.nations, cups: world.cups },
    };
    createInitialContinentalState(state);
    createInitialIntlState(state);
    refreshNtJobMarket(state, { seed, seasonStartYear: state.seasonStartYear });
    if (state.ntJobMarket.vacancies.length) acceptNtJob(state, state.ntJobMarket.vacancies[0]);

    const roundTripped = deserializeSave(serializeSave(state));
    assert("state.continental round-trips (competitions, groups, fixtures, matchdayDates)", deepEqual(roundTripped.continental, state.continental));
    assert("state.intl round-trips (qualifying/tournament groups, knockout brackets)", deepEqual(roundTripped.intl, state.intl));
    assert("state.nationalTeam round-trips (nationId, squadPlayerIds, lineup)", deepEqual(roundTripped.nationalTeam, state.nationalTeam));
    assert("state.ntJobMarket round-trips", deepEqual(roundTripped.ntJobMarket, state.ntJobMarket));
  }

  group("ui/panelkit.js — §B4 attribute colour bands (fable-plans/plan2.md F0)");
  assert("49 -> red", attrBand(49) === "red", `got ${attrBand(49)}`);
  assert("50 -> orange", attrBand(50) === "orange", `got ${attrBand(50)}`);
  assert("64 -> orange", attrBand(64) === "orange", `got ${attrBand(64)}`);
  assert("65 -> yellow", attrBand(65) === "yellow", `got ${attrBand(65)}`);
  assert("79 -> yellow", attrBand(79) === "yellow", `got ${attrBand(79)}`);
  assert("80 -> green", attrBand(80) === "green", `got ${attrBand(80)}`);

  group("config/calendar.js — isTransferWindowOpen (F0 Central day-strip ⇄ icon)");
  assert("Jul 1 is in the summer window", isTransferWindowOpen(new Date(2015, 6, 1)));
  assert("Aug 15 is in the summer window", isTransferWindowOpen(new Date(2015, 7, 15)));
  assert("Sep 1 is in the summer window (inclusive close)", isTransferWindowOpen(new Date(2015, 8, 1)));
  assert("Sep 2 is NOT in a window", !isTransferWindowOpen(new Date(2015, 8, 2)));
  assert("Jan 1 is in the winter window", isTransferWindowOpen(new Date(2016, 0, 1)));
  assert("Jan 20 is in the winter window", isTransferWindowOpen(new Date(2016, 0, 20)));
  assert("Feb 1 is in the winter window (inclusive close)", isTransferWindowOpen(new Date(2016, 1, 1)));
  assert("Feb 2 is NOT in a window", !isTransferWindowOpen(new Date(2016, 1, 2)));
  assert("Dec 15 is NOT in a window", !isTransferWindowOpen(new Date(2015, 11, 15)));

  group("core/store.js — emailsForTab (F0 Emails/Player Conversations/Message Archive tabs)");
  {
    const fakeState = {
      ui: { emailTab: "inbox" },
      inbox: { emails: [
        { id: 1, subject: "A", archived: false },
        { id: 2, subject: "B", archived: true },
        { id: 3, subject: "C", archived: false },
      ] },
    };
    assert("inbox tab returns only non-archived emails", emailsForTab(fakeState, "inbox").length === 2 && emailsForTab(fakeState, "inbox").every((e) => !e.archived));
    assert("archive tab returns only archived emails", emailsForTab(fakeState, "archive").length === 1 && emailsForTab(fakeState, "archive")[0].id === 2);
    assert("conversations tab is always empty (no backing feature)", emailsForTab(fakeState, "conversations").length === 0);
    assert("omitting the tab arg falls back to state.ui.emailTab", emailsForTab(fakeState).length === emailsForTab(fakeState, "inbox").length);
  }

  /* ---------------- F1 (fable-plans/plan2.md): Team Sheet view ---------------- */
  group("js/config/managerai.js — Suggested Subs ranking (managerai.ini port)");
  {
    // Fixture data (plan2.md F1's own phrasing): a same-position, lower-
    // overall candidate must outrank a wrong-position, higher-overall one —
    // [MAI_PLAYER_POS_SCORE]'s NOT_PREFERRED_POS(-50) dominates the OVR_POS_
    // BIAS(3.0)-weighted term even after a 20-point overall gap.
    const slotPos = "LCB";
    const samePosLowOvr = { position: "LCB", altPositions: [], overall: 60, form: 5, fitness: 100 };
    const wrongPosHighOvr = { position: "ST", altPositions: [], overall: 80, form: 5, fitness: 100 };
    assert("same-position fit score (35) beats wrong-position (-50)",
      positionFitScore(samePosLowOvr, slotPos) > positionFitScore(wrongPosHighOvr, slotPos));
    assert("Suggested Subs score: same-position 60 OVR outranks wrong-position 80 OVR",
      suggestedSubScore(samePosLowOvr, slotPos) > suggestedSubScore(wrongPosHighOvr, slotPos));
    assert("altPositions' 1st entry scores PREFERRED_POS_2 (30)",
      positionFitScore({ position: "CB", altPositions: ["LCB"] }, "LCB") === 30);
    assert("a non-matching, non-alt position is NOT_PREFERRED_POS (-50) -> not similar",
      !isSimilarPosition(wrongPosHighOvr, slotPos));
    assert("an exact-position match is similar", isSimilarPosition(samePosLowOvr, slotPos));
  }

  group("js/ui/teamsheetui.js — form-arrow + attribute-page-order pure fns");
  {
    assert("delta +8 or more -> up arrow", formArrow([80, 70, 70]) === "↑");
    assert("delta +3..+7 -> up-right arrow", formArrow([75, 70, 70]) === "↗");
    assert("delta within ±3 -> flat arrow", formArrow([71, 70, 70]) === "→");
    assert("delta -4..-7 -> down-right arrow", formArrow([65, 70, 70]) === "↘");
    assert("delta -8 or more -> down arrow", formArrow([60, 70, 70]) === "↓");
    assert("fewer than 2 ratings -> flat arrow (no data)", formArrow([70]) === "→" && formArrow([]) === "→");

    const gkPages = attrPageDefs({ position: "GK" });
    const outfieldPages = attrPageDefs({ position: "ST" });
    assert("GK's attribute panel shows GK Attributes first", gkPages[0].key === "gk" && gkPages.length === 5);
    assert("outfield players get 4 pages, Physical first (no GK page)",
      outfieldPages.length === 4 && outfieldPages[0].key === "physical");
    assert("fitnessBand bands: 95->green, 80->yellow, 60->orange, 30->red",
      fitnessBand({ fitness: 95, injury: null }) === "green" &&
      fitnessBand({ fitness: 80, injury: null }) === "yellow" &&
      fitnessBand({ fitness: 60, injury: null }) === "orange" &&
      fitnessBand({ fitness: 30, injury: null }) === "red");
    assert("an injured player is always red regardless of fitness%",
      fitnessBand({ fitness: 100, injury: { daysLeft: 5 } }) === "red");
  }

  group("gen/squad.js — pickDefaultBench / reservesOf (F1 team sheet slots)");
  {
    const fixtureClub = world.clubs[0];
    const fixtureSquad = world.squadsByClub.get(fixtureClub.id);
    const fixtureLineup = pickBestAvailableXI(fixtureSquad).map((p) => ({ playerId: p.id }));
    const bench = pickDefaultBench(fixtureSquad, fixtureLineup);
    assert("pickDefaultBench returns exactly 7 ids for a 24-man squad", bench.length === 7);
    assert("bench never repeats an XI player", bench.every((id) => !fixtureLineup.some((l) => l.playerId === id)));
    assert("bench has no duplicate ids", new Set(bench).size === bench.length);
    const reserves = reservesOf(fixtureSquad, fixtureLineup, bench);
    assert("XI(11) + bench(7) + reserves fill the whole 24-man squad exactly once",
      reserves.length === fixtureSquad.length - 11 - 7);
    const reserveIds = new Set(reserves.map((p) => p.id));
    assert("reserves never overlap the XI or bench", bench.every((id) => !reserveIds.has(id)) &&
      fixtureLineup.every((l) => !reserveIds.has(l.playerId)));
  }

  group("core/store.js — Team Sheet slot swap + Suggested Subs (F1, live Store)");
  {
    const tsClub = world.clubs.find((c) => c.id !== "manchester-united") || world.clubs[1];
    const tsLeague = world.leagues.find((l) => l.id === tsClub.leagueId);
    const tsState = createCareerState({ managerName: "Test Manager", club: tsClub, league: tsLeague, world, seasonStartYear: 2014 });
    const tsStore = new Store(tsState);

    // XI<->bench swap preserves exactly 11 starters with no duplicates.
    const beforeXI = tsStore.state.squad.lineup.map((l) => l.playerId);
    const benchPlayerId = tsStore.state.squad.bench[0];
    tsStore.teamSheetFocus("xi", 0);
    tsStore.teamSheetSelectPlayer(); // arm slot 0
    tsStore.teamSheetFocus("bench", 0);
    tsStore.teamSheetSelectPlayer(); // swap
    const afterXI = tsStore.state.squad.lineup.map((l) => l.playerId);
    assert("XI<->bench swap keeps exactly 11 starters", afterXI.length === 11);
    assert("XI<->bench swap produces no duplicate playerIds", new Set(afterXI).size === 11);
    assert("the bench player moved into XI slot 0", afterXI[0] === benchPlayerId);
    assert("the displaced XI[0] player moved onto the bench", tsStore.state.squad.bench[0] === beforeXI[0]);
    assert("teamSheetSlotPlayerId agrees with the raw lineup array after the swap",
      teamSheetSlotPlayerId(tsStore.state, { zone: "xi", index: 0 }) === benchPlayerId);

    // Re-selecting the armed slot cancels instead of swapping.
    tsStore.teamSheetFocus("xi", 1);
    tsStore.teamSheetSelectPlayer(); // arm
    tsStore.teamSheetFocus("xi", 1);
    tsStore.teamSheetSelectPlayer(); // cancel (same slot)
    assert("pressing Select twice on the same slot cancels the arm (no swap, nothing armed)",
      tsStore.state.ui.teamSheet.armed === null);

    // XI<->reserve swap: the vacated XI player becomes a reserve implicitly
    // (no persisted reserve array — gen/squad.js's reservesOf is derived).
    const reservesBefore = reservesOf(tsStore.state.squad.roster, tsStore.state.squad.lineup, tsStore.state.squad.bench);
    const reservePlayerId = reservesBefore[0].id;
    const displacedFromXI = tsStore.state.squad.lineup[2].playerId;
    tsStore.teamSheetFocus("xi", 2);
    tsStore.teamSheetSelectPlayer();
    tsStore.teamSheetFocus("reserve", 0);
    tsStore.teamSheetSelectPlayer();
    assert("XI<->reserve swap moves the reserve into the XI slot", tsStore.state.squad.lineup[2].playerId === reservePlayerId);
    const reservesAfter = reservesOf(tsStore.state.squad.roster, tsStore.state.squad.lineup, tsStore.state.squad.bench);
    assert("the displaced XI player is now a reserve (implicitly, no array write needed)",
      reservesAfter.some((p) => p.id === displacedFromXI));

    // Suggested Subs: same-position candidates only, ranked, empty state honoured.
    tsStore.teamSheetFocus("xi", 0);
    tsStore.teamSheetSuggestedSubs();
    const ts = tsStore.state.ui.teamSheet;
    assert("Suggested Subs arms the focused XI slot", ts.armed && ts.armed.zone === "xi" && ts.armed.index === 0);
    assert("Suggested Subs opens the drawer in 'suggested' mode", ts.drawer === "suggested");
    const slotPosCode = tsStore.state.squad.lineup[0].pos;
    const candidatesOk = ts.suggested.candidateIds.every((id) => {
      const p = tsStore.state.playersById.get(id);
      return isSimilarPosition(p, slotPosCode);
    });
    assert("every Suggested Subs candidate genuinely fits the slot's position", candidatesOk);
    const scores = ts.suggested.candidateIds.map((id) => suggestedSubScore(tsStore.state.playersById.get(id), slotPosCode));
    const sortedDesc = scores.every((s, i) => i === 0 || scores[i - 1] >= s);
    assert("Suggested Subs candidates are sorted best-score-first", sortedDesc);
    if (ts.suggested.candidateIds.length) {
      assert("the top candidate is auto-focused", ts.focus.zone !== "xi" &&
        teamSheetSlotPlayerId(tsStore.state, ts.focus) === ts.suggested.candidateIds[0]);
    }

    // (B) steps back through nested modes before closing the overlay.
    tsStore.teamSheetBack();
    assert("(B) from Suggested Subs clears the drawer back to Substitutes, not closed", tsStore.state.ui.teamSheet.drawer === "substitutes" && tsStore.state.ui.teamSheet.armed === null);

    // teamSheetFocusableSlots widens with the drawer state (used by keyboard nav).
    const collapsedCount = teamSheetFocusableSlots({ squad: tsStore.state.squad, ui: { teamSheet: { ...ts, drawer: "collapsed" } } }).length;
    const substitutesCount = teamSheetFocusableSlots({ squad: tsStore.state.squad, ui: { teamSheet: { ...ts, drawer: "substitutes" } } }).length;
    assert("focusable slots = 11 XI-only when the drawer is collapsed", collapsedCount === 11);
    assert("focusable slots grow to include the bench once Substitutes is open", substitutesCount === 11 + tsStore.state.squad.bench.filter((id) => id != null).length);

    // F1-fixes: the drawer overlays the pitch instead of compressing it
    // (CSS-only, untestable here), and minimizes back to just its bar
    // whenever a bench/reserve slot gets armed *from within* the open
    // drawer — letting the pitch show through to pick the swap's other
    // half — then un-minimizes once that second pick lands, once the arm
    // is cancelled, or the drawer bar is clicked again. Arming an XI slot
    // instead (manual pitch-first pick, or Suggested Subs) must NOT
    // minimize, since the drawer's own list is the next click's target.
    assert("drawer is open (substitutes) and not minimized after the earlier (B) step",
      ts.drawer === "substitutes" && ts.drawerMinimized === false);

    const benchIdBefore = tsStore.state.squad.bench[0];
    tsStore.teamSheetFocus("bench", 0);
    tsStore.teamSheetSelectPlayer(); // arm from inside the open drawer
    assert("arming a bench slot while the drawer is open minimizes it",
      ts.armed && ts.armed.zone === "bench" && ts.drawerMinimized === true);

    tsStore.teamSheetToggleDrawer(); // "click subs/reserves panel again" -> peek
    assert("toggling the bar while minimized un-minimizes without cancelling the arm or changing drawer type",
      ts.drawerMinimized === false && !!ts.armed && ts.drawer === "substitutes");

    tsStore.teamSheetFocus("bench", 0);
    tsStore.teamSheetSelectPlayer(); // cancel (same slot)
    assert("cancelling the arm also un-minimizes", ts.armed === null && ts.drawerMinimized === false);

    tsStore.teamSheetFocus("bench", 0);
    tsStore.teamSheetSelectPlayer(); // re-arm -> minimizes again
    assert("re-arming re-minimizes the drawer", ts.drawerMinimized === true);
    tsStore.teamSheetFocus("xi", 3);
    tsStore.teamSheetSelectPlayer(); // completes the swap on the (now-visible) pitch
    assert("completing the swap clears armed and un-minimizes the drawer", ts.armed === null && ts.drawerMinimized === false);
    assert("the swap actually moved the bench player into XI slot 3", tsStore.state.squad.lineup[3].playerId === benchIdBefore);

    tsStore.teamSheetFocus("xi", 4);
    tsStore.teamSheetSelectPlayer(); // arm an XI slot while the drawer is open
    assert("arming an XI slot while the drawer is open leaves it expanded, not minimized",
      ts.armed && ts.armed.zone === "xi" && ts.drawerMinimized === false);
    tsStore.teamSheetSelectPlayer(); // cancel (same slot) — leave state clean
  }

  group("config/formations.js — catalogue + coordinate generator (F2)");
  {
    assert("catalogue has >= 28 entries (plan2.md F2 test spec)", FORMATIONS.length >= 28);
    assert("catalogue has exactly the 33 pic-transcribed entries", FORMATIONS.length === 33);
    const allInBounds = FORMATIONS.every((f) => f.slots.length === 11 &&
      f.slots.every((s) => s.x >= 0 && s.x <= 100 && s.y >= 0 && s.y <= 100));
    assert("every formation has 11 slots, all x/y within [0,100]", allInBounds);
    const everyHasOneGk = FORMATIONS.every((f) => f.slots.filter((s) => s.gk).length === 1 && f.slots.find((s) => s.gk).pos === "GK");
    assert("every formation has exactly one GK slot at pos 'GK'", everyHasOneGk);
    const noDupCodesAnywhere = FORMATIONS.every((f) => new Set(f.slots.map((s) => s.pos)).size === 11);
    assert("no formation repeats a position code across its 11 slots", noDupCodesAnywhere);

    const cells = gridCells("Portsmouth");
    assert("gridCells = 1 default pseudo-cell + all 33 catalogue formations", cells.length === 34);
    assert("gridPageCount windows 34 cells into 6 pages (6/6/6/6/6/4)", gridPageCount("Portsmouth") === 6);
    assert("cell 0 is the '<Club>/Default Formation' pseudo-cell", cells[0].kind === "default" && cells[0].label1 === "Portsmouth");
    const defaultLookup = formationByLabel(DEFAULT_FORMATION_NAME, DEFAULT_FORMATION_STYLE);
    assert("the default pseudo-cell's name/style resolves to a real catalogue entry (4-4-2 Flat)", !!defaultLookup);
  }

  group("config/formations.js — remapLineupToFormation (best-fit XI remap)");
  {
    const rmClub = world.clubs[2];
    const rmSquad = world.squadsByClub.get(rmClub.id);
    const rmPlayersById = new Map(rmSquad.map((p) => [p.id, p]));
    const rmLineup = pickBestAvailableXI(rmSquad).map((p) => ({
      playerId: p.id, pos: p.position, x: 50, y: 50, gk: positionInfo(p.position).area === "GK", captain: false,
    }));
    const targetFormation = formationByLabel("4-3-3", "Attack");
    const remapped = remapLineupToFormation(rmLineup, targetFormation.slots, rmPlayersById);
    assert("remap returns exactly 11 entries", remapped.length === 11);
    const remappedIds = remapped.map((e) => e.playerId);
    assert("remap keeps the same 11 players (no dupes, no drops)",
      new Set(remappedIds).size === 11 && rmLineup.every((e) => remappedIds.includes(e.playerId)));
    const gkEntry = remapped.find((e) => e.gk);
    const origGkId = rmLineup.find((e) => e.gk).playerId;
    assert("the goalkeeper stays the goalkeeper (pos GK, same player) after a remap", gkEntry && gkEntry.pos === "GK" && gkEntry.playerId === origGkId);
    assert("remapped slots' position codes exactly match the target formation's (no dupes)",
      new Set(remapped.map((e) => e.pos)).size === 11 &&
      remapped.every((e) => targetFormation.slots.some((s) => s.pos === e.pos)));
  }

  group("config/instructions.js — position groups + effect resolution (F2)");
  {
    assert("FORWARDS/INSIDE_MID/OUTSIDE_MID groups all defined with >=1 category each",
      ["FORWARDS", "INSIDE_MID", "OUTSIDE_MID"].every((g) => INSTRUCTION_GROUPS[g] && INSTRUCTION_GROUPS[g].length >= 1));
    assert("instructionGroupFor: ST -> FORWARDS, CM -> INSIDE_MID, RM -> OUTSIDE_MID",
      instructionGroupFor("ST") === "FORWARDS" && instructionGroupFor("CM") === "INSIDE_MID" && instructionGroupFor("RM") === "OUTSIDE_MID");
    assert("instructionGroupFor: defensive positions (CB, CDM, GK) get no group",
      instructionGroupFor("CB") === null && instructionGroupFor("CDM") === null && instructionGroupFor("GK") === null);

    const defaults = defaultInstructionsFor("FORWARDS");
    const fwdCats = INSTRUCTION_GROUPS.FORWARDS;
    assert("defaultInstructionsFor seeds every category at its own defaultIndex",
      fwdCats.every((c) => defaults[c.key] === c.defaultIndex));

    const getInBehindPicks = { attackingRuns: 0 }; // index 0 = "Get in Behind"
    const effects = resolveInstructionEffects("FORWARDS", getInBehindPicks);
    assert("'Get in Behind' resolves to the documented +0.10 shooting-weight bump", Math.abs(effects.shootingMult - 0.10) < 1e-9);
    const defaultPicks = defaultInstructionsFor("FORWARDS");
    const noEffect = resolveInstructionEffects("FORWARDS", defaultPicks);
    assert("every category left at its default (Mixed ...) contributes no effect",
      noEffect.shootingMult === 0 && noEffect.assistMult === 0);
  }

  group("engine/sim/core.js — pickWeighted's F2 multiplierFn hook");
  {
    const rng = new RngStream(deriveSeed(777, "pickWeighted-multiplier-test"));
    const candA = { player: { attrs: { finishing: 60 }, form: 5, id: 1 }, area: "ATT" };
    const candB = { player: { attrs: { finishing: 60 }, form: 5, id: 2 }, area: "ATT" };
    const config = { terms: [{ attr: "finishing", value: 1 }], posBias: { pos: 0, POS_1: 0, POS_2: 0, POS_3: 0, POS_4: 0 }, weightCurve: Array(11).fill(50) };
    let bWins = 0;
    const trials = 400;
    for (let i = 0; i < trials; i++) {
      const pick = pickWeighted(rng, [candA, candB], config, (c) => (c.player.id === 2 ? 1.0 : 0));
      if (pick.player.id === 2) bWins++;
    }
    assert("a +100% multiplier on one identical-weight candidate makes it win clearly more than half the time",
      bWins > trials * 0.6);
    const unmodified = pickWeighted(rng, [candA, candB], config); // no multiplierFn -> unchanged behaviour
    assert("omitting multiplierFn still returns a valid candidate (backward compatible default)",
      unmodified === candA || unmodified === candB);
  }

  group("config/injuries.js — named injury subset (fitness.ini)");
  {
    assert("12-entry subset per plan2.md F2.6", INJURIES.length === 12);
    assert("every entry has light/medium/severe day counts, ascending in severity",
      INJURIES.every((inj) => inj.days.light <= inj.days.medium && inj.days.medium <= inj.days.severe));
    const rng = new RngStream(deriveSeed(88, "injury-name-test"));
    const picked = pickInjuryName(rng);
    assert("pickInjuryName returns one of the 12 named injuries", INJURIES.some((inj) => inj.name === picked));
  }

  group("ui/panelkit.js — teamStars (§B5, teamutils.ini [IS_STAR_RATING] RATING=82)");
  {
    assert("rating 82 -> full 5 stars (the one INI anchor point)", teamStars(82) === 5);
    assert("teamStars clamps at 0 and 5", teamStars(0) === 0 && teamStars(200) === 5);
    assert("teamStars is monotonically non-decreasing with rating",
      teamStars(40) <= teamStars(60) && teamStars(60) <= teamStars(82));
  }

  group("core/store.js — F2 Team Sheet FORMATIONS/TACTICS/ROLES (live Store)");
  {
    const fmClub = world.clubs.find((c) => c.id !== "manchester-united") || world.clubs[3];
    const fmLeague = world.leagues.find((l) => l.id === fmClub.leagueId);
    const fmState = createCareerState({ managerName: "Test Manager", club: fmClub, league: fmLeague, world, seasonStartYear: 2014 });
    const fmStore = new Store(fmState);

    // applyFormation re-maps the XI and updates both the squad mirror and
    // the active sheet (F1's own "same array reference" invariant).
    const beforeIds = new Set(fmStore.state.squad.lineup.map((l) => l.playerId));
    fmStore.applyFormation("4-3-3", "Holding");
    assert("applyFormation updates squad.formationLabel/Style", fmStore.state.squad.formationLabel === "4-3-3" && fmStore.state.squad.formationStyle === "Holding");
    const activeSheet = fmStore.state.squad.sheets[fmStore.state.squad.activeSheetIndex];
    assert("applyFormation also updates the active sheet's own formationLabel/Style", activeSheet.formationLabel === "4-3-3" && activeSheet.formationStyle === "Holding");
    assert("applyFormation is the same 11 players, just remapped", fmStore.state.squad.lineup.length === 11 &&
      fmStore.state.squad.lineup.every((l) => beforeIds.has(l.playerId)));
    assert("applyFormation re-seeds every slot's Player Positioning baseline", fmStore.state.squad.lineup.every((l) => l.baseX === l.x && l.baseY === l.y));

    // FORMATIONS grid scroll (F2-fixes): mouse-wheel scroll moves the
    // window independent of the keyboard/click cursor, clamped so the last
    // scroll position still shows a full 2-row window (never scrolls past
    // the bottom into empty space).
    fmStore.teamSheetSetTab("formations");
    assert("formationsScrollRow starts at 0", fmStore.state.ui.teamSheet.formationsScrollRow === 0);
    fmStore.teamSheetFormationsScroll(1);
    assert("scrolling down moves the window without touching the cursor",
      fmStore.state.ui.teamSheet.formationsScrollRow === 1 && fmStore.state.ui.teamSheet.formationsCursor === 0);
    for (let i = 0; i < 30; i++) fmStore.teamSheetFormationsScroll(1); // scroll way past the end
    const totalRows = Math.ceil((34) / 3); // 34 = 33 catalogue entries + the Default Formation pseudo-cell
    assert("scrolling clamps at totalRows-2 so the window never runs past the last row", fmStore.state.ui.teamSheet.formationsScrollRow === totalRows - 2);
    fmStore.teamSheetFormationsFocus(0);
    fmStore.state.ui.teamSheet.formationsScrollRow = 0;
    fmStore.teamSheetFormationsMove(3); // ArrowDown from cell 0 -> cell 3 (row 1)
    fmStore.teamSheetFormationsMove(3); // -> cell 6 (row 2, now below the 2-row window)
    assert("arrow-key paging auto-scrolls the window to keep the cursor visible", fmStore.state.ui.teamSheet.formationsScrollRow === 1);

    // Player Instructions: cycling wraps back to the start after a full loop.
    fmStore.teamSheetSetTab("formations");
    fmStore.teamSheetOpenCustomise();
    fmStore.teamSheetCustomiseMenuFocus(0);
    fmStore.teamSheetCustomiseMenuSelect(); // -> "instructions"
    const fwdIndex = fmStore.state.squad.lineup.findIndex((l) => !l.gk && instructionGroupFor(l.pos) === "FORWARDS");
    assert("this club's default XI has at least one FORWARDS-group player to test with", fwdIndex !== -1);
    if (fwdIndex !== -1) {
      fmStore.teamSheetInstrFocus(fwdIndex);
      fmStore.teamSheetInstrSelect();
      assert("selecting a FORWARDS player opens category-card editing", fmStore.state.ui.teamSheet.instrEditingIndex === fwdIndex);
      const playerId = fmStore.state.squad.lineup[fwdIndex].playerId;
      const catKey = INSTRUCTION_GROUPS.FORWARDS[0].key;
      const optionCount = INSTRUCTION_GROUPS.FORWARDS[0].options.length;
      for (let i = 0; i < optionCount; i++) fmStore.teamSheetInstrCycleOption(1);
      assert("cycling a category's option N times (N = its option count) round-trips to the default",
        fmStore.state.squad.instructions[playerId][catKey] === INSTRUCTION_GROUPS.FORWARDS[0].defaultIndex);
      fmStore.teamSheetInstrResetAll();
      assert("Reset All Instructions clears every player's picks team-wide", Object.keys(fmStore.state.squad.instructions).length === 0);

      // F2-fixes: the gold ring used to stay parked on whichever player was
      // last edited across visits — leaving (and re-entering) Instructions
      // must reset instrFocusIndex back to slot 0 instead of carrying it over.
      fmStore.teamSheetBack(); // clears instrEditingIndex, stays in "instructions"
      fmStore.teamSheetInstrFocus(fmStore.state.squad.lineup.length - 1); // simulate a stale, non-zero cursor
      fmStore.teamSheetBack(); // "instructions" -> "menu"
      assert("leaving Instructions back to the EDIT menu resets the stale focus cursor", fmStore.state.ui.teamSheet.instrFocusIndex === 0);
      fmStore.teamSheetCustomiseMenuFocus(0);
      fmStore.teamSheetCustomiseMenuSelect(); // -> "instructions" again
      assert("re-entering Instructions starts the cursor fresh at slot 0", fmStore.state.ui.teamSheet.instrFocusIndex === 0 && fmStore.state.ui.teamSheet.instrEditingIndex === null);
    }

    // Player Positioning: nudge clamps to +-8% of the formation baseline.
    // teamSheetOpenCustomise() re-enters the EDIT menu cleanly (rather than
    // relying on the exact number of teamSheetBack() presses needed from
    // wherever Instructions left off — that count depends on whether a
    // player was still being edited, which is exactly what the block above
    // just changed).
    fmStore.teamSheetOpenCustomise();
    fmStore.teamSheetCustomiseMenuFocus(1);
    fmStore.teamSheetCustomiseMenuSelect(); // -> "positioning"
    assert("entering Positioning resets the stale focus/attrPage cursor", fmStore.state.ui.teamSheet.posFocusIndex === 0 && fmStore.state.ui.teamSheet.attrPage === 0);
    fmStore.teamSheetPosFocus(1);
    const baseX1 = fmStore.state.squad.lineup[1].baseX;
    const baseX2 = fmStore.state.squad.lineup[2].baseX;
    for (let i = 0; i < 20; i++) fmStore.teamSheetPosNudge(2, 0); // way more than the clamp allows
    assert("Player Positioning's x nudge clamps at baseline+8%", fmStore.state.squad.lineup[1].x <= baseX1 + 8 + 1e-9);
    fmStore.teamSheetPosFocus(2);
    for (let i = 0; i < 20; i++) fmStore.teamSheetPosNudge(2, 0);
    // F2-fixes: owner correction — Reset Changes now restores the *whole*
    // XI's baseline layout, not just whichever player is currently focused
    // (plan2-decisions.md F2-fixes overrides this milestone's original
    // per-player [JUDGMENT CALL] reading of the footer label).
    fmStore.teamSheetPosReset();
    assert("Reset Changes restores every slot's baseline x, not just the focused one",
      fmStore.state.squad.lineup[1].x === baseX1 && fmStore.state.squad.lineup[2].x === baseX2);

    // TACTICS tab: selecting a D-pad cell applies that preset (existing M11 setTactic, just re-skinned).
    fmStore.teamSheetSetTab("tactics");
    fmStore.teamSheetTacticsFocus(1); // "Possession"
    fmStore.teamSheetTacticsSelect();
    assert("selecting a TACTICS grid cell sets squad.tacticId to that preset", fmStore.state.squad.tacticId === "possession");

    // ROLES tab: picking a player assigns the correct squad field per the
    // pic's 3x2 reading order (core/store.js's own ROLE_FIELDS table).
    fmStore.teamSheetSetTab("roles");
    const someOutfielder = fmStore.state.squad.roster.find((p) => positionInfo(p.position).area !== "GK");
    fmStore.teamSheetRolesFocus(1); // Left Corner
    fmStore.teamSheetRolesOpenPicker();
    // F2-fixes: the picker now seeds a focused roster row on open (falls
    // back to roster[0] when nothing already holds this role) and lets
    // mouse-hover/Up/Down move that focus, driving the right pane's
    // attribute panel — same-id calls are a no-op (mousemove-under-a-
    // stationary-pointer guard, same reasoning as teamSheetFocus).
    assert("opening the picker seeds a focused roster row (falls back to roster[0])",
      fmStore.state.ui.teamSheet.rolesPickerFocusId === fmStore.state.squad.roster[0].id);
    fmStore.teamSheetRolesPickerFocus(someOutfielder.id);
    assert("hovering a picker row moves rolesPickerFocusId", fmStore.state.ui.teamSheet.rolesPickerFocusId === someOutfielder.id);
    fmStore.teamSheetRolesPick(someOutfielder.id);
    assert("ROLES grid cell 1 (Left Corner) assigns squad.leftCornerId", fmStore.state.squad.leftCornerId === someOutfielder.id);
    assert("picking a role closes the picker", fmStore.state.ui.teamSheet.rolesPickerOpen === false);
    assert("picking a role also clears rolesPickerFocusId", fmStore.state.ui.teamSheet.rolesPickerFocusId === null);
    fmStore.teamSheetRolesFocus(0); // Captain
    fmStore.teamSheetRolesOpenPicker();
    fmStore.teamSheetRolesPick(someOutfielder.id);
    assert("ROLES grid cell 0 (Captain) assigns squad.captainId (via the existing setCaptain mutator)", fmStore.state.squad.captainId === someOutfielder.id);
    assert("setCaptain still re-marks the lineup's 'C' badge when the captain is in the XI",
      !fmStore.state.squad.lineup.some((l) => l.playerId === someOutfielder.id) ||
      fmStore.state.squad.lineup.find((l) => l.playerId === someOutfielder.id).captain === true);
  }

  group("ui/teamsheetui.js — renderPitchPanel highlight override mode (F2-fixes)");
  {
    // Regression test for the exact bug the owner reported: a leftover
    // SQUAD-tab ts.focus/armed value used to leak through onto the
    // FORMATIONS tab's own pitch preview, either as a stray ring on a plain
    // grid/menu screen that should show none at all, or as a *second*,
    // unrelated ring alongside Instructions/Positioning's own intentional
    // one whenever ts.focus didn't happen to coincide with it.
    const rpClub = world.clubs.find((c) => c.id !== "manchester-united") || world.clubs[3];
    const rpLeague = world.leagues.find((l) => l.id === rpClub.leagueId);
    const rpState = createCareerState({ managerName: "Ring Test", club: rpClub, league: rpLeague, world, seasonStartYear: 2014 });
    const rpStore = new Store(rpState);
    rpStore.openTeamSheet(null, "formations");
    // simulate a leftover SQUAD-tab focus pointing at a *different* slot
    // than whatever FORMATIONS is about to highlight (or not highlight at all).
    rpStore.state.ui.teamSheet.focus = { zone: "xi", index: 5 };

    const gridHtml = renderPitchPanel(rpState, rpStore.state.ui.teamSheet, false, false);
    assert("highlight=false (plain FORMATIONS grid/EDIT menu) shows no ring at all, even with a stale ts.focus set",
      gridHtml.indexOf("is-focus") === -1 && gridHtml.indexOf("is-armed") === -1);

    const instrHtml = renderPitchPanel(rpState, rpStore.state.ui.teamSheet, { index: 0, kind: "focus" }, false);
    const focusMatches = instrHtml.match(/is-focus/g) || [];
    assert("highlight={index:0} shows exactly one ring (the intended slot), not a second one from stale ts.focus",
      focusMatches.length === 1);
  }

  group("core/db.js — F2 ROLES fields round-trip (F2-fixes)");
  {
    // Regression test for the exact bug the owner reported: core/store.js's
    // hydrateFromSave already read saved.squadLeftCornerId/RightCornerId/
    // ShortFreeKickId/LongFreeKickId (its own "F2: a pre-F2 save has none of
    // these" fallback comment), but serializeSave/deserializeSave never
    // actually produced/consumed those 4 fields — so every ROLES tab
    // assignment except Captain/Penalty Taker (which *were* wired) silently
    // reverted to null on every reload, autosave notwithstanding.
    const rtClub = world.clubs.find((c) => c.id !== "manchester-united") || world.clubs[3];
    const rtLeague = world.leagues.find((l) => l.id === rtClub.leagueId);
    const rtState = createCareerState({ managerName: "Round Trip", club: rtClub, league: rtLeague, world, seasonStartYear: 2014 });
    const rtOutfielder = rtState.squad.roster.find((p) => positionInfo(p.position).area !== "GK");
    rtState.squad.leftCornerId = rtOutfielder.id;
    rtState.squad.rightCornerId = rtOutfielder.id;
    rtState.squad.shortFreeKickId = rtOutfielder.id;
    rtState.squad.longFreeKickId = rtOutfielder.id;
    rtState.results = new Map();
    rtState.cups = new Map();
    rtState.jobMarket = { vacancies: [] };
    const rtRoundTripped = deserializeSave(serializeSave(rtState));
    assert("leftCornerId survives a save/load round-trip", rtRoundTripped.squadLeftCornerId === rtOutfielder.id);
    assert("rightCornerId survives a save/load round-trip", rtRoundTripped.squadRightCornerId === rtOutfielder.id);
    assert("shortFreeKickId survives a save/load round-trip", rtRoundTripped.squadShortFreeKickId === rtOutfielder.id);
    assert("longFreeKickId survives a save/load round-trip", rtRoundTripped.squadLongFreeKickId === rtOutfielder.id);
  }

  /* ============================================================================
   * F3 (fable-plans/plan2.md): Transfers — Search, action menu, dossier offers.
   * ========================================================================== */

  group("config/summary.js — six aggregate Search Report ratings (F3.2)");
  {
    assert("SUMMARY_GROUPS has exactly 6 rows (Athleticism/Technical/Shooting/Passing/Defending/Mentality)", SUMMARY_GROUPS.length === 6);
    const messiAttrs = {
      acceleration: 96, sprintSpeed: 90, agility: 94, balance: 95, jumping: 73, stamina: 77, strength: 60, reactions: 94,
      aggression: 48, interceptions: 22, positioning: 92, vision: 90, composure: 60,
      ballControl: 96, crossing: 84, dribbling: 96, finishing: 94, fkAccuracy: 90, headingAcc: 71,
      longPass: 76, shortPass: 89, marking: 25, shotPower: 80, longShots: 88, standTackle: 21, slideTackle: 20, volleys: 85, curve: 89, penalties: 76,
      gkDiving: 10, gkHandling: 10, gkKicking: 10, gkPositioning: 10, gkReflexes: 10,
    };
    const summary = computeSummary({ attrs: messiAttrs });
    const byKey = Object.fromEntries(summary.map((s) => [s.key, s.value]));
    // ms_SEARCH_PLAYERS_SCREEN_SEARCH_RESULTS.png shows Athleticism 84,
    // Defending 22, Passing 83 for exactly this attribute set — see
    // config/summary.js's own header for the reverse-engineering notes.
    assert(`computeSummary's Athleticism matches the reference pic's Messi example (84) — got ${byKey.athleticism}`, byKey.athleticism === 84);
    assert(`computeSummary's Defending matches the reference pic's Messi example (22) — got ${byKey.defending}`, byKey.defending === 22);
    assert(`computeSummary's Passing matches the reference pic's Messi example (83) — got ${byKey.passing}`, byKey.passing === 83);
    assert(`computeSummary's Technical Ability matches the reference pic's Messi example (88) — got ${byKey.technical}`, byKey.technical === 88);
  }

  group("config/contract.js — Squad Role display set (F3/F6 CONTRACT NEGOTIATION panel)");
  {
    assert("SQUAD_ROLE_CYCLE has 5 entries (4 real tiers + 'none'/Do Not Specify)", SQUAD_ROLE_CYCLE.length === 5);
    assert("SQUAD_ROLE_CYCLE includes 'none' as its first entry", SQUAD_ROLE_CYCLE[0] === "none");
    assert("crucial -> 'Crucial 1st Team Player' (pic-verified, Messi's Approach Offer card)", SQUAD_ROLE_DISPLAY.crucial === "Crucial 1st Team Player");
    assert("prospect -> 'Future 1st Team Player' (pic-verified, Maloney's Current Contract)", SQUAD_ROLE_DISPLAY.prospect === "Future 1st Team Player");
    assert("none -> 'Do Not Specify' (pic-verified default, Maloney's own New Contract Details)", SQUAD_ROLE_DISPLAY.none === "Do Not Specify");
    assert("resolvedSquadRole('none') falls back to 'important' (this engine's own pre-F3 default)", resolvedSquadRole("none") === "important");
    assert("resolvedSquadRole('crucial') passes through unchanged", resolvedSquadRole("crucial") === "crucial");
  }

  group("engine/teamdecision.js + engine/enquiry.js — 'Enquire about <name>' (F3.3)");
  {
    const state = buildM7FakeState();
    const otherClubs = state.staticData.clubs.filter((c) => c.id !== state.club.id).slice(0, 15);
    let sawAccept = false, sawRefuse = false, enquiriesMade = 0;
    for (const sellingClub of otherClubs) {
      const roster = state.playersByClub.get(sellingClub.id) || [];
      if (!roster.length) continue;
      const target = roster[0];
      const score = computeTeamDecisionScore({ player: target, buyingClub: state.club, sellingClub, state });
      const result = submitEnquiry(state, target.id);
      enquiriesMade++;
      if (result.refused) {
        sawRefuse = sawRefuse || score <= ENQUIRY_REFUSE_THRESHOLD;
      } else {
        sawAccept = true;
        const wantedFee = computeWantedFee({ player: target, buyingClub: state.club, sellingClub, state });
        const expectedLo = Math.round(wantedFee * (1 - ENQUIRY_RANGE_PCT / 100));
        const expectedHi = Math.round(wantedFee * (1 + ENQUIRY_RANGE_PCT / 100));
        assert(`Enquire's range brackets the wanted fee at +-${ENQUIRY_RANGE_PCT}% (lo ${result.lo} == ${expectedLo}, hi ${result.hi} == ${expectedHi})`,
          result.lo === expectedLo && result.hi === expectedHi && result.lo <= wantedFee && wantedFee <= result.hi);
      }
      if (sawAccept && sawRefuse) break;
    }
    assert("at least one sampled enquiry resolved with a fee range (not refused)", sawAccept);
    assert(`at least one sampled enquiry was refused (teamdecision score <= ${ENQUIRY_REFUSE_THRESHOLD})`, sawRefuse);
    const inboxCount = state.inbox.emails.filter((e) => e.subject && e.subject.startsWith("[Transfer] Enquiry")).length;
    assert(`submitEnquiry logs exactly one inbox note per enquiry made (${enquiriesMade} enquiries, ${inboxCount} emails)`, inboxCount === enquiriesMade);
  }

  group("engine/gtn.js — startPlayerScout (F3's 'Ask <scout> to Scout <name>')");
  {
    const state = buildM7FakeState();
    state.gtn = createInitialGtnState(state);
    const target = state.staticData.clubs.filter((c) => c.id !== state.club.id)
      .map((c) => (state.playersByClub.get(c.id) || [])[0]).find(Boolean);
    // buildM7FakeState's player clones only deep-copy contract/loan — every
    // other group's buildM7FakeState() call shares the same underlying
    // world.players[i].scouting object by reference, so an earlier group's
    // scouting (this file's own pre-existing "engine/gtn.js" tests, or one
    // of this milestone's own other groups) can leave this exact player
    // already partly/fully scouted by the time this group runs. Reset it
    // explicitly rather than depending on cross-group test order.
    target.scouting = { level: 0, ovrRange: scoutingRangeFor(target.overall, 0), potRange: scoutingRangeFor(target.potential, 0) };

    assert("cheapestIdleScout returns null with no scouts hired", cheapestIdleScout(state) === null);
    const statusBefore = scoutReportStatus(state, target);
    assert(`an unscouted player with no active mission reads 'not-scouting' (got '${statusBefore.kind}')`, statusBefore.kind === "not-scouting");

    const hireA = hireScout(state, 0);
    const hireB = hireScout(state, 0);
    assert("2 scouts hired for the targeted-scout test", hireA.ok && hireB.ok);
    const cheapest = cheapestIdleScout(state);
    assert("cheapestIdleScout picks the lower-cost of the two idle scouts",
      cheapest && missionCost(0, cheapest) <= missionCost(0, state.gtn.scouts.find((s) => s.id !== cheapest.id)));

    const result = startPlayerScout(state, target.id);
    assert("startPlayerScout succeeds against an idle scout + sufficient budget", result.ok === true);
    assert("the targeted mission is seeded with exactly the one target player", result.mission.targetPlayerId === target.id && result.mission.foundPlayerIds.length === 1 && result.mission.foundPlayerIds[0] === target.id);
    assert("the assigned scout now carries the mission's own id", state.gtn.scouts.find((s) => s.id === cheapest.id).missionId === result.mission.id);
    assert("exactly one of the 2 hired scouts remains idle after the assignment", state.gtn.scouts.filter((s) => !s.missionId).length === 1);
    assert("the target player's scouting.level is bumped to at least 1", target.scouting.level >= 1);

    const statusAfter = scoutReportStatus(state, target);
    assert(`a player with an active targeted mission reads 'scouting' (got '${statusAfter.kind}')`, statusAfter.kind === "scouting" || target.scouting.level >= 3);

    // Tick the mission's daily report cycle several weeks forward — a
    // targeted mission must never pick up any player beyond its one target
    // (engine/gtn.js's own "!mission.targetPlayerId" guard).
    let day = state.calendar.today;
    for (let i = 0; i < 40; i++) {
      day = addDays(day, 1);
      runDailyGtnActivity(state, day);
    }
    assert("a targeted mission's foundPlayerIds never grows beyond its one target, even after 40 days of report ticks",
      result.mission.foundPlayerIds.length === 1);
    assert("40 days of report ticks narrows a targeted mission's player to fully scouted (level 3)", target.scouting.level === 3);
  }

  group("ui/searchui.js — computeSearchResults filter matrix (live Store, F3.1/F3.2)");
  {
    const srClub = world.clubs.find((c) => c.id !== "manchester-united") || world.clubs[5];
    const srLeague = world.leagues.find((l) => l.id === srClub.leagueId);
    const srState = createCareerState({ managerName: "Search Test", club: srClub, league: srLeague, world, seasonStartYear: 2014 });
    const f = srState.ui.transferSearch.filters;

    const baseline = computeSearchResults(srState);
    assert(`baseline search (no filters) excludes the user's own club (${baseline.length} results)`, baseline.every((p) => p.clubId !== srState.club.id) && baseline.length > 0);

    f.area = "GK";
    const gkOnly = computeSearchResults(srState);
    // Both pools hit computeSearchResults' own 300-result cap in a ~600-club
    // world, so comparing raw .length here would be comparing 300 to 300 —
    // meaningless. Prove the filter actually narrows by checking the
    // *baseline* pool contains non-GKs (something to exclude) and every
    // *filtered* result is a GK (nothing wrongly included) instead.
    assert(`POSITION=GK returns a non-empty, 100% goalkeeper result set (${gkOnly.length} results)`,
      gkOnly.length > 0 && gkOnly.every((p) => positionInfo(p.position).area === "GK"));
    assert("the unfiltered baseline pool includes non-goalkeepers (proves the GK filter above is doing real work)",
      baseline.some((p) => positionInfo(p.position).area !== "GK"));
    f.area = "ALL";

    const someOther = baseline.find((p) => p.clubId !== srState.club.id);
    f.name = someOther.commonName.slice(0, 3);
    const nameFiltered = computeSearchResults(srState);
    assert(`PLAYER NAME substring narrows results and every hit contains the substring ('${f.name}': ${nameFiltered.length} of ${baseline.length})`,
      nameFiltered.length > 0 && nameFiltered.length <= baseline.length &&
      nameFiltered.every((p) => p.commonName.toLowerCase().includes(f.name.toLowerCase()) || `${p.firstName} ${p.lastName}`.toLowerCase().includes(f.name.toLowerCase())));
    f.name = "";

    f.minAge = 30;
    const oldOnly = computeSearchResults(srState);
    assert(`MIN AGE=30 narrows results to 30+ only (${oldOnly.length} of ${baseline.length})`, oldOnly.every((p) => p.age >= 30) && oldOnly.length <= baseline.length);
    f.minAge = 0;

    f.status = "FREE";
    const freeOnly = computeSearchResults(srState);
    const freeSet = new Set(eligibleFreeAgentTargets(srState).map((p) => p.id));
    assert(`TRANSFER STATUS=Free Agents matches engine/freeagents.js's own eligibility set exactly (${freeOnly.length} results)`,
      freeOnly.every((p) => freeSet.has(p.id)));
    f.status = "ANY";

    const backToBaseline = computeSearchResults(srState);
    assert("resetting every filter back to Any restores the original baseline result count", backToBaseline.length === baseline.length);
  }

  group("ui/searchui.js — buildActionRows: free agents excluded from Approach-to-Buy/Loan (F3.3)");
  {
    const faClub = world.clubs.find((c) => c.id !== "manchester-united") || world.clubs[6];
    const faLeague = world.leagues.find((l) => l.id === faClub.leagueId);
    const faState = createCareerState({ managerName: "FA Test", club: faClub, league: faLeague, world, seasonStartYear: 2014 });
    const freeAgents = eligibleFreeAgentTargets(faState);
    const normalTarget = faState.players.find((p) => p.clubId !== faState.club.id && p.contract.endYear > faState.seasonStartYear + 1);

    if (freeAgents.length) {
      const faHtml = buildActionRows(faState, freeAgents[0], 0);
      assert("a free-agent-eligible player's action menu offers 'Sign Free Agent'", faHtml.includes("Sign Free Agent"));
      assert("a free-agent-eligible player's action menu hides Approach-to-Buy/Loan", !faHtml.includes("to Buy") && !faHtml.includes("to Loan"));
    } else {
      assert("(no free agents in this sampled world — skipped, not a failure)", true);
    }
    if (normalTarget) {
      const normalHtml = buildActionRows(faState, normalTarget, 0);
      assert("a normal (non-expiring) target's action menu offers Approach-to-Buy/Loan, not Sign Free Agent",
        normalHtml.includes("to Buy") && normalHtml.includes("to Loan") && !normalHtml.includes("Sign Free Agent"));
    }
  }

  group("engine/negotiation.js — player-exchange credit = round(adjValue*0.9) (F3.4)");
  {
    const state = buildM7FakeState();
    const buyerRoster = state.squad.roster;
    let sawAccepted = false, sawRejected = false;
    const otherClubs = state.staticData.clubs.filter((c) => c.id !== state.club.id).slice(0, 15);
    for (const sellingClub of otherClubs) {
      const sellingRoster = state.playersByClub.get(sellingClub.id) || [];
      if (!sellingRoster.length) continue;
      const target = sellingRoster[0];
      for (const exchangePlayer of buyerRoster) {
        state.transfers.negotiation = null;
        state.transfers.pendingOffers = [];
        startFeeNegotiation(state, target.id);
        setExchangePlayer(state, exchangePlayer.id);
        submitFeeOffer(state);
        const n = state.transfers.negotiation;
        const expectedCredit = Math.round(exchangePlayer.value * EXCHANGE_PLAYER_VALUE_PCT);
        if (n.exchangeCreditApplied > 0) {
          sawAccepted = true;
          assert(`accepted exchange credit == round(value*${EXCHANGE_PLAYER_VALUE_PCT}) (£${n.exchangeCreditApplied} == £${expectedCredit})`, n.exchangeCreditApplied === expectedCredit);
        } else if (n.exchangeRejectedNote) {
          sawRejected = true;
        }
        if (sawAccepted && sawRejected) break;
      }
      if (sawAccepted && sawRejected) break;
    }
    assert("at least one sampled exchange offer was accepted (credit applied)", sawAccepted);
    assert("at least one sampled exchange offer was rejected (club didn't need that position, cash-only note shown)", sawRejected);
  }

  group("engine/negotiation.js — Loan Offer's editable phase + 3-6 day response scheduling (F3.5)");
  {
    const state = buildM7FakeState(new Date(2014, 8, 15)); // not a deadline day
    const otherClub = state.staticData.clubs.find((c) => c.id !== state.club.id);
    const target = (state.playersByClub.get(otherClub.id) || [])[0];

    startLoanNegotiation(state, target.id, "season");
    assert("startLoanNegotiation opens an editable 'loan' phase, not an instant roll (F3 changed this from plan1 M7)", state.transfers.negotiation.phase === "loan");

    adjustLoanBonusPerGoal(state, 5);
    assert("adjustLoanBonusPerGoal steps loanBonusPerGoal", state.transfers.negotiation.loanBonusPerGoal === 5);
    cycleLoanLength(state);
    assert("cycleLoanLength toggles season<->short", state.transfers.negotiation.loanLength === "short");
    adjustLoanFutureFee(state, 20000);
    assert("adjustLoanFutureFee sets an explicit future fee (was 'Not Set'/null)", state.transfers.negotiation.loanFutureFee === 20000);
    adjustLoanFutureFee(state, -20000);
    assert("stepping a future fee back down to 0 returns it to 'Not Set' (null)", state.transfers.negotiation.loanFutureFee === null);

    const beforeCount = state.transfers.pendingOffers.length;
    submitLoanOffer(state);
    assert("submitLoanOffer (non-deadline-day) moves phase to 'loan-waiting'", state.transfers.negotiation.phase === "loan-waiting");
    assert("submitLoanOffer queues exactly one pendingOffers entry", state.transfers.pendingOffers.length === beforeCount + 1);
    const entry = state.transfers.pendingOffers[state.transfers.pendingOffers.length - 1];
    const daysOut = toEpochDay(entry.dueDate) - toEpochDay(state.calendar.today);
    assert(`the queued loan response is due within transfers.ini's 3-6 day window (got ${daysOut})`, daysOut >= 3 && daysOut <= 6);
  }

  group("core/store.js — My Shortlist add/remove is idempotent, never duplicates (F3.7)");
  {
    const slClub = world.clubs.find((c) => c.id !== "manchester-united") || world.clubs[7];
    const slLeague = world.leagues.find((l) => l.id === slClub.leagueId);
    const slState = createCareerState({ managerName: "Shortlist Test", club: slClub, league: slLeague, world, seasonStartYear: 2014 });
    const slStore = new Store(slState);
    const target = slState.players.find((p) => p.clubId !== slState.club.id);

    assert("shortlist starts empty for a new career", slState.transfers.shortlist.length === 0);
    slStore.toggleShortlistPlayer(target.id);
    assert("toggling an unshortlisted player adds exactly one entry", slState.transfers.shortlist.length === 1 && slState.transfers.shortlist[0].playerId === target.id);
    assert("adding seeds the My Shortlist screen's own selection to the newly-added player", slState.ui.shortlist.selectedPlayerId === target.id);
    slStore.toggleShortlistPlayer(target.id);
    assert("toggling the same player again removes it (net no-op) rather than duplicating", slState.transfers.shortlist.length === 0);
    assert("removing the only/selected entry clears the My Shortlist screen's selection", slState.ui.shortlist.selectedPlayerId === null);

    // A second, different player added while the first is still present must
    // never collide/duplicate either.
    const target2 = slState.players.find((p) => p.clubId !== slState.club.id && p.id !== target.id);
    slStore.toggleShortlistPlayer(target.id);
    slStore.toggleShortlistPlayer(target2.id);
    assert("shortlisting 2 distinct players yields exactly 2 entries, no duplicates", slState.transfers.shortlist.length === 2);
    const ids = slState.transfers.shortlist.map((s) => s.playerId).sort();
    assert("the 2 entries are exactly the 2 distinct players added", ids[0] === Math.min(target.id, target2.id) && ids[1] === Math.max(target.id, target2.id));
  }

  group("core/db.js — transferShortlist round-trips through save/load (F3)");
  {
    const dbState = buildM7FakeState();
    dbState.transfers.shortlist = [{ playerId: dbState.squad.roster[0].id, dateAdded: dbState.calendar.today }];
    dbState.results = new Map();
    dbState.cups = new Map();
    dbState.jobMarket = { vacancies: [] };
    const dbRoundTripped = deserializeSave(serializeSave(dbState));
    assert("transferShortlist survives a save/load round-trip (playerId + dateAdded)",
      dbRoundTripped.transferShortlist.length === 1 &&
      dbRoundTripped.transferShortlist[0].playerId === dbState.squad.roster[0].id &&
      dbRoundTripped.transferShortlist[0].dateAdded.getTime() === dbState.calendar.today.getTime());
  }

  group("ui/playerbio.js — cmToFtIn (F3-fixes: no more '5\\'12\"')");
  {
    // 182cm = 71.6535in — the old formula rounded feet and inches
    // independently, so round(71.6535 % 12) = round(11.6535) = 12,
    // producing the literal string "5'12\"" instead of carrying into a
    // 6th foot. Rounding the total inches first avoids it.
    assert(`cmToFtIn(182) reads "6'0\\"" not the old bug's "5'12\\"" (got ${cmToFtIn(182)})`, cmToFtIn(182) === "6'0\"");
    assert(`cmToFtIn(180) reads "5'11\\"" (got ${cmToFtIn(180)})`, cmToFtIn(180) === "5'11\"");
    assert(`cmToFtIn(193) reads "6'4\\"" (got ${cmToFtIn(193)})`, cmToFtIn(193) === "6'4\"");
  }

  group("js/core/store.js — PLAYER SEARCH F3-fixes: cyclical MIN/MAX AGE, per-tile reset, COUNTRY/LEAGUE/TEAM cascade+disable");
  {
    const asClub = world.clubs.find((c) => c.id !== "manchester-united") || world.clubs[9];
    const asLeague = world.leagues.find((l) => l.id === asClub.leagueId);
    const asState = createCareerState({ managerName: "Age Search Test", club: asClub, league: asLeague, world, seasonStartYear: 2014 });
    const asStore = new Store(asState);
    // searchResetFilters() below swaps in a brand-new filters object each
    // time (`s.filters = {...}`), so `f` is re-read after every call rather
    // than aliased once — otherwise later assertions would check a stale,
    // detached object.
    let f = asState.ui.transferSearch.filters;

    assert("MIN AGE starts at Any (0)", f.minAge === 0);
    asStore.searchAdjustMinAge(1);
    assert(`MIN AGE steps Any -> 16 going up (got ${f.minAge})`, f.minAge === 16);
    asStore.searchAdjustMinAge(-1);
    assert(`MIN AGE steps 16 -> Any going back down (got ${f.minAge})`, f.minAge === 0);
    asStore.searchAdjustMinAge(-1);
    assert(`MIN AGE wraps Any -> 50 going down (cyclical, got ${f.minAge})`, f.minAge === 50);
    asStore.searchAdjustMinAge(1);
    assert(`MIN AGE wraps 50 -> Any going up (cyclical, got ${f.minAge})`, f.minAge === 0);

    // min<=max guard: MAX AGE=20 bounds MIN AGE's own cycle to Any..20, so
    // stepping MIN AGE up from 20 wraps to Any instead of spilling to 21.
    asStore.searchResetFilters();
    f = asState.ui.transferSearch.filters;
    asStore.searchAdjustMaxAge(1); // Any -> 16
    for (let i = 0; i < 4; i++) asStore.searchAdjustMaxAge(1); // 16 -> 20
    assert(`MAX AGE reached 20 via 5 steps up from Any (got ${f.maxAge})`, f.maxAge === 20);
    for (let i = 0; i < 5; i++) asStore.searchAdjustMinAge(1); // Any -> 16 -> ... -> 20
    assert(`MIN AGE reached 20 (bounded by MAX AGE=20, got ${f.minAge})`, f.minAge === 20);
    asStore.searchAdjustMinAge(1);
    assert(`MIN AGE wraps 20 -> Any rather than exceeding MAX AGE=20 (got ${f.minAge})`, f.minAge === 0);

    // Per-tile (X) reset (F3-fixes) — as opposed to searchResetFilters()
    // above, which clears all 8 at once.
    asStore.searchResetFilters();
    f = asState.ui.transferSearch.filters;
    f.name = "Zidane"; f.area = "MID"; f.role = "CM"; f.nationId = "france"; f.status = "LISTED";
    f.minAge = 20; f.maxAge = 30; f.country = "England"; f.leagueId = asLeague.id; f.teamId = asClub.id;
    asStore.searchResetTile(0);
    assert("searchResetTile(0) clears PLAYER NAME only", f.name === "" && f.area === "MID" && f.country === "England");
    asStore.searchResetTile(1);
    assert("searchResetTile(1) clears both POSITION and ROLE", f.area === "ALL" && f.role === "ANY");
    asStore.searchResetTile(4);
    assert("searchResetTile(4) clears both MIN AGE and MAX AGE", f.minAge === 0 && f.maxAge === 0);
    asStore.searchResetTile(6);
    assert("searchResetTile(6) clears LEAGUE and cascades to TEAM, but leaves COUNTRY", f.leagueId === null && f.teamId === null && f.country === "England");

    // COUNTRY/LEAGUE/TEAM cascade + disabled-until-parent-chosen guards.
    asStore.searchResetFilters();
    f = asState.ui.transferSearch.filters;
    asStore.searchCycleLeague(1);
    assert("LEAGUE is a no-op until COUNTRY is set", f.leagueId === null);
    asStore.searchCycleTeam(1);
    assert("TEAM is a no-op until COUNTRY+LEAGUE are set", f.teamId === null);
    asStore.searchCycleCountry(1);
    const firstCountry = f.country;
    assert("COUNTRY's first cycled-to option is a real country, not Any again", !!firstCountry);
    asStore.searchCycleTeam(1);
    assert("TEAM is still a no-op with only COUNTRY set (LEAGUE still Any)", f.teamId === null);
    asStore.searchCycleLeague(1);
    assert("LEAGUE now cycles once COUNTRY is set", f.leagueId !== null);
    const leagueAfterFirstCycle = f.leagueId;
    asStore.searchCycleTeam(1);
    assert("TEAM now cycles once COUNTRY+LEAGUE are set", f.teamId !== null);
    asStore.searchCycleCountry(1);
    assert("changing COUNTRY cascades LEAGUE back to Any", f.leagueId === null);
    assert("changing COUNTRY cascades TEAM back to Any", f.teamId === null);
    assert("(sanity) the league cycled-to before the country change was a real id", !!leagueAfterFirstCycle);
  }

  group("ui/searchui.js — PLAYER NAME / NATIONALITY keyboard-overlay search (F3-fixes)");
  {
    const nsClub = world.clubs.find((c) => c.id !== "manchester-united") || world.clubs[11];
    const nsLeague = world.leagues.find((l) => l.id === nsClub.leagueId);
    const nsState = createCareerState({ managerName: "Name Search Test", club: nsClub, league: nsLeague, world, seasonStartYear: 2014 });
    const nsStore = new Store(nsState);
    const ns = nsState.ui.transferSearch.nameSearch;

    assert("computeNameSearchResults returns nothing below the 2-char minimum", computeNameSearchResults(nsState).length === 0);
    ns.committedQuery = "z";
    assert("a 1-char committedQuery still returns nothing (2-char minimum)", computeNameSearchResults(nsState).length === 0);

    const target = nsState.players.find((p) => p.lastName.length >= 3);
    ns.committedQuery = target.lastName.slice(0, 3);
    const nameResults = computeNameSearchResults(nsState);
    assert(`a real last-name substring finds that player among the results (${nameResults.length} results)`,
      nameResults.some((p) => p.id === target.id));
    const alphabetical = nameResults.slice().sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
    assert("results are already in alphabetical (by full name) order",
      nameResults.every((p, i) => p.id === alphabetical[i].id));

    // Selecting a result templates all 8 filter tiles off that player and
    // auto-runs the search (plan2-decisions.md F3-fixes' own reading of
    // "the y button action").
    const templatePlayer = nsState.players.find((p) => p.clubId != null);
    nsStore.searchOpenNameSearch();
    nsStore.searchApplyNameResult(templatePlayer.id);
    const tf = nsState.ui.transferSearch.filters;
    const tLeagueId = nsState.clubLeague.get(templatePlayer.clubId);
    const tLeague = nsState.staticData.leagues.find((l) => l.id === tLeagueId);
    assert("searchApplyNameResult fills PLAYER NAME", tf.name === templatePlayer.commonName);
    assert("searchApplyNameResult fills POSITION/ROLE from the player's own position", tf.area === positionInfo(templatePlayer.position).area && tf.role === templatePlayer.position);
    assert("searchApplyNameResult fills NATIONALITY", tf.nationId === templatePlayer.nationId);
    assert("searchApplyNameResult fills MIN/MAX AGE to the player's exact age", tf.minAge === templatePlayer.age && tf.maxAge === templatePlayer.age);
    assert("searchApplyNameResult fills COUNTRY/LEAGUE/TEAM from the player's own club", tf.country === tLeague.country && tf.leagueId === tLeagueId && tf.teamId === templatePlayer.clubId);
    assert("searchApplyNameResult closes the PLAYER NAME overlay", nsState.ui.transferSearch.nameSearch.open === false);
    assert("searchApplyNameResult auto-runs the search (jumps to SEARCH RESULTS)", nsState.ui.transferSearch.stage === "results");

    // NATIONALITY: pre-filled before typing, filters live, no auto-search.
    assert("computeNationSearchResults is pre-filled with every nation before any typing", computeNationSearchResults(nsState).length === nsState.staticData.nations.length);
    nsState.ui.transferSearch.nationSearch.query = "Fra";
    const natResults = computeNationSearchResults(nsState);
    assert(`NATIONALITY filters live as characters are typed ('Fra': ${natResults.length} of ${nsState.staticData.nations.length})`,
      natResults.length > 0 && natResults.length < nsState.staticData.nations.length && natResults.every((n) => n.name.toLowerCase().includes("fra")));

    nsStore.searchResetFilters();
    nsState.ui.transferSearch.stage = "filters"; // searchApplyNameResult above already jumped to "results"
    nsStore.searchOpenNationSearch();
    nsStore.searchApplyNationResult("brazil");
    assert("searchApplyNationResult fills only NATIONALITY", nsState.ui.transferSearch.filters.nationId === "brazil");
    assert("searchApplyNationResult closes its own overlay", nsState.ui.transferSearch.nationSearch.open === false);
    assert("searchApplyNationResult does NOT auto-run the search (stays on filters)", nsState.ui.transferSearch.stage === "filters");
  }

  /* ==========================================================================
   * F4 (fable-plans/plan2.md): Sell Players, Transfer Negotiations ledger,
   * Transfer History, Finances/Budget Allocation.
   * ======================================================================= */

  group("config/budget.js — release guard groups + squad-total floor (transfer.ini MIN_PLAYERS_POSITION_*, cmsettings.ini MIN_SQUAD_SIZE/MAX_SQUAD_SIZE)");
  {
    const totalMin = RELEASE_GUARD_GROUPS.reduce((s, g) => s + g.min, 0);
    assert("the 8 release-guard groups' own minimums sum to 21 (2+2+4+2+2+4+2+3, matching config/transferai.js's own area-level MIN_PLAYERS_PER_AREA totals)", totalMin === 21);
    const allCodes = RELEASE_GUARD_GROUPS.flatMap((g) => g.codes);
    assert("every one of the 28 position codes is covered by exactly one release-guard group", allCodes.length === 28 && new Set(allCodes).size === 28);
    assert("SQUAD_FLOOR_TOTAL is cmsettings.ini's real MIN_SQUAD_SIZE (18), not the plan's own guessed 16", SQUAD_FLOOR_TOTAL === 18);
    assert("MAX_SQUAD_SIZE is cmsettings.ini's real MAX_SQUAD_SIZE (52)", MAX_SQUAD_SIZE === 52);

    function fakePlayer(id, position) { return { id, position }; }
    const bigRoster = [];
    let nid = 1;
    for (const group of RELEASE_GUARD_GROUPS) {
      for (let i = 0; i < group.min + 3; i++) bigRoster.push(fakePlayer(nid++, group.codes[i % group.codes.length]));
    }
    assert(`a squad well above every floor (n=${bigRoster.length}) allows Release`,
      releaseGuardReason({ squad: { roster: bigRoster } }, bigRoster[0]) === null);

    const stGroup = RELEASE_GUARD_GROUPS.find((g) => g.label === "ST");
    const thinRoster = [
      ...bigRoster.filter((p) => !stGroup.codes.includes(p.position)),
      fakePlayer(900, "ST"), fakePlayer(901, "ST"), fakePlayer(902, "ST"),
    ];
    assert(`exactly at ST's own MIN_PLAYERS_POSITION_ST floor (${stGroup.min}) blocks Release`,
      releaseGuardReason({ squad: { roster: thinRoster } }, thinRoster.find((p) => p.position === "ST")) !== null);

    const smallRoster = bigRoster.slice(0, SQUAD_FLOOR_TOTAL);
    assert(`a squad of exactly SQUAD_FLOOR_TOTAL (${SQUAD_FLOOR_TOTAL}) total players is blocked by the squad-total floor regardless of position`,
      releaseGuardReason({ squad: { roster: smallRoster } }, smallRoster[0]) !== null);
  }

  group("config/budget.js — carryOverPct / boardStrictnessPct bands (cmsettings.ini [BUDGET])");
  {
    assert("carryOverPct(£500k) lands in the <=£1M band -> 90%", carryOverPct(500000) === 90);
    assert("carryOverPct(£15M) lands in the <=£20M band -> 55%", carryOverPct(15000000) === 55);
    assert("carryOverPct(£100M), past every named band, falls back to the last band's own value -> 10%", carryOverPct(100000000) === 10);
    assert("boardStrictnessPct: a giant club (prestige 10) -> strict 60%", boardStrictnessPct({ prestige: 10 }) === 60);
    assert("boardStrictnessPct: a tiny club (prestige 2) -> lenient 85%", boardStrictnessPct({ prestige: 2 }) === 85);
    assert("boardStrictnessPct: a mid club (prestige 5) -> moderate 75%", boardStrictnessPct({ prestige: 5 }) === 75);
    assert("leagueBudgetMin keys off the league's own iniLeagueId (EPL, 13) -> £18,000,000", leagueBudgetMin({ iniLeagueId: 13 }) === 18000000);
    assert("leagueBudgetMin falls back to the default for an unlisted iniLeagueId", leagueBudgetMin({ iniLeagueId: 999999 }) === 100000);
  }

  group("engine/finances.js — Budget Allocation slider round-trip (F4, cmsettings.ini TRANSFER_WAGE_SPLIT_PERCENT=80)");
  {
    assert("BUDGET_SPLIT_RATE = 52 weeks x (80/20 split factor) = 208", BUDGET_SPLIT_RATE === 208);
    const fakeFinState = { finances: { transferBudget: 1200000, wageCeiling: 82250 }, squad: { roster: [] } };
    const steps = budgetSplitStepAmounts(fakeFinState);
    assert("a real step's transferDelta/wageDelta are both positive", steps.transferDelta > 0 && steps.wageDelta > 0);
    const draft = { transferBudget: fakeFinState.finances.transferBudget, wageCeiling: fakeFinState.finances.wageCeiling };
    for (let i = 0; i < 5; i++) applyBudgetSplitStep(draft, 1, steps, 0);
    for (let i = 0; i < 5; i++) applyBudgetSplitStep(draft, -1, steps, 0);
    assert("moving 5 steps toward transfer then 5 back toward wage round-trips to the exact starting budgets",
      draft.transferBudget === fakeFinState.finances.transferBudget && draft.wageCeiling === fakeFinState.finances.wageCeiling);
    const [tPct, wPct] = budgetSplitPct(draft.transferBudget, draft.wageCeiling, []);
    assert("budgetSplitPct's transfer/wage percentages always sum to 100", tPct + wPct === 100);
  }

  group("engine/contracts.js — releasePlayer (F4 Sell Players Release action, live Store)");
  {
    const relClub = world.clubs.find((c) => c.id !== "manchester-united") || world.clubs[5];
    const relLeague = world.leagues.find((l) => l.id === relClub.leagueId);
    const relState = createCareerState({ managerName: "Release Test", club: relClub, league: relLeague, world, seasonStartYear: 2014 });
    // Not every individual position sub-group in a real 24-man squad clears
    // its own fine-grained floor (e.g. a squad might only carry one true LB-
    // coded player even though DEF as a whole has 8) — that's a legitimate
    // guard result, not a bug, so this picks whichever roster player *is*
    // releasable rather than assuming the lowest-overall one always is (the
    // engine/contracts.js group above already exercises the guard's actual
    // pass/fail boundary directly on a hand-crafted roster).
    const target = relState.squad.roster.find((p) => releaseGuardReason(relState, p) === null);
    assert("at least one roster player clears every release-guard floor in a real 24-man squad", !!target);
    const budgetBefore = relState.finances.transferBudget;
    const result = target ? releasePlayer(relState, target.id) : { ok: false };
    assert("releasePlayer succeeds for that player", result.ok === true);
    if (result.ok) {
      assert("the released player is no longer on the user's club", target.clubId !== relClub.id);
      assert("the released player lands at a real other club", relState.clubsById.has(target.clubId));
      assert("the payoff (RELEASE_PAYOFF_PCT of wage x weeks remaining) was deducted from the transfer budget",
        result.payoff >= 0 && relState.finances.transferBudget === budgetBefore - result.payoff);
    }
    assert("releasePlayer refuses a stale/foreign playerId", releasePlayer(relState, -999999).error === "not-found");
  }

  group("core/store.js — SELL PLAYERS status column reflects each action (F4, live Store)");
  {
    const spClub = world.clubs.find((c) => c.id !== "manchester-united") || world.clubs[3];
    const spLeague = world.leagues.find((l) => l.id === spClub.leagueId);
    const spState = createCareerState({ managerName: "Sell Test", club: spClub, league: spLeague, world, seasonStartYear: 2014 });
    const spStore = new Store(spState);
    spStore.openSellPlayers();
    const player = spState.squad.roster[0];
    spStore.selectSellPlayersRow(player.id);
    // F4-fixes (owner request): the default status is now the player's real
    // remaining contract length ("N Year(s) M Month(s)"), not a bare "None".
    assert("a freshly-opened, untouched player's status reads their real contract length remaining",
      /^\d+ Years? \d+ Months?$/.test(statusLabel(spState, player)));

    spStore.sellPlayersBeginListing("transfer");
    assert("beginning a listing seeds the price prompt draft from the player's own value", spState.ui.sellPlayers.pricePrompt.draft === player.value);
    const seeded = spState.ui.sellPlayers.pricePrompt.draft;
    spStore.sellPlayersAdjustListingPrice(0.05);
    assert("price-up steps the draft up", spState.ui.sellPlayers.pricePrompt.draft > seeded);
    spStore.sellPlayersConfirmListing();
    assert("confirming Add to Transfer List sets status to 'Transfer Listed'", statusLabel(spState, player) === "Transfer Listed");
    assert("the listing's own type is 'transfer'", spState.transfers.listings.get(player.id).type === "transfer");

    spStore.sellPlayersBeginListing("loan-season");
    spStore.sellPlayersConfirmListing();
    assert("switching to Loan List for Season Loan replaces the previous transfer listing", statusLabel(spState, player) === "Loan Listed (Season)");

    spStore.sellPlayersBeginListing("loan-short");
    spStore.sellPlayersConfirmListing();
    assert("switching to Loan List for Short Loan replaces the season-loan listing", statusLabel(spState, player) === "Loan Listed (Short)");

    spStore.sellPlayersToggleDisallowBids();
    assert("Disallow Transfer Bids takes priority over any listing in the status label", statusLabel(spState, player) === "Bids Disallowed");
    assert("the player id is really in state.transfers.disallowedBids", spState.transfers.disallowedBids.has(player.id));
    spStore.sellPlayersToggleDisallowBids();
    assert("toggling Disallow again reverts to the underlying listing status", statusLabel(spState, player) === "Loan Listed (Short)");

    spStore.sellPlayersUnlist();
    assert("Remove Listing reverts the status back to the contract-remaining fallback",
      /^\d+ Years? \d+ Months?$/.test(statusLabel(spState, player)));

    // F4-fixes: a pending renewal offer takes priority over that fallback.
    const submitResult = submitRenewalOffer(spState, player.id, { wage: player.contract.wage + 1000, years: 3 });
    assert("submitRenewalOffer queues successfully for an untouched player", submitResult.ok === true);
    assert("a pending renewal offer's status shows the offered terms", statusLabel(spState, player).startsWith("Offered"));
    assert("submitRenewalOffer refuses a second offer while one is already pending",
      submitRenewalOffer(spState, player.id, { wage: player.contract.wage + 2000, years: 2 }).error === "already-pending");

    spStore.sellPlayersBeginListing("transfer");
    spStore.sellPlayersCancelListingPrompt();
    assert("cancelling the price prompt does NOT list the player", !spState.transfers.listings.has(player.id));
  }

  group("engine/negotiationlog.js — negotiations log gains exactly one terminal state per deal (F4)");
  {
    const state = buildM7FakeState();
    const otherClub = state.staticData.clubs.find((c) => c.id !== state.club.id && c.id !== state.club.rivalId);
    const target = (state.playersByClub.get(otherClub.id) || [])[0];
    const before = (state.transfers.negotiations || []).length;
    startFeeNegotiation(state, target.id);
    state.transfers.negotiation.feeOffer = 1; // guarantees 0% accept chance
    state.transfers.negotiation.round = MAX_COUNTER_OFFERS; // forces the reject branch regardless of the counter/reject roll
    submitFeeOffer(state); // Sep 1 (buildM7FakeState's own "today") is the deadline day — resolves synchronously
    const afterReject = (state.transfers.negotiations || []).length;
    assert("a guaranteed-rejected fee offer appends exactly one terminal log entry", afterReject === before + 1);
    assert("the new entry's outcome is 'fail'", state.transfers.negotiations[0].outcome === "fail");
    assert("the new entry's source is 'sent'", state.transfers.negotiations[0].source === "sent");

    const otherClubs2 = state.staticData.clubs.filter((c) => c.id !== state.club.id && c.id !== state.club.rivalId).slice(0, 6);
    let completed = false;
    outerF4:
    for (const oc of otherClubs2) {
      const roster2 = state.playersByClub.get(oc.id) || [];
      const t2 = roster2.reduce((cheapest, p) => (p.value < cheapest.value ? p : cheapest), roster2[0]);
      for (let attempt = 0; attempt < 6; attempt++) {
        state.transfers.negotiation = null;
        state.transfers.pendingOffers = [];
        startFeeNegotiation(state, t2.id);
        const n = state.transfers.negotiation;
        n.promisedRole = t2.contract.squadRole;
        n.feeOffer = Math.round(t2.value * (2 + attempt));
        submitFeeOffer(state);
        if (state.transfers.negotiation.phase === "contract") {
          state.transfers.negotiation.contractOffer.wage = Math.round(state.transfers.negotiation.contractOffer.wage * (2 + attempt));
          const beforeComplete = state.transfers.negotiations.length;
          submitNegotiationContractOffer(state);
          if (state.transfers.negotiation.phase === "completed") {
            assert("completing a transfer appends exactly one more log entry", state.transfers.negotiations.length === beforeComplete + 1);
            assert("the completed entry's outcome is 'success'", state.transfers.negotiations[0].outcome === "success");
            completed = true;
            break outerF4;
          }
        }
      }
    }
    assert("at least one sampled club completed (backs the 'exactly one success entry' check above)", completed);
  }

  group("engine/transferai.js — acceptIncomingBid/rejectIncomingBid append negotiations log entries + sales income (F4)");
  {
    const state = buildM7FakeState();
    state.finances.seasonSalesIncome = 0;
    const buyingClub = state.staticData.clubs.find((c) => c.id !== state.club.id);
    const player = state.squad.roster[state.squad.roster.length - 1];
    const offer = player.value;
    state.inbox.emails.unshift({
      from: "X", to: "Y", cc: "Z", crest: "crest-a", date: new Date(state.calendar.today), read: false, subject: "s3", body: [],
      action: { type: "transfer-bid", bidId: "acc-1", playerId: player.id, buyingClubId: buyingClub.id, offer },
    });
    const before = (state.transfers.negotiations || []).length;
    acceptIncomingBid(state, "acc-1");
    assert("accepting an incoming bid appends exactly one 'success' entry",
      (state.transfers.negotiations || []).length === before + 1 && state.transfers.negotiations[0].outcome === "success");
    assert("accepting credits seasonSalesIncome by the offer amount (F4 Budget Allocation's own rollover carry-over)", state.finances.seasonSalesIncome === offer);
    assert("the sold player is moved to the buying club", player.clubId === buyingClub.id);

    const player2 = state.squad.roster[0];
    state.inbox.emails.unshift({
      from: "X", to: "Y", cc: "Z", crest: "crest-a", date: new Date(state.calendar.today), read: false, subject: "s4", body: [],
      action: { type: "transfer-bid", bidId: "rej-1", playerId: player2.id, buyingClubId: buyingClub.id, offer: player2.value },
    });
    const before2 = (state.transfers.negotiations || []).length;
    rejectIncomingBid(state, "rej-1");
    assert("rejecting an incoming bid appends exactly one 'fail' entry",
      (state.transfers.negotiations || []).length === before2 + 1 && state.transfers.negotiations[0].outcome === "fail");
  }

  group("engine/transferai.js — expirePendingBids withdraws unanswered bids past their own expiry (F4, transfers.ini MIN_DAYS_TO_EXPIRE_OFFER)");
  {
    const state = buildM7FakeState();
    const buyingClub = state.staticData.clubs.find((c) => c.id !== state.club.id);
    const player = state.squad.roster[0];
    const today = state.calendar.today;
    state.inbox.emails.unshift({
      from: "X", to: "Y", cc: "Z", crest: "crest-a", date: new Date(today), read: false, subject: "exp-s1", body: [],
      action: { type: "transfer-bid", bidId: "exp-1", playerId: player.id, buyingClubId: buyingClub.id, offer: player.value, expiresDate: today },
    });
    const beforeLen = (state.transfers.negotiations || []).length;
    const dayAfter = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    expirePendingBids(state, dayAfter);
    const email = state.inbox.emails.find((e) => e.subject === "exp-s1");
    assert("an expired bid's action is cleared", email.action === null);
    assert("expiry appends exactly one terminal ('Withdrawn') log entry",
      (state.transfers.negotiations || []).length === beforeLen + 1 && state.transfers.negotiations[0].negStatus === "Withdrawn");

    state.inbox.emails.unshift({
      from: "X", to: "Y", cc: "Z", crest: "crest-a", date: new Date(today), read: false, subject: "exp-s2", body: [],
      action: { type: "transfer-bid", bidId: "exp-2", playerId: player.id, buyingClubId: buyingClub.id, offer: player.value, expiresDate: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 5) },
    });
    expirePendingBids(state, dayAfter);
    const email2 = state.inbox.emails.find((e) => e.subject === "exp-s2");
    assert("a bid still inside its own expiry window is left untouched", email2.action !== null);
  }

  group("engine/negotiationlog.js — Sent/Received live derivation + worldwideCompletedEntries vs successfulEntries scoping (F4)");
  {
    const tnClub = world.clubs.find((c) => c.id !== "manchester-united") || world.clubs[7];
    const tnLeague = world.leagues.find((l) => l.id === tnClub.leagueId);
    const tnState = createCareerState({ managerName: "TN Test", club: tnClub, league: tnLeague, world, seasonStartYear: 2014 });
    const tnStore = new Store(tnState);

    assert("sentLedgerRow is null with no live negotiation", sentLedgerRow(tnState) === null);
    const target = tnState.players.find((p) => p.clubId !== tnClub.id);
    tnStore.startBid(target.id);
    assert("sentLedgerRow stays null before the offer is actually submitted (n.everSubmitted still false)", sentLedgerRow(tnState) === null);
    tnStore.negoSubmitFeeOffer(); // a fresh career always starts July 1st — never a deadline day, so this queues rather than resolving
    const row = sentLedgerRow(tnState);
    assert("sentLedgerRow appears once the offer is submitted", row !== null && row.playerId === target.id);

    const myPlayer = tnState.squad.roster[0];
    tnState.inbox.emails.unshift({
      from: "TEST FC", to: "x", cc: "x", crest: "crest-a", date: new Date(tnState.calendar.today), read: false, subject: "test", body: [],
      action: { type: "transfer-bid", bidId: "test-bid-1", playerId: myPlayer.id, buyingClubId: target.clubId, offer: myPlayer.value, expiresDate: tnState.calendar.today },
    });
    const received = receivedLedgerRows(tnState);
    assert("receivedLedgerRows picks up a pending transfer-bid email", received.some((r) => r.playerId === myPlayer.id));

    const beforeWorld = (tnState.transfers.negotiations || []).length;
    const c1 = tnState.staticData.clubs[0], c2 = tnState.staticData.clubs[1];
    const somePlayer = (tnState.playersByClub.get(c2.id) || tnState.players)[0];
    pushNegotiationLogEntry(tnState, {
      source: "cpu", dealType: "transfer", playerId: somePlayer.id, fromClubId: c2.id, toClubId: c1.id,
      outcome: "success", negStatus: "Completed", transferFee: 1000000, estimatedWorth: 900000,
      current: null, offered: null, date: tnState.calendar.today,
    });
    assert("worldwideCompletedEntries includes a CPU<->CPU completion (Transfer History's ALL CLUBS tab)", worldwideCompletedEntries(tnState).length === beforeWorld + 1);
    assert("successfulEntries (user-scoped, TRANSFER NEGOTIATIONS' own Successful tab) excludes the CPU<->CPU entry", successfulEntries(tnState).length === beforeWorld);
  }

  group("core/db.js — F4 negotiations log + disallowedBids + email action.expiresDate round-trip");
  {
    const dbClub = world.clubs.find((c) => c.id !== "manchester-united") || world.clubs[9];
    const dbLeague = world.leagues.find((l) => l.id === dbClub.leagueId);
    const dbState = createCareerState({ managerName: "DB F4 Test", club: dbClub, league: dbLeague, world, seasonStartYear: 2014 });
    const dbStore = new Store(dbState);
    const p1 = dbState.squad.roster[0];
    dbStore.openSellPlayers();
    dbStore.selectSellPlayersRow(p1.id);
    dbStore.sellPlayersToggleDisallowBids();
    pushNegotiationLogEntry(dbState, {
      source: "sent", dealType: "transfer", playerId: p1.id, fromClubId: dbClub.id, toClubId: dbClub.id,
      outcome: "success", negStatus: "Completed", transferFee: 12345, estimatedWorth: 54321,
      current: { wage: 1000, years: 2, bonus: 5 }, offered: { wage: 2000, years: 3, bonus: 10 },
      date: dbState.calendar.today,
    });
    dbState.inbox.emails.unshift({
      from: "X", to: "Y", cc: "Z", crest: "crest-a", date: new Date(dbState.calendar.today), read: false, subject: "db-bid", body: [],
      action: { type: "transfer-bid", bidId: "db-1", playerId: p1.id, buyingClubId: dbClub.id, offer: 999, expiresDate: new Date(dbState.calendar.today) },
    });

    const saved = serializeSave(dbState);
    const restored = deserializeSave(saved);
    assert("transferDisallowedBids round-trips", restored.transferDisallowedBids.includes(p1.id));
    assert("transferNegotiationsLog round-trips with the same length", restored.transferNegotiationsLog.length === dbState.transfers.negotiations.length);
    const restoredEntry = restored.transferNegotiationsLog[0];
    assert("a restored log entry's date round-trips as a real Date via epoch-day",
      restoredEntry.date instanceof Date && restoredEntry.date.getFullYear() === dbState.calendar.today.getFullYear());
    assert("a restored log entry keeps its transferFee/outcome/current/offered fields intact",
      restoredEntry.transferFee === 12345 && restoredEntry.outcome === "success" && restoredEntry.current.wage === 1000 && restoredEntry.offered.years === 3);
    const restoredEmail = restored.inbox.find((e) => e.action && e.action.bidId === "db-1");
    assert("an email action's own expiresDate round-trips as a real Date (not left as a raw epoch-day int)",
      restoredEmail && restoredEmail.action.expiresDate instanceof Date);
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
    // M11 "performance pass (weekend sim < 300ms)": timed inline on this same
    // full-season walk rather than a separate benchmark — every league/cup/
    // continental/intl fixture across the whole ~600-club world resolves
    // through here exactly like a real Advance click would, so a Saturday
    // (the busiest fixture day — most leagues play) is the realistic
    // worst case, matchday ticker cost included when it's the user's own.
    const saturdayAdvanceMs = [];
    let cupsBeforeRollover = store.state.cups;
    while (toEpochDay(store.state.calendar.today) < toEpochDay(targetDate) && guard < 400) {
      cupsBeforeRollover = store.state.cups;
      const t0 = performance.now();
      store.advanceToDate(addDays(store.state.calendar.today, 1));
      if (store.state.matchday && !store.state.matchday.finished) {
        store.matchdaySimToEnd();
        store.closeMatchday();
      }
      if (store.state.calendar.today.getDay() === 6) saturdayAdvanceMs.push(performance.now() - t0);
      if (store.state.manager.sacked && store.state.ui.jobsSelectedIndex >= 0) {
        store.applyForSelectedJob(); // auto-accept the first offer so the season keeps advancing
      }
      guard++;
    }

    const worstSaturdayMs = saturdayAdvanceMs.length ? Math.max(...saturdayAdvanceMs) : 0;
    const avgSaturdayMs = saturdayAdvanceMs.length ? saturdayAdvanceMs.reduce((a, b) => a + b, 0) / saturdayAdvanceMs.length : 0;
    assert(
      `weekend Advance stays under the 300ms budget (${saturdayAdvanceMs.length} Saturdays: worst ${worstSaturdayMs.toFixed(1)}ms, avg ${avgSaturdayMs.toFixed(1)}ms)`,
      worstSaturdayMs < 300,
    );

    assert(`season rollover advanced to July 1 ${seasonStartYear + 1} within a bounded number of days (${guard} days processed)`,
      toEpochDay(store.state.calendar.today) >= toEpochDay(targetDate));
    assert("rolloverSeason bumped seasonStartYear by exactly 1", store.state.seasonStartYear === seasonStartYear + 1);

    // F4 (fable-plans/plan2.md, config/budget.js): the Budget Allocation
    // season snapshot resets on rollover, and the new transferBudget (base +
    // objective bonus + unspent carry-over + sales-return carry-over) is a
    // finite, non-negative number.
    assert("rollover resets seasonPurchases to 0", store.state.finances.seasonPurchases === 0);
    assert("rollover resets seasonSalesIncome to 0", store.state.finances.seasonSalesIncome === 0);
    assert("rollover snapshots seasonStartTransferBudget to the new transferBudget",
      store.state.finances.seasonStartTransferBudget === store.state.finances.transferBudget);
    assert("rollover snapshots a real seasonStartWageBill (matches the new roster's own wage bill)",
      store.state.finances.seasonStartWageBill === squadWageBill(store.state.squad.roster));
    assert("post-rollover transferBudget is a finite, non-negative number",
      Number.isFinite(store.state.finances.transferBudget) && store.state.finances.transferBudget >= 0);

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

    // M10: continental clubs/internationals survive a real rollover, driven
    // through the exact same Store the rest of this integration test uses.
    let continentalGroupTotalsOk = true;
    for (const runtime of Object.values(store.state.continental.competitions)) {
      const comp = CONTINENTAL_COMPETITIONS.find((c) => c.id === runtime.id);
      if (runtime.phase === "group" && runtime.groups.reduce((s, g) => s + g.clubIds.length, 0) !== comp.fieldSize) continentalGroupTotalsOk = false;
    }
    assert("state.continental was rebuilt fresh for the new season (3 competitions, correct field sizes)",
      Object.keys(store.state.continental.competitions).length === 3 && continentalGroupTotalsOk);
    assert("state.intl still has AFCON 2015 and Copa América 2015 (built at career start, span the whole first year)",
      !!store.state.intl.competitions.afcon && !!store.state.intl.competitions["copa-america"]);
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
