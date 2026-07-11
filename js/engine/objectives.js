// engine/objectives.js — day-1 board objective emails (fable-plans/plan1.md
// M3: "emails/news minimally wired (board objective emails on day 1 —
// content already exists in prototype)"), PLUS (M5 additions below the day-1
// section) mid-season review, end-of-season pass/fail evaluation, and
// sacking — plan1.md's "Season frame" section: "Objectives
// (seasonobjectives.ini): board sets league + cup objectives ...; mid-season
// review; failure ⇒ sack warning ⇒ sacked (job market only); success builds
// manager rep (1–20 scale)".
//
// config/objectives.js ports seasonobjectives.ini's OBJ_INDEX_n/
// DOM_CUP_OBJ_INDEX_n tables, but (per that file's header) the INI's own
// checkpoint semantics aren't fully reconstructable without the original
// "Commentator's Notes XLS" tool — so the evaluation below is a documented
// simplification: the LEAGUE objective is checked against the ported
// numeric index tables (CHECK1 at the January review, CHECK3 — the
// checkpoint every tier's PERCENTAGE=100 marks as "always applies" — at
// season end); the CUP objective is instead checked directly against the
// qualitative round named in this same file's CUP_OBJECTIVE_TEXT (below),
// since that's the literal target the board email already told the user
// about, rather than re-deriving an equivalent numeric threshold from a
// table whose own checkpoint scheduling is undocumented.

import { tierIndex, LEAGUE_OBJ_INDEX } from "../config/objectives.js";

const LEAGUE_OBJECTIVE_TEXT = {
  champions: "win the league title",
  "european-qualification": "finish the season in a European qualification position",
  "top-half": "finish in the top half of the table",
  "mid-table-safety": "finish in a comfortable mid-table position, clear of relegation trouble",
  "fight-relegation": "avoid relegation",
};

const CUP_OBJECTIVE_TEXT = {
  champions: (cup) => `win the ${cup.name}`,
  "european-qualification": (cup) => `reach the semi-finals of the ${cup.name}`,
  "top-half": (cup) => `reach the quarter-finals of the ${cup.name}`,
  "mid-table-safety": (cup) => `reach the fourth round of the ${cup.name}`,
  "fight-relegation": (cup) => `give a good account of yourselves in the ${cup.name}`,
};

const DEFAULT_TIER = "mid-table-safety";

/** "Bob Jackson" -> "Jackson, Bob" (matches the prototype's email "To" style).
 * Exported for reuse by engine/awards.js (M5's season-awards email uses the
 * same "Dear Mr. X" salutation style). */
export function toField(managerName) {
  const parts = managerName.trim().split(/\s+/);
  if (parts.length < 2) return managerName;
  const last = parts[parts.length - 1];
  const first = parts.slice(0, -1).join(" ");
  return `${last}, ${first}`;
}

export function surname(managerName) {
  const parts = managerName.trim().split(/\s+/);
  return parts[parts.length - 1] || managerName;
}

/** This club's domestic cup, per data/cups.json's `leagueIds` membership —
 * every league's country has exactly one matching entry (verified in M1). */
export function domesticCupFor(league, cups) {
  return cups.domestic.find((c) => c.leagueIds.includes(league.id));
}

/**
 * @param {object} opts
 * @param {object} opts.club
 * @param {object} opts.league
 * @param {object} opts.cup - data/cups.json domestic entry (see domesticCupFor)
 * @param {string} opts.managerName
 * @param {Date} opts.today - career day 1 (season start)
 * @returns {object[]} two board emails: League Objective, Domestic Cup Objective
 */
export function buildObjectiveEmails({ club, league, cup, managerName, today }) {
  const tier = club.boardExpectationTier;
  const leagueGoal = LEAGUE_OBJECTIVE_TEXT[tier] || LEAGUE_OBJECTIVE_TEXT[DEFAULT_TIER];
  const cupGoal = (CUP_OBJECTIVE_TEXT[tier] || CUP_OBJECTIVE_TEXT[DEFAULT_TIER])(cup);
  const from = `${club.name.toUpperCase()} BOARD`;
  const crest = `crest-${club.id}`;
  const to = toField(managerName);
  const mr = surname(managerName);

  return [
    {
      from, to, cc: "Assistant Manager", crest, date: new Date(today), read: false,
      subject: "League Objective",
      body: [
        `Dear Mr. ${mr},`,
        "The board is hopeful of a successful season. We look forward to seeing how your leadership and determination can get the best out of the players.",
        `We will mostly judge you on your success in the league, and have decided that your season objective for the league campaign will be to ${leagueGoal}.`,
        "If this objective can also be met via a cup competition, then succeeding through that medium but failing your league objective may not be enough to satisfy our criteria.",
        "Best of luck for the season ahead.",
      ],
    },
    {
      from, to, cc: "Assistant Manager", crest, date: new Date(today), read: false,
      subject: "Domestic Cup Objective",
      body: [
        `Dear Mr. ${mr},`,
        "Cup competitions offer a fantastic platform to build momentum and silverware alike, and the fans always relish a good run.",
        `For the ${cup.name} this season, the board expects the team to ${cupGoal}.`,
        "We trust you to manage the squad's workload sensibly across both the league and cup fixtures.",
        "Best of luck for the season ahead.",
      ],
    },
  ];
}

