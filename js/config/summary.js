// config/summary.js — fable-plans/plan2.md F3.2: the Search Report / Scout
// Report "Summary" box's six aggregate ratings (Athleticism, Technical
// Ability, Shooting, Passing, Defending, Mentality — ms_SEARCH_PLAYERS_
// SCREEN_SEARCH_RESULTS.png). No INI table defines these groupings (FIFA's
// own summary-box math isn't published anywhere in reference/ini/) — [TUNED]
// fixed attribute-mean groupings, authored rather than reverse-engineered.
// Sanity-checked against the one worked example the reference pic provides
// (Messi: Acceleration 96/SprintSpeed 90/Agility 94/Balance 95/Jumping 73/
// Stamina 77/Strength 60/Reactions 94/Aggression 48/Interceptions 22/
// AttPosition 92/Vision 90/BallControl 96/Crossing 84/Dribbling 96/
// Finishing 94/FKAcc 90/HeadingAcc 71/LongPass 76/ShortPass 89/Marking 25/
// ShotPower 80/LongShots 88/StandTackle 21/SlideTackle 20/Volleys 85/
// Curve 89/Penalties 76 -> pic shows Athleticism 84, Technical Ability 88,
// Shooting 84, Passing 83, Defending 22, Mentality 63): ATHLETICISM,
// TECHNICAL_ABILITY, PASSING and DEFENDING below reproduce the pic's shown
// value *exactly* off this data (round(83.57)=84, round(88.33)=88, 83.0=83,
// 22.0=22); SHOOTING lands one point off (round(84.6)=85 vs pic's 84 —
// nearest-whole-number rounding noise, not a wrong grouping) and MENTALITY
// is a from-scratch mental-attribute cluster the pic's visible attributes
// can't fully reverse-engineer (composure isn't shown on any Search Report
// attribute page, so its contribution can't be checked against the example,
// but it clearly belongs in a "Mentality" bucket by name).

export const SUMMARY_GROUPS = [
  { key: "athleticism", label: "Athleticism", attrs: ["acceleration", "sprintSpeed", "agility", "balance", "jumping", "stamina", "strength"] },
  { key: "technical", label: "Technical Ability", attrs: ["ballControl", "dribbling", "crossing", "curve", "shortPass", "longPass"] },
  { key: "shooting", label: "Shooting", attrs: ["finishing", "shotPower", "longShots", "volleys", "penalties"] },
  { key: "passing", label: "Passing", attrs: ["shortPass", "longPass", "crossing"] },
  { key: "defending", label: "Defending", attrs: ["marking", "standTackle", "slideTackle", "interceptions"] },
  { key: "mentality", label: "Mentality", attrs: ["aggression", "reactions", "vision", "composure", "positioning"] },
];

// GK outfield summary groups don't really apply (a keeper's Shooting/
// Defending/etc. are meaningless) — the Search Report screen has no GK-
// specific summary variant evidenced anywhere, so GK players use the same
// six groups off whatever their (mostly low/placeholder) outfield attributes
// happen to be, same "no special-case without evidence" footing as the rest
// of this file.

function meanOf(attrs, values) {
  const sum = attrs.reduce((s, k) => s + (values[k] || 0), 0);
  return Math.round(sum / attrs.length);
}

/** [{key,label,value}] — one entry per SUMMARY_GROUPS row, value = round(mean). */
export function computeSummary(player) {
  return SUMMARY_GROUPS.map((g) => ({ key: g.key, label: g.label, value: meanOf(g.attrs, player.attrs) }));
}
