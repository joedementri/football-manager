// engine/retirement.js — player retirement + regeneration (fable-plans/
// plan1.md M5 "Season rollover": "retirements (playerretirement.ini: age
// 33+ & declining ⇒ announce in Jan, retire in July), ... regens (retired
// player respawns as 16-18 y-o youth prospect, [PLAYER_REGEN])"). Runs over
// every player in the world, same "simulate everyone" precedent as M4's
// match sim and M5's own growth.js.
//
// Two-step, matching the plan's own "announce in Jan, retire in July":
//   - announceRetirements() rolls reference/ini/playerretirement.ini's
//     age/position percentage table (config/retirement.js) at the January
//     board-review date, flagging `player.retiringAnnounced`.
//   - applyRetirementsAndRegens() actually removes announced players at the
//     July 1 rollover and generates a same-club, same-position 16-18 y-o
//     replacement for each — a "regen".
//
// Regen generation deliberately reuses gen/player.js's generatePlayer()
// (via an age override — see that file's header) and gen/squad.js's
// pickNation(), rather than inventing separate regen math: this is the same
// well-tested "target overall + age -> attributes/potential" pipeline every
// other player in the world already went through, just seeded at a lower
// target overall (a fresh prospect, not a first-team starter) and a fixed
// 16-18 age. playerretirement.ini's own TOP_UP_POTENTIAL_FUDGE ("added to
// potential of random teammate when creating a new player") is a much
// narrower, implementation-specific mechanic than this reuse-based approach
// needs — not ported 1:1, documented here as a deliberate simplification.

import { positionInfo } from "../config/positions.js";
import { retirementChance } from "../config/retirement.js";
import { clubOverallTarget } from "../config/playergen.js";
import { generatePlayer } from "../gen/player.js";
import { pickNation } from "../gen/squad.js";
import { RngStream, deriveSeed } from "../core/rng.js";

/** January board-review date: rolls every player's retirement chance and
 * flags the ones who hit it. Returns the list of newly-announced players
 * (engine/awards.js or an inbox email could use this; M5 doesn't wire a
 * dedicated announcement email, keeping scope to the mechanic itself). */
export function announceRetirements(state, seed, label) {
  const announced = [];
  for (const player of state.players) {
    if (player.retiringAnnounced) continue;
    const chance = retirementChance(positionInfo(player.position).index, player.age);
    if (chance <= 0) continue;
    const rng = new RngStream(deriveSeed(seed, `${label}-${player.id}`));
    if (rng.chance(chance)) {
      player.retiringAnnounced = true;
      announced.push(player);
    }
  }
  return announced;
}

/** Builds one 16-18 y-o regen at `club`, in the same position as the
 * retiring player it replaces. */
function generateRegen({ rng, positionCode, club, league, nationsById, nationsByName, seasonStartYear }) {
  const { mean, spread } = clubOverallTarget(club, league);
  const targetOverall = Math.round(rng.gaussian(mean * 0.75, spread));
  const nation = pickNation(rng, club, league, nationsById, nationsByName);
  return generatePlayer({
    rng, positionCode, nation, club, targetOverall, seasonStartYear,
    wageModifier: league.wageModifier, ageOverride: rng.int(16, 18),
  });
}

/**
 * July 1 rollover step: removes every `retiringAnnounced` player from
 * `state.players` and replaces each with a regen at the same club/position.
 * Mutates `state.players` in place (removes + appends) — core/store.js's
 * deriveIndices-equivalent rebuild (engine/season.js calls it) must run
 * after this so playersById/playersByClub/squad.roster pick up the change.
 * @returns {{retired: object[], regens: object[]}} for engine/awards.js flavour text
 */
export function applyRetirementsAndRegens(state, { clubsById, leaguesById, nationsById, nationsByName, seed, seasonStartYear }) {
  const retiring = state.players.filter((p) => p.retiringAnnounced);
  if (retiring.length === 0) return { retired: [], regens: [] };

  const retiringIds = new Set(retiring.map((p) => p.id));
  state.players = state.players.filter((p) => !retiringIds.has(p.id));

  const regens = [];
  for (const retiree of retiring) {
    const club = clubsById.get(retiree.clubId);
    const league = leaguesById.get(club.leagueId);
    const rng = new RngStream(deriveSeed(seed, `regen-${seasonStartYear}-${retiree.id}`));
    const regen = generateRegen({
      rng, positionCode: retiree.position, club, league, nationsById, nationsByName, seasonStartYear,
    });
    regen.kitNumber = retiree.kitNumber; // 1-for-1 slot replacement — keeps squad kit numbers unique with no re-shuffle
    state.players.push(regen);
    regens.push(regen);
  }
  return { retired: retiring, regens };
}
