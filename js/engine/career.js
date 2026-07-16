// engine/career.js — M11 "My Career" (fable-plans/plan1.md M11: "My Career
// (manager rep, trophy cabinet, history table)"). Owns the whole-career
// manager stats that live inside `state.manager` (persisted for free — see
// core/db.js's serializeSave, which writes `manager: state.manager`
// wholesale, no per-field handling needed) and are read by ui/mycareerui.js:
//
//   clubsManaged   - every club id the manager has ever taken charge of
//   record         - career club-match record { p, w, d, l, gf, ga }
//   biggestWin/biggestDefeat - the single largest-margin match each way
//   transferFeePaidRecord/transferFeeReceivedRecord - largest fee each way
//   leagueTitles/domesticCupsWon/continentalCupsWon - trophy-cabinet counts
//   history        - one entry per completed season (newest first)
//
// Dates are stored as epoch-day integers (core/clock.js's toEpochDay), not
// raw Date objects — state.manager round-trips through both IndexedDB
// (structured clone, which *would* tolerate a Date) and the M11 JSON
// export/import path (which wouldn't survive a bare JSON.stringify/parse
// without a custom reviver), so every other Date-bearing field in a save
// already uses this same epoch-day convention (see core/db.js) and these
// follow it too.

import { toEpochDay } from "../core/clock.js";

export function createManagerCareerFields(startingClubId) {
  return {
    clubsManaged: [startingClubId],
    record: { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 },
    biggestWin: null, // { forGoals, againstGoals, opponentClubId, date }
    biggestDefeat: null,
    transferFeePaidRecord: null, // { fee, playerId, date }
    transferFeeReceivedRecord: null,
    leagueTitles: 0,
    domesticCupsWon: 0,
    continentalCupsWon: 0,
    history: [],
  };
}

/** engine/jobs.js's acceptJob calls this for every club job taken (including
 * the very first, already seeded by createManagerCareerFields above) — an
 * idempotent append so re-accepting a former club doesn't double-count it in
 * the Career Summary's "Clubs" tally. National-team jobs (engine/ntjobs.js)
 * deliberately never call this — "Clubs" means club jobs only, matching the
 * reference screen's own "Clubs / League Titles / Domestic Cups" framing. */
export function recordClubJoined(state, clubId) {
  if (!state.manager.clubsManaged.includes(clubId)) state.manager.clubsManaged.push(clubId);
}

/** Called from engine/sim/results.js's applyMatchResult for *every* finished
 * fixture in the world — a cheap no-op unless `fixture` carries
 * homeClubId/awayClubId (every call site's fixture object does now — see
 * engine/comps/cup.js's and engine/comps/continental.js's knockout-tie fixture
 * literals) and one side is the user's own club.
 *
 * Also stashes `state.lastMatchReport` (M11 Squad Ranking's "Previous Match
 * Result" panel — ui/squadreportui.js) — the same event this function
 * already only fires on (a finished match involving the user's club) is
 * exactly what that panel needs, so it's bundled in here rather than given
 * its own call site. */
export function recordClubMatchIfUser(state, fixture, result) {
  const isHome = fixture.homeClubId === state.club.id;
  const isAway = fixture.awayClubId === state.club.id;
  if (!isHome && !isAway) return;

  const forGoals = isHome ? result.homeGoals : result.awayGoals;
  const againstGoals = isHome ? result.awayGoals : result.homeGoals;
  const opponentClubId = isHome ? fixture.awayClubId : fixture.homeClubId;

  const r = state.manager.record;
  r.p += 1;
  r.gf += forGoals;
  r.ga += againstGoals;
  if (forGoals > againstGoals) r.w += 1;
  else if (forGoals === againstGoals) r.d += 1;
  else r.l += 1;

  const margin = forGoals - againstGoals;
  const date = toEpochDay(state.calendar.today);
  if (margin > 0) {
    const best = state.manager.biggestWin;
    if (!best || margin > best.forGoals - best.againstGoals) {
      state.manager.biggestWin = { forGoals, againstGoals, opponentClubId, date };
    }
  } else if (margin < 0) {
    const worst = state.manager.biggestDefeat;
    if (!worst || margin < worst.forGoals - worst.againstGoals) {
      state.manager.biggestDefeat = { forGoals, againstGoals, opponentClubId, date };
    }
  }

  let motm = null;
  for (const [playerId, stat] of result.playerStats) {
    const player = state.playersById.get(playerId);
    if (!player || player.clubId !== state.club.id) continue;
    if (!motm || stat.rating > motm.rating) motm = { playerId, rating: stat.rating, goals: stat.goals, assists: stat.assists };
  }
  state.lastMatchReport = { opponentClubId, forGoals, againstGoals, isHome, date, motm };
}

export function recordTransferFeePaid(state, { fee, playerId }) {
  if (fee <= 0) return;
  const rec = state.manager.transferFeePaidRecord;
  if (!rec || fee > rec.fee) state.manager.transferFeePaidRecord = { fee, playerId, date: toEpochDay(state.calendar.today) };
}

export function recordTransferFeeReceived(state, { fee, playerId }) {
  if (fee <= 0) return;
  const rec = state.manager.transferFeeReceivedRecord;
  if (!rec || fee > rec.fee) state.manager.transferFeeReceivedRecord = { fee, playerId, date: toEpochDay(state.calendar.today) };
}

/**
 * Pushes one season's summary onto `state.manager.history` (newest first)
 * and bumps the trophy-cabinet counts. Called once per July rollover
 * (engine/season.js), while `state.continental` still reflects the season
 * that just finished (before that same rollover rebuilds it for next season).
 */
export function recordSeasonHistory(state, entry) {
  state.manager.history.unshift(entry);
  if (entry.leagueChampion) state.manager.leagueTitles += 1;
  if (entry.cupWon) state.manager.domesticCupsWon += 1;
  if (entry.continentalWon) state.manager.continentalCupsWon += 1;
}
