/* stage.js — scale the fixed 1280x720 stage to fit the window, preserving 16:9 */
(function () {
  "use strict";

  var STAGE_W = 1280;
  var STAGE_H = 720;

  var stage = null;

  function fit() {
    if (!stage) stage = document.getElementById("stage");
    if (!stage) return;

    var w = window.innerWidth;
    var h = window.innerHeight;

    // Largest uniform scale that keeps the whole stage visible (letterboxed).
    var scale = Math.min(w / STAGE_W, h / STAGE_H);

    stage.style.setProperty("--scale", scale.toFixed(4));
  }

  window.addEventListener("resize", fit, { passive: true });
  window.addEventListener("orientationchange", fit, { passive: true });
  document.addEventListener("DOMContentLoaded", fit);
  // Run once immediately in case DOM is already parsed.
  fit();

  // Expose for other modules if ever needed.
  window.__fitStage = fit;
})();
