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
const RATING_HISTORY_SLOTS = 10; // engine/form.js's HISTORY_CAP; -1 = empty slot

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
 * few MB"). careerStats is still intentionally not persisted: M5's
 * engine/season.js now computes it for real at every rollover (a season-end
 * snapshot per player, unbounded length over a long career, unlike the
 * fixed-cap ratingHistory below) but nothing yet displays trophy/career
 * history — that first consumer is M11's My Career screen, which is the
 * more sensible place to also design this field's persisted shape (fixed
 * per-player slots would waste space for the common case of a short
 * career; a variable-length side-table is the likely answer, but isn't
 * worth building before anything reads it). Round-tripping a save today
 * simply forgets career-stats history accumulated so far — every other M5
 * field below (growthPeriod, retiringAnnounced) *is* persisted, since losing
 * those mid-career would visibly break growth/retirement, not just a
 * not-yet-built stats screen. */
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
    ...Array.from({ length: RATING_HISTORY_SLOTS }, (_, i) => p.ratingHistory[i] ?? -1),
    // M5 additions: engine/growth.js's per-period accumulator + engine/
    // retirement.js's "announced but not yet retired" flag.
    p.growthPeriod.minutes, p.growthPeriod.ratingSum, p.growthPeriod.ratingCount,
    p.retiringAnnounced ? 1 : 0,
    // M6 addition: engine/contracts.js's "already sent the 60-day expiry
    // warning email for this contract" flag (cleared on renewal/rollover).
    p.contract.warnedExpiry ? 1 : 0,
    // M7 additions: engine/negotiation.js's active loan spell (null outside
    // one) and engine/freeagents.js's pre-agreed free-transfer destination
    // (null until an approach is accepted) — both need to survive a reload
    // since neither is re-derivable from anything else in the save.
    p.loan ? 1 : 0, p.loan ? p.loan.parentClubId : "", p.loan ? toEpochDay(p.loan.returnDate) : -1, p.loan ? p.loan.fullWage : 0,
    p.contract.preAgreedClubId != null ? 1 : 0, p.contract.preAgreedClubId ?? "",
    p.contract.preAgreedTerms ? p.contract.preAgreedTerms.wage : 0,
    p.contract.preAgreedTerms ? p.contract.preAgreedTerms.years : 0,
    p.contract.preAgreedTerms ? SQUAD_ROLE_CODES.indexOf(p.contract.preAgreedTerms.squadRole) : -1,
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
  const ratingHistory = c.take(RATING_HISTORY_SLOTS).filter((v) => v >= 0);
  const growthMinutes = c.next(), growthRatingSum = c.next(), growthRatingCount = c.next();
  const retiringAnnounced = c.next();
  const warnedExpiry = c.next();
  const hasLoan = c.next(), loanParentClubId = c.next(), loanReturnDate = c.next(), loanFullWage = c.next();
  const hasPreAgreed = c.next(), preAgreedClubId = c.next();
  const preAgreedWage = c.next(), preAgreedYears = c.next(), preAgreedRoleIdx = c.next();

  return {
    id, firstName, lastName, commonName, nationId, clubId, natTeamId,
    age, birthDate, heightCm, weightKg, position, altPositions, foot, weakFoot, skillMoves,
    workRateAtt, workRateDef, attrs, overall, potential, joinedClubYear,
    contract: {
      wage, endYear, signingBonus, squadRole, warnedExpiry: !!warnedExpiry,
      preAgreedClubId: hasPreAgreed ? preAgreedClubId : null,
      preAgreedTerms: hasPreAgreed ? { wage: preAgreedWage, years: preAgreedYears, squadRole: SQUAD_ROLE_CODES[preAgreedRoleIdx] } : null,
    },
    value, form, morale, fitness,
    injury: hasInjury ? { type: injuryType, daysLeft: injuryDaysLeft } : null,
    ratingHistory,
    seasonStats: { apps, goals, assists, cleanSheets, avgRating, yellows, reds },
    careerStats: [],
    kitNumber, isYouth: !!isYouth,
    scouting: { level: scoutLevel, ovrRange: [ovrLo, ovrHi], potRange: [potLo, potHi] },
    growthPeriod: { minutes: growthMinutes, ratingSum: growthRatingSum, ratingCount: growthRatingCount },
    retiringAnnounced: !!retiringAnnounced,
    loan: hasLoan ? { parentClubId: loanParentClubId, returnDate: fromEpochDay(loanReturnDate), fullWage: loanFullWage } : null,
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

/** engine/comps/cup.js's CupRuntime is otherwise plain JSON (strings/
 * numbers/nested arrays) — only its Date fields need db.js's usual
 * epoch-day treatment. Persisted directly (like `results` below) since a
 * knockout round's pairing depends on who actually won the previous round,
 * not just the save's seed — see core/store.js's deriveIndices header. */
function serializeCupState(cup) {
  return {
    ...cup,
    nextRoundDate: toEpochDay(cup.nextRoundDate),
    ties: cup.ties.map((t) => ({ ...t, date: toEpochDay(t.date) })),
  };
}
function deserializeCupState(cup) {
  return {
    ...cup,
    nextRoundDate: fromEpochDay(cup.nextRoundDate),
    ties: cup.ties.map((t) => ({ ...t, date: fromEpochDay(t.date) })),
  };
}

/** M7: state.transfers.listings (Map<playerId,{type,askingPrice,listedDate}>)
 * and state.transfers.pendingOffers (delayed fee/contract/loan/approach
 * responses) — both persist directly, same rationale as clubLeague/cupsState
 * above (neither is re-derivable from the seed alone). `negotiation` itself
 * is deliberately not persisted — see core/store.js's deriveIndices header. */
function serializeListingEntry([playerId, listing]) {
  return [playerId, { ...listing, listedDate: toEpochDay(listing.listedDate) }];
}
function deserializeListingEntry([playerId, listing]) {
  return [playerId, { ...listing, listedDate: fromEpochDay(listing.listedDate) }];
}
function serializePendingOffer(o) {
  return { ...o, dueDate: toEpochDay(o.dueDate) };
}
function deserializePendingOffer(o) {
  return { ...o, dueDate: fromEpochDay(o.dueDate) };
}

/** M8: state.gtn (engine/gtn.js — hired scouts, the weekly hire pool, and
 * every mission's live progress) — persists directly, same rationale as
 * transferListings/clubTransferBudgets above (none of it is re-derivable
 * from the seed alone: which scouts are hired, what a mission has already
 * found, is genuine play history). Only the Date fields need the usual
 * epoch-day round-trip; everything else (stars, ids, tag lists, found-player
 * id arrays) is already plain JSON. */
function serializeGtnState(g) {
  return {
    nextId: g.nextId,
    lastSalaryPeriod: g.lastSalaryPeriod,
    poolRefreshDate: toEpochDay(g.poolRefreshDate),
    pool: g.pool,
    scouts: g.scouts.map((s) => ({ ...s, hiredDate: toEpochDay(s.hiredDate) })),
    missions: g.missions.map((m) => ({
      ...m,
      startDate: toEpochDay(m.startDate),
      endDate: toEpochDay(m.endDate),
      nextReportDate: toEpochDay(m.nextReportDate),
    })),
  };
}
function deserializeGtnState(g) {
  return {
    nextId: g.nextId,
    lastSalaryPeriod: g.lastSalaryPeriod,
    poolRefreshDate: fromEpochDay(g.poolRefreshDate),
    pool: g.pool,
    scouts: g.scouts.map((s) => ({ ...s, hiredDate: fromEpochDay(s.hiredDate) })),
    missions: g.missions.map((m) => ({
      ...m,
      startDate: fromEpochDay(m.startDate),
      endDate: fromEpochDay(m.endDate),
      nextReportDate: fromEpochDay(m.nextReportDate),
    })),
  };
}

/** M9: state.academy (engine/academy.js — hired youth scouts, the weekly
 * hire pool, and the youth squad roster). Same rationale as state.gtn above
 * for persisting directly rather than re-deriving from the seed. Roster
 * entries are full Player-shaped objects (plus a handful of academy-only
 * fields — academyType/academyJoinedDate/nextDevelopmentDate/
 * retirementWarningDate) but the roster is capped at 16 (MAX_YOUTH_SQUAD_SIZE),
 * nowhere near the ~15k-player-world scale that motivates serializePlayer's
 * compact array format above, so it's persisted as plain JSON (like a
 * mission's found-player id list) with just its Date fields converted. */
function serializeAcademyState(a) {
  return {
    nextId: a.nextId,
    lastSalaryPeriod: a.lastSalaryPeriod,
    poolRefreshDate: toEpochDay(a.poolRefreshDate),
    pool: a.pool,
    scouts: a.scouts.map((s) => ({
      ...s,
      hiredDate: toEpochDay(s.hiredDate),
      assignment: s.assignment ? {
        ...s.assignment,
        startDate: toEpochDay(s.assignment.startDate),
        endDate: toEpochDay(s.assignment.endDate),
        nextReportDate: toEpochDay(s.assignment.nextReportDate),
      } : null,
    })),
    roster: a.roster.map((p) => ({
      ...p,
      birthDate: toEpochDay(p.birthDate),
      academyJoinedDate: toEpochDay(p.academyJoinedDate),
      nextDevelopmentDate: toEpochDay(p.nextDevelopmentDate),
      retirementWarningDate: p.retirementWarningDate ? toEpochDay(p.retirementWarningDate) : null,
    })),
  };
}
function deserializeAcademyState(a) {
  return {
    nextId: a.nextId,
    lastSalaryPeriod: a.lastSalaryPeriod,
    poolRefreshDate: fromEpochDay(a.poolRefreshDate),
    pool: a.pool,
    scouts: a.scouts.map((s) => ({
      ...s,
      hiredDate: fromEpochDay(s.hiredDate),
      assignment: s.assignment ? {
        ...s.assignment,
        startDate: fromEpochDay(s.assignment.startDate),
        endDate: fromEpochDay(s.assignment.endDate),
        nextReportDate: fromEpochDay(s.assignment.nextReportDate),
      } : null,
    })),
    roster: a.roster.map((p) => ({
      ...p,
      birthDate: fromEpochDay(p.birthDate),
      academyJoinedDate: fromEpochDay(p.academyJoinedDate),
      nextDevelopmentDate: fromEpochDay(p.nextDevelopmentDate),
      retirementWarningDate: p.retirementWarningDate != null ? fromEpochDay(p.retirementWarningDate) : null,
    })),
  };
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
    // Match results (M4): fixtures themselves regenerate deterministically
    // from the seed (engine/calendar.js), but *results* can't — a live user
    // match's outcome depends on mid-match decisions (substitutions) the
    // seed alone can't reproduce, so every finished fixture's scoreline is
    // persisted directly, same rationale as the inbox above.
    results: [...state.results.entries()],
    // M5 additions: promotion/relegation's club->league overrides, each
    // domestic cup's live bracket, and the Browse Jobs vacancy list — none
    // of these are re-derivable from the seed alone (see deriveIndices'
    // header in core/store.js), so all three persist directly.
    clubLeague: [...state.clubLeague.entries()],
    cupsState: [...state.cups.entries()].map(([id, cup]) => [id, serializeCupState(cup)]),
    jobMarket: state.jobMarket,
    // M6: transfer budget spend (engine/contracts.js's renewal fees) has to
    // survive a reload, or saving/reloading would silently refill it —
    // wageCeiling is cheap to recompute but persisted alongside it anyway so
    // a loaded save's Finances tile is byte-identical to what was saved.
    finances: state.finances,
    // M7: the user's own Sell/Loan List, any offers awaiting a delayed
    // response, and every CPU club's own transfer-budget spend. Guarded
    // (like clubTransferBudgets below) rather than assumed, since a handful
    // of dev/tests.js's own hand-built fakeSaveState fixtures predate this
    // field and don't carry a `transfers` object at all.
    transferListings: [...(state.transfers?.listings || new Map()).entries()].map(serializeListingEntry),
    transferPendingOffers: (state.transfers?.pendingOffers || []).map(serializePendingOffer),
    clubTransferBudgets: [...(state.clubTransferBudgets || new Map()).entries()],
    // M7: state.news.transfer is the one part of core/store.js's M0-era
    // NEWS_DATA stub this milestone starts writing real articles into
    // (engine/transferai.js/negotiation.js/freeagents.js's pushTransferNews)
    // — persisted directly (articles are plain strings/objects, no Date
    // fields to convert) so a session's transfer news survives a reload
    // instead of silently reverting to the hardcoded stub headlines.
    newsTransfer: state.news?.transfer || [],
    // M8: guarded like transferListings above — dev/tests.js's hand-built
    // fake states from earlier milestones predate state.gtn entirely.
    gtn: state.gtn ? serializeGtnState(state.gtn) : null,
    // M9: ditto for state.academy.
    academy: state.academy ? serializeAcademyState(state.academy) : null,
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
    results: new Map(saved.results || []),
    clubLeague: new Map(saved.clubLeague || []),
    cupsState: new Map((saved.cupsState || []).map(([id, cup]) => [id, deserializeCupState(cup)])),
    jobMarket: saved.jobMarket || { vacancies: [] },
    finances: saved.finances || null,
    transferListings: new Map((saved.transferListings || []).map(deserializeListingEntry)),
    transferPendingOffers: (saved.transferPendingOffers || []).map(deserializePendingOffer),
    clubTransferBudgets: new Map(saved.clubTransferBudgets || []),
    newsTransfer: saved.newsTransfer,
    gtn: saved.gtn ? deserializeGtnState(saved.gtn) : null,
    academy: saved.academy ? deserializeAcademyState(saved.academy) : null,
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
