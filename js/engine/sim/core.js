// engine/sim/core.js — shared statistical core for both sim/quick.js (CPU
// vs CPU, no timeline) and sim/events.js (user matches, minute timeline).
// Everything here is a pure function of its inputs so it stays testable
// headless (plan1.md's "Notes for the implementing model": "all mutations
// via engine functions so the sim stays testable"). Config numbers are
// ported from reference/ini/simsettings.ini via config/sim.js; the formulas
// combining them (team strength -> goal expectancy -> chance counts ->
// weighted incident-player selection -> match ratings) are authored,
// calibrated so even (0-gap) teams average ~1.3-1.5 goals each and a +10
// overall gap gives the stronger side roughly a 70% win rate (plan1.md's
// "Match simulation" anchors) — see dev/balance.html for the season-long
// spot-check this is calibrated against.

import { positionInfo } from "../../config/positions.js";
import {
  INFLUENCE, FOG_RANGE, SCORE_SCALES, CHANCES_STRONG, CHANCES_WEAK,
  MATCH_RATINGS, POS_INDEX,
} from "../../config/sim.js";

/** Tired players both play a little worse (this) and are less likely to be
 * picked at all (engine/sim/lineup.js reuses this same factor) — a single
 * source of truth for "fitness matters" per plan1.md's "Squad rotation
 * matters". */
export function fitnessPerfFactor(player) {
  return 0.9 + 0.1 * (player.fitness / 100);
}

function effectiveOverall(player) {
  return player.overall * fitnessPerfFactor(player);
}

/** Average (fitness-adjusted) overall of a starting XI. */
export function xiStrength(lineupPlayers) {
  if (lineupPlayers.length === 0) return 0;
  return lineupPlayers.reduce((s, p) => s + effectiveOverall(p), 0) / lineupPlayers.length;
}

/**
 * Composite match-strength score (plan1.md: "team strength = starting-XI
 * weighted overall (rating influence 78%), + home adv 4, + prestige/
 * competition terms (per [INFLUENCE])"). `opponentXi` is the other side's
 * average overall, used for the small COMPETITION amplifier term.
 * `tacticModifier` (M11, config/tactics.js) is a small ±fraction — 0 for
 * every CPU side and for the user's own side when playing on Default — that
 * scales the whole score, same "flat percentage nudge" shape the plan's own
 * "affecting sim ±2%" spec describes.
 */
export function teamStrength({ xiAvg, opponentXiAvg, club, isHome, tacticModifier = 0 }) {
  const rating = xiAvg * (INFLUENCE.RATING / 100);
  const homeAdv = isHome ? INFLUENCE.HOMEADV : 0;
  const prestige = (club.prestige * INFLUENCE.PRESTIGEMULTIPLER) * (INFLUENCE.DOMESTICPRESTIGE / 100);
  const competition = (xiAvg - opponentXiAvg) * (INFLUENCE.COMPETITION / 100);
  return (rating + homeAdv + prestige + competition) * (1 + tacticModifier);
}

const LAMBDA_BASE = 1.35; // even teams ~1.3-1.5 goals each (plan1.md anchor)
const GAP_K = 1.045; // calibrated so a +10 gap -> ~70% win rate; see dev/balance.html

/**
 * Strength gap -> each side's Poisson goal expectancy. FOG (plan1.md:
 * "giant-killing possible per [FOG]") widens variance when the two sides
 * are close (within FOG_RANGE overall points) by jittering the gap before
 * converting to lambda, on top of a smaller always-on jitter so even
 * mismatched fixtures aren't perfectly deterministic.
 */
export function expectedGoals(gap, rng) {
  const alwaysJitter = rng.gaussian(0, 1.2);
  const fogJitter = Math.abs(gap) <= FOG_RANGE ? rng.gaussian(0, 2.5) : 0;
  const jitteredGap = gap + alwaysJitter + fogJitter;
  const lambdaHome = clamp(LAMBDA_BASE * Math.pow(GAP_K, jitteredGap), 0.12, 4.5);
  const lambdaAway = clamp(LAMBDA_BASE * Math.pow(GAP_K, -jitteredGap), 0.12, 4.5);
  return { lambdaHome, lambdaAway };
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/** Knuth's Poisson sampler — fine for the small lambdas (<=~5) match goal
 * counts use; draws from the given RngStream so it stays seed-deterministic. */
export function poissonSample(rng, lambda) {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng.next();
  } while (p > L);
  return k - 1;
}

/** [SCORE] scale-bucket lookup -> how many clear chances each side gets this
 * match (plan1.md events.js: "chances strong/weak counts from the [SCORE]
 * gap-scale buckets"). Ties (gap===0) call the home side "strong" — an
 * arbitrary but stable choice since the table needs *a* stronger side. */
export function chanceCounts(gap, rng) {
  const abs = Math.abs(gap);
  let bucket = SCORE_SCALES.length - 1;
  for (let i = 0; i < SCORE_SCALES.length; i++) {
    if (abs <= SCORE_SCALES[i]) { bucket = i; break; }
  }
  const [strongLo, strongHi] = CHANCES_STRONG[bucket];
  const [weakLo, weakHi] = CHANCES_WEAK[bucket];
  const strongIsHome = gap >= 0;
  return {
    strongIsHome,
    strongCount: rng.int(strongLo, strongHi),
    weakCount: rng.int(weakLo, weakHi),
  };
}

