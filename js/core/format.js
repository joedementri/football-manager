// core/format.js — shared display formatting: dates, numbers, money.
// Money is always stored internally in pounds (ground rule #6); these
// helpers convert to the player's chosen display currency at fixed rates.

const DOW_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTH_SHORT = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

/** "WED" from a Date */
export function dayOfWeekShort(date) {
  return DOW_SHORT[date.getDay()];
}

/** "16" from a Date (zero-padded not needed for this UI's type scale) */
export function dayOfMonth(date) {
  return String(date.getDate());
}

/** "JUL 2014" from a Date */
export function monthYearShort(date) {
  return `${MONTH_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

/** "JULY" from a Date — full month name, used by the Calendar overlay's
 * month-view header. */
export function monthLong(date) {
  const MONTH = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return MONTH[date.getMonth()];
}

/** "9 AUG" from a Date — compact fixture-date label (Season's fixtures tile,
 * where there's no result yet to show a scoreline for). */
export function dateDayMonth(date) {
  return `${date.getDate()} ${MONTH_SHORT[date.getMonth()]}`;
}

/** "16/07/2014" (UK order, used by email timestamps) */
export function dateSlash(date) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${d}/${m}/${date.getFullYear()}`;
}

/** "Wednesday, July 16, 2014" (used by the Central news headline) */
export function dateLong(date) {
  const WEEKDAY = [
    "Sunday", "Monday", "Tuesday", "Wednesday",
    "Thursday", "Friday", "Saturday",
  ];
  const MONTH = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${WEEKDAY[date.getDay()]}, ${MONTH[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/** 218045 -> "218,045" */
export function number(n) {
  return Math.round(n).toLocaleString("en-GB");
}

// Fixed conversion rates from GBP (the storage currency). Real rates aren't
// the point here — these just need to be stable so save files stay coherent
// (ground rule #6: "display currency selectable in Settings, fixed rates").
const CURRENCY = {
  GBP: { symbol: "£", rate: 1 },
  USD: { symbol: "$", rate: 1.27 },
  EUR: { symbol: "€", rate: 1.17 },
};

// M11 Settings: the user's chosen display currency (config/settings.js) —
// a module-level default rather than threading `state.settings.currency`
// through every one of this project's many money() call sites. core/store.js
// calls setDisplayCurrency() once on boot/hydrate and again every time the
// Settings screen changes it (ui/settingsui.js).
let displayCurrency = "GBP";
export function setDisplayCurrency(code) {
  displayCurrency = code;
}

/** amountGBP -> "£401,500" (or $/€ per currency code, or the user's current
 * Settings choice if `currency` isn't passed explicitly) */
export function money(amountGBP, currency = displayCurrency) {
  const c = CURRENCY[currency] || CURRENCY.GBP;
  return `${c.symbol}${number(amountGBP * c.rate)}`;
}
