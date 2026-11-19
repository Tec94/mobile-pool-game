// Run: npm test. The saved tournament match (src/tournament/snap.ts): what fits, and that a saved shot plays out the
// same after the save is written and read back, which is what resuming a match after a relaunch relies on.
import assert from 'node:assert';
import test from 'node:test';
import { breakSpot, rack, step, strike } from '../physics/engine.ts';
import { newGame } from '../rules/rules.ts';
import { breakShot } from '../ai/turn.ts';
import { rng } from '../ai/shot-ai.ts';
import { newLedger } from '../progress/pay.ts';
import { fits } from './snap.ts';

const mk = (x, y) => ({ x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true });
function snapshot(game) {
  const [bx, by] = breakSpot(), R = rack(game), B = [mk(bx, by), ...R.map(([, x, y]) => mk(x, y))], ids = [0, ...R.map(([id]) => id)];
  return { v: 1, B, ids, rules: newGame(game, 0, true, 0, 9), push: false, ledger: newLedger(), safe: { row: 0, rack: 0 }, seed: 9, cue: 'house', stats: { power: 5, spin: 5, aim: 5 }, shot: breakShot(B, ids, rng(4)) };
}
const play = (s) => { const B = s.B.map((b) => ({ ...b })); strike(B[0], s.shot); for (let k = 0; k < 60000 && step(B); k++); return B; };

test('a saved shot plays out the same after the save is written and read back', () => {
  for (const game of [8, 9]) { const s = snapshot(game); assert.deepStrictEqual(play(JSON.parse(JSON.stringify(s))), play(s)); }
});
test('a snapshot fits only its own game, version and shape', () => {
  const s = JSON.parse(JSON.stringify(snapshot(8)));
  assert(fits(s, 8)); assert(!fits(s, 9)); assert(!fits(null, 8));
  for (const bad of [{ ...s, v: 2 }, { ...s, B: s.B.slice(1) }, { ...s, B: [{ ...s.B[0], x: null }, ...s.B.slice(1)] }, { ...s, cue: 'gone' }, { ...s, stats: undefined }, { ...s, rules: { ...s.rules, balls: 3 } }])
    assert(!fits(bad, 8));
});
