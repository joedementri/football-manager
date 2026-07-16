// ui/render.js — pure(-ish) DOM rendering from GameState. No game logic here:
// every function reads `state` and writes DOM. Mutations always happen in
// core/store.js; this module never calls a store mutator itself (see the
// "Notes for the implementing model" section of fable-plans/plan1.md).

import {
  dayOfWeekShort, dayOfMonth, monthYearShort,
  dateSlash, dateLong, dateDayMonth, number, money,
} from "../core/format.js";
import { upcomingFixtures, fixtureOnDate } from "../engine/calendar.js";
import { toEpochDay } from "../core/clock.js";
import { domesticCupFor } from "../engine/objectives.js";
import { cupStatusForClub } from "../engine/comps/cup.js";
import { squadWageBill } from "../engine/wage.js";

function flagSpan(code) {
  return `<span class="flag" data-flag="${code}"></span>`;
}

/* ----------------------------- Header ----------------------------------- */
export function renderHeader(state) {
  const { manager, club } = state;
  document.querySelector(".header__club").textContent = club.name;
  document.querySelector(".header__manager").textContent = manager.name;
  document.querySelector(".header__id .crest use").setAttribute("href", `#crest-${club.id}`);
  document.querySelector(".level-badge").textContent = manager.level;
  document.querySelector(".stat-xp .xp").textContent = `${number(manager.xp)}/${number(manager.xpMax)}`;
  const coinsEl = document.querySelector(".stat-coins");
  coinsEl.childNodes[coinsEl.childNodes.length - 1].textContent = ` ${number(manager.coins)}`;
}

/* ----------------------------- Central ----------------------------------- */
/** Each cell carries `data-date` (epoch day) so router.js can advance
 * straight to it on click. Match days for the user's club (fable-plans/
 * plan1.md M3: day-strip "with events: match days...") swap the arrow icon
 * for the opponent's crest (+ H/A) so there's something to visibly advance
 * towards — every fixture is club-vs-club until M10 adds international
 * fixtures, at which point this same branch swaps in the nation's flag
 * (flagSpan, already used by Player Bio) instead of a crest. */
function renderDayStrip(state) {
  const strip = document.querySelector(".daystrip");
  const todayTime = state.calendar.today.getTime();
  strip.innerHTML = state.calendar.strip.map((d) => {
    const isNow = d.getTime() === todayTime ? " is-now" : "";
    const fixture = fixtureOnDate(state.fixtures, state.club.id, d);
    let matchIcon = `<svg class="adv-ico"><use href="#ic-advance"></use></svg>`;
    if (fixture) {
      const isHome = fixture.homeClubId === state.club.id;
      const oppClubId = isHome ? fixture.awayClubId : fixture.homeClubId;
      matchIcon =
        `<div class="day__match">` +
          `<svg class="crest crest--xs day__crest"><use href="#crest-${oppClubId}"></use></svg>` +
          `<span class="day__ha">${isHome ? "H" : "A"}</span>` +
        `</div>`;
    }
    return (
      `<div class="day${isNow}${fixture ? " has-match" : ""}" data-date="${toEpochDay(d)}">` +
        `<span class="dow">${dayOfWeekShort(d)}</span>` +
        `<span class="dom">${dayOfMonth(d)}</span>` +
        matchIcon +
      `</div>`
    );
  }).join("");
}

function renderGtn(state) {
  const g = state.central.gtn;
  document.querySelector(".c-gtn__scout .name").textContent = g.scoutName;
  const counts = document.querySelectorAll(".c-gtn__scout .counts .c");
  counts[0].innerHTML = `<span class="pip green">+</span> ${g.newCount} New`;
  counts[1].innerHTML = `<span class="pip blue">i</span> ${g.updateCount} Updates`;
  document.querySelector(".scout-list").innerHTML = g.rows.map((r) => (
    `<div class="scout-row">` +
      `<span class="avatar"></span>` +
      `<span class="who"><b>${r.name}</b><span class="pos">${r.pos} ${flagSpan(r.flag)}</span></span>` +
      `<svg class="crest club-crest"><use href="#${r.clubCrest}"></use></svg>` +
    `</div>`
  )).join("");
}

function renderCentralNewsList(state) {
  document.querySelector(".c-newsp .news-list").innerHTML = state.central.newsList.map((n) => (
    `<div class="news-item${n.accent ? " " + n.accent : ""}">${n.text}</div>`
  )).join("");
}