/* --------------------------------------------------------------------------
 * Weighted incident-player selection ([SHOOTING_ATTRIBS]/[ASSIST_ATTRIBS]/
 * [CARDING_ATTRIBS]/[INJURY_ATTRIBS]/[PENALTY_ATTRIBS] + their WEIGHT_n
 * curves) — see config/sim.js's header for the attribute-id mapping and the
 * POS_n ordering this assumes (ATT, MID, DEF, GK — the only reading under
 * which both the shooting and carding tables come out football-sensible).
 * ------------------------------------------------------------------------ */

function posBiasValue(posBias, area) {
  switch (area) {
    case "ATT": return posBias.POS_1;
    case "MID": return posBias.POS_2;
    case "DEF": return posBias.POS_3;
    case "GK": return posBias.POS_4;
    default: return 0;
  }
}

function attrScore(attrs, form, attrName) {
  if (attrName === "form") return form * 10 - 5; // 1..10 -> 5..95
  if (!attrName) return 0; // dropped id-9 (tactical awareness) term — see config/sim.js
  return attrs[attrName] ?? 0;
}

/** 0-100ish composite "aptitude" for this incident type, for one player. */
function compositeScore(config, player, area) {
  let weighted = 0;
  for (const term of config.terms) weighted += term.value * attrScore(player.attrs, player.form, term.attr);
  const posScore = 50 + posBiasValue(config.posBias, area) * 15; // small int code -> 0-99ish scale
  weighted += config.posBias.pos * posScore;
  return clamp(weighted / 100, 0, 100);
}

/** config/sim.js's WEIGHT_n curves are keyed by an 11-step bucket (0-10),
 * same convention as config/playergen.js's skill-move bucket ("better
 * players skew to higher buckets"). */
function selectionWeight(config, player, area) {
  const bucket = clamp(Math.round(compositeScore(config, player, area) / 10), 0, 10);
  return config.weightCurve[bucket];
}

/** Weighted-random pick among candidates (each `{player, area}`); falls back
 * to a uniform pick if every candidate rolled a zero weight (e.g. an entire
 * back line with terrible finishing composites still needs *someone* picked
 * as the nominal scorer of a converted chance). `multiplierFn` (F2, plan2.md
 * "Player Instructions" sim hooks — engine/sim/events.js's own header
 * explains why this is a weight multiplier rather than a new chance-type
 * system) optionally rescales one candidate's weight post-hoc; defaults to
 * an unchanged 1x for every existing call site. */
export function pickWeighted(rng, candidates, config, multiplierFn = null) {
  const weights = candidates.map((c) => selectionWeight(config, c.player, c.area) * (multiplierFn ? Math.max(0, 1 + multiplierFn(c)) : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return rng.pick(candidates);
  let roll = rng.next() * total;
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

/** Every outfield player of a lineup as a `{player, area}` candidate list —
 * the shape pickWeighted expects. GK excluded (scorer/assist/card/injury/
 * penalty candidates are always outfield players in this model). */
export function outfieldCandidates(lineupPlayers) {
  return lineupPlayers
    .filter((p) => positionInfo(p.position).area !== "GK")
    .map((p) => ({ player: p, area: positionInfo(p.position).area }));
}

/** Every player of a lineup (GK included) as a `{player, area}` candidate
 * list — injuries (and match ratings) apply to goalkeepers too. */
export function allCandidates(lineupPlayers) {
  return lineupPlayers.map((p) => ({ player: p, area: positionInfo(p.position).area }));
}

/* --------------------------------------------------------------------------
 * Match ratings ([MATCH_RATINGS])
 * ------------------------------------------------------------------------ */

/**
 * One player's 0-100 match rating (plan1.md: "base 60, goal/assist/
 * cleansheet/win+8/loss-5 style from [MATCH_RATINGS]").
 * @param {object} opts
 * @param {string} opts.area - "GK"|"DEF"|"MID"|"ATT"
 * @param {number} opts.goals
 * @param {number} opts.assists
 * @param {boolean} opts.teamWon
 * @param {boolean} opts.teamLost
 * @param {boolean} opts.cleanSheet - team's own goals-against was 0
 * @param {number} opts.concededByTeam - goals the player's team conceded
 * @param {boolean} opts.sentOff
 * @param {import("../../core/rng.js").RngStream} opts.rng
 */
export function computeMatchRating({ area, goals, assists, teamWon, teamLost, cleanSheet, concededByTeam, sentOff, rng }) {
  let r = MATCH_RATINGS.BASE[area];
  r += goals * MATCH_RATINGS.GOAL[area];
  r += assists * MATCH_RATINGS.ASSIST[area];
  if (concededByTeam > 0) r += concededByTeam * MATCH_RATINGS.CONCEDED[area];
  if (cleanSheet) r += MATCH_RATINGS.CLEANSHEET[area];
  if (teamWon) r += MATCH_RATINGS.TEAMWIN;
  if (teamLost) r += MATCH_RATINGS.TEAMLOSS;
  if (sentOff) r += MATCH_RATINGS.SENDINGOFF;
  r += rng.float(-MATCH_RATINGS.RANDOMINC / 2, MATCH_RATINGS.RANDOMINC / 2);
  return clamp(Math.round(r), 0, MATCH_RATINGS.MAXRATING);
}

export { POS_INDEX };
