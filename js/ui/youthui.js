// ui/youthui.js — M9's Youth Staff overlay: one overlay, 3 internal views
// (state.ui.youth.view) — 'hub' (hired youth scouts + market pool + a
// "Youth Squad (N/16)" link), 'assignForm' (nation/type/duration picker for
// the selected idle scout) and 'squad' (the youth roster list + one
// prospect's fuzzy-revealed detail, Promote/Release actions). Pure
// render-from-state, same contract as every other ui/*.js module (see
// ui/gtnui.js's header) — every control calls a core/store.js method and
// re-renders off the "youth" event core/router.js subscribes to.
//
// Built against the real FIFA 15 reference screenshots (REFERENCE_PICS/
// more_screens/OFFICE_SCREEN/ms_YOUTH_STAFF_SCREEN.png, ms_YOUTH_ACADEMY_
// YOUTH_SQUAD_PLAYER_INFO.png, ms_YOUTH_ACADEMY_YOUTH_SQUAD_PLAYER_
// ATTRIBUTES.png) rather than authored fresh the way ui/gtnui.js's header
// describes for M8 — those three exist for this exact screen. Two visual
// details from those pics are intentionally simplified: the per-tile "hold R
// to flip between Youth Staff / Youth Academy preview" micro-interaction on
// Office's own tile isn't reproduced (the tile just opens straight into this
// overlay), and the "Position(s)" mini-pitch diagram of candidate positions
// is replaced by a single concrete position (this project decides a
// prospect's actual position at generation time — see engine/academy.js —
// rather than modelling position itself as fuzzy). Both are cosmetic; a
// fidelity pass belongs in M11 per ui/gtnui.js's own precedent.

import { RngStream, deriveSeed } from "../core/rng.js";
import { toEpochDay } from "../core/clock.js";
import { positionInfo } from "../config/positions.js";
import { MENTAL_ATTRIBUTES, PHYSICAL_ATTRIBUTES, SKILL_ATTRIBUTES } from "../config/growth.js";
import { GK_ATTRIBUTES } from "../config/attributes.js";
import { money } from "../core/format.js";
import { stars, potentialBand } from "./playerbio.js";
import { fuzzyDisplay } from "./gtnui.js";
import { hireCost, sackCost, monthlySalary, MISSION_TIERS } from "../config/scouting.js";
import {
  MAX_YOUTH_SCOUTS, MAX_YOUTH_SQUAD_SIZE, MIN_PROMOTION_AGE, PLAYER_TYPES,
  ATTR_UNLOCK_COUNT_BY_LEVEL, ATTR_VARIANCE_PCT_BY_LEVEL, RETIREMENT_WARNING_DAYS,
} from "../config/youth.js";
import { isPromotable } from "../engine/academy.js";

function prompt(glyphClass, glyphLabel, action, label) {
  return `<span class="prompt" data-action="${action}"><span class="btn-glyph ${glyphClass}">${glyphLabel}</span> ${label}</span>`;
}
function flagSpan(code) {
  return `<span class="flag" data-flag="${code}"></span>`;
}
function nationName(state, nationId) {
  return state.staticData.nations.find((n) => n.id === nationId)?.name || nationId;
}
function typeLabel(typeId) {
  return PLAYER_TYPES.find((t) => t.id === typeId)?.label || "Any";
}

/* ============================================================================
 * Hub: hired youth scouts + market pool (left) / detail panel (right)
 * ========================================================================== */

function scoutRowHtml(scout, { selected, isPool }) {
  const sel = selected ? " is-sel" : "";
  let status = `<span class="gtn-chip gtn-chip--idle">Idle</span>`;
  if (!isPool) {
    if (scout.assignment) status = `<span class="gtn-chip gtn-chip--active">${scout.assignment.tierLabel}</span>`;
  } else {
    status = `<span class="gtn-chip gtn-chip--cost">${money(hireCost(scout.experience, scout.judgment))}</span>`;
  }
  return (
    `<div class="gtn-row${sel}" data-scout="${scout.id}" data-pool="${isPool ? 1 : 0}">` +
      `<span class="avatar"></span>` +
      `<span class="gtn-row__name">${flagSpan(scout.nationId)} ${scout.commonName}</span>` +
      `<span class="gtn-row__stars" title="Experience">${stars(scout.experience)}</span>` +
      `<span class="gtn-row__stars" title="Judgment">${stars(scout.judgment)}</span>` +
      status +
    `</div>`
  );
}

