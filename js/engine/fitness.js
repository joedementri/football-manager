// engine/fitness.js — matchday energy loss + day-to-day recovery + injury
// rolls, port of reference/ini/simsettings.ini's [FATIGUE]/[INJURY] sections
// (fable-plans/plan1.md "Fitness & injuries"). The day-count-to-severity
// mapping (3-10/14-45/60-180 days for light/medium/severe) isn't in the INI
// itself (which only tracks energy loss, not days out) — it's given
// verbatim by the plan text, so it's ported from there instead.

import { FATIGUE, INJURY } from "../config/sim.js";

/**
 * Energy lost from playing `minutesPlayed` of a match (plan1.md: "per match
 * lose 21 × (1 − stamina/200)-ish (stamina-scaled base 21, GK ×0.25)").
 */
export function matchFatigueLoss(player, minutesPlayed) {
  const base = FATIGUE.FATIGUEBASE * (1 - player.attrs.stamina / 200);
  const gkFactor = player.position === "GK" ? 0.25 : 1;
  return base * gkFactor * (minutesPlayed / 90);
}

/** Applies one day's idle recovery (plan1.md: "+8/day idle, +2 injured"). */
export function applyDailyRecovery(player) {
  const gain = player.injury ? 2 : 8;
  player.fitness = Math.min(FATIGUE.MAXENERGY, player.fitness + gain);
  if (player.injury) {
    player.injury.daysLeft -= 1;
    if (player.injury.daysLeft <= 0) player.injury = null;
  }
}

/** Whole-world daily tick (core/store.js calls this once per day the
 * calendar advances through) — every player recovers a little, whether or
 * not they're involved in that day's fixtures, so CPU clubs' next matchday
 * XI selection (engine/sim/lineup.js) sees accurate fitness/injury state. */
export function applyDailyRecoveryToAll(players) {
  for (const p of players) applyDailyRecovery(p);
}

const SEVERITY_DAY_RANGE = { light: [3, 10], medium: [14, 45], severe: [60, 180] };
const SEVERITY_ENERGY_RANGE = {
  light: INJURY.ENGYDRP_LIGHT, medium: INJURY.ENGYDRP_MEDIUM, severe: INJURY.ENGYDRP_SEVERE,
};

/**
 * Rolls whether a match incident is an injury, and if so its severity + how
 * many days it sidelines the player. `priorInjuriesThisMatch` drops the
 * chance per subsequent injury already rolled this game ([INJURY].PERC_DROP),
 * capped at [INJURY].MAX_INJURIES total. `scale` (0-1) lets a caller ask for
 * "this many minutes' worth" of injury risk instead of a full match's worth
 * (engine/sim/events.js scales by segment length so re-simulating the tail
 * of a match after a substitution doesn't re-roll a full match's risk).
 */
export function rollInjury(rng, priorInjuriesThisMatch, scale = 1) {
  if (priorInjuriesThisMatch >= INJURY.MAX_INJURIES) return null;
  const chance = Math.max(0, INJURY.PERC_CHANCE - priorInjuriesThisMatch * INJURY.PERC_DROP) * scale;
  if (!rng.chance(chance / 100)) return null;

  const roll = rng.next() * 100;
  const severity = roll < INJURY.PERC_SEVERE ? "severe"
    : roll < INJURY.PERC_SEVERE + INJURY.PERC_MEDIUM ? "medium"
    : "light";

  const [dayLo, dayHi] = SEVERITY_DAY_RANGE[severity];
  const [engLo, engHi] = SEVERITY_ENERGY_RANGE[severity];
  return {
    type: severity,
    daysLeft: rng.int(dayLo, dayHi),
    energyDrop: rng.int(engLo, engHi),
  };
}
