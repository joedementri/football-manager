// gen/crest.js — procedural crest + kit SVG generator, keyed off each club's
// `crest`/`kit` colours from data/clubs.json (plan1.md M1: "procedural
// crest/kit SVG generator keyed off club colours"). Extends the hand-drawn
// crest-a/b/c/d/pompey <symbol> shields already inlined in index.html: same
// shield outline + viewBox, so a generated crest can drop into any
// `<svg class="crest"><use href="#crest-<id>"></use></svg>` call site those
// placeholders use today.
//
// Deterministic: which emblem a club gets is a pure function of its id (via
// stableHash below), never Math.random() — two runs of this module always
// draw the same club the same way (ground rule #3's spirit, even though this
// is presentation rather than sim/gen data).

export const SHIELD_PATH = "M4 4h40v30c0 12-13 18-20 22C17 52 4 46 4 34V4z";
const KIT_PATH = "M8 3 4 6l2 3 1-1v12h10V8l1 1 2-3-4-3-2 2H10L8 3z";

/** Same string-hash algorithm as the data-authoring script (gen_world_data.py's
 * stable_hash) so crest variant choice is reproducible and not tied to any
 * particular JS engine's string-hashing (there isn't a standard one anyway). */
function stableHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** 'M x y L x y ... Z' path for an n-pointed star centered at (cx,cy). */
function starPath(cx, cy, rOuter, rInner, points = 5) {
  const step = Math.PI / points;
  let d = "";
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const angle = -Math.PI / 2 + i * step;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    d += `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)} `;
  }
  return d + "Z";
}

// Each emblem is drawn *inside* the shield, in the club's secondary/accent
// colours over the primary-filled shield background.
const EMBLEMS = [
  (club) => // ring + cross
    `<circle cx="24" cy="26" r="10" fill="${club.crest.secondary}"/>` +
    `<path d="M24 18v16M16 26h16" stroke="${club.crest.accent}" stroke-width="3"/>`,
  (club) => // two horizontal bars
    `<path d="M14 18h20v6H14zM14 28h20v6H14z" fill="${club.crest.secondary}"/>`,
  (club) => // five-point star
    `<path d="${starPath(24, 25, 10, 4)}" fill="${club.crest.secondary}"/>`,
  (club) => // plain disc
    `<circle cx="24" cy="25" r="9" fill="${club.crest.secondary}"/>`,
  (club) => // three vertical stripes
    `<path d="M14 14h6v28h-6zM22 14h6v28h-6zM30 14h6v28h-6z" fill="${club.crest.secondary}"/>`,
  (club) => // mountain / chevron
    `<path d="M14 34l10-20 10 20z" fill="${club.crest.secondary}"/>`,
  (club) => // quartered square
    `<rect x="14" y="16" width="20" height="20" fill="${club.crest.secondary}"/>` +
    `<rect x="14" y="16" width="10" height="10" fill="${club.crest.accent}"/>` +
    `<rect x="24" y="26" width="10" height="10" fill="${club.crest.accent}"/>`,
  (club) => // diamond
    `<path d="M24 14l10 12-10 12-10-12z" fill="${club.crest.secondary}"/>`,
  (club) => { // monogram initial
    const letter = (club.shortName || club.name).trim()[0].toUpperCase();
    return `<text x="24" y="35" font-size="24" font-family="'Saira Condensed', sans-serif" ` +
      `font-weight="700" text-anchor="middle" fill="${club.crest.secondary}">${letter}</text>`;
  },
];

/** Index into EMBLEMS this club always draws — stable across calls/reloads. */
export function crestVariant(club) {
  return stableHash(club.id) % EMBLEMS.length;
}

/** Inner markup (shield + emblem), for embedding in a caller-provided <svg>/<symbol>. */
export function crestInnerSVG(club) {
  const emblem = EMBLEMS[crestVariant(club)](club);
  return `<path d="${SHIELD_PATH}" fill="${club.crest.primary}"/>${emblem}`;
}

/** `<symbol id="crest-<id>" ...>` markup — drop straight into an SVG sprite,
 * exactly like the hand-authored crest-a/b/c/d symbols in index.html. */
export function crestSymbolMarkup(club) {
  return `<symbol id="crest-${club.id}" viewBox="0 0 48 56">${crestInnerSVG(club)}</symbol>`;
}

/** Standalone `<svg>` string at the given pixel width (56:48 aspect kept). */
export function crestSVGString(club, width = 48) {
  const height = Math.round((width * 56) / 48);
  return `<svg viewBox="0 0 48 56" width="${width}" height="${height}">${crestInnerSVG(club)}</svg>`;
}

/** Mounts a live crest <svg> into a DOM container (used by the dev world browser). */
export function mountCrest(container, club, width = 48) {
  container.innerHTML = crestSVGString(club, width);
}

/** Ensures every given club has a `#crest-<id>` <symbol> in the page's SVG
 * sprite, skipping any already injected. js/main.js calls this at boot for
 * every club in the world (M8: GTN missions and Search Players both surface
 * players from any club, not just the user's own league); js/core/router.js
 * (M5) calls it again after accepting a Browse Jobs offer, which is a no-op
 * today but stays as a safety net for any future save that starts a fresh
 * job without going through the boot path above. */
export function injectClubCrestSymbols(clubs) {
  const sprite = document.querySelector(".svg-sprite");
  for (const club of clubs) {
    if (sprite.querySelector(`#crest-${club.id}`)) continue;
    sprite.insertAdjacentHTML("beforeend", crestSymbolMarkup(club));
  }
}

// ---------------------------------------------------------------------------
// Kit (jersey) generator — reuses the existing #kit icon glyph (index.html),
// recoloured per club. Not needed for M1's dev-page acceptance check, but
// authored now per plan1.md's file layout note ("procedural crest/kit SVG
// generator") so Team Sheet/Tactics screens (later milestones) can reuse it.
// ---------------------------------------------------------------------------

export function kitInnerSVG(club) {
  const { primary, secondary } = club.kit;
  return `<path d="${KIT_PATH}" fill="${primary}" stroke="${secondary}" stroke-width="0.6"/>`;
}

export function kitSVGString(club, size = 24) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}">${kitInnerSVG(club)}</svg>`;
}

/** `<symbol id="kit-<id>" ...>` markup — same sprite-injection pattern as
 * crestSymbolMarkup above, so pitch jerseys can `<use href="#kit-<id>">`
 * instead of the flat single-colour `#kit` placeholder every jersey used to
 * reference regardless of club (F1-fixes: "make sure the jerseys rendered
 * are the club's jerseys"). */
export function kitSymbolMarkup(club) {
  return `<symbol id="kit-${club.id}" viewBox="0 0 24 24">${kitInnerSVG(club)}</symbol>`;
}

/** Mirrors injectClubCrestSymbols exactly (same sprite element, same
 * skip-if-present guard) — js/main.js and core/router.js call both together
 * wherever a club (or the whole league table) needs its crest available. */
export function injectClubKitSymbols(clubs) {
  const sprite = document.querySelector(".svg-sprite");
  for (const club of clubs) {
    if (sprite.querySelector(`#kit-${club.id}`)) continue;
    sprite.insertAdjacentHTML("beforeend", kitSymbolMarkup(club));
  }
}
