// ui/tacticsui.js — Squad ▸ Tactics + Player Roles (fable-plans/plan1.md
// M11: "Tactics/Player Roles effects"). One overlay, two pages (cycled by
// the footer's Prev/Next Page prompts, same convention as My Career):
//
//   "tactics" - 4 presets (config/tactics.js), each a small flat ±modifier
//     on engine/sim/core.js's teamStrength() for the user's own club's
//     matches (interactive league + quick-simmed cup/continental ties).
//   "roles"   - Captain + Penalty Taker pickers. Captain re-marks state.
//     squad.lineup's "C" badge (gen/squad.js's applyCaptainToLineup);
//     Penalty Taker is a real sim input (sim/quick.js's rollGoals, sim/
//     events.js's rollChancesForSide both prefer them when on the pitch).
//
// Pure render-from-state; all mutation via core/store.js's setTactic/
// setCaptain/setPenaltyTaker/tacticsChangePage.

import { TACTICS, tacticById } from "../config/tactics.js";

function renderTacticsPage(state) {
  const activeId = state.squad.tacticId;
  const active = tacticById(activeId);
  const cards = TACTICS.map((t) => (
    `<div class="tac-card${t.id === activeId ? " is-active" : ""}" data-action="set-tactic" data-value="${t.id}">` +
      `<div class="tac-card__name">${t.name}</div>` +
      `<div class="tac-card__desc">${t.description}</div>` +
      `<div class="tac-card__mod">${t.modifier === 0 ? "No modifier" : `+${(t.modifier * 100).toFixed(1)}% team strength`}</div>` +
    `</div>`
  )).join("");

  return (
    `<div class="tac-current">` +
      `<div class="tac-current__label">${active.name}</div>` +
      `<div class="tac-current__desc">${active.description}</div>` +
    `</div>` +
    `<div class="panel-title">ASSIGNED TACTICS</div>` +
    `<div class="tac-grid">${cards}</div>`
  );
}

function playerPickerRows(roster, selectedId, action) {
  return roster.map((p) => (
    `<tr class="sl-row${p.id === selectedId ? " is-sel" : ""}" data-action="${action}" data-value="${p.id}">` +
      `<td>${p.position}</td><td class="sl-name">${p.commonName}</td><td class="num">${p.overall}</td>` +
    `</tr>`
  )).join("");
}

function renderRolesPage(state) {
  const roster = state.squad.roster;
  const captainRows = playerPickerRows(roster, state.squad.captainId, "set-captain");
  const penaltyRows = playerPickerRows(roster, state.squad.penaltyTakerId, "set-penalty");

  return (
    `<div class="tac-roles">` +
      `<div class="tac-roles__col">` +
        `<div class="panel-title">CAPTAIN</div>` +
        `<div class="tac-roles__hint">Wears the armband on the team sheet.</div>` +
        `<table class="tbl sl-table"><thead><tr><th>Pos</th><th>Name</th><th class="l">OVR</th></tr></thead><tbody>${captainRows}</tbody></table>` +
      `</div>` +
      `<div class="tac-roles__col">` +
        `<div class="panel-title">PENALTY TAKER</div>` +
        `<div class="tac-roles__hint">Always steps up for a penalty when on the pitch.</div>` +
        `<table class="tbl sl-table"><thead><tr><th>Pos</th><th>Name</th><th class="l">OVR</th></tr></thead><tbody>${penaltyRows}</tbody></table>` +
      `</div>` +
    `</div>`
  );
}

export function renderTactics(state) {
  const page = state.ui.tactics.page;
  document.getElementById("tactics-body").innerHTML = page === "tactics" ? renderTacticsPage(state) : renderRolesPage(state);
}
