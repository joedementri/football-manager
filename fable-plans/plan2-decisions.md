# Plan 2 — Decisions Ledger

Format per §A6 of `plan2.md`:
```
## F<n> — YYYY-MM-DD
- [TUNED] <value> — <why / INI reference>.
- [PIC-GUESS] <file>.png <what was unreadable and what was chosen instead>.
```

---

## F0 — 2026-07-17
- [DEVIATION-RESOLVED] Central hub bottom-right tile, FIXTURES/TOP SCORERS pages: plan §F0.3
  text called for embedded data (next 3 fixtures w/ crests+dates; top 3 scorers w/
  name/crest/goals), but `ms_CENTRAL_SCREEN_HOVERING_BOTTOM_RIGHT_TILE_FIXTURES.png` and
  `..._TOP_SCORERS.png` both show plain teaser/link cards (stock photo + bold title + one
  caption line: "View all results and fixtures" / "View the current goal scorers stats"), no
  data at all — same visual language as the News headline tile. Presented to owner; decision:
  match the pics exactly. TABLES remains the only data-rich page of the 3; FIXTURES/TOP SCORERS
  are teaser cards that open `season`→Fixtures/Player Stats on click.
- [PIC-GUESS] Bottom-right tile's TABLES page column header: `FIFA15_CENTRAL_SCREEN.png` (full,
  un-hovered capture) reads "PLD  PTS"; the 3 hover captures in `more_screens/CENTRAL_SCREEN/`
  read "P  PTS" for the same column at higher resolution. Kept existing code's "PLD" (matches
  the primary top-level pic; already built pre-F0) — treating the hover captures' "P" as a
  possible truncation/font-rendering artifact rather than a deliberate label difference.
- [PIC-GUESS] Bottom-right tile pager: hover pics show 3 dots + a single "(R)" bumper glyph for
  Tables/Fixtures/Top Scorers (not 5, and not a two-button L/R pair). News headline tile keeps
  its own separate 5-dot pager. Built via the existing generic `carousel.js` (mouse
  prev/next+dot-click only, no keyboard binding) — consistent with how every other multi-page
  hub tile in the codebase already works; no project-wide precedent yet for binding LB/RB/(R)
  to tile-internal carousels, so none added here.
- [ENGINE QUIRK] Plan §F0.4 said Message Archive's "X=Delete, Y=Archive already exist — verify."
  They didn't: the footer prompts were static markup with zero wiring (no store methods, no
  `archived`/tab state at all), and the three email tabs (Emails/Player Conversations/Message
  Archive) had no click handling either — clicking them did nothing. Built for real this
  milestone: `state.ui.emailTab`, `email.archived` flag, `store.selectEmailTab/
  archiveSelectedEmail/deleteSelectedEmail`, tab click wiring, and `emailsForTab()` shared by
  store + render so both index the same filtered list.
- [TUNED] Archive Message (Y) is a no-op when already viewing the Message Archive tab — no pic
  shows archive-tab-specific footer behaviour, and an "unarchive" action isn't evidenced
  anywhere, so nothing was invented for it. Delete Message (X) works from both the Emails and
  Message Archive tabs (permanent removal either way).

## F1 — 2026-07-17
Team Sheet view (Squad hub's team-sheet tile), SQUAD tab only. New files: `js/config/
managerai.js`, `js/ui/teamsheetui.js`, `css/teamsheet.css`. FORMATIONS/TACTICS/ROLES tabs
render in the sub-tab bar (clickable, correct highlight) but their content areas stay empty —
per the milestone's own scope line, not a deviation.

- [PLAN-TEXT CORRECTION] §Build note 6 said Skill Attributes' scrolled tail ends with
  "Positioning, Vision" — `ms_TEAM_SHEET_VIEW_SCROLLED_DOWN_SKILL_ATTRIBUTES.png` actually ends
  at "Penalties" (16 rows total), and `ms_TEAM_SHEET_VIEW_SCROLLED_DOWN_PHYSICAL_ATTRIBUTES.png`
  shows "Att. Position" and "Vision" appended to the *Physical and Mental* page instead (12 rows
  total). Pics win per §A1; `js/ui/teamsheetui.js`'s `PHYSICAL_ATTRS`/`SKILL_ATTRS` reflect the
  pics, not the plan's summary. Also pic-exact: "Stand Tackle"/"Slide Tackle", not
  "Standing"/"Sliding".
- [PIC-GUESS] Jersey ring/swap-icon semantics: reconciled from ms_TEAM_SHEET_VIEW_SELECT_
  PLAYER.png + `..._SELECT_PLAYER_SECOND_PLAYER.png` + `..._SUGGESTED_SUBS.png` — the *armed*
  (first-picked) slot always shows a teal ring; whichever slot currently has focus shows a gold
  ring, and additionally gets the swap-icon overlay whenever a slot is armed (so the armed slot
  itself shows both teal ring + swap icon until focus moves away). Right-panel compare mode:
  armed player's name renders teal/blue (left), focused/candidate player's name renders gold
  (right). Single-view name is always gold.
- [PIC-GUESS] The small per-jersey status dot (fitness/condition colour) is rendered in Change
  View modes 0 and 2 based on the higher-detail SELECT_PLAYER/SUGGESTED_SUBS/SUBSTITUTES_
  RESERVES pics, which consistently show it; `ms_TEAM_SHEET_VIEW_CHANGE_VIEW_1of3_POSITION_OVR.png`
  alone appeared dot-less at its capture resolution — treated as a rendering/compression
  artifact rather than a deliberate per-mode omission, since every other mode-0-shaped pic shows
  the dot.
- [TUNED] Status dot colour bands (fitness %): >=90 green, >=75 yellow, >=50 orange, <50 red;
  an active injury forces red regardless of fitness%. No INI table backs this specific UI
  element (simsettings.ini's [FATIGUE] only models the underlying energy number, not a display
  banding) — bands chosen to match §B4's existing chip banding language. Logged in
  `js/ui/teamsheetui.js`'s `fitnessBand`.
- [TUNED] Change View mode 2 (Energy/Form) trend-arrow bands, from delta = most-recent match
  rating minus the average of the prior two: >=+8 up, >=+3 up-right, within +-3 flat, >=-8
  down-right, else down; fewer than 2 ratings on file -> flat (no data). No INI table for this
  either; logged in `formArrow`.
- [TUNED] Change View mode 2 (Positional Colouring) dot colour reuses §B4's 4-band
  `POSITION_COLOR` uniformly (GK orange/DEF yellow/MID green/ATT blue) — one reference pic (a
  left-back, "Dunne") shows a green dot where this rule implies yellow; standardised to the B4
  bands already used everywhere else rather than chasing that single inconsistent pixel.
- [TUNED] Suggested Subs ranking (`js/config/managerai.js`, ported from `managerai.ini`'s
  `[MAI_PLAYER_POS_SCORE]`/`[MAI_FORM]`/`[MAI_TOTAL_SCORE_1ST_11]`): (a) the INI's ranked
  "1st..4th preferred position" scores are mapped onto the Player schema's single `position` +
  unranked `altPositions` list — list order stands in for 2nd/3rd/4th preference, since no
  explicit ranking exists in our schema; (b) `player.form` (1-10) is linearly interpolated onto
  the INI's 25-100 score band; (c) `OVR_POS_BIAS` weights `positionFitScore + overall` (summed,
  not multiplied) since the INI names but doesn't formularise the combination. A candidate only
  appears in the list at all if his position score beats `NOT_PREFERRED_POS` (-50) — otherwise
  the drawer shows `ms_..._SUGGESTED_SUBS_NO_SIMILAR.png`'s "No similar players available."
  verbatim.
- [JUDGMENT CALL] "(A) Advance" (present in every SQUAD-tab footer pic) calls the same
  `store.advanceOneDay()` Central's own Advance control uses, rather than behaving as a second
  Back button — real FIFA lets you advance from most screens, not just Central.
- [JUDGMENT CALL] The pics' PS-style "▶" play-triangle "Advance" icon is rendered as the
  standard Xbox "(A)" glyph pill instead, consistent with F0's glyph-audit rule (every footer
  uses the same lettered-pill language; no per-screen PS leftovers).
- [JUDGMENT CALL] Select Player interaction model: mouse **hover** only moves focus (teal/gold
  ring + right panel follow the pointer, matching "cursor movement" on a controller); a mouse
  **click** focuses *and* activates (X) in one gesture — arms an unarmed slot, or swaps/cancels
  an armed one. Keyboard mirrors the controller more literally: arrow keys move focus across
  `teamSheetFocusableSlots`' flat list (XI, plus whatever the drawer currently has open), X/Enter
  activates.
- [TUNED] Keyboard alternates for LS/RS (§A4: "assign alternates, log them" — neither has an
  existing binding in this codebase): **V** for Change View (the plan text's own explicit
  choice) and **R** for the right-panel's (RS) attribute-page pager.
- [PIC-GUESS] The bottom drawer's bar label cycles `SUBSTITUTES/RESERVES` (collapsed) ->
  `SUBSTITUTES` -> `RESERVES` -> collapsed; only the first two states appear in a pic
  (`ms_TEAM_SHEET_VIEW_SUBSTITUTES_RESERVES.png`'s expanded state reads "SUBSTITUTES"). "Suggested
  Subs" (Title Case, gold) is pic-exact for the Y-triggered drawer state.
- [JUDGMENT CALL] Squad hub team-sheet tile carousel: dot count reflects the *actual* number of
  sheets + a create-new page (matching how every other carousel in this codebase already works),
  not a fixed 5 — the FIFA15_SQUAD_SCREEN*.png captures happen to show 5 dots for that save's
  particular sheet count, not a hardcoded UI element.
- [JUDGMENT CALL] Opening a sheet from the hub tile (clicking its carousel page) both displays it
  in the Team Sheet view *and* makes it the sheet matches use — no pic shows a separate "set
  active" step, and F1.7's "extend store so edits here drive match lineups" implies one always-
  live sheet rather than a live/inactive distinction.
- [TUNED] New-sheet defaults: named "Team Sheet 2", "Team Sheet 3", etc. (no pic shows a created
  2nd sheet's title). Cap of 6 sheets total taken from the plan's explicit "6-slot carousel"
  text, kept even though the captured hub pics show only 5 dots for a 1-sheet save.
- [TUNED] Default bench composition: the squad's next-best 7 non-XI players by overall
  (`gen/squad.js`'s `pickDefaultBench`) — no INI/pic specifies the initial default-sheet bench
  selection rule beyond "7 slots exist".
- [ENGINE FIX] Manual browser testing (Playwright) surfaced a real bug: `teamSheetFocus` emitted
  a re-render on every `mouseover`, even when the focused slot hadn't changed; since
  `renderTeamSheet` replaces `#sqts-body`'s innerHTML wholesale, a *stationary* mouse pointer
  over a freshly-recreated element re-triggers `mouseover` on the new node, causing an infinite
  render loop. Fixed by no-op'ing the mutator when the target slot equals the current focus.

## F1-fixes — 2026-07-17
Owner review of the built F1 milestone raised 10 concrete fixes to the Team Sheet SQUAD tab
(and one global correction). No new files. Changed: `js/core/store.js`, `js/core/router.js`,
`js/ui/teamsheetui.js`, `js/ui/render.js`, `js/gen/crest.js`, `js/main.js`, `css/teamsheet.css`,
`css/screens.css`, `dev/tests.js`.

- [OWNER CORRECTION] "(A) Advance" (my own F1 JUDGMENT CALL, logged above) was wrong: the owner
  clarified the Xbox (A) glyph is this game's *universal* "interact with whatever's
  highlighted/focused" button (matches footer-main's own static "(A) Select" prompt, and every
  other overlay's primary action) — it must never double as a day-advance shortcut outside
  Central's own dedicated Advance tile. Team Sheet's footer/keyboard now bind (A) to Select
  Player (previously X); the old "(A) Advance" prompt is gone. Audited the rest of the codebase
  for the same mistake — found no other screen wiring (A) to `advanceOneDay()`, so no other files
  needed the same correction.
- [JUDGMENT CALL] The Squad hub's team-sheet carousel (`.sq-sheet .cpage`) never had the
  `.tile.is-link:hover` gold-outline hover every other Squad-hub tile gets (it's wired via
  router.js's own dedicated delegation, not the generic `[data-open]` sweep that class rides
  along with elsewhere) — added an equivalent `inset` box-shadow rule scoped to `.sq-sheet
  .cpage:hover` (inset so it isn't clipped by `.sq-sheet`'s own `overflow:hidden`).
- [JUDGMENT CALL] Replaced the bare `(RS)` glyph pill next to the right panel's attribute-page
  dots with prev/next chevron buttons flanking the dots — same `cnav prev · dots · cnav next`
  shape `js/carousel.js`'s main-menu tile carousels already use (owner's own comparison point).
  Reused the existing `.cnav`/`.dots` classes rather than inventing new ones; `.cnav`'s base
  opacity (0.35, brightening only while an ancestor `[data-carousel]` tile is hovered) doesn't fit
  a persistent side-panel control, so `.sqts-pagernav` overrides it to a simpler always-legible
  0.7/1 hover pair.
