// engine/jobs.js — the Browse Jobs market (fable-plans/plan1.md M5 "Season
// frame": "Browse Jobs (Office tile): openings list (CPU managers get
// sacked too — simple rep sim); apply → interview email → offer"; M5's own
// ✔ check: "getting sacked sends you to Browse Jobs").
//
// Scope decision (M5, documented since it affects user-visible flow): this
// milestone's "apply → offer" is a single immediate step — clicking Apply on
// a vacancy accepts it on the spot, rather than a multi-day interview-email
// wait before a separate offer email. The plan's fuller negotiation-style
// flow is left for a later polish pass; what matters for M5's own
// acceptance check is that a sacked manager has a real, playable path back
// into a job via a real screen (ui/jobsui.js), not that the path is deep.
//
// "CPU managers get sacked too — simple rep sim": every other club's final
// league position is judged against its own board-expectation tier with the
// exact same engine/objectives.js evaluation used for the user, then a flat
// chance decides whether that failure actually costs the manager their job
// (real boards don't sack 100% of underperforming managers immediately).

import { pickBestXI } from "../gen/squad.js";
import { buildObjectiveEmails, domesticCupFor, leagueIndex, leagueObjectiveMet } from "./objectives.js";
import { buildLeagueTable } from "./comps/league.js";
import { RngStream, deriveSeed } from "../core/rng.js";

const MAX_VACANCIES = 20;
const CPU_SACK_CHANCE = 0.35; // not INI-derived — a plan-authored "simple rep sim" (see header)

/**
 * Rebuilds the vacancy list at each rollover. `positionByClub` is the final
 * league table position + league size for every club (engine/season.js
 * already computes this for promotion/relegation, reused here so the same
 * standings aren't derived twice).
 * @param {object} state
 * @param {object} opts
 * @param {Map<string,{position:number,numClubs:number}>} opts.positionByClub
 * @param {number} opts.seed
 * @param {number} opts.seasonStartYear
 * @param {string|null} opts.sackedClubId - the user's own former club, if they were just sacked
 */
export function refreshJobMarket(state, { positionByClub, seed, seasonStartYear, sackedClubId }) {
  const rng = new RngStream(deriveSeed(seed, `jobs-${seasonStartYear}`));
  const vacancies = new Set(state.jobMarket.vacancies.filter((id) => id !== state.club.id));
  if (sackedClubId) vacancies.add(sackedClubId);

  for (const club of state.staticData.clubs) {
    if (club.id === state.club.id || vacancies.has(club.id)) continue;
    const pos = positionByClub.get(club.id);
    if (!pos) continue;
    const idx = leagueIndex(pos.position, pos.numClubs);
    const pass = leagueObjectiveMet(club.boardExpectationTier, idx, "check3");
    if (!pass && rng.chance(CPU_SACK_CHANCE)) vacancies.add(club.id);
  }

  let list = [...vacancies];
  if (list.length > MAX_VACANCIES) list = rng.shuffle(list).slice(0, MAX_VACANCIES);
  state.jobMarket.vacancies = list;
}

/** Accepts a vacancy: reassigns the manager's club/league (rebuilding
 * `league.clubs`/`league.table` exactly like core/store.js's deriveIndices
 * and engine/season.js's rollover do — this is the third place `state.league`
 * can change identity, and Central/Season both read `.clubs`/`.table`
 * unconditionally), builds a fresh best-XI lineup from the new club's
 * existing roster, resets sacked/warned status, and sends the same
 * day-1-style board objective emails a New Game would (engine/objectives.js)
 * so the new job feels like a real fresh start. */
export function acceptJob(state, clubId) {
  const club = state.staticData.clubs.find((c) => c.id === clubId);
  const leagueId = state.clubLeague.get(clubId) ?? club.leagueId;
  const league = state.staticData.leagues.find((l) => l.id === leagueId);
  const roster = state.playersByClub.get(clubId) || [];

  state.club = club;
  state.league = league;
  state.league.clubs = [...state.clubsById.values()].filter((c) => c.leagueId === league.id);
  state.league.table = buildLeagueTable(state.league, state.league.clubs, state.fixtures.byLeague.get(league.id), state.results);
  state.squad.lineup = pickBestXI(roster);
  state.manager.sacked = false;
  state.manager.warned = false;

  const cup = domesticCupFor(league, state.staticData.cups);
  const emails = buildObjectiveEmails({ club, league, cup, managerName: state.manager.name, today: state.calendar.today });
  state.inbox.emails.unshift(...emails);

  state.jobMarket.vacancies = state.jobMarket.vacancies.filter((id) => id !== clubId);
}
