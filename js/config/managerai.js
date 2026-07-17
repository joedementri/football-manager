// config/managerai.js — ported from reference/ini/managerai.ini's
// [MAI_PLAYER_POS_SCORE], [MAI_FORM] and [MAI_TOTAL_SCORE_1ST_11] sections
// (fable-plans/plan2.md F1: Suggested Subs "ranked by same-position ->
// altPositions -> best OVR*fitness*form"). js/core/store.js's
// teamSheetSuggestedSubs is the one consumer.
//
// The INI models each player as having up to 4 ranked "preferred positions"
// with a separate score per rank; the Player schema here only carries a
// single primary `position` plus an unranked `altPositions` list (see
// gen/player.js's pickAltPositions), so altPositions' array order stands in
// for the INI's 2nd/3rd/4th preference — [TUNED], logged in
// plan2-decisions.md F1.
export const POS_SCORE = {
  PREFERRED_POS_1: 35,
  PREFERRED_POS_2: 30,
  PREFERRED_POS_3: 3,
  PREFERRED_POS_4: 1,
  NOT_PREFERRED_POS: -50,
};

/** [MAI_FORM]: score bands for a player's current form. */
export const FORM_SCORE = { VERY_BAD: 25, BAD: 45, NEUTRAL: 65, GOOD: 75, VERY_GOOD: 100 };

/** [MAI_TOTAL_SCORE_1ST_11]: only the 3 weights Suggested Subs needs (no
 * injury/international/suspension/match-importance/random inputs exist in a
 * static "rank the bench" UI context, unlike the INI's live matchday XI
 * picker) — OVR_POS_BIAS 3.0, FORM_BIAS 1.5, FITNESS_BIAS 2.0. */
export const TOTAL_SCORE_WEIGHTS = { OVR_POS_BIAS: 3.0, FORM_BIAS: 1.5, FITNESS_BIAS: 2.0 };

/** [MAI_PLAYER_POS_SCORE]: how well `candidate` fits `slotPositionCode`. */
export function positionFitScore(candidate, slotPositionCode) {
  if (candidate.position === slotPositionCode) return POS_SCORE.PREFERRED_POS_1;
  const altIdx = candidate.altPositions.indexOf(slotPositionCode);
  if (altIdx === 0) return POS_SCORE.PREFERRED_POS_2;
  if (altIdx === 1) return POS_SCORE.PREFERRED_POS_3;
  if (altIdx >= 2) return POS_SCORE.PREFERRED_POS_4;
  return POS_SCORE.NOT_PREFERRED_POS;
}

/** [MAI_FORM]: `player.form` is our 1-10 scale (engine/form.js); linearly
 * interpolated onto the INI's 25(very bad)-100(very good) band —
 * [TUNED] mapping, logged. */
export function formScore(form) {
  return FORM_SCORE.VERY_BAD + ((form - 1) / 9) * (FORM_SCORE.VERY_GOOD - FORM_SCORE.VERY_BAD);
}

/** A candidate only counts as "similar" (shows up in Suggested Subs at all —
 * matching ms_TEAM_SHEET_VIEW_SUGGESTED_SUBS_NO_SIMILAR.png's empty state
 * when none qualify) if he actually fits the slot's position, i.e. excludes
 * the INI's NOT_PREFERRED_POS(-50) case. */
export function isSimilarPosition(candidate, slotPositionCode) {
  return positionFitScore(candidate, slotPositionCode) > POS_SCORE.NOT_PREFERRED_POS;
}

/** Suggested Subs ranking score for `candidate` filling `slotPositionCode`.
 * [MAI_TOTAL_SCORE_1ST_11]'s OVR_POS_BIAS weights a single combined
 * "position suitability + overall" term; the INI doesn't specify the
 * combination formula, so positionFitScore and overall are simply summed
 * before weighting — [TUNED], logged. */
export function suggestedSubScore(candidate, slotPositionCode) {
  const posOvr = positionFitScore(candidate, slotPositionCode) + candidate.overall;
  return (
    TOTAL_SCORE_WEIGHTS.OVR_POS_BIAS * posOvr +
    TOTAL_SCORE_WEIGHTS.FORM_BIAS * formScore(candidate.form) +
    TOTAL_SCORE_WEIGHTS.FITNESS_BIAS * candidate.fitness
  );
}
