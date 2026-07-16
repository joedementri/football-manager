// ui/playerbio.js — Player Bio: the 6-panel attribute layout (PAC/SHO/PAS/
// DRI/DEF/PHY) + info column (age/height/weight/foot/workrates/stars/value/
// wage/contract/form/morale + potential-band line) specified by the Player
// schema in fable-plans/plan1.md. Pure render-from-state; store.state.ui.
// bioPlayerId says which player, set by store.openPlayerBio().

import { ATTRIBUTE_GROUPS } from "../config/attributes.js";
import { positionInfo } from "../config/positions.js";
import { money, number } from "../core/format.js";

const ATTR_LABELS = {
  acceleration: "Acceleration", sprintSpeed: "Sprint Speed",
  positioning: "Positioning", finishing: "Finishing", shotPower: "Shot Power",
  longShots: "Long Shots", volleys: "Volleys", penalties: "Penalties",
  vision: "Vision", crossing: "Crossing", fkAccuracy: "FK Accuracy",
  shortPass: "Short Pass", longPass: "Long Pass", curve: "Curve",
  agility: "Agility", balance: "Balance", reactions: "Reactions",
  ballControl: "Ball Control", dribbling: "Dribbling", composure: "Composure",
  interceptions: "Interceptions", headingAcc: "Heading Acc.", marking: "Marking",
  standTackle: "Stand Tackle", slideTackle: "Slide Tackle",
  jumping: "Jumping", stamina: "Stamina", strength: "Strength", aggression: "Aggression",
};

function cmToFtIn(cm) {
  const totalIn = cm / 2.54;
  const ft = Math.floor(totalIn / 12);
  const inch = Math.round(totalIn % 12);
  return `${ft}'${inch}"`;
}

// Exported for reuse by ui/gtnui.js (M8's scout Experience/Judgment stars +
// a fully-scouted GTN find's potential-band line share this exact look).
export function stars(n) {
  return "&#9733;".repeat(n) + "&#9734;".repeat(5 - n);
}

/** plan1.md's potential-band table. */
export function potentialBand(player, seasonStartYear) {
  const youngWithUpside = player.age <= 23 && player.potential > player.overall;
  if (youngWithUpside) {
    if (player.potential >= 90) return "Has potential to be special";
    if (player.potential >= 85) return "An exciting prospect";
    if (player.potential >= 80) return "Showing great potential";
  }
  return `Joined club in ${player.joinedClubYear}`;
}

function categoryAvg(attrs, names) {
  return Math.round(names.reduce((s, n) => s + attrs[n], 0) / names.length);
}

function renderPanel(groupName, attrs) {
  const names = ATTRIBUTE_GROUPS[groupName];
  const avg = categoryAvg(attrs, names);
  const rows = names.map((n) => (
    `<div class="bio-attr-row"><span class="bio-attr-name">${ATTR_LABELS[n]}</span><span class="bio-attr-val">${attrs[n]}</span></div>`
  )).join("");
  return (
    `<div class="bio-panel">` +
      `<div class="bio-panel__head"><span class="bio-panel__label">${groupName}</span><span class="bio-panel__avg">${avg}</span></div>` +
      rows +
    `</div>`
  );
}

export function renderPlayerBio(state) {
  const container = document.getElementById("playerbio-body");
  const player = state.playersById.get(state.ui.bioPlayerId);
  if (!player) {
    container.innerHTML = "";
    return;
  }

  document.getElementById("bio-crumb-name").textContent = player.commonName;

  const info = positionInfo(player.position);
  const panels = ["PAC", "SHO", "PAS", "DRI", "DEF", "PHY"].map((g) => renderPanel(g, player.attrs)).join("");

  const infoRows = [
    ["Age", player.age],
    ["Height", `${player.heightCm}cm / ${cmToFtIn(player.heightCm)}`],
    ["Weight", `${player.weightKg}kg`],
    ["Foot", player.foot === "R" ? "Right" : "Left"],
    ["Work Rates", `${player.workRateAtt} / ${player.workRateDef}`],
    ["Weak Foot", stars(player.weakFoot)],
    ["Skill Moves", stars(player.skillMoves)],
    ["Value", money(player.value)],
    ["Wage", `${money(player.contract.wage)} / week`],
    ["Contract", `Until ${player.contract.endYear}`],
    ["Squad Role", player.contract.squadRole],
    ["Form", `${player.form} / 10`],
    ["Morale", `${player.morale} / 10`],
  ].map(([k, v]) => `<div class="bio-info-row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join("");

  container.innerHTML =
    `<div class="bio-identity">` +
      `<div class="bio-identity__top">` +
        `<span class="flag flag--lg" data-flag="${player.nationId}"></span>` +
        `<div class="bio-identity__name">` +
          `<div class="bio-name">${player.commonName}</div>` +
          `<div class="bio-sub">${info.label} &middot; ${player.firstName} ${player.lastName}</div>` +
        `</div>` +
        `<svg class="crest bio-identity__crest"><use href="#crest-${player.clubId}"></use></svg>` +
      `</div>` +
      `<div class="bio-ovr-row">` +
        `<div class="bio-ovr"><span class="bio-ovr__num">${player.overall}</span><span class="bio-ovr__lbl">OVR</span></div>` +
        `<div class="bio-ovr bio-ovr--pot"><span class="bio-ovr__num">${player.potential}</span><span class="bio-ovr__lbl">POT</span></div>` +
      `</div>` +
      `<div class="bio-potential-band">${potentialBand(player, state.seasonStartYear)}</div>` +
      `<div class="bio-info">${infoRows}</div>` +
    `</div>` +
    `<div class="bio-panels">${panels}</div>`;
}
