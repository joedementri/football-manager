// ui/kitnumbersui.js — Squad ▸ Kit Numbers (fable-plans/plan1.md M11: "Kit
// Numbers ... Assign your players' kit numbers"). Two-pane overlay: the
// squad list (left, click to select, click again to edit — reveals the
// ◄/► steppers) and a running "Kit Changes" diff log (right, one line per
// player touched this session, "original -> current"). All mutation via
// core/store.js's openKitNumbers/selectOrEditKitNumberPlayer/adjustKitNumber.

export function renderKitNumbers(state) {
  const k = state.ui.kitNumbers;
  const roster = state.squad.roster;

  const rows = roster.map((p) => {
    const sel = p.id === k.selectedPlayerId;
    const editing = sel && k.editing;
    const numberCell = editing
      ? `<span class="kn-steppers">` +
          `<button class="kn-stepper" type="button" data-action="dec">&#9664;</button>` +
          `<span class="kn-num">${p.kitNumber}</span>` +
          `<button class="kn-stepper" type="button" data-action="inc">&#9654;</button>` +
        `</span>`
      : `<span class="kn-num">${p.kitNumber}</span>`;
    return (
      `<tr class="sl-row${sel ? " is-sel" : ""}" data-player="${p.id}">` +
        `<td>${p.position}</td>` +
        `<td class="sl-name">${p.commonName}</td>` +
        `<td class="num kn-num-cell">${numberCell}</td>` +
      `</tr>`
    );
  }).join("");

  document.getElementById("kn-list").innerHTML =
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

  document.getElementById("kn-changes").innerHTML = changesHtml;
}