function renderYouthHubList(state) {
  const a = state.academy;
  const ui = state.ui.youth;
  const scoutRows = a.scouts.map((s) => scoutRowHtml(s, { selected: !ui.selectedIsPool && s.id === ui.selectedScoutId, isPool: false })).join("");
  const poolRows = a.pool.map((c) => scoutRowHtml(c, { selected: ui.selectedIsPool && c.id === ui.selectedScoutId, isPool: true })).join("");
  return (
    `<div class="gtn-section-label ys-squad-link" data-action="open-squad">YOUTH SQUAD (${a.roster.length}/${MAX_YOUTH_SQUAD_SIZE}) &rsaquo;</div>` +
    `<div class="gtn-section-label">MY YOUTH SCOUTS (${a.scouts.length}/${MAX_YOUTH_SCOUTS})</div>` +
    `<div class="gtn-rows">${scoutRows || `<div class="empty"><span class="lbl">No scouts hired yet</span></div>`}</div>` +
    `<div class="gtn-section-label">SCOUT MARKET</div>` +
    `<div class="gtn-rows">${poolRows || `<div class="empty"><span class="lbl">Pool refreshes weekly</span></div>`}</div>`
  );
}

function renderYouthHubDetail(state) {
  const a = state.academy;
  const ui = state.ui.youth;
  if (ui.selectedScoutId == null) return `<div class="empty"><span class="lbl">Select a scout</span></div>`;

  const errorBanner = ui.lastError === "insufficient-funds"
    ? `<div class="ng-result ng-result--rejected">Not enough transfer budget.</div>`
    : ui.lastError === "roster-full" ? `<div class="ng-result ng-result--rejected">You already employ the maximum of ${MAX_YOUTH_SCOUTS} youth scouts.</div>` : "";

  if (ui.selectedIsPool) {
    const c = a.pool.find((x) => x.id === ui.selectedScoutId);
    if (!c) return `<div class="empty"><span class="lbl">Select a scout</span></div>`;
    return (
      errorBanner +
      `<div class="ct-detail__head"><div class="ct-detail__name">${flagSpan(c.nationId)} ${c.commonName}</div></div>` +
      `<div class="ct-facts">` +
        `<div class="ct-fact"><span class="k">Nationality</span><span class="v">${nationName(state, c.nationId)}</span></div>` +
        `<div class="ct-fact"><span class="k">Experience</span><span class="v">${stars(c.experience)}</span></div>` +
        `<div class="ct-fact"><span class="k">Judgment</span><span class="v">${stars(c.judgment)}</span></div>` +
        `<div class="ct-fact"><span class="k">Hire Cost</span><span class="v">${money(hireCost(c.experience, c.judgment))}</span></div>` +
        `<div class="ct-fact"><span class="k">Monthly Salary</span><span class="v">${money(monthlySalary(c.experience, c.judgment))}</span></div>` +
      `</div>` +
      `<div class="ct-actions"><button class="ct-btn ct-btn--primary" type="button" data-action="hire">Hire Scout</button></div>`
    );
  }

  const scout = a.scouts.find((x) => x.id === ui.selectedScoutId);
  if (!scout) return `<div class="empty"><span class="lbl">Select a scout</span></div>`;
  const asn = scout.assignment;
  const assignmentCard = !asn ? "" : (
    `<div class="ct-facts">` +
      `<div class="ct-fact"><span class="k">Country</span><span class="v">${nationName(state, asn.nationId)}</span></div>` +
      `<div class="ct-fact"><span class="k">Player Type</span><span class="v">${typeLabel(asn.type)}</span></div>` +
      `<div class="ct-fact"><span class="k">Duration</span><span class="v">${asn.tierLabel}</span></div>` +
      `<div class="ct-fact"><span class="k">Returning</span><span class="v">${new Date(asn.endDate).toLocaleDateString()}</span></div>` +
    `</div>`
  );
  const actions = asn
    ? `<div class="ct-actions"><button class="ct-btn" type="button" data-action="recall">Recall Scout</button></div>`
    : `<div class="ct-actions"><button class="ct-btn ct-btn--primary" type="button" data-action="assign">Send To A Nation</button></div>`;

  return (
    errorBanner +
    `<div class="ct-detail__head"><div class="ct-detail__name">${flagSpan(scout.nationId)} ${scout.commonName}</div></div>` +
    `<div class="ct-facts">` +
      `<div class="ct-fact"><span class="k">Nationality</span><span class="v">${nationName(state, scout.nationId)}</span></div>` +
      `<div class="ct-fact"><span class="k">Experience</span><span class="v">${stars(scout.experience)}</span></div>` +
      `<div class="ct-fact"><span class="k">Judgment</span><span class="v">${stars(scout.judgment)}</span></div>` +
      `<div class="ct-fact"><span class="k">Monthly Salary</span><span class="v">${money(monthlySalary(scout.experience, scout.judgment))}</span></div>` +
    `</div>` +
    assignmentCard +
    actions +
    `<div class="ct-actions" style="margin-top:10px">` +
      `<button class="ct-btn" type="button" data-action="sack">Sack Scout (${money(sackCost(scout))})</button>` +
    `</div>`
  );
}

