// engine/academy.js — Youth academy (fable-plans/plan1.md M9): youth-scout
// market (hire pool refreshed weekly, same "engine owns the state machine"
// contract as engine/gtn.js), scout assignments (nation + player-type
// request + fixed duration — REFERENCE_PICS/more_screens/OFFICE_SCREEN/
// ms_YOUTH_STAFF_SCREEN.png shows a scout relocating to one country for a
// fixed "Duration"/"Returning" window, so engine/gtn.js's own MISSION_TIERS
// is reused here rather than inventing a second duration scale), the youth
// squad roster (max 16, monthly development + progressive scouting reveal +
// a retirement-threat clock), and promote/release.
//
// Youth prospects are full Player-shaped objects (gen/player.js's
// generatePlayer, same as engine/retirement.js's regens) but deliberately
// live in state.academy.roster, NOT state.players/playersById/playersByClub —
// they aren't first-team pros yet (no wage bill, not transfer-listable, not
// visible to GTN/Search Players), so keeping them out of every "the whole
// world's players" collection avoids teaching a dozen unrelated systems
// (squad.roster's wage-bill sum, contract-expiry warnings, transfer AI's
// club-needs scan, ...) to filter an `isYouth` flag they'd otherwise have to
// special-case. promoteProspect is the one place a prospect crosses that
// boundary — it pushes into state.players and re-syncs the derived indices
// by hand, the exact same pattern engine/season.js's rollover step 14 uses
// after retirements/regens mutate state.players.

import { RngStream, deriveSeed } from "../core/rng.js";
import { addDays, toEpochDay } from "../core/clock.js";
import { positionInfo, codesForWorkrateGroup } from "../config/positions.js";
import { ratioForAge } from "../config/growth.js";
import { ALL_ATTRIBUTES } from "../config/attributes.js";
import { randomName } from "../gen/names.js";
import { generatePlayer, recomputeOverall } from "../gen/player.js";
import { computeWage } from "./wage.js";
import { recomputeValue } from "./value.js";
import { toField } from "./objectives.js";
import {
  POOL_SIZE, POOL_REFRESH_DAYS, hireCost, sackCost, monthlySalary,
  scoutStatRangeForClub, scoutingRangeFor, MISSION_TIERS,
} from "../config/scouting.js";
import {
  MAX_YOUTH_SCOUTS, YOUTH_PLAYER_MIN_AGE, YOUTH_PLAYER_MAX_AGE, PLAYER_TYPES,
  pickWorkrateGroupForType, rollPotentialTier, EXACT_TYPE_MATCH_PCT_BY_EXPERIENCE,
  PROSPECTS_PER_REPORT_BY_EXPERIENCE, MAX_YOUTH_SQUAD_SIZE, MIN_PROMOTION_AGE,
  MONTHS_TO_UNCOVER_PLAYER_TYPE, MONTHS_BETWEEN_NARROW_STEPS, MONTHS_IN_SQUAD_BEFORE_RETIREMENT,
  RETIREMENT_WARNING_DAYS, retirementChancePct,
} from "../config/youth.js";

function nextAcademyId(state) {
  state.academy.nextId = state.academy.nextId || 1;
  return `aca-${state.academy.nextId++}`;
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
}

