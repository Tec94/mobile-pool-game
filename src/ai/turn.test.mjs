// Run: npm test   (the AI seat in a match: where it puts the cue ball in hand, its call, its decisions, and whole racks
// played AI against AI through the rules and the engine, with no screen)
import assert from 'node:assert';
import { breakSpot, HOLES, P, rack, step, strike } from '../physics/engine.ts';
import { choose, handCue, judge, legalSpot, moveCue, newGame, newRec, record, setCall, spotBall } from '../rules/rules.ts';
import { breakShot, callFor, candsFor, choiceFor, groupsOf, holeOf, nextSafeties, placeCue, potPay, safetiesArg, softMove, think } from './turn.ts';
import { enumerate, NINE, rng, SOLIDS, STRIPES, TIERS } from './shot-ai.ts';
import { TIER_COUNT } from '../settings/settings.ts';
let n = 0; const ok = name => console.log(`ok ${++n} ${name}`);
const eq = (a, b, msg) => assert.deepStrictEqual(a, b, msg);
const mk = (x, y, on = true) => ({ x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on });
const rec = (first, pots = [], more = {}) => ({ ...newRec(), first, pots: pots.map(([id, pocket = 0]) => ({ id, pocket })), railAfter: true, crossed: true, ...more });
// The table at the start of a rack, as App.tsx racks it.
const racked = game => { const [x, y] = breakSpot(); return { B: [mk(x - 1e-3, y), ...rack(game).map(([, x, y]) => mk(x, y))], ids: [0, ...rack(game).map(([id]) => id)] }; };
// Player 1 at an 8-ball table with groups set: player 1 has stripes.
const play8 = (more = {}) => ({ ...newGame(8, 0, true), phase: 'play', turn: 1, solids: 0, ...more });

