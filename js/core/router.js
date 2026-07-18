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

import { SCREENS, teamSheetFocusableSlots } from "./store.js";
import {
  renderAll, renderCentral, renderSeason, renderOffice, renderTransfers, renderSquad,
  renderEmailTabs, renderEmailList, renderEmailDetail,
  renderNewsCategoryTabs, renderNewsList,
} from "../ui/render.js";
import { renderSquadList } from "../ui/squadlist.js";
import { renderPlayerBio } from "../ui/playerbio.js";
import { renderCalendar, initCalendarHeaders } from "../ui/calendarui.js";
import { renderMatchday, initMatchdayTicker } from "../ui/matchday.js";
import { renderJobsOverlay } from "../ui/jobsui.js";
import { renderNtJobsOverlay } from "../ui/ntjobsui.js";
import { renderNatlSquad } from "../ui/natlsquad.js";
import { renderContracts } from "../ui/contractsui.js";
import { renderSearch, renderNegotiation, renderSellList, renderRequestFunds } from "../ui/transfersui.js";
import { renderGtn } from "../ui/gtnui.js";
import { renderYouth } from "../ui/youthui.js";
import { renderMyCareer } from "../ui/mycareerui.js";
import { renderSquadReport, renderSquadRanking } from "../ui/squadreportui.js";
import { renderKitNumbers } from "../ui/kitnumbersui.js";
import { renderInjuryList } from "../ui/injurylistui.js";
import { renderTeamSheet } from "../ui/teamsheetui.js";
import { renderTeamStats, renderPlayerStats } from "../ui/statsui.js";
import { renderSettings } from "../ui/settingsui.js";
import { renderSaves } from "../ui/savesui.js";
import { injectClubCrestSymbols, injectClubKitSymbols } from "../gen/crest.js";
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
  const footerContracts = document.getElementById("footer-contracts");
  const contractsOverlay = document.getElementById("contracts-overlay");
  const ctListEl = document.getElementById("ct-list");
  const ctDetailEl = document.getElementById("ct-detail");
  const footerSearch = document.getElementById("footer-search");
  const searchOverlay = document.getElementById("search-overlay");
  const srFiltersEl = document.getElementById("sr-filters");
  const srResultsEl = document.getElementById("sr-results");
  const footerNegotiation = document.getElementById("footer-negotiation");
  const negotiationOverlay = document.getElementById("negotiation-overlay");
  const ngBodyEl = document.getElementById("ng-body");
  const footerSelllist = document.getElementById("footer-selllist");
  const selllistOverlay = document.getElementById("selllist-overlay");
  const sl2ListEl = document.getElementById("sl2-list");
  const sl2DetailEl = document.getElementById("sl2-detail");
  const footerRequestfunds = document.getElementById("footer-requestfunds");
  const requestfundsOverlay = document.getElementById("requestfunds-overlay");
  const rfBodyEl = document.getElementById("rf-body");
  const footerGtn = document.getElementById("footer-gtn");
  const gtnOverlay = document.getElementById("gtn-overlay");
  const gtnBodyEl = document.getElementById("gtn-body");
  const footerYouth = document.getElementById("footer-youth");
  const youthOverlay = document.getElementById("youth-overlay");
  const youthBodyEl = document.getElementById("youth-body");
  const footerNtjobs = document.getElementById("footer-ntjobs");
  const ntjobsOverlay = document.getElementById("ntjobs-overlay");
  const ntjobsBodyEl = document.getElementById("ntjobs-body");
  const footerNatlsquad = document.getElementById("footer-natlsquad");
  const natlsquadOverlay = document.getElementById("natlsquad-overlay");
  const natlsquadBodyEl = document.getElementById("natlsquad-body");
  const footerMycareer = document.getElementById("footer-mycareer");
  const mycareerOverlay = document.getElementById("mycareer-overlay");
  const footerSquadreport = document.getElementById("footer-squadreport");
  const squadreportOverlay = document.getElementById("squadreport-overlay");
  const sqrListEl = document.getElementById("sqr-list");
  const footerSquadranking = document.getElementById("footer-squadranking");
  const squadrankingOverlay = document.getElementById("squadranking-overlay");
  const footerKitnumbers = document.getElementById("footer-kitnumbers");
  const kitnumbersOverlay = document.getElementById("kitnumbers-overlay");
  // F2: delegated on the stable kitnumbers-body wrapper, not #kn-list —
  // ui/kitnumbersui.js now rebuilds that element (and everything else in the
  // panel) from scratch every render, same "dynamic content needs a stable
  // ancestor" reasoning as .sq-sheet's own delegation further down.
  const knBodyEl = document.getElementById("kitnumbers-body");
  const footerInjurylist = document.getElementById("footer-injurylist");
  const injurylistOverlay = document.getElementById("injurylist-overlay");
  const footerTeamsheet = document.getElementById("footer-teamsheet");
  const teamsheetOverlay = document.getElementById("teamsheet-overlay");
  const sqtsTabbarEl = document.getElementById("sqts-tabbar");
  const sqtsBodyEl = document.getElementById("sqts-body");
  const sqSheetEl = document.querySelector(".sq-sheet");
  const footerTeamstats = document.getElementById("footer-teamstats");
  const teamstatsOverlay = document.getElementById("teamstats-overlay");
  const tsBodyEl = document.getElementById("ts-body");
  const footerPlayerstats = document.getElementById("footer-playerstats");
  const playerstatsOverlay = document.getElementById("playerstats-overlay");
  const footerSettings = document.getElementById("footer-settings");
  const settingsOverlay = document.getElementById("settings-overlay");
  const settingsBodyEl = document.getElementById("settings-body");
  const savesOverlay = document.getElementById("saves-overlay");
  const footerSaves = document.getElementById("footer-saves");
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
    } else if (name === "contracts") {
      contractsOverlay.classList.toggle("is-active", open);
      footerContracts.hidden = !open;
      if (open) renderContracts(store.state);
    } else if (name === "search") {
      searchOverlay.classList.toggle("is-active", open);
      footerSearch.hidden = !open;
      if (open) renderSearch(store.state);
    } else if (name === "negotiation") {
      negotiationOverlay.classList.toggle("is-active", open);
      footerNegotiation.hidden = !open;
      if (open) renderNegotiation(store.state);
    } else if (name === "selllist") {
      selllistOverlay.classList.toggle("is-active", open);
      footerSelllist.hidden = !open;
      if (open) renderSellList(store.state);
    } else if (name === "requestfunds") {
      requestfundsOverlay.classList.toggle("is-active", open);
      footerRequestfunds.hidden = !open;
      if (open) renderRequestFunds(store.state);
    } else if (name === "gtn") {
      gtnOverlay.classList.toggle("is-active", open);
      footerGtn.hidden = !open;
      if (open) renderGtn(store.state);
    } else if (name === "youth") {
      youthOverlay.classList.toggle("is-active", open);
      footerYouth.hidden = !open;
      if (open) renderYouth(store.state);
    } else if (name === "ntjobs") {
      ntjobsOverlay.classList.toggle("is-active", open);
      footerNtjobs.hidden = !open;
      if (open) renderNtJobsOverlay(store.state);
    } else if (name === "natlsquad") {
      natlsquadOverlay.classList.toggle("is-active", open);
      footerNatlsquad.hidden = !open;
      if (open) renderNatlSquad(store.state);
      // Backing out: refresh the Squad screen's sq-natlsel tile so its
      // "N/23 selected" count reflects whatever was just toggled.
      else renderSquad(store.state);
    } else if (name === "mycareer") {
      mycareerOverlay.classList.toggle("is-active", open);
      footerMycareer.hidden = !open;
      if (open) renderMyCareer(store.state);
    } else if (name === "squadreport") {
      squadreportOverlay.classList.toggle("is-active", open);
      footerSquadreport.hidden = !open;
      if (open) renderSquadReport(store.state);
    } else if (name === "squadranking") {
      squadrankingOverlay.classList.toggle("is-active", open);
      footerSquadranking.hidden = !open;
      if (open) renderSquadRanking(store.state);
    } else if (name === "kitnumbers") {
      kitnumbersOverlay.classList.toggle("is-active", open);
      footerKitnumbers.hidden = !open;
      if (open) renderKitNumbers(store.state);
    } else if (name === "injurylist") {
      injurylistOverlay.classList.toggle("is-active", open);
      footerInjurylist.hidden = !open;
      if (open) renderInjuryList(store.state);
    } else if (name === "teamsheet") {
      teamsheetOverlay.classList.toggle("is-active", open);
      footerTeamsheet.hidden = !open;
      if (open) renderTeamSheet(store.state);
      // Backing out: swaps (or F2's formation/captaincy changes) made inside
      // Team Sheet must show up on the Squad hub tile's own pitch preview
      // (same "refresh the screen underneath on close" precedent as
      // natlsquad above).
      else renderSquad(store.state);
    } else if (name === "teamstats") {
      teamstatsOverlay.classList.toggle("is-active", open);
      footerTeamstats.hidden = !open;
      if (open) renderTeamStats(store.state);
    } else if (name === "playerstats") {
      playerstatsOverlay.classList.toggle("is-active", open);
      footerPlayerstats.hidden = !open;
      if (open) renderPlayerStats(store.state);
    } else if (name === "settings") {
      settingsOverlay.classList.toggle("is-active", open);
      footerSettings.hidden = !open;
      if (open) renderSettings(store.state);
    } else if (name === "saves") {
      // M11: unlike every other overlay, opening/closing/every button here
      // is wired in js/main.js's wireSaves() (the project's one db.js-
      // touching module — see core/db.js's own header) rather than in this
      // file — this branch only toggles visibility + renders whatever
      // js/main.js already fetched into state.ui.saves.slots.
      savesOverlay.classList.toggle("is-active", open);
      footerSaves.hidden = !open;
      if (open) renderSaves(store.state);
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
    renderTransfers(store.state); // M6: Finances tile changes on rollover ("budgets reset") and contract renewals
    // M10: the sq-natl tile's competition-status blurb can change as the
    // user's nation's qualifying/tournament phase progresses day to day.
    renderSquad(store.state);
    if (store.state.ui.overlay === "calendar") renderCalendar(store.state);
    // M7: a calendar advance can resolve a pending fee/contract/loan/approach
    // response or a CPU bid, any of which can change what these overlays
    // show even if the user isn't the one who triggered the resolution
    // (e.g. simply advancing past a due date).
    if (store.state.ui.overlay === "negotiation") renderNegotiation(store.state);
    if (store.state.ui.overlay === "selllist") renderSellList(store.state);
    if (store.state.ui.overlay === "requestfunds") renderRequestFunds(store.state);
    if (store.state.ui.overlay === "search") renderSearch(store.state);
    if (store.state.ui.overlay === "email") { renderEmailList(store.state); renderEmailDetail(store.state); }
    // M8: a mission's report/salary tick can land mid-advance same as the M7
    // cases above, and every screen's GTN preview tile needs the same
    // refresh growth/rollover already give Central/Season/Office/Transfers.
    if (store.state.ui.overlay === "gtn") renderGtn(store.state);
    // M9: ditto for the Youth Staff overlay — an assignment's monthly
    // report, a prospect's development/reveal tick, or a retirement
    // departure can all land mid-advance.
    if (store.state.ui.overlay === "youth") renderYouth(store.state);
    // M10: a rollover can refresh the NT job market (reputation threshold),
    // and advancing can resolve qualifying/tournament matchdays that change
    // the user's own nation's standing.
    if (store.state.ui.overlay === "ntjobs") renderNtJobsOverlay(store.state);
    if (store.state.ui.overlay === "natlsquad") renderNatlSquad(store.state);
  });
  store.on("contracts", () => renderContracts(store.state));
  store.on("search", () => renderSearch(store.state));
  store.on("negotiation", () => renderNegotiation(store.state));
  store.on("selllist", () => renderSellList(store.state));
  store.on("requestfunds", () => renderRequestFunds(store.state));
  store.on("gtn", () => renderGtn(store.state));
  store.on("youth", () => renderYouth(store.state));
  store.on("mycareer", () => renderMyCareer(store.state));
  store.on("squadreport", () => renderSquadReport(store.state));
  store.on("kitnumbers", () => renderKitNumbers(store.state));
  store.on("teamsheet", () => renderTeamSheet(store.state));
  store.on("teamstats", () => renderTeamStats(store.state));
  store.on("playerstats", () => renderPlayerStats(store.state));
  store.on("settings", () => renderSettings(store.state));
  store.on("saves", () => renderSaves(store.state));
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
    injectClubKitSymbols(store.state.league.table.map((r) => r.club));
    renderAll(store.state);
  });
  // M10: accepting an NT job needs the Squad screen's sq-natl/sq-natlsel
  // tiles refreshed (they don't otherwise get touched by anything in the
  // "advance" handler's own render list, since it never had a Squad reason
  // to before now).
  store.on("ntjobs:accepted", () => renderSquad(store.state));

  /* ----- DOM -> store wiring ---------------------------------------------- */
  tabs.forEach((t) => t.addEventListener("click", () => store.setScreen(t.dataset.screen)));

  const emailPrompt = Array.prototype.slice.call(footerMain.querySelectorAll(".prompt"))
    .filter((p) => /Email Inbox/i.test(p.textContent))[0];
  if (emailPrompt) {
    emailPrompt.style.cursor = "pointer";
    emailPrompt.addEventListener("click", () => store.openOverlay("email"));
  }
  // F0: Close Inbox / Delete Message / Archive Message — one delegated
  // data-action handler, same pattern as every other footer built since.
  footerEmail.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    if (el.dataset.action === "back") store.closeOverlay();
    else if (el.dataset.action === "delete") store.deleteSelectedEmail();
    else if (el.dataset.action === "archive") store.archiveSelectedEmail();
  });

  // F0: Emails / Player Conversations / Message Archive tabs.
  document.getElementById("email-tabs").addEventListener("click", (e) => {
    const tab = e.target.closest(".email-tab");
    if (tab) store.selectEmailTab(tab.dataset.tab);
  });
  store.on("email:tab", () => {
    renderEmailTabs(store.state);
    renderEmailList(store.state);
    renderEmailDetail(store.state);
  });

  // Delegated (not per-row) because render.js rebuilds #email-list's rows
  // from state on every render — per-row listeners would be destroyed with
  // the old nodes each time.
  document.getElementById("email-list").addEventListener("click", (e) => {
    const row = e.target.closest(".email-row");
    if (row) store.selectEmail(Number(row.dataset.email));
  });

  // M7: YES/NO decision emails (currently just incoming CPU transfer bids —
  // see ui/render.js's renderEmailActions) — Accept/Reject buttons rendered
  // into the open email's body.
  document.getElementById("email-actions").addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    if (el.dataset.action === "accept-bid") store.acceptIncomingBid(el.dataset.bid);
    else if (el.dataset.action === "reject-bid") store.rejectIncomingBid(el.dataset.bid);
    // M9: the youth-retirement-warning decision email (ui/render.js's
    // renderEmailActions) — Promote acts immediately; Let Him Go releases
    // him right away instead of waiting out the warning's own grace period.
    else if (el.dataset.action === "promote-youth") store.promoteFromYouthWarningEmail(el.dataset.prospect);
    else if (el.dataset.action === "release-youth") store.releaseFromYouthWarningEmail(el.dataset.prospect);
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
      else if (tile.dataset.open === "contracts") store.openContracts();
      else if (tile.dataset.open === "search") store.openTransferSearch();
      else if (tile.dataset.open === "selllist") store.openSellList();
      else if (tile.dataset.open === "requestfunds") store.openRequestFunds();
      else if (tile.dataset.open === "gtn") store.openGtn();
      else if (tile.dataset.open === "gtnreport") store.openGtnHubTile();
      else if (tile.dataset.open === "youth") store.openYouth();
      else if (tile.dataset.open === "ntjobs") store.openNtJobs();
      else if (tile.dataset.open === "natlsquad") store.openNatlSquad();
      else if (tile.dataset.open === "mycareer") store.openMyCareer();
      else if (tile.dataset.open === "squadreport") store.openSquadReport();
      else if (tile.dataset.open === "squadranking") store.openSquadRanking();
      else if (tile.dataset.open === "kitnumbers") store.openKitNumbers();
      // F2: Squad hub's Formations/Tactics/Player Roles carousel tile — each
      // page deep-links straight into that Team Sheet sub-tab (the standalone
      // M11 tactics overlay is retired, plan2-decisions.md F2) using
      // whichever sheet is already active (sheetIndex null = don't switch).
      else if (tile.dataset.open === "teamsheet") store.openTeamSheet(null, tile.dataset.teamsheetTab || "squad");
      else if (tile.dataset.open === "teamstats") store.openTeamStats();
      else if (tile.dataset.open === "playerstats") store.openPlayerStats();
      else if (tile.dataset.open === "settings") store.openSettings();
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

  // Browse NT Jobs overlay (M10): identical click-to-select/click-again-to-
  // apply flow as Browse Jobs above.
  ntjobsBodyEl.addEventListener("click", (e) => {
    const row = e.target.closest(".jb-row");
    if (!row) return;
    const idx = Number(row.dataset.idx);
    if (idx === store.state.ui.ntJobsSelectedIndex) store.applyForSelectedNtJob();
    else store.selectNtJobRow(idx);
  });
  footerNtjobs.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    if (el.dataset.action === "apply") store.applyForSelectedNtJob();
    else if (el.dataset.action === "back") store.closeOverlay();
  });

  // Natl Squad Selection overlay (M10): click a row to select it, click
  // again (or the footer's Toggle Squad prompt) to add/remove that player
  // from the 23-man squad.
  natlsquadBodyEl.addEventListener("click", (e) => {
    const row = e.target.closest(".sl-row");
    if (!row) return;
    const playerId = Number(row.dataset.player);
    if (playerId === store.state.ui.natlSquad.selectedPlayerId) store.toggleNatlSquadPlayer(playerId);
    else store.selectNatlSquadPlayer(playerId);
  });
  footerNatlsquad.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    if (el.dataset.action === "toggle") {
      const id = store.state.ui.natlSquad.selectedPlayerId;
      if (id != null) store.toggleNatlSquadPlayer(id);
    } else if (el.dataset.action === "back") store.closeOverlay();
  });

  // My Career (M11): 3-page overlay (Overview/Current Season/Past Seasons) —
  // footer Prev/Next Page cycles state.ui.myCareer.page, same L1/R1-cycle
  // pattern as the Calendar overlay's month nav above.
  footerMycareer.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    if (el.dataset.action === "prev-page") store.myCareerChangePage(-1);
    else if (el.dataset.action === "next-page") store.myCareerChangePage(1);
    else if (el.dataset.action === "back") store.closeOverlay();
  });

  // Squad Report (M11): click a roster row to select it (updates the card +
  // status/stats panel); click the Pos header (or the footer's Sort prompt)
  // to flip sort direction; footer's Player Bio opens the selected player's
  // bio nested on top (closeOverlay() backs out to Squad Report first, same
  // "nested overlay" pattern as Squad List -> Player Bio).
  sqrListEl.addEventListener("click", (e) => {
    if (e.target.closest("[data-action='sort']")) { store.toggleSquadReportSort(); return; }
    const row = e.target.closest(".sl-row");
    if (row) store.selectSquadReportPlayer(Number(row.dataset.player));
  });
  footerSquadreport.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    if (el.dataset.action === "sort") store.toggleSquadReportSort();
    else if (el.dataset.action === "bio") {
      const id = store.state.ui.squadReport.selectedPlayerId;
      if (id != null) store.openPlayerBio(id);
    } else if (el.dataset.action === "back") store.closeOverlay();
  });
  footerSquadranking.querySelector(".prompt").addEventListener("click", () => store.closeOverlay());

  // Kit Numbers (M11): click an unselected row to select it, click the
  // already-selected row again to enter edit mode (reveals ◄/► steppers);
  // stepper clicks are checked first since they're nested inside a row.
  knBodyEl.addEventListener("click", (e) => {
    const stepper = e.target.closest(".kn-stepper");
    if (stepper) { store.adjustKitNumber(stepper.dataset.action === "inc" ? 1 : -1); return; }
    const row = e.target.closest(".sl-row");
    if (row) store.selectOrEditKitNumberPlayer(Number(row.dataset.player));
  });
  footerKitnumbers.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    if (el.dataset.action === "select") {
      const id = store.state.ui.kitNumbers.selectedPlayerId;
      if (id != null) store.selectOrEditKitNumberPlayer(id);
    } else if (el.dataset.action === "back") store.closeOverlay();
  });

  // Injury List (F2, plan2.md): read-only fx-panel table, footer is just Back.
  footerInjurylist.addEventListener("click", (e) => {
    if (e.target.closest("[data-action='back']")) store.closeOverlay();
  });

  // F1 (fable-plans/plan2.md): Squad hub's team-sheet tile — delegated
  // (not the generic [data-open] sweep) because ui/render.js's
  // renderSheetCarousel regenerates .sq-sheet .cpages' children on every
  // render (dynamic 1-6 sheet count), which would orphan any listener
  // attached to those nodes directly; .sq-sheet itself is never replaced.
  sqSheetEl.addEventListener("click", (e) => {
    const createEl = e.target.closest('[data-action="create-team-sheet"]');
    if (createEl) { store.createTeamSheet(); return; }
    const pageEl = e.target.closest("[data-sheet-index]");
    if (pageEl) store.openTeamSheet(Number(pageEl.dataset.sheetIndex));
  });

  // F1/F2: SQUAD/FORMATIONS/TACTICS/ROLES sub-tab bar.
  sqtsTabbarEl.addEventListener("click", (e) => {
    const el = e.target.closest("[data-tab]");
    if (el) store.teamSheetSetTab(el.dataset.tab);
  });

  // F1: pitch jerseys + bench/reserve/suggested-subs cards + the drawer bar.
  // Hover moves focus only; a click both focuses *and* activates (A) in one
  // gesture — see core/store.js's teamSheetActivateSlot for why that's the
  // right mouse-equivalent of "move the cursor here, then press A".
  //
  // F1-fixes: this used to listen for "mouseover" (bubbles, unlike
  // mouseenter, so it works delegated against content ui/teamsheetui.js
  // rebuilds wholesale every render) — but the browser also *synthesizes* a
  // mouseover for whatever element ends up under a perfectly stationary
  // cursor whenever a re-render changes the DOM there (e.g. arming a
  // bench/reserve card minimizes the drawer, which can reveal a pitch
  // jersey at that same pixel underneath). That phantom event was silently
  // stealing focus away from the slot the user just armed, before they'd
  // moved the mouse at all. "mousemove" doesn't have that problem — unlike
  // mouseover/mouseout, it only ever fires from genuine pointer-device
  // movement, never synthesized by a layout change — so it can't be spoofed
  // by our own re-render. teamSheetFocus's existing sameSlot no-op guard
  // keeps this just as cheap under real, continuous mouse movement.
  //
  // F2: the same pitch preview shows on FORMATIONS' Instructions (browsing)
  // and Positioning states — mousemove there moves instrFocusIndex/
  // posFocusIndex instead of the SQUAD tab's own ts.focus.
  sqtsBodyEl.addEventListener("mousemove", (e) => {
    const ts = store.state.ui.teamSheet;
    const el = e.target.closest("[data-zone]");
    if (el) {
      if (ts.tab === "squad") { store.teamSheetFocus(el.dataset.zone, Number(el.dataset.index)); return; }
      if (ts.tab === "formations" && ts.customiseMode === "instructions" && ts.instrEditingIndex == null) {
        store.teamSheetInstrFocus(Number(el.dataset.index));
      } else if (ts.tab === "formations" && ts.customiseMode === "positioning" && !posDrag) {
        store.teamSheetPosFocus(Number(el.dataset.index));
      }
      return;
    }
    // F2-fixes: ROLES tab's SELECT PLAYER picker — hovering a roster row
    // drives its gold outline + the right pane's attribute panel, same
    // "hover moves the focus ring" convention as the pitch/drawer above.
    if (ts.tab === "roles" && ts.rolesPickerOpen) {
      const row = e.target.closest("[data-row-id]");
      if (row && row.dataset.rowId !== "") store.teamSheetRolesPickerFocus(Number(row.dataset.rowId));
    }
  });
  sqtsBodyEl.addEventListener("click", (e) => {
    const ts = store.state.ui.teamSheet;
    const slotEl = e.target.closest("[data-zone]");
    if (slotEl) {
      if (ts.tab === "squad") { store.teamSheetActivateSlot(slotEl.dataset.zone, Number(slotEl.dataset.index)); return; }
      if (ts.tab === "formations" && ts.customiseMode === "instructions" && ts.instrEditingIndex == null) {
        store.teamSheetInstrFocus(Number(slotEl.dataset.index));
        store.teamSheetInstrSelect();
      }
      return;
    }
    const drawerEl = e.target.closest('[data-action="toggle-drawer"]');
    if (drawerEl) { store.teamSheetToggleDrawer(); return; }
    // F1-fixes: the (RS) glyph pill was replaced with prev/next chevron
    // buttons (matching js/carousel.js's main-menu tile carousels) — each
    // gets its own data-action; clicking a dot directly still just advances
    // one page, same as before. F2's own single-player attribute panel
    // (Instructions browsing / Positioning) reuses the exact same markup.
    if (e.target.closest('[data-action="attrpage-prev"]')) { store.teamSheetChangeAttrPage(-1); return; }
    if (e.target.closest('[data-action="attrpage-next"]')) { store.teamSheetChangeAttrPage(1); return; }
    if (e.target.closest(".fx-attrpanel__pagedots .dots")) { store.teamSheetChangeAttrPage(1); return; }

    // F2: FORMATIONS tab.
    const fmCell = e.target.closest('[data-action="formations-cell"]');
    if (fmCell) { store.teamSheetFormationsFocus(Number(fmCell.dataset.index)); store.teamSheetFormationsSelect(); return; }
    if (e.target.closest('[data-action="customise-formation"]')) { store.teamSheetOpenCustomise(); return; }
    const menuCell = e.target.closest('[data-action="customise-menu-cell"]');
    if (menuCell) { store.teamSheetCustomiseMenuFocus(Number(menuCell.dataset.index)); store.teamSheetCustomiseMenuSelect(); return; }
    // F2-fixes: the ‹/› cycle buttons are *nested inside* the selected card's
    // own [data-action="instr-cat"] div, so e.target.closest("[data-action=
    // instr-cat]") also matches a click on either button (closest() walks up
    // through ancestors) — checking the more specific nested buttons first is
    // what makes a click actually reach teamSheetInstrCycleOption instead of
    // being swallowed by the category-focus branch below on every click.
    if (e.target.closest('[data-action="instr-cycle-prev"]')) { store.teamSheetInstrCycleOption(-1); return; }
    if (e.target.closest('[data-action="instr-cycle-next"]')) { store.teamSheetInstrCycleOption(1); return; }
    const catCell = e.target.closest('[data-action="instr-cat"]');
    if (catCell) { store.teamSheetInstrCategoryFocus(Number(catCell.dataset.index)); return; }
    if (e.target.closest('[data-action="instr-reset-all"]')) { store.teamSheetInstrResetAll(); return; }
    if (e.target.closest('[data-action="pos-reset"]')) { store.teamSheetPosReset(); return; }
    // "(Y) Change Role" (Positioning footer): pic-exact prompt, no pic shows
    // its target screen — intentional no-op (plan2-decisions.md F2), same
    // footing as the permanently-locked Edit Player tile.
    if (e.target.closest('[data-action="pos-change-role"]')) return;

    // F2: TACTICS tab.
    const tacCell = e.target.closest('[data-action="tactics-cell"]');
    if (tacCell) { store.teamSheetTacticsFocus(Number(tacCell.dataset.index)); store.teamSheetTacticsSelect(); return; }

    // F2: ROLES tab.
    const roleCell = e.target.closest('[data-action="roles-cell"]');
    if (roleCell) { store.teamSheetRolesFocus(Number(roleCell.dataset.index)); store.teamSheetRolesOpenPicker(); return; }
    const pickRow = ts.tab === "roles" && ts.rolesPickerOpen ? e.target.closest("[data-row-id]") : null;
    if (pickRow) store.teamSheetRolesPick(Number(pickRow.dataset.rowId));
  });

  // F2: Positioning's mouse-drag (plan2.md F2.2: "drag (mouse) / arrow-nudge
  // ... within a bounded zone ... ±8% x/y clamp"). mousedown on a jersey
  // starts tracking; document-level mousemove/mouseup (not scoped to
  // sqts-body) so a fast drag that briefly leaves the pitch under the cursor
  // doesn't drop the gesture. Deltas are converted to percentage-of-pitch
  // (matching the jerseys' own left/top:%) via the pitch element's own
  // bounding rect (data-role="pos-pitch" — ui/formationsui.js's own marker).
  let posDrag = null;
  sqtsBodyEl.addEventListener("mousedown", (e) => {
    const ts = store.state.ui.teamSheet;
    if (ts.tab !== "formations" || ts.customiseMode !== "positioning") return;
    const jerseyEl = e.target.closest('[data-zone="xi"]');
    if (!jerseyEl) return;
    const pitchEl = document.querySelector('[data-role="pos-pitch"] .sqts-pitch');
    if (!pitchEl) return;
    const rect = pitchEl.getBoundingClientRect();
    posDrag = { lastX: e.clientX, lastY: e.clientY, rectW: rect.width, rectH: rect.height };
    store.teamSheetPosFocus(Number(jerseyEl.dataset.index));
  });
  document.addEventListener("mousemove", (e) => {
    if (!posDrag) return;
    const dxPct = ((e.clientX - posDrag.lastX) / posDrag.rectW) * 100;
    const dyPct = ((e.clientY - posDrag.lastY) / posDrag.rectH) * 100;
    posDrag.lastX = e.clientX;
    posDrag.lastY = e.clientY;
    if (dxPct || dyPct) store.teamSheetPosNudge(dxPct, dyPct);
  });
  document.addEventListener("mouseup", () => { posDrag = null; });

  // F2-fixes: mouse-wheel scroll over the FORMATIONS grid — the pics show a
  // scrollbar (config/formations.js's own header note), but nothing wired an
  // actual wheel listener, and the window was hard-pinned to fixed 6-cell
  // pages besides. Store.teamSheetFormationsScroll moves the window only
  // (not the cursor), same as scrolling any list without changing selection.
  sqtsBodyEl.addEventListener("wheel", (e) => {
    const ts = store.state.ui.teamSheet;
    if (ts.tab !== "formations" || ts.customiseMode) return;
    if (!e.target.closest(".fm-grid-row")) return;
    e.preventDefault();
    store.teamSheetFormationsScroll(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  footerTeamsheet.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const ts = store.state.ui.teamSheet;
    switch (el.dataset.action) {
      case "back": store.teamSheetBack(); break;
      case "suggested-subs": store.teamSheetSuggestedSubs(); break;
      case "change-view": store.teamSheetChangeView(1); break;
      case "customise-formation": store.teamSheetOpenCustomise(); break;
      case "instr-reset-all": store.teamSheetInstrResetAll(); break;
      case "pos-reset": store.teamSheetPosReset(); break;
      case "pos-change-role": break; // see the sqtsBodyEl click handler's own note above
      case "select-player":
        if (ts.tab === "squad") store.teamSheetSelectPlayer();
        else if (ts.tab === "formations" && !ts.customiseMode) store.teamSheetFormationsSelect();
        else if (ts.tab === "formations" && ts.customiseMode === "menu") store.teamSheetCustomiseMenuSelect();
        else if (ts.tab === "formations" && ts.customiseMode === "instructions" && ts.instrEditingIndex == null) store.teamSheetInstrSelect();
        else if (ts.tab === "tactics") store.teamSheetTacticsSelect();
        else if (ts.tab === "roles" && !ts.rolesPickerOpen) store.teamSheetRolesOpenPicker();
        break;
    }
  });

  // Team Stats (M11): league nav buttons cycle the whole screen; a row in
  // the "select a team" list opens that club's individual stats table; a
  // row in the stats table itself opens Player Bio (nested, same "click a
  // row to drill in" convention as Squad List); Back returns to the select
  // list first, then closes the overlay (mirrors GTN/Youth's nested views).
  document.getElementById("ts-league-prev").addEventListener("click", () => store.teamStatsChangeLeague(-1));
  document.getElementById("ts-league-next").addEventListener("click", () => store.teamStatsChangeLeague(1));
  tsBodyEl.addEventListener("click", (e) => {
    const sortEl = e.target.closest("[data-action='sort']");
    if (sortEl) { store.toggleTeamStatsSort(); return; }
    const clubEl = e.target.closest("[data-action='select-club']");
    if (clubEl) { store.teamStatsSelectClub(clubEl.dataset.value); return; }
    const playerEl = e.target.closest("[data-action='view-player']");
    if (playerEl) store.openPlayerBio(Number(playerEl.dataset.value));
  });
  footerTeamstats.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    if (el.dataset.action === "sort") store.toggleTeamStatsSort();
    else if (el.dataset.action === "back") {
      if (store.state.ui.teamStats.view === "team") store.teamStatsBackToSelect();
      else store.closeOverlay();
    }
  });

  // Player Stats (M11): league + category nav buttons cycle the ranking table.
  document.getElementById("ps-league-prev").addEventListener("click", () => store.playerStatsChangeLeague(-1));
  document.getElementById("ps-league-next").addEventListener("click", () => store.playerStatsChangeLeague(1));
  document.getElementById("ps-category-prev").addEventListener("click", () => store.playerStatsChangeCategory(-1));
  document.getElementById("ps-category-next").addEventListener("click", () => store.playerStatsChangeCategory(1));
  footerPlayerstats.querySelector(".prompt").addEventListener("click", () => store.closeOverlay());

  // Settings (M11): each row's ‹/› steppers cycle that option; Autosave is a
  // plain on/off toggle.
  function handleSettingsAction(action, dir) {
    const cycle = (options, current, setter) => {
      const i = options.indexOf(current);
      setter(options[(i + dir + options.length) % options.length]);
    };
    switch (action) {
      case "cycle-difficulty": cycle(["easy", "normal", "hard"], store.state.settings.difficulty, (v) => store.setDifficulty(v)); break;
      case "cycle-currency": cycle(["GBP", "USD", "EUR"], store.state.settings.currency, (v) => store.setCurrency(v)); break;
      case "cycle-simdetail": cycle(["full", "key-events"], store.state.settings.simDetail, (v) => store.setSimDetail(v)); break;
      case "toggle-autosave": store.setAutosave(!store.state.settings.autosave); break;
    }
  }
  settingsBodyEl.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    handleSettingsAction(el.dataset.action, Number(el.dataset.dir || 1));
  });
  footerSettings.querySelector(".prompt").addEventListener("click", () => store.closeOverlay());

  // Contracts overlay (M6): click a squad row to select it; the detail
  // panel's stepper buttons and the footer's Send Offer/Suggested Terms
  // prompts share one data-action handler since both drive the exact same
  // store methods.
  ctListEl.addEventListener("click", (e) => {
    const row = e.target.closest(".ct-row");
    if (row) store.selectContractPlayer(Number(row.dataset.player));
  });
  function handleContractsAction(action) {
    switch (action) {
      case "wage-down": store.adjustContractOfferWage(-0.05); break;
      case "wage-up": store.adjustContractOfferWage(0.05); break;
      case "years-down": store.adjustContractOfferYears(-1); break;
      case "years-up": store.adjustContractOfferYears(1); break;
      case "suggest": store.suggestContractTerms(); break;
      case "offer": store.submitContractOffer(); break;
      case "back": store.closeOverlay(); break;
    }
  }
  ctDetailEl.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (el) handleContractsAction(el.dataset.action);
  });
  footerContracts.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (el) handleContractsAction(el.dataset.action);
  });

  // Search Players (M7): area-picker/stepper/toggle clicks in the filter
  // row, row selection in the results list, and the footer's Bid/Loan/
  // Approach (which of these three shows depends on the Free Agents Only
  // toggle — see ui/transfersui.js's renderSearchFooter).
  function handleSearchFilterAction(action, target) {
    const f = store.state.ui.transferSearch;
    switch (action) {
      case "set-area": store.setSearchFilter("area", target.dataset.value); break;
      case "minovr-down": store.setSearchFilter("minOverall", Math.max(0, f.minOverall - 5)); break;
      case "minovr-up": store.setSearchFilter("minOverall", Math.min(99, f.minOverall + 5)); break;
      case "maxvalue-down": store.setSearchFilter("maxValue", Math.max(0, f.maxValue - 1000000)); break;
      case "maxvalue-up": store.setSearchFilter("maxValue", f.maxValue + 1000000); break;
      case "toggle-freeagents": store.setSearchFilter("freeAgentsOnly", !f.freeAgentsOnly); break;
    }
  }
  srFiltersEl.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (el) handleSearchFilterAction(el.dataset.action, el);
  });
  srResultsEl.addEventListener("click", (e) => {
    const row = e.target.closest(".sr-row");
    if (row) store.selectSearchResult(Number(row.dataset.player));
  });
  function handleSearchFooterAction(action) {
    const f = store.state.ui.transferSearch;
    if (action === "back") { store.closeOverlay(); return; }
    if (f.selectedPlayerId == null) return;
    switch (action) {
      case "bid": store.startBid(f.selectedPlayerId); break;
      case "loan": store.startLoanBid(f.selectedPlayerId, "season"); break;
      case "approach": store.startFreeAgentApproach(f.selectedPlayerId); break;
    }
  }
  footerSearch.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (el) handleSearchFooterAction(el.dataset.action);
  });

  // Negotiation (M7): fee-talks/contract-talks steppers + submit/cancel —
  // one data-action handler shared by the body and footer, same pattern as
  // Contracts above.
  function handleNegotiationAction(action) {
    switch (action) {
      case "fee-down": store.negoAdjustFeeOffer(-0.05); break;
      case "fee-up": store.negoAdjustFeeOffer(0.05); break;
      case "wage-down": store.negoAdjustContractWage(-0.05); break;
      case "wage-up": store.negoAdjustContractWage(0.05); break;
      case "years-down": store.negoAdjustContractYears(-1); break;
      case "years-up": store.negoAdjustContractYears(1); break;
      case "role-down": store.negoCycleRole(-1); break;
      case "role-up": store.negoCycleRole(1); break;
      case "submit-fee": store.negoSubmitFeeOffer(); break;
      case "submit-contract": store.negoSubmitContractOffer(); break;
      case "back": store.closeNegotiation(); break;
    }
  }
  ngBodyEl.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (el) handleNegotiationAction(el.dataset.action);
  });
  footerNegotiation.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (el) handleNegotiationAction(el.dataset.action);
  });

  // Sell / Loan List (M7): click a squad row to select it; asking-price
  // stepper + List for Transfer/Loan/Remove Listing.
  sl2ListEl.addEventListener("click", (e) => {
    const row = e.target.closest(".sl2-row");
    if (row) store.selectSellListPlayer(Number(row.dataset.player));
  });
  function handleSellListAction(action) {
    switch (action) {
      case "price-down": store.adjustAskingPrice(-0.05); break;
      case "price-up": store.adjustAskingPrice(0.05); break;
      case "list-transfer": store.listPlayer("transfer"); break;
      case "list-loan": store.listPlayer("loan"); break;
      case "unlist": store.unlistPlayer(); break;
      case "back": store.closeOverlay(); break;
    }
  }
  sl2DetailEl.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (el) handleSellListAction(el.dataset.action);
  });
  footerSelllist.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (el) handleSellListAction(el.dataset.action);
  });

  // Request Funds (M7): amount stepper + Ask The Board / reallocate wage<->transfer.
  function handleRequestFundsAction(action) {
    switch (action) {
      case "amount-down": store.adjustRequestFundsAmount(-50000); break;
      case "amount-up": store.adjustRequestFundsAmount(50000); break;
      case "board": store.submitBoardFundsRequest(); break;
      case "wage-to-transfer": store.submitReallocateBudget("wageToTransfer"); break;
      case "transfer-to-wage": store.submitReallocateBudget("transferToWage"); break;
      case "back": store.closeOverlay(); break;
    }
  }
  rfBodyEl.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (el) handleRequestFundsAction(el.dataset.action);
  });
  footerRequestfunds.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (el) handleRequestFundsAction(el.dataset.action);
  });

  // Global Transfer Network (M8): one body element re-rendered per internal
  // view (hub/missionForm/report — see ui/gtnui.js's header), so wiring is
  // fully delegated (data-action, same rationale as the email list/Match Day
  // above) rather than per-element like Search/Contracts' static filter row.
  function handleGtnAction(action, target) {
    switch (action) {
      case "hire": store.gtnHireSelected(); break;
      case "sack": store.gtnSackSelected(); break;
      case "assign-mission": store.gtnOpenMissionForm(); break;
      case "view-report": store.openGtnMissionReport(target.dataset.mission); break;
      case "cancel-mission": store.gtnCancelMission(target.dataset.mission); break;
      case "set-area": store.gtnSetMissionArea(target.dataset.value); break;
      case "region-prev": store.gtnCycleMissionRegion(-1); break;
      case "region-next": store.gtnCycleMissionRegion(1); break;
      case "toggle-tag": store.gtnToggleMissionTag(target.dataset.value); break;
      case "minage-down": store.gtnAdjustMissionAge("minAge", -1); break;
      case "minage-up": store.gtnAdjustMissionAge("minAge", 1); break;
      case "maxage-down": store.gtnAdjustMissionAge("maxAge", -1); break;
      case "maxage-up": store.gtnAdjustMissionAge("maxAge", 1); break;
      case "maxvalue-down": store.gtnAdjustMissionValue(-500000); break;
      case "maxvalue-up": store.gtnAdjustMissionValue(500000); break;
      case "set-tier": store.gtnSetMissionTier(Number(target.dataset.value)); break;
      case "start-mission": store.gtnSubmitMission(); break;
      case "bid": if (store.state.ui.gtn.reportSelectedPlayerId != null) store.startBid(store.state.ui.gtn.reportSelectedPlayerId); break;
      case "loan": if (store.state.ui.gtn.reportSelectedPlayerId != null) store.startLoanBid(store.state.ui.gtn.reportSelectedPlayerId, "season"); break;
      case "next-mission": store.gtnCycleReportMission(1); break;
      case "back": store.gtnBack(); break;
    }
  }
  gtnBodyEl.addEventListener("click", (e) => {
    const row = e.target.closest(".gtn-row");
    if (row) { store.selectGtnRow(row.dataset.scout, row.dataset.pool === "1"); return; }
    const srRow = e.target.closest(".sr-row");
    if (srRow) { store.gtnSelectReportPlayer(Number(srRow.dataset.player)); return; }
    const el = e.target.closest("[data-action]");
    if (el) handleGtnAction(el.dataset.action, el);
  });
  footerGtn.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (el) handleGtnAction(el.dataset.action, el);
  });

  // Youth Staff (M9): same fully-delegated wiring as GTN above — one body
  // element re-rendered per internal view (hub/assignForm/squad).
  function handleYouthAction(action, target) {
    switch (action) {
      case "hire": store.youthHireSelected(); break;
      case "sack": store.youthSackSelected(); break;
      case "assign": store.youthOpenAssignForm(); break;
      case "recall": store.youthRecallSelected(); break;
      case "open-squad": store.openYouthSquad(); break;
      case "set-type": store.youthSetAssignType(target.dataset.value); break;
      case "nation-prev": store.youthCycleAssignNation(-1); break;
      case "nation-next": store.youthCycleAssignNation(1); break;
      case "set-tier": store.youthSetAssignTier(Number(target.dataset.value)); break;
      case "submit-assign": store.youthSubmitAssignment(); break;
      case "promote": store.promoteSelectedYouthPlayer(); break;
      case "release": store.releaseSelectedYouthPlayer(); break;
      case "back": store.youthBack(); break;
    }
  }
  youthBodyEl.addEventListener("click", (e) => {
    const row = e.target.closest(".gtn-row");
    if (row) { store.selectYouthRow(row.dataset.scout, row.dataset.pool === "1"); return; }
    const slRow = e.target.closest(".sl-row");
    if (slRow) { store.selectYouthSquadPlayer(Number(slRow.dataset.player)); return; }
    const el = e.target.closest("[data-action]");
    if (el) handleYouthAction(el.dataset.action, el);
  });
  footerYouth.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (el) handleYouthAction(el.dataset.action, el);
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
    if (store.state.ui.overlay === "ntjobs") {
      const n = store.state.ntJobMarket.vacancies.length;
      const idx = store.state.ui.ntJobsSelectedIndex;
      if (e.key === "ArrowDown") { store.selectNtJobRow(Math.min(n - 1, idx + 1)); return; }
      if (e.key === "ArrowUp") { store.selectNtJobRow(Math.max(0, idx - 1)); return; }
      if (e.key === "Enter") { store.applyForSelectedNtJob(); return; }
    }
    if (store.state.ui.overlay === "natlsquad" && store.state.nationalTeam) {
      const roster = store.state.players
        .filter((p) => p.nationId === store.state.nationalTeam.nationId)
        .sort((a, b) => b.overall - a.overall);
      const idx = roster.findIndex((p) => p.id === store.state.ui.natlSquad.selectedPlayerId);
      if (e.key === "ArrowDown" && roster.length) { store.selectNatlSquadPlayer(roster[Math.min(roster.length - 1, idx + 1)].id); return; }
      if (e.key === "ArrowUp" && roster.length) { store.selectNatlSquadPlayer(roster[Math.max(0, idx - 1)].id); return; }
      if (e.key === "Enter" && idx !== -1) { store.toggleNatlSquadPlayer(roster[idx].id); return; }
    }
    if (store.state.ui.overlay === "contracts") {
      const roster = [...store.state.squad.roster].sort((a, b) => a.contract.endYear - b.contract.endYear);
      const idx = roster.findIndex((p) => p.id === store.state.ui.contracts.selectedPlayerId);
      if (e.key === "ArrowDown" && roster.length) { store.selectContractPlayer(roster[Math.min(roster.length - 1, idx + 1)].id); return; }
      if (e.key === "ArrowUp" && roster.length) { store.selectContractPlayer(roster[Math.max(0, idx - 1)].id); return; }
      if (e.key === "Enter") { store.submitContractOffer(); return; }
    }
    // F1 (fable-plans/plan2.md): Team Sheet's SQUAD tab. LS/RS have no
    // keyboard equivalent yet in this codebase (only LB/RB/LT/RT do — see
    // §A4) — V (mnemonic: "view", plan2.md's own choice for Change View)
    // and R ("right stick", the attribute panel's own pager) are this
    // milestone's alternates, logged in plan2-decisions.md F1. Arrow keys
    // walk teamSheetFocusableSlots' flat list rather than the pitch's x/y
    // layout — good enough for "keyboard support exists", not pixel-precise
    // 2D navigation (full mouse support covers that; see §A4).
    if (store.state.ui.overlay === "teamsheet" && store.state.ui.teamSheet.tab === "squad") {
      const key = e.key;
      if (key === "v" || key === "V") { store.teamSheetChangeView(1); return; }
      if (key === "r" || key === "R") { store.teamSheetChangeAttrPage(1); return; }
      if (key === "y" || key === "Y") { store.teamSheetSuggestedSubs(); return; }
      if (key === "a" || key === "A" || key === "Enter") { store.teamSheetSelectPlayer(); return; }
      if (key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight") {
        const slots = teamSheetFocusableSlots(store.state);
        const focus = store.state.ui.teamSheet.focus;
        const idx = slots.findIndex((s) => s.zone === focus.zone && s.index === focus.index);
        const dir = (key === "ArrowUp" || key === "ArrowLeft") ? -1 : 1;
        const next = slots[((idx === -1 ? 0 : idx) + dir + slots.length) % slots.length];
        if (next) store.teamSheetFocus(next.zone, next.index);
        return;
      }
    }
    // F2 (plan2.md): FORMATIONS/TACTICS/ROLES tabs — same "keyboard support
    // exists, full mouse support covers pixel-precise 2D nav" footing as the
    // SQUAD tab block above. V/R keep their established meanings (Change
    // View / attribute-panel pager) wherever those prompts actually appear.
    if (store.state.ui.overlay === "teamsheet" && store.state.ui.teamSheet.tab === "formations") {
      const ts = store.state.ui.teamSheet;
      const key = e.key;
      if (ts.customiseMode === "menu") {
        if (key === "ArrowLeft") { store.teamSheetCustomiseMenuFocus(0); return; }
        if (key === "ArrowRight") { store.teamSheetCustomiseMenuFocus(1); return; }
        if (key === "Enter" || key === "a" || key === "A") { store.teamSheetCustomiseMenuSelect(); return; }
      } else if (ts.customiseMode === "instructions" && ts.instrEditingIndex != null) {
        if (key === "ArrowLeft") { store.teamSheetInstrCategoryFocus(Math.max(0, ts.instrCategoryIndex - 1)); return; }
        if (key === "ArrowRight") { store.teamSheetInstrCategoryFocus(ts.instrCategoryIndex + 1); return; }
        if (key === "r" || key === "R") { store.teamSheetInstrCycleOption(1); return; }
        if (key === "x" || key === "X") { store.teamSheetInstrResetAll(); return; }
      } else if (ts.customiseMode === "instructions") {
        if (key === "v" || key === "V") { store.teamSheetChangeView(1); return; }
        if (key === "r" || key === "R") { store.teamSheetChangeAttrPage(1); return; }
        if (key === "Enter" || key === "a" || key === "A") { store.teamSheetInstrSelect(); return; }
        if (key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight") {
          const dir = (key === "ArrowUp" || key === "ArrowLeft") ? -1 : 1;
          store.teamSheetInstrFocus((ts.instrFocusIndex + dir + 11) % 11);
          return;
        }
      } else if (ts.customiseMode === "positioning") {
        if (key === "v" || key === "V") { store.teamSheetChangeView(1); return; }
        if (key === "r" || key === "R") { store.teamSheetChangeAttrPage(1); return; }
        if (key === "x" || key === "X") { store.teamSheetPosReset(); return; }
        if (key === "Tab") { e.preventDefault(); store.teamSheetPosFocus((ts.posFocusIndex + (e.shiftKey ? -1 : 1) + 11) % 11); return; }
        if (key === "ArrowUp") { store.teamSheetPosNudge(0, -2); return; }
        if (key === "ArrowDown") { store.teamSheetPosNudge(0, 2); return; }
        if (key === "ArrowLeft") { store.teamSheetPosNudge(-2, 0); return; }
        if (key === "ArrowRight") { store.teamSheetPosNudge(2, 0); return; }
      } else {
        if (key === "Enter" || key === "a" || key === "A") { store.teamSheetFormationsSelect(); return; }
        if (key === "x" || key === "X") { store.teamSheetOpenCustomise(); return; }
        if (key === "ArrowUp") { store.teamSheetFormationsMove(-3); return; }
        if (key === "ArrowDown") { store.teamSheetFormationsMove(3); return; }
        if (key === "ArrowLeft") { store.teamSheetFormationsMove(-1); return; }
        if (key === "ArrowRight") { store.teamSheetFormationsMove(1); return; }
      }
    }
    if (store.state.ui.overlay === "teamsheet" && store.state.ui.teamSheet.tab === "tactics") {
      const ts = store.state.ui.teamSheet;
      if (e.key === "ArrowLeft") { store.teamSheetTacticsFocus((ts.tacticsCursor + 3) % 4); return; }
      if (e.key === "ArrowRight") { store.teamSheetTacticsFocus((ts.tacticsCursor + 1) % 4); return; }
      if (e.key === "Enter" || e.key === "a" || e.key === "A") { store.teamSheetTacticsSelect(); return; }
    }
    if (store.state.ui.overlay === "teamsheet" && store.state.ui.teamSheet.tab === "roles" && !store.state.ui.teamSheet.rolesPickerOpen) {
      const ts = store.state.ui.teamSheet;
      if (e.key === "ArrowLeft") { store.teamSheetRolesFocus((ts.rolesCursor + 5) % 6); return; }
      if (e.key === "ArrowRight") { store.teamSheetRolesFocus((ts.rolesCursor + 1) % 6); return; }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") { store.teamSheetRolesFocus((ts.rolesCursor + 3) % 6); return; }
      if (e.key === "Enter" || e.key === "a" || e.key === "A") { store.teamSheetRolesOpenPicker(); return; }
    }
    // F2-fixes: the SELECT PLAYER picker itself had no keyboard navigation
    // at all — same "keyboard support exists, full mouse covers pixel-
    // precise nav" footing as every other F2 tab, walking the roster in
    // whatever order ui/rolestacticsui.js's renderRolesPicker rendered it.
    if (store.state.ui.overlay === "teamsheet" && store.state.ui.teamSheet.tab === "roles" && store.state.ui.teamSheet.rolesPickerOpen) {
      const ts = store.state.ui.teamSheet;
      const roster = store.state.squad.roster;
      const idx = roster.findIndex((p) => p.id === ts.rolesPickerFocusId);
      if (e.key === "ArrowDown") { const n = roster[Math.min(roster.length - 1, idx + 1)]; if (n) store.teamSheetRolesPickerFocus(n.id); return; }
      if (e.key === "ArrowUp") { const n = roster[Math.max(0, idx - 1)]; if (n) store.teamSheetRolesPickerFocus(n.id); return; }
      if (e.key === "Enter" || e.key === "a" || e.key === "A") { if (ts.rolesPickerFocusId != null) store.teamSheetRolesPick(ts.rolesPickerFocusId); return; }
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
        // Negotiation: closeNegotiation() also clears state.transfers.negotiation
        // (see engine/negotiation.js's cancelNegotiation) — a plain
        // closeOverlay() would leave a stale in-flight deal behind.
        else if (store.state.ui.overlay === "negotiation") store.closeNegotiation();
        // Team Sheet: (B)/Esc steps back through its own nested modes
        // (suggested subs -> armed selection -> open drawer) before closing.
        else if (store.state.ui.overlay === "teamsheet") store.teamSheetBack();
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
