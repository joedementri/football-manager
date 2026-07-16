// ui/transfersui.js — M7's Transfers overlays: Search Players, Negotiation
// (fee talks -> contract talks, loans, free-agent pre-contract approaches),
// Sell/Loan List, and Request Funds. Pure render-from-state, same contract
// as every other ui/*.js module (see ui/contractsui.js's header) — every
// control here calls a core/store.js method and re-renders off the event
// core/router.js subscribes to.
//
// No REFERENCE_PICS screenshot covers these sub-screens (only the Transfers
// hub tile grid was captured) — authored fresh from the existing overlay/
// stepper/list-detail conventions (ui/contractsui.js, ui/jobsui.js), same
// footing as ui/matchday.js's own header note on this.

import { money } from "../core/format.js";
import { positionInfo, AREAS } from "../config/positions.js";
import { eligibleFreeAgentTargets } from "../engine/freeagents.js";
import { MAX_COUNTER_OFFERS } from "../config/transferai.js";

function prompt(glyphClass, glyphLabel, action, label) {
  return `<span class="prompt" data-action="${action}"><span class="btn-glyph ${glyphClass}">${glyphLabel}</span> ${label}</span>`;
}

const ROLE_TIERS = ["prospect", "rotation", "important", "crucial"];
function roleLabel(role) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/* ============================================================================
 * Search Players
 * ========================================================================== */

/** World-wide search pool (real numbers — fuzzy GTN ranges for un-scouted
 * players land in M8), filtered by the Search Players form. Capped at 60
 * results, sorted by overall — a search-refinement nudge doubles as the
 * result-count limiter. */
export function computeSearchResults(state) {
  const f = state.ui.transferSearch;
  let pool = f.freeAgentsOnly
    ? eligibleFreeAgentTargets(state)
    : state.players.filter((p) => p.clubId !== state.club.id);
  if (f.area !== "ALL") pool = pool.filter((p) => positionInfo(p.position).area === f.area);
  if (f.minOverall > 0) pool = pool.filter((p) => p.overall >= f.minOverall);
  if (f.maxValue > 0) pool = pool.filter((p) => p.value <= f.maxValue);
  return pool.slice().sort((a, b) => b.overall - a.overall).slice(0, 60);
}

function renderSearchFilters(state) {
  const f = state.ui.transferSearch;
  const el = document.getElementById("sr-filters");
  const areaButtons = ["ALL", ...AREAS].map((a) => (
    `<button type="button" class="sr-area-btn${f.area === a ? " is-sel" : ""}" data-action="set-area" data-value="${a}">${a}</button>`
  )).join("");
  el.innerHTML =
    `<div class="sr-filter-row">` +
      `<div class="sr-filter">` +
        `<span class="sr-filter__label">Position</span>` +
        `<div class="sr-areapicker">${areaButtons}</div>` +
      `</div>` +
      `<div class="sr-filter">` +
        `<span class="sr-filter__label">Min Overall</span>` +
        `<button class="ct-stepper" type="button" data-action="minovr-down">&minus;</button>` +
        `<span class="sr-filter__val">${f.minOverall || "Any"}</span>` +
        `<button class="ct-stepper" type="button" data-action="minovr-up">+</button>` +
      `</div>` +
      `<div class="sr-filter">` +
        `<span class="sr-filter__label">Max Value</span>` +
        `<button class="ct-stepper" type="button" data-action="maxvalue-down">&minus;</button>` +
        `<span class="sr-filter__val">${f.maxValue > 0 ? money(f.maxValue) : "Any"}</span>` +
        `<button class="ct-stepper" type="button" data-action="maxvalue-up">+</button>` +
      `</div>` +
      `<button type="button" class="sr-toggle${f.freeAgentsOnly ? " is-on" : ""}" data-action="toggle-freeagents">Free Agents Only</button>` +
    `</div>`;
}

