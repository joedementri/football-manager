// ui/render.js — pure(-ish) DOM rendering from GameState. No game logic here:
// every function reads `state` and writes DOM. Mutations always happen in
// core/store.js; this module never calls a store mutator itself (see the
// "Notes for the implementing model" section of fable-plans/plan1.md).

import {
  dayOfWeekShort, dayOfMonth, monthYearShort,
  dateSlash, dateLong, number, money,
} from "../core/format.js";

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
function renderDayStrip(state) {
  const strip = document.querySelector(".daystrip");
  const todayTime = state.calendar.today.getTime();
  strip.innerHTML = state.calendar.strip.map((d) => {
    const isNow = d.getTime() === todayTime ? " is-now" : "";
    return (
      `<div class="day${isNow}">` +
        `<span class="dow">${dayOfWeekShort(d)}</span>` +
        `<span class="dom">${dayOfMonth(d)}</span>` +
        `<svg class="adv-ico"><use href="#ic-advance"></use></svg>` +
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

function renderCentralTable(state) {
  const tbody = document.querySelector(".c-tables .tbl tbody");
  tbody.innerHTML = state.central.table.rows.map((r) => (
    `<tr><td class="team"><span class="pos">${r.pos}</span>` +
      `<svg class="crest crest--xs"><use href="#${r.crest}"></use></svg> ${r.name}</td>` +
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

  const finLines = document.querySelectorAll(".tr-fin .fin-line b");
  finLines[0].textContent = money(state.transfers.finances.transferBudget);
  finLines[1].textContent = money(state.transfers.finances.wageBudget);
}

/* ----------------------------- Season -------------------------------------- */
export function renderSeason(state) {
  const cup = state.season.cup;
  document.querySelector(".se-tables .cup").textContent = cup.name;
  document.querySelector(".se-tables .round").textContent = cup.round;
  const trows = document.querySelectorAll(".se-tables .trow");
  cup.teams.forEach((t, i) => {
    trows[i].innerHTML = `<svg class="crest crest--sm"><use href="#${t.crest}"></use></svg> ${t.name}`;
  });

  document.querySelector(".se-fixtures").querySelectorAll(".fx").forEach((el) => el.remove());
  const fixturesHtml = state.season.fixtures.map((f) => (
    `<div class="fx">` +
      `<svg class="crest crest--sm"><use href="#${f.home}"></use></svg>` +
      `<span class="score">${f.score}</span>` +
      `<svg class="crest crest--sm"><use href="#${f.away}"></use></svg>` +
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

export function renderEmailSelection(state) {
  document.querySelectorAll("#email-list .email-row").forEach((row) => {
    row.classList.toggle("is-sel", row.dataset.email === String(state.ui.emailSelectedIndex));
  });
}

export function renderEmailDetail(state) {
  const d = state.inbox.detail;
  document.querySelector("#email-read .crest use").setAttribute("href", `#${d.crest}`);
  const meta = document.querySelectorAll(".email-meta > div");
  meta[0].innerHTML = `<span class="k">Date</span> ${dateSlash(d.date)}`;
  meta[1].innerHTML = `<span class="k">From</span> ${d.from}`;
  meta[2].innerHTML = `<span class="k">To</span> ${d.to}`;
  meta[3].innerHTML = `<span class="k">Cc</span> ${d.cc}`;
  meta[4].innerHTML = `<span class="k">Subject</span> ${d.subject}`;
  document.querySelector(".email-text").innerHTML = d.body.map((p) => `<p>${p}</p>`).join("");
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
  renderSeason(state);
  renderEmailList(state);
  renderEmailDetail(state);
  renderNewsCategoryTabs(state);
  renderNewsList(state);
}
