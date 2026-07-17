// config/injuries.js — fable-plans/plan2.md F2.6: named injuries for the new
// Squad > Kit Numbers tile's "Injury List" page. reference/ini/fitness.ini
// has no injury-name strings (INJURY_NAME=n is a localization-string index
// we don't have the table for) — names below are Title-Case renders of each
// [FITNESS_<NAME>] section's own key; RECOVERY (days) is ported verbatim per
// severity tier ([FITNESS_X]=light, [FITNESS_X_MEDIUM]=medium,
// [FITNESS_X_SEVERE]=severe). 12-entry subset per plan2.md's "port a
// 12-entry subset" instruction — picked for a spread of body parts and
// severities, cited section-by-section below.
export const INJURIES = [
  // fitness.ini [FITNESS_PULLED_HAM]/_MEDIUM/_SEVERE: RECOVERY 4/12/14
  { name: "Pulled Hamstring", days: { light: 4, medium: 12, severe: 14 } },
  // [FITNESS_TORN_HAM]/_MEDIUM/_SEVERE: RECOVERY 14/28/35
  { name: "Torn Hamstring", days: { light: 14, medium: 28, severe: 35 } },
  // [FITNESS_SPRAINED_ANKLE]/_MEDIUM/_SEVERE: RECOVERY 5/7/7
  { name: "Sprained Ankle", days: { light: 5, medium: 7, severe: 7 } },
  // [FITNESS_BROKEN_ANKLE]/_MEDIUM/_SEVERE: RECOVERY 14/28/42
  { name: "Broken Ankle", days: { light: 14, medium: 28, severe: 42 } },
  // [FITNESS_PULLED_CALF]/_MEDIUM/_SEVERE: RECOVERY 3/5/7
  { name: "Pulled Calf", days: { light: 3, medium: 5, severe: 7 } },
  // [FITNESS_TORN_CALF]/_MEDIUM/_SEVERE: RECOVERY 14/14/28
  { name: "Torn Calf", days: { light: 14, medium: 14, severe: 28 } },
  // [FITNESS_PULLED_GROIN]/_MEDIUM/_SEVERE: RECOVERY 4/7/7
  { name: "Pulled Groin", days: { light: 4, medium: 7, severe: 7 } },
  // [FITNESS_DEAD_LEG_QUAD]/_MEDIUM/_SEVERE: RECOVERY 2/4/6
  { name: "Dead Leg (Quad)", days: { light: 2, medium: 4, severe: 6 } },
  // [FITNESS_CONCUSSION]/_MEDIUM/_SEVERE: RECOVERY 4/10/18
  { name: "Concussion", days: { light: 4, medium: 10, severe: 18 } },
  // [FITNESS_BROKEN_METATARSAL]/_MEDIUM/_SEVERE: RECOVERY 21/21/28
  { name: "Broken Metatarsal", days: { light: 21, medium: 21, severe: 28 } },
  // [FITNESS_HYPER_EXTENDED_KNEE]/_MEDIUM/_SEVERE: RECOVERY 4/7/14
  { name: "Hyper-Extended Knee", days: { light: 4, medium: 7, severe: 14 } },
  // [FITNESS_BROKEN_COLLARBONE]/_MEDIUM/_SEVERE: RECOVERY 21/35/49
  { name: "Broken Collarbone", days: { light: 21, medium: 35, severe: 49 } },
];

/** Picks a flavour name for a rolled injury (engine/fitness.js's rollInjury)
 * — [TUNED]/[JUDGMENT CALL]: names are cosmetic only (the days-out count
 * stays whichever plan1 M5 already rolled from SEVERITY_DAY_RANGE; this
 * doesn't re-derive it from the picked injury's own RECOVERY table, since
 * that range is an already-tested, unrelated plan1 mechanic out of F2's
 * scope) — any of the 12 is equally likely regardless of severity. */
export function pickInjuryName(rng) {
  return rng.pick(INJURIES).name;
}
