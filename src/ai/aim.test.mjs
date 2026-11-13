// Run: npm test   (the AI's shot on the real engine: aim correction, the Shot it hands to strike(), strike noise)
import assert from 'node:assert';
import { CUE, P, simulate, step, strike } from '../physics/engine.ts';
import { aiShot, correctAim } from './aim.ts';
import { visit } from './bench.ts';
import { enumerate, potProb, SOLIDS, STRIPES, TIERS, randomLayout, rng } from './shot-ai.ts';
let n = 0; const ok = name => console.log(`ok ${++n} ${name}`);
const mk = (x, y) => ({ x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true });
// Direction the object ball leaves in, measured on the engine, independent of aim.ts.
const leaves = (cue, obj, shot) => {
  const S = [{ ...cue }, { ...obj }], ev = []; strike(S[0], shot);
  for (let i = 0; i < 6000; i++) { ev.length = 0; step(S, ev); if (ev.some(e => e.t === 'bb')) return Math.atan2(S[1].vy, S[1].vx); }
};
// A picker layout (mm) as the engine table the app holds: balls in metres, ids[i] = number of ball i, the cue ball first.
const table = ({ cue, balls }) => ({ B: [cue, ...balls].map(b => mk(b.x / 1000, b.y / 1000)), ids: [0, ...balls.map(b => b.id)] });
const off = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
// The first `n` picks of one shot type by a Legend that plans no further than the shot in hand (so the test runs fast),
// with the noise-free Shot aiShot refined on the engine and what it did there.
const picksOf = (type, n, base = TIERS[5]) => {
  const tier = { ...base, depth: 0, types: [type] }, rnd = rng(42), out = [];
  for (let i = 0; i < 400 && out.length < n; i++) {
    const L = randomLayout(rnd, 7);
    // no fair shot of the type here (the pick would be a safety): skip the costly aiShot
    if (!enumerate(L.cue, L.balls, SOLIDS).some((c) => c.type === type && potProb(c, tier.sigma * Math.PI / 180) > 0.5)) continue;
    const { B, ids } = table(L), r = aiShot(B, ids, SOLIDS, STRIPES, tier, rnd);
    if (r.pick.type === type) out.push({ ...r, B, ids, sim: simulate(B, r.aim) });
  }
  return out;
};
const potted = ({ sim, ids, pick }) => sim.potted.includes(ids.indexOf(pick.ball)) && !sim.scratch;

