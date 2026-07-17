// ui/teamsheetui.js — fable-plans/plan2.md F1: the Team Sheet view's SQUAD
// tab (own sub-tab bar SQUAD/FORMATIONS/TACTICS/ROLES — only SQUAD has real
// content this milestone; FORMATIONS/TACTICS/ROLES render the bar entry but
// no body until F2). Pure render-from-state, same contract as every other
// ui/*.js module: reads `state`, writes DOM, never mutates state or calls
// engine code directly — all interaction goes through core/store.js's
// teamSheet* mutators (core/router.js wires the DOM events).
//
// Left pitch panel + bottom drawer (Substitutes/Reserves/Suggested Subs) +
// right §B4 attribute panel (single or compare mode). Slot addressing
// (`{zone:'xi'|'bench'|'reserve', index}`) and swap semantics live in
// core/store.js; this file only ever *reads* a slot via the exported
// teamSheetSlotPlayer/teamSheetSlotPlayerId/teamSheetReserves helpers.

import { teamSheetReserves, teamSheetSlotPlayer } from "../core/store.js";
import { positionInfo } from "../config/positions.js";
import { attrChip, posDot, positionColorFor, glyphPill } from "./panelkit.js";
import { stars, cmToFtIn } from "./playerbio.js";

/* ============================== attribute pages ========================= */
// Verbatim field/label pairs transcribed from ms_TEAM_SHEET_VIEW_PHYSICAL_
// ATTRIBUTES.png + ..._SCROLLED_DOWN_PHYSICAL_ATTRIBUTES.png and ms_TEAM_
// SHEET_VIEW_SKILL_ATTRIBUTES.png + ..._SCROLLED_DOWN_SKILL_ATTRIBUTES.png.
// Note: the plan text guessed Positioning/Vision land on the Skill page —
// the pics show them on Physical/Mental instead (as "Att. Position"/
// "Vision"); pics win per §A1 (plan2-decisions.md F1 logs the correction).
// "Stand Tackle"/"Slide Tackle" (not "Standing"/"Sliding") are also pic-exact.
const PHYSICAL_ATTRS = [
  ["acceleration", "Acceleration"], ["sprintSpeed", "Sprint Speed"], ["agility", "Agility"],
  ["balance", "Balance"], ["jumping", "Jumping"], ["stamina", "Stamina"], ["strength", "Strength"],
  ["reactions", "Reactions"], ["aggression", "Aggression"], ["interceptions", "Interceptions"],
  ["positioning", "Att. Position"], ["vision", "Vision"],
];
const SKILL_ATTRS = [
  ["ballControl", "Ball Control"], ["crossing", "Crossing"], ["dribbling", "Dribbling"],
  ["finishing", "Finishing"], ["fkAccuracy", "FK Acc."], ["headingAcc", "Heading Acc."],
  ["longPass", "Long Pass"], ["shortPass", "Short Pass"], ["marking", "Marking"],
  ["shotPower", "Shot Power"], ["longShots", "Long Shots"], ["standTackle", "Stand Tackle"],
  ["slideTackle", "Slide Tackle"], ["volleys", "Volleys"], ["curve", "Curve"], ["penalties", "Penalties"],
];
const GK_ATTRS = [
  ["gkDiving", "GK Diving"], ["gkHandling", "GK Handling"], ["gkKicking", "GK Kicking"],
  ["gkReflexes", "GK Reflexes"], ["gkPositioning", "GK Pos."],
];

/** Page order per §B4 + plan2.md F1.6: outfield = 4 pages; GK gets a 5th
 * "GK Attributes" page prepended. Exported for dev/tests.js's "GK panel
 * shows GK page first" assertion. */
export function attrPageDefs(player) {
  const isGk = positionInfo(player.position).area === "GK";
  const pages = [];
  if (isGk) pages.push({ key: "gk", title: "GK Attributes", rows: GK_ATTRS });
  pages.push({ key: "physical", title: "Physical and Mental Attributes", rows: PHYSICAL_ATTRS });
  pages.push({ key: "skill", title: "Skill Attributes", rows: SKILL_ATTRS });
  pages.push({ key: "info", title: "Player Information" });
  pages.push({ key: "specialties", title: "Specialities / Traits" });
  return pages;
}

