# FIFA 15 Manager Career — Plan 2: Total Fidelity Pass

> **Delivery note (for the session that executes this plan):** the first action after approval is
> to save this document verbatim into the repo as `fable-plans/plan2.md`, commit it, and then
> follow it milestone by milestone.

## Context

`fable-plans/plan1.md` (M0–M11, all committed) turned the visual prototype into a fully playable
manager career: real FIFA 15 world (37 leagues / 606 clubs), generated players, day-by-day
calendar, live-ticker matches, transfers with CPU AI, GTN scouting, youth academy, contracts,
cups/continental/internationals, jobs, and a green `dev/tests.html` harness.

Since then the owner added **~120 authentic FIFA 15 screenshots** under `REFERENCE_PICS/`
(9 top-level + `more_screens/<HUB>_SCREEN/ms_*.png`). They are now the **pixel-and-behaviour
contract** for every screen. Studying them against the current build shows the game is right at
hub level but diverges below it: FIFA 15's sub-screens use several distinct visual languages the
game doesn't have yet (centered dark panels with LB/RB selector bars, paper-dossier documents,
the interactive Team Sheet), and several systems that drive those screens (morale, board
confidence points, traits, shortlist, negotiations ledger, playoffs, player instructions) were
simplified or skipped.

**Goal of this pass:** make the game look and play *exactly* like FIFA 15 manager career mode —
every screen matched to its reference PNG, every mechanic grounded in the FIFA 17 INI files
already vendored at `reference/ini/` (FIFA 17 ≈ FIFA 15 + training; **we do not implement
training** — players grow from playtime + match rating + form only, per `playergrowth.ini`'s
match modifiers, exactly as plan1 M5 built it).

Owner decisions already made for this pass:
- **Button glyphs: keep Xbox letters** (A/B/X/Y). Reference pics that show PS glyphs map as:
  ✕→A(select), ○→B(back), □→X, △→Y, L1/R1→LB/RB pills, L2/R2→LT/RT pills, L3/R3→LS/RS.
- **Traits/Specialities: full-lite system** (generation + display + ~6 sim hooks).
- **Rebuild scope: pixel fidelity wins.** Rebuilding the DOM/CSS of working screens is expected;
  engine modules are kept and only *audited/extended*, never casually rewritten.

---

## PART A — Working rules for the implementing model (read before every milestone)

### A1. The reference-pic protocol (non-negotiable)
1. **Before building or restyling any screen, open its PNG(s) with the Read tool.** Every
   milestone below lists its pics. Transcribe from the image: exact panel titles, column
   headers, label casing (FIFA mixes ALL-CAPS titles with Title Case rows), footer prompts,
   selector bars, empty-state strings (e.g. `NO ITEMS AVAILABLE`, `No Statistics Available`,
   `None`), and layout proportions.
2. **Text is copied verbatim** from the pic (except EA-online elements, §A4). If a label is
   unreadable, pick the most plausible FIFA wording and log it in the decisions ledger (§A6).
3. **After building the screen, verify with the run/verify skill**: serve the repo
   (`python -m http.server`), open the screen, and compare side-by-side against the PNG at
   1280×720. Fix until layout, hierarchy, and text match. A milestone is not done with a
   mismatched screen.
4. Pics were captured at 2560×1440 (2× the 1280×720 stage): halve measured pixel distances.

### A2. The INI protocol
- Every gameplay number comes from `reference/ini/<file>.ini`. Cite the file + section in a
  header comment of the config module (`js/config/*.js`), port values **verbatim**, and add a
  `dev/tests.js` assertion for at least 2 representative values per newly ported table.
- If the INIs genuinely lack a needed number, choose a sensible value, mark it `// [TUNED]`,
  and record it in the decisions ledger.
- Existing config modules were already ported faithfully (spot-checked: `config/value.js`,
  `config/growth.js` match the INIs). **Audit, don't re-port**: diff each existing config
  against its INI section and fix discrepancies only.

### A3. The no-deviation protocol
- **Any** departure from this plan or from a reference pic — cut feature, changed layout,
  renamed label, invented mechanic — must be **presented to the owner and approved before
  implementation**. Stop work on that item, summarize the conflict in 2–4 sentences with the
  pic/INI reference, and wait.
- Two pre-approved deviations (already cleared by the owner via this plan):
  1. **"Talk To Press"** appears in the Calendar legend pic but press conferences are cut —
     omit that legend row.
  2. **Edit Player** tile stays permanently locked (authentic to unlocked=off FIFA settings).
- Keep `fable-plans/plan2-decisions.md` as a running ledger: date, item, what was decided, why
  (§A6). Every `[TUNED]` value, every unreadable-label guess, every engine quirk discovered goes
  in it. The owner reviews this file between milestones.

### A4. Standing visual rules
- EA-online chrome in pics (`PRESS THE START BUTTON TO RE-CONNECT`, EASFC level/XP strip in some
  captures) is **never** reproduced; keep the game's existing header (crest, club, manager,
  XP/coins statusbar, menu). Real player photos in pics → keep the existing silhouette
  `.avatar`; news photos → existing gradient placeholder; real league logos (Barclays etc.) →
  procedural text badges in club colours.
- 1280×720 fixed stage, Saira Condensed / Saira only, no CDNs beyond the existing Google Fonts
  link, no build step, ES modules, all rendering from `GameState` via `js/ui/*` (no logic in UI
  files), all mutations via store/engine.
- Deterministic RNG (`core/rng.js` streams) for every new mechanic. Save-format version bumps
  are allowed per milestone; loading an older save must fail gracefully to the New Game / saves
  screen (no migrations required).
- New CSS goes in new files or extends existing ones; do not rewrite `base.css` tokens.
- Every new screen gets: correct footer prompts (Xbox glyphs), full mouse support, and keyboard
  support following `core/router.js`'s existing conventions (arrows/enter/esc; check what keys
  the router already binds for tile paging and reuse; assign LB/RB→Q/E and LT/RT→Z/C if free,
  else log alternates in the ledger).
- Performance budgets hold: weekend world-sim < 300 ms, screen render < 16 ms typical, save
  < 10 MB after multi-season careers.

### A5. Testing protocol (every milestone)
1. Extend `dev/tests.js` with the milestone's listed assertions; `dev/tests.html` must be green.
2. Run the milestone's **manual script** (listed per milestone) in the browser.
3. Do the §A1.3 side-by-side pass for every pic the milestone names.
4. Run one **regression career**: new game as Portsmouth (League 1), advance through at least
   one match day, open all five hubs. No console errors.
5. Commit per milestone (small intermediate commits fine). Message format: `F<n> <summary>`.

### A6. Decisions ledger format (`fable-plans/plan2-decisions.md`)
```
## F3 — 2026-07-18
- [TUNED] Enquiry "not for sale" threshold: teamdecision points ≤ -50 ⇒ refuse. INI has no
  explicit enquiry mechanic; derived from transferteamdecision.ini [TOTAL_POINTS_CAP].
- [PIC-GUESS] ms_SELL_PLAYERS_SCREEN.png row 3 status label read as "Loan Listed".
```

---

## PART B — Shared design language (build once in F0, reuse everywhere)

New file `css/panels.css` + `js/ui/panelkit.js` (pure render helpers, no state).

