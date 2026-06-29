# FIFA 15 Manager Career — Browser Prototype

A static, browser-based recreation of the **FIFA 15 Manager Career Mode** menu screens,
built to run on GitHub Pages. This first pass is **visual/layout only** — the look, menus,
and screen-to-screen paging are in place, but there is no game logic yet.

## https://joedementri.github.io/football-manager/

## Screens

Five main screens plus an email overlay, all faithful to the original UI:

| Screen | Contents |
| --- | --- |
| **Central** | Advance day-strip, news headline, Global Transfer Network, News, Tables |
| **Squad** | 4-5-1 formation pitch + Club/Natl Squad, Squad Report, Team Sheets, Kit Numbers tiles |
| **Transfers** | Scouted strikers, Search/Sell Players, GTN, Finances |
| **Office** | Inbox, Contracts, Youth Staff, My Career, Request Funds, Browse Jobs, Settings |
| **Season** | Calendar, Other Leagues, Team/Player Stats, Tables, Fixtures |
| **Email** | Inbox overlay (Emails / Player Conversations / Message Archive) with reading pane |

All club crests, player faces, and photos are **CSS/SVG placeholders** — no licensed assets.

## Controls

- **Tabs** — click `Central / Squad / Transfers / Office / Season`, or press **← / →** to
  page between screens (wraps around).
- **Email inbox** — press **Y** or **E** (or click the *Email Inbox* prompt) to open;
  press **B** or **Esc** (or click *Close Inbox*) to return.
- **Deep links** — open with a hash to jump straight to a screen, e.g.
  `index.html#season` or `index.html#email`.

The UI renders on a fixed **1280×720 (16:9)** stage that scales to fit any window, like the
console game.

## Run locally

Just open `index.html` in a browser. Everything is self-contained (the SVG sprite is inlined,
so it works over `file://`). The only network request is an optional Google Fonts link; the
layout falls back to system fonts offline.

To serve it like GitHub Pages does:

```bash
python -m http.server 8000
# then visit http://localhost:8000
```

## Project structure

```
index.html        # entry point: stage, inline SVG sprite, all six screens
css/base.css      # design tokens, 16:9 stage scaling, backgrounds, fonts
css/chrome.css    # header, tab bar, footer prompts + reusable panel/tile components
css/screens.css   # per-screen layouts + email overlay
js/stage.js       # scales the 16:9 stage to the window
js/navigation.js  # tab switching, ←/→ paging, email overlay, deep links
.nojekyll         # tells GitHub Pages to serve files as-is
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
