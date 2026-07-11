// engine/awards.js — end-of-season awards (fable-plans/plan1.md M5 "Season
// rollover": "awards (league champions, golden boot, best XI news)"). Rather
// than building a whole separate news-generation system this milestone
// (plan1.md's broader "News/email generators (news.js, email.js)" section
// spans transfer/scouting/youth/intl content that doesn't exist until much
// later milestones), awards are delivered the same way every other M3/M5
// board communication already is: one real inbox email, scoped to the
// user's own league + domestic cup (not all ~35 leagues — the user only
// ever sees their own standings screen anyway).

import { positionInfo } from "../config/positions.js";
import { toField, surname } from "./objectives.js";

const BEST_XI_SHAPE = { GK: 1, DEF: 4, MID: 4, ATT: 2 };
const MIN_APPS_FOR_AWARD = 10;

function topScorer(players) {
  const eligible = players.filter((p) => p.seasonStats.goals > 0);
  if (!eligible.length) return null;
  return eligible.reduce((a, b) => (b.seasonStats.goals > a.seasonStats.goals ? b : a));
}

function bestXI(players) {
  const byArea = { GK: [], DEF: [], MID: [], ATT: [] };
  for (const p of players) {
    if (p.seasonStats.apps < MIN_APPS_FOR_AWARD) continue;
    byArea[positionInfo(p.position).area].push(p);
  }
  const xi = [];
  for (const [area, count] of Object.entries(BEST_XI_SHAPE)) {
    const sorted = [...byArea[area]].sort((a, b) => b.seasonStats.avgRating - a.seasonStats.avgRating);
    xi.push(...sorted.slice(0, count));
  }
  return xi;
}

/**
 * @param {object} opts
 * @param {object} opts.league
 * @param {object[]} opts.table - engine/comps/league.js's buildLeagueTable() rows (final standings)
 * @param {object[]} opts.leaguePlayers - every player at a club in this league
 * @param {string|null} opts.cupName - the user's domestic cup, if it finished
 * @param {string|null} opts.cupChampionName - that cup's winning club name
 * @param {object} opts.managerClub
 * @param {string} opts.managerName
 * @param {Date} opts.today
 */
export function buildSeasonAwardsEmail({ league, table, leaguePlayers, cupName, cupChampionName, managerClub, managerName, today }) {
  const champion = table[0]?.club;
  const scorer = topScorer(leaguePlayers);
  const xi = bestXI(leaguePlayers);

  const body = [`Dear Mr. ${surname(managerName)},`, "As the curtain falls on another season, here's how it all finished:"];
  if (champion) body.push(`${league.name} Champions: ${champion.name}`);
  if (scorer) body.push(`Golden Boot: ${scorer.commonName} (${scorer.seasonStats.goals} goals)`);
  if (cupChampionName) body.push(`${cupName} Winners: ${cupChampionName}`);
  if (xi.length) body.push(`Team of the Season: ${xi.map((p) => `${p.commonName} (${p.position})`).join(", ")}`);
  body.push("Congratulations to all involved, and we look forward to another exciting campaign ahead.");

  return {
    from: `${league.name.toUpperCase()} FOOTBALL ASSOCIATION`,
    to: toField(managerName), cc: "Assistant Manager", crest: `crest-${managerClub.id}`,
    date: new Date(today), read: false,
    subject: "End of Season Awards",
    body,
  };
}
