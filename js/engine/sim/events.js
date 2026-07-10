// engine/sim/events.js — generates one *segment* of a live user match's
// minute timeline (fable-plans/plan1.md M4: "pre-generate a minute timeline
// of events (chances strong/weak counts from the [SCORE] gap-scale buckets,
// each chance resolved attacker-vs-GK; cards ...; injuries; subs windows)").
// A "segment" is kickoff->halftime, halftime->fulltime, or the tail after a
// substitution — engine/sim/match.js calls this once per segment, always
// with whatever the *current* on-pitch XIs are, which is what makes "user
// subs/tactic changes at stoppages re-sim the remaining minutes with
// updated strength" (plan1.md) true: a fresh segment is simply this function
// called again with the new lineup and a later `fromMinute`.
//
// Goal/card/injury *expectancy* is scaled by how much of the 90 minutes the
// segment covers, using the exact same strength/gap/Poisson machinery as
// sim/quick.js (engine/sim/core.js) — so a user match and a same-strength
// CPU match are statistically equivalent, just revealed minute-by-minute
// here instead of resolved in one shot.

import {
  CARD, SHOOTING_ATTRIBS, ASSIST_ATTRIBS, CARDING_ATTRIBS, INJURY_ATTRIBS, PENALTY_ATTRIBS,
  CHANCE_OF_ASSIST, PENALTY_CHANCE_OF_GOAL,
} from "../../config/sim.js";
import { rollInjury } from "../fitness.js";
import {
  xiStrength, teamStrength, expectedGoals, poissonSample, chanceCounts,
  pickWeighted, outfieldCandidates, allCandidates,
} from "./core.js";

function pickMinute(rng, fromMinute, toMinute) {
  const span = Math.max(1, toMinute - fromMinute);
  return fromMinute + 1 + Math.floor(rng.next() * span);
}

/** Rolls `chanceTotal` shot attempts for one side, `goalTotal` of which (a
 * random subset) convert — the rest become "chance-miss" ticker flavour.
 * Each attempt's taker (and, for goals, assister) is picked the same
 * [SHOOTING_ATTRIBS]/[ASSIST_ATTRIBS]-weighted way sim/quick.js resolves a
 * whole match's scorers at once — or, per [PENALTY_CHANCE_OF_GOAL], a
 * penalty instead (taker picked by [PENALTY_ATTRIBS], no assist). */
function rollChancesForSide({ side, xi, chanceTotal, goalTotal, fromMinute, toMinute, rng, events }) {
  const candidates = outfieldCandidates(xi);
  if (candidates.length === 0 || chanceTotal === 0) return;

  const goalAttemptIdx = new Set();
  while (goalAttemptIdx.size < Math.min(goalTotal, chanceTotal)) {
    goalAttemptIdx.add(Math.floor(rng.next() * chanceTotal));
  }

  for (let i = 0; i < chanceTotal; i++) {
    const minute = pickMinute(rng, fromMinute, toMinute);
    if (goalAttemptIdx.has(i)) {
      const isPenalty = rng.chance(PENALTY_CHANCE_OF_GOAL / 100);
      const scorer = pickWeighted(rng, candidates, isPenalty ? PENALTY_ATTRIBS : SHOOTING_ATTRIBS).player;
      let assistId = null;
      if (!isPenalty && candidates.length > 1 && rng.chance(CHANCE_OF_ASSIST / 100)) {
        const assistPool = candidates.filter((c) => c.player.id !== scorer.id);
        assistId = pickWeighted(rng, assistPool, ASSIST_ATTRIBS).player.id;
      }
      events.push({ minute, type: "goal", side, playerId: scorer.id, assistId, isPenalty });
    } else {
      const shooter = pickWeighted(rng, candidates, SHOOTING_ATTRIBS).player;
      events.push({ minute, type: "chance-miss", side, playerId: shooter.id });
    }
  }
}

