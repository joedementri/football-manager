// ui/mycareerui.js — Office ▸ My Career overlay (fable-plans/plan1.md M11:
// "My Career (manager rep, trophy cabinet, history table)"). Three pages,
// cycled by the footer's Prev/Next Page prompts (state.ui.myCareer.page,
// core/store.js's openMyCareer/myCareerChangePage): "overview" (career
// trophy cabinet + career club record), "season" (this season's board
// objectives, read live off state rather than waiting for rollover — the
// Achieved columns read "N/A" until the season actually ends, matching the
// reference screen's own mid-season look) and "history" (one row per
// completed season, newest first, from state.manager.history —
// engine/career.js's own header explains what populates it and when).
// Pure render-from-state, same contract as every other ui/*.js module.

import { money, monthYearShort } from "../core/format.js";
import { fromEpochDay } from "../core/clock.js";
import { domesticCupFor, leagueObjectiveText, cupObjectiveText } from "../engine/objectives.js";
import { cupStatusForClub } from "../engine/comps/cup.js";
import { findClubContinentalCompetition } from "../engine/comps/continental.js";

const PAGE_LABEL = { overview: "Overview", season: "Current Season", history: "Past Seasons" };

function fact(label, value) {
  return `<div class="mc-fact"><span class="k">${label}</span><span class="v">${value}</span></div>`;
}

function clubName(state, clubId) {
  const club = state.clubsById.get(clubId);
  return club ? club.name : "—";
}

function scoreDateLabel(state, rec) {
  if (!rec) return "—";
  const opp = clubName(state, rec.opponentClubId);
  return `${rec.forGoals}-${rec.againstGoals} vs. ${opp}, ${monthYearShort(fromEpochDay(rec.date))}`;
}

function feeRecordLabel(state, rec) {
  if (!rec) return money(0);
  const player = state.playersById.get(rec.playerId);
  const who = player ? ` (${player.commonName})` : "";
  return `${money(rec.fee)}${who} — ${monthYearShort(fromEpochDay(rec.date))}`;
}

function renderOverview(state) {
  const m = state.manager;
  const r = m.record;
  return (
    fact("Clubs", m.clubsManaged.length) +
    fact("League Titles", m.leagueTitles) +
    fact("Domestic Cups Won", m.domesticCupsWon) +
    fact("Continental Cups Won", m.continentalCupsWon) +
    fact("Biggest Win", scoreDateLabel(state, m.biggestWin)) +
    fact("Biggest Defeat", scoreDateLabel(state, m.biggestDefeat)) +
    fact("Record Transfer Fee Paid", feeRecordLabel(state, m.transferFeePaidRecord)) +
    fact("Record Transfer Fee Received", feeRecordLabel(state, m.transferFeeReceivedRecord)) +
    `<div class="mc-fact mc-fact--record">` +
      `<span class="k">Club Record</span>` +
      `<span class="v mc-record">` +
        `<b>P</b> ${r.p} <b>W</b> ${r.w} <b>D</b> ${r.d} <b>L</b> ${r.l} <b>F</b> ${r.gf} <b>A</b> ${r.ga}` +
      `</span>` +
    `</div>`
  );
}

function renderSeason(state) {
  const cup = domesticCupFor(state.league, state.staticData.cups);
  const cupRuntime = cup ? state.cups.get(cup.id) : null;
  const cupStatus = cupRuntime ? cupStatusForClub(cupRuntime, state.club.id) : null;
  const continental = findClubContinentalCompetition(state, state.club.id);
  const tier = state.club.boardExpectationTier;

  const leagueGoal = leagueObjectiveText(tier);
  const rows = [
    fact("Club", state.club.name),
    fact("League", state.league.name),
    fact("League Objective", leagueGoal.charAt(0).toUpperCase() + leagueGoal.slice(1)),
    fact("League Objective Achieved", "N/A"),
  ];
  if (cup) {
    const cupGoal = cupObjectiveText(tier, cup);
    rows.push(
      fact("Domestic Cup Objective", cupGoal.charAt(0).toUpperCase() + cupGoal.slice(1)),
      fact("Domestic Cup Objective Achieved", "N/A"),
      fact(`${cup.name} Progress`, cupStatus && cupStatus.roundLabel ? cupStatus.roundLabel : "Not Yet Drawn"),
    );
  }
  rows.push(fact("Continental", continental ? `${continental.compState.name} — ${continental.status.roundLabel}` : "Not Qualified"));
  rows.push(fact("Manager Reputation", `${state.manager.rep} / 20`));
  return rows.join("");
}

function historyRow(state, h) {
  const leagueResult = h.position ? `${h.position}${h.numClubs ? ` / ${h.numClubs}` : ""}${h.leagueChampion ? " (Champions)" : ""}` : "—";
  const cupResult = h.cupName ? `${h.cupName}: ${h.cupWon ? "Winners" : (h.cupRoundLabel || "—")}` : "—";
  const continentalResult = h.continentalName ? `${h.continentalName}: ${h.continentalWon ? "Winners" : (h.continentalRoundLabel || "—")}` : "—";
  const notes = [];
  if (h.promoted) notes.push("Promoted");
  if (h.relegated) notes.push("Relegated");
  if (h.sacked) notes.push("Sacked");
  return (
    `<tr>` +
      `<td>${h.seasonStartYear}/${String(h.seasonStartYear + 1).slice(2)}</td>` +
      `<td>${h.clubName}</td>` +
      `<td>${h.leagueName}</td>` +
      `<td class="num">${leagueResult}</td>` +
      `<td>${cupResult}</td>` +
      `<td>${continentalResult}</td>` +
      `<td>${notes.join(", ") || "—"}</td>` +
    `</tr>`
  );
}

function renderHistory(state) {
  const history = state.manager.history;
  if (!history.length) {
    return `<div class="empty"><span class="lbl">No completed seasons yet — check back after your first July 1st rollover</span></div>`;
  }
  const rows = history.map((h) => historyRow(state, h)).join("");
  return (
    `<table class="tbl mc-history">` +
      `<thead><tr><th>Season</th><th>Club</th><th>League</th><th>Pos</th><th>Cup</th><th>Continental</th><th>Note</th></tr></thead>` +
      `<tbody>${rows}</tbody>` +
    `</table>`
  );
}

export function renderMyCareer(state) {
  const page = state.ui.myCareer.page;
  const body = document.getElementById("mycareer-body");
  const content = page === "overview" ? renderOverview(state) : page === "season" ? renderSeason(state) : renderHistory(state);

  body.innerHTML =
    `<div class="mc-head">` +
      `<svg class="crest crest--sm"><use href="#crest-${state.club.id}"></use></svg>` +
      `<div class="mc-head__names"><div class="mc-head__manager">${state.manager.name}</div><div class="mc-head__role">Manager</div></div>` +
      `<div class="mc-page-label">${PAGE_LABEL[page]}</div>` +
    `</div>` +
    `<div class="mc-page">${content}</div>`;
}
