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
