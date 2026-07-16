// config/contract.js — ported from reference/ini/playercontract.ini
// (fable-plans/plan1.md M6: "contract renewal UI + AI renewals; expiring-
// contract warnings"). Two tables' semantics aren't fully self-explanatory
// from the INI's comments alone — documented here rather than silently
// guessed, same spirit as config/objectives.js's header:
//
//   - OVERALL_OVR_n/AGE_AGE_n ("PERCENTAGE OF ASK" inputs): each is a
//     *descending* list of minimum-threshold brackets (OVR_0=1000/AGE_0=1000
//     are unreachable ceiling rows, the same "stupidly high on purpose" idiom
//     the INI's own CONTRACT_10=100 comment names elsewhere in this file) —
//     read here ascending as "overall/age >= this minimum", highest match
//     wins. Below the lowest real bracket (OVR_6=68, AGE_5=18) there's no
//     row at all; both floor at that bracket's own percentage rather than
//     leaving a gap, matching config/retirement.js's "clamp outside the
//     table's range" precedent.
//   - CONTRACT_LENGTH_<TIER>_PERCENTAGE_n: the INI names these but never
//     documents what the percentage *is of* — engine/contracts.js reads them
//     as "chance the player accepts an offer of this length" (index n =
//     n years), mirroring how PERCENTAGE_OF_ASK reads as a wage-offer
//     acceptance curve. This project caps contract length at 5 years
//     (gen/player.js's own `rng.int(1, 5)`), so each tier's 6th entry
//     (6+ years) is simply never indexed.

export const NUM_DAYS_FOR_RUNNING_OUT_WARNING = 60;
export const PERCENTAGE_OF_RESIGNING_FEE = 7; // % of value, deducted from the transfer budget on a successful renewal (playercontract.ini: "as in FIFA 11")

// RENEWAL_PROBABILITIES_<TIER>_<LENGTH>: CPU renewal-length roll weights.
// "none" = release (contract lapses, player leaves as a free agent).
export const RENEWAL_PROBABILITIES = {
  STARTING11: { none: 5, 1: 5, 2: 15, 3: 30, 4: 30, 5: 15 },
  SUB: { none: 10, 1: 30, 2: 30, 3: 20, 4: 5, 5: 5 },
  RESERVE: { none: 25, 1: 55, 2: 20, 3: 0, 4: 0, 5: 0 },
};

// data/schema's player.contract.squadRole ('crucial'/'important'/'rotation'/
// 'prospect', from gen/squad.js's ROLE_BY_QUARTILE) -> this file's renewal
// tier (playercontract.ini's own STARTING11/SUB/RESERVE naming).
export const RENEWAL_TIER_BY_SQUAD_ROLE = {
  crucial: "STARTING11", important: "STARTING11", rotation: "SUB", prospect: "RESERVE",
};

// PERCENTAGE_OF_ASK_n/_VALUE: acceptance chance (%) by offered-wage-as-a-
// percentage-of-ask.
export const PERCENTAGE_OF_ASK_ACCEPT = [
  { max: 50, val: 0 }, { max: 60, val: 40 }, { max: 80, val: 60 }, { max: 100, val: 80 },
  { max: 120, val: 90 }, { max: 140, val: 100 }, { max: 100000, val: 100 },
];

// CONTRACT_LENGTH_<TIER>_PERCENTAGE_n — see this file's header for how
// engine/contracts.js reads these (index 0 = 1 year offered .. index 4 = 5).
export const CONTRACT_LENGTH_PERCENTAGE = {
  STARTING11: [20, 40, 60, 70, 80, 80],
  SUB: [20, 40, 60, 80, 80, 80],
  RESERVE: [20, 40, 60, 80, 100, 100],
};

// OVERALL_OVR_n/_PERC_n — wage-ask bonus (%) over the player's *current*
// wage, by overall (see header: ascending minimum-threshold reading).
export const OVERALL_ASK_PCT = [
  { min: 0, val: 80 }, { min: 68, val: 80 }, { min: 74, val: 90 }, { min: 78, val: 95 },
  { min: 81, val: 100 }, { min: 85, val: 110 }, { min: 90, val: 120 },
];

// AGE_AGE_n/_PERC_n — wage-ask adjustment (%), by age (see header).
export const AGE_ASK_PCT = [
  { min: 0, val: 0 }, { min: 18, val: 0 }, { min: 22, val: -10 }, { min: 26, val: -15 }, { min: 29, val: -25 }, { min: 32, val: -30 },
];

/** Highest matching `.min` bracket's `.val` — the ascending-minimum reading
 * this file's header describes for OVERALL_ASK_PCT/AGE_ASK_PCT. */
export function minBracketVal(table, x) {
  let val = table[0].val;
  for (const row of table) if (x >= row.min) val = row.val;
  return val;
}
