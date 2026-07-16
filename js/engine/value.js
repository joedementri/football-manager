// engine/value.js — player market value, ported from reference/ini/
// playervalues.ini via config/value.js's tables (fable-plans/plan1.md M6:
// "Port value/wage tables"). `computeValue` is the pure formula (base value
// by overall × one multiplier per modifier); `recomputeValue` is the setter
// wrapper used wherever the plan schema's "value — recomputed lazily" note
// applies: gen/player.js at generation, engine/growth.js's twice-a-season
// growth checkpoints (via recomputeAllValues), and engine/contracts.js
// whenever a contract's terms change (years-remaining feeds the [CONTRACT]
// modifier below).

import { positionInfo } from "../config/positions.js";
import {
  bracketVal, RATING_VALUE, AGE_VALUE_PCT, GK_AGE_MOD, GK_MIN_AGE_MOD,
  POTENTIAL_VALUE_PCT, CONTRACT_VALUE_PCT, FORM_VALUE_PCT, CLUB_PRESTIGE_VALUE_PCT, POSITION_VALUE_PCT,
} from "../config/value.js";

const MIN_VALUE = 1000; // playervalues.ini's own RATING_1_VAL floor

/**
 * @param {object} player - needs overall, potential, age, position, form, contract.endYear
 * @param {object} club - needs prestige
 * @param {number} seasonStartYear - for contract.endYear -> years-remaining
 */
export function computeValue(player, club, seasonStartYear) {
  const base = bracketVal(RATING_VALUE, player.overall);

  const isGK = positionInfo(player.position).area === "GK";
  const lookupAge = isGK && player.age >= GK_MIN_AGE_MOD ? player.age + GK_AGE_MOD : player.age;
  const agePct = bracketVal(AGE_VALUE_PCT, lookupAge);

  const remainingPotential = Math.max(0, player.potential - player.overall);
  const potPct = bracketVal(POTENTIAL_VALUE_PCT, remainingPotential);

  const yearsLeft = Math.max(0, player.contract.endYear - seasonStartYear);
  const contractPct = bracketVal(CONTRACT_VALUE_PCT, yearsLeft);

  const formIdx = Math.min(10, Math.max(1, Math.round(player.form))) - 1;
  const formPct = FORM_VALUE_PCT[formIdx];

  const prestigePct = bracketVal(CLUB_PRESTIGE_VALUE_PCT, club.prestige);
  const posPct = POSITION_VALUE_PCT[player.position] ?? 0;

  const multiplier =
    (1 + agePct / 100) * (1 + potPct / 100) * (1 + contractPct / 100) *
    (1 + formPct / 100) * (1 + prestigePct / 100) * (1 + posPct / 100);

  return Math.max(MIN_VALUE, Math.round(base * Math.max(0, multiplier)));
}

/** Recomputes and stores `player.value` — see this file's header for when to call it. */
export function recomputeValue(player, club, seasonStartYear) {
  player.value = computeValue(player, club, seasonStartYear);
  return player.value;
}

/** Refreshes every player's value in the world against their *current* club
 * (fable-plans/plan1.md's "value — recomputed lazily" schema note) — called
 * at both growth checkpoints (engine/season.js's applyMidSeasonGrowth and
 * rolloverSeason) since overall/potential/age all just changed. Wage is
 * deliberately NOT touched here — wages only change via a contract event
 * (initial signing, renewal), never drift on their own like value does. */
export function recomputeAllValues(state) {
  for (const player of state.players) {
    const club = state.clubsById.get(player.clubId);
    if (club) recomputeValue(player, club, state.seasonStartYear);
  }
}
