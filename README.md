# FIFA 15 Manager Career — Browser Recreation

A static, browser-based recreation of the **FIFA 15 Manager Career Mode**, built to run on
GitHub Pages. The UI is a faithful recreation of the original menu screens; underneath it now
generates a full, real football world — ~35 leagues, ~600 clubs, ~50 nations, and a randomly
generated ~15,000-player database — lets you start a career as any club and browse your real,
generated squad, and schedules a full season of fixtures you can Advance through day by day.
See `fable-plans/plan1.md` for the full build plan and milestone list (this is M0–M3 of that
plan; match simulation/transfers/scouting/etc. are still ahead — matches aren't played yet,
so Advance currently walks the calendar up to each match day and stops there).

## https://joedementri.github.io/football-manager/

## What works today

- **New Game**: pick a manager name, a league, and a club (crest grid + board-expectation
  preview), then the world generates in the background (progress bar).
- **A real, generated world**: every club fields a believable 24-man squad (3 GK / 8 DEF /
  8 MID / 5 ATT), with realistic overalls scaled to league/club prestige, ages, potentials,
  attributes, workrates, and nationalities drawn from region-matched name pools.
- **Squad List**: a sortable table of your 24-man roster (#, name, pos, age, OVR, form,
  fitness, value, wage, status).
- **Player Bio**: full 6-panel attribute breakdown (PAC/SHO/PAS/DRI/DEF/PHY), info column
  (age, height in cm *and* ft/in, weight, foot, workrates, weak-foot/skill-move stars, value,
  wage, contract, form, morale), potential-band line, and nation flag.
- **Save / autosave**: your career is written to IndexedDB on demand (press Save) and
  reloaded automatically the next time you open the site — no re-running the wizard.
- **Full season fixture schedule**: every league (all ~35) gets a real double round-robin
  schedule (weekly Saturdays, international breaks skipped), generated deterministically from
  the save's seed. Central's mini table and Season's fixtures panel show your club's real
  league/opponents (0 pld/pts until match simulation lands).
- **Advance**: click the Central "ADVANCE" header to move one day at a time, or click a day in
  the strip to jump straight to it — jumps halt early on the first match day for your club
  (marked with a ball icon) since there's no match engine yet to resolve it.
- **Calendar**: Season's gold Calendar tile opens a full month-view grid (Season ›
  Calendar) marking your club's fixtures (crest + H/A), transfer windows, deadline days,
  growth days, board review, and international breaks.
- **Board objective emails**: a real "League Objective" and "Domestic Cup Objective" email
  from your club's board arrive on day one, addressed to your manager name with an objective
  matched to the club's board-expectation tier.

Screens/systems not wired up yet (still hardcoded placeholder content pending later
milestones — match sim, transfers, scouting, etc.): Central's news list/headline, Transfers,
most of Office, Season's cup bracket. These render the same placeholder content the original
prototype always had.

## Screens

| Screen | Contents |
| --- | --- |
| **New Game** | Manager name → league → club (crest grid, board expectation) → world-gen progress |
| **Central** | Advance day-strip (click to advance, real dates + match-day ball icon), news headline *(placeholder)*, Global Transfer Network *(placeholder)*, News *(placeholder)*, real league mini-table |
| **Squad** | Formation pitch with your real best-XI → **Club Squad** tile opens **Squad List** → select a player and open **Player Bio** |
| **Transfers** | Scouted strikers, Search/Sell Players, GTN, Finances *(placeholder content)* |
| **Office** | Inbox (real unread-count + latest-subject preview), Contracts, Youth Staff, My Career, Request Funds, Browse Jobs, Settings *(rest still placeholder)* |
| **Season** | **Calendar** tile opens a real full month-view grid (fixtures/windows/breaks), Other Leagues/Team Stats/Player Stats *(placeholder)*, Tables *(cup bracket still placeholder)*, real upcoming Fixtures |
| **Email** | Inbox overlay (Emails / Player Conversations / Message Archive) with reading pane — real day-1 board objective emails, per-email detail, read/unread tracking |

All club crests are **procedurally generated SVGs** keyed off each club's real colours (no
licensed assets); nation flags in Player Bio are pure-CSS recreations of each nation's real
flag (~50 nations).

## Controls

- **Tabs** — click `Central / Squad / Transfers / Office / Season`, or press **← / →** to
  page between screens (wraps around).
- **Squad List** — click a column header to sort by it; click a row to select it, click again
  (or **A**) to open its Player Bio; **B / Esc** backs out one level at a time.
- **Advance** — on Central, click the "A ADVANCE" header to move one day; click a specific day
  in the strip to jump straight to it (halts early on a match day for your club — the ball icon
  marks it).
- **Calendar** — Season → click the gold *Calendar* tile for a full month view; click ‹ › (or
  **← / →**) to change month, **B / Esc** to close.
- **Email inbox** — press **Y** or **E** (or click the *Email Inbox* prompt) to open;
  press **B** or **Esc** (or click *Close Inbox*) to return.
- **Save** — click the *Save* footer prompt to write your career to IndexedDB.
- **Deep links** — jump straight to a screen either via hash or query string, e.g.
  `index.html#season` / `index.html?screen=season`, or `index.html#email` /
  `index.html?screen=email`. Both forms are supported (only once you're past the New Game
  wizard / have a save loaded).

