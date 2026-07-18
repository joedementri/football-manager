// ui/searchui.js — fable-plans/plan2.md F3: PLAYER SEARCH (filter tiles) ->
// SEARCH RESULTS (tabs/cards/report, RS-paged attribute pages) -> action-menu
// playercard, plus MY SHORTLIST. Pure render-from-state, same contract as
// every other ui/*.js module — every control calls a core/store.js method
// and re-renders off the "search"/"shortlist" events core/router.js
// subscribes to. Replaces the old M7 filter-form/list-row Search Players
// screen entirely (ms_SEARCH_PLAYERS_SCREEN*.png, ms_SEARCH_PLAYERS_SCREEN_
// SEARCH_RESULTS*.png, ms_MY_SHORTLIST_SCREEN.png).

import { money } from "../core/format.js";
import { positionInfo } from "../config/positions.js";
import { eligibleFreeAgentTargets } from "../engine/freeagents.js";
import { scoutingRangeFor } from "../config/scouting.js";
import { fuzzyDisplay } from "./gtnui.js";
import { cmToFtIn } from "./playerbio.js";
import { SUMMARY_GROUPS } from "../config/summary.js";
import { scoutReportStatus, cheapestIdleScout } from "../engine/gtn.js";
import {
  attrChip, posBar, glyphPill, actionPrompt, fxActionList, fxTable,
} from "./panelkit.js";

/* ============================================================================
 * Shared pure helpers
 * ========================================================================== */

function isFreeAgentCandidate(state, player) {
  return player.contract.endYear === state.seasonStartYear + 1 && player.contract.preAgreedClubId == null;
}

/** World-wide search pool, filtered by every PLAYER SEARCH tile. Sorted by
 * true overall descending (no pic evidences a different default sort). */
export function computeSearchResults(state) {
  const f = state.ui.transferSearch.filters;
  let pool = state.players.filter((p) => p.clubId !== state.club.id);

  if (f.name.trim()) {
    const q = f.name.trim().toLowerCase();
    pool = pool.filter((p) => p.commonName.toLowerCase().includes(q) || `${p.firstName} ${p.lastName}`.toLowerCase().includes(q));
  }
  if (f.area !== "ALL") pool = pool.filter((p) => positionInfo(p.position).area === f.area);
  if (f.role !== "ANY") pool = pool.filter((p) => p.position === f.role);
  if (f.nationId) pool = pool.filter((p) => p.nationId === f.nationId);
  if (f.status === "LISTED") pool = pool.filter((p) => state.transfers.listings.get(p.id)?.type === "transfer");
  else if (f.status === "LOAN") pool = pool.filter((p) => state.transfers.listings.get(p.id)?.type === "loan");
  else if (f.status === "EXPIRING") pool = pool.filter((p) => p.contract.endYear <= state.seasonStartYear + 1);
  else if (f.status === "FREE") { const set = new Set(eligibleFreeAgentTargets(state).map((p) => p.id)); pool = pool.filter((p) => set.has(p.id)); }
  if (f.minAge) pool = pool.filter((p) => p.age >= f.minAge);
  if (f.maxAge) pool = pool.filter((p) => p.age <= f.maxAge);
  if (f.country) pool = pool.filter((p) => state.staticData.leagues.find((l) => l.id === state.clubLeague.get(p.clubId))?.country === f.country);
  if (f.leagueId) pool = pool.filter((p) => state.clubLeague.get(p.clubId) === f.leagueId);
  if (f.teamId) pool = pool.filter((p) => p.clubId === f.teamId);

  return pool.slice().sort((a, b) => b.overall - a.overall).slice(0, 300);
}

/** Action menu rows shared by Search Results and My Shortlist (plan2.md
 * F3.7: "A opens the same action menu as search results"). */
