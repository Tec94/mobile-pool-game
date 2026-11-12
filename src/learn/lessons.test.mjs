// Run: npm test. Every lesson's reference shot passes on the engine (watch must never fail), and the verdict says
// what went wrong.
import assert from 'node:assert';
import { CUE, P, step, strike } from '../physics/engine.ts';
import { shotTip } from '../render/tip.ts';
import { LESSONS, lessonTable, litCushions, newLessonRec, noteLesson, readDone, verdict } from './lessons.ts';

const play = (l, ang, power, tip) => {
  const { B, ids } = lessonTable(l), r = newLessonRec(), ev = [];
  strike(B[0], { ang, speed: power * CUE.maxSpeed, ...shotTip(tip) });
  for (let i = 0; i < 40000; i++) { ev.length = 0; const mv = step(B, ev); noteLesson(r, ev, B, ids); if (!mv) break; }
  return verdict(l, r, B[0]);
};
const at = id => LESSONS.find(l => l.id === id);

assert.strictEqual(LESSONS.length, 13, 'thirteen lessons');
assert.strictEqual(new Set(LESSONS.map(l => l.id)).size, 13, 'lesson ids are unique: the save keeps them');
for (const l of LESSONS) {
  const v = play(l, l.ref.ang, l.ref.power, l.ref.tip);
  assert(v.ok, `${l.id}: the reference shot fails: ${v.say}`);
  // a lesson can be passed by a person: a tenth of a degree, or 3% of power, either side of the reference still passes
  for (const d of [-0.002, 0.002]) assert(play(l, l.ref.ang + d, l.ref.power, l.ref.tip).ok, `${l.id}: too tight at ${d} rad`);
  for (const d of [-0.03, 0.03]) assert(play(l, l.ref.ang, l.ref.power + d, l.ref.tip).ok, `${l.id}: too tight at power ${d}`);
}
{ const l = at('draw'), { ang, power, tip } = l.ref;
  assert.match(play(l, ang, power, { ...tip, y: 0.6 }).say, /went the wrong way/, 'draw: follow in place of draw goes the wrong way');
  assert.match(play(l, ang, power, { ...tip, y: -0.1 }).say, /wrong way|short of the ring/, 'draw: too little draw misses the ring');
  assert.match(play(l, ang + 0.3, power, tip).say, /missed the pocket|hit nothing/, 'draw: a bad aim misses');
}
assert.match(play(at('kick'), 0, 0.45, { x: 0, y: 0, elev: 0 }).say, /cushion first/, 'kick: straight at the 2 is no kick');
assert.match(play(at('jump'), 0, 0.5, { x: 0, y: 0, elev: 0 }).say, /hit the 2 first/, 'jump: a level shot hits the blocker');
assert.match(play(at('safety'), at('safety').ref.ang, 0.02, { x: 0, y: 0, elev: 0 }).say, /hit nothing|cushion after/, 'safety: too soft is a foul');
{ // A bank lights two cushions next to each other round the table (six: the end rails, and each long rail either side
  // of its side pocket, numbered from the head half of the y = 0 rail), one of them the cushion the reference banks off.
  const l = at('bank'), lit = litCushions(l);
  assert(lit && lit.length === 2 && lit.includes(0), `bank: the near cushion is lit, as the reference banks off it (${lit})`);
  assert([1, 5].includes((lit[1] - lit[0] + 6) % 6), 'bank: with one of its neighbours');
  assert.deepStrictEqual(litCushions({ ...l }), lit, 'bank: the same pair every time');
  assert.strictEqual(litCushions(at('aim')), null, 'a table that wants no bank lights nothing');
  // The 1 banks off the middle of cushion k and drops in the far side pocket: it passes only off a lit cushion.
  const Rc = 0.0275, mids = [[P.L / 4, Rc], [3 * P.L / 4, Rc], [P.L - Rc, P.W / 2], [3 * P.L / 4, P.W - Rc], [P.L / 4, P.W - Rc], [Rc, P.W / 2]];
  const off = (k, at = mids[k]) => {
    const { B, ids } = lessonTable(l), r = newLessonRec();
    noteLesson(r, [{ t: 'bb', a: 0, b: 1, x: 0.75, y: 0.36 }, ...(at ? [{ t: 'rail', a: 1, x: at[0], y: at[1] }] : []), { t: 'pocket', a: 1, x: P.L / 2, y: P.W + 0.04 }], B, ids);
    return verdict(l, r, B[0]);
  };
  for (let k = 0; k < 6; k++) { const v = off(k); assert.strictEqual(v.ok, lit.includes(k), `bank: off cushion ${k} (lit ${lit}): ${v.say}`); if (!v.ok) assert.strictEqual(v.say, 'Bank it off a lit cushion.'); }
  assert.strictEqual(off(-1).say, 'Bank it off a lit cushion.', 'bank: potted with no bank');
  assert.strictEqual(off(-1, [P.L / 2 - 0.04, 0.01]).say, 'Bank it off a lit cushion.', 'bank: a pocket jaw next to a lit cushion is no bank');
  assert.strictEqual(play(l, -2.5781, 0.6, l.ref.tip).say, 'Bank it off a lit cushion.', 'bank: on the engine, a shot that drops the 1 with no bank');
}
console.log('lessons: all checks passed');
{
  assert.deepStrictEqual(readDone(null), [], 'no save');
  assert.deepStrictEqual(readDone('{oops'), [], 'damaged save');
  assert.deepStrictEqual(readDone('{"a":1}'), [], 'not a list');
  assert.deepStrictEqual(readDone('["draw","nope",3,"aim","draw"]'), ['aim', 'draw'], 'known ids only, once, in lesson order');
  console.log('lesson save: all checks passed');
}
