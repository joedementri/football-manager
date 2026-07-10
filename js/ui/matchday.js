// ui/matchday.js — the Match Day overlay: pre-match lineups -> live ticker
// (minute clock, event feed, score, speed control, pause-for-subs) ->
// full-time report (fable-plans/plan1.md M4's new "Match Day" screen). Pure
// render-from-state, per the project's UI contract: every control here
// calls a core/store.js `matchday*` method and re-renders off the
// "matchday" event core/router.js subscribes to — this module never
// touches engine/sim/match.js directly.
//
// No REFERENCE_PICS screenshot covers this screen (it's new to the plan,
// not part of the prototype's original 9), so it's authored fresh from the
// existing token set/overlay conventions, same as calendar.css documents
// for the Calendar overlay.

import { positionInfo } from "../config/positions.js";
import { pickBench } from "../engine/sim/lineup.js";
import { fixturesOnDate } from "../engine/calendar.js";

function playerName(state, id) {
  const p = state.playersById.get(id);
  return p ? p.commonName : "Unknown";
}

function crestUse(clubId, size = "sm", extraClass = "") {
  return `<svg class="crest crest--${size}${extraClass ? ` ${extraClass}` : ""}"><use href="#crest-${clubId}"></use></svg>`;
}

function xiListHtml(state, xi) {
  return xi
    .slice()
    .sort((a, b) => positionInfo(a.position).index - positionInfo(b.position).index)
    .map((p) => `<li class="md-xi__row"><span class="md-xi__pos">${p.position}</span><span class="md-xi__name">${p.commonName}</span><span class="md-xi__ovr">${p.overall}</span></li>`)
    .join("");
}

function scoreboardHtml(state, m, label) {
  const homeClub = state.clubsById.get(m.homeClubId);
  const awayClub = state.clubsById.get(m.awayClubId);
  return (
    `<div class="md-scoreboard">` +
      `<div class="md-sb__team">${crestUse(homeClub.id)}<span class="md-sb__name">${homeClub.shortName}</span></div>` +
      `<div class="md-sb__mid"><span class="md-sb__score">${m.score.home} - ${m.score.away}</span><span class="md-sb__minute">${label}</span></div>` +
      `<div class="md-sb__team md-sb__team--away"><span class="md-sb__name">${awayClub.shortName}</span>${crestUse(awayClub.id)}</div>` +
    `</div>`
  );
}

const EVENT_BADGE = { goal: "GOAL", card: null, injury: "INJURY", sub: "SUB", "chance-miss": "CHANCE" };

/** One incident row — used by both the live ticker feed and the full-time
 * report, always with the team's crest so "which side did this happen to"
 * reads at a glance in a mixed home/away list. */
function eventLineHtml(state, m, ev) {
  const club = state.clubsById.get(ev.side === "home" ? m.homeClubId : m.awayClubId);
  const crest = crestUse(club.id, "xs", "md-ev__crest");
  let badge = EVENT_BADGE[ev.type];
  let text = playerName(state, ev.playerId);
  let accent = ev.side === "home" ? "home" : "away";

  if (ev.type === "goal") {
    badge = ev.isPenalty ? "PENALTY" : "GOAL";
    if (ev.assistId != null) text += ` <span class="md-ev__assist">(assist: ${playerName(state, ev.assistId)})</span>`;
    accent = "goal";
  } else if (ev.type === "card") {
    badge = ev.cardType === "red" ? "RED CARD" : "YELLOW CARD";
    accent = ev.cardType === "red" ? "red" : "yellow";
  } else if (ev.type === "injury") {
    text += ` <span class="md-ev__assist">(${ev.injury.type})</span>`;
    accent = "injury";
  } else if (ev.type === "sub") {
    text = `${playerName(state, ev.playerInId)} <span class="md-ev__assist">ON for ${playerName(state, ev.playerOutId)}</span>`;
    accent = "sub";
  }

  return (
    `<div class="md-ev md-ev--${accent}">` +
      `<span class="md-ev__min">${ev.minute}'</span>` +
      crest +
      `<span class="md-ev__badge">${badge}</span>` +
      `<span class="md-ev__text">${text}</span>` +
    `</div>`
  );
}