export function buildActionRows(state, player, selectedAction) {
  const shortlisted = state.transfers.shortlist.some((s) => s.playerId === player.id);
  const idleScout = cheapestIdleScout(state);
  const isFreeAgent = isFreeAgentCandidate(state, player);
  const rows = [
    idleScout
      ? { label: `Ask ${idleScout.commonName} to Scout ${player.commonName}`, action: "ask-scout" }
      : { label: `Ask a Scout to Scout ${player.commonName}`, action: "ask-scout", disabled: true, why: "No Scouts Available" },
    { label: shortlisted ? "Remove from My Shortlist" : "Add to My Shortlist", action: "toggle-shortlist" },
    { label: `Enquire about ${player.commonName}`, action: "enquire" },
  ];
  if (isFreeAgent) {
    rows.push({ label: "Sign Free Agent", action: "sign-free-agent" });
  } else {
    const club = state.clubsById.get(player.clubId);
    rows.push({ label: `Approach ${club.name} to Buy`, action: "approach-buy" });
    rows.push({ label: `Approach ${club.name} to Loan`, action: "approach-loan" });
  }
  return fxActionList(rows, rows[selectedAction] ? rows[selectedAction].action : null);
}

/* ============================================================================
 * §B4-ish attribute rows, with F3's own fuzzy-per-attribute reading (see
 * plan2-decisions.md F3: no per-attribute scouting range exists anywhere in
 * this codebase — only overall/potential are fuzzed — so an unscouted
 * player's individual attribute chips reuse the exact same scoutingRangeFor
 * half-width band the overall/potential numbers already use, computed live
 * rather than stored).
 * ========================================================================== */

function attrValueHtml(player, key) {
  const level = player.scouting.level;
  if (level >= 3) return attrChip(player.attrs[key]);
  const [lo, hi] = scoutingRangeFor(player.attrs[key], level);
  return `<span class="fx-fuzzy"><span class="fx-attr-chip fx-attr-chip--min">${lo}</span><span class="fx-fuzzy__sep">&ndash;</span><span class="fx-attr-chip fx-attr-chip--max">${hi}</span></span>`;
}

function twoColAttrRows(player, pairs) {
  return pairs.map(([[k1, l1], right]) => (
    `<div class="sx-attrgrid__row">` +
      `<span class="sx-attrgrid__name">${l1}</span>${attrValueHtml(player, k1)}` +
      (right ? `<span class="sx-attrgrid__name">${right[1]}</span>${attrValueHtml(player, right[0])}` : `<span></span><span></span>`) +
    `</div>`
  )).join("");
}

// Verbatim from ms_SEARCH_PLAYERS_SCREEN_SEARCH_RESULTS_PLAYER_PAGE_2/3.png —
// deliberately NOT reused from ui/teamsheetui.js's own PHYSICAL_ATTRS/
// SKILL_ATTRS: that screen's pic uses "Long Pass"/"Short Pass"/"Slide
// Tackle"/"Att. Position" while THIS screen's pic uses "Long Passing"/
// "Short Passing"/"Sliding Tackle"/"Attack Position" for the exact same
// underlying fields — two different FIFA 15 screens, two different label
// strings for the same data, both pic-sourced (plan2-decisions.md F3).
const PHYSICAL_PAGE = [
  [["acceleration", "Acceleration"], ["sprintSpeed", "Sprint Speed"]],
  [["agility", "Agility"], ["balance", "Balance"]],
  [["jumping", "Jumping"], ["stamina", "Stamina"]],
  [["strength", "Strength"], ["reactions", "Reactions"]],
];
const MENTAL_PAGE = [
  [["aggression", "Aggression"], ["interceptions", "Interceptions"]],
  [["positioning", "Attack Position"], ["vision", "Vision"]],
];
const TECHNICAL_PAGE = [
  [["ballControl", "Ball Control"], ["crossing", "Crossing"]],
  [["dribbling", "Dribbling"], ["finishing", "Finishing"]],
  [["fkAccuracy", "FK Acc."], ["headingAcc", "Heading Acc."]],
  [["longPass", "Long Passing"], ["shortPass", "Short Passing"]],
  [["marking", "Marking"], ["shotPower", "Shot Power"]],
  [["longShots", "Long Shots"], ["standTackle", "Stand Tackle"]],
  [["slideTackle", "Sliding Tackle"], ["volleys", "Volleys"]],
  [["curve", "Curve"], ["penalties", "Penalties"]],
];

