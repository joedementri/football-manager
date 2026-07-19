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
import { scoutedRange, isFullyScouted, scoutProgressInfo } from "../engine/scoutrange.js";
import { cmToFtIn } from "./playerbio.js";
import { SUMMARY_GROUPS } from "../config/summary.js";
import { scoutReportStatus, cheapestIdleScout } from "../engine/gtn.js";
import { GK_ATTRS } from "./teamsheetui.js";
import {
  attrChip, posBar, actionPrompt, fxActionList, fxTable, fxPanel, fuzzyChip,
} from "./panelkit.js";
import { fullName, lastNameSort } from "../core/sortutil.js";

/* ============================================================================
 * Shared pure helpers
 * ========================================================================== */

function isFreeAgentCandidate(state, player) {
  return player.contract.endYear === state.seasonStartYear + 1 && player.contract.preAgreedClubId == null;
}

/** World-wide search pool, filtered by every PLAYER SEARCH tile. Sorted by
 * last name (F3-fixes: sorting by the true, possibly-unscouted Overall would
 * leak hidden info — name order doesn't). */
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

  return pool.slice().sort(lastNameSort).slice(0, 300);
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
 * §B4-ish attribute rows, with F3's own fuzzy-per-attribute reading — an
 * unscouted player's individual attribute chips reuse the exact same
 * continuous day-by-day range engine/scoutrange.js computes for Overall/
 * Potential, computed live rather than stored (F3-fixes).
 * ========================================================================== */

function attrValueHtml(state, player, key) {
  if (isFullyScouted(player)) return attrChip(player.attrs[key]);
  const [lo, hi] = scoutedRange(state, player, key, player.attrs[key]);
  return fuzzyChip(lo, hi);
}

