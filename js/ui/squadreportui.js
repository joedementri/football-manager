// ui/squadreportui.js — Squad ▸ Squad Report + Squad Ranking (fable-plans/
// plan1.md's Squad screen carousel tile, M11: these two were the last
// static-placeholder pages left on the Squad screen). Both read the same
// `state.squad.roster`, so they share this file (same precedent as
// ui/transfersui.js bundling Search/Negotiation/Sell-List/Request-Funds).
//
// Squad Report: a roster list + one selected player's identity card and
// season/career stats. Squad Ranking: the whole squad ranked by this
// season's average match rating (engine/form.js's rankSquadByForm), with a
// side panel showing the club's most recent + next fixture (state.
// lastMatchReport — engine/career.js's own header explains where that comes
// from). Pure render-from-state; all mutation happens via core/store.js's
// openSquadReport/selectSquadReportPlayer/toggleSquadReportSort/
// openSquadRanking.

import { money, monthYearShort, dateDayMonth } from "../core/format.js";
import { fromEpochDay } from "../core/clock.js";
import { rankSquadByForm } from "../engine/form.js";
import { upcomingFixtures } from "../engine/calendar.js";

/* ============================================================================
 * Squad Report
 * ========================================================================== */

function sortedRosterByPosition(state) {
  const dir = state.ui.squadReport.sortDir === "asc" ? 1 : -1;
  return [...state.squad.roster].sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0) * dir);
}

export function injuryStatusLabel(player) {
  if (!player.injury) return "Match Fit";
  const label = player.injury.type.charAt(0).toUpperCase() + player.injury.type.slice(1);
  return `${label} injury — ${player.injury.daysLeft}d left`;
}

function sumCareerStats(player) {
  return player.careerStats.reduce((sum, s) => ({
    apps: sum.apps + s.apps, goals: sum.goals + s.goals, assists: sum.assists + s.assists,
    cleanSheets: sum.cleanSheets + s.cleanSheets, yellows: sum.yellows + s.yellows, reds: sum.reds + s.reds,
    ratingWeighted: sum.ratingWeighted + s.avgRating * s.apps,
  }), { apps: 0, goals: 0, assists: 0, cleanSheets: 0, yellows: 0, reds: 0, ratingWeighted: 0 });
}

function statsRow(label, s) {
  const avg = s.apps ? (s.avgRating ?? (s.ratingWeighted / s.apps)) : 0;
  return (
    `<tr><td>${label}</td><td class="num">${s.apps}</td><td class="num">${s.goals}</td>` +
    `<td class="num">${s.assists}</td><td class="num">${s.cleanSheets}</td>` +
    `<td class="num">${s.yellows}</td><td class="num">${s.reds}</td>` +
    `<td class="num">${(avg / 10).toFixed(1)}</td></tr>`
  );
}

function renderSquadReportCard(player, state) {
  const club = state.clubsById.get(player.clubId);
  document.getElementById("sqr-card").innerHTML =
    `<div class="sqr-card__banner">` +
      `<svg class="crest crest--sm"><use href="#crest-${club.id}"></use></svg>` +
      `<span class="sqr-card__name">${player.commonName}</span>` +
    `</div>` +
    `<div class="sqr-card__club">${club.name}</div>` +
    `<div class="sqr-card__grid">` +
      `<div><span class="k">OVR</span><span class="v">${player.overall}</span></div>` +
      `<div><span class="k">POS</span><span class="v">${player.position}</span></div>` +
      `<div><span class="k">AGE</span><span class="v">${player.age}</span></div>` +
    `</div>` +
    `<div class="sqr-card__row"><span class="k">VALUE</span><span class="v">${money(player.value)}</span></div>` +
    `<div class="sqr-card__row"><span class="k">FORM</span><span class="v">${player.form} / 10</span></div>` +
    `<div class="sqr-card__row"><span class="k">MORALE</span><span class="v">${player.morale} / 10</span></div>`;
}

function renderSquadReportDetail(player, state) {
  const career = sumCareerStats(player);
  document.getElementById("sqr-detail").innerHTML =
    `<div class="panel-title">STATUS &amp; STATS</div>` +
    `<div class="sqr-fact"><span class="k">At Club Since</span><span class="v">${player.joinedClubYear}</span></div>` +
    `<div class="sqr-fact"><span class="k">Injury Status</span><span class="v">${injuryStatusLabel(player)}</span></div>` +
    `<table class="tbl sqr-stats">` +
      `<thead><tr><th class="l">&nbsp;</th><th>APP</th><th>G</th><th>A</th><th>CS</th><th>YEL</th><th>RED</th><th>AVG</th></tr></thead>` +
      `<tbody>` +
        statsRow("This Season", player.seasonStats) +
        statsRow("Career", career) +
      `</tbody>` +
    `</table>`;
}

