/* navigation.js — tab switching, left/right paging, email overlay open/close */
(function () {
  "use strict";

  var SCREENS = ["central", "squad", "transfers", "office", "season"];

  /* ----- News page content (Central › News drill-down) -------------------- */
  var NEWS_DATA = {
    breaking: [
      { title: "Home Is Where The Contract Is For Thiago Silva", isNew: true, accent: "gold", crest: "crest-c",
        head: "Home Is Where The Contract Is For Thiago Silva",
        body: [
          "Thiago Silva has moved to scotch rumours suggesting he was leaving PSG by publicly declaring his commitment to the club.",
          "Speaking from the club's training ground, Thiago Silva said: “I am going nowhere. It's true that I have been unsettled and have found it quite difficult in a strange country.",
          "“But, this is all perfectly normal and the club have been fantastic in helping me through a difficult moment. I love PSG and I love the fans here and I have no intention of going anywhere else.”"
        ] },
      { title: "PSG Confirm Agüero Talks", date: "02/07/2015", accent: "blue", crest: "crest-c",
        head: "PSG Confirm Agüero Talks",
        body: [
          "Paris Saint-Germain have confirmed they are in talks to bring Sergio Agüero to the French capital in a deal that could shatter their transfer record.",
          "A club spokesperson admitted that informal discussions had taken place but stressed that no agreement was yet in place.",
          "“We never comment on the specifics of negotiations, but we will not hide our admiration for one of the finest strikers in world football,” the statement read."
        ] },
      { title: "One for the Future: Tim Eisfeld – Eint. Frankfurt", date: "30/06/2015", accent: "red", crest: "crest-b",
        head: "One For The Future: Tim Eisfeld",
        body: [
          "Eintracht Frankfurt believe they have unearthed one of the brightest talents in German football in teenage midfielder Tim Eisfeld.",
          "The youngster has impressed coaches with his vision and composure well beyond his years, drawing comparisons to some of the Bundesliga's established stars.",
          "Scouts from across Europe are understood to be monitoring his progress ahead of the new season."
        ] },
      { title: "Speculation Continues But No News On Thiago Silva", date: "16/06/2015", accent: "blue", crest: "crest-c",
        head: "Speculation Continues But No News On Thiago Silva",
        body: [
          "The rumour mill continues to churn over the future of Thiago Silva, with no official word emerging from the Parc des Princes.",
          "Several leading European clubs have been linked with the defender, though PSG remain adamant that he is not for sale.",
          "Supporters will be hoping for clarity before the transfer window slams shut."
        ] },
      { title: "Football League 2 Review: Portsmouth vs Southend United", date: "02/05/2015", accent: "grey", crest: "crest-pompey",
        head: "Football League 2 Review: Portsmouth vs Southend United",
        body: [
          "Portsmouth produced a battling performance at Fratton Park as they shared the spoils with Southend United in a closely fought encounter.",
          "Both sides created chances in an entertaining contest, but neither could find the breakthrough their efforts deserved.",
          "The point leaves Pompey searching for the consistency that will be needed to mount a promotion challenge this term."
        ] },
      { title: "Football League 2 Preview: Portsmouth vs Southend Unite…", date: "02/05/2015", accent: "blue", crest: "crest-pompey",
        head: "Football League 2 Preview: Portsmouth vs Southend United",
        body: [
          "Attention turns to Fratton Park as Portsmouth prepare to welcome Southend United in what promises to be a keenly contested fixture.",
          "The manager faces a number of selection dilemmas with several players pushing for a starting berth.",
          "A victory would provide the perfect platform as the side looks to climb the Football League 2 table."
        ] }
    ],
    world: [
      { title: "Champions League Final Set For Berlin", date: "10/06/2015", accent: "blue", crest: "crest-b",
        head: "Champions League Final Set For Berlin",
        body: [
          "European football's showpiece occasion will take place in Berlin as the Olympiastadion prepares to host the Champions League final.",
          "Organisers have promised a spectacle befitting the biggest match in club football, with fans travelling from across the continent.",
          "The two finalists will be determined over the coming weeks as the competition reaches its climax."
        ] },
      { title: "Record Spending Across Europe This Window", date: "08/06/2015", accent: "grey", crest: "crest-d",
        head: "Record Spending Across Europe This Window",
        body: [
          "The latest transfer window has seen record-breaking expenditure as Europe's elite clubs jostle to strengthen their squads.",
          "Analysts have warned that the relentless inflation in fees shows little sign of slowing.",
          "Smaller clubs, meanwhile, continue to benefit from the lucrative sale of their brightest prospects."
        ] },
      { title: "New Financial Fair Play Rules Confirmed", date: "01/06/2015", accent: "red", crest: "crest-a",
        head: "New Financial Fair Play Rules Confirmed",
        body: [
          "Football's governing body has confirmed a revised set of Financial Fair Play regulations designed to promote sustainability.",
          "Clubs will face tighter scrutiny of their spending relative to revenue, with sanctions for persistent breaches.",
          "The changes have been broadly welcomed, though some have questioned how rigorously they will be enforced."
        ] }
    ],
    club: [
      { title: "Accrington Face Difficult Season", date: "16/07/2014", accent: "blue", crest: "crest-d",
        head: "Accrington Face Difficult Season",
        body: [
          "Accrington Stanley have been tipped to endure a testing campaign as the pundits deliver their verdicts ahead of the new season.",
          "A modest budget and a small squad mean the side are widely expected to be battling at the wrong end of the table.",
          "However, the club's resilient spirit has confounded the doubters before, and few at the Crown Ground are writing them off just yet."
        ] },
      { title: "Portsmouth Confirm Pre-Season Friendlies", date: "12/07/2014", accent: "green", crest: "crest-pompey",
        head: "Portsmouth Confirm Pre-Season Friendlies",
        body: [
          "Portsmouth have finalised their pre-season schedule with a series of friendlies designed to sharpen the squad ahead of the campaign.",
          "The fixtures offer supporters an early chance to run the rule over the manager's summer recruits.",
          "Fitness and cohesion will be the priorities as the side builds towards the opening day."
        ] },
      { title: "Manager Backs Squad For Promotion Push", date: "09/07/2014", accent: "grey", crest: "crest-pompey",
        head: "Manager Backs Squad For Promotion Push",
        body: [
          "The Portsmouth manager has thrown his full support behind his players as the club sets its sights on promotion.",
          "Speaking to the local press, he insisted the squad has the quality and character to compete at the top of the division.",
          "“We have everything we need here. Now it is about belief and hard work,” he said."
        ] }
    ],
    transfer: [
      { title: "Digby Declines Move to Newport County", date: "14/07/2014", accent: "blue", crest: "crest-a",
        head: "Digby Declines Move To Newport County",
        body: [
          "Goalkeeper Paul Digby has turned down the opportunity to join Newport County, opting instead to fight for his place.",
          "The move would have offered regular first-team football, but the player is understood to be keen to prove himself at a higher level.",
          "His decision leaves Newport to revisit their list of summer targets."
        ] },
      { title: "LOSC Lille and Juventus in Llorente Talks", date: "13/07/2014", accent: "red", crest: "crest-b",
        head: "LOSC Lille And Juventus In Llorente Talks",
        body: [
          "Lille and Juventus are reported to be in discussions over the future of striker Fernando Llorente.",
          "The Spaniard has attracted interest from a number of clubs following an impressive run of form.",
          "A resolution is expected before the close of the window, with both parties keen to conclude matters swiftly."
        ] },
      { title: "Lane Seeks To Grasp Loan Chance", date: "11/07/2014", accent: "green", crest: "crest-c",
        head: "Lane Seeks To Grasp Loan Chance",
        body: [
          "Young forward Jack Lane is determined to make the most of his loan move as he looks to gain valuable first-team experience.",
          "The temporary switch represents an important step in the development of one of the club's most promising academy graduates.",
          "“This is a great opportunity and I intend to take it,” Lane said."
        ] }
    ],
    intl: [
      { title: "England Name Squad For Friendlies", date: "20/06/2015", accent: "blue", crest: "crest-a",
        head: "England Name Squad For Friendlies",
        body: [
          "The England manager has named his squad for the upcoming round of international friendlies.",
          "A blend of experienced internationals and exciting newcomers has been selected as preparations continue.",
          "The fixtures will provide a useful examination ahead of the qualifying campaign."
        ] },
      { title: "Copa America Reaches Knockout Stage", date: "18/06/2015", accent: "red", crest: "crest-b",
        head: "Copa America Reaches Knockout Stage",
        body: [
          "The Copa America has reached its knockout phase with the continent's giants still very much in contention.",
          "A series of dramatic group-stage encounters has set up a thrilling run to the final.",
          "Hosts and holders alike will fancy their chances of lifting the famous trophy."
        ] },
      { title: "World Cup Qualifying Draw Announced", date: "15/06/2015", accent: "grey", crest: "crest-c",
        head: "World Cup Qualifying Draw Announced",
        body: [
          "The draw for the next round of World Cup qualifying has been completed, pitting several heavyweight nations together.",
          "Fans have already begun to circle the standout fixtures on the calendar.",
          "The road to the finals promises plenty of drama over the months ahead."
        ] }
    ]
  };

  var tabbar, screens, tabs, footerMain, footerEmail, emailOverlay;
  var footerNews, newsOverlay, newsTabsEl, newsListEl, newsHeadEl, newsTextEl, newsHeroCrestEl;
  var selectPrompt;
  var current = "central";
  var emailOpen = false;
  var newsOpen = false;
  var newsCat = "breaking";
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
    if (emailOpen || newsOpen) return;
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

  /* ----- News page -------------------------------------------------------- */
  function renderNewsDetail(article) {
    newsHeadEl.textContent = article.head;
    newsTextEl.innerHTML = article.body.map(function (p) {
      return "<p>" + p + "</p>";
    }).join("");
    newsHeroCrestEl.querySelector("use").setAttribute("href", "#" + (article.crest || "crest-c"));
    newsTextEl.scrollTop = 0;
  }

  function selectNewsItem(idx) {
    var list = NEWS_DATA[newsCat] || [];
    if (!list[idx]) return;
    newsListEl.querySelectorAll(".nic").forEach(function (n) {
      n.classList.toggle("is-sel", n.dataset.idx === String(idx));
    });
    renderNewsDetail(list[idx]);
  }

  function renderNewsList() {
    var list = NEWS_DATA[newsCat] || [];
    newsListEl.innerHTML = list.map(function (a, i) {
      var accent = a.isNew ? "gold" : (a.accent || "blue");
      var sel = i === 0 ? " is-sel" : "";
      var meta = a.isNew
        ? '<span class="nic__new">NEW!</span>'
        : (a.date || "");
      return (
        '<div class="nic nic--' + accent + sel + '" data-idx="' + i + '">' +
          '<div class="nic__title">' + a.title + '</div>' +
          '<div class="nic__meta">' + meta + '</div>' +
        '</div>'
      );
    }).join("");

    newsListEl.querySelectorAll(".nic").forEach(function (n) {
      n.addEventListener("click", function () { selectNewsItem(Number(n.dataset.idx)); });
    });

    if (list[0]) renderNewsDetail(list[0]);
    newsListEl.scrollTop = 0;
  }

  function selectNewsCat(cat) {
    if (!NEWS_DATA[cat]) return;
    newsCat = cat;
    newsTabsEl.querySelectorAll(".news-tab").forEach(function (t) {
      t.classList.toggle("is-active", t.dataset.cat === cat);
    });
    renderNewsList();
  }

  function openNews() {
    if (newsOpen) return;
    if (emailOpen) closeEmail();
    newsOpen = true;
    lastScreen = current;
    selectNewsCat("breaking");
    newsOverlay.classList.add("is-active");
    tabbar.style.display = "none";
    screens.forEach(function (s) { s.style.display = "none"; });
    footerMain.hidden = true;
    footerNews.hidden = false;
  }

  function closeNews() {
    if (!newsOpen) return;
    newsOpen = false;
    newsOverlay.classList.remove("is-active");
    tabbar.style.display = "";
    screens.forEach(function (s) { s.style.display = ""; });
    footerMain.hidden = false;
    footerNews.hidden = true;
    showScreen(lastScreen);
  }

  function init() {
    tabbar = document.getElementById("tabbar");
    screens = Array.prototype.slice.call(document.querySelectorAll(".screen"));
    tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));
    footerMain = document.getElementById("footer-main");
    footerEmail = document.getElementById("footer-email");
    footerNews = document.getElementById("footer-news");
    emailOverlay = document.getElementById("email-overlay");
    newsOverlay = document.getElementById("news-overlay");
    newsTabsEl = document.getElementById("news-tabs");
    newsListEl = document.getElementById("news-list");
    newsHeadEl = document.getElementById("news-head");
    newsTextEl = document.getElementById("news-text");
    newsHeroCrestEl = document.getElementById("news-hero-crest");
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

    // Central tiles that drill into the News page
    document.querySelectorAll('[data-open="news"]').forEach(function (tile) {
      tile.addEventListener("click", openNews);
    });

    // News sub-category tabs
    newsTabsEl.querySelectorAll(".news-tab").forEach(function (t) {
      t.addEventListener("click", function () { selectNewsCat(t.dataset.cat); });
    });

    // News footer "Back" prompt closes the page
    var newsBack = Array.prototype.slice.call(
      footerNews.querySelectorAll(".prompt")
    ).filter(function (p) { return /Back/i.test(p.textContent); })[0];
    if (newsBack) {
      newsBack.style.cursor = "pointer";
      newsBack.addEventListener("click", closeNews);
    }

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
          else if (newsOpen) closeNews();
          break;
      }
    });

    // Optional deep-link: #squad, #season, #email, #news, ...
    var hash = (location.hash || "").replace("#", "").toLowerCase();
    if (hash === "email") {
      showScreen("central");
      openEmail();
    } else if (hash === "news") {
      showScreen("central");
      openNews();
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
