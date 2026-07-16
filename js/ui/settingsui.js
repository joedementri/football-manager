// ui/settingsui.js — Office ▸ Settings (fable-plans/plan1.md M11: "Settings
// (difficulty, currency, autosave, sim detail)"). Four rows, each a label +
// a left/right cycle control — same "stepper row" shape as Contracts' wage/
// years offer rows. Every option here has a real, documented effect (see
// config/settings.js's own header for exactly where each one is consumed);
// this is not a cosmetic-only settings page. Pure render-from-state; all
// mutation via core/store.js's setDifficulty/setCurrency/setAutosave/
// setSimDetail.

import { DIFFICULTIES, CURRENCIES, SIM_DETAILS } from "../config/settings.js";

function cycleRow({ label, hint, options, currentId, action }) {
  const current = options.find((o) => o.id === currentId) || options[0];
  return (
    `<div class="set-row">` +
      `<div class="set-row__label">${label}<span class="set-row__hint">${hint}</span></div>` +
      `<div class="set-row__control">` +
        `<button class="set-stepper" type="button" data-action="${action}" data-dir="-1">&#9664;</button>` +
        `<span class="set-row__val">${current.name}</span>` +
        `<button class="set-stepper" type="button" data-action="${action}" data-dir="1">&#9654;</button>` +
      `</div>` +
    `</div>`
  );
}

function toggleRow({ label, hint, on, action }) {
  return (
    `<div class="set-row">` +
      `<div class="set-row__label">${label}<span class="set-row__hint">${hint}</span></div>` +
      `<div class="set-row__control">` +
        `<button class="set-toggle${on ? " is-on" : ""}" type="button" data-action="${action}">${on ? "On" : "Off"}</button>` +
      `</div>` +
    `</div>`
  );
}

export function renderSettings(state) {
  const s = state.settings;
  document.getElementById("settings-body").innerHTML =
    cycleRow({
      label: "Difficulty", hint: "Scales your team's match strength ±3%",
      options: DIFFICULTIES, currentId: s.difficulty, action: "cycle-difficulty",
    }) +
    cycleRow({
      label: "Currency", hint: "Display currency for all money values",
      options: CURRENCIES, currentId: s.currency, action: "cycle-currency",
    }) +
    toggleRow({
      label: "Autosave", hint: "Save automatically after every Advance",
      on: s.autosave, action: "toggle-autosave",
    }) +
    cycleRow({
      label: "Sim Detail", hint: "How much ticker detail Match Day shows",
      options: SIM_DETAILS, currentId: s.simDetail, action: "cycle-simdetail",
    });
}
