// Run: npm test. The daily table: the 04:00 day, the pick, streaks from the calendar, the save, pay and Fresh Chalk.
process.env.TZ = 'America/New_York'; // a zone with DST, set before any Date is made
import assert from 'node:assert';
import { addDays, addMonths, armChalk, chalkResult, dailyClear, dailyPick, dayKey, grantChalk, monthGrid, readDaily, streak, themePacks } from './daily.ts';

{ // the day runs 04:00 to 04:00 local
  assert.strictEqual(dayKey(new Date(2026, 10, 11, 3, 59)), '2026-11-10', '03:59 is still yesterday');
  assert.strictEqual(dayKey(new Date(2026, 10, 11, 4, 0)), '2026-11-11', '04:00 is today');
  assert.strictEqual(dayKey(new Date(2027, 0, 1, 2, 0)), '2026-12-31', 'across a year');
  // DST: clocks spring forward 2026-03-08 02:00 and fall back 2026-11-01 02:00 in New York
  assert.strictEqual(dayKey(new Date(2026, 2, 8, 4, 0)), '2026-03-08', '04:00 on spring-forward day is that day');
  assert.strictEqual(dayKey(new Date(2026, 2, 8, 3, 59)), '2026-03-07', '03:59 on spring-forward day is the day before');
  assert.strictEqual(dayKey(new Date(2026, 10, 1, 4, 0)), '2026-11-01', '04:00 on fall-back day is that day');
  assert.strictEqual(addDays('2026-03-07', 1), '2026-03-08', 'step over spring forward');
  assert.strictEqual(addDays('2026-11-01', 1), '2026-11-02', 'step over fall back');
  assert.strictEqual(addDays('2026-11-02', -1), '2026-11-01', 'step back over fall back');
  assert.strictEqual(addDays('2028-02-28', 1), '2028-02-29', 'leap day');
  assert.strictEqual(addDays('2026-12-31', 1), '2027-01-01', 'new year');
  console.log('daily day: all checks passed');
}
{ // the pick
  const list = [];
  for (let pack = 0; pack < 9; pack++) for (let k = 0; k < 4; k++) list.push({ id: `p${pack}-${k}`, pack });
  // 2026-11-09 is a Monday
  const want = { '2026-11-09': [0], '2026-11-10': [1], '2026-11-11': [2], '2026-11-12': [3], '2026-11-13': [5], '2026-11-14': [6, 7], '2026-11-15': [8] };
  for (const [day, packs] of Object.entries(want)) assert.deepStrictEqual(themePacks(day), packs, `theme of ${day}`);
  const seen = new Set(), sat = new Set();
  for (let i = 0; i < 70; i++) {
    const day = addDays('2026-11-09', i), at = dailyPick(day, list);
    assert(at >= 0 && themePacks(day).includes(list[at].pack), `${day} picks from its theme`);
    assert.notStrictEqual(list[at].pack, 4, 'never 9-ball');
    assert.strictEqual(dailyPick(day, list.map(s => ({ ...s }))), at, 'the same for every player');
    seen.add(list[at].id); if (themePacks(day).length === 2) sat.add(list[at].pack);
  }
  assert(seen.size > 14, `the pick varies over ten weeks (${seen.size} scenarios)`);
  assert.deepStrictEqual([...sat].sort(), [6, 7], 'Saturdays pick from both kicks and safeties');
  assert.strictEqual(dailyPick('2026-11-09', list.filter(s => s.pack !== 0)), -1, 'no scenario in the theme');
  assert.strictEqual(dailyPick('2026-11-09', [list[9], list[2]]), 1, 'the only scenario in the theme');
  // only a pack's first 12 are picked from, so a 13th table appended to a pack moves no day's pick
  const v1 = [];
  for (let pack = 0; pack < 9; pack++) for (let k = 0; k < 12; k++) v1.push({ id: `p${pack}-${k}`, pack });
  const v2 = v1.flatMap(s => (s.id.endsWith('-11') ? [s, { id: `${s.id}+`, pack: s.pack }] : [s]));
  for (let i = 0; i < 70; i++) { const day = addDays('2026-11-09', i); assert.strictEqual(v2[dailyPick(day, v2)].id, v1[dailyPick(day, v1)].id, `${day}: a 13th table changes nothing`); }
  console.log('daily pick: all checks passed');
}
{ // streaks come from the calendar
  const today = '2026-11-11', s = days => Object.fromEntries(days.map(d => [d, 1]));
  assert.deepStrictEqual(streak({}, today), { current: 0, best: 0 }, 'nothing played');
  assert.deepStrictEqual(streak(s(['2026-11-09', '2026-11-10', '2026-11-11']), today), { current: 3, best: 3 }, 'three days to today');
  assert.deepStrictEqual(streak(s(['2026-11-09', '2026-11-10']), today), { current: 2, best: 2 }, 'today unplayed keeps the run to yesterday');
  assert.deepStrictEqual(streak(s(['2026-11-08', '2026-11-09']), today), { current: 0, best: 2 }, 'a missed yesterday ends it');
  const gap = s(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06', '2026-11-11']);
  assert.deepStrictEqual(streak(gap, today), { current: 1, best: 3 }, 'best is the longest run anywhere');
  assert.deepStrictEqual(streak({ ...gap, '2026-11-04': 1 }, today), { current: 1, best: 6 }, 'clearing a missed day joins the runs');
  assert.deepStrictEqual(streak({ ...s(['2026-11-10', '2026-11-11']), '2026-11-09': 4 }, today), { current: 2, best: 2 }, 'a star without a clear is no clear');
  console.log('daily streak: all checks passed');
}
{ // the save
  const today = '2026-11-11', fresh = readDaily(null, today);
  assert.deepStrictEqual(fresh, { firstDay: today, stars: {}, chalk: { charges: 0, lastGrantDay: '2026-11-10', armed: false } }, 'no save');
  for (const t of ['{oops', '[]', '3', '"x"', '{"firstDay":"2026-13-01"}']) assert.deepStrictEqual(readDaily(t, today), fresh, `garbage ${t}`);
  const d = readDaily(JSON.stringify({ firstDay: '2026-11-01', stars: { '2026-11-02': 3, '2026-10-30': 1, '2026-11-03': 0, '2026-11-04': 8, '2026-11-05': 1.5, 'nope': 1, '2026-11-31': 1, '2026-11-06': '1', '2026-11-07': 7 },
    chalk: { charges: 12, lastGrantDay: '2026-11-09', armed: true } }), today);
  assert.deepStrictEqual(d, { firstDay: '2026-11-01', stars: { '2026-11-02': 3, '2026-11-07': 7 }, chalk: { charges: 7, lastGrantDay: '2026-11-09', armed: true } }, 'out-of-range dropped, charges clamped');
  assert.strictEqual(readDaily('{"firstDay":"2026-11-01","chalk":{"charges":-2,"armed":true}}', today).chalk.charges, 0, 'charges at least 0');
  assert.strictEqual(readDaily('{"firstDay":"2026-11-01","chalk":{"charges":0,"armed":true}}', today).chalk.armed, false, 'armed needs a charge');
  // clock moved back: nothing is removed, today stays playable
  const back = readDaily(JSON.stringify({ firstDay: '2026-11-01', stars: { '2026-11-20': 1 }, chalk: { charges: 2, lastGrantDay: '2026-11-20', armed: false } }), today);
  assert.deepStrictEqual(back.stars, { '2026-11-20': 1 }, 'a later day is kept when the clock goes back');
  assert.strictEqual(readDaily('{"firstDay":"2026-11-20"}', today).firstDay, today, 'today is always playable');
  console.log('daily save: all checks passed');
}
{ // clear pay
  assert.deepStrictEqual(dailyClear(0, 1), { bits: 1, n: 1, pay: { xp: 100, coins: 30 } }, 'first clear');
  assert.deepStrictEqual(dailyClear(0, 7), { bits: 7, n: 3, pay: { xp: 100, coins: 90 } }, 'first clear, all stars');
  assert.deepStrictEqual(dailyClear(1, 3), { bits: 3, n: 1, pay: { xp: 0, coins: 30 } }, 'a new star on a replay');
  assert.deepStrictEqual(dailyClear(7, 7), { bits: 7, n: 0, pay: { xp: 0, coins: 0 } }, 'a repeat pays nothing');
  assert.deepStrictEqual(dailyClear(5, 1), { bits: 5, n: 0, pay: { xp: 0, coins: 0 } }, 'stars kept, nothing new');
  console.log('daily pay: all checks passed');
}
{ // Fresh Chalk
  const today = '2026-11-11', fresh = readDaily(null, today);
  const g = grantChalk(fresh, today);
  assert.strictEqual(g.chalk.charges, 1, 'a fresh install gets one for today');
  assert.strictEqual(grantChalk(g, today), g, 'same day: nothing changes');
  assert.strictEqual(grantChalk(g, addDays(today, 10)).chalk.charges, 7, 'away ten days: capped at 7');
  assert.strictEqual(grantChalk(g, addDays(today, 3)).chalk.charges, 4, 'one a day, opened or not');
  const full = { ...g, chalk: { ...g.chalk, charges: 7 } }, next = grantChalk(full, addDays(today, 1));
  assert.strictEqual(next.chalk.lastGrantDay, addDays(today, 1), 'a full day still moves the grant day');
  assert.deepStrictEqual(grantChalk(next, today).chalk, { ...next.chalk, lastGrantDay: today }, 'clock back: no grant, nothing taken');
  const back = grantChalk({ ...g, chalk: { ...g.chalk, lastGrantDay: '2030-01-01' } }, today); // the clock was set years ahead, then fixed
  assert.deepStrictEqual(back.chalk, g.chalk, 'a grant day in the future comes back to today');
  assert.strictEqual(grantChalk(back, addDays(today, 1)).chalk.charges, 2, 'and grants start again the next day');
  assert.strictEqual(armChalk(fresh, true), fresh, 'no charge, cannot arm');
  const armed = armChalk(g, true);
  assert.strictEqual(armed.chalk.armed, true, 'arm');
  assert.strictEqual(armChalk(armed, false).chalk.armed, false, 'disarm');
  const pay = { xp: 240, coins: 160 }, lost = chalkResult(armed, false, pay);
  assert.deepStrictEqual(lost, { state: armed, extra: { xp: 0, coins: 0 } }, 'a loss keeps the charge armed');
  const won = chalkResult(armed, true, pay);
  assert.deepStrictEqual(won.extra, pay, 'a win doubles the match pay');
  assert.deepStrictEqual(won.state.chalk, { ...armed.chalk, charges: 0, armed: false }, 'a win spends the charge');
  assert.deepStrictEqual(chalkResult(g, true, pay), { state: g, extra: { xp: 0, coins: 0 } }, 'not armed: no extra');
  console.log('daily chalk: all checks passed');
}
{ // the calendar's month grid: Monday-first weeks, blanks before the 1st and after the last day
  assert.strictEqual(addMonths('2026-12', 1), '2027-01', 'into a new year');
  assert.strictEqual(addMonths('2026-01', -1), '2025-12', 'back over a new year');
  const nov = monthGrid('2026-11'); // 2026-11-01 is a Sunday
  assert.strictEqual(nov.length, 42, 'six full weeks');
  assert.deepStrictEqual(nov.slice(0, 7), ['', '', '', '', '', '', '2026-11-01'], 'Sunday the 1st ends the first week');
  assert.strictEqual(nov[35], '2026-11-30', 'last day');
  assert.deepStrictEqual(nov.slice(36), ['', '', '', '', '', ''], 'blanks after');
  const feb = monthGrid('2027-02'); // a Monday the 1st, 28 days: four full weeks
  assert.deepStrictEqual([feb.length, feb[0], feb[27]], [28, '2027-02-01', '2027-02-28'], 'February 2027');
  assert(monthGrid('2028-02').includes('2028-02-29') && !monthGrid('2027-02').includes('2027-02-29'), 'only a leap February has the 29th');
  console.log('daily calendar: all checks passed');
}
{ // the file: a save moves a new file into place and keeps the last good one; a damaged file is never written over at launch
  const disk = new Map(); globalThis.__DEV__ = false; globalThis.__disk = disk;
  const fake = `export const Paths = { document: '' }; const d = globalThis.__disk;
    export class File { constructor(_, n) { this.n = n } get exists() { return d.has(this.n) } textSync() { if (!d.has(this.n)) throw Error('none'); return d.get(this.n) }
      writeSync(t) { d.set(this.n, t) } delete() { d.delete(this.n) } moveSync(to) { if (globalThis.__full) throw Error('disk full'); d.set(to.n, this.textSync()); d.delete(this.n) } }`;
  const { registerHooks } = await import('node:module');
  registerHooks({ resolve: (s, c, next) => (s === 'expo-file-system' ? { url: `data:text/javascript,${encodeURIComponent(fake)}`, shortCircuit: true } : next(s, c)) });
  const { loadDaily, saveDaily } = await import('./save.ts'), today = '2026-11-11', fresh = readDaily(null, today);
  assert.deepStrictEqual(loadDaily(today), { daily: fresh, damaged: false }, 'no file: a fresh state, safe to save');
  disk.set('daily.json', '{"firstDay":"2026-1');
  assert.deepStrictEqual(loadDaily(today), { daily: fresh, damaged: true }, 'only a damaged file: damaged, do not save over it');
  disk.clear();
  const a = grantChalk(fresh, today), b = { ...a, stars: { [today]: 1 } };
  assert(saveDaily(a) && saveDaily(b), 'saved');
  assert.deepStrictEqual([...disk.keys()].sort(), ['daily.bak.json', 'daily.json'], 'the main file and the last good one');
  assert.deepStrictEqual(loadDaily(today).daily, b, 'loads the last save');
  disk.set('daily.json', '{oops');
  assert.deepStrictEqual(loadDaily(today), { daily: a, damaged: false }, 'a damaged main file falls back to the backup');
  disk.set('daily.new.json', JSON.stringify(b));
  assert.deepStrictEqual(loadDaily(today).daily, b, 'a new file left by a crash before its move is the newest save');
  console.log('daily file: all checks passed');
  // Lessons and stars save the same way. learn.json is a list, which the profile and daily files must not be.
  const { loadDone, saveDone } = await import('../learn/save.ts'), { loadStars, saveStars } = await import('../scenarios/save.ts');
  const { LESSONS } = await import('../learn/lessons.ts'), { SCENARIOS } = await import('../scenarios/scenarios.ts');
  const [l1, l2] = LESSONS.map(l => l.id), s1 = SCENARIOS[0].id;
  disk.set('learn.json', JSON.stringify([l1]));
  assert.deepStrictEqual(loadDone(), [l1], 'a learn.json from before still loads');
  assert(saveDone([l1, l2]), 'lessons saved');
  assert.deepStrictEqual(JSON.parse(disk.get('learn.bak.json')), [l1], 'the old list is the backup');
  disk.set('learn.json', '["les');
  assert.deepStrictEqual(loadDone(), [l1], 'a damaged lessons file falls back to the backup: no lesson pays twice');
  disk.set('scenarios.json', JSON.stringify({ [s1]: 1 }));
  assert.deepStrictEqual(loadStars(), { [s1]: 1 }, 'a scenarios.json from before still loads');
  assert(saveStars({ [s1]: 3 }), 'stars saved');
  disk.set('scenarios.json', '{');
  assert.deepStrictEqual(loadStars(), { [s1]: 1 }, 'damaged stars fall back to the backup');
  disk.set('daily.json', '[]'); disk.delete('daily.new.json');
  assert.deepStrictEqual(loadDaily(today).daily, a, 'a list is not a daily file: the backup loads');
  disk.clear(); saveDone([l1]); globalThis.__full = true;
  assert(!saveDone([l1, l2]), 'a move that fails is no save');
  globalThis.__full = false;
  assert.deepStrictEqual(loadDone(), [l1], 'and the failed save is gone, so the lesson it would have paid is not shown as passed');
  console.log('lesson and star files: all checks passed');
}
