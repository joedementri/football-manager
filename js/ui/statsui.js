// ui/statsui.js — Season ▸ Team Stats + Player Stats (fable-plans/plan1.md
// M11: these were the last two static-placeholder Season screen tiles).
// Both browse every league in data/leagues.json (not just the user's own),
// reading whichever club's roster via state.playersByClub — already built
// for every club in the world by core/store.js's deriveIndices, not just the
// user's (M4/M8's own precedent: the match sim and GTN both need any club's
// squad on demand). Pure render-from-state; all mutation via core/store.js's
// openTeamStats/teamStatsChangeLeague/teamStatsSelectClub/teamStatsChangeClub/
// teamStatsBackToSelect/toggleTeamStatsSort and openPlayerStats/
// playerStatsChangeLeague/playerStatsChangeCategory.

function clubsInLeague(state, league) {
  return state.staticData.clubs
    .filter((c) => (state.clubLeague.get(c.id) ?? c.leagueId) === league.id)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* ============================================================================
 * Team Stats
 * ========================================================================== */

function renderTeamSelect(state, league) {
  const clubs = clubsInLeague(state, league);
  const rows = clubs.map((c) => (
    `<div class="jb-row" data-action="select-club" data-value="${c.id}">` +
      `<svg class="crest crest--sm"><use href="#crest-${c.id}"></use></svg>` +
      `<div class="jb-meta"><div class="jb-name">${c.name}</div></div>` +
    `</div>`
  )).join("");
  return `<div class="jb-header">Select Team</div><div class="jb-list">${rows}</div>`;
}

function statsTableRows(roster, sortDir) {
  const dir = sortDir === "asc" ? 1 : -1;
  const sorted = [...roster].sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0) * dir);
  return sorted.map((p) => (
    `<tr class="sl-row" data-action="view-player" data-value="${p.id}">` +
      `<td>${p.position}</td><td class="sl-name">${p.commonName}</td>` +
      `<td class="num">${p.seasonStats.apps}</td><td class="num">${p.seasonStats.goals}</td>` +
      `<td class="num">${p.seasonStats.assists}</td><td class="num">${p.seasonStats.cleanSheets}</td>` +
      `<td class="num">${p.seasonStats.yellows}</td><td class="num">${p.seasonStats.reds}</td>` +
      `<td class="num">${(p.seasonStats.avgRating / 10).toFixed(2)}</td>` +
    `</tr>`
  )).join("");
}

function renderTeamSelected(state, club) {
  const roster = state.playersByClub.get(club.id) || [];
  const rows = statsTableRows(roster, state.ui.teamStats.sortDir);
  return (
    `<div class="jb-header">${club.name}</div>` +
    `<table class="tbl sl-table ts-table">` +
      `<thead><tr>` +
        `<th class="ts-sort" data-action="sort">Pos${state.ui.teamStats.sortDir === "asc" ? " ▲" : " ▼"}</th><th>Name</th>` +
        `<th>APP</th><th>GLS</th><th>AST</th><th>CS</th><th>YEL</th><th>RED</th><th>AVG</th>` +
      `</tr></thead>` +
      `<tbody>${rows}</tbody>` +
    `</table>`
  );
}

export function renderTeamStats(state) {
  const s = state.ui.teamStats;
  const league = state.staticData.leagues[s.leagueIndex];
  document.getElementById("ts-league-name").textContent = league.name;
  const club = s.clubId != null ? state.clubsById.get(s.clubId) : null;
  document.getElementById("ts-body").innerHTML = s.view === "team" && club ? renderTeamSelected(state, club) : renderTeamSelect(state, league);
}

/* ============================================================================
 * Player Stats
 * ========================================================================== */

const CATEGORY_LABEL = {
  topScorers: "Top Scorers", assists: "Assists", cleanSheets: "Clean Sheets",
  yellowCards: "Yellow Cards", redCards: "Red Cards",
};
const CATEGORY_FIELD = {
  topScorers: "goals", assists: "assists", cleanSheets: "cleanSheets",
  yellowCards: "yellows", redCards: "reds",
};
const CATEGORY_COLUMN = {
  topScorers: "Goals", assists: "Assists", cleanSheets: "Clean Sheets",
  yellowCards: "Yellow Cards", redCards: "Red Cards",
};
const MAX_ROWS = 20;

export function renderPlayerStats(state) {
  const s = state.ui.playerStats;
  const league = state.staticData.leagues[s.leagueIndex];
  document.getElementById("ps-league-name").textContent = league.name;
  document.getElementById("ps-category").textContent = CATEGORY_LABEL[s.category];

  const field = CATEGORY_FIELD[s.category];
  const clubs = clubsInLeague(state, league);
  const players = clubs.flatMap((c) => (state.playersByClub.get(c.id) || []).map((p) => ({ p, club: c })));
  const ranked = players
    .filter(({ p }) => p.seasonStats[field] > 0)
    .sort((a, b) => b.p.seasonStats[field] - a.p.seasonStats[field])
    .slice(0, MAX_ROWS);

  const body = document.getElementById("ps-body");
  if (!ranked.length) {
    body.innerHTML = `<div class="empty"><span class="lbl">No Statistics Available</span></div>`;
    return;
  }

  const rows = ranked.map(({ p, club }, i) => (
    `<tr>` +
      `<td class="num">${i + 1}</td><td class="sl-name">${p.commonName}</td>` +
      `<td><svg class="crest crest--xs"><use href="#crest-${club.id}"></use></svg> ${club.shortName}</td>` +
      `<td class="num">${p.seasonStats[field]}</td>` +
    `</tr>`
  )).join("");

  body.innerHTML =
    `<table class="tbl ps-table">` +
      `<thead><tr><th>Rank</th><th>Name</th><th>Team</th><th>${CATEGORY_COLUMN[s.category]}</th></tr></thead>` +
      `<tbody>${rows}</tbody>` +
    `</table>`;
}
