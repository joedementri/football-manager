// ui/transfersui.js — Transfers overlays. F3 (fable-plans/plan2.md) rebuilt
// Negotiation entirely: Approach — Transfer/Loan Offer (§B2 paper dossier,
// ms_APPROACH_TRANSFER_OFFER_SCREEN.png / ms_APPROACH_LOAN_OFFER_SCREEN.png —
// one dossier, [LT][RT] toggles which right-page form shows) and Contract
// Negotiation (§B1 fx-panel, ms_CONTRACTS_SCREEN_CONTRACT_NEGOTIATION.png —
// read early per F3.6's own build note since F3 is the milestone that first
// needs this shared component; F6 reuses it unchanged for renewals). Search
// Players moved out entirely to ui/searchui.js (F3 rebuilt it as PLAYER
// SEARCH -> SEARCH RESULTS -> action menu, replacing the old filter-form/
// list-row screen this file used to own). Sell/Loan List and Request Funds
// are untouched — still pending their own F4/F6 fidelity passes.

import { money } from "../core/format.js";
import { positionInfo } from "../config/positions.js";
import { MAX_COUNTER_OFFERS } from "../config/transferai.js";
import { seasonStart } from "../config/calendar.js";
import { SQUAD_ROLE_DISPLAY, SQUAD_ROLE_CYCLE } from "../config/contract.js";
import { computeWantedFee } from "../engine/teamdecision.js";
import { computeSigningAsk } from "../engine/playerdecision.js";
import { ENQUIRY_RANGE_PCT } from "../engine/enquiry.js";
import { formWord, moraleWord } from "./searchui.js";
import { fxInputRow, glyphPill, actionPrompt, fxTable, posBar } from "./panelkit.js";

function prompt(glyphClass, glyphLabel, action, label) {
  return `<span class="prompt" data-action="${action}"><span class="btn-glyph ${glyphClass}">${glyphLabel}</span> ${label}</span>`;
}

/** Real Years/Months remaining on a contract (not a placeholder) — the same
 * `seasonStart(endYear)` boundary engine/contracts.js's own expiry-warning
 * check (`checkContractExpiryWarnings`) uses, just expressed as a calendar
 * Y/M breakdown instead of a day count (ms_APPROACH_TRANSFER_OFFER_SCREEN.png/
 * ms_CONTRACTS_SCREEN_CONTRACT_NEGOTIATION.png both show "Years: n, Months: n"). */
function remainingContractYM(state, endYear) {
  const today = state.calendar.today;
  const expiry = seasonStart(endYear);
  let months = (expiry.getFullYear() - today.getFullYear()) * 12 + (expiry.getMonth() - today.getMonth());
  if (expiry.getDate() < today.getDate()) months -= 1;
  months = Math.max(0, months);
  return { years: Math.floor(months / 12), months: months % 12 };
}

/* ============================================================================
 * Shared: PLAYER INFO paper (left page of the Approach Offer dossier)
 * ========================================================================== */

function playerInfoPaperHtml(state, player, club) {
  const rem = remainingContractYM(state, player.contract.endYear);
  const area = positionInfo(player.position).area;
  return (
    `<div class="fx-paper apo-left">` +
      `<div class="fx-paper__title">PLAYER INFO</div>` +
      `<div class="apo-namebanner">${player.firstName} ${player.lastName}</div>` +
      `<div class="apo-clubbar">${club.name}</div>` +
      `<div class="apo-ovrtable">` +
        `<div class="apo-ovrtable__head"><span>OVR</span><span>POS</span><span>AGE</span></div>` +
        `<div class="apo-ovrtable__row"><span>${player.overall}</span><span>${posBar(area)}${player.position}</span><span>${player.age}</span></div>` +
      `</div>` +
      `<div class="apo-row"><span class="k">VALUE</span><span class="v">${money(player.value)}</span></div>` +
      `<div class="apo-row apo-row--gold"><span class="k">FORM</span><span class="v">${formWord(player.form)}</span></div>` +
      `<div class="apo-row apo-row--gold"><span class="k">MORALE</span><span class="v">${moraleWord(player.morale)}</span></div>` +
      `<div class="apo-section">CURRENT CONTRACT</div>` +
      `<div class="apo-row"><span class="k">Rem. Contract</span><span class="v">Years: ${rem.years}, Months: ${rem.months}</span></div>` +
      `<div class="apo-row"><span class="k">Salary (Per Week)</span><span class="v">${money(player.contract.wage)}</span></div>` +
      `<div class="apo-row"><span class="k">Bonus Per Goal</span><span class="v">${player.contract.bonusPerGoal || 0}%</span></div>` +
      `<div class="apo-row"><span class="k">Squad Role</span><span class="v">${SQUAD_ROLE_DISPLAY[player.contract.squadRole] || "Do Not Specify"}</span></div>` +
    `</div>`
  );
}