/* ============================== fitness/form pure helpers ================ */

// [TUNED]: no INI table backs this UI status dot (simsettings.ini's
// [FATIGUE] only models energy loss/recovery rates, not a display banding) —
// bands chosen to read the same way §B4's attribute chips do. Logged in
// plan2-decisions.md F1.
export function fitnessBand(player) {
  if (player.injury) return "red";
  if (player.fitness >= 90) return "green";
  if (player.fitness >= 75) return "yellow";
  if (player.fitness >= 50) return "orange";
  return "red";
}

const FITNESS_BAND_HEX = { green: "#39b54a", yellow: "#e8c227", orange: "#d9822b", red: "#c0392b" };

/** Change View mode 2 (Energy/Form): jersey trend arrow from the delta
 * between the most recent match rating and the average of the 2 before it
 * (plan2.md F1.2: "trend arrow ... from form delta over last 3 ratings").
 * [TUNED] bands (no INI table for this either), logged in
 * plan2-decisions.md F1. Exported for dev/tests.js. */
export function formArrow(ratingHistory) {
  if (!ratingHistory || ratingHistory.length < 2) return "→"; // →, not enough history
  const recent = ratingHistory[0];
  const prior = ratingHistory.slice(1, 3);
  const priorAvg = prior.reduce((s, r) => s + r, 0) / prior.length;
  const delta = recent - priorAvg;
  if (delta >= 8) return "↑"; // ↑
  if (delta >= 3) return "↗"; // ↗
  if (delta > -3) return "→"; // →
  if (delta > -8) return "↘"; // ↘
  return "↓"; // ↓
}

/* ============================== slot state helpers ======================= */

function isSlot(slot, zone, index) {
  return !!slot && slot.zone === zone && slot.index === index;
}

function ringClass(ts, zone, index) {
  if (isSlot(ts.armed, zone, index)) return " is-armed";
  if (isSlot(ts.focus, zone, index)) return " is-focus";
  return "";
}

function showSwapIcon(ts, zone, index) {
  return !!ts.armed && isSlot(ts.focus, zone, index);
}

const SWAP_ICON = `<svg class="sqts-swapicon"><use href="#ic-transfer"></use></svg>`;

/* ============================== left pitch panel ========================= */

const KIT_SVG = `<svg class="jersey__kit"><use href="#kit"></use></svg>`;

function jerseyCaption(state, ts, entry, player) {
  const dotHtml = `<span class="sqts-jersey__dot sqts-jersey__dot--${fitnessBand(player)}"></span>`;
  if (ts.changeView === 1) {
    // Energy/Form: no position/OVR label; trend arrow above the jersey
    // graphic (which still renders); name-bar becomes a fitness-banded
    // energy bar (ms_TEAM_SHEET_VIEW_CHANGE_VIEW_2of3_ENERGY_FORM.png).
    return {
      arrow: `<span class="sqts-jersey__arrow">${formArrow(player.ratingHistory)}</span>`,
      top: KIT_SVG,
      bar: `<div class="sqts-jersey__bar"><i style="width:${player.fitness}%;background:${FITNESS_BAND_HEX[fitnessBand(player)]}"></i></div>`,
    };
  }
  if (ts.changeView === 2) {
    // Positional colouring: position label hidden, dot recoloured to the
    // player's position group (ms_..._3of3_POSITIONAL_COLORING.png).
    const posColorDot = `<span class="sqts-jersey__dot" style="background:${positionColorFor(positionInfo(player.position).area)}"></span>`;
    return {
      top: `${KIT_SVG}<span class="jersey__rating">${player.overall}</span>`,
      bar: `<div class="sqts-jersey__bar"><i style="width:${player.fitness}%"></i></div>`,
      dot: posColorDot,
    };
  }
  // mode 0: Position/OVR (default) — pos label + OVR + fitness-banded dot.
  return {
    top: `<span class="jersey__pos">${entry.pos}</span>${KIT_SVG}<span class="jersey__rating">${player.overall}</span>`,
    bar: `<div class="sqts-jersey__bar"><i style="width:${player.fitness}%"></i></div>`,
    dot: dotHtml,
  };
}

