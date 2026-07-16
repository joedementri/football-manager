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
import { injectClubCrestSymbols } from "./gen/crest.js";
import { preloadNamePools } from "./gen/names.js";
import { resetPlayerIdCounter } from "./gen/player.js";
import * as db from "./core/db.js";

const AUTOSAVE_SLOT = db.AUTOSAVE_SLOT_ID;

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

/**
 * M11 "save-slot management + export/import": the header menu's "Manage
 * Saves" item. All of core/db.js's 3 manual slots + autosave, plus
 * export-to-file/import-from-file, live here — main.js is the project's one
 * db.js-touching module (core/router.js only toggles this overlay's
 * visibility; see that file's own comment on the "saves" overlay case).
 * Load/Delete/Import all reuse one confirm modal (`#saves-confirm-modal`,
 * parameterized per action) rather than three bespoke ones, same
 * "destructive action needs a confirm step" precedent wireHeaderMenu's own
 * delete-save modal already set.
 */
function wireSaves(store) {
  const menuItem = document.getElementById("menu-manage-saves");
  const dropdown = document.getElementById("menu-dropdown");
  const menuBtn = document.getElementById("menu-btn");
  const bodyEl = document.getElementById("saves-body");
  const footerEl = document.getElementById("footer-saves");
  const importInput = document.getElementById("saves-import-input");
  const confirmModal = document.getElementById("saves-confirm-modal");
  const confirmTitle = document.getElementById("saves-confirm-title");
  const confirmBody = document.getElementById("saves-confirm-body");
  const confirmCancel = document.getElementById("saves-confirm-cancel");
  const confirmConfirm = document.getElementById("saves-confirm-confirm");

  async function refreshSlots() {
    store.state.ui.saves.slots = await db.listSaveSlots();
  }
  function setMessage(msg) {
    store.state.ui.saves.message = msg;
    store.emit("saves", null);
  }
  function askConfirm({ title, body, onConfirm }) {
    confirmTitle.textContent = title;
    confirmBody.textContent = body;
    confirmModal.hidden = false;
    const handler = async () => {
      confirmModal.hidden = true;
      confirmConfirm.removeEventListener("click", handler);
      await onConfirm();
    };
    confirmConfirm.addEventListener("click", handler);
  }
  confirmCancel.addEventListener("click", () => { confirmModal.hidden = true; });
  confirmModal.addEventListener("click", (e) => { if (e.target === confirmModal) confirmModal.hidden = true; });

  menuItem.addEventListener("click", async () => {
    dropdown.hidden = true;
    menuBtn.setAttribute("aria-expanded", "false");
    store.state.ui.saves.message = null;
    await refreshSlots();
    store.openOverlay("saves");
  });

  bodyEl.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const slotId = el.dataset.value;
    const slotLabel = slotId === AUTOSAVE_SLOT ? "Autosave" : slotId;

    if (el.dataset.action === "save-slot") {
      await db.saveGame(slotId, store.state);
      await refreshSlots();
      setMessage(`Saved to ${slotLabel}.`);
    } else if (el.dataset.action === "load-slot") {
      askConfirm({
        title: "Load this save?",
        body: "This replaces your current session with the chosen save and reloads the page — any unsaved progress since your last save will be lost.",
        onConfirm: async () => {
          await db.copySlot(slotId, AUTOSAVE_SLOT);
          location.reload();
        },
      });
    } else if (el.dataset.action === "delete-slot") {
      askConfirm({
        title: "Delete this save?",
        body: "This permanently deletes this save slot and can't be undone.",
        onConfirm: async () => {
          await db.deleteSave(slotId);
          await refreshSlots();
          setMessage(`Deleted ${slotLabel}.`);
        },
      });
    } else if (el.dataset.action === "export") {
      const json = db.saveToJSON(store.state);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${store.state.manager.name.replace(/\s+/g, "_")}-${store.state.club.shortName}-${store.state.seasonStartYear}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMessage("Save exported.");
    } else if (el.dataset.action === "import") {
      importInput.click();
    }
  });

  importInput.addEventListener("change", async () => {
    const file = importInput.files[0];
    importInput.value = "";
    if (!file) return;
    let raw;
    try {
      raw = db.parseSaveFromJSON(await file.text());
    } catch (err) {
      setMessage("Import failed — that file isn't a valid save.");
      return;
    }
    askConfirm({
      title: "Import this save?",
      body: "This replaces your current session (the autosave slot) with the imported file and reloads the page.",
      onConfirm: async () => {
        await db.importRawBlob(AUTOSAVE_SLOT, raw);
        location.reload();
      },
    });
  });

  footerEl.querySelector(".prompt").addEventListener("click", () => store.closeOverlay());
}

