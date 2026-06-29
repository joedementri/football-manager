/* navigation.js — tab switching, left/right paging, email overlay open/close */
(function () {
  "use strict";

  var SCREENS = ["central", "squad", "transfers", "office", "season"];

  var tabbar, screens, tabs, footerMain, footerEmail, emailOverlay;
  var selectPrompt;
  var current = "central";
  var emailOpen = false;
  var lastScreen = "central"; // screen to return to when closing the inbox

  function showScreen(name) {
    if (SCREENS.indexOf(name) === -1) return;
    current = name;

    screens.forEach(function (s) {
      s.classList.toggle("is-active", s.dataset.screen === name);
    });
    tabs.forEach(function (t) {
      t.classList.toggle("is-active", t.dataset.screen === name);
    });

    // Central screen has no "A Select" prompt in the reference.
    if (selectPrompt) selectPrompt.hidden = name === "central";
  }

  function page(dir) {
    if (emailOpen) return;
    var i = SCREENS.indexOf(current);
    i = (i + dir + SCREENS.length) % SCREENS.length;
    showScreen(SCREENS[i]);
  }

  function openEmail() {
    if (emailOpen) return;
    emailOpen = true;
    lastScreen = current;
    emailOverlay.classList.add("is-active");
    tabbar.style.display = "none";
    screens.forEach(function (s) { s.style.display = "none"; });
    footerMain.hidden = true;
    footerEmail.hidden = false;
  }

  function closeEmail() {
    if (!emailOpen) return;
    emailOpen = false;
    emailOverlay.classList.remove("is-active");
    tabbar.style.display = "";
    screens.forEach(function (s) { s.style.display = ""; });
    footerMain.hidden = false;
    footerEmail.hidden = true;
    showScreen(lastScreen);
  }

  function selectEmail(idx) {
    var rows = emailOverlay.querySelectorAll(".email-row");
    rows.forEach(function (r) {
      r.classList.toggle("is-sel", r.dataset.email === String(idx));
    });
    // (Reading-pane content is static in this prototype.)
  }

  function init() {
    tabbar = document.getElementById("tabbar");
    screens = Array.prototype.slice.call(document.querySelectorAll(".screen"));
    tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));
    footerMain = document.getElementById("footer-main");
    footerEmail = document.getElementById("footer-email");
    emailOverlay = document.getElementById("email-overlay");
    selectPrompt = document.querySelector('.prompt[data-prompt="select"]');

    // Tab clicks
    tabs.forEach(function (t) {
      t.addEventListener("click", function () { showScreen(t.dataset.screen); });
    });

    // Footer "Email Inbox" prompt opens the overlay; "Close Inbox" closes it.
    var emailPrompt = Array.prototype.slice.call(
      footerMain.querySelectorAll(".prompt")
    ).filter(function (p) { return /Email Inbox/i.test(p.textContent); })[0];
    if (emailPrompt) {
      emailPrompt.style.cursor = "pointer";
      emailPrompt.addEventListener("click", openEmail);
    }
    var closePrompt = footerEmail.querySelector(".prompt");
    if (closePrompt) {
      closePrompt.style.cursor = "pointer";
      closePrompt.addEventListener("click", closeEmail);
    }

    // Email list selection
    emailOverlay.querySelectorAll(".email-row").forEach(function (row) {
      row.addEventListener("click", function () { selectEmail(row.dataset.email); });
    });

    // Keyboard: arrows page screens; Y/E opens inbox; B/Esc closes it.
    document.addEventListener("keydown", function (e) {
      switch (e.key) {
        case "ArrowLeft":  page(-1); break;
        case "ArrowRight": page(1); break;
        case "y": case "Y": case "e": case "E":
          if (!emailOpen) openEmail();
          break;
        case "b": case "B": case "Escape":
          if (emailOpen) closeEmail();
          break;
      }
    });

    // Optional deep-link: #squad, #season, #email, ...
    var hash = (location.hash || "").replace("#", "").toLowerCase();
    if (hash === "email") {
      showScreen("central");
      openEmail();
    } else if (SCREENS.indexOf(hash) !== -1) {
      showScreen(hash);
    } else {
      showScreen("central");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
