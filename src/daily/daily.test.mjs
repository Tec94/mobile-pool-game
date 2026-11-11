// Run: npm test. The daily table: the 04:00 day, the pick, streaks from the calendar, the save, pay and Fresh Chalk.
process.env.TZ = 'America/New_York'; // a zone with DST, set before any Date is made
import assert from 'node:assert';
import { addDays, armChalk, chalkResult, dailyClear, dailyPick, dayKey, grantChalk, readDaily, streak, themePacks } from './daily.ts';

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
  assert.strictEqual(grantChalk(next, today), next, 'clock back: no grant, nothing taken');
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
