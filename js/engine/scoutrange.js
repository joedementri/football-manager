// engine/scoutrange.js — F3-fixes: turns a player's scouting progress into a
// display range for any single value (an attribute, a Search Report summary-
// category average, overall, or potential): exact once player.scouting.level
// reaches 3 (fully scouted), otherwise a fuzzy [lo,hi] band. Two narrowing
// paths exist and this file picks whichever applies to the player in hand:
//  - a direct single-player scout task (engine/gtn.js's startPlayerScout)
//    sets player.scouting.assignedDate/totalDays and narrows continuously,
//    day by day, as state.calendar.today advances (owner: "every day
//    shrinks the range... 3 days for 5-star [scout], 8 days for 1-star").
//  - a player only ever found via a broad region/tag mission (no
//    assignedDate set) still narrows in the older discrete per-weekly-report
//    steps (config/scouting.js's RANGE_HALF_WIDTH_BY_LEVEL) — no evidence
//    (ini or owner instruction) describes per-day narrowing for that flow,
//    so it's left as-is.
// Shared by ui/searchui.js (Search Report / My Shortlist) and ui/playerbio.js
// so every "unscouted range" on every screen reads off one calculation
// (owner: "do this with consistency with the rest of the stat pages").

import { RngStream, deriveSeed } from "../core/rng.js";
import { daysBetween } from "../core/clock.js";
import { RANGE_HALF_WIDTH_BY_LEVEL, continuousHalfWidth } from "../config/scouting.js";

/** Stable per player+key fraction in [0,1), biased toward 0.5 (average of two
 * uniforms — a simple triangular distribution) so the true value usually
 * sits near the middle of a shown range but not always exactly on it (owner:
 * "dont make the middle... the actual value, introduce some fuzziness so it
 * can be anywhere in the range, but more often in the middle"). Derived
 * fresh from state.seed on every call instead of stored, so it stays stable
 * across renders/reloads without a new persisted field per attribute. */
function fuzzFraction(state, player, key) {
  const rng = new RngStream(deriveSeed(state.seed, `scoutfuzz-${player.id}-${key}`));
  return (rng.next() + rng.next()) / 2;
}

function halfWidthFor(state, player) {
  if (player.scouting.assignedDate) {
    const elapsed = daysBetween(player.scouting.assignedDate, state.calendar.today);
    return continuousHalfWidth(elapsed, player.scouting.totalDays);
  }
  return RANGE_HALF_WIDTH_BY_LEVEL[player.scouting.level];
}

/** [lo, hi] around trueValue, or [trueValue, trueValue] once fully scouted.
 * `key` only needs to be unique per distinct value being fuzzed on the same
 * player (an attribute name, "overall", "potential", or a summary-group
 * key) — it seeds the fuzz fraction above. */
export function scoutedRange(state, player, key, trueValue) {
  if (player.scouting.level >= 3) return [trueValue, trueValue];
  const half = halfWidthFor(state, player);
  if (half <= 0) return [trueValue, trueValue];
  const width = half * 2;
  const f = fuzzFraction(state, player, key);
  const lo = Math.max(1, Math.round(trueValue - f * width));
  const hi = Math.min(99, Math.round(trueValue + (1 - f) * width));
  return [lo, hi];
}

/** The one "is this player's report complete" check every gated screen
 * (Search Report, Shortlist, Player Bio) shares. */
export function isFullyScouted(player) {
  return player.scouting.level >= 3;
}

/** Search Report page 1's left-half progress widget. Null when no scout has
 * ever been assigned directly to this player (RANGE_HALF_WIDTH_BY_LEVEL's
 * discrete band still applies, but there's no day-count to show for it). */
export function scoutProgressInfo(state, player) {
  if (!player.scouting.assignedDate || player.scouting.level >= 3) return null;
  const mission = state.gtn.missions.find((m) => m.status === "active" && m.targetPlayerId === player.id);
  const scout = mission ? state.gtn.scouts.find((s) => s.id === mission.scoutId) : null;
  const total = player.scouting.totalDays;
  const elapsed = Math.max(0, Math.min(total, daysBetween(player.scouting.assignedDate, state.calendar.today)));
  return {
    scoutName: scout ? scout.commonName : null,
    elapsedDays: elapsed,
    totalDays: total,
    pct: Math.round((elapsed / total) * 100),
  };
}
