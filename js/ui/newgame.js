// ui/newgame.js — New Game wizard: manager name → league → club pick (crest
// grid + board expectations preview) → world-gen progress bar, per
// plan1.md's "Screens to build" table. Unlike the rest of ui/*, this module
// owns a little transient state of its own (which step, which league/club
// are tentatively chosen) because none of it is part of GameState — there's
// no career yet for a GameState to describe. Once the wizard finishes it
// hands off ({managerName, club, league, world}) to the caller (js/main.js)
// and gets out of the way.

import { crestSVGString } from "../gen/crest.js";
import { money } from "../core/format.js";
import { generateWorld } from "../gen/world.js";

const SEASON_START_YEAR = 2014;

const BOARD_EXPECTATION_TEXT = {
  champions: "The board expects you to challenge for major honours from day one.",
  "top-half": "The board expects a solid top-half finish and cup progress.",
  midtable: "The board expects a comfortable mid-table finish — no relegation scares.",
  "avoid-relegation": "The board's only demand is survival — anything else is a bonus.",
  rebuild: "The board knows this is a rebuilding job and will be patient.",
};

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`fetch ${path} failed: ${res.status}`);
  return res.json();
}

export function initNewGame({ onComplete }) {
  const root = document.getElementById("newgame-root");
  const steps = Array.from(root.querySelectorAll(".ng-step"));
  const nameInput = document.getElementById("ng-name-input");
  const leagueListEl = document.getElementById("ng-league-list");
  const clubGridEl = document.getElementById("ng-club-grid");
  const clubPreviewEl = document.getElementById("ng-club-preview");
  const clubBackEl = document.getElementById("ng-club-back");
  const progressLabelEl = document.getElementById("ng-progress-label");
  const progressFillEl = document.getElementById("ng-progress-fill");
  const promptBack = document.getElementById("ng-prompt-back");
  const promptSelect = document.getElementById("ng-prompt-select");

  let leagues = [];
  let clubs = [];
  let chosenLeague = null;
  let chosenClub = null;

  function showStep(name) {
    steps.forEach((s) => s.classList.toggle("is-active", s.dataset.step === name));
    promptBack.style.visibility = name === "name" ? "hidden" : "visible";
    promptSelect.style.visibility = name === "progress" ? "hidden" : "visible";
  }

  function renderLeagueList() {
    const byCountry = new Map();
    for (const l of leagues) {
      if (!byCountry.has(l.country)) byCountry.set(l.country, []);
      byCountry.get(l.country).push(l);
    }
    for (const arr of byCountry.values()) arr.sort((a, b) => a.tier - b.tier);

    leagueListEl.innerHTML = [...byCountry.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([country, countryLeagues]) => countryLeagues.map((l) => (
        `<div class="ng-league-row" data-league="${l.id}">` +
          `<span class="ng-league-country">${country}</span>` +
          `<span class="ng-league-name">${l.name}</span>` +
          `<span class="ng-league-meta">Tier ${l.tier} &middot; ${l.teamsCount} clubs</span>` +
        `</div>`
      )).join(""))
      .join("");
  }

  function renderClubGrid() {
    const leagueClubs = clubs
      .filter((c) => c.leagueId === chosenLeague.id)
      .sort((a, b) => b.prestige - a.prestige);
    clubGridEl.innerHTML = leagueClubs.map((c) => (
      `<div class="ng-club-card" data-club="${c.id}">` +
        `<div class="ng-club-card__crest">${crestSVGString(c, 40)}</div>` +
        `<div class="ng-club-card__name">${c.shortName}</div>` +
        `<div class="ng-club-card__prestige">${c.prestige}</div>` +
      `</div>`
    )).join("");
    clubPreviewEl.innerHTML = "";
    clubPreviewEl.classList.remove("is-active");
    chosenClub = null;
  }

  function renderClubPreview(club) {
    clubPreviewEl.classList.add("is-active");
    clubPreviewEl.innerHTML =
      `<div class="ng-preview-top">` +
        `<div class="ng-preview-crest">${crestSVGString(club, 56)}</div>` +
        `<div>` +
          `<div class="ng-preview-name">${club.name}</div>` +
          `<div class="ng-preview-sub">${club.stadiumName} &middot; Transfer Budget ${money(club.baseTransferBudget)}</div>` +
        `</div>` +
      `</div>` +
      `<div class="ng-preview-expectation">${BOARD_EXPECTATION_TEXT[club.boardExpectationTier] || ""}</div>` +
      `<button class="ng-confirm-btn" id="ng-confirm-club">Manage ${club.shortName}</button>`;
    document.getElementById("ng-confirm-club").addEventListener("click", () => beginWorldGen());
  }

  async function beginWorldGen() {
    showStep("progress");
    const world = await generateWorld({
      seed: Math.floor(Math.random() * 0xffffffff),
      seasonStartYear: SEASON_START_YEAR,
      onProgress: ({ label, done, total }) => {
        progressLabelEl.textContent = label;
        progressFillEl.style.width = `${Math.round((done / Math.max(1, total)) * 100)}%`;
      },
    });
    onComplete({
      managerName: nameInput.value.trim() || "Manager",
      club: world.clubs.find((c) => c.id === chosenClub.id),
      league: world.leagues.find((l) => l.id === chosenLeague.id),
      world,
      seasonStartYear: SEASON_START_YEAR,
    });
  }

  function goToLeagueStep() {
    showStep("league");
  }

  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && nameInput.value.trim()) goToLeagueStep();
  });
  promptSelect.addEventListener("click", () => {
    const active = steps.find((s) => s.classList.contains("is-active"));
    if (active.dataset.step === "name" && nameInput.value.trim()) goToLeagueStep();
  });

  leagueListEl.addEventListener("click", (e) => {
    const row = e.target.closest(".ng-league-row");
    if (!row) return;
    chosenLeague = leagues.find((l) => l.id === row.dataset.league);
    renderClubGrid();
    showStep("club");
  });

  clubGridEl.addEventListener("click", (e) => {
    const card = e.target.closest(".ng-club-card");
    if (!card) return;
    clubGridEl.querySelectorAll(".ng-club-card").forEach((el) => el.classList.toggle("is-sel", el === card));
    chosenClub = clubs.find((c) => c.id === card.dataset.club);
    renderClubPreview(chosenClub);
  });

  clubBackEl.addEventListener("click", goToLeagueStep);
  promptBack.addEventListener("click", () => {
    const active = steps.find((s) => s.classList.contains("is-active"));
    if (active.dataset.step === "club") goToLeagueStep();
    else if (active.dataset.step === "league") showStep("name");
  });

  (async function init() {
    [leagues, clubs] = await Promise.all([loadJSON("data/leagues.json"), loadJSON("data/clubs.json")]);
    renderLeagueList();
    showStep("name");
    nameInput.focus();
  })();
}
