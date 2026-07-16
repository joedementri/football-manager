# FIFA 15 Manager Career — Browser Recreation

A static, browser-based recreation of the **FIFA 15 Manager Career Mode**, built to run on
GitHub Pages. The UI is a faithful recreation of the original menu screens; underneath it
generates a full, real football world — ~35 leagues, ~600 clubs, ~50 nations, and a randomly
generated ~15,000-player database — lets you start a career as any club, and play out full
careers, season after season, forever: every league's fixtures and every country's domestic cup
resolve as you Advance, your own club's matches play out on a live minute-by-minute ticker,
transfers happen (yours and the CPU's), a Global Transfer Network of scouts finds you talent
worldwide, a youth academy grows your own prospects, continental and international football run
alongside your domestic season, and every July 1st the season rolls over — growth, ageing,
retirements and regens, promotion/relegation, board objectives (with sacking if you fail badly
enough), and a fresh next-season schedule. This is the complete build: **M0–M11** of
`fable-plans/plan1.md`.

## https://joedementri.github.io/football-manager/

## What works today

- **New Game**: pick a manager name, a league, and a club (crest grid + board-expectation
  preview), then the world generates in the background (progress bar).
- **A real, generated world**: every club fields a believable 24-man squad (3 GK / 8 DEF /
  8 MID / 5 ATT), with realistic overalls scaled to league/club prestige, ages, potentials,
  attributes, workrates, and nationalities drawn from region-matched name pools (~50 nations).
- **Squad List / Player Bio**: a sortable roster table and a full 6-panel attribute breakdown
  (PAC/SHO/PAS/DRI/DEF/PHY), info column (age, height cm/ft-in, weight, foot, workrates,
  weak-foot/skill-move stars, value, wage, contract, form, morale), potential-band line.
- **Squad Report / Squad Ranking**: a player card + status/stats panel (injury status, this
  season's and career stats by competition), and a whole-squad ranking by average match rating
  with rank-change arrows, a previous-match result + Man of the Match panel, and the next fixture.
- **Kit Numbers**: reassign any squad member's shirt number (select, select again to edit,
  ◄/► steppers) — automatically skips numbers already worn by a teammate.
- **Tactics / Player Roles**: four in-match tactic presets (Default/Possession/Counter
  Attack/High Pressure), each with a real ±% effect on your team's match strength; a Captain and
  a designated Penalty Taker, both with real effects (the captain's armband follows them onto the
  pitch, the penalty taker always steps up when a penalty falls your way and they're on the pitch).
- **Match simulation**: every fixture in every league/cup/continental competition (~35 leagues,
  ~600 clubs) resolves as you Advance — team strength (starting XI overall, home advantage, club
  prestige, tactics, difficulty), Poisson-distributed scorelines, attribute-weighted
  scorers/assisters/cards/injuries, post-match ratings all update league tables, player season
  stats, form, fitness and injuries.
- **Match Day**: your own club's league (and NT) fixtures play out on a live minute-by-minute
  ticker — pre-match lineups, score, event feed (goals/cards/injuries/subs, "Full Commentary" or
  "Key Events Only" per Settings), other same-day results, speed ×1/×4/instant, pause anytime to
  substitute (the rest of the match re-simulates with your new lineup and, if you changed
  tactics, your new strength) — then a full-time report (scorers, Man of the Match).
- **Advance**: click Central's "ADVANCE" header to move one day at a time, or click a day in the
  strip/Calendar to jump straight to it — every other match in every league/cup/competition
  silently resolves as you pass through; landing on your own club's (or your NT's) match day opens
  the Match Day overlay instead.
- **Calendar**: a full month-view grid marking your club's (and NT's) fixtures, transfer windows,
  deadline days, growth days, board review, and international breaks.
- **Domestic cups**: all ~29 countries' cups run as real single-leg knockouts alongside the
  league — penalty shootouts if level, a neutral-venue final.
- **Continental & international football**: the European Champions Cup / European Trophy / South
  American Champions Cup run groups-into-knockout on midweeks, seeded from prior-season league
  form; World Cup/Euro/Copa América/AFCON/Asian Cup qualify and play out on their real cycles;
  reach a high enough manager reputation and national-team job offers appear (Browse NT Jobs,
  Natl Squad Selection) — manage your club and a country side simultaneously, both on the same
  live ticker.
