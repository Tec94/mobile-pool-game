// Run: npm test   (checks the rules against the WPA Rules of Play, 2026-10-21; rule numbers are that edition's)
import assert from 'node:assert';
import { P, rack, step, strike } from '../physics/engine.ts';
import { canCall, choose, handCue, judge, legalSpot, lowest, moveCue, newGame, newRec, onEight, record, setCall, spotBall } from './rules.ts';
let n = 0; const ok = name => console.log(`ok ${++n} ${name}`);
const eq = (a, b, msg) => assert.deepStrictEqual(a, b, msg);
const mk = (x, y) => ({ x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true });
// A shot record: first ball hit, pots as [ball, pocket], and what else happened. By default a rail was reached.
const rec = (first, pots = [], more = {}) => ({ ...newRec(), first, pots: pots.map(([id, pocket = 0]) => ({ id, pocket })), railAfter: true, crossed: true, ...more });
// An 8-ball game after a dry legal break by player 0, so player 1 is at an open table.
const open8 = (callAll = false) => judge(newGame(8, 0, callAll), rec(1, [], { rails: [1, 2, 3, 4] }));
// Groups decided: player 1 potted the 3, so player 1 has solids and stays at the table.
const solids1 = () => judge(open8(), rec(3, [[3]]));

{ // 4.3: the break
  const s = newGame(8); eq([s.phase, s.hand, s.balls.length, s.solids], ['break', 'kitchen', 15, -1], 'cue ball starts in hand above the head string');
  let a = judge(s, rec(1, [[5]], { rails: [5] })); eq([a.turn, a.solids, a.phase, a.choice], [0, -1, 'play', null], '(c) a ball down keeps the breaker at an open table');
  a = open8(); eq([a.turn, a.solids, a.hand, a.choice], [1, -1, false, null], 'a dry legal break passes the table, still open');
  a = judge(s, rec(1, [], { rails: [1, 2, 3] })); eq([a.turn, a.choice.length], [1, 3], '(d) three balls to a rail is an illegal break: the opponent has three options');
  eq(choose(a, 0).choice, null, 'accept the table'); eq([choose(a, 1).phase, choose(a, 1).turn, choose(a, 1).balls.length], ['break', 1, 15], 'rack again and break');
  eq([choose(a, 2).phase, choose(a, 2).turn], ['break', 0], 'make the breaker break again');
  a = judge(s, rec(1, [[8], [3]], { rails: [3, 8] })); eq([a.turn, a.phase, a.balls.includes(8), a.spot, a.choice.length], [0, 'play', true, [8], 2], '(e) the 8 on a legal break is spotted, not a win: the breaker picks');
  eq(choose(a, 1).phase, 'break', 'or breaks again'); eq(choose(a, 0).turn, 0, 'and plays on');
  a = judge(s, rec(1, [[8], [0]])); eq([a.turn, a.winner, a.spot], [1, -1, [8]], '(f) the 8 and a scratch on the break: no loss, the opponent picks');
  eq(choose(a, 0).hand, 'kitchen', 'spot the 8 with ball in hand above the head string'); eq([choose(a, 1).phase, choose(a, 1).turn], ['break', 1], 'or break');
  a = judge(s, rec(1, [[0]])); eq([a.turn, a.hand, a.choice], [1, 'kitchen', null], '(h) a scratch on the break: ball in hand above the head string');
  a = judge(s, rec(1, [], { off: [8, 4], rails: [1, 2, 3, 5] })); eq([a.turn, a.spot, a.balls.includes(4), a.choice.length], [1, [8], false, 2], '(g) balls off the table on the break: the 8 is spotted, others stay off');
  eq([choose(a, 0).hand, choose(a, 1).hand], [false, 'kitchen'], 'the incoming player accepts the table or takes ball in hand above the head string');
  eq(judge(s, rec(8, [], { rails: [1, 2, 3, 8] })).choice, null, '(b) no ball has to be hit first on the break, not even the 8');
  ok('8-ball break follows 4.3');
}
{ // 4.4, 4.5: open table and groups
  let s = open8();
  let a = judge(s, rec(11, [[11]])); eq([a.solids, a.turn], [0, 1], 'potting a stripe gives the shooter stripes, and the shooter goes on');
  a = judge(s, rec(8)); eq([a.turn, a.hand], [0, 'any'], 'the 8 first on an open table is a foul');
  a = judge(s, rec(2, [[11], [3]])); eq(a.solids, 0, 'a ball of each group: the first to fall decides');
  a = judge(s, rec(2)); eq([a.turn, a.solids, a.hand], [0, -1, false], 'a miss passes an open table');
  a = judge(s, rec(2, [[2], [0]])); eq([a.solids, a.turn, a.hand, a.balls.includes(2)], [-1, 0, 'any', false], 'a pot on a foul decides nothing and stays down');
  s = solids1();
  a = judge(s, rec(1, [[1]])); eq(a.turn, 1, 'own ball down: the shooter goes on');
  a = judge(s, rec(1, [[12]])); eq([a.turn, a.hand, a.balls.includes(12)], [0, false, false], 'only the opponent\'s ball down: the turn ends, the ball stays down');
  a = judge(s, rec(1, [[12], [1]])); eq(a.turn, 1, 'both down: the shooter goes on');
  ok('open table and groups follow 4.4 and 4.5');
}
{ // 4.9: standard fouls give ball in hand anywhere
  const s = solids1(), foul = (r, why) => { const a = judge(s, r); eq([a.turn, a.hand], [0, 'any'], why); assert(a.note.startsWith('Foul'), why); };
  foul(rec(1, [[0]]), '3.1 scratch'); foul(rec(1, [], { off: [0] }), '3.1 cue ball off the table');
  foul(rec(12), '3.2 opponent\'s ball first'); foul(rec(8), '3.2 the 8 first with own balls left'); foul(rec(-1), '3.3 no ball hit');
  foul(rec(1, [], { railAfter: false }), '3.3 no rail after contact'); foul(rec(1, [[1]], { off: [5] }), '3.5 object ball off the table');
  eq(judge(s, rec(1, [[1]], { railAfter: false })).turn, 1, 'a pot needs no rail');
  eq(judge(s, rec(1, [], { off: [5] })).balls.includes(5), false, '4.7 a ball driven off the table is not spotted');
  const k = { ...s, hand: 'kitchen' };
  eq(judge(k, rec(1, [], { crossed: false })).hand, 'any', '3.11 ball in hand above the head string must not play a ball above it');
  eq(judge(k, rec(1)).hand, false, '3.11 legal once the cue ball crosses the head string');
  ok('8-ball fouls follow 4.9');
}
{ // 4.8 and the win
  let s = solids1(); s = { ...s, balls: [8, 9, 12] }; // player 1 (solids) has cleared the group
  assert(onEight(s) && canCall(s), 'on the 8');
  let a = judge(setCall(s, 2), rec(8, [[8, 2]])); eq([a.phase, a.winner], ['over', 1], 'the 8 in the called pocket wins');
  a = judge(setCall(s, 2), rec(8, [[8, 3]])); eq(a.winner, 0, '(c) the 8 in another pocket loses');
  a = judge(s, rec(8, [[8, 3]])); eq(a.winner, 0, '(c) the 8 with no pocket called loses');
  a = judge(setCall(s, 2), rec(8, [[8, 2], [0, 1]])); eq(a.winner, 0, '(a) the 8 and a scratch loses');
  a = judge(setCall(s, 2), rec(8, [], { off: [8] })); eq(a.winner, 0, '(d) the 8 off the table loses');
  a = judge(setCall(s, 2), rec(8, [[0]])); eq([a.phase, a.turn, a.hand], ['play', 0, 'any'], 'a scratch on a missed 8 is only a foul');
  a = judge(solids1(), rec(1, [[1], [8]])); eq(a.winner, 0, '(b) the 8 before the group is cleared loses');
  a = judge(open8(), rec(1, [[8]])); eq(a.winner, 0, '(b) the 8 on an open table loses');
  s = { ...solids1(), balls: [7, 8, 9] };
  a = judge(setCall(s, 2), rec(7, [[7, 2], [8, 2]])); eq(a.winner, 0, 'the last ball and the 8 on one shot loses');
  eq(judge(setCall(s, 2), rec(7, [[7, 2]])).call, -1, 'a call lasts one shot');
  ok('8-ball ends by 4.8');
}
{ // 1.7: call shot (the default), and the "8 only" setting
  const s = judge(open8(true), rec(3, [[3, 1]], { direct: true })); eq([s.solids, s.turn], [1, 1], 'an obvious pot needs no call');
  let a = judge(s, rec(1, [[1, 4]], { direct: false })); eq([a.turn, a.balls.includes(1)], [0, false], 'an uncalled bank or combination does not keep the table; the ball stays down');
  eq(a.note, 'Not called: the turn passes.', 'and the screen says why');
  a = judge(s, rec(2, [[1, 4]], { direct: false })); eq(a.turn, 0, 'a ball that was not the one aimed at, uncalled: turn over');
  a = judge(setCall(s, 4), rec(2, [[1, 4]])); eq(a.turn, 1, 'the same shot counts when the pocket was called');
  a = judge(setCall(s, 5), rec(1, [[1, 4]], { direct: true })); eq(a.turn, 0, 'a called pocket missed: turn over, even on a straight pot elsewhere');
  a = judge(open8(true), rec(3, [[3, 1]], { direct: false })); eq([a.solids, a.turn], [-1, 0], 'an uncalled fluke on an open table decides nothing');
  a = judge(open8(true), rec(11, [[3, 1], [11, 2]], { direct: true })); eq(a.solids, 0, 'with no call only the ball that was aimed at counts: stripes, though a solid fell first');
  assert(canCall(s) && !canCall(solids1()) && !canCall(newGame(8)), 'pockets can be called on every shot but the break, and only on the 8 with call shot off');
  eq(judge(solids1(), rec(2, [[1, 4]], { direct: false })).turn, 1, 'with call shot off a fluke keeps the table');
  ok('call shot follows 1.7, with a switch');
}
{ // 5: 9-ball
  const s = newGame(9); eq([s.balls.length, s.hand], [9, 'kitchen'], '9 balls, break from above the head string');
  let a = judge(s, rec(1, [], { rails: [1, 2, 3] })); eq([a.turn, a.hand, a.fouls], [1, 'any', [1, 0]], '5.3 a dry break with three balls to a rail is a foul');
  a = judge(s, rec(1, [[9, 0]])); eq([a.phase, a.winner], ['over', 0], '5.5 the 9 on a legal break wins');
  a = judge(s, rec(1, [[9], [0]])); eq([a.phase, a.balls.includes(9), a.spot, a.hand], ['play', true, [9], 'any'], '5.6 the 9 on a foul is spotted');
  a = judge(s, rec(2, [[2]])); eq(a.hand, 'any', '5.7 the 1 must be hit first, also on the break');
  const p = judge(s, rec(1, [], { rails: [1, 2, 3, 4] })); eq([p.turn, p.push, lowest(p)], [1, true, 1], '5.4 a push out is open after a legal break');
  a = judge(p, rec(1, [[4]])); eq([a.turn, a.push, lowest(a)], [1, false, 1], '5.5 any ball down on a legal shot keeps the table');
  a = judge(p, rec(1, [[1], [9, 3]])); eq(a.winner, 1, 'the 9 by combination wins');
  a = judge(p, rec(3)); eq([a.turn, a.hand], [0, 'any'], 'wrong ball first');
  a = judge(p, rec(1, [], { off: [9] })); eq([a.spot, a.hand], [[9], 'any'], '5.7 the 9 off the table is spotted, and a foul');
  a = judge(p, rec(1, [], { off: [5] })); eq(a.balls.includes(5), false, 'another ball off the table stays off');
  a = judge(p, rec(-1, [[9]], { railAfter: false }), true); eq([a.phase, a.turn, a.spot, a.hand, a.choice.length], ['play', 0, [9], false, 2], '5.4 a push out needs no ball or rail; the 9 is spotted; the other player picks');
  eq([choose(a, 0).turn, choose(a, 1).turn], [0, 1], 'shoot, or pass it back');
  a = judge(p, rec(-1, [[0]]), true); eq([a.turn, a.hand, a.choice], [0, 'any', null], 'a scratch on a push out is a foul');
  let t = { ...p, fouls: [0, 2] }; a = judge(t, rec(-1)); eq([a.phase, a.winner], ['over', 0], '5.8 three fouls in a row lose the rack');
  a = judge(t, rec(1)); eq(a.fouls, [0, 0], 'a legal shot clears the count');
  ok('9-ball follows section 5');
}
{ // The record is built from the engine's events
  const play = (B, ids, shot) => { const r = newRec(), ev = []; strike(B[0], shot); for (let i = 0, mv = true; mv && i < 60000; i++) { ev.length = 0; mv = step(B, ev); record(r, ev, B, ids); } return r; };
  const corner = Math.atan2(-0.4, -0.4); // towards the pocket at the origin
  let r = play([mk(0.6, 0.6), mk(0.4, 0.4)], [0, 3], { ang: corner, speed: 2, a: 0, b: 0 });
  eq([r.first, r.pots.map(p => p.id).includes(3), r.pots[0].pocket, r.direct, r.rails.includes(3)], [3, true, 0, true, true], 'a straight pot: first ball, pocket, obvious, and driven to a rail');
  r = play([mk(0.6, 0.6), mk(0.4, 0.4)], [0, 3], { ang: corner, speed: 4, a: 0, b: 0.4 }); assert(r.pots.some(p => p.id === 0), 'a follow shot into the same pocket scratches');
  r = play([mk(0.5, 0.5), mk(0.4, 0.4), mk(0.3, 0.3)], [0, 3, 5], { ang: corner, speed: 3, a: 0, b: 0 });
  eq([r.first, r.pots.some(p => p.id === 5), r.direct], [3, true, false], 'a combination pots the second ball');
  { const ox = P.L / 2 - 0.3, oy = 0.3, ang = Math.atan2(-(oy + P.W), 0.3); // off the near long rail into the far side pocket
    r = play([mk(ox - 0.2 * Math.cos(ang), oy - 0.2 * Math.sin(ang)), mk(ox, oy)], [0, 3], { ang, speed: 2, a: 0, b: 0 });
    eq([r.pots.map(p => p.id), r.pots[0].pocket, r.direct], [[3], 5, false], 'a bank is not an obvious shot'); }
  { const y = 0.963 * P.R + 0.005; r = play([mk(1.0, y + 0.01), mk(0.7, y)], [0, 3], { ang: Math.atan2(-0.01, -0.3), speed: 2, a: 0, b: 0 }); }
  eq([r.pots.map(p => p.id), r.pots[0].pocket, r.banks.length > 0, r.direct], [[3], 0, true, true], 'a ball that runs down the rail into the corner is an obvious shot (1.7: cushions struck do not matter)');
  r = play([mk(0.8, 0.4), mk(0.06, 0.06)], [0, 3], { ang: -1.91, speed: 2.5, a: 0, b: 0 });
  eq([r.first, r.pots.map(p => p.id), r.direct], [3, [3], false], 'a kick off a rail is not an obvious shot');
  r = play([mk(0.9, 0.6), mk(1.0, 0.6)], [0, 3], { ang: 0, speed: 0.5, a: 0, b: 0 }); eq([r.first, r.railAfter, r.pots.length], [3, false, 0], 'a soft hit reaches no rail');
  r = play([mk(0.3, 0.6), mk(0.45, 0.6)], [0, 3], { ang: 0, speed: 1, a: 0, b: 0 }); eq(r.crossed, false, 'a ball above the head string hit from above it');
  r = play([mk(0.3, 0.6), mk(1.0, 0.6)], [0, 3], { ang: 0, speed: 1, a: 0, b: 0 }); eq(r.crossed, true, 'a ball below the head string');
  r = play([mk(0.3, 0.6), mk(P.L / 4 + 0.02, 0.6)], [0, 3], { ang: 0, speed: 1, a: 0, b: 0 }); eq(r.crossed, true, 'a ball just below the head string, met before the cue ball crosses it');
  r = play([mk(0.45, 0.5), mk(0.2, 0.5)], [0, 3], { ang: 0, speed: 4, a: 0, b: 0 }); eq([r.first, r.crossed], [3, true], 'a kick off the foot rail crosses the head string first');
  const B = [mk(P.L / 4 - 0.001, P.W / 2)], ids = [0]; for (const [id, x, y] of rack(8)) { ids.push(id); B.push(mk(x, y)); }
  r = play(B, ids, { ang: 0, speed: 12, a: 0, b: 0 }); assert(r.first === 1 && r.crossed && r.rails.length >= 4, 'a full break drives four balls to a rail: ' + r.rails.length);
  ok('the shot record follows the engine');
}
{ // Where balls may go
  const B = [mk(1, 0.5), mk(0.75 * P.L, P.W / 2), mk(0.2, 0.2)]; B[0].on = false;
  handCue(B, 'kitchen'); assert(B[0].on && B[0].x < P.L / 4 && Math.abs(B[0].y - P.W / 2) < 1e-9, 'a scratched cue ball comes back at the head spot, above the head string');
  assert(moveCue(B, 0.21, 0.2, 'any') && Math.abs(Math.hypot(B[0].x - 0.2, B[0].y - 0.2) - 2 * P.R) < 1e-3, 'dragged onto a ball, the cue ball slides round it');
  assert(moveCue(B, 5, 5, 'any') && B[0].x <= P.L - P.R && B[0].y <= P.W - P.R, 'it stays on the playing surface');
  moveCue(B, 1.5, 0.5, 'kitchen'); assert(B[0].x < P.L / 4, 'and above the head string when the rules say so');
  assert(legalSpot(B, 1, 0.97 * P.R, 'any') && !legalSpot(B, 1, 0.9 * P.R, 'any'), 'a cue ball at rest against a cushion lies on a legal place');
  assert(!legalSpot(B, P.L / 4, 0.5, 'kitchen') && legalSpot(B, P.L / 4, 0.5, 'any'), 'on the head string is not above it');
  B[0].x = 1.2; B[0].y = 0.9; handCue(B, 'any'); eq([B[0].x, B[0].y], [1.2, 0.9], 'a cue ball already on a legal place is left there');
  handCue(B, 'kitchen'); assert(B[0].x < P.L / 4, 'ball in hand above the head string brings it back there');
  B.push(mk(0, 0)); B[3].on = false; spotBall(B, 3);
  assert(B[3].on && B[3].y === P.W / 2 && B[3].x > B[1].x && Math.abs(B[3].x - B[1].x - 2 * P.R) < 1e-3, '1.5 a spotted ball goes behind a ball on the foot spot, touching it');
  B[1].on = false; spotBall(B, 3); eq(B[3].x, 0.75 * P.L, 'and on the foot spot when it is free');
  ok('cue ball in hand and spotting follow 1.5 and 1.6');
}
console.log(`\n${n} checks passed`);