- [TUNED] Right panel scrollbar/chip overlap: `padding-right: 14px` on `.sqts-panelbody` (the
  scrolling element itself, not `.sqts-right`'s outer padding, which would also shift the
  non-scrolling header/title/pager out of alignment with the body).
- [PIC-GUESS carried over, now implemented] Club-specific jerseys: `gen/crest.js` already had
  `kitInnerSVG`/`kitSVGString` (built in M1, explicitly "for Team Sheet/Tactics screens" per its
  own header) sitting unused — F1 shipped referencing the flat generic `#kit` placeholder instead
  for every jersey (Team Sheet's own pitch *and* the Squad hub's preview tile). Added
  `kitSymbolMarkup`/`injectClubKitSymbols` mirroring the existing crest-symbol-injection pattern
  exactly (`js/main.js` at boot, `core/router.js` after accepting a job); both pitches now
  `<use href="#kit-<clubId>">`. Kept goalkeepers on the old generic `#kit` + its `.jersey.gk
  .jersey__kit` CSS colour override rather than clubbing their kit too — real football's own
  convention is a keeper's shirt is never the same colour as an outfield player's, club-specific
  or not, and no INI/pic evidence suggested inventing a separate keeper-kit colour field.
- [JUDGMENT CALL] Formation label moved from bottom-left to top-left of the pitch panel — it
  overlapped the Substitutes/Reserves drawer bar (and would overlap the new drawer overlay body
  even more, see below). Top-left is clear of the centred crest banner and never covered by
  anything in any drawer state.
- [JUDGMENT CALL] Substitutes/Reserves slot cards get a filled kit-number bubble (was an empty
  grey circle) and the player's own primary position next to it (posDot-coloured, matching the
  right panel's mini-header convention) — bench/reserve players don't have a formation-slot
  position the way pitch jerseys do, so this is `player.position` itself, not `entry.pos`.
- [JUDGMENT CALL] Change View (Position/OVR, Energy/Form, Positional Colouring) now also drives
  the drawer's slot cards, not just the pitch — `slotCardMain` mirrors `jerseyCaption`'s 3 modes
  (arrow+energy-bar / OVR+position-colour-dot / OVR+fitness-dot) so a card and its on-pitch
  counterpart never show inconsistent information.
- [TUNED] Right panel name format: `firstName lastName` (was `F. Lastname`) — matches
  `ui/playerbio.js`'s own bio-sub line, no INI/pic evidence for abbreviating it here specifically.
