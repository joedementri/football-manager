// ui/sellplayersui.js — F4 (fable-plans/plan2.md): SELL PLAYERS
// (ms_SELL_PLAYERS_SCREEN.png / ..._PLAYER_SELECTED.png). Two-pane §B1
// fx-table (whole squad, sortable by Status) + a §B3 playercard/action-menu
// overlay on selecting a player — same "browse a table, (A) opens a
// full-bleed action menu" shape ui/searchui.js's Search Results already
// established, reusing the exact same §B3 primitive (fxPlayerCard), which
// had no real consumer before this screen (see panelkit.js's own header note
// on the primitive's F4 rewrite).

import { money } from "../core/format.js";
import { positionInfo, AREAS } from "../config/positions.js";
import { posBar, fxTable, fxPlayerCard, actionPrompt, attrChip } from "./panelkit.js";
import { formWord, moraleWord } from "./searchui.js";
import { injuryStatusLabel } from "./squadreportui.js";
import { cmToFtIn } from "./playerbio.js";
import { GK_ATTRS, PHYSICAL_ATTRS, SKILL_ATTRS } from "./teamsheetui.js";
import { remainingContractYM } from "./transfersui.js";
import { releaseGuardReason } from "../engine/contracts.js";
import { MAX_SQUAD_SIZE } from "../config/budget.js";

function flagSpan(code) {
  return `<span class="flag" data-flag="${code}"></span>`;
}

const LISTING_LABEL = { transfer: "Transfer List", "loan-season": "Loan List for Season Loan", "loan-short": "Loan List for Short Loan" };

