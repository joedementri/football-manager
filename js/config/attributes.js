// config/attributes.js — the 29 outfield + 5 goalkeeper attribute names,
// exact FIFA 15 names, grouped into the 6 bio-panel categories (PAC/SHO/
// PAS/DRI/DEF/PHY) per the Player schema in fable-plans/plan1.md. The plan's
// schema comment lists 28 (it omits "composure"); FIFA 15's actual outfield
// attribute count is 29, so composure is included here to match the stated
// count and the real game's attribute set — see gen/overall.js's header for
// how this affects the ST weight-table calibration.
//
// Order within each group is display order for the Player Bio 6-panel layout.

export const ATTRIBUTE_GROUPS = {
  PAC: ["acceleration", "sprintSpeed"],
  SHO: ["positioning", "finishing", "shotPower", "longShots", "volleys", "penalties"],
  PAS: ["vision", "crossing", "fkAccuracy", "shortPass", "longPass", "curve"],
  DRI: ["agility", "balance", "reactions", "ballControl", "dribbling", "composure"],
  DEF: ["interceptions", "headingAcc", "marking", "standTackle", "slideTackle"],
  PHY: ["jumping", "stamina", "strength", "aggression"],
};

export const OUTFIELD_ATTRIBUTES = Object.values(ATTRIBUTE_GROUPS).flat();

export const GK_ATTRIBUTES = ["gkDiving", "gkHandling", "gkKicking", "gkPositioning", "gkReflexes"];

/** Every attribute a serialized player array stores, in fixed order (core/db.js's compact format). */
export const ALL_ATTRIBUTES = [...OUTFIELD_ATTRIBUTES, ...GK_ATTRIBUTES];

export function groupOf(attrName) {
  for (const [group, names] of Object.entries(ATTRIBUTE_GROUPS)) {
    if (names.includes(attrName)) return group;
  }
  return GK_ATTRIBUTES.includes(attrName) ? "GK" : null;
}
