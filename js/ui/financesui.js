// ui/financesui.js — F4 (fable-plans/plan2.md): FINANCES / BUDGET ALLOCATION
// (ms_FINANCES_BUDGET_ALLOCATION.png). engine/finances.js owns the actual
// slider math (budgetSplitStepAmounts/budgetSplitPct/applyBudgetSplitStep) —
// this file only reads state.ui.budgetAllocation's draft (while modifying)
// or the live state.finances (otherwise) and renders. Not chasing this pic's
// own specific captured numbers (Starting Transfer Budget £2,300,000 etc. —
// that save's own history, not reproducible from data/clubs.json's
// baseTransferBudget) — see plan2-decisions.md F4, same "verify the formula,
// not the pixel" precedent as F2's team-medallion ratios.

import { money } from "../core/format.js";
import { squadWageBill } from "../engine/wage.js";
import { budgetSplitPct } from "../engine/finances.js";
import { fxPanel, fxIdentityHeader, actionPrompt, glyphPill } from "./panelkit.js";

export function renderFinances(state) {
  const body = document.getElementById("finances-body");
  const b = state.ui.budgetAllocation;
  const f = state.finances;
  const roster = state.squad.roster;
  const wageBill = squadWageBill(roster);

  const shownTransfer = b.modifying && b.draft ? b.draft.transferBudget : f.transferBudget;
  const shownWageCeiling = b.modifying && b.draft ? b.draft.wageCeiling : f.wageCeiling;
  const shownSurplus = shownWageCeiling - wageBill;
  const changeThisSeason = wageBill - (f.seasonStartWageBill || wageBill);
  const [transferPct, wagePct] = budgetSplitPct(shownTransfer, shownWageCeiling, roster);

  const bodyHtml =
    fxIdentityHeader({ crestHref: `#crest-${state.club.id}`, manager: state.manager.name }) +
    `<div class="ba-explain">` +
      `<div class="ba-explain__title">TRANSFER &amp; WAGE BUDGET</div>` +
      `<div class="ba-explain__sub">Use the slider to visualise &amp; modify your budget split</div>` +
    `</div>` +
    `<div class="ba-cols">` +
      `<div class="ba-col">` +
        `<div class="ba-col__head">Transfer Budget</div>` +
        `<div class="ba-row"><span class="k">Starting Transfer Budget:</span><span class="v">${money(f.seasonStartTransferBudget ?? f.transferBudget)}</span></div>` +
        `<div class="ba-row"><span class="k">Players Purchased:</span><span class="v ba-green">${money(f.seasonPurchases || 0)}</span></div>` +
        `<div class="ba-row"><span class="k">Remaining Transfer Budget:</span><span class="v">${money(f.transferBudget)}</span></div>` +
      `</div>` +
      `<div class="ba-col">` +
        `<div class="ba-col__head">Wage Budget</div>` +
        `<div class="ba-row"><span class="k">Weekly Wage Budget:</span><span class="v">${money(f.wageCeiling)}</span></div>` +
        `<div class="ba-row"><span class="k">Starting Weekly Wages:</span><span class="v ba-red">-${money(wageBill)}</span></div>` +
        `<div class="ba-row"><span class="k">Change This Season:</span><span class="v ${changeThisSeason > 0 ? "ba-red" : "ba-green"}">${changeThisSeason > 0 ? "+" : ""}${money(changeThisSeason)}</span></div>` +
        `<div class="ba-row"><span class="k">Surplus Weekly Budget:</span><span class="v">${money(f.wageCeiling - wageBill)}</span></div>` +
      `</div>` +
    `</div>` +
    `<div class="ba-slidersection">` +
      `<div class="ba-col__head">Budget Allocation Slider</div>` +
      `<div class="ba-sliderrow">` +
        `<div class="ba-sliderrow__side"><span class="k">New Transfer Budget:</span><span class="v">${money(shownTransfer)}</span></div>` +
        `<div class="ba-bar"><i class="ba-bar__transfer" style="width:${transferPct}%"></i><i class="ba-bar__wage" style="width:${wagePct}%"></i></div>` +
        `<div class="ba-sliderrow__side ba-sliderrow__side--right"><span class="k">New Wage Budget:</span><span class="v">${money(shownSurplus)}</span></div>` +
      `</div>` +
      `<div class="ba-splitlabel">Current Budget Split:<br><b>${transferPct}:${wagePct}</b></div>` +
    `</div>`;

  body.innerHTML = fxPanel({ title: "BUDGET ALLOCATION", bodyHtml, extraClass: "ba-panel" });

  const footer = document.getElementById("footer-finances");
  footer.innerHTML =
    actionPrompt("a", "accept", "Accept Allocation") +
    actionPrompt("b", "back", "Back") +
    `<span class="prompt" data-action="modify">${glyphPill("ls")} Modify Allocation</span>`;
}
