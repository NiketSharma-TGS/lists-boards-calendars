// Recurrence rules.
//
// A rule is { freq, interval, days, monthDay, times, from }:
//   freq      'day' | 'week' | 'month' | 'year'
//   interval  every N of freq
//   days      weekdays (0 = Sunday) for weekly rules
//   monthDay  day of the month for monthly rules
//   times     'HH:MM' slots; more than one means several times a day
//   from      'schedule' (fixed calendar) or 'completion' (counted from when you finish)

import { addDays, addMonths, dow, diffDays, startOfWeek, DAY_SHORT, fmtTime } from './dates.js';

const LIMIT = 3700;

function matches(rule, anchor, date) {
  const n = Math.max(1, rule.interval || 1);
  if (rule.freq === 'day') {
    const diff = diffDays(date, anchor);
    return diff >= 0 ? diff % n === 0 : (-diff) % n === 0;
  }
  if (rule.freq === 'week') {
    const days = rule.days && rule.days.length ? rule.days : [dow(anchor)];
    if (!days.includes(dow(date))) return false;
    const weeks = Math.round(diffDays(startOfWeek(date), startOfWeek(anchor)) / 7);
    return Math.abs(weeks) % n === 0;
  }
  const [ay, am, ad] = anchor.split('-').map(Number);
  const [y, m, d] = date.split('-').map(Number);
  if (rule.freq === 'month') {
    const months = (y - ay) * 12 + (m - am);
    if (Math.abs(months) % n !== 0) return false;
    const want = rule.monthDay || ad;
    return addMonths(y + '-' + String(m).padStart(2, '0') + '-01', 0, want) === date;
  }
  if (rule.freq === 'year') {
    if (Math.abs(y - ay) % n !== 0) return false;
    if (m !== am) return false;
    return addMonths(y + '-' + String(m).padStart(2, '0') + '-01', 0, ad) === date;
  }
  return false;
}

// First occurrence on or after `from`, for a series anchored at `anchor`.
export function onOrAfter(rule, anchor, from) {
  let d = from;
  for (let i = 0; i < LIMIT; i++) {
    if (matches(rule, anchor, d)) return d;
    d = addDays(d, 1);
  }
  return from;
}
// First occurrence strictly after `after`.
export function nextAfter(rule, anchor, after) {
  return onOrAfter(rule, anchor, addDays(after, 1));
}
// Occurrences in [from, to), capped.
export function between(rule, anchor, from, to, cap = 90) {
  const out = [];
  let d = from;
  let guard = 0;
  while (d < to && out.length < cap && guard++ < LIMIT) {
    if (matches(rule, anchor, d)) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

// Where a series goes after an instance is finished.
//   anchor  the series date of the instance just finished
//   today   the day it was finished
export function advance(rule, anchor, today) {
  if (rule.from === 'completion') {
    const n = Math.max(1, rule.interval || 1);
    if (rule.freq === 'day') return addDays(today, n);
    if (rule.freq === 'week' && !(rule.days && rule.days.length)) return addDays(today, 7 * n);
    if (rule.freq === 'month') return addMonths(today, n);
    if (rule.freq === 'year') return addMonths(today, 12 * n);
    return nextAfter(rule, today, today);
  }
  const next = nextAfter(rule, anchor, anchor);
  return next < today ? onOrAfter(rule, anchor, today) : next;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function describe(rule) {
  if (!rule) return '';
  const n = Math.max(1, rule.interval || 1);
  let out;
  if (rule.freq === 'day') out = n === 1 ? 'Every day' : 'Every ' + n + ' days';
  else if (rule.freq === 'week') {
    const days = (rule.days || []).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    const isWeekdays = days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d));
    const names = isWeekdays ? 'weekday' : days.map((d) => DAY_SHORT[d]).join(', ');
    if (n === 1) out = days.length ? 'Every ' + names : 'Every week';
    else out = 'Every ' + n + ' weeks' + (days.length ? ' on ' + names : '');
  } else if (rule.freq === 'month') {
    out = (n === 1 ? 'Every month' : 'Every ' + n + ' months') + (rule.monthDay ? ' on the ' + ordinal(rule.monthDay) : '');
  } else out = n === 1 ? 'Every year' : 'Every ' + n + ' years';
  const times = rule.times || [];
  if (times.length) out += ' at ' + times.map(fmtTime).join(', ');
  if (rule.from === 'completion') out += ', counted from completion';
  return out;
}