function renderYouthHub(state) {
  document.getElementById("youth-list").innerHTML = renderYouthHubList(state);
  document.getElementById("youth-detail").innerHTML = renderYouthHubDetail(state);
}

function renderYouthHubFooter(state) {
  const ui = state.ui.youth;
  const a = state.academy;
  let html = "";
  if (ui.selectedScoutId != null) {
    if (ui.selectedIsPool) html += prompt("a", "A", "hire", "Hire");
    else {
      const scout = a.scouts.find((s) => s.id === ui.selectedScoutId);
      if (scout && scout.assignment) html += prompt("a", "A", "recall", "Recall");
      else html += prompt("a", "A", "assign", "Send To Nation");
      html += prompt("x", "X", "sack", "Sack Scout");
    }
  }
  html += prompt("y", "Y", "open-squad", "Youth Squad");
  html += prompt("b", "B", "back", "Back");
  return html;
}

/* ============================================================================
 * Assign form (nation + player type + duration, for the selected idle scout)
 * ========================================================================== */

function renderYouthAssignForm(state) {
  const ui = state.ui.youth;
  const d = ui.assignDraft;
  const scout = state.academy.scouts.find((s) => s.id === d.scoutId);
  const el = document.getElementById("youth-body");

  const typeChips = PLAYER_TYPES.map((t) => (
    `<button type="button" class="gtn-tag${d.type === t.id ? " is-sel" : ""}" data-action="set-type" data-value="${t.id}">${t.label}</button>`
  )).join("");
  const tierButtons = MISSION_TIERS.map((tier, i) => (
    `<button type="button" class="sr-area-btn${d.tierIndex === i ? " is-sel" : ""}" data-action="set-tier" data-value="${i}">${tier.label} (${tier.months}mo)</button>`
  )).join("");

  const errorBanner = ui.lastError === "no-nation"
    ? `<div class="ng-result ng-result--rejected">Pick a country to scout.</div>` : "";

  el.innerHTML =
    `<div class="gtn-form__head">Send Youth Scout — ${scout ? scout.commonName : ""}</div>` +
    errorBanner +
    `<div class="gtn-form__row"><span class="gtn-form__label">Country</span>` +
      `<button class="ct-stepper" type="button" data-action="nation-prev">&minus;</button>` +
      `<span class="sr-filter__val">${d.nationId ? nationName(state, d.nationId) : "—"}</span>` +
      `<button class="ct-stepper" type="button" data-action="nation-next">+</button>` +
    `</div>` +
    `<div class="gtn-form__row gtn-form__row--tags"><span class="gtn-form__label">Player Type</span><div class="gtn-tag-row">${typeChips}</div></div>` +
    `<div class="gtn-form__row"><span class="gtn-form__label">Duration</span><div class="sr-areapicker">${tierButtons}</div></div>` +
    `<div class="ng-note">No cost to send a scout — their monthly salary already covers it. Click a Player Type again to clear it back to Any.</div>`;
}

/* ============================================================================
 * Youth Squad: roster list (left) + one prospect's detail (right)
 * ========================================================================== */

/** Deterministic per-player attribute reveal order (seeded by id, so it's
 * stable across re-renders without persisting an extra field) — physical/
 * mental unlock before skill, matching scout.ini's ATTRIBUTES_PLAYER_x_
 * UNLOCK_BUCKET_x_PERC weighting (physical/mental favoured over skill for
 * outfield players); goalkeeping attributes unlock first for a keeper. */
function attrRevealOrder(player) {
  const rng = new RngStream(deriveSeed(player.id, "youth-attr-reveal-order"));
  const isGK = positionInfo(player.position).area === "GK";
  const groups = isGK
    ? [GK_ATTRIBUTES, PHYSICAL_ATTRIBUTES, MENTAL_ATTRIBUTES, SKILL_ATTRIBUTES]
    : [PHYSICAL_ATTRIBUTES, MENTAL_ATTRIBUTES, SKILL_ATTRIBUTES, GK_ATTRIBUTES];
  return groups.flatMap((g) => rng.shuffle(g));
}

