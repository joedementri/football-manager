// ui/negotiationsui.js — F4 (fable-plans/plan2.md): TRANSFER NEGOTIATIONS
// (ms_TRANSFER_NEGOTIATIONS_OFFERS_RECEIVED/SENT/SUCCESSFUL/UNSUCCESSFUL.png).
// engine/negotiationlog.js owns the actual data (Sent/Received derived live,
// Successful/Unsuccessful read the persisted terminal log) — this file only
// normalizes those 3 different row shapes into one common view-model so the
// right-hand "Transfer Information"/"Negotiation Information" panel is
// rendered by a single function regardless of which tab is showing.

import { money, dateSlash } from "../core/format.js";
import { positionInfo } from "../config/positions.js";
import { posBar, fxPanel, actionPrompt } from "./panelkit.js";
import { sentLedgerRow, receivedLedgerRows, successfulEntries, unsuccessfulEntries } from "../engine/negotiationlog.js";
import { toEpochDay } from "../core/clock.js";

const TABS = ["Transfer Offers Received", "Transfer Offers Sent", "Successful Negotiations", "Unsuccessful Negotiations"];

/** Rows for the currently-active tab, each already carrying enough to build
 * both the left list row and (once selected) the right detail panel — see
 * each branch's own comment for where its fields come from. */
function rowsForTab(state, tab) {
  if (tab === 0) {
    return receivedLedgerRows(state).map((r) => {
      const player = state.playersById.get(r.playerId);
      const daysLeft = Math.max(0, toEpochDay(r.expiresDate) - toEpochDay(state.calendar.today));
      return {
        player, fromClubId: r.fromClubId, toClubId: r.toClubId, dealType: r.dealType,
        negStatus: r.negStatus, expires: `${daysLeft} Day(s)`, expiresDate: r.expiresDate,
        estimatedWorth: player.value, transferFee: r.offer,
        current: { wage: player.contract.wage, years: Math.max(0, player.contract.endYear - state.seasonStartYear), bonus: player.contract.bonusPerGoal || 0 },
        offered: null,
      };
    });
  }
  if (tab === 1) {
    const row = sentLedgerRow(state);
    if (!row) return [];
    const n = row.negotiation;
    const player = state.playersById.get(row.playerId);
    // The real scheduled due date (state.transfers.pendingOffers), if this
    // deal is currently in a "-waiting" phase — deadline-day submissions
    // resolve synchronously and never queue an entry at all, so there's
    // nothing to show as "Expires" for those (falls through to "—").
    const pending = state.transfers.pendingOffers.find((o) => o.playerId === row.playerId);
    const expires = pending ? dateSlash(pending.dueDate) : "—";
    return [{
      player, fromClubId: row.fromClubId, toClubId: row.toClubId, dealType: row.dealType,
      negStatus: row.negStatus, expires, expiresDate: null,
      estimatedWorth: player.value, transferFee: row.dealType === "transfer" ? n.feeOffer : (row.dealType === "loan" ? 0 : null),
      current: { wage: player.contract.wage, years: Math.max(0, player.contract.endYear - state.seasonStartYear), bonus: player.contract.bonusPerGoal || 0 },
      offered: n.contractOffer ? { wage: n.contractOffer.wage, years: n.contractOffer.years, bonus: n.contractOffer.bonusPerGoal || 0 } : null,
    }];
  }
  const entries = tab === 2 ? successfulEntries(state) : unsuccessfulEntries(state);
  return entries.map((e) => ({
    player: state.playersById.get(e.playerId), fromClubId: e.fromClubId, toClubId: e.toClubId, dealType: e.dealType,
    negStatus: e.negStatus, expires: dateSlash(e.date), expiresDate: null,
    estimatedWorth: e.estimatedWorth, transferFee: e.transferFee,
    current: e.current, offered: e.offered, transferTypeOverride: e.transferType,
  }));
}

function transferTypeLabel(row) {
  if (row.transferTypeOverride) return row.transferTypeOverride;
  return row.dealType === "loan" ? "Loan" : row.dealType === "free-agent" ? "Free Transfer" : "Purchase";
}

function contractLineHtml(label, current, offered, fmt) {
  return (
    `<div class="tn-negrow"><span class="k">${label}:</span>` +
      `<span class="cur">${current != null ? fmt(current) : "N/A"}</span>` +
      `<span class="off">${offered != null ? fmt(offered) : "N/A"}</span>` +
    `</div>`
  );
}

