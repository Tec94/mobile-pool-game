// Writes src/learn/variants.ts: for each lesson, tables its solo step deals one by one (Jack: every practice shot from a
// new position, so the player has to think each time). Run: npm run lesson-variants. Same seed, same file.
// A variant is the lesson's table mirrored (either axis or both) and its balls nudged. Its shot is found on the engine
// with the lesson's own spin and power: the middle of the aim window that passes is its reference aim, and a ring
// lesson's ring moves to where that shot leaves the cue ball. A variant is kept only if it passes what every lesson
// must (lessons.test.mjs: a tenth of a degree and 3% of power either side), and still needs the lesson's skill: a
// level centre-ball hit passes it at no more aims than it passes the lesson (spin lessons), and the 2 still blocks the
// straight line to the 1 (kick, jump, massé).
import { writeFileSync } from 'node:fs';
import { CUE, HOLES, P, step, strike } from '../src/physics/engine.ts';
import { rng } from '../src/ai/shot-ai.ts';
import { LESSONS, lessonTable, newLessonRec, noteLesson, verdict } from '../src/learn/lessons.ts';
import { shotTip } from '../src/render/tip.ts';

const PER = 8, R = P.R, r3 = v => Math.round(v * 1000) / 1000, r5 = v => Math.round(v * 1e5) / 1e5, rnd = rng(20261113);
const LEVEL = { x: 0, y: 0, elev: 0 };

function play(l, ang, power = l.ref.power, tip = l.ref.tip) {
  const { B, ids } = lessonTable(l), r = newLessonRec(), ev = [];
  strike(B[0], { ang, speed: power * CUE.maxSpeed, ...shotTip(tip) });
  for (let i = 0; i < 40000; i++) { ev.length = 0; const mv = step(B, ev); noteLesson(r, ev, B, ids); if (!mv) break; }
  return { ok: verdict(l, r, B[0]).ok, cue: [B[0].x, B[0].y] };
}
// The run of passing aims nearest a0: its middle and half width (coarse scan out from a0, then the edges by bisection).
function window(l, a0, span = 0.2, d = 0.0005) {
  let hit = null;
  for (let k = 0; k <= span / d && hit === null; k++) for (const a of k ? [a0 + k * d, a0 - k * d] : [a0]) if (play(l, a).ok) { hit = a; break; }
  if (hit === null) return null;
  const edge = dir => { let a = hit, b = hit + dir * d; while (play(l, b).ok) { a = b; b += dir * d; if (Math.abs(b - hit) > 0.3) break; } for (let i = 0; i < 8; i++) { const m = (a + b) / 2; if (play(l, m).ok) a = m; else b = m; } return a; };
  const lo = edge(-1), hi = edge(1);
  return { mid: (lo + hi) / 2, tol: (hi - lo) / 2 };
}
// The pocket a mirror sends pocket k to.
const hole = (fx, fy) => k => HOLES.findIndex(h => Math.hypot(h[0] - fx(HOLES[k][0]), h[1] - fy(HOLES[k][1])) < 1e-6);
// Is the straight line from the cue ball to the 1 blocked by another ball?
function blocked(l) {
  const [cx, cy] = l.cue, [, ox, oy] = l.balls.find(b => b[0] === 1), dx = ox - cx, dy = oy - cy, n = Math.hypot(dx, dy);
  return l.balls.some(([id, x, y]) => { if (id === 1) return false; const t = ((x - cx) * dx + (y - cy) * dy) / n; return t > 0 && t < n && Math.abs((x - cx) * dy - (y - cy) * dx) / n < 2 * R; });
}

// Aims within 0.03 rad of the shot at which a level centre-ball hit passes: a spin lesson's variant may not be easier.
function level(l) { let n = 0; for (let k = -60; k <= 60; k++) if (play(l, l.ref.ang + k * 0.0005, l.ref.power, LEVEL).ok) n++; return n; }

function variant(l, base) {
  const mx = rnd() < 0.5, my = rnd() < 0.5, fx = x => mx ? P.L - x : x, fy = y => my ? P.W - y : y, pk = hole(fx, fy);
  const nudge = (v, s) => r3(v + (rnd() * 2 - 1) * s), m = 0.09, inside = ([x, y]) => x > m && x < P.L - m && y > m && y < P.W - m;
  const cue = [nudge(fx(l.cue[0]), 0.15), nudge(fy(l.cue[1]), 0.15)], balls = l.balls.map(([id, x, y]) => [id, nudge(fx(x), 0.07), nudge(fy(y), 0.07)]);
  const all = [cue, ...balls.map(b => b.slice(1))];
  if (!all.every(inside) || all.some((p, i) => all.some((q, j) => j > i && Math.hypot(p[0] - q[0], p[1] - q[1]) < 2 * R + 0.02))) return null;
  const flip = mx !== my, g = l.goal, tip = { ...l.ref.tip, x: flip ? -l.ref.tip.x : l.ref.tip.x };
  let ang = l.ref.ang; if (my) ang = -ang; if (mx) ang = Math.PI - ang;
  const v = { ...l, cue, balls, goal: { ...g, ...(g.pocket !== undefined && { pocket: pk(g.pocket) }), ...(g.zone && { zone: undefined }) }, ref: { ...l.ref, ang, tip } };
  if (['kick', 'jump', 'masse'].includes(l.id) && !blocked(v)) return null;
  const w = window(v, ang);
  if (!w || w.tol < 0.003) return null;
  v.ref = { ...v.ref, ang: r5(w.mid) };
  if (g.zone) {
    const end = play(v, v.ref.ang).cue;
    if (!inside(end)) return null;
    v.goal = { ...v.goal, zone: [r3(end[0]), r3(end[1]), g.zone[2]] };
  } else delete v.goal.zone;
  // what lessons.test.mjs asks of every lesson
  if (![0, -0.002, 0.002].every(d => play(v, v.ref.ang + d).ok) || ![-0.03, 0.03].every(d => play(v, v.ref.ang, v.ref.power + d).ok)) return null;
  if (base !== null && level(v) > base) return null;
  const { short, long, ...keep } = v; // a variant carries only what differs from its lesson
  return { cue: keep.cue, balls: keep.balls, goal: keep.goal, ref: keep.ref };
}

const out = {};
for (const l of LESSONS) {
  const t = l.ref.tip, b = l.goal.zone && (t.x || t.y || t.elev) ? level(l) : null, got = [];
  for (let tries = 0; got.length < PER && tries < 400; tries++) { const v = variant(l, b); if (v) got.push(v); }
  out[l.id] = got;
  console.log(`${l.id}: ${got.length} variants`);
}
writeFileSync(new URL('../src/learn/variants.ts', import.meta.url),
  `// Made by scripts/make-lesson-variants.mjs: do not edit by hand. Each variant passes as its lesson must (lessons.test.mjs).\n` +
  `import type { Lesson } from './lessons.ts';\n\n` +
  `export const VARIANTS: Record<string, Pick<Lesson, 'cue' | 'balls' | 'goal' | 'ref'>[]> = {\n` +
  Object.entries(out).map(([id, vs]) => `  ${JSON.stringify(id)}: [\n${vs.map(v => `    ${JSON.stringify(v)},`).join('\n')}\n  ],`).join('\n') + '\n};\n');
