// QA only: drive Fresh Chalk in a web build from scripts/qa-web.sh. Serve its dist first, then
//   node scripts/qa-chalk.mjs <out-dir> [url=http://localhost:8765/] [matches=8]
// Clock fixed at Mon 21 Dec 2026 12:00; saves seeded as localStorage 'qa-fs:<file>' (as qa-daily.mjs). Matches are real:
// 9-ball, race to 1, Rookie. The human's shots are aimed by a ghost-ball bot that reads the ball positions (read only)
// from the Game's table ref through React's fiber, then taps the aim and pulls the power rail like a player.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { toScreen } from '../src/render/table.ts';
import { P, HOLES } from '../src/physics/engine.ts';

const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] ?? 'qa-out', url = process.argv[3] ?? 'http://localhost:8765/', MATCHES = +(process.argv[4] ?? 8);
const NOW = new Date('2026-12-21T12:00:00'), TODAY = '2026-12-21';
mkdirSync(out, { recursive: true });
let fails = 0;
const check = (ok, what, got = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${got !== '' ? ` -> ${JSON.stringify(got)}` : ''}`); };
const b = await chromium.launch(), errors = [];
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
p.on('pageerror', e => errors.push(e.message)); p.on('console', m => m.type() === 'error' && errors.push(m.text()));
await p.clock.setFixedTime(NOW); await p.goto(url); await p.getByText('Pool').first().waitFor();
const store = files => p.evaluate(f => { localStorage.clear(); for (const [k, v] of Object.entries(f)) localStorage.setItem('qa-fs:' + k, JSON.stringify(v)); }, files);
const read = f => p.evaluate(f => JSON.parse(localStorage.getItem('qa-fs:' + f) ?? 'null'), f);
const reload = async () => { await p.reload(); await p.getByText('Pool').first().waitFor(); };
const shot = name => p.screenshot({ path: `${out}/${name}.png` });
const text = () => p.locator('body').innerText();
const btn = name => p.getByRole('button', { name, exact: false }).first();
const radio = name => p.getByRole('radio', { name, exact: true });
const daily = (charges, lastGrantDay = TODAY, armed = false) => ({ firstDay: '2026-12-01', stars: {}, chalk: { charges, lastGrantDay, armed } });
const settings = { aiGame: 9, aiRace: 1, tier: 0, game: 9, race: 1 };
const homeLine = async () => (await text()).match(/Fresh Chalk: .*/)?.[0];
const chalkRow = async () => (await text()).match(/Fresh Chalk\s+\d+ left[^\n]*/)?.[0];

// 1. The home line and the grant: one a day, capped at 7.
for (const [seed, want] of [[daily(0), 0], [daily(2), 2], [daily(2, '2026-12-20'), 3], [daily(5, '2026-12-18'), 7]]) {
  await store({ 'daily.json': seed }); await reload();
  check(await homeLine() === `Fresh Chalk: ${want} · doubles the match pay of a quick match win`, `home line with ${seed.chalk.charges} charges granted ${seed.chalk.lastGrantDay}: ${want}`, await homeLine());
}
check(!/will double a win against the computer/.test(await text()), 'old home wording is gone');
await shot('01-home-line');

// 2. The setup row: hidden at 0 charges, shown with charges; arming saves and survives a reload.
await store({ 'daily.json': daily(0), 'settings.json': settings }); await reload();
await btn('Quick match').click(); await p.getByText('Rack them up').waitFor();
check(!(await chalkRow()) && !/Fresh Chalk/.test(await text()), 'quick match setup with 0 charges: no Fresh Chalk row');
await shot('02-setup-0-charges');
await store({ 'daily.json': daily(2), 'settings.json': settings }); await reload();
await btn('Quick match').click(); await p.getByText('Rack them up').waitFor();
check(/2 left\. Doubles the match pay of your next win, and stays on through a loss/.test(await text()), 'setup with 2 charges: row shown, "2 left"', await chalkRow());
check(await radio('Off').last().getAttribute('aria-checked') === 'true', 'row starts Off');
await shot('03-setup-2-charges-off');
await radio('On').last().click();
check(JSON.stringify((await read('daily.json')).chalk) === JSON.stringify({ charges: 2, lastGrantDay: TODAY, armed: true }), 'turning it On saves armed:true, spends nothing', (await read('daily.json')).chalk);
await shot('04-setup-armed');
await radio('Off').last().click();
check((await read('daily.json')).chalk.armed === false, 'turning it Off saves armed:false');
await radio('On').last().click(); await radio('On').last().click(); // twice: the same value again is a no-op
await reload(); await btn('Quick match').click(); await p.getByText('Rack them up').waitFor();
check(await radio('On').last().getAttribute('aria-checked') === 'true' && (await read('daily.json')).chalk.armed === true, 'after a reload the row is still On');

// 3. Real matches until a win, at most MATCHES: each loss keeps the charge armed; the win pays the match pay again.
const state = () => p.evaluate(() => {
  let top = [...document.querySelectorAll('div')].map(d => d[Object.keys(d).find(k => k.startsWith('__reactFiber'))]).filter(Boolean).pop();
  while (top?.return) top = top.return;
  const stack = [top]; let tab = null, view = null;
  while (stack.length) {
    const f = stack.pop(); if (!f) continue;
    if (f.tag === 0 || f.tag === 11 || f.tag === 15) for (let h = f.memoizedState; h && typeof h === 'object' && 'next' in h; h = h.next) {
      const c = h.memoizedState?.current;
      if (c?.B && c.ids && c.rules) tab = c; else if (c && typeof c.s === 'number' && 'ox' in c && 'land' in c) view = c;
    }
    stack.push(f.child, f.sibling);
  }
  if (!tab) return null;
  const r = tab.rules;
  return { B: tab.B.map(q => [q.x, q.y, q.on, Math.hypot(q.vx, q.vy)]), ids: tab.ids, balls: r.balls, turn: r.turn, phase: r.phase, choice: !!r.choice, rec: !!tab.rec, view: { s: view.s, ox: view.ox, oy: view.oy, land: view.land } };
});
// The rail in portrait (shotLayout, App's top = HUD of 9-ball 80, no safe-area insets on the web).
const rail = () => p.evaluate(() => { const r = [...document.querySelectorAll('div')].filter(d => { const b = d.getBoundingClientRect(); return b.width > 20 && b.width < 70 && b.height > 150 && b.left > innerWidth - 80; }).pop().getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; });
// Ghost ball on the lowest ball into the pocket with the smallest cut; the break goes full at the rack.
function aim(s) {
  const [cx, cy] = s.B[0], low = Math.min(...s.balls), [tx, ty] = s.B[s.ids.indexOf(low)];
  if (s.phase === 'break') return { ang: Math.atan2(ty - cy, tx - cx), power: 1 };
  let best = null;
  for (const [hx, hy] of HOLES) {
    const d = Math.hypot(hx - tx, hy - ty), ux = (hx - tx) / d, uy = (hy - ty) / d, gx = tx - 2 * P.R * ux, gy = ty - 2 * P.R * uy;
    const ang = Math.atan2(gy - cy, gx - cx), cut = Math.abs(Math.atan2(Math.sin(Math.atan2(uy, ux) - ang), Math.cos(Math.atan2(uy, ux) - ang)));
    if (cut < 1.2 && (!best || cut < best.cut)) best = { ang, cut, power: Math.min(0.9, 0.3 + 0.12 * (d + Math.hypot(gx - cx, gy - cy))) };
  }
  return best ?? { ang: Math.atan2(ty - cy, tx - cx), power: 0.5 };
}
async function strike(s) {
  const { ang, power } = aim(s), [cx, cy] = s.B[0], c = Math.cos(ang), n = Math.sin(ang);
  let d = 0.1; while (d < 3 && cx + (d + 0.01) * c > 0.15 && cx + (d + 0.01) * c < P.L - 0.15 && cy + (d + 0.01) * n > 0.15 && cy + (d + 0.01) * n < P.W - 0.15) d += 0.01;
  const t = toScreen(s.view, cx + d * c, cy + d * n);
  await p.mouse.click(t.x, t.y); await p.waitForTimeout(250);
  const r = await rail(), x = r.left + r.width / 2, y = r.top + 20;
  await p.mouse.move(x, y); await p.mouse.down();
  for (let i = 1; i <= 10; i++) await p.mouse.move(x, y + power * 0.75 * r.height * i / 10);
  await p.waitForTimeout(250); await p.mouse.up();
}
// Play until the results card; who = the seats the bot shoots for (pass and play: both).
async function playOut(who, minutes = 12) {
  for (let i = 0, end = Date.now() + minutes * 6e4; Date.now() < end; i++) {
    if (await p.getByText(/^(Rematch|Next rack)$/).count()) return true;
    const s = await state();
    if (process.env.QA_DEBUG) console.log(i, JSON.stringify(s && { turn: s.turn, phase: s.phase, rec: s.rec, choice: s.choice, moving: s.B.filter(q => q[2] && q[3] > 1e-4).length, balls: s.balls.join(','), cue: s.B[0].slice(0, 2).map(v => +v.toFixed(2)) }));
    if (!s || s.phase === 'over' || s.rec || s.B.some(q => q[2] && q[3] > 1e-4) || !who.includes(s.turn)) { await p.waitForTimeout(400); continue; }
    if (s.choice) { await p.getByText(/^(Shoot|Play it as it lies|Spot the 8 and play on)$/).first().click(); await p.waitForTimeout(300); continue; }
    await strike(s); await p.waitForTimeout(600);
  }
  return false;
}
const card = async () => { const all = await text(); return all.slice(all.search(/(Player 1|Rookie|Player 2) wins/)); };
let won = false;
for (let m = 1; m <= MATCHES && !won; m++) {
  const before = { daily: (await read('daily.json')).chalk, prof: await read('profile.json') ?? { xp: 0, coins: 0 } };
  if (m === 1) { await btn('Rack them up').click(); }
  await p.waitForTimeout(800);
  if (!(await playOut([0]))) { check(false, `match ${m} reached its end`); break; }
  const c = await card(), after = (await read('daily.json')).chalk, prof = await read('profile.json') ?? { xp: 0, coins: 0 };
  const pay = c.match(/\+(\d+) XP · \+(\d+) coins/).slice(1).map(Number), shots = c.match(/Shots \+(\d+) XP · \+(\d+) coins/).slice(1).map(Number);
  const fc = c.match(/Fresh Chalk: \+(\d+) XP · \+(\d+) coins/)?.slice(1).map(Number);
  won = /Player 1 wins/.test(c);
  console.log(`match ${m}: ${won ? 'won' : 'lost'} | ${c.replace(/\s+/g, ' ').slice(0, 160)}`);
  if (!won) {
    await shot(`05-loss-${m}`);
    check(!fc, `match ${m} lost: no Fresh Chalk line on the card`, c.slice(0, 120));
    check(after.charges === before.daily.charges && after.armed === true, `match ${m} lost: charge kept and still armed`, after);
    await btn('Rematch').click(); continue;
  }
  await shot('06-win-card');
  const mp = [pay[0] - shots[0], pay[1] - shots[1]].map(v => v / 2); // pay = match + shots + chalk, chalk = match
  check(!!fc && fc[0] === mp[0] && fc[1] === mp[1] && [[72, 48], [60, 40]].some(([x, y]) => x === fc[0] && y === fc[1]), 'win: "Fresh Chalk: +X XP · +Y coins" equals the Rookie match pay (72/48 clean, 60/40 with a foul)', { fc, pay, shots });
  const lvl = +(c.match(/Level \d+! \+(\d+) coins/)?.[1] ?? 0); // a level-up adds its own coins
  check(prof.xp - before.prof.xp === pay[0] && prof.coins - before.prof.coins === pay[1] + lvl, 'win: profile gains the whole card pay, chalk included', [before.prof.xp, prof.xp, before.prof.coins, prof.coins]);
  check(after.charges === before.daily.charges - 1 && after.armed === false, 'win: one charge spent and disarmed', after);
  await btn('Rematch').click(); await p.waitForTimeout(500);
  check((await read('daily.json')).chalk.armed === false, 'rematch after the win starts disarmed');
}
if (!won) console.log(`NOT VERIFIED: no win in ${MATCHES} matches, so the doubled pay was never seen`);

// 4. Back on the setup page after the matches: the row shows the charges left.
await reload(); await btn('Quick match').click(); await p.getByText('Rack them up').waitFor();
const left = (await read('daily.json')).chalk;
check(new RegExp(`${left.charges} left`).test(await text()) && await radio(left.armed ? 'On' : 'Off').last().getAttribute('aria-checked') === 'true', `setup after the matches: "${left.charges} left", ${left.armed ? 'On' : 'Off'}`, await chalkRow());
await shot('07-setup-after');

// 5. Pass and play, armed: a match to its end spends nothing and shows no chalk line.
await store({ 'daily.json': daily(2, TODAY, true), 'settings.json': settings }); await reload();
const prof0 = await read('profile.json');
await btn('Pass and play').click(); await btn('Rack them up').click(); await p.waitForTimeout(800);
if (await playOut([0, 1])) {
  const c = await card(); await shot('08-pass-play-card');
  check(!/Fresh Chalk/.test(c), 'pass and play: no Fresh Chalk line', c.slice(0, 120));
  check(JSON.stringify((await read('daily.json')).chalk) === JSON.stringify({ charges: 2, lastGrantDay: TODAY, armed: true }), 'pass and play: charge kept armed', (await read('daily.json')).chalk);
  const pr = await read('profile.json'), gain = [pr.xp - (prof0?.xp ?? 0), pr.coins - (prof0?.coins ?? 0)];
  check(/\+40 XP · \+20 coins/.test(c) && gain[0] === 40 && gain[1] === 20, 'pass and play: pays PASS_PLAY (+40 XP · +20 coins), not doubled', gain);
} else check(false, 'pass and play match reached its end');

const all = errors.filter(e => !/expo-file-system/.test(e));
check(!all.length, 'no page errors', all.slice(0, 5));
await b.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
