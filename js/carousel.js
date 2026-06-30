/* carousel.js — generic paged tile.
   Any element with [data-carousel] holds a .cpages > .cpage list. This builds
   a bottom-right control bar (prev arrow · dots · next arrow); one dot per page
   and the arrows page left/right. Dots are also clickable. */
(function () {
  "use strict";

  function build(root) {
    var wrap = root.querySelector(".cpages");
    if (!wrap) return;
    var pages = Array.prototype.slice.call(wrap.querySelectorAll(".cpage"));
    if (pages.length === 0) return;

    var idx = 0;
    for (var i = 0; i < pages.length; i++) {
      if (pages[i].classList.contains("is-active")) { idx = i; break; }
    }

    var bar = document.createElement("div");
    bar.className = "carousel-bar";

    var prev = document.createElement("button");
    prev.type = "button";
    prev.className = "cnav prev";
    prev.setAttribute("aria-label", "Previous");
    prev.innerHTML = "‹"; // ‹

    var dots = document.createElement("div");
    dots.className = "dots";

    var next = document.createElement("button");
    next.type = "button";
    next.className = "cnav next";
    next.setAttribute("aria-label", "Next");
    next.innerHTML = "›"; // ›

    var dotEls = pages.map(function (_, i) {
      var d = document.createElement("i");
      if (i === idx) d.className = "on";
      d.addEventListener("click", function (e) { e.stopPropagation(); go(i); });
      dots.appendChild(d);
      return d;
    });

    bar.appendChild(prev);
    bar.appendChild(dots);
    bar.appendChild(next);
    root.appendChild(bar);

    function render() {
      pages.forEach(function (p, i) { p.classList.toggle("is-active", i === idx); });
      dotEls.forEach(function (d, i) { d.classList.toggle("on", i === idx); });
    }
    function go(i) {
      idx = (i % pages.length + pages.length) % pages.length;
      render();
    }

    prev.addEventListener("click", function (e) { e.stopPropagation(); go(idx - 1); });
    next.addEventListener("click", function (e) { e.stopPropagation(); go(idx + 1); });

    // A single-page carousel needs no arrows (kept harmless if it occurs).
    if (pages.length < 2) {
      prev.style.display = "none";
      next.style.display = "none";
    }

    render();
  }

  function init() {
    Array.prototype.slice.call(document.querySelectorAll("[data-carousel]")).forEach(build);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