function monthsBetween(from, to) {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

/** Jul 1 -> Jun 30 season progress, 0-100 (config/youth.js's
 * retirementChancePct interpolates scout.ini's 4 season-progress
 * checkpoints against this). */
function seasonProgressPct(today, seasonStartYear) {
  const start = new Date(seasonStartYear, 6, 1).getTime();
  const end = new Date(seasonStartYear + 1, 6, 1).getTime();
  return ((today.getTime() - start) / (end - start)) * 100;
}

function generateScoutCandidate(state, rng) {
  const range = scoutStatRangeForClub(state.club);
  const nation = rng.pick(state.staticData.nations);
  const name = randomName(rng, nation);
  return {
    id: nextAcademyId(state),
    firstName: name.firstName,
    lastName: name.lastName,
    commonName: name.commonName,
    nationId: nation.id,
    experience: rng.int(range.expMin, range.expMax),
    judgment: rng.int(range.judgMin, range.judgMax),
  };
}

/** Fresh academy state for a brand-new career (core/store.js's
 * createCareerState only — a loaded save carries its own state.academy, see
 * core/db.js's header). */
export function createInitialAcademyState(state) {
  const rng = new RngStream(deriveSeed(state.seed, "academy-pool-initial"));
  const academy = {
    scouts: [], pool: [], poolRefreshDate: state.calendar.today,
    roster: [], nextId: 1, lastSalaryPeriod: null,
  };
  state.academy = academy;
  academy.pool = Array.from({ length: POOL_SIZE }, () => generateScoutCandidate(state, rng));
  academy.poolRefreshDate = addDays(state.calendar.today, POOL_REFRESH_DAYS);
  return academy;
}

/* ============================================================================
 * Scout market: hire / sack
 * ========================================================================== */

export function hireYouthScout(state, poolIndex) {
  const a = state.academy;
  if (a.scouts.length >= MAX_YOUTH_SCOUTS) return { error: "roster-full" };
  const candidate = a.pool[poolIndex];
  if (!candidate) return { error: "not-found" };
  const cost = hireCost(candidate.experience, candidate.judgment);
  if (cost > state.finances.transferBudget) return { error: "insufficient-funds", cost };
  state.finances.transferBudget -= cost;
  a.pool.splice(poolIndex, 1);
  const scout = { ...candidate, hiredDate: state.calendar.today, assignment: null };
  a.scouts.push(scout);
  return { ok: true, scout, cost };
}

export function sackYouthScout(state, scoutId) {
  const a = state.academy;
  const idx = a.scouts.findIndex((s) => s.id === scoutId);
  if (idx === -1) return { error: "not-found" };
  const scout = a.scouts[idx];
  const cost = sackCost(scout);
  state.finances.transferBudget -= cost;
  a.scouts.splice(idx, 1);
  return { ok: true, cost };
}

/* ============================================================================
 * Assignment: scout -> nation + player-type request + duration
 * ========================================================================== */

/**
 * @param {object} opts
 * @param {string} opts.scoutId
 * @param {string} opts.nationId - a data/nations.json id (always a single
 *   nation — "Send to a nation", plan1.md M9 verbatim — unlike M8's GTN
 *   missions, which allow a worldwide "ALL" search)
 * @param {string|null} opts.type - a config/youth.js PLAYER_TYPES id, or null
 *   for "Any"
 * @param {number} opts.tierIndex - index into config/scouting.js's MISSION_TIERS
 */
export function assignScout(state, opts) {
  const a = state.academy;
  const scout = a.scouts.find((s) => s.id === opts.scoutId);
  if (!scout) return { error: "not-found" };
  if (scout.assignment) return { error: "scout-busy" };
  if (!opts.nationId) return { error: "no-nation" };

  const tier = MISSION_TIERS[opts.tierIndex] || MISSION_TIERS[0];
  const today = state.calendar.today;
  scout.assignment = {
    nationId: opts.nationId,
    type: opts.type || null,
    tierIndex: opts.tierIndex ?? 0,
    tierLabel: tier.label,
    startDate: today,
    endDate: addMonths(today, tier.months),
    nextReportDate: addMonths(today, 1),
  };
  return { ok: true, scout };
}

/** Recalls a scout early — no refund (assigning is free, only hiring/salary
 * cost money; see this file's header on why there's no per-assignment fee
 * to refund, unlike engine/gtn.js's cancelMission). */
export function recallScout(state, scoutId) {
  const scout = state.academy.scouts.find((s) => s.id === scoutId);
  if (!scout) return;
  scout.assignment = null;
}

/* ============================================================================
 * Prospect generation
 * ========================================================================== */

function pickEffectiveType(rng, scout) {
  const requested = scout.assignment.type;
  if (!requested) return rng.pick(PLAYER_TYPES).id;
  const exactPct = EXACT_TYPE_MATCH_PCT_BY_EXPERIENCE[scout.experience];
  if (rng.chance(exactPct / 100)) return requested;
  const others = PLAYER_TYPES.map((t) => t.id).filter((id) => id !== requested);
  return rng.pick(others);
}

function generateProspect(state, rng, scout, today) {
  const nation = state.staticData.nations.find((n) => n.id === scout.assignment.nationId) || rng.pick(state.staticData.nations);
  const effectiveType = pickEffectiveType(rng, scout);
  const group = pickWorkrateGroupForType(rng, effectiveType);
  const codes = codesForWorkrateGroup(group);
  const positionCode = codes.length ? rng.pick(codes) : "CM";

  const age = rng.int(YOUTH_PLAYER_MIN_AGE, YOUTH_PLAYER_MAX_AGE);
  const tier = rollPotentialTier(rng, scout.judgment);
  const potential = rng.int(tier.range[0], tier.range[1]);
  const curveRatio = ratioForAge(positionInfo(positionCode).growthCurve, age);
  const targetOverall = Math.round(potential * curveRatio);

  const prospect = generatePlayer({
    rng, positionCode, nation, club: state.club, league: state.league,
    targetOverall, seasonStartYear: state.seasonStartYear,
    ageOverride: age, potentialOverride: potential,
  });

  prospect.isYouth = true;
  prospect.academyType = effectiveType;
  prospect.academyTierLabel = tier.label;
  prospect.academyJoinedDate = today;
  prospect.nextDevelopmentDate = addMonths(today, 1);
  prospect.retirementWarningDate = null;
  // Visible immediately as a wide range (plan1.md M9: "shown to user only as
  // ranges + the potential band strings") — unlike a fresh world player
  // (gen/player.js's own default), a youth-academy find always starts at
  // level 1, never hidden at level 0.
  prospect.scouting = {
    level: 1,
    ovrRange: scoutingRangeFor(prospect.overall, 1),
    potRange: scoutingRangeFor(prospect.potential, 1),
  };
  return prospect;
}

function processScoutReport(state, scout, today) {
  if (!scout.assignment) return;
  if (toEpochDay(today) < toEpochDay(scout.assignment.nextReportDate)) return;
  const a = state.academy;
  const remainingCap = MAX_YOUTH_SQUAD_SIZE - a.roster.length;
  if (remainingCap > 0) {
    const rng = new RngStream(deriveSeed(state.seed, `academy-report-${scout.id}-${toEpochDay(today)}`));
    const [lo, hi] = PROSPECTS_PER_REPORT_BY_EXPERIENCE[scout.experience];
    const wantCount = Math.min(remainingCap, rng.int(lo, hi));
    for (let i = 0; i < wantCount; i++) {
      a.roster.push(generateProspect(state, rng, scout, today));
    }
  }
  scout.assignment.nextReportDate = addMonths(today, 1);
}

/* ============================================================================
 * Youth squad: monthly development, progressive reveal, retirement threat
 * ========================================================================== */

/** Small monthly attribute growth (plan1.md M9: "players develop monthly
 * (small attr gains)") — nudges 2-4 random attributes up, then reverts if
 * the result would push overall past the prospect's own (hidden) potential,
 * so a prospect's true ceiling is always respected. */
function developProspect(rng, prospect) {
  const before = { ...prospect.attrs };
  const nudgeCount = rng.int(2, 4);
  for (let i = 0; i < nudgeCount; i++) {
    const attr = rng.pick(ALL_ATTRIBUTES);
    prospect.attrs[attr] = Math.min(99, prospect.attrs[attr] + rng.int(1, 2));
  }
  recomputeOverall(prospect);
  if (prospect.overall > prospect.potential) {
    prospect.attrs = before;
    recomputeOverall(prospect);
  }
}

/** Narrows one scouting.level (never past 3/exact) — same mechanic as
 * engine/gtn.js's narrowPlayerKnowledge, reusing config/scouting.js's shared
 * fuzzy-range table. */
function narrowProspectKnowledge(prospect) {
  if (prospect.scouting.level >= 3) return;
  prospect.scouting.level += 1;
  prospect.scouting.ovrRange = scoutingRangeFor(prospect.overall, prospect.scouting.level);
  prospect.scouting.potRange = scoutingRangeFor(prospect.potential, prospect.scouting.level);
}

function buildRetirementWarningEmail({ prospect, club, managerName, today }) {
  return {
    from: "YOUTH ACADEMY", to: toField(managerName), cc: "Assistant Manager", crest: `crest-${club.id}`,
    date: new Date(today), read: false,
    subject: `[Youth] ${prospect.commonName} is considering his future`,
    body: [
      `Boss,`,
      `${prospect.commonName} (${prospect.age}) has been in the youth academy a while now and is growing frustrated waiting for a chance at first-team football.`,
      `If we don't promote him to the first team within ${RETIREMENT_WARNING_DAYS} days, he'll leave the academy for good.`,
    ],
    action: { type: "youth-retirement-warning", prospectId: prospect.id },
  };
}

/** One prospect's monthly tick — a no-op unless `today` has reached
 * `nextDevelopmentDate`. Runs development, then (independently, both keyed
 * off the same months-since-joined clock) scouting-level narrowing and the
 * retirement-threat roll. */
function tickProspect(state, prospect, today) {
  if (toEpochDay(today) < toEpochDay(prospect.nextDevelopmentDate)) return;
  const rng = new RngStream(deriveSeed(state.seed, `academy-dev-${prospect.id}-${toEpochDay(today)}`));
  developProspect(rng, prospect);

  const monthsSinceJoin = monthsBetween(prospect.academyJoinedDate, today);
  if (monthsSinceJoin >= MONTHS_BETWEEN_NARROW_STEPS && prospect.scouting.level < 2) narrowProspectKnowledge(prospect);
  if (monthsSinceJoin >= MONTHS_TO_UNCOVER_PLAYER_TYPE && prospect.scouting.level < 3) narrowProspectKnowledge(prospect);

  if (monthsSinceJoin >= MONTHS_IN_SQUAD_BEFORE_RETIREMENT && !prospect.retirementWarningDate) {
    const pct = retirementChancePct(prospect.age, seasonProgressPct(today, state.seasonStartYear));
    if (pct > 0 && rng.chance(pct / 100)) {
      prospect.retirementWarningDate = today;
      state.inbox.emails.unshift(buildRetirementWarningEmail({
        prospect, club: state.club, managerName: state.manager.name, today,
      }));
    }
  }

  prospect.nextDevelopmentDate = addMonths(today, 1);
}

/** Removes any prospect whose retirement-warning grace period
 * (RETIREMENT_WARNING_DAYS) has elapsed without being promoted — the
 * mechanical consequence of ignoring buildRetirementWarningEmail, same
 * "warn then act" shape as engine/contracts.js's Bosman departures. */
function resolveRetirementDepartures(state, today) {
  const a = state.academy;
  a.roster = a.roster.filter((p) => {
    if (!p.retirementWarningDate) return true;
    return toEpochDay(today) < toEpochDay(addDays(p.retirementWarningDate, RETIREMENT_WARNING_DAYS));
  });
}

/* ============================================================================
 * Promote / release
 * ========================================================================== */

/** True once a prospect can be promoted (plan1.md M9's "promote (signs 3-yr
 * pro contract, joins seniors...)" — scout.ini's MIN_PLAYER_AGE_FOR_PROMOTION). */
export function isPromotable(prospect) {
  return prospect.age >= MIN_PROMOTION_AGE;
}

/** Moves a prospect out of the youth squad and into the first team on a
 * fresh 3-year professional contract (plan1.md M9 verbatim) — the one place
 * a prospect crosses into state.players; re-syncs playersById/playersByClub/
 * squad.roster by hand afterward, same pattern as engine/season.js's
 * rollover step 14 after retirements/regens mutate state.players. */
export function promoteProspect(state, prospectId) {
  const a = state.academy;
  const idx = a.roster.findIndex((p) => p.id === prospectId);
  if (idx === -1) return { error: "not-found" };
  const prospect = a.roster[idx];
  if (!isPromotable(prospect)) return { error: "too-young" };

  a.roster.splice(idx, 1);
  prospect.isYouth = false;
  prospect.contract = {
    wage: computeWage({ overall: prospect.overall, age: prospect.age, position: prospect.position }, state.league),
    endYear: state.seasonStartYear + 3,
    signingBonus: 0, squadRole: "prospect", warnedExpiry: false,
    preAgreedClubId: null, preAgreedTerms: null,
  };
  // A promotion is always known fully (it's already the user's own player) —
  // same convention as engine/contracts.js's movePlayerToClub.
  prospect.scouting = { level: 3, ovrRange: [prospect.overall, prospect.overall], potRange: [prospect.potential, prospect.potential] };
  recomputeValue(prospect, state.club, state.seasonStartYear);
  prospect.kitNumber = 1 + state.squad.roster.reduce((max, p) => Math.max(max, p.kitNumber || 0), 0);

  state.players.push(prospect);
  state.playersById.set(prospect.id, prospect);
  if (!state.playersByClub.has(state.club.id)) state.playersByClub.set(state.club.id, []);
  state.playersByClub.get(state.club.id).push(prospect);
  state.squad.roster = state.playersByClub.get(state.club.id).slice().sort((a2, b2) => b2.overall - a2.overall);

  return { ok: true, player: prospect };
}

/** Releases a prospect from the youth squad — no further consequence
 * (plan1.md M9: "...or release"). */
export function releaseProspect(state, prospectId) {
  const a = state.academy;
  const idx = a.roster.findIndex((p) => p.id === prospectId);
  if (idx === -1) return { error: "not-found" };
  a.roster.splice(idx, 1);
  return { ok: true };
}

/** July 1 rollover step (engine/season.js): state.academy.roster deliberately
 * lives outside state.players (see this file's header), so it's excluded
 * from that file's own "for (const p of state.players) p.age += 1" age-up —
 * called separately, same season-rollover step, so a prospect discovered at
 * 15 eventually ages into MIN_PROMOTION_AGE like any other player. */
export function ageUpAcademyRoster(state) {
  for (const p of state.academy.roster) p.age += 1;
}

/* ============================================================================
 * Daily driver
 * ========================================================================== */

function applyMonthlySalaries(state, today) {
  if (today.getDate() !== 1) return;
  const period = `${today.getFullYear()}-${today.getMonth()}`;
  if (state.academy.lastSalaryPeriod === period) return;
  state.academy.lastSalaryPeriod = period;
  const total = state.academy.scouts.reduce((sum, s) => sum + monthlySalary(s.experience, s.judgment), 0);
  if (total > 0) state.finances.transferBudget -= total;
}

function refreshScoutPool(state, today) {
  const a = state.academy;
  if (toEpochDay(today) < toEpochDay(a.poolRefreshDate)) return;
  const rng = new RngStream(deriveSeed(state.seed, `academy-pool-${toEpochDay(today)}`));
  a.pool = Array.from({ length: POOL_SIZE }, () => generateScoutCandidate(state, rng));
  a.poolRefreshDate = addDays(today, POOL_REFRESH_DAYS);
}

/** Runs every calendar day the Advance loop steps into (core/store.js's
 * _processCalendarDay, same footing as engine/gtn.js's runDailyGtnActivity):
 * refreshes the hire pool weekly, charges scout salaries on the 1st of each
 * month, advances every assigned scout's monthly report + recalls anyone
 * whose assignment has run its duration, ticks every roster prospect's
 * monthly development/reveal/retirement-threat clock, and removes anyone
 * whose retirement-warning grace period has lapsed. */
export function runDailyAcademyActivity(state, today) {
  const a = state.academy;
  refreshScoutPool(state, today);
  applyMonthlySalaries(state, today);
  for (const scout of a.scouts) {
    if (!scout.assignment) continue;
    processScoutReport(state, scout, today);
    if (toEpochDay(today) >= toEpochDay(scout.assignment.endDate)) scout.assignment = null;
  }
  for (const prospect of a.roster) tickProspect(state, prospect, today);
  resolveRetirementDepartures(state, today);
}