/** A ~7-row window of the user's real league table (fable-plans/plan1.md
 * M3: "Central's table" is one of the stubs this milestone makes real),
 * centered on the user's club so it reads the same as the FIFA reference
 * screenshot even in a 20-24 team league. Every row is 0 pld/pts until
 * sim/quick.js (M4) starts producing results. */
function renderCentralTable(state) {
  const rows = state.league.table;
  const WINDOW = 7;
  const clubIdx = rows.findIndex((r) => r.club.id === state.club.id);
  const half = Math.floor(WINDOW / 2);
  let start = Math.max(0, clubIdx - half);
  start = Math.min(start, Math.max(0, rows.length - WINDOW));
  const windowRows = rows.slice(start, start + WINDOW);

  const tbody = document.querySelector(".c-tables .tbl tbody");
  tbody.innerHTML = windowRows.map((r) => (
    `<tr class="${r.club.id === state.club.id ? "is-user" : ""}"><td class="team"><span class="pos">${r.position}</span>` +
      `<svg class="crest crest--xs"><use href="#crest-${r.club.id}"></use></svg> ${r.club.shortName}</td>` +
      `<td class="num">${r.pld}</td><td class="num">${r.pts}</td></tr>`
  )).join("");
}

export function renderCentral(state) {
  document.querySelector(".c-advance__month").textContent = monthYearShort(state.calendar.today);
  renderDayStrip(state);
  document.querySelector(".c-news__head").textContent = state.central.headline.title;
  document.querySelector(".c-news__date").textContent = dateLong(state.central.headline.date);
  renderGtn(state);
  renderCentralNewsList(state);
  renderCentralTable(state);
}

/* ----------------------------- Squad -------------------------------------- */
export function renderSquad(state) {
  const pitch = document.querySelector(".sq-sheet__formation .pitch");
  const jerseysHtml = state.squad.lineup.map((p) => {
    const gkClass = p.gk ? " gk" : "";
    const cap = p.captain ? `<span class="jersey__cap">C</span>` : "";
    return (
      `<div class="jersey${gkClass}" style="left:${p.x}%;top:${p.y}%">` +
        `<div class="jersey__top">` +
          `<span class="jersey__pos">${p.pos}</span>` +
          `<svg class="jersey__kit"><use href="#kit"></use></svg>` +
          `<span class="jersey__rating">${p.rating}</span>${cap}` +
        `</div>` +
        `<div class="jersey__name">${p.name}</div>` +
      `</div>`
    );
  }).join("");
  // pitch.pitch__surface must survive the rewrite — it's the grass backdrop, not player data.
  pitch.innerHTML = `<div class="pitch__surface"></div>${jerseysHtml}`;

  document.querySelector(".sq-sheet__shape b").textContent = state.squad.formationLabel;
  document.querySelector(".sq-sheet__shape span").textContent = state.squad.formationStyle;

  document.querySelector(".sq-club__crest use").setAttribute("href", `#crest-${state.club.id}`);
  document.querySelector(".sq-club__name").textContent = state.club.name;
}

/* ----------------------------- Transfers ----------------------------------- */
export function renderTransfers(state) {
  const g = state.transfers.scoutedGroup;
  document.querySelector(".tr-striker__title").textContent = g.title;
  document.querySelector(".tr-striker__tags").textContent = g.tags;
  const counts = document.querySelectorAll(".tr-striker__top .counts .c");
  counts[0].innerHTML = `<span class="pip green">+</span> ${g.newCount} New`;
  counts[1].innerHTML = `<span class="pip blue">i</span> ${g.updateCount} Updates`;
  document.querySelector(".tr-striker .pcards").innerHTML = g.players.map((p) => (
    `<div class="pcard">` +
      `<span class="avatar"></span>` +
      `<div class="meta"><div class="nm">${p.name}</div><div class="pos">${p.pos} ${flagSpan(p.flag)}</div></div>` +
      `<svg class="crest club-crest"><use href="#${p.clubCrest}"></use></svg>` +
    `</div>`
  )).join("");

  // M6: real numbers — remaining transfer budget (spent by engine/
  // contracts.js's renewal fees, reset every rollover) and remaining weekly
  // wage headroom (the club's wage ceiling minus the squad's current wage
  // bill, so renewing a contract at a higher wage visibly eats into it).
  const finLines = document.querySelectorAll(".tr-fin .fin-line b");
  finLines[0].textContent = money(state.finances.transferBudget);
  finLines[1].textContent = money(state.finances.wageCeiling - squadWageBill(state.squad.roster));
}

