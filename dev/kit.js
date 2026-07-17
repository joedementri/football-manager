// dev/kit.js — renders one of each js/ui/panelkit.js primitive into
// dev/kit.html for eyeballing against the reference pics (fable-plans/
// plan2.md F0 build item 1). Not part of the game; nothing here is imported
// by index.html.

import {
  fxPanel, fxIdentityHeader, fxTable, fxPaper, fxInputRow, fxPlayerCard,
  fxAttrPanelHeader, fxAttrRow, attrChip, fuzzyChip, starRating, teamMedallion, glyphPill,
  posDot,
} from "../js/ui/panelkit.js";

document.getElementById("sample-panel").innerHTML = fxPanel({
  title: "CONTRACTS",
  context: "Budget: &pound;1,154,000",
  selectorRows: [
    [{ glyphs: ["lb", "rb"], value: "League One" }],
    [{ glyphs: ["lt", "rt"], value: "July" }],
  ],
  bodyHtml: fxIdentityHeader({
    crestHref: "#crest-pompey",
    manager: "Bob Jackson",
    budgetLines: [{ label: "Transfer Budget", value: "&pound;401,500" }, { label: "Wage Budget", value: "&pound;16,750" }],
  }) + `<div style="padding:16px;color:var(--ink-dim);font-family:var(--font-ui)">Panel body content goes here — screens fill this with an fxTable, two-pane layout, etc.</div>`,
});

document.getElementById("sample-table").innerHTML = fxTable({
  columns: [
    { key: "pos", label: "POS" },
    { key: "name", label: "PLAYER", sortable: true },
    { key: "wage", label: "WAGE/WEEK", numeric: true, sortable: true },
    { key: "length", label: "CONTRACT LENGTH", numeric: true, sortable: true },
  ],
  rows: [
    { id: 1, pos: "ST", name: "James Wilson", wage: "£8,500", length: "2y 4m" },
    { id: 2, pos: "CM", name: "Tom Fogden", wage: "£4,200", length: "1y 1m" },
    { id: 3, pos: "GK", name: "Paul Gersbeck", wage: "£3,000", length: "0y 6m" },
  ],
  sortKey: "wage",
  sortDir: "desc",
  rowClass: (r) => (r.id === 1 ? "is-sel" : ""),
  cellHtml: (c, r) => r[c.key],
});

document.getElementById("sample-paper").innerHTML = `<div style="padding:40px;display:flex;justify-content:center;">` + fxPaper({
  title: "Transfer Offer",
  bodyHtml:
    `<div class="fx-paper__row"><span>Chief Executive Comments:</span></div>` +
    `<p style="margin:10px 0;">"We value this player in the region of £2,000,000 - £2,300,000."</p>` +
    fxInputRow({ label: "Offered Transfer Sum:", value: "&pound;0", action: "fee" }),
  signatures: ["Chairman", "Manager"],
}) + `</div>`;

document.getElementById("sample-playercard").innerHTML = fxPlayerCard({
  firstName: "James", lastName: "Wilson", age: 24, position: "ST", area: "ATT",
  club: "Manchester United", nationFlagHtml: "", height: "6'1\"", foot: "Right",
  overall: 78, value: "&pound;4,200,000", wage: "&pound;18,000/wk", form: "In Form",
  morale: "Content", fitness: "Match Fit", tagline: "One Of The World's Best",
  actions: [
    { label: "Ask G. Shenton to Scout James Wilson", action: "scout" },
    { label: "Add to My Shortlist", action: "shortlist" },
    { label: "Enquire about James Wilson", action: "enquire" },
    { label: "Approach Manchester United to Buy", action: "approach" },
    { label: "Release", action: "release", disabled: true, why: "Squad Size too Small to Release" },
  ],
  selectedAction: "enquire",
});

document.getElementById("sample-attrs").innerHTML = (
  `<div style="padding:16px;width:340px;">` +
    fxAttrPanelHeader({ kitNumber: 9, area: "ATT", position: "ST", overall: 78, name: "James Wilson", fitnessPct: 92, pageTitle: "Skill Attributes", pageCount: 4, pageIndex: 1 }) +
    fxAttrRow("Finishing", attrChip(84)) +
    fxAttrRow("Dribbling", attrChip(71)) +
    fxAttrRow("Standing Tackle", attrChip(52)) +
    fxAttrRow("Marking", attrChip(38)) +
    fxAttrRow("Vision (unscouted)", fuzzyChip(58, 68)) +
  `</div>`
);

document.getElementById("sample-misc").innerHTML = (
  `<div class="kit-row">` +
    `<div>${teamMedallion({ crestHref: "#crest-pompey", stars: 3.5, att: 68, mid: 71, def: 65 })}</div>` +
    `<div style="display:flex;flex-direction:column;gap:10px;color:var(--ink);font-family:var(--font-ui)">` +
      `<div>Scout Experience: ${starRating(4)}</div>` +
      `<div>Scout Judgment: ${starRating(2.5)}</div>` +
      `<div>${posDot("ATT")} ATT &nbsp; ${posDot("MID")} MID &nbsp; ${posDot("DEF")} DEF &nbsp; ${posDot("GK")} GK</div>` +
      `<div style="display:flex;gap:8px;align-items:center;">${["a", "b", "x", "y", "lb", "rb", "lt", "rt", "ls", "rs"].map((g) => glyphPill(g)).join(" ")}</div>` +
    `</div>` +
  `</div>`
);