/* ============================================================================
 * Approach — Transfer/Loan Offer (one dossier, [LT][RT] toggles the mode)
 * ========================================================================== */

function transferOfferRightHtml(state, n, player, club) {
  // F3-fixes: if the user already enquired about this player and got a real
  // answer back, quote that instead of computing a fresh independent
  // estimate — owner: "if you approach to transfer it mentions how much the
  // team is asking for in the dossier." Falls back to the old on-the-fly
  // estimate for a player nobody's ever enquired about (or whose enquiry is
  // still pending — engine/enquiry.js's `resolved: false` placeholder).
  const enquiry = state.transfers.enquiries.get(player.id);
  const resolvedEnquiry = enquiry && enquiry.resolved && !enquiry.refused ? enquiry : null;
  const wantedFee = computeWantedFee({ player, buyingClub: state.club, sellingClub: club, state });
  const lo = resolvedEnquiry ? resolvedEnquiry.lo : Math.round(wantedFee * (1 - ENQUIRY_RANGE_PCT / 100));
  const hi = resolvedEnquiry ? resolvedEnquiry.hi : Math.round(wantedFee * (1 + ENQUIRY_RANGE_PCT / 100));
  const exchangePlayer = n.exchangePlayerId != null ? state.playersById.get(n.exchangePlayerId) : null;
  const rejectedNote = n.exchangeRejectedNote
    ? `<div class="apo-note apo-note--warn">${club.name} didn't need that player and turned down the exchange — the offer went cash-only.</div>` : "";
  const over = n.feeOffer > state.finances.transferBudget;
  const editingFee = state.ui.negotiation.editingFeeOffer;
  const cecBody = resolvedEnquiry
    ? `${club.name} told us they'd want a fee in the region of ${money(lo)} and ${money(hi)} for ${player.commonName}.`
    : `${player.commonName} is one of the key players in his role and plays for a good club. He's probably going for a sum between ${money(lo)} and ${money(hi)} at this point.`;

  return (
    `<div class="fx-paper apo-right">` +
      `<div class="fx-paper__title">TRANSFER OFFER</div>` +
      `<div class="apo-cec">` +
        `<div class="apo-cec__head">Chief Executive Comments:</div>` +
        `<div class="apo-cec__body">${cecBody}</div>` +
      `</div>` +
      `<div class="apo-toggle" data-action="offer-mode-toggle">${glyphPill("lt")}${glyphPill("rt")} BUY</div>` +
      `<div class="apo-row"><span class="k">Rem. Transfer Budget</span><span class="v${over ? " apo-over" : ""}">${money(state.finances.transferBudget)}</span></div>` +
      `<div class="apo-row"><span class="k">Rem. Wage Budget</span><span class="v">${money(state.finances.wageCeiling)}</span></div>` +
      (editingFee
        ? `<div class="fx-input-row apo-inputrow"><span>Offered Transfer Sum:</span><input type="number" min="0" step="1000" class="apo-directinput" id="apo-fee-input" value="${n.feeOffer}"></div>`
        : fxInputRow({ label: "Offered Transfer Sum:", value: money(n.feeOffer), action: "fee" })) +
      `<div class="apo-row apo-clickable" data-action="exchange-open"><span class="k">And/Or Player:</span><span class="v">${exchangePlayer ? exchangePlayer.commonName : "Select Player"}</span></div>` +
      rejectedNote +
      `<div class="apo-submit" data-action="submit-fee">SUBMIT OFFER</div>` +
      signaturesHtml() +
    `</div>`
  );
}

