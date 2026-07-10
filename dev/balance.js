// dev/balance.js — M4's headless season auto-sim spot-check (fable-plans/
// plan1.md Verification section: "dev/balance.html: ... 10-season headless
// auto-sim producing distribution reports ... to eyeball balance"; M4's own
// ✔ checklist: "spot-check: strong teams top tables at season end when
// auto-simming"). Runs a full July-to-July season through the exact same
// engine/sim/quick.js + engine/sim/worldsim.js path the real game's Advance
// button drives — there's no "user club" here, so worldsim.js simulates
// every fixture in every league. Multi-season chaining (the plan's "10-
// season" framing) waits on M5's season rollover (growth/promotion/
// relegation/new fixtures) — this page sims one season end-to-end, which is
// as far as M4's own mechanics reach.

import { generateWorld } from "../js/gen/world.js";
import { buildFixtures, buildLeagueTable } from "../js/engine/calendar.js";
import { simulateWorldDay } from "../js/engine/sim/worldsim.js";
import { seasonStart } from "../js/config/calendar.js";
import { addDays, toEpochDay } from "../js/core/clock.js";

const SEASON_START_YEAR = 2014;
const NO_USER_CLUB = "__none__"; // worldsim.js only skips a fixture involving state.club.id

function yieldToUI() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Pearson correlation between final league position (1=best) and average
 * squad prestige — expected notably negative (better position = higher
 * prestige) if the sim is behaving believably. Not a strict pass/fail gate
 * (randomness means upsets happen, per plan1.md's [FOG] factor) — reported
 * as a number for the reader to judge, same spirit as dev/world.html's
 * count tiles. */
function pearson(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxy / Math.sqrt(sxx * syy || 1);
}

function clubPrestige(club) {
  return club.prestige;
}

async function runSeason({ onProgress }) {
  const seed = Math.floor(Math.random() * 0xffffffff);
  onProgress("Generating world…", 0, 1);
  const world = await generateWorld({ seed, seasonStartYear: SEASON_START_YEAR });

  onProgress("Scheduling fixtures…", 0, 1);
  const fixtures = buildFixtures({ leagues: world.leagues, clubs: world.clubs, seed, seasonStartYear: SEASON_START_YEAR });

  const state = {
    seed,
    club: { id: NO_USER_CLUB },
    players: world.players,
    playersById: new Map(world.players.map((p) => [p.id, p])),
    playersByClub: world.squadsByClub,
    fixtures,
    results: new Map(),
    clubsById: new Map(world.clubs.map((c) => [c.id, c])),
  };

  const start = seasonStart(SEASON_START_YEAR);
  const totalDays = 365;
  for (let i = 1; i <= totalDays; i++) {
    simulateWorldDay(state, addDays(start, i));
    if (i % 14 === 0 || i === totalDays) {
      onProgress(`Simming season… day ${i}/${totalDays}`, i, totalDays);
      await yieldToUI();
    }
  }

  return { world, fixtures, results: state.results };
}

function renderLeagueTable(league, clubs, fixturesByLeague, results) {
  const table = buildLeagueTable(league, clubs, fixturesByLeague, results);
  const rows = table.map((r) => (
    `<tr><td>${r.position}</td><td>${r.club.name}</td><td class="num">${r.club.prestige}</td>` +
    `<td class="num">${r.pld}</td><td class="num">${r.w}</td><td class="num">${r.d}</td><td class="num">${r.l}</td>` +
    `<td class="num">${r.gf}</td><td class="num">${r.ga}</td><td class="num">${r.gd}</td><td class="num">${r.pts}</td></tr>`
  )).join("");
  return `<table class="tbl"><thead><tr><th>Pos</th><th>Club</th><th>Prestige</th><th>Pld</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderCorrelationSummary(world, fixtures, results) {
  const rows = world.leagues.map((league) => {
    const clubs = world.clubs.filter((c) => c.leagueId === league.id);
    const table = buildLeagueTable(league, clubs, fixtures.byLeague.get(league.id), results);
    const positions = table.map((r) => r.position);
    const prestiges = table.map((r) => clubPrestige(r.club));
    const r = pearson(positions, prestiges);
    const half = Math.floor(table.length / 2);
    const topHalfAvg = table.slice(0, half).reduce((s, row) => s + clubPrestige(row.club), 0) / half;
    const botHalfAvg = table.slice(-half).reduce((s, row) => s + clubPrestige(row.club), 0) / half;
    return { league, r, topHalfAvg, botHalfAvg };
  });

  const avgR = rows.reduce((s, x) => s + x.r, 0) / rows.length;
  const believable = rows.filter((x) => x.topHalfAvg > x.botHalfAvg).length;

  const tableRows = rows.map(({ league, r, topHalfAvg, botHalfAvg }) => (
    `<tr><td>${league.country} — ${league.name}</td>` +
    `<td class="num">${topHalfAvg.toFixed(2)}</td><td class="num">${botHalfAvg.toFixed(2)}</td>` +
    `<td class="num ${r < -0.15 ? "ok" : "bad"}">${r.toFixed(2)}</td></tr>`
  )).join("");

  return (
    `<div class="count-tile"><div class="n ${avgR < -0.15 ? "ok" : "bad"}">${avgR.toFixed(2)}</div><div class="l">Avg position/prestige correlation (want notably negative)</div></div>` +
    `<div class="count-tile"><div class="n ${believable === rows.length ? "ok" : "bad"}">${believable}/${rows.length}</div><div class="l">Leagues where top half out-prestiges bottom half</div></div>` +
    `<table class="tbl" style="margin-top:16px"><thead><tr><th>League</th><th>Top-half avg prestige</th><th>Bottom-half avg prestige</th><th>Position↔Prestige r</th></tr></thead><tbody>${tableRows}</tbody></table>`
  );
}

async function init() {
  const progressEl = document.getElementById("balance-progress");
  const summaryEl = document.getElementById("balance-summary");
  const tablesEl = document.getElementById("balance-tables");
  const runBtn = document.getElementById("balance-run");

  async function run() {
    runBtn.disabled = true;
    summaryEl.innerHTML = "";
    tablesEl.innerHTML = "";
    const { world, fixtures, results } = await runSeason({
      onProgress: (label, done, total) => {
        progressEl.textContent = `${label} (${Math.round((done / Math.max(1, total)) * 100)}%)`;
      },
    });
    progressEl.textContent = "Done — one full season simulated (Jul 2014 → Jul 2015).";

    summaryEl.className = "counts";
    summaryEl.innerHTML = renderCorrelationSummary(world, fixtures, results);

    // Full standings for the 3 highest-prestige leagues (the ones a reader
    // can eyeball fastest — e.g. the Premier League should end with
    // Man Utd/Man City/Chelsea-tier clubs near the top, not the bottom).
    const topLeagues = [...world.leagues].sort((a, b) => (b.prestige[0] + b.prestige[1]) - (a.prestige[0] + a.prestige[1])).slice(0, 3);
    tablesEl.innerHTML = topLeagues.map((league) => {
      const clubs = world.clubs.filter((c) => c.leagueId === league.id);
      return `<div class="league-group"><h2>${league.country} — ${league.name}</h2>${renderLeagueTable(league, clubs, fixtures.byLeague.get(league.id), results)}</div>`;
    }).join("");

    runBtn.disabled = false;
    window.__balanceResult = { world, fixtures, results }; // console inspection convenience
  }

  runBtn.addEventListener("click", run);
  run();
}

init().catch((err) => {
  document.getElementById("balance-progress").textContent = `ERROR: ${err.message}`;
  console.error(err);
});