function reportHeaderHtml(state, player) {
  const club = state.clubsById.get(player.clubId);
  return (
    `<div class="sx-rephead">` +
      `<span class="avatar sx-rephead__portrait"></span>` +
      `<div class="sx-rephead__mid">` +
        `<div class="sx-rephead__name">${player.firstName}<br><b>${player.lastName}</b></div>` +
        `<div class="sx-rephead__age">${player.age} ${posBar(positionInfo(player.position).area)}${player.position}</div>` +
      `</div>` +
      `<div class="sx-rephead__club">` +
        `<div class="sx-rephead__clubrow"><span>${club.name.toUpperCase()}</span><svg class="crest crest--sm"><use href="#crest-${club.id}"></use></svg></div>` +
        `<span class="flag" data-flag="${player.nationId}"></span>` +
      `</div>` +
      `<div class="sx-rephead__facts"><span>Height: <b>${cmToFtIn(player.heightCm)}</b></span><span>Preferred Foot: <b>${player.foot}</b></span></div>` +
    `</div>`
  );
}

function summaryPageHtml(state, player) {
  const level = player.scouting.level;
  const status = scoutReportStatus(state, player);
  const enquiry = state.transfers.enquiries.get(player.id);
  const statusIcon = status.kind === "complete" ? "&#10003;" : status.kind === "scouting" ? "&#128269;" : "!";
  let statusLine = status.line;
  if (enquiry) {
    statusLine = enquiry.refused ? `${player.commonName} is not for sale.` : `Estimated fee: ${money(enquiry.lo)} - ${money(enquiry.hi)}.`;
  }
  const summaryRows = SUMMARY_GROUPS.map((g) => {
    const sum = g.attrs.reduce((s, k) => s + player.attrs[k], 0);
    const mean = sum / g.attrs.length;
    if (level >= 3) return { label: g.label, html: attrChip(Math.round(mean)) };
    const [lo] = scoutingRangeFor(Math.round(mean), level);
    const [, hi] = scoutingRangeFor(Math.round(mean), level);
    return { label: g.label, html: `<span class="fx-fuzzy"><span class="fx-attr-chip fx-attr-chip--min">${lo}</span><span class="fx-fuzzy__sep">&ndash;</span><span class="fx-attr-chip fx-attr-chip--max">${hi}</span></span>` };
  });
  return (
    reportHeaderHtml(state, player) +
    `<div class="sx-repbody">` +
      `<div class="sx-repstatus">` +
        `<div class="sx-repstatus__head"><span class="sx-repstatus__icon is-${status.kind}">${statusIcon}</span>Report Status</div>` +
        `<div class="sx-repstatus__line">${statusLine}</div>` +
      `</div>` +
      `<div class="sx-repsummary">` +
        `<div class="sx-repsummary__head">Summary</div>` +
        summaryRows.map((r) => `<div class="sx-attr-row"><span class="sx-attr-row__name">${r.label}</span>${r.html}</div>`).join("") +
      `</div>` +
    `</div>`
  );
}

function attrPageHtml(state, player, title, rows, extraTitle, extraRows) {
  return (
    reportHeaderHtml(state, player) +
    `<div class="sx-attrgrid">` +
      (extraTitle ? `<div class="sx-attrgrid__title">${title}</div>` : "") +
      twoColAttrRows(player, rows) +
      (extraTitle ? `<div class="sx-attrgrid__title">${extraTitle}</div>${twoColAttrRows(player, extraRows)}` : "") +
    `</div>`
  );
}

const REPORT_PAGE_COUNT = 3;
function reportPageHtml(state, player, page) {
  if (page === 0) return summaryPageHtml(state, player);
  if (page === 1) return attrPageHtml(state, player, "Physical:", PHYSICAL_PAGE, "Mental:", MENTAL_PAGE);
  return attrPageHtml(state, player, "Technical:", TECHNICAL_PAGE);
}

