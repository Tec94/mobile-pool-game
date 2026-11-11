// QA only: drive the Daily Table in a web build from scripts/qa-web.sh. Serve its dist first, then
//   node scripts/qa-daily.mjs <out-dir> [url=http://localhost:8765/]
// The clock is fixed at Mon 21 Dec 2026 12:00 (its table and 27 Nov's have wide aim windows, so the reference shot clears) and the saves are seeded as localStorage 'qa-fs:<file>'. A shot is the
// scenario's reference shot: a tap along its angle, then a pull on the power rail. Prints one line per check.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { SCENARIOS } from '../src/scenarios/data.ts';
import { dailyPick } from '../src/daily/daily.ts';
import { shotLayout } from '../src/render/cue.ts';
import { toScreen } from '../src/render/table.ts';
import { P, CUE } from '../src/physics/engine.ts';
import { stick } from '../src/progress/cues.ts';

const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] ?? 'qa-out', url = process.argv[3] ?? 'http://localhost:8765/', NOW = new Date('2026-12-21T12:00:00');
mkdirSync(out, { recursive: true });
let fails = 0;
const check = (ok, what, got = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${got !== '' ? ` -> ${JSON.stringify(got)}` : ''}`); };
const b = await chromium.launch(), errors = [];
const page = async (w, h) => {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => m.type() === 'error' && errors.push(m.text()));
  await p.clock.setFixedTime(NOW); await p.goto(url); await p.getByText('Pool').first().waitFor();
  return p;
};
const store = (p, files) => p.evaluate(f => { localStorage.clear(); for (const [k, v] of Object.entries(f)) localStorage.setItem('qa-fs:' + k, JSON.stringify(v)); }, files);
const read = (p, f) => p.evaluate(f => JSON.parse(localStorage.getItem('qa-fs:' + f) ?? 'null'), f);
const reload = async p => { await p.reload(); await p.getByText('Pool').first().waitFor(); };
const shot = (p, name) => p.screenshot({ path: `${out}/${name}.png` });
const text = p => p.locator('body').innerText();
const btn = (p, name) => p.getByRole('button', { name, exact: false }).first();
// Nothing off the side, and no two controls on top of each other.
async function layout(p, what) {
  const r = await p.evaluate(() => {
    const els = [...document.querySelectorAll('[role=button],[role=radio]')].map(e => [e.getAttribute('aria-label'), e.getBoundingClientRect()]).filter(([, b]) => b.width);
    const bad = [];
    for (const [n, a] of els) if (a.left < 0 || a.right > innerWidth + 0.5) bad.push(`${n} off the side`);
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const [n, a] = els[i], [m, c] = els[j];
      if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) bad.push(`${n} over ${m}`);
    }
    return { bad, hscroll: document.documentElement.scrollWidth > innerWidth };
  });
  check(!r.bad.length && !r.hscroll, `${what}: nothing off screen or overlapping`, r.bad.join('; '));
}
async function scrollShots(p, name) { // the page scrolls inside a ScrollView: shoot its top and its bottom
  await shot(p, name);
  const more = await p.evaluate(() => { const s = [...document.querySelectorAll('div')].find(d => d.scrollHeight > d.clientHeight + 4 && getComputedStyle(d).overflowY !== 'visible'); if (!s) return false; s.scrollTop = s.scrollHeight; return true; });
  if (more) { await p.waitForTimeout(200); await shot(p, name + '-bottom'); }
}
// The scenario's reference shot, from as far along its angle as the cloth allows (the finest tap), at its speed on the House Cue.
async function play(p, day) {
  const s = SCENARIOS[dailyPick(day, SCENARIOS)], vp = p.viewportSize(), { view, rail } = shotLayout(vp.width, vp.height, { top: 92, right: 0, bottom: 0, left: 0 });
  const [cx, cy] = s.cue, c = Math.cos(s.ref.ang), n = Math.sin(s.ref.ang);
  let d = 0.1; while (d < 3 && cx + (d + 0.01) * c > 0.15 && cx + (d + 0.01) * c < P.L - 0.15 && cy + (d + 0.01) * n > 0.15 && cy + (d + 0.01) * n < P.W - 0.15) d += 0.01;
  const t = toScreen(view, cx + d * c, cy + d * n);
  await p.mouse.click(t.x, t.y); await p.waitForTimeout(300);
  const power = s.ref.power * CUE.maxSpeed / stick('house').maxSpeed, x = rail.left + rail.width / 2, y = rail.top + 20;
  await p.mouse.move(x, y); await p.mouse.down();
  for (let i = 1; i <= 10; i++) await p.mouse.move(x, y + power * 0.75 * rail.height * i / 10);
  await p.waitForTimeout(250); await p.mouse.up();
  await p.getByText(/Cleared|Not this time/).first().waitFor({ timeout: 30000 });
  const all = await text(p); return { id: s.id, card: all.slice(all.search(/[★☆]+  Cleared|Not this time/)) };
}
async function clearDay(p, day, tries = 4) { // retry a miss up to tries times
  for (let i = 0; i < tries; i++) { const r = await play(p, day); if (/Cleared/.test(r.card)) return r; await btn(p, 'Retry').click(); await p.waitForTimeout(300); }
  return { card: 'never cleared' };
}

// 1. Fresh install, portrait.
let p = await page(390, 844);
await store(p, {}); await reload(p);
let home = await text(p);
check(/^Pool\s+Daily Table\s+Mon 21 Dec · Pots · ☆☆☆\s+Fresh Chalk: 1\s+Pass and play/.test(home), 'fresh home: Daily Table first, date, theme, no stars, no run, Fresh Chalk 1', home.slice(0, 90));
check((await read(p, 'daily.json'))?.chalk?.charges === 1, 'fresh install saves 1 charge of Fresh Chalk', await read(p, 'daily.json'));
await shot(p, '01-home-fresh-portrait'); await layout(p, 'home portrait');
await btn(p, 'Daily Table').click();
let cal = await text(p);
check(/Daily Table\s+Run 0 · best 0/.test(cal) && /Play today\s+Mon 21 Dec · Pots/.test(cal) && /December 2026/.test(cal), 'fresh calendar: Run 0 · best 0, Play today, December 2026', cal.slice(0, 160));
check(await btn(p, 'Previous month').isDisabled() && await btn(p, 'Next month').isDisabled(), 'fresh calendar: ‹ and › both off');
const open = await p.locator('[aria-label*=" December"]:not([aria-disabled=true])').evaluateAll(es => es.map(e => e.getAttribute('aria-label')));
check(open.length === 1 && open[0] === '21 December, 0 of 3 stars, today', 'fresh calendar: only today open', open);
const b1 = await p.locator('[aria-label^="1 December"]').boundingBox(), b7 = await p.locator('[aria-label^="7 December"]').boundingBox();
check(b7.y > b1.y + 10 && b7.x < b1.x, 'grid is Monday first: 1 Dec (Tue) in column 2, 7 Dec (Mon) starts row 2');
await scrollShots(p, '02-calendar-fresh-portrait'); await layout(p, 'calendar portrait');

// 2. Today's table from Play today. A fresh player is level 1; the daily plays whatever the level.
await btn(p, 'Play today').click();
await p.getByText(/Pots \d+ · par/i).first().waitFor();
await shot(p, '03-daily-table-portrait');
let r = await clearDay(p, '2026-12-21');
await shot(p, '04-today-result-portrait');
check(/\+100 XP · \+60 coins/.test(r.card) && /Back to Daily Table/.test(r.card), 'first clear (guide on, within par): +100 XP · +60 coins, Back to Daily Table', r.card);
check((await read(p, 'daily.json'))?.stars?.['2026-12-21'] === 3, 'saved stars for 21 Dec = 3 (clear + par)', (await read(p, 'daily.json'))?.stars);
const prof = await read(p, 'profile.json');
check(prof?.xp === 100 && prof?.coins === 60, 'profile holds the pay: 100 XP, 60 coins', prof && { xp: prof.xp, coins: prof.coins });
await btn(p, 'Back to Daily Table').click();
cal = await text(p);
check(/Run 1 · best 1/.test(cal), 'back on the calendar: Run 1 · best 1', cal.slice(0, 40));
check(await p.locator('[aria-label="21 December, 2 of 3 stars, today"]').count() === 1, 'calendar shows 2 stars on today');
await p.getByRole('button', { name: 'Back', exact: true }).click();
check(/Mon 21 Dec · Pots · ★★☆ · run 1/.test(await text(p)), 'home shows ★★☆ · run 1');
await reload(p);
check(/Mon 21 Dec · Pots · ★★☆ · run 1/.test(await text(p)), 'after a reload the home card keeps ★★☆ · run 1');

// 3. A seeded history: first day 20 Oct; cleared 21-24 Oct (best 4), 25 Nov, 26 Nov and 20 Dec; 2 charges.
const seed = { firstDay: '2026-10-20', stars: { '2026-10-21': 1, '2026-10-22': 3, '2026-10-23': 7, '2026-10-24': 1, '2026-11-25': 1, '2026-11-26': 1, '2026-12-20': 3 }, chalk: { charges: 2, lastGrantDay: '2026-12-21', armed: false } };
await store(p, { 'daily.json': seed, 'profile.json': prof }); await reload(p);
let home2 = await text(p);
check(/Mon 21 Dec · Pots · ☆☆☆ · run 1\s+Fresh Chalk: 2/.test(home2), 'seeded home: no stars today, run 1 (20 Dec), Fresh Chalk 2', home2.slice(0, 90));
await btn(p, 'Daily Table').click();
check(/Run 1 · best 4/.test(await text(p)), 'seeded calendar: Run 1 · best 4');
check(!(await btn(p, 'Previous month').isDisabled()) && await btn(p, 'Next month').isDisabled(), 'December: ‹ on, › off');
const dec = await p.locator('[aria-label*=" December"]').evaluateAll(es => es.map(e => e.getAttribute('aria-disabled')));
check(dec.slice(0, 21).every(d => d !== 'true') && dec.slice(21).every(d => d === 'true'), '1-21 Dec open, 22-31 Dec off');
await scrollShots(p, '05-calendar-seeded-december');
await btn(p, 'Previous month').click(); await btn(p, 'Previous month').click();
const oct = await p.locator('[aria-label*=" October"]').evaluateAll(es => es.map(e => e.getAttribute('aria-disabled')));
check(/October 2026/.test(await text(p)) && await btn(p, 'Previous month').isDisabled(), 'October (first day month): ‹ off');
check(oct.slice(0, 19).every(d => d === 'true') && oct.slice(19).every(d => d !== 'true'), '1-19 Oct off, 20-31 Oct open');
check(await p.locator('[aria-label="23 October, 3 of 3 stars"]').count() === 1, 'October: 23 Oct shows 3 stars');
await scrollShots(p, '06-calendar-seeded-october');
await btn(p, 'Next month').click();

// 4. A past day: 27 Nov (Combos) joins 25-26 Nov into a run of 3. First clear, a replay with the guide off, a replay with nothing new.
await p.locator('[aria-label^="27 November"]').click();
await p.getByText(/Combos \d+ · par/i).first().waitFor();
check(true, 'tapping 27 Nov plays its Combos table');
r = await clearDay(p, '2026-11-27');
await shot(p, '07-past-day-result');
check(/\+100 XP · \+60 coins/.test(r.card), '27 Nov first clear: +100 XP · +60 coins', r.card);
await p.getByRole('radio', { name: 'Aim guide' }).click(); // guide off before the table is shown again: a try that showed it earns no guide-off star
await btn(p, 'Play again').click();
const p1 = await read(p, 'profile.json');
r = await clearDay(p, '2026-11-27');
check(/\+0 XP · \+30 coins/.test(r.card), 'replay with the guide off pays only the new star: +0 XP · +30 coins', r.card);
await btn(p, 'Play again').click();
const p2 = await read(p, 'profile.json');
check(p2.xp - p1.xp === 0 && p2.coins - p1.coins === 30, 'profile after the guide-off replay: +0 XP, +30 coins', [p1, p2].map(q => [q.xp, q.coins]));
r = await clearDay(p, '2026-11-27');
check(/No new stars/.test(r.card), 'replay with nothing new: No new stars', r.card);
await shot(p, '08-past-day-replay');
const p3 = await read(p, 'profile.json');
check(p3.xp === p2.xp && p3.coins === p2.coins, 'profile after a replay with no new star: unchanged', [p3.xp, p3.coins]);
check((await read(p, 'daily.json'))?.stars?.['2026-11-27'] === 7, 'saved stars for 27 Nov = 7');
await btn(p, 'Back to Daily Table').click();
check(/Run 1 · best 4/.test(await text(p)), 'calendar after 27 Nov: Run 1 · best 4 (25-27 Nov is a run of 3)', (await text(p)).slice(0, 40));
await scrollShots(p, '09-calendar-after-past-day');
await p.getByRole('button', { name: 'Back', exact: true }).click();
check(/Mon 21 Dec · Pots · ☆☆☆ · run 1/.test(await text(p)), 'home after a past day: today still ☆☆☆, run 1');
await p.close();

// 5. Landscape.
p = await page(844, 390);
await store(p, { 'daily.json': seed }); await reload(p);
await scrollShots(p, '10-home-landscape'); await layout(p, 'home landscape');
await btn(p, 'Daily Table').click(); await scrollShots(p, '11-calendar-landscape'); await layout(p, 'calendar landscape');
await btn(p, 'Play today').click(); await p.getByText(/Pots \d+ · par/i).first().waitFor();
await shot(p, '12-daily-table-landscape');
r = await clearDay(p, '2026-12-21'); await shot(p, '13-result-landscape');
check(/\+100 XP · \+60 coins/.test(r.card), 'landscape: today clears and pays', r.card); await layout(p, 'result card landscape');
await btn(p, 'Back to Daily Table').click(); check(/Run 2 · best 4/.test(await text(p)), 'landscape: Run 2 after clearing today (20-21 Dec)');
await p.close();

// 6. The day turns at 04:00: at 03:30 on 22 Dec it is still 21 Dec.
p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.clock.setFixedTime(new Date('2026-12-22T03:30:00')); await p.goto(url); await p.getByText('Pool').first().waitFor();
check(/Mon 21 Dec/.test(await text(p)), '03:30 on 22 Dec is still Mon 21 Dec');
await p.close();

// No timer, countdown or "at risk" wording anywhere the run went.
check(!/at risk|expire|hurry|left today|countdown|\d+h \d+m|\d\d:\d\d/i.test(home + cal + home2), 'no timer or "streak at risk" wording on home or calendar');
const all = errors.filter(e => !/expo-file-system/.test(e));
check(!all.length, 'no page errors', all.slice(0, 5));
await b.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
