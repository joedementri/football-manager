# FIFA 15 Manager Career — Full Browser Game Implementation Plan

## Context

The repo currently contains a **visual-only prototype** of the FIFA 15 Manager Career menus
(`index.html` + `css/base|chrome|screens.css` + `js/stage|carousel|navigation.js`) that already
nails the look: fixed 1280×720 stage, Saira Condensed type, gold-accent tiles, 5-tab layout
(Central / Squad / Transfers / Office / Season), email + news overlays, footer button prompts.
`REFERENCE_PICS/` holds 9 screenshots that are the visual spec.

The goal is to turn this into a **fully playable manager career game** hosted on GitHub Pages:
full FIFA 15 world (all leagues, clubs, nations), randomly generated players, day-by-day calendar,
match simulation with a live ticker, transfers with CPU AI, GTN pro scouting, youth academy,
contracts/values/wages, domestic cups, continental cups, internationals (World Cup/Euros +
manageable national teams), board objectives, and job offers.

Mechanics are grounded in the **FIFA 17 career mode INI files** at
`c:\Users\joede\Downloads\Fifa-17---IniToCT-master\Fifa-17---IniToCT-master\` (FIFA 17 ≈ FIFA 15
plus training; **we deliberately skip training** — players grow from playtime + form, exactly as
the `playergrowth.ini` match-rating/playtime modifiers describe).

User decisions already made:
- **Match day**: live sim ticker overlay (speed controls, sim-to-end, subs at stoppages).
- **World**: full FIFA 15 world — all ~35 leagues / ~600 clubs / ~50 national teams, all fully simmed.
- **Players**: 100% randomly generated from country name pools (real-player file may come later —
  keep the player schema data-driven so a real DB can be dropped in).
- **Internationals**: tournaments simmed on realistic cycles; NT jobs can be offered to the user later in career.
- **Delivery**: sequential milestones, each independently verifiable in the browser.

---

## Ground rules (apply to every milestone)

1. **Look & feel is sacred.** Every new screen reuses the existing tokens/components
   (`css/base.css` design tokens, `.tile`, `.panel-title`, `.tbl`, `.dots`, footer prompts,
   breadcrumb pattern from the news overlay: `CENTRAL › NEWS`). New CSS goes in new files
   (`css/tables.css`, `css/bio.css`, `css/matchday.css`, …) — do not rewrite existing CSS, extend it.
   When in doubt, open the matching file in `REFERENCE_PICS/`.
2. **No build step, no framework.** Vanilla JS **ES modules** (`<script type="module">`).
   This drops `file://` support — update README to say "serve with `python -m http.server`"
   (GitHub Pages unaffected). No external CDNs; vendor anything needed into the repo.
3. **Deterministic RNG.** All generation/sim goes through a seeded PRNG (mulberry32) in
   `js/core/rng.js`. Never `Math.random()` in game logic. The save stores the seed + stream states.
4. **Config over code.** Port all tuning numbers from the INI files into `js/config/*.js`
   modules (one per system) with the INI filename cited in a header comment. First task of the
   first milestone: **copy the FIFA 17 INI folder into `reference/ini/` in this repo** so the
   implementer can consult it without leaving the project.
5. **Fixed stage, keyboard + mouse.** Keep the 1280×720 scaled stage and the existing
   tab/arrow-key navigation model. Every screen gets correct footer prompts.
6. **Money** is stored in pounds (INIs are pounds); display currency selectable in Settings (£/$/€, fixed rates).

---

## Architecture & file layout

