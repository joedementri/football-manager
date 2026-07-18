// config/formations.js — fable-plans/plan2.md F2: the FORMATIONS tab's
// catalogue. The 33 names/styles below are transcribed *verbatim* from
// ms_TEAM_SHEET_VIEW_FORMATIONS_PAGE_1..6.png's 6-page x 3-column grid (in
// exact page order — plan2.md F2.1: "transcribe the exact visible names ...
// they're the source of truth; the [~30-name] list [in plan2.md] is the
// fallback"). No reference/ini table lists formation names or pitch
// coordinates at all (teamutils.ini only has the star-rating threshold, see
// teamStars() in ui/panelkit.js) — every coordinate below is [TUNED]
// (plan2-decisions.md F2): a generic per-formation-*shape* layout generator,
// not hand-placed per formation, since none of the 6 FORMATIONS_PAGE pics
// actually show a non-4-4-2 XI on the pitch (the pitch always renders
// Portsmouth's real "4-4-2 Flat" sheet regardless of which grid cell the
// cursor is browsing — selecting a different formation isn't captured in any
// pic). formationSlots()'s output for "4-4-2"/"Flat" intentionally matches
// gen/squad.js's XI_TEMPLATE coordinates so re-applying the club's already-
// active default formation is a no-visible-op.

import { positionInfo } from "./positions.js";

const X_BY_COUNT = {
  1: [50],
  2: [34, 66],
  3: [21, 50, 79],
  4: [15, 39, 61, 85],
  5: [10, 30, 50, 70, 90],
};

// DEF deepest -> ATT highest, indexed by total non-GK line count (always 3
// or 4 across the 33 catalogue entries — nothing in the pics needs 2 or 5).
const Y_BY_LINES = {
  3: [75, 48, 16],
  4: [75, 58, 36, 14],
};

function defCodes(count) {
  if (count === 3) return ["LCB", "CB", "RCB"];
  if (count === 4) return ["LB", "LCB", "RCB", "RB"];
  if (count === 5) return ["LWB", "LCB", "CB", "RCB", "RWB"];
  throw new Error(`unsupported DEF line count ${count}`);
}

// bucket: "dm" (deepest of 2 mid groups), "am" (highest of 2), "cm" (the
// sole mid group when there's only 1). A 4- or 5-wide line is always a flat
// wide line regardless of bucket (matches XI_TEMPLATE's LM/LCM/RCM/RM 4-4-2
// mid row exactly).
function midCodes(count, bucket) {
  if (count === 1) return bucket === "dm" ? ["CDM"] : bucket === "am" ? ["CAM"] : ["CM"];
  if (count === 2) return bucket === "dm" ? ["LDM", "RDM"] : bucket === "am" ? ["LAM", "RAM"] : ["LCM", "RCM"];
  if (count === 3) return bucket === "dm" ? ["LDM", "CDM", "RDM"] : bucket === "am" ? ["LAM", "CAM", "RAM"] : ["LCM", "CM", "RCM"];
  if (count === 4) return ["LM", "LCM", "RCM", "RM"];
  if (count === 5) return ["LM", "LCM", "CM", "RCM", "RM"];
  throw new Error(`unsupported MID line count ${count}`);
}

function attCodes(count) {
  if (count === 1) return ["ST"];
  if (count === 2) return ["LS", "RS"];
  if (count === 3) return ["LW", "ST", "RW"];
  if (count === 4) return ["LW", "LS", "RS", "RW"];
  throw new Error(`unsupported ATT line count ${count}`);
}

/** groups: e.g. [4,2,3,1] for "4-2-3-1" (DEF, ...mid sub-lines, ATT). */
function baseSlots(groups) {
  const n = groups.length;
  const ys = Y_BY_LINES[n];
  if (!ys) throw new Error(`unsupported formation shape [${groups.join("-")}]`);
  const defCount = groups[0];
  const attCount = groups[groups.length - 1];
  const midGroups = groups.slice(1, -1);

  const lines = [{ codes: defCodes(defCount), y: ys[0] }];
  if (midGroups.length === 1) {
    lines.push({ codes: midCodes(midGroups[0], "cm"), y: ys[1] });
  } else {
    lines.push({ codes: midCodes(midGroups[0], "dm"), y: ys[1] });
    lines.push({ codes: midCodes(midGroups[1], "am"), y: ys[2] });
  }
  lines.push({ codes: attCodes(attCount), y: ys[n - 1] });

  // F2-fixes round 2: y nudged 92 -> 86, kept in sync with gen/squad.js's
  // own XI_TEMPLATE GK y — see that file's header for the full reasoning
  // (clearance for the fixed-pixel jersey element's own height, not
  // proportional to the pitch box).
  const slots = [{ pos: "GK", x: 50, y: 86, gk: true }];
  for (const line of lines) {
    const xs = X_BY_COUNT[line.codes.length];
    line.codes.forEach((code, i) => slots.push({ pos: code, x: xs[i], y: line.y }));
  }
  return slots;
}

