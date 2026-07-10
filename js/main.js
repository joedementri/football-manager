// main.js — bootstrap entry point (ES module).
//
// M2 scope: boot now branches on whether a save exists. If the autosave
// slot has a career in it, we hydrate straight into the main game
// (js/core/store.js's hydrateFromSave); otherwise we run the New Game
// wizard (js/ui/newgame.js) — manager name → league → club → world-gen —
// and build a fresh career from its result (createCareerState). Either way
// we end up at the same `startGame(state)` that used to be main.js's whole
// body in M0/M1.

import { Store, createCareerState, hydrateFromSave } from "./core/store.js";
import { renderAll } from "./ui/render.js";
import { initRouter } from "./core/router.js";
import { initStage } from "./stage.js";
import { initCarousels } from "./carousel.js";
import { initNewGame } from "./ui/newgame.js";
import { crestSymbolMarkup } from "./gen/crest.js";
import * as db from "./core/db.js";

const AUTOSAVE_SLOT = db.AUTOSAVE_SLOT_ID;

/** Squad List/Player Bio only ever reference the user's own club, but M3's
 * real league table + fixtures list + Calendar overlay reference every club
 * in the user's league (fixtures are all intra-league — no inter-league
 * fixtures exist yet) — so all of those need a generated crest symbol, not
 * just the user's. Everything else on screen still comes from the M0
 * stub's hand-authored crest-a/b/c/d/pompey symbols. */
function injectClubCrestSymbols(clubs) {
  const sprite = document.querySelector(".svg-sprite");
  for (const club of clubs) {
    if (sprite.querySelector(`#crest-${club.id}`)) continue;
    sprite.insertAdjacentHTML("beforeend", crestSymbolMarkup(club));
  }
}

function wireSaveButton(store) {
  const saveBtn = Array.from(document.querySelectorAll("#footer-main .prompt"))
    .find((p) => /Save/i.test(p.textContent));
  if (!saveBtn) return;
  saveBtn.style.cursor = "pointer";
  saveBtn.addEventListener("click", async () => {
    if (!db.isSupported()) return;
    await db.saveGame(AUTOSAVE_SLOT, store.state);
  });
}

/** Header hamburger menu: currently just "Delete Save", guarded behind a
 * confirm modal so a misclick can't wipe a career (this is the whole reason
 * it exists — before this, starting over meant manually clearing IndexedDB). */
function wireHeaderMenu() {
  const menuBtn = document.getElementById("menu-btn");
  const dropdown = document.getElementById("menu-dropdown");
  const deleteItem = document.getElementById("menu-delete-save");
  const modal = document.getElementById("confirm-delete-modal");
  const cancelBtn = document.getElementById("confirm-delete-cancel");
  const confirmBtn = document.getElementById("confirm-delete-confirm");

  function closeMenu() {
    dropdown.hidden = true;
    menuBtn.setAttribute("aria-expanded", "false");
  }
  function toggleMenu() {
    const willOpen = dropdown.hidden;
    dropdown.hidden = !willOpen;
    menuBtn.setAttribute("aria-expanded", String(willOpen));
  }
  function openModal() {
    closeMenu();
    modal.hidden = false;
  }
  function closeModal() {
    modal.hidden = true;
  }

  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu();
  });
  document.addEventListener("click", (e) => {
    if (!dropdown.hidden && !e.target.closest(".menu-wrap")) closeMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!modal.hidden) closeModal();
    else if (!dropdown.hidden) closeMenu();
  });

  deleteItem.addEventListener("click", openModal);
  cancelBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  confirmBtn.addEventListener("click", async () => {
    confirmBtn.disabled = true;
    if (db.isSupported()) await db.deleteSave(AUTOSAVE_SLOT);
    location.reload();
  });
}

function startGame(state) {
  injectClubCrestSymbols(state.league.table.map((r) => r.club));

  document.getElementById("newgame-root").hidden = true;
  document.getElementById("game-root").hidden = false;

  const store = new Store(state);
  renderAll(store.state);
  initRouter(store); // screen/overlay switching, footer prompts, deep links
  initCarousels(); // generic [data-carousel] tile paging
  initStage(); // fit the 1280x720 stage to the viewport
  wireSaveButton(store);
  wireHeaderMenu();

  // Exposed for manual verification in the console (dev convenience only —
  // no production code should depend on this global).
  window.__store = store;
}

async function loadStaticRefData() {
  const [leagues, clubs] = await Promise.all([
    fetch("data/leagues.json").then((r) => r.json()),
    fetch("data/clubs.json").then((r) => r.json()),
  ]);
  return { leagues, clubs };
}

async function boot() {
  if (db.isSupported()) {
    try {
      const saved = await db.loadGame(AUTOSAVE_SLOT);
      if (saved) {
        const staticData = await loadStaticRefData();
        startGame(hydrateFromSave(saved, staticData));
        return;
      }
    } catch (err) {
      console.error("failed to load autosave, falling back to New Game", err);
    }
  }

  initNewGame({
    onComplete: async ({ managerName, club, league, world, seasonStartYear }) => {
      const state = createCareerState({ managerName, club, league, world, seasonStartYear });
      if (db.isSupported()) await db.saveGame(AUTOSAVE_SLOT, state);
      startGame(state);
    },
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
