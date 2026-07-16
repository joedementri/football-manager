// config/tactics.js — M11 in-game tactics presets (fable-plans/plan1.md M11:
// "Tactics ... presets affecting sim ±2%"). Not an INI port — reference/ini
// has no in-match tactics-preset table (simsettings.ini's [INFLUENCE] table,
// already ported into config/sim.js, is the closest thing, and stays
// untouched) — four small, author-tuned modifiers matching the plan's own
// "±2%" magnitude, applied as a flat multiplier on engine/sim/core.js's
// teamStrength() whenever the user's own club is playing (engine/sim/
// match.js for the interactive league match, engine/comps/cup.js and
// engine/comps/continental.js for the user's quick-simmed cup/continental
// ties — see each file's own call site for how the modifier is threaded in).
export const TACTICS = [
  { id: "balanced", name: "Default", description: "Your team's default tactic.", modifier: 0 },
  { id: "possession", name: "Possession", description: "Patient build-up play, retaining the ball and controlling the tempo.", modifier: 0.02 },
  { id: "counter-attack", name: "Counter Attack", description: "Sit in and break with speed the moment you win the ball back.", modifier: 0.015 },
  { id: "high-pressure", name: "High Pressure", description: "Press high up the pitch and force turnovers close to goal.", modifier: 0.01 },
];

export const DEFAULT_TACTIC_ID = "balanced";

export function tacticById(id) {
  return TACTICS.find((t) => t.id === id) || TACTICS[0];
}
