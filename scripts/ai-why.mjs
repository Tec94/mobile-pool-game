// Why a one-visit run ends. Run: npm run bench:why [tables] [tier index] [nine 0|1] [noise-free 0|1] [first seed]
// (default 60 tables, the Chinese Masters, 8-ball, seeds from 1000): the tables cleared, how each run ended, the misses
// and pots by kind, and aiShot's ms a rollout. TIER='{...}' overrides tier fields; LOG=1 prints each table's end; FORCE=1
// adds the pot it would play if made to shoot where it played safe; OWN=1 adds its own balls left then.
import { simulate } from '../src/physics/engine.ts';
import { aiShot } from '../src/ai/aim.ts';
import { kindOf } from '../src/ai/turn.ts';
import { NINE, randomLayout, rng, SOLIDS, STRIPES, TIERS } from '../src/ai/shot-ai.ts';
const [n = 60, t = 6, nine = 0, zero = 0, from = 1000] = process.argv.slice(2).map(Number);
const base = { ...TIERS[t], ...JSON.parse(process.env.TIER ?? '{}') }, tier = zero ? { ...base, sigma: 1e-6, speedErr: 0, tipErr: 0, posErr: 0 } : base;
const mk = (b) => ({ x: b.x / 1000, y: b.y / 1000, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true });
const why = {}, kinds = {}, miss = {}; let clear = 0, ms = 0, rolls = 0;
for (let i = 0; i < n; i++) {
  const rnd = rng(from + i), { cue, balls } = randomLayout(rnd, nine ? 4 : 7);
  let B = [cue, ...balls].map(mk); const ids = [0, ...balls.map((b, i) => (nine ? i + 1 : b.id))];
  let end = 'cap';
  for (let shot = 0; shot < 20; shot++) {
    const left = ids.filter((id, i) => i && B[i].on), own = SOLIDS.filter((id) => left.includes(id));
    const t0 = performance.now(), r = aiShot(B, ids, nine ? NINE : SOLIDS, nine ? NINE : STRIPES, tier, rnd), k = kindOf(r.pick);
    ms += performance.now() - t0; rolls += r.rollouts;
    if (r.pick.type === 'safety' || r.pick.type === 'foul') {
      end = k + (shot ? '' : '@1') + (process.env.OWN ? ' own' + own.length : '');
      if (process.env.FORCE) { // what it would pot if it had to shoot: kind, its p, and does the engine pot it noise-free / with noise
        const f = aiShot(B, ids, nine ? NINE : SOLIDS, nine ? NINE : STRIPES, tier, rng(i), 2), s0 = simulate(B, f.aim, undefined, 30000), s1 = simulate(B, f.shot, undefined, 30000);
        const j = f.pick.ball !== undefined ? ids.indexOf(f.pick.ball) : -1;
        end += ` forced:${kindOf(f.pick)} p=${(f.pick.p ?? 0).toFixed(2)} aim=${s0.potted.includes(j) && !s0.scratch} shot=${s1.potted.includes(j) && !s1.scratch}`;
      }
      break; }
    const sim = simulate(B, r.shot, undefined, 30000), down = sim.potted.map((i) => ids[i]);
    const lowest = Math.min(...left), on = nine ? [lowest] : own.length ? own : [8];
    if (sim.scratch || sim.off.length) { end = 'scratch:' + k; break; }
    if (sim.first < 0 || !on.includes(ids[sim.first])) { end = 'badfirst:' + k; break; }
    const good = nine ? down.length > 0 : down.some((id) => on.includes(id));
    if (!nine && down.includes(8) && own.length) { end = 'early8'; break; }
    if (!good) { end = 'miss'; miss[k] = (miss[k] ?? 0) + 1; break; }
    kinds[k] = (kinds[k] ?? 0) + 1;
    if (down.includes(nine ? 9 : 8)) { end = 'clear'; clear++; break; }
    B = sim.balls.map((b) => ({ ...b, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0 }));
  }
  why[end] = (why[end] ?? 0) + 1;
  if (process.env.LOG) console.log(from + i, end);
}
console.log(TIERS[t].name, zero ? 'noise-free' : '', nine ? '9-ball' : '8-ball', n, 'tables: clear', clear);
if (rolls) console.log('ms of aiShot a rollout (its planning too)', (ms / rolls).toFixed(1), 'over', rolls, 'rollouts');
console.log('ends', JSON.stringify(why)); console.log('misses by kind', JSON.stringify(miss)); console.log('pots by kind', JSON.stringify(kinds));