function otherScoresHtml(state, m) {
  const fixtures = fixturesOnDate(state.fixtures, state.calendar.today).filter((f) => f.id !== m.fixture.id);
  if (fixtures.length === 0) return "";
  const rows = fixtures.slice(0, 6).map((f) => {
    const r = state.results.get(f.id);
    const score = r ? `${r.homeGoals}-${r.awayGoals}` : "—";
    return (
      `<div class="md-other">${crestUse(f.homeClubId)}<span class="md-other__score">${score}</span>${crestUse(f.awayClubId)}</div>`
    );
  }).join("");
  return `<div class="md-otherscores"><div class="md-otherscores__title">Other Results</div>${rows}</div>`;
}

function renderPreMatch(state, m) {
  const homeClub = state.clubsById.get(m.homeClubId);
  const awayClub = state.clubsById.get(m.awayClubId);
  return (
    `<div class="md-prematch">` +
      `<div class="md-team">` +
        `<svg class="crest"><use href="#crest-${homeClub.id}"></use></svg>` +
        `<div class="md-team__name">${homeClub.name}</div>` +
        `<ul class="md-xi">${xiListHtml(state, m.homeXI)}</ul>` +
      `</div>` +
      `<div class="md-vs">VS</div>` +
      `<div class="md-team">` +
        `<svg class="crest"><use href="#crest-${awayClub.id}"></use></svg>` +
        `<div class="md-team__name">${awayClub.name}</div>` +
        `<ul class="md-xi">${xiListHtml(state, m.awayXI)}</ul>` +
      `</div>` +
    `</div>`
  );
}

function renderTicker(state, m, minuteLabel) {
  const feed = m.log.slice().reverse().map((ev) => eventLineHtml(state, m, ev)).join("")
    || `<div class="md-ev md-ev--none">No incidents yet…</div>`;
  return (
    `<div class="md-ticker">` +
      scoreboardHtml(state, m, minuteLabel) +
      `<div class="md-feed">${feed}</div>` +
      otherScoresHtml(state, m) +
    `</div>`
  );
}

function renderHalftime(state, m) {
  return (
    `<div class="md-ticker">` +
      scoreboardHtml(state, m, "HALF TIME") +
      `<div class="md-feed">${m.log.slice().reverse().map((ev) => eventLineHtml(state, m, ev)).join("") || ""}</div>` +
    `</div>`
  );
}

/** Full-time report: every notable incident (goals/PKs/cards/injuries/subs —
 * "chance-miss" ticker flavour is excluded, it's not a reportable event) in
 * one chronological, crested, scrollable list, so it always fits the
 * screen regardless of how eventful the match was. */
function renderFullTime(state, m) {
  let mom = null;
  if (m.finalStats) {
    for (const [playerId, stat] of m.finalStats) {
      if (!mom || stat.rating > mom.stat.rating) mom = { playerId, stat };
    }
  }
  const reportEvents = m.log.filter((ev) => ev.type !== "chance-miss").slice().sort((a, b) => a.minute - b.minute);
  const timeline = reportEvents.map((ev) => eventLineHtml(state, m, ev)).join("")
    || `<div class="md-ev md-ev--none">No notable incidents</div>`;

  return (
    `<div class="md-fulltime">` +
      scoreboardHtml(state, m, "FULL TIME") +
      (mom ? (
        `<div class="md-mom">` +
          `<span class="md-mom__label">Man of the Match</span>` +
          `<span class="md-mom__name">${playerName(state, mom.playerId)}</span>` +
          `<span class="md-mom__rating">${mom.stat.rating}</span>` +
        `</div>`
      ) : "") +
      `<div class="md-ft-timeline">${timeline}</div>` +
    `</div>`
  );
}

function renderSubPicker(state, m) {
  const isHomeSide = m.isUserHome;
  const side = isHomeSide ? "home" : "away";
  const roster = isHomeSide ? m.homeRoster : m.awayRoster;
  const xi = isHomeSide ? m.homeXI : m.awayXI;
  const benchUsed = isHomeSide ? m.homeBenchUsed : m.awayBenchUsed;

  if (state.ui.matchdaySubInId == null) {
    const bench = pickBench(roster, xi);
    const rows = bench.map((p) => (
      `<div class="md-sub-row" data-action="pick-sub-in" data-player="${p.id}">` +
        `<span class="md-xi__pos">${p.position}</span><span class="md-xi__name">${p.commonName}</span><span class="md-xi__ovr">${p.overall}</span>` +
      `</div>`
    )).join("") || `<div class="md-sub-row md-sub-row--none">No fit substitutes available</div>`;
    return (
      `<div class="md-subpicker">` +
        `<div class="panel-title">Bring On (${benchUsed}/3 used)</div>` +
        `<div class="md-sub-list">${rows}</div>` +
      `</div>`
    );
  }

  const inName = playerName(state, state.ui.matchdaySubInId);
  const rows = xi.map((p) => (
    `<div class="md-sub-row" data-action="confirm-sub-out" data-side="${side}" data-player="${p.id}">` +
      `<span class="md-xi__pos">${p.position}</span><span class="md-xi__name">${p.commonName}</span><span class="md-xi__ovr">${p.overall}</span>` +
    `</div>`
  )).join("");
  return (
    `<div class="md-subpicker">` +
      `<div class="panel-title">Bringing On ${inName} — Who Comes Off?</div>` +
      `<div class="md-sub-list">${rows}</div>` +
    `</div>`
  );
}

