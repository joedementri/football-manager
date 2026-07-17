// ui/injurylistui.js — fable-plans/plan2.md F2.6: Squad hub's Injury List
// page. No reference pic exists for this exact screen (only its Squad-hub
// tile hover teaser) — §B1's fx-panel template + a plain roster table, per
// the plan's own "simple fx-panel table of current injuries (player, injury
// name, days remaining)" wording; [TUNED]/[JUDGMENT CALL], logged in
// plan2-decisions.md F2. Pure render-from-state; read-only (no mutators).

import { fxPanel, fxTable, posDot } from "./panelkit.js";
import { positionInfo } from "../config/positions.js";

export function renderInjuryList(state) {
  const injured = state.squad.roster.filter((p) => p.injury);
  const bodyHtml = injured.length
    ? fxTable({
        columns: [
          { key: "pos", label: "Pos" },
          { key: "name", label: "Player" },
          { key: "injury", label: "Injury" },
          { key: "days", label: "Days Remaining", numeric: true },
        ],
        rows: injured.map((p) => ({
          id: p.id,
          pos: p.position,
          area: positionInfo(p.position).area,
          name: p.commonName,
          // engine/fitness.js's rollInjury (F2) names every injury it rolls
          // going forward; a save with an in-progress injury from before F2
          // never got a name — fall back rather than showing "undefined".
          injury: p.injury.name || "Injury",
          days: p.injury.daysLeft,
        })),
        cellHtml: (col, row) => (col.key === "pos" ? `${posDot(row.area)}${row.pos}` : row[col.key]),
      })
    : `<div class="fm-empty">No Injuries</div>`;

  document.getElementById("injurylist-body").innerHTML = fxPanel({ title: "INJURY LIST", bodyHtml });
}