function unlockedAttrSet(player) {
  const count = ATTR_UNLOCK_COUNT_BY_LEVEL[player.scouting.level] ?? 0;
  return new Set(attrRevealOrder(player).slice(0, count));
}

function attrCellHtml(player, unlocked, attr, label) {
  if (!unlocked.has(attr)) return `<div class="ys-attr-row"><span class="ys-attr-name">${label}</span><span class="ys-attr-val ys-attr-val--locked">?</span></div>`;
  const trueVal = player.attrs[attr];
  const level = player.scouting.level;
  let display;
  if (level >= 3) {
    display = String(trueVal);
  } else {
    const pct = ATTR_VARIANCE_PCT_BY_LEVEL[level] / 100;
    const half = Math.max(1, Math.round(trueVal * pct));
    display = `${Math.max(1, trueVal - half)}-${Math.min(99, trueVal + half)}`;
  }
  return `<div class="ys-attr-row"><span class="ys-attr-name">${label}</span><span class="ys-attr-val">${display}</span></div>`;
}

const ATTR_LABELS = {
  acceleration: "Acceleration", sprintSpeed: "Sprint Speed", jumping: "Jumping", stamina: "Stamina",
  strength: "Strength", balance: "Balance", agility: "Agility",
  reactions: "Reactions", positioning: "Positioning", interceptions: "Interceptions", vision: "Vision", aggression: "Aggression",
  finishing: "Finishing", shotPower: "Shot Power", longShots: "Long Shots", volleys: "Volleys", penalties: "Penalties",
  crossing: "Crossing", fkAccuracy: "FK Acc.", shortPass: "Short Passing", longPass: "Long Passing", curve: "Curve",
  ballControl: "Ball Control", dribbling: "Dribbling", composure: "Composure",
  headingAcc: "Heading Acc.", marking: "Marking", standTackle: "Stand Tackle", slideTackle: "Sliding Tackle",
  gkDiving: "GK Diving", gkHandling: "GK Handling", gkKicking: "GK Kicking", gkPositioning: "GK Positioning", gkReflexes: "GK Reflexes",
};

function attrPanelHtml(player, unlocked, title, attrs) {
  return (
    `<div class="ys-attr-group"><div class="ys-attr-group__title">${title}:</div>` +
    attrs.map((a) => attrCellHtml(player, unlocked, a, ATTR_LABELS[a])).join("") +
    `</div>`
  );
}

function renderYouthSquadList(state) {
  const a = state.academy;
  const ui = state.ui.youth;
  const rows = a.roster.map((p) => {
    const sel = p.id === ui.squadSelectedPlayerId ? " is-sel" : "";
    const eligible = isPromotable(p);
    return (
      `<tr class="sl-row${sel}" data-player="${p.id}">` +
        `<td class="sl-name">${flagSpan(p.nationId)} ${p.commonName}</td>` +
        `<td class="num">${p.age}</td>` +
        `<td class="ys-eligible">${eligible ? "" : `<svg class="icon"><use href="#ic-lock"></use></svg>`}</td>` +
      `</tr>`
    );
  }).join("");
  return (
    `<div class="ct-list__header"><span class="ct-list__clubname">Youth Squad</span><span class="ct-list__count">${a.roster.length}/${MAX_YOUTH_SQUAD_SIZE}</span></div>` +
    `<table class="tbl sl-table"><thead><tr><th>Player Name</th><th>Age</th><th>Eligible</th></tr></thead><tbody>` +
    (rows || `<tr><td colspan="3"><div class="empty"><span class="lbl">No prospects yet — send a scout to a nation</span></div></td></tr>`) +
    `</tbody></table>`
  );
}

