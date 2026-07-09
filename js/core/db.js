// core/db.js — IndexedDB wrapper (foundation stub).
//
// M0 scope: a generic, working key/value wrapper over one IndexedDB database
// with one object store, so later milestones can build save-slot management
// on top without re-plumbing IndexedDB open/upgrade handling. The FIFA-15-
// specific bits (3 save slots + autosave, compact player array serialization)
// land in M2 per fable-plans/plan1.md — this file deliberately does not know
// about GameState shape.

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
