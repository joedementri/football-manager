// ui/gtnui.js — M8's Global Transfer Network overlay: one overlay, 3 internal
// views (state.ui.gtn.view) — 'hub' (hired scouts + market pool), 'missionForm'
// (new-mission builder for the selected idle scout), 'report' (one mission's
// found players with fuzzy ratings + Bid/Loan actions). Pure render-from-
// state, same contract as every other ui/*.js module (see ui/contractsui.js's
// header) — every control calls a core/store.js method and re-renders off
// the "gtn" event core/router.js subscribes to.
//
// No REFERENCE_PICS screenshot covered the scout-hire/mission-builder screens
// at the time this was authored (only the Transfers hub tile grid + Search
// Players had been captured) — built fresh from the existing list/detail +
// stepper/form conventions (ui/contractsui.js, ui/transfersui.js), same
// footing as ui/matchday.js's own header note on this.
//
// REFERENCE_PICS/more_screens/TRANSFERS_SCREEN/ms_GTN_*.png arrived after
// this was built and shows the real FIFA 15 screen is structured
// differently: scouts relocate to a region and scout *indefinitely* (no
// mission/duration, cumulative "Players Found"/"Days Scouted" counters), a
// separate "Instructions" tab holds reusable global search filters (position
// + up to 6 attribute tags from a larger vocabulary + age + contract-
// remaining range) applied network-wide across every scout at once, and the
// report screen shows six bucketed attribute ranges (Athleticism/Technical/
// Shooting/Passing/Defending/Mentality), not one fuzzy overall number. This
// file's self-contained "mission" (scout+region+tags+duration bundled
// together, one fuzzy overall/potential range) was kept as-is by explicit
// user decision — it already satisfies plan1.md's own M8 acceptance line
// verbatim and is fully tested (dev/tests.js's "engine/gtn.js" groups). A
// fidelity pass toward the real screens (if ever wanted) belongs in M11
// ("Polish & fidelity pass ... screenshot comparison with all 9 reference
// pics") rather than reopening this milestone.

import { money } from "../core/format.js";
import { stars, potentialBand } from "./playerbio.js";
import { MISSION_TIERS, SCOUT_TAGS, hireCost, sackCost, monthlySalary, missionCost } from "../config/scouting.js";
import * as gtnEngine from "../engine/gtn.js";

function prompt(glyphClass, glyphLabel, action, label) {
  return `<span class="prompt" data-action="${action}"><span class="btn-glyph ${glyphClass}">${glyphLabel}</span> ${label}</span>`;
}

function flagSpan(code) {
  return `<span class="flag" data-flag="${code}"></span>`;
}

/** "62-74" below level 3, the exact number once fully scouted (plan1.md M8:
 * "level 3 (fully scouted) ⇒ exact"). Shared with ui/transfersui.js's Search
 * Players results. */
export function fuzzyDisplay([lo, hi], level) {
  return level >= 3 ? String(lo) : `${lo}-${hi}`;
}

function nationName(state, nationId) {
  return state.staticData.nations.find((n) => n.id === nationId)?.name || nationId;
}

/* ============================================================================
 * Hub: hired scouts + market pool (left) / detail panel (right)
 * ========================================================================== */

