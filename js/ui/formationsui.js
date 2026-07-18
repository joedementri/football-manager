// ui/formationsui.js — fable-plans/plan2.md F2: Team Sheet ▸ FORMATIONS tab
// (the catalogue grid + team medallion) and its Customise Formation flow
// (EDIT menu ▸ Player Instructions / Player Positioning). Pure render-from-
// state, same contract as every other ui/*.js module — all interaction goes
// through core/store.js's teamSheetFormations*/teamSheetInstr*/
// teamSheetPos* mutators (core/router.js wires the DOM events).

import { positionInfo } from "../config/positions.js";
import { gridCells, GRID_PAGE_SIZE } from "../config/formations.js";
import { INSTRUCTION_GROUPS, instructionGroupFor } from "../config/instructions.js";
import { teamMedallion, teamStars } from "./panelkit.js";
import { renderPitchPanel, renderPlayerAttrPanel } from "./teamsheetui.js";

/** §B5 team medallion inputs: ATT/MID/DEF = mean overall of the current XI's
 * players *in that slot's area* (plan2.md §B5: "section ratings = mean of
 * best XI per line") — [TUNED], no formula is given beyond that wording. */
function sectionRatings(state) {
  const groups = { ATT: [], MID: [], DEF: [] };
  for (const entry of state.squad.lineup) {
    if (entry.gk) continue;
    const player = state.playersById.get(entry.playerId);
    if (!player) continue;
    const area = positionInfo(entry.pos).area;
    if (groups[area]) groups[area].push(player.overall);
  }
  const avg = (arr) => (arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0);
  return { att: avg(groups.ATT), mid: avg(groups.MID), def: avg(groups.DEF) };
}

/** Exported for ui/rolestacticsui.js (TACTICS/ROLES tabs show the same
 * medallion in their own right panel). */
export function renderTeamMedallion(state) {
  const { att, mid, def } = sectionRatings(state);
  const rating = Math.round((att + mid + def) / 3);
  return teamMedallion({ crestHref: `#crest-${state.club.id}`, stars: teamStars(rating), att, mid, def });
}

/* ============================== FORMATIONS grid =========================== */

// F2-fixes: windowed off ts.formationsScrollRow (a row index, independent of
// the keyboard/click cursor) rather than gridPage's fixed 6-cell page
// boundaries — lets mouse-wheel scroll (core/router.js) reveal cells between
// page boundaries, matching the pics' own scrollbar (a continuous list, not
// shoulder-button-paged pages — see config/formations.js's own header note).
function renderGridCells(state) {
  const ts = state.ui.teamSheet;
  const clubName = state.club.name;
  const startIdx = ts.formationsScrollRow * 3;
  const allCells = gridCells(clubName);
  const windowCells = allCells.slice(startIdx, startIdx + GRID_PAGE_SIZE);
  const activeKey = `${state.squad.formationLabel}|${state.squad.formationStyle}`;
  const cellsHtml = windowCells.map((cell, i) => {
    const idx = startIdx + i;
    const isCursor = idx === ts.formationsCursor;
    const isActive = `${cell.name}|${cell.style}` === activeKey;
    return (
      `<div class="fm-cell${isCursor ? " is-cursor" : ""}" data-action="formations-cell" data-index="${idx}">` +
        (isActive ? `<span class="fm-cell__check">&#10003;</span>` : "") +
        `<div class="fm-cell__l1">${cell.label1}</div>` +
        (cell.label2 ? `<div class="fm-cell__l2">${cell.label2}</div>` : "") +
      `</div>`
    );
  }).join("");
  const totalRows = Math.ceil(allCells.length / 3);
  const maxScrollRow = Math.max(1, totalRows - 2);
  const thumbPct = Math.min(100, (2 / totalRows) * 100);
  const topPct = Math.min(100 - thumbPct, (ts.formationsScrollRow / maxScrollRow) * (100 - thumbPct));
  const scrollbar = `<div class="fm-grid-scrollbar"><div class="fm-grid-scrollbar__thumb" style="top:${topPct}%;height:${thumbPct}%"></div></div>`;
  return `<div class="fm-grid-row"><div class="fm-grid">${cellsHtml}</div>${scrollbar}</div>`;
}

