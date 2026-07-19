// core/store.js — single mutable GameState object + pub/sub.
//
// M2 scope: `club`, `manager`, `players`/`squad.roster` and `squad.lineup`
// are now real, generated data. M3 adds `fixtures` (engine/calendar.js's
// full-season schedule for every league), `league.table` (derived from it,
// both built in deriveIndices() below) and a real day-1 `inbox`
// (engine/objectives.js's board emails). createCareerState()
// builds a fresh GameState from a New Game wizard's choices + gen/world.js's
// output, and hydrateFromSave() rebuilds one from a loaded save
// (core/db.js). Remaining stub content (the Central/Season news articles'
// body copy) awaits a later milestone (news.js) — everything else
// createStubExtras() once stood in for (Transfers' scouted group, Season's
// cup bracket, GTN) is real as of M5/M7/M8.
// UI modules (js/ui/*, js/core/router.js) must only ever read from
// `store.state` and call mutator methods below — never mutate state or hold
// game logic themselves, so the sim stays testable headless later.

import { addDays, toEpochDay } from "./clock.js";
import { buildFixtures, buildLeagueTable, advanceTowards, fixtureOnDate, eventsOnDate } from "../engine/calendar.js";
import { buildObjectiveEmails, domesticCupFor } from "../engine/objectives.js";
import { simulateWorldDay } from "../engine/sim/worldsim.js";
import * as matchEngine from "../engine/sim/match.js";
import { buildCupState } from "../engine/comps/cup.js";
import { createInitialContinentalState } from "../engine/comps/continental.js";
import { createInitialIntlState, intlFixtureOnDate } from "../engine/comps/intl.js";
import * as ntJobsEngine from "../engine/ntjobs.js";
import { pickBestXI, applyCaptainToLineup, pickDefaultBench, reservesOf } from "../gen/squad.js";
import { positionInfo, AREAS, POSITION_CODES } from "../config/positions.js";
import * as enquiryEngine from "../engine/enquiry.js";
import { isSimilarPosition, suggestedSubScore } from "../config/managerai.js";
import { applyBoardReview, applyMidSeasonGrowth, rolloverSeason } from "../engine/season.js";
import { acceptJob } from "../engine/jobs.js";
import { computeWageCeiling } from "../engine/wage.js";
import { checkContractExpiryWarnings, applyCpuContractRenewals, computeAsk, renewUserContract } from "../engine/contracts.js";
import * as negotiation from "../engine/negotiation.js";
import * as freeagents from "../engine/freeagents.js";
import * as transferai from "../engine/transferai.js";
import { reallocateBudget, requestFundsFromBoard } from "../engine/finances.js";
import * as gtnEngine from "../engine/gtn.js";
import * as academyEngine from "../engine/academy.js";
import { createManagerCareerFields } from "../engine/career.js";
import { rankSquadByForm } from "../engine/form.js";
import { DEFAULT_TACTIC_ID, TACTICS } from "../config/tactics.js";
import { DEFAULT_SETTINGS } from "../config/settings.js";
import { setDisplayCurrency } from "./format.js";
import { FORMATIONS, gridCellAt, formationByLabel, remapLineupToFormation } from "../config/formations.js";
import { INSTRUCTION_GROUPS, instructionGroupFor, defaultInstructionsFor } from "../config/instructions.js";

export const SCREENS = ["central", "squad", "transfers", "office", "season"];

// F3-fixes (fable-plans/plan2-decisions.md): PLAYER SEARCH's MIN/MAX AGE
// tiles cycle through [Any, lowerBound..upperBound] — Any always sorts
// first so it's reachable by wrapping either direction.
const AGE_MIN = 16;
const AGE_MAX = 50;
function ageOptionList(lowerBound, upperBound) {
  const opts = [0];
  for (let a = lowerBound; a <= upperBound; a++) opts.push(a);
  return opts;
}

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
 * Everything still *not* real as of M5: the Central headline/GTN panel, the
 * Transfers scouted group. Central's mini-table is real (`state.league.table`,
 * derived in deriveIndices), the Season fixtures panel is real
 * (`state.fixtures`), and the Season screen's cup tile is now real too
 * (`state.cups` + `ui/render.js`'s cupTileData() — M5's domestic cups,
 * engine/comps/cup.js) — the old hand-authored "F.A. Cup — Round 2" stub is
 * gone. These remaining stubs stay exactly as hardcoded in the original
 * prototype pending news.js/M7/M8. Kept as a function (not a constant)
 * because `today` needs the real career's start date, and Date objects are
 * mutable.
 */
