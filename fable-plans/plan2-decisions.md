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
