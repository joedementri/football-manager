// engine/gtn.js — Global Transfer Network pro scouting (fable-plans/
// plan1.md M8): scout market (hire pool refreshed weekly) + missions
// (region/position/type-tag instructions against the existing world) that
// progressively reveal a player's true overall/potential via
// player.scouting (level 0-3, ovrRange/potRange — the schema M2 already
// reserved for this milestone). Same "engine owns the state machine, store.js
// just calls into it" contract as engine/negotiation.js/freeagents.js.
//
// The "mission" model here (self-contained scout+region+tags+duration,
// bundled per scout) diverges from the real FIFA 15 GTN screen's structure —
// see ui/gtnui.js's header for the reference screenshots that surfaced this
// and why it was kept as-is.

import { RngStream, deriveSeed } from "../core/rng.js";
import { addDays, toEpochDay } from "../core/clock.js";
import { positionInfo } from "../config/positions.js";
import { randomName } from "../gen/names.js";
import {
  MAX_HIRED_SCOUTS, POOL_SIZE, POOL_REFRESH_DAYS, hireCost, sackCost, monthlySalary,
  scoutStatRangeForClub, MAX_SCOUTED_PLAYERS_BY_JUDGMENT, MISSION_TIERS, missionCost,
  FIND_COUNT_RANGE_BY_EXPERIENCE, FIRST_REPORT_DAYS, REPORT_INTERVAL_DAYS, scoutingRangeFor, tagScore,
  SCOUT_TAGS,
} from "../config/scouting.js";

function nextGtnId(state) {
  state.gtn.nextId = (state.gtn.nextId || 1);
  return `gtn-${state.gtn.nextId++}`;
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
}

function generateScoutCandidate(state, rng) {
  const range = scoutStatRangeForClub(state.club);
  const nation = rng.pick(state.staticData.nations);
  const name = randomName(rng, nation);
  return {
    id: nextGtnId(state),
    firstName: name.firstName,
    lastName: name.lastName,
    commonName: name.commonName,
    nationId: nation.id,
    experience: rng.int(range.expMin, range.expMax),
    judgment: rng.int(range.judgMin, range.judgMax),
  };
}

/** Fresh GTN state for a brand-new career (core/store.js's createCareerState
 * only — a loaded save already carries its own state.gtn, see core/db.js). */
export function createInitialGtnState(state) {
  const rng = new RngStream(deriveSeed(state.seed, "gtn-pool-initial"));
  const gtn = { scouts: [], pool: [], poolRefreshDate: state.calendar.today, missions: [], nextId: 1, lastSalaryPeriod: null };
  state.gtn = gtn;
  gtn.pool = Array.from({ length: POOL_SIZE }, () => generateScoutCandidate(state, rng));
  gtn.poolRefreshDate = addDays(state.calendar.today, POOL_REFRESH_DAYS);
  return gtn;
}

/* ============================================================================
 * Scout market: hire / sack
 * ========================================================================== */

export function hireScout(state, poolIndex) {
  const g = state.gtn;
  if (g.scouts.length >= MAX_HIRED_SCOUTS) return { error: "roster-full" };
  const candidate = g.pool[poolIndex];
  if (!candidate) return { error: "not-found" };
  const cost = hireCost(candidate.experience, candidate.judgment);
  if (cost > state.finances.transferBudget) return { error: "insufficient-funds", cost };
  state.finances.transferBudget -= cost;
  g.pool.splice(poolIndex, 1);
  const scout = { ...candidate, hiredDate: state.calendar.today, missionId: null };
  g.scouts.push(scout);
  return { ok: true, scout, cost };
}

export function sackScout(state, scoutId) {
  const g = state.gtn;
  const idx = g.scouts.findIndex((s) => s.id === scoutId);
  if (idx === -1) return { error: "not-found" };
  const scout = g.scouts[idx];
  const cost = sackCost(scout);
  state.finances.transferBudget -= cost;
  if (scout.missionId) cancelMission(state, scout.missionId);
  g.scouts.splice(idx, 1);
  return { ok: true, cost };
}

/* ============================================================================
 * Missions
 * ========================================================================== */

/**
 * @param {object} opts
 * @param {string} opts.scoutId
 * @param {string} opts.region - a data/nations.json id, or "ALL"
 * @param {string} opts.area - one of config/positions.js's AREAS, or "ALL"
 * @param {string[]} opts.tags - 0-2 config/scouting.js SCOUT_TAGS ids
 * @param {number} opts.minAge
 * @param {number} opts.maxAge
 * @param {number} opts.maxValue - 0 = no cap
 * @param {number} opts.tierIndex - index into config/scouting.js's MISSION_TIERS
 */
