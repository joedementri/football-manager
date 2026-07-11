// core/router.js — screen/overlay/footer-prompt wiring. Grown out of the old
// js/navigation.js: it now drives (and is driven by) core/store.js instead
// of owning state itself, so other modules can react to the same
// screen/overlay changes via store.on(...) later (ground rule: "no logic in
// UI files; all mutations via engine/store functions").
//
// Deep links: both formats are accepted (M0 plan-review decision) —
//   index.html#squad            (hash form, matches the architecture note)
//   index.html?screen=squad     (query-string form, matches the M0 checklist)
// Same for overlays: #email/#news or ?screen=email/?screen=news.

import { SCREENS } from "./store.js";
import {
  renderAll, renderCentral, renderSeason, renderOffice,
  renderEmailList, renderEmailDetail,
  renderNewsCategoryTabs, renderNewsList,
} from "../ui/render.js";
import { renderSquadList } from "../ui/squadlist.js";
import { renderPlayerBio } from "../ui/playerbio.js";
import { renderCalendar, initCalendarHeaders } from "../ui/calendarui.js";
import { renderMatchday, initMatchdayTicker } from "../ui/matchday.js";
import { renderJobsOverlay } from "../ui/jobsui.js";
import { injectClubCrestSymbols } from "../gen/crest.js";
import { fromEpochDay } from "./clock.js";

