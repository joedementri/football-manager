// engine/wage.js — player wages, ported from reference/ini/playerwages.ini
// via config/wage.js's tables (fable-plans/plan1.md M6: "Port value/wage
// tables"). `computeWage` is the pure formula: `base(overall) × league
// modifier × (1+agePct) × (1+posPct)`, matching the plan's own worked
// examples verbatim — "90-rated EPL ⇒ 1300×70 ≈ £91k/wk" (age 24/CM carry 0%
// modifiers, so base×league alone lands exactly on that figure) and
// "60-rated League One ⇒ 60×8 = £480/wk" (same 0%-modifier player).

import { WAGE_RATING_BASE, WAGE_AGE_PCT, WAGE_POSITION_PCT } from "../config/wage.js";
import { bracketVal } from "../config/value.js";
import { clubOverallTarget } from "../config/playergen.js";

const MIN_WAGE = 80; // playerwages.ini's own RATING_1_VAL floor (£20) scaled up so even the smallest league modifier never rounds to near-zero

/** @param {object} player - needs overall, age, position. @param {object} league - needs wageModifier. */
export function computeWage(player, league) {
  const base = bracketVal(WAGE_RATING_BASE, player.overall);
  const agePct = bracketVal(WAGE_AGE_PCT, player.age);
  const posPct = WAGE_POSITION_PCT[player.position] ?? 0;
  const wage = base * league.wageModifier * (1 + agePct / 100) * (1 + posPct / 100);
  return Math.max(MIN_WAGE, Math.round(wage));
}

/** Recomputes and stores `player.contract.wage` — only ever called from a
 * real contract event (initial generation, renewal), never a passive
 * checkpoint like engine/value.js's recomputeAllValues (see that file's
 * header: wages don't drift on their own the way value does). */
export function recomputeWage(player, league) {
  player.contract.wage = computeWage(player, league);
  return player.contract.wage;
}

/** Sum of a roster's weekly wages — the Transfers screen's "Weekly Wage
 * Budget" tile needs this live (fable-plans/plan1.md M6: "finances"). */
export function squadWageBill(roster) {
  return roster.reduce((sum, p) => sum + p.contract.wage, 0);
}

// Not INI-derived — reference/ini/tcm_finance_settings.ini's ticket/
// merchandising/stadium income-and-expense model is a much larger unported
// system with no equivalent in plan1.md's "Core mechanics" list (the plan
// only ever mentions a flat "transfer budget + wage budget per season from
// the board" — see engine/season.js's rollover header, "budgets reset").
// This ceiling is instead a plan-authored formula in the same spirit as
// config/playergen.js's clubOverallTarget: it reuses the very wage formula
// just ported above on a representative "average squad player" (overall =
// the club's own generation-time mean, age 24/position CM for 0% secondary
// modifiers) so a club can always comfortably afford a squad built to its
// own level, with room for improvement. The archetype's 0%-modifier age/
// position is a deliberate *floor* estimate — a real generated squad's age
// spread (many players in the +10-20% 25-29 WAGE_AGE prime) and position mix
// (~5/24 slots at attacking positions' +10% WAGE_POSITION) push the real
// bill above that floor, so the headroom is calibrated generously (not the
// ~1.05-1.1x a single archetype's own margin would suggest) to keep a
// freshly generated squad's bill comfortably under the ceiling in the
// common case, verified against sampled squads across prestige tiers.
const WAGE_CEILING_HEADROOM = 1.45;
const SQUAD_SIZE = 24;
export function computeWageCeiling(club, league) {
  const { mean } = clubOverallTarget(club, league);
  const archetype = { overall: Math.round(mean), age: 24, position: "CM" };
  return Math.round(computeWage(archetype, league) * SQUAD_SIZE * WAGE_CEILING_HEADROOM);
}
