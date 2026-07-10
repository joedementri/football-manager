// gen/archetypes.js — per-overallGroup mean attribute templates gen/player.js
// samples noise around before scaling to the target overall (plan1.md step
// 5: "Attributes: per-position archetype template (means per attribute) +
// noise"). Authored from football knowledge (no INI source for "what does
// an average centre-back's attribute spread look like") at a baseline of
// roughly a 60-65 overall player — the absolute level barely matters since
// gen/player.js rescales the whole set to hit the sampled target overall;
// what matters is the *shape* (which attributes are relatively high/low for
// the role), which survives the rescale.
//
// Outfielders get low (5-10) GK stats and GK gets low (15-60) outfield
// stats, matching the Player schema note ("GK outfield stats low (25-60)
// like the Neuer example; outfielders get GK stats 5-15, not shown in UI").

const OUTFIELD_LOW_GK = { gkDiving: 6, gkHandling: 6, gkKicking: 10, gkPositioning: 6, gkReflexes: 6 };

export const ARCHETYPES = {
  GK: {
    acceleration: 45, sprintSpeed: 45,
    positioning: 30, finishing: 15, shotPower: 35, longShots: 15, volleys: 15, penalties: 30,
    vision: 35, crossing: 20, fkAccuracy: 15, shortPass: 45, longPass: 45, curve: 20,
    agility: 50, balance: 50, reactions: 62, ballControl: 35, dribbling: 30, composure: 55,
    interceptions: 30, headingAcc: 25, marking: 20, standTackle: 20, slideTackle: 15,
    jumping: 55, stamina: 50, strength: 60, aggression: 40,
    gkDiving: 63, gkHandling: 62, gkKicking: 58, gkPositioning: 63, gkReflexes: 63,
  },

  CB: {
    acceleration: 55, sprintSpeed: 58,
    positioning: 50, finishing: 25, shotPower: 40, longShots: 25, volleys: 20, penalties: 35,
    vision: 45, crossing: 30, fkAccuracy: 25, shortPass: 55, longPass: 50, curve: 25,
    agility: 50, balance: 58, reactions: 62, ballControl: 50, dribbling: 40, composure: 58,
    interceptions: 65, headingAcc: 68, marking: 68, standTackle: 68, slideTackle: 62,
    jumping: 65, stamina: 60, strength: 70, aggression: 62,
    ...OUTFIELD_LOW_GK,
  },

  FB: {
    acceleration: 66, sprintSpeed: 67,
    positioning: 45, finishing: 30, shotPower: 45, longShots: 30, volleys: 20, penalties: 35,
    vision: 50, crossing: 62, fkAccuracy: 32, shortPass: 60, longPass: 52, curve: 40,
    agility: 62, balance: 60, reactions: 60, ballControl: 58, dribbling: 55, composure: 56,
    interceptions: 58, headingAcc: 50, marking: 60, standTackle: 62, slideTackle: 55,
    jumping: 55, stamina: 68, strength: 55, aggression: 55,
    ...OUTFIELD_LOW_GK,
  },

  CDM: {
    acceleration: 55, sprintSpeed: 56,
    positioning: 50, finishing: 30, shotPower: 48, longShots: 35, volleys: 25, penalties: 40,
    vision: 55, crossing: 35, fkAccuracy: 35, shortPass: 65, longPass: 60, curve: 35,
    agility: 55, balance: 58, reactions: 62, ballControl: 60, dribbling: 52, composure: 60,
    interceptions: 65, headingAcc: 55, marking: 62, standTackle: 65, slideTackle: 58,
    jumping: 55, stamina: 68, strength: 65, aggression: 62,
    ...OUTFIELD_LOW_GK,
  },

  CM: {
    acceleration: 58, sprintSpeed: 58,
    positioning: 55, finishing: 40, shotPower: 55, longShots: 48, volleys: 35, penalties: 45,
    vision: 62, crossing: 48, fkAccuracy: 42, shortPass: 68, longPass: 62, curve: 48,
    agility: 60, balance: 60, reactions: 63, ballControl: 65, dribbling: 60, composure: 62,
    interceptions: 55, headingAcc: 48, marking: 48, standTackle: 52, slideTackle: 45,
    jumping: 52, stamina: 68, strength: 58, aggression: 52,
    ...OUTFIELD_LOW_GK,
  },

  CAM: {
    acceleration: 62, sprintSpeed: 60,
    positioning: 62, finishing: 55, shotPower: 58, longShots: 58, volleys: 45, penalties: 52,
    vision: 68, crossing: 55, fkAccuracy: 55, shortPass: 68, longPass: 55, curve: 60,
    agility: 66, balance: 62, reactions: 64, ballControl: 68, dribbling: 68, composure: 62,
    interceptions: 35, headingAcc: 40, marking: 30, standTackle: 30, slideTackle: 25,
    jumping: 48, stamina: 58, strength: 48, aggression: 42,
    ...OUTFIELD_LOW_GK,
  },

  WM_WING: {
    acceleration: 68, sprintSpeed: 68,
    positioning: 55, finishing: 48, shotPower: 52, longShots: 42, volleys: 35, penalties: 42,
    vision: 55, crossing: 62, fkAccuracy: 38, shortPass: 60, longPass: 45, curve: 55,
    agility: 66, balance: 62, reactions: 60, ballControl: 64, dribbling: 65, composure: 55,
    interceptions: 32, headingAcc: 40, marking: 32, standTackle: 32, slideTackle: 25,
    jumping: 48, stamina: 65, strength: 48, aggression: 42,
    ...OUTFIELD_LOW_GK,
  },

  ST_CF: {
    acceleration: 64, sprintSpeed: 64,
    positioning: 62, finishing: 62, shotPower: 60, longShots: 50, volleys: 50, penalties: 52,
    vision: 48, crossing: 35, fkAccuracy: 35, shortPass: 50, longPass: 38, curve: 42,
    agility: 58, balance: 58, reactions: 62, ballControl: 58, dribbling: 55, composure: 58,
    interceptions: 22, headingAcc: 55, marking: 20, standTackle: 18, slideTackle: 15,
    jumping: 58, stamina: 58, strength: 58, aggression: 48,
    ...OUTFIELD_LOW_GK,
  },
};
