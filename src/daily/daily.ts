// The Daily Table: one scenario a day, the same for every player, with stars, a streak and Fresh Chalk (a charge that
// doubles the pay of a won match). Pure TS: the screen reads the clock and the save, and calls these.
import type { Pay } from '../progress/pay.ts';

export const GEN_VERSION = 1; // bumping changes every pick, past days too; stars stay keyed by date
export const CHALK_CAP = 7;
export const DAILY_XP = 100, STAR_COINS = 30; // XP on the first clear of a day, coins per first-time star

// Stars, as bits like the scenarios: 1 clear, 2 within par, 4 guide off.
export interface Daily { firstDay: string; stars: Record<string, number>; chalk: { charges: number; lastGrantDay: string; armed: boolean } }

// A day runs 04:00 to 04:00 local. Local fields only, never a made local time (it may not exist on a DST night).
export function dayKey(d: Date) {
  const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return d.getHours() < 4 ? addDays(k, -1) : k;
}
// Day keys step in UTC, where every day is 24 h, so DST can't skip or repeat one.
const ms = (k: string) => Date.parse(`${k}T00:00:00Z`);
export const addDays = (k: string, n: number) => new Date(ms(k) + n * 864e5).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((ms(b) - ms(a)) / 864e5);
const isDay = (k: unknown): k is string => typeof k === 'string' && /^\d{4}-\d\d-\d\d$/.test(k) && !isNaN(ms(k)) && addDays(k, 0) === k; // 2026-02-30 fails the round trip

// Months as '2026-11'. The calendar's grid: Monday-first weeks of day keys, '' for the blanks around the month.
export const addMonths = (m: string, n: number) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1)).toISOString().slice(0, 7);
export function monthGrid(m: string) {
  const first = `${m}-01`, days = Array.from({ length: daysBetween(first, `${addMonths(m, 1)}-01`) }, (_, i) => addDays(first, i));
  const cells = [...Array<string>((new Date(ms(first)).getUTCDay() + 6) % 7).fill(''), ...days];
  return [...cells, ...Array<string>((7 - cells.length % 7) % 7).fill('')];
}

// The scenario packs (PACKS in progress/profile.ts) of each weekday, Sunday first. 9-ball (4) is never a daily.
const THEME = [[8], [0], [1], [2], [3], [5], [6, 7]];
export const themePacks = (k: string) => THEME[new Date(ms(k)).getUTCDay()];

// FNV-1a 32-bit: the seed must be the same on every phone, so no Math.random.
function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
// The day's scenario: its index in list, or -1 when the list has none in the day's theme.
// shortcut: picks only from the first 12 of each pack (the v1 packs), so a table appended to a pack moves no day; a new
// table must go after a pack's first 12, or bump GEN_VERSION and store the picked ids so past days keep their tables.
export function dailyPick(day: string, list: { id: string; pack: number }[]) {
  const packs = themePacks(day), at = packs.flatMap(p => list.flatMap((s, i) => (s.pack === p ? [i] : [])).slice(0, 12));
  return at.length ? at[hash(`${day}#${GEN_VERSION}`) % at.length] : -1;
}

// Never stored: current is the run of cleared days to today, or to yesterday while today is unplayed. best is the
// longest run anywhere, so clearing a missed day joins two runs.
export function streak(stars: Record<string, number>, today: string) {
  const clear = (k: string) => (stars[k] ?? 0) & 1;
  let current = 0;
  for (let k = clear(today) ? today : addDays(today, -1); clear(k); k = addDays(k, -1)) current++;
  let best = 0, run = 0, prev = '';
  for (const k of Object.keys(stars).filter(clear).sort()) {
    run = prev && daysBetween(prev, k) === 1 ? run + 1 : 1;
    best = Math.max(best, run); prev = k;
  }
  return { current, best };
}

// The state from the saved text, like readProfile: anything damaged takes its default. A fresh state's chalk was last
// granted yesterday, so the first grant gives one for today. A clock moved back removes nothing: later stars stay.
export function readDaily(text: string | null, today: string): Daily {
  let o: any = null;
  try { o = JSON.parse(text ?? 'null'); } catch {}
  if (!o || typeof o !== 'object' || Array.isArray(o)) o = {};
  const firstDay = isDay(o.firstDay) && o.firstDay < today ? o.firstDay : today; // today is always playable
  const stars: Record<string, number> = {};
  for (const [k, v] of Object.entries(o.stars ?? {})) if (isDay(k) && k >= firstDay && Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 7) stars[k] = v as number;
  const c = o.chalk ?? {}, charges = Number.isInteger(c.charges) ? Math.max(0, Math.min(CHALK_CAP, c.charges)) : 0;
  return { firstDay, stars, chalk: { charges, lastGrantDay: isDay(c.lastGrantDay) ? c.lastGrantDay : addDays(today, -1), armed: c.armed === true && charges >= 1 } };
}

// A finished daily with star bits: n stars new to the day, 100 XP on its first clear and 30 coins a new star.
export function dailyClear(had: number, bits: number) {
  const add = bits & ~had & 7, n = (add & 1) + ((add >> 1) & 1) + ((add >> 2) & 1);
  return { bits: had | add, n, pay: { xp: add & 1 ? DAILY_XP : 0, coins: STAR_COINS * n } as Pay };
}

// One charge for every day since the last grant, opened or not, up to the cap. The same day returns the same state, so
// the caller can skip the save. A clock moved back takes no charge but moves the grant day back, or a clock once set
// years ahead would stop the grants for years.
export function grantChalk(s: Daily, today: string): Daily {
  const n = daysBetween(s.chalk.lastGrantDay, today);
  return n ? { ...s, chalk: { ...s.chalk, charges: Math.min(CHALK_CAP, s.chalk.charges + Math.max(0, n)), lastGrantDay: today } } : s;
}
export const armChalk = (s: Daily, on: boolean): Daily =>
  s.chalk.armed === on || (on && s.chalk.charges < 1) ? s : { ...s, chalk: { ...s.chalk, armed: on } };
// After a match: an armed charge pays the match pay again on a win (not the shot pay) and is spent; a loss keeps it armed.
export function chalkResult(s: Daily, won: boolean, matchPay: Pay) {
  if (!won || !s.chalk.armed) return { state: s, extra: { xp: 0, coins: 0 } as Pay };
  return { state: { ...s, chalk: { ...s.chalk, charges: s.chalk.charges - 1, armed: false } }, extra: matchPay };
}
