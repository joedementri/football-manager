// engine/objectives.js — day-1 board objective emails (fable-plans/plan1.md
// M3: "emails/news minimally wired (board objective emails on day 1 —
// content already exists in prototype)"). This is deliberately narrow: full
// objective *evaluation* (percentage-of-index scoring, mid-season review,
// success/failure -> sacking) is engine/objectives.js's M5 scope per the
// "Season frame" section of plan1.md — reference/ini/seasonobjectives.ini's
// OBJ_INDEX_*/DOM_CUP_OBJ_INDEX_* tables belong to that later pass, not this
// one. Here we only need the two email bodies, verbatim in structure to the
// M0 prototype stub (js/core/store.js's old createStubExtras), just
// parameterized by the real club/manager/objective instead of hardcoded
// Portsmouth text.

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

/** "Bob Jackson" -> "Jackson, Bob" (matches the prototype's email "To" style). */
function toField(managerName) {
  const parts = managerName.trim().split(/\s+/);
  if (parts.length < 2) return managerName;
  const last = parts[parts.length - 1];
  const first = parts.slice(0, -1).join(" ");
  return `${last}, ${first}`;
}

function surname(managerName) {
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
