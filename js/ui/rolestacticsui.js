// ui/rolestacticsui.js — fable-plans/plan2.md F2: Team Sheet ▸ TACTICS and
// ▸ ROLES tabs. Pure render-from-state; all interaction goes through
// core/store.js's setTactic/teamSheetTactics*/teamSheetRoles* mutators
// (core/router.js wires the DOM events). Shares ui/formationsui.js's team
// medallion (ROLES tab) — TACTICS tab's own right panel is static help copy
// transcribed from ms_TEAM_SHEET_VIEW_TACTICS.png (plan2-decisions.md F2:
// the plan's own summary text guessed "Speed/Passing/Positioning bars",
// which the pic doesn't show at all — pics win per §A1).

import { positionInfo } from "../config/positions.js";
import { TACTICS, tacticById } from "../config/tactics.js";
import { posDot, fxTable } from "./panelkit.js";
import { renderTeamMedallion } from "./formationsui.js";
import { renderPlayerAttrPanel } from "./teamsheetui.js";

/* ============================== TACTICS tab ================================ */

const DPAD_DIRS = ["up", "right", "down", "left"]; // TACTICS order matches config/tactics.js's own array order

function renderDpad(activeDir) {
  return `<div class="fm-dpad">` + DPAD_DIRS.map((d) => `<i class="fm-dpad__${d}${d === activeDir ? " is-on" : ""}"></i>`).join("") + `</div>`;
}

export function renderTacticsTab(state) {
  const ts = state.ui.teamSheet;
  const active = tacticById(state.squad.tacticId);
  const cardsHtml = TACTICS.map((t, i) => (
    `<div class="fm-tacard${i === ts.tacticsCursor ? " is-sel" : ""}" data-action="tactics-cell" data-index="${i}">` +
      renderDpad(DPAD_DIRS[i]) +
      `<div class="fm-tacard__label">${t.name}</div>` +
    `</div>`
  )).join("");
  return {
    left:
      `<div class="fm-tacpanel">` +
        `<div class="fm-tacpanel__current">` +
          `<div class="fm-tacpanel__name">${active.name}</div>` +
          `<div class="fm-tacpanel__desc">${active.description}</div>` +
        `</div>` +
        `<div class="fm-gridpanel__title">ASSIGNED TACTICS</div>` +
        `<div class="fm-tagrid">${cardsHtml}</div>` +
      `</div>`,
    right:
      `<div class="fm-info__title">Info</div>` +
      `<div class="fm-info__opt">` +
        `<div class="fm-info__opt-title">What are In Game Tactics?</div>` +
        `<div class="fm-info__opt-desc">These are tactics that can be triggered on the fly during the game that affect your entire team's playing style.</div>` +
      `</div>` +
      `<div class="fm-info__opt">` +
        `<div class="fm-info__opt-title">How do I use them?</div>` +
        `<div class="fm-info__opt-desc">Depending on your wireless controller configuration, press the down button or down on the left stick at any time and then select the tactic most suited for you. Your selections will be the tactics you have selected in this screen.</div>` +
      `</div>`,
  };
}

/* ============================== ROLES tab =================================== */

// Grid cell index -> squad field/icon/label, matching ms_TEAM_SHEET_VIEW_
// ROLES.png's 3x2 reading order exactly (also core/store.js's ROLE_FIELDS).
const ROLE_CELLS = [
  { field: "captainId", icon: "ic-armband", label: "CAPTAIN" },
  { field: "leftCornerId", icon: "ic-corner-l", label: "LEFT CORNER" },
  { field: "rightCornerId", icon: "ic-corner-r", label: "RIGHT CORNER" },
  { field: "shortFreeKickId", icon: "ic-goal-wall", label: "SHORT FREE KICK" },
  { field: "penaltyTakerId", icon: "ic-goal-ball", label: "PENALTIES" },
  { field: "longFreeKickId", icon: "ic-goal-wall", label: "LONG FREE KICK", mirror: true },
];

