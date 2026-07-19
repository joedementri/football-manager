// config/scouting.js — GTN pro scouting (fable-plans/plan1.md M8), ported
// from reference/ini/scout.ini's [GTN] + [SCOUT_MISSION] + [SCOUT_REPORT]
// sections. scout.ini's [YOUTH_SCOUT]/[PLAYER_ATTRIBUTES]/[YOUTH_SQUAD]/
// [YOUTH_PLAYER_RETIREMENT]/[PLAYER_REGEN] sections belong to M9's youth
// academy, not this milestone, and aren't read here.
//
// Two things below are plan1.md's own numbers, not the INI's: the "level 1
// -> ±6, level 2 -> ±3, level 3 -> exact" fuzzy-range table (RANGE_HALF_
// WIDTH_BY_LEVEL) and the "10 days first report, then weekly" cadence
// (FIRST_REPORT_DAYS/REPORT_INTERVAL_DAYS) — scout.ini's own SCOUT_REPORT
// percentages are expressed as odds against an unmodeled "scoutable pool"
// size, so plan1.md's explicit prose is the more portable source for pacing.
//
// scout.ini's shared cost tables use "Knowledge" as the star that gates
// report quality/tier-finding odds; plan1.md's M8 prose calls the same stat
// "Judgment" for GTN scouts ("Judgment 1–5★ (accuracy of ranges + odds of
// finding high-potential)") — so SCOUT_COST_KNOWLEDGE_LEVEL_* below is read
// as the cost-by-Judgment curve, and SCOUT_COST_EXPERIENCE_LEVEL_* as cost-
// by-Experience, one shared curve for both this milestone's GTN scouts and
// M9's youth scouts (scout.ini's [GTN] section doesn't repeat its own).

export const MAX_HIRED_SCOUTS = 6; // plan1.md M8: "Hire up to 6 scouts"
export const POOL_SIZE = 5; // SCOUT_MINIMUM/MAXIMUM_SCOUTS_IN_POOL — scout.ini [GTN] lines 44-45 (both 5)
export const POOL_REFRESH_DAYS = 7; // SCOUT_NUM_DAYS_FOR_POOL_UPDATE — scout.ini [GTN] line 42

// SCOUT_COST_KNOWLEDGE_LEVEL_1..5 / SCOUT_COST_EXPERIENCE_LEVEL_1..5 —
// scout.ini [YOUTH_SCOUT] lines 26-36. Index 0 unused (stars are 1-5).
export const HIRE_COST_BY_JUDGMENT = [0, 12000, 60000, 300000, 1300000, 2500000];
export const HIRE_COST_BY_EXPERIENCE = [0, 7000, 40000, 150000, 750000, 1500000];

export function hireCost(experience, judgment) {
  return HIRE_COST_BY_EXPERIENCE[experience] + HIRE_COST_BY_JUDGMENT[judgment];
}

// SCOUT_SACKING_COST_PER_LEVEL — scout.ini [GTN] line 41: "5,000 for each
// star level (Experience Stars * 5,000) + (Knowledge Stars * 5,000)".
export const SACK_COST_PER_STAR = 5000;
export function sackCost(scout) {
  return (scout.experience + scout.judgment) * SACK_COST_PER_STAR;
}

// Monthly salary has no dedicated INI table (every scout.ini cost figure is
// a one-off hire price) — plan1.md M8 only says "hire cost + monthly salary
// by stars", so the salary is derived as a fixed percentage of the same
// hire-cost curve above rather than inventing a second, unrelated table.
const MONTHLY_SALARY_PCT_OF_HIRE_COST = 2;
export function monthlySalary(experience, judgment) {
  return Math.round((hireCost(experience, judgment) * MONTHLY_SALARY_PCT_OF_HIRE_COST) / 100 / 100) * 100;
}