{ const s = play8(); eq(groupsOf(s, 1), [STRIPES, SOLIDS]); eq(groupsOf(s, 0), [SOLIDS, STRIPES]); eq(groupsOf({ ...s, solids: -1 }, 1), null, 'open table: the AI picks');
  eq(groupsOf(newGame(9), 1), [NINE, NINE]);
  ok('groups for the picker');
}
{ // The 1 sits in the middle of the table, the 10 beside it. In hand anywhere: straight behind the 1 into a pocket.
  const B = [mk(0.3, 0.3), mk(1.1, 0.56), mk(1.6, 0.9)], ids = [0, 1, 10], at = placeCue(B, ids, 'any', [1]);
  assert(at && legalSpot(B, at[0], at[1], 'any'), 'a legal spot');
  const d = Math.hypot(at[0] - B[1].x, at[1] - B[1].y); assert(d < 0.2 + 2 * P.R, `close behind the ball (${d.toFixed(3)} m)`);
  B[0] = { ...B[0], x: at[0], y: at[1] }; const shots = enumerate({ x: at[0] * 1000, y: at[1] * 1000 }, [{ id: 1, x: 1100, y: 560 }, { id: 10, x: 1600, y: 900 }], [1]);
  assert(shots.some(c => c.type === 'direct' && c.cut < 0.01), 'a straight-in pot from there');
  const k = placeCue(B, ids, 'kitchen', [1]); assert(!k || (k[0] < P.L / 4 && legalSpot(B, k[0], k[1], 'kitchen')), 'in the kitchen, behind the head string or nothing');
  eq(placeCue(B, ids, 'any', []), null, 'no legal ball: no spot');
  const T = [mk(0.3, 0.3), mk(1.1, 0.56), mk(1.6, 0.9), mk(0.4, 1.0)], m = think(T.map(b => ({ ...b })), [0, 1, 10, 8], play8({ hand: 'any', balls: [1, 10, 8] }), 2, 1, 0);
  assert(m.at && Math.hypot(m.at[0] - 1.6, m.at[1] - 0.9) < 0.2 + 2 * P.R, `stripes: it places behind the 10 (${m.at})`);
  // In the kitchen, stripes: the 10 lies behind the head string, the 12 below it. Every shot must go at the 12.
  const K = [mk(0.2, 0.3), mk(0.4, 0.9), mk(1.8, 0.4), mk(2.2, 1.0)], kid = [0, 10, 12, 8];
  for (let seed = 1; seed <= 5; seed++) {
    const C = K.map(b => ({ ...b })), m = think(C, kid, play8({ hand: 'kitchen', balls: [10, 12, 8] }), 4, seed, 0), r = newRec(), ev = [];
    C[0].x = m.at?.[0] ?? C[0].x; C[0].y = m.at?.[1] ?? C[0].y; strike(C[0], m.shot);
    for (let i = 0; i < 20000 && r.first < 0 && step(C, (ev.length = 0, ev)); i++) record(r, ev, C, kid);
    assert(r.first !== 10, `seed ${seed}: not the 10 behind the line`);
  }
  ok('ball in hand: a legal spot behind a straight pot');
}
{ const { B, ids } = racked(8), s = breakShot(B, ids, rng(1)), o = B[ids.indexOf(1)];
  assert(Math.abs(s.ang - Math.atan2(o.y - B[0].y, o.x - B[0].x)) < 0.006 && s.speed > 10, 'hard, at the 1');
  const m = think(B.map(b => ({ ...b })), ids, newGame(8, 1), 1, 1, 0); eq([m.at, m.call, m.safety], [null, -1, false], 'the break: no placing, no call');
  ok('the AI breaks hard at the apex ball');
}
{ // Calls: a pot names the pocket of its path; on the 8 a safety still calls the pocket nearest the 8.
  const pot = { type: 'direct', paths: [[{ x: 0, y: 0 }], [{ x: 1000, y: 500 }, { x: 44, y: 44 }]] }, B = [mk(1, 0.5), mk(P.L - 0.1, P.W - 0.1)], ids = [0, 8];
  eq(callFor(play8(), pot, B, ids), 0, 'WPA calls every shot: the corner the path ends in');
  eq(callFor(play8({ callAll: false }), pot, B, ids), -1, '8 only: no call off the 8');
  const on8 = play8({ callAll: false, balls: [8, 1] }); eq(callFor(on8, { type: 'safety' }, B, ids), 3, 'on the 8: the pocket nearest the 8');
  eq(holeOf({ paths: [[{ x: HOLES[4][0] * 1000, y: 8 }]] }), 4, 'side pocket');
  ok('the AI calls its pocket');
}
{ // stripes: the 1 is nearer, the 10 is the nearest legal ball
  const B = [mk(1, 0.6), mk(1.2, 0.6), mk(1, 1.0), mk(2, 0.3)], m = softMove(B, [0, 1, 10, 8], play8({ balls: [1, 10, 8] }));
  assert(Math.abs(m.shot.ang - Math.PI / 2) < 1e-9 && m.shot.speed === 1 && m.at === null, `soft, at the 10 (${m.shot.ang})`);
  ok('a soft shot at the nearest legal ball when think fails');
}
{ eq(choiceFor({ choice: [{ label: 'Shoot' }, { label: 'Pass it back', turn: 0 }] }), 0, 'push out: shoot');
  eq(choiceFor({ choice: [{ label: 'Play it as it lies' }, { label: 'Ball in hand behind the line', hand: 'kitchen' }] }), 1, 'take ball in hand');
  eq(choiceFor({ choice: [{ label: 'Spot the 8 and play on' }, { label: 'Break again', rack: true }] }), 0, 'spot the 8');
  let k = { row: 0, rack: 0 }; for (const s of [true, true, true]) k = nextSafeties(k, s); eq([k, safetiesArg(k)], [{ row: 3, rack: 3 }, 2]);
  k = nextSafeties(k, false); eq(safetiesArg(k), 0); k = nextSafeties(k, true); eq(safetiesArg(k), 2, 'four in the rack: must pot');
  ok('decisions and safeties in a row');
}
{ // Pay for the human (player 0, solids) at tier Regular: a pot matched to its candidate, a fluke, a foul, their ball.
  const s = { ...play8(), turn: 0 }, cands = enumerate({ x: 600, y: 560 }, [{ id: 1, x: 1100, y: 560 }], [1]), c = cands.find(k => k.type === 'direct');
  const after = judge(s, rec(1, [[1, holeOf(c)]], { direct: true }));
  let r = potPay(cands, rec(1, [[1, holeOf(c)]]), s, after, 0, { tier: 2 }); assert(r.pay.xp > 0 && r.run === 1 && r.own === 1, 'a pot pays, counts as own and the run goes on');
  eq(potPay([], rec(1, [[1, holeOf(c)]]), s, after, 0, { tier: 2 }).pay, { xp: 9, coins: 4 }, 'no candidate: a fluke, Routine x0.9');
  const foul = judge(s, rec(1, [[1, 0], [0, 1]])); eq(potPay(cands, rec(1, [[1, 0], [0, 1]]), s, foul, 2, { tier: 2 }), { pay: { xp: 0, coins: 0 }, run: 0, own: 0 }, 'a foul pays nothing and ends the run');
  eq(potPay(cands, rec(9, [[9, 0]]), s, judge(s, rec(1, [[9, 0]])), 0, { tier: 2 }).pay, { xp: 0, coins: 0 }, 'their ball pays nothing');
  const lost = rec(1, [[1, 0], [8, 1], [0, 2]]), end = judge(s, lost); eq(potPay(cands, lost, s, end, 0, { tier: 2 }), { pay: { xp: 0, coins: 0 }, run: 0, own: 0 }, 'the 8 on a scratch loses the rack: its pots are foul pots and pay nothing');
  const T = [mk(0.6, 0.56), mk(1.1, 0.56), mk(1.6, 0.9)], ids = [0, 1, 10];
  eq([...new Set(candsFor(T, ids, s).map(k => k.ball))], [1], 'solids: candidates for the 1 only');
  eq([...new Set(candsFor(T, ids, { ...s, solids: -1 }).map(k => k.ball))].sort(), [1, 10], 'open table: any ball');
  assert.strictEqual(TIER_COUNT, TIERS.length, 'the settings know how many tiers there are');
  ok('the human pots pay against the AI');
}

