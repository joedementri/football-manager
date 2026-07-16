// gen/squad.js — generates one club's 24-man squad: a slot plan (3 GK / 8
// DEF / 8 MID / 5 ATT per plan1.md), a target overall per slot (from
// config/playergen.js's clubOverallTarget, biased so early slots in an area
// are the "starters" and later ones are squad depth), a nationality per
// player (mostly the club's own country, sometimes an import), and finally
// kit numbers + squad roles once the full 24 is known (both need the whole
// squad, not just one player, hence living here rather than in
// gen/player.js).

import { positionInfo } from "../config/positions.js";
import { clubOverallTarget, SQUAD_TEMPLATE } from "../config/playergen.js";
import { generatePlayer } from "./player.js";

// Slight rng variety on top of the fixed template so not every club fields
// literally the same slot layout (occasional wing-back instead of full-back).
function varySlot(rng, code) {
  if ((code === "RB" || code === "LB") && rng.chance(0.15)) return code === "RB" ? "RWB" : "LWB";
  return code;
}

function buildSlotPlan(rng) {
  const slots = [];
  for (const code of SQUAD_TEMPLATE.GK) slots.push({ code, area: "GK" });
  SQUAD_TEMPLATE.DEF.forEach((code) => slots.push({ code: varySlot(rng, code), area: "DEF" }));
  SQUAD_TEMPLATE.MID.forEach((code) => slots.push({ code, area: "MID" }));
  SQUAD_TEMPLATE.ATT.forEach((code) => slots.push({ code, area: "ATT" }));
  return slots;
}

// How many of each area's slots count as "starters" (get a small overall
// bonus) vs. squad depth (small penalty) — roughly a 4-4-2's 1/4/4/2 split.
const STARTER_COUNT = { GK: 1, DEF: 4, MID: 4, ATT: 2 };

// Exported for reuse by engine/retirement.js (M5 regens: a new prospect
// needs a plausible nationality the same way an initial-squad player does)
// and engine/jobs.js (a manager switching clubs mid-career doesn't regenerate
// players, but shares no nation-picking need — kept here for one call site,
// documented so a future one doesn't reinvent it).
export function pickNation(rng, club, league, nationsById, nationsByName) {
  const homeNation = nationsByName.get(league.country);
  if (homeNation && rng.chance(0.65)) return homeNation;
  const pool = [...nationsById.values()];
  const totalWeight = pool.reduce((s, n) => s + n.qualityWeight, 0);
  let roll = rng.next() * totalWeight;
  for (const n of pool) {
    roll -= n.qualityWeight;
    if (roll <= 0) return n;
  }
  return homeNation || pool[0];
}

const ROLE_BY_QUARTILE = ["prospect", "rotation", "important", "crucial"];

function assignSquadRoles(players) {
  const sorted = [...players].sort((a, b) => a.overall - b.overall);
  sorted.forEach((p, i) => {
    const quartile = Math.min(3, Math.floor((i / sorted.length) * 4));
    p.contract.squadRole = ROLE_BY_QUARTILE[quartile];
  });
}

const RESERVED_GK_NUMBERS = [1, 12, 13];

function assignKitNumbers(rng, players) {
  const gks = players.filter((p) => positionInfo(p.position).area === "GK");
  const others = rng.shuffle(players.filter((p) => positionInfo(p.position).area !== "GK"));
  gks.forEach((gk, i) => { gk.kitNumber = RESERVED_GK_NUMBERS[i] ?? 12 + i; });

  let n = 2;
  for (const p of others) {
    while (RESERVED_GK_NUMBERS.includes(n)) n++;
    p.kitNumber = n++;
  }
}

const XI_TEMPLATE = [
  { slot: "GK", x: 50, y: 92, gk: true },
  { slot: "LB", x: 15, y: 72 },
  { slot: "LCB", x: 39, y: 75 },
  { slot: "RCB", x: 61, y: 75 },
  { slot: "RB", x: 85, y: 72 },
  { slot: "LM", x: 13, y: 46 },
  { slot: "LCM", x: 39, y: 50 },
  { slot: "RCM", x: 61, y: 50, captain: true },
  { slot: "RM", x: 87, y: 46 },
  { slot: "LS", x: 34, y: 18 },
  { slot: "RS", x: 66, y: 18 },
];