/* ============================================================================
 * M5 additions: objective evaluation, mid-season review, sacking.
 * ========================================================================== */

/** 1st place -> 100, last place -> 0, linear in between. */
export function leagueIndex(position, numClubs) {
  if (numClubs <= 1) return 100;
  return Math.round((100 * (numClubs - position)) / (numClubs - 1));
}

/** Deepest cup round a club reached this season, ranked so tiers can be
 * compared ("reach the semi-finals" beats "reach the fourth round"). Mirrors
 * CUP_OBJECTIVE_TEXT's own qualitative targets below. */
const CUP_ROUND_RANK = { "Champions": 6, "Final": 5, "Semi-Final": 4, "Quarter-Final": 3, "Round of 16": 2 };
function cupRoundRankFromLabel(label) {
  if (!label) return 0;
  if (label in CUP_ROUND_RANK) return CUP_ROUND_RANK[label];
  if (label.startsWith("Eliminated — ")) return cupRoundRankFromLabel(label.slice("Eliminated — ".length));
  if (/^Round \d+$/.test(label)) return 1;
  return 0;
}

const CUP_REQUIRED_RANK = { champions: 6, "european-qualification": 4, "top-half": 3, "mid-table-safety": 2, "fight-relegation": 0 };

/** @param {string} cupStatusRoundLabel - engine/comps/cup.js's cupStatusForClub().roundLabel */
export function cupObjectiveMet(boardExpectationTier, cupStatusRoundLabel) {
  const required = CUP_REQUIRED_RANK[boardExpectationTier] ?? 0;
  return cupRoundRankFromLabel(cupStatusRoundLabel) >= required;
}

export function leagueObjectiveMet(boardExpectationTier, index, checkKey) {
  const row = LEAGUE_OBJ_INDEX[tierIndex(boardExpectationTier)][checkKey];
  return index >= row.lo;
}

/** January board-review email — mid-season check against CHECK1's threshold
 * (plan1.md: "mid-season review"). */
export function buildMidSeasonReviewEmail({ club, managerName, index, onTrack, today }) {
  const from = `${club.name.toUpperCase()} BOARD`;
  const mr = surname(managerName);
  const body = onTrack
    ? [
      `Dear Mr. ${mr},`,
      "As we reach the midpoint of the season, the board would like to pass on its satisfaction with your progress so far.",
      "Keep up the good work — we remain confident in your ability to deliver on this season's objectives.",
    ]
    : [
      `Dear Mr. ${mr},`,
      "As we reach the midpoint of the season, the board must express its concern at our current league position.",
      "This is not yet a final judgement, but we expect to see clear improvement in the second half of the campaign.",
      "Your position will be reviewed again at the end of the season.",
    ];
  return {
    from, to: toField(managerName), cc: "Assistant Manager", crest: `crest-${club.id}`, date: new Date(today), read: false,
    subject: "Mid-Season Board Review",
    body,
  };
}

/** End-of-season verdict: league objective is the primary judge (per the
 * day-1 email's own wording: "we will mostly judge you on your success in
 * the league"); winning the domestic cup outright mitigates a missed league
 * objective (silverware saves the manager), matching that same email's
 * "succeeding [via cup] ... may not be enough ... alone" phrasing read as
 * "usually not enough, except an outright cup win". */
export function evaluateSeasonEnd({ club, leagueIdx, cupRoundLabel }) {
  const leaguePass = leagueObjectiveMet(club.boardExpectationTier, leagueIdx, "check3");
  const wonCup = cupRoundRankFromLabel(cupRoundLabel) >= 6;
  const cupPass = cupObjectiveMet(club.boardExpectationTier, cupRoundLabel);
  const saved = !leaguePass && wonCup;
  const sacked = !leaguePass && !wonCup;
  const repDelta = leaguePass ? (cupPass ? 2 : 1) : (saved ? 1 : -2);
  return { leaguePass, cupPass, wonCup, saved, sacked, repDelta };
}

export function buildSeasonEndEmail({ club, managerName, verdict, today }) {
  const from = `${club.name.toUpperCase()} BOARD`;
  const mr = surname(managerName);
  let subject, body;
  if (verdict.sacked) {
    subject = "Notice of Termination";
    body = [
      `Dear Mr. ${mr},`,
      "Following a thorough review of the season, the board has concluded that results have fallen unacceptably short of our stated objectives.",
      `We regret to inform you that your position as manager of ${club.name} has been terminated with immediate effect.`,
      "We wish you well in whatever comes next in your career.",
    ];
  } else if (verdict.saved) {
    subject = "End of Season Review";
    body = [
      `Dear Mr. ${mr},`,
      "The league campaign did not go as the board had hoped, but your cup exploits have not gone unnoticed.",
      "Silverware in the cabinet counts for a great deal, and the board has decided to back you going into next season — on the understanding that league form must improve.",
    ];
  } else {
    subject = "End of Season Review";
    body = [
      `Dear Mr. ${mr},`,
      "The board is pleased with the progress made this season and the objectives that were met.",
      "We look forward to building on this foundation together next season.",
    ];
  }
  return { from, to: toField(managerName), cc: "Assistant Manager", crest: `crest-${club.id}`, date: new Date(today), read: false, subject, body };
}