function renderSearchResults(state) {
  const el = document.getElementById("sr-results");
  const results = computeSearchResults(state);
  const selectedId = state.ui.transferSearch.selectedPlayerId;

  const rows = results.map((p) => {
    const club = state.clubsById.get(p.clubId);
    const sel = p.id === selectedId ? " is-sel" : "";
    return (
      `<div class="sr-row${sel}" data-player="${p.id}">` +
        `<span class="flag" data-flag="${p.nationId}"></span>` +
        `<span class="sr-row__name">${p.commonName}</span>` +
        `<span class="sr-row__pos">${p.position}</span>` +
        `<span class="sr-row__age num">${p.age}</span>` +
        `<span class="sr-row__ovr num">${p.overall}</span>` +
        `<span class="sr-row__value num">${money(p.value)}</span>` +
        `<svg class="crest crest--xs"><use href="#crest-${club.id}"></use></svg>` +
      `</div>`
    );
  }).join("");

  el.innerHTML =
    `<div class="sr-results__count">${results.length} player${results.length === 1 ? "" : "s"} found</div>` +
    `<div class="sr-results__rows">${rows || `<div class="empty"><span class="lbl">No players match these filters</span></div>`}</div>`;
}

function renderSearchFooter(state) {
  const footer = document.getElementById("footer-search");
  const f = state.ui.transferSearch;
  let html = "";
  if (f.selectedPlayerId != null) {
    html += f.freeAgentsOnly
      ? prompt("a", "A", "approach", "Approach")
      : prompt("a", "A", "bid", "Bid") + prompt("x", "X", "loan", "Loan");
  }
  html += prompt("b", "B", "back", "Back");
  footer.innerHTML = html;
}

export function renderSearch(state) {
  renderSearchFilters(state);
  renderSearchResults(state);
  renderSearchFooter(state);
}

/* ============================================================================
 * Negotiation
 * ========================================================================== */

function renderFeePhase(state, n) {
  const waitingBanner = n.phase === "fee-waiting"
    ? `<div class="ng-waiting">Offer submitted — awaiting a response from the club…</div>` : "";
  const counterBanner = n.lastFeeResponse === "countered"
    ? `<div class="ng-banner ng-banner--counter">The club has come back with a counter-offer of ${money(n.counterFee)} (round ${n.round}/${MAX_COUNTER_OFFERS}).</div>` : "";
  const over = n.feeOffer > state.finances.transferBudget;
  return (
    counterBanner + waitingBanner +
    `<div class="ng-offer">` +
      `<div class="ng-offer__row">` +
        `<span class="ng-offer__label">Transfer Fee</span>` +
        `<button class="ct-stepper" type="button" data-action="fee-down">&minus;</button>` +
        `<span class="ng-offer__val">${money(n.feeOffer)}</span>` +
        `<button class="ct-stepper" type="button" data-action="fee-up">+</button>` +
      `</div>` +
    `</div>` +
    `<div class="ng-budget${over ? " ng-budget--over" : ""}">Transfer Budget: ${money(state.finances.transferBudget)}${over ? " — insufficient funds" : ""}</div>`
  );
}

function renderContractPhase(state, n) {
  const player = state.playersById.get(n.playerId);
  const waitingBanner = (n.phase === "contract-waiting" || n.phase === "approach-waiting")
    ? `<div class="ng-waiting">Terms sent — awaiting a response…</div>` : "";
  const freeAgentNote = n.dealType === "free-agent"
    ? `<div class="ng-note">Pre-contract talks — ${player.commonName} will join for free the moment his current deal expires.</div>` : "";
  return (
    waitingBanner + freeAgentNote +
    `<div class="ng-offer">` +
      `<div class="ng-offer__row">` +
        `<span class="ng-offer__label">Weekly Wage</span>` +
        `<button class="ct-stepper" type="button" data-action="wage-down">&minus;</button>` +
        `<span class="ng-offer__val">${money(n.contractOffer.wage)}</span>` +
        `<button class="ct-stepper" type="button" data-action="wage-up">+</button>` +
      `</div>` +
      `<div class="ng-offer__row">` +
        `<span class="ng-offer__label">Contract Length</span>` +
        `<button class="ct-stepper" type="button" data-action="years-down">&minus;</button>` +
        `<span class="ng-offer__val">${n.contractOffer.years} yr${n.contractOffer.years === 1 ? "" : "s"}</span>` +
        `<button class="ct-stepper" type="button" data-action="years-up">+</button>` +
      `</div>` +
      `<div class="ng-offer__row">` +
        `<span class="ng-offer__label">Squad Role</span>` +
        `<button class="ct-stepper" type="button" data-action="role-down">&minus;</button>` +
        `<span class="ng-offer__val">${roleLabel(n.promisedRole)}</span>` +
        `<button class="ct-stepper" type="button" data-action="role-up">+</button>` +
      `</div>` +
    `</div>`
  );
}

