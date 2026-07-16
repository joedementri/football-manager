// engine/form.js — player form: a weighted rolling average of recent match
// ratings (config/form.js's port of formsettings.ini), converted to the
// Player schema's 1-10 `form` field (plan1.md: "Form = weighted avg of last
// 10 match ratings for user-club players ... last 5 for CPU; map avg rating
// (internal 0-100) to 1-10 form").
//
// `player.ratingHistory` (most-recent-first, capped at 10 entries — enough
// for either weighting table) is the one schema addition this milestone
// makes: gen/player.js seeds it empty, core/db.js persists it, and this is
// the only module that reads or writes it.

import { FORM_WEIGHTS_USER, FORM_WEIGHTS_CPU, FORM_DEFAULTS } from "../config/form.js";

const HISTORY_CAP = 10;

/** Records a just-played match rating (0-100) and returns the updated form
 * (1-10). `isUserClub` selects the 10-match/5-match weighting table. */
export function recordMatchRating(player, rating, isUserClub) {
  player.ratingHistory.unshift(rating);
  if (player.ratingHistory.length > HISTORY_CAP) player.ratingHistory.length = HISTORY_CAP;
  player.form = computeForm(player.ratingHistory, isUserClub);
  return player.form;
}

/** Weighted average of `history` (most-recent-first) using the matching
 * weight table, truncated to however many matches are actually available,
 * mapped onto a 1-10 scale (rating 60 ≈ the [FORM_DEFAULTS] baseline -> 6). */
export function computeForm(history, isUserClub) {
  if (!history.length) return Math.round(FORM_DEFAULTS.MATCH_RATING / 10);
  const weights = isUserClub ? FORM_WEIGHTS_USER : FORM_WEIGHTS_CPU;
  const n = Math.min(history.length, weights.length);
  let weightedSum = 0;
  let weightTotal = 0;
  for (let i = 0; i < n; i++) {
    weightedSum += history[i] * weights[i];
    weightTotal += weights[i];
  }
  const avgRating = weightedSum / weightTotal;
  return Math.min(10, Math.max(1, Math.round(avgRating / 10)));
}

/**
 * M11 Squad Ranking (ui/squadreportui.js): ranks a roster by this season's
 * average match rating (highest first) — ties (most commonly 0 apps each,
 * preseason) broken by overall so the order is never arbitrary. Returns
 * `{ player, rank }` objects, `rank` 1-based.
 */
export function rankSquadByForm(roster) {
  return [...roster]
    .sort((a, b) => b.seasonStats.avgRating - a.seasonStats.avgRating || b.overall - a.overall)
    .map((player, i) => ({ player, rank: i + 1 }));
}
