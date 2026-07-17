// engine/sim/quick.js — CPU-vs-CPU match simulation: statistical only, no
// minute timeline (fable-plans/plan1.md M4: "sim/quick.js (all CPU-vs-CPU
// matches): team strength = starting-XI weighted overall ..., convert
// strength gap -> expected goals (Poisson) ..., produce score, scorers/
// assisters, cards, injuries, per-player ratings"). This is what every
// fixture not involving the user's club resolves through as the calendar
// advances (core/store.js's advanceToDate, via engine/sim/results.js's
// simulateFixturesOnDate) — every league's table fills in from this.

import { positionInfo } from "../../config/positions.js";
import {
  xiStrength, teamStrength, expectedGoals, poissonSample, chanceCounts,
  pickWeighted, outfieldCandidates, allCandidates, computeMatchRating,
} from "./core.js";
import { pickBestAvailableXI } from "./lineup.js";
import { rollInjury } from "../fitness.js";
import {
  SHOOTING_ATTRIBS, ASSIST_ATTRIBS, CARDING_ATTRIBS, INJURY_ATTRIBS, PENALTY_ATTRIBS,
  CHANCE_OF_ASSIST, PENALTY_CHANCE_OF_GOAL, CARD,
} from "../../config/sim.js";

/** Rolls how many cards this match produces (plan1.md/[CARD]: 50% chance of
 * a first card, -10% per subsequent one, up to MAX_CARDS), then picks who
 * gets each one from the combined pool of both sides' outfield players
 * (weighted by [CARDING_ATTRIBS] — the more aggression/tackling-heavy side
 * naturally attracts more cards, with no need to hand-code a per-side split). */
function rollCards(rng, homeXI, awayXI) {
  const pool = [...outfieldCandidates(homeXI), ...outfieldCandidates(awayXI)];
  const cards = [];
  for (let n = 0; n < CARD.MAX_CARDS; n++) {
    const chance = (CARD.PERC_CHANCE - n * CARD.PERC_DROP) / 100;
    if (chance <= 0 || !rng.chance(chance)) break;
    if (pool.length === 0) break;
    const { player } = pickWeighted(rng, pool, CARDING_ATTRIBS);
    const isRed = rng.chance(CARD.CHANCEOF_RED / 100);
    cards.push({ playerId: player.id, type: isRed ? "red" : "yellow" });
  }
  return cards;
}

/** Rolls up to [INJURY].MAX_INJURIES injuries this match, recipient weighted
 * by [INJURY_ATTRIBS] across every player on the pitch (GKs included). */
function rollMatchInjuries(rng, homeXI, awayXI) {
  const pool = [...allCandidates(homeXI), ...allCandidates(awayXI)];
  const injuries = [];
  for (let i = 0; pool.length > 0; i++) {
    const injury = rollInjury(rng, i);
    if (!injury) break;
    const { player } = pickWeighted(rng, pool, INJURY_ATTRIBS);
    injuries.push({ playerId: player.id, injury });
  }
  return injuries;
}

/** Distributes `goalCount` goals across `scoringXI`'s outfield players
 * (weighted by [SHOOTING_ATTRIBS]), each with a [ASSIST_ATTRIBS]-weighted
 * chance ([CHANCE_OF_ASSIST]) of an assister from the same XI — or, per
 * [PENALTY_CHANCE_OF_GOAL], a penalty instead: taker picked by
 * [PENALTY_ATTRIBS] rather than [SHOOTING_ATTRIBS], no assist — unless
 * `penaltyTakerId` (M11 Player Roles, ui/rolestacticsui.js) names the user's own
 * designated taker and they're actually on the pitch, in which case they
 * always step up instead of a fresh weighted roll. */
function rollGoals(rng, goalCount, scoringXI, penaltyTakerId = null) {
  const candidates = outfieldCandidates(scoringXI);
  const goals = [];
  for (let i = 0; i < goalCount; i++) {
    if (candidates.length === 0) break;
    const isPenalty = rng.chance(PENALTY_CHANCE_OF_GOAL / 100);
    const designatedTaker = isPenalty && penaltyTakerId != null ? candidates.find((c) => c.player.id === penaltyTakerId) : null;
    const scorer = designatedTaker ? designatedTaker.player : pickWeighted(rng, candidates, isPenalty ? PENALTY_ATTRIBS : SHOOTING_ATTRIBS).player;
    let assistId = null;
    if (!isPenalty && candidates.length > 1 && rng.chance(CHANCE_OF_ASSIST / 100)) {
      const assistPool = candidates.filter((c) => c.player.id !== scorer.id);
      assistId = pickWeighted(rng, assistPool, ASSIST_ATTRIBS).player.id;
    }
    goals.push({ scorerId: scorer.id, assistId, isPenalty });
  }
  return goals;
}

/** Builds the final `playerStats` map (engine/sim/results.js's
 * applyMatchResult input shape) for one full, uninterrupted 90-minute match —
 * every starter plays all 90 (quick sim doesn't model CPU substitutions). */