### B1. Centered dark panel (`.fx-panel`)
The workhorse of almost every sub-screen (see `ms_CONTRACTS_SCREEN.png`,
`ms_FINANCES_BUDGET_ALLOCATION.png`, `ms_CALENDAR_SCREEN.png`, `ms_TABLES_*.png`,
`ms_PLAYER_STATS_*.png`, `ms_HIRE_SCOUT…png`, `ms_YOUTH_STAFF_SCREEN.png`,
`ms_TRANSFER_NEGOTIATIONS_*.png`):
- Near-black rounded panel (#111418 @ ~97% opacity, 4–6 px radius, subtle top highlight)
  centered on the stage over the stadium-light backdrop; width ~78% (≈1000 px), top ~90 px,
  bottom ~90 px (footer prompts stay on the grass).
- **Title bar**: centered gold condensed title (e.g. `CONTRACTS`, `BUDGET ALLOCATION`,
  `Calendar`, `League Stage`) in a darker strip; optional right-aligned context
  (`Budget: £1,154,000`, `Date 04/07/2015`).
- **Selector bars** under the title: row 1 `[LB][RB] <value>` (e.g. league name), optional
  row 2 `[LT][RT] <value>` (e.g. month, stat category). Rendered as small grey glyph pills +
  white value; clicking pills or pressing bound keys cycles; optional right-aligned logo badge.
- **Identity header** variant: club crest + `MANAGER'S OFFICE` / manager name + budget lines
  (Contracts, Edit Kit Number, Budget Allocation).
- **Sortable table** (`.fx-table`): dark header row with sort carets (`▼CONTRACT LENGTH`),
  zebra rows (#1d2126 / #171b1f), **gold selected row with black text** and a leading `(X)`
  glyph, right-aligned numeric columns, thin scrollbar. X = Sort where the pic shows it.
- **Two-pane** variant: table left, detail panel right (Kit Numbers, Sell Players,
  Negotiations, Youth Squad).

### B2. Paper dossier (`.fx-paper`)
Off-white textured "board document" with dark surround (see
`ms_APPROACH_TRANSFER_OFFER_SCREEN.png`, `ms_APPROACH_LOAN_OFFER_SCREEN.png`,
`ms_REQUEST_FUNDS_SCREEN.png`, `ms_MY_SHORTLIST_SCREEN.png`,
`ms_YOUTH_ACADEMY_YOUTH_SQUAD_PLAYER_INFO.png`): corner clips, blue accent rule under the gold
title, dark-grey body text (Saira Condensed), signature lines (`CHAIRMAN` / `MANAGER` /
`PLAYER`) with a cursive squiggle SVG, and **input rows** as full-width dark-teal bars:
`Enter Amount   (Y) ◄ ► £0` (Y opens direct numeric entry; ◄ ► steps; step size = 10% of the
club's rounded budget magnitude, min £1k).

### B3. Player context card + action menu (`.fx-playercard`, `.fx-actions`)
Seen in `ms_SEARCH…PLAYER_SELECTED.png` and `ms_SELL_PLAYERS_SCREEN_PLAYER_SELECTED.png`:
left-anchored dark sheet with (top) portrait silhouette, `First / Last` name, `AGE / <pos>`
with position colour bar, club name + crest + nation flag, `Height:` / `Preferred Foot:`;
(mid) `OVERALL` chip, `VALUE`, `WAGE`, `FORM` (word, gold), then icon rows: morale word
(`Content`), fitness (`Match Fit`), and a ⚠ tagline (§F8 taglines); (bottom) **action list** —
full-width rows, gold selected with `(A)` glyph, disabled rows dim with explanatory text
(`Squad Size too Small to Release`). Right side may show the R-paged attribute panel (§B4).

### B4. Attribute panel pages + colour scale
Right-hand player panel used by Team Sheet / Search / Shortlist. Header: portrait with **ghost
kit number** behind, `● <POS>` (dot = position colour), big OVR, gold name, green fitness bar.
Title per page; RS pager dots bottom-right (`(RS)● ○ ○ ○ ○`). Pages (outfield):
`Physical and Mental Attributes` (Acceleration, Sprint Speed, Agility, Balance, Jumping,
Stamina, Strength, Reactions, Aggression, Interceptions), `Skill Attributes` (Ball Control,
Crossing, Dribbling, Finishing, FK Acc., Heading Acc., Long Pass, Short Pass, Marking,
Shot Power, + scrolled: Long Shots, Standing Tackle, Sliding Tackle, Volleys, Curve, Penalties,
Positioning, Vision — copy exact split/order from
`ms_TEAM_SHEET_VIEW_SKILL_ATTRIBUTES.png` + `…SCROLLED_DOWN_*.png`), `Player Information`
(Age, Height ft'in", Weight lbs, Nation, Position(s), Foot, Attacking/Defensive Work Rate,
Weak Foot ★, Skill Moves ★), `Specialities / Traits`. GK first page = `GK Attributes`
(GK Diving, GK Handling, GK Kicking, GK Reflexes, GK Pos.). **Compare mode**: second player
docks right, attribute names center, value chips both sides
(`ms_TEAM_SHEET_VIEW_SELECT_PLAYER_SECOND_PLAYER.png`).

**Attribute chip colours** (exact bands, used everywhere):
`≥80 green (#39b54a)`, `65–79 yellow (#e8c227)`, `50–64 orange (#d9822b)`, `<50 red (#c0392b)`.
Chips are small squares with black text on yellow/green, white on red/orange.
**Position colours** (bars, dots, jersey dots): GK `#e8641b` orange, DEF `#e8c227` yellow,
MID `#39b54a` green, ATT `#2f7fd1` blue.

### B5. Stars, medallion, misc
- **Star rating** component (0–5 in halves, gold on grey) for scouts (Experience/Judgment),
  weak foot/skill moves, team stars.
- **Team medallion** (right panel of Formations/Roles): big circular plate with club crest,
  star row beneath, `ATT MID DEF` mini-table (section ratings = mean of best XI per line;
  team stars per `reference/ini/teamutils.ini` `[IS_STAR_RATING] RATING = 82` ⇒ 82 ⇒ 5★,
  linear band downward, log exact bands as [TUNED]).
- **Fuzzy values**: unscouted numbers render as ranges `58 – 68` (two chips, red current-min /
  green potential-max on paper; single-range chips on dark panels) — reuse existing
  `scouting.level` ranges.
- Hub tiles: hovered/selected tile turns gold with black text (existing `.is-gold` look), and
  **per-cell carousel dots** page sub-tiles (existing `carousel.js`) — audit all hubs so dot
  counts match the pics (see hover pics per hub).

---

## PART C — Milestones

Order is dependency-driven; each ends runnable, tested, compared, committed. Estimated relative
weight in parentheses.

---

### F0 — Panel kit, glyph audit, Central fidelity (S)
**Pics:** `FIFA15_CENTRAL_SCREEN.png`, `more_screens/CENTRAL_SCREEN/ms_CENTRAL_SCREEN_HOVERING_*.png`
(4), `FIFA15_CENTRAL_NEWS.png`, `FIFA15_EMAIL_NOTIFICATION_SCREEN.png`.

**Build**
1. `css/panels.css` + `js/ui/panelkit.js` implementing §B1–B5 primitives (panel, title bar,
   selector bars, fx-table, paper, playercard, action list, attribute chips + colour fns,
   stars, medallion). Add a hidden dev page `dev/kit.html` rendering one of each for eyeballing.
2. **Glyph audit**: every footer uses Xbox glyph pills consistently; add LB/RB/LT/RT/LS/RS pill
   styles; replace any stray PS-style leftovers.
3. **Central hub fidelity**: bottom-right tile becomes a 3-page carousel — `TABLES`
   (7-row window, PLD/PTS — exists), `FIXTURES` (next 3 league fixtures w/ crests + dates),
   `TOP SCORERS` (top 3 of user league: name, club crest, goals) per the three hover pics.
   News tile + GTN tile hover = gold. Advance strip day cells show transfer-window ⇄ icon
   during windows (pic shows ⇄ on every day of July) in addition to existing opponent crests.
4. News overlay + Email overlay audit vs pics (tabs, NEW! badge, colored left bars, breadcrumb
   `CENTRAL › NEWS`; email meta block, YES/NO decision rows) — mostly built; fix text/spacing
   drift. Email tabs: `Emails (n)`, `Player Conversations` (renders `NO ITEMS AVAILABLE` empty
   state), `Message Archive` (archived mail; X=Delete, Y=Archive already exist — verify).

**Tests** — harness: colour-band fn (49→red, 50→orange, 65→yellow, 80→green); top-scorers
selector returns ≤3 sorted; window-icon predicate true 1 Jul–1 Sep & 1 Jan–1 Feb, false
otherwise. Manual: hover every Central tile; page bottom-right tile through 3 pages; open
news/email; side-by-side all 7 pics.

---

### F1 — Team Sheet view: SQUAD tab (XL)
The biggest missing subsystem. Entered by clicking the team-sheet feature tile on the Squad hub
(and used pre-match later). Full-stage view, **own sub-tab bar** top-left: `SQUAD FORMATIONS
TACTICS ROLES` (replaces the five-hub tabbar while inside; B backs out to Squad hub).

**Pics:** all `ms_TEAM_SHEET_VIEW_*.png` **except** the FORMATIONS/ROLES ones (next milestone) —
i.e. SELECT_PLAYER(+SECOND), CHANGE_VIEW 1–3, SUBSTITUTES_RESERVES, SUGGESTED_SUBS(+NO_SIMILAR),
PLAYER_INFORMATION, PHYSICAL, SKILL(+2 SCROLLED), SPECIALTIES_TRAITS, plus
`FIFA15_SQUAD_SCREEN.png` left tile.

**Build**
1. **Left pitch panel**: club-crest banner atop a vertical pitch (stand backdrop), XI as jersey
   chips — pos label left, kit SVG in club colours, OVR right, captain `C` badge, name on dark
   bar underneath with **status dot** + **green fitness bar**. Formation label bottom-left
   (`4-4-2` / `Flat`). Bottom drawer bar `SUBSTITUTES/RESERVES` with ▲▼.
2. **Change View (LS / key V)** cycles jersey caption modes exactly per pics: (1) position +
   OVR; (2) energy + form — jersey shows form **trend arrow** (↑ ↗ → ↘ ↓ from form delta over
   last 3 ratings) and the name-bar fill becomes the energy bar; (3) positional colouring —
   pos label hidden, status dot takes the position colour.
3. **Drawer**: scrolling down opens SUBSTITUTES (7 slots) then RESERVES grid — 4-column
   portrait cards (photo silhouette, OVR, name, fitness bar, status dot), gold selected
   (`ms_TEAM_SHEET_VIEW_SUBSTITUTES_RESERVES.png`).
4. **Select Player flow (A)**: first select ⇒ gold ring + swap icon on jersey; second select ⇒
   swap positions/slots (XI↔XI, XI↔bench, bench↔reserve). Teal ring = currently-viewed player
   (right panel follows focus). Esc/B cancels.
5. **Suggested Subs (Y)**: drawer shows candidates for the focused slot ranked by
   same-position → altPositions → best OVR·fitness·form (biases from
   `reference/ini/managerai.ini` — port `[MANAGER_AI]` form/fitness/position weights into
   `js/config/managerai.js`); swap-icon overlay on candidates; empty state text from
   `…SUGGESTED_SUBS_NO_SIMILAR.png`.
6. **Right player panel**: §B4 pages + compare mode. Specialities/Traits page lists
   `Specialities` / `Traits` group headers with rows (or `None`) — data lands in F8; until then
   render from the player fields (empty ⇒ `None`) so the page exists now.
7. **Persistence**: team sheet = ordered XI + bench + reserves + captain refs in state
   (already partially exists as `state.squad.lineup`); extend store so edits here drive match
   lineups, and CPU never touches the user sheet. **Multiple sheets**: hub left tile is a
   6-slot carousel (Default + create-new) — creating copies current sheet; sheets store
   formation + XI + roles; active sheet selectable (matches `FIFA15_SQUAD_SCREEN.png` dots and
   `SELECT TO CREATE A NEW TEAM SHEET` page).
8. Footer per pics: `(A) Advance/Select` variants, `(B) Back`, `(Y) Suggested Subs`,
   `(X) Select Player`, `(LS) Change View` — mirror each pic's prompt row per mode.

**Tests** — harness: swap XI↔bench preserves 11 starters & no dupes; suggested-subs ranking
puts same-position higher than higher-OVR wrong-position (fixture data); form-arrow fn maps
deltas to 5 arrows; GK panel shows GK page first. Manual: full swap flows, 3 change-views,
compare two players, drawer scrolling, create + switch a second sheet, play a match and
confirm the sheet is used.

---

### F2 — Team Sheet view: FORMATIONS / TACTICS / ROLES + Kit Numbers (L)
**Pics:** `ms_TEAM_SHEET_VIEW_FORMATIONS_PAGE_1..6.png`, all
`…CUSTOMISE_FORMATIONS*.png` (incl. PLAYER_INSTRUCTIONS pages ×9 + PLAYER_POSITIONING),
`ms_TEAM_SHEET_VIEW_ROLES.png`, `ms_TEAM_SHEET_VIEW_TACTICS.png`,
`ms_EDIT_KIT_NUMBERS_PAGE(.._SELECTED_PLAYER).png`, squad-hub hover pics.

**Build**
1. **FORMATIONS tab**: pitch top, `FORMATIONS` list bottom — 3-column grid, scrollable, gold
   selected cell (cell text = formation name + optional style line, first cell
   `<Club> / Default Formation`); right panel = team medallion (§B5). **Author the full FIFA 15
   formation catalogue** (~30: 3-1-4-2, 3-4-1-2, 3-4-2-1, 3-4-3 Diamond/Flat, 3-5-2, 3-5-1-1,
   4-1-2-1-2 (+Narrow), 4-1-3-2, 4-1-4-1, 4-2-2-2, 4-2-3-1 (+Wide), 4-2-4, 4-3-1-2, 4-3-2-1,
   4-3-3 (1)–(5), 4-4-1-1, 4-4-2 Flat/Holding, 4-5-1 Flat/Attack, 5-2-1-2, 5-2-2-1, 5-3-2,
   5-4-1 Diamond/Flat) in `js/config/formations.js` with pitch coordinates + position codes;
   transcribe the exact visible names from FORMATIONS_PAGE_1–6 (they're the source of truth;
   the list here is the fallback). Selecting re-maps the XI by best-fit position.
   Footer adds `(X) Customise Formation`.
2. **Customise flow**: breadcrumb `FORMATIONS › EDIT` with two big cards `Player Instructions`
   / `Player Positioning` (gold selected).
   - **Player Instructions** (`FORMATIONS › EDIT › INSTRUCTIONS`): pick a player on the pitch
     (teal highlight), bottom shows that position-group's instruction categories as 3 carousel
     cards (each with RS-dots + current value); right `Info` panel lists that category's
     options with descriptions, selected gold. Transcribe the exact category/option/description
     sets per group from the 9 pics (FORWARDS pages 1–3, INSIDE_MID 1–3, OUTSIDE_MID 1–3;
     defensive positions get none — matches pics). Store per-player; **sim hooks (small)**:
     e.g. `Get In Behind` +10% of that player's chance share converting to through-ball
     chances, `Stay Central`/`Drift Wide` shifts crossing vs central chance mix, defensive
     support option shifts his line's DEF weighting ±2% — implement as ±2–10% weighting tweaks
     inside `sim/events.js` chance attribution, all constants `[TUNED]` in
     `js/config/instructions.js`, logged.
   - **Player Positioning**: drag (mouse) / arrow-nudge the selected jersey within a bounded
     zone around its slot (±8% x/y clamp); persists to the active sheet; `(X) Reset`.
3. **TACTICS tab** (`ms_TEAM_SHEET_VIEW_TACTICS.png` — read it; FIFA 15 shows the
   Speed/Passing/Positioning bars over the pitch with presets): restyle the existing tactics
   UI into this tab (keep `config/tactics.js` presets + modifiers; add the three preset bars
   exactly as the pic shows; the standalone tactics overlay is retired, hub tile now deep-links
   here).
4. **ROLES tab**: header card = current captain (portrait, `C` badge, pos, OVR, name); mini
   pitch strip; `PLAYER ROLES` 3×2 grid: `CAPTAIN / LEFT CORNER / RIGHT CORNER / SHORT FREE
   KICK / PENALTIES / LONG FREE KICK`, each cell icon + assignee surname, gold selected; A
   opens a squad list picker (fx-table) for that role; right panel = medallion. **Sim hooks**:
   penalty/FK taker gets those set-piece chances; corner takers weight assist attribution;
   captain: +2 morale (0–100 scale) while captain.
5. **EDIT KIT NUMBER** screen (from hub tile): §B1 identity-header panel, two panes: `Squad`
   table (pos colour bar, POS, name, number right; gold selected) | `Kit Changes` pane listing
   pending changes (old → new); A=Select/edit number (numeric entry, 1–99, uniqueness enforced
   w/ swap prompt), B=Back commits. Match both pics.
6. Squad-hub tile audit: dots/pages per cell exactly as the three `FIFA15_SQUAD_SCREEN*.png` +
   hover pics (Report/Ranking ×2; Formations/Tactics/Player Roles ×3 — Formations page now
   deep-links to the FORMATIONS tab; Kit Numbers/Injury List/Edit Player ×3). **Injury List**
   page becomes clickable → simple fx-panel table of current injuries (player, injury name,
   days remaining) using `reference/ini/fitness.ini` injury names (port a 12-entry subset into
   `js/config/injuries.js` with recovery-day ranges per severity; wire engine/fitness.js to
   pick named injuries).

**Tests** — harness: formations catalogue ≥28 entries, all 11 coords in bounds, best-fit
remap keeps GK in goal & no dupes; instruction store round-trips; penalty-taker role redirects
pen scorer in a seeded sim; kit-number uniqueness. Manual: cycle all formation pages 1–6
against pics; set instructions on a striker (3 categories) and see Info panel text match pic;
drag positioning; assign all 6 roles; edit two kit numbers incl. a swap.

---

### F3 — Transfers: Search, action menu, dossier offers (L)
**Pics:** `ms_SEARCH_PLAYERS_SCREEN(.._EXAMPLE).png`, `…SEARCH_RESULTS(.._PLAYER_PAGE_2/3,
_PLAYER_SELECTED).png`, `ms_APPROACH_TRANSFER_OFFER_SCREEN.png`,
`ms_APPROACH_LOAN_OFFER_SCREEN.png`, `ms_MY_SHORTLIST_SCREEN.png`,
`FIFA15_TRANSFERS_SCREEN.png` + transfers hover pics (SEARCH/SELL/GTN/SHORTLIST/
NEGOTIATIONS/HISTORY/FINANCES/INSTRUCTIONS shortcuts — set tile dot pages accordingly:
Search tile pages = Search Players / My Shortlist / Transfer Negotiations; Sell tile pages =
Sell Players / Transfer History / (third per hover pic); GTN tile pages = GTN / Scout
Instructions report shortcuts ×3).

**Build**
1. **PLAYER SEARCH** (replaces current filter form): breadcrumb `TRANSFERS › PLAYER SEARCH`,
   8 big filter tiles in 2 rows (PLAYER NAME w/ silhouette + text entry; POSITION + ROLE
   stacked; NATIONALITY; TRANSFER STATUS (Any / Transfer Listed / Loan Listed / Contract
   Expiring / Free Agents); MIN/MAX AGE stacked; COUNTRY; LEAGUE; TEAM — TEAM disabled until
   LEAGUE chosen). Gold selected tile; values under labels; footer `(B) Back (X) Reset
   (Y) Search For Players (A) Select`. ROLE = position-group (Any/GK/DEF/MID/ATT).
2. **SEARCH RESULTS**: breadcrumb `SEARCH RESULTS › Search Report`; top tab strip `ALL ATT MID
   DEF GK`; left 2-col card grid (portrait, name, club crest, `AGE: n`, pos bar+code; gold
   selected w/ (X) glyph; paginated vertically); right report panel: player header (name, club
   + crest + flag, AGE + pos, Height, Preferred Foot) + `Report Status` box + `Summary` box
   with **six aggregate ratings** — Athleticism, Technical Ability, Shooting, Passing,
   Defending, Mentality (define as fixed attribute means in `js/config/summary.js`, log the
   groupings) — chips exact when fully scouted, ranges otherwise; RS pages 2–3 = detailed
   attribute pages (§B4 layout on dark panel; PAGE_2/3 pics). Report Status text varies:
   `Report Complete` (green check, scouting level 3), `Currently Scouting…`, `Not Scouting`
   (+ contextual line, e.g. loan-listed note from the scout-report pic).
3. **Action menu (A on a card)**: §B3 playercard slides over the list with actions:
   `Ask <scout> to Scout <name>` (cheapest idle GTN scout; disabled w/ reason if none),
   `Add to My Shortlist` / `Remove from My Shortlist`,
   `Enquire about <name>` — resolves instantly: computes wanted fee (existing
   `engine/teamdecision.js`); if team-points ≤ [TUNED] refuse-threshold ⇒ "not for sale" line,
   else shows `£lo – £hi` (wanted fee ±12.5%) in the Report Status box and logs an inbox note,
   `Approach <club> to Buy`, `Approach <club> to Loan` (hidden for free agents → `Sign Free
   Agent` contract talks directly).
4. **APPROACH — TRANSFER OFFER** (paper dossier, replaces current fee-talk screen): left page
   `PLAYER INFO` — club-colour banner name card, club bar, OVR/POS/AGE table, VALUE row, gold
   FORM/MORALE rows, `CURRENT CONTRACT` block (Rem. Contract Years+Months, Salary/wk, Bonus Per
   Goal, Squad Role). Right page `TRANSFER OFFER` — `Chief Executive Comments:` paragraph
   quoting the estimated range (wanted fee ±12.5%, phrased per pic), `[LT][RT] BUY/LOAN`
   toggle, `Rem. Transfer Budget` / `Rem. Wage Budget` lines, input rows `Offered Transfer
   Sum:` and `And/Or Player: Select Player` (**player-exchange**: pick one of your players via
   fx-table; his adjusted value ×0.9 counts toward the fee; CPU may reject exchange players
   they don't need — reuse transferai needs check, else counter cash-only), `SUBMIT OFFER`,
   signatures. Footer `(X) Reset (B) Cancel (RS) Player Bio`. Submitting hands off to the
   existing negotiation engine: CPU responds in 3–6 days (`transfer.ini MIN/MAX_DAYS_TO_
   RESPOND`), ≤4 counters (`MAX_COUNTER_OFFERS`), accept/counter/reject odds per
   `transferteamdecision.ini` tables (audit `js/config/teamdecision.js` against §F of the INI
   mining notes below); response arrives as inbox email → reopens this dossier with the
   counter pre-filled.
5. **APPROACH — LOAN OFFER**: read the pic and mirror; loan length options season/short
   (`transfers.ini [TRANSFERS_LOANBUYS] SEASONLOANLENGTH=12, SHORTLOANLENGTH=3`) + monthly wage
   contribution %; reuse existing loan engine.
6. **Contract talks** (after fee accepted / free agent): restyle existing contract-offer step
   as the `CONTRACT NEGOTIATION` fx-panel (same component as F6 renewals; see
   `ms_CONTRACTS_SCREEN_CONTRACT_NEGOTIATION.png`): left `New Contract Details` (Player
   Demands: Length + Salary; editable gold rows: Additional Years ◄►, Salary, Bonus Per Goal %,
   Squad Role picker (Crucial 1st Team Player / Important 1st Team Player / Rotation Player /
   Sub / Future 1st Team Player — transcribe exact set from pics where visible, else [TUNED]),
   Signing On Fee; signatures) | right `CURRENT CONTRACT` (apps/goals, rem. contract, salary,
   bonus, squad role, `Estimated Worth`). Acceptance via existing
   `engine/playerdecision.js` + `playercontract.ini` `PERCENTAGE_OF_ASK` curve; **squad-role
   promise feeds morale expectations (F6) and decision points** (`transfers.ini
   [TRANSFERS_PLAYER_DECISION_POINTS]` GOODROLEOFFER/ROLETOOHIGH/LOW — audit
   `js/config/negotiation.js` has them).
7. **MY SHORTLIST**: paper dossier — left: name-banner card of selected + fx-table
   (`Pos ▲ / Name`) of shortlisted players, (X) remove glyph on selected; right: full
   attribute sheet in four labelled groups `Physical: / Mental: / Technical: / Goalkeeping:`
   two-column chips (ranges when unscouted). Footer `(X) Sort (B) Back (RS) Player Bio`.
   Shortlist state: ids + dateAdded; A opens the same action menu as search results.

**Tests** — harness: filter fn matrix (each filter independently narrows a fixture pool);
free agents excluded from Approach-to-Buy path; enquiry range brackets wanted fee; exchange
player credit = round(adjValue×0.9); offer-response scheduling within 3–6 days; shortlist
add/remove idempotent. Manual: full buy of a scouted player through dossier w/ one counter
round; loan approach; free-agent signing; shortlist sort + bio; compare all 7 pics.

---

### F4 — Transfers: Sell, Negotiations ledger, History, Finances (M)
**Pics:** `ms_SELL_PLAYERS_SCREEN(.._PLAYER_SELECTED).png`,
`ms_TRANSFER_NEGOTIATIONS_OFFERS_RECEIVED/SENT/SUCCESSFUL/UNSUCCESSFUL.png`,
`ms_TRANSFER_HISTORY_SCREEN.png`, `ms_FINANCES_BUDGET_ALLOCATION.png`,
`ms_TRANSFERS_SCREEN_FINANCES_HOVER.png`.

**Build**
1. **SELL PLAYERS**: fx-panel two-pane. Right: `PLAYERS IN SQUAD` header with
   `GK DEF MID ATT TOTAL n/42` counts + fx-table (pos bar, name, `Price`, `Wage`, sortable
   `▼Status`: None / Transfer Listed / Loan Listed (Season|Short) / Retiring at Contract End /
   Bids Disallowed). Left on select: §B3 playercard with actions `Offer New Contract` (→ F6
   negotiation panel), `Disallow Transfer Bids from other Teams` (toggle; blocks CPU
   approaches for this player), `Add to/Remove from Transfer List`, `Add to Loan List for
   Season Loan`, `…Short Loan`, `Release` (disabled with reason if squad ≤ `transfer.ini`
   position minimums / 16 total; releasing pays off 50% of remaining contract [TUNED]).
   Listing price: prompt with default = adjusted value (existing engine).
2. **TRANSFER NEGOTIATIONS** (full-width fx-panel): title + `Date <today>`; `[LB][RB]` cycles
   the four ledgers `Transfer Offers Received / Transfer Offers Sent / Successful Negotiations
   / Unsuccessful Negotiations`; left list (player, clubs, state; `None` empty state); right:
   `From → To` crest pair, `Transfer Information` (Transfer Type: Transfer/Loan/Free,
   Neg. Status: Awaiting Response / Counter Received / Contract Talks / Completed / Rejected /
   Withdrawn, Estimated Worth, Transfer Fee) and `Negotiation Information` (CURRENT vs OFFERED:
   Wage, Contract Length, Bonus). Backing store: a `negotiations` log every user-involved deal
   writes through (create in store; transferai + negotiation engines append events).
   A on an active row reopens its dossier/contract panel.
3. **TRANSFER HISTORY**: read the pic; fx-panel listing the user club's季 completed moves —
   `[LB][RB]` season selector; rows: date, player, from → to (crests), fee (loans marked);
   totals row for spend/income per window.
4. **FINANCES / BUDGET ALLOCATION**: Transfers-hub Finances tile → this fx-panel:
   identity header, `TRANSFER & WAGE BUDGET` explainer, `Transfer Budget` block (Starting /
   Players Purchased (green) / Remaining) and `Wage Budget` block (Weekly Wage Budget /
   Starting Weekly Wages (red, negative) / Change This Season / Surplus Weekly Budget), then
   `Budget Allocation Slider` — yellow/blue bar, `New Transfer Budget` left, `New Wage Budget`
   right, `Current Budget Split: NN:NN` beneath; ◄► moves 1% steps converting at the rate
   implied by `cmsettings.ini [BUDGET] TRANSFER_WAGE_SPLIT_PERCENT = 80` (1 unit weekly wage ↔
   52-week × split factor of transfer money — derive, document in config header, assert in
   tests). Footer `(A) Accept Allocation (B) Back (LS) Modify Allocation`.
   Also port surrounding budget rules into `js/config/budget.js` and wire season rollover:
   sales return % by `BOARD_FINANCIAL_STRICTNESS` (85/75/60 by board leniency tier — pick by
   club prestige, log), carry-over per `BUDGET_CARRY_OVER_*` bands, per-league budget min/max
   (`LEAGUE_BUDGET_MIN_13 = 18M` EPL etc. — audit existing `engine/clubbudget.js` against
   these and correct).

**Tests** — harness: status column reflects each action; release guard honours
`transfer.ini` MIN_PLAYERS_POSITION_{GK2,CB4,ST3…} + squad floor; negotiations log gains
exactly one terminal state per deal; slider conversion round-trips (move 5 right then 5 left ⇒
identical budgets); carry-over math on rollover for two band cases. Manual: list + sell a
player to a CPU bid end-to-end and find both entries in Successful ledger + History; reallocate
budget and buy with the new budget; compare all 6 pics.

---

### F5 — GTN fidelity (M)
**Pics:** `ms_GTN_SCOUTS(.._MANAGE_SCOUTS, .._RELOCATE_REGION, .._RELOCATE_WORLD,
.._SCOUT_HIRE_SCOUT, .._SCOUT_REPORT).png`, `ms_GTN_INSTRUCTIONS(.._EDIT…1/2).png`,
GTN hover/shortcut pics, `FIFA15_CENTRAL_SCREEN.png` GTN tile.

**Build** (engine `engine/gtn.js` stays; UI rebuilt)
1. **GTN home** (`TRANSFERS › GLOBAL TRANSFER NETWORK`): tab strip `SCOUTS | INSTRUCTIONS`.
   SCOUTS: left = up-to-6 scout cards in 2 rows (nation flag, name, `Area Scouting`, players-
   found count, `Judgment: ★★★☆☆` on selected; empty slots = `Hire Scout` cells); right =
   `SCOUTED PLAYERS SUMMARY` panel for selected scout: big country code + flag, `Players
   Scouted n`, `0 New / 0 Updates` pips, **donut chart** (pure SVG) Strikers/Midfielders/
   Defenders/Goalkeepers with legend counts, league badges column for the scouted country.
   Footer `(B) Back (X) Scout Report (Y) Manage Scout`.
2. **Hire Scout**: fx-panel table (flag+nation, `Scout ▲` name, Experience ★, Judgment ★,
   `Scouting Network Cost` — red when > budget) from the 5-candidate weekly pool (existing);
   costs per `scout.ini` GTN cost tables (audit config/scouting.js). Footer
   `(A) Hire Scout (B) Back (X) Sort`.
3. **Manage Scout**: card menu (Relocate / Recall / Sack w/ fee) + **Relocate pickers**: world
   map → region page → country grid (read the two RELOCATE pics; build as flag-grid pages, no
   real map asset needed if pics show list/grid — follow pics).
4. **Scout Report** (`TRANSFERS › SCOUT REPORT`): tab strip `ALL DETAILED INFO ATT MID DEF GK`;
   header `<SCOUT NAME>` + nation + `Judgment: ★`; card grid of finds (portrait, name, AGE,
   pos bar, club crest, gold selected + (X) remove); right panel identical component to F3
   search report (type tag line e.g. `Any Position, Promising`, Report Status copy per state,
   Summary ranges narrowing weekly — existing level system). `DETAILED INFO` tab = §B4 pages
   for the selected find. Footer `(B) Back (Y) Change View (X) Remove From Report`.
5. **Instructions**: list view (`INSTRUCTIONS` tab; one row per active mission: position/type,
   scout, players found, days) and **INSTRUCTIONS › EDIT**: left stacked tiles `POSITION`
   ((X) glyph, value; gold) / `AGE lo–hi` / `CONTRACT 0–5`; middle `ATTRIBUTES  Total: n/6`
   radio list (transcribe the full option list from the pic: Any, Aerial Threat, Attack
   Minded, Box to Box, Crossing Ability, Defensive Minded, Distance Shooter, Dribbler, First
   Team Quality, Free Kick Specialist, Pacey, Penalty Specialist, Playmaker, Prolific, …
   EDIT_2 pic continues the list — max 6 selected); right `DETAILS` panel (Players Found,
   Days Scouted, pitch graphic, summary lines `- Promising - Age Range: 16 – 22 - Contract
   Remaining: 0 – 5`). Wire the tag list to the existing mission type tags; each tag maps to
   an attribute predicate in `js/config/scouttags.js` ([TUNED] thresholds, logged).
6. Central + Transfers hub GTN tiles: counts/pips/preview already live — verify strings
   (`+ n New`, `i n Updates`) and the mission-title format `STRIKER — Pacey, Prolific`.

**Tests** — harness: donut segments sum to players-found; hire rejects when cost > budget
(red row unclickable); mission tag predicates filter a fixture pool; report ranges shrink
monotonically with level. Manual: hire→instruct→first report in 10 days→ranges narrow→sign
the find; relocate a scout; compare all 8 pics.

---

### F6 — Office: Contracts, Morale, Board, Career, Jobs, Funds (L)
**Pics:** `ms_CONTRACTS_SCREEN(.._CONTRACT_NEGOTIATION).png`, `ms_REQUEST_FUNDS_SCREEN.png`,
`ms_MY_CAREER_SUMMARY_*.png` (5), `ms_BROWSE_JOBS_SCREEN.png`, `FIFA15_OFFICE_SCREEN.png` +
office hover pics (tile pages: Youth Staff↔Youth Academy; Browse Jobs↔NATL Team Job
Offers↔Resign NATL Team; My Career ×2).

**Build**
1. **CONTRACTS**: fx-panel — identity header w/ Transfer Budget + Rem. Wage Budget; selected-
   player mini-card top-right (name, big OVR w/ ghost number, pos bar, silhouette); fx-table
   `POS PLAYER WAGE/WEEK ▼CONTRACT LENGTH NEG. STATUS` (Neg. Status: N/A / Renewing / Agreed /
   Rejected / Not Interested); footer `(A) Negotiate (X) Sort (B) Back (RS) Player Bio`.
2. **CONTRACT NEGOTIATION** panel (shared with F3.6) — exact per pic, incl. `Player Demands`
   block and `Estimated Worth`. Engine audit vs `playercontract.ini`: ask curves by OVR/age,
   `PERCENTAGE_OF_ASK` acceptance (50%→0 … 140%→100), signing-bonus acceptance
   (`BONUS_ACCEPTANCE_BASE_VALUE=80`, bonus can bridge ask gaps ≤115% per plan1),
   re-signing fee 7% (`PERCENTAGE_OF_RESIGNING_FEE`), renewal-length probability by squad
   role (Starting XI 5/5/15/30/30/15 for none/1/2/3/4/5yr; Subs 10/30/30/20/5/5; Reserves
   25/55/20/0/0/0), 60-day expiry warning email, Bosman approaches in Jan. Most exists —
   verify each constant in `js/config/contract.js` and add missing (bonus-per-goal field is
   new: cosmetic contract term, pays out per goal from wage budget; small morale plus).
3. **MORALE ENGINE** (new `js/engine/morale.js` + `js/config/morale.js`, port
   `moralesettings.ini`): internal 0–100; levels VERY_HIGH ≥80 / HIGH ≥60 / NORMAL ≥45 /
   LOW ≥30 / VERY_LOW; CPU default 50. Inputs each match/week: last-match result ×
   match-importance tier (win +2/+5/+15, draw −3/−1/+1, loss −5/−7/−15), team performance vs
   league expectation (weight 90 vs last-match 10), **minutes played vs squad-role
   expectation** (per-role expected-minutes bands; first-team +2.0/game when playing,
   reserves +5.0 when playing, bench penalties when not), transfer-listed −big, contract
   situation (wage 66% / length 33% happiness split; expiring unhappiness), captain +2.
   Display: word on cards/bios (`Content`, `Happy`, `Unhappy`…— map 5 levels, transcribe words
   from pics where visible, else [TUNED]); feeds: value `[MORALE]` table (map 0–100 → the
   existing 1–10 index), player transfer decisions (existing decision points), and ±1% team
   strength at VERY_HIGH/VERY_LOW [TUNED].
4. **BOARD CONFIDENCE** (extend `engine/objectives.js` w/ `js/config/board.js`, port
   `board.ini`): points ledger — win +5, draw +1, loss −5, `LOSING_STREAK=6` triggers crisis
   email; objective checkpoint results add `LEAGUE_OBJECTIVE_RESULT_POINTS_0..4 =
   −90,−25,25,50,75`, domestic cup −15,−5,10,20,30, EU cup −30,−10,20,40,65; first check after
   game 15 then every 5; below `MIN_POINTS=15` ⇒ warning email (`POPULARITY_RATING_WARNING_
   POINTS=40` band) then sack unless saved (`SACK_AVOID_CHANCE=10`, 40 after a great prior
   season). Sacking flows into existing jobs market. Surface: board emails + My Career page.
5. **REQUEST FUNDS**: restyle to the paper letter pic (date, Dear Members…, `Enter Amount`
   input row, `If granted, I commit to achieving the following objectives:` — League/Cup rows
   showing the **upgraded** objectives implied by the grant per `cmsettings.ini [FINANCES]`
   grant tables (success % by points-left & objective increase — port table, choose the
   objective bump that matches the requested amount band), `SUBMIT REQUEST`, MANAGER
   signature). Grant/deny email next day; on grant, objectives actually change.
6. **MY CAREER → CAREER SUMMARY**: fx-panel; `[LB][RB] Manager` / `[LT][RT] Overall` selector
   pair per pics: pages = Current Season (1of2: league/cup progress, W/D/L, form; 2of2:
   finances/transfers — transcribe from the two pics), Past Seasons (season-by-season table
   from `manager.history`), Overall (Clubs, League Titles, Domestic Cups Won, Continental Cups
   Won, Biggest Win, Biggest Defeat, Record Transfer Fee, Total Earnings, Club Record
   P W D L F A). Track any missing fields in state (biggest win/defeat, earnings accrual =
   manager wage × weeks; manager wage from `joboffer.ini` wage-by-overall table × league
   multiplier — port to `js/config/joboffer.js`, drives job offers too).
7. **BROWSE JOBS**: two-panel per pic — left `Potential Job Openings` card w/ ◄► club cycler
   (club name, Country, League, crest, `Manager Career: Offered Wage / Objective`); right
   `Club Details` (Transfer Budget, Wage Budget) + `Season Summary` (League Position, Record
   W/D/L) + `Starting 11` list (pos colour bars + names). Footer `(A) Apply for Job (B) Back`.
   Same layout for NT jobs page. Job generation: existing engine + `joboffer.ini` audit
   (`MANAGER_SUCCESS=65` gate, poach windows 20%–80% of season, `FIRED_OVERALL_HIT=10`,
   `NEWJOB_OVERALL_INC=20`).
8. Office hub: tile pages + hovers per pics (Youth Staff↔Youth Academy carousel; Jobs tile 3
   pages incl. `Resign NATL Team` when holding one; Inbox tile preview already live).

**Tests** — harness: morale level bands + a scripted month of inputs lands expected band;
board points arithmetic incl. checkpoint bonus; ask-curve spot values (OVR 90 ⇒ 120%, age 32
⇒ −30%); renewal-length distribution over 1k seeded rolls within ±3% of INI probs; funds-grant
% lookup; manager wage table spot values (overall 90 ⇒ £100k × league mult). Manual: renew a
contract through the panel; get a board warning after a losing streak (seeded); request funds
and see objectives change; browse and apply for a job; open all 5 My Career pages vs pics.

---

### F7 — Season: Calendar, Fixtures, Tables, Brackets, Playoffs, Stats (L)
**Pics:** `ms_CALENDAR_SCREEN.png`, `ms_FIXTURES_SCREEN.png`,
`ms_TABLES_SCREEN_YOUR_LEAGUE_STAGE_TABLE.png`, `…OTHER_LEAGUES_STANDINGS_EXAMPLE.png`,
`…KNOCKOUT_STAGE_EXAMPLE.png`, `…PLAYOFF_EXAMPLE.png`, `…UCL_CHAMPIONS_CUP_KNOCKOUT…png`,
`…UCL_CHAMPIONS_CUP_TABLE_VIEW…png`, `ms_PLAYER_STATS_*.png` (5),
`ms_TEAM_STATS_TEAM_SELECT(.._SELECTED).png`, `FIFA15_SEASON_SCREEN.png` + season hover pics.

**Build**
1. **CALENDAR** (rebuild): full fx-panel — left rail: big `Jul 4` day header, selected-day
   detail (`No Match` / fixture w/ crest, competition, H/A), club crest, vertical `POR
   Football League 1` watermark; right: `[LB][RB] Jul 2015` month grid SUN–SAT, day cells with
   event iconography per pics (transfer-window ⇄ badge, friendly icon + opponent crest,
   colour-coded wedges), gold selected cell, past days dimmed; legend bottom-left: League
   Match, Cup Match, International Match, Friendly, European Match, Transfer Window (press row
   omitted per §A3). Clicking a day ≠ advance (view only); Advance stays on Central.
2. **Pre-season friendlies**: 2 fixtures late July vs similar-prestige clubs from other
   leagues (seeded), simmed normally, no comp effects, half fatigue, shown on calendar/results
   with the friendly icon. (Visible in the calendar pic — required for fidelity.)
3. **RESULTS & FIXTURES**: fx-panel; `[LB][RB]` league (+ league badge right), `[LT][RT]`
   month; rows `date | home crest name | score-or-– | away name crest`, user club gold.
   Covers every league incl. cups via the league cycler order: user league first, then tiers,
   then cups/continental (verify against pic behaviour; log).
4. **TABLES → LEAGUE STAGE**: fx-panel; `[LB][RB]` competition, `[LT][RT]` stage; columns
   `P W D L GF GA GD PTS`; zone tinting per competition config: England — auto-promotion
   bright green, playoff seats dark green, relegation dark red rows (define per-league zones
   in `data/leagues.json`; transcribe tint pattern from the two table pics); `(X) Sort`.
   `OTHER LEAGUES` season tile routes here starting on a foreign league.
5. **PLAYOFFS** (new mechanic): English Championship/League One (3rd–6th) and League Two
   (4th–7th) end-of-season playoffs — two-legged semis + single final, winner promoted;
   scheduled mid-May; bracket rendered via the knockout component; news + objectives integrate
   (board objective "Gain Automatic Promotion" vs "Reach the Playoff Final" — string seen in
   `ms_BROWSE_JOBS_SCREEN.png`/`ms_REQUEST_FUNDS_SCREEN.png`). Follow `…PLAYOFF_EXAMPLE.png`
   for the view.
6. **KNOCKOUT bracket component**: mirrored tree (R16/QTR/SEMI left+right converging on FINAL
   center banner with competition name; team chips white/dark w/ crest+abbrev+aggregate),
   `(Y) Switch to Table View` toggle for group comps (UCL-style: group tables view per
   `…TABLE_VIEW_EXAMPLE.png`); used by domestic cups, continental comps, playoffs, intl
   tournaments.
7. **PLAYER STATS**: fx-panel; `[LB][RB]` league, `[LT][RT]` category `Top Scorers / Assists /
   Clean Sheets / Yellow Cards / Red Cards`; columns `Rank Name Team <stat>` (stat header per
   category: Goals/Assists/Clean Sheets/Yellow Cards/Red Cards); `No Statistics Available`
   empty state; user-club players gold.
8. **TEAM STATS**: team-select page (read TEAM_SELECT pic — grid/list of clubs w/ crests) →
   selected page (read SELECTED pic — team season stats table incl. W/D/L, GF/GA, possession-
   less stats we track; transcribe fields and back each with real tracked data; add tracking
   where trivially derivable from results, [TUNED]-cut anything untrackable, logged).
9. Season hub audit: tiles/hovers per pics (Calendar gold tile w/ mini-month, Other Leagues,
   Team Stats, Player Stats, TABLES live cup tile ×2 pages, FIXTURES results tile).

**Tests** — harness: playoff seeding takes exactly the right seats per league; two-leg
aggregate + away-goals-off (FIFA: replay/pens — use pens after extra time, log) resolves a
winner; zone-tint config matches promotion/relegation counts already enforced by rollover;
stats leaderboards agree with accumulated seasonStats on a simmed season; friendly fixtures
excluded from tables. Manual: sim to season end, watch playoffs on the bracket, browse every
tables/stats screen for 3 leagues, UCL group→KO toggle, compare all 13 pics.

---

### F8 — Traits, specialities, sim & world-logic deepening (M)
**Pics:** `ms_TEAM_SHEET_VIEW_SPECIALTIES_TRAITS.png`, search/sell playercards (tagline rows),
`ms_YOUTH_ACADEMY_YOUTH_SQUAD_PLAYER_INFO(.._ATTRIBUTES).png`, `ms_YOUTH_STAFF_SCREEN.png`.

**Build**
1. **Specialities** (computed, badge list): Speedster, Dribbler, Playmaker, Engine, Distance
   Shooter, Crosser, FK Specialist, Tackler, Tactician, Acrobat, Strength, Clinical Finisher,
   Poacher, Aerial Threat, Complete Forward/Midfielder/Defender — attribute-threshold defs in
   `js/config/specialities.js` ([TUNED], logged). Shown on Specialities/Traits page + bio.
2. **Traits** (stored, generated at player-gen + youth-gen using `scout.ini` trait-type %
   tables): pool incl. Injury Prone, Solid Player, Power Header, Long Shot Taker, Finesse
   Shot, Speed Dribbler, Playmaker (trait), Leadership, Early Crosser, Flair. **Sim hooks
   (exactly these six)**: Injury Prone ×1.5 injury chance; Solid Player ×0.5; Power Header /
   Aerial Threat +50% share of headed-chance attribution; Long Shot Taker +30% long-shot
   share; Clinical Finisher/Finesse +5% chance conversion; Leadership: counts as captain for
   morale if captain absent. Constants [TUNED] in `js/config/traits.js`.
3. **Taglines** on playercards (⚠ row): `One Of The World's Best` (OVR≥90), `At The Club Since
   <year>`, potential-band strings for ≤23s (existing bands) — priority order per pics.
4. **Match importance** (`js/config/matchimportance.js` from `matchimportance.ini`): rival
   derby, late-season decider, cup round tiers → feeds sim `[INFLUENCE] MATCHIMPORTANCE=2`
   term + morale result weights (F6) + news phrasing.
5. **Audits vs INI** (fix silently if config already matches; ledger if not):
   value `[OVERALL]` diminishing-modifier weights + `[VALUATION]` performance nudge
   (first/second scorer +15/+5% etc., MIN_APPEARANCES 5) — implement if missing;
   fatigue (`FATIGUEBASE=21`, GK 75 cap logic), injury severity 80/13/7 + named injuries
   (F2.6), sub-likelihood by line (`[SUB]` GK1/DEF45/MID95/ATT90) in quick sim; CPU transfer
   volume/timing (`CHANCE_SEARCH_TEAM_FOR_PLAYERS=22`, deadline-day hourly fee ramps,
   `[TRANSFER_IMPROVE_YOUNG]` MAX_AGE 24 band, activity counts by league tier); regen
   (`cmsettings [PLAYER_REGEN]` attribute reduction 15±5, `playerretirement.ini` per-position
   retirement curves — spot-audit `config/retirement.js`); youth tiers/promotion windows
   (`[YOUTH_SQUAD]` MAX 16, promotion age ≥16, every-3-months, type uncover after 6 — audit
   academy engine) and youth UI fidelity: Youth Staff = `SCOUTING NETWORK` 3-column scout
   cards (status bar `Setting Up Scouting Network` orange, Details Country/Duration/
   Returning); Youth Academy = fx-panel table (`PLAYER NAME ▲ AGE ELIGIBLE` w/ padlock) +
   `[LT][RT] Player Info / Attributes` paper pages (blue banner card, OVERALL/POTENTIAL range
   boxes, TYPE row, `Strengths:` 5 rows current-vs-potential chips, `Position(s):` mini-pitch
   dots) per the two pics.
6. **NT jobs / intl audit** vs office hover pics: `NATL TEAM JOB OFFERS` page + `RESIGN NATL
   TEAM` page on the jobs tile when applicable; NATL squad tiles on Squad hub already exist.

**Tests** — harness: speciality predicates on crafted attribute sets; trait generation
distribution sane (no player >3 traits); Injury Prone doubles observed injury rate over 2k
simmed matches vs Solid Player; valuation nudge caps at SUGGESTION_RANGE 0.30; deadline-day
bids cluster on Sep 1/Feb 1. Manual: bio + team-sheet traits pages populated; youth flow vs
4 pics; watch a derby get "importance" framing in news.

---

### F9 — Full-catalogue QA + balance + ship (M)
1. **Pic-by-pic QA**: walk **every** file in `REFERENCE_PICS/` (all 9 + all ~111 in
   `more_screens/`) against the live game; keep a checklist table in
   `fable-plans/plan2-qa.md` (pic → screen → ✅/deviation note). Every ❌ is fixed or
   owner-approved via the ledger before ship.
2. **Balance run**: `dev/balance.html` 10-season headless sim — check: strong clubs top
   tables; realistic transfer volumes (~30–50 completed CPU moves per window in top leagues);
   value/wage sanity table across leagues; growth trajectories (17-y-o 60/85-potential who
   plays reaches ≈79–85 by 25; benched twin lands ≥6 lower); retirement/regen population
   stability (±10% world size over 10 seasons); playoff winners promoted; no NaNs.
3. **Perf & save**: weekend sim < 300 ms; save < 10 MB after 3 seasons; save/load round-trip
   equality test still green with all new state (sheets, shortlist, negotiations log, morale,
   board points, traits, playoffs).
4. README update + GitHub Pages smoke test on Chrome + Firefox; regression career (§A5.4)
   played 2 in-game months by hand.

---

## PART D — Key INI tables for quick reference

(All already in `reference/ini/`; consult the file for full tables. The mining summary lives in
this plan so you don't re-derive it.)

- **playervalues.ini** — base-value-by-OVR RATINGRANGE (already `config/value.js`), [AGE]
  (GK_AGE_MOD −3 from 28), [POTENTIAL] +15%…+235%, [CONTRACT] −70…+20, [FORM] −60…+80,
  [MORALE] −20…+15, [OVERALL] modifier damping (90→0.4, 100→0.2), [POSITION] GK −15 … ST +18,
  [CLUB_PRESTIGE] +5…+18, [VALUATION] scorer/assist/cleansheet nudges, MIN_APPEARANCES 5.
- **playerwages.ini** — WAGE_RATINGRANGE, WAGE_AGE, WAGE_POSITION (GK −30 … fwd +10),
  WAGE_LEAGUE (EPL 70, Bundesliga 50, Serie A 45, La Liga 43, Ligue 1 40, Championship 30,
  default 20).
- **playergrowth.ini** — 7 curves (in `config/growth.js`), growth months 5 & 12 (Feb/Jul per
  plan1), variance ±10%, match-rating bonus ±10%, playtime bonus to +10% @270 min, injury
  growth ×5% / decline ×150%, above/below-curve modifiers ×0…×1.5, attenuation 90%.
- **playercontract.ini** — renewal-length probs by role, PERCENTAGE_OF_ASK 50→0…140→100,
  bonus acceptance base 80, resign fee 7%, expiry warning 60 days, OVR mult (90+→120%),
  age mult (32+→−30%), extend if <2yr @65% cover 80%.
- **transfer.ini** — squad minimums GK2 RB2 CB4 LB2 RM2 CM4 LM2 ST3; MAX_COUNTER_OFFERS 4;
  respond 3–6 days; counter caps 10–50%; wage-demand by club OVR diff (0→+30%, +5→+50%);
  min salaries 750–2250; deadline-day hourly ramps; young-talent hunt ≤24y.
- **transfers.ini** — decision points (ISTRANSFERLISTED +175, HASGRUDGE −400, ISRIVALCLUB −200,
  league-rank change −40…+35, manager prestige +3…+35, team-star rank −65…+50, contract-length
  0…20, REALLYBADROLEOFFER −1750), contract-length-by-age, deadline 10 h, loans 12/3 months.
- **transferteamdecision.ini** — wanted fee = base↔adjusted interpolation by team points
  (−50%…125%), inputs: months-at-club, squad size, future OVR gap, team OVR, position rank;
  accept/counter/reject % bands by offer-vs-wanted (100%→accept; ≤50%→reject).
- **scout.ini / youth_scout.ini** — GTN + youth scout costs/levels, finds per experience,
  tier odds by judgment (T1 75–95 … T4 55–80), display variance by level, work-rate/skill/
  weak-foot/trait/height tables, youth squad 16 / promote ≥16 / 3-month windows.
- **board.ini** — W/D/L +5/+1/−5, MIN_POINTS 15, checks @15 then every 5, objective points
  arrays, sack-avoid 10/40, losing streak 6.
- **seasonobjectives.ini / cmsettings.ini** — objective probability bands; MANAGER_SUCCESS
  weights League 45 / DomCup 20 / EuCup 35; [BUDGET] split 80, carry-over bands, per-league
  min/max; [FINANCES] grant tables; [PLAYER_REGEN]; [AWARDS] reputation points.
- **joboffer.ini** — offers gate MANAGER_SUCCESS 65, wage by overall (90→£100k) × league mult
  (1.0/0.4/0.2), FIRED_OVERALL_HIT 10, NEWJOB_OVERALL_INC 20.
- **moralesettings.ini** — levels 80/60/45/30; last-match by importance (+2/+5/+15 / −5/−7/−15
  / −3/−1/+1); expectation weight 90/10; role/minutes happiness; contract wage 66 / length 33.
- **formsettings.ini** — user window 10 (weights …,2,3,4,7), CPU 5 (1,2,3,4,7); eval bands
  ≤59 bad / ≤65 neutral / good.
- **simsettings.ini** — [INFLUENCE] rating 78 / home 4 / competition 10 / importance 2 /
  prestige terms; [SCORE] chance counts by strength gap; cards 50%/−10%, red 3%; injury 15%
  (80/13/7); FATIGUEBASE 21, GK energy 75; [MATCH_RATINGS] base by line + event deltas;
  [SUB] rates by line.
- **matchimportance.ini / teamutils.ini / fitness.ini / tcm_finance_settings.ini** — importance
  scoring; star threshold 82 + squad-rank sizes; named injuries w/ day counts; income/expense
  models (only the budget-relevant parts are in scope, via F4).

## PART E — Reference-pic → milestone index

- Top-level 9: Central/News/Email → F0; Squad ×3 → F1/F2; Transfers → F3; Office → F6;
  Season → F7.
- `CENTRAL_SCREEN/*` → F0. `SQUAD_SCREEN/ms_TEAM_SHEET_VIEW_*` → F1 (squad views) / F2
  (formations, instructions, positioning, roles, tactics); `ms_EDIT_KIT_NUMBERS*`,
  `ms_SQUAD_PAGE_*`, `ms_SQUAD_RANKING/REPORT*` → F2 (report/ranking are audits of existing
  screens vs pics).
- `TRANSFERS_SCREEN/*`: search/approach/shortlist → F3; sell/negotiations/history/finances →
  F4; GTN* → F5; hover/shortcuts → F3–F5 tile paging.
- `OFFICE_SCREEN/*`: contracts/negotiation/funds/career/jobs + hovers → F6; youth staff/
  academy → F8.
- `SEASON_SCREEN/*` → F7.

## Verification (whole plan)

- `dev/tests.html` green after every milestone (each adds its listed assertions).
- `fable-plans/plan2-qa.md` complete at F9 with every pic ✅ or owner-approved deviation.
- `fable-plans/plan2-decisions.md` reviewed by owner at each milestone boundary.
- 10-season balance run clean; 2-month hand-played regression career; Pages deploy on
  Chrome + Firefox.