```
index.html                    # shell: header, tabbar, screen containers, overlays
css/  base|chrome|screens.css # existing (extend, don't rewrite)
      tables.css bio.css matchday.css newgame.css …
js/
  core/    rng.js  store.js  db.js  router.js  format.js  clock.js
  config/  growth.js value.js wage.js contract.js sim.js scouting.js
           youth.js transfer.js form.js objectives.js retirement.js
  gen/     names.js player.js overall.js squad.js world.js youth.js regen.js
  engine/  calendar.js form.js fitness.js growth.js value.js wage.js
           contracts.js transferai.js negotiation.js gtn.js academy.js
           news.js email.js objectives.js jobs.js awards.js retirement.js
           sim/match.js sim/quick.js sim/events.js
           comps/league.js comps/cup.js comps/continental.js comps/intl.js
  ui/      components.js central.js squad.js squadlist.js playerbio.js
           teamsheet.js tactics.js transfers.js search.js negotiate.js
           gtnui.js office.js inbox.js contractsui.js youthui.js
           season.js calendarui.js tablesui.js statsui.js matchday.js
           newgame.js jobsui.js myCareer.js settings.js
data/
  leagues.json clubs.json nations.json cups.json
  names/<region>.json         # first/last name pools per nation cluster
reference/ini/                # copied FIFA 17 INIs (tuning reference)
REFERENCE_PICS/               # visual spec (already present)
```

- `core/store.js` — single mutable `GameState` object + pub/sub (`on('advance')`, `on('screen')` …).
- `core/db.js` — IndexedDB wrapper: 3 save slots + autosave. Player records serialize to
  **compact arrays** (attributes in a fixed order, ints) so a ~15k-player world stays a few MB.
  Settings (sound, currency) in localStorage.
- `core/router.js` — grows out of `js/navigation.js`: screens, subscreens (breadcrumbs), overlays,
  footer-prompt swapping, hash deep links.

---

## Data model

### Player (the heart of everything)

```js
{
  id, firstName, lastName, commonName,          // from country name pool
  nationId, clubId, natTeamId?,                 // country always; natTeam if called up
  age, birthDate,                               // birthdate drives age-up
  heightCm, weightKg,                           // display: cm AND ft'in" (bio screen shows both)
  position,                                     // one of the 28 FIFA position codes (GK…LW)
  altPositions: [],                             // 0–2
  foot: 'L'|'R',
  weakFoot: 1..5, skillMoves: 1..5,             // stars
  workRateAtt: 'Low'|'Medium'|'High',
  workRateDef: 'Low'|'Medium'|'High',
  attrs: { /* the 29 outfield attributes, exact FIFA 15 names */
    // PAC: acceleration, sprintSpeed
    // SHO: positioning, finishing, longShots, penalties, shotPower, volleys
    // PAS: crossing, curve, fkAccuracy, longPass, shortPass, vision
    // DRI: agility, balance, ballControl, dribbling, reactions
    // DEF: headingAcc, interceptions, marking, standTackle, slideTackle
    // PHY: aggression, jumping, stamina, strength
    // GK only adds: gkDiving, gkHandling, gkKicking, gkPositioning, gkReflexes
  },
  overall,                                       // COMPUTED — see below, never stored stale
  potential,                                     // 40–99, hidden true value
  joinedClubYear,
  contract: { wage, endYear, signingBonus, squadRole },   // role: crucial/important/rotation/prospect
  value,                                         // recomputed lazily (engine/value.js)
  form: 1..10, morale: 1..10, fitness: 0..100, injury: {type, daysLeft} | null,
  seasonStats: { apps, goals, assists, cleanSheets, avgRating, yellows, reds }, careerStats: [...],
  kitNumber, isYouth: false,
  scouting: { level: 0..3, ovrRange:[lo,hi], potRange:[lo,hi] }   // what the USER knows (GTN/youth)
}
```

**Potential band strings** (shown on the bio for players age ≤ 23 whose potential exceeds
current overall; everyone else shows the joined-club line):

| potential | string |
|---|---|
| 90+ | “Has potential to be special” |
| 85–89 | “An exciting prospect” |
| 80–84 | “Showing great potential” |
| < 80 | “Joined club in {joinedClubYear}” |

### Overall calculation — `gen/overall.js`

