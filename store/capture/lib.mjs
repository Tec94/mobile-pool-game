import { createRequire } from 'node:module';
export const { chromium } = createRequire(import.meta.url)('playwright');
export const PROFILE = { xp: 7400, coins: 3420, owned: ['house','ironwood','whisper','banker','surveyor','ratchet','optic','twig','star','daybreak','sixseven','aura','marquise'], cue: 'star', feats: {}, mastery: {}, trophies: [3, 2, 0, 0] };
export const SETTINGS = { names: ['You', 'Sam'], tier: 3, aiGame: 8, aiRace: 3, game: 8, race: 3, callAll: true };
export async function open(b, w, h, files = {}, scale = 3) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('http://localhost:8765/?ins=' + (globalThis.INS ?? '62,0,34,0'));
  await p.evaluate(f => { localStorage.clear(); for (const [k, v] of Object.entries(f)) localStorage.setItem('qa-fs:' + k, JSON.stringify(v)); }, files);
  await p.reload(); await p.getByText('Quick match').first().waitFor({ timeout: 60000 }); await p.waitForTimeout(800);
  return p;
}
// Pick a pot for the player: a legal ball, a pocket, a cut between lo and hi degrees, clear paths. Returns screen points.
export const plan = (p, lo = 12, hi = 35, prefer = null) => p.evaluate(([lo, hi, prefer]) => {
  const g = globalThis.__g, t = g.table.current, v = g.view, R = 0.028575, L = 2.2352, W = 1.1176;
  const toS = (x, y) => v.land ? { x: v.ox + x * v.s, y: v.oy + (W - y) * v.s } : { x: v.ox + (W - y) * v.s, y: v.oy + (L - x) * v.s };
  const pk = [[0,0],[L/2,-0.01],[L,0],[0,W],[L/2,W+0.01],[L,W]];
  const legal = t.rules.balls ?? []; const cue = t.B[0]; const best = [];
  const clear = (a, b, skip) => t.B.every((o, k) => { if (!o.on || skip.includes(k)) return true; const dx = b[0]-a[0], dy = b[1]-a[1], l2 = dx*dx+dy*dy, u = Math.max(0, Math.min(1, ((o.x-a[0])*dx+(o.y-a[1])*dy)/l2)); return Math.hypot(a[0]+u*dx-o.x, a[1]+u*dy-o.y) > 2.05*R; });
  t.B.forEach((o, k) => { const id = t.ids[k]; if (!k || !o.on || (legal.length && !legal.includes(id)) || id === 8 || (prefer && !prefer.includes(id))) return;
    pk.forEach((q, j) => { const d = Math.hypot(q[0]-o.x, q[1]-o.y), ux = (q[0]-o.x)/d, uy = (q[1]-o.y)/d, gx = o.x-2*R*ux, gy = o.y-2*R*uy;
      const cx = gx-cue.x, cy = gy-cue.y, cl = Math.hypot(cx, cy), cut = Math.acos(Math.max(-1, Math.min(1, (cx*ux+cy*uy)/cl)))*180/Math.PI;
      if (cut < lo || cut > hi || !clear([cue.x,cue.y],[gx,gy],[0,k]) || !clear([o.x,o.y],q,[k])) return;
      best.push({ id, j, cut, d, cl, ang: Math.atan2(cy, cx), pocket: toS(q[0], q[1]), ball: toS(o.x, o.y) }); }); });
  best.sort((a, b) => (a.d + a.cl) - (b.d + b.cl)); return best;
}, [lo, hi, prefer]);
export async function aimAt(p, c) {
  await p.mouse.click(c.pocket.x, c.pocket.y); await p.waitForTimeout(300);
  await p.evaluate(a => { const g = globalThis.__g; g.shot.set({ aim: a }); g.dirty(); }, c.ang); await p.waitForTimeout(700);
}
export const save = p => p.evaluate(() => { const t = globalThis.__g.table.current; return JSON.stringify({ B: t.B, ids: t.ids, rules: t.rules }); });
export async function load(p, json) {
  await p.evaluate(j => { const g = globalThis.__g, t = g.table.current, s = JSON.parse(j); t.B.forEach((b, k) => Object.assign(b, s.B[k])); t.rules = s.rules; g.paint(); g.redraw(); g.dirty(); }, json);
  await p.waitForTimeout(800);
}
