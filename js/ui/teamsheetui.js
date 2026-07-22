// ui/teamsheetui.js — fable-plans/plan2.md F1/F2: the Team Sheet view's own
// sub-tab bar + SQUAD tab content. Pure render-from-state, same contract as
// every other ui/*.js module: reads `state`, writes DOM, never mutates state
// or calls engine code directly — all interaction goes through
// core/store.js's teamSheet* mutators (core/router.js wires the DOM events).
// FORMATIONS/TACTICS/ROLES tabs' own content (F2) lives in ui/formationsui.js
// / ui/rolestacticsui.js — this file's renderTeamSheet dispatches to them;
// those two files import renderPitchPanel/renderPlayerAttrPanel back from
// here (both directions only ever called from inside a function body, never
// at module-evaluation time, so the circular import is safe — standard ESM
// pattern for a "top-level dispatcher + per-tab modules" split).
//
// SQUAD tab: left pitch panel + bottom drawer (Substitutes/Reserves/
// Suggested Subs) + right §B4 attribute panel (single or compare mode). Slot
// addressing (`{zone:'xi'|'bench'|'reserve', index}`) and swap semantics
// live in core/store.js; this file only ever *reads* a slot via the exported
// teamSheetSlotPlayer/teamSheetSlotPlayerId/teamSheetReserves helpers.

import { teamSheetReserves, teamSheetSlotPlayer } from "../core/store.js";
import { positionInfo } from "../config/positions.js";
import { attrChip, posDot, positionColorFor, glyphPill } from "./panelkit.js";
import { stars, cmToFtIn } from "./playerbio.js";
import { renderFormationsTab } from "./formationsui.js";
import { renderTacticsTab, renderRolesTab } from "./rolestacticsui.js";

