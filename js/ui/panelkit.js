// ui/panelkit.js — shared "sub-screen" render primitives (fable-plans/plan2.md
// PART B, built once in F0). Pure render helpers: every export takes plain
// data and returns an HTML string (or a plain value like a colour/band name).
// No state reads, no DOM writes, no store calls — callers in ui/*.js own all
// wiring, exactly like every other screen in this codebase (ground rule: "no
// logic in UI files; all mutations via store/engine"). Pairs with
// css/panels.css, which defines the classes emitted here. See dev/kit.html
// for a one-of-each render of every primitive.

/* ============================== §B4 colour scale ========================= */

/** Attribute chip colour band: ≥80 green, 65-79 yellow, 50-64 orange, <50 red. */
export function attrBand(value) {
  if (value >= 80) return "green";
  if (value >= 65) return "yellow";
  if (value >= 50) return "orange";
  return "red";
}

export const ATTR_BAND_HEX = {
  green: "#39b54a",
  yellow: "#e8c227",
  orange: "#d9822b",
  red: "#c0392b",
};

export function attrChip(value) {
  return `<span class="fx-attr-chip fx-attr-chip--${attrBand(value)}">${value}</span>`;
}

/** Position-group colours reused for bars/dots/jersey dots everywhere. */
export const POSITION_COLOR = {
  GK: "#e8641b",
  DEF: "#e8c227",
  MID: "#39b54a",
  ATT: "#2f7fd1",
};

export function positionColorFor(area) {
  return POSITION_COLOR[area] || POSITION_COLOR.MID;
}

export function posDot(area) {
  return `<span class="fx-pos-dot" style="background:${positionColorFor(area)}"></span>`;
}

export function posBar(area) {
  return `<span class="fx-pos-bar" style="background:${positionColorFor(area)}"></span>`;
}

/* ============================== glyph pills =============================== */
// Xbox letter glyphs (A/B/X/Y) + shoulder/stick pills (LB/RB/LT/RT/LS/RS).
// Owner mapping (fable-plans/plan2.md intro): PS glyphs seen in reference pics
// map ✕→A, ○→B, □→X, △→Y, L1/R1→LB/RB, L2/R2→LT/RT, L3/R3→LS/RS.
const GLYPH_LABEL = {
  a: "A", b: "B", x: "X", y: "Y",
  lb: "LB", rb: "RB", lt: "LT", rt: "RT", ls: "LS", rs: "RS",
  // F3-fixes: the Start/Menu button — owner's own description ("a vertical
  // tall rectangle with rounded edges", not a lettered pill) rather than a
  // pic-sourced glyph; css/chrome.css draws the shape, so no text label.
  menu: "",
};

function glyphText(cls, label) {
  if (label != null) return label;
  return cls in GLYPH_LABEL ? GLYPH_LABEL[cls] : cls.toUpperCase();
}

export function glyphPill(cls, label) {
  return `<span class="btn-glyph ${cls}">${glyphText(cls, label)}</span>`;
}

/** Footer/action-row prompt: glyph pill + label, wired via [data-action]. */
export function actionPrompt(cls, action, label) {
  return `<span class="prompt" data-action="${action}"><span class="btn-glyph ${cls}">${glyphText(cls)}</span> ${label}</span>`;
}

/* ============================== §B1 centered dark panel =================== */

/**
 * items: [{ glyphs: ["lb","rb"], value: "League One", badge?: "<svg>...</svg>" }]
 */
export function fxSelectorRow(items) {
  return `<div class="fx-selector-row">` + items.map((it) => (
    `<span class="fx-selector">` +
      it.glyphs.map((g) => glyphPill(g)).join("") +
      ` <span class="fx-selector__value">${it.value}</span>` +
      (it.badge ? `<span class="fx-selector__badge">${it.badge}</span>` : "") +
    `</span>`
  )).join("") + `</div>`;
}

/**
 * Wraps bodyHtml in the standard centered dark panel: title bar (+ optional
 * right-aligned context), optional selector-bar rows, scrollable body.
 * selectorRows: array of arrays, each passed to fxSelectorRow (one row = one line).
 */
