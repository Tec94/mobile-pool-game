// Run: npm test   (the simulation must give the same bits on every JS engine, or two phones playing online see
// different tables: see "Exact maths" in engine.ts)
import assert from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { acos, asin, atan2, breakSpot, cos, CUE, exp, rack, simulate, sin, tan } from './engine.ts';
const GOLDEN = ['882fbf8d81ae26b1', 'd7e2b7ab7ecb54f7', '52014e697c8303ec', '25080c56067516c8'];
let n = 0; const ok = name => console.log(`ok ${++n} ${name}`);

// 1. The exact functions agree with Math's to the last few bits.
{ const near = (a, b, what) => assert(Math.abs(a - b) <= 4e-15 * Math.max(1, Math.abs(b)), `${what}: ${a} vs ${b}`);
  for (let i = -4000; i <= 4000; i++) {
    const x = i * 0.00317;
    near(sin(x), Math.sin(x), `sin ${x}`); near(cos(x), Math.cos(x), `cos ${x}`); near(exp(-Math.abs(x) * 3), Math.exp(-Math.abs(x) * 3), `exp ${x}`);
    if (Math.abs(Math.cos(x)) > 0.05) near(tan(x), Math.tan(x), `tan ${x}`);
    const c = Math.cos(x * 7.1), s = Math.sin(x * 7.1) * (1 + (i & 7));
    near(atan2(s, c), Math.atan2(s, c), `atan2 ${s} ${c}`);
    const u = i / 4000; near(acos(u), Math.acos(u), `acos ${u}`); near(asin(u), Math.asin(u), `asin ${u}`);
  }
  for (const [y, x] of [[0, 1], [0, -1], [-0, -1], [1, 0], [-1, 0], [0, 0]]) near(atan2(y, x), Math.atan2(y, x), `atan2 ${y} ${x}`);
  ok('exact sin, cos, tan, atan2, acos, asin, exp match Math'); }

// 2. No engine-dependent maths in the files that decide where balls go and what the rules say.
{ const banned = /Math\.(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log2|log10|log1p|pow|cbrt|hypot|random)\b|\*\*/;
  for (const f of ['engine.ts', '../rules/rules.ts']) {
    const code = readFileSync(new URL(f, import.meta.url), 'utf8').split('\n').map(l => l.replace(/\/\/.*$/, ''));
    code.forEach((l, i) => assert(!banned.test(l), `${f}:${i + 1} uses ${l.match(banned)?.[0]}: use the exact maths in engine.ts`));
  }
  ok('engine and rules use only exact maths'); }

// 3. Golden shots: every ball's final state, bit for bit. A new hash here means every device must update together,
// so change it only on purpose (a physics change), never to make a test pass on one machine.
{ const table = (game, shot) => {
    const [x, y] = breakSpot(), B = [[0, x, y], ...rack(game)].map(([, bx, by]) => ({ x: bx, y: by, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true }));
    const r = simulate(B, shot); assert(r.steps > 500, 'the shot did not play');
    return createHash('sha256').update(Buffer.from(new Float64Array(r.balls.flatMap(b => [b.x, b.y, b.on ? 1 : 0])).buffer)).digest('hex').slice(0, 16);
  };
  const got = [
    table(8, { ang: 0.013, speed: CUE.breakSpeed, a: 0.1, b: 0.2 }),          // hard break, side and top spin
    table(9, { ang: -0.021, speed: 9, a: -0.3, b: -0.2 }),                     // 9-ball break with draw
    table(8, { ang: 0.4, speed: 3.1, a: 0.35, b: -0.3, elev: 0.6 }),           // raised cue: jump and swerve
    table(9, { ang: 2.9, speed: 4.2, a: -0.4, b: 0.1, elev: 1.2 }),            // masse off the back rail
  ];
  assert.deepStrictEqual(got, GOLDEN, `golden shots changed: ${JSON.stringify(got)}`);
  ok('golden shots give the same bits'); }