function loanOfferRightHtml(state, n) {
  return (
    `<div class="fx-paper apo-right">` +
      `<div class="fx-paper__title">TRANSFER OFFER</div>` +
      `<div class="apo-cec">` +
        `<div class="apo-cec__head">Chief Executive Comments:</div>` +
        `<div class="apo-cec__body">I have nothing to add on this loan offer.</div>` +
      `</div>` +
      `<div class="apo-toggle" data-action="offer-mode-toggle">${glyphPill("lt")}${glyphPill("rt")} LOAN</div>` +
      `<div class="apo-row"><span class="k">Rem. Transfer Budget</span><span class="v">${money(state.finances.transferBudget)}</span></div>` +
      `<div class="apo-row"><span class="k">Rem. Wage Budget</span><span class="v">${money(state.finances.wageCeiling)}</span></div>` +
      `<div class="apo-row apo-editable" data-action="loan-bonus"><span class="k">Bonus Per Goal</span><span class="apo-steppers"><button type="button" class="fx-stepper" data-action="loan-bonus-down">&#9668;</button><button type="button" class="fx-stepper" data-action="loan-bonus-up">&#9658;</button></span><span class="v">${n.loanBonusPerGoal}%</span></div>` +
      `<div class="apo-row apo-clickable" data-action="loan-length-toggle"><span class="k">Loan Length</span><span class="v">${n.loanLength === "short" ? "Short Loan" : "Season Loan"}</span></div>` +
      `<div class="apo-row apo-editable" data-action="loan-futurefee"><span class="k">Future Fee</span><span class="apo-steppers"><button type="button" class="fx-stepper" data-action="loan-futurefee-down">&#9668;</button><button type="button" class="fx-stepper" data-action="loan-futurefee-up">&#9658;</button></span><span class="v">${n.loanFutureFee == null ? "Not Set" : money(n.loanFutureFee)}</span></div>` +
      `<div class="apo-submit" data-action="submit-loan">SUBMIT OFFER</div>` +
      signaturesHtml() +
    `</div>`
  );
}