export function initRouter(store) {
  const tabbar = document.getElementById("tabbar");
  const screens = Array.prototype.slice.call(document.querySelectorAll(".screen"));
  const tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));
  const footerMain = document.getElementById("footer-main");
  const footerEmail = document.getElementById("footer-email");
  const footerNews = document.getElementById("footer-news");
  const footerSquadlist = document.getElementById("footer-squadlist");
  const footerPlayerbio = document.getElementById("footer-playerbio");
  const emailOverlay = document.getElementById("email-overlay");
  const newsOverlay = document.getElementById("news-overlay");
  const squadlistOverlay = document.getElementById("squadlist-overlay");
  const playerbioOverlay = document.getElementById("playerbio-overlay");
  const footerCalendar = document.getElementById("footer-calendar");
  const calendarOverlay = document.getElementById("calendar-overlay");
  const footerMatchday = document.getElementById("footer-matchday");
  const matchdayOverlay = document.getElementById("matchday-overlay");
  const mdBodyEl = document.getElementById("md-body");
  const footerJobs = document.getElementById("footer-jobs");
  const jobsOverlay = document.getElementById("jobs-overlay");
  const jobsBodyEl = document.getElementById("jobs-body");
  const newsTabsEl = document.getElementById("news-tabs");
  const newsListEl = document.getElementById("news-list");
  const squadlistBodyEl = document.getElementById("squadlist-body");
  const selectPrompt = document.querySelector('.prompt[data-prompt="select"]');

  /* ----- reflect store state onto the DOM -------------------------------- */
  function applyScreen(name) {
    screens.forEach((s) => s.classList.toggle("is-active", s.dataset.screen === name));
    tabs.forEach((t) => t.classList.toggle("is-active", t.dataset.screen === name));
    if (selectPrompt) selectPrompt.hidden = name === "central";
  }

  function applyOverlay({ name, open }) {
    if (name === "email") {
      emailOverlay.classList.toggle("is-active", open);
      footerEmail.hidden = !open;
    } else if (name === "news") {
      newsOverlay.classList.toggle("is-active", open);
      footerNews.hidden = !open;
    } else if (name === "squadlist") {
      squadlistOverlay.classList.toggle("is-active", open);
      footerSquadlist.hidden = !open;
      if (open) renderSquadList(store.state);
    } else if (name === "playerbio") {
      playerbioOverlay.classList.toggle("is-active", open);
      footerPlayerbio.hidden = !open;
      if (open) renderPlayerBio(store.state);
    } else if (name === "calendar") {
      calendarOverlay.classList.toggle("is-active", open);
      footerCalendar.hidden = !open;
      if (open) { initCalendarHeaders(); renderCalendar(store.state); }
    } else if (name === "matchday") {
      matchdayOverlay.classList.toggle("is-active", open);
      footerMatchday.hidden = !open;
      if (open) renderMatchday(store.state);
    } else if (name === "jobs") {
      jobsOverlay.classList.toggle("is-active", open);
      footerJobs.hidden = !open;
      if (open) renderJobsOverlay(store.state);
    }
    const anyOverlayOpen = !!store.state.ui.overlay;
    tabbar.style.display = anyOverlayOpen ? "none" : "";
    screens.forEach((s) => { s.style.display = anyOverlayOpen ? "none" : ""; });
    footerMain.hidden = anyOverlayOpen;
  }

  store.on("screen", applyScreen);
  store.on("overlay", applyOverlay);
  store.on("email:select", () => { renderEmailList(store.state); renderEmailDetail(store.state); });
  store.on("news:category", () => {
    renderNewsCategoryTabs(store.state);
    renderNewsList(store.state);
  });
  store.on("news:select", () => renderNewsList(store.state));
  store.on("squadlist:sort", () => renderSquadList(store.state));
  store.on("squadlist:select", () => renderSquadList(store.state));
  // Advancing the calendar (M3) repaints the day strip/table (Central) and
  // the upcoming-fixtures list (Season); the Calendar overlay too, on the
  // rare chance it's open while a click on a day-strip cell advances today.
  store.on("advance", () => {
    renderCentral(store.state);
    renderSeason(store.state);
    renderOffice(store.state); // M5: board-review/season-end/awards/sacking emails can land mid-advance
    if (store.state.ui.overlay === "calendar") renderCalendar(store.state);
  });
  store.on("calendar:view", () => renderCalendar(store.state));
  store.on("matchday", () => renderMatchday(store.state));
  initMatchdayTicker(store);
  store.on("jobs:select", () => renderJobsOverlay(store.state));
  // Accepting a job offer (M5) changes club/league/squad wholesale — a full
  // re-render (same as boot's startGame) is simplest and correct here,
  // rather than trying to enumerate every screen that might reference the
  // old club. New clubs' crests may never have been injected into the SVG
  // sprite (only the starting league's are, at boot — see gen/crest.js).
  store.on("jobs:accepted", () => {
    injectClubCrestSymbols(store.state.league.table.map((r) => r.club));
    renderAll(store.state);
  });

  /* ----- DOM -> store wiring ---------------------------------------------- */
  tabs.forEach((t) => t.addEventListener("click", () => store.setScreen(t.dataset.screen)));

  const emailPrompt = Array.prototype.slice.call(footerMain.querySelectorAll(".prompt"))
    .filter((p) => /Email Inbox/i.test(p.textContent))[0];
  if (emailPrompt) {
    emailPrompt.style.cursor = "pointer";
    emailPrompt.addEventListener("click", () => store.openOverlay("email"));
  }
  const closeEmailPrompt = footerEmail.querySelector(".prompt");
  if (closeEmailPrompt) {
    closeEmailPrompt.style.cursor = "pointer";
    closeEmailPrompt.addEventListener("click", () => store.closeOverlay());
  }

  // Delegated (not per-row) because render.js rebuilds #email-list's rows
  // from state on every render — per-row listeners would be destroyed with
  // the old nodes each time.
  document.getElementById("email-list").addEventListener("click", (e) => {
    const row = e.target.closest(".email-row");
    if (row) store.selectEmail(Number(row.dataset.email));
  });

  // Generic: any tile with data-open="<overlayName>" opens that overlay
  // (news, squadlist, ...) — matches store.openOverlay's signature directly.
  // "calendar"/"jobs" are the exceptions: each needs a bit of state reset
  // before opening (openCalendar() resets the month view; openBrowseJobs()
  // picks an initial selected row).
  document.querySelectorAll("[data-open]").forEach((tile) => {
    tile.addEventListener("click", () => {
      if (tile.dataset.open === "calendar") store.openCalendar();
      else if (tile.dataset.open === "jobs") store.openBrowseJobs();
      else store.openOverlay(tile.dataset.open);
    });
  });

  // Browse Jobs overlay (M5): click a vacancy row to select it (or click the
  // already-selected row / footer Apply to accept it on the spot — see
  // engine/jobs.js's header for this milestone's "apply == instant accept"
  // scope decision).
  jobsBodyEl.addEventListener("click", (e) => {
    const row = e.target.closest(".jb-row");
    if (!row) return;
    const idx = Number(row.dataset.idx);
    if (idx === store.state.ui.jobsSelectedIndex) store.applyForSelectedJob();
    else store.selectJobRow(idx);
  });
  footerJobs.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    if (el.dataset.action === "apply") store.applyForSelectedJob();
    else if (el.dataset.action === "back") store.closeOverlay();
  });

  // Central's Advance tile (fable-plans/plan1.md M3): clicking the "A
  // ADVANCE" header moves one day forward; clicking a specific day-strip
  // cell jumps straight to that date (halting early if a match day for the
  // user's club intervenes — see store.advanceToDate).
  const advanceHead = document.querySelector(".c-advance__top");
  if (advanceHead) {
    advanceHead.style.cursor = "pointer";
    advanceHead.addEventListener("click", () => store.advanceOneDay());
  }
  document.querySelector(".daystrip").addEventListener("click", (e) => {
    const dayEl = e.target.closest(".day");
    if (dayEl) store.advanceToDate(fromEpochDay(Number(dayEl.dataset.date)));
  });

  // Calendar overlay: month navigation (nav buttons + footer prompts + Back).
  document.getElementById("cal-prev-month").addEventListener("click", () => store.calendarChangeMonth(-1));
  document.getElementById("cal-next-month").addEventListener("click", () => store.calendarChangeMonth(1));
  footerCalendar.querySelectorAll(".prompt").forEach((p) => {
    p.style.cursor = "pointer";
    if (/Prev Month/i.test(p.textContent)) p.addEventListener("click", () => store.calendarChangeMonth(-1));
    else if (/Next Month/i.test(p.textContent)) p.addEventListener("click", () => store.calendarChangeMonth(1));
    else if (/Back/i.test(p.textContent)) p.addEventListener("click", () => store.closeOverlay());
  });

  // Match Day overlay (M4): both the body (pre-match/ticker/full-time/sub
  // picker) and its footer prompts are fully re-rendered per phase by
  // ui/matchday.js, so wiring is delegated (data-action) rather than
  // per-element, same rationale as the email list above.
  function handleMatchdayAction(action, target) {
    switch (action) {
      case "kickoff": case "toggle-play":
        store.state.matchday.playing ? store.matchdayPause() : store.matchdayPlay();
        break;
      case "cycle-speed":
        store.matchdaySetSpeed(store.state.matchday.speed >= 4 ? 1 : 4);
        break;
      case "instant": store.matchdaySimToEnd(); break;
      case "continue-second-half": store.matchdayContinueSecondHalf(); break;
      case "open-sub": store.matchdayOpenSubPicker(); break;
      case "cancel-sub": store.matchdayCancelSub(); break;
      case "pick-sub-in": store.matchdaySelectSubIn(Number(target.dataset.player)); break;
      case "confirm-sub-out": store.matchdaySubstitute(target.dataset.side, Number(target.dataset.player)); break;
      case "back": store.closeMatchday(); break;
    }
  }
  mdBodyEl.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (el) handleMatchdayAction(el.dataset.action, el);
  });
  footerMatchday.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (el) handleMatchdayAction(el.dataset.action, el);
  });

  newsTabsEl.querySelectorAll(".news-tab").forEach((t) => {
    t.addEventListener("click", () => store.selectNewsCategory(t.dataset.cat));
  });
  newsListEl.addEventListener("click", (e) => {
    const item = e.target.closest(".nic");
    if (item) store.selectNewsItem(Number(item.dataset.idx));
  });

  const newsBack = Array.prototype.slice.call(footerNews.querySelectorAll(".prompt"))
    .filter((p) => /Back/i.test(p.textContent))[0];
  if (newsBack) {
    newsBack.style.cursor = "pointer";
    newsBack.addEventListener("click", () => store.closeOverlay());
  }

  // Squad List: click a header to sort by that column; click the selected
  // row again (or press Enter/the footer prompt) to open its Player Bio.
  squadlistBodyEl.addEventListener("click", (e) => {
    const th = e.target.closest(".sl-th");
    if (th) {
      store.sortSquadList(th.dataset.sort);
      return;
    }
    const row = e.target.closest(".sl-row");
    if (!row) return;
    const idx = Number(row.dataset.idx);
    if (idx === store.state.ui.squadlist.selectedIndex) {
      store.openPlayerBio(Number(row.dataset.player));
    } else {
      store.selectSquadListRow(idx);
    }
  });

  footerSquadlist.querySelectorAll(".prompt").forEach((p) => {
    p.style.cursor = "pointer";
    if (/View Bio/i.test(p.textContent)) {
      p.addEventListener("click", () => {
        const row = squadlistBodyEl.querySelector(".sl-row.is-sel");
        if (row) store.openPlayerBio(Number(row.dataset.player));
      });
    } else if (/Back/i.test(p.textContent)) {
      p.addEventListener("click", () => store.closeOverlay());
    }
  });

  footerPlayerbio.querySelectorAll(".prompt").forEach((p) => {
    p.style.cursor = "pointer";
    p.addEventListener("click", () => store.closeOverlay());
  });

  document.addEventListener("keydown", (e) => {
    if (store.state.ui.overlay === "calendar") {
      if (e.key === "ArrowLeft") { store.calendarChangeMonth(-1); return; }
      if (e.key === "ArrowRight") { store.calendarChangeMonth(1); return; }
    }
    if (store.state.ui.overlay === "squadlist") {
      const roster = store.state.squad.roster;
      const s = store.state.ui.squadlist;
      if (e.key === "ArrowDown") { store.selectSquadListRow(Math.min(roster.length - 1, s.selectedIndex + 1)); return; }
      if (e.key === "ArrowUp") { store.selectSquadListRow(Math.max(0, s.selectedIndex - 1)); return; }
      if (e.key === "Enter") {
        const row = squadlistBodyEl.querySelector(".sl-row.is-sel");
        if (row) store.openPlayerBio(Number(row.dataset.player));
        return;
      }
    }
    if (store.state.ui.overlay === "jobs") {
      const n = store.state.jobMarket.vacancies.length;
      const idx = store.state.ui.jobsSelectedIndex;
      if (e.key === "ArrowDown") { store.selectJobRow(Math.min(n - 1, idx + 1)); return; }
      if (e.key === "ArrowUp") { store.selectJobRow(Math.max(0, idx - 1)); return; }
      if (e.key === "Enter") { store.applyForSelectedJob(); return; }
    }
    switch (e.key) {
      case "ArrowLeft": store.page(-1); break;
      case "ArrowRight": store.page(1); break;
      case "y": case "Y": case "e": case "E":
        if (!store.state.ui.overlay) store.openOverlay("email");
        break;
      case "b": case "B": case "Escape":
        // Match Day can't be dismissed mid-match (plan1.md: "Multi-day
        // advance stops at any event needing user input (match...)") —
        // closeMatchday() itself already no-ops unless finished, but a
        // plain closeOverlay() here would bypass that check entirely.
        if (store.state.ui.overlay === "matchday") store.closeMatchday();
        else if (store.state.ui.overlay) store.closeOverlay();
        break;
    }
  });

  /* ----- deep links: #screen / #email / #news, or ?screen=... ------------- */
  function resolveDeepLinkTarget() {
    const params = new URLSearchParams(location.search);
    const query = (params.get("screen") || "").toLowerCase();
    const hash = (location.hash || "").replace("#", "").toLowerCase();
    return query || hash;
  }

  const target = resolveDeepLinkTarget();
  if (target === "email") {
    store.setScreen("central");
    store.openOverlay("email");
  } else if (target === "news") {
    store.setScreen("central");
    store.openOverlay("news");
  } else if (SCREENS.indexOf(target) !== -1) {
    store.setScreen(target);
  } else {
    store.setScreen("central");
  }
}
