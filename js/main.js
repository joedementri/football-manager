// main.js — bootstrap entry point (ES module). Wires together the pieces
// that used to be three independent IIFEs (stage.js, carousel.js,
// navigation.js): create the GameState stub, render it, then wire up
// interaction (router) and the generic carousel widget.

import { Store, createInitialState } from "./core/store.js";
import { renderAll } from "./ui/render.js";
import { initRouter } from "./core/router.js";
import { initStage } from "./stage.js";
import { initCarousels } from "./carousel.js";

function init() {
  const store = new Store(createInitialState());

  renderAll(store.state);   // paint the GameState stub before wiring interaction
  initRouter(store);        // screen/overlay switching, footer prompts, deep links
  initCarousels();          // generic [data-carousel] tile paging
  initStage();               // fit the 1280x720 stage to the viewport

  // Exposed for manual verification in the console (dev convenience only —
  // no production code should depend on this global).
  window.__store = store;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
