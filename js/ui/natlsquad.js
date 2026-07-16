// ui/natlsquad.js — M10 Natl Squad Selection overlay (plan1.md: "squad
// selection before each break"). Pure render-from-state, same contract as
// ui/squadlist.js (whose .sl-* table tokens this reuses verbatim) — every
// row's click toggles that player in/out of the 23-man squad via
// core/store.js's toggleNatlSquadPlayer.

function eligibleRoster(state, nationId) {
  return state.players
    .filter((p) => p.nationId === nationId)
    .sort((a, b) => b.overall - a.overall);
}

function playerRow(state, p, squadIds, selectedId) {
  const inSquad = squadIds.includes(p.id);
  const sel = p.id === selectedId ? " is-sel" : "";
  const club = state.clubsById.get(p.clubId);
  return (
    `<tr class="sl-row${sel}${inSquad ? " natl-row--in" : ""}" data-player="${p.id}">` +
      `<td class="natl-check">${inSquad ? "&#10003;" : ""}</td>` +
      `<td class="sl-name">${p.commonName}</td>` +
      `<td>${p.position}</td>` +
      `<td class="num">${p.age}</td>` +
      `<td class="num sl-ovr">${p.overall}</td>` +
      `<td>${club ? club.shortName : "—"}</td>` +
    `</tr>`
  );
}

export function renderNatlSquad(state) {
  const container = document.getElementById("natlsquad-body");
  const nt = state.nationalTeam;
  if (!nt) { container.innerHTML = ""; return; }

  const nation = state.staticData.nations.find((n) => n.id === nt.nationId);
  const roster = eligibleRoster(state, nt.nationId);
  const { selectedPlayerId, lastError } = state.ui.natlSquad;
  const rows = roster.map((p) => playerRow(state, p, nt.squadPlayerIds, selectedPlayerId)).join("");

  container.innerHTML =
    `<div class="sl-header">` +
      `<span class="flag flag--lg" data-flag="${nation.id}"></span>` +
      `<div class="sl-clubname">${nation.name}</div>` +
      `<div class="sl-count">${nt.squadPlayerIds.length}/23 selected</div>` +
    `</div>` +
    (lastError ? `<div class="natl-error">${lastError}</div>` : "") +
    `<table class="tbl sl-table">` +
      `<thead><tr><th></th><th>Name</th><th>Pos</th><th>Age</th><th>OVR</th><th>Club</th></tr></thead>` +
      `<tbody>${rows}</tbody>` +
    `</table>`;
}
