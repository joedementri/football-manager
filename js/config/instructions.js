// config/instructions.js — fable-plans/plan2.md F2: Formations > Edit >
// Player Instructions. Categories/options/descriptions are transcribed
// *verbatim* from the 9 CUSTOMISE_FORMATIONS_PLAYER_INSTRUCTIONS_*.png pics
// (FORWARDS pages 1-3, INSIDE_MID pages 1-3, OUTSIDE_MID pages 1-3) — no INI
// table lists these at all, so every option/description string comes only
// from the pics, per plan2.md F2.2.
//
// [JUDGMENT CALL] (plan2-decisions.md F2) position-group membership: the 3
// pics each sample exactly one player (Taylor/ST -> FORWARDS, Hollands/CM ->
// INSIDE_MID, Barcham/LM -> OUTSIDE_MID) — the full membership of each group
// isn't shown anywhere, and the build note's own "defensive positions get
// none — matches pics" is the only other constraint given. Assigned:
// FORWARDS = every ATT-area code + wingers (RF/CF/LF/RS/ST/LS/RW/LW),
// INSIDE_MID = the 6 central mid codes (RCM/CM/LCM/RAM/CAM/LAM), OUTSIDE_MID
// = the 2 wide mid codes (RM/LM). Every DEF-area code, GK, and the 3 CDM
// codes (RDM/CDM/LDM, labelled "Defensive Midfielder" in config/positions.js)
// get no instructions page at all.
//
// Sim hooks (plan2.md F2.2: "±2-10% weighting tweaks inside sim/events.js
// chance attribution, all constants [TUNED]"): this engine has no
// through-ball/cross/central "chance type" taxonomy to hook into (sim/
// events.js just weight-picks a shooter/assister by attribute composite —
// see engine/sim/core.js's pickWeighted), so the literal per-instruction
// effects named in the plan (e.g. "shifts crossing vs central chance mix")
// are approximated as small SHOOTING/ASSIST weight multipliers on
// pickWeighted's existing candidates instead of inventing a new chance-type
// system — see engine/sim/events.js's applyInstructionMultiplier for exactly
// which option maps to which multiplier, logged in plan2-decisions.md F2.

export const FORWARDS_CODES = ["RF", "CF", "LF", "RS", "ST", "LS", "RW", "LW"];
export const INSIDE_MID_CODES = ["RCM", "CM", "LCM", "RAM", "CAM", "LAM"];
export const OUTSIDE_MID_CODES = ["RM", "LM"];

export function instructionGroupFor(positionCode) {
  if (FORWARDS_CODES.indexOf(positionCode) !== -1) return "FORWARDS";
  if (INSIDE_MID_CODES.indexOf(positionCode) !== -1) return "INSIDE_MID";
  if (OUTSIDE_MID_CODES.indexOf(positionCode) !== -1) return "OUTSIDE_MID";
  return null;
}