Weighted sum of attributes with **one weight table per position group**
(GK, CB, FB/WB, CDM, CM, CAM, WM/wingers, ST/CF), weights summing to 1, result rounded.
Start from the known FIFA 15 coefficients (implementer: they’re close to these for ST —
finishing .18, positioning .13, headingAcc .10, shotPower .10, ballControl .10, reactions .08,
dribbling .07, sprintSpeed .05, strength .05, acceleration .04, volleys .03, agility .03,
longShots .03, balance .02, jumping .02, penalties .01, curve .01, …) and **calibrate against
these two mandatory test vectors** (unit-test them in a `tests.html` harness page):

- **Messi vector** (position RW/CF): acc 96, spr 90 / pos 92, fin 94, LS 88, pen 76, SP 80, vol 85 /
  cross 84, curve 89, FK 90, LP 76, shortP 89, vis 90 / agi 94, bal 95, BC 96, dri 96, rea 94 /
  head 71, int 22, mark 25, standT 21, slideT 20 / agg 48, jump 73, sta 77, str 60 → **overall 93 ± 1**.
- **GK formula** (verified against Neuer = 88): `ovr = .21·(div+han+pos+ref) + .05·kick + .11·reactions`
  → with div 88, han 85, pos 90, ref 86, kick 91, reactions 88 ⇒ 87.5 → **88**. Use exactly this.

### World data (static JSON, authored in Milestone 1)

- `data/leagues.json` — every FIFA 15 league (~35): id, name, country, tier, teams count,
  promotion/relegation links (England 4 tiers; Spain/Italy/Germany/France 2; rest standalone),
  prestige 1–10, wage modifier (port `[WAGE_LEAGUE]` from `playerwages.ini`).
- `data/clubs.json` — ~600 clubs: id, name, short name, leagueId, prestige 1–10 (drives budgets,
  AI, objectives), crest colours (primary/secondary/accent — crests are procedural SVG shields,
  extending the existing `crest-*` symbol approach with a generator), kit colours, stadium name,
  rivalId, baseTransferBudget, board expectation tier.
- `data/nations.json` — ~50 national teams (prestige, confed) **plus** the full nationality pool
  (nation → name-pool region, player quality weighting) for regen/youth generation.
- `data/cups.json` — domestic cup definitions (England: FA Cup + League Cup; one cup per other
  country), continental comps (unlicensed names: “European Champions Cup”, “European Trophy”,
  “Copa Libertadores”-alike), intl tournaments + cycles (WC 2018/2022…, Euro 2016/2020,
  Copa América, qualifiers).
- `data/names/*.json` — first/last name pools grouped by region (British, Spanish, Portuguese/BR,
  Italian, French, German, Dutch/Scandi, Slavic, Turkish/Arabic, West African, East Asian,
  Latin American…), each nation mapping to a pool + optional diaspora mix.

This data is authored by the implementing model from public knowledge of the FIFA 15 league/club
list. Names must be plausible but need not be exhaustive (~150 first/last per pool).

---

## Core mechanics (ported from the INIs)

### Player generation — `gen/player.js`
1. Pick position (club needs a realistic squad shape: 3 GK, 8 DEF, 8 MID, 5 ATT for 24-man squads).
2. Target overall from club prestige + league tier (league mean ± spread; e.g. EPL mean 74σ5,
   League Two mean 58σ4 — put table in `config/…`).
3. Age from realistic distribution (17–36, peak density 22–29).
4. Potential: `max(overall, sample)` where young players get big upside
   (use `playergrowth.ini` age-ratio curves **inverted**: a 17-y-o at 60 with ratio .56–.7 implies
   potential ≈ 60/0.65; clamp 45–99, small chance of 90+).
5. Attributes: per-position archetype template (means per attribute) + noise, then **solve**:
   scale attrs so the computed overall hits the target (iterate ×2). GK outfield stats low
   (25–60) like the Neuer example; outfielders get GK stats 5–15 (not shown in UI).