function createStubExtras(today) {
  return {
    central: {
      headline: {
        title: "ACCRINGTON FACE DIFFICULT SEASON",
        date: today,
      },
      // M8: the GTN preview (ui/render.js's renderGtn) now reads real data
      // (state.gtn.missions via engine/gtn.js's primaryMission) instead of a
      // stub — see this file's own header for the "no longer a stub" list.
      newsList: [
        { text: "Digby Declines Move to Newport County", accent: "" },
        { text: "LOSC Lille and Juventus in Llorente Talks", accent: "r" },
        { text: "Lane Seeks To Grasp Loan Chance", accent: "g" },
      ],
    },

    // M8: the Transfers hub's scouted-group tile (ui/render.js's
    // renderTransfers) reads real data the same way — state.transfers itself
    // still needs to exist as a plain object here since deriveIndices()
    // below attaches `.listings`/`.pendingOffers`/`.negotiation` onto it.
    transfers: {},

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
    // F0: "Emails"/"Player Conversations"/"Message Archive" tabs
    // (ms_EMAIL_NOTIFICATION_SCREEN.png) — Player Conversations has no
    // backing feature (always the "NO ITEMS AVAILABLE" empty state, same
    // footing as the pre-M0 Office inbox stub); Archive lists emails the
    // user has archived off the main list via the footer's Y prompt.
    emailTab: "inbox",
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
    // Browse Jobs overlay (M5, ui/jobsui.js): selected vacancy row.
    jobsSelectedIndex: -1,
    // M10 (ui/ntjobsui.js): Browse NT Jobs overlay's selected vacancy row —
    // same shape as jobsSelectedIndex above, entirely separate list.
    ntJobsSelectedIndex: -1,
    // M10 (ui/natlsquad.js): Natl Squad Selection overlay's selected row +
    // the last capacity-guard message (23-man cap), same "lastError" banner
    // convention as GTN/Youth's own mission/assignment forms.
    natlSquad: { selectedPlayerId: null, lastError: null },
    // Contracts overlay (M6, ui/contractsui.js): selected squad player + the
    // in-progress offer (wage/years) the user is building before submitting
    // it to engine/contracts.js's renewUserContract. lastResult is
    // 'accepted'|'rejected'|null, shown as a banner until the next selection.
    contracts: { selectedPlayerId: null, offerWage: 0, offerYears: 3, lastResult: null },

    // F3 (fable-plans/plan2.md, ui/searchui.js): PLAYER SEARCH filter tiles ->
    // SEARCH RESULTS (tabs/cards/report) -> action-menu playercard. Purely
    // presentational — the actual listings/negotiation/pendingOffers/
    // shortlist data lives on state.transfers, not here.
    transferSearch: {
      stage: "filters", // "filters" | "results"
      filters: {
        name: "", area: "ALL", role: "ANY", nationId: null, status: "ANY",
        minAge: 0, maxAge: 0, country: null, leagueId: null, teamId: null,
      },
      filterTile: 0, filterSub: 0, // 8-tile grid cursor; filterSub picks the stacked row inside tiles 1 (position/role) and 4 (min/max age)
      // F3-fixes (fable-plans/plan2-decisions.md): PLAYER NAME / NATIONALITY
      // both open a full keyboard-overlay search (ms_SEARCH_PLAYERS_SCREEN_
      // EXAMPLE_PLAYER_NAME_SEARCH.png) instead of the old inline-text-input
      // swap. `query` is what's shown in the textbox/typed live; `committedQuery`
      // is what results are actually computed from — PLAYER NAME debounces the
      // gap between the two (router.js's timer), NATIONALITY doesn't (its own
      // spec: filters live, no minimum length). `resultsFocus` toggles keyboard
      //-grid navigation vs. results-table row navigation; `cursorRow/Col` is
      // the highlighted on-screen keyboard letter.
      nameSearch: { open: false, query: "", committedQuery: "", cursorRow: 0, cursorCol: 0, resultsFocus: false, resultIndex: 0 },
      nationSearch: { open: false, query: "", cursorRow: 0, cursorCol: 0, resultsFocus: false, resultIndex: 0 },
      resultsTab: "ALL", // ALL/ATT/MID/DEF/GK
      selectedPlayerId: null,
      reportPage: 0, // 0..2 RS pager (Summary/Physical/Technical)
      actionMenuOpen: false,
      actionMenuIndex: 0,
      exchangePickerOpen: false,
    },
    // F3: My Shortlist paper dossier — selected shortlist player + the
    // Pos-column sort direction (its one sortable column, same "X sorts the
    // one sortable column" convention as ui/squadreportui.js's own Squad
    // Report overlay).
    shortlist: { selectedPlayerId: null, sortDir: "asc", actionMenuOpen: false, actionMenuIndex: 0 },
    // Sell/Loan List overlay: selected squad player + the asking-price draft
    // being adjusted before listPlayer() commits it.
    sellList: { selectedPlayerId: null, askingPriceDraft: 0 },
    // F3: Negotiation dossier UI-only toggles (never persisted, same footing
    // as state.transfers.negotiation itself) — `editingFeeOffer` swaps the
    // Approach — Transfer Offer's "Offered Transfer Sum" row into a live
    // numeric <input> (§B2's "(Y) opens direct numeric entry"); the other
    // dossier fields are stepper-only, matching what the reference pics
    // actually show a (Y) glyph next to and what they don't.
    negotiation: { editingFeeOffer: false },
    // Request Funds overlay: the amount being adjusted before submission, and
    // the outcome of the last request/reallocation (shown as a banner).
    requestFunds: { amount: 100000, lastResult: null },

    // M8 (ui/gtnui.js): the GTN overlay is one overlay with 3 internal
    // views — 'hub' (hired scouts + market pool + mission list), 'missionForm'
    // (new-mission builder for the selected idle scout) and 'report' (one
    // mission's found players, fuzzy ratings, Bid/Loan actions). Purely
    // presentational, same footing as transferSearch/sellList above — the
    // real data (state.gtn.scouts/pool/missions) lives outside `ui`.
    gtn: {
      view: "hub",
      selectedScoutId: null, selectedIsPool: false,
      missionDraft: { scoutId: null, region: "ALL", area: "ALL", tags: [], minAge: 15, maxAge: 35, maxValue: 0, tierIndex: 0 },
      reportMissionId: null, reportSelectedPlayerId: null,
      lastError: null,
    },

    // M9 (ui/youthui.js): the Youth Staff overlay, same 3-views-in-one-
    // overlay shape as gtn above — 'hub' (hired youth scouts + market pool,
    // plus a "Youth Squad (N/16)" link into the roster), 'assignForm' (the
    // nation/type/duration picker for the selected idle scout) and 'squad'
    // (the youth roster list + one prospect's fuzzy-revealed detail,
    // Promote/Release actions). Purely presentational — the real data
    // (state.academy.scouts/pool/roster) lives outside `ui`.
    youth: {
      view: "hub",
      selectedScoutId: null, selectedIsPool: false,
      assignDraft: { scoutId: null, nationId: null, type: null, tierIndex: 0 },
      squadSelectedPlayerId: null,
      lastError: null,
    },

    // M11 (ui/mycareerui.js): My Career overlay — one of 3 pages ("overview",
    // "season", "history"), cycled by the footer's Prev/Next Page prompts,
    // same "purely presentational" footing as gtn/youth above (the real data
    // lives on state.manager — see engine/career.js).
    myCareer: { page: "overview" },

    // M11 (ui/squadreportui.js): Squad Report overlay — selected roster
    // player + Pos-column sort direction (the reference screen's only
    // sortable column).
    squadReport: { selectedPlayerId: null, sortDir: "asc" },

    // M11 (ui/squadreportui.js): Squad Ranking overlay — `arrows` (playerId ->
    // 'up'|'down'|'same') is computed once per openSquadRanking() call by
    // diffing the freshly-computed ranking against `lastRanks` (the ranking
    // as of the *previous* time this overlay was opened, itself then
    // overwritten) — see store.openSquadRanking()'s own header for why this
    // lives in a mutator rather than being computed at render time.
    squadRanking: { lastRanks: {}, arrows: {} },

    // M11 (ui/kitnumbersui.js): Kit Numbers overlay — `changes` maps
    // playerId -> the number they had when this overlay was last opened, so
    // the "Kit Changes" side panel can show "12 -> 13" (original, not just
    // the last single step) for anyone touched this session; cleared every
    // openKitNumbers().
    kitNumbers: { selectedPlayerId: null, editing: false, changes: {} },

    // F1/F2 (ui/teamsheetui.js + ui/formationsui.js): the Team Sheet view's
    // own sub-tab bar (`tab`) plus the SQUAD tab's interaction state: `changeView` (0
    // position/OVR, 1 energy/form, 2 positional colouring — cycled by LS/V),
    // `drawer` ('collapsed'|'substitutes'|'reserves'|'suggested'), `focus`
    // (the currently-viewed slot — `{zone:'xi'|'bench'|'reserve', index}` —
    // teal ring, right panel follows it), `armed` (the first-picked slot of
    // an in-progress (A) swap, or null), `suggested` (Y's ranked-candidates
    // drawer content, or null) and `attrPage` (right panel's §B4 page index).
    // All purely presentational — the real data (sheets/lineup/bench) lives
    // on state.squad, same footing as every other overlay's `ui.*` slice.
    teamSheet: {
      tab: "squad",
      changeView: 0,
      drawer: "collapsed",
      drawerMinimized: false,
      focus: { zone: "xi", index: 0 },
      armed: null,
      suggested: null,
      attrPage: 0,
      // F2 (plan2.md): FORMATIONS tab. `customiseMode` null|'menu'|
      // 'instructions'|'positioning' (FORMATIONS > EDIT breadcrumb depth);
      // instrEditingIndex non-null while a player's category cards + Info
      // panel are open (null = plain per-player attribute browsing, per
      // ms_..._CUSTOMISE_FORMATIONS_PLAYER_INSTRUCTIONS.png's un-selected
      // state); posFocusIndex is Player Positioning's own separate cursor
      // (no "armed" concept there — arrows nudge whoever's focused).
      formationsCursor: 0,
      // F2-fixes: row index (0-based, 3 cols/row) of the FORMATIONS grid's
      // top visible row — decoupled from formationsCursor so mouse-wheel
      // scrolling (core/router.js's own wheel listener) can move the window
      // without also moving the keyboard/click cursor.
      formationsScrollRow: 0,
      customiseMode: null,
      customiseMenuCursor: 0,
      instrFocusIndex: 0,
      instrEditingIndex: null,
      instrCategoryIndex: 0,
      posFocusIndex: 0,
      // F2: TACTICS tab (D-pad-icon grid, config/tactics.js's 4 presets).
      tacticsCursor: 0,
      // F2: ROLES tab (3x2 PLAYER ROLES grid + its squad-list picker).
      rolesCursor: 0,
      rolesPickerOpen: false,
      // F2-fixes: hovered/focused roster row inside the picker (playerId, or
      // null) — drives the picker's right-pane player attribute panel.
      rolesPickerFocusId: null,
    },

    // M11 (ui/statsui.js): Season ▸ Team Stats — L1/R1 cycles `leagueIndex`
    // (into state.staticData.leagues); "select" view lists that league's
    // clubs, "team" view shows the chosen club's individual player stats
    // (L2/R2 cycling `clubId` within the same league without returning to
    // the list — see the reference screen's own "L2 R2 {club}" header).
    teamStats: { leagueIndex: 0, view: "select", clubId: null, sortDir: "asc" },

    // M11 (ui/statsui.js): Season ▸ Player Stats — L1/R1 cycles `leagueIndex`,
    // L2/R2 cycles `category` (topScorers/assists/cleanSheets/yellowCards/
    // redCards).
    playerStats: { leagueIndex: 0, category: "topScorers" },

    // M11 (ui/savesui.js, js/main.js's wireSaves): the header menu's "Manage
    // Saves" overlay. Unlike every other `ui.*` slice, `slots` isn't derived
    // from GameState at all — it's IndexedDB metadata (core/db.js's
    // listSaveSlots), fetched by main.js (the project's one existing
    // db.js-touching module) and stashed here purely so ui/savesui.js can
    // render it the same "read state, don't fetch" way as everything else.
    saves: { slots: [], message: null },
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
 *
 * M5 additions: `state.clubLeague` (Map<clubId,leagueId>) is the *current*
 * season's club->league membership — promotion/relegation (engine/
 * season.js) moves clubs between leagues every year, but data/clubs.json's
 * own `.leagueId` is static, so every place that needs to know which league
 * a club plays in *this* season (fixture generation, league tables, cup
 * brackets) reads through this override instead of the raw club object.
 * `state.staticData` keeps the raw leagues/clubs/nations/cups lists around
 * (world.js already loaded them; a rollover needs them again without
 * re-fetching) and `state.cups` is this season's domestic-cup brackets
 * (engine/comps/cup.js).
 */
function deriveIndices(state, {
  allClubs, allLeagues, allNations, allCups, results = new Map(), clubLeague, cups, finances,
  transferListings, transferPendingOffers, clubTransferBudgets, transferShortlist, transferEnquiries,
}) {
  state.staticData = { leagues: allLeagues, clubs: allClubs, nations: allNations, cups: allCups };
  state.clubLeague = clubLeague || new Map(allClubs.map((c) => [c.id, c.leagueId]));
  // M10: nations, looked up the same way clubsById already is — engine/
  // comps/intl.js's quick-sim path (and, from checkpoint C on, the live
  // Match Day ticker for the user's own NT) needs a nation's `.prestige`/
  // `.name` the exact same way a club match needs a club record.
  state.nationsById = new Map(allNations.map((n) => [n.id, n]));

  state.playersById = new Map(state.players.map((p) => [p.id, p]));
  state.playersByClub = new Map();
  for (const p of state.players) {
    if (!state.playersByClub.has(p.clubId)) state.playersByClub.set(p.clubId, []);
    state.playersByClub.get(p.clubId).push(p);
  }

  const effectiveClubs = allClubs.map((c) => ({ ...c, leagueId: state.clubLeague.get(c.id) ?? c.leagueId }));
  state.clubsById = new Map(effectiveClubs.map((c) => [c.id, c]));
  state.squad.roster = state.players
    .filter((p) => p.clubId === state.club.id)
    .sort((a, b) => b.overall - a.overall);

  // M6: transfer/wage budgets (fable-plans/plan1.md's Finances tile). A
  // loaded save passes its persisted `finances` through unchanged (spend
  // from engine/contracts.js's renewal fees must survive a reload, same
  // rationale as `results`/`cups` above); a brand-new career starts with the
  // club's own baseTransferBudget untouched. engine/season.js's rollover
  // resets this every July 1 ("budgets reset"), jobs.js's acceptJob
  // recomputes it for whichever club is accepted.
  state.finances = finances || { transferBudget: state.club.baseTransferBudget, wageCeiling: computeWageCeiling(state.club, state.league) };

  state.fixtures = buildFixtures({
    leagues: allLeagues, clubs: effectiveClubs, seed: state.seed, seasonStartYear: state.seasonStartYear,
  });
  state.results = results;
  state.league.clubs = effectiveClubs.filter((c) => c.leagueId === state.league.id);
  state.league.table = buildLeagueTable(state.league, state.league.clubs, state.fixtures.byLeague.get(state.league.id), state.results);

  // Cup brackets carry live progress (which ties have been played) that
  // can't be re-derived from the seed alone the way fixtures can (a knockout
  // round's pairing depends on *who actually won* the previous round) — a
  // loaded save passes its persisted `cups` Map straight through; only a
  // brand-new career (or a fresh rollover, which rebuilds them explicitly —
  // see engine/season.js) builds fresh ones here.
  state.cups = (cups && cups.size > 0) ? cups : new Map(allCups.domestic.map((cup) => [
    cup.id, buildCupState({ cup, clubs: effectiveClubs, leagues: allLeagues, seed: state.seed, seasonStartYear: state.seasonStartYear }),
  ]));

  // M7: the user's own listed players (Sell/Loan List) and any offers
  // awaiting a delayed response (fee talks, contract talks, loan requests,
  // free-agent approaches, incoming CPU bids) — both persist directly (like
  // `results`/`cups` above), since neither is re-derivable from the seed.
  // `negotiation` (the single in-flight deal) is deliberately NOT persisted —
  // same "in-flight UI state doesn't survive a reload" convention as
  // `state.matchday` — a save mid-negotiation just drops it, and any
  // pendingOffers entry for it quietly no-ops when it resolves (see
  // engine/negotiation.js's applyFeeResolution/applyContractResolution guards).
  state.transfers.listings = transferListings || new Map();
  state.transfers.pendingOffers = transferPendingOffers || [];
  state.transfers.negotiation = null;
  // F3: My Shortlist ({playerId, dateAdded}[]) — persists like listings above
  // (not re-derivable from the seed).
  state.transfers.shortlist = transferShortlist || [];
  // F3-fixes: enquiry results (F3's "Enquire about <name>" action) now DO
  // persist — the Approach — Transfer Offer dossier quotes a resolved one
  // back to the user, so losing it on reload would silently make that quote
  // vanish. A pending (unresolved) entry surviving a reload still has its
  // own state.transfers.pendingOffers entry to resolve it on schedule (that
  // Map/array pair is restored together, same footing as listings/
  // pendingOffers above).
  state.transfers.enquiries = new Map(transferEnquiries || []);
  // CPU clubs' own transfer budgets (engine/clubbudget.js) — lazily
  // populated per club as CPU<->CPU activity/incoming bids touch them;
  // persists across saves so a club's spend isn't silently refilled on reload.
  state.clubTransferBudgets = clubTransferBudgets || new Map();

  return state;
}

/** Recomputes state.league.table from the latest state.results — called
 * after any batch of matches resolves (core/store.js's advanceToDate and
 * matchdayFinish()) so Central/Season's table tiles reflect new results. */
export function refreshLeagueTable(state) {
  state.league.table = buildLeagueTable(state.league, state.league.clubs, state.fixtures.byLeague.get(state.league.id), state.results);
}

/** F0: the email overlay's 3 tabs each show a different slice of
 * state.inbox.emails — Emails (not archived), Player Conversations (always
 * empty — no backing feature), Message Archive (archived). Shared by
 * ui/render.js's list render and the Store methods below so both index the
 * same list the same way. */
export function emailsForTab(state, tab) {
  const t = tab || state.ui.emailTab;
  if (t === "archive") return state.inbox.emails.filter((e) => e.archived);
  if (t === "conversations") return [];
  return state.inbox.emails.filter((e) => !e.archived);
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
      // M5: board-objective evaluation/sacking (engine/objectives.js) and
      // the job market (engine/jobs.js) — plan1.md: "manager rep (1-20
      // scale)". Persisted as part of `manager` (core/db.js serializes it
      // wholesale), no separate db.js change needed.
      rep: 5,
      warned: false,
      sacked: false,
      // M11 My Career: clubsManaged/record/biggestWin/biggestDefeat/
      // transferFeePaid|ReceivedRecord/leagueTitles/domesticCupsWon/
      // continentalCupsWon/history — see engine/career.js's own header.
      ...createManagerCareerFields(club.id),
    },

    club,
    league,

    // M11 (config/settings.js, ui/settingsui.js): Office ▸ Settings.
    settings: { ...DEFAULT_SETTINGS },

    calendar: {
      today,
      strip: buildDayStrip(today, 5),
    },

    players: world.players,
    // F1: `lineup`/`bench`/`formationLabel`/`formationStyle` always mirror
    // the active entry of `sheets` (same array/object references, not
    // copies — see setActiveSheet below) so every pre-F1 reader of
    // state.squad.lineup (engine/sim/lineup.js's resolveUserXI,
    // gen/squad.js's applyCaptainToLineup, ui/render.js's renderSquad hub
    // preview) keeps working unchanged; only Team Sheet-aware code needs to
    // know `sheets`/`activeSheetIndex` exist at all.
    squad: {
      formationLabel: "4-4-2",
      formationStyle: "Flat",
      lineup: world.lineupsByClub.get(club.id),
      bench: [],
      sheets: [],
      activeSheetIndex: 0,
      nextSheetId: 1,
      // M11 (config/tactics.js, ui/rolestacticsui.js): the user's active in-match
      // tactic preset — real effect wired into engine/sim/core.js's
      // teamStrength() via events.js/quick.js's own call sites.
      tacticId: DEFAULT_TACTIC_ID,
      // M11 Player Roles: captaincy (re-marks state.squad.lineup's "C" badge
      // via gen/squad.js's applyCaptainToLineup) + designated penalty taker
      // (real effect wired into sim/quick.js's rollGoals + sim/events.js's
      // rollChancesForSide). Both null until the user picks one.
      captainId: null,
      penaltyTakerId: null,
      // F2 (plan2.md ROLES tab): set-piece takers, same "null until the user
      // picks one" footing as captainId/penaltyTakerId above.
      // Sim hooks (plan2.md: "penalty/FK taker gets those set-piece chances;
      // corner takers weight assist attribution; captain +2 morale"):
      // corner takers get a small ASSIST_ATTRIBS weight bonus via the same
      // instructionMults hook F2's Player Instructions use (engine/sim/
      // match.js's buildRoleMults) — [TUNED], logged in plan2-decisions.md
      // F2. Free-kick takers have no dedicated set-piece chance type to
      // redirect into (same "no chance-type taxonomy" limit as
      // config/instructions.js's own header) — stored/displayed only.
      // "captain +2 morale" is F6's engine/morale.js's own responsibility
      // (that mechanic doesn't exist yet at all) — deferred, not dropped;
      // logged in plan2-decisions.md F2 for F6 to wire.
      leftCornerId: null,
      rightCornerId: null,
      shortFreeKickId: null,
      longFreeKickId: null,
      // F2: per-sheet Player Instructions (mirrors squad.lineup/bench's own
      // "same array reference as the active sheet" convention below).
      instructions: {},
    },

    // Day-1 board objective emails (plan1.md M3: "board objective emails on
    // day 1"). Real content from here on — see engine/objectives.js.
    inbox: { emails: buildObjectiveEmails({ club, league, cup, managerName, today }) },

    // The live Match Day overlay's state (engine/sim/match.js) — null except
    // for the duration of the user's own fixture; never persisted (a save
    // mid-live-match isn't supported, matching the project's existing
    // "fixtures/inbox persist, in-flight UI doesn't" convention).
    matchday: null,

    // M11 (engine/career.js, ui/squadreportui.js's Squad Ranking panel): the
    // user's club's most recently finished match (any competition) — null
    // until the first one resolves.
    lastMatchReport: null,

    // M5: CPU-club managerial vacancies the user can apply to — always
    // starts empty; engine/jobs.js's refreshJobMarket populates it at every
    // rollover (and immediately if the user is sacked).
    jobMarket: { vacancies: [] },

    // M10 (engine/ntjobs.js, checkpoint C): the national-team job market,
    // same shape/lifecycle as jobMarket above but entirely separate — a
    // nation never replaces the user's club job, both run simultaneously.
    // state.nationalTeam is null until a vacancy is accepted.
    nationalTeam: null,
    ntJobMarket: { vacancies: [] },

    ...createStubExtras(today),
    ui: createUiDefaults(today),
  };

  const built = deriveIndices(state, { allClubs: world.clubs, allLeagues: world.leagues, allNations: world.nations, allCups: world.cups });

  // M8: the user's own starting XI/squad is always fully known from day one
  // (gen/player.js generates every player at scouting level 0 — see its own
  // header — since generation can't know which club the user picked; this is
  // the one place that does). Every player who joins the user's club later
  // gets the same treatment via engine/contracts.js's movePlayerToClub.
  for (const p of built.squad.roster) {
    p.scouting = { level: 3, ovrRange: [p.overall, p.overall], potRange: [p.potential, p.potential] };
  }

  // F1: the "Default Team Sheet" — wraps the already-generated XI (M2) with
  // a fresh 7-man bench (gen/squad.js's pickDefaultBench). `lineup`/`bench`
  // on the sheet and on `built.squad` are the *same* array references (not
  // copies), so in-place edits (Team Sheet swaps) made through either one
  // are visible through the other with no extra sync step.
  built.squad.bench = pickDefaultBench(built.squad.roster, built.squad.lineup);
  // F2: seeds each XI slot's Player Positioning baseline (±8% clamp anchor,
  // config/formations.js's own header) at its freshly-generated coordinate —
  // every formation re-application (Store.applyFormation) re-seeds this the
  // same way.
  seedFormationBaseline(built.squad.lineup);
  built.squad.sheets = [{
    id: built.squad.nextSheetId++,
    name: "Default Team Sheet",
    formationLabel: built.squad.formationLabel,
    formationStyle: built.squad.formationStyle,
    lineup: built.squad.lineup,
    bench: built.squad.bench,
    instructions: built.squad.instructions,
  }];
  built.squad.activeSheetIndex = 0;

  gtnEngine.createInitialGtnState(built);
  academyEngine.createInitialAcademyState(built);
  // M10: continental clubs (Champions Cup/Trophy/South American Cup) —
  // Season 1 has no prior-season table to seed qualification from, so this
  // bootstraps straight from each club's static prestige (see
  // engine/comps/continental.js's own header).
  createInitialContinentalState(built);
  // M10: internationals (World Cup/Euro/Copa América/AFCON/Asian Cup) —
  // builds whichever competitions' qualifying (or bootstrap) window has
  // already opened by the career's first season (see engine/comps/intl.js's
  // own header for which those are).
  createInitialIntlState(built);

  setDisplayCurrency(built.settings.currency); // M11: core/format.js's money() default

  return built;
}

/**
 * Rebuilds a GameState from a loaded save (core/db.js's deserializeSave)
 * plus freshly-fetched static data (leagues/clubs/nations/cups aren't
 * persisted in the save — see db.js's header comment for why). The inbox IS
 * persisted (unlike fixtures, which regenerate deterministically from the
 * seed) since read/unread state and any mail accumulated during play must
 * survive a reload — likewise `clubLeague` (promotion/relegation history)
 * and `cups` (in-progress knockout brackets), neither of which is
 * re-derivable from the seed alone (see deriveIndices's header).
 */
export function hydrateFromSave(saved, { leagues, clubs, nations, cups }) {
  const club = clubs.find((c) => c.id === saved.clubId);
  const leagueId = saved.clubLeague ? saved.clubLeague.get(club.id) ?? club.leagueId : club.leagueId;
  const league = leagues.find((l) => l.id === leagueId) || leagues.find((l) => l.id === club.leagueId);
  const today = saved.calendarToday;

  const state = {
    seed: saved.seed,
    seasonStartYear: saved.seasonStartYear,
    // M11: a pre-M11 save's `manager` predates clubsManaged/record/history —
    // same "fresh default for an older save" footing as gtn/academy below;
    // real saved fields win, only genuinely-missing ones fall back.
    manager: { ...createManagerCareerFields(saved.clubId), ...saved.manager },
    club,
    league,
    // M11: a pre-M11 save has no `settings` at all — same fallback footing.
    settings: { ...DEFAULT_SETTINGS, ...(saved.settings || {}) },
    calendar: { today, strip: buildDayStrip(today, 5) },
    players: saved.players,
    squad: {
      formationLabel: "4-4-2",
      formationStyle: "Flat",
      lineup: saved.lineup,
      bench: [],
      sheets: [],
      activeSheetIndex: 0,
      nextSheetId: 1,
      tacticId: saved.squadTacticId || DEFAULT_TACTIC_ID,
      captainId: saved.squadCaptainId ?? null,
      penaltyTakerId: saved.squadPenaltyTakerId ?? null,
      // F2: a pre-F2 save has none of these — same fallback footing.
      leftCornerId: saved.squadLeftCornerId ?? null,
      rightCornerId: saved.squadRightCornerId ?? null,
      shortFreeKickId: saved.squadShortFreeKickId ?? null,
      longFreeKickId: saved.squadLongFreeKickId ?? null,
      instructions: {},
    },
    inbox: { emails: saved.inbox },
    matchday: null,
    lastMatchReport: saved.lastMatchReport || null,
    jobMarket: saved.jobMarket || { vacancies: [] },
    nationalTeam: saved.nationalTeam || null,
    ntJobMarket: saved.ntJobMarket || { vacancies: [] },
    ...createStubExtras(today),
    ui: createUiDefaults(today),
  };

  // M7: state.news.transfer is the one createStubExtras() field that's no
  // longer purely static once a session has pushed real CPU/user transfer
  // articles into it — override the just-spread stub with whatever was
  // persisted (db.js's serializeSave), falling back to the stub only for a
  // pre-M7 save that never had this field at all (undefined, not just empty).
  if (saved.newsTransfer !== undefined) state.news.transfer = saved.newsTransfer;

  const built = deriveIndices(state, {
    allClubs: clubs, allLeagues: leagues, allNations: nations, allCups: cups,
    results: saved.results, clubLeague: saved.clubLeague, cups: saved.cupsState, finances: saved.finances,
    transferListings: saved.transferListings, transferPendingOffers: saved.transferPendingOffers,
    clubTransferBudgets: saved.clubTransferBudgets, transferShortlist: saved.transferShortlist,
    transferEnquiries: saved.transferEnquiries,
  });

  // F1: a pre-F1 save never had state.squad.sheets at all — same "fresh
  // default for an older save" footing as gtn/academy below (no version
  // bump/hard-fail per plan2.md §A4: this project's established convention,
  // consistently used since M6, is a graceful per-field fallback rather than
  // a save-format break). `saved.squadSheets`'s lineup entries reference the
  // same player ids as `built.squad.lineup` — no separate rehydration needed.
  if (saved.squadSheets && saved.squadSheets.length) {
    built.squad.sheets = saved.squadSheets;
    built.squad.activeSheetIndex = Math.min(saved.squadActiveSheetIndex ?? 0, saved.squadSheets.length - 1);
    built.squad.nextSheetId = saved.squadNextSheetId || saved.squadSheets.length + 1;
    // F2: a pre-F2 save's sheets have no `.instructions`, and their lineup
    // entries have no Player Positioning baseline — same graceful per-field
    // fallback as everywhere else in this function.
    for (const sheet of built.squad.sheets) {
      if (!sheet.instructions) sheet.instructions = {};
      if (sheet.lineup.length && sheet.lineup[0].baseX == null) seedFormationBaseline(sheet.lineup);
    }
  } else {
    built.squad.bench = pickDefaultBench(built.squad.roster, built.squad.lineup);
    seedFormationBaseline(built.squad.lineup);
    built.squad.sheets = [{
      id: built.squad.nextSheetId++,
      name: "Default Team Sheet",
      formationLabel: built.squad.formationLabel,
      formationStyle: built.squad.formationStyle,
      lineup: built.squad.lineup,
      bench: built.squad.bench,
      instructions: {},
    }];
    built.squad.activeSheetIndex = 0;
  }
  built.squad.lineup = built.squad.sheets[built.squad.activeSheetIndex].lineup;
  built.squad.bench = built.squad.sheets[built.squad.activeSheetIndex].bench;
  built.squad.formationLabel = built.squad.sheets[built.squad.activeSheetIndex].formationLabel;
  built.squad.formationStyle = built.squad.sheets[built.squad.activeSheetIndex].formationStyle;
  built.squad.instructions = built.squad.sheets[built.squad.activeSheetIndex].instructions;

  // M8: a pre-M8 save never had state.gtn at all — same "fresh default for
  // an older save" footing as jobMarket's own `|| { vacancies: [] }` above.
  built.gtn = saved.gtn || gtnEngine.createInitialGtnState(built);
  // M9: ditto for state.academy on a pre-M9 save.
  built.academy = saved.academy || academyEngine.createInitialAcademyState(built);
  // M10: ditto for state.continental / state.intl on a pre-M10 save.
  built.continental = saved.continental || createInitialContinentalState(built);
  built.intl = saved.intl || createInitialIntlState(built);

  setDisplayCurrency(built.settings.currency); // M11: core/format.js's money() default

  return built;
}

