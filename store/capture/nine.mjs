import { chromium, open, PROFILE, SETTINGS, load, save } from './lib.mjs';
import { mkdirSync } from 'node:fs';
const b = await chromium.launch();
const files = { 'profile.json': { ...PROFILE }, 'settings.json': { ...SETTINGS, tier: 5, aiGame: 9 } };
const POS = { 0: [1.42, 0.60], 5: [1.06, 0.59], 4: [0.66, 0.545], 6: [0.25, 0.30], 7: [1.90, 0.95], 8: [0.45, 0.98], 9: [0.16, 0.62] };
for (const [size, w, h] of (process.argv[2] === 'all' ? [['69', 440, 956], ['63', 402, 874]] : [['69', 440, 956]])) {
  mkdirSync(`raw/${size}`, { recursive: true });
  const p = await open(b, w, h, files, process.argv[2] === 'all' ? 3 : 1);
  await p.getByText('Play', { exact: true }).first().click(); await p.waitForTimeout(2000);
  const s = JSON.parse(await save(p));
  s.B.forEach((b, k) => { const id = s.ids[k], q = POS[id]; if (q) { b.on = true; b.x = q[0]; b.y = q[1]; b.vx = b.vy = b.wx = b.wy = b.wz = 0; } else if (id) b.on = false; });
  s.rules = { ...s.rules, phase: 'play', turn: 0, hand: false, balls: [4, 5, 6, 7, 8, 9] };
  await load(p, JSON.stringify(s));
  // aim down-table past the 5, curving round it to the 4
  const ang = +(process.argv[3] ?? Math.PI + 0.32);
  await p.evaluate(a => { const g = globalThis.__g; g.shot.set({ aim: a }); g.tip.set({ x: 0.7, y: -0.3, elev: 62 }); g.dirty(); }, ang); await p.waitForTimeout(900);
  await p.screenshot({ path: `raw/${size}/spin.png` }); await p.close();
}
await b.close();