export function startMission(state, opts) {
  const g = state.gtn;
  const scout = g.scouts.find((s) => s.id === opts.scoutId);
  if (!scout) return { error: "not-found" };
  if (scout.missionId) return { error: "scout-busy" };
  const cost = missionCost(opts.tierIndex, scout);
  if (cost > state.finances.transferBudget) return { error: "insufficient-funds", cost };
  state.finances.transferBudget -= cost;

  const tier = MISSION_TIERS[opts.tierIndex];
  const today = state.calendar.today;
  const mission = {
    id: nextGtnId(state),
    scoutId: scout.id,
    region: opts.region || "ALL",
    area: opts.area || "ALL",
    tags: (opts.tags || []).slice(0, 2),
    minAge: opts.minAge || 0,
    maxAge: opts.maxAge || 0,
    maxValue: opts.maxValue || 0,
    tierIndex: opts.tierIndex,
    tierLabel: tier.label,
    cost,
    startDate: today,
    endDate: addMonths(today, tier.months),
    nextReportDate: addDays(today, FIRST_REPORT_DAYS),
    foundPlayerIds: [],
    seenPlayerIds: [],
    updatedPlayerIds: [],
    status: "active",
  };
  scout.missionId = mission.id;
  g.missions.push(mission);
  return { ok: true, mission };
}

export function cancelMission(state, missionId) {
  const g = state.gtn;
  const idx = g.missions.findIndex((m) => m.id === missionId);
  if (idx === -1) return;
  const mission = g.missions[idx];
  const scout = g.scouts.find((s) => s.id === mission.scoutId);
  if (scout && scout.missionId === missionId) scout.missionId = null;
  g.missions.splice(idx, 1);
}

/** Marks every player this mission has found as "seen" (Central/Transfers'
 * "+N New / N Updates" badges clear once the user actually opens the
 * report — same convention as core/store.js's selectEmail marking read). */
export function viewMission(state, missionId) {
  const mission = state.gtn.missions.find((m) => m.id === missionId);
  if (!mission) return;
  mission.seenPlayerIds = mission.foundPlayerIds.slice();
  mission.updatedPlayerIds = [];
}

function candidatePlayersForMission(state, mission) {
  return state.players.filter((p) => {
    if (p.clubId === state.club.id) return false;
    if (mission.foundPlayerIds.includes(p.id)) return false;
    if (mission.area !== "ALL" && positionInfo(p.position).area !== mission.area) return false;
    if (mission.region !== "ALL" && p.nationId !== mission.region) return false;
    if (mission.minAge && p.age < mission.minAge) return false;
    if (mission.maxAge && p.age > mission.maxAge) return false;
    if (mission.maxValue && p.value > mission.maxValue) return false;
    return true;
  });
}

