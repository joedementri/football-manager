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
  renderEmailSelection,
  renderNewsCategoryTabs, renderNewsList,
} from "../ui/render.js";
import { renderSquadList } from "../ui/squadlist.js";
import { renderPlayerBio } from "../ui/playerbio.js";

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
    }
    const anyOverlayOpen = !!store.state.ui.overlay;
    tabbar.style.display = anyOverlayOpen ? "none" : "";
    screens.forEach((s) => { s.style.display = anyOverlayOpen ? "none" : ""; });
    footerMain.hidden = anyOverlayOpen;
  }

  store.on("screen", applyScreen);
  store.on("overlay", applyOverlay);
  store.on("email:select", () => renderEmailSelection(store.state));
  store.on("news:category", () => {
    renderNewsCategoryTabs(store.state);
    renderNewsList(store.state);
  });
  store.on("news:select", () => renderNewsList(store.state));
  store.on("squadlist:sort", () => renderSquadList(store.state));
  store.on("squadlist:select", () => renderSquadList(store.state));

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
  document.querySelectorAll("[data-open]").forEach((tile) => {
    tile.addEventListener("click", () => store.openOverlay(tile.dataset.open));
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
    switch (e.key) {
      case "ArrowLeft": store.page(-1); break;
      case "ArrowRight": store.page(1); break;
      case "y": case "Y": case "e": case "E":
        if (!store.state.ui.overlay) store.openOverlay("email");
        break;
      case "b": case "B": case "Escape":
        if (store.state.ui.overlay) store.closeOverlay();
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