The UI renders on a fixed **1280×720 (16:9)** stage that scales to fit any window, like the
console game.

## Run locally

The app is built from **ES modules** (`<script type="module">`), which browsers refuse to
load over `file://`. Serve the folder over HTTP instead:

```bash
python -m http.server 8000
# then visit http://localhost:8000
```

GitHub Pages serves everything over HTTP already, so deployment is unaffected.

**Starting over**: once you've created a career it autosaves to IndexedDB and reloading the
page skips straight back into it (no New Game screen). To force the wizard again, either open
the site in a private/incognito window, or DevTools → Application → IndexedDB → delete the
`fm-career` database and refresh.

## Dev pages

- `dev/world.html` — browses the authored world data (`data/*.json`): every league's clubs
  with a procedurally generated crest, plus nations, cups/tournaments and name-pool sizes.
  Verifies milestone M1 (world data) — counts should read ~35 leagues / ~600 clubs / ~50
  nations.
- `dev/tests.html` — live assert harness verifying milestones M2 (player/world generation) and
  M3 (calendar/fixtures): the mandatory overall-calculation test vectors (Messi → 93±1,
  Neuer → 88), growth-curve sanity, a full world generation with a performance budget (<3s),
  RNG determinism, a compact-save serialization round-trip, every league's fixture-count/
  home-away-balance/no-self-play/no-double-booking invariants, international-break exclusion,
  fixture-schedule determinism, Advance's stop-on-match-day behaviour, and the board
  objective-email builder. Should read **63/63 passing**.

Visit either at `http://localhost:8000/dev/<page>.html` while serving locally.

## Project structure

```
index.html                # entry point: stage, New Game wizard, all screens/overlays
css/base.css               # design tokens, 16:9 stage scaling, backgrounds, fonts
css/chrome.css              # header, tab bar, footer prompts + reusable panel/tile components
css/screens.css             # per-screen layouts + email/news overlays
css/newgame.css             # New Game wizard (name/league/club/progress steps)
css/tables.css              # Squad List overlay
css/bio.css                 # Player Bio overlay
css/calendar.css             # Calendar overlay: full month-view grid
css/flags.css               # nation flags for Player Bio (all ~50 nations, pure CSS)
js/main.js                 # bootstrap: loads a save or runs New Game, then wires up the game
js/stage.js                 # scales the 16:9 stage to the window
js/carousel.js               # generic [data-carousel] tile paging widget
js/core/store.js            # GameState + pub/sub; createCareerState/hydrateFromSave build it
js/core/router.js            # screen/overlay switching, footer prompts, deep links
js/core/rng.js               # seeded PRNG (mulberry32) — all generation draws from this
js/core/format.js            # date/number/money display formatting
js/core/clock.js             # calendar-date arithmetic (epoch-day conversion, addDays, ...)
js/core/db.js                # IndexedDB save slots + compact player array serialization
js/ui/render.js              # renders Central/Squad/Transfers/Office/Season/email from GameState
js/ui/newgame.js             # New Game wizard controller
js/ui/squadlist.js           # Squad List screen renderer
js/ui/playerbio.js           # Player Bio screen renderer
js/ui/calendarui.js          # Calendar overlay: month-view grid renderer
js/gen/names.js              # deterministic player-name generation from data/names/*.json
js/gen/crest.js              # procedural crest + kit SVG generator, keyed off club colours
js/gen/overall.js            # attribute → overall calculation (position weight tables)
js/gen/archetypes.js         # per-position mean-attribute templates used by gen/player.js
js/gen/player.js             # generates one Player (schema in fable-plans/plan1.md)
js/gen/squad.js              # generates one club's 24-man squad + best-XI
js/gen/world.js              # generates the full world (every club, ~15k players)
js/engine/calendar.js        # fixture generation across every league, Advance/stop logic, month cells
js/engine/comps/league.js    # double round-robin fixture scheduler + league table builder
js/engine/objectives.js      # day-1 board objective emails (League + Domestic Cup)
js/config/positions.js       # the 28 FIFA position codes + grouping tables
js/config/growth.js          # playergrowth.ini age→ratio curves (potential inversion)
js/config/playergen.js       # scout.ini workrate/skillmove/weakfoot tables + squad templates
js/config/attributes.js      # the 29 outfield + 5 GK attribute names/groupings
js/config/calendar.js        # season key dates: transfer windows, deadline days, growth days, intl breaks
data/leagues.json            # ~35 leagues (ported from reference/ini/playerwages.ini)
data/clubs.json              # ~600 clubs: prestige, crest/kit colours, stadium, budget, board tier
data/nations.json            # ~50 national teams: prestige, quality weighting, name-pool mapping
data/cups.json               # domestic cups, continental comps, international tournaments
data/names/*.json            # first/last name pools, one file per nation (50 nations)
dev/world.html, dev/world.js # dev page: every league→club with generated crests + nations/cups/pools
dev/tests.html, dev/tests.js # dev page: assert harness for player/world generation + calendar/fixtures
reference/ini/                # FIFA 17 career-mode INI files, ported for tuning-number reference
fable-plans/plan1.md          # the full build plan (milestones M0–M11)
.nojekyll                     # tells GitHub Pages to serve files as-is
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