function prompt(glyphClass, glyphLabel, action, label) {
  return `<span class="prompt" data-action="${action}"><span class="btn-glyph ${glyphClass}">${glyphLabel}</span> ${label}</span>`;
}

// The live ticker re-renders on every tick (every 220ms/60ms — see
// msPerMinute below), but the footer's prompts almost never actually change
// between ticks (only the Pause/Resume label and 1x/4x speed label ever
// do). Blindly reassigning footer.innerHTML on every tick anyway destroys
// and recreates its button nodes constantly, which can race a real click:
// if the node under the pointer gets torn down between mousedown and
// mouseup, the click never fires. Diffing against the last-written string
// before touching the DOM keeps the buttons stable (and clickable) across
// ticks where nothing in the footer actually changed.
let lastFooterHtml = null;
function setFooterHtml(footer, html) {
  if (html === lastFooterHtml) return;
  lastFooterHtml = html;
  footer.innerHTML = html;
}

export function renderMatchday(state) {
  const container = document.getElementById("md-body");
  const footer = document.getElementById("footer-matchday");
  const m = state.matchday;
  if (!m) { container.innerHTML = ""; setFooterHtml(footer, ""); return; }

  if (state.ui.matchdaySubOpen) {
    container.innerHTML = renderSubPicker(state, m);
    setFooterHtml(footer, prompt("b", "B", "cancel-sub", "Cancel"));
    return;
  }

  if (m.minute === 0 && m.log.length === 0 && !m.finished) {
    container.innerHTML = renderPreMatch(state, m);
    setFooterHtml(footer, prompt("a", "A", "kickoff", "Kick Off"));
    return;
  }

  if (m.finished) {
    container.innerHTML = renderFullTime(state, m);
    setFooterHtml(footer, prompt("b", "B", "back", "Continue"));
    return;
  }

  if (m.atHalftime) {
    container.innerHTML = renderHalftime(state, m);
    setFooterHtml(footer, prompt("a", "A", "continue-second-half", "Continue") + prompt("l3", "L3", "open-sub", "Substitution"));
    return;
  }

  container.innerHTML = renderTicker(state, m, `${m.minute}'`);
  const playLabel = m.playing ? "Pause" : "Resume";
  setFooterHtml(footer,
    prompt("a", "A", "toggle-play", playLabel) +
    prompt("x", "X", "cycle-speed", m.speed >= 4 ? "Speed: 4x" : "Speed: 1x") +
    prompt("y", "Y", "instant", "Sim To End") +
    prompt("l3", "L3", "open-sub", "Substitution")
  );
}

/* ----- ticker real-time playback: a self-rescheduling setTimeout chain
 * drives store.matchdayTick() at state.matchday.speed's cadence. Every
 * "matchday" event (ticks included) re-evaluates whether another tick
 * should be queued, so pausing, finishing, hitting halftime, or changing
 * speed all take effect on the very next scheduling pass. -------------- */
let tickTimeout = null;

function msPerMinute(speed) {
  return speed >= 4 ? 60 : 220;
}

export function initMatchdayTicker(store) {
  function reschedule() {
    if (tickTimeout) { clearTimeout(tickTimeout); tickTimeout = null; }
    const m = store.state.matchday;
    if (!m || !m.playing || m.finished || m.atHalftime) return;
    tickTimeout = setTimeout(() => store.matchdayTick(), msPerMinute(m.speed));
  }
  store.on("matchday", reschedule);
  store.on("overlay", ({ name, open }) => {
    if (name === "matchday" && !open && tickTimeout) { clearTimeout(tickTimeout); tickTimeout = null; }
  });
}