function renderJersey(state, ts, entry, index) {
  const player = state.playersById.get(entry.playerId);
  if (!player) return "";
  const cap = entry.captain ? `<span class="jersey__cap">C</span>` : "";
  const cls = ringClass(ts, "xi", index);
  const swap = showSwapIcon(ts, "xi", index) ? SWAP_ICON : "";
  const cap3 = jerseyCaption(state, ts, entry, player);
  const dotHtml = ts.changeView === 1 ? "" : (cap3.dot || "");
  const arrowHtml = ts.changeView === 1 ? cap3.arrow : "";
  return (
    `<div class="jersey sqts-jersey${entry.gk ? " gk" : ""}${cls}" style="left:${entry.x}%;top:${entry.y}%" data-zone="xi" data-index="${index}">` +
      arrowHtml +
      `<div class="jersey__top">${cap3.top}${cap}${swap}</div>` +
      `<div class="sqts-jersey__statusrow">${dotHtml}${cap3.bar}</div>` +
      `<div class="jersey__name">${player.commonName}</div>` +
    `</div>`
  );
}

function renderPitchPanel(state, ts) {
  const jerseys = state.squad.lineup.map((entry, i) => renderJersey(state, ts, entry, i)).join("");
  return (
    `<div class="sqts-crestbanner"><svg class="crest"><use href="#crest-${state.club.id}"></use></svg></div>` +
    `<div class="pitch sqts-pitch">` +
      `<div class="pitch__surface"></div>` +
      jerseys +
    `</div>` +
    `<div class="sqts-formation"><b>${state.squad.formationLabel}</b><span>${state.squad.formationStyle}</span></div>`
  );
}

/* ============================== drawer (Substitutes/Reserves/Suggested) == */

function slotCard(state, ts, zone, index, player) {
  const cls = ringClass(ts, zone, index);
  const swap = showSwapIcon(ts, zone, index) ? SWAP_ICON : "";
  return (
    `<div class="sqts-slotcard${cls}" data-zone="${zone}" data-index="${index}">` +
      `<div class="sqts-slotcard__top">` +
        `<span class="sqts-slotcard__portrait"></span>` +
        `<span class="sqts-slotcard__ovr">${player.overall}</span>` +
        swap +
      `</div>` +
      `<div class="sqts-slotcard__statusrow">` +
        `<span class="sqts-jersey__dot sqts-jersey__dot--${fitnessBand(player)}"></span>` +
        `<div class="sqts-jersey__bar"><i style="width:${player.fitness}%"></i></div>` +
      `</div>` +
      `<div class="sqts-slotcard__name">${player.commonName}</div>` +
    `</div>`
  );
}

function drawerBarText(drawer) {
  if (drawer === "substitutes") return "SUBSTITUTES";
  if (drawer === "reserves") return "RESERVES";
  if (drawer === "suggested") return "Suggested Subs";
  return "SUBSTITUTES/RESERVES";
}

