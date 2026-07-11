// ui/jobsui.js — Browse Jobs overlay renderer (fable-plans/plan1.md M5:
// "Browse Jobs (Office tile): openings list ... apply"). Pure render-from-
// state, same contract as every other ui/*.js module — mutations happen
// only via core/store.js's openBrowseJobs/selectJobRow/applyForSelectedJob.

import { money } from "../core/format.js";

function vacancyRow(club, idx, selected) {
  const sel = idx === selected ? " is-sel" : "";
  return (
    `<div class="jb-row${sel}" data-idx="${idx}">` +
      `<svg class="crest crest--sm"><use href="#crest-${club.id}"></use></svg>` +
      `<div class="jb-meta">` +
        `<div class="jb-name">${club.name}</div>` +
        `<div class="jb-sub">Prestige ${club.prestige}/10 &middot; Transfer budget ${money(club.baseTransferBudget)}</div>` +
      `</div>` +
    `</div>`
  );
}

export function renderJobsOverlay(state) {
  const body = document.getElementById("jobs-body");
  const vacancies = state.jobMarket.vacancies
    .map((id) => state.staticData.clubs.find((c) => c.id === id))
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

  const selected = state.ui.jobsSelectedIndex;
  body.innerHTML =
    `<div class="jb-header">Manager Reputation: ${state.manager.rep}/20</div>` +
    `<div class="jb-list">${vacancies.map((c, i) => vacancyRow(c, i, selected)).join("")}</div>`;
}