export function fxPanel({ title, context = "", selectorRows = [], bodyHtml = "", extraClass = "" }) {
  const selectorsHtml = selectorRows.length
    ? `<div class="fx-panel__selectors">${selectorRows.map(fxSelectorRow).join("")}</div>`
    : "";
  return (
    `<div class="fx-panel${extraClass ? " " + extraClass : ""}">` +
      `<div class="fx-panel__titlebar">` +
        `<span class="fx-panel__title">${title}</span>` +
        (context ? `<span class="fx-panel__context">${context}</span>` : "") +
      `</div>` +
      selectorsHtml +
      `<div class="fx-panel__body">${bodyHtml}</div>` +
    `</div>`
  );
}

/** Identity-header strip: club crest + office/manager name + right-aligned budget lines. */
export function fxIdentityHeader({ crestHref, office = "MANAGER'S OFFICE", manager, budgetLines = [] }) {
  return (
    `<div class="fx-identity">` +
      `<svg class="crest fx-identity__crest"><use href="${crestHref}"></use></svg>` +
      `<div class="fx-identity__names">` +
        `<span class="fx-identity__office">${office}</span>` +
        `<span class="fx-identity__manager">${manager}</span>` +
      `</div>` +
      `<div class="fx-identity__budgets">` +
        budgetLines.map((l) => `<span>${l.label}: <b>${l.value}</b></span>`).join("") +
      `</div>` +
    `</div>`
  );
}

/* ============================== §B1 sortable table ========================= */

/**
 * columns: [{ key, label, numeric?: bool, sortable?: bool }]
 * rows: array of row objects; cellHtml(col, row) renders one <td>'s inner html.
 * sortKey/sortDir describe current sort (for the caret + is-sorted class).
 */
export function fxTable({ columns, rows, cellHtml, rowClass, sortKey, sortDir = "desc" }) {
  const thead = columns.map((c) => {
    const sorted = c.key === sortKey;
    const caret = sorted ? `<span class="caret">${sortDir === "asc" ? "▲" : "▼"}</span>` : "";
    return (
      `<th class="${c.numeric ? "num " : ""}${sorted ? "is-sorted" : ""}"` +
      `${c.sortable ? ` data-sort="${c.key}"` : ""}>${caret}${c.label}</th>`
    );
  }).join("");
  const tbody = rows.map((row) => {
    const cls = (rowClass ? rowClass(row) : "") || "";
    const tds = columns.map((c) => `<td class="${c.numeric ? "num" : ""}">${cellHtml(c, row)}</td>`).join("");
    return `<tr class="${cls}" data-row-id="${row.id != null ? row.id : ""}">${tds}</tr>`;
  }).join("");
  return `<table class="fx-table"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`;
}

/* ============================== §B2 paper dossier =========================== */

const SIGNATURE_SQUIGGLE = (
  `<svg viewBox="0 0 90 30" xmlns="http://www.w3.org/2000/svg">` +
    `<path d="M4 22c6-14 10-14 14-4s8 10 12-2 8-12 12-2 8 10 12-2 8-10 12 0" ` +
    `fill="none" stroke="#2b2822" stroke-width="1.6" stroke-linecap="round"/>` +
  `</svg>`
);

export function fxPaper({ title, bodyHtml, signatures = [] }) {
  const sigHtml = signatures.length
    ? `<div class="fx-paper__signatures">` + signatures.map((label) => (
        `<div class="fx-paper__sig">${SIGNATURE_SQUIGGLE}<div class="fx-paper__sig-label">${label}</div></div>`
      )).join("") + `</div>`
    : "";
  return (
    `<div class="fx-paper">` +
      `<div class="fx-paper__title">${title}</div>` +
      `<div class="fx-paper__body">${bodyHtml}</div>` +
      sigHtml +
    `</div>`
  );
}

