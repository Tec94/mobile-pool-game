// How long the AI takes to pick a shot, per tier: `n` seeded random full 8-ball tables (7 balls a group, AI on solids).
// pick = the geometric search (decide), aim = the aim correction and the tier's rollouts on the engine (refine). Runs on
// the calling thread: on the phone it blocks the JS thread for the whole run. One table is played first and not counted,
// so the first tier does not pay for the warm-up.
import { type Ball } from '../physics/engine.ts';
import { aiShot } from './aim.ts';
import { randomLayout, rng, SOLIDS, STRIPES, type Tier, TIERS } from './shot-ai.ts';

const pct = (a: number[], p: number) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
const ms = (a: number[]) => [0.5, 1].map((p) => pct(a, p).toFixed(1)).join('/');
function time(tier: Tier, n: number) {
  const rnd = rng(1), pick: number[] = [], aim: number[] = [];
  for (let i = 0; i < n; i++) {
    const { cue, balls } = randomLayout(rnd, 7), ids = [0, ...balls.map((b) => b.id)];
    const B: Ball[] = [cue, ...balls].map((b) => ({ x: b.x / 1000, y: b.y / 1000, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true }));
    const r = aiShot(B, ids, SOLIDS, STRIPES, tier, rnd); pick.push(r.ms[0]); aim.push(r.ms[1]);
  }
  return `${tier.name.padEnd(8)} pick ${ms(pick)}  aim ${ms(aim)}`;
}
export function benchAI(n = 3) {
  time(TIERS[TIERS.length - 1], 1); // warm-up, not counted
  return [`ms p50/max over ${n} tables`, ...TIERS.map((t) => time(t, n))].join('\n');
}
