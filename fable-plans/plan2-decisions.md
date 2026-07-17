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