export function renderSquadReport(state) {
  const roster = sortedRosterByPosition(state);
  const selectedId = state.ui.squadReport.selectedPlayerId;

  const rows = roster.map((p) => (
    `<tr class="sl-row${p.id === selectedId ? " is-sel" : ""}" data-player="${p.id}">` +
      `<td>${p.position}</td><td class="sl-name">${p.commonName}</td>` +
    `</tr>`
  )).join("");

  document.getElementById("sqr-list").innerHTML =
    `<table class="tbl sl-table sqr-list-table">` +
      `<thead><tr><th class="sqr-sort" data-action="sort">Pos${state.ui.squadReport.sortDir === "asc" ? " ▲" : " ▼"}</th><th>Name</th></tr></thead>` +
      `<tbody>${rows}</tbody>` +
    `</table>`;

  const player = state.playersById.get(selectedId) || roster[0];
  if (player) {
    renderSquadReportCard(player, state);
    renderSquadReportDetail(player, state);
  }
}

/* ============================================================================
 * Squad Ranking
 * ========================================================================== */

const ARROW = { up: `<span class="sqk-arrow sqk-arrow--up">&#9650;</span>`, down: `<span class="sqk-arrow sqk-arrow--down">&#9660;</span>`, same: `<span class="sqk-arrow sqk-arrow--same">&mdash;</span>` };

function frmClass(avgRating) {
  const scaled = avgRating / 10;
  if (scaled >= 7) return "sqk-frm--good";
  if (scaled >= 6) return "sqk-frm--ok";
  return "";
}

function renderRankingList(state) {
  const ranked = rankSquadByForm(state.squad.roster);
  const arrows = state.ui.squadRanking.arrows;
  const rows = ranked.map(({ player, rank }) => (
    `<tr class="sl-row">` +
      `<td>${ARROW[arrows[player.id] || "same"]} ${rank}</td>` +
      `<td>${player.position}</td>` +
      `<td class="num sl-ovr">${player.overall}</td>` +
      `<td class="num"><span class="sqk-frm ${frmClass(player.seasonStats.avgRating)}">${(player.seasonStats.avgRating / 10).toFixed(1)}</span></td>` +
      `<td class="sl-name">${player.commonName}</td>` +
    `</tr>`
  )).join("");

  document.getElementById("sqk-list").innerHTML =
    `<table class="tbl sl-table sqk-table">` +
      `<thead><tr><th>Rank</th><th>Pos</th><th>OVR</th><th>FRM</th><th>Player</th></tr></thead>` +
      `<tbody>${rows}</tbody>` +
    `</table>`;
}

function renderRankingSide(state) {
  const club = state.club;
  const report = state.lastMatchReport;
  const upcoming = upcomingFixtures(state.fixtures, club.id, state.calendar.today, 1)[0];

  let prevHtml = `<div class="empty-inline">No matches played yet</div>`;
  if (report) {
    const opp = state.clubsById.get(report.opponentClubId);
    const homeGoals = report.isHome ? report.forGoals : report.againstGoals;
    const awayGoals = report.isHome ? report.againstGoals : report.forGoals;
    const homeName = report.isHome ? club.shortName : opp.shortName;
    const awayName = report.isHome ? opp.shortName : club.shortName;
    const motmPlayer = report.motm ? state.playersById.get(report.motm.playerId) : null;
    prevHtml =
      `<div class="sqk-match__date">${monthYearShort(fromEpochDay(report.date))}</div>` +
      `<div class="sqk-match__row"><span class="sqk-match__team">${homeName}</span><span class="sqk-match__score">${homeGoals}</span></div>` +
      `<div class="sqk-match__row"><span class="sqk-match__team">${awayName}</span><span class="sqk-match__score">${awayGoals}</span></div>` +
      (motmPlayer ? (
        `<div class="sqk-motm">` +
          `<span class="avatar"></span>` +
          `<div class="sqk-motm__stats"><span class="sqk-motm__rating">${(report.motm.rating / 10).toFixed(1)}</span>` +
            `<span class="sqk-motm__line">GLS ${report.motm.goals} &middot; AST ${report.motm.assists}</span></div>` +
          `<div class="sqk-motm__name">${motmPlayer.commonName}</div>` +
        `</div>`
      ) : "");
  }

  let nextHtml = `<div class="empty-inline">No fixture scheduled</div>`;
  if (upcoming) {
    const isHome = upcoming.homeClubId === club.id;
    const oppId = isHome ? upcoming.awayClubId : upcoming.homeClubId;
    const opp = state.clubsById.get(oppId);
    nextHtml =
      `<div class="sqk-match__date">${dateDayMonth(upcoming.date)}</div>` +
      `<div class="sqk-match__row"><svg class="crest crest--xs"><use href="#crest-${club.id}"></use></svg><span class="sqk-match__team">${club.shortName}</span></div>` +
      `<div class="sqk-match__row"><svg class="crest crest--xs"><use href="#crest-${opp.id}"></use></svg><span class="sqk-match__team">${opp.shortName}</span></div>`;
  }

  document.getElementById("sqk-side").innerHTML =
    `<div class="sqk-side__head"><svg class="crest crest--sm"><use href="#crest-${club.id}"></use></svg><span class="sqk-side__name">${club.name}</span></div>` +
    `<div class="panel-title">Previous Match Result</div>${prevHtml}` +
    `<div class="panel-title">Upcoming Match</div>${nextHtml}`;
}

export function renderSquadRanking(state) {
  renderRankingList(state);
  renderRankingSide(state);
}