function reportPagerHtml(pageIndex) {
  const dots = Array.from({ length: REPORT_PAGE_COUNT }, (_, i) => `<i class="${i === pageIndex ? "on" : ""}"></i>`).join("");
  return `<div class="sx-report__pager"><button type="button" class="cnav prev" data-action="report-prev">&lsaquo;</button><span class="dots">${dots}</span><button type="button" class="cnav next" data-action="report-next">&rsaquo;</button></div>`;
}

/* ============================================================================
 * PLAYER SEARCH — filter tiles (ms_SEARCH_PLAYERS_SCREEN(.._EXAMPLE).png)
 * ========================================================================== */

function nationName(state, id) {
  return id ? (state.staticData.nations.find((n) => n.id === id)?.name || id) : "Any";
}
function statusLabel(status) {
  return { ANY: "Any", LISTED: "Transfer Listed", LOAN: "Loan Listed", EXPIRING: "Contract Expiring", FREE: "Free Agents" }[status];
}

function tileHtml({ tile, sub, focused, subFocused, label, valueHtml, iconHtml, disabled }) {
  const cls = `sx-tile__row${focused && (sub == null || subFocused) ? " is-focus" : ""}`;
  return (
    `<div class="${cls}${disabled ? " is-disabled" : ""}" data-action="filter-activate" data-tile="${tile}" ${sub != null ? `data-sub="${sub}"` : ""}>` +
      `<div class="sx-tile__label">${label}</div>` +
      (iconHtml || "") +
      `<div class="sx-tile__val">${valueHtml}</div>` +
    `</div>`
  );
}

function renderFilters(state) {
  const s = state.ui.transferSearch;
  const f = s.filters;
  const t = s.filterTile;
  const sub = s.filterSub;

  const nameTile = s.nameEditing
    ? `<div class="sx-tile sx-tile--name is-focus is-editing" data-tile="0">` +
        `<div class="sx-tile__label">PLAYER NAME</div>` +
        `<div class="sx-tile__portrait"></div>` +
        `<input type="text" class="sx-nameinput" id="sx-nameinput" value="${f.name.replace(/"/g, "&quot;")}" placeholder="Any" maxlength="40">` +
      `</div>`
    : `<div class="sx-tile sx-tile--name${t === 0 ? " is-focus" : ""}" data-action="filter-activate" data-tile="0">` +
        `<div class="sx-tile__label">PLAYER NAME</div>` +
        `<div class="sx-tile__portrait"></div>` +
        `<div class="sx-tile__val">${f.name || "Any"}</div>` +
      `</div>`;

  const posRoleTile =
    `<div class="sx-tile sx-tile--dual" data-tile="1">` +
      tileHtml({ tile: 1, sub: 0, focused: t === 1, subFocused: sub === 0, label: "POSITION", valueHtml: f.area === "ALL" ? "Any" : f.area }) +
      tileHtml({ tile: 1, sub: 1, focused: t === 1, subFocused: sub === 1, label: "ROLE", valueHtml: f.role === "ANY" ? "Any" : f.role }) +
    `</div>`;

  const natTile =
    `<div class="sx-tile${t === 2 ? " is-focus" : ""}" data-action="filter-activate" data-tile="2">` +
      `<div class="sx-tile__label">NATIONALITY</div>` +
      (f.nationId ? `<span class="flag sx-tile__flag" data-flag="${f.nationId}"></span>` : `<div class="sx-tile__flagicon">&#9873;</div>`) +
      `<div class="sx-tile__val">${nationName(state, f.nationId)}</div>` +
    `</div>`;

  const statusTile =
    `<div class="sx-tile${t === 3 ? " is-focus" : ""}" data-action="filter-activate" data-tile="3">` +
      `<div class="sx-tile__label">TRANSFER STATUS</div>` +
      `<div class="sx-tile__val">${statusLabel(f.status)}</div>` +
    `</div>`;

  const ageTile =
    `<div class="sx-tile sx-tile--dual" data-tile="4">` +
      tileHtml({ tile: 4, sub: 0, focused: t === 4, subFocused: sub === 0, label: "MIN AGE", valueHtml: f.minAge || "Any" }) +
      tileHtml({ tile: 4, sub: 1, focused: t === 4, subFocused: sub === 1, label: "MAX AGE", valueHtml: f.maxAge || "Any" }) +
    `</div>`;

  const countryTile =
    `<div class="sx-tile${t === 5 ? " is-focus" : ""}" data-action="filter-activate" data-tile="5">` +
      `<div class="sx-tile__label">COUNTRY</div><div class="sx-tile__val">${f.country || "Any"}</div>` +
    `</div>`;

  const league = f.leagueId ? state.staticData.leagues.find((l) => l.id === f.leagueId) : null;
  const leagueTile =
    `<div class="sx-tile${t === 6 ? " is-focus" : ""}" data-action="filter-activate" data-tile="6">` +
      `<div class="sx-tile__label">LEAGUE</div><div class="sx-tile__val">${league ? league.name : "Any"}</div>` +
    `</div>`;

  const teamDisabled = !f.leagueId;
  const team = f.teamId ? state.clubsById.get(f.teamId) : null;
  const teamTile =
    `<div class="sx-tile${t === 7 ? " is-focus" : ""}${teamDisabled ? " is-disabled" : ""}" data-action="filter-activate" data-tile="7">` +
      `<div class="sx-tile__label">TEAM</div><div class="sx-tile__val">${team ? team.name : "Any"}</div>` +
    `</div>`;

  return (
    `<div class="sx-crumb"><span class="crumb-prev">TRANSFERS</span><span class="crumb-sep">&rsaquo;</span><span class="crumb-cur">PLAYER SEARCH</span></div>` +
    `<div class="sx-filtergrid">${nameTile}${posRoleTile}${natTile}${statusTile}${ageTile}${countryTile}${leagueTile}${teamTile}</div>`
  );
}