function startGame(state) {
  // M8: widened from just the user's starting league to every club in the
  // world — GTN missions (engine/gtn.js) and Search Players (M7) both
  // surface players from any of the ~600 clubs, not just the user's own
  // league, so their crests need to already be in the sprite too. Cheap
  // (plain string templates, no network/image assets — gen/crest.js's own
  // header) even at full ~600-club scale.
  injectClubCrestSymbols(state.staticData.clubs);

  document.getElementById("newgame-root").hidden = true;
  document.getElementById("game-root").hidden = false;

  const store = new Store(state);
  renderAll(store.state);
  initRouter(store); // screen/overlay switching, footer prompts, deep links
  initCarousels(); // generic [data-carousel] tile paging
  initStage(); // fit the 1280x720 stage to the viewport
  wireSaveButton(store);
  wireHeaderMenu();
  wireAutosave(store);
  wireSaves(store);

  // Exposed for manual verification in the console (dev convenience only —
  // no production code should depend on this global).
  window.__store = store;
}

/** M11 Settings ("autosave" toggle, default on): writes to the autosave slot
 * after every user-initiated Advance, same event Central/Season/Office/
 * Transfers/Squad already re-render from (core/router.js) — a natural,
 * infrequent point to persist rather than saving on every single state
 * mutation. A no-op while the toggle is off (Save stays manual-only, same as
 * every milestone before this one). */
function wireAutosave(store) {
  store.on("advance", () => {
    if (!db.isSupported() || !store.state.settings.autosave) return;
    db.saveGame(AUTOSAVE_SLOT, store.state);
  });
}

// M5 additions: nations + cups are now fetched here too (not just leagues/
// clubs) — engine/retirement.js's regens need a nation to draw a name pool
// from, and engine/season.js's rollover needs cups.json's domestic-cup
// definitions to rebuild next season's brackets. Both were previously only
// loaded by gen/world.js's New Game path.
async function loadStaticRefData() {
  const [leagues, clubs, nations, cups] = await Promise.all([
    fetch("data/leagues.json").then((r) => r.json()),
    fetch("data/clubs.json").then((r) => r.json()),
    fetch("data/nations.json").then((r) => r.json()),
    fetch("data/cups.json").then((r) => r.json()),
  ]);
  await preloadNamePools(nations); // gen/names.js's randomName() needs pools loaded before any regen runs
  return { leagues, clubs, nations, cups };
}

async function boot() {
  if (db.isSupported()) {
    try {
      const saved = await db.loadGame(AUTOSAVE_SLOT);
      if (saved) {
        const staticData = await loadStaticRefData();
        const state = hydrateFromSave(saved, staticData);
        // A regen (engine/retirement.js) or a freshly-scouted youth prospect
        // (engine/academy.js, M9 — state.academy.roster lives outside
        // state.players, see that file's own header) assigns ids from where
        // world-gen left off; gen/player.js's module-level counter resets to
        // 1 on every fresh page load, so it must fast-forward past every id
        // already in this save, from *both* collections, before either can
        // run this session.
        const maxWorldId = state.players.reduce((max, p) => Math.max(max, p.id), 0);
        const maxAcademyId = (state.academy?.roster || []).reduce((max, p) => Math.max(max, p.id), 0);
        resetPlayerIdCounter(Math.max(maxWorldId, maxAcademyId) + 1);
        startGame(state);
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
