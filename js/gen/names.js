// gen/names.js — deterministic player-name generation from the regional name
// pools authored in data/names/*.json (plan1.md M1: "gen/names.js").
//
// Nations point at a pool via nations.json's `namePool` (+ optional
// `diasporaPool`/`diasporaChance` for a secondary-heritage mix). Callers must
// `preloadNamePools()` once before calling `randomName()` — this keeps name
// generation itself synchronous (and therefore safe to call thousands of
// times during world-gen) while still loading data with plain `fetch`, no
// bundler (ground rule #2).

const poolCache = new Map();

/** Fetch + cache one region's {first:[], last:[]} pool. Safe to call repeatedly. */
export async function loadNamePool(region) {
  if (poolCache.has(region)) return poolCache.get(region);
  const res = await fetch(`data/names/${region}.json`);
  if (!res.ok) throw new Error(`failed to load name pool "${region}": ${res.status}`);
  const pool = await res.json();
  poolCache.set(region, pool);
  return pool;
}

/** Preload every pool referenced (directly or via diaspora) by a list of nations. */
export async function preloadNamePools(nations) {
  const regions = new Set();
  for (const n of nations) {
    regions.add(n.namePool);
    if (n.diasporaPool) regions.add(n.diasporaPool);
  }
  await Promise.all([...regions].map(loadNamePool));
  return regions;
}

/** True once a region's pool has been loaded via preloadNamePools/loadNamePool. */
export function isPoolLoaded(region) {
  return poolCache.has(region);
}

/**
 * Draw a random {firstName, lastName, commonName} for a player of the given
 * nation. `rng` is an RngStream (core/rng.js) — all draws go through it so
 * world-gen stays reproducible from the save's seed.
 */
export function randomName(rng, nation) {
  let region = nation.namePool;
  if (nation.diasporaPool && nation.diasporaChance > 0 && rng.chance(nation.diasporaChance)) {
    region = nation.diasporaPool;
  }
  const pool = poolCache.get(region);
  if (!pool) {
    throw new Error(`name pool "${region}" not loaded — call preloadNamePools() first`);
  }
  const firstName = rng.pick(pool.first);
  const lastName = rng.pick(pool.last);
  return { firstName, lastName, commonName: commonNameFor(rng, region, firstName, lastName) };
}

/** Most players are known by surname; Brazilian-style pools sometimes go by first name only. */
function commonNameFor(rng, region, firstName, lastName) {
  if (region === "portuguese-br" && rng.chance(0.2)) return firstName;
  return lastName;
}
