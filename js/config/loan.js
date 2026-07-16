// config/loan.js — loan-spell lengths ported from reference/ini/transfers.ini's
// [TRANSFERS_LOANBUYS] (fable-plans/plan1.md M7: "Loans (with wage share)").
//
// LOAN_WAGE_SHARE_PCT has no INI source — searched transfer.ini, transfers.ini,
// playercontract.ini, and cmsettings.ini for a loan wage-split percentage and
// found none (only the two length constants below exist). Authored as a flat
// 50/50 split, same footing as engine/jobs.js's CPU_SACK_CHANCE or
// engine/wage.js's WAGE_CEILING_HEADROOM (a plan-required number with no INI
// table to port).

export const SEASON_LOAN_LENGTH_MONTHS = 12; // transfers.ini SEASONLOANLENGTH
export const SHORT_LOAN_LENGTH_MONTHS = 3; // transfers.ini SHORTLOANLENGTH

export const LOAN_WAGE_SHARE_PCT = 50; // authored (see header) — parent club covers this % of wage

// Club's own willingness to loan a player out, by their current squad role —
// also authored (no INI table for this either): a permanent-sale "wanted
// fee" negotiation (engine/teamdecision.js) doesn't translate to a loan
// (there's no fee to haggle over), so the club-side gate here is instead a
// direct, documented approval-chance table keyed off how replaceable the
// player currently is at their own club.
export const LOAN_APPROVAL_CHANCE_BY_ROLE = { crucial: 0.05, important: 0.35, rotation: 0.75, prospect: 0.9 };
