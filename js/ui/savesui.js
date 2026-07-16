// ui/savesui.js — the header menu's "Manage Saves" overlay (fable-plans/
// plan1.md M11: "save-slot management + export/import"; core/db.js already
// had 3 manual slots + autosave since M2 — this is the first screen that
// actually lets the user reach them, per that file's own header). Pure
// render-from-state, same contract as every other ui/*.js module — but see
// core/store.js's `ui.saves` comment for why `slots` itself is fetched by
// js/main.js (the project's one db.js-touching module) rather than derived
// from GameState the way everything else here is. Every button here is
// wired in main.js's wireSaves(), not core/router.js, since Save/Load/
// Delete/Export/Import all need db.js (an async IndexedDB call, sometimes
// followed by a full page reload) rather than a synchronous store mutation.

import { dateSlash } from "../core/format.js";

const SLOT_LABEL = { slot1: "Slot 1", slot2: "Slot 2", slot3: "Slot 3", autosave: "Autosave" };
const SLOT_ORDER = ["slot1", "slot2", "slot3", "autosave"];

function slotRow(state, slot) {
  const label = SLOT_LABEL[slot.slotId];
  if (!slot.exists) {
    return (
      `<div class="sv-row">` +
        `<div class="sv-row__id">${label}</div>` +
        `<div class="sv-row__info sv-row__info--empty">Empty</div>` +
        `<div class="sv-row__actions">` +
          `<button class="sv-btn sv-btn--primary" type="button" data-action="save-slot" data-value="${slot.slotId}">Save Here</button>` +
        `</div>` +
      `</div>`
    );
  }
  const club = state.clubsById.get(slot.clubId);
  return (
    `<div class="sv-row">` +
      `<div class="sv-row__id">${label}</div>` +
      `<div class="sv-row__info">` +
        (club ? `<svg class="crest crest--sm"><use href="#crest-${club.id}"></use></svg>` : "") +
        `<div class="sv-row__meta"><div class="sv-row__manager">${slot.managerName}</div>` +
        `<div class="sv-row__sub">${club ? club.name : "Unknown club"} &middot; Saved ${dateSlash(new Date(slot.savedAt))}</div></div>` +
      `</div>` +
      `<div class="sv-row__actions">` +
        `<button class="sv-btn sv-btn--primary" type="button" data-action="save-slot" data-value="${slot.slotId}">Save Here</button>` +
        `<button class="sv-btn" type="button" data-action="load-slot" data-value="${slot.slotId}">Load</button>` +
        `<button class="sv-btn sv-btn--danger" type="button" data-action="delete-slot" data-value="${slot.slotId}">Delete</button>` +
      `</div>` +
    `</div>`
  );
}

export function renderSaves(state) {
  const s = state.ui.saves;
  const rows = SLOT_ORDER
    .map((id) => s.slots.find((sl) => sl.slotId === id) || { slotId: id, exists: false })
    .map((slot) => slotRow(state, slot))
    .join("");

  document.getElementById("saves-body").innerHTML =
    `<div class="sv-current">` +
      `<svg class="crest crest--sm"><use href="#crest-${state.club.id}"></use></svg>` +
      `<div class="sv-current__meta"><div class="sv-current__manager">${state.manager.name}</div>` +
      `<div class="sv-current__sub">${state.club.name} &middot; current session</div></div>` +
    `</div>` +
    (s.message ? `<div class="sv-message">${s.message}</div>` : "") +
    `<div class="sv-list">${rows}</div>` +
    `<div class="sv-io">` +
      `<button class="sv-btn" type="button" data-action="export">Export Save to File</button>` +
      `<button class="sv-btn" type="button" data-action="import">Import Save from File</button>` +
    `</div>`;
}
