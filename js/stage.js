// stage.js — scale the fixed 1280x720 stage to fit the window, preserving 16:9

const STAGE_W = 1280;
const STAGE_H = 720;

let stage = null;

export function fitStage() {
  if (!stage) stage = document.getElementById("stage");
  if (!stage) return;

  const w = window.innerWidth;
  const h = window.innerHeight;

  // Largest uniform scale that keeps the whole stage visible (letterboxed).
  const scale = Math.min(w / STAGE_W, h / STAGE_H);

  stage.style.setProperty("--scale", scale.toFixed(4));
}

export function initStage() {
  window.addEventListener("resize", fitStage, { passive: true });
  window.addEventListener("orientationchange", fitStage, { passive: true });
  fitStage();
}
