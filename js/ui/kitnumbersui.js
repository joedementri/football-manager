// ui/kitnumbersui.js — Squad ▸ Kit Numbers (fable-plans/plan1.md M11: "Kit
// Numbers ... Assign your players' kit numbers"; fable-plans/plan2.md F2.5
// fidelity pass against ms_EDIT_KIT_NUMBERS_PAGE(.._SELECTED_PLAYER).png —
// rebuilt onto §B1's fx-panel identity-header template: title "EDIT KIT
// NUMBER" (singular, pic-exact), crest + "Manager's Office" + manager name,
// two-pane "Squad" | "Kit Changes" body). Squad list: click to select, click
// again to edit (reveals the ◄/► steppers) and a running "Kit Changes" diff
// log (right, one line per player touched this session, "original -> current").
// All mutation via core/store.js's openKitNumbers/selectOrEditKitNumberPlayer/
// adjustKitNumber.

import { fxPanel, fxIdentityHeader, posDot, glyphPill } from "./panelkit.js";
import { positionInfo } from "../config/positions.js";

export function renderKitNumbers(state) {
  const k = state.ui.kitNumbers;
  const roster = state.squad.roster;

  const rows = roster.map((p) => {
    const sel = p.id === k.selectedPlayerId;
    const editing = sel && k.editing;
    const info = positionInfo(p.position);
    const numberCell = editing
      ? `<span class="kn-steppers">` +
          `<button class="kn-stepper" type="button" data-action="dec">&#9664;</button>` +
          `<span class="kn-num">${p.kitNumber}</span>` +
          `<button class="kn-stepper" type="button" data-action="inc">&#9654;</button>` +
        `</span>`
      : `<span class="kn-num">${p.kitNumber}</span>`;
    return (
      `<tr class="sl-row${sel ? " is-sel" : ""}" data-player="${p.id}">` +
        `<td>${posDot(info.area)}${p.position}</td>` +
        `<td class="sl-name">${p.commonName}</td>` +
        `<td class="num kn-num-cell">${numberCell}</td>` +
      `</tr>`
    );
  }).join("");

  const listHtml =
    `<table class="tbl sl-table kn-table">` +
      `<thead><tr><th>Pos</th><th>Name</th><th class="l">Number</th></tr></thead>` +
      `<tbody>${rows}</tbody>` +
    `</table>`;

  const changedIds = Object.keys(k.changes);
  const changesHtml = changedIds.length
    ? changedIds.map((id) => {
        const player = state.playersById.get(Number(id));
        if (!player) return "";
        const from = k.changes[id];
        if (from === player.kitNumber) return "";
        return `<div class="kn-change"><span class="kn-change__name">${player.commonName}</span><span class="kn-change__nums">${from} &rarr; ${player.kitNumber}</span></div>`;
      }).join("")
    : `<div class="empty"><span class="lbl">No changes yet — select a player, then select again to edit their number</span></div>`;

  const bodyHtml =
    fxIdentityHeader({ crestHref: `#crest-${state.club.id}`, manager: state.manager.name }) +
    `<div class="kn-body">` +
      `<div class="kn-pane"><div class="kn-pane__title">Squad</div><div id="kn-list">${listHtml}</div></div>` +
      `<div class="kn-pane"><div class="kn-pane__title">Kit Changes</div><div id="kn-changes">${changesHtml}</div></div>` +
    `</div>`;

  document.getElementById("kitnumbers-body").innerHTML = fxPanel({ title: "EDIT KIT NUMBER", bodyHtml });

  // F2: pic-exact prompt swap — "Select Player" before a row is armed for
  // editing, "Edit Kit Number" once the ◄/► steppers are showing.
  const footer = document.getElementById("footer-kitnumbers");
  if (footer) {
    footer.innerHTML =
      `<span class="prompt" data-action="select">${glyphPill("a")} ${k.editing ? "Edit Kit Number" : "Select Player"}</span>` +
      `<span class="prompt" data-action="back">${glyphPill("b")} Back</span>`;
  }
}