/** Input row: label, current value, ◄► steppers under a (Y) numeric-entry glyph. */
export function fxInputRow({ label, value, action }) {
  return (
    `<div class="fx-input-row" ${action ? `data-action="${action}"` : ""}>` +
      `<span>${label}</span>` +
      `<span class="fx-input-row__steppers">` +
        glyphPill("y") +
        `<button type="button" class="fx-stepper" data-action="${action}-down">&#9668;</button>` +
        `<button type="button" class="fx-stepper" data-action="${action}-up">&#9658;</button>` +
        `<span class="fx-input-row__value">${value}</span>` +
      `</span>` +
    `</div>`
  );
}

/* ============================== §B3 player card + actions =================== */

/**
 * actions/selectedAction: same shape as fxActionList's own params — passed
 * through and rendered as the card's bottom section, per §B3 ("(bottom)
 * action list — full-width rows... Right side may show the R-paged attribute
 * panel" — the action list lives *inside* the same sheet as the player info,
 * not beside it as a separate element).
 */
export function fxPlayerCard({ firstName, lastName, age, position, area, club, nationFlagHtml, height, foot, overall, value, wage, form, morale, fitness, tagline, actions, selectedAction }) {
  return (
    `<div class="fx-playercard">` +
      `<div class="fx-playercard__portrait"></div>` +
      `<div class="fx-playercard__name">${firstName} ${lastName}</div>` +
      `<div class="fx-playercard__sub">${posBar(area)} AGE ${age} / ${position}</div>` +
      `<div class="fx-playercard__club">${club}${nationFlagHtml || ""}</div>` +
      `<div class="fx-playercard__sub">Height: ${height}   Preferred Foot: ${foot}</div>` +
      `<div class="fx-playercard__stats">` +
        `<span>OVERALL<b>${overall}</b></span>` +
        `<span>VALUE<b>${value}</b></span>` +
        `<span>WAGE<b>${wage}</b></span>` +
        `<span>FORM<b class="fx-playercard__word--gold">${form}</b></span>` +
      `</div>` +
      `<div class="fx-playercard__sub">Morale: ${morale}   Fitness: ${fitness}</div>` +
      (tagline ? `<div class="fx-playercard__tagline">&#9888; ${tagline}</div>` : "") +
      (actions && actions.length ? fxActionList(actions, selectedAction) : "") +
    `</div>`
  );
}

/**
 * actions: [{ label, action, disabled?: bool, why?: string }]
 * selectedAction: currently-highlighted action's `action` key (gold row + (A) glyph).
 */
export function fxActionList(actions, selectedAction) {
  return `<div class="fx-actions">` + actions.map((a) => (
    `<div class="fx-actions__row${a.action === selectedAction ? " is-sel" : ""}${a.disabled ? " is-disabled" : ""}" ` +
    `${a.disabled ? "" : `data-action="${a.action}"`}>` +
      (a.action === selectedAction ? glyphPill("a") : "") +
      `<span>${a.label}</span>` +
      (a.disabled && a.why ? `<span class="fx-actions__why">${a.why}</span>` : "") +
    `</div>`
  )).join("") + `</div>`;
}

/* ============================== §B4 attribute panel ========================= */

/** One attribute row: name left, value chip right (or a fuzzy range — see fuzzyChip). */
export function fxAttrRow(name, valueHtml) {
  return `<div class="fx-attr-row"><span class="fx-attr-row__name">${name}</span>${valueHtml}</div>`;
}

/**
 * Attribute-panel header used by Team Sheet / Search / Shortlist right panels:
 * portrait with ghost kit number behind, position dot, big OVR, gold name,
 * green fitness bar, page title, RS pager dots.
 */
export function fxAttrPanelHeader({ kitNumber, area, position, overall, name, fitnessPct, pageTitle, pageCount, pageIndex }) {
  const dots = Array.from({ length: pageCount }, (_, i) => `<i class="${i === pageIndex ? "on" : ""}"></i>`).join("");
  return (
    `<div class="fx-attrpanel__header">` +
      `<div class="fx-attrpanel__portrait"><span class="fx-attrpanel__kitnum">${kitNumber != null ? kitNumber : ""}</span></div>` +
      `<div>` +
        `<div>${posDot(area)} ${position} <span class="fx-attrpanel__ovr">${overall}</span></div>` +
        `<div class="fx-attrpanel__name">${name}</div>` +
        `<div class="fx-attrpanel__fitbar"><i style="width:${fitnessPct}%"></i></div>` +
      `</div>` +
    `</div>` +
    `<div class="fx-panel__title" style="text-align:left;font-size:18px;">${pageTitle}</div>` +
    `<div class="fx-attrpanel__pagedots">${glyphPill("rs")}${dots}</div>`
  );
}