function signaturesHtml() {
  const squiggle = `<svg viewBox="0 0 90 30" xmlns="http://www.w3.org/2000/svg"><path d="M4 22c6-14 10-14 14-4s8 10 12-2 8-12 12-2 8 10 12-2 8-10 12 0" fill="none" stroke="#2b2822" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  return (
    `<div class="fx-paper__signatures">` +
      `<div class="fx-paper__sig">${squiggle}<div class="fx-paper__sig-label">Chief Executive</div></div>` +
      `<div class="fx-paper__sig"><div class="fx-paper__sig-label">Manager</div></div>` +
    `</div>`
  );
}

function exchangePickerHtml(state) {
  const roster = state.squad.roster;
  const table = fxTable({
    columns: [{ key: "pos", label: "Pos" }, { key: "name", label: "Name" }, { key: "value", label: "Value", numeric: true }],
    rows: roster,
    cellHtml: (col, p) => {
      if (col.key === "pos") return `${posBar(positionInfo(p.position).area)}${p.position}`;
      if (col.key === "value") return money(p.value);
      return p.commonName;
    },
  });
  return (
    `<div class="apo-exchangepicker">` +
      `<div class="apo-exchangepicker__title">Select Player</div>` +
      `<div class="apo-exchangepicker__body">${table}</div>` +
      actionPrompt("b", "exchange-close", "Back") +
    `</div>`
  );
}

/* ============================================================================
 * CONTRACT NEGOTIATION (shared by F3's own transfer/free-agent contract-talks
 * phase and F6's future renewal flow — ms_CONTRACTS_SCREEN_CONTRACT_
 * NEGOTIATION.png)
 * ========================================================================== */

function contractNegotiationHtml(state, n) {
  const player = state.playersById.get(n.playerId);
  const sellingClub = state.clubsById.get(n.sourceClubId);
  const ask = computeSigningAsk({ player, sourceClub: sellingClub, destClub: state.club, state });
  const area = positionInfo(player.position).area;
  const roleLabel = SQUAD_ROLE_DISPLAY[n.promisedRole] || "Do Not Specify";

  return (
    `<div class="fx-panel cn-panel">` +
      `<div class="fx-panel__titlebar"><span class="fx-panel__title">CONTRACT NEGOTIATION</span></div>` +
      `<div class="fx-panel__body cn-body">` +
        `<div class="cn-head">` +
          `<div class="cn-head__left">` +
            `<div class="cn-head__name">${player.firstName}<br>${player.lastName}</div>` +
            `<div class="cn-head__ovr">${player.overall}<span>OVR</span></div>` +
            `<div class="cn-head__pos">${posBar(area)}${player.position}</div>` +
          `</div>` +
          `<span class="avatar cn-head__portrait"></span>` +
          `<div class="cn-head__budgets">` +
            `<div><span class="k">Transfer Budget</span><span class="v">${money(state.finances.transferBudget)}</span></div>` +
            `<div><span class="k">Rem. Wage Budget (per Week)</span><span class="v">${money(state.finances.wageCeiling)}</span></div>` +
          `</div>` +
        `</div>` +
        `<div class="cn-cols">` +
          `<div class="cn-col">` +
            `<div class="cn-col__head">New Contract Details</div>` +
            `<div class="cn-demands">` +
              `<div class="cn-demands__title">Player Demands:</div>` +
              `<div class="apo-row"><span class="k">Length</span><span class="v">${n.contractOffer.years} Year(s)</span></div>` +
              `<div class="apo-row"><span class="k">Salary (Per Week)</span><span class="v">${money(ask.wage)}</span></div>` +
            `</div>` +
            `<div class="apo-row apo-editable" data-action="contract-years"><span class="k">Additional Years</span><span class="apo-steppers"><button type="button" class="fx-stepper" data-action="contract-years-down">&#9668;</button><button type="button" class="fx-stepper" data-action="contract-years-up">&#9658;</button></span><span class="v">${n.contractOffer.years} Year(s)</span></div>` +
            `<div class="apo-row apo-editable" data-action="contract-wage"><span class="k">Salary (Per Week)</span><span class="apo-steppers"><button type="button" class="fx-stepper" data-action="contract-wage-down">&#9668;</button><button type="button" class="fx-stepper" data-action="contract-wage-up">&#9658;</button></span><span class="v">${money(n.contractOffer.wage)}</span></div>` +
            `<div class="apo-row apo-editable" data-action="contract-bonus"><span class="k">Bonus Per Goal</span><span class="apo-steppers"><button type="button" class="fx-stepper" data-action="contract-bonus-down">&#9668;</button><button type="button" class="fx-stepper" data-action="contract-bonus-up">&#9658;</button></span><span class="v">${n.contractOffer.bonusPerGoal || 0}%</span></div>` +
            `<div class="apo-row apo-clickable" data-action="contract-role"><span class="k">Squad Role:</span><span class="v">${roleLabel}</span></div>` +
            `<div class="apo-row apo-editable" data-action="contract-signing"><span class="k">Signing On Fee</span><span class="apo-steppers"><button type="button" class="fx-stepper" data-action="contract-signing-down">&#9668;</button><button type="button" class="fx-stepper" data-action="contract-signing-up">&#9658;</button></span><span class="v">${money(n.contractOffer.signingOnFee || 0)}</span></div>` +
            signaturesHtml() +
          `</div>` +
          `<div class="cn-col">` +
            `<div class="cn-col__head">CURRENT CONTRACT</div>` +
            `<div class="cn-col__crestrow"><span>${player.lastName}</span><svg class="crest crest--sm"><use href="#crest-${sellingClub.id}"></use></svg></div>` +
            `<div class="apo-row"><span class="k">Appearances</span><span class="v">0</span></div>` +
            `<div class="apo-row"><span class="k">Goals</span><span class="v">0</span></div>` +
            `<div class="apo-row"><span class="k">Rem. Contract</span><span class="v">${(() => { const r = remainingContractYM(state, player.contract.endYear); return `Years: ${r.years}, Months: ${r.months}`; })()}</span></div>` +
            `<div class="apo-row"><span class="k">Salary (Per Week)</span><span class="v">${money(player.contract.wage)}</span></div>` +
            `<div class="apo-row"><span class="k">Bonus Per Goal</span><span class="v">${player.contract.bonusPerGoal || 0}%</span></div>` +
            `<div class="apo-row"><span class="k">Squad Role</span><span class="v">${SQUAD_ROLE_DISPLAY[player.contract.squadRole] || "Do Not Specify"}</span></div>` +
            `<div class="apo-section">Estimated Worth</div>` +
            `<div class="apo-row"><span class="v apo-worth">${money(player.value)}</span></div>` +
            signaturesHtml() +
          `</div>` +
        `</div>` +
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

  if (n.phase === "fee") {
    container.innerHTML = state.ui.transferSearch.exchangePickerOpen
      ? exchangePickerHtml(state)
      : playerInfoPaperHtml(state, player, club) + transferOfferRightHtml(state, n, player, club);
    footer.innerHTML = state.ui.transferSearch.exchangePickerOpen
      ? ""
      : (actionPrompt("x", "reset-fee", "Reset") + actionPrompt("b", "back", "Cancel") + actionPrompt("rs", "player-bio", "Player Bio"));
    if (state.ui.negotiation.editingFeeOffer) {
      const input = document.getElementById("apo-fee-input");
      if (input) { input.focus(); input.select(); }
    }
    return;
  }
  if (n.phase === "loan") {
    container.innerHTML = playerInfoPaperHtml(state, player, club) + loanOfferRightHtml(state, n);
    footer.innerHTML = actionPrompt("x", "reset-fee", "Reset") + actionPrompt("b", "back", "Cancel") + actionPrompt("rs", "player-bio", "Player Bio");
    return;
  }
  if (n.phase === "fee-waiting" || n.phase === "loan-waiting") {
    const counterBanner = n.lastFeeResponse === "countered"
      ? `<div class="ng-banner ng-banner--counter">The club has come back with a counter-offer of ${money(n.counterFee)} (round ${n.round}/${MAX_COUNTER_OFFERS}).</div>` : "";
    container.innerHTML = counterBanner + `<div class="ng-waiting">Offer submitted — awaiting a response from the club…</div>`;
    footer.innerHTML = actionPrompt("b", "back", "Back");
    return;
  }
  if (n.phase === "contract" || n.phase === "contract-waiting" || n.phase === "approach-waiting") {
    if (n.phase !== "contract") {
      const freeAgentNote = n.dealType === "free-agent"
        ? `<div class="ng-note">Pre-contract talks — ${player.commonName} will join for free the moment his current deal expires.</div>` : "";
      container.innerHTML = freeAgentNote + `<div class="ng-waiting">Terms sent — awaiting a response…</div>`;
      footer.innerHTML = actionPrompt("b", "back", "Back");
      return;
    }
    container.innerHTML = contractNegotiationHtml(state, n);
    footer.innerHTML = actionPrompt("a", "submit-contract", "Offer New Contract") + actionPrompt("b", "back", "Back");
    return;
  }
  if (n.phase === "completed") {
    const msg = n.dealType === "loan" ? `${player.commonName} has joined on loan.`
      : n.dealType === "free-agent" ? `${player.commonName} has agreed to join on a free transfer once his contract expires.`
      : `${player.commonName} has signed for the club!`;
    container.innerHTML = `<div class="ng-result ng-result--accepted">${msg}</div>`;
    footer.innerHTML = prompt("b", "B", "back", "Close");
    return;
  }
  // 'rejected'
  container.innerHTML = `<div class="ng-result ng-result--rejected">The ${dealNoun(n.dealType)} talks have fallen through.</div>`;
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