function dealNoun(dealType) {
  if (dealType === "loan") return "loan";
  if (dealType === "free-agent") return "pre-contract";
  return "transfer";
}

export function renderNegotiation(state) {
  const container = document.getElementById("ng-body");
  const footer = document.getElementById("footer-negotiation");
  const n = state.transfers.negotiation;
  if (!n) { container.innerHTML = ""; footer.innerHTML = ""; return; }

  const player = state.playersById.get(n.playerId);
  const club = state.clubsById.get(n.sourceClubId);
  const header =
    `<div class="ng-head">` +
      `<svg class="crest crest--sm"><use href="#crest-${club.id}"></use></svg>` +
      `<div class="ng-head__name">${player.commonName}</div>` +
      `<div class="ng-head__sub">${player.position} &middot; Age ${player.age} &middot; OVR ${player.overall} &middot; ${club.name}</div>` +
      `<div class="ng-head__value">Value: ${money(player.value)}</div>` +
    `</div>`;

  if (n.phase === "fee" || n.phase === "fee-waiting") {
    container.innerHTML = header + renderFeePhase(state, n);
    footer.innerHTML = n.phase === "fee-waiting"
      ? prompt("b", "B", "back", "Back")
      : prompt("a", "A", "submit-fee", "Submit Offer") + prompt("b", "B", "back", "Cancel");
    return;
  }
  if (n.phase === "contract" || n.phase === "contract-waiting" || n.phase === "approach-waiting") {
    container.innerHTML = header + renderContractPhase(state, n);
    footer.innerHTML = n.phase === "contract"
      ? prompt("a", "A", "submit-contract", "Send Terms") + prompt("b", "B", "back", "Cancel")
      : prompt("b", "B", "back", "Back");
    return;
  }
  if (n.phase === "loan-waiting") {
    container.innerHTML = header + `<div class="ng-waiting">Loan request sent — awaiting a response…</div>`;
    footer.innerHTML = prompt("b", "B", "back", "Back");
    return;
  }
  if (n.phase === "completed") {
    const msg = n.dealType === "loan" ? `${player.commonName} has joined on loan.`
      : n.dealType === "free-agent" ? `${player.commonName} has agreed to join on a free transfer once his contract expires.`
      : `${player.commonName} has signed for the club!`;
    container.innerHTML = header + `<div class="ng-result ng-result--accepted">${msg}</div>`;
    footer.innerHTML = prompt("b", "B", "back", "Close");
    return;
  }
  // 'rejected'
  container.innerHTML = header + `<div class="ng-result ng-result--rejected">The ${dealNoun(n.dealType)} talks have fallen through.</div>`;
  footer.innerHTML = prompt("b", "B", "back", "Close");
}

/* ============================================================================
 * Sell / Loan List
 * ========================================================================== */