// A whole rack, AI against AI, through think(), the rules and the engine, as App.tsx glues them. Returns the shots.
function playRack(game, tiers, seed, cap = 150) {
  let s = newGame(game, 0, true), t = racked(game), shots = 0, safe = [{ row: 0, rack: 0 }, { row: 0, rack: 0 }];
  const settle = next => { if (next.phase === 'break') { t = racked(game); safe = safe.map(() => ({ row: 0, rack: 0 })); } else { for (const id of next.spot) spotBall(t.B, t.ids.indexOf(id)); if (next.hand) handCue(t.B, next.hand); } s = next; };
  while (s.phase !== 'over') {
    if (s.choice) { settle(choose(s, choiceFor(s))); continue; }
    assert(++shots <= cap, `${game}-ball rack still going after ${cap} shots: ${s.note}`);
    const p = s.turn, m = think(t.B.map(b => ({ ...b })), t.ids, s, tiers[p], seed + shots, safetiesArg(safe[p]));
    if (m.at) assert(moveCue(t.B, m.at[0], m.at[1], s.hand), 'the spot it picked is legal');
    if (m.call >= 0) s = setCall(s, m.call);
    safe[p] = nextSafeties(safe[p], m.safety);
    const r = newRec(), ev = []; strike(t.B[0], m.shot);
    for (let k = 0; k < 60000 && (ev.length = 0, step(t.B, ev)); k++) record(r, ev, t.B, t.ids);
    settle(judge(s, r));
  }
  return { shots, winner: s.winner, note: s.note };
}
for (const [game, tiers, seed] of [[8, [2, 2], 10], [8, [1, 3], 20], [9, [2, 2], 30], [9, [1, 3], 40], [8, [3.4, 0.5], 50]]) {
  const r = playRack(game, tiers, seed);
  assert(r.winner === 0 || r.winner === 1, 'the rack has a winner');
  ok(`${game}-ball, tiers ${tiers}: rack over in ${r.shots} shots (${r.note})`);
}
