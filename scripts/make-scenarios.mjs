// Writes src/scenarios/data.ts: 12 tables for each of the nine scenario packs. Run: npm run scenarios (about a minute).
// Each table is drawn from a seeded random layout, its shot found by the AI's geometry (enumerate) or by a scan, then
// measured on the engine: the aim window that clears it gives the reference aim (its middle) and the difficulty (tol,
// half its width). A pack keeps 12 of its candidates spread from easiest to hardest. Same seed, same file.
import { writeFileSync } from 'node:fs';
import { CUE, P, step, strike } from '../src/physics/engine.ts';
import { enumerate, rng } from '../src/ai/shot-ai.ts';
import { LESSONS, newLessonRec, noteLesson, lessonTable, verdict } from '../src/learn/lessons.ts';
import { PACKS } from '../src/progress/profile.ts';
import { shotTip } from '../src/render/tip.ts';

const R = P.R, H2P = [0, 4, 1, 2, 5, 3]; // pocket index of the AI (POCKETS) -> the engine's (HOLES)
const L = id => LESSONS.find(l => l.id === id);
const r3 = v => Math.round(v * 1000) / 1000;
const rnd = rng(20261111);

function sim(s, ang) {
  const { B, ids } = lessonTable(s), r = newLessonRec(), ev = [];
  strike(B[0], { ang, speed: s.ref.power * CUE.maxSpeed, ...shotTip(s.ref.tip) });
  for (let i = 0; i < 40000; i++) { ev.length = 0; const mv = step(B, ev); noteLesson(r, ev, B, ids); if (!mv) break; }
  return { ok: verdict(s, r, B[0]).ok, cue: B[0] };
}
// The run of clearing aims around a0 (coarse scan, then the edges by bisection): its middle and half width.
function window(s, a0, span = 0.03, d = 0.0005) {
  let hit = null;
  for (let k = 0; k <= span / d && hit === null; k++) for (const a of k ? [a0 + k * d, a0 - k * d] : [a0]) if (sim(s, a).ok) { hit = a; break; }
  if (hit === null) return null;
  const edge = dir => { let a = hit, b = hit + dir * d; while (sim(s, b).ok) { a = b; b += dir * d; if (Math.abs(b - hit) > 0.3) break; } for (let i = 0; i < 8; i++) { const m = (a + b) / 2; if (sim(s, m).ok) a = m; else b = m; } return a; };
  const lo = edge(-1), hi = edge(1);
  return { mid: (lo + hi) / 2, tol: (hi - lo) / 2 };
}
// A free spot on the cloth, clear of the cushions and of the balls already placed.
function spot(taken, x0 = 0.1, x1 = P.L - 0.1, y0 = 0.1, y1 = P.W - 0.1) {
  for (;;) {
    const p = [r3(x0 + rnd() * (x1 - x0)), r3(y0 + rnd() * (y1 - y0))];
    if (p[0] > 0.1 && p[0] < P.L - 0.1 && p[1] > 0.1 && p[1] < P.W - 0.1 && taken.every(q => Math.hypot(q[0] - p[0], q[1] - p[1]) > 2 * R + 0.03)) return p;
  }
}
const mm = ([x, y], id) => ({ id, x: x * 1000, y: y * 1000 });
const deg = c => c * 180 / Math.PI;

