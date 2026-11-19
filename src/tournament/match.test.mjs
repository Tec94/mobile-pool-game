// Run: npm test. The tournament match wiring (src/tournament/match.ts): a result is saved before it pays, a failed
// save pays nothing, only the match in play can end, and the prize preview.
import assert from 'node:assert';
import test from 'node:test';
import { newRun, recordMatch } from './bracket.ts';
import { tourMatch } from './match.ts';

const opts = { cup: 0, size: 4, best: 3, game: 8, callAll: true, bank: 0 };
const none = { xp: 0, coins: 0 };
// A fake App: the run in memory, saves that work or fail, and the pays made.
function io(run, saves = true) {
  const o = { run, paid: [], kept: 0 };
  return Object.assign(o, { get: () => o.run, put: (r) => { o.run = r; return saves; }, pay: (r) => (o.paid.push(r.earned), 'paid'), keep: (r) => { o.run = r; o.kept++; } });
}

test('a result is saved, then paid; a save that fails pays nothing', () => {
  const a = io(newRun(opts, 5)), m = tourMatch(a);
  assert.equal(m.done(true, [2, 1], { xp: 100, coins: 50 }), 'paid');
  assert.deepStrictEqual(a.paid, [{ xp: 100, coins: 50 }]); assert.equal(a.run.res.filter(Boolean).length, 2);
  const b = io(newRun(opts, 5), false);
  assert.equal(tourMatch(b).done(true, [2, 1], { xp: 100, coins: 50 }), null); assert.deepStrictEqual(b.paid, []);
});

test('only the match in play ends: a forfeit after its result does nothing', () => {
  const a = io(newRun(opts, 5)), m = tourMatch(a);
  m.done(true, [2, 0], none); const after = a.run;
  m.forfeit([0, 1]);
  assert.strictEqual(a.run, after, 'the next match is not lost'); assert.equal(a.paid.length, 1);
});

test('the live match saves without ending; the prize shows only for a match that ends the run', () => {
  const a = io(newRun(opts, 5)), m = tourMatch(a);
  m.save({ score: [1, 0] }); assert.deepStrictEqual(a.run.live.score, [1, 0]); assert.equal(a.kept, 1);
  assert.equal(m.prize(true), null, 'a semifinal win goes on'); assert(m.prize(false), 'a semifinal loss ends the run with its prize');
  const fin = io(recordMatch(newRun(opts, 5), true, [2, 0], none));
  assert(tourMatch(fin).prize(true).xp > tourMatch(fin).prize(false).xp, 'the title pays more than the final lost');
  assert.equal(tourMatch(io(recordMatch(newRun(opts, 5), false, [0, 2], none))), undefined, 'no match once the run is over');
});
