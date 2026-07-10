// gen/world.js — generates the full ~15k-player world: every club in
// data/clubs.json gets a 24-man squad via gen/squad.js. Single sequential
// RngStream (derived from the save's seed, ground rule #3) so the whole
// world is reproducible from the seed alone. Chunked with a
// `requestIdleCallback`-style yield between clubs so the New Game progress
// bar can repaint and the tab doesn't lock up (plan1.md's "Notes for the
// implementing model": "Never block the UI: world-gen ... run in chunks").

import { RngStream, deriveSeed } from "../core/rng.js";
import { preloadNamePools } from "./names.js";
import { generateSquad } from "./squad.js";
import { resetPlayerIdCounter } from "./player.js";

// Resolved against this module's own file location (not the importing
// page's URL) — a page-relative "data/leagues.json" would 404 when this
// module is imported from dev/tests.js (one directory deeper than
// index.html). js/gen/world.js -> ../../data/<path> reaches the repo-root
// data/ folder from either caller.
function dataURL(path) {
  return new URL(`../../data/${path}`, import.meta.url);
}

async function loadJSON(path) {
  const url = dataURL(path);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  return res.json();
}

function yieldToUI() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * @param {object} opts
 * @param {number} opts.seed - the save's RNG seed
 * @param {number} opts.seasonStartYear - e.g. 2014
 * @param {(progress:{done:number,total:number,label:string}) => void} [opts.onProgress]
 * @returns {Promise<{leagues, clubs, nations, cups, players: object[], squadsByClub: Map<string,object[]>, lineupsByClub: Map<string,object[]>}>}
 */
export async function generateWorld({ seed, seasonStartYear, onProgress }) {
  const report = (label, done, total) => onProgress && onProgress({ done, total, label });

  report("Loading world data…", 0, 1);
  const [leagues, clubs, nations, cups] = await Promise.all([
    loadJSON("leagues.json"),
    loadJSON("clubs.json"),
    loadJSON("nations.json"),
    loadJSON("cups.json"),
  ]);

  report("Loading name pools…", 0, 1);
  await preloadNamePools(nations);

  const leaguesById = new Map(leagues.map((l) => [l.id, l]));
  const nationsById = new Map(nations.map((n) => [n.id, n]));
  const nationsByName = new Map(nations.map((n) => [n.name, n]));

  resetPlayerIdCounter(1); // ids are assigned in generation order, so a repeat call with the same seed must restart from the same id
  const rng = new RngStream(deriveSeed(seed, "world-gen"));
  const players = [];
  const squadsByClub = new Map();
  const lineupsByClub = new Map();

  const total = clubs.length;
  for (let i = 0; i < total; i++) {
    const club = clubs[i];
    const league = leaguesById.get(club.leagueId);
    const { players: squad, lineup } = generateSquad({
      rng, club, league, nationsById, nationsByName, seasonStartYear,
    });
    players.push(...squad);
    squadsByClub.set(club.id, squad);
    lineupsByClub.set(club.id, lineup);

    if (i % 20 === 0 || i === total - 1) {
      report(`Generating players… ${club.name}`, i + 1, total);
      await yieldToUI();
    }
  }

  report("Scheduling fixtures…", total, total);

  return { leagues, clubs, nations, cups, players, squadsByClub, lineupsByClub, seed, rngState: rng.toJSON() };
}