// SCOUTS_NUM_FOR_TEAM_x / SCOUTS_EXPERIENCE_MIN|MAX_FOR_TEAM_x / SCOUTS_
// JUDGMENT_MIN|MAX_FOR_TEAM_x — scout.ini [GTN] lines 65-123: pool-candidate
// stat ranges scale with the hiring club's own "team star rating" (0.0-5.0
// in .5 steps). data/clubs.json's prestige is already a 1-10 integer, which
// maps 1:1 onto this table's 11 rows read as rating*2 (rating 0.5 = index 1,
// rating 5.0 = index 10) — index 0 (rating 0.0) is never reached by a real
// club but kept for completeness/safety.
export const SCOUT_STAT_RANGE_BY_TEAM_TIER = [
  { expMin: 1, expMax: 3, judgMin: 2, judgMax: 3 }, // 0.0
  { expMin: 1, expMax: 3, judgMin: 2, judgMax: 3 }, // 0.5
  { expMin: 1, expMax: 3, judgMin: 2, judgMax: 3 }, // 1.0
  { expMin: 2, expMax: 3, judgMin: 2, judgMax: 3 }, // 1.5
  { expMin: 2, expMax: 3, judgMin: 2, judgMax: 3 }, // 2.0
  { expMin: 2, expMax: 4, judgMin: 2, judgMax: 3 }, // 2.5
  { expMin: 2, expMax: 4, judgMin: 2, judgMax: 4 }, // 3.0
  { expMin: 3, expMax: 4, judgMin: 3, judgMax: 4 }, // 3.5
  { expMin: 3, expMax: 4, judgMin: 3, judgMax: 4 }, // 4.0
  { expMin: 4, expMax: 4, judgMin: 4, judgMax: 5 }, // 4.5
  { expMin: 4, expMax: 5, judgMin: 4, judgMax: 5 }, // 5.0
];
export function scoutStatRangeForClub(club) {
  const idx = Math.max(0, Math.min(10, Math.round(club.prestige)));
  return SCOUT_STAT_RANGE_BY_TEAM_TIER[idx];
}

// MAX_SCOUTED_PLAYERS_LEVEL_1..5 — scout.ini [GTN] lines 53-57: cap on how
// many players a single mission can carry, keyed by the scout's Judgment.
export const MAX_SCOUTED_PLAYERS_BY_JUDGMENT = [0, 4, 7, 10, 15, 20];

// SCOUT_MISSION_DURATION_0/1/2 (months) + SCOUT_MISSION_BASE_COST_0/1/2 (£) —
// scout.ini [SCOUT_MISSION] lines 638-644. SCOUT_MISSION_MODIFIER_COST_0/1/2
// (lines 646-648) is NOT separately applied on top of BASE_COST — the three
// base-cost rows already scale per duration tier (10k/30k/60k), so layering
// a further 1x/2x/3x multiplier would double-count the same tier scaling;
// BASE_COST is used as the mission's full up-front price instead.
export const MISSION_TIERS = [
  { label: "Short", months: 3, baseCost: 10000 },
  { label: "Medium", months: 6, baseCost: 30000 },
  { label: "Long", months: 9, baseCost: 60000 },
];
export const MISSION_SCOUT_LEVEL_COST_PCT = 10; // SCOUT_MISSION_SCOUT_LEVEL_MODIFIER — scout.ini line 650
export function missionCost(tierIndex, scout) {
  const tier = MISSION_TIERS[tierIndex];
  const avgLevel = (scout.experience + scout.judgment) / 2;
  return Math.round(tier.baseCost * (1 + (MISSION_SCOUT_LEVEL_COST_PCT / 100) * (avgLevel - 1)));
}

// EXPERIENCE_1..5_PERC_FIND_PLAYERS_RANGE_0/1 — scout.ini [SCOUT_REPORT]
// lines 660-673, read here as "how many new players one report can surface"
// (index 0 unused, stars are 1-5).
export const FIND_COUNT_RANGE_BY_EXPERIENCE = [null, [1, 2], [2, 3], [3, 5], [4, 6], [5, 7]];

// Report cadence — plan1.md M8 verbatim: "After 10 days first report, then
// updates weekly: up to MAX_SCOUTED_PLAYERS_LEVEL_★ players."
export const FIRST_REPORT_DAYS = 10;
export const REPORT_INTERVAL_DAYS = 7;