// One candidate table of a pack, or null. A scenario has the fields of a lesson plus type.
const TIP0 = { x: 0, y: 0, elev: 0 };
function potShot(kind) {
  const cue = spot([]), one = spot([cue]), extra = kind === 'cut' || kind === 'pots' ? [] : [spot([cue, one])];
  if (kind === 'kick') { const t = 0.35 + 0.3 * rnd(); extra[0] = [r3(cue[0] + (one[0] - cue[0]) * t), r3(cue[1] + (one[1] - cue[1]) * t)]; } // the 2 sits on the line
  const balls = [[1, ...one], ...extra.map(p => [2, ...p])];
  if (balls.some(([, x, y], i) => [cue, ...balls.slice(0, i).map(b => b.slice(1))].some(q => Math.hypot(q[0] - x, q[1] - y) < 2 * R + 0.01))) return null;
  const want = { pots: 'direct', cut: 'direct', bank: 'bank', position: 'direct', kick: 'kick' }[kind];
  const c = enumerate(mm(cue), balls.map(([id, x, y]) => mm([x, y], id)), [1]).filter(c => c.type === want && c.ball === 1)
    .filter(c => kind === 'pots' ? deg(c.cut) < 20 : kind === 'cut' ? deg(c.cut) > 30 && deg(c.cut) < 65 : deg(c.cut) < 50)[0];
  if (!c) return null;
  const power = { pots: 0.4, cut: 0.45, bank: 0.55, position: 0.45, kick: 0.6 }[kind];
  const tips = [TIP0, { x: 0, y: -0.6, elev: 0 }, { x: 0, y: 0.5, elev: 0 }];
  const tip = kind === 'position' ? tips[Math.floor(rnd() * 3)] : TIP0;
  return { cue, balls, goal: { pot: 1, pocket: H2P[c.pocket], ...(kind === 'kick' && { kick: true }) }, ref: { ang: c.aim, power: tip.y < 0 ? 0.6 : power, tip }, type: want };
}
function combo(nine) {
  const cue = spot([]), a = spot([cue]), b = spot([cue, a], a[0] - 0.4, a[0] + 0.4, a[1] - 0.4, a[1] + 0.4), id = nine ? 9 : 2;
  const balls = [[1, ...a], [id, ...b]];
  if (nine) balls.push([2, ...spot([cue, a, b])]);
  const c = enumerate(mm(cue), balls.map(([i, x, y]) => mm([x, y], i)), [1], [id]).find(c => c.type === 'combo' && c.ball === id && deg(c.cut) < 50);
  return c && { cue, balls, goal: { first: 1, pot: id, pocket: H2P[c.pocket] }, ref: { ang: c.aim, power: 0.5, tip: TIP0 }, type: 'combo' };
}
// A safety: a thin, soft hit on the 1 that leaves the 2 between the cue ball and the 1.
function safety() {
  const one = spot([]), two = spot([one], one[0] - 0.35, one[0] + 0.35, one[1] - 0.35, one[1] + 0.35), cue = spot([one, two]);
  const s = { cue, balls: [[1, ...one], [2, ...two]], goal: { first: 1, safe: true }, ref: { ang: 0, power: 0.25, tip: TIP0 }, type: 'direct' };
  const at = Math.atan2(one[1] - cue[1], one[0] - cue[0]), half = Math.asin(Math.min(1, 2 * R / Math.hypot(one[0] - cue[0], one[1] - cue[1])));
  for (const f of [0.9, -0.9, 0.75, -0.75]) {
    const ang = at + f * half, r = sim(s, ang);
    if (!r.ok) continue;
    const [x, y] = [r.cue.x, r.cue.y], dx = one[0] - x, dy = one[1] - y, t = Math.max(0, Math.min(1, ((two[0] - x) * dx + (two[1] - y) * dy) / (dx * dx + dy * dy)));
    if (Math.hypot(x + t * dx - two[0], y + t * dy - two[1]) < 2 * R) return { ...s, goal: { ...s.goal, zone: [r3(x), r3(y), 0.16] }, ref: { ...s.ref, ang } }; // hidden
  }
  return null;
}
// A jump or a massé: the 2 sits between the cue ball and the 1.
function trick(jump) {
  const cue = spot([], 0.3, P.L - 0.9), d = jump ? 0.45 + 0.3 * rnd() : 0.45 + 0.2 * rnd(), a = (rnd() - 0.5) * 1.2;
  const one = [r3(cue[0] + d * Math.cos(a)), r3(cue[1] + d * Math.sin(a))], t = jump ? 0.3 + 0.2 * rnd() : 0.45 + 0.1 * rnd();
  const two = [r3(cue[0] + (one[0] - cue[0]) * t), r3(cue[1] + (one[1] - cue[1]) * t)];
  if (one[0] > P.L - 0.1 || one[1] < 0.1 || one[1] > P.W - 0.1) return null;
  const side = rnd() < 0.5 ? 1 : -1, tip = jump ? { x: 0, y: 0, elev: 40 } : { x: 0.6 * side, y: 0, elev: 65 };
  const s = { cue, balls: [[2, ...two], [1, ...one]], goal: { first: 1 }, ref: { ang: a, power: jump ? 0.9 : 0.5, tip }, type: 'direct' };
  if (!jump) for (let k = 1; k < 120; k++) { const g = a - side * k * 0.01; if (sim(s, g).ok) return { ...s, ref: { ...s.ref, ang: g } }; } // a massé curves toward its side: aim the other way
  return jump ? s : null;
}