6. Height/weight by position (GK/CB 184–200 cm; wingers/fullbacks shorter), workrates by position
   (port the `POS_x_ATT/DEF_WORKRATE_*_CHANCE` tables from `scout.ini` `[PLAYER_ATTRIBUTES]`),
   weak foot/skill moves distributions (skill 4–5★ rare, attackers skewed higher).

### Value — `engine/value.js` (direct port of `playervalues.ini`)
`value = baseByRating(overall)` (the 53-row RATINGRANGE table) then multiply by
`(1 + pct/100)` for each modifier: **age** ([AGE] table, GK age shift −3 after 28), **remaining
potential** ([POTENTIAL] table: +15% at +1 up to +235% at +50), **contract years left**
([CONTRACT]: −70% expiring → +20% at 3+), **form** ([FORM]: −60%…+80%), **position**
([POSITION]: GK −15% … ST +18%), **club prestige** ([CLUB_PRESTIGE]).

### Wages — `engine/wage.js` (port of `playerwages.ini`)
`wage = baseByRating(overall) × leagueModifier × (1+agePct) × (1+posPct)`, weekly £.
(Base table row × league modifier reproduces sane FIFA 15 wages: 90-rated EPL ⇒ 1300×70 ≈ £91k/wk;
60-rated League One ⇒ 60×8 = £480/wk.)

### Growth & decline — `engine/growth.js` (port of `playergrowth.ini`, **no training**)
- 7 curves by position group (GK / FB / CB / CDM / CM+CAM / WM+wingers / ST), each an
  age→ratio table (`potential × ratio(age)` = expected overall). Port all 7 verbatim.
- Applied **twice per season** (Feb 1 and July 1, from `MONTH_TO_APPLY_GROWTH`).
- `delta = (expected − current) × 0.9 attenuation`, then: below-curve boost up to ×1.5,
  above-curve damp to ×0 (the `ABOVE/BELOW_CURVE_*` params), ±10% random variance,
  **match-rating bonus ±10%** (avg rating good/bad thresholds from `formsettings.ini` PLAYER_EVAL),
  **playtime bonus up to +10%** (linear to 270 min per the growth window), injury attenuation
  (growth ×5% while injured; decline ×150%).
- Distribute overall points to attributes using the per-curve age-bracket weights
  (physical/skill/mental buckets — port `WEIGHT_*` tables; mental = reactions, positioning,
  interceptions, vision, aggression; physical = pace/jump/stamina/strength/balance/agility;
  skill = the rest). Old players decline physical-first (the weight tables already encode this).
- This is what makes “play your youngsters” the progression system, faithful to FIFA 15.

### Form & morale — `engine/form.js` (port of `formsettings.ini`)
- Form = weighted avg of last 10 match ratings for user-club players (weights 1,1,1,1,1,1,2,3,4,7),
  last 5 for CPU (1,2,3,4,7); map avg rating (internal 0–100) to 1–10 form.
- Morale: playing time vs expected squad role, results, transfer listing, contract situation.
  Both feed value and (slightly) match-day team strength.

### Fitness & injuries — `engine/fitness.js` (port of `simsettings.ini` [FATIGUE]/[INJURY])
- Energy 100 max; per match lose `21 × (1 − stamina/200)`-ish (stamina-scaled base 21, GK ×0.25);
  recover +8/day idle, +2 injured. Squad rotation matters.
- Injuries in sim: 15%/match, severity 80/13/7 (light/medium/severe) → out 3–10 / 14–45 / 60–180 days.
  Injury list tile already exists on Squad screen.

### Match simulation — `engine/sim/`
- **`quick.js`** (all CPU-vs-CPU matches): team strength = starting-XI weighted overall (rating
  influence 78%), + home adv 4, + prestige/competition terms (per `[INFLUENCE]`), fatigue-adjusted.
  Convert strength gap → expected goals (Poisson, gap→λ table calibrated so: even teams ≈ 1.3–1.5
  goals each; +10 ovr ⇒ ~70% win rate; giant-killing possible per `[FOG]`). Produce score,
  scorers/assisters (weighted by position + finishing/vision), cards, injuries, per-player ratings
  (base 60, goal/assist/cleansheet/win+8/loss−5 style from `[MATCH_RATINGS]`, scale to 0–100).
