// config/form.js — ported verbatim from reference/ini/formsettings.ini's
// [FORM_CALC_CPU]/[FORM_CALC_USER]/[FORM_DEFAULTS]/[PLAYER_EVAL] sections
// (fable-plans/plan1.md "Form & morale": "weighted avg of last 10 match
// ratings for user-club players ... last 5 for CPU"). [EXTREME_FORM_*] (the
// news-trend "player is on fire/out of form" thresholds) is left unported —
// that's news.js's "form streaks" flavour-text scope, not this milestone's
// (M4's checklist only requires form itself to update, not its news copy).

export const FORM_DEFAULTS = { MATCH_RATING: 60, MIN_MINUTES: 20, MIN_GAMES: 5 };

/** [FORM_CALC_USER]: last 10 matches, weights escalating towards the most
 * recent (index 0 = most recent match). */
export const FORM_WEIGHTS_USER = [7, 4, 3, 2, 1, 1, 1, 1, 1, 1];

/** [FORM_CALC_CPU]: last 5 matches, same escalating-recency shape. */
export const FORM_WEIGHTS_CPU = [7, 4, 3, 2, 1];

/** [PLAYER_EVAL]: bands an average match rating falls into. */
export const PLAYER_EVAL = { BAD: 59, NEUTRAL: 65 };