const SAY = {
  pots: ['Pot the 1 in the marked pocket.', L('aim')], cut: ['Cut the 1 into the marked pocket.', L('aim')], bank: ['Bank the 1 into the marked pocket.', L('bank')],
  position: ['Pot the 1 and stop the cue ball in the ring.', L('position')], nine: ['Hit the 1 first and send it into the 9. Pot the 9.', L('combo')],
  combo: ['Hit the 1 into the 2 and pot the 2.', L('combo')], kick: ['The 2 is in the way. Go off a cushion and pot the 1.', L('kick')],
  safety: ['Hit the 1, pot nothing, and hide the cue ball in the ring behind the 2.', L('safety')],
  jump: ['Jump the cue ball over the 2 and hit the 1 first.', L('jump')], masse: ['Curve the cue ball around the 2 to hit the 1 first.', L('masse')],
};
const PACK_KIND = ['pots', 'cut', 'bank', 'position', 'nine', 'combo', 'kick', 'safety', 'trick'];
const make = kind => kind === 'nine' || kind === 'combo' ? combo(kind === 'nine') : kind === 'safety' ? safety() : kind === 'trick' ? trick(rnd() < 0.5) : potShot(kind);

const out = [];
PACKS.forEach(([name], pack) => {
  const kind = PACK_KIND[pack], got = [];
  for (let tries = 0; got.length < 36 && tries < 4000; tries++) {
    const c = make(kind);
    if (!c) continue;
    const k = kind === 'trick' ? (c.ref.tip.elev === 40 ? 'jump' : 'masse') : kind, [say, from] = SAY[k];
    let s = { id: '', title: '', say, how: from.how, ...(from.short && { short: from.short, long: from.long }), ...c };
    let w = window(s, c.ref.ang);
    if (!w || w.tol < 0.0002) continue;
    if (kind === 'position') { // the ring is where the reference shot leaves the cue ball
      const end = sim(s, w.mid).cue;
      s = { ...s, goal: { ...s.goal, zone: [r3(end.x), r3(end.y), 0.15] } };
      if (!(w = window(s, w.mid)) || w.tol < 0.0002) continue;
    }
    s.ref = { ...s.ref, ang: Math.round(w.mid * 1e5) / 1e5 };
    if (!sim(s, s.ref.ang).ok) continue;
    got.push({ ...s, pack, tol: Math.round(w.tol * 1e5) / 1e5 });
  }
  if (got.length < 12) throw new Error(`${name}: only ${got.length} tables`);
  got.sort((a, b) => b.tol - a.tol);
  for (let i = 0; i < 12; i++) {
    const s = got[Math.round(i * (got.length - 1) / 11)], slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    out.push({ ...s, id: `${slug}-${i + 1}`, title: `${name} ${i + 1}` });
  }
  console.log(name, got.length, 'candidates, tol', got[0].tol, 'to', got.at(-1).tol);
});

const lines = out.map(({ id, title, say, how, short, long, cue, balls, goal, ref, pack, tol, type }) => '  ' + JSON.stringify({ id, title, pack, type, tol, say, how, short, long, cue, balls, goal, ref }));
writeFileSync(new URL('../src/scenarios/data.ts', import.meta.url), `// Made by scripts/make-scenarios.mjs: do not edit by hand. Each reference shot clears its table on the engine (scenarios.test.mjs).
import type { Scenario } from './scenarios.ts';

export const SCENARIOS: Scenario[] = [
${lines.join(',\n')},
];
`);