/* ============================== §B5 stars / medallion / fuzzy =============== */

/** 0-5 star rating in halves, gold on grey. */
export function starRating(value, max = 5) {
  const clamped = Math.max(0, Math.min(max, value));
  let html = `<span class="fx-stars">`;
  for (let i = 0; i < max; i++) {
    const remaining = clamped - i;
    const kind = remaining >= 1 ? "is-full" : remaining >= 0.5 ? "is-half" : "is-empty";
    html += `<svg class="${kind}" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
  }
  return html + `</span>`;
}

// [TUNED] reference/ini/teamutils.ini [IS_STAR_RATING] RATING=82 is the only
// data point given (⇒ overall 82 is a full 5★) — no lower anchor exists, so
// bands step down linearly every 6 rating points below it (plan2-decisions.md
// F2). Used by the Formations/Roles tabs' team medallion (§B5).
export function teamStars(rating) {
  const raw = Math.max(0, Math.min(5, (rating - 52) / 6));
  return Math.round(raw * 2) / 2;
}

/** Circular team medallion (crest + stars + ATT/MID/DEF mini-table). */
export function teamMedallion({ crestHref, stars, att, mid, def }) {
  return (
    `<div class="fx-medallion">` +
      `<div class="fx-medallion__plate"><svg><use href="${crestHref}"></use></svg></div>` +
      starRating(stars) +
      `<div class="fx-medallion__lines">` +
        `<span>ATT<b>${att}</b></span>` +
        `<span>MID<b>${mid}</b></span>` +
        `<span>DEF<b>${def}</b></span>` +
      `</div>` +
    `</div>`
  );
}

/* ============================== §B4b unscouted-range colour scale ========= */

// F3-fixes: a fuzzy range chip used to always paint its low end red and its
// high end green regardless of what either number actually meant — a min of
// 70 (good) read exactly as alarming as a min of 20 (poor). Fixed by scoring
// each end by its own quality, same idea as attrBand above but with 3 extra
// steps (owner: FIFA 15's dark-green/green/light-green/orange/yellow/light-
// red/dark-red 7-tier scale, exact thresholds unknown). Deliberately keeps
// attrBand's own green > yellow > orange > red ordering rather than FIFA
// 15's (uncertain, owner-recalled) green/orange/yellow ordering, so a range
// chip's colour means the same thing as a solid attrChip's colour everywhere
// in the app (owner: "do this with consistency with the rest of the stat
// pages"). [TUNED] thresholds — no reference source for the exact numbers.
export function rangeBand(value) {
  if (value >= 85) return "darkgreen";
  if (value >= 72) return "green";
  if (value >= 60) return "lightgreen";
  if (value >= 50) return "yellow";
  if (value >= 38) return "orange";
  if (value >= 25) return "lightred";
  return "darkred";
}

export const RANGE_BAND_HEX = {
  darkgreen: "#1a7a34", green: "#39b54a", lightgreen: "#8cc63f",
  yellow: "#e8c227", orange: "#d9822b", lightred: "#e0654f", darkred: "#8e2418",
};

export function rangeChip(value) {
  return `<span class="fx-attr-chip fx-attr-chip--${rangeBand(value)}">${value}</span>`;
}

/** Unscouted-range chip pair, e.g. "58 – 68" — each end coloured by its own
 * value via rangeBand, not by whether it's the low or high end. */
export function fuzzyChip(min, max) {
  return (
    `<span class="fx-fuzzy">` +
      rangeChip(min) +
      `<span class="fx-fuzzy__sep">&ndash;</span>` +
      rangeChip(max) +
    `</span>`
  );
}
