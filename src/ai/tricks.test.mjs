// Run: npm test   (the Chinese Masters' trick shots: multi-cushion banks and kicks, jumps, escapes, on the real engine)
import assert from 'node:assert';
import { simulate } from '../physics/engine.ts';
import { aiShot } from './aim.ts';
import { holeOf } from './turn.ts';
import { decide, enumerate, fancy, MASTERS, norm, plan, POCKETS, R, randomLayout, rng, SOLIDS, STRIPES, sub, TIERS, W, H } from './shot-ai.ts';
let n = 0; const ok = name => console.log(`ok ${++n} ${name}`);
const mk = (x, y) => ({ x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true });
const table = ({ cue, balls }) => ({ B: [cue, ...balls].map(b => mk(b.x / 1000, b.y / 1000)), ids: [0, ...balls.map(b => b.id)] });
const M = TIERS[MASTERS - 1];

{ // Every cushion of a multi-cushion bank or kick is a real cushion hit (angle in = angle out, clear of the pockets).
  const rnd = rng(11), seen = {};
  for (let i = 0; i < 20; i++) {
    const { cue, balls } = randomLayout(rnd, 4);
    for (const s of enumerate(cue, balls, [1, 2, 3, 4], undefined, true, 4).filter((x) => (x.rails ?? 1) > 1)) {
      seen[s.type + s.rails] = true;
      const q = s.type === 'bank' ? s.paths[1] : s.paths[0];
      assert.equal(q.length, s.rails + 2, 'one point per cushion');
      for (let k = 1; k <= s.rails; k++) {
        const a = norm(sub(q[k], q[k - 1])), b = norm(sub(q[k + 1], q[k])), X = q[k], onLong = Math.abs(X.y - R) < 1 || Math.abs(X.y - (H - R)) < 1;
        assert(onLong || Math.abs(X.x - R) < 1 || Math.abs(X.x - (W - R)) < 1, 'the point is on a cushion');
        assert(Math.abs(onLong ? a.x - b.x : a.y - b.y) < 1e-9 && Math.abs(onLong ? a.y + b.y : a.x + b.x) < 1e-9, 'reflection');
        assert(POCKETS.every((p) => Math.hypot(p.x - X.x, p.y - X.y) >= 110), 'off the jaws of a pocket');
      }
    }
  }
  assert.deepStrictEqual(Object.keys(seen).sort(), ['bank2', 'bank3', 'bank4', 'kick2', 'kick3', 'kick4'], 'every count of cushions is found');
  ok('multi-cushion banks and kicks are real cushion paths, 2 to 4 cushions');
}
{ // Tiers 0 to 5 never get a trick shot: no tricks in their plan, and their enumerate is the one they had.
  const rnd = rng(12);
  for (let i = 0; i < 15; i++) {
    const { cue, balls } = randomLayout(rnd, 7);
    for (const t of TIERS.slice(0, 6)) assert(!plan(cue, balls, SOLIDS, { ...t, depth: 0 }, 0, 1000, STRIPES).some(fancy), `${t.name} plans a trick shot`);
    assert(!enumerate(cue, balls, SOLIDS).some((c) => fancy(c) || c.type === 'jump'), 'no trick without tricks');
  }
  ok('tiers 0 to 5 never plan a trick shot');
}
// The first `k` of the Masters' picks of a kind (ok = the pots it may try) on seeded tables, played noise-free on the engine.
const picks = (ok, k, seed) => {
  const rnd = rng(seed), out = [];
  for (let i = 0; i < 80 && out.length < k; i++) {
    const L = randomLayout(rnd, 5), { B, ids } = table(L);
    if (!enumerate(L.cue, L.balls, [1, 2, 3, 4, 5], undefined, true, 4).some(ok)) continue;
    const r = aiShot(B, ids, SOLIDS, STRIPES, { ...M, depth: 0 }, rng(i), 2, ok);
    if (r.pick.type !== 'safety' && r.pick.type !== 'foul' && ok(r.pick)) out.push({ r, B, ids, sim: simulate(B, r.aim, undefined, 30000) });
  }
  return out;
};
for (const [type, rails] of [['bank', 2], ['bank', 3], ['kick', 2], ['kick', 3]]) {
  const p = picks((c) => c.type === type && c.rails === rails, 3, 20 + rails);
  assert(p.length, `a ${type} off ${rails} cushions is found`);
  const made = p.filter(({ r, ids, sim }) => sim.potted.includes(ids.indexOf(r.pick.ball)) && !sim.scratch && ids[sim.first] === r.pick.first);
  assert(made.length >= 1, `${type}${rails}: the engine pots ${made.length} of ${p.length}`);
  ok(`the Masters finds a ${type} off ${rails} cushions and the engine pots it (${made.length} of ${p.length})`);
}
{ // Jump: the lane to a cut into the corner is blocked 300 mm out (it may kick it too: here it may only jump). It pots it in the called pocket.
  const B = [mk(0.9, 0.6), mk(0.628, 0.474), mk(0.3, 0.3)], ids = [0, 9, 1];
  const r = aiShot(B, ids, SOLIDS, STRIPES, M, rng(1), 2, (c) => c.type === 'jump');
  assert.equal(r.pick.type, 'jump', `picked ${r.pick.type}`);
  assert(r.shot.elev > 0.4 && r.shot.elev <= 0.8, 'a raised cue, inside the cue\'s limits');
  const s = simulate(B, r.shot, undefined, 30000);
  assert(s.potted.includes(2) && !s.scratch && s.first === 2 && holeOf(r.pick) === 0, 'the jump pots the 1 in the corner it called');
  ok('the Masters jumps a ball in the lane and pots the shot');
}
{ // Hooked: a wall of stripes on the near side of its only ball. A Legend fouls; the Masters kicks or jumps to a legal hit.
  const o = { id: 1, x: 1700, y: 560 }, wall = [100, 135, 180, 225, 260].map((a, k) => ({ id: 9 + k, x: o.x + 58 * Math.cos(a * Math.PI / 180), y: o.y + 58 * Math.sin(a * Math.PI / 180) }));
  const cue = { id: 0, x: 500, y: 560 }, balls = [o, ...wall];
  assert.equal(decide(cue, balls, SOLIDS, STRIPES, TIERS[5], rng(1)).pick.type, 'foul', 'Legend has no legal hit');
  const { pick } = decide(cue, balls, SOLIDS, STRIPES, M, rng(1));
  assert(pick.type === 'safety' && (pick.rails || pick.elev), 'an escape');
  const { B, ids } = table({ cue, balls });
  for (let i = 0; i < 3; i++) { const r = aiShot(B, ids, SOLIDS, STRIPES, M, rng(i)), s = simulate(B, r.shot, undefined, 30000); assert(ids[s.first] === 1 && !s.scratch, `escape ${i} hits the 1 first`); }
  ok(`a hooked Masters escapes with a legal hit (${pick.rails ? `kick off ${pick.rails}` : 'jump'})`);
}
{ // The deadline: with a 1 ms one, the shot comes from the planning, the aim probes and the first rollouts only, not the full search.
  const run = (think) => [5, 6, 7, 8, 9].reduce((a, seed) => { const { B, ids } = table(randomLayout(rng(seed), 7)); return a + aiShot(B, ids, SOLIDS, STRIPES, { ...M, think }, rng(1)).ms[1]; }, 0);
  run(1); // warm up
  const full = run(1e6), fast = run(1);
  assert(fast < full / 2, `aim ms on 5 tables with a 1 ms deadline ${fast.toFixed(0)}, without ${full.toFixed(0)}`);
  ok('the think deadline stops the engine search');
}