- **`match.js` + `events.js`** (user matches): same statistical core, but pre-generate a **minute
  timeline** of events (chances strong/weak counts from the `[SCORE]` gap-scale buckets, each
  chance resolved attacker-vs-GK; cards 50% first yellow, −10%/subsequent, red 3%; injuries;
  subs windows). The ticker replays this timeline, **but** user subs/tactic changes at stoppages
  re-sim the remaining minutes with updated strength — so decisions matter.
- Half length setting scales nothing (fixed 90'); difficulty setting scales user team strength ±3%.

### Transfers — `engine/transferai.js` + `negotiation.js` (port `transfer*.ini`)
- **Windows**: Jul 1–Sep 1 and Jan 1–Feb 1 (deadline-day activity spike per `TRANSFERS_DEADLINEDAY`).
- **CPU↔CPU**: weekly during windows each club: compute needs (depth per position vs squad-size
  target; upgrade if starter below league mean −3), budget = f(prestige, league, last finish);
  pick targets from other clubs (affordable, value×0.8–1.3, better than incumbent); selling club
  accepts if (surplus player) or (bid ≥ value × need-factor); player accepts via decision points
  (wage ↑, league/club prestige ↑, playing time — `TRANSFERS_PLAYER_DECISION_POINTS`). Generates
  transfer news + affects squads. Cap volume (~40 completed CPU transfers/window across top leagues,
  scaled down for minor leagues) for performance and realism.
- **User buys**: Search/GTN → approach club → **fee negotiation** (offer, club counters up to 3
  rounds; acceptance threshold scales with need, contract length, transfer-listed status)
  → **contract talks** (player asks wage = f(current wage, new club prestige, role promise) and
  length; acceptance via `playercontract.ini` PERCENTAGE_OF_ASK curve: ≥100% ask ⇒ ~80–100%,
  offer signing bonus to cover gaps ≤ 115% per `PERCENTAGE_OF_ASK_TO_IGNORE_BONUS`) → completes
  on window open / instantly inside window. Loans (with wage share) and free agents included.
- **User sells**: transfer-/loan-list players (existing Sell Players tile) ⇒ CPU bids arrive as
  emails over following days (probability from value vs list price, form, window timing).
- **Budgets**: transfer budget + wage budget per season from board (Finances tile already shows
  them); Request Funds tile moves money wage↔transfer or begs the board (chance = board trust).

### Contracts — `engine/contracts.js` (port `playercontract.ini`)
- Renegotiation flow in Office ▸ Contracts: player asks per OVERALL/AGE percentage tables;
  squad-role and age modify acceptance; re-signing fee 7% of value; expiring contracts (< 2 yrs,
  60-day warning email); Bosman: CPU clubs approach your expiring players (and you theirs) in Jan.
- CPU auto-renews per the STARTING11/SUB/RESERVE probability tables each May.

### GTN pro scouting — `engine/gtn.js` (port `scout.ini` [GTN])
- Hire up to **6 scouts**; pool of 5 candidates refreshing weekly; each has **Experience 1–5★**
  (finds more players & better type match) and **Judgment 1–5★** (accuracy of ranges + odds of
  finding high-potential); hire cost + monthly salary by stars; sack cost £5k/star.
- Missions: assign scout → country/region + instructions (position group + player type tags like
  “Pacey, Prolific” exactly as the Transfers reference pic shows) + age/value filters.
  After 10 days first report, then updates weekly: up to `MAX_SCOUTED_PLAYERS_LEVEL_★` players.
- Discovered players show **fuzzy ratings**: scouting level 1 ⇒ ovr/pot as wide ranges (±6),
  level 2 ⇒ ±3, level 3 (fully scouted) ⇒ exact. GTN tile on Central shows “+N New / N Updates”
  (already in the prototype). Un-scouted players in Search show ranges too — scouting is the
  only way to see true numbers (authentic FIFA 15 GTN feel).

### Youth academy — `engine/academy.js` (port `youth_scout.ini` + `scout.ini` [YOUTH_SCOUT])
- Hire up to **3 youth scouts** (same Experience/Judgment stars; costs from
  `SCOUT_COST_KNOWLEDGE/EXPERIENCE_LEVEL_*`). Send to a nation; monthly report brings 1–3
  prospects **age 15–17**; player type requested (Attacker, Defensive Minded, Goalkeeper,
  Physically Strong, Skilled…) honoured with probability scaling with Experience.
- Prospect tier by Judgment roll → potential range: T1 75–95, T2 65–90, T3 60–85, T4 55–80
  (`[PLAYER_ATTRIBUTES]` tiers); shown to user only as ranges + the **potential band strings**.
- Youth squad (max 16): players develop monthly (small attr gains), ranges narrow each month;
  **promote** (signs 3-yr pro contract, joins seniors, band string now on bio) or **release**;
  prospects may threaten to leave if not promoted (retirement warning email per
  `NUMBER_DAYS_TO_RETIRE_PLAYER`).

### Competitions — `engine/comps/`
- **League**: double round-robin scheduler (circle method), correct sizes per league; tables
  (Pld W D L GF GA GD Pts), tiebreakers GD→GF; promotion/relegation between linked tiers
  (England ×4: 3 up/down; ES/IT/DE/FR ×2; others champions-only honours).
- **Domestic cups**: knockout with round draws, lower-tier entry rounds (FA Cup: L2/L1 enter R1,
  Championship+EPL R3; League Cup similar); single leg + penalties; final at neutral venue.
  Cup draws appear in news + Season ▸ Tables tile (the “F.A. Cup — Round 2” panel already exists).
- **Continental**: “European Champions Cup” (32 teams, 8 groups → KO) and “European Trophy”
  seeded from prior-season league positions across all European leagues in data; midweek dates.
  South American analogue for those leagues. User qualifies by league finish.
- **Internationals** — `comps/intl.js`: qualifiers in intl breaks (Sep/Oct/Nov/Mar), tournaments
  each summer cycle (Euro+Copa 2016, WC 2018, …); NT squads = top-rated players per nation
  (call-ups generate emails when your players leave); league pauses on break weeks.
  Manager reputation ≥ threshold + vacancies ⇒ **NT job offers** (manage club + country
  simultaneously like FIFA 15: NATL Squad tiles on Squad screen unlock, squad selection before
  each break, NT matches simmed via the same ticker).

### Season frame — `engine/calendar.js`, `objectives.js`, `jobs.js`, `awards.js`, `retirement.js`
- Calendar starts **July 1, 2014**; day-strip Advance (existing Central UI) with events:
  match days, window open/close, deadline day, growth days, board reviews, intl breaks.
  Multi-day advance stops at any event needing user input (match, email flagged critical).
- **Objectives** (`seasonobjectives.ini`): board sets league + cup objectives from club prestige
  vs league (the existing board emails); mid-season review; failure ⇒ sack warning ⇒ sacked
  (job market only); success builds manager rep (1–20 scale).
- **Browse Jobs** (Office tile): openings list (CPU managers get sacked too — simple rep sim);
  apply → interview email → offer; NT vacancies included later in career.
- **Season rollover** (July 1): awards (league champions, golden boot, best XI news), growth
  application, age++, retirements (`playerretirement.ini`: age 33+ & declining ⇒ announce in
  Jan, retire in July), **regens** (retired player respawns as 16–18 y-o youth prospect,
  `[PLAYER_REGEN]`), promotion/relegation applied, new fixtures, budgets reset, contracts −1yr.
- **News/email generators** (`news.js`, `email.js`): template library with slot-filling
  ({player}, {club}, {fee}…) covering: results/previews, transfers (rumour → talks → done deal),
  injuries, form streaks, milestones, board, scouting, youth, intl. Categories map to the existing
  news-overlay tabs (Breaking/World/Club/Transfer/Intl) and inbox tabs.

---

## Screens to build (visual spec = REFERENCE_PICS + existing CSS)

| Screen | Subscreens to implement |
|---|---|
| **New Game** (new, pre-career) | manager name → league → club pick (crest grid, board expectations preview) → world-gen progress bar (“Generating players… Scheduling fixtures…”) |
| **Central** | live tiles (Advance strip w/ real dates+events, headline news, GTN counts, news list, mini league table) — all wired to state; Advance button sims days |
| **Squad** | Squad List (sortable table: #, name, pos, age, OVR, form, fitness, value, wage, status icons — this is the main roster screen), Player Bio (6-panel attribute layout exactly as user specced, info column: age/height cm+ft'in/weight/foot/workrates/weak foot★/skills★/value/wage/contract/form/morale + potential-band line), Team Sheet editor (drag jerseys on the existing pitch, formation picker), Tactics (sliders: speed/passing/positioning presets affecting sim ±2%), Kit Numbers, Injury List, Squad Report/Ranking |
| **Transfers** | Scouted-players hub (existing striker tile pattern per active mission), Search Players (filter form: pos/age/ovr-range/value/league + results table w/ fuzzy ratings), player actions (Scout / Bid / Loan), Negotiation screens (fee talks then contract talks, styled like email/board panels), Sell/Loan list management, GTN mission management (map-ish region picker, scout cards w/ ★s), Finances |
| **Office** | Inbox (existing overlay becomes real: emails from all systems, YES/NO decision emails), Contracts (renew flow), Youth Staff (scouts + monthly reports + youth squad w/ promote/release), My Career (manager rep, trophy cabinet, history table), Request Funds, Browse Jobs, Settings (difficulty, currency, autosave, sim detail) |
| **Season** | Calendar (month grid, existing gold tile ➜ full month view), League Tables (all leagues browsable), Fixtures & Results (by matchday), Cup brackets, Team Stats, Player Stats (leaderboards: goals/assists/ratings/cleansheets per league), Trophy/awards history |
| **Match Day** (new overlay) | pre-match (lineups, form, H2H) → live ticker (minute clock, event feed, score, speed ×1/×4/instant, pause for subs/tactics at stoppages, other-league scores footer) → full-time report (ratings, MOM, stats) |

---

## Milestones (each ends runnable + verifiable)

**M0 — Foundation refactor** *(no visible change)*
Convert scripts to ES modules; add `core/` (rng, store, router, format, db stub); screens render
from a `GameState` stub identical to today’s hardcoded content. Copy INIs to `reference/ini/`.
✔ Site looks pixel-identical; `?screen=` deep links still work.

**M1 — World data**
Author `data/*.json` (leagues, clubs, nations, cups, name pools) + `gen/names.js` + procedural
crest/kit SVG generator keyed off club colours.
✔ A dev page (`dev/world.html`) lists every league→club with crests; counts match FIFA 15.

**M2 — Player & world generation**
`gen/overall.js` (+ Messi/Neuer test vectors in `dev/tests.html`), `gen/player.js`, `gen/squad.js`,
`gen/world.js` (~15k players in <3s), compact serialization + IndexedDB saves, **New Game flow**,
**Squad List** + **Player Bio** screens.
✔ Start career as any of ~600 clubs; browse a believable squad; bio shows all specced fields;
save/reload works; test vectors pass.

**M3 — Calendar & season schedule**
`engine/calendar.js`, league fixture generation for all leagues, Advance loop (day strip live),
emails/news minimally wired (board objective emails on day 1 — content already exists in prototype).
✔ Advance from Jul 1 to a match day; calendar month view shows fixtures; objective email arrives.

**M4 — Match engine + live ticker**
`sim/quick.js` for the world, `sim/match.js`+`events.js`+`ui/matchday.js` for user matches; league
tables, results, form, fitness, injuries, per-player season stats all update.
✔ Play a full match with the ticker (make a sub mid-match); all leagues’ tables fill in
believably (spot-check: strong teams top tables at season end when auto-simming).

**M5 — Full season loop**
Domestic cups, promotion/relegation, growth application (Feb/Jul), age-up, retirement+regens,
awards, objectives evaluation + sacking, season rollover into 2015/16.
✔ Sim an entire season end-to-end in one sitting; young high-potential player grows with playtime;
tables/cups/rollover all coherent; getting sacked sends you to Browse Jobs.

**M6 — Money: value, wages, contracts**
Port value/wage tables; contract renewal UI + AI renewals; expiring-contract warnings; finances.
✔ Values/wages sane across leagues (spot-check table in dev page); renew a contract; a CPU club
signs your Bosman if ignored.

**M7 — Transfers**
User buy (fee talks → contract talks), sell/loan lists + incoming CPU bids, free agents, loans,
CPU↔CPU window AI, deadline day, transfer news, Request Funds.
✔ Buy and sell players inside a window; watch believable CPU transfers hit the news; budgets enforce.

**M8 — GTN scouting**
Scout market/hire/missions/reports, fuzzy ratings everywhere un-scouted, Search Players filters,
Central GTN tile live.
✔ Hire a 5★-judgment scout, run a “Pacey, Prolific ST” mission, ranges narrow over 3 weeks, sign the find.

**M9 — Youth academy**
Youth scouts, monthly reports, youth squad screen, development, promote/release, band strings.
✔ Discover a “Has potential to be special” 16-y-o, promote him, watch him grow via playtime (M5 growth).

**M10 — Continental + internationals + NT jobs**
Continental groups/KO on midweeks, intl breaks + qualifiers + summer tournaments, call-up emails,
manager rep, NT job offers unlocking NATL tiles/squad selection.
✔ Qualify for the Champions Cup; players leave on WC duty summer 2018; accept an NT job and pick a squad.

**M11 — Polish & fidelity pass**
Team Stats/Player Stats screens, Squad Report/Ranking, Tactics/Player Roles effects, Kit Numbers,
My Career, Settings, sound-free juice (transitions), performance pass (weekend sim < 300ms),
save-slot management + export/import, README + GitHub Pages check against every REFERENCE_PIC.
✔ Side-by-side screenshot comparison with all 9 reference pics; multi-season save stays < 10MB;
full season sim-through without errors.

---

## Verification

- `dev/tests.html`: assert harness — overall test vectors (Messi 93±1, Neuer 88), value/wage
  spot-checks, fixture-count invariants, growth-curve monotonicity, save round-trip equality.
- `dev/world.html` + `dev/balance.html`: world browser and 10-season headless auto-sim producing
  distribution reports (league table spreads, transfer volumes, growth trajectories) to eyeball balance.
- Manual: each milestone’s ✔ checks; final pass = play 2 seasons on GitHub Pages
  (`https://joedementri.github.io/football-manager/`) on Chrome + Firefox.
- Visual: compare every screen to `REFERENCE_PICS/*.png` before calling a milestone done.

## Notes for the implementing model

- Read `reference/ini/<file>.ini` before writing each `js/config/*.js` — port numbers, don’t invent.
- Never block the UI: world-gen and multi-day sims run in chunks (`requestIdleCallback`/loop slicing)
  behind progress UI.
- The player schema is the contract — real-player data files may replace `gen/world.js` output
  later, so keep generation and consumption strictly separated.
- Keep each UI module rendering from state only (no logic in UI files); all mutations via engine
  functions so the sim stays testable headless.
