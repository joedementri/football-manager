// core/db.js — IndexedDB wrapper + save-game persistence.
//
// The bottom half of this file (from "compact player serialization" down)
// is the M2 scope fable-plans/plan1.md assigns here: 3 save slots +
// autosave, and player records packed into compact fixed-order arrays so a
// ~15k-player world stays a few MB. Static reference data (leagues/clubs/
// nations/cups) is NOT duplicated into a save — it's re-fetched from
// data/*.json on load (gen/world.js already does this cheaply) — only the
// generated players, the derived lineups, and the manager/calendar state
// that can't be re-derived get persisted.

import { POSITION_CODES } from "../config/positions.js";
import { ALL_ATTRIBUTES } from "../config/attributes.js";
import { toEpochDay, fromEpochDay } from "./clock.js";

const DB_NAME = "fm-career";
const DB_VERSION = 1;
const STORE = "kv";

/** @returns {Promise<IDBDatabase>} */
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise = null;
function getDb() {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

/** Read a value by key. Resolves undefined if absent. */
export async function get(key) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Write a value by key (overwrites). */
export async function put(key, value) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Delete a value by key. */
export async function del(key) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** All keys currently stored. */
export async function keys() {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** True if this browser exposes IndexedDB (always true outside very old/locked-down browsers). */
export function isSupported() {
  return typeof indexedDB !== "undefined";
}

/* ===========================================================================
 * Compact player serialization
 * =========================================================================== */

const FOOT_CODES = ["L", "R"];
const WORKRATE_CODES = ["Low", "Medium", "High"];
const SQUAD_ROLE_CODES = ["prospect", "rotation", "important", "crucial"];
const ALT_POS_SLOTS = 2; // schema: altPositions has 0-2 entries

/** Reads a flat array positionally, in the exact order it was written — see
 * serializePlayer/deserializePlayer, which must stay in lockstep. */
class ArrayCursor {
  constructor(arr) {
    this.arr = arr;
    this.i = 0;
  }
  next() {
    return this.arr[this.i++];
  }
  take(n) {
    const slice = this.arr.slice(this.i, this.i + n);
    this.i += n;
    return slice;
  }
}

/** Player -> flat array of ints/strings, fixed order (plan1.md: "compact
 * arrays (attributes in a fixed order, ints) so a ~15k-player world stays a
 * few MB"). careerStats is intentionally not persisted yet — M2 always
 * generates it empty; season rollover (M5) is what gives it real content. */
export function serializePlayer(p) {
  return [
    p.id, p.firstName, p.lastName, p.commonName,
    p.nationId, p.clubId, p.natTeamId ?? null,
    p.age, toEpochDay(p.birthDate),
    p.heightCm, p.weightKg,
    POSITION_CODES.indexOf(p.position),
    ...Array.from({ length: ALT_POS_SLOTS }, (_, i) =>
      p.altPositions[i] != null ? POSITION_CODES.indexOf(p.altPositions[i]) : -1
    ),
    FOOT_CODES.indexOf(p.foot),
    p.weakFoot, p.skillMoves,
    WORKRATE_CODES.indexOf(p.workRateAtt), WORKRATE_CODES.indexOf(p.workRateDef),
    ...ALL_ATTRIBUTES.map((a) => p.attrs[a]),
    p.overall, p.potential, p.joinedClubYear,
    p.contract.wage, p.contract.endYear, p.contract.signingBonus, SQUAD_ROLE_CODES.indexOf(p.contract.squadRole),
    p.value, p.form, p.morale, p.fitness,
    p.injury ? 1 : 0, p.injury ? p.injury.type : "", p.injury ? p.injury.daysLeft : 0,
    p.seasonStats.apps, p.seasonStats.goals, p.seasonStats.assists, p.seasonStats.cleanSheets,
    p.seasonStats.avgRating, p.seasonStats.yellows, p.seasonStats.reds,
    p.kitNumber, p.isYouth ? 1 : 0,
    p.scouting.level, p.scouting.ovrRange[0], p.scouting.ovrRange[1], p.scouting.potRange[0], p.scouting.potRange[1],
  ];
}

/** Inverse of serializePlayer — field order must match exactly. */
export function deserializePlayer(arr) {
  const c = new ArrayCursor(arr);
  const id = c.next(), firstName = c.next(), lastName = c.next(), commonName = c.next();
  const nationId = c.next(), clubId = c.next(), natTeamId = c.next();
  const age = c.next(), birthDate = fromEpochDay(c.next());
  const heightCm = c.next(), weightKg = c.next();
  const position = POSITION_CODES[c.next()];
  const altPositions = c.take(ALT_POS_SLOTS).filter((v) => v >= 0).map((v) => POSITION_CODES[v]);
  const foot = FOOT_CODES[c.next()];
  const weakFoot = c.next(), skillMoves = c.next();
  const workRateAtt = WORKRATE_CODES[c.next()], workRateDef = WORKRATE_CODES[c.next()];
  const attrs = {};
  for (const a of ALL_ATTRIBUTES) attrs[a] = c.next();
  const overall = c.next(), potential = c.next(), joinedClubYear = c.next();
  const wage = c.next(), endYear = c.next(), signingBonus = c.next(), squadRole = SQUAD_ROLE_CODES[c.next()];
  const value = c.next(), form = c.next(), morale = c.next(), fitness = c.next();
  const hasInjury = c.next(), injuryType = c.next(), injuryDaysLeft = c.next();
  const apps = c.next(), goals = c.next(), assists = c.next(), cleanSheets = c.next();
  const avgRating = c.next(), yellows = c.next(), reds = c.next();
  const kitNumber = c.next(), isYouth = c.next();
  const scoutLevel = c.next(), ovrLo = c.next(), ovrHi = c.next(), potLo = c.next(), potHi = c.next();

  return {
    id, firstName, lastName, commonName, nationId, clubId, natTeamId,
    age, birthDate, heightCm, weightKg, position, altPositions, foot, weakFoot, skillMoves,
    workRateAtt, workRateDef, attrs, overall, potential, joinedClubYear,
    contract: { wage, endYear, signingBonus, squadRole },
    value, form, morale, fitness,
    injury: hasInjury ? { type: injuryType, daysLeft: injuryDaysLeft } : null,
    seasonStats: { apps, goals, assists, cleanSheets, avgRating, yellows, reds },
    careerStats: [],
    kitNumber, isYouth: !!isYouth,
    scouting: { level: scoutLevel, ovrRange: [ovrLo, ovrHi], potRange: [potLo, potHi] },
  };
}

/* ===========================================================================
 * Save slots
 * =========================================================================== */

export const SAVE_SLOT_IDS = ["slot1", "slot2", "slot3"];
export const AUTOSAVE_SLOT_ID = "autosave";
const SAVE_KEY_PREFIX = "save:";
const SAVE_FORMAT_VERSION = 1;

/** Inbox emails (engine/objectives.js's day-1 board emails, more from M5+)
 * carry a real Date and are otherwise plain JSON — no need for db.js's
 * compact-array treatment (there are dozens, not thousands, of these). */
function serializeEmail(e) {
  return { ...e, date: toEpochDay(e.date) };
}
function deserializeEmail(e) {
  return { ...e, date: fromEpochDay(e.date) };
}

/** GameState -> a small, IndexedDB-ready blob: static reference data
 * (leagues/clubs/nations/cups) is deliberately excluded — gen/world.js
 * re-fetches it from data/*.json on load — only what generation/play
 * actually produced is persisted. */
export function serializeSave(state) {
  return {
    version: SAVE_FORMAT_VERSION,
    savedAt: Date.now(),
    seed: state.seed,
    seasonStartYear: state.seasonStartYear,
    manager: state.manager,
    clubId: state.club.id,
    calendarToday: toEpochDay(state.calendar.today),
    players: state.players.map(serializePlayer),
    lineup: state.squad.lineup,
    inbox: state.inbox.emails.map(serializeEmail),
  };
}

/** Inverse of serializeSave. Returns the raw saved fields (not a full
 * GameState) — core/store.js's hydrateFromSave combines this with freshly
 * loaded static data into a real GameState. */
export function deserializeSave(saved) {
  return {
    seed: saved.seed,
    seasonStartYear: saved.seasonStartYear,
    manager: saved.manager,
    clubId: saved.clubId,
    calendarToday: fromEpochDay(saved.calendarToday),
    players: saved.players.map(deserializePlayer),
    lineup: saved.lineup,
    inbox: (saved.inbox || []).map(deserializeEmail),
  };
}

export async function saveGame(slotId, state) {
  await put(SAVE_KEY_PREFIX + slotId, serializeSave(state));
}

export async function loadGame(slotId) {
  const raw = await get(SAVE_KEY_PREFIX + slotId);
  return raw ? deserializeSave(raw) : null;
}

export async function deleteSave(slotId) {
  await del(SAVE_KEY_PREFIX + slotId);
}

/** Lightweight metadata for the save-slot picker — avoids deserializing every
 * player just to show "slot 2: Bob Jackson, Portsmouth, saved 2 days ago". */
export async function listSaveSlots() {
  const slots = [...SAVE_SLOT_IDS, AUTOSAVE_SLOT_ID];
  const out = [];
  for (const slotId of slots) {
    const raw = await get(SAVE_KEY_PREFIX + slotId);
    out.push(raw
      ? { slotId, exists: true, managerName: raw.manager.name, clubId: raw.clubId, savedAt: raw.savedAt }
      : { slotId, exists: false });
  }
  return out;
}