function detailPanelHtml(state, row) {
  const fromClub = state.clubsById.get(row.fromClubId);
  const toClub = state.clubsById.get(row.toClubId);
  return (
    `<div class="tn-detail">` +
      `<div class="tn-detail__head">` +
        `<div class="tn-detail__col"><div class="tn-detail__lbl">From</div></div>` +
        `<div class="tn-detail__col"><div class="tn-detail__lbl">To</div></div>` +
      `</div>` +
      `<div class="tn-detail__crests">` +
        `<svg class="crest"><use href="#crest-${fromClub.id}"></use></svg>` +
        `<span class="tn-detail__arrow">&#8811;</span>` +
        `<svg class="crest"><use href="#crest-${toClub.id}"></use></svg>` +
      `</div>` +
      `<div class="tn-section">Transfer Information</div>` +
      `<div class="tn-row"><span class="k">Transfer Type:</span><span class="v">${transferTypeLabel(row)}</span></div>` +
      `<div class="tn-row"><span class="k">Neg. Status</span><span class="v">${row.negStatus}</span></div>` +
      `<div class="tn-row"><span class="k">Expires:</span><span class="v">${row.expires}</span></div>` +
      `<div class="tn-row tn-row--gap"><span class="k">Estimated Worth:</span><span class="v">${money(row.estimatedWorth)}</span></div>` +
      `<div class="tn-row"><span class="k">Transfer Fee:</span><span class="v">${row.transferFee != null ? money(row.transferFee) : "N/A"}</span></div>` +
      `<div class="tn-section">Negotiation Information</div>` +
      `<div class="tn-negrow tn-negrow--head"><span></span><span class="cur">CURRENT</span><span class="off">OFFERED</span></div>` +
      contractLineHtml("Wage", row.current ? row.current.wage : null, row.offered ? row.offered.wage : null, money) +
      contractLineHtml("Contract Length", row.current ? row.current.years : null, row.offered ? row.offered.years : null, (v) => `${v} Year(s)`) +
      contractLineHtml("Bonus", row.current ? row.current.bonus : null, row.offered ? row.offered.bonus : null, (v) => `${v}%`) +
    `</div>`
  );
}

function emptyDetailHtml() {
  return (
    `<div class="tn-detail">` +
      `<div class="tn-detail__head">` +
        `<div class="tn-detail__col"><div class="tn-detail__lbl">From</div></div>` +
        `<div class="tn-detail__col"><div class="tn-detail__lbl">To</div></div>` +
      `</div>` +
      `<div class="tn-detail__crests"><span class="tn-detail__arrow">&#8811;</span></div>` +
      `<div class="tn-section">Transfer Information</div>` +
      `<div class="tn-row"><span class="k">Transfer Type:</span><span class="v">N/A</span></div>` +
      `<div class="tn-row"><span class="k">Neg. Status</span><span class="v">N/A</span></div>` +
      `<div class="tn-row tn-row--gap"><span class="k">Estimated Worth:</span><span class="v">N/A</span></div>` +
      `<div class="tn-row"><span class="k">Transfer Fee:</span><span class="v">N/A</span></div>` +
      `<div class="tn-section">Negotiation Information</div>` +
      `<div class="tn-negrow tn-negrow--head"><span></span><span class="cur">CURRENT</span><span class="off">OFFERED</span></div>` +
      contractLineHtml("Wage", null, null, money) +
      contractLineHtml("Contract Length", null, null, (v) => `${v} Year(s)`) +
      contractLineHtml("Bonus", null, null, (v) => `${v}%`) +
    `</div>`
  );
}

export function renderTransferNegotiations(state) {
  const body = document.getElementById("negotiationsledger-body");
  const n = state.ui.negotiationsLedger;
  const dir = n.sortDir === "asc" ? 1 : -1;
  const rows = rowsForTab(state, n.tab).sort((a, b) => (a.player.overall - b.player.overall) * dir);
  const indexKey = ["receivedIndex", "sentIndex", "successfulIndex", "unsuccessfulIndex"][n.tab];
  const selIndex = Math.min(rows.length - 1, Math.max(0, n[indexKey]));
  const caret = n.sortDir === "asc" ? "&#9650;" : "&#9660;";

  const listHtml = rows.length
    ? `<div class="tn-listrow tn-listrow--head"><span></span><span class="tn-listrow__name">Player</span><span class="num">Ovr${caret}</span><span class="tn-listrow__expires">Expires</span></div>` +
      rows.map((r, i) => (
        `<div class="tn-listrow${i === selIndex ? " is-sel" : ""}" data-row="${i}" data-player="${r.player.id}">` +
          `${posBar(positionInfo(r.player.position).area)}${r.player.position}` +
          `<span class="tn-listrow__name">${r.player.commonName}</span>` +
          `<span class="num">${r.player.overall}</span>` +
          `<span class="tn-listrow__expires">${r.expires}</span>` +
        `</div>`
      )).join("")
    : `<div class="empty"><span class="lbl">None</span></div>`;

  const bodyHtml =
    `<div class="tn-body">` +
      `<div class="tn-list">${listHtml}</div>` +
      (rows.length ? detailPanelHtml(state, rows[selIndex]) : emptyDetailHtml()) +
    `</div>`;

  body.innerHTML = fxPanel({
    title: "TRANSFER NEGOTIATIONS",
    context: `Date ${dateSlash(state.calendar.today)}`,
    selectorRows: [[{ glyphs: ["lb", "rb"], value: TABS[n.tab] }]],
    bodyHtml,
    extraClass: "tn-panel",
  });

  const footer = document.getElementById("footer-negotiationsledger");
  footer.innerHTML = rows.length
    ? actionPrompt("x", "sort", "Sort") + actionPrompt("rs", "player-bio", "Player Bio") + actionPrompt("b", "back", "Back")
    : actionPrompt("b", "back", "Back");
}