// Each category: key (store field), title (card heading, transcribed), and
// options in on-pitch dot order (index 0 = leftmost dot). `effect` (may be
// absent = no sim hook) is [TUNED], applied in engine/sim/events.js.
export const INSTRUCTION_GROUPS = {
  FORWARDS: [
    {
      key: "defensiveSupport",
      title: "DEFENSIVE SUPPORT",
      options: [
        { value: "Press Back Line", desc: "Apply pressure on the back line" },
        { value: "Mixed Defense", defaultLabel: true, desc: "Come back to support the defense when needed" },
        { value: "Cut Passing Lanes", desc: "Split the opposition and cut out the passing lanes" },
      ],
      defaultIndex: 1,
      effect: { index: 0, shootingMult: -0.02 }, // Press Back Line: more defensive graft, small shooting-share cost
    },
    {
      key: "supportRuns",
      title: "SUPPORT RUNS",
      options: [
        { value: "Drift Wide", desc: "Make runs to wide areas of the pitch" },
        { value: "Varied Width", defaultLabel: true, desc: "Stay wide or cut inside depending on the situation" },
        { value: "Stay Central", desc: "Stay in central areas of the pitch" },
      ],
      defaultIndex: 1,
      effect: [
        { index: 0, assistMult: 0.05 }, // Drift Wide: more crossing -> more assist-share
        { index: 2, shootingMult: 0.05 }, // Stay Central: more cutback/central shooting-share
      ],
    },
    {
      key: "attackingRuns",
      title: "ATTACKING RUNS",
      options: [
        { value: "Get in Behind", desc: "Make forward runs in behind the defense" },
        { value: "Mixed Attack", defaultLabel: true, desc: "Occasionally make forward runs when the opportunity arises" },
        { value: "Target Man", desc: "Back into an opponent and ask for the ball to feet" },
      ],
      defaultIndex: 1,
      effect: [
        { index: 0, shootingMult: 0.10 }, // Get in Behind
        { index: 2, assistMult: 0.10 }, // Target Man: hold-up/knock-down link play
      ],
    },
  ],
  INSIDE_MID: [
    {
      key: "attackingSupport",
      title: "ATTACKING SUPPORT",
      options: [
        { value: "Stay Back on Attack", desc: "Never make forward runs while on attack" },
        { value: "Varied Attack", defaultLabel: true, desc: "Occasionally make forward runs when the opportunity arises" },
        { value: "Get Forward", desc: "Join the attack and make runs beyond the striker(s)" },
      ],
      defaultIndex: 1,
      effect: [
        { index: 0, shootingMult: -0.02 },
        { index: 2, shootingMult: 0.10 },
      ],
    },
    {
      key: "supportOnCrosses",
      title: "SUPPORT ON CROSSES",
      options: [
        { value: "Get into the Box", desc: "Make runs into the penalty area in crossing situations" },
        { value: "Mixed Attack", defaultLabel: true, desc: "Run into the penalty area or stay on the edge in crossing situation" },
        { value: "Stay on Edge of Box", desc: "Stay on the edge of the penalty area in crossing situations" },
      ],
      defaultIndex: 1,
      effect: [
        { index: 0, shootingMult: 0.05 },
        { index: 2, assistMult: 0.05 },
      ],
    },
    {
      key: "positioningFreedom",
      title: "POSITIONING FREEDOM",
      options: [
        { value: "Free Roam", desc: "Take a free role and roam the attacking third" },
        { value: "Stick to Position", defaultLabel: true, desc: "Stick to your position while attacking" },
      ],
      defaultIndex: 1,
    },
  ],
  OUTSIDE_MID: [
    {
      key: "defensiveSupport",
      title: "DEFENSIVE SUPPORT",
      options: [
        { value: "Come Back on Defense", desc: "Always try to track back and support the defense" },
        { value: "Mixed Defense", defaultLabel: true, desc: "Come back to support the defense when needed" },
        { value: "Stay Forward", desc: "Do not come back to support the defense" },
      ],
      defaultIndex: 1,
      effect: [
        { index: 0, shootingMult: -0.02 },
        { index: 2, shootingMult: 0.02 },
      ],
    },
    {
      key: "chanceCreation",
      title: "CHANCE CREATION",
      options: [
        { value: "Cut Inside", desc: "Make cutting runs to the inside from out wide" },
        { value: "Varied Width", defaultLabel: true, desc: "Stay wide or cut inside depending on the situation" },
        { value: "Stay Wide", desc: "Always try to stay wide and close to the line" },
      ],
      defaultIndex: 1,
      effect: [
        { index: 0, shootingMult: 0.05 },
        { index: 2, assistMult: 0.05 },
      ],
    },
    {
      key: "supportRuns",
      title: "SUPPORT RUNS",
      options: [
        { value: "Get in Behind", desc: "Make forward runs in behind the defense" },
        { value: "Mixed Support", defaultLabel: true, desc: "Make forward runs or come short depending on the situation" },
        { value: "Come Short", desc: "Come short and ask for the ball to feet" },
      ],
      defaultIndex: 1,
      effect: [
        { index: 0, shootingMult: 0.10 },
        { index: 2, assistMult: 0.05 },
      ],
    },
  ],
};

/** Default instruction state for a player who belongs to `group` — every
 * category starts at its own `defaultIndex`. */
export function defaultInstructionsFor(group) {
  const cats = INSTRUCTION_GROUPS[group];
  if (!cats) return {};
  const out = {};
  for (const cat of cats) out[cat.key] = cat.defaultIndex;
  return out;
}

/** Sums every active category's `effect` for one player's current
 * selections into a single {shootingMult, assistMult} — engine/sim/
 * events.js's own multiplierFn hook reads this per candidate. */
export function resolveInstructionEffects(group, playerInstructions) {
  const cats = INSTRUCTION_GROUPS[group];
  let shootingMult = 0;
  let assistMult = 0;
  if (!cats || !playerInstructions) return { shootingMult, assistMult };
  for (const cat of cats) {
    const idx = playerInstructions[cat.key];
    if (idx == null || !cat.effect) continue;
    const effects = Array.isArray(cat.effect) ? cat.effect : [cat.effect];
    for (const e of effects) {
      if (e.index !== idx) continue;
      shootingMult += e.shootingMult || 0;
      assistMult += e.assistMult || 0;
    }
  }
  return { shootingMult, assistMult };
}