/* ----- F1 (ui/teamsheetui.js): Team Sheet slot addressing -----------------
 * A "slot" is `{zone, index}` — zone 'xi' indexes state.squad.lineup (11
 * entries, always filled), 'bench' indexes state.squad.bench (up to 7,
 * playerId or null), 'reserve' indexes the *derived* reservesOf() list (no
 * persisted array — see gen/squad.js's own header for why). Every mutator
 * below reads/writes a slot only through these helpers, so the swap logic
 * doesn't need 6 special cases for XI/bench/reserve combinations. ------- */

// Exported (like emailsForTab above) so ui/teamsheetui.js's pure renderer
// can address the exact same slots the mutators below do, without
// duplicating the XI/bench/reserve addressing scheme.
export function teamSheetReserves(state) {
  const squad = state.squad;
  return reservesOf(squad.roster, squad.lineup, squad.bench);
}

export function teamSheetSlotPlayerId(state, slot) {
  const squad = state.squad;
  if (slot.zone === "xi") return squad.lineup[slot.index] ? squad.lineup[slot.index].playerId : null;
  if (slot.zone === "bench") return squad.bench[slot.index] ?? null;
  if (slot.zone === "reserve") {
    const p = teamSheetReserves(state)[slot.index];
    return p ? p.id : null;
  }
  return null;
}

export function teamSheetSlotPlayer(state, slot) {
  const id = teamSheetSlotPlayerId(state, slot);
  return id != null ? state.playersById.get(id) : null;
}

/** Every slot keyboard arrow-navigation can currently reach: the 11 XI
 * slots, always, plus whatever the bottom drawer has open (Substitutes'
 * filled bench slots, the Reserves grid, or Suggested Subs' ranked
 * candidates) — core/router.js's keydown handler walks this flat list so
 * arrow keys don't need to know the pitch's x/y layout. */
export function teamSheetFocusableSlots(state) {
  const squad = state.squad;
  const ts = state.ui.teamSheet;
  const slots = squad.lineup.map((_, i) => ({ zone: "xi", index: i }));
  if (ts.drawer === "substitutes") {
    squad.bench.forEach((id, i) => { if (id != null) slots.push({ zone: "bench", index: i }); });
  } else if (ts.drawer === "reserves") {
    teamSheetReserves(state).forEach((_, i) => slots.push({ zone: "reserve", index: i }));
  } else if (ts.drawer === "suggested" && ts.suggested) {
    const reserves = teamSheetReserves(state);
    for (const id of ts.suggested.candidateIds) {
      const benchIdx = squad.bench.indexOf(id);
      if (benchIdx !== -1) { slots.push({ zone: "bench", index: benchIdx }); continue; }
      const reserveIdx = reserves.findIndex((p) => p.id === id);
      if (reserveIdx !== -1) slots.push({ zone: "reserve", index: reserveIdx });
    }
  }
  return slots;
}

/** F2 (config/formations.js): stamps every XI entry's current x/y as its
 * Player Positioning baseline — called once at squad generation and again
 * every time a formation is (re)applied (Store.applyFormation), since a
 * remap always starts every slot back at its formation-assigned coordinate. */
// F2 ROLES tab: PLAYER ROLES grid cell index -> state.squad field, in the
// pic's 3x2 reading order (ms_TEAM_SHEET_VIEW_ROLES.png).
const ROLE_FIELDS = ["captainId", "leftCornerId", "rightCornerId", "shortFreeKickId", "penaltyTakerId", "longFreeKickId"];

function seedFormationBaseline(lineup) {
  for (const entry of lineup) {
    entry.baseX = entry.x;
    entry.baseY = entry.y;
  }
}

function teamSheetWriteSlot(state, slot, playerId) {
  const squad = state.squad;
  if (slot.zone === "xi") {
    const entry = squad.lineup[slot.index];
    const player = state.playersById.get(playerId);
    entry.playerId = playerId;
    entry.name = player.commonName;
    entry.rating = player.overall;
  } else if (slot.zone === "bench") {
    squad.bench[slot.index] = playerId;
  }
  // 'reserve' zone has no array to write — vacating/filling it is implicit,
  // see teamSheetSwap's own header.
}

function sameSlot(a, b) {
  return !!a && !!b && a.zone === b.zone && a.index === b.index;
}

/**
 * Swaps the players at slots `a` and `b` (fable-plans/plan2.md F1.4: "second
 * select => swap positions/slots (XI<->XI, XI<->bench, bench<->reserve)").
 * 'reserve' zone slots have no backing array (gen/squad.js's reservesOf is
 * derived, not persisted) — a reserve "slot" only ever needs *reading*
 * (whoever's being pulled out of it), since a player no longer named in the
 * XI or bench is, by definition, a reserve again; reserve<->reserve is a
 * genuine no-op (nothing is persisted about reserve order).
 */
function teamSheetSwap(state, a, b) {
  if (a.zone === "reserve" && b.zone === "reserve") return;
  const aId = teamSheetSlotPlayerId(state, a);
  const bId = teamSheetSlotPlayerId(state, b);
  if (aId == null || bId == null || aId === bId) return;
  if (a.zone !== "reserve") teamSheetWriteSlot(state, a, bId);
  if (b.zone !== "reserve") teamSheetWriteSlot(state, b, aId);
  applyCaptainToLineup(state.squad.lineup, state.squad.captainId);
}

/** Locates whichever slot currently holds `playerId` (bench first, then
 * reserves — Suggested Subs' candidate pool never includes XI players, see
 * Store.teamSheetSuggestedSubs). Used to auto-focus the top-ranked
 * candidate once (Y) computes the list. */