// [TUNED] cosmetic-only nudges so same-shape style variants (the 5 "4-3-3"s,
// the two "4-4-2"s that aren't Diamond, etc.) aren't pixel-identical on the
// pitch preview — none of these change position *codes* or gameplay, only
// x/y. Diamond is the one semantically meaningful case: it actually
// reshapes a flat 4-wide mid line into a real diamond.
function applyStyle(slots, style) {
  if (!style) return slots;
  const s = [...slots.map((sl) => ({ ...sl }))];
  const midFlat4 = s.filter((sl) => ["LM", "LCM", "RCM", "RM"].includes(sl.pos));

  if (style.indexOf("Diamond") !== -1 && midFlat4.length === 4) {
    const y = midFlat4[0].y;
    const wide = style.indexOf("wide") !== -1 ? 22 : 30;
    for (const sl of s) {
      if (sl.pos === "LM") { sl.pos = "LCM"; sl.x = wide; sl.y = y; }
      else if (sl.pos === "RM") { sl.pos = "RCM"; sl.x = 100 - wide; sl.y = y; }
      else if (sl.pos === "LCM") { sl.pos = "CDM"; sl.x = 50; sl.y = y + 9; }
      else if (sl.pos === "RCM") { sl.pos = "CAM"; sl.x = 50; sl.y = y - 9; }
    }
    return s;
  }

  if (style === "Wide") {
    const three = s.filter((sl) => sl.pos.length >= 3 && sl.y > 20 && sl.y < 60 && ["LAM", "CAM", "RAM", "LCM", "CM", "RCM"].includes(sl.pos));
    if (three.length === 3) {
      three.sort((a, b) => a.x - b.x);
      three[0].x = 8; three[2].x = 92;
    }
    return s;
  }

  if (style === "Attack") {
    const maxMidY = Math.max(...s.filter((sl) => positionInfo(sl.pos).area === "MID").map((sl) => sl.y));
    for (const sl of s) if (positionInfo(sl.pos).area === "MID" && sl.y === maxMidY) sl.y -= 4;
    for (const sl of s) if (positionInfo(sl.pos).area === "ATT") sl.y -= 3;
    return s;
  }

  if (style === "Defend" || style === "Holding") {
    for (const sl of s) if (positionInfo(sl.pos).area === "DEF") sl.y += 3;
    const minMidY = Math.min(...s.filter((sl) => positionInfo(sl.pos).area === "MID").map((sl) => sl.y));
    for (const sl of s) if (positionInfo(sl.pos).area === "MID" && sl.y === minMidY) sl.y += 4;
    return s;
  }

  if (style === "False 9") {
    for (const sl of s) if (sl.pos === "ST") sl.y += 10;
    return s;
  }

  return s;
}

function entry(name, groups, style = "") {
  const slots = applyStyle(baseSlots(groups), style);
  return {
    id: `${name}${style ? ` ${style}` : ""}`,
    name,
    style,
    slots,
  };
}

// Exact page order from ms_TEAM_SHEET_VIEW_FORMATIONS_PAGE_1..6.png.
export const FORMATIONS = [
  entry("3-1-4-2", [3, 1, 4, 2]),
  entry("3-4-1-2", [3, 4, 1, 2]),
  entry("3-4-2-1", [3, 4, 2, 1]),
  entry("3-4-3", [3, 4, 3], "Diamond"),
  entry("3-4-3", [3, 4, 3], "Flat"),
  entry("3-5-1-1", [3, 5, 1, 1]),
  entry("3-5-2", [3, 5, 2]),
  entry("4-4-2", [4, 4, 2], "Diamond"),
  entry("4-4-2", [4, 4, 2], "Diamond wide"),
  entry("4-1-3-2", [4, 1, 3, 2]),
  entry("4-1-4-1", [4, 1, 4, 1]),
  entry("4-2-2-2", [4, 2, 2, 2]),
  entry("4-2-3-1", [4, 2, 3, 1], "Wide"),
  entry("4-2-3-1", [4, 2, 3, 1]),
  entry("4-2-4", [4, 2, 4]),
  entry("4-3-1-2", [4, 3, 1, 2]),
  entry("4-3-2-1", [4, 3, 2, 1]),
  entry("4-3-3", [4, 3, 3], "False 9"),
  entry("4-3-3", [4, 3, 3], "Attack"),
  entry("4-3-3", [4, 3, 3], "Defend"),
  entry("4-3-3", [4, 3, 3], "Holding"),
  entry("4-3-3", [4, 3, 3]),
  entry("4-4-1-1", [4, 4, 1, 1], "Attack"),
  entry("4-4-1-1", [4, 4, 1, 1]),
  entry("4-4-2", [4, 4, 2], "Holding"),
  entry("4-4-2", [4, 4, 2], "Flat"),
  entry("4-5-1", [4, 5, 1], "Attack"),
  entry("4-5-1", [4, 5, 1]),
  entry("5-2-1-2", [5, 2, 1, 2]),
  entry("5-2-2-1", [5, 2, 2, 1]),
  entry("5-3-2", [5, 3, 2]),
  entry("5-4-1", [5, 4, 1], "Flat"),
  entry("5-4-1", [5, 4, 1], "Diamond"),
];