export function renderSellList(state) {
  const listEl = document.getElementById("sl2-list");
  const detailEl = document.getElementById("sl2-detail");
  const roster = [...state.squad.roster];
  const selectedId = state.ui.sellList.selectedPlayerId;

  listEl.innerHTML =
    `<div class="sl2-header">` +
      `<svg class="crest crest--sm"><use href="#crest-${state.club.id}"></use></svg>` +
      `<div class="sl2-clubname">${state.club.name}</div>` +
    `</div>` +
    `<div class="sl2-rows">${roster.map((p) => {
      const sel = p.id === selectedId ? " is-sel" : "";
      const listing = state.transfers.listings.get(p.id);
      const badge = listing ? `<span class="sl2-badge sl2-badge--${listing.type}">${listing.type === "loan" ? "LOAN LISTED" : "LISTED"}</span>` : "";
      return (
        `<div class="sl2-row${sel}" data-player="${p.id}">` +
          `<span class="sl2-row__name">${p.commonName}</span>` +
          `<span class="sl2-row__pos">${p.position}</span>` +
          `<span class="sl2-row__ovr num">${p.overall}</span>` +
          `<span class="sl2-row__value num">${money(p.value)}</span>` +
          badge +
        `</div>`
      );
    }).join("")}</div>`;

  const player = selectedId != null ? state.playersById.get(selectedId) : null;
  const listing = selectedId != null ? state.transfers.listings.get(selectedId) : null;
  if (!player) {
    detailEl.innerHTML = `<div class="empty"><span class="lbl">Select a player</span></div>`;
  } else {
    const s = state.ui.sellList;
    detailEl.innerHTML =
      `<div class="sl2-detail__head">` +
        `<div class="sl2-detail__name">${player.commonName}</div>` +
        `<div class="sl2-detail__sub">${player.position} &middot; OVR ${player.overall} &middot; Value ${money(player.value)}</div>` +
      `</div>` +
      (listing ? `<div class="ng-note">Currently listed for ${listing.type === "loan" ? "loan" : "transfer"} at ${money(listing.askingPrice)}.</div>` : "") +
      `<div class="ng-offer">` +
        `<div class="ng-offer__row">` +
          `<span class="ng-offer__label">Asking Price</span>` +
          `<button class="ct-stepper" type="button" data-action="price-down">&minus;</button>` +
          `<span class="ng-offer__val">${money(s.askingPriceDraft)}</span>` +
          `<button class="ct-stepper" type="button" data-action="price-up">+</button>` +
        `</div>` +
      `</div>`;
  }

  const footer = document.getElementById("footer-selllist");
  let html = "";
  if (selectedId != null) {
    html += prompt("a", "A", "list-transfer", "List for Transfer");
    html += prompt("x", "X", "list-loan", "List for Loan");
    if (listing) html += prompt("y", "Y", "unlist", "Remove Listing");
  }
  html += prompt("b", "B", "back", "Back");
  footer.innerHTML = html;
}

/* ============================================================================
 * Request Funds
 * ========================================================================== */

export function renderRequestFunds(state) {
  const el = document.getElementById("rf-body");
  const r = state.ui.requestFunds;
  const resultBanner = !r.lastResult ? "" : r.lastResult.reallocated
    ? `<div class="ng-result ng-result--accepted">Reallocated ${money(r.amount)} ${r.lastResult.direction === "wageToTransfer" ? "from the wage budget to the transfer budget" : "from the transfer budget to the wage budget"}.</div>`
    : r.lastResult.granted
      ? `<div class="ng-result ng-result--accepted">The board has granted an extra ${money(r.amount)} for transfers.</div>`
      : `<div class="ng-result ng-result--rejected">The board has turned down your request.</div>`;

  el.innerHTML =
    `<div class="ct-facts">` +
      `<div class="ct-fact"><span class="k">Transfer Budget</span><span class="v">${money(state.finances.transferBudget)}</span></div>` +
      `<div class="ct-fact"><span class="k">Weekly Wage Budget</span><span class="v">${money(state.finances.wageCeiling)}</span></div>` +
    `</div>` +
    `<div class="ng-offer">` +
      `<div class="ng-offer__row">` +
        `<span class="ng-offer__label">Amount</span>` +
        `<button class="ct-stepper" type="button" data-action="amount-down">&minus;</button>` +
        `<span class="ng-offer__val">${money(r.amount)}</span>` +
        `<button class="ct-stepper" type="button" data-action="amount-up">+</button>` +
      `</div>` +
    `</div>` +
    resultBanner;

  const footer = document.getElementById("footer-requestfunds");
  footer.innerHTML =
    prompt("a", "A", "board", "Ask The Board") +
    prompt("x", "X", "wage-to-transfer", "Wage &rarr; Transfer") +
    prompt("y", "Y", "transfer-to-wage", "Transfer &rarr; Wage") +
    prompt("b", "B", "back", "Back");
}