// F2-fixes round 2: the owner reported the overlay approach (below) cut off
// the field — the GK sits at y:92% of the pitch box, close enough to the
// bottom edge that *no* overlay height avoids covering it while the pitch is
// full-height; the reference pic's own list panel does exactly that (the
// GK's name is genuinely half-hidden there), but the owner wants nothing
// ever hidden, which wins over pixel fidelity to that specific pic detail.
// Back to a plain in-flow flex sibling (pitch above, panel below, no
// overlap) — same shape as the original F2 build, just without the crest
// banner (still dropped: no pic shows one here, and it's still dead weight
// once nothing overlaps the pitch).
function renderFormationsGrid(state) {
  const ts = state.ui.teamSheet;
  return {
    left:
      `<div class="sqts-pitchpanel fm-pitchpanel">${renderPitchPanel(state, ts, false, false)}</div>` +
      `<div class="fm-gridpanel">` +
        `<div class="fm-gridpanel__title">FORMATIONS</div>` +
        renderGridCells(state) +
      `</div>`,
    right: renderTeamMedallion(state),
  };
}

/* ============================== EDIT menu ================================= */

function renderCustomiseMenu(state) {
  const ts = state.ui.teamSheet;
  const cards = [
    { icon: "ic-tactics", label: "Player Instructions" },
    { icon: "ic-move", label: "Player Positioning" },
  ];
  const cardsHtml = cards.map((c, i) => (
    `<div class="fm-menucard${i === ts.customiseMenuCursor ? " is-sel" : ""}" data-action="customise-menu-cell" data-index="${i}">` +
      `<svg class="fm-menucard__icon"><use href="#${c.icon}"></use></svg>` +
      `<div class="fm-menucard__label">${c.label}</div>` +
    `</div>`
  )).join("");
  return {
    left:
      `<div class="sqts-pitchpanel fm-pitchpanel">${renderPitchPanel(state, ts, false, false)}</div>` +
      `<div class="fm-gridpanel">` +
        `<div class="fm-gridpanel__title">EDIT FORMATION</div>` +
        `<div class="fm-menu">${cardsHtml}</div>` +
      `</div>`,
    right: renderTeamMedallion(state),
  };
}

/* ============================== Player Instructions ======================= */

const INSTR_BLURB = "Use Player Instructions to adjust how each player will act when attacking or defending.";

function renderInstructionsCategoryCards(state, entry) {
  const ts = state.ui.teamSheet;
  const group = instructionGroupFor(entry.pos);
  const cats = (group && INSTRUCTION_GROUPS[group]) || [];
  const picks = state.squad.instructions[entry.playerId] || {};
  const cardsHtml = cats.map((cat, i) => {
    const isSel = i === ts.instrCategoryIndex;
    const curIdx = picks[cat.key] != null ? picks[cat.key] : cat.defaultIndex;
    const opt = cat.options[curIdx];
    const valueLabel = opt.value + (opt.defaultLabel ? "(default)" : "");
    const dots = cat.options.map((o, oi) => `<i class="${oi === curIdx ? "on" : ""}"></i>`).join("");
    const pager = isSel
      ? `<div class="sqts-pagernav fm-instcard__pager">` +
          `<button type="button" class="cnav prev" data-action="instr-cycle-prev">&lsaquo;</button>` +
          `<div class="dots">${dots}</div>` +
          `<button type="button" class="cnav next" data-action="instr-cycle-next">&rsaquo;</button>` +
        `</div>`
      : `<div class="dots fm-instcard__dots">${dots}</div>`;
    // F2-fixes: only badge a category once its pick has actually been
    // changed away from cat.defaultIndex — "the currently selected [i.e.
    // deliberately set, non-default] value for that player" per the owner's
    // own framing, not a decorative badge on every card regardless of state.
    const isCustomized = curIdx !== cat.defaultIndex;
    return (
      `<div class="fm-instcard${isSel ? " is-sel" : ""}" data-action="instr-cat" data-index="${i}">` +
        (isCustomized ? `<span class="fm-instcard__check">&#10003;</span>` : "") +
        `<div class="fm-instcard__title">${cat.title}</div>` +
        `<div class="fm-instcard__value">${valueLabel}</div>` +
        pager +
      `</div>`
    );
  }).join("");
  return `<div class="fm-gridpanel__title">EDIT INSTRUCTIONS</div><div class="fm-instcards">${cardsHtml}</div>`;
}

