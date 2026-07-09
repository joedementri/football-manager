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

export function initRouter(store) {
  const tabbar = document.getElementById("tabbar");
  const screens = Array.prototype.slice.call(document.querySelectorAll(".screen"));
  const tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));
  const footerMain = document.getElementById("footer-main");
  const footerEmail = document.getElementById("footer-email");
  const footerNews = document.getElementById("footer-news");
  const emailOverlay = document.getElementById("email-overlay");
  const newsOverlay = document.getElementById("news-overlay");
  const newsTabsEl = document.getElementById("news-tabs");
  const newsListEl = document.getElementById("news-list");
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

  document.querySelectorAll('[data-open="news"]').forEach((tile) => {
    tile.addEventListener("click", () => store.openOverlay("news"));
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

  document.addEventListener("keydown", (e) => {
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
