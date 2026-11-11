// Run: npm test. Every lesson's reference shot passes on the engine (watch must never fail), and the verdict says
// what went wrong.
import assert from 'node:assert';
import { CUE, step, strike } from '../physics/engine.ts';
import { shotTip } from '../render/tip.ts';
import { LESSONS, lessonTable, newLessonRec, noteLesson, verdict } from './lessons.ts';

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
  // a lesson can be passed by a person: a quarter of a degree either side of the reference still passes
  for (const d of [-0.002, 0.002]) assert(play(l, l.ref.ang + d, l.ref.power, l.ref.tip).ok, `${l.id}: too tight at ${d} rad`);
}
{ const l = at('draw'), { ang, power, tip } = l.ref;
  assert.match(play(l, ang, power, { ...tip, y: 0.6 }).say, /ran past the ring|went in/, 'draw: follow in place of draw runs on');
  assert.match(play(l, ang, power, { ...tip, y: -0.25 }).say, /short of the ring/, 'draw: too little draw stops short');
  assert.match(play(l, ang + 0.3, power, tip).say, /missed the pocket|hit nothing/, 'draw: a bad aim misses');
}
assert.match(play(at('kick'), Math.PI * 0, 0.45, { x: 0, y: 0, elev: 0 }).say, /cushion first/, 'kick: straight at the 2 is no kick');
assert.match(play(at('jump'), 0, 0.5, { x: 0, y: 0, elev: 0 }).say, /hit the 2 first/, 'jump: a level shot hits the blocker');
assert.match(play(at('safety'), at('safety').ref.ang, 0.02, { x: 0, y: 0, elev: 0 }).say, /hit nothing|cushion after/, 'safety: too soft is a foul');
console.log('lessons: all checks passed');
{ const { readDone } = await import('./lessons.ts');
  assert.deepStrictEqual(readDone(null), [], 'no save');
  assert.deepStrictEqual(readDone('{oops'), [], 'damaged save');
  assert.deepStrictEqual(readDone('{"a":1}'), [], 'not a list');
  assert.deepStrictEqual(readDone('["draw","nope",3,"aim","draw"]'), ['aim', 'draw'], 'known ids only, once, in lesson order');
  console.log('lesson save: all checks passed');
}
