// Calendar helpers. Dates are plain "YYYY-MM-DD" strings handled in UTC so a
// build anywhere gives the same answer.

export const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const DAY_NAMES = {
  sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday',
};

export function parseDate(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}
export function addDays(s, n) {
  const d = parseDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fmtDate(d);
}
export function dayKey(s) {
  return DAYS[parseDate(s).getUTCDay()];
}
/** The calendar date of a weekday within a plan week (week_of is the Monday). */
export function dateOfDay(weekOf, day) {
  const offset = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 }[day];
  return addDays(weekOf, offset);
}
/** Prep day is the day before the week starts (Sunday). */
export function prepDate(weekOf) {
  return addDays(weekOf, -1);
}
/** The Monday on or after a date. */
export function nextMonday(s) {
  const d = parseDate(s).getUTCDay();
  return addDays(s, d === 1 ? 0 : (8 - d) % 7);
}
export function weeksBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / (7 * 864e5));
}
export function todayISO() {
  const now = new Date();
  return fmtDate(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}
export function prettyDate(s, opts = { month: 'short', day: 'numeric' }) {
  return parseDate(s).toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
}
