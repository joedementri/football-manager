// config/transferai.js — ported from reference/ini/transfer.ini (fable-plans/
// plan1.md M7: "CPU↔CPU window AI"). Tables not ported, documented why:
//
//   - RELOCATION_PROBABILITY_{0-3}_{0-3} is a 4x4 Top/Medium/Lower/Non-
//     European matrix. This project's leagues only carry a 1-10 prestige
//     number (data/leagues.json), not the INI's confederation split, so only
//     a 3-tier (Top/Medium/Lower, by prestige) reading is portable — the
//     Non-European row/column is dropped rather than fabricating a
//     confederation-tier boundary the ported data can't support.
//   - PLAYER_NATIONALITY_TRANSFER_TABLE_* (EFIGS-cluster nationality-pair
//     bias) has no equivalent signal in this project's player schema beyond
//     `nationId` -> a single nation, with no EFIGS/Germanic/Slavic clustering
//     authored anywhere else in the codebase — skipped rather than inventing
//     a second nationality taxonomy for one minor modifier.
//   - Per-league LEAGUERATING_* / TRANSFERS_LEAGUE_BUCKETS (transfers.ini) are
//     keyed to FIFA 17's own numeric league ids, which this project's
//     data/leagues.json never carries (M1 authored its own string ids) — the
//     3-tier prestige split below is used everywhere a league tier is needed
//     instead.

export const MAX_COUNTER_OFFERS = 4; // transfer.ini MAX_COUNTER_OFFERS
export const TEAM_PRESTIGE_DIFF_PERCENT = 30; // transfer.ini TEAM_PRESTIGE_DIFF_PERCENT
export const MIN_COUNTER_OFFER_FEE_CAP = 10; // transfer.ini MIN_COUNTER_OFFER_FEE_CAP
export const MAX_COUNTER_OFFER_FEE_CAP = 50; // transfer.ini MAX_COUNTER_OFFER_FEE_CAP

// MONTHS_UNTIL_TRANSFER_ALLOWED_PLAYER/CPU: cooldown after joining a club
// before that player is eligible to be moved on again (avoids a player
// bouncing between clubs within the same window).
export const MONTHS_UNTIL_TRANSFER_ALLOWED_PLAYER = 12;
export const MONTHS_UNTIL_TRANSFER_ALLOWED_CPU = 24;

// MIN_PLAYERS_POSITION_*: squad-quota minimums per area (transfer.ini uses
// finer position codes; collapsed onto this project's GK/DEF/MID/ATT areas
// — config/positions.js's AREAS — since that's the granularity gen/squad.js's
// own SQUAD_TEMPLATE plans squads at).
export const MIN_PLAYERS_PER_AREA = { GK: 2, DEF: 8, MID: 8, ATT: 3 };

// NUM_{TOP,MEDIUM,LOWER}_LEAGUES_TEAMS_WITH_ACTIVITY: how many clubs *per
// league* of that tier are candidates for CPU activity each week (transfer.ini:
// NUM_TOP_LEAGUES_TEAMS_WITH_ACTIVITY=13, NUM_MEDIUM_LEAGUES_TEAMS_WITH_ACTIVITY=3,
// NUM_LOWER_LEAGUES_TEAMS_WITH_ACTIVITY=1). The plan's own volume guidance
// ("~40 completed CPU transfers/window across top leagues, scaled down for
// minor leagues") is enforced as a hard per-window cap in engine/transferai.js
// on top of this per-league candidate pool, since 13/league across every
// top league would otherwise dwarf that budget in a ~35-league world.
export const NUM_TEAMS_WITH_ACTIVITY = { top: 13, medium: 3, lower: 1 };

export const CPU_TRANSFERS_PER_WINDOW_CAP = 40; // plan1.md M7's own number
// Rough tier split of that cap (top leagues get the lion's share, per plan).
export const CPU_TRANSFERS_TIER_SHARE = { top: 0.6, medium: 0.3, lower: 0.1 };

/** 3-tier league bucket by prestige (see header: the confederation-aware
 * 4-tier RELOCATION_PROBABILITY matrix isn't portable with this project's
 * data, so every "league tier" lookup in engine/transferai.js goes through
 * this single, consistently-applied 3-tier split instead). */
export function leagueTier(league) {
  const avgPrestige = (league.prestige[0] + league.prestige[1]) / 2;
  if (avgPrestige >= 7) return "top";
  if (avgPrestige >= 4) return "medium";
  return "lower";
}

// Simplified 3-tier relocation probability (%) — same top/medium/lower rows
// as transfer.ini's RELOCATION_PROBABILITY_{0,1,2}_{0,1,2} sub-matrix (the
// Non-European row/column dropped, see header).
export const RELOCATION_PROBABILITY = {
  top: { top: 100, medium: 10, lower: 5 },
  medium: { top: 100, medium: 100, lower: 5 },
  lower: { top: 100, medium: 100, lower: 100 },
};
