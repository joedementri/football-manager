// core/store.js — single mutable GameState object + pub/sub.
//
// M2 scope: `club`, `manager`, `players`/`squad.roster` and `squad.lineup`
// are now real, generated data. M3 adds `fixtures` (engine/calendar.js's
// full-season schedule for every league), `league.table` (derived from it,
// both built in deriveIndices() below) and a real day-1 `inbox`
// (engine/objectives.js's board emails). createCareerState()
// builds a fresh GameState from a New Game wizard's choices + gen/world.js's
// output, and hydrateFromSave() rebuilds one from a loaded save
// (core/db.js). Remaining stub content (news articles, Transfers' scouted
// group, Season's cup bracket) awaits later milestones (news.js, M7, M5).
// UI modules (js/ui/*, js/core/router.js) must only ever read from
// `store.state` and call mutator methods below — never mutate state or hold
// game logic themselves, so the sim stays testable headless later.

import { addDays } from "./clock.js";
import { buildFixtures, buildLeagueTable, advanceTowards, fixtureOnDate } from "../engine/calendar.js";
import { buildObjectiveEmails, domesticCupFor } from "../engine/objectives.js";
import { simulateWorldDay } from "../engine/sim/worldsim.js";
import * as matchEngine from "../engine/sim/match.js";

export const SCREENS = ["central", "squad", "transfers", "office", "season"];

/* ----- News page content (Central › News drill-down), moved verbatim from
   the old js/navigation.js NEWS_DATA. ------------------------------------ */