function pickNewFinds(rng, pool, mission, wantCount, remainingCap) {
  const n = Math.min(wantCount, remainingCap, pool.length);
  if (n <= 0) return [];
  if (!mission.tags.length) return rng.shuffle(pool).slice(0, n);
  const scored = pool.map((p) => ({ p, score: tagScore(p, mission.tags) + rng.next() * 5 }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, n).map((s) => s.p);
}

/** Narrows an already-found player's fuzzy range by one scouting level
 * (never past 3/exact, never downgrades a level another mission already
 * pushed higher). */
function narrowPlayerKnowledge(player) {
  if (player.scouting.level >= 3) return;
  player.scouting.level += 1;
  player.scouting.ovrRange = scoutingRangeFor(player.overall, player.scouting.level);
  player.scouting.potRange = scoutingRangeFor(player.potential, player.scouting.level);
}

/** One mission's report tick — a no-op unless `today` has reached
 * `mission.nextReportDate` (plan1.md M8: "After 10 days first report, then
 * updates weekly"). Existing finds narrow a level; new finds (up to the
 * scout's Judgment-tier cap) are added at level 1. */
function processMissionReport(state, mission, today) {
  if (mission.status !== "active") return;
  if (toEpochDay(today) < toEpochDay(mission.nextReportDate)) return;
  const scout = state.gtn.scouts.find((s) => s.id === mission.scoutId);
  if (!scout) return;
  const rng = new RngStream(deriveSeed(state.seed, `gtn-report-${mission.id}-${toEpochDay(today)}`));

  for (const pid of mission.foundPlayerIds) {
    const player = state.playersById.get(pid);
    if (!player) continue;
    narrowPlayerKnowledge(player);
    if (mission.seenPlayerIds.includes(pid) && !mission.updatedPlayerIds.includes(pid)) {
      mission.updatedPlayerIds.push(pid);
    }
  }

  const cap = MAX_SCOUTED_PLAYERS_BY_JUDGMENT[scout.judgment];
  const remainingCap = cap - mission.foundPlayerIds.length;
  if (remainingCap > 0) {
    const [lo, hi] = FIND_COUNT_RANGE_BY_EXPERIENCE[scout.experience];
    const wantCount = rng.int(lo, hi);
    const pool = candidatePlayersForMission(state, mission);
    const picked = pickNewFinds(rng, pool, mission, wantCount, remainingCap);
    for (const p of picked) {
      p.scouting.level = Math.max(p.scouting.level, 1);
      p.scouting.ovrRange = scoutingRangeFor(p.overall, p.scouting.level);
      p.scouting.potRange = scoutingRangeFor(p.potential, p.scouting.level);
      mission.foundPlayerIds.push(p.id);
    }
  }

  mission.nextReportDate = addDays(today, REPORT_INTERVAL_DAYS);
}

function applyMonthlySalaries(state, today) {
  if (today.getDate() !== 1) return;
  const period = `${today.getFullYear()}-${today.getMonth()}`;
  if (state.gtn.lastSalaryPeriod === period) return;
  state.gtn.lastSalaryPeriod = period;
  const total = state.gtn.scouts.reduce((sum, s) => sum + monthlySalary(s.experience, s.judgment), 0);
  if (total > 0) state.finances.transferBudget -= total;
}

function refreshScoutPool(state, today) {
  const g = state.gtn;
  if (toEpochDay(today) < toEpochDay(g.poolRefreshDate)) return;
  const rng = new RngStream(deriveSeed(state.seed, `gtn-pool-${toEpochDay(today)}`));
  g.pool = Array.from({ length: POOL_SIZE }, () => generateScoutCandidate(state, rng));
  g.poolRefreshDate = addDays(today, POOL_REFRESH_DAYS);
}

/** Runs every calendar day the Advance loop steps into (core/store.js's
 * _processCalendarDay, same footing as engine/transferai.js's weekly hooks):
 * refreshes the hire pool on its weekly cadence, charges scout salaries on
 * the 1st of each month, advances every active mission's report cycle, and
 * retires missions that have reached their own duration. */
export function runDailyGtnActivity(state, today) {
  refreshScoutPool(state, today);
  applyMonthlySalaries(state, today);
  for (const mission of state.gtn.missions) processMissionReport(state, mission, today);
  for (const mission of state.gtn.missions) {
    if (mission.status === "active" && toEpochDay(today) >= toEpochDay(mission.endDate)) {
      mission.status = "completed";
      const scout = state.gtn.scouts.find((s) => s.id === mission.scoutId);
      if (scout && scout.missionId === mission.id) scout.missionId = null;
    }
  }
}

/* ============================================================================
 * Derived read helpers (ui/gtnui.js + ui/render.js)
 * ========================================================================== */

export function missionNewCount(mission) {
  return mission.foundPlayerIds.filter((id) => !mission.seenPlayerIds.includes(id)).length;
}
export function missionUpdateCount(mission) {
  return mission.updatedPlayerIds.length;
}

/** The single most attention-worthy mission (Central's GTN tile and
 * Transfers' scouted-group tile both preview just one group at a time, per
 * the reference screenshot) — most New+Updates first, most recently started
 * breaks ties, so a freshly created mission is visible even before its
 * first report lands. Null once there has never been a mission at all. */
export function primaryMission(missions) {
  if (!missions.length) return null;
  return missions.slice().sort((a, b) => {
    const scoreDiff = (missionNewCount(b) + missionUpdateCount(b)) - (missionNewCount(a) + missionUpdateCount(a));
    if (scoreDiff !== 0) return scoreDiff;
    return toEpochDay(b.startDate) - toEpochDay(a.startDate);
  })[0];
}

/** Every mission's own group label, matching the reference screenshot's
 * "STRIKER" / "Pacey, Prolific" tile — area name (or "Any Position") as the
 * title, the tags' display labels as the subtitle. */
export function missionTitle(mission) {
  if (mission.area === "ALL") return "Any Position";
  return { GK: "Goalkeeper", DEF: "Defender", MID: "Midfielder", ATT: "Striker" }[mission.area] || mission.area;
}
export function missionTagsLabel(mission) {
  return mission.tags.map((id) => SCOUT_TAGS.find((t) => t.id === id)?.label || id).join(", ") || "Promising";
}