function renderInstructionsInfoPanel(state, entry) {
  const ts = state.ui.teamSheet;
  const group = instructionGroupFor(entry.pos);
  const cats = (group && INSTRUCTION_GROUPS[group]) || [];
  const cat = cats[Math.min(ts.instrCategoryIndex, Math.max(0, cats.length - 1))];
  if (!cat) return `<div class="fm-info__title">Info</div>`;
  const optionsHtml = cat.options.map((opt) => (
    `<div class="fm-info__opt">` +
      `<div class="fm-info__opt-title">${opt.value}${opt.defaultLabel ? "(default)" : ""}</div>` +
      `<div class="fm-info__opt-desc">${opt.desc}</div>` +
    `</div>`
  )).join("");
  return `<div class="fm-info__title">Info</div>${optionsHtml}`;
}

function renderInstructionsPage(state) {
  const ts = state.ui.teamSheet;
  const editing = ts.instrEditingIndex != null;
  const focusIndex = editing ? ts.instrEditingIndex : ts.instrFocusIndex;
  const entry = state.squad.lineup[focusIndex];
  const highlight = { index: focusIndex, kind: editing ? "armed" : "focus" };

  let bottomLeft;
  let right;
  if (editing && entry) {
    bottomLeft = renderInstructionsCategoryCards(state, entry);
    right = renderInstructionsInfoPanel(state, entry);
  } else {
    bottomLeft =
      `<div class="fm-gridpanel__title">PLAYER INSTRUCTIONS</div>` +
      `<div class="fm-blurb">` +
        `<span class="btn-glyph ls">LS</span>` +
        `<p>${INSTR_BLURB}</p>` +
      `</div>`;
    right = entry ? renderPlayerAttrPanel(state, state.playersById.get(entry.playerId), ts.attrPage) : "";
  }

  return {
    left:
      `<div class="sqts-pitchpanel fm-pitchpanel">${renderPitchPanel(state, ts, highlight, false)}</div>` +
      `<div class="fm-gridpanel">${bottomLeft}</div>`,
    right,
  };
}

/* ============================== Player Positioning ========================= */

function renderPositioningPage(state) {
  const ts = state.ui.teamSheet;
  const entry = state.squad.lineup[ts.posFocusIndex];
  const highlight = { index: ts.posFocusIndex, kind: "focus" };
  const right = entry ? renderPlayerAttrPanel(state, state.playersById.get(entry.playerId), ts.attrPage) : "";
  return {
    left:
      `<div class="sqts-pitchpanel fm-pitchpanel" data-role="pos-pitch">${renderPitchPanel(state, ts, highlight, false)}</div>` +
      `<div class="fm-gridpanel">` +
        `<div class="fm-gridpanel__title">ADJUST POSITION ON PITCH</div>` +
        `<div class="fm-blurb">` +
          `<span class="btn-glyph ls">LS</span>` +
          `<p>Use Base Positioning to adjust player positions and create custom formations.</p>` +
        `</div>` +
      `</div>`,
    right,
  };
}

/* ============================== top-level dispatch ========================= */

export function renderFormationsTab(state) {
  const ts = state.ui.teamSheet;
  if (ts.customiseMode === "menu") return renderCustomiseMenu(state);
  if (ts.customiseMode === "instructions") return renderInstructionsPage(state);
  if (ts.customiseMode === "positioning") return renderPositioningPage(state);
  return renderFormationsGrid(state);
}