// [JUDGMENT CALL] every club's default formation is "4-4-2"/"Flat" — matches
// gen/squad.js's XI_TEMPLATE (the shape every generated squad's Default Team
// Sheet already uses), and no per-club default-formation data exists
// anywhere else. FORMATIONS_PAGE_1.png's cell 1 always reads
// "<Club> / Default Formation" verbatim (not the formation's own name), so
// the grid renders it as a synthetic pseudo-cell rather than a 34th catalogue
// entry — see gridCells() below.
export const DEFAULT_FORMATION_NAME = "4-4-2";
export const DEFAULT_FORMATION_STYLE = "Flat";

export function formationByLabel(name, style) {
  return FORMATIONS.find((f) => f.name === name && f.style === style) || null;
}

/** The 34-cell list FORMATIONS_PAGE_1..6.png's grid pages through 6-per-page
 * (page 6 has only 4) — cell 0 is always the "<Club>/Default Formation"
 * pseudo-entry pointing at DEFAULT_FORMATION_NAME/STYLE. */
export function gridCells(clubName) {
  return [
    { kind: "default", label1: clubName, label2: "Default Formation", name: DEFAULT_FORMATION_NAME, style: DEFAULT_FORMATION_STYLE },
    ...FORMATIONS.map((f) => ({ kind: "formation", label1: f.name, label2: f.style, name: f.name, style: f.style })),
  ];
}

export const GRID_PAGE_SIZE = 6; // 2 rows x 3 cols, matching FORMATIONS_PAGE_1..6.png

export function gridPageCount(clubName) {
  return Math.ceil(gridCells(clubName).length / GRID_PAGE_SIZE);
}

export function gridPage(clubName, pageIndex) {
  const cells = gridCells(clubName);
  return cells.slice(pageIndex * GRID_PAGE_SIZE, pageIndex * GRID_PAGE_SIZE + GRID_PAGE_SIZE);
}

export function gridCellAt(clubName, index) {
  return gridCells(clubName)[index] || null;
}

/** Re-maps an existing 11-player XI onto a new formation's 11 slots by
 * best-fit position (plan2.md F2.1: "Selecting re-maps the XI by best-fit
 * position") — same 11 players, new slot codes/coordinates/captain flag.
 * [TUNED] scoring (no formula is specified anywhere): area match worth more
 * than side match; slots are filled DEF-first (scarcest good fits) so a
 * shape with fewer defenders than the current XI doesn't strand a centre-
 * back in an attacking slot purely by processing order.
 */
export function remapLineupToFormation(lineup, formationSlots, playersById) {
  const gkEntry = lineup.find((l) => l.gk);
  const gkSlot = formationSlots.find((s) => s.gk);
  const outfieldEntries = lineup.filter((l) => !l.gk);
  const outfieldSlots = formationSlots.filter((s) => !s.gk);

  const areaOrder = { DEF: 0, MID: 1, ATT: 2 };
  const orderedSlots = [...outfieldSlots].sort((a, b) => areaOrder[positionInfo(a.pos).area] - areaOrder[positionInfo(b.pos).area]);

  const remaining = new Set(outfieldEntries);
  function score(entry, slot) {
    const p = playersById.get(entry.playerId);
    if (!p) return -Infinity;
    const entryInfo = positionInfo(p.position);
    const slotInfo = positionInfo(slot.pos);
    let s = 0;
    if (entryInfo.area === slotInfo.area) s += 4;
    else if ((entryInfo.area === "DEF" && slotInfo.area === "MID") || (entryInfo.area === "MID" && slotInfo.area === "DEF") || (entryInfo.area === "MID" && slotInfo.area === "ATT") || (entryInfo.area === "ATT" && slotInfo.area === "MID")) s += 1;
    if (entryInfo.side === slotInfo.side) s += 2;
    else if (entryInfo.side === "C" || slotInfo.side === "C") s += 0.5;
    return s;
  }

  const newLineup = [];
  if (gkEntry && gkSlot) newLineup.push({ ...gkEntry, pos: gkSlot.pos, x: gkSlot.x, y: gkSlot.y, gk: true });

  for (const slot of orderedSlots) {
    let best = null;
    let bestScore = -Infinity;
    for (const entry of remaining) {
      const sc = score(entry, slot);
      if (sc > bestScore) { bestScore = sc; best = entry; }
    }
    if (!best) continue;
    remaining.delete(best);
    newLineup.push({ ...best, pos: slot.pos, x: slot.x, y: slot.y, gk: false });
  }

  return newLineup;
}