function renderDrawer(state, ts) {
  const arrow = ts.drawer === "collapsed" ? "&#9650;" : "&#9660;"; // ▲ / ▼
  const barCls = ts.drawer === "suggested" ? " sqts-drawer__bar--gold" : "";
  const bar =
    `<div class="sqts-drawer__bar${barCls}" data-action="toggle-drawer">` +
      `<span class="sqts-drawer__arrow">${arrow}</span>` +
      `<span class="sqts-drawer__label">${drawerBarText(ts.drawer)}</span>` +
      `<span class="sqts-drawer__arrow">${arrow}</span>` +
    `</div>`;

  if (ts.drawer === "collapsed") return `<div class="sqts-drawer">${bar}</div>`;

  let body;
  if (ts.drawer === "suggested" && ts.suggested) {
    const ids = ts.suggested.candidateIds;
    if (!ids.length) {
      body = `<div class="sqts-drawer__empty">No similar players available.</div>`;
    } else {
      const cards = ids.map((id) => {
        const loc = state.squad.bench.indexOf(id) !== -1
          ? { zone: "bench", index: state.squad.bench.indexOf(id) }
          : { zone: "reserve", index: teamSheetReserves(state).findIndex((p) => p.id === id) };
        return slotCard(state, ts, loc.zone, loc.index, state.playersById.get(id));
      }).join("");
      body = `<div class="sqts-drawer__grid">${cards}</div>`;
    }
  } else if (ts.drawer === "substitutes") {
    const cards = state.squad.bench.map((id, i) => (
      id != null ? slotCard(state, ts, "bench", i, state.playersById.get(id)) : `<div class="sqts-slotcard sqts-slotcard--empty"></div>`
    )).join("");
    body = `<div class="sqts-drawer__grid">${cards}</div>`;
  } else {
    const reserves = teamSheetReserves(state);
    const cards = reserves.map((p, i) => slotCard(state, ts, "reserve", i, p)).join("");
    body = `<div class="sqts-drawer__grid">${cards || `<div class="sqts-drawer__empty">None</div>`}</div>`;
  }

  return `<div class="sqts-drawer sqts-drawer--open">${bar}<div class="sqts-drawer__body">${body}</div></div>`;
}

/* ============================== right attribute panel ==================== */

function playerNameFor(player) {
  return `${player.firstName.charAt(0)}. ${player.lastName}`;
}

function miniHeader(player, colorClass, kitNumber) {
  const info = positionInfo(player.position);
  return (
    `<div class="sqts-panelhead ${colorClass}">` +
      `<div class="fx-attrpanel__portrait"><span class="fx-attrpanel__kitnum">${kitNumber != null ? kitNumber : ""}</span></div>` +
      `<div>` +
        `<div>${posDot(info.area)} ${player.position} <span class="fx-attrpanel__ovr">${player.overall}</span></div>` +
        `<div class="sqts-panelhead__name">${playerNameFor(player)}</div>` +
        `<div class="fx-attrpanel__fitbar"><i style="width:${player.fitness}%"></i></div>` +
      `</div>` +
    `</div>`
  );
}

function attrRowsSingle(player, rows) {
  return rows.map(([field, label]) => (
    `<div class="fx-attr-row"><span class="fx-attr-row__name">${label}</span>${attrChip(player.attrs[field])}</div>`
  )).join("");
}

function attrRowsCompare(a, b, rows) {
  return rows.map(([field, label]) => (
    `<div class="sqts-attr-row--compare">` +
      attrChip(a.attrs[field]) +
      `<span class="sqts-attr-row__name">${label}</span>` +
      attrChip(b.attrs[field]) +
    `</div>`
  )).join("");
}

function playerInfoRows(state, player) {
  const nation = state.nationsById.get(player.nationId);
  const positions = [player.position, ...player.altPositions].join(", ");
  return [
    ["Age", player.age],
    ["Height", cmToFtIn(player.heightCm)],
    ["Weight", `${Math.round(player.weightKg * 2.20462)} lbs`],
    ["Nation", nation ? nation.name : "—"],
    ["Position(s)", positions],
    ["Foot", player.foot === "R" ? "Right" : "Left"],
    ["Attacking Work Rate", player.workRateAtt],
    ["Defensive Work Rate", player.workRateDef],
    ["Weak Foot", stars(player.weakFoot)],
    ["Skill Moves", stars(player.skillMoves)],
  ].map(([k, v]) => `<div class="fx-attr-row"><span class="fx-attr-row__name">${k}</span><span>${v}</span></div>`).join("");
}

function specialtiesRows(player) {
  const specialities = player.specialities || [];
  const traits = player.traits || [];
  const rowsFor = (list) => (list.length ? list.map((n) => `<div class="sqts-spec-row">${n}</div>`).join("") : `<div class="sqts-spec-row sqts-spec-row--none">None</div>`);
  return (
    `<div class="sqts-spec-heading">Specialities</div>${rowsFor(specialities)}` +
    `<div class="sqts-spec-heading">Traits</div>${rowsFor(traits)}`
  );
}