function filtersFooterHtml() {
  return (
    actionPrompt("b", "back", "Back") +
    actionPrompt("x", "reset", "Reset") +
    actionPrompt("y", "search", "Search For Players") +
    actionPrompt("a", "filter-select", "Select")
  );
}

/* ============================================================================
 * SEARCH RESULTS (ms_SEARCH_PLAYERS_SCREEN_SEARCH_RESULTS*.png)
 * ========================================================================== */

const TABS = ["ALL", "ATT", "MID", "DEF", "GK"];

function cardHtml(state, player, selected) {
  const club = state.clubsById.get(player.clubId);
  const area = positionInfo(player.position).area;
  return (
    `<div class="sx-card${selected ? " is-sel" : ""}" data-action="select-result" data-player="${player.id}">` +
      (selected ? glyphPill("x") : "") +
      `<span class="avatar sx-card__portrait"></span>` +
      `<div class="sx-card__meta">` +
        `<div class="sx-card__name">${player.firstName}<br><b>${player.lastName}</b></div>` +
        `<div class="sx-card__pos">${posBar(area)}${player.position}</div>` +
      `</div>` +
      `<svg class="crest crest--sm sx-card__crest"><use href="#crest-${club.id}"></use></svg>` +
      `<div class="sx-card__age">AGE: ${player.age}</div>` +
    `</div>`
  );
}

function renderResults(state) {
  const s = state.ui.transferSearch;
  let results = computeSearchResults(state);
  if (s.resultsTab !== "ALL") results = results.filter((p) => positionInfo(p.position).area === s.resultsTab);

  const tabsHtml = TABS.map((t) => `<button type="button" class="sx-tab${s.resultsTab === t ? " is-active" : ""}" data-action="tab" data-tab="${t}">${t}</button>`).join("");

  const cardsHtml = results.length
    ? results.map((p) => cardHtml(state, p, p.id === s.selectedPlayerId)).join("")
    : `<div class="empty"><span class="lbl">No players match these filters</span></div>`;

  const selected = s.selectedPlayerId != null ? state.playersById.get(s.selectedPlayerId) : null;
  const reportHtml = selected
    ? `<div class="sx-report__body">${reportPageHtml(state, selected, s.reportPage)}</div>${reportPagerHtml(s.reportPage)}`
    : `<div class="empty"><span class="lbl">Select a player to view their Search Report</span></div>`;

  const actionMenuHtml = s.actionMenuOpen && selected
    ? `<div class="sx-actionmenu" data-player="${selected.id}">${reportHeaderHtml(state, selected)}${buildActionRows(state, selected, s.actionMenuIndex)}</div>`
    : "";

  return (
    `<div class="sx-crumb"><span class="crumb-prev">SEARCH RESULTS</span><span class="crumb-sep">&rsaquo;</span><span class="crumb-cur">Search Report</span></div>` +
    `<div class="sx-restabs">${tabsHtml}</div>` +
    `<div class="sx-resbody">` +
      `<div class="sx-rescards">` +
        `<div class="sx-rescards__title">SEARCH RESULTS</div>` +
        `<div class="sx-rescards__grid">${cardsHtml}</div>` +
        actionMenuHtml +
      `</div>` +
      `<div class="sx-report">${reportHtml}</div>` +
    `</div>`
  );
}

