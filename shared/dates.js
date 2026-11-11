// Date helpers. Dates are 'YYYY-MM-DD' strings, times are 'HH:MM' strings,
// and durations are minutes. Shared by the server and the browser.

export const pad = (n) => String(n).padStart(2, '0');
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function ymd(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
export function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}
export function addDays(s, n) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}
export function dow(s) {
  return parseYmd(s).getDay();
}
export function diffDays(a, b) {
  return Math.round((parseYmd(a) - parseYmd(b)) / 864e5);
}
export function daysInMonth(y, m) {
  return new Date(y, m + 1, 0).getDate();
}
export function addMonths(s, n, day) {
  const [y, m, d] = s.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const want = day || d;
  return ny + '-' + pad(nm + 1) + '-' + pad(Math.min(want, daysInMonth(ny, nm)));
}

// Today's date in a named time zone.
export function todayIn(tz, now = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return ymd(now);
  }
}
// Minutes since midnight in a named time zone.
export function nowMinIn(tz, now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz || undefined, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const h = +parts.find((p) => p.type === 'hour').value;
    const m = +parts.find((p) => p.type === 'minute').value;
    return h * 60 + m;
  } catch {
    return now.getHours() * 60 + now.getMinutes();
  }
}

export function endOfWeek(s, weekEnd = 0) {
  let d = s;
  while (dow(d) !== weekEnd) d = addDays(d, 1);
  return d;
}
export function startOfWeek(s, weekEnd = 0) {
  const first = (weekEnd + 1) % 7;
  let d = s;
  while (dow(d) !== first) d = addDays(d, -1);
  return d;
}
export function endOfMonth(s) {
  const [y, m] = s.split('-').map(Number);
  return y + '-' + pad(m) + '-' + pad(daysInMonth(y, m - 1));
}

export function toMin(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
export function fromMin(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return pad(Math.floor(m / 60)) + ':' + pad(m % 60);
}

export function fmtTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return h12 + (m ? ':' + pad(m) : '') + ' ' + ap;
}
export function fmtDur(min) {
  if (min == null) return '';
  const m = Math.round(min);
  if (m < 60) return m + 'm';
  return Math.floor(m / 60) + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '');
}
export function fmtDate(s, today) {
  if (!s) return '';
  const diff = today ? diffDays(s, today) : null;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const d = parseYmd(s);
  if (diff !== null && diff > 1 && diff < 7) return DAY_NAMES[d.getDay()];
  const base = d.getDate() + ' ' + MONTH_SHORT[d.getMonth()];
  return today && s.slice(0, 4) !== today.slice(0, 4) ? base + ' ' + d.getFullYear() : base;
}
export function fmtLong(s) {
  const d = parseYmd(s);
  return DAY_SHORT[d.getDay()] + ' ' + d.getDate() + ' ' + MONTH_SHORT[d.getMonth()];
}

// Resolves the date words used by board rules ('eow', '+3', 'today' and so on).
export function resolveRelative(value, today, weekEnd = 0) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (value === 'today') return today;
  if (value === 'tomorrow') return addDays(today, 1);
  if (value === 'eow') return endOfWeek(today, weekEnd);
  if (value === 'eonw') return addDays(endOfWeek(today, weekEnd), 7);
  if (value === 'eom') return endOfMonth(today);
  const m = /^\+(\d+)$/.exec(value);
  if (m) return addDays(today, +m[1]);
  return null;
}
export function describeRelative(value) {
  const names = { today: 'today', tomorrow: 'tomorrow', eow: 'end of this week', eonw: 'end of next week', eom: 'end of this month' };
  if (names[value]) return names[value];
  const m = /^\+(\d+)$/.exec(value || '');
  if (m) return 'in ' + m[1] + (m[1] === '1' ? ' day' : ' days');
  return value || '';
}