function scoutRowHtml(state, scout, { selected, isPool }) {
  const sel = selected ? " is-sel" : "";
  let status = `<span class="gtn-chip gtn-chip--idle">Idle</span>`;
  if (!isPool) {
    const mission = state.gtn.missions.find((m) => m.id === scout.missionId);
    if (mission) {
      const newCount = gtnEngine.missionNewCount(mission);
      status = `<span class="gtn-chip gtn-chip--active">On Mission${newCount ? ` &middot; ${newCount} New` : ""}</span>`;
    }
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

function renderGtnHubList(state) {
  const g = state.gtn;
  const ui = state.ui.gtn;
  const scoutRows = g.scouts.map((s) => scoutRowHtml(state, s, { selected: !ui.selectedIsPool && s.id === ui.selectedScoutId, isPool: false })).join("");
  const poolRows = g.pool.map((c) => scoutRowHtml(state, c, { selected: ui.selectedIsPool && c.id === ui.selectedScoutId, isPool: true })).join("");
  return (
    `<div class="gtn-section-label">MY SCOUTS (${g.scouts.length}/6)</div>` +
    `<div class="gtn-rows">${scoutRows || `<div class="empty"><span class="lbl">No scouts hired yet</span></div>`}</div>` +
    `<div class="gtn-section-label">SCOUT MARKET</div>` +
    `<div class="gtn-rows">${poolRows || `<div class="empty"><span class="lbl">Pool refreshes weekly</span></div>`}</div>`
  );
}

function renderGtnHubDetail(state) {
  const g = state.gtn;
  const ui = state.ui.gtn;
  if (ui.selectedScoutId == null) return `<div class="empty"><span class="lbl">Select a scout</span></div>`;

  const errorBanner = ui.lastError === "insufficient-funds"
    ? `<div class="ng-result ng-result--rejected">Not enough transfer budget.</div>`
    : ui.lastError === "roster-full" ? `<div class="ng-result ng-result--rejected">You already employ the maximum of 6 scouts.</div>` : "";

  if (ui.selectedIsPool) {
    const c = g.pool.find((x) => x.id === ui.selectedScoutId);
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

  const scout = g.scouts.find((x) => x.id === ui.selectedScoutId);
  if (!scout) return `<div class="empty"><span class="lbl">Select a scout</span></div>`;
  const mission = g.missions.find((m) => m.id === scout.missionId);
  const missionCard = !mission ? "" : (
    `<div class="ct-facts">` +
      `<div class="ct-fact"><span class="k">Position</span><span class="v">${gtnEngine.missionTitle(mission)}</span></div>` +
      `<div class="ct-fact"><span class="k">Type</span><span class="v">${gtnEngine.missionTagsLabel(mission)}</span></div>` +
      `<div class="ct-fact"><span class="k">Region</span><span class="v">${mission.region === "ALL" ? "Worldwide" : nationName(state, mission.region)}</span></div>` +
      `<div class="ct-fact"><span class="k">Duration</span><span class="v">${mission.tierLabel}</span></div>` +
      `<div class="ct-fact"><span class="k">Found</span><span class="v">${mission.foundPlayerIds.length} player${mission.foundPlayerIds.length === 1 ? "" : "s"}</span></div>` +
    `</div>`
  );
  const actions = mission
    ? `<div class="ct-actions">` +
        `<button class="ct-btn ct-btn--primary" type="button" data-action="view-report" data-mission="${mission.id}">View Report</button>` +
        `<button class="ct-btn" type="button" data-action="cancel-mission" data-mission="${mission.id}">Cancel Mission</button>` +
      `</div>`
    : `<div class="ct-actions"><button class="ct-btn ct-btn--primary" type="button" data-action="assign-mission">Assign Mission</button></div>`;

  return (
    errorBanner +
    `<div class="ct-detail__head"><div class="ct-detail__name">${flagSpan(scout.nationId)} ${scout.commonName}</div></div>` +
    `<div class="ct-facts">` +
      `<div class="ct-fact"><span class="k">Nationality</span><span class="v">${nationName(state, scout.nationId)}</span></div>` +
      `<div class="ct-fact"><span class="k">Experience</span><span class="v">${stars(scout.experience)}</span></div>` +
      `<div class="ct-fact"><span class="k">Judgment</span><span class="v">${stars(scout.judgment)}</span></div>` +
      `<div class="ct-fact"><span class="k">Monthly Salary</span><span class="v">${money(monthlySalary(scout.experience, scout.judgment))}</span></div>` +
    `</div>` +
    missionCard +
    actions +
    `<div class="ct-actions" style="margin-top:10px">` +
      `<button class="ct-btn" type="button" data-action="sack">Sack Scout (${money(sackCost(scout))})</button>` +
    `</div>`
  );
}

function renderGtnHub(state) {
  document.getElementById("gtn-list").innerHTML = renderGtnHubList(state);
  document.getElementById("gtn-detail").innerHTML = renderGtnHubDetail(state);
}

function renderGtnHubFooter(state) {
  const ui = state.ui.gtn;
  const g = state.gtn;
  let html = "";
  if (ui.selectedScoutId != null) {
    if (ui.selectedIsPool) html += prompt("a", "A", "hire", "Hire");
    else {
      const scout = g.scouts.find((s) => s.id === ui.selectedScoutId);
      if (scout && scout.missionId) html += prompt("a", "A", "view-report", "View Report");
      else html += prompt("a", "A", "assign-mission", "Assign Mission");
      html += prompt("x", "X", "sack", "Sack Scout");
    }
  }
  html += prompt("b", "B", "back", "Back");
  return html;
}

/* ============================================================================
 * Mission form (new mission for the selected idle scout)
 * ========================================================================== */

const AREA_LABELS = { ALL: "Any", GK: "GK", DEF: "DEF", MID: "MID", ATT: "ATT" };

function renderGtnMissionForm(state) {
  const ui = state.ui.gtn;
  const d = ui.missionDraft;
  const g = state.gtn;
  const scout = g.scouts.find((s) => s.id === d.scoutId);
  const el = document.getElementById("gtn-body");

  const areaButtons = Object.keys(AREA_LABELS).map((a) => (
    `<button type="button" class="sr-area-btn${d.area === a ? " is-sel" : ""}" data-action="set-area" data-value="${a}">${AREA_LABELS[a]}</button>`
  )).join("");
  const tagChips = SCOUT_TAGS.map((t) => (
    `<button type="button" class="gtn-tag${d.tags.includes(t.id) ? " is-sel" : ""}" data-action="toggle-tag" data-value="${t.id}">${t.label}</button>`
  )).join("");
  const tierButtons = MISSION_TIERS.map((tier, i) => (
    `<button type="button" class="sr-area-btn${d.tierIndex === i ? " is-sel" : ""}" data-action="set-tier" data-value="${i}">${tier.label} (${tier.months}mo)</button>`
  )).join("");

  const cost = scout ? missionCost(d.tierIndex, scout) : 0;
  const over = cost > state.finances.transferBudget;
  const errorBanner = ui.lastError === "insufficient-funds"
    ? `<div class="ng-result ng-result--rejected">Not enough transfer budget for this mission.</div>` : "";

  el.innerHTML =
    `<div class="gtn-form__head">New Mission — ${scout ? scout.commonName : ""} ${scout ? `(EXP ${stars(scout.experience)} &middot; JUDG ${stars(scout.judgment)})` : ""}</div>` +
    errorBanner +
    `<div class="gtn-form__row"><span class="gtn-form__label">Position</span><div class="sr-areapicker">${areaButtons}</div></div>` +
    `<div class="gtn-form__row"><span class="gtn-form__label">Region</span>` +
      `<button class="ct-stepper" type="button" data-action="region-prev">&minus;</button>` +
      `<span class="sr-filter__val">${d.region === "ALL" ? "Worldwide" : nationName(state, d.region)}</span>` +
      `<button class="ct-stepper" type="button" data-action="region-next">+</button>` +
    `</div>` +
    `<div class="gtn-form__row gtn-form__row--tags"><span class="gtn-form__label">Player Type</span><div class="gtn-tag-row">${tagChips}</div></div>` +
    `<div class="gtn-form__row"><span class="gtn-form__label">Min Age</span>` +
      `<button class="ct-stepper" type="button" data-action="minage-down">&minus;</button>` +
      `<span class="sr-filter__val">${d.minAge}</span>` +
      `<button class="ct-stepper" type="button" data-action="minage-up">+</button>` +
    `</div>` +
    `<div class="gtn-form__row"><span class="gtn-form__label">Max Age</span>` +
      `<button class="ct-stepper" type="button" data-action="maxage-down">&minus;</button>` +
      `<span class="sr-filter__val">${d.maxAge}</span>` +
      `<button class="ct-stepper" type="button" data-action="maxage-up">+</button>` +
    `</div>` +
    `<div class="gtn-form__row"><span class="gtn-form__label">Max Value</span>` +
      `<button class="ct-stepper" type="button" data-action="maxvalue-down">&minus;</button>` +
      `<span class="sr-filter__val">${d.maxValue > 0 ? money(d.maxValue) : "Any"}</span>` +
      `<button class="ct-stepper" type="button" data-action="maxvalue-up">+</button>` +
    `</div>` +
    `<div class="gtn-form__row"><span class="gtn-form__label">Duration</span><div class="sr-areapicker">${tierButtons}</div></div>` +
    `<div class="ng-budget${over ? " ng-budget--over" : ""}">Mission Cost: ${money(cost)} &middot; Transfer Budget: ${money(state.finances.transferBudget)}${over ? " — insufficient funds" : ""}</div>`;
}

/* ============================================================================
 * Report: one mission's found players (fuzzy ratings) + Bid/Loan
 * ========================================================================== */

function reportSortedPlayers(state, mission) {
  return mission.foundPlayerIds
    .map((id) => state.playersById.get(id))
    .filter(Boolean)
    .sort((a, b) => (b.scouting.ovrRange[0] + b.scouting.ovrRange[1]) - (a.scouting.ovrRange[0] + a.scouting.ovrRange[1]));
}

function renderGtnReport(state) {
  const ui = state.ui.gtn;
  const mission = state.gtn.missions.find((m) => m.id === ui.reportMissionId);
  const el = document.getElementById("gtn-body");
  if (!mission) { el.innerHTML = `<div class="empty"><span class="lbl">No mission selected</span></div>`; return; }

  const players = reportSortedPlayers(state, mission);
  const rows = players.map((p) => {
    const club = state.clubsById.get(p.clubId);
    const sel = p.id === ui.reportSelectedPlayerId ? " is-sel" : "";
    return (
      `<div class="sr-row${sel}" data-player="${p.id}">` +
        `<span class="flag" data-flag="${p.nationId}"></span>` +
        `<span class="sr-row__name">${p.commonName}</span>` +
        `<span class="sr-row__pos">${p.position}</span>` +
        `<span class="sr-row__age num">${p.age}</span>` +
        `<span class="sr-row__ovr num gtn-fuzzy">${fuzzyDisplay(p.scouting.ovrRange, p.scouting.level)}</span>` +
        `<svg class="crest crest--xs"><use href="#crest-${club.id}"></use></svg>` +
      `</div>`
    );
  }).join("");

  const selected = ui.reportSelectedPlayerId != null ? state.playersById.get(ui.reportSelectedPlayerId) : null;
  const detail = !selected ? `<div class="empty"><span class="lbl">Select a player</span></div>` : (() => {
    const club = state.clubsById.get(selected.clubId);
    const s = selected.scouting;
    const statusLine = s.level >= 3 ? "Report Complete" : s.level === 0 ? "Not Yet Scouted" : "Report In Progress";
    const potLine = s.level >= 3
      ? potentialBand(selected, state.seasonStartYear)
      : `Potential: ${fuzzyDisplay(s.potRange, s.level)}`;
    return (
      `<div class="ct-detail__head">` +
        `<svg class="crest crest--sm"><use href="#crest-${club.id}"></use></svg>` +
        `<div class="ct-detail__name">${selected.commonName}</div>` +
      `</div>` +
      `<div class="ct-detail__sub">${selected.position} &middot; Age ${selected.age} &middot; ${club.name}</div>` +
      `<div class="ct-facts">` +
        `<div class="ct-fact"><span class="k">Scouting</span><span class="v">${statusLine}</span></div>` +
        `<div class="ct-fact"><span class="k">Overall</span><span class="v">${fuzzyDisplay(s.ovrRange, s.level)}</span></div>` +
        `<div class="ct-fact"><span class="k">Value</span><span class="v">${money(selected.value)}</span></div>` +
      `</div>` +
      `<div class="ng-note">${potLine}</div>`
    );
  })();

  el.innerHTML =
    `<div class="gtn-report__head">${gtnEngine.missionTitle(mission)} &mdash; ${gtnEngine.missionTagsLabel(mission)}</div>` +
    `<div class="gtn-report__body">` +
      `<div class="sr-results" id="gtn-report-list">${rows || `<div class="empty"><span class="lbl">No players found yet — check back after the first report</span></div>`}</div>` +
      `<div id="gtn-report-detail">${detail}</div>` +
    `</div>`;
}

function renderGtnReportFooter(state) {
  const ui = state.ui.gtn;
  let html = "";
  if (ui.reportSelectedPlayerId != null) {
    html += prompt("a", "A", "bid", "Bid") + prompt("x", "X", "loan", "Loan");
  }
  if (state.gtn.missions.length > 1) {
    html += prompt("r1", "R1", "next-mission", "Switch Group");
  }
  html += prompt("b", "B", "back", "Back");
  return html;
}

/* ============================================================================
 * Top-level dispatcher
 * ========================================================================== */

export function renderGtn(state) {
  const ui = state.ui.gtn;
  const crumb = document.getElementById("gtn-crumb-cur");
  const body = document.getElementById("gtn-body");
  const footer = document.getElementById("footer-gtn");

  if (ui.view === "hub") {
    crumb.textContent = "GLOBAL TRANSFER NETWORK";
    body.innerHTML = `<div class="gtn-hub"><div class="gtn-col" id="gtn-list"></div><div class="gtn-detail" id="gtn-detail"></div></div>`;
    renderGtnHub(state);
    footer.innerHTML = renderGtnHubFooter(state);
  } else if (ui.view === "missionForm") {
    crumb.textContent = "NEW MISSION";
    renderGtnMissionForm(state);
    footer.innerHTML = prompt("a", "A", "start-mission", "Start Mission") + prompt("b", "B", "back", "Cancel");
  } else if (ui.view === "report") {
    crumb.textContent = "SCOUT REPORT";
    renderGtnReport(state);
    footer.innerHTML = renderGtnReportFooter(state);
  }
}