/**
 * @param {object} opts
 * @param {number} opts.fromMinute - exclusive lower bound (this segment starts just after it)
 * @param {number} opts.toMinute - inclusive upper bound (45 or 90)
 * @param {object} opts.homeClub
 * @param {object} opts.awayClub
 * @param {object[]} opts.homeXI - current on-pitch home players (post any subs)
 * @param {object[]} opts.awayXI
 * @param {import("../../core/rng.js").RngStream} opts.rng
 * @returns {{ events: object[], homeGoals: number, awayGoals: number }}
 */
export function simulateSegment({ fromMinute, toMinute, homeClub, awayClub, homeXI, awayXI, rng }) {
  const fraction = Math.max(0, toMinute - fromMinute) / 90;
  const events = [];
  if (fraction <= 0) return { events, homeGoals: 0, awayGoals: 0 };

  const xiAvgHome = xiStrength(homeXI);
  const xiAvgAway = xiStrength(awayXI);
  const strengthHome = teamStrength({ xiAvg: xiAvgHome, opponentXiAvg: xiAvgAway, club: homeClub, isHome: true });
  const strengthAway = teamStrength({ xiAvg: xiAvgAway, opponentXiAvg: xiAvgHome, club: awayClub, isHome: false });
  const gap = strengthHome - strengthAway;

  const { lambdaHome, lambdaAway } = expectedGoals(gap, rng);
  const homeGoals = poissonSample(rng, lambdaHome * fraction);
  const awayGoals = poissonSample(rng, lambdaAway * fraction);

  const { strongIsHome, strongCount, weakCount } = chanceCounts(gap, rng);
  const homeChances = Math.max(homeGoals, Math.round((strongIsHome ? strongCount : weakCount) * fraction));
  const awayChances = Math.max(awayGoals, Math.round((strongIsHome ? weakCount : strongCount) * fraction));

  rollChancesForSide({ side: "home", xi: homeXI, chanceTotal: homeChances, goalTotal: homeGoals, fromMinute, toMinute, rng, events });
  rollChancesForSide({ side: "away", xi: awayXI, chanceTotal: awayChances, goalTotal: awayGoals, fromMinute, toMinute, rng, events });

  // Cards: same 50%/-10%-per-card/[CARD].MAX_CARDS shape as quick.js's whole
  // match roll, just gated per-attempt by the segment's share of 90 minutes.
  const cardPool = [...outfieldCandidates(homeXI), ...outfieldCandidates(awayXI)];
  if (cardPool.length > 0) {
    for (let n = 0; n < CARD.MAX_CARDS; n++) {
      const fullChance = (CARD.PERC_CHANCE - n * CARD.PERC_DROP) / 100;
      if (fullChance <= 0) break;
      if (!rng.chance(fullChance * fraction)) continue;
      const { player } = pickWeighted(rng, cardPool, CARDING_ATTRIBS);
      const side = homeXI.includes(player) ? "home" : "away";
      const isRed = rng.chance(CARD.CHANCEOF_RED / 100);
      events.push({ minute: pickMinute(rng, fromMinute, toMinute), type: "card", side, playerId: player.id, cardType: isRed ? "red" : "yellow" });
    }
  }

  // Injuries: engine/fitness.js's rollInjury scaled to this segment's share.
  const injuryPool = [...allCandidates(homeXI), ...allCandidates(awayXI)];
  for (let i = 0; injuryPool.length > 0; i++) {
    const injury = rollInjury(rng, i, fraction);
    if (!injury) break;
    const { player } = pickWeighted(rng, injuryPool, INJURY_ATTRIBS);
    const side = homeXI.includes(player) ? "home" : "away";
    events.push({ minute: pickMinute(rng, fromMinute, toMinute), type: "injury", side, playerId: player.id, injury });
  }

  events.sort((a, b) => a.minute - b.minute);
  return { events, homeGoals, awayGoals };
}