function pluralize(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** "1 Year 6 Months" / "0 Years 6 Months" — owner request: the Status
 * column's default (nothing else applies) reads the player's actual
 * remaining contract length rather than a bare "None". */
function contractRemainingLabel(state, player) {
  const rem = remainingContractYM(state, player.contract.endYear);
  return `${pluralize(rem.years, "Year")} ${pluralize(rem.months, "Month")}`;
}

/** Status column text (single value — see plan2-decisions.md F4 for the
 * chosen priority when more than one condition could apply at once).
 * Exported for dev/tests.js's own "status column reflects each action".
 * F4-fixes (owner request): a pending renewal offer (engine/contracts.js's
 * submitRenewalOffer) takes priority over the plain contract-remaining
 * fallback, and that fallback is now real "N Year(s) M Month(s)" text
 * instead of "None". */
export function statusLabel(state, player) {
  if (state.transfers.disallowedBids.has(player.id)) return "Bids Disallowed";
  if (player.retiringAnnounced) return "Retiring at Contract End";
  const listing = state.transfers.listings.get(player.id);
  if (listing) return listing.type === "transfer" ? "Transfer Listed" : listing.type === "loan-season" ? "Loan Listed (Season)" : "Loan Listed (Short)";
  if (player.contract.pendingOffer) return `Offered ${money(player.contract.pendingOffer.wage)}/wk, ${pluralize(player.contract.pendingOffer.years, "Year")}`;
  return contractRemainingLabel(state, player);
}

/* ============================================================================
 * Sorting — every column is sortable (owner request); clicking a header
 * switches to that column (default ascending, or reverses if it's already
 * the active column); the footer/keyboard (X) reverses whichever column is
 * currently active without needing to re-click its header.
 * ========================================================================== */

const SORT_ACCESSORS = {
  pos: (state, p) => `${AREAS.indexOf(positionInfo(p.position).area)}_${p.position}`,
  player: (state, p) => p.commonName,
  age: (state, p) => p.age,
  ovr: (state, p) => p.overall,
  price: (state, p) => p.value,
  wage: (state, p) => p.contract.wage,
  status: (state, p) => statusLabel(state, p),
};

/* ============================================================================
 * Player-selected action menu (§B3 playercard)
 * ========================================================================== */

const ALL_ATTR_LABELS = new Map([...GK_ATTRS, ...PHYSICAL_ATTRS, ...SKILL_ATTRS]);

/** Top 6 attributes by value, descending — reconstructed from the one worked
 * example (ms_SELL_PLAYERS_SCREEN_PLAYER_SELECTED.png's GK: 68/67/63/63/61/58,
 * a strictly-descending top-6) rather than a fixed per-position list, since no
 * other pic shows an outfield player's own version of this panel. [TUNED],
 * logged in plan2-decisions.md F4. */
function topAttrRowsHtml(player) {
  const entries = Object.entries(player.attrs)
    .filter(([key]) => ALL_ATTR_LABELS.has(key))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  return entries.map(([key, val]) => (
    `<div class="fx-attr-row"><span class="fx-attr-row__name">${ALL_ATTR_LABELS.get(key)}</span>${attrChip(val)}</div>`
  )).join("");
}

function buildSellActionRows(state, player) {
  const listing = state.transfers.listings.get(player.id);
  const disallowed = state.transfers.disallowedBids.has(player.id);
  const guardReason = releaseGuardReason(state, player);
  const rows = [
    { label: "Offer New Contract", action: "offer-contract" },
    { label: disallowed ? "Allow Transfer Bids from other Teams" : "Disallow Transfer Bids from other Teams", action: "toggle-disallow" },
    { label: listing && listing.type === "transfer" ? "Remove from Transfer List" : "Add to Transfer List", action: "list-transfer" },
    { label: listing && listing.type === "loan-season" ? "Remove from Loan List for Season Loan" : "Add to Loan List for Season Loan", action: "list-loan-season" },
    { label: listing && listing.type === "loan-short" ? "Remove from Loan List for Short Loan" : "Add to Loan List for Short Loan", action: "list-loan-short" },
    guardReason
      ? { label: "Release", action: "release", disabled: true, why: guardReason }
      : { label: "Release", action: "release" },
  ];
  return rows;
}

function renderActionMenu(state) {
  const s = state.ui.sellPlayers;
  const player = state.playersById.get(s.selectedPlayerId);
  const club = state.clubsById.get(player.clubId);
  const area = positionInfo(player.position).area;
  const rows = buildSellActionRows(state, player);
  const selectedRow = rows[s.actionMenuIndex];

  if (s.pricePrompt) {
    const label = LISTING_LABEL[s.pricePrompt.type];
    return (
      `<div class="fx-playercard-wrap">` +
        `<div class="fx-playercard sp-priceprompt">` +
          `<div class="fx-playercard__name">${label}</div>` +
          `<div class="sp-priceprompt__row">` +
            `<span>Asking Price</span>` +
            `<button type="button" class="fx-stepper" data-action="price-down">&#9668;</button>` +
            `<span class="sp-priceprompt__val">${money(s.pricePrompt.draft)}</span>` +
            `<button type="button" class="fx-stepper" data-action="price-up">&#9658;</button>` +
          `</div>` +
          `<div class="sp-priceprompt__confirm" data-action="confirm-listing">Confirm</div>` +
        `</div>` +
      `</div>`
    );
  }

  return fxPlayerCard({
    firstName: player.firstName, lastName: player.lastName, age: player.age,
    position: player.position, area, club: club.name, crestHref: `#crest-${club.id}`,
    nationFlagHtml: flagSpan(player.nationId),
    height: cmToFtIn(player.heightCm), foot: player.foot === "L" ? "Left" : "Right",
    overall: player.overall, value: money(player.value), wage: money(player.contract.wage),
    form: formWord(player.form), moraleWord: moraleWord(player.morale), fitnessWord: injuryStatusLabel(player),
    tagline: `At The Club Since ${player.joinedClubYear}`,
    attrHtml: topAttrRowsHtml(player),
    actions: rows, selectedAction: selectedRow ? selectedRow.action : null,
  });
}

/* ============================================================================
 * Roster table
 * ========================================================================== */

function rosterTableHtml(state) {
  const s = state.ui.sellPlayers;
  const dir = s.sortDir === "asc" ? 1 : -1;
  const accessor = SORT_ACCESSORS[s.sortKey] || SORT_ACCESSORS.status;
  const rows = [...state.squad.roster].sort((a, b) => {
    const av = accessor(state, a), bv = accessor(state, b);
    return av < bv ? -dir : av > bv ? dir : 0;
  });
  return fxTable({
    columns: [
      { key: "pos", label: "Pos", sortable: true }, { key: "player", label: "Player", sortable: true },
      { key: "age", label: "Age", numeric: true, sortable: true }, { key: "ovr", label: "OVR", numeric: true, sortable: true },
      { key: "price", label: "Price", numeric: true, sortable: true }, { key: "wage", label: "Wage", numeric: true, sortable: true },
      { key: "status", label: "Status", numeric: true, sortable: true },
    ],
    rows,
    sortKey: s.sortKey, sortDir: s.sortDir,
    rowClass: (p) => p.id === s.selectedPlayerId ? "is-sel" : "",
    cellHtml: (col, p) => {
      if (col.key === "pos") return `${posBar(positionInfo(p.position).area)}${p.position}`;
      if (col.key === "player") return p.commonName;
      if (col.key === "age") return p.age;
      if (col.key === "ovr") return p.overall;
      if (col.key === "price") return money(p.value);
      if (col.key === "wage") return money(p.contract.wage);
      if (col.key === "status") return statusLabel(state, p);
      return "";
    },
  });
}

function squadCounts(state) {
  const counts = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (const p of state.squad.roster) counts[positionInfo(p.position).area]++;
  return counts;
}

export function renderSellPlayers(state) {
  const body = document.getElementById("sellplayers-body");
  const s = state.ui.sellPlayers;
  const counts = squadCounts(state);

  const headerHtml =
    `<div class="sp-header">` +
      `<div class="sp-header__left">` +
        `<svg class="crest fx-identity__crest"><use href="#crest-${state.club.id}"></use></svg>` +
        `<div class="sp-header__names">` +
          `<span class="fx-identity__office">MANAGER'S OFFICE</span>` +
          `<span class="fx-identity__manager">${state.manager.name}</span>` +
          `<div class="sp-header__budgetline"><span class="k">Transfer Budget</span><span class="v">${money(state.finances.transferBudget)}</span></div>` +
          `<div class="sp-header__budgetline"><span class="k">Rem. Wage Budget (per week)</span><span class="v">${money(state.finances.wageCeiling)}</span></div>` +
        `</div>` +
      `</div>` +
      `<div class="sp-header__right">` +
        `<div class="sp-header__title">PLAYERS IN SQUAD</div>` +
        `<div class="sp-counts">` +
          AREAS.map((a) => `<div class="sp-counts__cell"><span class="k">${a}</span><span class="v">${counts[a]}</span></div>`).join("") +
          `<div class="sp-counts__cell"><span class="k">TOTAL</span><span class="v">${state.squad.roster.length}/${MAX_SQUAD_SIZE}</span></div>` +
        `</div>` +
      `</div>` +
    `</div>`;

  body.innerHTML =
    `<div class="fx-panel sp-panel">` +
      `<div class="fx-panel__titlebar"><span class="fx-panel__title">SELL PLAYERS</span></div>` +
      `<div class="fx-panel__body sp-body-inner">` +
        headerHtml +
        `<div class="sp-tablewrap">${rosterTableHtml(state)}</div>` +
      `</div>` +
    `</div>` +
    (s.actionMenuOpen ? renderActionMenu(state) : "");

  const footer = document.getElementById("footer-sellplayers");
  footer.innerHTML = s.pricePrompt
    ? actionPrompt("a", "confirm-listing", "Confirm") + actionPrompt("b", "back", "Cancel")
    : s.actionMenuOpen
      ? actionPrompt("b", "back", "Back")
      : (
        actionPrompt("x", "sort", "Sort") +
        actionPrompt("b", "back", "Back") +
        actionPrompt("rs", "player-bio", "Player Bio") +
        `<span class="prompt"><span class="btn-glyph lt">LT</span><span class="btn-glyph rt">RT</span> Page Up / Down</span>`
      );
}