function renderRolesHeader(state) {
  const captainId = state.squad.captainId;
  const player = captainId != null ? state.playersById.get(captainId) : null;
  if (!player) return `<div class="fm-roleshead fm-roleshead--empty">No Captain Assigned</div>`;
  const info = positionInfo(player.position);
  return (
    `<div class="fm-roleshead">` +
      `<div class="fm-roleshead__portrait"><span class="jersey__cap fm-roleshead__cap">C</span></div>` +
      `<div>` +
        `<div>${posDot(info.area)} ${player.position} <span class="fm-roleshead__ovr">${player.overall}</span></div>` +
        `<div class="fm-roleshead__name">${player.firstName} ${player.lastName}</div>` +
      `</div>` +
    `</div>`
  );
}

function renderRolesGrid(state) {
  const ts = state.ui.teamSheet;
  const cellsHtml = ROLE_CELLS.map((rc, i) => {
    const pid = state.squad[rc.field];
    const player = pid != null ? state.playersById.get(pid) : null;
    return (
      `<div class="fm-rolecell${i === ts.rolesCursor ? " is-sel" : ""}" data-action="roles-cell" data-index="${i}">` +
        `<svg class="fm-rolecell__icon${rc.mirror ? " is-mirror" : ""}"><use href="#${rc.icon}"></use></svg>` +
        `<div class="fm-rolecell__label">${rc.label}</div>` +
        `<div class="fm-rolecell__name">${player ? player.commonName : "None"}</div>` +
      `</div>`
    );
  }).join("");
  return {
    left:
      renderRolesHeader(state) +
      // [PIC-GUESS] (plan2-decisions.md F2): a thin decorative pitch strip
      // with two generic jerseys sits between the header card and the role
      // grid in ms_TEAM_SHEET_VIEW_ROLES.png — no labels/interaction are
      // legible on it at capture resolution, rendered as pure decoration.
      `<div class="fm-rolesstrip"><span class="fm-rolesstrip__kit"></span><span class="fm-rolesstrip__kit"></span></div>` +
      `<div class="fm-gridpanel__title">PLAYER ROLES</div>` +
      `<div class="fm-rolesgrid">${cellsHtml}</div>`,
    right: renderTeamMedallion(state),
  };
}

// F2-fixes: hovering (or arrow-navigating) a row now outlines it gold and
// swaps the right pane over to that player's own §B4 attribute panel (with
// its usual prev/next carousel) — same "browsing shows a player" convention
// the SQUAD tab's own pitch/drawer already use. With nothing focused yet
// (picker just opened on an empty roster — shouldn't happen in practice)
// the team medallion is the fallback.
function renderRolesPicker(state) {
  const ts = state.ui.teamSheet;
  const roster = state.squad.roster;
  const table = fxTable({
    columns: [{ key: "pos", label: "Pos" }, { key: "name", label: "Name" }, { key: "ovr", label: "OVR", numeric: true }],
    rows: roster.map((p) => ({ id: p.id, pos: p.position, name: p.commonName, ovr: p.overall, area: positionInfo(p.position).area })),
    cellHtml: (col, row) => (col.key === "pos" ? `${posDot(row.area)}${row.pos}` : row[col.key]),
    rowClass: (row) => (row.id === ts.rolesPickerFocusId ? "is-focus" : ""),
  });
  const focusPlayer = ts.rolesPickerFocusId != null ? state.playersById.get(ts.rolesPickerFocusId) : null;
  return {
    left: `<div class="fm-gridpanel__title">SELECT PLAYER</div><div class="fm-pickerbody">${table}</div>`,
    right: focusPlayer ? renderPlayerAttrPanel(state, focusPlayer, ts.attrPage) : renderTeamMedallion(state),
  };
}

export function renderRolesTab(state) {
  return state.ui.teamSheet.rolesPickerOpen ? renderRolesPicker(state) : renderRolesGrid(state);
}