- **Transfers**: Search Players (world-wide, filterable), fee negotiation → contract talks for
  buys, loans, free agents, a Sell/Loan list with incoming CPU bids as YES/NO decision emails,
  weekly CPU↔CPU transfer-window activity with real transfer news, deadline-day activity, and
  Request Funds (ask the board, or reallocate between transfer/wage budgets).
- **Global Transfer Network**: hire up to 6 scouts (Experience/Judgment star ratings), send them
  on missions (region + position/type filters), reports arrive over following weeks with
  fuzzy-then-exact ratings as scouting level improves.
- **Youth Academy**: hire up to 3 youth scouts, monthly reports bring 15-17-y-o prospects with
  potential-tier-driven ranges, a youth squad (max 16) to develop, promote to the first team or
  release.
- **Growth & ageing**: every player's overall grows or declines twice a season (Feb 1 and July 1)
  from their hidden potential, position-appropriate growth curve, playing time and match ratings
  — no separate training minigame, just "play your youngsters."
- **Retirement & regens**: ageing players retire (announced in January, effective in July) and
  are replaced by a fresh 16-18-y-o prospect at the same club, keeping every squad at 24.
- **Promotion & relegation, board review & sacking**: every multi-tier country's table-based
  movement is applied at rollover; a real mid-season review email in January and a real
  end-of-season verdict in July — miss your board's objective badly enough and you're sacked,
  sent to a real Browse Jobs screen to pick up a new club.
- **Season rollover**: every July 1st the above all happens together, plus an end-of-season
  awards email (champion, golden boot, cup winner, team of the season) and a fresh next-season
  schedule — advance through as many seasons as you like, forever.
- **My Career**: a Career Summary with three pages — Overview (clubs managed, trophies won,
  biggest win/defeat, record transfer fees, whole-career club match record), Current Season
  (this year's board objectives and progress), and Past Seasons (one row per completed season:
  club, league position, cup/continental results, promoted/relegated/sacked).
- **Team Stats / Player Stats**: browse any of the ~35 leagues (not just your own) — Team Stats
  shows any club's individual player stats table; Player Stats ranks Top Scorers/Assists/Clean
  Sheets/Yellow Cards/Red Cards league-wide.
- **Settings**: Difficulty (±3% to your own match strength), Currency (£/$/€, applied instantly
  everywhere a money value is shown), Autosave (on by default — saves after every Advance),
  Sim Detail (how much ticker detail Match Day shows).
- **Save-slot management + export/import**: the header menu's "Manage Saves" screen — 3 manual
  slots plus the autosave slot, each with Save/Load/Delete, and Export Save to File / Import Save
  from File (a plain JSON download you can back up or move to another browser).

## Screens

| Screen | Contents |
| --- | --- |
| **New Game** | Manager name → league → club (crest grid, board expectation) → world-gen progress |
| **Central** | Advance day-strip, News headline + full News overlay (5 categories), Global Transfer Network preview, real league mini-table |
| **Squad** | Formation pitch (captain badge, live ratings) → Club Squad / Natl Squad → Squad List → Player Bio; Squad Report; Squad Ranking; Tactics; Player Roles; Kit Numbers; Natl Squad Selection |
| **Transfers** | Scouted-players hub, Search Players, Sell/Loan Players, Global Transfer Network (hire/missions/reports), Finances |
| **Office** | Inbox, Contracts (renewal flow), Youth Staff, My Career, Request Funds, Browse Jobs, Browse NT Jobs, Settings |
| **Season** | Calendar (month view), Other Leagues' cup/continental tables tile, Team Stats, Player Stats, Fixtures, domestic cup + continental tables |
| **Match Day** | Pre-match lineups → live ticker (minute clock, event feed, score, speed control, sub picker) → full-time report (scorers, Man of the Match) |
| **Email** | Inbox overlay (Emails / Player Conversations / Message Archive) with reading pane, YES/NO decision emails (incoming bids, youth retirement warnings) |
| **Manage Saves** | Header menu overlay: 3 manual slots + autosave, per-slot Save/Load/Delete, Export/Import |

All club crests are **procedurally generated SVGs** keyed off each club's real colours (no
licensed assets); nation flags are pure-CSS recreations of each nation's real flag (~50 nations).

## Controls

- **Tabs** — click `Central / Squad / Transfers / Office / Season`, or press **← / →** to page
  between screens (wraps around).