function resultsFooterHtml(state) {
  const s = state.ui.transferSearch;
  if (s.actionMenuOpen) return actionPrompt("b", "back", "Back");
  return actionPrompt("b", "back", "Back") + (s.selectedPlayerId != null ? actionPrompt("y", "report-next", "Change View") : "");
}

/* ============================================================================
 * Top-level dispatcher
 * ========================================================================== */

export function renderSearch(state) {
  const body = document.getElementById("search-body");
  const footer = document.getElementById("footer-search");
  const s = state.ui.transferSearch;
  body.innerHTML = s.stage === "filters" ? renderFilters(state) : renderResults(state);
  footer.innerHTML = s.stage === "filters" ? filtersFooterHtml() : resultsFooterHtml(state);
  if (s.stage === "filters" && s.nameEditing) {
    const input = document.getElementById("sx-nameinput");
    if (input) { input.focus(); input.selectionStart = input.selectionEnd = input.value.length; }
  }
}

/* ============================================================================
 * MY SHORTLIST (ms_MY_SHORTLIST_SCREEN.png) — paper dossier
 * ========================================================================== */

function shortlistTableHtml(state, list, selectedId) {
  const rows = list.map(({ playerId }) => {
    const p = state.playersById.get(playerId);
    return { id: p.id, pos: p.position, area: positionInfo(p.position).area, name: p.commonName };
  });
  const sorted = rows.sort((a, b) => (state.ui.shortlist.sortDir === "asc" ? a.pos.localeCompare(b.pos) : b.pos.localeCompare(a.pos)));
  return fxTable({
    columns: [{ key: "pos", label: "Pos", sortable: true }, { key: "name", label: "Name" }],
    rows: sorted,
    sortKey: "pos",
    sortDir: state.ui.shortlist.sortDir,
    rowClass: (row) => (row.id === selectedId ? "is-sel" : ""),
    cellHtml: (col, row) => (col.key === "pos" ? `${posBar(row.area)}${row.pos}` : row.name),
  });
}

function shortlistPlayerCardHtml(state, player) {
  const club = state.clubsById.get(player.clubId);
  return (
    `<div class="fx-paper__playercard">` +
      `<svg class="crest crest--sm"><use href="#crest-${club.id}"></use></svg>` +
      `<div class="fx-paper__pcname">${player.commonName}</div>` +
      `<div class="fx-paper__pcclub">${club.name}</div>` +
      `<div class="fx-paper__pcgrid">` +
        `<div><span class="k">OVR</span><span class="v">${player.overall}</span></div>` +
        `<div><span class="k">POS</span><span class="v">${player.position}</span></div>` +
        `<div><span class="k">AGE</span><span class="v">${player.age}</span></div>` +
      `</div>` +
      `<div class="fx-paper__pcrow"><span class="k">VALUE</span><span class="v">${money(player.value)}</span></div>` +
      `<div class="fx-paper__pcrow fx-paper__pcrow--gold"><span class="k">FORM</span><span class="v">${formWord(player.form)}</span></div>` +
      `<div class="fx-paper__pcrow fx-paper__pcrow--gold"><span class="k">MORALE</span><span class="v">${moraleWord(player.morale)}</span></div>` +
    `</div>`
  );
}

