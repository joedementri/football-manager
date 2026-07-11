// config/objectives.js — ported from reference/ini/seasonobjectives.ini
// (fable-plans/plan1.md M5: "Objectives (seasonobjectives.ini): board sets
// league + cup objectives from club prestige vs league ... mid-season
// review; failure ⇒ sack warning ⇒ sacked").
//
// The INI's own comment ("Look at Commentator's Notes XLS file for a
// visualisation and balancing tools") admits the OBJ_INDEX_n_CHECKm table
// isn't self-explanatory without a tool this project doesn't have — so
// engine/objectives.js's evaluation is a documented, simplified reading of
// these numbers rather than a byte-exact reproduction of the original
// engine's (unspecified) checkpoint-scheduling logic: CHECK1's INDEXLOW is
// used as the mid-season "are you on track" bar (data/clubs.json's
// boardExpectationTier -> OBJ_INDEX_n, n=0 highest expectation .. 4 lowest),
// CHECK3's INDEXLOW (always the tier's most lenient check, since every
// tier's CHECK3_PERCENTAGE is 100 — i.e. "the check that always applies")
// as the end-of-season pass/fail bar. INDEXHIGH is always 100 in every row
// of this file, so only INDEXLOW is a meaningful threshold.
//
// data/clubs.json's 5 boardExpectationTier strings map onto this file's 5
// OBJ_INDEX_n / DOM_CUP_OBJ_INDEX_n tiers directly (n=0 champions .. n=4
// fight-relegation); DOM_CUP_OBJ_INDEX_5 (a 6th, most lenient cup-only tier)
// has no corresponding board-expectation string in this project's data model
// and is left unused.

export const TIER_ORDER = ["champions", "european-qualification", "top-half", "mid-table-safety", "fight-relegation"];

export function tierIndex(boardExpectationTier) {
  const i = TIER_ORDER.indexOf(boardExpectationTier);
  return i === -1 ? TIER_ORDER.length - 1 : i;
}

/** OBJ_INDEX_<tier>_CHECK<1|2|3>_{PERCENTAGE,INDEXLOW,INDEXHIGH} — league objective. */
export const LEAGUE_OBJ_INDEX = [
  { check1: { pct: 12, lo: 65 }, check2: { pct: 15, lo: 82 }, check3: { pct: 100, lo: 90 } },
  { check1: { pct: 30, lo: 40 }, check2: { pct: 40, lo: 50 }, check3: { pct: 100, lo: 70 } },
  { check1: { pct: 40, lo: 50 }, check2: { pct: 60, lo: 40 }, check3: { pct: 100, lo: 100 } },
  { check1: { pct: 50, lo: 0 }, check2: { pct: 65, lo: 0 }, check3: { pct: 100, lo: 9 } },
  { check1: { pct: 100, lo: 0 }, check2: { pct: 100, lo: 0 }, check3: { pct: 100, lo: 0 } },
];

/** DOM_CUP_OBJ_INDEX_<tier>_CHECK<1|2|3>_{PERCENTAGE,INDEXLOW,INDEXHIGH} —
 * domestic cup objective (tiers 0-4 only — see header). */
export const CUP_OBJ_INDEX = [
  { check1: { pct: 3, lo: 85 }, check2: { pct: 10, lo: 90 }, check3: { pct: 100, lo: 95 } },
  { check1: { pct: 5, lo: 83 }, check2: { pct: 10, lo: 88 }, check3: { pct: 100, lo: 93 } },
  { check1: { pct: 8, lo: 80 }, check2: { pct: 12, lo: 85 }, check3: { pct: 100, lo: 90 } },
  { check1: { pct: 12, lo: 77 }, check2: { pct: 16, lo: 82 }, check3: { pct: 100, lo: 87 } },
  { check1: { pct: 30, lo: 60 }, check2: { pct: 40, lo: 65 }, check3: { pct: 100, lo: 70 } },
];

export const INDEX_DIFFERENCE_OVERACHIEVED = 1;
export const INDEX_DIFFERENCE_FAILED = -1;

/** [PAP_SEASON_OBJECTIVE_MANAGER] */
export const MAIN_COMPLETED_PERCENT = 80;
export const STRETCH_COMPLETED_PERCENT = 101;
