// ui/ntjobsui.js — Browse NT Jobs overlay renderer (M10, plan1.md: "Manager
// reputation >= threshold + vacancies => NT job offers"). Mirrors
// ui/jobsui.js almost line-for-line — same pure render-from-state contract,
// same "apply == instant accept" flow — just nation flags instead of club
// crests and a rep-vs-threshold header instead of a plain rep readout.

import { NT_JOB_REP_THRESHOLD } from "../engine/ntjobs.js";

function vacancyRow(nation, idx, selected) {
  const sel = idx === selected ? " is-sel" : "";
  return (
    `<div class="jb-row${sel}" data-idx="${idx}">` +
      `<span class="flag flag--lg" data-flag="${nation.id}"></span>` +
      `<div class="jb-meta">` +
        `<div class="jb-name">${nation.name}</div>` +
        `<div class="jb-sub">Prestige ${nation.prestige}/10 &middot; ${nation.confed}</div>` +
      `</div>` +
    `</div>`
  );
}

export function renderNtJobsOverlay(state) {
  const body = document.getElementById("ntjobs-body");
  const rep = state.manager.rep;

  if (rep < NT_JOB_REP_THRESHOLD) {
    body.innerHTML = (
      `<div class="empty">` +
        `<svg class="icon"><use href="#ic-envelope"></use></svg>` +
        `<span class="lbl">Reputation ${rep}/20 — reach ${NT_JOB_REP_THRESHOLD}/20 to attract NT interest</span>` +
      `</div>`
    );
    return;
  }

  const vacancies = state.ntJobMarket.vacancies
    .map((id) => state.staticData.nations.find((n) => n.id === id))
    .filter(Boolean);

  if (!vacancies.length) {
    body.innerHTML = (
      `<div class="empty">` +
        `<svg class="icon"><use href="#ic-envelope"></use></svg>` +
        `<span class="lbl">NO VACANCIES AVAILABLE</span>` +
      `</div>`
    );
    return;
  }

  const selected = state.ui.ntJobsSelectedIndex;
  body.innerHTML =
    `<div class="jb-header">Manager Reputation: ${rep}/20</div>` +
    `<div class="jb-list">${vacancies.map((n, i) => vacancyRow(n, i, selected)).join("")}</div>`;
}
