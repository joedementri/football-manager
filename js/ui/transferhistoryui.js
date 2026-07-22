// ui/transferhistoryui.js — F4 (fable-plans/plan2.md): TRANSFER HISTORY
// (ms_TRANSFER_HISTORY_SCREEN.png). [PLAN-TEXT CORRECTION, plan2-decisions.md
// F4]: the plan's own build note guessed a §B1 fx-panel with an [LB][RB]
// season selector + totals row — the actual pic shows a completely different,
// simpler screen: two plain text tabs (MY CLUB / ALL CLUBS, no shoulder-
// button glyphs shown) directly over the stadium backdrop, a flat
// DATE/NAME/FROM/TO/DETAILS table with no visible sort caret, and the empty
// state read verbatim off the pic ("There are no transfers available" — note
// singular "available", not the Transfer History's own "None" wording used
// elsewhere). No season selector, no per-window totals row exist in the pic
// at all. Built to match the pic; engine/negotiationlog.js's own header
// explains where MY CLUB/ALL CLUBS' rows come from.

import { money, dateSlash } from "../core/format.js";
import { successfulEntries, worldwideCompletedEntries } from "../engine/negotiationlog.js";
import { actionPrompt } from "./panelkit.js";

function detailsText(entry) {
  if (entry.dealType === "loan") return "Loan";
  if (entry.dealType === "free-agent") return "Free Transfer";
  return money(entry.transferFee);
}

export function renderTransferHistory(state) {
  const body = document.getElementById("transferhistory-body");
  const h = state.ui.transferHistory;
  const entries = h.tab === "myclub" ? successfulEntries(state) : worldwideCompletedEntries(state);

  const rowsHtml = entries.length
    ? entries.map((e, i) => {
        const player = state.playersById.get(e.playerId);
        const fromClub = state.clubsById.get(e.fromClubId);
        const toClub = state.clubsById.get(e.toClubId);
        if (!player || !fromClub || !toClub) return "";
        return (
          `<tr class="${i === h.selectedIndex ? "is-sel" : ""}" data-row="${i}">` +
            `<td>${dateSlash(e.date)}</td>` +
            `<td class="th-name">${player.commonName}</td>` +
            `<td><svg class="crest crest--sm"><use href="#crest-${fromClub.id}"></use></svg>${fromClub.shortName}</td>` +
            `<td><svg class="crest crest--sm"><use href="#crest-${toClub.id}"></use></svg>${toClub.shortName}</td>` +
            `<td>${detailsText(e)}</td>` +
          `</tr>`
        );
      }).join("")
    : "";

  body.innerHTML =
    `<div class="th-tabs">` +
      `<span class="th-tab${h.tab === "myclub" ? " is-active" : ""}" data-tab="myclub">MY CLUB</span>` +
      `<span class="th-tab${h.tab === "allclubs" ? " is-active" : ""}" data-tab="allclubs">ALL CLUBS</span>` +
    `</div>` +
    `<div class="th-tablewrap">` +
      `<table class="th-table">` +
        `<thead><tr><th>DATE</th><th>NAME</th><th>FROM</th><th>TO</th><th>DETAILS</th></tr></thead>` +
        `<tbody>${rowsHtml}</tbody>` +
      `</table>` +
      (entries.length ? "" : `<div class="th-empty">There are no transfers available</div>`) +
    `</div>`;

  const footer = document.getElementById("footer-transferhistory");
  footer.innerHTML = actionPrompt("b", "back", "Back");
}
