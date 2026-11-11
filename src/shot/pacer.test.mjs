// Run: npm test   (checks when the aim guide is worked out off the JS thread: src/shot/pacer.ts)
import assert from 'node:assert';
import { FAST, guidePacer } from './pacer.ts';
let n = 0; const ok = name => console.log(`ok ${++n} ${name}`);
const flush = () => new Promise(r => setTimeout(r, 0));
// A clock the test moves, a sync guide that costs `ms`, and a far guide that waits until the test lets it go.
const rig = (ms, far = true) => {
  const r = { t: 0, ms, shown: [], sync: [], sent: [], wait: [] };
  r.p = guidePacer(a => { r.sync.push(a); r.t += r.ms; return 'g' + a; }, far ? a => { r.sent.push(a); return new Promise((ok, no) => r.wait.push({ ok: () => { r.t += r.ms; ok('g' + a); }, no })); } : null, (g, cost, off) => r.shown.push([g, cost, off]), () => r.t);
  return r;
};
{ // A cheap guide is on the JS thread and on screen at once.
  const r = rig(1); r.p.ask(1); r.p.ask(2);
  assert.deepStrictEqual(r.shown, [['g1', 1, false], ['g2', 1, false]]); assert(!r.sent.length);
  ok('a guide under ' + FAST + ' ms stays on the JS thread');
}
{ // A slow one moves the next to the other thread; while it is away only the newest ask waits.
  const r = rig(20); r.p.ask(1); r.p.ask(2); r.p.ask(3); r.p.ask(4);
  assert.deepStrictEqual([r.sync, r.sent], [[1], [2]], 'one slow guide on the JS thread, then away');
  r.wait[0].ok(); await flush();
  assert.deepStrictEqual(r.sent, [2, 4], '3 was dropped'); r.wait[1].ok(); await flush();
  assert.deepStrictEqual(r.shown.map(s => [s[0], s[2]]), [['g1', false], ['g2', true], ['g4', true]]);
  r.ms = 1; r.p.ask(5); r.wait[2].ok(); await flush(); r.p.ask(6);
  assert.deepStrictEqual(r.sync, [1, 6], 'a quick round trip brings the work back');
  ok('a slow guide goes off the JS thread, the latest ask wins, a fast one comes back');
}
{ // A pull goes far at once: no slow guide on the JS thread first.
  const r = rig(20); r.p.ask(1, true);
  assert.deepStrictEqual([r.sync, r.sent], [[], [1]]);
  ok('a pull on the rail never works out its guide on the JS thread');
}
{ // The table changed while a guide was away: it is not shown, and the ask after the change still runs.
  const r = rig(20); r.p.ask(1, true); r.p.ask(2, true); r.p.drop(); r.p.ask(3, true);
  r.wait[0].ok(); await flush(); assert.deepStrictEqual([r.shown, r.sent], [[], [1, 3]]);
  r.wait[1].ok(); await flush(); assert.deepStrictEqual(r.shown.map(s => s[0]), ['g3']);
  ok('a guide for a table that changed is dropped');
}
{ // The other thread fails: that guide and all later ones are worked out on the JS thread.
  const r = rig(20); r.p.ask(1, true); r.wait[0].no(new Error('x')); await flush(); r.p.ask(2, true);
  assert.deepStrictEqual([r.sync, r.sent, r.shown.map(s => s[0])], [[1, 2], [1], ['g1', 'g2']]);
  const w = rig(20, false); w.p.ask(1, true); assert.deepStrictEqual(w.sync, [1]);
  ok('with no other thread, or a failed one, the JS thread does the work');
}
