// Cost of the work the app does on the JS thread: one frame of play (engine steps + ball turning) and one aim update.
// Run: node scripts/frame-bench.mjs [budget]   budget = the predict budget for the aim rows (default: none).
// Hermes on the phone has no JIT. For figures without one, strip the types first (node --jitless cannot) and run the copies with --jitless.
import { CUE, P, predict, rack, strike } from '../src/physics/engine.ts';
import { advance, newLook } from '../src/render/balls.ts';

const mk = (x, y) => ({ x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true });
const table = () => [mk(P.L / 4, P.W / 2), ...rack(8).map(([, x, y]) => mk(x, y))];
const pct = (a, p) => a.sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
const row = (name, a) => console.log(name.padEnd(40), `p50 ${pct(a, 0.5).toFixed(2)}  p95 ${pct(a, 0.95).toFixed(2)}  max ${pct(a, 1).toFixed(2)} ms  (${a.length} samples)`);

for (const [name, shot, hz] of [['break 12 m/s, 60 Hz frames', { ang: 0, speed: CUE.breakSpeed, a: 0, b: 0 }, 60], ['break 12 m/s, 120 Hz frames', { ang: 0, speed: CUE.breakSpeed, a: 0, b: 0 }, 120], ['soft shot 1.5 m/s, 60 Hz frames', { ang: 0.02, speed: 1.5, a: 0.2, b: -0.2 }, 60]]) {
  const B = table(), look = newLook(B), ms = []; strike(B[0], shot);
  let run = true, owed = 0;
  while (run) { owed += 1000 / hz; const n = Math.floor(owed); owed -= n; const t = performance.now(); run = advance(B, look, n, run); ms.push(performance.now() - t); }
  row('play: ' + name, ms);
}
{ // Aiming: the finger sweeps the aim round the table at mid power; each touch event asks for a new guide.
  const B = table(), ms = [];
  for (let k = 0; k < 240; k++) { const shot = { ang: k / 240 * 2 * Math.PI, speed: 0.5 * CUE.breakSpeed, a: 0, b: 0 }; const t = performance.now(); predict(B, shot, 0.4, undefined, undefined, +process.argv[2] || Infinity); ms.push(performance.now() - t); }
  row('aim: one guide, racked table', ms);
  const S = [mk(0.3, 0.3), mk(1.9, 0.9)], m2 = [];
  for (let k = 0; k < 240; k++) { const shot = { ang: k / 240 * 2 * Math.PI, speed: 0.6 * CUE.maxSpeed, a: 0, b: 0 }; const t = performance.now(); predict(S, shot, 0.4, undefined, undefined, +process.argv[2] || Infinity); m2.push(performance.now() - t); }
  row('aim: one guide, 2 balls (mostly misses)', m2);
}