function buildPlayerStats({ homeXI, awayXI, homeGoals, awayGoals, homeGoalEvents, awayGoalEvents, cards, injuries, rng }) {
  const stats = new Map();
  const goalsBy = new Map(), assistsBy = new Map();
  for (const g of [...homeGoalEvents, ...awayGoalEvents]) {
    goalsBy.set(g.scorerId, (goalsBy.get(g.scorerId) || 0) + 1);
    if (g.assistId != null) assistsBy.set(g.assistId, (assistsBy.get(g.assistId) || 0) + 1);
  }
  const cardsBy = new Map();
  for (const c of cards) cardsBy.set(c.playerId, c.type);
  const injuryBy = new Map();
  for (const inj of injuries) injuryBy.set(inj.playerId, inj.injury);

  const sides = [
    { xi: homeXI, side: "home", teamGoals: homeGoals, concededByTeam: awayGoals },
    { xi: awayXI, side: "away", teamGoals: awayGoals, concededByTeam: homeGoals },
  ];
  for (const { xi, side, teamGoals, concededByTeam } of sides) {
    const teamWon = teamGoals > concededByTeam;
    const teamLost = teamGoals < concededByTeam;
    const cleanSheet = concededByTeam === 0;
    for (const p of xi) {
      const area = positionInfo(p.position).area;
      const sentOff = cardsBy.get(p.id) === "red";
      const goals = goalsBy.get(p.id) || 0;
      const assists = assistsBy.get(p.id) || 0;
      const rating = computeMatchRating({ area, goals, assists, teamWon, teamLost, cleanSheet, concededByTeam, sentOff, rng });
      stats.set(p.id, {
        side, minutesPlayed: 90, goals, assists,
        yellow: cardsBy.get(p.id) === "yellow", red: sentOff,
        rating, cleanSheet, injury: injuryBy.get(p.id) || null,
      });
    }
  }
  return stats;
}

/**
 * @param {object} opts
 * @param {object} opts.fixture
 * @param {object} opts.homeClub
 * @param {object} opts.awayClub
 * @param {object[]} opts.homeRoster - state.playersByClub.get(homeClubId)
 * @param {object[]} opts.awayRoster
 * @param {import("../../core/rng.js").RngStream} opts.rng
 * @param {boolean} [opts.neutral] - true for a cup final at a neutral venue
 *   (engine/comps/cup.js, M5, plan1.md: "final at neutral venue") — neither
 *   side gets [INFLUENCE].HOMEADV.
 * @param {number} [opts.homeTacticModifier] - M11: 0 unless the user's own
 *   club is home in this fixture (a quick-simmed cup/continental tie —
 *   engine/comps/cup.js's/continental.js's own call sites compute this;
 *   league fixtures never reach here for the user's club, see
 *   engine/sim/worldsim.js's header).
 * @param {number} [opts.awayTacticModifier]
 * @param {number|null} [opts.homePenaltyTakerId] - M11 Player Roles: the
 *   user's own designated penalty taker (state.squad.penaltyTakerId), if
 *   the user's club is home in this fixture.
 * @param {number|null} [opts.awayPenaltyTakerId]
 * @returns {{ homeGoals, awayGoals, playerStats: Map }}
 */
export function simulateQuickMatch({
  fixture, homeClub, awayClub, homeRoster, awayRoster, rng, neutral = false,
  homeTacticModifier = 0, awayTacticModifier = 0, homePenaltyTakerId = null, awayPenaltyTakerId = null,
}) {
  const homeXI = pickBestAvailableXI(homeRoster);
  const awayXI = pickBestAvailableXI(awayRoster);

  const xiAvgHome = xiStrength(homeXI);
  const xiAvgAway = xiStrength(awayXI);
  const strengthHome = teamStrength({ xiAvg: xiAvgHome, opponentXiAvg: xiAvgAway, club: homeClub, isHome: !neutral, tacticModifier: homeTacticModifier });
  const strengthAway = teamStrength({ xiAvg: xiAvgAway, opponentXiAvg: xiAvgHome, club: awayClub, isHome: false, tacticModifier: awayTacticModifier });
  const gap = strengthHome - strengthAway;

  const { lambdaHome, lambdaAway } = expectedGoals(gap, rng);
  const homeGoals = poissonSample(rng, lambdaHome);
  const awayGoals = poissonSample(rng, lambdaAway);

  // chanceCounts isn't needed to *decide* the score here (that's the Poisson
  // draw above) — quick.js only needs it for nothing further, since there's
  // no ticker to fill with "near miss" flavour. Still rolled so both paths
  // consume the rng stream in a comparable shape (keeps dev/balance.html's
  // determinism checks simple); the value itself is unused.
  chanceCounts(gap, rng);

  const homeGoalEvents = rollGoals(rng, homeGoals, homeXI, homePenaltyTakerId);
  const awayGoalEvents = rollGoals(rng, awayGoals, awayXI, awayPenaltyTakerId);
  const cards = rollCards(rng, homeXI, awayXI);
  const injuries = rollMatchInjuries(rng, homeXI, awayXI);

  const playerStats = buildPlayerStats({
    homeXI, awayXI, homeGoals, awayGoals, homeGoalEvents, awayGoalEvents, cards, injuries, rng,
  });

  return { fixtureId: fixture.id, homeGoals, awayGoals, playerStats };
}