- [JUDGMENT CALL] Drawer overlay + minimize mechanics (`state.ui.teamSheet.drawerMinimized`, new
  field): opening the drawer (bar click) now makes it `position:absolute` over the *bottom* of
  the pitch panel (taken out of `.sqts-pitchpanel`'s flex flow, so the pitch keeps its full flex
  height — no more compression) rather than sharing flex space with the pitch. Arming a
  bench/reserve/suggested slot *from inside* the open drawer shrinks it back to just its bar
  (`drawerMinimized = true`) so the pitch is visible to pick the swap's other half; arming an XI
  slot instead (manual pitch-first pick, or Suggested Subs' own flow) leaves the drawer expanded,
  since in that case the drawer's own list *is* the next click's target — a single rule
  (`drawerMinimized = drawer-open && armed.zone !== 'xi'`) covers both flows without needing to
  special-case Suggested Subs. Un-minimizes on: completing the swap, cancelling the arm
  (re-clicking the same slot), or clicking the drawer bar again (`teamSheetToggleDrawer` peeks
  instead of cycling to the next drawer type whenever it's called while minimized).
- [ENGINE FIX] Building the above surfaced a second real hover bug, cousin to F1's original
  mouseover-loop fix: arming a bench/reserve slot minimizes the drawer, which can reveal a pitch
  jersey at the exact pixel the (still physically stationary) mouse cursor happens to be resting
  over — browsers synthesize a `mouseover` for whatever element newly ends up under a stationary
  cursor after a layout change, even with zero real pointer movement, which was silently stealing
  focus away from the slot the user had just armed before they'd moved the mouse at all. Root
  cause is generic (any DOM reshuffle under a resting cursor can trigger this with delegated
  `mouseover`), so the general fix was used instead of a one-off guard: `core/router.js`'s pitch/
  drawer hover listener now binds `mousemove` instead of `mouseover` — unlike mouseover/mouseout,
  mousemove only ever fires from genuine pointer-device movement, never synthesized by a layout
  change, so it can't be spoofed by our own re-render. `teamSheetFocus`'s existing same-slot
  no-op guard keeps this just as cheap under real continuous mouse movement.

Testing: extended `dev/tests.js` with 8 assertions covering the new `drawerMinimized` state
machine (arm-inside-drawer minimizes, arm-on-pitch doesn't, peek/toggle, cancel, completed-swap
all un-minimize) — 419/419 assertions pass. Manual Playwright pass covering every fix (hub-tile
hover, footer/keyboard glyph swap, pager arrows, scrollbar clearance, club-coloured jerseys on
both pitches, formation label position, slot-card kit-number/position/change-view, full names,
drawer overlay/minimize/peek/swap) with no console/page errors; §A5.4-style regression re-run
(new game as Portsmouth, advance to and through a match day, open all five hubs, Team Sheet round
trip) also clean.

### Follow-up (same day): 2 more owner corrections
- [JUDGMENT CALL] Widened the Squad-hub hover ring beyond just the team-sheet carousel (the
  owner's own follow-up: "should apply to everything on the Squad page") — turned out most of the
  screen's other tiles had the identical gap for the identical reason: `is-link` sits on an inner
  `.cpage`, not the outer `.tile` chrome.css's `.tile.is-link:hover` selector requires both
  classes on (Squad Report/Ranking, Tactics, Player Roles, Kit Numbers all affected), and
  sq-natl/sq-natlsel never carry `is-link` at all, live or not. One consolidated rule in
  `css/screens.css` now covers `.sq-sheet .cpage`, `.sq-grid .cpage.is-link`, and
  `.sq-natl:not(.is-disabled)`/`.sq-natlsel:not(.is-disabled)` — correctly excludes Formations'
  own default page, Injury List, and the locked Edit Player page (none are clickable this
  milestone) and the two NATL tiles while genuinely disabled. Scoped to the Squad screen only, per
  the request — didn't touch the same `.cpage.is-link` gap on other screens (Office's Browse
  Jobs/NT Jobs carousel has the identical issue) since it wasn't asked for.
- [TUNED] Right panel's mini-header now shows the player's nation flag next to their name
  (`css/flags.css`'s `data-flag="<nationId>"` idiom, default small `.flag` size — matches how
  every other roster-ish list in the app already places a flag next to a name, e.g.
  `ui/render.js`'s scout-row, `ui/gtnui.js`/`ui/youthui.js`'s contact rows). Works unchanged in
  both single-view and compare-mode (each side gets its own player's flag).

Testing: full 419/419 suite still green (no logic touched, CSS/markup-only), manual Playwright
hover sweep over every Squad-page tile (including the disabled NATL tiles, confirmed no ring) and
both Team Sheet name-panel modes (single + compare, confirmed distinct flags per side), plus a
repeat of the §A5.4-style regression — all clean, no console errors.

## F2 — 2026-07-17
Team Sheet FORMATIONS/TACTICS/ROLES tabs + Kit Numbers fidelity pass + new Injury List screen.
New files: `js/config/formations.js`, `js/config/instructions.js`, `js/config/injuries.js`,
`js/ui/formationsui.js`, `js/ui/rolestacticsui.js`, `js/ui/injurylistui.js`, `css/formations.css`.
Retired: `js/ui/tacticsui.js`, `css/tactics.css` (standalone M11 tactics overlay — captain/
penalty-taker pickers moved into the new ROLES tab; TACTICS/ROLES tabs deep-link from the Squad
hub tile instead of opening a separate overlay).

- [PLAN-TEXT CORRECTION] TACTICS tab: plan2.md's own summary guessed "Speed/Passing/Positioning
  bars over the pitch with presets" — `ms_TEAM_SHEET_VIEW_TACTICS.png` actually shows a completely
  different screen: a 2x2 D-pad-icon "ASSIGNED TACTICS" grid (Up/Right/Down/Left mapped to
  config/tactics.js's 4 existing presets, in that exact array order) plus a static "Info" panel
  explaining in-game D-pad tactic switching — no pitch, no bars at all. Pics win per §A1; built to
  match the pic exactly (js/ui/rolestacticsui.js's `renderTacticsTab`), same resolution pattern F1
  already established for plan-text-vs-pic conflicts.
- [JUDGMENT CALL] TACTICS tab's "(A) Edit Tactics": since the pic's D-pad grid has exactly 4 cells
  mapped 1:1 to config/tactics.js's 4 existing presets (no more, no less) and no pic shows a deeper
  edit screen, (A)/click on a cell immediately applies that preset (reuses the unchanged M11
  `setTactic` mutator) rather than opening a separate confirmation step.
- [PIC-GUESS] Instruction category cards' small green checkmark badge: the 9 CUSTOMISE_FORMATIONS_
  PLAYER_INSTRUCTIONS_* pics are inconsistent — the very first frame of each position group (before
  any (R) cycling) shows no checkmarks, every subsequent frame shows one on all 3 cards regardless
  of selection. Read as a render/capture-timing artifact of the *first* frame rather than a
  deliberate state, matching F1's own precedent for a similar single-inconsistent-pic call — cards
  always render the checkmark (`ui/formationsui.js`'s `renderInstructionsCategoryCards`).
- [JUDGMENT CALL] Player Instructions position-group membership (`js/config/instructions.js`):
  the 3 pics each sample exactly one player (Taylor/ST, Hollands/CM, Barcham/LM), never the full
  roster, so the complete membership of FORWARDS/INSIDE_MID/OUTSIDE_MID isn't pic-evidenced.
  Assigned FORWARDS = every ATT-area code (RF/CF/LF/RS/ST/LS/RW/LW), INSIDE_MID = the 6 central mid
  codes (RCM/CM/LCM/RAM/CAM/LAM), OUTSIDE_MID = the 2 wide mid codes (RM/LM); every DEF-area code,
  GK, and the 3 CDM codes ("Defensive Midfielder" in config/positions.js) get no instructions page
  at all, matching the build note's "defensive positions get none — matches pics."
- [JUDGMENT CALL] Selecting a no-instruction-group player (a defender/CDM/GK) in Instructions mode
  is a no-op — (A) simply does nothing — rather than inventing a fallback "no instructions
  available" screen with zero pic evidence for its wording.
- [PIC-GUESS] FORMATIONS grid navigation: the 6 FORMATIONS_PAGE pics show a scrollbar thumb on the
  grid's right edge and no LB/RB prompt in the footer, so this reads as a continuously-scrolling
  3-column list (arrow keys walk cell-by-cell; `js/core/store.js`'s `teamSheetFormationsCursor` is
  an absolute index 0-33, not a page pointer) rather than shoulder-button-paged pages — the visible
  "page" is just whichever 6-cell window contains the cursor. `config/formations.js` still exposes
  `gridPage`/`gridPageCount` (6 pages, last one 4 cells) for windowing math and tests.
- [JUDGMENT CALL] The FORMATIONS grid's cell 0 ("`<Club>` / Default Formation", pic-verbatim label)
  is a synthetic pseudo-entry that always points at "4-4-2"/"Flat" — matches gen/squad.js's
  XI_TEMPLATE (the shape every generated squad's Default Team Sheet already uses); no per-club
  default-formation data exists anywhere in this codebase to look up instead.
- [TUNED] Formation pitch coordinates (`config/formations.js`): none of the 6 FORMATIONS_PAGE pics
  actually show a non-4-4-2 XI on the pitch — the cursor browses the list while the pitch keeps
  rendering Portsmouth's real "4-4-2 Flat" sheet in every capture. Coordinates for the other 32
  formations are therefore a from-scratch generic per-shape layout generator (`baseSlots`), not
  hand-placed: fixed x-bands per line-width (1/2/3/4/5-wide), y-bands per total line count (3 or
  4), defensive/attacking/midfield position-code tables keyed by line width + depth bucket
  (dm/cm/am), plus small cosmetic-only style nudges for Diamond (reshapes a flat 4-wide mid line
  into an actual diamond — the one style with real shape semantics), Wide, Attack, Defend/Holding,
  and False 9. `formationSlots()` output for "4-4-2"/"Flat" intentionally matches gen/squad.js's
  existing XI_TEMPLATE coordinates so re-selecting the club's already-active default is a
  no-visible-op — confirmed in the browser (re-picking the default cell doesn't visibly move any
  jersey).
- [TUNED] `remapLineupToFormation`'s best-fit scoring (plan2.md F2.1: "re-maps the XI by best-fit
  position", no formula given): +4 for an exact position-area match, +1 for an adjacent area
  (DEF↔MID, MID↔ATT), +2 for a side match (L/R/C), +0.5 if either side is center — slots filled
  DEF-first (scarcest good fits) so a shape with fewer defenders than the current XI doesn't stand
  a centre-back in an attacking slot purely by processing order. Re-seeds every slot's Player
  Positioning baseline on every formation change (a fresh shape needs a fresh ±8% clamp anchor).
- [TUNED] `ui/panelkit.js`'s `teamStars(rating)`: `reference/ini/teamutils.ini`'s `[IS_STAR_RATING]
  RATING=82` is the only anchor point given anywhere (⇒ overall 82 = full 5★) — linear bands
  stepping down every 6 rating points below it (`(rating-52)/6`, clamped 0-5, rounded to the
  nearest half-star). First real consumer of this constant (F0 only defined the surrounding
  `teamMedallion` component; F2's FORMATIONS/ROLES/TACTICS-adjacent medallion is the first place
  it's actually computed from live data).
- [TUNED] Team medallion ATT/MID/DEF inputs (`ui/formationsui.js`'s `sectionRatings`): mean overall
  of the *current XI's* players in that slot's area (plan2.md §B5's own "section ratings = mean of
  best XI per line" wording, implemented literally) — not a whole-squad-depth-weighted figure.
  Browser-verified numbers (e.g. 63/61/62) don't chase pixel-exact matches against the captured
  save's own 64/63/63, since no derivation formula exists to reverse-engineer against.
- [TUNED] Player Instructions sim hooks (plan2.md F2.2: "±2-10% weighting tweaks inside sim/
  events.js chance attribution"): this engine has no through-ball/cross/central "chance type"
  taxonomy at all (sim/events.js just weight-picks a shooter/assister by attribute composite via
  engine/sim/core.js's `pickWeighted`) — every per-instruction effect in `config/instructions.js`
  is therefore a small SHOOTING_ATTRIBS/ASSIST_ATTRIBS weight multiplier (`pickWeighted`'s new
  optional `multiplierFn` parameter) rather than a literal implementation of the plan's own
  per-instruction wording. Scoped to the user's own club's *interactive* matches only
  (`engine/sim/match.js`'s `buildInstructionMults`, threaded into `simulateSegment`), matching the
  plan's explicit "inside sim/events.js" text — CPU-vs-CPU quick-sim and the user's own quick-simmed
  cup/continental ties are untouched.
- [TUNED] ROLES tab "corner takers weight assist attribution" (plan2.md F2.4): reuses the exact
  same `pickWeighted` multiplier hook instructions use — a flat +0.10 assist-weight bonus
  (`CORNER_TAKER_ASSIST_BONUS`) for whichever player(s) hold `leftCornerId`/`rightCornerId`, same
  "no dedicated set-piece chance type to redirect into" limitation.
- [DEFERRED, not dropped] "captain: +2 morale (0-100 scale) while captain" (plan2.md F2.4's own
  ROLES sim-hooks line): `player.morale` doesn't exist as a mechanic anywhere yet — F6's own
  engine/morale.js is where this field, its 0-100 scale, and its level bands get designed from the
  INI. Implementing a parallel morale number now would risk conflicting with F6's real design, so
  this hook is intentionally not wired — flagged here for F6 to pick up.
- [JUDGMENT CALL] Free-kick takers (`shortFreeKickId`/`longFreeKickId`) are stored and displayed
  (ROLES grid, assignable via the picker) but have no sim effect — same "no set-piece chance type"
  limitation as the two hooks above, and free kicks specifically have no existing goal/chance
  pathway at all to attach a taker bonus to (unlike corners, which piggyback on the existing
  ASSIST_ATTRIBS pool).
- [JUDGMENT CALL] Player Instructions are stored **per team sheet** (`squad.sheets[i].instructions`,
  mirrored to `squad.instructions` the same way lineup/bench already are), not globally per player —
  plan2.md only explicitly scopes Player *Positioning* to "persists to the active sheet"; Player
  Instructions just says "store per-player" without specifying sheet-scope. Chose per-sheet for
  consistency (a second sheet is a different tactical system, so different instructions make
  sense) and because Positioning's own explicit scoping sets the nearby precedent. Roles (captain,
  corners, free kicks, penalty taker) stay squad-level, unchanged — matches the existing M11
  captainId/penaltyTakerId precedent, which was never per-sheet.
- [JUDGMENT CALL] "(X) Reset All Instructions" footer prompt (Instructions editing state) is taken
  literally — clears **every** player's instruction picks team-wide, not just the player currently
  being edited. The pic's own label has no "for this player" qualifier, unlike Positioning's
  differently-worded "(X) Reset Changes" (which *is* scoped to the focused player only, per its own
  label).
- [JUDGMENT CALL] Positioning's "(Y) Change Role" footer prompt is pic-exact
  (ms_TEAM_SHEET_VIEW_FORMATIONS_CUSTOMISE_FORMATIONS_PLAYER_POSITIONING.png) and is shown for
  fidelity, but wired as a documented no-op — no pic anywhere shows what pressing it opens, and
  nothing in plan2.md describes a "player role" concept distinct from the ROLES tab's 6 set-piece
  roles. Same footing as the permanently-locked Edit Player tile: visible for pixel fidelity,
  intentionally non-functional rather than inventing a screen with no reference.
- [PIC-GUESS] ROLES tab's thin decorative strip between the captain header card and the "PLAYER
  ROLES" grid (`ms_TEAM_SHEET_VIEW_ROLES.png` shows two generic jersey icons on a green strip, no
  legible labels at capture resolution) — rendered as pure decoration
  (`ui/rolestacticsui.js`'s `renderRolesHeader`'s neighbour markup), no interaction implied or built.
- [TUNED]/[JUDGMENT CALL] Injury List screen (`ui/injurylistui.js`): no reference pic exists for
  this screen's actual content anywhere in `REFERENCE_PICS/` — only its Squad-hub tile hover
  teaser is captured. Built per plan2.md F2.6's own instruction ("simple fx-panel table of current
  injuries (player, injury name, days remaining)") using §B1's fx-panel template directly: title
  "INJURY LIST", a Pos/Player/Injury/Days Remaining table, empty state "No Injuries" (no pic
  evidence for this exact string either — chosen for readability, logged since every other
  empty-state string in this codebase was pic-sourced and this one isn't).
- [TUNED] 12-entry named injury subset (`config/injuries.js`, reference/ini/fitness.ini): the INI's
  `INJURY_NAME=n` fields are localization-string indices with no string table in this repo, so
  names are Title-Case renders of each `[FITNESS_<NAME>]` section's own key (e.g. `FITNESS_PULLED_
  HAM` → "Pulled Hamstring"); `RECOVERY` day counts per light/medium/severe tier are ported
  verbatim, cited section-by-section in the file header. `pickInjuryName` is flavour-only — the
  actual `daysLeft` still comes from plan1 M5's own `SEVERITY_DAY_RANGE` roll in `engine/
  fitness.js`, unchanged, so this doesn't quietly alter an already-tested, out-of-scope mechanic.
- Kit Numbers (`ui/kitnumbersui.js`) rebuilt onto §B1's `fxPanel`/`fxIdentityHeader` per
  `ms_EDIT_KIT_NUMBERS_PAGE(.._SELECTED_PLAYER).png` — this is the *first* real production
  consumer of `fxIdentityHeader` (F0 only wired it into `dev/kit.html` for eyeballing). Title fixed
  to the pic-exact singular "EDIT KIT NUMBER" (was never literally wrong before — the old markup
  used a `news-crumb` breadcrumb instead of a title bar at all). Footer prompt is now genuinely
  dynamic ("Select Player" ↔ "Edit Kit Number", matching the two pics) — was previously a static,
  always-on "Select / Edit Number" label that never actually changed.
- [ENGINE FIX] CSS specificity bug found during browser QA: `.fm-dpad__up`/`__down`/`__left`/
  `__right`'s `border-*-color: currentColor` were silently losing to the base `.fm-dpad i { border:
  8px solid transparent; }` rule — `.fm-dpad i` (class+type selector) has specificity (0,1,1),
  beating the single-class `.fm-dpad__up` (0,1,0) regardless of source order, so every TACTICS
  D-pad icon rendered fully invisible (all 4 borders transparent). Fixed by qualifying the
  direction selectors as `i.fm-dpad__up` etc. (ties the base rule's specificity, wins on later
  source order) — caught by a headless Playwright pass, not visible in a static code read.
- [ENGINE FIX] `.fm-instcard__pager` (the selected instruction category's ‹ • • • › cycle control)
  had no `display:flex`, so its three children (prev button / dots / next button) stacked
  vertically instead of sitting in a row — fixed by adding the missing flex rule. Also caught only
  by an actual rendered screenshot, not a code read (the SQUAD tab's own equivalent pager already
  had `display:flex` via a *different*, unrelated §B4 class it happens to also carry).

Testing: extended `dev/tests.js` with 42 new assertions (formations catalogue shape/bounds/remap,
instructions groups/effects, `pickWeighted`'s new multiplier hook, the 12 named injuries,
`teamStars`, and a live-Store walkthrough of applyFormation/Instructions/Positioning/Tactics/Roles)
— 461/461 total, all green. Manual QA via a headless Playwright session (chromium, this
environment has no interactive browser): new game as Portsmouth, full FORMATIONS grid scroll +
formation select + Customise Formation menu + Player Instructions (browse → select → cycle
options → change category → Reset All) + Player Positioning (drag via mousedown/mousemove,
keyboard nudge confirmed clamped to baseline±8%, Reset Changes) + TACTICS tab (D-pad select) +
ROLES tab (squad-list picker → assignment, confirmed on-screen) + Kit Numbers (select, edit,
stepper, Kit Changes log) + new Injury List screen, then the §A5.4 regression (advance 12 days
from July 1, all 5 hubs revisited) — zero console/page errors throughout the entire session. Two
real CSS bugs (both logged above as [ENGINE FIX]) were caught and fixed during this pass and would
not have been visible from a static code read.

## F2-fixes — 2026-07-17

Owner played the built F2 milestone and reported 9 concrete bugs/gaps. All 9 fixed in this pass;
none required a new §A3 stop-and-ask (each had a single unambiguous correct behavior once
diagnosed). Logged here as its own dated section per §A6.

- [ENGINE FIX] **Player Instructions carousel appeared "stuck on default."** Root cause:
  `core/router.js`'s click handler checked `e.target.closest('[data-action="instr-cat"]')` *before*
  checking `[data-action="instr-cycle-prev/next"]` — the ‹/› cycle buttons are nested *inside* the
  selected card's own `data-action="instr-cat"` div, so `.closest()` matched the ancestor first and
  returned early on every click on either button, before the click ever reached
  `teamSheetInstrCycleOption`. Keyboard (R) worked the whole time (a separate code path), which is
  why this wasn't caught in the original QA pass — that pass drove the keyboard path, not a real
  mouse click on the chevrons. Fixed by reordering the two more-specific checks first. Verified via
  a real Playwright mouse `.click()` on the rendered ‹/› button (not a direct store-method call).
- [JUDGMENT CALL] The instruction category's green checkmark badge (`.fm-instcard__check`) was
  unconditionally rendered on *every* card regardless of state, which made it decorative noise, not
  the "currently selected [i.e. deliberately set, non-default] value" the owner described. Changed
  to only render when that category's pick differs from `cat.defaultIndex` — now genuinely means
  "this player has a non-default instruction here."
- **Stale gold-ring cursor.** `instrFocusIndex`/`posFocusIndex`/`attrPage` were never reset on
  entering or leaving Instructions/Positioning, so the ring (and right-panel attribute page)
  stayed parked on whichever player was last edited across visits. Fixed by resetting all three to
  0 in both `teamSheetCustomiseMenuSelect()` (entering) and `teamSheetBack()`'s
  instructions/positioning → menu branch (leaving).
- [OWNER CORRECTION] **Player Positioning's "(X) Reset Changes"** originally read the pic's
  unqualified footer label ("Reset Changes", vs. Instructions' "Reset **All** Instructions") as
  scoped to the focused player only — the owner corrected this: it should reset the *whole* XI back
  to the active formation's default layout. `teamSheetPosReset()` now loops every `squad.lineup`
  entry back to its own `baseX`/`baseY` instead of just `lineup[posFocusIndex]`. (The per-slot
  baseline itself was always "stored somewhere" correctly — `entry.baseX/baseY`, seeded by
  `applyFormation`/`seedFormationBaseline` — the bug was only in what Reset touched.)
- **FORMATIONS grid: only 6 of 33 formations reachable by mouse, no scrollbar.** All 33 catalogue
  entries were always present in `config/formations.js` (unchanged) — the bug was entirely in
  `ui/formationsui.js`'s windowing + `core/router.js`'s missing input wiring: the visible 6-cell
  window was hard-pinned to `gridPage()`'s fixed page boundaries (arrow-key paging *did* technically
  reach every cell, but jumped straight from cell 5 to cell 6 with nothing between, and there was no
  mouse-wheel listener at all, so a mouse-only user had no way to see cells 6-33). Reworked to a
  `formationsScrollRow` (row index, independent of the click/keyboard cursor) that arrow-key paging
  now auto-scrolls to keep the cursor in view, plus a new `wheel` listener
  (`teamSheetFormationsScroll`) that scrolls the window on its own — and a thin visual scrollbar
  matching the pics' own scroll-thumb affordance (`ms_TEAM_SHEET_VIEW_FORMATIONS_PAGE_1.png` shows
  one, not shoulder-button page dots).
- **Formations/Customise screens showed a crest banner and a cramped pitch.** No FORMATIONS/EDIT/
  INSTRUCTIONS/POSITIONING pic shows a crest banner (that's SQUAD-tab-only) — F2's original build
  reused `renderPitchPanel()` unconditionally, which always drew one, and additionally laid the
  FORMATIONS list out as a flex sibling *below* the pitch (`flex: 1 1 45%` vs `55%`), squeezing it.
  Fixed both: `renderPitchPanel()` gained a `showCrest` param (false on all 4 formationsui.js call
  sites); the list panel (`fm-gridpanel`) now nests *inside* the pitch panel as a `position:
  absolute`-pinned overlay (`.fm-gridpanel--overlay`), the same treatment
  `css/teamsheet.css`'s `.sqts-drawer--open` already uses for the SQUAD tab's own Substitutes/
  Reserves drawer — the pitch itself is now full-height, with the overlay floating on top.
  [TUNED] overlay height (29%) measured directly off `ms_TEAM_SHEET_VIEW_FORMATIONS_PAGE_1.png`
  (DEF row fully visible above it, only the GK's name clipped, matching "Gersheck" there).
- **ROLES picker had no hover feedback and always showed the team medallion.** Added
  `rolesPickerFocusId` (seeded to whichever player already holds the role, or `roster[0]`) driven
  by mouse-hover (`core/router.js`'s `mousemove`) and Up/Down keys; the picker's right pane now
  shows that player's own §B4 attribute panel (with its usual prev/next carousel, reusing the
  existing `attrpage-*` wiring) instead of the medallion, and the hovered row gets a gold *outline*
  (`.fm-pickerbody tr.is-focus`, distinct from `.is-sel`'s gold *fill* used elsewhere) rather than a
  fill, matching the pitch jerseys' own ring-vs-fill "browsing vs. selected" convention. Closing the
  picker (pick made) already correctly fell back to the team medallion — that part needed no fix.
- [ENGINE FIX] **Injury List overlay persisted over every other screen after closing, until a full
  reload.** Every other overlay in this codebase defines its own `#foo-overlay { display: none; }`
  / `.is-active { display: block; }` pair in its dedicated CSS file — `css/formations.css` (which
  owns `ui/injurylistui.js`'s markup, per its own file header) never got one. `#injurylist-overlay`
  therefore rendered as a plain (visible) block the instant `renderInjuryList` populated its inner
  `#injurylist-body`, and removing `.is-active` on close did nothing since there was no rule making
  `.is-active`'s *absence* mean hidden. Fixed by adding the missing pair.
- **Formation/Instructions/Positioning/Roles/Tactics edits didn't survive a page refresh.** Two
  separate bugs stacked here:
  1. `main.js`'s `wireAutosave()` only listened for the `"advance"` event (fired once a day, on
     Central's own Advance tile) — every Team Sheet mutator instead emits `"teamsheet"`, which
     autosave never observed, so *any* Team Sheet edit was lost on refresh unless the user happened
     to advance a day afterwards. Fixed by also listening on `"teamsheet"`, debounced 800ms (most
     `"teamsheet"` emits are just mouse-hover focus moves or a mid-drag nudge, not real edits worth
     a separate IndexedDB write each).
  2. Even with (1) fixed, the 4 new ROLES fields specifically (`leftCornerId`/`rightCornerId`/
     `shortFreeKickId`/`longFreeKickId`) still came back `null` after a reload. `core/store.js`'s
     `hydrateFromSave` already read `saved.squadLeftCornerId` etc. (this milestone's own "F2: a
     pre-F2 save has none of these" fallback comment shows the intent was always there), but
     `core/db.js`'s `serializeSave`/`deserializeSave` — which do a manual field-by-field allowlist,
     not a generic deep clone — were never actually extended to produce/consume those 4 fields
     alongside the pre-existing `squadCaptainId`/`squadPenaltyTakerId`. A genuine gap left over from
     F2's own original implementation, not something this fixes pass introduced. Formation changes
     and Player Instructions were never affected by this second bug (both live inside
     `squad.sheets`, which *is* serialized wholesale via `squadSheets`).

Testing: extended `dev/tests.js` with 13 more assertions (stale-cursor reset on enter/leave,
formationsScrollRow scroll/clamp/auto-scroll behavior, Reset Changes now covering the whole XI, the
ROLES picker's focus-seeding/hover-move/clear-on-pick, and a dedicated
`serializeSave`/`deserializeSave` round-trip for all 4 ROLES fields) — 475/475 total, all green.
Manual QA via a fresh headless Playwright session covering all 9 items above individually (each
verified against both live store state *and* a real rendered screenshot/real mouse event, not just
a direct store-method call) plus a dedicated reload test (apply a formation + assign a role, wait
past the debounce, `page.reload()`, confirm both survived) and the full §A5.4 regression (new game
as Portsmouth, advance 12 days past a match day, all 5 hubs) — zero console/page errors throughout.

### Follow-up — same day, 2 more owner reports

- [ENGINE FIX] **"Gold select is still present when going into Instructions/Positioning."**
  `renderPitchPanel(state, ts, highlight)`'s `highlight` contract had a gap: passing `null` (the
  FORMATIONS grid's and EDIT menu's own calls) fell back to the SQUAD tab's own `ts.focus`/`ts.armed`
  state for *every* jersey — and critically, so did every *non-matching* jersey when an explicit
  `{index, kind}` highlight object *was* passed (Instructions/Positioning), since the per-jersey
  fallback (`highlight && highlight.index === i ? highlight.kind : null`) only overrode the one
  matching slot and left every other slot's `forceRing` as `null`, which itself falls back to
  `ts.focus`/`armed` again. Net effect: (a) the plain FORMATIONS grid/EDIT menu screens — which no
  reference pic shows any ring on — always showed a stray gold ring on whichever slot `ts.focus`
  defaults to (index 0, or wherever the user last left the SQUAD tab), and (b) Instructions/
  Positioning could show a *second*, unrelated ring on top of the intended one whenever `ts.focus`
  didn't happen to coincide with `instrFocusIndex`/`posFocusIndex`. Confirmed via direct DOM
  inspection (`document.querySelectorAll('.is-focus, .is-armed')`) with `ts.focus` deliberately set
  away from the highlighted slot before this fix, and again after. Fixed by giving `highlight` a
  real 3-way contract: `null` = SQUAD tab's own fallback behavior (unchanged), `false` = override
  mode with no match anywhere (used by the grid/EDIT menu — forces every jersey to no ring), an
  `{index, kind}` object = override mode where the matching slot gets the ring and *every other*
  slot is explicitly forced to none (no more fallback leak). `showSwapIcon` (a SQUAD-tab-only
  concept — swap-arming a slot) got the same `ts.tab === "squad"` guard for the same reason, even
  though no report named it specifically — same latent leak, same fix shape.
- **"In Edit Formation, the field doesn't reach the top of the tile, bottom rows cut off."**
  Investigated via precise `getBoundingClientRect()` measurement (not just eyeballing screenshots)
  of `.fm-pitchpanel`/`.sqts-pitch`/`.fm-gridpanel--overlay` across all 4 FORMATIONS states (grid,
  EDIT menu, Instructions, Positioning): all four measured byte-identical (`top:196/197`,
  `height:464-466px`, matching `#sqts-body` exactly) — the crest-removal/overlay fix from the
  earlier pass is structurally correct and already reaches the top on every one of these screens.
  Could not reproduce a sizing difference specific to "Edit Formation." The stray gold-ring bug
  directly above (a glowing ring sitting right where the GK's jersey gets clipped by the overlay
  boundary) is the most likely explanation for what read as a rendering glitch — logging this as
  [DEFERRED, not dropped]: if it's still visible after the ring fix lands, it needs a screenshot to
  diagnose further, since measurement alone couldn't surface a distinct bug here.

Testing: 2 more `dev/tests.js` assertions (`renderPitchPanel`'s highlight override mode, both the
"no ring anywhere" and "exactly one ring, no leaked second one" cases, with a deliberately stale
`ts.focus` set in both) — 477/477 total, all green. Re-ran the full manual QA/regression pass
above unchanged; screenshotted the EDIT menu again post-fix to confirm zero rings render.

### Follow-up #2 — same day, "field still cut off"

Owner reported the field was *still* cut off by the panel below on FORMATIONS/EDIT/Instructions/
Positioning, even after the crest-removal + full-height pitch fix. Investigated with precise
`getBoundingClientRect()` measurement of the actual jersey element vs. its containing panel:

- [OWNER CORRECTION] The round-1 fix's `.fm-gridpanel--overlay` (a `position:absolute` panel
  pinned over the *bottom* of a full-height pitch, deliberately matching
  `ms_TEAM_SHEET_VIEW_FORMATIONS_PAGE_1.png`'s own look — that pic's GK, "Gersheck," is genuinely
  half-hidden behind its FORMATIONS list) was working exactly as designed, but the owner doesn't
  want *any* player ever hidden, pic fidelity notwithstanding. Reverted to a plain in-flow flex
  layout — pitch panel above, list/menu/cards panel below, siblings, never overlapping — same shape
  as the original (pre-this-fixes-pass) F2 build, just without the crest banner (still dropped:
  still dead weight now that nothing overlaps the pitch, and no pic shows one on any of these 4
  screens regardless). `.fm-pitchpanel`/`.fm-gridpanel` flex-basis: 65%/35% (was the original F2
  build's 55%/45%, but that was against a pitch box that also had to fit a ~70px crest banner —
  with the banner gone, 65/35 nets a *bigger* pitch than the original ever had, while still leaving
  the panel below usable).
- [ENGINE FIX] Even at a generous flex split, the goalkeeper's jersey (`css/screens.css`'s
  `.jersey` — a **fixed** 96px-wide element, not sized proportionally to its container) was still
  getting its bottom ~8px clipped by `.fm-pitchpanel`'s own `overflow:hidden` — its `top:92%`
  anchor point, centered via `transform:translate(-50%,-50%)`, needed the pitch box to be
  ≈400px tall for the fixed-height jersey element to fit entirely within it, which no flex split
  narrow enough to leave the panel below any real room could reach. In the SQUAD tab, this never
  surfaced because that screen's pitch/crest-banner/drawer-bar all share *one* combined
  `overflow:hidden` box (466px total) rather than the pitch being its own separately-clipped
  sibling, so the same jersey had slack to spare there by coincidence, not by design. Root-caused
  via `getBoundingClientRect()` comparison of the SQUAD tab's (fully visible) GK jersey against the
  FORMATIONS tab's (clipped) one — not something a static code read or a coarse screenshot glance
  would have caught. Fixed by nudging the GK's `y` coordinate from 92 to 86 in both
  `config/formations.js`'s `baseSlots()` and `gen/squad.js`'s `XI_TEMPLATE` (kept in sync per that
  pair's existing documented parity contract) — confirmed via grep that no engine/sim code reads
  `entry.x`/`entry.y` at all (purely a Team Sheet display coordinate), so this is cosmetic-only and
  safe. Re-verified `.fm-pitchpanel`'s GK-jersey-bottom now sits ~10px clear of the panel edge, and
  the SQUAD tab's own GK (also affected by the shared XI_TEMPLATE value) still renders with room to
  spare.

Testing: full `dev/tests.js` suite re-run unchanged (no new assertions needed — this was a pure
layout/coordinate fix with no new store-level behavior) — 477/477 still green. Re-verified via
`getBoundingClientRect()` (GK-bottom-vs-panel-bottom clearance, now positive on all 4 screens) and
fresh screenshots of all 4 FORMATIONS states plus the SQUAD tab, then the full manual QA + §A5.4
regression pass once more — zero console/page errors throughout.

## F3 — 2026-07-18

Transfers: PLAYER SEARCH filter tiles → SEARCH RESULTS (tabs/cards/report + action menu) → My
Shortlist, plus the Approach — Transfer/Loan Offer paper dossier and the shared CONTRACT
NEGOTIATION fx-panel. New files: `js/ui/searchui.js`, `js/config/summary.js`,
`js/engine/enquiry.js`, `css/search.css`. Rewritten: `js/ui/transfersui.js` (Search Players moved
out entirely; Negotiation's fee/contract/loan phases rebuilt as the dossier/panel — Sell List and
Request Funds untouched, still F4/F6). Extended: `js/core/store.js`, `js/core/router.js`,
`js/core/db.js`, `js/engine/negotiation.js`, `js/engine/freeagents.js`, `js/engine/contracts.js`,
`js/engine/teamdecision.js`, `js/engine/gtn.js`, `js/config/contract.js`, `index.html`. This
session had no live browser available via the usual tooling — Playwright's Python package turned
out to be pre-installed, driven headless against the machine's own Chrome binary
(`p.chromium.launch(executable_path=...)`); every manual-test claim below is from that, not a
static code read.

**Reference-pic reconciliation (hub tile carousels) — the plan's own guessed layout was wrong:**
- [PLAN-TEXT CORRECTION] `ms_TRANSFERS_SCREEN_*_HOVER.png` (11 pics) reveal a completely
  different tile→page mapping than plan2.md's own F3 build note guessed. Actual, pic-verified:
  top-middle tile = Search Players(1) → **Scout Instructions**(2) → My Shortlist(3); the plan's
  guess of "Search Players / My Shortlist / Transfer Negotiations" was wrong on 2 of 3 pages.
  Transfer Negotiations is actually page 2 of the **Sell Players** tile (top-right, 2 pages, not
  the 3 the plan guessed with "Transfer History" as a 3rd). Transfer History is actually page 2 of
  the **Finances** tile (bottom-right) — a pairing the plan never mentioned at all. The wide
  top-left tile (`ms_GTN_INSTRUCTION_1/2/3_REPORT_SHORTCUT_HOVER.png`) is a separate 3-page
  carousel previewing each active scout instruction's report/status — distinct from the plain
  "GLOBAL TRANSFER NETWORK" banner tile (bottom-left, single page, hub entry point only).
  F3 only owns the Search-tile mapping (its own screens); Sell/Finances tile page-counts are
  logged here for F4's benefit but not built/wired this milestone (out of scope, unchanged).
- [DEVIATION-RESOLVED via pics] The Search tile's page 2 ("Scout Instructions") renders for visual
  fidelity (exact pic text) but isn't `data-open`/clickable — its destination (GTN's own
  Instructions tab) doesn't exist until F5. Same "visible now, wired later" footing as F2's
  permanently-locked Edit Player tile.
- [PLAN-TEXT CORRECTION] Plan2.md's own inline gloss said "ROLE = position-group
  (Any/GK/DEF/MID/ATT)" — `ms_SEARCH_PLAYERS_SCREEN_EXAMPLE.png` (Messi) shows the opposite:
  POSITION holds the area ("ATT") and ROLE holds the specific code ("CF"). Built per the pic:
  POSITION cycles Any/GK/DEF/MID/ATT, ROLE cycles Any + the 28 `POSITION_CODES` (filtered to the
  chosen area, or all 28 if area=Any).

**New engine/config additions:**
- [TUNED] `js/config/summary.js`'s six Search Report "Summary" aggregate ratings (Athleticism/
  Technical Ability/Shooting/Passing/Defending/Mentality) — no INI table exists for FIFA's own
  summary-box math, so these are authored attribute-mean groupings, not reverse-engineered. Sanity
  check against the one worked pic example (Messi, `ms_..._SEARCH_RESULTS.png`): Athleticism,
  Defending and Passing land on the pic's *exact* shown value; Shooting is 1 point off (rounding);
  Mentality can't be checked at all (its most plausible member, `composure`, is never shown on any
  Search Report attribute page in any pic).
- [TUNED] Per-attribute fuzzy ranges for unscouted players — no per-attribute scouting range
  exists anywhere in this codebase (only `player.scouting.ovrRange`/`potRange` are fuzzed); every
  individual attribute chip on the Search Report/My Shortlist pages reuses `scoutingRangeFor`'s
  same half-width band, computed live at render time rather than a new stored/persisted range.
- [PLAN-TEXT CORRECTION, pic-sourced both ways] Search Report's Physical/Technical page labels
  ("Long Passing"/"Short Passing"/"Sliding Tackle"/"Attack Position") are verbatim-different from
  F1's own Team Sheet attribute page labels for the *same underlying fields*
  ("Long Pass"/"Short Pass"/"Slide Tackle"/"Att. Position") — two different FIFA 15 screens, two
  different label strings, both pic-verified. Deliberately NOT reused from
  `ui/teamsheetui.js`'s `PHYSICAL_ATTRS`/`SKILL_ATTRS` — a fresh `PHYSICAL_PAGE`/`MENTAL_PAGE`/
  `TECHNICAL_PAGE` set lives in `ui/searchui.js` instead.
- [TUNED] Squad Role display set (`config/contract.js`'s `SQUAD_ROLE_DISPLAY`/`SQUAD_ROLE_CYCLE`,
  used by both the Approach Offer's "CURRENT CONTRACT" block and the CONTRACT NEGOTIATION panel):
  plan2.md's own F3.6 text names 5 labels ("Crucial 1st Team Player / Important 1st Team Player /
  Rotation Player / Sub / Future 1st Team Player") but this engine only ever had 4 real
  `squadRole` tiers (prospect/rotation/important/crucial, unchanged since plan1 M6) — adding a
  genuine 5th "sub" tier would ripple into renewal odds/loan approval chances/squad generation
  well outside F3's scope, so "Sub" is dropped from the display set; the other 4 map 1:1, 2 of
  them pic-verified verbatim (crucial → "Crucial 1st Team Player" on Messi's Approach Offer card;
  prospect → "Future 1st Team Player" on Maloney's Current Contract). "Do Not Specify" (pic-
  verified as Maloney's own *offered*-but-unset default) is a genuine 5th UI-only choice — sending
  no explicit role promise at all — resolved to "important" at completion time
  (`negotiation.js`'s `resolvedSquadRole`, exported so `freeagents.js`'s approach flow uses the
  identical fallback) since "none" was never a real persisted `squadRole` value.
- [NEW ENGINE] `engine/gtn.js`'s `startPlayerScout` — the action menu's "Ask `<scout>` to Scout
  `<name>`" row targets one already-known player directly (auto-picks the cheapest idle scout,
  Short tier, seeded with exactly that one target) rather than fitting the existing broad
  region/area/tags "mission" model. `processMissionReport`'s find-new-players phase is skipped
  entirely for a `mission.targetPlayerId` mission so it never picks up anyone beyond its target,
  confirmed over 40 simulated report-tick days in `dev/tests.js`.
- [TUNED] Enquiry "not for sale" threshold and range: `ENQUIRY_REFUSE_THRESHOLD = -50` (raw
  `teamdecision` score) is plan2.md's own §A6 worked example for this exact ledger entry, used
  verbatim; `ENQUIRY_RANGE_PCT = 12.5` is the plan's own literal F3.3 wording (wanted fee ±12.5%).
  `engine/teamdecision.js`'s scoring logic was refactored (pure extraction, no behaviour change)
  into a new exported `computeTeamDecisionScore` so both `computeWantedFee` and the new Enquiry
  engine share one source of truth for the raw score.
- [NEW ENGINE] Player-exchange ("And/Or Player: Select Player") in `engine/negotiation.js`: credit
  = `round(exchangePlayer.value × 0.9)` (plan2.md F3.4's own literal spec), evaluated once on the
  *first* fee submission only (locked in across counter-rounds after that) via a needs-check that
  reuses `playerdecision.js`'s own "position group has room" threshold (<4 players sharing the
  overall group) rather than inventing a second needs-check shape — plan2.md F3.4 just said "reuse
  transferai needs check" without naming a function. `n.feeOffer` always stays the pure-cash figure
  (what the UI shows/what gets deducted); the credit is applied only to the accept/counter/reject
  *decision* math, kept as a separate `n.exchangeCreditApplied` field.
- [BEHAVIOUR CHANGE from plan1 M7] Loan negotiation restructured from a one-shot instant
  approval roll into a real editable `phase: "loan"` (Bonus Per Goal/Loan Length/Future Fee) plus
  an explicit `submitLoanOffer`, mirroring `startFeeNegotiation`/`submitFeeOffer`'s own two-step
  shape — required because F3's `ms_APPROACH_LOAN_OFFER_SCREEN.png` shows a real editable dossier
  with a SUBMIT OFFER button, not plan1's original "resolves the instant you request it." Updated
  the one existing test that depended on the old instant-resolve behaviour
  (`dev/tests.js`'s "engine/negotiation.js — loan request + return" group now calls
  `submitLoanOffer` after `startLoanNegotiation`).
- [JUDGMENT CALL, pic-driven discovery] The Approach Offer dossier's `[LT][RT]` BUY/LOAN toggle
  isn't just a UI nicety — `ms_APPROACH_LOAN_OFFER_SCREEN.png`'s right page is still titled
  "TRANSFER OFFER" (not "LOAN OFFER"), proving both modes share **one** dossier/component, not the
  two separate screens plan2.md's F3.4/F3.5 build notes implied by listing them as separate steps.
  Built as one dossier; `negoToggleOfferMode()` restarts the negotiation via
  `startFeeNegotiation`/`startLoanNegotiation` when switched (discards in-progress edits in the
  mode being left, same as picking a different Approach action from scratch would).
- [NEW FIELD, cosmetic only — same "not modelled as negotiable" footing as engine/contracts.js's
  own plan1 M6 header note] Signing On Fee (Contract Negotiation) and Bonus Per Goal (both
  dossiers) are real, editable, stored, and paid at completion, but do **not** yet feed
  `acceptanceChance`/`decisionChance` — wiring `BONUS_ACCEPTANCE_BASE_VALUE=80` into the
  acceptance curve is explicitly F6's own audit task (plan2.md F6.2).
- [PIC-GUESS] "Future Fee" (Loan Offer dossier) — a buy-option amount not named anywhere in
  plan2.md's own text, found directly on the pic. Stored (`Not Set` / an amount, steppable) with
  no option-to-buy mechanic wired yet, same footing as Bonus Per Goal/Signing On Fee above.
- [DEFERRED, not dropped] `player.loan.bonusPerGoal`/`futureFee` are set on loan completion but
  **not** added to `core/db.js`'s positional `serializeSave`/`deserializeSave` array for
  `player.loan` — extending that fixed-position array is a real (if narrow) save-format risk, and
  nothing reads these two fields back yet (F4's own Negotiations ledger will be the first real
  consumer). Session-only for now; flagged here for F4 to extend.
- [TUNED] "(RS) Player Bio" footer prompt — pic-evidenced on both the Approach Offer dossier
  (`ms_APPROACH_TRANSFER_OFFER_SCREEN.png`/`..._LOAN_...png`) and My Shortlist
  (`ms_MY_SHORTLIST_SCREEN.png`) — wired to the existing `store.openPlayerBio`, nests correctly on
  the existing overlay stack (same `openOverlay` push/pop every other nested overlay already uses).
- [JUDGMENT CALL] Action menu's default gold-selected row skips "Ask `<scout>` to Scout" when it's
  disabled (no idle GTN scout hired) and lands on "Add to My Shortlist" instead, rather than
  defaulting the keyboard cursor onto a row (A) can't do anything with.
- Read `ms_CONTRACTS_SCREEN_CONTRACT_NEGOTIATION.png` early, even though it's formally listed
  under F6's own "Pics:" header, not F3's — F3.6's own build text explicitly directs building this
  shared component now ("same component as F6 renewals") since F3 needs a working Contract
  Negotiation step to complete a transfer purchase this milestone; F6 will reuse it unchanged.
- [TUNED] Contract Negotiation's "Player Demands: Length" shows the same figure as the editable
  "Additional Years" field (both default to `n.contractOffer.years`, 3) — this engine has no
  separately-computed *demanded* length, only a demanded wage (`computeSigningAsk` returns only
  `{wage}`); showing one shared number is an honest reflection of that, not a bug.
- Keyboard: LT/RT's §A4 fallback (Z/C) is used for the offer-mode toggle — the first screen in
  this codebase to ever need an LT/RT keyboard binding, so no existing alternate to conflict with.
- Not a code issue, just a note for future test/QA writing: plan2.md's own §A5.4 regression text
  says "Portsmouth (League 1)" — `data/clubs.json` actually has Portsmouth's `leagueId` as
  `"eng-4"` (League Two, per `data/leagues.json`). Used League Two throughout this milestone's
  testing since that's what the real game data says; the plan's own parenthetical is just
  imprecise, nothing here was changed because of it.
- Known fidelity gap, not fixed this pass: the PLAYER SEARCH filter tiles' COUNTRY/LEAGUE/TEAM
  icons (the pic shows a flag-and-stars icon for Country and a ball-in-shield icon for
  League/Team) were not built — only NATIONALITY got its flag icon. Cosmetic-only, logged rather
  than silently skipped.

**Bugs found and fixed during Playwright QA (would not have been caught by a static code read):**
- [ENGINE FIX] A literal `*/` inside `css/search.css`'s own header comment
  (`.apo-*/.cn-*` — intended to mean "the .apo- and .cn- prefix classes") closed the CSS comment
  early. Everything from there to the *next* real `*/` five lines later was consumed as a garbled,
  invalid "selector," and the CSS parser's error-recovery silently ate the very next real rule
  along with it — `#search-overlay, #shortlist-overlay { display: none; }`. Both overlays
  rendered permanently visible (full-screen, transparent, intercepting every click on the page)
  from boot, with no console error of any kind (a dropped/merged CSS rule doesn't throw). Found by
  comparing `document.styleSheets[…].cssRules` (browser's own parsed rule list) against the raw
  file text and noticing the base rule was simply missing from the former. Fixed by rewording the
  comment; verified by re-diffing the parsed rule count/order.
- [ENGINE FIX] `.news-crumb` (`css/screens.css`) is `position:absolute` with a `top:110px` tuned
  for sitting directly inside a `#foo-overlay` root. Nested one level deeper here — inside
  `.sx-body`, itself already `position:absolute` — it positioned relative to `.sx-body`'s own box
  instead of the stage root, landing mid-grid instead of above it and intercepting clicks on the
  PLAYER NAME tile's whole first row. Fixed by giving the F3 screens their own ordinary-flow
  `.sx-crumb` class (visually identical, no `position:absolute`) instead of reusing `.news-crumb`.
- [ENGINE FIX] The POSITION/ROLE and MIN AGE/MAX AGE dual-tiles' *outer* wrapper div also carried
  `.is-focus` (and therefore the same gold gradient) whenever *either* inner row was focused,
  gold-highlighting both stacked rows simultaneously instead of just the actively-focused one.
  Fixed by removing the redundant outer-level class — each `tileHtml()`-rendered row already
  computes its own `.is-focus` correctly.
- [ENGINE FIX] `renderMyShortlist` threw `Cannot read properties of null (reading 'clubId')`
  whenever a player was shortlisted from Search Results' action menu while the My Shortlist
  overlay had never been opened that session: `core/router.js`'s `store.on("shortlist", ...)`
  re-renders unconditionally regardless of which overlay is actually open (same pattern every
  other `store.on(...)` listener in this file already uses), and `state.ui.shortlist.
  selectedPlayerId` was never seeded on add — a non-empty list with a `null` selection tried to
  render a null player's card. Fixed in two places: `store.toggleShortlistPlayer` now seeds/clears
  `selectedPlayerId` on add/remove, and `renderMyShortlist` independently falls back to the list's
  first entry if the stored selection doesn't resolve to a real list member (defence in depth).
- [TUNED] "My Shortlist" (`ms_MY_SHORTLIST_SCREEN.png`) is Title Case, not ALL-CAPS like every
  other `.fx-paper__title` (PLAYER INFO/TRANSFER OFFER on the Approach Offer dossier) — a
  dedicated `.sx-shortlist__title` override (`text-transform:none`) rather than a general §B2
  change, since every other paper-dossier title genuinely is upper-case per its own pic.

**Testing:** `dev/tests.js` extended with 10 new groups (~45 assertions: six Summary groupings
incl. the Messi spot-checks, Squad Role display set, teamdecision score + Enquiry range/refusal
sampling, `startPlayerScout` incl. the 40-day "never finds anyone else" check, `computeSearchResults`'s
filter matrix via a live Store, `buildActionRows`'s free-agent gating, exchange-credit formula
sampling, the loan dossier's editable-phase + 3-6 day response scheduling, My Shortlist's
add/remove-never-duplicates via a live Store, and a `transferShortlist` save/load round-trip) —
535/535 total, all green (2 genuine test bugs caught and fixed along the way: a cross-group
`player.scouting` reference-sharing contamination in `buildM7FakeState`'s shallow clone, and a
GK-filter assertion invalidated by `computeSearchResults`' own 300-result cap making two clearly-
different-sized pools compare equal). Manual QA via headless Playwright (this session had no
interactive browser or existing driver either — Python's `playwright` package was pre-installed
and pointed at the machine's own Chrome binary, `executable_path=`, no `playwright install`
needed): full flow driven end-to-end (new game as Portsmouth → Transfers → Player Search → type a
name → cycle Position → Reset → Search For Players → select a result → cycle Change View through
all 3 report pages → open the action menu → Enquire → Add to Shortlist → Approach to Buy → toggle
Loan mode and back → open the exchange picker and pick a player → direct-entry the Offered
Transfer Sum → Submit Offer → back out to the hub → reach My Shortlist via the tile's 3rd carousel
page → select a shortlisted player → open its action menu), zero console/page errors throughout
after the fixes above landed. §A5.4 regression (new game as Portsmouth, advance 10 days
incl. auto-simmed match days, open all 5 hubs) also clean.
