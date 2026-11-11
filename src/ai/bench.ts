// Think-time bench for the AI, callable from the app (hold Demo in the tools panel) and from Node (scripts/ai-bench.mjs).
// The first tier timed warms up the JIT and the caches, so it runs once more, uncounted, before the timed tiers start,
// so the first tier does not pay for the warm-up.
import { type Ball, simulate } from '../physics/engine.ts';
import { aiShot } from './aim.ts';
import { NINE, randomLayout, rng, SOLIDS, STRIPES, type Tier, TIERS } from './shot-ai.ts';

const pct = (a: number[], p: number) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
const ms = (a: number[]) => [0.5, 1].map((p) => pct(a, p).toFixed(1)).join('/');
const mk = (b: { x: number; y: number }): Ball => ({ x: b.x / 1000, y: b.y / 1000, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true });
function time(tier: Tier, n: number) {
  const rnd = rng(1), pick: number[] = [], aim: number[] = [];
  for (let i = 0; i < n; i++) {
    const { cue, balls } = randomLayout(rnd, 7), ids = [0, ...balls.map((b) => b.id)];
    const r = aiShot([cue, ...balls].map(mk), ids, SOLIDS, STRIPES, tier, rnd); pick.push(r.ms[0]); aim.push(r.ms[1]);
  }
  return `${tier.name.padEnd(8)} pick ${ms(pick)}  aim ${ms(aim)}`;
}
export function benchAI(n = 3) {
  time(TIERS[TIERS.length - 1], 1); // warm-up, not counted
  return [`ms p50/max over ${n} tables`, ...TIERS.map((t) => time(t, n))].join('\n');
}

// One AI visit on the engine from a seeded random table: it shoots until a shot does not pot a legal ball cleanly
// (a miss, a foul, a safety). 8-ball: 7 a side, AI on solids, then the 8. 9-ball: balls 1-9, lowest first, the 9 wins.
// shortcut: no ball in hand and no push out; a visit ends on the first foul, as one turn of the match would.
export function visit(tier: Tier, seed: number, nine = false) {
  const rnd = rng(seed), { cue, balls } = randomLayout(rnd, nine ? 4 : 7);
  let B = [cue, ...balls].map(mk);
  const ids = [0, ...balls.map((b, i) => (nine ? i + 1 : b.id))], think: number[] = [];
  let potted = 0, clear = false, first = false;
  for (let shot = 0; shot < 20; shot++) {
    const left = ids.filter((id, i) => i && B[i].on), own = SOLIDS.filter((id) => left.includes(id));
    const r = aiShot(B, ids, nine ? NINE : SOLIDS, nine ? NINE : STRIPES, tier, rnd);
    think.push(r.ms[0] + r.ms[1]);
    if (r.pick.type !== 'direct' && r.pick.type !== 'bank' && r.pick.type !== 'kick' && r.pick.type !== 'combo') break;
    const sim = simulate(B, r.shot, undefined, 30000), down = sim.potted.map((i) => ids[i]);
    const lowest = Math.min(...left), on = nine ? [lowest] : own.length ? own : [8];
    if (sim.scratch || sim.off.length || sim.first < 0 || !on.includes(ids[sim.first])) break;
    const good = nine ? down.length > 0 : down.some((id) => on.includes(id));
    if (!good || (!nine && down.includes(8) && own.length)) break; // the 8 down early loses the rack
    potted += nine ? down.length : down.filter((id) => on.includes(id)).length; first ||= shot === 0;
    if (down.includes(nine ? 9 : 8)) { clear = true; break; }
    B = sim.balls.map((b) => ({ ...b, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0 }));
  }
  return { potted, clear, first, think };
}