/* ============================== attribute pages ========================= */
// Verbatim field/label pairs transcribed from ms_TEAM_SHEET_VIEW_PHYSICAL_
// ATTRIBUTES.png + ..._SCROLLED_DOWN_PHYSICAL_ATTRIBUTES.png and ms_TEAM_
// SHEET_VIEW_SKILL_ATTRIBUTES.png + ..._SCROLLED_DOWN_SKILL_ATTRIBUTES.png.
// Note: the plan text guessed Positioning/Vision land on the Skill page —
// the pics show them on Physical/Mental instead (as "Att. Position"/
// "Vision"); pics win per §A1 (plan2-decisions.md F1 logs the correction).
// "Stand Tackle"/"Slide Tackle" (not "Standing"/"Sliding") are also pic-exact.
// F4: exported for reuse by ui/sellplayersui.js's SELL PLAYERS player-selected
// attribute mini-panel (top-6-by-value across every attribute — see that
// file's own header for why).
export const PHYSICAL_ATTRS = [
  ["acceleration", "Acceleration"], ["sprintSpeed", "Sprint Speed"], ["agility", "Agility"],
  ["balance", "Balance"], ["jumping", "Jumping"], ["stamina", "Stamina"], ["strength", "Strength"],
  ["reactions", "Reactions"], ["aggression", "Aggression"], ["interceptions", "Interceptions"],
  ["positioning", "Att. Position"], ["vision", "Vision"],
];
export const SKILL_ATTRS = [
  ["ballControl", "Ball Control"], ["crossing", "Crossing"], ["dribbling", "Dribbling"],
  ["finishing", "Finishing"], ["fkAccuracy", "FK Acc."], ["headingAcc", "Heading Acc."],
  ["longPass", "Long Pass"], ["shortPass", "Short Pass"], ["marking", "Marking"],
  ["shotPower", "Shot Power"], ["longShots", "Long Shots"], ["standTackle", "Stand Tackle"],
  ["slideTackle", "Slide Tackle"], ["volleys", "Volleys"], ["curve", "Curve"], ["penalties", "Penalties"],
];
// Exported for reuse by ui/searchui.js (F3-fixes: Search Report/Shortlist's
// own GK attribute page, same field/label pairs as this screen's).
export const GK_ATTRS = [
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

// F1-fixes: jerseys must show the *club's* colours, not one fixed generic
// icon — gen/crest.js's kitSymbolMarkup injects a `#kit-<clubId>` symbol per
// club (js/main.js / core/router.js, mirroring how club crests already
// work), so this just picks that symbol over the flat placeholder. Keepers
// keep the old generic `#kit` + its `.jersey.gk .jersey__kit` CSS colour
// override (real football's own convention: a keeper's shirt is never the
// same colour as an outfield player's, club-specific or not).
function kitSvg(state, isGk) {
  const href = isGk ? "#kit" : `#kit-${state.club.id}`;
  return `<svg class="jersey__kit"><use href="${href}"></use></svg>`;
}

function jerseyCaption(state, ts, entry, player) {
  const kit = kitSvg(state, !!entry.gk);
  const dotHtml = `<span class="sqts-jersey__dot sqts-jersey__dot--${fitnessBand(player)}"></span>`;
  if (ts.changeView === 1) {
    // Energy/Form: no position/OVR label; trend arrow above the jersey
    // graphic (which still renders); name-bar becomes a fitness-banded
    // energy bar (ms_TEAM_SHEET_VIEW_CHANGE_VIEW_2of3_ENERGY_FORM.png).
    return {
      arrow: `<span class="sqts-jersey__arrow">${formArrow(player.ratingHistory)}</span>`,
      top: kit,
      bar: `<div class="sqts-jersey__bar"><i style="width:${player.fitness}%;background:${FITNESS_BAND_HEX[fitnessBand(player)]}"></i></div>`,
    };
  }
  if (ts.changeView === 2) {
    // Positional colouring: position label hidden, dot recoloured to the
    // player's position group (ms_..._3of3_POSITIONAL_COLORING.png).
    const posColorDot = `<span class="sqts-jersey__dot" style="background:${positionColorFor(positionInfo(player.position).area)}"></span>`;
    return {
      top: `${kit}<span class="jersey__rating">${player.overall}</span>`,
      bar: `<div class="sqts-jersey__bar"><i style="width:${player.fitness}%"></i></div>`,
      dot: posColorDot,
    };
  }
  // mode 0: Position/OVR (default) — pos label + OVR + fitness-banded dot.
  return {
    top: `<span class="jersey__pos">${entry.pos}</span>${kit}<span class="jersey__rating">${player.overall}</span>`,
    bar: `<div class="sqts-jersey__bar"><i style="width:${player.fitness}%"></i></div>`,
    dot: dotHtml,
  };
}

function renderJersey(state, ts, entry, index, forceRing = null) {
  const player = state.playersById.get(entry.playerId);
  if (!player) return "";
  const cap = entry.captain ? `<span class="jersey__cap">C</span>` : "";
  // F2: forceRing (ui/formationsui.js, via renderPitchPanel's own override
  // mode below) overrides the SQUAD tab's own armed/focus ring for the
  // FORMATIONS tab's pitch preview — "focus" (gold) while just browsing a
  // player (Instructions before selecting them, Positioning), "armed" (teal)
  // once Instructions is actually editing that player's categories, "none"
  // (F2-fixes) for every other jersey once override mode is on — same
  // gold/teal semantics ms_TEAM_SHEET_VIEW_SELECT_PLAYER.png established for
  // the SQUAD tab, reused per plan2-decisions.md F2's own [PIC-GUESS] note.
  const cls = forceRing != null ? (forceRing === "none" ? "" : ` is-${forceRing}`) : ringClass(ts, "xi", index);
  // F2-fixes: showSwapIcon reads ts.armed/ts.focus, which are SQUAD-tab-only
  // concepts (swap-arming a slot) — without this guard, whatever ts.focus/
  // armed happened to be left at from the SQUAD tab could paint a stray swap
  // icon onto the FORMATIONS tab's own read-only pitch preview too.
  const swap = ts.tab === "squad" && showSwapIcon(ts, "xi", index) ? SWAP_ICON : "";
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

// Exported for F2's FORMATIONS/ROLES/TACTICS tabs (ui/formationsui.js,
// ui/rolestacticsui.js) — all show the same read-only pitch preview of the
// active sheet's current XI. `highlight` has 3 states: `null` (default) is
// the SQUAD tab's own contract — every jersey falls back to ts.focus/armed;
// `false` (F2-fixes) is FORMATIONS' plain grid/EDIT menu — no pic there
// shows a ring on anyone, so every jersey is explicitly forced to none
// rather than falling back to whatever ts.focus happens to be parked at
// (previously always index 0's default, or wherever the user last left the
// SQUAD tab — either way a stray gold ring that had nothing to do with
// FORMATIONS); `{index, kind:'focus'|'armed'}` (Instructions/Positioning)
// forces a ring on exactly that one slot and explicitly *none* on every
// other slot — before this fix, every non-matching jersey also fell back to
// ts.focus/armed, so a second, unrelated ring could appear alongside the
// intended one whenever ts.focus didn't happen to coincide with it.
// `showCrest` (F2-fixes): FORMATIONS' own grid/Customise screens don't show
// the crest banner in any reference pic — omitting it there also frees up
// the flex column so the pitch itself reaches the top of the panel instead
// of losing ~70px to a banner + a squeezed pitch.
export function renderPitchPanel(state, ts, highlight = null, showCrest = true) {
  const overrideMode = highlight !== null;
  const jerseys = state.squad.lineup.map((entry, i) => {
    const forceRing = overrideMode ? ((highlight && highlight.index === i) ? highlight.kind : "none") : null;
    return renderJersey(state, ts, entry, i, forceRing);
  }).join("");
  return (
    (showCrest ? `<div class="sqts-crestbanner"><svg class="crest"><use href="#crest-${state.club.id}"></use></svg></div>` : "") +
    `<div class="pitch sqts-pitch">` +
      `<div class="pitch__surface"></div>` +
      jerseys +
    `</div>` +
    `<div class="sqts-formation"><b>${state.squad.formationLabel}</b><span>${state.squad.formationStyle}</span></div>`
  );
}

/* ============================== drawer (Substitutes/Reserves/Suggested) == */

// F1-fixes: the drawer's cards were missing two things every reference pic's
// bench/reserve rows show — a filled kit-number bubble (was an empty grey
// circle) and the player's own primary position next to it (not the
// formation-slot label pitch jerseys use, since bench/reserve players don't
// have one) — and didn't respect Change View at all (always OVR + a plain
// fitness dot, regardless of pitch mode). `mainRow`/`statusRow` below mirror
// jerseyCaption's 3 modes so the drawer stays in lockstep with the pitch.
function slotCardMain(ts, player) {
  if (ts.changeView === 1) {
    return {
      main: `<span class="sqts-slotcard__arrow">${formArrow(player.ratingHistory)}</span>`,
      status: `<div class="sqts-jersey__bar"><i style="width:${player.fitness}%;background:${FITNESS_BAND_HEX[fitnessBand(player)]}"></i></div>`,
    };
  }
  if (ts.changeView === 2) {
    const area = positionInfo(player.position).area;
    return {
      main: `<span class="sqts-slotcard__ovr">${player.overall}</span>`,
      status: `<span class="sqts-jersey__dot" style="background:${positionColorFor(area)}"></span><div class="sqts-jersey__bar"><i style="width:${player.fitness}%"></i></div>`,
    };
  }
  return {
    main: `<span class="sqts-slotcard__ovr">${player.overall}</span>`,
    status: `<span class="sqts-jersey__dot sqts-jersey__dot--${fitnessBand(player)}"></span><div class="sqts-jersey__bar"><i style="width:${player.fitness}%"></i></div>`,
  };
}

function slotCard(state, ts, zone, index, player) {
  const cls = ringClass(ts, zone, index);
  const swap = showSwapIcon(ts, zone, index) ? SWAP_ICON : "";
  const info = positionInfo(player.position);
  const { main, status } = slotCardMain(ts, player);
  return (
    `<div class="sqts-slotcard${cls}" data-zone="${zone}" data-index="${index}">` +
      `<div class="sqts-slotcard__top">` +
        `<span class="sqts-slotcard__portrait">${player.kitNumber != null ? player.kitNumber : ""}</span>` +
        `<span class="sqts-slotcard__pos">${posDot(info.area)}${player.position}</span>` +
        main +
        swap +
      `</div>` +
      `<div class="sqts-slotcard__statusrow">${status}</div>` +
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
  const isOpen = ts.drawer !== "collapsed";
  // F1-fixes: an armed bench/reserve/suggested pick shrinks the drawer back
  // to just this bar (revealing the pitch to finish the swap) without
  // forgetting which list was open — drawerBarText still reports it, and
  // clicking the bar again (or completing/cancelling the swap) re-expands
  // it. See core/store.js's teamSheetSelectPlayer/teamSheetToggleDrawer.
  const minimized = isOpen && ts.drawerMinimized;
  const arrow = (!isOpen || minimized) ? "&#9650;" : "&#9660;"; // ▲ / ▼
  const barCls = ts.drawer === "suggested" ? " sqts-drawer__bar--gold" : "";
  const bar =
    `<div class="sqts-drawer__bar${barCls}" data-action="toggle-drawer">` +
      `<span class="sqts-drawer__arrow">${arrow}</span>` +
      `<span class="sqts-drawer__label">${drawerBarText(ts.drawer)}</span>` +
      `<span class="sqts-drawer__arrow">${arrow}</span>` +
    `</div>`;

  if (!isOpen || minimized) return `<div class="sqts-drawer">${bar}</div>`;

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

// F1-fixes: was "F. Lastname" (abbreviated); every reference pic's right
// panel actually spells out the full name — ui/playerbio.js's own bio-sub
// line uses the same `firstName lastName` join.
function playerNameFor(player) {
  return `${player.firstName} ${player.lastName}`;
}

// Same one-liner every other ui/*.js module defines locally rather than
// importing (render.js/gtnui.js/youthui.js/transfersui.js all repeat this
// exact function) — css/flags.css keys off `data-flag="<nationId>"` directly,
// no nation-object lookup needed.
function flagSpan(nationId) {
  return `<span class="flag" data-flag="${nationId}"></span>`;
}

function miniHeader(player, colorClass, kitNumber) {
  const info = positionInfo(player.position);
  return (
    `<div class="sqts-panelhead ${colorClass}">` +
      `<div class="fx-attrpanel__portrait"><span class="fx-attrpanel__kitnum">${kitNumber != null ? kitNumber : ""}</span></div>` +
      `<div>` +
        `<div>${posDot(info.area)} ${player.position} <span class="fx-attrpanel__ovr">${player.overall}</span></div>` +
        `<div class="sqts-panelhead__name">${flagSpan(player.nationId)} ${playerNameFor(player)}</div>` +
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
  // F1-fixes: was a bare (RS) glyph pill next to the dots — replaced with
  // left/right chevron buttons flanking the dots, the same "cnav prev ·
  // dots · cnav next" shape js/carousel.js's main-menu tile carousels use
  // (core/router.js wires the two new data-actions to teamSheetChangeAttrPage).
  const pager =
    `<div class="fx-attrpanel__pagedots sqts-pagernav">` +
      `<button type="button" class="cnav prev" data-action="attrpage-prev" aria-label="Previous">&lsaquo;</button>` +
      `<div class="dots">${dots}</div>` +
      `<button type="button" class="cnav next" data-action="attrpage-next" aria-label="Next">&rsaquo;</button>` +
    `</div>`;

  return (
    header +
    `<div class="fx-panel__title sqts-pagetitle">${page.title}</div>` +
    `<div class="sqts-panelbody">${body}</div>` +
    pager
  );
}

/** F2 (ui/formationsui.js): the same single-player §B4 attribute panel as
 * above, without SQUAD tab's compare-mode/arm wiring — reused by Formations
 * > Edit > Instructions' plain-browsing state and > Positioning (both pics
 * show this exact component). `pageIndex` is the caller's own page cursor
 * (formations tab reuses ts.attrPage, same field the SQUAD tab uses — see
 * core/store.js's teamSheetChangeAttrPage). */
export function renderPlayerAttrPanel(state, player, pageIndex) {
  const pages = attrPageDefs(player);
  const idx = Math.min(pageIndex, pages.length - 1);
  const page = pages[idx];
  const header = miniHeader(player, "", player.kitNumber);
  const body = pageBodySingle(state, player, page);
  const dots = pages.map((p, i) => `<i class="${i === idx ? "on" : ""}"></i>`).join("");
  const pager =
    `<div class="fx-attrpanel__pagedots sqts-pagernav">` +
      `<button type="button" class="cnav prev" data-action="attrpage-prev" aria-label="Previous">&lsaquo;</button>` +
      `<div class="dots">${dots}</div>` +
      `<button type="button" class="cnav next" data-action="attrpage-next" aria-label="Next">&rsaquo;</button>` +
    `</div>`;
  return header + `<div class="fx-panel__title sqts-pagetitle">${page.title}</div>` + `<div class="sqts-panelbody">${body}</div>` + pager;
}

/* ============================== tabs + footer ============================ */

const TABS = [
  { key: "squad", label: "SQUAD" },
  { key: "formations", label: "FORMATIONS" },
  { key: "tactics", label: "TACTICS" },
  { key: "roles", label: "ROLES" },
];

// F2: FORMATIONS > EDIT[...] replaces the tab bar with a breadcrumb
// (ms_TEAM_SHEET_VIEW_FORMATIONS_CUSTOMISE_FORMATIONS*.png all show
// "FORMATIONS > EDIT[ > INSTRUCTIONS|POSITIONING]" where the tab bar
// normally sits, not the SQUAD/FORMATIONS/TACTICS/ROLES tabs themselves).
function renderTabs(state) {
  const el = document.getElementById("sqts-tabbar");
  if (!el) return;
  const ts = state.ui.teamSheet;
  if (ts.tab === "formations" && ts.customiseMode) {
    const segs = ["FORMATIONS", "EDIT"];
    if (ts.customiseMode === "instructions") segs.push("INSTRUCTIONS");
    else if (ts.customiseMode === "positioning") segs.push("POSITIONING");
    el.innerHTML = `<div class="sqts-crumb">` + segs.map((s, i) => (
      `<span class="sqts-crumb__seg${i === segs.length - 1 ? " is-cur" : ""}">${s}</span>` +
      (i < segs.length - 1 ? `<span class="sqts-crumb__sep">&rsaquo;</span>` : "")
    )).join("") + `</div>`;
    return;
  }
  el.innerHTML = TABS.map((t) => (
    `<button type="button" class="sqts-tab${t.key === ts.tab ? " is-active" : ""}" data-tab="${t.key}">${t.label}</button>`
  )).join("");
}

function renderSquadFooter(ts) {
  // F1-fixes: (A) is the global "interact with whatever's highlighted"
  // button everywhere else in this game (footer-main's static "(A) Select"
  // prompt, every other overlay's own primary action) — it must not double
  // as a day-advance shortcut here. Select Player (the highlighted slot's
  // own action) now owns the (A) glyph; the old "(A) Advance" prompt is
  // gone (Central's own Advance tile is still the one place that advances
  // the day). Every other F2 footer below applies the same correction.
  const prompts = [`<span class="prompt" data-action="select-player">${glyphPill("a")} Select Player</span>`];
  if (ts.focus.zone === "xi") prompts.push(`<span class="prompt" data-action="suggested-subs">${glyphPill("y")} Suggested Subs</span>`);
  prompts.push(`<span class="prompt" data-action="change-view">${glyphPill("ls")} Change View</span>`);
  prompts.push(`<span class="prompt" data-action="back">${glyphPill("b")} Back</span>`);
  return prompts.join("");
}

function renderFormationsFooter(ts) {
  const back = `<span class="prompt" data-action="back">${glyphPill("b")} Back</span>`;
  if (ts.customiseMode === "instructions") {
    if (ts.instrEditingIndex != null) {
      return (
        `<span class="prompt" data-action="select-player">${glyphPill("a")} Select</span>` +
        `<span class="prompt" data-action="instr-reset-all">${glyphPill("x")} Reset All Instructions</span>` +
        back
      );
    }
    return (
      `<span class="prompt" data-action="select-player">${glyphPill("a")} Select</span>` +
      `<span class="prompt" data-action="change-view">${glyphPill("ls")} Change View</span>` +
      back
    );
  }
  if (ts.customiseMode === "positioning") {
    // "(Y) Change Role" is pic-exact (ms_..._PLAYER_POSITIONING.png) but no
    // pic anywhere shows what it opens — shown for fidelity, wired as a
    // documented no-op (plan2-decisions.md F2), same footing as the
    // permanently-locked Edit Player tile.
    return (
      `<span class="prompt" data-action="select-player">${glyphPill("a")} Select</span>` +
      `<span class="prompt" data-action="pos-change-role">${glyphPill("y")} Change Role</span>` +
      `<span class="prompt" data-action="pos-reset">${glyphPill("x")} Reset Changes</span>` +
      `<span class="prompt" data-action="change-view">${glyphPill("ls")} Change View</span>` +
      back
    );
  }
  if (ts.customiseMode === "menu") {
    return `<span class="prompt" data-action="select-player">${glyphPill("a")} Select</span>` + back;
  }
  return (
    `<span class="prompt" data-action="select-player">${glyphPill("a")} Select</span>` +
    `<span class="prompt" data-action="customise-formation">${glyphPill("x")} Customise Formation</span>` +
    back
  );
}

function renderTacticsFooter() {
  return `<span class="prompt" data-action="select-player">${glyphPill("a")} Edit Tactics</span><span class="prompt" data-action="back">${glyphPill("b")} Back</span>`;
}

function renderRolesFooter(ts) {
  const back = `<span class="prompt" data-action="back">${glyphPill("b")} Back</span>`;
  if (ts.rolesPickerOpen) return `<span class="prompt" data-action="select-player">${glyphPill("a")} Select</span>` + back;
  return `<span class="prompt" data-action="select-player">${glyphPill("a")} Change Player</span>` + back;
}

function renderFooter(state) {
  const footer = document.getElementById("footer-teamsheet");
  if (!footer) return;
  const ts = state.ui.teamSheet;
  if (ts.tab === "squad") footer.innerHTML = renderSquadFooter(ts);
  else if (ts.tab === "formations") footer.innerHTML = renderFormationsFooter(ts);
  else if (ts.tab === "tactics") footer.innerHTML = renderTacticsFooter();
  else if (ts.tab === "roles") footer.innerHTML = renderRolesFooter(ts);
  else footer.innerHTML = `<span class="prompt" data-action="back">${glyphPill("b")} Back</span>`;
}

/* ============================== top-level render ========================== */

export function renderTeamSheet(state) {
  renderTabs(state);
  const body = document.getElementById("sqts-body");
  if (!body) return;
  const ts = state.ui.teamSheet;

  if (ts.tab === "squad") {
    body.innerHTML =
      `<div class="sqts-left">` +
        `<div class="sqts-pitchpanel">${renderPitchPanel(state, ts)}${renderDrawer(state, ts)}</div>` +
      `</div>` +
      `<div class="sqts-right">${renderRightPanel(state, ts)}</div>`;
  } else {
    let panes;
    if (ts.tab === "formations") panes = renderFormationsTab(state);
    else if (ts.tab === "tactics") panes = renderTacticsTab(state);
    else if (ts.tab === "roles") panes = renderRolesTab(state);
    else panes = { left: "", right: "" };
    body.innerHTML = `<div class="sqts-left">${panes.left}</div><div class="sqts-right">${panes.right}</div>`;
  }

  renderFooter(state);
}