- **Lists** (Squad List, Contracts, Team Stats, ...) — click a column header to sort; click a row
  to select it, click again (or **A**/**Enter**) to drill in (Player Bio, negotiation, etc.);
  **B / Esc** backs out one level at a time.
- **Advance** — on Central, click the "A ADVANCE" header to move one day; click a specific day in
  the strip or Calendar to jump straight to it (halts early on a match day for your club/NT).
- **Match Day** — opens automatically on your own fixture. **A** pauses/resumes, **X** cycles
  ticker speed (1×/4×), **Y** jumps to full time, the sub-picker action opens substitutions.
  **B / Esc** only backs out once the match has finished.
- **Email inbox** — **Y** or **E** (or the *Email Inbox* prompt) opens it; **B / Esc** closes it.
- **Browse Jobs / Browse NT Jobs** — **↑ / ↓** between vacancies, **A** (or click the selected row
  again) to apply on the spot.
- **Manage Saves** — header hamburger menu → *Manage Saves*. Each slot has Save Here / Load /
  Delete (Load and Delete ask for confirmation first — Load discards any unsaved progress in the
  current session and reloads the page); Export downloads a `.json` file, Import reads one back in.
- **Save** — click the *Save* footer prompt to write your career to the autosave slot on demand
  (autosave itself also runs automatically after every Advance, unless turned off in Settings).
- **Deep links** — jump straight to a screen via hash or query string, e.g. `index.html#season` /
  `index.html?screen=season`, or `index.html#email` / `index.html?screen=email`.

The UI renders on a fixed **1280×720 (16:9)** stage that scales to fit any window, like the
console game.

## Run locally

The app is built from **ES modules** (`<script type="module">`), which browsers refuse to load
over `file://`. Serve the folder over HTTP instead:

```bash
python -m http.server 8000
# then visit http://localhost:8000
```

GitHub Pages serves everything over HTTP already, so deployment is unaffected.

**Starting over**: once you've created a career it autosaves to IndexedDB and reloading the page
skips straight back into it (no New Game screen). To force the wizard again, either open the site
in a private/incognito window, use the header menu's *Delete Save*, or DevTools → Application →
IndexedDB → delete the `fm-career` database and refresh.

## Dev pages

- `dev/world.html` — browses the authored world data (`data/*.json`): every league's clubs with a
  procedurally generated crest, plus nations, cups/tournaments and name-pool sizes. Counts should
  read ~35 leagues / ~600 clubs / ~50 nations.
- `dev/tests.html` — the project's live assert harness — **the primary way to verify a change
  didn't break anything**, since it runs the same engine code the real game does, headless (no
  DOM), against generated worlds and a real `Store`. Covers, milestone by milestone: the mandatory
  overall-calculation test vectors (Messi → 93±1, Neuer → 88), growth-curve sanity, a full world
  generation with a performance budget (<3s), RNG determinism, a compact-save serialization
  round-trip, every league's fixture invariants, CPU-vs-CPU match-sim sanity, a full season
  simulated end-to-end through a real `Store` (every league match, every cup tie, growth,
  retirements/regens, promotion/relegation, the July 1 rollover, auto-accepting a job if sacked
  along the way — M5's own headline check), value/wage spot-checks, contract renewal/Bosman
  flows, fee-negotiation/CPU transfer-AI behaviour, GTN scouting mechanics, youth academy
  mechanics, continental/international competition mechanics and NT job offers, and (M11) a
  **weekend-Advance performance budget (<300ms)** timed inline on the same full-season walk —
  should read **all assertions passing** (356/356 as of M11).
- `dev/balance.html` — headless auto-sim of N full seasons (chained via `engine/season.js`'s
  rollover) across every league and every domestic cup, with no user club. Reports a
  position↔prestige correlation per league, a young-player growth trajectory, English-pyramid
  promotion/relegation movement, F.A. Cup champions by season, and world population stability.

Visit either at `http://localhost:8000/dev/<page>.html` while serving locally.

## Project structure

```
index.html                    # entry point: stage, New Game wizard, every screen/overlay
css/
  base.css                     # design tokens, 16:9 stage scaling, backgrounds, fonts
  chrome.css                   # header, tab bar, footer prompts, reusable panel/tile components
  screens.css                  # per-screen layouts + email/news overlays
  newgame.css                  # New Game wizard
  tables.css                   # Squad List / Natl Squad Selection
  bio.css                      # Player Bio
  calendar.css                 # Calendar month-view grid
  flags.css                    # nation flags (pure CSS, ~50 nations)
  matchday.css                 # Match Day: pre-match/ticker/full-time/sub picker
  jobs.css                     # Browse Jobs / Browse NT Jobs
  contracts.css                # Contracts renewal flow
  transfers.css                # Search/Negotiation/Sell-List/Request-Funds
  gtn.css                      # Global Transfer Network
  youth.css                    # Youth Staff
  mycareer.css                 # My Career (M11)
  squadreport.css              # Squad Report + Squad Ranking (M11)
  kitnumbers.css                # Kit Numbers (M11)
  tactics.css                  # Tactics + Player Roles (M11)
  stats.css                    # Team Stats + Player Stats (M11)
  settings.css                 # Settings (M11)
  saves.css                    # Manage Saves (M11)
  motion.css                   # screen/overlay entrance transitions (M11)
js/
  main.js                      # bootstrap: loads a save or runs New Game, wires the header menu/autosave/save-slots
  stage.js                     # scales the 16:9 stage to the window
  carousel.js                  # generic [data-carousel] tile paging widget
  core/
    store.js                   # GameState + pub/sub; createCareerState/hydrateFromSave build it
    router.js                  # screen/overlay switching, footer prompts, deep links
    rng.js                     # seeded PRNG (mulberry32) — all generation/sim draws from this
    format.js                  # date/number/money display formatting (currency-aware, M11)
    clock.js                   # calendar-date arithmetic (epoch-day conversion)
    db.js                      # IndexedDB save slots, compact player serialization, export/import (M11)
  ui/                          # one module per screen/overlay; pure render-from-state
    render.js  newgame.js  squadlist.js  playerbio.js  calendarui.js  matchday.js  jobsui.js
    contractsui.js  transfersui.js  gtnui.js  youthui.js  ntjobsui.js  natlsquad.js
    mycareerui.js  squadreportui.js  kitnumbersui.js  tacticsui.js  statsui.js  settingsui.js  savesui.js
  gen/                         # world/player generation
    names.js  crest.js  overall.js  archetypes.js  player.js  squad.js  world.js
  engine/                      # game logic — the only layer allowed to mutate GameState
    calendar.js  growth.js  retirement.js  awards.js  jobs.js  season.js  form.js  fitness.js
    value.js  wage.js  contracts.js  finances.js  clubbudget.js  negotiation.js  transferai.js
    freeagents.js  transfernews.js  teamdecision.js  playerdecision.js  gtn.js  academy.js
    ntjobs.js  career.js                                                          # M11: My Career + Squad Ranking's match-report support
    objectives.js
    comps/                     # league.js  cup.js  continental.js  intl.js  knockoututil.js
    sim/                       # core.js  lineup.js  quick.js  events.js  match.js  results.js  worldsim.js
  config/                      # tuning tables ported from reference/ini/*.ini (one file per system)
    positions.js  attributes.js  playergen.js  growth.js  retirement.js  objectives.js  calendar.js
    sim.js  form.js  value.js  wage.js  contract.js  negotiation.js  transferai.js  loan.js
    teamdecision.js  scouting.js  youth.js  intl.js  tactics.js  settings.js               # last 2: M11
data/
  leagues.json  clubs.json  nations.json  cups.json
  names/*.json                # first/last name pools, one file per nation (~50 nations)
dev/
  world.html, world.js         # world browser
  tests.html, tests.js         # assert harness (see "Dev pages" above)
  balance.html, balance.js     # headless N-season auto-sim + balance report
reference/ini/                 # FIFA 17 career-mode INI files, ported for tuning-number reference
fable-plans/plan1.md           # the full build plan (milestones M0–M11)
.nojekyll                      # tells GitHub Pages to serve files as-is
```

## Deploy to GitHub Pages

This repo is already initialized with an initial commit on `main`. To publish:

1. Create an empty repository on GitHub (no README/license), e.g. `football-manager`.
2. Connect and push:
   ```bash
   git remote add origin https://github.com/<your-username>/football-manager.git
   git push -u origin main
   ```
3. In the repo on GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a
   branch**, pick **Branch: `main`** and **Folder: `/ (root)`**, then **Save**.
4. After a minute the site is live at
   `https://<your-username>.github.io/football-manager/`.

(I can't push to your GitHub account, so the steps above are yours to run.)
