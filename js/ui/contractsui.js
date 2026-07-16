// ui/contractsui.js — Office ▸ Contracts overlay: the squad's contract
// list (fable-plans/plan1.md M6: "Contracts (renew flow)") + a renewal
// negotiation panel for whichever player is selected. Pure render-from-
// state, same contract as every other ui/*.js module — mutations happen
// only via core/store.js's openContracts/selectContractPlayer/
// adjustContractOffer*/submitContractOffer (core/router.js wires the DOM
// events to those calls). The acceptance-chance readout below calls
// engine/contracts.js's pure computeAsk/acceptanceChance/renewalTierFor
// directly — safe from a UI module since neither mutates state, same as
// e.g. ui/playerbio.js computing cm->ft'in display math inline.

import { money, number } from "../core/format.js";
import { computeAsk, acceptanceChance, renewalTierFor } from "../engine/contracts.js";
import { NUM_DAYS_FOR_RUNNING_OUT_WARNING } from "../config/contract.js";

function urgencyIcon(player, seasonStartYear) {
  const yearsLeft = player.contract.endYear - seasonStartYear;
  if (yearsLeft <= 1) return `<svg class="icon ct-status--urgent"><use href="#ic-lock"></use></svg>`;
  return "";
}

function listRow(player, state, selectedId) {
  const sel = player.id === selectedId ? " is-sel" : "";
  const yearsLeft = player.contract.endYear - state.seasonStartYear;
  return (
    `<div class="ct-row${sel}" data-player="${player.id}">` +
      `<span class="ct-row__name">${player.commonName}</span>` +
      `<span class="ct-row__pos">${player.position}</span>` +
      `<span class="ct-row__age num">${player.age}</span>` +
      `<span class="ct-row__wage num">${money(player.contract.wage)}/w</span>` +
      `<span class="ct-row__years num">${yearsLeft}yr</span>` +
      `<span class="ct-row__role">${player.contract.squadRole}</span>` +
      `<span class="ct-row__status">${urgencyIcon(player, state.seasonStartYear)}</span>` +
    `</div>`
  );
}

function chanceLabel(chance) {
  if (chance >= 0.75) return { text: "Likely to accept", cls: "ok" };
  if (chance >= 0.4) return { text: "Might accept", cls: "mid" };
  return { text: "Unlikely to accept", cls: "bad" };
}

function renderDetail(state, player) {
  const panel = document.getElementById("ct-detail");
  if (!player) {
    panel.innerHTML = `<div class="empty"><span class="lbl">Select a player to open renewal talks</span></div>`;
    return;
  }

  const c = state.ui.contracts;
  const ask = computeAsk(player);
  const tier = renewalTierFor(player);
  const chance = acceptanceChance({ wage: c.offerWage, years: c.offerYears }, ask, tier);
  const chanceInfo = chanceLabel(chance);
  const yearsLeft = player.contract.endYear - state.seasonStartYear;
  const daysLeft = yearsLeft <= 2 ? Math.max(0, yearsLeft * 365) : null;

  const resultBanner = c.lastResult
    ? `<div class="ct-result ct-result--${c.lastResult}">` +
        (c.lastResult === "accepted"
          ? `${player.commonName} has signed a new deal!`
          : `${player.commonName} turned the offer down. Try again with better terms.`) +
      `</div>`
    : "";

  panel.innerHTML =
    `<div class="ct-detail__head">` +
      `<svg class="crest crest--sm"><use href="#crest-${player.clubId}"></use></svg>` +
      `<div class="ct-detail__name">${player.commonName}</div>` +
      `<div class="ct-detail__sub">${player.position} &middot; Age ${player.age} &middot; OVR ${player.overall}</div>` +
    `</div>` +
    `<div class="ct-facts">` +
      `<div class="ct-fact"><span class="k">Current Wage</span><span class="v">${money(player.contract.wage)} / week</span></div>` +
      `<div class="ct-fact"><span class="k">Contract</span><span class="v">${yearsLeft} year${yearsLeft === 1 ? "" : "s"} remaining</span></div>` +
      `<div class="ct-fact"><span class="k">Squad Role</span><span class="v">${player.contract.squadRole}</span></div>` +
      `<div class="ct-fact"><span class="k">Player's Ask</span><span class="v">${money(ask.wage)} / week</span></div>` +
    `</div>` +
    (daysLeft != null && daysLeft <= NUM_DAYS_FOR_RUNNING_OUT_WARNING
      ? `<div class="ct-warning">Contract expiring soon — act now or risk losing him for nothing.</div>` : "") +
    `<div class="ct-offer">` +
      `<div class="ct-offer__row">` +
        `<span class="ct-offer__label">Weekly Wage</span>` +
        `<button class="ct-stepper" type="button" data-action="wage-down">&minus;</button>` +
        `<span class="ct-offer__val">${money(c.offerWage)}</span>` +
        `<button class="ct-stepper" type="button" data-action="wage-up">+</button>` +
      `</div>` +
      `<div class="ct-offer__row">` +
        `<span class="ct-offer__label">Contract Length</span>` +
        `<button class="ct-stepper" type="button" data-action="years-down">&minus;</button>` +
        `<span class="ct-offer__val">${c.offerYears} yr${c.offerYears === 1 ? "" : "s"}</span>` +
        `<button class="ct-stepper" type="button" data-action="years-up">+</button>` +
      `</div>` +
    `</div>` +
    `<div class="ct-chance ct-chance--${chanceInfo.cls}">${chanceInfo.text} (${Math.round(chance * 100)}%)</div>` +
    `<div class="ct-actions">` +
      `<button class="ct-btn" type="button" data-action="suggest">Suggested Terms</button>` +
      `<button class="ct-btn ct-btn--primary" type="button" data-action="offer">Send Offer</button>` +
    `</div>` +
    resultBanner;
}

export function renderContracts(state) {
  const listEl = document.getElementById("ct-list");
  const roster = [...state.squad.roster].sort((a, b) => a.contract.endYear - b.contract.endYear);
  const selectedId = state.ui.contracts.selectedPlayerId;

  listEl.innerHTML =
    `<div class="ct-list__header">` +
      `<svg class="crest crest--sm"><use href="#crest-${state.club.id}"></use></svg>` +
      `<div class="ct-list__clubname">${state.club.name}</div>` +
      `<div class="ct-list__count">${number(roster.length)} players</div>` +
    `</div>` +
    `<div class="ct-list__rows">${roster.map((p) => listRow(p, state, selectedId)).join("")}</div>`;

  const player = selectedId != null ? state.playersById.get(selectedId) : null;
  renderDetail(state, player);
}
