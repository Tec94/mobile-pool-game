// A tournament match snapshot at the break, for the tests (snap.test.mjs, match.test.mjs).
import { breakSpot, rack } from '../physics/engine.ts';
import { newGame } from '../rules/rules.ts';
import { breakShot } from '../ai/turn.ts';
import { rng } from '../ai/shot-ai.ts';
import { newLedger } from '../progress/pay.ts';

const mk = (x, y) => ({ x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true });
export function snapshot(game) {
  const [bx, by] = breakSpot(), R = rack(game), B = [mk(bx, by), ...R.map(([, x, y]) => mk(x, y))], ids = [0, ...R.map(([id]) => id)];
  return { v: 1, B, ids, rules: newGame(game, 0, true, 0, 9), push: false, ledger: newLedger(), safe: { row: 0, rack: 0 }, seed: 9, cue: 'house', stats: { power: 5, spin: 5, aim: 5 }, shot: breakShot(B, ids, rng(4)) };
}
