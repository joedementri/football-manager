// carousel.js — generic paged tile.
// Any element with [data-carousel] holds a .cpages > .cpage list. This builds
// a bottom-right control bar (prev arrow · dots · next arrow); one dot per
// page and the arrows page left/right. Dots are also clickable.

function build(root) {
  const wrap = root.querySelector(".cpages");
  if (!wrap) return;
  const pages = Array.prototype.slice.call(wrap.querySelectorAll(".cpage"));
  if (pages.length === 0) return;

  let idx = 0;
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].classList.contains("is-active")) { idx = i; break; }
  }

  const bar = document.createElement("div");
  bar.className = "carousel-bar";

  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "cnav prev";
  prev.setAttribute("aria-label", "Previous");
  prev.innerHTML = "‹";

  const dots = document.createElement("div");
  dots.className = "dots";

  const next = document.createElement("button");
  next.type = "button";
  next.className = "cnav next";
  next.setAttribute("aria-label", "Next");
  next.innerHTML = "›";

  const dotEls = pages.map((_, i) => {
    const d = document.createElement("i");
    if (i === idx) d.className = "on";
    d.addEventListener("click", (e) => { e.stopPropagation(); go(i); });
    dots.appendChild(d);
    return d;
  });

  bar.appendChild(prev);
  bar.appendChild(dots);
  bar.appendChild(next);
  root.appendChild(bar);

  function render() {
    pages.forEach((p, i) => p.classList.toggle("is-active", i === idx));
    dotEls.forEach((d, i) => d.classList.toggle("on", i === idx));
  }
  function go(i) {
    idx = (i % pages.length + pages.length) % pages.length;
    render();
  }

  prev.addEventListener("click", (e) => { e.stopPropagation(); go(idx - 1); });
  next.addEventListener("click", (e) => { e.stopPropagation(); go(idx + 1); });

  // A single-page carousel needs no arrows (kept harmless if it occurs).
  if (pages.length < 2) {
    prev.style.display = "none";
    next.style.display = "none";
  }

  render();
}

export function initCarousels() {
  Array.prototype.slice.call(document.querySelectorAll("[data-carousel]")).forEach(build);
}

/** fable-plans/plan2.md F1: the Squad hub's team-sheet tile rebuilds its own
 * `.cpages` from state (dynamic 1-6 sheet count, unlike every other
 * carousel's static page list) — re-running build() would stack a second
 * nav bar on top of the first, so this removes the stale one first. Callers
 * (ui/render.js's renderSquad) call this instead of relying on the one-time
 * initCarousels() sweep. */
export function rebuildCarousel(root) {
  const stale = root.querySelector(":scope > .carousel-bar");
  if (stale) stale.remove();
  build(root);
}