function twoColAttrRows(state, player, pairs) {
  return pairs.map(([[k1, l1], right]) => (
    `<div class="sx-attrgrid__row">` +
      `<span class="sx-attrgrid__name">${l1}</span>${attrValueHtml(state, player, k1)}` +
      (right ? `<span class="sx-attrgrid__name">${right[1]}</span>${attrValueHtml(state, player, right[0])}` : `<span></span><span></span>`) +
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
// F3-fixes: GK Attributes page (owner: "make sure GK's are showing relevant
// stats similar to how we set it up in the squad page") — same field/label
// pairs as ui/teamsheetui.js's own GK page (imported GK_ATTRS), just paired
// into twoColAttrRows' 2-column row shape.
const GK_PAGE = [[GK_ATTRS[0], GK_ATTRS[1]], [GK_ATTRS[2], GK_ATTRS[3]], [GK_ATTRS[4], null]];

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
        `<span class="flag sx-rephead__flag" data-flag="${player.nationId}"></span>` +
      `</div>` +
      `<div class="sx-rephead__facts"><span>Height: <b>${cmToFtIn(player.heightCm)}</b></span><span>Preferred Foot: <b>${player.foot}</b></span></div>` +
    `</div>`
  );
}

/** Page 1's left-half "Report Status" box — existing icon+sentence, plus
 * (F3-fixes) a day-count progress bar whenever a scout is directly assigned
 * (engine/scoutrange.js's scoutProgressInfo — null for a never-assigned or
 * already-complete player, which just falls back to the sentence alone). */
function scoutProgressHtml(state, player) {
  const status = scoutReportStatus(state, player);
  const statusIcon = status.kind === "complete" ? "&#10003;" : status.kind === "scouting" ? "&#128269;" : "!";
  const enquiry = state.transfers.enquiries.get(player.id);
  let statusLine = status.line;
  if (enquiry && enquiry.resolved !== false) {
    statusLine = enquiry.refused ? `${player.commonName} is not for sale.` : `Estimated fee: ${money(enquiry.lo)} - ${money(enquiry.hi)}.`;
  } else if (enquiry) {
    statusLine = `Awaiting a response to your enquiry about ${player.commonName}.`;
  }
  const progress = scoutProgressInfo(state, player);
  const progressHtml = progress
    ? `<div class="sx-repstatus__bar"><i style="width:${progress.pct}%"></i></div>` +
      `<div class="sx-repstatus__days">${progress.scoutName ? `${progress.scoutName} — ` : ""}${progress.elapsedDays} of ${progress.totalDays} days</div>`
    : "";
  return (
    `<div class="sx-repstatus">` +
      `<div class="sx-repstatus__head"><span class="sx-repstatus__icon is-${status.kind}">${statusIcon}</span>Report Status</div>` +
      `<div class="sx-repstatus__line">${statusLine}</div>` +
      progressHtml +
    `</div>`
  );
}

/** Page 1 (Summary): scouting progress on the left half, the 6 SUMMARY_GROUPS
 * category averages on the right half (F3-fixes owner ask), each shown as a
 * fuzzy range until the report is complete. */
function summaryPageHtml(state, player) {
  const scouted = isFullyScouted(player);
  const summaryRows = SUMMARY_GROUPS.map((g) => {
    const mean = Math.round(g.attrs.reduce((s, k) => s + player.attrs[k], 0) / g.attrs.length);
    const html = scouted ? attrChip(mean) : fuzzyChip(...scoutedRange(state, player, `summary:${g.key}`, mean));
    return { label: g.label, html };
  });
  return (
    reportHeaderHtml(state, player) +
    `<div class="sx-repbody">` +
      `<div class="sx-repbody__left">${scoutProgressHtml(state, player)}</div>` +
      `<div class="sx-repbody__right sx-repsummary">` +
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
      twoColAttrRows(state, player, rows) +
      (extraTitle ? `<div class="sx-attrgrid__title">${extraTitle}</div>${twoColAttrRows(state, player, extraRows)}` : "") +
    `</div>`
  );
}

/** Page order: Summary, [GK Attributes if a keeper], Physical+Mental,
 * Technical (F3-fixes: GK page inserted the same way ui/teamsheetui.js's own
 * attrPageDefs prepends one for the Squad screen). Exported so
 * core/router.js's prev/next paging knows how many pages this player has —
 * it varies (GK vs outfield), unlike the old fixed REPORT_PAGE_COUNT. */
function reportPageDefs(player) {
  const isGk = positionInfo(player.position).area === "GK";
  const pages = ["summary"];
  if (isGk) pages.push("gk");
  pages.push("physical-mental", "technical");
  return pages;
}
export function reportPageCount(player) {
  return reportPageDefs(player).length;
}

function reportPageHtml(state, player, page) {
  const pages = reportPageDefs(player);
  const kind = pages[page] ?? pages[0];
  if (kind === "summary") return summaryPageHtml(state, player);
  if (kind === "gk") return attrPageHtml(state, player, "Goalkeeping:", GK_PAGE);
  if (kind === "physical-mental") return attrPageHtml(state, player, "Physical:", PHYSICAL_PAGE, "Mental:", MENTAL_PAGE);
  return attrPageHtml(state, player, "Technical:", TECHNICAL_PAGE);
}

function reportPagerHtml(pageIndex, pageCount) {
  const dots = Array.from({ length: pageCount }, (_, i) => `<i class="${i === pageIndex ? "on" : ""}"></i>`).join("");
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

/** LEAGUE's `country` field is a display string ("England"); NATIONALITY's
 * flag sprite (css/flags.css) is keyed by data/nations.json's own `id`
 * ("england") — every league country in data/leagues.json matches a
 * nations.json `name` 1:1 (F3-fixes ledger), so this just looks that up. */
function nationIdForCountry(state, countryName) {
  if (!countryName) return null;
  const nation = state.staticData.nations.find((n) => n.name === countryName);
  return nation ? nation.id : null;
}

// F3-fixes: PLAYER SEARCH's own icon set — none of these are pic-sourced
// (ms_SEARCH_PLAYERS_SCREEN.png only shows the flag-on-a-pole placeholder
// for NATIONALITY/COUNTRY and the ball-in-shield placeholder for LEAGUE/
// TEAM; TRANSFER STATUS has no icon in any reference pic at all) — owner
// asked for a small SVG per status option directly, a deliberate addition
// beyond pic fidelity (plan2-decisions.md F3-fixes). All monochrome,
// currentColor-stroked so they pick up the tile's normal/focused text colour
// automatically, same trick as posBar/posDot in panelkit.js.
const FLAG_PLACEHOLDER_ICON = (
  `<svg class="sx-tile__icon" viewBox="0 0 32 28" fill="none" stroke="currentColor" stroke-width="1.5">` +
    `<path d="M9 26V2"/>` +
    `<path d="M9 4c4-2 7 2 11 0 1.5-.7 3-.2 3 .8v9c0 1-1.5 1.5-3 .8-4-2-7-2-11 0z"/>` +
    `<g fill="currentColor" stroke="none"><circle cx="3" cy="4" r="1"/><circle cx="1" cy="8" r="1"/><circle cx="4" cy="11" r="1"/></g>` +
  `</svg>`
);
const LEAGUE_PLACEHOLDER_ICON = (
  `<svg class="sx-tile__icon" viewBox="0 0 28 32" fill="none" stroke="currentColor" stroke-width="1.5">` +
    `<path d="M14 2 25 6v10c0 8-5.5 12.5-11 14C8.5 28.5 3 24 3 16V6z"/>` +
    `<circle cx="14" cy="15" r="6" stroke-width="1.3"/>` +
    `<path d="M14 10.5 17 13l-1.2 3.6h-3.6L11 13z" fill="currentColor" stroke="none"/>` +
  `</svg>`
);
const TEAM_PLACEHOLDER_ICON = (
  `<svg class="sx-tile__icon" viewBox="0 0 28 32" fill="none" stroke="currentColor" stroke-width="1.5">` +
    `<path d="M14 2 25 6v10c0 8-5.5 12.5-11 14C8.5 28.5 3 24 3 16V6z"/>` +
  `</svg>`
);
const STATUS_ICONS = {
  ANY: `<svg class="sx-tile__icon sx-tile__icon--sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8.5"/></svg>`,
  LISTED: `<svg class="sx-tile__icon sx-tile__icon--sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12.5 3.5 20 11l-8.5 8.5L3 11V3.5z"/><circle cx="8" cy="7.5" r="1.1" fill="currentColor" stroke="none"/></svg>`,
  LOAN: `<svg class="sx-tile__icon sx-tile__icon--sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 8a8 8 0 0 1 14-4.5M20 8V3.5M20 8h-4.5"/><path d="M20 16a8 8 0 0 1-14 4.5M4 16v4.5M4 16h4.5"/></svg>`,
  EXPIRING: `<svg class="sx-tile__icon sx-tile__icon--sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/></svg>`,
  FREE: `<svg class="sx-tile__icon sx-tile__icon--sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="3.2"/><path d="M5.5 20c0-4 3-6.5 6.5-6.5S18.5 16 18.5 20"/></svg>`,
};

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

/** One stacked row of a dual tile (MIN/MAX AGE) with its own prev/next
 * carousel-style arrows either side of the value, instead of the plain
 * click-to-cycle-by-one every other stacked row uses (F3-fixes). */
function arrowRowHtml({ tile, sub, focused, label, valueHtml, disabled }) {
  return (
    `<div class="sx-tile__row sx-tile__row--arrow${focused ? " is-focus" : ""}${disabled ? " is-disabled" : ""}" data-tile="${tile}" data-sub="${sub}">` +
      `<div class="sx-tile__label">${label}</div>` +
      `<div class="sx-tile__arrowline">` +
        `<button type="button" class="cnav prev" data-action="tile-prev" data-tile="${tile}" data-sub="${sub}"${disabled ? " disabled" : ""}>&lsaquo;</button>` +
        `<span class="sx-tile__val">${valueHtml}</span>` +
        `<button type="button" class="cnav next" data-action="tile-next" data-tile="${tile}" data-sub="${sub}"${disabled ? " disabled" : ""}>&rsaquo;</button>` +
      `</div>` +
    `</div>`
  );
}

/** A whole single-cell tile (COUNTRY/LEAGUE/TEAM) with the same prev/next
 * arrow line, plus a centered icon above the value (F3-fixes). */
function arrowTileHtml({ tile, focused, disabled, label, iconHtml, valueHtml }) {
  return (
    `<div class="sx-tile sx-tile--arrow${focused ? " is-focus" : ""}${disabled ? " is-disabled" : ""}" data-tile="${tile}">` +
      `<div class="sx-tile__label">${label}</div>` +
      (iconHtml ? `<div class="sx-tile__iconwrap">${iconHtml}</div>` : "") +
      `<div class="sx-tile__arrowline">` +
        `<button type="button" class="cnav prev" data-action="tile-prev" data-tile="${tile}"${disabled ? " disabled" : ""}>&lsaquo;</button>` +
        `<span class="sx-tile__val">${valueHtml}</span>` +
        `<button type="button" class="cnav next" data-action="tile-next" data-tile="${tile}"${disabled ? " disabled" : ""}>&rsaquo;</button>` +
      `</div>` +
    `</div>`
  );
}

function renderFilters(state) {
  const s = state.ui.transferSearch;
  const f = s.filters;
  const t = s.filterTile;
  const sub = s.filterSub;

  const nameTile =
    `<div class="sx-tile sx-tile--name${t === 0 ? " is-focus" : ""}" data-action="filter-activate" data-tile="0">` +
      `<div class="sx-tile__label">PLAYER NAME</div>` +
      `<div class="sx-tile__portrait"></div>` +
      `<div class="sx-tile__val">${f.name || "Any"}</div>` +
    `</div>`;

  const posRoleTile =
    `<div class="sx-tile sx-tile--dual" data-tile="1">` +
      tileHtml({ tile: 1, sub: 0, focused: t === 1, subFocused: sub === 0, label: "POSITION", valueHtml: f.area === "ALL" ? "Any" : f.area }) +
      tileHtml({ tile: 1, sub: 1, focused: t === 1, subFocused: sub === 1, label: "ROLE", valueHtml: f.role === "ANY" ? "Any" : f.role }) +
    `</div>`;

  // NATIONALITY: activating opens the keyboard-overlay search (F3-fixes)
  // instead of L/R-cycling the world nation list in place.
  const natTile =
    `<div class="sx-tile${t === 2 ? " is-focus" : ""}" data-action="filter-activate" data-tile="2">` +
      `<div class="sx-tile__label">NATIONALITY</div>` +
      `<div class="sx-tile__iconwrap">${f.nationId ? `<span class="flag sx-tile__flag" data-flag="${f.nationId}"></span>` : FLAG_PLACEHOLDER_ICON}</div>` +
      `<div class="sx-tile__val">${nationName(state, f.nationId)}</div>` +
    `</div>`;

  const statusTile =
    `<div class="sx-tile${t === 3 ? " is-focus" : ""}" data-action="filter-activate" data-tile="3">` +
      `<div class="sx-tile__label">TRANSFER STATUS</div>` +
      `<div class="sx-tile__iconwrap">${STATUS_ICONS[f.status]}</div>` +
      `<div class="sx-tile__val">${statusLabel(f.status)}</div>` +
    `</div>`;

  const ageTile =
    `<div class="sx-tile sx-tile--dual" data-tile="4">` +
      arrowRowHtml({ tile: 4, sub: 0, focused: t === 4 && sub === 0, label: "MIN AGE", valueHtml: f.minAge || "Any" }) +
      arrowRowHtml({ tile: 4, sub: 1, focused: t === 4 && sub === 1, label: "MAX AGE", valueHtml: f.maxAge || "Any" }) +
    `</div>`;

  const countryTile = arrowTileHtml({
    tile: 5, focused: t === 5, label: "COUNTRY",
    iconHtml: f.country ? `<span class="flag sx-tile__flag" data-flag="${nationIdForCountry(state, f.country) || ""}"></span>` : FLAG_PLACEHOLDER_ICON,
    valueHtml: f.country || "Any",
  });

  const league = f.leagueId ? state.staticData.leagues.find((l) => l.id === f.leagueId) : null;
  const leagueTile = arrowTileHtml({
    tile: 6, focused: t === 6, disabled: !f.country, label: "LEAGUE",
    iconHtml: LEAGUE_PLACEHOLDER_ICON, valueHtml: league ? league.name : "Any",
  });

  const team = f.teamId ? state.clubsById.get(f.teamId) : null;
  const teamTile = arrowTileHtml({
    tile: 7, focused: t === 7, disabled: !f.country || !f.leagueId, label: "TEAM",
    iconHtml: team ? `<svg class="crest sx-tile__crest"><use href="#crest-${team.id}"></use></svg>` : TEAM_PLACEHOLDER_ICON,
    valueHtml: team ? team.name : "Any",
  });

  return (
    `<div class="sx-crumb"><span class="crumb-prev">TRANSFERS</span><span class="crumb-sep">&rsaquo;</span><span class="crumb-cur">PLAYER SEARCH</span></div>` +
    `<div class="sx-filtergrid">${nameTile}${posRoleTile}${natTile}${statusTile}${ageTile}${countryTile}${leagueTile}${teamTile}</div>`
  );
}

function filtersFooterHtml() {
  return (
    actionPrompt("b", "back", "Back") +
    actionPrompt("x", "reset-tile", "Reset") +
    actionPrompt("menu", "reset-all", "Reset All") +
    actionPrompt("y", "search", "Search For Players") +
    actionPrompt("a", "filter-select", "Select")
  );
}

/* ============================================================================
 * PLAYER NAME / NATIONALITY keyboard-overlay search
 * (ms_SEARCH_PLAYERS_SCREEN_EXAMPLE_PLAYER_NAME_SEARCH.png) — F3-fixes.
 * One shared 3-row QWERTY grid (no space/punctuation keys, matching the
 * pic exactly) feeding two different results tables: PLAYER NAME searches
 * every player in the database (debounced, 2-char minimum) and, on pick,
 * templates all 8 filter tiles off that player; NATIONALITY searches the
 * ~50-entry nation list (no debounce, no minimum, pre-filled before typing)
 * and, on pick, fills just the one tile.
 * ========================================================================== */

export const KB_ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"],
];

function keyboardHtml(cursorRow, cursorCol, resultsFocus) {
  return `<div class="sx-kb">` + KB_ROWS.map((row, r) => (
    `<div class="sx-kb__row">` + row.map((letter, c) => (
      `<button type="button" class="sx-kb__key${!resultsFocus && r === cursorRow && c === cursorCol ? " is-focus" : ""}" data-action="kb-key" data-letter="${letter}">${letter}</button>`
    )).join("") + `</div>`
  )).join("") + `</div>`;
}

/** Every player in the database (not just transfer targets — F3-fixes'
 * own reading of "search... every player in the database"), first or last
 * name substring, alphabetical by full name, 2-char minimum, debounced via
 * `committedQuery` (router.js owns the timer). */
export function computeNameSearchResults(state) {
  const q = state.ui.transferSearch.nameSearch.committedQuery.trim().toLowerCase();
  if (q.length < 2) return [];
  return state.players
    .filter((p) => p.firstName.toLowerCase().includes(q) || p.lastName.toLowerCase().includes(q) || p.commonName.toLowerCase().includes(q))
    .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`))
    .slice(0, 200);
}

/** Pre-filled with every nation, filtered live as `query` grows (no
 * debounce, no minimum length — a ~50-row list needs neither). */
export function computeNationSearchResults(state) {
  const q = state.ui.transferSearch.nationSearch.query.trim().toLowerCase();
  const nations = state.staticData.nations.slice().sort((a, b) => a.name.localeCompare(b.name));
  return q ? nations.filter((n) => n.name.toLowerCase().includes(q)) : nations;
}

function kbNoResultsHtml() {
  return `<div class="sx-kbsearch__empty">There are no results based on your search parameters.</div>`;
}

function nameSearchOverlayHtml(state) {
  const n = state.ui.transferSearch.nameSearch;
  const showResults = n.committedQuery.trim().length >= 2;
  const results = showResults ? computeNameSearchResults(state) : [];
  const tableHtml = !showResults || !results.length
    ? `<div class="sx-kbsearch__head"><span>POS</span><span>PLAYER</span><span>AGE</span></div>${kbNoResultsHtml()}`
    : `<div class="sx-kbsearch__head"><span>POS</span><span>PLAYER</span><span>AGE</span></div>` +
      `<div class="sx-kbsearch__rows">` + results.map((p, i) => (
        `<div class="sx-kbsearch__row${n.resultsFocus && i === n.resultIndex ? " is-focus" : ""}" data-action="kb-select-player" data-player="${p.id}">` +
          `<span>${p.position}</span><span>${p.firstName} ${p.lastName}</span><span>${p.age}</span>` +
        `</div>`
      )).join("") + `</div>`;
  const bodyHtml =
    `<div class="sx-kbsearch">` +
      `<div class="sx-kbsearch__input">${n.query}<span class="sx-kbsearch__cursor">_</span></div>` +
      keyboardHtml(n.cursorRow, n.cursorCol, n.resultsFocus) +
      `<div class="sx-kbsearch__hint" data-action="kb-select">${actionPrompt("a", "kb-select", "Select")}</div>` +
      `<div class="sx-kbsearch__results">${tableHtml}</div>` +
    `</div>`;
  return fxPanel({ title: "PLAYER SEARCH", bodyHtml, extraClass: "sx-kbpanel" });
}

function nationSearchOverlayHtml(state) {
  const n = state.ui.transferSearch.nationSearch;
  const results = computeNationSearchResults(state);
  const tableHtml = results.length
    ? `<div class="sx-kbsearch__rows sx-kbsearch__rows--nation">` + results.map((nat, i) => (
        `<div class="sx-kbsearch__row sx-kbsearch__row--nation${n.resultsFocus && i === n.resultIndex ? " is-focus" : ""}" data-action="kb-select-nation" data-nation="${nat.id}">` +
          `<span class="flag" data-flag="${nat.id}"></span><span>${nat.name}</span>` +
        `</div>`
      )).join("") + `</div>`
    : kbNoResultsHtml();
  const bodyHtml =
    `<div class="sx-kbsearch">` +
      `<div class="sx-kbsearch__input">${n.query}<span class="sx-kbsearch__cursor">_</span></div>` +
      keyboardHtml(n.cursorRow, n.cursorCol, n.resultsFocus) +
      `<div class="sx-kbsearch__hint" data-action="kb-select">${actionPrompt("a", "kb-select", "Select")}</div>` +
      `<div class="sx-kbsearch__results">${tableHtml}</div>` +
    `</div>`;
  return fxPanel({ title: "NATIONALITY SEARCH", bodyHtml, extraClass: "sx-kbpanel" });
}

function kbScrimHtml(panelHtml, closeAction) {
  return `<div class="sx-kbscrim" data-action="${closeAction}">${panelHtml}</div>`;
}

function kbSearchFooterHtml() {
  return actionPrompt("b", "back", "Back") + actionPrompt("a", "kb-select", "Select");
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
    ? `<div class="sx-report__body">${reportPageHtml(state, selected, s.reportPage)}</div>${reportPagerHtml(s.reportPage, reportPageCount(selected))}`
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
  const kbOpen = s.nameSearch.open || s.nationSearch.open;
  body.innerHTML = s.stage === "filters" ? renderFilters(state) : renderResults(state);
  footer.innerHTML = kbOpen ? kbSearchFooterHtml() : (s.stage === "filters" ? filtersFooterHtml() : resultsFooterHtml(state));

  const nameEl = document.getElementById("sx-namesearch");
  if (nameEl) nameEl.innerHTML = s.nameSearch.open ? kbScrimHtml(nameSearchOverlayHtml(state), "namesearch-scrim") : "";
  const natEl = document.getElementById("sx-natsearch");
  if (natEl) natEl.innerHTML = s.nationSearch.open ? kbScrimHtml(nationSearchOverlayHtml(state), "natsearch-scrim") : "";
}

/* ============================================================================
 * MY SHORTLIST (ms_MY_SHORTLIST_SCREEN.png) — paper dossier
 * ========================================================================== */

function shortlistTableHtml(state, list, selectedId) {
  const rows = list.map(({ playerId }) => {
    const p = state.playersById.get(playerId);
    return { id: p.id, pos: p.position, position: p.position, area: positionInfo(p.position).area, name: fullName(p), lastName: p.lastName, firstName: p.firstName, age: p.age };
  });
  const sorted = rows.sort(lastNameSort);
  if (state.ui.shortlist.sortDir === "desc") sorted.reverse();
  return fxTable({
    columns: [{ key: "pos", label: "Pos" }, { key: "name", label: "Name", sortable: true }],
    rows: sorted,
    sortKey: "name",
    sortDir: state.ui.shortlist.sortDir,
    rowClass: (row) => (row.id === selectedId ? "is-sel" : ""),
    cellHtml: (col, row) => (col.key === "pos" ? `${posBar(row.area)}${row.pos}` : row.name),
  });
}

/** F3-fixes: OVR shows as a fuzzy range (same rules as the Search Report)
 * and VALUE stays hidden entirely until the report is complete — otherwise
 * shortlisting an unscouted player would leak exactly the info scouting is
 * supposed to be gating. */
function shortlistPlayerCardHtml(state, player) {
  const club = state.clubsById.get(player.clubId);
  const scouted = isFullyScouted(player);
  const ovrHtml = scouted ? attrChip(player.overall) : fuzzyChip(...scoutedRange(state, player, "overall", player.overall));
  const valueHtml = scouted ? money(player.value) : "???";
  return (
    `<div class="fx-paper__playercard">` +
      `<svg class="crest crest--sm"><use href="#crest-${club.id}"></use></svg>` +
      `<div class="fx-paper__pcname">${fullName(player)}</div>` +
      `<div class="fx-paper__pcclub">${club.name}</div>` +
      `<div class="fx-paper__pcgrid">` +
        `<div><span class="k">OVR</span><span class="v">${ovrHtml}</span></div>` +
        `<div><span class="k">POS</span><span class="v">${player.position}</span></div>` +
        `<div><span class="k">AGE</span><span class="v">${player.age}</span></div>` +
      `</div>` +
      `<div class="fx-paper__pcrow"><span class="k">VALUE</span><span class="v">${valueHtml}</span></div>` +
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

/** F3-fixes: GKs get their own GK attribute group instead of the irrelevant
 * outfield Technical group (owner: "make sure GK's are showing relevant
 * stats similar to how we set it up in the squad page"). */
function shortlistAttrSheetHtml(state, player) {
  const group = (title, pairs) => `<div class="sx-attrgrid__title">${title}</div>${twoColAttrRows(state, player, pairs)}`;
  const isGk = positionInfo(player.position).area === "GK";
  return (
    `<div class="sx-attrgrid sx-attrgrid--paper">` +
      (isGk ? group("Goalkeeping:", GK_PAGE) : "") +
      group("Physical:", PHYSICAL_PAGE) +
      group("Mental:", MENTAL_PAGE) +
      (isGk ? "" : group("Technical:", TECHNICAL_PAGE)) +
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
        `<div class="sx-shortlist__right">${selected ? shortlistAttrSheetHtml(state, selected) : ""}</div>` +
      `</div>` +
    `</div>`;

  footer.innerHTML = st.actionMenuOpen
    ? actionPrompt("b", "back", "Back")
    : actionPrompt("x", "sort", "Sort") + actionPrompt("b", "back", "Back") + (list.length ? actionPrompt("rs", "player-bio", "Player Bio") : "");
}
