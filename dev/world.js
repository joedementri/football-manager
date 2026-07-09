// dev/world.js — M1 verification page. Loads data/*.json live (via fetch,
// same as the shipped game will) and renders every league -> club with a
// procedurally generated crest, plus nations/cups/name-pool summaries, so
// the milestone's ✔ check ("dev page lists every league→club with crests;
// counts match FIFA 15") can be eyeballed and screenshotted.

import { crestSVGString } from "../js/gen/crest.js";
import { money } from "../js/core/format.js";

const EXPECTED = { leagues: 35, clubs: 600, nations: 50 };

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`fetch ${path} failed: ${res.status}`);
  return res.json();
}

function countTile(label, n, expected) {
  const ok = expected == null ? true : Math.abs(n - expected) <= expected * 0.15;
  const targetStr = expected != null ? ` <span style="color:var(--ink-faint)">(~${expected})</span>` : "";
  return `<div class="count-tile"><div class="n ${ok ? "ok" : "bad"}">${n}</div><div class="l">${label}${targetStr}</div></div>`;
}

function renderCounts({ leagues, clubs, nations, cups, pools }) {
  const totalCups = cups.domestic.length + cups.continental.length + cups.international.length;
  const totalFirst = Object.values(pools).reduce((s, p) => s + p.first.length, 0);
  const totalLast = Object.values(pools).reduce((s, p) => s + p.last.length, 0);
  document.getElementById("counts").innerHTML =
    countTile("Leagues", leagues.length, EXPECTED.leagues) +
    countTile("Clubs", clubs.length, EXPECTED.clubs) +
    countTile("Nations", nations.length, EXPECTED.nations) +
    countTile("Cups &amp; Tournaments", totalCups) +
    countTile("Name Pools", Object.keys(pools).length) +
    countTile("First/Last Names", `${totalFirst}/${totalLast}`);
}

function renderClubs(leagues, clubs) {
  const byLeague = new Map(leagues.map((l) => [l.id, { league: l, clubs: [] }]));
  for (const c of clubs) byLeague.get(c.leagueId).clubs.push(c);

  // group leagues by country, tier order within a country
  const byCountry = new Map();
  for (const l of leagues) {
    if (!byCountry.has(l.country)) byCountry.set(l.country, []);
    byCountry.get(l.country).push(l);
  }
  for (const arr of byCountry.values()) arr.sort((a, b) => a.tier - b.tier);

  let html = "";
  for (const [country, countryLeagues] of [...byCountry.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    for (const league of countryLeagues) {
      const group = byLeague.get(league.id);
      const cards = group.clubs
        .map(
          (c) => `<div class="club-card">
            <div class="crest-wrap">${crestSVGString(c, 32)}</div>
            <div class="meta">
              <div class="nm">${c.name}</div>
              <div class="sub">${c.stadiumName} · ${money(c.baseTransferBudget)}</div>
            </div>
            <div class="prestige">${c.prestige}</div>
          </div>`
        )
        .join("");
      html += `<div class="league-group">
        <h2>${country} — ${league.name} <span class="meta">tier ${league.tier} · ${league.teamsCount} clubs · wage×${league.wageModifier}</span></h2>
        <div class="club-grid">${cards}</div>
      </div>`;
    }
  }
  document.getElementById("panel-clubs").innerHTML = html;
}

function renderNations(nations) {
  const rows = nations
    .slice()
    .sort((a, b) => b.prestige - a.prestige)
    .map(
      (n) => `<tr>
        <td>${n.name}</td><td>${n.confed}</td><td>${n.prestige}</td><td>${n.qualityWeight.toFixed(2)}</td>
        <td>${n.namePool}</td><td>${n.diasporaPool ? `${n.diasporaPool} (${Math.round(n.diasporaChance * 100)}%)` : "—"}</td>
      </tr>`
    )
    .join("");
  document.getElementById("panel-nations").innerHTML = `
    <table class="tbl">
      <thead><tr><th>Nation</th><th>Confed</th><th>Prestige</th><th>Quality Wt</th><th>Name Pool</th><th>Diaspora</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderCups(cups) {
  const domesticByCountry = new Map();
  for (const c of cups.domestic) {
    if (!domesticByCountry.has(c.country)) domesticByCountry.set(c.country, []);
    domesticByCountry.get(c.country).push(c);
  }
  const domesticHTML = [...domesticByCountry.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([country, list]) => `<li>${country}: ${list.map((c) => c.name).join(", ")}</li>`)
    .join("");

  const continentalHTML = cups.continental
    .map((c) => `<li>${c.name} <span class="tag">(${c.confed}, ${c.teams} teams — ${c.format})</span></li>`)
    .join("");

  const intlHTML = cups.international
    .map((c) => `<li>${c.name} <span class="tag">(${c.scope}, every ${c.cycleEvery}y from ${c.firstYear})</span></li>`)
    .join("");

  document.getElementById("panel-cups").innerHTML = `
    <div class="cup-group"><h3>Domestic Cups (${cups.domestic.length})</h3><ul>${domesticHTML}</ul></div>
    <div class="cup-group"><h3>Continental (${cups.continental.length})</h3><ul>${continentalHTML}</ul></div>
    <div class="cup-group"><h3>International Tournaments (${cups.international.length})</h3><ul>${intlHTML}</ul></div>
  `;
}

function renderNamePools(pools) {
  const cards = Object.entries(pools)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(
      ([region, pool]) => `<div class="pool-card">
        <h4>${region}</h4>
        <div class="row"><span>First names</span><span>${pool.first.length}</span></div>
        <div class="row"><span>Last names</span><span>${pool.last.length}</span></div>
        <div class="row"><span>Sample</span><span>${pool.first[0]} ${pool.last[0]}</span></div>
      </div>`
    )
    .join("");
  document.getElementById("panel-names").innerHTML = cards;
}

function initTabs() {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.toggle("is-active", t === tab));
      document.querySelectorAll(".panel").forEach((p) => {
        p.classList.toggle("is-active", p.id === `panel-${tab.dataset.tab}`);
      });
    });
  });
}

async function init() {
  initTabs();
  const [leagues, clubs, nations, cups] = await Promise.all([
    loadJSON("../data/leagues.json"),
    loadJSON("../data/clubs.json"),
    loadJSON("../data/nations.json"),
    loadJSON("../data/cups.json"),
  ]);

  const regions = new Set(nations.flatMap((n) => [n.namePool, n.diasporaPool].filter(Boolean)));
  const pools = {};
  await Promise.all(
    [...regions].map(async (region) => {
      pools[region] = await loadJSON(`../data/names/${region}.json`);
    })
  );

  renderCounts({ leagues, clubs, nations, cups, pools });
  renderClubs(leagues, clubs);
  renderNations(nations);
  renderCups(cups);
  renderNamePools(pools);

  window.__world = { leagues, clubs, nations, cups, pools }; // console inspection convenience
}

init().catch((err) => {
  document.getElementById("counts").innerHTML = `<div class="count-tile"><div class="n bad">ERR</div><div class="l">${err.message}</div></div>`;
  console.error(err);
});
