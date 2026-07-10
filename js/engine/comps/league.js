// engine/comps/league.js — league fixture scheduling + table computation
// (fable-plans/plan1.md M3: "league fixture generation for all leagues";
// the standings/tiebreaker rules quoted below are M4/M5's "Competitions"
// section, ported now so the table shape never has to change shape later,
// only gain non-zero stats once sim/quick.js exists).
//
// Scheduling is the standard "circle method" double round-robin: club[0]
// stays fixed, the rest rotate one position each round, pairing index i
// with n-1-i. Every league in data/leagues.json has an even team count (no
// bye needed). The two legs share one auto-incrementing matchday sequence,
// each matchday mapped to the next non-blackout Saturday (weekly cadence;
// international-break weeks are skipped per plan1.md's "league pauses on
// break weeks").

import { addDays, isDateInRange } from "../../core/clock.js";

/** One round-robin leg: n-1 rounds of n/2 fixtures each (home/away alternated
 * by round parity so a single leg isn't lopsidedly home- or away-heavy). */
function roundRobinLeg(clubIds) {
  const n = clubIds.length;
  const arr = clubIds.slice();
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const round = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      round.push(r % 2 === 0 ? { home: a, away: b } : { home: b, away: a });
    }
    rounds.push(round);
    arr.splice(1, 0, arr.pop()); // rotate everything but arr[0]
  }
  return rounds;
}

/** Every club plays every other club home and away (plan1.md "League:
 * double round-robin scheduler (circle method)"). */
function doubleRoundRobinRounds(clubIds) {
  const leg1 = roundRobinLeg(clubIds);
  const leg2 = leg1.map((round) => round.map((m) => ({ home: m.away, away: m.home })));
  return [...leg1, ...leg2];
}

/** One date per round, walking forward a week at a time and skipping any
 * Saturday that falls inside a blackout (international break) range. */
function assignMatchdayDates(numRounds, kickoff, blackoutRanges) {
  const dates = [];
  let d = kickoff;
  while (dates.length < numRounds) {
    const blacked = blackoutRanges.some((r) => isDateInRange(d, r.start, r.end));
    if (!blacked) dates.push(d);
    d = addDays(d, 7);
  }
  return dates;
}

/**
 * @param {object} opts
 * @param {object} opts.league - data/leagues.json entry
 * @param {string[]} opts.clubIds - that league's club ids
 * @param {import("../../core/rng.js").RngStream} opts.rng
 * @param {Date} opts.kickoff - first matchday date
 * @param {{start:Date,end:Date}[]} opts.blackoutRanges - international-break weeks to skip
 * @returns {object[]} flat fixture list: { id, leagueId, matchday, date, homeClubId, awayClubId }
 */
export function generateLeagueFixtures({ league, clubIds, rng, kickoff, blackoutRanges }) {
  const shuffled = rng.shuffle(clubIds);
  const rounds = doubleRoundRobinRounds(shuffled);
  const dates = assignMatchdayDates(rounds.length, kickoff, blackoutRanges);

  const fixtures = [];
  rounds.forEach((round, roundIdx) => {
    const matchday = roundIdx + 1;
    const date = dates[roundIdx];
    round.forEach(({ home, away }) => {
      fixtures.push({
        id: `${league.id}-md${matchday}-${home}-${away}`,
        leagueId: league.id,
        matchday,
        date,
        homeClubId: home,
        awayClubId: away,
      });
    });
  });
  return fixtures;
}

const EMPTY_STATS = () => ({ pld: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 });

/**
 * Standings for one league. `resultsByFixtureId` is empty until sim/quick.js
 * (M4) starts producing scores — every row is 0 pld/pts until then, sorted
 * alphabetically as a stable, deterministic placeholder order. Tiebreakers
 * once results exist: GD, then GF (plan1.md "League" competitions section).
 * @param {object} league
 * @param {object[]} clubs - full club objects for this league (for names/crests)
 * @param {object[]} fixtures - this league's fixture list
 * @param {Map<string,{homeGoals:number,awayGoals:number}>} [resultsByFixtureId]
 */
export function buildLeagueTable(league, clubs, fixtures, resultsByFixtureId = new Map()) {
  const stats = new Map(clubs.map((c) => [c.id, EMPTY_STATS()]));

  for (const fx of fixtures) {
    const result = resultsByFixtureId.get(fx.id);
    if (!result) continue;
    const home = stats.get(fx.homeClubId);
    const away = stats.get(fx.awayClubId);
    home.pld++; away.pld++;
    home.gf += result.homeGoals; home.ga += result.awayGoals;
    away.gf += result.awayGoals; away.ga += result.homeGoals;
    if (result.homeGoals > result.awayGoals) { home.w++; away.l++; }
    else if (result.homeGoals < result.awayGoals) { away.w++; home.l++; }
    else { home.d++; away.d++; }
  }

  const rows = clubs.map((club) => {
    const s = stats.get(club.id);
    const pts = s.w * 3 + s.d;
    return { club, ...s, gd: s.gf - s.ga, pts };
  });

  rows.sort((a, b) => (
    b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.club.name.localeCompare(b.club.name)
  ));
  rows.forEach((row, i) => { row.position = i + 1; });
  return rows;
}
