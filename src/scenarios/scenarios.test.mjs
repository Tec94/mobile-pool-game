// Run: npm test. Every scenario's reference shot clears its table on the engine, the packs ramp from easy to hard, and
// the stars, the unlocks and the pay follow the progression design.
import assert from 'node:assert';
import { CUE, step, strike } from '../physics/engine.ts';
import { shotTip } from '../render/tip.ts';
import { lessonTable, litCushions, newLessonRec, noteLesson, verdict } from '../learn/lessons.ts';
import { NEW, PACKS, featCount, toLeave } from '../progress/profile.ts';
import { stick } from '../progress/cues.ts';
import { clear, clearFeats, isOpen, par, pRef, readStars, SCENARIOS, starsFor, totalStars } from './scenarios.ts';

const play = (s, ang) => {
  const { B, ids } = lessonTable(s), r = newLessonRec(), ev = [];
  strike(B[0], { ang, speed: s.ref.power * CUE.maxSpeed, ...shotTip(s.ref.tip) });
  for (let i = 0; i < 40000; i++) { ev.length = 0; const mv = step(B, ev); noteLesson(r, ev, B, ids); if (!mv) break; }
  return verdict(s, r, B[0]);
};

assert.strictEqual(SCENARIOS.length, 9 * 12, 'nine packs of 12');
assert.strictEqual(new Set(SCENARIOS.map(s => s.id)).size, SCENARIOS.length, 'ids are unique: the save keeps them');
for (const s of SCENARIOS) {
  const v = play(s, s.ref.ang);
  assert(v.ok, `${s.id}: the reference shot fails: ${v.say}`);
  // the window is real: half of it either side of the middle still clears
  for (const d of [-0.5 * s.tol, 0.5 * s.tol]) assert(play(s, s.ref.ang + d).ok, `${s.id}: no window at ${d} rad`);
}
// The tables are measured on the engine cue but played with the player's own. The weakest, the Twig, clears every one
// with the same tip offset and as much of the speed as it has, near the reference aim.
const twig = stick('twig', false), onTwig = (s, ang) => {
  const { B, ids } = lessonTable(s), r = newLessonRec(), ev = [], t = s.ref.tip, k = CUE.tipLimit;
  strike(B[0], { ang, speed: Math.min(twig.maxSpeed, s.ref.power * CUE.maxSpeed), a: t.x * k, b: t.y * k, elev: t.elev * Math.PI / 180 }, twig);
  for (let i = 0; i < 40000; i++) { ev.length = 0; const mv = step(B, ev); noteLesson(r, ev, B, ids); if (!mv) break; }
  return verdict(s, r, B[0]).ok;
};
for (const s of SCENARIOS) {
  let ok = false;
  for (let k = 0; k <= 400 && !ok; k++) ok = onTwig(s, s.ref.ang + k * 5e-4) || onTwig(s, s.ref.ang - k * 5e-4);
  assert(ok, `${s.id}: the Twig cannot clear it`);
}
PACKS.forEach((_, p) => {
  const pack = SCENARIOS.filter(s => s.pack === p);
  assert.strictEqual(pack.length, 12, `pack ${p} has 12`);
  assert(pack.every((s, i) => !i || s.tol <= pack[i - 1].tol), `pack ${p} goes from easy to hard`);
  assert(pRef(pack[0]) > pRef(pack[11]), `pack ${p}: the last table is harder than the first`);
});
{ // Banks: each table lights the cushion its reference banks off and one neighbour, picked at random by its id.
  const banks = SCENARIOS.filter(s => s.type === 'bank'), sides = new Set(), at = id => litCushions(SCENARIOS.find(s => s.id === id));
  for (const s of banks) {
    const lit = litCushions(s);
    assert(lit && lit.length === 2 && lit.every(k => Number.isInteger(k) && k >= 0 && k < 6), `${s.id}: two cushions lit (${lit})`);
    assert([1, 5].includes((lit[1] - lit[0] + 6) % 6), `${s.id}: next to each other (${lit})`); sides.add((lit[1] - lit[0] + 6) % 6);
  }
  assert.strictEqual(sides.size, 2, 'the neighbour is not always on the same side');
  assert(at('banks-1').includes(4) && at('banks-7').includes(1) && at('banks-8').includes(2) && at('banks-11').includes(5), 'the cushion the reference banks off is lit');
  assert(SCENARIOS.every(s => s.type === 'bank' || litCushions(s) === null), 'only the Banks tables light cushions');
}
console.log('scenarios: every reference shot clears');

{ // stars and pay
  const s = SCENARIOS[0], hard = SCENARIOS.filter(s => s.pack === 0)[11];
  assert.strictEqual(starsFor(s, 1, false), 3, 'clear within par');
  assert.strictEqual(starsFor(s, par(s) + 1, true), 5, 'over par, guide off');
  const a = clear(s, 0, 1, true, 'house');
  assert.deepStrictEqual([a.bits, a.n, a.pay.coins], [7, 3, 90], 'three new stars pay 30 coins each');
  assert(a.pay.xp > 0, 'and the XP of the shot');
  const again = clear(s, 7, 1, true, 'house');
  assert.deepStrictEqual([again.n, again.pay], [0, { xp: 0, coins: 0 }], 'a replay pays nothing');
  assert(clear(hard, 0, 1, false, 'house').pay.xp > clear(s, 0, 1, false, 'house').pay.xp, 'a harder table pays more XP');
  assert(clear(s, 0, 1, false, 'twig').pay.xp > clear(s, 0, 1, false, 'house').pay.xp, 'the Twig pays x1.5');
  assert(par(hard) > par(s), 'a harder table has more par tries');
}
{ // unlocks
  const xpAt = level => { let xp = 0; for (let l = 1; l < level; l++) xp += toLeave(l); return xp; };
  const pots = i => SCENARIOS.findIndex(s => s.id === `pots-${i}`), banks1 = SCENARIOS.findIndex(s => s.id === 'banks-1');
  assert(isOpen(pots(1), {}, 0), 'the first table is open');
  assert(!isOpen(pots(2), {}, 0), 'the second waits for a clear');
  assert(isOpen(pots(2), { 'pots-1': 1 }, 0) && isOpen(pots(3), { 'pots-1': 1 }, 0) && !isOpen(pots(4), { 'pots-1': 1 }, 0), 'a clear opens the next two');
  assert(!isOpen(banks1, {}, xpAt(4)) && isOpen(banks1, {}, xpAt(5)), 'Banks opens at level 5');
}
{ // feats from a first clear count as scenario progress, at most half the count
  const bank = SCENARIOS.find(s => s.type === 'bank');
  let p = NEW; for (let i = 0; i < 40; i++) p = clearFeats(p, bank);
  assert.strictEqual(featCount(p, 'bank'), 25, 'Bank Robber: half of 50 from scenarios');
}
{ // save
  assert.deepStrictEqual(readStars(null), {}, 'no save');
  assert.deepStrictEqual(readStars('{oops'), {}, 'damaged save');
  assert.deepStrictEqual(readStars('[1]'), {}, 'not an object');
  assert.deepStrictEqual(readStars('{"pots-1":3,"pots-2":9,"pots-3":0,"x":1,"pots-4":2.5}'), { 'pots-1': 3 }, 'known ids, bits 1 to 7');
  assert.strictEqual(totalStars({ a: 7, b: 1, c: 6 }), 6, 'star count');
}
console.log('scenario stars, unlocks and pay: all checks passed');