/* ----------------------------- Office -------------------------------------- */
/** The Office inbox tile used to always render the M0 "NO ITEMS AVAILABLE"
 * empty state (static markup, not state-driven at all). Now that day-1
 * board objective emails always exist (engine/objectives.js), it shows a
 * real unread-count + latest-subject preview instead. */
export function renderOffice(state) {
  const body = document.getElementById("of-inbox-body");
  const emails = state.inbox.emails;
  if (!emails.length) {
    body.innerHTML =
      `<div class="empty">` +
        `<svg class="icon"><use href="#ic-envelope"></use></svg>` +
        `<span class="lbl">NO ITEMS AVAILABLE</span>` +
      `</div>`;
    return;
  }
  const unread = emails.filter((e) => !e.read).length;
  const latest = emails[0];
  body.innerHTML =
    `<div class="of-inbox__preview">` +
      `<div class="of-inbox__count">${unread}</div>` +
      `<div class="of-inbox__latest">` +
        `<div class="of-inbox__from">${latest.from}</div>` +
        `<div class="of-inbox__subj">${latest.subject}</div>` +
      `</div>` +
    `</div>`;
}

/* ----------------------------- Season -------------------------------------- */
/** Real domestic-cup status for the user's club (M5, engine/comps/cup.js) —
 * replaces the old hand-authored "F.A. Cup — Round 2" stub. Always returns
 * exactly 2 team rows (the tile's markup has exactly 2 `.trow` elements):
 * the user's own club, and whatever's most relevant for the second row
 * (next/last opponent, "TBD" while a round hasn't been drawn yet, or a
 * "Champions!" flourish). */
function cupTileData(state) {
  const cup = domesticCupFor(state.league, state.staticData.cups);
  const selfRow = { crest: `crest-${state.club.id}`, name: state.club.shortName };
  if (!cup) return { name: "—", round: "—", teams: [selfRow, { crest: selfRow.crest, name: "—" }] };

  const runtime = state.cups.get(cup.id);
  const status = cupStatusForClub(runtime, state.club.id);
  const opponent = status.opponentClubId ? state.clubsById.get(status.opponentClubId) : null;
  const secondRow = opponent
    ? { crest: `crest-${opponent.id}`, name: opponent.shortName }
    : { crest: selfRow.crest, name: status.roundLabel === "Champions" ? "Champions!" : "TBD" };

  return { name: cup.name, round: status.roundLabel, teams: [selfRow, secondRow] };
}

export function renderSeason(state) {
  const cup = cupTileData(state);
  document.querySelector(".se-tables .cup").textContent = cup.name;
  document.querySelector(".se-tables .round").textContent = cup.round;
  const trows = document.querySelectorAll(".se-tables .trow");
  cup.teams.forEach((t, i) => {
    trows[i].innerHTML = `<svg class="crest crest--sm"><use href="#${t.crest}"></use></svg> ${t.name}`;
  });

  // Real upcoming fixtures (fable-plans/plan1.md M3): no results exist until
  // sim/quick.js (M4), so the date stands in for a scoreline.
  document.querySelector(".se-fixtures").querySelectorAll(".fx").forEach((el) => el.remove());
  const fixtures = upcomingFixtures(state.fixtures, state.club.id, state.calendar.today, 3);
  const fixturesHtml = fixtures.map((f) => (
    `<div class="fx">` +
      `<svg class="crest crest--sm"><use href="#crest-${f.homeClubId}"></use></svg>` +
      `<span class="score">${dateDayMonth(f.date)}</span>` +
      `<svg class="crest crest--sm"><use href="#crest-${f.awayClubId}"></use></svg>` +
    `</div>`
  )).join("");
  document.querySelector(".se-fixtures .panel-title").insertAdjacentHTML("afterend", fixturesHtml);
}

