// ui/squadlist.js — Squad List: the sortable 24-man roster table
// (plan1.md: "Squad List (sortable table: #, name, pos, age, OVR, form,
// fitness, value, wage, status icons — this is the main roster screen)").
// Pure render-from-state, per the project's UI contract — sorting/selection
// state lives in store.state.ui.squadlist and is mutated only via
// store.sortSquadList()/selectSquadListRow() (core/router.js wires the DOM
// events to those calls).

import { money, number } from "../core/format.js";

const COLUMNS = [
  { key: "kitNumber", label: "#" },
  { key: "name", label: "Name" },
  { key: "position", label: "Pos" },
  { key: "age", label: "Age" },
  { key: "overall", label: "OVR" },
  { key: "form", label: "Form" },
  { key: "fitness", label: "Fitness" },
  { key: "value", label: "Value" },
  { key: "wage", label: "Wage" },
  { key: "status", label: "" },
];

function sortValue(p, key) {
  switch (key) {
    case "name": return p.commonName.toLowerCase();
    case "position": return p.position;
    case "wage": return p.contract.wage;
    default: return p[key];
  }
}

function sortedRoster(state) {
  const { sortKey, sortDir } = state.ui.squadlist;
  const dir = sortDir === "asc" ? 1 : -1;
  return [...state.squad.roster].sort((a, b) => {
    const av = sortValue(a, sortKey);
    const bv = sortValue(b, sortKey);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}

function statusIcons(p, seasonStartYear) {
  const icons = [];
  if (p.injury) icons.push(`<svg class="icon sl-status--injury"><use href="#ic-alert"></use></svg>`);
  if (p.contract.endYear - seasonStartYear <= 1) icons.push(`<svg class="icon sl-status--contract"><use href="#ic-lock"></use></svg>`);
  return icons.join("");
}

export function renderSquadList(state) {
  const container = document.getElementById("squadlist-body");
  const roster = sortedRoster(state);
  const { sortKey, sortDir, selectedIndex } = state.ui.squadlist;

  const head = COLUMNS.map((c) => {
    const sortCls = c.key === sortKey ? ` is-sorted-${sortDir}` : "";
    return `<th class="sl-th${sortCls}" data-sort="${c.key}">${c.label}</th>`;
  }).join("");

  const rows = roster.map((p, i) => {
    const sel = i === selectedIndex ? " is-sel" : "";
    return (
      `<tr class="sl-row${sel}" data-idx="${i}" data-player="${p.id}">` +
        `<td class="num">${p.kitNumber}</td>` +
        `<td class="sl-name">${p.commonName}</td>` +
        `<td>${p.position}</td>` +
        `<td class="num">${p.age}</td>` +
        `<td class="num sl-ovr">${p.overall}</td>` +
        `<td class="num">${p.form}</td>` +
        `<td class="num">${p.fitness}%</td>` +
        `<td class="num">${money(p.value)}</td>` +
        `<td class="num">${money(p.contract.wage)}/w</td>` +
        `<td class="sl-status">${statusIcons(p, state.seasonStartYear)}</td>` +
      `</tr>`
    );
  }).join("");

  container.innerHTML =
    `<div class="sl-header">` +
      `<svg class="crest sl-crest"><use href="#crest-${state.club.id}"></use></svg>` +
      `<div class="sl-clubname">${state.club.name}</div>` +
      `<div class="sl-count">${number(roster.length)} players</div>` +
    `</div>` +
    `<table class="tbl sl-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}