function pageBodySingle(state, player, page) {
  if (page.key === "info") return playerInfoRows(state, player);
  if (page.key === "specialties") return specialtiesRows(player);
  return attrRowsSingle(player, page.rows);
}

function renderRightPanel(state, ts) {
  const focusPlayer = teamSheetSlotPlayer(state, ts.focus);
  if (!focusPlayer) return "";
  const compareMode = !!ts.armed && !isSlot(ts.armed, ts.focus.zone, ts.focus.index);
  const anchorPlayer = compareMode ? teamSheetSlotPlayer(state, ts.armed) : null;

  const primary = compareMode ? anchorPlayer : focusPlayer;
  const pages = attrPageDefs(primary);
  const pageIndex = Math.min(ts.attrPage, pages.length - 1);
  const page = pages[pageIndex];

  const header = compareMode
    ? `<div class="sqts-panelhead-row">${miniHeader(anchorPlayer, "is-anchor", anchorPlayer.kitNumber)}${miniHeader(focusPlayer, "is-candidate", focusPlayer.kitNumber)}</div>`
    : miniHeader(focusPlayer, "", focusPlayer.kitNumber);

  const canCompareThisPage = page.key === "gk" || page.key === "physical" || page.key === "skill";
  const body = compareMode && canCompareThisPage
    ? attrRowsCompare(anchorPlayer, focusPlayer, page.rows)
    : pageBodySingle(state, compareMode ? anchorPlayer : focusPlayer, page);

  const dots = pages.map((p, i) => `<i class="${i === pageIndex ? "on" : ""}"></i>`).join("");

  return (
    header +
    `<div class="fx-panel__title sqts-pagetitle">${page.title}</div>` +
    `<div class="sqts-panelbody">${body}</div>` +
    `<div class="fx-attrpanel__pagedots">${glyphPill("rs")}${dots}</div>`
  );
}

/* ============================== tabs + footer ============================ */

const TABS = [
  { key: "squad", label: "SQUAD" },
  { key: "formations", label: "FORMATIONS" },
  { key: "tactics", label: "TACTICS" },
  { key: "roles", label: "ROLES" },
];

function renderTabs(state) {
  const el = document.getElementById("sqts-tabbar");
  if (!el) return;
  el.innerHTML = TABS.map((t) => (
    `<button type="button" class="sqts-tab${t.key === state.ui.teamSheet.tab ? " is-active" : ""}" data-tab="${t.key}">${t.label}</button>`
  )).join("");
}

function renderFooter(state) {
  const footer = document.getElementById("footer-teamsheet");
  if (!footer) return;
  const ts = state.ui.teamSheet;
  if (ts.tab !== "squad") {
    footer.innerHTML = `<span class="prompt" data-action="back">${glyphPill("b")} Back</span>`;
    return;
  }
  const prompts = [
    `<span class="prompt" data-action="advance">${glyphPill("a")} Advance</span>`,
    `<span class="prompt" data-action="back">${glyphPill("b")} Back</span>`,
  ];
  if (ts.focus.zone === "xi") {
    prompts.push(`<span class="prompt" data-action="suggested-subs">${glyphPill("y")} Suggested Subs</span>`);
  }
  prompts.push(`<span class="prompt" data-action="select-player">${glyphPill("x")} Select Player</span>`);
  prompts.push(`<span class="prompt" data-action="change-view">${glyphPill("ls")} Change View</span>`);
  footer.innerHTML = prompts.join("");
}

/* ============================== top-level render ========================== */

export function renderTeamSheet(state) {
  renderTabs(state);
  const body = document.getElementById("sqts-body");
  if (!body) return;
  const ts = state.ui.teamSheet;

  if (ts.tab !== "squad") {
    body.innerHTML = "";
    renderFooter(state);
    return;
  }

  body.innerHTML =
    `<div class="sqts-left">` +
      `<div class="sqts-pitchpanel">${renderPitchPanel(state, ts)}${renderDrawer(state, ts)}</div>` +
    `</div>` +
    `<div class="sqts-right">${renderRightPanel(state, ts)}</div>`;

  renderFooter(state);
}