function renderYouthSquadDetail(state) {
  const ui = state.ui.youth;
  const p = ui.squadSelectedPlayerId != null ? state.academy.roster.find((x) => x.id === ui.squadSelectedPlayerId) : null;
  if (!p) return `<div class="empty"><span class="lbl">Select a prospect</span></div>`;

  const unlocked = unlockedAttrSet(p);
  const level = p.scouting.level;
  const typeText = level >= 3 ? typeLabel(p.academyType) : "Unknown";
  const potLine = level >= 3 ? potentialBand(p, state.seasonStartYear) : "";

  let warningBanner = "";
  if (p.retirementWarningDate) {
    const daysLeft = Math.max(0, RETIREMENT_WARNING_DAYS - (toEpochDay(state.calendar.today) - toEpochDay(p.retirementWarningDate)));
    warningBanner = `<div class="ct-warning">${p.commonName} will leave the academy in ${daysLeft} day${daysLeft === 1 ? "" : "s"} unless promoted.</div>`;
  }

  const errorBanner = ui.lastError === "too-young"
    ? `<div class="ng-result ng-result--rejected">Not old enough to promote yet (min age ${MIN_PROMOTION_AGE}).</div>` : "";

  const promoteBtn = isPromotable(p)
    ? `<button class="ct-btn ct-btn--primary" type="button" data-action="promote">Promote To First Team</button>`
    : `<button class="ct-btn" type="button" disabled>Too Young To Promote</button>`;

  return (
    warningBanner + errorBanner +
    `<div class="ct-detail__head">` +
      `<div class="ct-detail__name">${flagSpan(p.nationId)} ${p.commonName}</div>` +
    `</div>` +
    `<div class="ct-detail__sub">${positionInfo(p.position).label} &middot; Age ${p.age}</div>` +
    `<div class="ys-ovr-row">` +
      `<div class="ys-ovr"><span class="ys-ovr__num">${fuzzyDisplay(p.scouting.ovrRange, level)}</span><span class="ys-ovr__lbl">OVERALL</span></div>` +
      `<div class="ys-ovr ys-ovr--pot"><span class="ys-ovr__num">${fuzzyDisplay(p.scouting.potRange, level)}</span><span class="ys-ovr__lbl">POTENTIAL</span></div>` +
    `</div>` +
    `<div class="ct-facts">` +
      `<div class="ct-fact"><span class="k">Height</span><span class="v">${p.heightCm}cm</span></div>` +
      `<div class="ct-fact"><span class="k">Weight</span><span class="v">${p.weightKg}kg</span></div>` +
      `<div class="ct-fact"><span class="k">Foot</span><span class="v">${p.foot === "R" ? "Right" : "Left"}</span></div>` +
      `<div class="ct-fact"><span class="k">Type</span><span class="v">${typeText}</span></div>` +
    `</div>` +
    (potLine ? `<div class="ng-note">${potLine}</div>` : "") +
    `<div class="ys-attrs">` +
      attrPanelHtml(p, unlocked, "Physical", PHYSICAL_ATTRIBUTES) +
      attrPanelHtml(p, unlocked, "Mental", MENTAL_ATTRIBUTES) +
      attrPanelHtml(p, unlocked, "Technical", SKILL_ATTRIBUTES) +
      attrPanelHtml(p, unlocked, "Goalkeeping", GK_ATTRIBUTES) +
    `</div>` +
    `<div class="ct-actions" style="margin-top:12px">${promoteBtn}<button class="ct-btn" type="button" data-action="release">Release</button></div>`
  );
}

function renderYouthSquad(state) {
  document.getElementById("youth-list").innerHTML = renderYouthSquadList(state);
  document.getElementById("youth-detail").innerHTML = renderYouthSquadDetail(state);
}

function renderYouthSquadFooter(state) {
  const ui = state.ui.youth;
  let html = "";
  if (ui.squadSelectedPlayerId != null) {
    const p = state.academy.roster.find((x) => x.id === ui.squadSelectedPlayerId);
    if (p && isPromotable(p)) html += prompt("a", "A", "promote", "Promote");
    html += prompt("x", "X", "release", "Release");
  }
  html += prompt("b", "B", "back", "Back");
  return html;
}

/* ============================================================================
 * Top-level dispatcher
 * ========================================================================== */

export function renderYouth(state) {
  const ui = state.ui.youth;
  const crumb = document.getElementById("youth-crumb-cur");
  const body = document.getElementById("youth-body");
  const footer = document.getElementById("footer-youth");

  if (ui.view === "hub") {
    crumb.textContent = "YOUTH STAFF";
    body.innerHTML = `<div class="gtn-hub"><div class="gtn-col" id="youth-list"></div><div class="gtn-detail" id="youth-detail"></div></div>`;
    renderYouthHub(state);
    footer.innerHTML = renderYouthHubFooter(state);
  } else if (ui.view === "assignForm") {
    crumb.textContent = "SEND SCOUT";
    renderYouthAssignForm(state);
    footer.innerHTML = prompt("a", "A", "submit-assign", "Send Scout") + prompt("b", "B", "back", "Cancel");
  } else if (ui.view === "squad") {
    crumb.textContent = "YOUTH SQUAD";
    body.innerHTML = `<div class="gtn-hub"><div class="gtn-col" id="youth-list"></div><div class="gtn-detail" id="youth-detail"></div></div>`;
    renderYouthSquad(state);
    footer.innerHTML = renderYouthSquadFooter(state);
  }
}