// Fuzzy range half-widths by scouting.level — plan1.md M8 verbatim: "scouting
// level 1 ⇒ ovr/pot as wide ranges (±6), level 2 ⇒ ±3, level 3 (fully
// scouted) ⇒ exact." Level 0 (never scouted at all) is this project's own
// addition so "un-scouted players in Search show ranges too" (plan1.md) is
// meaningful — matches RANGE_START_HALF_WIDTH below (F3-fixes: "very wide
// when unscouted") rather than the old 12, so a player nobody has ever
// looked at and a player on day 0 of a fresh scout assignment read as
// equally wide-open.
export const RANGE_HALF_WIDTH_BY_LEVEL = [20, 6, 3, 0];
export function scoutingRangeFor(trueValue, level) {
  const half = RANGE_HALF_WIDTH_BY_LEVEL[level];
  return [Math.max(1, trueValue - half), Math.min(99, trueValue + half)];
}

// F3-fixes: a direct single-player scout task ("Ask <scout> to Scout <name>")
// narrows continuously, day by day, rather than in the old discrete level
// steps above — owner's own recalled pacing (not in scout.ini, which has no
// star-tiered report-completion-time table): 5★ Judgment = 3 days, 1★ = 8
// days, linear in between. Judgment already gates "accuracy of ranges"
// elsewhere in this file (SCOUT_COST_KNOWLEDGE_LEVEL_* comment above), so
// it's the stat that governs how fast an accurate report comes together
// too. [TUNED]. Index 0 unused (stars are 1-5).
export const REPORT_DAYS_BY_JUDGMENT = [null, 8, 7, 6, 4, 3];

// Widest a continuously-narrowing range starts at before any of its days
// have elapsed — owner: "the range should be very wide when unscouted."
// [TUNED], one step past RANGE_HALF_WIDTH_BY_LEVEL's own widest band (12)
// used to be, continuing that table's halving pattern one notch further out.
export const RANGE_START_HALF_WIDTH = 20;

/** Continuous half-width for a value `elapsedDays` into a `totalDays`
 * scouting task — narrows linearly from RANGE_START_HALF_WIDTH down to 0
 * (exact) once elapsedDays >= totalDays. */
export function continuousHalfWidth(elapsedDays, totalDays) {
  if (elapsedDays == null || !totalDays) return RANGE_START_HALF_WIDTH;
  const frac = Math.max(0, Math.min(1, elapsedDays / totalDays));
  return Math.round(RANGE_START_HALF_WIDTH * (1 - frac));
}

// GTN mission "player type" tags (plan1.md's own example: "'Pacey, Prolific'
// exactly as the Transfers reference pic shows"). scout.ini's PLAYER_TYPES
// enum (SKILLED/PHYSICAL_SPEED/PHYSICAL_POWER/MENTALLY_STRONG/GOOD_HANDS/
// ATTACK_MINDED/DEFENSIVE_MINDED, scout.ini lines 217-225) names the same
// idea but not a display vocabulary — these labels + attribute-based
// matchers are authored from that enum, same footing as gen/player.js's own
// archetype tables (fable-plans/plan1.md sanctions player-knowledge
// authoring where the INI has no literal string table).
function avg(...vals) { return vals.reduce((s, v) => s + v, 0) / vals.length; }
export const SCOUT_TAGS = [
  { id: "pacey", label: "Pacey", match: (p) => avg(p.attrs.acceleration, p.attrs.sprintSpeed) },
  { id: "prolific", label: "Prolific", match: (p) => p.attrs.finishing },
  { id: "skilled", label: "Skilled", match: (p) => avg(p.attrs.dribbling, p.attrs.ballControl) + p.skillMoves * 6 },
  { id: "creative", label: "Creative", match: (p) => avg(p.attrs.vision, p.attrs.shortPass, p.attrs.longPass) },
  { id: "powerful", label: "Powerful", match: (p) => avg(p.attrs.strength, p.attrs.aggression) },
  { id: "aerial", label: "Aerial Threat", match: (p) => avg(p.attrs.headingAcc, p.attrs.jumping) },
  { id: "solid", label: "Solid Defender", match: (p) => avg(p.attrs.standTackle, p.attrs.marking, p.attrs.interceptions) },
  { id: "composed", label: "Composed", match: (p) => avg(p.attrs.reactions, p.attrs.composure) },
  { id: "shotstopper", label: "Shot-Stopper", match: (p) => avg(p.attrs.gkReflexes, p.attrs.gkDiving, p.attrs.gkHandling) },
];
export function tagScore(player, tagIds) {
  return tagIds.reduce((sum, id) => sum + (SCOUT_TAGS.find((t) => t.id === id)?.match(player) ?? 0), 0);
}