/** Picks a believable best-XI (by overall) and maps it onto the existing
 * 4-4-2 pitch layout (js/core/store.js's stub used the same x/y grid).
 * Exported for reuse by engine/jobs.js (M5): accepting a new job needs a
 * fresh lineup built from the new club's existing roster, not a freshly
 * generated squad. */
export function pickBestXI(players) {
  const remaining = new Set(players);
  const take = (predicate, sortDesc = true) => {
    const pool = [...remaining].filter(predicate);
    pool.sort((a, b) => sortDesc ? b.overall - a.overall : a.overall - b.overall);
    const picked = pool[0];
    if (picked) remaining.delete(picked);
    return picked;
  };
  const areaOf = (p) => positionInfo(p.position).area;
  const sideOf = (p) => positionInfo(p.position).side;
  const groupOf = (p) => positionInfo(p.position).overallGroup;

  const gk = take((p) => areaOf(p) === "GK");
  const rb = take((p) => areaOf(p) === "DEF" && groupOf(p) === "FB" && sideOf(p) === "R")
    || take((p) => areaOf(p) === "DEF" && groupOf(p) === "FB");
  const lb = take((p) => areaOf(p) === "DEF" && groupOf(p) === "FB" && sideOf(p) === "L")
    || take((p) => areaOf(p) === "DEF" && groupOf(p) === "FB");
  const cb1 = take((p) => areaOf(p) === "DEF" && groupOf(p) === "CB");
  const cb2 = take((p) => areaOf(p) === "DEF" && groupOf(p) === "CB")
    || take((p) => areaOf(p) === "DEF");

  const rm = take((p) => (areaOf(p) === "MID" || areaOf(p) === "ATT") && groupOf(p) === "WM_WING" && sideOf(p) === "R")
    || take((p) => areaOf(p) === "MID" && groupOf(p) !== "CDM");
  const lm = take((p) => (areaOf(p) === "MID" || areaOf(p) === "ATT") && groupOf(p) === "WM_WING" && sideOf(p) === "L")
    || take((p) => areaOf(p) === "MID" && groupOf(p) !== "CDM");
  const cm1 = take((p) => areaOf(p) === "MID" && (groupOf(p) === "CM" || groupOf(p) === "CDM" || groupOf(p) === "CAM"));
  const cm2 = take((p) => areaOf(p) === "MID" && (groupOf(p) === "CM" || groupOf(p) === "CDM" || groupOf(p) === "CAM"))
    || take((p) => areaOf(p) === "MID");

  const st1 = take((p) => areaOf(p) === "ATT");
  const st2 = take((p) => areaOf(p) === "ATT") || take(() => true);

  const bySlot = { GK: gk, LB: lb, LCB: cb1, RCB: cb2, RB: rb, LM: lm, LCM: cm1, RCM: cm2, RM: rm, LS: st1, RS: st2 };

  return XI_TEMPLATE.map((t) => {
    const p = bySlot[t.slot] || [...players][0];
    return {
      pos: t.slot, name: p.commonName, rating: p.overall, x: t.x, y: t.y,
      gk: !!t.gk, captain: !!t.captain, playerId: p.id,
    };
  });
}

/**
 * @param {object} opts
 * @param {import("../core/rng.js").RngStream} opts.rng
 * @param {object} opts.club
 * @param {object} opts.league
 * @param {Map<string,object>} opts.nationsById
 * @param {Map<string,object>} opts.nationsByName
 * @param {number} opts.seasonStartYear
 * @returns {{ players: object[], lineup: object[] }}
 */
export function generateSquad({ rng, club, league, nationsById, nationsByName, seasonStartYear }) {
  const { mean, spread } = clubOverallTarget(club, league);
  const slots = buildSlotPlan(rng);

  const areaIndex = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  const players = slots.map(({ code, area }) => {
    const isStarter = areaIndex[area] < STARTER_COUNT[area];
    areaIndex[area]++;
    const bonus = isStarter ? spread * 0.6 : -spread * 0.5;
    const targetOverall = Math.round(rng.gaussian(mean + bonus, spread * 0.7));
    const nation = pickNation(rng, club, league, nationsById, nationsByName);
    return generatePlayer({
      rng, positionCode: code, nation, club, league, targetOverall, seasonStartYear,
    });
  });

  assignSquadRoles(players);
  assignKitNumbers(rng, players);
  const lineup = pickBestXI(players);

  return { players, lineup };
}