/* ----------------------------- Email overlay -------------------------------- */
export function renderEmailList(state) {
  const list = document.getElementById("email-list");
  list.innerHTML = state.inbox.emails.map((e, i) => {
    const sel = i === state.ui.emailSelectedIndex ? " is-sel" : "";
    const icon = e.read ? "ic-envelope-open" : "ic-envelope";
    return (
      `<div class="email-row${sel}" data-email="${i}">` +
        `<svg class="icon"><use href="#${icon}"></use></svg>` +
        `<div><div class="er-from">${e.from}</div><div class="er-subj">${e.subject}</div></div>` +
        `<div class="er-date">${dateSlash(e.date)}</div>` +
      `</div>`
    );
  }).join("");

  const unread = state.inbox.emails.filter((e) => !e.read).length;
  const badge = document.querySelector(".email-tab.is-active .badge");
  if (badge) badge.textContent = unread;
}

/** M7: emails carrying an `action` field (currently only
 * `{type:'transfer-bid', bidId, ...}`, engine/transferai.js's incoming CPU
 * bids on a listed player) render as a real YES/NO decision — the screens
 * table's "Inbox ... YES/NO decision emails" note, first given real content
 * here. Cleared (`email.action = null`) once acted on, so a re-render of the
 * same email afterward just shows plain read mail. */
function renderEmailActions(d) {
  const el = document.getElementById("email-actions");
  if (!d.action) { el.hidden = true; el.innerHTML = ""; return; }
  el.hidden = false;
  if (d.action.type === "transfer-bid") {
    el.innerHTML =
      `<button type="button" class="email-action-btn email-action-btn--yes" data-action="accept-bid" data-bid="${d.action.bidId}">Accept Bid</button>` +
      `<button type="button" class="email-action-btn email-action-btn--no" data-action="reject-bid" data-bid="${d.action.bidId}">Reject Bid</button>`;
  }
}

export function renderEmailDetail(state) {
  const d = state.inbox.emails[state.ui.emailSelectedIndex];
  if (!d) return;
  document.querySelector("#email-read .crest use").setAttribute("href", `#${d.crest}`);
  const meta = document.querySelectorAll(".email-meta > div");
  meta[0].innerHTML = `<span class="k">Date</span> ${dateSlash(d.date)}`;
  meta[1].innerHTML = `<span class="k">From</span> ${d.from}`;
  meta[2].innerHTML = `<span class="k">To</span> ${d.to}`;
  meta[3].innerHTML = `<span class="k">Cc</span> ${d.cc}`;
  meta[4].innerHTML = `<span class="k">Subject</span> ${d.subject}`;
  document.querySelector(".email-text").innerHTML = d.body.map((p) => `<p>${p}</p>`).join("");
  renderEmailActions(d);
}

/* ----------------------------- News overlay --------------------------------- */
export function renderNewsCategoryTabs(state) {
  document.querySelectorAll(".news-tab").forEach((t) => {
    t.classList.toggle("is-active", t.dataset.cat === state.ui.newsCategory);
  });
}

export function renderNewsDetail(article) {
  document.getElementById("news-head").textContent = article.head;
  document.getElementById("news-text").innerHTML = article.body.map((p) => `<p>${p}</p>`).join("");
  document.getElementById("news-hero-crest").querySelector("use").setAttribute("href", `#${article.crest || "crest-c"}`);
  document.getElementById("news-text").scrollTop = 0;
}

export function renderNewsList(state) {
  const cat = state.ui.newsCategory;
  const list = state.news[cat] || [];
  const selIdx = state.ui.newsSelectedIndex[cat] || 0;
  const listEl = document.getElementById("news-list");
  listEl.innerHTML = list.map((a, i) => {
    const accent = a.isNew ? "gold" : (a.accent || "blue");
    const sel = i === selIdx ? " is-sel" : "";
    const meta = a.isNew ? `<span class="nic__new">NEW!</span>` : (a.date || "");
    return (
      `<div class="nic nic--${accent}${sel}" data-idx="${i}">` +
        `<div class="nic__title">${a.title}</div>` +
        `<div class="nic__meta">${meta}</div>` +
      `</div>`
    );
  }).join("");
  listEl.scrollTop = 0;
  if (list[selIdx]) renderNewsDetail(list[selIdx]);
}

/* ----------------------------- Everything ------------------------------------ */
export function renderAll(state) {
  renderHeader(state);
  renderCentral(state);
  renderSquad(state);
  renderTransfers(state);
  renderOffice(state);
  renderSeason(state);
  renderEmailList(state);
  renderEmailDetail(state);
  renderNewsCategoryTabs(state);
  renderNewsList(state);
}
