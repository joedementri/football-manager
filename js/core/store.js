// core/store.js — single mutable GameState object + pub/sub.
//
// M2 scope: `club`, `manager`, `players`/`squad.roster` and `squad.lineup`
// are now real, generated data — createCareerState() builds a fresh
// GameState from a New Game wizard's choices + gen/world.js's output, and
// hydrateFromSave() rebuilds one from a loaded save (core/db.js). Several
// screens' content (news articles, Central's table, Transfers' scouted
// group, the Office inbox, Season's cup/fixtures) is still the M0 stub —
// createStubExtras() — pending the calendar/news (M3), transfers (M7) etc.
// milestones that generate it for real. UI modules (js/ui/*, js/core/
// router.js) must only ever read from `store.state` and call mutator
// methods below — never mutate state or hold game logic themselves, so the
// sim stays testable headless later.

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
 * Everything M2 does *not* generate yet: news articles, the Central table,
 * the Transfers scouted group, the Office inbox, the Season cup/fixtures.
 * These stay exactly as hardcoded in the original prototype — M3 (calendar/
 * news), M7 (transfers) etc. replace them with real systems. Kept as a
 * function (not a constant) because `today` needs the real career's start
 * date, and Date objects are mutable.
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
      table: {
        rows: [
          { pos: 15, crest: "crest-c", name: "Northampton", pld: 0, pts: 0 },
          { pos: 16, crest: "crest-b", name: "Oxford United", pld: 0, pts: 0 },
          { pos: 17, crest: "crest-a", name: "Plymouth Argyle", pld: 0, pts: 0 },
          { pos: 18, crest: "crest-pompey", name: "Portsmouth", pld: 0, pts: 0 },
          { pos: 19, crest: "crest-d", name: "Shrewsbury", pld: 0, pts: 0 },
          { pos: 20, crest: "crest-c", name: "Southend United", pld: 0, pts: 0 },
          { pos: 21, crest: "crest-a", name: "Stevenage", pld: 0, pts: 0 },
        ],
      },
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

    office: {
      inboxEmpty: true,
    },

    season: {
      cup: {
        name: "F.A. Cup",
        round: "Round 2",
        teams: [
          { crest: "crest-pompey", name: "Portsmouth" },
          { crest: "crest-a", name: "Yeovil Town" },
        ],
      },
      fixtures: [
        { home: "crest-a", score: "1-2", away: "crest-c" },
        { home: "crest-b", score: "1-0", away: "crest-d" },
        { home: "crest-c", score: "1-0", away: "crest-a" },
      ],
    },

    inbox: {
      emails: [
        { from: "PORTSMOUTH BOARD", subject: "Domestic Cup Objective", date: new Date(2014, 6, 1), read: true },
        { from: "ASSISTANT MANAGER", subject: "[GTN] We should look for a striker", date: new Date(2014, 5, 30), read: false },
        { from: "ASSISTANT MANAGER", subject: "[Info] Westcarr Injury Update", date: new Date(2014, 5, 30), read: true },
        { from: "PORTSMOUTH BOARD", subject: "League Objective", date: new Date(2014, 5, 30), read: true },
      ],
      detail: {
        crest: "crest-pompey",
        date: new Date(2014, 5, 30),
        from: "PORTSMOUTH BOARD",
        to: "Jackson, Bob",
        cc: "Assistant Manager",
        subject: "League Objective",
        body: [
          "Dear Mr. Jackson,",
          "The board is hopeful of a successful season. We look forward to seeing how your leadership and determination can get the best out of the players.",
          "We will mostly judge you on your success in the league, and have decided that your season objective for the league campaign will be to win the league title.",
          "If this objective can also be met via a cup competition, then succeeding through that medium but failing your league objective may not be enough to satisfy our criteria.",
          "Best of luck for the season ahead.",
        ],
      },
    },

    news: NEWS_DATA,
  };
}

/** Fresh ui-state defaults, shared by both a brand-new career and a loaded save. */
function createUiDefaults() {
  return {
    screen: "central",
    lastScreen: "central",
    overlay: null, // null | 'email' | 'news' | 'squadlist' | 'playerbio'
    overlayStack: [], // nested overlays (playerbio opened from within squadlist)
    emailSelectedIndex: 3,
    newsCategory: "breaking",
    newsSelectedIndex: { breaking: 0, world: 0, club: 0, transfer: 0, intl: 0 },
    squadlist: { sortKey: "overall", sortDir: "desc", selectedIndex: -1 },
    bioPlayerId: null,
  };
}

/**
 * Builds the derived, non-persisted indices every GameState needs:
 * `playersById` for O(1) bio lookups and `squad.roster` (the user's 24
 * players, sorted by overall) so ui/squadlist.js never has to filter the
 * full ~15k-player world itself. Both createCareerState and
 * hydrateFromSave funnel through this so the two paths can't drift apart.
 */
function deriveIndices(state) {
  state.playersById = new Map(state.players.map((p) => [p.id, p]));
  state.squad.roster = state.players
    .filter((p) => p.clubId === state.club.id)
    .sort((a, b) => b.overall - a.overall);
  return state;
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

    ...createStubExtras(today),
    ui: createUiDefaults(),
  };

  return deriveIndices(state);
}

/**
 * Rebuilds a GameState from a loaded save (core/db.js's deserializeSave)
 * plus freshly-fetched static data (leagues/clubs/nations aren't persisted
 * in the save — see db.js's header comment for why).
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
    ...createStubExtras(today),
    ui: createUiDefaults(),
  };

  return deriveIndices(state);
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

  /** M0 stub: the day-advance/calendar engine lands in M3. Exists now so the
   * UI can wire the Advance control up front per the pub/sub contract. */
  advance() {
    this.emit("advance", null);
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
