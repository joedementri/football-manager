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

/** The user's club is the only club Squad List/Player Bio ever reference —
 * every other crest on screen still comes from the M0 stub's hand-authored
 * crest-a/b/c/d/pompey symbols, so only this one needs generating. */
function injectClubCrestSymbol(club) {
  const sprite = document.querySelector(".svg-sprite");
  if (sprite.querySelector(`#crest-${club.id}`)) return;
  sprite.insertAdjacentHTML("beforeend", crestSymbolMarkup(club));
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

function startGame(state) {
  injectClubCrestSymbol(state.club);

  document.getElementById("newgame-root").hidden = true;
  document.getElementById("game-root").hidden = false;

  const store = new Store(state);
  renderAll(store.state);
  initRouter(store); // screen/overlay switching, footer prompts, deep links
  initCarousels(); // generic [data-carousel] tile paging
  initStage(); // fit the 1280x720 stage to the viewport
  wireSaveButton(store);

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
