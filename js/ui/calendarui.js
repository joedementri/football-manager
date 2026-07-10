// ui/calendarui.js — Calendar overlay: the full month-view grid behind
// Season's gold "Calendar" tile (fable-plans/plan1.md M3: "calendar month
// view shows fixtures"). No REFERENCE_PICS screenshot covers the opened
// month view (only the closed tile's small preview icon), so this is
// authored fresh from the existing token set (breadcrumb, tile, gold
// accents), same convention bio.css documents for Player Bio. Pure
// render-from-state, per the project's UI contract — month navigation lives
// in store.state.ui.calendar and is mutated only via
// store.calendarChangeMonth()/openCalendar().

import { monthCells } from "../engine/calendar.js";
import { monthLong, dayOfMonth } from "../core/format.js";

const DOW_HEADER = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const EVENT_LABEL = {
  "window-open": "Window Opens",
  "window-close": "Deadline Day",
  "deadline-day": "Deadline Day",
  "growth": "Player Growth",
  "board-review": "Board Review",
  "intl-break": "International Break",
};

function eventBadges(events) {
  // dedupe: window-close and deadline-day always land on the same date
  const unique = [...new Set(events)].filter((e) => e !== "deadline-day" || !events.includes("window-close"));
  return unique.map((e) => `<span class="cal-badge cal-badge--${e}">${EVENT_LABEL[e] || e}</span>`).join("");
}

export function renderCalendar(state) {
  const { viewYear, viewMonth } = state.ui.calendar;
  document.getElementById("cal-month-label").textContent = `${monthLong(new Date(viewYear, viewMonth, 1)).toUpperCase()} ${viewYear}`;

  const cells = monthCells(viewYear, viewMonth, {
    fixtures: state.fixtures,
    clubId: state.club.id,
    seasonStartYear: state.seasonStartYear,
    today: state.calendar.today,
  });

  const cellsHtml = cells.map((cell) => {
    const classes = ["cal-cell"];
    if (!cell.inMonth) classes.push("is-out");
    if (cell.isToday) classes.push("is-today");
    if (cell.fixture) classes.push("has-match");

    let matchHtml = "";
    if (cell.fixture) {
      const isHome = cell.fixture.homeClubId === state.club.id;
      const oppId = isHome ? cell.fixture.awayClubId : cell.fixture.homeClubId;
      matchHtml =
        `<div class="cal-match">` +
          `<svg class="crest crest--xs"><use href="#crest-${oppId}"></use></svg>` +
          `<span class="cal-match__ha">${isHome ? "H" : "A"}</span>` +
        `</div>`;
    }

    return (
      `<div class="${classes.join(" ")}">` +
        `<span class="cal-daynum">${dayOfMonth(cell.date)}</span>` +
        matchHtml +
        `<div class="cal-events">${eventBadges(cell.events)}</div>` +
      `</div>`
    );
  }).join("");

  document.getElementById("cal-grid").innerHTML = cellsHtml;
}

export function initCalendarHeaders() {
  document.getElementById("cal-dow-header").innerHTML =
    DOW_HEADER.map((d) => `<div class="cal-dow">${d}</div>`).join("");
}