const NEWS_DATA = {
  breaking: [
    { title: "Home Is Where The Contract Is For Thiago Silva", isNew: true, accent: "gold", crest: "crest-c",
      head: "Home Is Where The Contract Is For Thiago Silva",
      body: [
        "Thiago Silva has moved to scotch rumours suggesting he was leaving PSG by publicly declaring his commitment to the club.",
        "Speaking from the club's training ground, Thiago Silva said: “I am going nowhere. It's true that I have been unsettled and have found it quite difficult in a strange country.",
        "“But, this is all perfectly normal and the club have been fantastic in helping me through a difficult moment. I love PSG and I love the fans here and I have no intention of going anywhere else.”"
      ] },
    { title: "PSG Confirm Agüero Talks", date: "02/07/2015", accent: "blue", crest: "crest-c",
      head: "PSG Confirm Agüero Talks",
      body: [
        "Paris Saint-Germain have confirmed they are in talks to bring Sergio Agüero to the French capital in a deal that could shatter their transfer record.",
        "A club spokesperson admitted that informal discussions had taken place but stressed that no agreement was yet in place.",
        "“We never comment on the specifics of negotiations, but we will not hide our admiration for one of the finest strikers in world football,” the statement read."
      ] },
    { title: "One for the Future: Tim Eisfeld – Eint. Frankfurt", date: "30/06/2015", accent: "red", crest: "crest-b",
      head: "One For The Future: Tim Eisfeld",
      body: [
        "Eintracht Frankfurt believe they have unearthed one of the brightest talents in German football in teenage midfielder Tim Eisfeld.",
        "The youngster has impressed coaches with his vision and composure well beyond his years, drawing comparisons to some of the Bundesliga's established stars.",
        "Scouts from across Europe are understood to be monitoring his progress ahead of the new season."
      ] },
    { title: "Speculation Continues But No News On Thiago Silva", date: "16/06/2015", accent: "blue", crest: "crest-c",
      head: "Speculation Continues But No News On Thiago Silva",
      body: [
        "The rumour mill continues to churn over the future of Thiago Silva, with no official word emerging from the Parc des Princes.",
        "Several leading European clubs have been linked with the defender, though PSG remain adamant that he is not for sale.",
        "Supporters will be hoping for clarity before the transfer window slams shut."
      ] },
    { title: "Football League 2 Review: Portsmouth vs Southend United", date: "02/05/2015", accent: "grey", crest: "crest-pompey",
      head: "Football League 2 Review: Portsmouth vs Southend United",
      body: [
        "Portsmouth produced a battling performance at Fratton Park as they shared the spoils with Southend United in a closely fought encounter.",
        "Both sides created chances in an entertaining contest, but neither could find the breakthrough their efforts deserved.",
        "The point leaves Pompey searching for the consistency that will be needed to mount a promotion challenge this term."
      ] },
    { title: "Football League 2 Preview: Portsmouth vs Southend Unite…", date: "02/05/2015", accent: "blue", crest: "crest-pompey",
      head: "Football League 2 Preview: Portsmouth vs Southend United",
      body: [
        "Attention turns to Fratton Park as Portsmouth prepare to welcome Southend United in what promises to be a keenly contested fixture.",
        "The manager faces a number of selection dilemmas with several players pushing for a starting berth.",
        "A victory would provide the perfect platform as the side looks to climb the Football League 2 table."
      ] }
  ],
  world: [
    { title: "Champions League Final Set For Berlin", date: "10/06/2015", accent: "blue", crest: "crest-b",
      head: "Champions League Final Set For Berlin",
      body: [
        "European football's showpiece occasion will take place in Berlin as the Olympiastadion prepares to host the Champions League final.",
        "Organisers have promised a spectacle befitting the biggest match in club football, with fans travelling from across the continent.",
        "The two finalists will be determined over the coming weeks as the competition reaches its climax."
      ] },
    { title: "Record Spending Across Europe This Window", date: "08/06/2015", accent: "grey", crest: "crest-d",
      head: "Record Spending Across Europe This Window",
      body: [
        "The latest transfer window has seen record-breaking expenditure as Europe's elite clubs jostle to strengthen their squads.",
        "Analysts have warned that the relentless inflation in fees shows little sign of slowing.",
        "Smaller clubs, meanwhile, continue to benefit from the lucrative sale of their brightest prospects."
      ] },
    { title: "New Financial Fair Play Rules Confirmed", date: "01/06/2015", accent: "red", crest: "crest-a",
      head: "New Financial Fair Play Rules Confirmed",
      body: [
        "Football's governing body has confirmed a revised set of Financial Fair Play regulations designed to promote sustainability.",
        "Clubs will face tighter scrutiny of their spending relative to revenue, with sanctions for persistent breaches.",
        "The changes have been broadly welcomed, though some have questioned how rigorously they will be enforced."
      ] }
  ],
  club: [
    { title: "Accrington Face Difficult Season", date: "16/07/2014", accent: "blue", crest: "crest-d",
      head: "Accrington Face Difficult Season",
      body: [
        "Accrington Stanley have been tipped to endure a testing campaign as the pundits deliver their verdicts ahead of the new season.",
        "A modest budget and a small squad mean the side are widely expected to be battling at the wrong end of the table.",
        "However, the club's resilient spirit has confounded the doubters before, and few at the Crown Ground are writing them off just yet."
      ] },
    { title: "Portsmouth Confirm Pre-Season Friendlies", date: "12/07/2014", accent: "green", crest: "crest-pompey",
      head: "Portsmouth Confirm Pre-Season Friendlies",
      body: [
        "Portsmouth have finalised their pre-season schedule with a series of friendlies designed to sharpen the squad ahead of the campaign.",
        "The fixtures offer supporters an early chance to run the rule over the manager's summer recruits.",
        "Fitness and cohesion will be the priorities as the side builds towards the opening day."
      ] },
    { title: "Manager Backs Squad For Promotion Push", date: "09/07/2014", accent: "grey", crest: "crest-pompey",
      head: "Manager Backs Squad For Promotion Push",
      body: [
        "The Portsmouth manager has thrown his full support behind his players as the club sets its sights on promotion.",
        "Speaking to the local press, he insisted the squad has the quality and character to compete at the top of the division.",
        "“We have everything we need here. Now it is about belief and hard work,” he said."
      ] }
  ],
  transfer: [
    { title: "Digby Declines Move to Newport County", date: "14/07/2014", accent: "blue", crest: "crest-a",
      head: "Digby Declines Move To Newport County",
      body: [
        "Goalkeeper Paul Digby has turned down the opportunity to join Newport County, opting instead to fight for his place.",
        "The move would have offered regular first-team football, but the player is understood to be keen to prove himself at a higher level.",
        "His decision leaves Newport to revisit their list of summer targets."
      ] },
    { title: "LOSC Lille and Juventus in Llorente Talks", date: "13/07/2014", accent: "red", crest: "crest-b",
      head: "LOSC Lille And Juventus In Llorente Talks",
      body: [
        "Lille and Juventus are reported to be in discussions over the future of striker Fernando Llorente.",
        "The Spaniard has attracted interest from a number of clubs following an impressive run of form.",
        "A resolution is expected before the close of the window, with both parties keen to conclude matters swiftly."
      ] },
    { title: "Lane Seeks To Grasp Loan Chance", date: "11/07/2014", accent: "green", crest: "crest-c",
      head: "Lane Seeks To Grasp Loan Chance",
      body: [
        "Young forward Jack Lane is determined to make the most of his loan move as he looks to gain valuable first-team experience.",
        "The temporary switch represents an important step in the development of one of the club's most promising academy graduates.",
        "“This is a great opportunity and I intend to take it,” Lane said."
      ] }
  ],
  intl: [
    { title: "England Name Squad For Friendlies", date: "20/06/2015", accent: "blue", crest: "crest-a",
      head: "England Name Squad For Friendlies",
      body: [
        "The England manager has named his squad for the upcoming round of international friendlies.",
        "A blend of experienced internationals and exciting newcomers has been selected as preparations continue.",
        "The fixtures will provide a useful examination ahead of the qualifying campaign."
      ] },
    { title: "Copa America Reaches Knockout Stage", date: "18/06/2015", accent: "red", crest: "crest-b",
      head: "Copa America Reaches Knockout Stage",
      body: [
        "The Copa America has reached its knockout phase with the continent's giants still very much in contention.",
        "A series of dramatic group-stage encounters has set up a thrilling run to the final.",
        "Hosts and holders alike will fancy their chances of lifting the famous trophy."
      ] },
    { title: "World Cup Qualifying Draw Announced", date: "15/06/2015", accent: "grey", crest: "crest-c",
      head: "World Cup Qualifying Draw Announced",
      body: [
        "The draw for the next round of World Cup qualifying has been completed, pitting several heavyweight nations together.",
        "Fans have already begun to circle the standout fixtures on the calendar.",
        "The road to the finals promises plenty of drama over the months ahead."
      ] }
  ]
};

