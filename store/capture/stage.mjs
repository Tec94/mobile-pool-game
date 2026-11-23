import { chromium, open, PROFILE, SETTINGS, plan, aimAt, load } from './lib.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
const s = JSON.parse(readFileSync(new URL('state0.json', import.meta.url), 'utf8'));
const POS = { 0: [1.62, 0.98], 13: [1.84, 0.33], 15: [0.55, 0.86], 8: [0.98, 0.52], 9: [1.20, 0.95], 3: [0.40, 0.28], 11: [1.06, 0.17], 2: [0.24, 0.96], 5: [2.02, 0.80], 14: [0.74, 0.66] };
const OFF = [10, 12];
s.B.forEach((b, k) => { const id = s.ids[k], p = POS[id]; if (p) { b.on = true; b.x = p[0]; b.y = p[1]; b.vx = b.vy = b.wx = b.wy = b.wz = 0; } else if (id) b.on = false; });
s.rules.balls = s.ids.filter((id, k) => id && s.B[k].on).sort((a, b) => a - b);
const json = JSON.stringify(s);
const b = await chromium.launch();
const files = { 'profile.json': { ...PROFILE, cue: 'house' }, 'settings.json': { ...SETTINGS, tier: 5 } };
for (const [size, w, h] of [['69', 440, 956], ['63', 402, 874]]) {
  mkdirSync(`raw/${size}`, { recursive: true });
  const p = await open(b, w, h, files, 3);
  await p.getByText('Play', { exact: true }).first().click(); await p.waitForTimeout(2000);
  await load(p, json);
  const c = await plan(p, 3, 45, [13]); console.log(size, c.map(x => [x.id, x.j, Math.round(x.cut)]));
  await aimAt(p, c[0]);
  await p.evaluate(() => { const g = globalThis.__g; g.tip.set({ x: 0, y: -0.45, elev: 0 }); g.dirty(); }); await p.waitForTimeout(800);
  await p.screenshot({ path: `raw/${size}/play.png` });
  await p.close();
}
await b.close();