{ // A 30 degree cut with side spin: throw and squirt send the object ball off the ghost-ball line; the corrected aim does not.
  const cue = mk(0.5, 0.5), obj = mk(1.2, 0.5), want = 30 * Math.PI / 180, u = { x: Math.cos(want), y: Math.sin(want) };
  const G = { x: obj.x - 2 * P.R * u.x, y: obj.y - 2 * P.R * u.y }, ghost = Math.atan2(G.y - cue.y, G.x - cue.x);
  const shot = { speed: 3, a: 0.3, b: 0 }, fixed = correctAim(cue, obj, { aim: ghost, u }, shot.speed, shot.a, shot.b);
  const raw = off(leaves(cue, obj, { ...shot, ang: ghost }), want), done = off(leaves(cue, obj, { ...shot, ang: fixed }), want);
  assert(raw > 0.01 && done < 0.0015, `object ball off its line: ghost aim ${raw.toFixed(4)} rad, corrected ${done.toFixed(4)} rad`);
  ok('the corrected aim sends the object ball along the planned line');
  const short = correctAim(cue, obj, { aim: ghost, u }, shot.speed, shot.a, shot.b, 2);
  assert(off(leaves(cue, obj, { ...shot, ang: short }), want) < raw, 'out of probes: the last secant step, closer than the ghost aim');
  assert.strictEqual(correctAim(cue, obj, { aim: ghost + 0.2, u }, shot.speed, shot.a, shot.b), null, 'aimed past the ball: null');
  ok('correctAim returns its last step when out of probes, and null when the cue ball misses');
}
{ // Legend, a straight-in shot to the near side pocket: the Shot it hands to strike() pots the ball on the engine.
  const B = [mk(P.L / 2, 0.8), mk(P.L / 2, 0.3)], { shot, pick } = aiShot(B, [0, 1], SOLIDS, STRIPES, TIERS[5], rng(1));
  assert.deepStrictEqual([pick.type, simulate(B, shot).potted.includes(1)], ['direct', true], 'straight-in is potted');
  ok('Legend pots a straight-in on the engine');
}
{ // Pro plays a safety: the Shot hits the ball the safety chose first.
  const rnd = rng(3); let k = 0;
  for (let i = 0; i < 400 && k < 3; i++) {
    const { B, ids } = table(randomLayout(rnd, 4)), { shot, pick } = aiShot(B, ids, [1, 2], [3, 4], TIERS[4], rng(i));
    if (pick.type !== 'safety') continue;
    k++; assert.strictEqual(ids[simulate(B, shot).first], pick.ball, 'the safety hits its ball first');
  }
  assert.strictEqual(k, 3, 'safeties were played');
  ok('a safety hits the ball it chose');
}
{ // Hooked: the cue ball is ringed by stripes, so no pot or safety exists. It still plays a soft shot at its own ball.
  const ring = [9, 10, 11, 12, 13, 14].map((id, k) => ({ id, x: 1000 + 58 * Math.cos(k * Math.PI / 3), y: 500 + 58 * Math.sin(k * Math.PI / 3) }));
  const { B, ids } = table({ cue: { x: 1000, y: 500 }, balls: [{ id: 1, x: 200, y: 200 }, { id: 2, x: 1900, y: 900 }, ...ring] });
  const { shot, pick } = aiShot(B, ids, SOLIDS, STRIPES, TIERS[5], rng(1));
  assert.strictEqual(pick.type, 'foul');
  assert(off(shot.ang, Math.atan2(-0.3, -0.8)) < 0.02 && shot.speed >= 0.5 && shot.speed <= 1.5, `soft shot at the 1 (${JSON.stringify(shot)})`);
  ok('a hooked AI plays softly at its nearest ball');
}
{ // Strike noise follows the tier: the Shot handed to strike() scatters about the noise-free one (aim) by the tier's aim
  // (the cue ball's line, squirt from the side tip error included), speed and tip error. A dead-straight pot is played with no side, so the side offset scatters about zero.
  const B = [mk(P.L / 2, 0.8), mk(P.L / 2, 0.3)], rms = a => Math.sqrt(a.reduce((t, x) => t + x * x, 0) / a.length);
  for (const tier of [TIERS[0], TIERS[5]]) {
    const r = []; for (let i = 0; r.length < 60; i++) { const x = aiShot(B, [0, 1], SOLIDS, STRIPES, tier, rng(i)); if (x.pick.pocket === 1 && x.pick.type === 'direct') r.push(x); }
    const aim = rms(r.map(x => x.shot.ang + x.shot.a * CUE.squirt - x.aim.ang)) * 180 / Math.PI, side = rms(r.map(x => x.shot.a)), up = rms(r.map(x => x.shot.b - x.aim.b));
    const sp = 100 * rms(r.map(x => x.shot.speed / x.aim.speed - 1));
    assert(up > 0.6 * tier.tipErr && up < 1.4 * tier.tipErr, `${tier.name}: tip error up and down ${up.toFixed(3)} ball radii`);
    assert(r.every(x => Math.abs(x.shot.b) <= CUE.tipLimit), `${tier.name}: the tip stays inside the miscue limit`);
    assert(aim > 0.7 * tier.sigma && aim < 1.3 * tier.sigma, `${tier.name}: aim error ${aim.toFixed(2)} degrees`);
    assert(side > 0.7 * tier.tipErr && side < 1.3 * tier.tipErr, `${tier.name}: tip error ${side.toFixed(3)} ball radii`);
    assert(sp > 0.7 * tier.speedErr && sp < 1.3 * tier.speedErr, `${tier.name}: speed error ${sp.toFixed(1)}%`);
  }
  ok('strike noise is the tier\'s aim, speed and tip error');
}
{ // Random full tables, every tier: a Shot strike() can take. With no engine time (Rookie, Regular) the tip is low for a
  // draw leave and high for a follow one; the tiers that refine pick the tip by where the cue ball really stops.
  const rnd = rng(5), spins = new Set();
  for (const tier of TIERS) for (let i = 0; i < (tier.budget < 3 ? 8 : 3); i++) {
    const { B, ids } = table(randomLayout(rnd, 7)), { shot, pick, aim } = aiShot(B, ids, SOLIDS, STRIPES, tier, rnd);
    const { ang, speed, a, b } = shot, lim = CUE.tipLimit;
    assert(Number.isFinite(ang) && speed >= 0.5 && speed <= CUE.maxSpeed && Math.abs(a) <= lim && Math.abs(b) <= lim, `${tier.name}: ${JSON.stringify(shot)}`);
    if (pick.leave && tier.budget < 3) { const want = pick.leave.spin; spins.add(want); assert(Math.sign(aim.b) === want && Math.abs(b - aim.b) < 4 * tier.tipErr, `${tier.name}: spin ${want}, tip ${b}`); }
  }
  assert.strictEqual(spins.size, 3, 'draw, stun and follow were all played');
  ok('shots on random tables are within the cue\'s limits, with the tip the leave asks for');
}
{ // Every random choice comes from the rnd passed in: the same seed gives the same shot, so a replay or a test can repeat a turn.
  const { B, ids } = table(randomLayout(rng(8), 7)), one = () => aiShot(B, ids, SOLIDS, STRIPES, TIERS[3], rng(4)).shot;
  assert.deepStrictEqual(one(), one(), 'same seed, same shot');
  ok('the same seed gives the same shot');
}
{ // A longer planned leave is hit harder. The 1 sits on the lip of the side pocket, so the cue ball's roll sets the speed;
  // Regular does not plan, so it tries every power across seeds. Stun only: draw is hit harder for the same leave.
  const B = [mk(P.L / 2, 0.25), mk(P.L / 2, 0.1)], by = {};
  for (let i = 0; i < 80; i++) { const { aim, pick } = aiShot(B, [0, 1], SOLIDS, STRIPES, TIERS[1], rng(i)); if (pick.pocket === 1 && pick.leave.spin === 0) (by[pick.leave.power] ||= []).push(aim.speed); }
  const mean = a => a.reduce((t, x) => t + x, 0) / a.length;
  assert(mean(by[2200]) > 1.1 * mean(by[300]), `speed for the longest leave ${mean(by[2200]).toFixed(2)}, shortest ${mean(by[300]).toFixed(2)} m/s`);
  ok('a longer leave is hit harder');
}
{ // Banks: the cushion takes speed and bends the rebound, so the analytic aim and speed leave the ball short or wide.
  // Refined on the engine, Legend's banks drop when struck without noise.
  const p = picksOf('bank', 6), made = p.filter(potted).length;
  assert(made >= 5, `banks potted ${made}/${p.length}`);
  ok('Legend\'s banks pot on the engine');
}
{ // Kicks: off a cushion the spin bends the cue ball's path, so the mirror aim often misses the ball. Refined, it hits it.
  const p = picksOf('kick', 6), hit = p.filter(({ sim, ids, pick }) => ids[sim.first] === pick.first).length, made = p.filter(potted).length;
  assert(hit === 6 && made >= 5, `kicks that hit their ball first ${hit}/${p.length}, potted ${made}`);
  ok('Legend\'s kicks hit their ball first and pot');
}
{ // Combos: the second ball's departure is not corrected by correctAim. Refined to the pocket, they drop.
  const p = picksOf('combo', 6), made = p.filter(potted).length;
  assert(made >= 4, `combos potted ${made}/${p.length}`);
  ok('Legend\'s combos pot on the engine');
}
{ // Caroms and billiards: the ball rolls into the kiss and bends forward off it, and refine() runs the shot to the pocket.
  // Legend's drop when struck without noise: of 40 of each, 38 caroms and 34 billiards (these first 6: 6 and 5).
  for (const type of ['carom', 'billiard']) {
    const p = picksOf(type, 6), made = p.filter(potted).length;
    assert(p.length === 6 && made >= 4, `${type}s potted ${made}/${p.length}`);
  }
  ok('Legend\'s caroms and billiards pot on the engine');
}
{ // Leave on the engine: a stun or a follow on this straight pot rolls the cue ball to the side cushion, where the 9 and
  // the 10 hide the 2. Scored by where the cue ball really stops, the pot keeps a direct shot on the 2 (a draw, or a soft
  // stun that stops the cue ball on the spot).
  const B = [mk(P.L / 2, 0.8), mk(P.L / 2, 0.3), mk(0.4, 0.8), mk(0.97, 0.21), mk(1.27, 0.21)], ids = [0, 1, 2, 9, 10];
  const r = aiShot(B, ids, SOLIDS, STRIPES, TIERS[5], rng(1)), sim = simulate(B, r.aim), c = sim.balls[0];
  const balls = sim.balls.map((b, i) => ({ id: ids[i], x: b.x * 1000, y: b.y * 1000 })).filter((_, i) => i && sim.balls[i].on);
  const next = enumerate({ x: c.x * 1000, y: c.y * 1000 }, balls, [2]).filter((s) => s.type === 'direct');
  assert(sim.potted.includes(1) && !sim.scratch && next.length, `tip ${r.aim.b}, rest ${c.x.toFixed(2)}, ${c.y.toFixed(2)}`);
  ok('the leave is scored where the engine stops the cue ball: it keeps a shot on the next ball');
}
{ // No legal ball at all (the group and the 8 are gone): no pick, and the AI still hands strike() a shot.
  const { B, ids } = table({ cue: { x: 1000, y: 500 }, balls: [{ id: 9, x: 300, y: 300 }] }), r = aiShot(B, ids, SOLIDS, STRIPES, TIERS[5], rng(1));
  assert(r.pick.type === 'foul' && Number.isFinite(r.shot.ang) && r.shot.speed > 0, JSON.stringify(r.shot));
  ok('with no legal ball it still shoots');
}
{ // With no engine time (Rookie) the speed is the analytic one, which allows for the speed a cushion takes: struck
  // without noise, some of its banks drop (its aim is not corrected for the cushion, so not all).
  const p = picksOf('bank', 20, TIERS[0]), made = p.filter(potted).length;
  assert(made >= 4, `Rookie's banks potted ${made}/${p.length}`);
  ok('with no engine time a bank is still hit hard enough');
}
{ // Tiers on the engine: one visit from each of 10 seeded full tables (bench.ts visit(), as npm run bench:visit plays them).
  // Better tiers run more balls from planning and position, so Legend > Shark > Rookie by a margin (Shark 2.9x Rookie, Legend 1.6x Shark over 200 tables; 10 are noisy).
  const run = (t, nine = false) => Array.from({ length: 10 }, (_, i) => visit(TIERS[t], 1 + i, nine).potted).reduce((a, b) => a + b, 0);
  const [rookie, shark, legend] = [0, 3, 5].map((t) => run(t));
  assert(shark > 1.5 * rookie && legend > 1.3 * shark, `balls in 10 visits: Rookie ${rookie}, Shark ${shark}, Legend ${legend}`);
  const [rookie9, legend9] = [0, 5].map((t) => run(t, true));
  assert(legend9 > 2 * rookie9, `9-ball balls in 10 visits: Rookie ${rookie9}, Legend ${legend9}`);
  ok('Legend runs more balls than Shark, and Shark than Rookie, on the engine, and Legend than Rookie in 9-ball');
}
{ // Bank shots, on the 8 with no bank to play: the fallback tap must not send the 8 straight in (that loses the rack).
  const B = [mk(P.L - 0.8, P.W - 0.8), mk(P.L - 0.3, P.W - 0.3)], none = () => false;
  const { shot, pick } = aiShot(B, [0, 8], SOLIDS, STRIPES, TIERS[1], rng(1), 0, none);
  assert.equal(pick.type, 'foul');
  const S = B.map(b => ({ ...b })); strike(S[0], shot); for (let i = 0; i < 40000 && step(S, []); i++);
  assert(S[1].on, 'the 8 stays on the table');
  console.log('ok bank shots: the fallback tap keeps the 8 up');
}