function teamSheetLocate(state, playerId) {
  const squad = state.squad;
  const benchIdx = squad.bench.indexOf(playerId);
  if (benchIdx !== -1) return { zone: "bench", index: benchIdx };
  const reserveIdx = teamSheetReserves(state).findIndex((p) => p.id === playerId);
  if (reserveIdx !== -1) return { zone: "reserve", index: reserveIdx };
  return null;
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
    const email = emailsForTab(this.state)[idx];
    if (email) email.read = true;
    this.emit("email:select", idx);
  }

  /** F0: switching Emails/Player Conversations/Message Archive resets the
   * selection (indices mean different things per tab's filtered list — see
   * emailsForTab above). */
  selectEmailTab(tab) {
    if (tab !== "inbox" && tab !== "conversations" && tab !== "archive") return;
    this.state.ui.emailTab = tab;
    this.state.ui.emailSelectedIndex = 0;
    this.emit("email:tab", tab);
  }

  /** Y Archive Message: only meaningful from the main Emails list — moves
   * the selected email onto the Message Archive tab. Archiving from the
   * Archive tab itself isn't a mechanic shown in any reference pic, so it's
   * a no-op there rather than an invented "unarchive" (see plan2-decisions.md F0). */
  archiveSelectedEmail() {
    if (this.state.ui.emailTab !== "inbox") return;
    const list = emailsForTab(this.state);
    const email = list[this.state.ui.emailSelectedIndex];
    if (!email) return;
    email.archived = true;
    this.state.ui.emailSelectedIndex = 0;
    this.emit("email:select", this.state.ui.emailSelectedIndex);
  }

  /** X Delete Message: permanently removes the selected email from whichever
   * tab it's currently being viewed on (Emails or Message Archive). */
  deleteSelectedEmail() {
    const list = emailsForTab(this.state);
    const email = list[this.state.ui.emailSelectedIndex];
    if (!email) return;
    const idx = this.state.inbox.emails.indexOf(email);
    if (idx !== -1) this.state.inbox.emails.splice(idx, 1);
    this.state.ui.emailSelectedIndex = 0;
    this.emit("email:select", this.state.ui.emailSelectedIndex);
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
    // Sacked (M5, engine/objectives.js's end-of-season evaluation): no
    // further advancing until a new job is accepted (Browse Jobs) — playing
    // on as a manager who's just been fired wouldn't make sense.
    if (this.state.manager.sacked) return;
    const { date } = advanceTowards(
      this.state.fixtures, this.state.club.id, this.state.calendar.today, targetDate,
      (day) => this._processCalendarDay(day),
      // M10: also halt on the user's own national-team fixture, if they
      // manage one — same "Advance stops for a match you play" guarantee
      // the club fixture check already gives, extended to intl duty.
      (day) => !!(this.state.nationalTeam && intlFixtureOnDate(this.state, this.state.nationalTeam.nationId, day)),
    );
    this.state.calendar.today = date;
    this.state.calendar.strip = buildDayStrip(date, 5);
    refreshLeagueTable(this.state);
    this.emit("advance", null);

    // Getting sacked (M5) takes priority over anything else this Advance
    // click might otherwise have triggered — plan1.md's own M5 acceptance
    // check: "getting sacked sends you to Browse Jobs".
    if (this.state.manager.sacked) {
      this.openBrowseJobs();
      return;
    }

    const fixture = fixtureOnDate(this.state.fixtures, this.state.club.id, date);
    if (fixture) { this.openMatchday(fixture); return; }

    // M10: no club fixture today — check the user's own NT fixture, if any.
    if (this.state.nationalTeam) {
      const intlFixture = intlFixtureOnDate(this.state, this.state.nationalTeam.nationId, date);
      if (intlFixture) this.openMatchday(intlFixture);
    }
  }

  /** Runs for every calendar day the Advance loop steps into (fable-plans/
   * plan1.md M5): non-user fixtures + cup ties always resolve
   * (engine/sim/worldsim.js), and the season's fixed dates trigger their
   * engine/season.js hooks — mid-season growth (Feb 1), the board review +
   * retirement announcements (January), the CPU contract-renewal pass (May,
   * M6), and the full rollover pipeline (July 1, which is also next
   * season's kickoff). `state.calendar.today` is updated *first*
   * (advanceToDate's own copy at the end of its own walk is just a
   * redundant, harmless final sync) so any email these hooks build
   * (buildMidSeasonReviewEmail, buildSeasonEndEmail, ...) is dated the day
   * it's actually sent on, not the previous day.
   *
   * M6: checkContractExpiryWarnings runs every day (not gated behind an
   * `events` entry) — it's a per-player date comparison over just the
   * user's ~24-man squad, cheap enough not to need its own calendar event,
   * and "60 days before expiry" is a rolling per-player threshold rather
   * than a single fixed date the way growth/board-review/rollover are. */
  _processCalendarDay(day) {
    this.state.calendar.today = day;
    const events = eventsOnDate(day, this.state.seasonStartYear);
    if (events.includes("growth")) applyMidSeasonGrowth(this.state);
    if (events.includes("board-review")) applyBoardReview(this.state);
    if (events.includes("contract-renewal")) applyCpuContractRenewals(this.state);
    checkContractExpiryWarnings(this.state, day);
    // M7: resolve any of the user's own delayed transfer/loan/approach
    // responses due today, run this day's CPU<->CPU window activity (a
    // no-op outside an open window or off its weekly cadence — see
    // engine/transferai.js), check for fresh incoming bids on the user's
    // listed players, and return any loans whose spell has ended.
    this._resolvePendingTransferOffers(day);
    transferai.runWeeklyTransferActivity(this.state, day);
    transferai.checkIncomingBidsOnListedPlayers(this.state, day);
    negotiation.resolveLoanReturns(this.state, day);
    gtnEngine.runDailyGtnActivity(this.state, day);
    academyEngine.runDailyAcademyActivity(this.state, day);
    simulateWorldDay(this.state, day);
    if (events.includes("season-rollover")) rolloverSeason(this.state);
  }

  /** Dispatches every state.transfers.pendingOffers entry due on or before
   * `day` to its owning module's resolver — negotiation.js owns fee/contract/
   * loan responses, freeagents.js owns pre-contract approach responses. Kept
   * here (rather than importing freeagents.js into negotiation.js or vice
   * versa) so those two files never need to know about each other. */
  _resolvePendingTransferOffers(day) {
    const state = this.state;
    const due = state.transfers.pendingOffers.filter((o) => toEpochDay(o.dueDate) <= toEpochDay(day));
    if (!due.length) return;
    state.transfers.pendingOffers = state.transfers.pendingOffers.filter((o) => toEpochDay(o.dueDate) > toEpochDay(day));
    for (const entry of due) {
      if (entry.type === "fee-response") negotiation.resolveFeeOfferEntry(state, entry);
      else if (entry.type === "contract-response") negotiation.resolveContractOfferEntry(state, entry);
      else if (entry.type === "loan-response") negotiation.resolveLoanRequestEntry(state, entry);
      else if (entry.type === "approach-response") freeagents.resolveApproachEntry(state, entry);
      else if (entry.type === "enquiry-response") enquiryEngine.resolveEnquiryEntry(state, entry);
    }
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

  /* ----- Browse Jobs (M5, engine/jobs.js) ----- */

  openBrowseJobs() {
    this.state.ui.jobsSelectedIndex = this.state.jobMarket.vacancies.length ? 0 : -1;
    this.openOverlay("jobs");
  }

  selectJobRow(idx) {
    this.state.ui.jobsSelectedIndex = idx;
    this.emit("jobs:select", idx);
  }

  /** Accepts the selected vacancy — see engine/jobs.js's header for this
   * milestone's "apply == instant accept" scope decision. */
  applyForSelectedJob() {
    const idx = this.state.ui.jobsSelectedIndex;
    const clubId = this.state.jobMarket.vacancies[idx];
    if (!clubId) return;
    acceptJob(this.state, clubId);
    this.state.ui.jobsSelectedIndex = -1;
    this.closeOverlay();
    this.emit("advance", null); // reuse Central/Season's re-render hook — club/league/squad all changed
    this.emit("jobs:accepted", clubId);
  }

  /* ============================================================================
   * M10: National-team jobs (engine/ntjobs.js) + Natl Squad Selection
   * (engine/comps/intl.js's nationSquadRoster reads state.nationalTeam
   * directly, so these methods just maintain that + the squad-selection
   * overlay's own tiny bit of UI state) — engine/jobs.js's own "apply ==
   * instant accept" scope precedent, applied to nations; accepting never
   * touches state.club/state.league, since a manager runs both
   * simultaneously (plan1.md: "manage club + country simultaneously").
   * ========================================================================== */

  openNtJobs() {
    this.state.ui.ntJobsSelectedIndex = this.state.ntJobMarket.vacancies.length ? 0 : -1;
    this.openOverlay("ntjobs");
  }

  selectNtJobRow(idx) {
    this.state.ui.ntJobsSelectedIndex = idx;
    this.emit("ntjobs:select", idx);
  }

  applyForSelectedNtJob() {
    const idx = this.state.ui.ntJobsSelectedIndex;
    const nationId = this.state.ntJobMarket.vacancies[idx];
    if (!nationId) return;
    ntJobsEngine.acceptNtJob(this.state, nationId);
    this.state.ui.ntJobsSelectedIndex = -1;
    this.closeOverlay();
    this.emit("advance", null); // Squad screen's NATL tiles go live
    this.emit("ntjobs:accepted", nationId);
  }

  /** Opens the Natl Squad Selection overlay (Squad screen's sq-natlsel
   * tile) — a no-op if the user doesn't currently manage a nation. */
  openNatlSquad() {
    if (!this.state.nationalTeam) return;
    const roster = this.state.players.filter((p) => p.nationId === this.state.nationalTeam.nationId);
    const first = [...roster].sort((a, b) => b.overall - a.overall)[0];
    this.state.ui.natlSquad.selectedPlayerId = first ? first.id : null;
    this.state.ui.natlSquad.lastError = null;
    this.openOverlay("natlsquad");
  }

  selectNatlSquadPlayer(playerId) {
    this.state.ui.natlSquad.selectedPlayerId = playerId;
    this.emit("natlsquad", null);
  }

  /** Toggles a player in/out of the 23-man squad (capped — a no-op past the
   * cap, surfaced via lastError same as GTN/Youth's own capacity guards),
   * then re-derives the starting lineup from whoever's left in the squad
   * (gen/squad.js's pickBestXI — the same auto-pick the initial accept
   * used; there's no drag-and-drop lineup editor for the *club* team sheet
   * yet either, so this isn't a scope regression). */
  toggleNatlSquadPlayer(playerId) {
    const nt = this.state.nationalTeam;
    if (!nt) return;
    const idx = nt.squadPlayerIds.indexOf(playerId);
    if (idx !== -1) {
      nt.squadPlayerIds.splice(idx, 1);
    } else {
      if (nt.squadPlayerIds.length >= 23) {
        this.state.ui.natlSquad.lastError = "Squad is full (23/23) — remove a player first";
        this.emit("natlsquad", null);
        return;
      }
      nt.squadPlayerIds.push(playerId);
    }
    this.state.ui.natlSquad.lastError = null;
    const squad = nt.squadPlayerIds.map((id) => this.state.playersById.get(id)).filter(Boolean);
    nt.lineup = pickBestXI(squad);
    this.emit("natlsquad", null);
  }

  /* ----- Contracts (M6, engine/contracts.js): Office ▸ Contracts renewal UI ----- */

  /** Opens the Contracts overlay, defaulting the selection to the squad's
   * most urgent (fewest years left) player, if any. */
  openContracts() {
    const roster = this.state.squad.roster;
    const first = [...roster].sort((a, b) => a.contract.endYear - b.contract.endYear)[0];
    this.selectContractPlayer(first ? first.id : null);
    this.openOverlay("contracts");
  }

  /** Selects a squad player and seeds the offer with their computed ask
   * (engine/contracts.js's computeAsk) — a sensible starting point the user
   * can then adjust with adjustContractOfferWage/Years. */
  selectContractPlayer(playerId) {
    const c = this.state.ui.contracts;
    c.selectedPlayerId = playerId;
    c.lastResult = null;
    const player = playerId != null ? this.state.playersById.get(playerId) : null;
    if (player) {
      c.offerWage = computeAsk(player).wage;
      c.offerYears = 3;
    }
    this.emit("contracts", null);
  }

  /** Nudges the offered wage by `deltaPct` (e.g. ±0.05) of the player's ask —
   * fixed percentage-of-ask steps keep the stepper meaningful across every
   * wage scale (a lower-league player's ask and a superstar's ask are wildly
   * different absolute numbers). Never below the player's current wage — a
   * renewal offer is never a pay cut. */
  adjustContractOfferWage(deltaPct) {
    const c = this.state.ui.contracts;
    const player = this.state.playersById.get(c.selectedPlayerId);
    if (!player) return;
    const ask = computeAsk(player).wage;
    c.offerWage = Math.max(player.contract.wage, Math.round((c.offerWage + ask * deltaPct) / 10) * 10);
    this.emit("contracts", null);
  }

  adjustContractOfferYears(delta) {
    const c = this.state.ui.contracts;
    c.offerYears = Math.min(5, Math.max(1, c.offerYears + delta));
    this.emit("contracts", null);
  }

  /** Auto-fills the offer with the player's exact ask (100% wage, 3-year
   * length) — the Contracts UI's "Suggested Terms" shortcut. */
  suggestContractTerms() {
    const c = this.state.ui.contracts;
    const player = this.state.playersById.get(c.selectedPlayerId);
    if (!player) return;
    c.offerWage = computeAsk(player).wage;
    c.offerYears = 3;
    this.emit("contracts", null);
  }

  /** Submits the current offer (engine/contracts.js's renewUserContract) —
   * single-shot, not iterative fee-talk rounds (see that file's header for
   * why, same footing as engine/jobs.js's Browse Jobs). */
  submitContractOffer() {
    const c = this.state.ui.contracts;
    if (c.selectedPlayerId == null) return;
    const result = renewUserContract(this.state, c.selectedPlayerId, { wage: c.offerWage, years: c.offerYears });
    c.lastResult = result.accepted ? "accepted" : "rejected";
    this.emit("contracts", null);
    this.emit("advance", null); // reuse Central/Season/Transfers' re-render hook — wage bill/finances changed
  }

  /* ----- M11 (engine/career.js): Office ▸ My Career ----- */

  /** Opens the My Career overlay, always starting on the Overview page
   * (matches Browse Jobs/GTN's own "reset to a sensible default view on
   * open" precedent) — the page itself is cheap to flip back to whichever
   * the user was last on if that's ever wanted, but a stale deep page from a
   * previous session would be a confusing thing to land back on unannounced. */
  openMyCareer() {
    this.state.ui.myCareer.page = "overview";
    this.openOverlay("mycareer");
  }

  /** Cycles the 3-page My Career overlay: overview -> season -> history -> overview. */
  myCareerChangePage(dir) {
    const pages = ["overview", "season", "history"];
    const i = pages.indexOf(this.state.ui.myCareer.page);
    this.state.ui.myCareer.page = pages[(i + dir + pages.length) % pages.length];
    this.emit("mycareer", null);
  }

  /* ----- M11 (ui/squadreportui.js): Squad Report / Squad Ranking ----- */

  /** Opens Squad Report, defaulting the selection to the squad's top-rated
   * player if nothing's selected yet (same "sensible default" precedent as
   * openContracts). */
  openSquadReport() {
    if (this.state.ui.squadReport.selectedPlayerId == null) {
      const first = [...this.state.squad.roster].sort((a, b) => b.overall - a.overall)[0];
      this.state.ui.squadReport.selectedPlayerId = first ? first.id : null;
    }
    this.openOverlay("squadreport");
  }

  selectSquadReportPlayer(playerId) {
    this.state.ui.squadReport.selectedPlayerId = playerId;
    this.emit("squadreport", null);
  }

  toggleSquadReportSort() {
    const s = this.state.ui.squadReport;
    s.sortDir = s.sortDir === "asc" ? "desc" : "asc";
    this.emit("squadreport", null);
  }

  /**
   * Opens Squad Ranking, computing this view's up/down arrows by diffing the
   * freshly-ranked squad (engine/form.js's rankSquadByForm) against
   * `lastRanks` — whatever the ranking was the *previous* time this overlay
   * was opened (empty the very first time, so every arrow reads "same").
   * Computed here (a mutator) rather than in the renderer because comparing
   * against and then overwriting `lastRanks` is a real state mutation, not a
   * pure read — the project's "no logic in UI files" rule.
   */
  openSquadRanking() {
    const s = this.state.ui.squadRanking;
    const ranked = rankSquadByForm(this.state.squad.roster);
    const arrows = {};
    const newRanks = {};
    for (const { player, rank } of ranked) {
      const prev = s.lastRanks[player.id];
      arrows[player.id] = prev == null || prev === rank ? "same" : prev > rank ? "up" : "down";
      newRanks[player.id] = rank;
    }
    s.arrows = arrows;
    s.lastRanks = newRanks;
    this.openOverlay("squadranking");
  }

  /* ----- M11 (ui/kitnumbersui.js): Squad ▸ Kit Numbers ----- */

  openKitNumbers() {
    const k = this.state.ui.kitNumbers;
    k.changes = {};
    k.editing = false;
    const first = this.state.squad.roster[0];
    k.selectedPlayerId = first ? first.id : null;
    this.openOverlay("kitnumbers");
  }

  /** Click an unselected row to select it; click the already-selected row
   * again to enter edit mode (reveals the ◄/► steppers) — same "click again
   * to go one level deeper" convention as Squad List -> Player Bio. */
  selectOrEditKitNumberPlayer(playerId) {
    const k = this.state.ui.kitNumbers;
    if (k.selectedPlayerId === playerId) k.editing = true;
    else { k.selectedPlayerId = playerId; k.editing = false; }
    this.emit("kitnumbers", null);
  }

  /** Steps the selected player's kit number by `delta` (±1), skipping any
   * number already worn by another squad player (real squads never share a
   * number) and wrapping 1..99. Records the player's pre-edit number the
   * first time they're touched this session so the side panel's diff always
   * reads "original -> current", not just the last single step. */
  adjustKitNumber(delta) {
    const k = this.state.ui.kitNumbers;
    if (!k.editing || k.selectedPlayerId == null) return;
    const player = this.state.playersById.get(k.selectedPlayerId);
    if (!player) return;
    const taken = new Set(this.state.squad.roster.filter((p) => p.id !== player.id).map((p) => p.kitNumber));

    if (!(player.id in k.changes)) k.changes[player.id] = player.kitNumber;
    let n = player.kitNumber;
    do {
      n = ((n - 1 + delta + 99) % 99) + 1;
    } while (taken.has(n) && n !== player.kitNumber);
    player.kitNumber = n;
    this.emit("kitnumbers", null);
  }

  /* ----- config/tactics.js: Squad ▸ Team Sheet ▸ TACTICS/ROLES tabs. M11
   * built these as a standalone overlay (ui/tacticsui.js); F2 (plan2.md)
   * retired that overlay and moved both onto the Team Sheet's own tab bar —
   * see plan2-decisions.md F2 for why (the pic showed a D-pad-icon assigned-
   * tactics grid, not the "3 preset bars" plan2.md's own summary text
   * guessed). These 3 mutators are unchanged from M11; only their `emit`
   * target moved from "tactics" to "teamsheet". ----- */

  /** Picks the active tactic preset — real effect: engine/sim/core.js's
   * teamStrength() picks up the new modifier the very next time the user's
   * club plays (interactive league match or a quick-simmed cup/continental
   * tie), no re-sim of anything already resolved. */
  setTactic(tacticId) {
    this.state.squad.tacticId = tacticId;
    this.emit("teamsheet", null);
  }

  setCaptain(playerId) {
    this.state.squad.captainId = playerId;
    applyCaptainToLineup(this.state.squad.lineup, playerId);
    this.emit("teamsheet", null);
  }

  setPenaltyTaker(playerId) {
    this.state.squad.penaltyTakerId = playerId;
    this.emit("teamsheet", null);
  }

  /* ----- F1 (ui/teamsheetui.js): Team Sheet view (Squad hub's team-sheet
   * tile) — the SQUAD tab only; FORMATIONS/TACTICS/ROLES render the sub-tab
   * bar entry but no body until F2. ----- */

  /** Opens the Team Sheet view, optionally switching the active sheet first
   * — the hub tile's per-sheet carousel pages each carry their own
   * sheetIndex, and clicking one both views *and* activates it (editing a
   * sheet you're not looking at wouldn't make sense; see plan2-decisions.md
   * F1 for why there's no separate "set active" step). `tab` (F2, plan2.md):
   * the Squad hub's Formations/Tactics/Player Roles tile pages deep-link
   * straight into that sub-tab instead of always landing on SQUAD. */
  openTeamSheet(sheetIndex, tab = "squad") {
    if (sheetIndex != null) this.setActiveSheet(sheetIndex);
    this.state.ui.teamSheet = {
      tab,
      changeView: 0,
      drawer: "collapsed",
      drawerMinimized: false,
      focus: { zone: "xi", index: 0 },
      armed: null,
      suggested: null,
      attrPage: 0,
      formationsCursor: 0,
      formationsScrollRow: 0,
      customiseMode: null,
      customiseMenuCursor: 0,
      instrFocusIndex: 0,
      instrEditingIndex: null,
      instrCategoryIndex: 0,
      posFocusIndex: 0,
      tacticsCursor: 0,
      rolesCursor: 0,
      rolesPickerOpen: false,
      rolesPickerFocusId: null,
    };
    if (tab === "tactics") {
      const i = TACTICS.findIndex((t) => t.id === this.state.squad.tacticId);
      this.state.ui.teamSheet.tacticsCursor = i === -1 ? 0 : i;
    }
    this.openOverlay("teamsheet");
  }

  /** Makes `index` the sheet Team Sheet edits and matches use (engine/sim/
   * lineup.js's resolveUserXI reads state.squad.lineup directly) — repoints
   * the mirror fields at the sheet's own arrays, no copying. */
  setActiveSheet(index) {
    const squad = this.state.squad;
    if (index < 0 || index >= squad.sheets.length) return;
    squad.activeSheetIndex = index;
    const sheet = squad.sheets[index];
    squad.lineup = sheet.lineup;
    squad.bench = sheet.bench;
    squad.formationLabel = sheet.formationLabel;
    squad.formationStyle = sheet.formationStyle;
    squad.instructions = sheet.instructions;
  }

  /** Hub tile's "Select To Create A New Team Sheet" page — clones the
   * active sheet (formation + XI + bench + F2's per-player instructions),
   * caps at 6 (plan2.md F1.7's "6-slot carousel"), and immediately
   * opens+activates the new copy. */
  createTeamSheet() {
    const squad = this.state.squad;
    if (squad.sheets.length >= 6) return;
    const active = squad.sheets[squad.activeSheetIndex];
    const clone = {
      id: squad.nextSheetId++,
      name: `Team Sheet ${squad.sheets.length + 1}`,
      formationLabel: active.formationLabel,
      formationStyle: active.formationStyle,
      lineup: active.lineup.map((l) => ({ ...l })),
      bench: [...active.bench],
      instructions: JSON.parse(JSON.stringify(active.instructions || {})),
    };
    squad.sheets.push(clone);
    this.openTeamSheet(squad.sheets.length - 1);
  }

  teamSheetSetTab(tab) {
    if (["squad", "formations", "tactics", "roles"].indexOf(tab) === -1) return;
    const ts = this.state.ui.teamSheet;
    ts.tab = tab;
    // F2: landing on TACTICS should highlight whichever preset is actually
    // active, not always default to the grid's first cell.
    if (tab === "tactics") {
      const i = TACTICS.findIndex((t) => t.id === this.state.squad.tacticId);
      ts.tacticsCursor = i === -1 ? 0 : i;
    }
    this.emit("teamsheet", null);
  }

  /* ----- F2 (plan2.md): FORMATIONS tab. `formationsCursor` is an absolute
   * index into config/formations.js's 34-cell gridCells() list (not a
   * page-relative one) — [PIC-GUESS] (plan2-decisions.md F2): the 6
   * FORMATIONS_PAGE pics show a scrollbar thumb, not an LB/RB page prompt in
   * the footer, so this reads as a scrolling 3-column list (arrow keys walk
   * cell-by-cell, auto-revealing the next 6-cell "page" ui/formationsui.js
   * windows around the cursor) rather than shoulder-button-paged pages. ----- */

  teamSheetFormationsFocus(index) {
    const ts = this.state.ui.teamSheet;
    ts.formationsCursor = index;
    this.emit("teamsheet", null);
  }

  /** delta: ±1 (Left/Right) or ±3 (Up/Down, the grid's own column count).
   * Auto-scrolls formationsScrollRow to keep the cursor's row inside the
   * 2-row visible window (F2-fixes: previously the window only ever jumped
   * in whole 6-cell pages, so arrow-key paging past cell 5 skipped straight
   * to cell 6-11 with nothing in between). */
  teamSheetFormationsMove(delta) {
    const ts = this.state.ui.teamSheet;
    const total = FORMATIONS.length + 1; // +1 for the "<Club>/Default Formation" pseudo-cell
    ts.formationsCursor = Math.max(0, Math.min(total - 1, ts.formationsCursor + delta));
    const cursorRow = Math.floor(ts.formationsCursor / 3);
    if (cursorRow < ts.formationsScrollRow) ts.formationsScrollRow = cursorRow;
    else if (cursorRow > ts.formationsScrollRow + 1) ts.formationsScrollRow = cursorRow - 1;
    this.emit("teamsheet", null);
  }

  /** Mouse-wheel scroll (core/router.js): moves the grid's visible window by
   * one row without touching formationsCursor — a real user can scroll past
   * the cursor's row to preview formations before clicking one, same as any
   * scrollable list (F2-fixes: no wheel support existed at all before this,
   * and the window was hard-pinned to 6-cell page boundaries). */
  teamSheetFormationsScroll(dir) {
    const ts = this.state.ui.teamSheet;
    const total = FORMATIONS.length + 1;
    const totalRows = Math.ceil(total / 3);
    const maxScrollRow = Math.max(0, totalRows - 2);
    ts.formationsScrollRow = Math.max(0, Math.min(maxScrollRow, ts.formationsScrollRow + (dir > 0 ? 1 : -1)));
    this.emit("teamsheet", null);
  }

  /** (A)/click a FORMATIONS grid cell: re-maps the current XI onto the
   * chosen formation's 11 slots by best-fit position (plan2.md F2.1) and
   * makes it this sheet's formation. */
  teamSheetFormationsSelect() {
    const ts = this.state.ui.teamSheet;
    const cell = gridCellAt(this.state.club.name, ts.formationsCursor);
    if (!cell) return;
    this.applyFormation(cell.name, cell.style);
  }

  /** Re-maps the XI onto `name`/`style`'s 11 slots and stores it as the
   * active sheet's formation — also re-seeds every slot's Player Positioning
   * baseline (config/formations.js's remapLineupToFormation doesn't carry
   * position offsets across a formation change; a fresh shape needs a fresh
   * baseline). Keeps `entry.name`/`entry.rating` intact (spread from the
   * pre-remap entry) since ui/render.js's Squad-hub pitch preview reads
   * those denormalized fields directly rather than looking the player up. */
  applyFormation(name, style) {
    const formation = formationByLabel(name, style);
    if (!formation) return;
    const squad = this.state.squad;
    const newLineup = remapLineupToFormation(squad.lineup, formation.slots, this.state.playersById);
    seedFormationBaseline(newLineup);
    applyCaptainToLineup(newLineup, squad.captainId);
    squad.lineup = newLineup;
    squad.formationLabel = name;
    squad.formationStyle = style;
    const sheet = squad.sheets[squad.activeSheetIndex];
    sheet.lineup = newLineup;
    sheet.formationLabel = name;
    sheet.formationStyle = style;
    this.emit("teamsheet", null);
  }

  teamSheetOpenCustomise() {
    const ts = this.state.ui.teamSheet;
    ts.customiseMode = "menu";
    ts.customiseMenuCursor = 0;
    this.emit("teamsheet", null);
  }

  teamSheetCustomiseMenuFocus(index) {
    const ts = this.state.ui.teamSheet;
    ts.customiseMenuCursor = index;
    this.emit("teamsheet", null);
  }

  /** F2-fixes: entering Instructions/Positioning always starts the pitch
   * ring fresh at slot 0 rather than wherever a *previous* visit last left
   * instrFocusIndex/posFocusIndex/attrPage — without this reset, the gold
   * ring (and right-panel attribute page) stayed stuck on whichever player
   * was last edited, which read as a stale/broken cursor. */
  teamSheetCustomiseMenuSelect() {
    const ts = this.state.ui.teamSheet;
    ts.customiseMode = ts.customiseMenuCursor === 0 ? "instructions" : "positioning";
    ts.instrEditingIndex = null;
    ts.instrFocusIndex = 0;
    ts.posFocusIndex = 0;
    ts.attrPage = 0;
    this.emit("teamsheet", null);
  }

  /* --- Player Instructions (FORMATIONS > EDIT > INSTRUCTIONS) --- */

  teamSheetInstrFocus(index) {
    const ts = this.state.ui.teamSheet;
    if (ts.customiseMode !== "instructions" || ts.instrEditingIndex != null) return;
    ts.instrFocusIndex = index;
    this.emit("teamsheet", null);
  }

  /** (A)/click the focused player: opens their instruction category cards.
   * [JUDGMENT CALL] (plan2-decisions.md F2): a no-op for a position with no
   * instruction group (config/instructions.js's own "defensive positions get
   * none — matches pics") rather than a screen with nothing to show. */
  teamSheetInstrSelect() {
    const ts = this.state.ui.teamSheet;
    if (ts.customiseMode !== "instructions" || ts.instrEditingIndex != null) return;
    const entry = this.state.squad.lineup[ts.instrFocusIndex];
    if (!entry || entry.gk || !instructionGroupFor(entry.pos)) return;
    ts.instrEditingIndex = ts.instrFocusIndex;
    ts.instrCategoryIndex = 0;
    this.emit("teamsheet", null);
  }

  teamSheetInstrCategoryFocus(index) {
    const ts = this.state.ui.teamSheet;
    if (ts.instrEditingIndex == null) return;
    ts.instrCategoryIndex = index;
    this.emit("teamsheet", null);
  }

  /** (R) on the active category card: cycles that category's option for the
   * player currently being edited. */
  teamSheetInstrCycleOption(dir = 1) {
    const ts = this.state.ui.teamSheet;
    if (ts.instrEditingIndex == null) return;
    const entry = this.state.squad.lineup[ts.instrEditingIndex];
    const group = entry && instructionGroupFor(entry.pos);
    const cats = group && INSTRUCTION_GROUPS[group];
    if (!cats || !cats.length) return;
    const cat = cats[Math.min(ts.instrCategoryIndex, cats.length - 1)];
    const squad = this.state.squad;
    if (!squad.instructions[entry.playerId]) squad.instructions[entry.playerId] = defaultInstructionsFor(group);
    const picks = squad.instructions[entry.playerId];
    const cur = picks[cat.key] != null ? picks[cat.key] : cat.defaultIndex;
    picks[cat.key] = (cur + dir + cat.options.length) % cat.options.length;
    this.emit("teamsheet", null);
  }

  /** (X) Reset All Instructions: footer text is literal — clears every
   * player's picks team-wide, not just the one being edited (plan2-
   * decisions.md F2 [JUDGMENT CALL]: ms_..._INSTRUCTIONS pics' own label has
   * no "for this player" qualifier). */
  teamSheetInstrResetAll() {
    this.state.squad.instructions = {};
    this.state.squad.sheets[this.state.squad.activeSheetIndex].instructions = this.state.squad.instructions;
    this.emit("teamsheet", null);
  }

  /* --- Player Positioning (FORMATIONS > EDIT > POSITIONING) --- */

  teamSheetPosFocus(index) {
    const ts = this.state.ui.teamSheet;
    if (ts.customiseMode !== "positioning") return;
    ts.posFocusIndex = index;
    this.emit("teamsheet", null);
  }

  /** Arrow-nudge (or mouse-drag delta, both funnel through this) the focused
   * player within a ±8% x/y clamp of their formation-assigned baseline
   * (plan2.md F2.2 "Player Positioning ... ±8% x/y clamp"). */
  teamSheetPosNudge(dx, dy) {
    const ts = this.state.ui.teamSheet;
    if (ts.customiseMode !== "positioning") return;
    const entry = this.state.squad.lineup[ts.posFocusIndex];
    if (!entry) return;
    const baseX = entry.baseX != null ? entry.baseX : entry.x;
    const baseY = entry.baseY != null ? entry.baseY : entry.y;
    entry.x = Math.max(baseX - 8, Math.min(baseX + 8, Math.max(2, Math.min(98, entry.x + dx))));
    entry.y = Math.max(baseY - 8, Math.min(baseY + 8, Math.max(4, Math.min(96, entry.y + dy))));
    this.emit("teamsheet", null);
  }

  /** (X) Reset Changes: owner correction (plan2-decisions.md F2-fixes) —
   * overrides this milestone's original per-player [JUDGMENT CALL] reading
   * of the pic's footer label. Resets the whole XI back to the active
   * formation's default layout (every slot's baseX/baseY, seeded by
   * applyFormation/seedFormationBaseline whenever a formation is applied),
   * not just the focused player. */
  teamSheetPosReset() {
    const ts = this.state.ui.teamSheet;
    if (ts.customiseMode !== "positioning") return;
    for (const entry of this.state.squad.lineup) {
      if (entry.baseX != null) entry.x = entry.baseX;
      if (entry.baseY != null) entry.y = entry.baseY;
    }
    this.emit("teamsheet", null);
  }

  /* ----- F2: TACTICS tab ----- */

  teamSheetTacticsFocus(index) {
    const ts = this.state.ui.teamSheet;
    ts.tacticsCursor = index;
    this.emit("teamsheet", null);
  }

  /** (A)/click a D-pad tactic cell: makes it the active in-match tactic
   * (reuses the existing M11 setTactic mutator/effect unchanged). */
  teamSheetTacticsSelect() {
    const ts = this.state.ui.teamSheet;
    const t = TACTICS[ts.tacticsCursor];
    if (t) this.setTactic(t.id);
  }

  /* ----- F2: ROLES tab ----- */

  teamSheetRolesFocus(index) {
    const ts = this.state.ui.teamSheet;
    ts.rolesCursor = index;
    this.emit("teamsheet", null);
  }

  /** F2-fixes: seeds rolesPickerFocusId at whoever already holds this role
   * (falling back to the roster's first player) so the picker's right pane
   * shows a player's attributes immediately on open, matching the SQUAD
   * tab's own "always something focused" convention. */
  teamSheetRolesOpenPicker() {
    const ts = this.state.ui.teamSheet;
    ts.rolesPickerOpen = true;
    const field = ROLE_FIELDS[ts.rolesCursor];
    const curId = field ? this.state.squad[field] : null;
    const roster = this.state.squad.roster;
    ts.rolesPickerFocusId = curId != null ? curId : (roster.length ? roster[0].id : null);
    ts.attrPage = 0;
    this.emit("teamsheet", null);
  }

  teamSheetRolesClosePicker() {
    const ts = this.state.ui.teamSheet;
    ts.rolesPickerOpen = false;
    ts.rolesPickerFocusId = null;
    this.emit("teamsheet", null);
  }

  /** F2-fixes: mouse-hover (or Up/Down) over a picker row — mirrors
   * teamSheetFocus's same-value no-op guard (its own header explains why:
   * re-rendering under a stationary mouse would otherwise re-fire mousemove
   * forever). Drives both the row's gold outline and the right-pane
   * attribute panel (teamSheetChangeAttrPage's own "roles" branch). */
  teamSheetRolesPickerFocus(playerId) {
    const ts = this.state.ui.teamSheet;
    if (!ts.rolesPickerOpen || ts.rolesPickerFocusId === playerId) return;
    ts.rolesPickerFocusId = playerId;
    this.emit("teamsheet", null);
  }

  /** Assigns `playerId` to whichever of the 6 PLAYER ROLES grid cells is
   * currently focused (order matches the pic's 3x2 reading order: Captain,
   * Left Corner, Right Corner, Short Free Kick, Penalties, Long Free Kick).
   * Closing the picker (back to the grid) also drops back to the team
   * medallion right-panel — see ui/rolestacticsui.js's renderRolesTab. */
  teamSheetRolesPick(playerId) {
    const ts = this.state.ui.teamSheet;
    const field = ROLE_FIELDS[ts.rolesCursor];
    if (!field) return;
    if (field === "captainId") this.setCaptain(playerId);
    else if (field === "penaltyTakerId") this.setPenaltyTaker(playerId);
    else this.state.squad[field] = playerId;
    ts.rolesPickerOpen = false;
    ts.rolesPickerFocusId = null;
    this.emit("teamsheet", null);
  }

  /** LS / key V: cycles the pitch's 3 jersey-caption modes (plan2.md F1.2).
   * F2: also available on the FORMATIONS tab's own pitch preview in the two
   * states that show an (LS) Change View footer prompt (Instructions'
   * plain-browsing state and Positioning — ms_..._PLAYER_INSTRUCTIONS.png /
   * ms_..._PLAYER_POSITIONING.png both list it; the FORMATIONS grid and
   * Instructions' category-editing state don't). */
  teamSheetChangeView(dir = 1) {
    const ts = this.state.ui.teamSheet;
    const eligible = ts.tab === "squad"
      || (ts.tab === "formations" && ts.customiseMode === "instructions" && ts.instrEditingIndex == null)
      || (ts.tab === "formations" && ts.customiseMode === "positioning");
    if (!eligible) return;
    ts.changeView = (ts.changeView + dir + 3) % 3;
    this.emit("teamsheet", null);
  }

  /** Moves the teal "currently-viewed" ring — mouse hover and keyboard
   * arrow-navigation both call this (a swap only ever executes from
   * teamSheetSelectPlayer, i.e. an explicit (A)/click — see that method's
   * own header). Doesn't touch `armed`: browsing around while a swap is in
   * progress is just looking, per every SELECT_PLAYER* pic. */
  teamSheetFocus(zone, index) {
    const ts = this.state.ui.teamSheet;
    if (ts.tab !== "squad") return;
    if (sameSlot(ts.focus, { zone, index })) return; // no-op: renderTeamSheet replaces
    // #sqts-body's innerHTML on every "teamsheet" emit, which would put a
    // freshly-created element under a *stationary* mouse pointer — the
    // browser fires a new mouseover for it, re-triggering this method, in an
    // infinite loop. Skipping the redundant emit here is what breaks it.
    if (zone !== "xi" && teamSheetSlotPlayerId(this.state, { zone, index }) == null) return;
    ts.focus = { zone, index };
    this.emit("teamsheet", null);
  }

  /**
   * (A) Select Player: first press on a filled slot arms it (teal ring,
   * matches ms_TEAM_SHEET_VIEW_SELECT_PLAYER.png); pressing the same slot
   * again cancels; pressing a *different* slot swaps the two
   * (teamSheetSwap) and clears the armed state. No-op on an empty slot
   * (nothing to arm) or while a non-SQUAD tab is showing.
   *
   * F1-fixes: also drives the drawer's overlay/minimize behaviour — arming a
   * slot *inside* the open drawer (bench/reserve/suggested, i.e. not "xi")
   * minimizes it back to a bar so the pitch is visible to pick the other
   * half of the swap; arming an XI slot (Suggested Subs' own flow, or a
   * manual pitch-first pick) leaves the drawer fully expanded since the
   * drawer's own list *is* where the next click needs to land. Clearing
   * `armed` (cancel or a completed swap) always un-minimizes.
   */
  teamSheetSelectPlayer() {
    const ts = this.state.ui.teamSheet;
    if (ts.tab !== "squad") return;
    if (!ts.armed) {
      if (teamSheetSlotPlayerId(this.state, ts.focus) == null) return;
      ts.armed = { ...ts.focus };
      ts.drawerMinimized = ts.drawer !== "collapsed" && ts.focus.zone !== "xi";
      this.emit("teamsheet", null);
      return;
    }
    if (sameSlot(ts.armed, ts.focus)) {
      ts.armed = null;
      ts.drawerMinimized = false;
      if (ts.suggested) { ts.suggested = null; ts.drawer = "substitutes"; }
      this.emit("teamsheet", null);
      return;
    }
    teamSheetSwap(this.state, ts.armed, ts.focus);
    ts.armed = null;
    ts.drawerMinimized = false;
    if (ts.suggested) { ts.suggested = null; ts.drawer = "substitutes"; }
    this.emit("teamsheet", null);
  }

  /** Mouse equivalent of "move the cursor here, then press (A)" — hover
   * (teamSheetFocus) already tracks the pointer continuously, so a click
   * both focuses and activates in the one gesture real hardware needs two
   * inputs for. */
  teamSheetActivateSlot(zone, index) {
    const ts = this.state.ui.teamSheet;
    if (ts.tab !== "squad") return;
    if (teamSheetSlotPlayerId(this.state, { zone, index }) == null) return;
    ts.focus = { zone, index };
    this.teamSheetSelectPlayer();
  }

  /** Bottom drawer: collapsed -> Substitutes -> Reserves -> collapsed
   * (plan2.md F1.3). No-op while the Suggested Subs list is showing — (B)
   * is the way out of that (teamSheetBack), not the drawer bar.
   *
   * F1-fixes: while the drawer is minimized (arming a bench/reserve slot
   * shrunk it back to a bar so the pitch is visible — see
   * teamSheetSelectPlayer), clicking the bar again is the documented way to
   * peek the full list back open without disturbing the arm or cycling to
   * the next drawer type; only a *second* bar-click (once already expanded)
   * advances collapsed -> substitutes -> reserves as before. */
  teamSheetToggleDrawer() {
    const ts = this.state.ui.teamSheet;
    if (ts.tab !== "squad" || ts.drawer === "suggested") return;
    if (ts.drawer !== "collapsed" && ts.drawerMinimized) {
      ts.drawerMinimized = false;
      this.emit("teamsheet", null);
      return;
    }
    const order = ["collapsed", "substitutes", "reserves"];
    ts.drawer = order[(order.indexOf(ts.drawer) + 1) % order.length];
    ts.drawerMinimized = false;
    this.emit("teamsheet", null);
  }

  /**
   * (Y) Suggested Subs: arms the focused XI slot (same visual state as a
   * manual (A) pick) and swaps the drawer to a ranked candidate list — same-
   * position first, then altPositions, then best OVR*fitness*form
   * (js/config/managerai.js, ported from managerai.ini's
   * [MAI_TOTAL_SCORE_1ST_11]) — auto-focusing the top candidate exactly like
   * ms_TEAM_SHEET_VIEW_SUGGESTED_SUBS.png (Westcarr pre-highlighted, gold
   * ring + swap icon). Empty pool -> ms_..._NO_SIMILAR.png's "No similar
   * players available." (armed stays set so (A)/(B) still behave sensibly).
   */
  teamSheetSuggestedSubs() {
    const ts = this.state.ui.teamSheet;
    if (ts.tab !== "squad" || ts.focus.zone !== "xi") return;
    const slotEntry = this.state.squad.lineup[ts.focus.index];
    if (!slotEntry) return;
    const squad = this.state.squad;
    const pool = [...squad.bench, ...teamSheetReserves(this.state).map((p) => p.id)]
      .filter((id) => id != null)
      .map((id) => this.state.playersById.get(id));
    const candidates = pool
      .filter((p) => isSimilarPosition(p, slotEntry.pos))
      .sort((a, b) => suggestedSubScore(b, slotEntry.pos) - suggestedSubScore(a, slotEntry.pos));

    ts.armed = { ...ts.focus };
    ts.drawerMinimized = false; // arms an XI slot — the candidate list stays fully expanded
    ts.suggested = { forZone: ts.focus.zone, forIndex: ts.focus.index, candidateIds: candidates.map((p) => p.id) };
    ts.drawer = "suggested";
    if (candidates.length) {
      const loc = teamSheetLocate(this.state, candidates[0].id);
      if (loc) ts.focus = loc;
    }
    this.emit("teamsheet", null);
  }

  /** (B)/Esc — steps back through Team Sheet's own nested modes (suggested
   * subs -> armed selection -> open drawer, or F2's FORMATIONS/ROLES
   * breadcrumb depth) before finally closing the overlay, same "cancel the
   * innermost thing first" convention as negotiation/matchday's own
   * closeX() overrides. */
  teamSheetBack() {
    const ts = this.state.ui.teamSheet;
    if (ts.tab === "formations") {
      if (ts.instrEditingIndex != null) { ts.instrEditingIndex = null; this.emit("teamsheet", null); return; }
      if (ts.customiseMode === "instructions" || ts.customiseMode === "positioning") {
        ts.customiseMode = "menu";
        // F2-fixes: same "clear the stale cursor" reasoning as
        // teamSheetCustomiseMenuSelect's own comment — leaving either screen
        // shouldn't leave a gold ring parked on a player for the *next* visit.
        ts.instrFocusIndex = 0;
        ts.posFocusIndex = 0;
        ts.attrPage = 0;
        this.emit("teamsheet", null);
        return;
      }
      if (ts.customiseMode === "menu") {
        ts.customiseMode = null;
        this.emit("teamsheet", null);
        return;
      }
      this.closeOverlay();
      return;
    }
    if (ts.tab === "roles") {
      if (ts.rolesPickerOpen) { ts.rolesPickerOpen = false; this.emit("teamsheet", null); return; }
      this.closeOverlay();
      return;
    }
    if (ts.tab === "tactics") { this.closeOverlay(); return; }
    ts.drawerMinimized = false; // every branch below is "reveal more", never less
    if (ts.drawer === "suggested") {
      ts.suggested = null;
      ts.armed = null;
      ts.drawer = "substitutes";
      this.emit("teamsheet", null);
      return;
    }
    if (ts.armed) {
      ts.armed = null;
      this.emit("teamsheet", null);
      return;
    }
    if (ts.drawer !== "collapsed") {
      ts.drawer = "collapsed";
      this.emit("teamsheet", null);
      return;
    }
    this.closeOverlay();
  }

  /** (RS) attribute-panel page cycling — GK slots get a 5th "GK Attributes"
   * page ahead of the other 4 (plan2.md §B4). F2: reused (same ts.attrPage
   * field) by the FORMATIONS tab's own single-player attribute panel
   * (ui/formationsui.js's renderPlayerAttrPanel) in Instructions' plain-
   * browsing state and Positioning — resolves whichever player is relevant
   * to whichever tab/mode is currently showing. */
  teamSheetChangeAttrPage(dir = 1) {
    const ts = this.state.ui.teamSheet;
    let player = null;
    if (ts.tab === "squad") {
      player = teamSheetSlotPlayer(this.state, ts.focus);
    } else if (ts.tab === "formations" && ts.customiseMode === "instructions" && ts.instrEditingIndex == null) {
      const entry = this.state.squad.lineup[ts.instrFocusIndex];
      player = entry ? this.state.playersById.get(entry.playerId) : null;
    } else if (ts.tab === "formations" && ts.customiseMode === "positioning") {
      const entry = this.state.squad.lineup[ts.posFocusIndex];
      player = entry ? this.state.playersById.get(entry.playerId) : null;
    } else if (ts.tab === "roles" && ts.rolesPickerOpen) {
      player = ts.rolesPickerFocusId != null ? this.state.playersById.get(ts.rolesPickerFocusId) : null;
    } else {
      return;
    }
    const count = player && positionInfo(player.position).area === "GK" ? 5 : 4;
    ts.attrPage = (ts.attrPage + dir + count) % count;
    this.emit("teamsheet", null);
  }

  /* ----- M11 (ui/statsui.js): Season ▸ Team Stats / Player Stats ----- */

  openTeamStats() {
    const s = this.state.ui.teamStats;
    const leagues = this.state.staticData.leagues;
    s.leagueIndex = Math.max(0, leagues.findIndex((l) => l.id === this.state.league.id));
    s.view = "select";
    s.clubId = null;
    this.openOverlay("teamstats");
  }

  teamStatsChangeLeague(dir) {
    const s = this.state.ui.teamStats;
    const leagues = this.state.staticData.leagues;
    s.leagueIndex = (s.leagueIndex + dir + leagues.length) % leagues.length;
    s.view = "select";
    s.clubId = null;
    this.emit("teamstats", null);
  }

  teamStatsSelectClub(clubId) {
    const s = this.state.ui.teamStats;
    s.clubId = clubId;
    s.view = "team";
    this.emit("teamstats", null);
  }

  /** L2/R2: cycles the selected club within the current league without
   * returning to the select-a-team list (matches the reference screen's own
   * "L2 R2 {club name}" header on the team-selected view). */
  teamStatsChangeClub(dir) {
    const s = this.state.ui.teamStats;
    const league = this.state.staticData.leagues[s.leagueIndex];
    const clubs = this.state.staticData.clubs
      .filter((c) => (this.state.clubLeague.get(c.id) ?? c.leagueId) === league.id)
      .sort((a, b) => a.name.localeCompare(b.name));
    const idx = clubs.findIndex((c) => c.id === s.clubId);
    s.clubId = clubs[(idx + dir + clubs.length) % clubs.length].id;
    this.emit("teamstats", null);
  }

  teamStatsBackToSelect() {
    this.state.ui.teamStats.view = "select";
    this.emit("teamstats", null);
  }

  toggleTeamStatsSort() {
    const s = this.state.ui.teamStats;
    s.sortDir = s.sortDir === "asc" ? "desc" : "asc";
    this.emit("teamstats", null);
  }

  openPlayerStats() {
    const s = this.state.ui.playerStats;
    const leagues = this.state.staticData.leagues;
    s.leagueIndex = Math.max(0, leagues.findIndex((l) => l.id === this.state.league.id));
    s.category = "topScorers";
    this.openOverlay("playerstats");
  }

  playerStatsChangeLeague(dir) {
    const s = this.state.ui.playerStats;
    const leagues = this.state.staticData.leagues;
    s.leagueIndex = (s.leagueIndex + dir + leagues.length) % leagues.length;
    this.emit("playerstats", null);
  }

  playerStatsChangeCategory(dir) {
    const categories = ["topScorers", "assists", "cleanSheets", "yellowCards", "redCards"];
    const s = this.state.ui.playerStats;
    const i = categories.indexOf(s.category);
    s.category = categories[(i + dir + categories.length) % categories.length];
    this.emit("playerstats", null);
  }

  /* ----- M11 (config/settings.js, ui/settingsui.js): Office ▸ Settings ----- */

  openSettings() {
    this.openOverlay("settings");
  }

  /** Real effect: engine/sim/match.js's regenerateSegment and engine/comps/
   * cup.js's/continental.js's quick-sim call sites all add this to the
   * user's own tactic modifier (plan1.md: "difficulty setting scales user
   * team strength ±3%"). */
  setDifficulty(id) {
    this.state.settings.difficulty = id;
    this.emit("settings", null);
  }

  /** Real effect: core/format.js's money() default (every existing call
   * site across the UI, not just Settings itself). */
  setCurrency(code) {
    this.state.settings.currency = code;
    setDisplayCurrency(code);
    this.emit("settings", null);
    this.emit("advance", null); // cheap way to refresh every screen's money() displays immediately
  }

  setAutosave(enabled) {
    this.state.settings.autosave = enabled;
    this.emit("settings", null);
  }

  /** Real effect: ui/matchday.js's live ticker feed hides "chance-miss"
   * flavour events when set to "key-events". */
  setSimDetail(id) {
    this.state.settings.simDetail = id;
    this.emit("settings", null);
  }

  /* ----- F3 (fable-plans/plan2.md): Player Search — PLAYER SEARCH filter
   * tiles -> SEARCH RESULTS (tabs/cards/report) -> action-menu playercard.
   * ui/searchui.js owns all rendering; computeSearchResults/buildActionRows
   * there are pure read-derivations (same footing as this file's own
   * teamSheetFocusableSlots export), everything below is the only thing
   * allowed to mutate state.ui.transferSearch. ----- */

  openTransferSearch() {
    const s = this.state.ui.transferSearch;
    s.stage = "filters";
    s.selectedPlayerId = null;
    s.actionMenuOpen = false;
    s.exchangePickerOpen = false;
    s.nameSearch.open = false;
    s.nationSearch.open = false;
    this.openOverlay("search");
  }

  searchFilterFocus(tile, sub = 0) {
    const s = this.state.ui.transferSearch;
    s.filterTile = Math.max(0, Math.min(7, tile));
    s.filterSub = sub;
    this.emit("search", null);
  }

  /* ----- F3-fixes: PLAYER NAME keyboard-overlay search
   * (ms_SEARCH_PLAYERS_SCREEN_EXAMPLE_PLAYER_NAME_SEARCH.png) — QWERTY grid
   * + live textbox + debounced (router.js) results table of every player in
   * the database, first or last name, alphabetical, 2-char minimum. ----- */

  searchOpenNameSearch() {
    const s = this.state.ui.transferSearch;
    s.nameSearch = { open: true, query: "", committedQuery: "", cursorRow: 0, cursorCol: 0, resultsFocus: false, resultIndex: 0 };
    this.emit("search", null);
  }

  searchCloseNameSearch() {
    this.state.ui.transferSearch.nameSearch.open = false;
    this.emit("search", null);
  }

  searchNameCursorMove(dRow, dCol) {
    const n = this.state.ui.transferSearch.nameSearch;
    const rowLens = [10, 9, 7];
    n.cursorRow = Math.max(0, Math.min(2, n.cursorRow + dRow));
    n.cursorCol = Math.max(0, Math.min(rowLens[n.cursorRow] - 1, n.cursorCol + dCol));
    this.emit("search", null);
  }

  searchNameType(letter) {
    const n = this.state.ui.transferSearch.nameSearch;
    if (n.query.length < 40) n.query += letter;
    n.resultsFocus = false;
    this.emit("search", null);
  }

  searchNameBackspace() {
    const n = this.state.ui.transferSearch.nameSearch;
    n.query = n.query.slice(0, -1);
    n.resultsFocus = false;
    this.emit("search", null);
  }

  /** Called by router.js's debounce timer once typing settles. */
  searchNameCommitQuery() {
    const n = this.state.ui.transferSearch.nameSearch;
    n.committedQuery = n.query;
    n.resultIndex = 0;
    this.emit("search", null);
  }

  searchNameSetResultsFocus(on) {
    const n = this.state.ui.transferSearch.nameSearch;
    n.resultsFocus = on;
    if (on) n.resultIndex = 0;
    this.emit("search", null);
  }

  searchNameMoveResult(delta, count) {
    const n = this.state.ui.transferSearch.nameSearch;
    if (count <= 0) return;
    n.resultIndex = Math.max(0, Math.min(count - 1, n.resultIndex + delta));
    this.emit("search", null);
  }

  /** Selecting a result fills all 8 PLAYER SEARCH tiles from that player's
   * own profile, closes the overlay, and auto-runs the search (§ "the y
   * button action") — plan2-decisions.md F3-fixes. */
  searchApplyNameResult(playerId) {
    const player = this.state.playersById.get(playerId);
    if (!player) return;
    const f = this.state.ui.transferSearch.filters;
    f.name = player.commonName;
    f.area = positionInfo(player.position).area;
    f.role = player.position;
    f.nationId = player.nationId;
    f.minAge = player.age;
    f.maxAge = player.age;
    const leagueId = player.clubId != null ? this.state.clubLeague.get(player.clubId) : null;
    const league = leagueId ? this.state.staticData.leagues.find((l) => l.id === leagueId) : null;
    f.country = league ? league.country : null;
    f.leagueId = leagueId || null;
    f.teamId = player.clubId != null ? player.clubId : null;
    this.state.ui.transferSearch.nameSearch.open = false;
    this.searchSubmitFilters();
  }

  /* ----- F3-fixes: NATIONALITY keyboard-overlay search — same keyboard
   * grid, but the results table is the (short, ~50-entry) nation list,
   * pre-filled before any typing and filtered live (no debounce, no
   * minimum length); selecting a nation just fills the one tile, no
   * auto-search. ----- */

  searchOpenNationSearch() {
    const s = this.state.ui.transferSearch;
    s.nationSearch = { open: true, query: "", cursorRow: 0, cursorCol: 0, resultsFocus: false, resultIndex: 0 };
    this.emit("search", null);
  }

  searchCloseNationSearch() {
    this.state.ui.transferSearch.nationSearch.open = false;
    this.emit("search", null);
  }

  searchNationCursorMove(dRow, dCol) {
    const n = this.state.ui.transferSearch.nationSearch;
    const rowLens = [10, 9, 7];
    n.cursorRow = Math.max(0, Math.min(2, n.cursorRow + dRow));
    n.cursorCol = Math.max(0, Math.min(rowLens[n.cursorRow] - 1, n.cursorCol + dCol));
    this.emit("search", null);
  }

  searchNationType(letter) {
    const n = this.state.ui.transferSearch.nationSearch;
    if (n.query.length < 40) n.query += letter;
    n.resultIndex = 0;
    n.resultsFocus = false;
    this.emit("search", null);
  }

  searchNationBackspace() {
    const n = this.state.ui.transferSearch.nationSearch;
    n.query = n.query.slice(0, -1);
    n.resultIndex = 0;
    n.resultsFocus = false;
    this.emit("search", null);
  }

  searchNationSetResultsFocus(on) {
    const n = this.state.ui.transferSearch.nationSearch;
    n.resultsFocus = on;
    if (on) n.resultIndex = 0;
    this.emit("search", null);
  }

  searchNationMoveResult(delta, count) {
    const n = this.state.ui.transferSearch.nationSearch;
    if (count <= 0) return;
    n.resultIndex = Math.max(0, Math.min(count - 1, n.resultIndex + delta));
    this.emit("search", null);
  }

  searchApplyNationResult(nationId) {
    this.state.ui.transferSearch.filters.nationId = nationId;
    this.state.ui.transferSearch.nationSearch.open = false;
    this.emit("search", null);
  }

  searchCycleArea(delta) {
    const f = this.state.ui.transferSearch.filters;
    const opts = ["ALL", ...AREAS];
    f.area = opts[(opts.indexOf(f.area) + delta + opts.length) % opts.length];
    if (f.role !== "ANY" && positionInfo(f.role).area !== f.area && f.area !== "ALL") f.role = "ANY";
    this.emit("search", null);
  }

  searchCycleRole(delta) {
    const f = this.state.ui.transferSearch.filters;
    const codes = f.area === "ALL" ? POSITION_CODES : POSITION_CODES.filter((c) => positionInfo(c).area === f.area);
    const opts = ["ANY", ...codes];
    f.role = opts[(opts.indexOf(f.role) + delta + opts.length) % opts.length];
    this.emit("search", null);
  }

  searchCycleStatus(delta) {
    const f = this.state.ui.transferSearch.filters;
    const opts = ["ANY", "LISTED", "LOAN", "EXPIRING", "FREE"];
    f.status = opts[(opts.indexOf(f.status) + delta + opts.length) % opts.length];
    this.emit("search", null);
  }

  /** MIN/MAX AGE: cyclical [Any, 16..50] list, each end bounded by the other
   * field so min can never exceed max (F3-fixes: "keep the same logic as
   * now so no weird overlaps" — same min<=max guarantee the old stepper
   * clamping gave, just expressed as a shared cyclical option list so
   * stepping past 50 or back below 16 wraps around through Any instead of
   * clamping dead at an edge). */
  searchAdjustMinAge(delta) {
    const f = this.state.ui.transferSearch.filters;
    const upper = f.maxAge || AGE_MAX;
    const opts = ageOptionList(AGE_MIN, upper);
    const idx = opts.indexOf(f.minAge);
    f.minAge = opts[((idx === -1 ? 0 : idx) + delta + opts.length) % opts.length];
    this.emit("search", null);
  }

  searchAdjustMaxAge(delta) {
    const f = this.state.ui.transferSearch.filters;
    const lower = f.minAge || AGE_MIN;
    const opts = ageOptionList(lower, AGE_MAX);
    const idx = opts.indexOf(f.maxAge);
    f.maxAge = opts[((idx === -1 ? 0 : idx) + delta + opts.length) % opts.length];
    this.emit("search", null);
  }

  /** COUNTRY: cyclical [Any, ...countries with a league in our data]. Setting
   * Any (or any other country) cascades LEAGUE/TEAM back to Any too, so a
   * stale league/team from a different country can never linger. */
  searchCycleCountry(delta) {
    const f = this.state.ui.transferSearch.filters;
    const countries = [...new Set(this.state.staticData.leagues.map((l) => l.country))].sort();
    const opts = [null, ...countries];
    f.country = opts[(opts.indexOf(f.country) + delta + opts.length) % opts.length];
    f.leagueId = null; f.teamId = null;
    this.emit("search", null);
  }

  /** LEAGUE: disabled/no-op until a COUNTRY is chosen; options are that
   * country's leagues only. */
  searchCycleLeague(delta) {
    const f = this.state.ui.transferSearch.filters;
    if (!f.country) return;
    const leagues = this.state.staticData.leagues
      .filter((l) => l.country === f.country)
      .sort((a, b) => a.name.localeCompare(b.name));
    const opts = [null, ...leagues.map((l) => l.id)];
    f.leagueId = opts[(opts.indexOf(f.leagueId) + delta + opts.length) % opts.length];
    f.teamId = null;
    this.emit("search", null);
  }

  /** TEAM: disabled/no-op until COUNTRY + LEAGUE are both chosen. */
  searchCycleTeam(delta) {
    const f = this.state.ui.transferSearch.filters;
    if (!f.country || !f.leagueId) return;
    const clubs = this.state.staticData.clubs
      .filter((c) => this.state.clubLeague.get(c.id) === f.leagueId)
      .sort((a, b) => a.name.localeCompare(b.name));
    const opts = [null, ...clubs.map((c) => c.id)];
    f.teamId = opts[(opts.indexOf(f.teamId) + delta + opts.length) % opts.length];
    this.emit("search", null);
  }

  searchResetFilters() {
    const s = this.state.ui.transferSearch;
    s.filters = { name: "", area: "ALL", role: "ANY", nationId: null, status: "ANY", minAge: 0, maxAge: 0, country: null, leagueId: null, teamId: null };
    this.emit("search", null);
  }

  /** Per-tile (X) reset (F3-fixes) — as opposed to the Start/Menu prompt's
   * searchResetFilters() above, which clears all 8 at once. Dual tiles
   * (POSITION/ROLE, MIN/MAX AGE) reset as one unit, matching how the 8 tiles
   * read visually even though each stacked row focuses independently. */
  searchResetTile(tile) {
    const f = this.state.ui.transferSearch.filters;
    switch (tile) {
      case 0: f.name = ""; break;
      case 1: f.area = "ALL"; f.role = "ANY"; break;
      case 2: f.nationId = null; break;
      case 3: f.status = "ANY"; break;
      case 4: f.minAge = 0; f.maxAge = 0; break;
      case 5: f.country = null; f.leagueId = null; f.teamId = null; break;
      case 6: f.leagueId = null; f.teamId = null; break;
      case 7: f.teamId = null; break;
      default: return;
    }
    this.emit("search", null);
  }

  searchSubmitFilters() {
    const s = this.state.ui.transferSearch;
    s.stage = "results";
    s.resultsTab = "ALL";
    s.selectedPlayerId = null;
    s.reportPage = 0;
    this.emit("search", null);
  }

  searchBackFromResults() {
    const s = this.state.ui.transferSearch;
    if (s.actionMenuOpen) { s.actionMenuOpen = false; this.emit("search", null); return; }
    s.stage = "filters";
    this.emit("search", null);
  }

  searchSetResultsTab(tab) {
    const s = this.state.ui.transferSearch;
    s.resultsTab = tab;
    s.selectedPlayerId = null;
    s.reportPage = 0;
    this.emit("search", null);
  }

  searchSelectResult(playerId) {
    const s = this.state.ui.transferSearch;
    s.selectedPlayerId = playerId;
    s.reportPage = 0;
    this.emit("search", null);
  }

  searchCycleReportPage(delta, pageCount) {
    const s = this.state.ui.transferSearch;
    s.reportPage = (s.reportPage + delta + pageCount) % pageCount;
    this.emit("search", null);
  }

  searchOpenActionMenu() {
    const s = this.state.ui.transferSearch;
    if (s.selectedPlayerId == null) return;
    s.actionMenuOpen = true;
    // Row 0 ("Ask <scout> to Scout...") is disabled whenever no idle scout
    // exists (ui/searchui.js's buildActionRows) — default the gold-selected
    // cursor to row 1 ("Add to My Shortlist", always enabled) rather than
    // landing on a disabled row with nothing (A) can do.
    s.actionMenuIndex = gtnEngine.cheapestIdleScout(this.state) ? 0 : 1;
    this.emit("search", null);
  }

  searchCloseActionMenu() {
    this.state.ui.transferSearch.actionMenuOpen = false;
    this.emit("search", null);
  }

  searchActionMenuFocus(index) {
    this.state.ui.transferSearch.actionMenuIndex = index;
    this.emit("search", null);
  }

  /** Shared by both Search Results and My Shortlist's action menus —
   * `action` is one of ask-scout/toggle-shortlist/enquire/approach-buy/
   * approach-loan/sign-free-agent (see ui/searchui.js's buildActionRows).
   * ask-scout's only failure mode (no idle scout) is already reflected as a
   * disabled, unclickable row before this is ever reached (buildActionRows'
   * own idleScout check), so its result isn't surfaced further here. */
  performPlayerAction(action, playerId) {
    if (playerId == null) return;
    switch (action) {
      case "ask-scout": gtnEngine.startPlayerScout(this.state, playerId); break;
      case "toggle-shortlist": this.toggleShortlistPlayer(playerId); return; // emits its own events
      case "enquire": enquiryEngine.submitEnquiry(this.state, playerId); break;
      case "approach-buy": this.startBid(playerId); return; // opens the negotiation overlay itself
      case "approach-loan": this.startLoanBid(playerId, "season"); return;
      case "sign-free-agent": this.startFreeAgentApproach(playerId); return;
      default: return;
    }
    this.emit("search", null);
    this.emit("shortlist", null);
  }

  /* ----- F3: My Shortlist ----- */

  toggleShortlistPlayer(playerId) {
    const list = this.state.transfers.shortlist;
    const st = this.state.ui.shortlist;
    const idx = list.findIndex((s) => s.playerId === playerId);
    if (idx >= 0) {
      list.splice(idx, 1);
      // Keep the My Shortlist screen's own selection sane even when a
      // player is removed from *outside* it (Search Results/Shortlist's own
      // action menu both call this) — renderMyShortlist reads
      // selectedPlayerId unconditionally whenever it re-renders, which
      // happens on every "shortlist" emit regardless of which overlay is
      // currently open (core/router.js's store.on("shortlist", ...)).
      if (st.selectedPlayerId === playerId) st.selectedPlayerId = list.length ? list[0].playerId : null;
    } else {
      list.push({ playerId, dateAdded: this.state.calendar.today });
      if (st.selectedPlayerId == null) st.selectedPlayerId = playerId;
    }
    this.emit("search", null);
    this.emit("shortlist", null);
  }

  openMyShortlist() {
    const st = this.state.ui.shortlist;
    const list = this.state.transfers.shortlist;
    st.selectedPlayerId = list.length ? list[0].playerId : null;
    st.actionMenuOpen = false;
    this.openOverlay("shortlist");
  }

  selectShortlistPlayer(playerId) {
    this.state.ui.shortlist.selectedPlayerId = playerId;
    this.emit("shortlist", null);
  }

  sortShortlist() {
    const st = this.state.ui.shortlist;
    st.sortDir = st.sortDir === "asc" ? "desc" : "asc";
    this.emit("shortlist", null);
  }

  shortlistOpenActionMenu() {
    const st = this.state.ui.shortlist;
    if (st.selectedPlayerId == null) return;
    st.actionMenuOpen = true;
    st.actionMenuIndex = gtnEngine.cheapestIdleScout(this.state) ? 0 : 1;
    this.emit("shortlist", null);
  }

  shortlistCloseActionMenu() {
    this.state.ui.shortlist.actionMenuOpen = false;
    this.emit("shortlist", null);
  }

  shortlistActionMenuFocus(index) {
    this.state.ui.shortlist.actionMenuIndex = index;
    this.emit("shortlist", null);
  }

  /* ----- M7/F3: Negotiation (fee talks -> contract talks, loans, free-agent
   * pre-contract approaches) — engine/negotiation.js + engine/freeagents.js
   * own the actual state machine; these methods just call into it and emit
   * "negotiation" for ui/transfersui.js to re-render from. ----- */

  startBid(playerId) {
    negotiation.startFeeNegotiation(this.state, playerId);
    this.state.ui.negotiation.editingFeeOffer = false;
    this.state.ui.transferSearch.actionMenuOpen = false;
    this.state.ui.shortlist.actionMenuOpen = false;
    this.openOverlay("negotiation");
  }

  startLoanBid(playerId, loanLength) {
    negotiation.startLoanNegotiation(this.state, playerId, loanLength);
    this.state.ui.transferSearch.actionMenuOpen = false;
    this.state.ui.shortlist.actionMenuOpen = false;
    this.openOverlay("negotiation");
  }

  startFreeAgentApproach(playerId) {
    freeagents.startApproach(this.state, playerId);
    this.state.ui.transferSearch.actionMenuOpen = false;
    this.state.ui.shortlist.actionMenuOpen = false;
    this.openOverlay("negotiation");
  }

  /** [LT][RT] "BUY/LOAN" toggle (ms_APPROACH_TRANSFER_OFFER_SCREEN.png /
   * ms_APPROACH_LOAN_OFFER_SCREEN.png share one dossier, just a different
   * right-page form) — only live while still editing (pre-submission);
   * discards whatever's been typed into the form being left, same as
   * picking a different Approach action from scratch would. */
  negoToggleOfferMode() {
    const n = this.state.transfers.negotiation;
    if (!n) return;
    if (n.dealType === "transfer" && n.phase === "fee") negotiation.startLoanNegotiation(this.state, n.playerId, n.loanLength);
    else if (n.dealType === "loan" && n.phase === "loan") negotiation.startFeeNegotiation(this.state, n.playerId);
    else return;
    this.emit("negotiation", null);
  }

  /** "(X) Reset" footer prompt on the Approach — Transfer/Loan Offer dossier
   * — re-initializes the current mode's negotiation from scratch (discards
   * the fee/exchange or loan terms typed so far), same "start fresh" shape
   * negoToggleOfferMode already uses when switching modes. */
  negoResetOffer() {
    const n = this.state.transfers.negotiation;
    if (!n) return;
    if (n.dealType === "transfer" && n.phase === "fee") negotiation.startFeeNegotiation(this.state, n.playerId);
    else if (n.dealType === "loan" && n.phase === "loan") negotiation.startLoanNegotiation(this.state, n.playerId, "season");
    this.emit("negotiation", null);
  }

  negoAdjustFeeOffer(deltaPct) {
    negotiation.adjustFeeOffer(this.state, deltaPct);
    this.emit("negotiation", null);
  }

  negoStartEditFeeOffer() {
    this.state.ui.negotiation.editingFeeOffer = true;
    this.emit("negotiation", null);
  }

  negoCommitFeeOfferDirect(value) {
    const n = this.state.transfers.negotiation;
    if (n) n.feeOffer = Math.max(0, Math.round(Number(value) || 0));
    this.state.ui.negotiation.editingFeeOffer = false;
    this.emit("negotiation", null);
  }

  negoOpenExchangePicker() {
    this.state.ui.transferSearch.exchangePickerOpen = true;
    this.emit("negotiation", null);
  }

  negoCloseExchangePicker() {
    this.state.ui.transferSearch.exchangePickerOpen = false;
    this.emit("negotiation", null);
  }

  negoSetExchangePlayer(playerId) {
    negotiation.setExchangePlayer(this.state, playerId);
    this.state.ui.transferSearch.exchangePickerOpen = false;
    this.emit("negotiation", null);
  }

  negoClearExchangePlayer() {
    negotiation.clearExchangePlayer(this.state);
    this.emit("negotiation", null);
  }

  negoCycleRole(delta) {
    negotiation.cycleNegotiationRole(this.state, delta);
    this.emit("negotiation", null);
  }

  /** Deadline day resolves synchronously inside submitFeeOffer itself, so a
   * budget/news change can land immediately — re-emitting "advance" covers
   * that case the same way submitContractOffer's own comment above does. */
  negoSubmitFeeOffer() {
    negotiation.submitFeeOffer(this.state);
    this.emit("negotiation", null);
    this.emit("advance", null);
  }

  /* ----- F3: loan-only dossier fields (Approach — Loan Offer) ----- */

  negoAdjustLoanBonus(deltaPct) {
    negotiation.adjustLoanBonusPerGoal(this.state, deltaPct);
    this.emit("negotiation", null);
  }

  negoCycleLoanLength() {
    negotiation.cycleLoanLength(this.state);
    this.emit("negotiation", null);
  }

  negoAdjustLoanFutureFee(deltaAbs) {
    negotiation.adjustLoanFutureFee(this.state, deltaAbs);
    this.emit("negotiation", null);
  }

  negoClearLoanFutureFee() {
    negotiation.clearLoanFutureFee(this.state);
    this.emit("negotiation", null);
  }

  negoSubmitLoanOffer() {
    negotiation.submitLoanOffer(this.state);
    this.emit("negotiation", null);
    this.emit("advance", null);
  }

  /* ----- F3: CONTRACT NEGOTIATION panel fields (shared by F3's own transfer/
   * free-agent contract-talks phase and F6's future renewal flow) ----- */

  negoAdjustContractWage(deltaPct) {
    negotiation.adjustNegotiationContractWage(this.state, deltaPct);
    this.emit("negotiation", null);
  }

  negoAdjustContractYears(delta) {
    negotiation.adjustNegotiationContractYears(this.state, delta);
    this.emit("negotiation", null);
  }

  negoAdjustContractBonus(deltaPct) {
    negotiation.adjustNegotiationContractBonus(this.state, deltaPct);
    this.emit("negotiation", null);
  }

  negoAdjustSigningFee(deltaAbs) {
    negotiation.adjustNegotiationSigningFee(this.state, deltaAbs);
    this.emit("negotiation", null);
  }

  /** Submits whichever contract-style offer is pending — a real transfer's
   * contract talks, or a free-agent approach's pre-contract terms (the two
   * share state.transfers.negotiation, distinguished by dealType). */
  negoSubmitContractOffer() {
    const n = this.state.transfers.negotiation;
    if (n && n.dealType === "free-agent") freeagents.submitApproach(this.state);
    else negotiation.submitNegotiationContractOffer(this.state);
    this.emit("negotiation", null);
    this.emit("advance", null);
  }

  closeNegotiation() {
    negotiation.cancelNegotiation(this.state);
    this.closeOverlay();
  }

  /* ----- M7: Sell/Loan List ----- */

  openSellList() {
    const first = this.state.squad.roster[0];
    this.selectSellListPlayer(first ? first.id : null);
    this.openOverlay("selllist");
  }

  selectSellListPlayer(playerId) {
    const s = this.state.ui.sellList;
    s.selectedPlayerId = playerId;
    const player = playerId != null ? this.state.playersById.get(playerId) : null;
    const existing = playerId != null ? this.state.transfers.listings.get(playerId) : null;
    s.askingPriceDraft = existing ? existing.askingPrice : (player ? player.value : 0);
    this.emit("selllist", null);
  }

  adjustAskingPrice(deltaPct) {
    const s = this.state.ui.sellList;
    const player = this.state.playersById.get(s.selectedPlayerId);
    if (!player) return;
    s.askingPriceDraft = Math.max(0, Math.round((s.askingPriceDraft + player.value * deltaPct) / 1000) * 1000);
    this.emit("selllist", null);
  }

  listPlayer(type) {
    const s = this.state.ui.sellList;
    if (s.selectedPlayerId == null) return;
    this.state.transfers.listings.set(s.selectedPlayerId, {
      type, askingPrice: s.askingPriceDraft, listedDate: this.state.calendar.today,
    });
    this.emit("selllist", null);
    this.emit("advance", null); // Transfers hub's Sell Players tile reflects the new listing count
  }

  unlistPlayer() {
    const s = this.state.ui.sellList;
    if (s.selectedPlayerId == null) return;
    this.state.transfers.listings.delete(s.selectedPlayerId);
    this.emit("selllist", null);
    this.emit("advance", null);
  }

  /* ----- M7: incoming CPU bids (Office/Email inbox YES/NO decision emails) ----- */

  acceptIncomingBid(bidId) {
    transferai.acceptIncomingBid(this.state, bidId);
    this.emit("email:select", this.state.ui.emailSelectedIndex);
    this.emit("advance", null);
  }

  rejectIncomingBid(bidId) {
    transferai.rejectIncomingBid(this.state, bidId);
    this.emit("email:select", this.state.ui.emailSelectedIndex);
  }

  /* ----- M7: Request Funds ----- */

  openRequestFunds() {
    this.state.ui.requestFunds.lastResult = null;
    this.openOverlay("requestfunds");
  }

  adjustRequestFundsAmount(deltaAbs) {
    const r = this.state.ui.requestFunds;
    r.amount = Math.max(0, r.amount + deltaAbs);
    this.emit("requestfunds", null);
  }

  /** direction: 'wageToTransfer' | 'transferToWage' — an always-successful
   * reallocation between the same season's two budget halves. */
  submitReallocateBudget(direction) {
    const r = this.state.ui.requestFunds;
    reallocateBudget(this.state, r.amount, direction);
    r.lastResult = { reallocated: true, direction };
    this.emit("requestfunds", null);
    this.emit("advance", null);
  }

  /** Begs the board for extra transfer funds — a real probabilistic roll
   * (engine/finances.js's requestFundsFromBoard), not a guaranteed top-up. */
  submitBoardFundsRequest() {
    const r = this.state.ui.requestFunds;
    r.lastResult = requestFundsFromBoard(this.state, r.amount);
    this.emit("requestfunds", null);
    this.emit("advance", null);
  }

  /* ============================================================================
   * M8: Global Transfer Network — engine/gtn.js owns the actual state
   * machine (scout market, missions, fuzzy-range reveal); these methods just
   * call into it and emit "gtn" for ui/gtnui.js to re-render from, same
   * contract as every other M7 section above.
   * ========================================================================== */

  /** Opens the GTN hub (scout roster + market pool + mission list),
   * defaulting the selection to the first hired scout, or the first market
   * candidate if none are hired yet. */
  openGtn() {
    const g = this.state.gtn, ui = this.state.ui.gtn;
    ui.view = "hub";
    ui.lastError = null;
    const firstScout = g.scouts[0];
    ui.selectedScoutId = firstScout ? firstScout.id : (g.pool[0] ? g.pool[0].id : null);
    ui.selectedIsPool = !firstScout && !!g.pool[0];
    this.openOverlay("gtn");
  }

  /** Central's GTN tile / Transfers' scouted-group tile: jump straight to
   * the most attention-worthy mission's report (most new finds + updates),
   * or fall back to the hub if no mission has ever been started. */
  openGtnHubTile() {
    const primary = gtnEngine.primaryMission(this.state.gtn.missions);
    if (primary) this.openGtnMissionReport(primary.id);
    else this.openGtn();
  }

  selectGtnRow(id, isPool) {
    const ui = this.state.ui.gtn;
    ui.selectedScoutId = id;
    ui.selectedIsPool = isPool;
    ui.lastError = null;
    this.emit("gtn", null);
  }

  gtnHireSelected() {
    const ui = this.state.ui.gtn;
    if (!ui.selectedIsPool) return;
    const idx = this.state.gtn.pool.findIndex((c) => c.id === ui.selectedScoutId);
    if (idx === -1) return;
    const result = gtnEngine.hireScout(this.state, idx);
    ui.lastError = result.error || null;
    if (result.ok) { ui.selectedScoutId = result.scout.id; ui.selectedIsPool = false; }
    this.emit("gtn", null);
    this.emit("advance", null); // Transfers hub's Finances tile reflects the spend
  }

  gtnSackSelected() {
    const ui = this.state.ui.gtn;
    if (ui.selectedIsPool || ui.selectedScoutId == null) return;
    const result = gtnEngine.sackScout(this.state, ui.selectedScoutId);
    if (result.ok) {
      const g = this.state.gtn;
      ui.selectedScoutId = g.scouts[0] ? g.scouts[0].id : (g.pool[0] ? g.pool[0].id : null);
      ui.selectedIsPool = !g.scouts[0] && !!g.pool[0];
    }
    this.emit("gtn", null);
    this.emit("advance", null);
  }

  /** Opens the new-mission builder for the currently selected (hired, idle)
   * scout — a no-op for a pool candidate or a scout already on a mission. */
  gtnOpenMissionForm() {
    const ui = this.state.ui.gtn;
    if (ui.selectedIsPool) return;
    const scout = this.state.gtn.scouts.find((s) => s.id === ui.selectedScoutId);
    if (!scout || scout.missionId) return;
    ui.missionDraft = { scoutId: scout.id, region: "ALL", area: "ALL", tags: [], minAge: 15, maxAge: 35, maxValue: 0, tierIndex: 0 };
    ui.lastError = null;
    ui.view = "missionForm";
    this.emit("gtn", null);
  }

  gtnCancelMissionForm() {
    this.state.ui.gtn.view = "hub";
    this.emit("gtn", null);
  }

  gtnSetMissionArea(area) {
    this.state.ui.gtn.missionDraft.area = area;
    this.emit("gtn", null);
  }

  /** Cycles the mission's target nation through an alphabetised list (plus
   * "ALL" at the front) — the plan's "map-ish region picker" simplified to a
   * stepper, same footing as this project's other non-visual-map pickers. */
  gtnCycleMissionRegion(delta) {
    const ids = ["ALL", ...this.state.staticData.nations.slice().sort((a, b) => a.name.localeCompare(b.name)).map((n) => n.id)];
    const d = this.state.ui.gtn.missionDraft;
    const idx = Math.max(0, ids.indexOf(d.region));
    d.region = ids[(idx + delta + ids.length) % ids.length];
    this.emit("gtn", null);
  }

  /** Toggles a player-type tag (config/scouting.js's SCOUT_TAGS) on/off, up
   * to 2 at once (plan1.md's own example: "Pacey, Prolific") — a 3rd pick
   * bumps the oldest one off rather than being ignored outright. */
  gtnToggleMissionTag(tagId) {
    const tags = this.state.ui.gtn.missionDraft.tags;
    const i = tags.indexOf(tagId);
    if (i !== -1) tags.splice(i, 1);
    else {
      if (tags.length >= 2) tags.shift();
      tags.push(tagId);
    }
    this.emit("gtn", null);
  }

  gtnAdjustMissionAge(field, delta) {
    const d = this.state.ui.gtn.missionDraft;
    d[field] = Math.max(15, Math.min(40, d[field] + delta));
    if (d.minAge > d.maxAge) { if (field === "minAge") d.maxAge = d.minAge; else d.minAge = d.maxAge; }
    this.emit("gtn", null);
  }

  gtnAdjustMissionValue(deltaAbs) {
    const d = this.state.ui.gtn.missionDraft;
    d.maxValue = Math.max(0, d.maxValue + deltaAbs);
    this.emit("gtn", null);
  }

  gtnSetMissionTier(tierIndex) {
    this.state.ui.gtn.missionDraft.tierIndex = tierIndex;
    this.emit("gtn", null);
  }

  gtnSubmitMission() {
    const ui = this.state.ui.gtn;
    const result = gtnEngine.startMission(this.state, ui.missionDraft);
    ui.lastError = result.error || null;
    if (result.ok) {
      ui.view = "hub";
      ui.selectedScoutId = ui.missionDraft.scoutId;
      ui.selectedIsPool = false;
    }
    this.emit("gtn", null);
    this.emit("advance", null); // Finances tile changes on spend
  }

  /** Opens (or switches to, if the overlay's already open) a specific
   * mission's report — marks its finds "seen" (engine/gtn.js's viewMission)
   * so the New/Updates badges clear the moment the user actually looks. */
  openGtnMissionReport(missionId) {
    gtnEngine.viewMission(this.state, missionId);
    const mission = this.state.gtn.missions.find((m) => m.id === missionId);
    const ui = this.state.ui.gtn;
    ui.reportMissionId = missionId;
    ui.reportSelectedPlayerId = mission && mission.foundPlayerIds.length ? mission.foundPlayerIds[mission.foundPlayerIds.length - 1] : null;
    ui.view = "report";
    if (this.state.ui.overlay !== "gtn") this.openOverlay("gtn");
    else this.emit("gtn", null);
  }

  gtnSelectReportPlayer(playerId) {
    this.state.ui.gtn.reportSelectedPlayerId = playerId;
    this.emit("gtn", null);
  }

  /** The report footer's R1 prompt — cycles to the next mission's report
   * without leaving the overlay (matches the reference screenshot's R-button
   * group-cycling on the Transfers hub tile, applied here to the full report
   * view instead of just the tile preview). */
  gtnCycleReportMission(delta) {
    const missions = this.state.gtn.missions;
    if (missions.length < 2) return;
    const idx = missions.findIndex((m) => m.id === this.state.ui.gtn.reportMissionId);
    const next = missions[(idx + delta + missions.length) % missions.length];
    this.openGtnMissionReport(next.id);
  }

  /** Abandons a mission (hub detail panel's "Cancel Mission") — the scout
   * goes idle immediately; anything already discovered stays known
   * (cancelling doesn't un-scout). Backs out to the hub if the mission being
   * cancelled is also the one currently open in the report view. */
  gtnCancelMission(missionId) {
    gtnEngine.cancelMission(this.state, missionId);
    if (this.state.ui.gtn.reportMissionId === missionId) this.state.ui.gtn.view = "hub";
    this.emit("gtn", null);
    this.emit("advance", null);
  }

  /** Footer/keyboard Back: steps out of a nested view (missionForm/report)
   * to the hub first, only closing the overlay once already there — same
   * "Back backs out one level at a time" precedent as closeOverlay's own
   * overlayStack nesting. */
  gtnBack() {
    const ui = this.state.ui.gtn;
    if (ui.view !== "hub") { ui.view = "hub"; this.emit("gtn", null); }
    else this.closeOverlay();
  }

  /* ============================================================================
   * M9: Youth Academy — engine/academy.js owns the actual state machine
   * (scout market, assignments, roster development/reveal/retirement-threat,
   * promote/release); these methods just call into it and emit "youth" for
   * ui/youthui.js to re-render from, same contract as the M8 GTN section
   * above.
   * ========================================================================== */

  /** Opens the Youth Staff hub, defaulting the selection to the first hired
   * scout, or the first market candidate if none are hired yet. */
  openYouth() {
    const a = this.state.academy, ui = this.state.ui.youth;
    ui.view = "hub";
    ui.lastError = null;
    const firstScout = a.scouts[0];
    ui.selectedScoutId = firstScout ? firstScout.id : (a.pool[0] ? a.pool[0].id : null);
    ui.selectedIsPool = !firstScout && !!a.pool[0];
    this.openOverlay("youth");
  }

  selectYouthRow(id, isPool) {
    const ui = this.state.ui.youth;
    ui.selectedScoutId = id;
    ui.selectedIsPool = isPool;
    ui.lastError = null;
    this.emit("youth", null);
  }

  youthHireSelected() {
    const ui = this.state.ui.youth;
    if (!ui.selectedIsPool) return;
    const idx = this.state.academy.pool.findIndex((c) => c.id === ui.selectedScoutId);
    if (idx === -1) return;
    const result = academyEngine.hireYouthScout(this.state, idx);
    ui.lastError = result.error || null;
    if (result.ok) { ui.selectedScoutId = result.scout.id; ui.selectedIsPool = false; }
    this.emit("youth", null);
    this.emit("advance", null); // Finances tile reflects the spend
  }

  youthSackSelected() {
    const ui = this.state.ui.youth;
    if (ui.selectedIsPool || ui.selectedScoutId == null) return;
    const result = academyEngine.sackYouthScout(this.state, ui.selectedScoutId);
    if (result.ok) {
      const a = this.state.academy;
      ui.selectedScoutId = a.scouts[0] ? a.scouts[0].id : (a.pool[0] ? a.pool[0].id : null);
      ui.selectedIsPool = !a.scouts[0] && !!a.pool[0];
    }
    this.emit("youth", null);
    this.emit("advance", null);
  }

  /** Opens the assignment form for the currently selected (hired, idle)
   * scout — a no-op for a pool candidate or a scout already assigned. */
  youthOpenAssignForm() {
    const ui = this.state.ui.youth;
    if (ui.selectedIsPool) return;
    const scout = this.state.academy.scouts.find((s) => s.id === ui.selectedScoutId);
    if (!scout || scout.assignment) return;
    const firstNation = this.state.staticData.nations.slice().sort((a, b) => a.name.localeCompare(b.name))[0];
    ui.assignDraft = { scoutId: scout.id, nationId: firstNation ? firstNation.id : null, type: null, tierIndex: 0 };
    ui.lastError = null;
    ui.view = "assignForm";
    this.emit("youth", null);
  }

  youthCancelAssignForm() {
    this.state.ui.youth.view = "hub";
    this.emit("youth", null);
  }

  youthSetAssignType(type) {
    const d = this.state.ui.youth.assignDraft;
    d.type = d.type === type ? null : type; // click again to clear back to "Any"
    this.emit("youth", null);
  }

  /** Cycles the assignment's target nation through an alphabetised list —
   * same "map-ish region picker simplified to a stepper" precedent as
   * store.gtnCycleMissionRegion, minus GTN's "ALL"/worldwide option (a youth
   * scout is always sent to one specific nation — plan1.md M9: "Send to a
   * nation"). */
  youthCycleAssignNation(delta) {
    const ids = this.state.staticData.nations.slice().sort((a, b) => a.name.localeCompare(b.name)).map((n) => n.id);
    const d = this.state.ui.youth.assignDraft;
    const idx = Math.max(0, ids.indexOf(d.nationId));
    d.nationId = ids[(idx + delta + ids.length) % ids.length];
    this.emit("youth", null);
  }

  youthSetAssignTier(tierIndex) {
    this.state.ui.youth.assignDraft.tierIndex = tierIndex;
    this.emit("youth", null);
  }

  youthSubmitAssignment() {
    const ui = this.state.ui.youth;
    const result = academyEngine.assignScout(this.state, ui.assignDraft);
    ui.lastError = result.error || null;
    if (result.ok) {
      ui.view = "hub";
      ui.selectedScoutId = ui.assignDraft.scoutId;
      ui.selectedIsPool = false;
    }
    this.emit("youth", null);
  }

  /** Hub detail panel's "Recall Scout" — ends an assignment early (no
   * refund; assigning is free — see engine/academy.js's header). */
  youthRecallSelected() {
    const ui = this.state.ui.youth;
    if (ui.selectedIsPool || ui.selectedScoutId == null) return;
    academyEngine.recallScout(this.state, ui.selectedScoutId);
    this.emit("youth", null);
  }

  /** Opens the Youth Squad roster list (hub's "Youth Squad (N/16)" link),
   * defaulting the selection to the first prospect, if any. */
  openYouthSquad() {
    const ui = this.state.ui.youth;
    const roster = this.state.academy.roster;
    ui.squadSelectedPlayerId = roster[0] ? roster[0].id : null;
    ui.view = "squad";
    ui.lastError = null;
    if (this.state.ui.overlay !== "youth") this.openOverlay("youth");
    else this.emit("youth", null);
  }

  selectYouthSquadPlayer(id) {
    this.state.ui.youth.squadSelectedPlayerId = id;
    this.emit("youth", null);
  }

  promoteSelectedYouthPlayer() {
    const ui = this.state.ui.youth;
    if (ui.squadSelectedPlayerId == null) return;
    const result = academyEngine.promoteProspect(this.state, ui.squadSelectedPlayerId);
    ui.lastError = result.error || null;
    if (result.ok) {
      const roster = this.state.academy.roster;
      ui.squadSelectedPlayerId = roster[0] ? roster[0].id : null;
    }
    this.emit("youth", null);
    this.emit("advance", null); // Squad List/Contracts/wage bill all gained a player
  }

  releaseSelectedYouthPlayer() {
    const ui = this.state.ui.youth;
    if (ui.squadSelectedPlayerId == null) return;
    ui.lastError = null;
    academyEngine.releaseProspect(this.state, ui.squadSelectedPlayerId);
    const roster = this.state.academy.roster;
    ui.squadSelectedPlayerId = roster[0] ? roster[0].id : null;
    this.emit("youth", null);
  }

  /** Email inbox's youth-retirement-warning decision (ui/render.js's
   * renderEmailActions) — Promote acts immediately from the inbox;
   * dismissing without acting just leaves the warning's own
   * RETIREMENT_WARNING_DAYS clock running (engine/academy.js's
   * resolveRetirementDepartures). */
  promoteFromYouthWarningEmail(prospectId) {
    const result = academyEngine.promoteProspect(this.state, Number(prospectId));
    if (result.ok) {
      const email = this.state.inbox.emails.find((e) => e.action && e.action.prospectId === Number(prospectId));
      if (email) { email.read = true; email.action = null; }
    }
    this.emit("email:select", this.state.ui.emailSelectedIndex);
    this.emit("advance", null);
  }

  releaseFromYouthWarningEmail(prospectId) {
    academyEngine.releaseProspect(this.state, Number(prospectId));
    const email = this.state.inbox.emails.find((e) => e.action && e.action.prospectId === Number(prospectId));
    if (email) { email.read = true; email.action = null; }
    this.emit("email:select", this.state.ui.emailSelectedIndex);
  }

  /** Footer/keyboard Back: steps out of a nested view (assignForm/squad) to
   * the hub first, only closing the overlay once already there — same
   * precedent as store.gtnBack. */
  youthBack() {
    const ui = this.state.ui.youth;
    if (ui.view !== "hub") { ui.view = "hub"; this.emit("youth", null); }
    else this.closeOverlay();
  }
}