/** Builds the day-strip: `count` consecutive days starting at `start`. */
function buildDayStrip(start, count) {
  const days = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

/**
 * Everything still *not* real as of M3: the Central headline/GTN panel, the
 * Transfers scouted group, the Season cup bracket. Central's mini-table is
 * now real (`state.league.table`, derived in deriveIndices) and the Season
 * fixtures panel is now real (`state.fixtures`) — see deriveIndices below.
 * These remaining stubs stay exactly as hardcoded in the original prototype
 * pending news.js/M7/M5. Kept as a function (not a constant) because
 * `today` needs the real career's start date, and Date objects are mutable.
 */
function createStubExtras(today) {
  return {
    central: {
      headline: {
        title: "ACCRINGTON FACE DIFFICULT SEASON",
        date: today,
      },
      gtn: {
        scoutName: "G. SHENTON",
        newCount: 12,
        updateCount: 0,
        rows: [
          { name: "James Wilson", pos: "ST", flag: "eng", clubCrest: "crest-a" },
          { name: "Darren Bent", pos: "ST", flag: "eng", clubCrest: "crest-b" },
          { name: "Daniel Nardiello", pos: "ST", flag: "wal", clubCrest: "crest-c" },
        ],
      },
      newsList: [
        { text: "Digby Declines Move to Newport County", accent: "" },
        { text: "LOSC Lille and Juventus in Llorente Talks", accent: "r" },
        { text: "Lane Seeks To Grasp Loan Chance", accent: "g" },
      ],
    },

    transfers: {
      scoutedGroup: {
        title: "STRIKER",
        tags: "Pacey, Prolific",
        newCount: 5,
        updateCount: 0,
        players: [
          { name: "Brian Montenegro", pos: "ST", flag: "par", clubCrest: "crest-c" },
          { name: "Dwight Gayle", pos: "ST", flag: "eng", clubCrest: "crest-a" },
          { name: "Nouha Dicko", pos: "ST", flag: "mli", clubCrest: "crest-d" },
          { name: "Matěj Vydra", pos: "ST", flag: "cze", clubCrest: "crest-b" },
        ],
      },
      finances: { transferBudget: 401500, wageBudget: 16750 },
    },

    // F.A. Cup round stub: domestic cups aren't scheduled until M5 ("Full
    // season loop"), so this panel stays hand-authored flavour for now.
    // `state.fixtures` (real, M3 — see deriveIndices()) supplies the
    // Season screen's actual upcoming-fixtures list instead.
    season: {
      cup: {
        name: "F.A. Cup",
        round: "Round 2",
        teams: [
          { crest: "crest-pompey", name: "Portsmouth" },
          { crest: "crest-a", name: "Yeovil Town" },
        ],
      },
    },

    news: NEWS_DATA,
  };
}

/** Fresh ui-state defaults, shared by both a brand-new career and a loaded save. */
function createUiDefaults(today) {
  return {
    screen: "central",
    lastScreen: "central",
    overlay: null, // null | 'email' | 'news' | 'squadlist' | 'playerbio' | 'calendar' | 'matchday'
    overlayStack: [], // nested overlays (playerbio opened from within squadlist)
    emailSelectedIndex: 0,
    newsCategory: "breaking",
    newsSelectedIndex: { breaking: 0, world: 0, club: 0, transfer: 0, intl: 0 },
    squadlist: { sortKey: "overall", sortDir: "desc", selectedIndex: -1 },
    bioPlayerId: null,
    calendar: { viewYear: today.getFullYear(), viewMonth: today.getMonth() },
    // Matchday substitution picker (ui/matchday.js): step 1 opens the
    // picker (matchdaySubOpen), step 2 records who's coming on
    // (matchdaySubInId) while waiting for the user to pick who goes off.
    matchdaySubOpen: false,
    matchdaySubInId: null,
  };
}

/**
 * Builds the derived, non-persisted indices every GameState needs:
 * `playersById` for O(1) bio lookups, `playersByClub` (every club's live
 * roster — M4's match sim needs any of ~600 clubs' squad on demand, not
 * just the user's), `clubsById` (ditto, for club objects — team strength
 * needs `.prestige`), `squad.roster` (the user's 24 players, sorted by
 * overall), the full-season `fixtures` graph (engine/calendar.js — every
 * league scheduled, not just the user's) and `league.table`/`league.clubs`
 * computed from it plus `results` (M4: fixtureId -> {homeGoals,awayGoals},
 * empty for a new career, restored from the save otherwise — see
 * core/db.js's header for why results are persisted directly rather than
 * re-derived). Both createCareerState and hydrateFromSave funnel through
 * this so the two paths can't drift apart. `allClubs`/`allLeagues` are the
 * complete data/*.json lists (fixture generation needs every league, not
 * just the user's one).
 */
function deriveIndices(state, { allClubs, allLeagues, results = new Map() }) {
  state.playersById = new Map(state.players.map((p) => [p.id, p]));
  state.playersByClub = new Map();
  for (const p of state.players) {
    if (!state.playersByClub.has(p.clubId)) state.playersByClub.set(p.clubId, []);
    state.playersByClub.get(p.clubId).push(p);
  }
  state.clubsById = new Map(allClubs.map((c) => [c.id, c]));
  state.squad.roster = state.players
    .filter((p) => p.clubId === state.club.id)
    .sort((a, b) => b.overall - a.overall);

  state.fixtures = buildFixtures({
    leagues: allLeagues, clubs: allClubs, seed: state.seed, seasonStartYear: state.seasonStartYear,
  });
  state.results = results;
  state.league.clubs = allClubs.filter((c) => c.leagueId === state.league.id);
  state.league.table = buildLeagueTable(state.league, state.league.clubs, state.fixtures.byLeague.get(state.league.id), state.results);

  return state;
}

/** Recomputes state.league.table from the latest state.results — called
 * after any batch of matches resolves (core/store.js's advanceToDate and
 * matchdayFinish()) so Central/Season's table tiles reflect new results. */
export function refreshLeagueTable(state) {
  state.league.table = buildLeagueTable(state.league, state.league.clubs, state.fixtures.byLeague.get(state.league.id), state.results);
}

/**
 * Builds a brand-new career's GameState from a New Game wizard's choices
 * plus a freshly generated world (js/gen/world.js).
 * @param {object} opts
 * @param {string} opts.managerName
 * @param {object} opts.club - the chosen data/clubs.json entry
 * @param {object} opts.league - the chosen data/leagues.json entry
 * @param {object} opts.world - gen/world.js's generateWorld() return value
 * @param {number} opts.seasonStartYear
 */
export function createCareerState({ managerName, club, league, world, seasonStartYear }) {
  const today = new Date(seasonStartYear, 6, 1); // career always starts July 1st
  const cup = domesticCupFor(league, world.cups);

  const state = {
    seed: world.seed,
    seasonStartYear,

    manager: {
      name: managerName,
      gamertag: managerName.slice(0, 2).toUpperCase(),
      level: 1,
      xp: 0,
      xpMax: 1000,
      coins: 0,
    },

    club,
    league,

    calendar: {
      today,
      strip: buildDayStrip(today, 5),
    },

    players: world.players,
    squad: {
      formationLabel: "4-4-2",
      formationStyle: "Flat",
      lineup: world.lineupsByClub.get(club.id),
    },

    // Day-1 board objective emails (plan1.md M3: "board objective emails on
    // day 1"). Real content from here on — see engine/objectives.js.
    inbox: { emails: buildObjectiveEmails({ club, league, cup, managerName, today }) },

    // The live Match Day overlay's state (engine/sim/match.js) — null except
    // for the duration of the user's own fixture; never persisted (a save
    // mid-live-match isn't supported, matching the project's existing
    // "fixtures/inbox persist, in-flight UI doesn't" convention).
    matchday: null,

    ...createStubExtras(today),
    ui: createUiDefaults(today),
  };

  return deriveIndices(state, { allClubs: world.clubs, allLeagues: world.leagues });
}

/**
 * Rebuilds a GameState from a loaded save (core/db.js's deserializeSave)
 * plus freshly-fetched static data (leagues/clubs/nations aren't persisted
 * in the save — see db.js's header comment for why). The inbox IS persisted
 * (unlike fixtures, which regenerate deterministically from the seed) since
 * read/unread state and any mail accumulated during play must survive a
 * reload.
 */
export function hydrateFromSave(saved, { leagues, clubs }) {
  const club = clubs.find((c) => c.id === saved.clubId);
  const league = leagues.find((l) => l.id === club.leagueId);
  const today = saved.calendarToday;

  const state = {
    seed: saved.seed,
    seasonStartYear: saved.seasonStartYear,
    manager: saved.manager,
    club,
    league,
    calendar: { today, strip: buildDayStrip(today, 5) },
    players: saved.players,
    squad: {
      formationLabel: "4-4-2",
      formationStyle: "Flat",
      lineup: saved.lineup,
    },
    inbox: { emails: saved.inbox },
    matchday: null,
    ...createStubExtras(today),
    ui: createUiDefaults(today),
  };

  return deriveIndices(state, { allClubs: clubs, allLeagues: leagues, results: saved.results });
}

/**
 * Store: GameState + pub/sub. UI modules subscribe with `on()` and react;
 * they never write to `state` directly — only through the methods below.
 * This keeps every mutation centralized so headless (non-UI) code — sim,
 * generation, tests — can drive the exact same state machine later.
 */
export class Store {
  constructor(state) {
    this.state = state;
    this._listeners = new Map();
  }

  on(event, cb) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(cb);
    return () => this._listeners.get(event).delete(cb);
  }

  emit(event, payload) {
    const set = this._listeners.get(event);
    if (set) for (const cb of set) cb(payload);
  }

  setScreen(name) {
    if (SCREENS.indexOf(name) === -1) return;
    if (this.state.ui.overlay) return;
    this.state.ui.lastScreen = this.state.ui.screen;
    this.state.ui.screen = name;
    this.emit("screen", name);
  }

  page(dir) {
    if (this.state.ui.overlay) return;
    const i = SCREENS.indexOf(this.state.ui.screen);
    const next = SCREENS[(i + dir + SCREENS.length) % SCREENS.length];
    this.setScreen(next);
  }

  /** Opens an overlay. If one is already open, the new one nests on top
   * (pushed onto overlayStack) so closeOverlay() returns to it instead of
   * the base screen — this is how Player Bio opened from within Squad List
   * backs out to Squad List rather than straight to the Squad tab. */
  openOverlay(name) {
    if (this.state.ui.overlay === name) return;
    const prevName = this.state.ui.overlay;
    if (prevName) {
      // Nesting on top of another overlay: remember it for closeOverlay(),
      // but also hide its DOM now — otherwise both overlays stay marked
      // is-active and paint stacked on top of each other.
      this.state.ui.overlayStack.push(prevName);
      this.emit("overlay", { name: prevName, open: false });
    } else {
      this.state.ui.lastScreen = this.state.ui.screen;
    }
    this.state.ui.overlay = name;
    if (name === "news") this.selectNewsCategory("breaking");
    this.emit("overlay", { name, open: true });
  }

  closeOverlay() {
    const name = this.state.ui.overlay;
    if (!name) return;
    // Update state to its post-close value *before* emitting — applyOverlay's
    // "is any overlay still open" check reads state live off this emit, so if
    // we emitted first and mutated after, closing the last overlay would read
    // a stale non-null overlay and never un-hide the tabbar/screens/footer.
    const prev = this.state.ui.overlayStack.pop();
    this.state.ui.overlay = prev || null;
    this.emit("overlay", { name, open: false });
    if (prev) {
      this.emit("overlay", { name: prev, open: true });
    } else {
      this.setScreen(this.state.ui.lastScreen);
    }
  }

  selectEmail(idx) {
    this.state.ui.emailSelectedIndex = idx;
    const email = this.state.inbox.emails[idx];
    if (email) email.read = true;
    this.emit("email:select", idx);
  }

  selectNewsCategory(cat) {
    if (!this.state.news[cat]) return;
    this.state.ui.newsCategory = cat;
    this.emit("news:category", cat);
  }

  selectNewsItem(idx) {
    const cat = this.state.ui.newsCategory;
    if (!this.state.news[cat] || !this.state.news[cat][idx]) return;
    this.state.ui.newsSelectedIndex[cat] = idx;
    this.emit("news:select", { cat, idx });
  }

  /** Advances one calendar day — the ADVANCE tile's default click. */
  advanceOneDay() {
    this.advanceToDate(addDays(this.state.calendar.today, 1));
  }

  /** Advances towards `targetDate` (a day-strip cell click, so possibly
   * several days at once), but halts on the first day that's a match day
   * for the user's club (plan1.md: "Multi-day advance stops at any event
   * needing user input"). `today` itself is never a stop — you're already
   * sitting on it, so re-advancing from a match day moves past it normally.
   * Every day swept through along the way gets that date's non-user
   * fixtures simulated (engine/sim/worldsim.js, M4) via advanceTowards'
   * `onEnterDay` hook, so every league's table keeps filling in regardless
   * of whether the user's own club plays that day. Landing on a user match
   * day opens the live Match Day overlay instead of just sitting on it.
   */
  advanceToDate(targetDate) {
    if (this.state.matchday && !this.state.matchday.finished) return; // a live match must finish first
    const { date } = advanceTowards(
      this.state.fixtures, this.state.club.id, this.state.calendar.today, targetDate,
      (day) => simulateWorldDay(this.state, day),
    );
    this.state.calendar.today = date;
    this.state.calendar.strip = buildDayStrip(date, 5);
    refreshLeagueTable(this.state);
    this.emit("advance", null);

    const fixture = fixtureOnDate(this.state.fixtures, this.state.club.id, date);
    if (fixture) this.openMatchday(fixture);
  }

  /* ----- Match Day (M4): engine/sim/match.js owns the actual state
   * machine; these methods just call into it and emit "matchday" for
   * ui/matchday.js to re-render from. ----- */

  openMatchday(fixture) {
    this.state.matchday = matchEngine.createMatchState(this.state, fixture);
    this.state.ui.matchdaySubOpen = false;
    this.state.ui.matchdaySubInId = null;
    this.openOverlay("matchday");
    this.emit("matchday", null);
  }

  matchdayPlay() {
    const m = this.state.matchday;
    if (!m || m.finished || m.atHalftime) return;
    m.playing = true;
    this.emit("matchday", null);
  }

  matchdayPause() {
    const m = this.state.matchday;
    if (!m) return;
    m.playing = false;
    this.emit("matchday", null);
  }

  matchdaySetSpeed(speed) {
    const m = this.state.matchday;
    if (!m) return;
    m.speed = speed;
    this.emit("matchday", null);
  }

  /** One ticker "frame" — ui/matchday.js's interval timer calls this once
   * per real-time tick while playing; a no-op once paused/halftime/finished
   * (the UI stops its own timer on that same transition). */
  matchdayTick() {
    const m = this.state.matchday;
    if (!m || !m.playing || m.finished || m.atHalftime) return;
    matchEngine.tick(this.state, m);
    if (m.finished) refreshLeagueTable(this.state);
    this.emit("matchday", null);
  }

  matchdayContinueSecondHalf() {
    const m = this.state.matchday;
    if (!m) return;
    matchEngine.continueSecondHalf(this.state, m);
    m.playing = true; // second half kicks straight off, same as the opening whistle
    this.emit("matchday", null);
  }

  /** The ticker's "instant" speed — resolves straight to full time. */
  matchdaySimToEnd() {
    const m = this.state.matchday;
    if (!m) return;
    m.playing = false;
    matchEngine.simToEnd(this.state, m);
    refreshLeagueTable(this.state);
    this.emit("matchday", null);
  }

  /** Opens the substitution picker (pauses the ticker while it's open —
   * plan1.md's "pause for subs/tactics at stoppages"). Step 1 picks who
   * comes on; step 2 (matchdaySubstitute) picks who goes off for them. */
  matchdayOpenSubPicker() {
    const m = this.state.matchday;
    if (!m || m.finished) return;
    this.state.ui.matchdaySubOpen = true;
    this.state.ui.matchdaySubInId = null;
    this.matchdayPause();
    this.emit("matchday", null);
  }

  matchdaySelectSubIn(playerId) {
    this.state.ui.matchdaySubInId = playerId;
    this.emit("matchday", null);
  }

  matchdayCancelSub() {
    this.state.ui.matchdaySubOpen = false;
    this.state.ui.matchdaySubInId = null;
    this.emit("matchday", null);
  }

  matchdaySubstitute(side, outPlayerId) {
    const m = this.state.matchday;
    const inPlayerId = this.state.ui.matchdaySubInId;
    if (!m || inPlayerId == null) return;
    matchEngine.substitute(this.state, m, side, outPlayerId, inPlayerId);
    this.state.ui.matchdaySubOpen = false;
    this.state.ui.matchdaySubInId = null;
    this.emit("matchday", null);
  }

  /** Only leaves the overlay once the match has actually finished — the
   * live match itself can't be backed out of, matching plan1.md's "Multi-day
   * advance stops at any event needing user input (match...)". */
  closeMatchday() {
    const m = this.state.matchday;
    if (!m || !m.finished) return;
    this.state.matchday = null;
    this.closeOverlay();
    this.emit("advance", null); // reuse Central/Season's re-render hook — league.table/results changed
  }

  openCalendar() {
    this.state.ui.calendar.viewYear = this.state.calendar.today.getFullYear();
    this.state.ui.calendar.viewMonth = this.state.calendar.today.getMonth();
    this.openOverlay("calendar");
  }

  /** Month navigation within the Calendar overlay (delta = +/-1 month). */
  calendarChangeMonth(delta) {
    const c = this.state.ui.calendar;
    let month = c.viewMonth + delta;
    let year = c.viewYear;
    if (month < 0) { month = 11; year--; }
    else if (month > 11) { month = 0; year++; }
    c.viewMonth = month;
    c.viewYear = year;
    this.emit("calendar:view", c);
  }

  openSquadList() {
    this.openOverlay("squadlist");
  }

  /** Sorting toggles direction when the same column is clicked again, per
   * the usual sortable-table convention (plan1.md: Squad List is "a
   * sortable table"). */
  sortSquadList(key) {
    const s = this.state.ui.squadlist;
    s.sortDir = s.sortKey === key && s.sortDir === "desc" ? "asc" : "desc";
    s.sortKey = key;
    this.emit("squadlist:sort", s);
  }

  selectSquadListRow(idx) {
    this.state.ui.squadlist.selectedIndex = idx;
    this.emit("squadlist:select", idx);
  }

  openPlayerBio(playerId) {
    this.state.ui.bioPlayerId = playerId;
    this.openOverlay("playerbio");
  }
}
