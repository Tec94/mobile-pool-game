// How long the AI takes to pick a shot, per tier, on `n` seeded random full 8-ball tables (7 balls a group, AI on solids),
// from the app (hold Demo in the tools panel) or Node (scripts/ai-bench.mjs). It runs on the calling thread, so on the
// phone it blocks the JS thread for the whole run. pick = the geometric search (decide), aim = the aim correction and
// the rollouts on the engine (refine). One uncounted table runs first, so the first tier does not pay for the warm-up.
import { type Ball, type Ev, HOLES, P, simulate, step, strike } from '../physics/engine.ts';
import { cushionAt, ENDS } from '../rules/rules.ts';
import { holeOf, kindOf, onLit } from './turn.ts';
import { aiShot } from './aim.ts';
import { type Cand, NINE, randomLayout, rng, SOLIDS, STRIPES, type Tier, TIERS } from './shot-ai.ts';

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

// One AI visit on the engine from a seeded random table (early = the 9 won it with balls still up): it shoots until a shot does not pot a legal ball cleanly
// (a miss, a foul, a safety). 8-ball: 7 a side, AI on solids, then the 8. 9-ball: balls 1-9, lowest first, the 9 wins.
// shortcut: no ball in hand and no push out; a visit ends on the first foul, as one turn of the match would.
export function visit(tier: Tier, seed: number, nine = false) {
  const rnd = rng(seed), { cue, balls } = randomLayout(rnd, nine ? 4 : 7);
  let B = [cue, ...balls].map(mk);
  const ids = [0, ...balls.map((b, i) => (nine ? i + 1 : b.id))], think: number[] = [];
  let potted = 0, clear = false, first = false, early = false;
  for (let shot = 0; shot < 20; shot++) {
    const left = ids.filter((id, i) => i && B[i].on), own = SOLIDS.filter((id) => left.includes(id));
    const r = aiShot(B, ids, nine ? NINE : SOLIDS, nine ? NINE : STRIPES, tier, rnd);
    think.push(r.ms[0] + r.ms[1]);
    if (r.pick.type === 'safety' || r.pick.type === 'foul') break;
    const sim = simulate(B, r.shot, undefined, 30000), down = sim.potted.map((i) => ids[i]);
    const lowest = Math.min(...left), on = nine ? [lowest] : own.length ? own : [8];
    if (sim.scratch || sim.off.length || sim.first < 0 || !on.includes(ids[sim.first])) break;
    const good = nine ? down.length > 0 : down.some((id) => on.includes(id));
    if (!good || (!nine && down.includes(8) && own.length)) break; // the 8 down early loses the rack
    potted += nine ? down.length : down.filter((id) => on.includes(id)).length; first ||= shot === 0;
    if (down.includes(nine ? 9 : 8)) { clear = true; early = nine && sim.balls.some((b, i) => i && b.on); break; }
    B = sim.balls.map((b) => ({ ...b, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0 }));
  }
  return { potted, clear, first, early, think };
}

// Make rate per shot type: on n seeded random 8-ball tables (5 a side, AI on solids) the AI may only try pots of one type
// (ok) and must take a pot (safetiesInRow 2: no safety), and the engine says whether the ball dropped where it was called. 'lit' = Bank shots mode with a random lit pair.
// Same tables for every tier, so the rates compare. Run with scripts/ai-types.mjs. bank2 .. kick4 = off that many cushions,
// jump: the Chinese Masters' trick shots (kindOf); the plain 'bank' and 'kick' are off one.
export const TYPES = ['direct', 'bank', 'kick', 'combo', 'carom', 'billiard', 'lit', 'bank2', 'bank3', 'bank4', 'kick2', 'kick3', 'kick4', 'jump'] as const;
export function makeRates(tier: Tier, n: number, types: readonly (typeof TYPES)[number][] = TYPES, safeties = 2) {
  const out = Object.fromEntries(types.map((t) => [t, { tries: 0, made: 0, est: 0, shots: [] as { type: string; tol: number; made: boolean }[] }]));
  for (let i = 0; i < n; i++) for (const type of types) {
    const rnd = rng(5000 + i), { cue, balls } = randomLayout(rnd, 5), B = [cue, ...balls].map(mk), ids = [0, ...balls.map((b) => b.id)];
    const k = Math.floor(rnd() * 6), lit = [k, (k + 1) % 6];
    const ok = type === 'lit' ? (c: Cand) => onLit(lit, c) : (c: Cand) => kindOf(c) === type;
    // a trick shot is not forced: its rate is of the tries the Masters accepts (it plays safe on a poor one, aim.ts SAFE_P)
    const r = aiShot(B, ids, SOLIDS, STRIPES, tier, rng(9000 + i), /\d$|^jump$/.test(type) ? 0 : safeties, ok), pick = r.pick;
    if (pick.type === 'safety' || pick.type === 'foul' || (type !== 'lit' && kindOf(pick) !== type)) continue;
    const o = out[type]; o.tries++; o.est += pick.p;
    const S = B.map((b) => ({ ...b })), ev: Ev[] = [], hole = holeOf(pick), j = ids.indexOf(pick.ball);
    let first = -1, pocket = -1, scratch = false, banked = false;
    strike(S[0], r.shot);
    for (let s = 0; s < 30000 && step(S, ev); s++) {
      for (const e of ev) {
        if (e.t === 'bb' && e.a === 0 && first < 0) first = e.b!;
        if ((e.t === 'pocket' || e.t === 'off') && e.a === 0) scratch = true;
        if (e.t === 'pocket' && e.a === j) pocket = HOLES.reduce((m, h, q) => ((h[0] - e.x!) ** 2 + (h[1] - e.y!) ** 2 < (HOLES[m][0] - e.x!) ** 2 + (HOLES[m][1] - e.y!) ** 2 ? q : m), 0);
        if (e.t === 'rail' && (e.a === j || (e.a === 0 && first < 0))) { const c = cushionAt(e.x!, e.y!, 1.5 * P.R); if (lit.includes(c) && (e.a === 0 || !ENDS[c].includes(hole))) banked = true; }
      }
      ev.length = 0;
    }
    const made = first >= 0 && SOLIDS.includes(ids[first]) && pocket === hole && !scratch && (type !== 'lit' || banked);
    o.made += +made; o.shots.push({ type: pick.type, tol: pick.tol, made });
  }
  return out;
}
