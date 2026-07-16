// engine/comps/knockoututil.js — small helpers shared by every knockout-
// bracket competition (domestic cups, M10's continental clubs, M10's
// international tournaments). Extracted out of engine/comps/cup.js (M5)
// rather than duplicated three times — cup.js's own state machine (which has
// domestic-cup-only staggered entry) is untouched, only the genuinely
// competition-agnostic bits move here: penalty-shootout math (plan1.md:
// "single leg + penalties", no [PENALTY_SHOOTOUT] table exists in the FIFA 17
// files so this is authored, not ported) and round naming by entrant count.

import { outfieldCandidates } from "../sim/core.js";

/**
 * @param {number} enteringCount - clubs/nations entering the round being labelled
 * @param {number|null} roundIndex - that round's 0-based index, when known —
 *   Final/Semi/Quarter/Round-of-16 are always named by how many are left
 *   (matches real cup terminology regardless of how many rounds it took to
 *   get there), but an earlier round is named by its actual round number.
 */
export function roundLabel(enteringCount, roundIndex = null) {
  if (enteringCount <= 2) return "Final";
  if (enteringCount <= 4) return "Semi-Final";
  if (enteringCount <= 8) return "Quarter-Final";
  if (enteringCount <= 16) return "Round of 16";
  return roundIndex != null ? `Round ${roundIndex + 1}` : `Round ${Math.round(Math.log2(enteringCount * 2))}`;
}

/** Each side's conversion rate is a penalties/finishing composite (same
 * attribute mix as config/sim.js's in-play PENALTY_ATTRIBS), 5 rounds then
 * sudden death. */
export function resolvePenaltyShootout(rng, homeXI, awayXI) {
  const rateFor = (xi) => {
    const candidates = outfieldCandidates(xi);
    if (!candidates.length) return 0.75;
    const avg = candidates.reduce((s, c) => s + (0.75 * c.player.attrs.penalties + 0.25 * c.player.attrs.finishing), 0) / candidates.length;
    return Math.min(0.92, Math.max(0.55, avg / 100));
  };
  const homeRate = rateFor(homeXI);
  const awayRate = rateFor(awayXI);
  let home = 0, away = 0;
  for (let round = 0; round < 5; round++) {
    if (rng.chance(homeRate)) home++;
    if (rng.chance(awayRate)) away++;
  }
  let extra = 0;
  while (home === away && extra < 20) {
    if (rng.chance(homeRate)) home++;
    if (rng.chance(awayRate)) away++;
    extra++;
  }
  if (home === away) home++; // pathological safety net, not realistically reachable
  return { home, away, winner: home > away ? "home" : "away" };
}
