// config/settings.js — M11 Settings screen (fable-plans/plan1.md M11:
// "Settings (difficulty, currency, autosave, sim detail)"; ground rule #6:
// "display currency selectable in Settings, fixed rates"). Not an INI port —
// four small, author-defined options with real effects documented at each
// one's own consumer:
//   difficulty  -> engine/sim/match.js/comps/cup.js/comps/continental.js's
//                  user-tactic-modifier call sites (plan1.md: "difficulty
//                  setting scales user team strength ±3%")
//   currency    -> core/format.js's money() (ground rule #6)
//   autosave    -> js/main.js's post-Advance autosave hook
//   simDetail   -> ui/matchday.js's live ticker feed ("chance-miss" flavour
//                  events hidden when set to Key Events Only)
export const DIFFICULTIES = [
  { id: "easy", name: "Easy", modifier: 0.03 },
  { id: "normal", name: "Normal", modifier: 0 },
  { id: "hard", name: "Hard", modifier: -0.03 },
];

export const CURRENCIES = [
  { id: "GBP", name: "British Pound (£)" },
  { id: "USD", name: "US Dollar ($)" },
  { id: "EUR", name: "Euro (€)" },
];

export const SIM_DETAILS = [
  { id: "full", name: "Full Commentary" },
  { id: "key-events", name: "Key Events Only" },
];

export const DEFAULT_SETTINGS = { difficulty: "normal", currency: "GBP", autosave: true, simDetail: "full" };

export function difficultyById(id) {
  return DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES[1];
}