// [TUNED] word bands for player.form (1-10)/morale (1-10) — no INI string
// table exists for either (moralesettings.ini's real 5-level VERY_HIGH..
// VERY_LOW band names are F6's own engine/morale.js to build; this project's
// player.morale is still the plan1 M2 placeholder 1-10 number). "Content" is
// pic-verified (ms_APPROACH_TRANSFER_OFFER_SCREEN.png's Messi card); the
// others are authored to fill out a plausible 4-word band either side of it.
// Exported for reuse by ui/transfersui.js's Approach Offer / Contract
// Negotiation panels (plan2-decisions.md F3).
export function formWord(form) {
  if (form >= 8) return "Great";
  if (form >= 6) return "Okay";
  if (form >= 4) return "Below Par";
  return "Poor";
}
export function moraleWord(morale) {
  if (morale >= 8) return "Happy";
  if (morale >= 5) return "Content";
  if (morale >= 3) return "Unhappy";
  return "Angry";
}

function shortlistAttrSheetHtml(player) {
  const group = (title, pairs) => `<div class="sx-attrgrid__title">${title}</div>${twoColAttrRows(player, pairs)}`;
  const isGk = positionInfo(player.position).area === "GK";
  return (
    `<div class="sx-attrgrid sx-attrgrid--paper">` +
      group("Physical:", PHYSICAL_PAGE) +
      group("Mental:", MENTAL_PAGE) +
      group("Technical:", TECHNICAL_PAGE) +
      group("Goalkeeping:", [
        [["gkDiving", "GK Diving"], ["gkHandling", "GK Handling"]],
        [["gkKicking", "GK Kicking"], ["gkReflexes", "GK Reflexes"]],
        [["gkPositioning", "GK Positioning"], null],
      ]) +
    `</div>`
  );
}

export function renderMyShortlist(state) {
  const body = document.getElementById("shortlist-body");
  const footer = document.getElementById("footer-shortlist");
  const st = state.ui.shortlist;
  const list = state.transfers.shortlist;
  // Defensive fallback: this renders on every "shortlist" emit regardless of
  // whether the My Shortlist overlay is the one currently open (Search
  // Results' own action menu emits it too, see store.toggleShortlistPlayer's
  // own header) — a selectedPlayerId that's stale/null while list is
  // non-empty falls back to the first entry rather than rendering a null-
  // player card.
  const selectedId = st.selectedPlayerId != null && list.some((s) => s.playerId === st.selectedPlayerId)
    ? st.selectedPlayerId : (list.length ? list[0].playerId : null);
  const selected = selectedId != null ? state.playersById.get(selectedId) : null;

  const leftHtml = list.length
    ? shortlistPlayerCardHtml(state, selected) + shortlistTableHtml(state, list, selectedId)
    : `<div class="fx-paper__title sx-shortlist__title">My Shortlist</div><div class="empty"><span class="lbl">No players shortlisted</span></div>`;

  const actionMenuHtml = st.actionMenuOpen && selected
    ? `<div class="sx-actionmenu sx-actionmenu--paper" data-player="${selected.id}">${buildActionRows(state, selected, st.actionMenuIndex)}</div>`
    : "";

  body.innerHTML =
    `<div class="fx-paper sx-shortlist">` +
      (list.length ? `<div class="fx-paper__title sx-shortlist__title">My Shortlist</div>` : "") +
      `<div class="sx-shortlist__cols">` +
        `<div class="sx-shortlist__left">${leftHtml}${actionMenuHtml}</div>` +
        `<div class="sx-shortlist__right">${selected ? shortlistAttrSheetHtml(selected) : ""}</div>` +
      `</div>` +
    `</div>`;

  footer.innerHTML = st.actionMenuOpen
    ? actionPrompt("b", "back", "Back")
    : actionPrompt("x", "sort", "Sort") + actionPrompt("b", "back", "Back") + (list.length ? actionPrompt("rs", "player-bio", "Player Bio") : "");
}
