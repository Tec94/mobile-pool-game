// Run: npm test   (the AI seat in a match: where it puts the cue ball in hand, its call, its decisions, and whole racks
// played AI against AI through the rules and the engine, with no screen)
import assert from 'node:assert';
import { breakSpot, HOLES, P, rack, step, strike } from '../physics/engine.ts';
import { choose, handCue, judge, legalSpot, moveCue, newGame, newRec, record, setCall, spotBall } from '../rules/rules.ts';
import { breakShot, callFor, candsFor, choiceFor, comboSpot, groupsOf, holeOf, nextSafeties, onLit, placeCue, potPay, safetiesArg, softMove, think as clocked } from './turn.ts';
import { aiShot } from './aim.ts';
import { makeRates } from './bench.ts';
import { cushionAt } from '../rules/rules.ts';
import { enumerate, NINE, randomLayout, rng, SOLIDS, STRIPES, TIERS as CLOCKED } from './shot-ai.ts';
import { TIER_COUNT } from '../settings/settings.ts';
let n = 0; const ok = name => console.log(`ok ${++n} ${name}`);
// No clock: every think and aiShot searches the same whatever the machine's load (think's deadline, Tier.think).
const think = (B, ids, s, level, seed, safeties, style) => clocked(B, ids, s, level, seed, safeties, style, Infinity), TIERS = CLOCKED.map(t => ({ ...t, think: Infinity }));
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
{ // 9-ball in hand: the 9 hangs in a corner with the 1 near it, the rest frozen on the rails, so no run is on. A tier
  // with combos puts the cue ball on the line 1 -> 9 -> pocket; Regular (no combos) keeps the straight pot of the 1.
  const rails = [[1.9, 0.03], [1.4, 1.09], [2.2, 0.56], [0.9, 0.03], [1.5, 0.2], [1.8, 0.9], [2.2, 0.8]];
  const B = [mk(1.0, 0.8), mk(0.33, 0.33), ...rails.map(([x, y]) => mk(x, y)), mk(0.11, 0.11)], ids = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const s = { ...newGame(9, 0, true), phase: 'play', turn: 1, hand: 'any', balls: ids.slice(1) }, at = comboSpot(B, ids, 'any', 1);
  assert(at && legalSpot(B, at[0], at[1], 'any'), 'a legal combo spot');
  const line = (p, a, b) => Math.abs((b.x - a.x) * (p[1] - a.y) - (b.y - a.y) * (p[0] - a.x)) / Math.hypot(b.x - a.x, b.y - a.y);
  assert(line(at, B[1], B[9]) < 0.03, 'behind the 1, on its line to the 9');
  const pro = B.map(b => ({ ...b })); think(pro, ids, s, 5, 1, 0); eq([pro[0].x, pro[0].y], at, 'Pro takes the combo spot');
  const reg = B.map(b => ({ ...b })); think(reg, ids, s, 2, 1, 0); assert(reg[0].x !== at[0] || reg[0].y !== at[1], 'Regular does not');
  // the 1 an easy pot with the 2 next: Legend keeps the straight-in spot, Shark (no run to speak of) sets up the combo
  const E = [mk(0.227, 0.589), mk(1.142, 0.589), mk(1.347, 0.649), mk(1.862, 0.597)], eids = [0, 1, 9, 2], e = { ...s, balls: [1, 9, 2] }, spot = comboSpot(E, eids, 'any', 1);
  const leg = E.map(b => ({ ...b })); think(leg, eids, e, 6, 1, 0); assert(spot && (leg[0].x !== spot[0] || leg[0].y !== spot[1]), 'Legend runs the rack');
  const at9 = t => { const a = E.map(b => ({ ...b })); think(a, eids, e, t, 1, 0); return a[0].x === spot[0] && a[0].y === spot[1]; };
  assert(at9(4), 'Shark goes for the 9'); assert(!at9(3), 'Hustler wants a wider margin (spot) before it does');
  // no combo spot: the 9 is the lowest ball, or the 1 is blocked from the 9
  eq(comboSpot(B, ids, 'any', 9), null, 'the 9 alone');
  const blocked = [...B.map(b => ({ ...b })), mk(0.22, 0.22)]; eq(comboSpot(blocked, [...ids, 10], 'any', 1), null, 'a ball between the 1 and the 9');
  ok('9-ball ball in hand: set up the 9 combo when it beats the route');
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
  eq(callFor(play8(), pot, B, ids), 0, 'Call every shot: the corner the path ends in');
  eq(callFor(play8({ callAll: false }), pot, B, ids), -1, 'Call only the 8-ball: no call off the 8');
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
  const after = judge(setCall(s, holeOf(c)), rec(1, [[1, holeOf(c)]]));
  let r = potPay(cands, rec(1, [[1, holeOf(c)]]), s, after, 0, { tier: 2 }); assert(r.pay.xp > 0 && r.run === 1 && r.own === 1, 'a pot pays, counts as own and the run goes on');
  eq(potPay([], rec(1, [[1, holeOf(c)]]), s, after, 0, { tier: 2 }).pay, { xp: 9, coins: 4 }, 'no candidate: a fluke, Routine x0.9');
  const foul = judge(s, rec(1, [[1, 0], [0, 1]])); eq(potPay(cands, rec(1, [[1, 0], [0, 1]]), s, foul, 2, { tier: 2 }), { pay: { xp: 0, coins: 0 }, run: 0, own: 0, feats: [], mine: [] }, 'a foul pays nothing and ends the run');
  eq(potPay(cands, rec(9, [[9, 0]]), s, judge(s, rec(1, [[9, 0]])), 0, { tier: 2 }).pay, { xp: 0, coins: 0 }, 'their ball pays nothing');
  const lost = rec(1, [[1, 0], [8, 1], [0, 2]]), end = judge(s, lost); eq(potPay(cands, lost, s, end, 0, { tier: 2 }), { pay: { xp: 0, coins: 0 }, run: 0, own: 0, feats: [], mine: [] }, 'the 8 on a scratch loses the rack: its pots are foul pots and pay nothing');
  // A pot is typed by what happened, and its difficulty is the easiest way the picker found. easy = the same ways as Routine pots (x0.9 at Regular: 9 XP).
  const ENDS = [[0, 4], [4, 1], [1, 3], [3, 5], [5, 2], [2, 0]], h = holeOf(c), other = [4, 5].find(k => k !== h), cut = 30 * Math.PI / 180, far = k => ENDS.findIndex(e => !e.includes(k)); // far = a cushion that does not end at pocket k
  const easy = cands.map(k => ({ ...k, tol: k.tol * 12 })), paid = (more, cs = easy, vs = { tier: 2 }) => potPay(cs, rec(1, [[1, h]], more), q, after, 0, vs, 0.4), q = { ...s, hand: null }; // q: not ball in hand, which pays no type bonus
  eq([r.feats, r.mine, paid({}).pay.xp, paid({}).feats], [['sharp'], [1], 9, []], 'a Tough pot is a tough pot; a Routine pot counts for no feat');
  eq([paid({ cush: [[0, far(h), cut]] }).pay.xp, paid({ cush: [[0, far(h), cut]] }).feats], [14, ['kick']], 'the cue ball off a cushion first: a kick, x1.5, though a direct pot was on');
  eq([paid({ cush: [[1, far(h), cut]] }).pay.xp, paid({ cush: [[1, far(h), cut]] }).feats], [11, ['bank']], 'the potted ball off a cushion: a bank, x1.25');
  eq(paid({ cush: [[1, far(h), 0.2]] }).feats, [], 'a touch that turns the ball less than 20 degrees is no bank');
  eq(paid({ cush: [[1, ENDS.findIndex(e => e.includes(h)), cut]] }).feats, [], 'nor is the cushion that ends at its pocket');
  eq([paid({ first: 3 }).pay.xp, paid({ first: 3 }).feats], [11, ['combo']], 'the potted ball was not the first ball hit: a combo');
  const all = paid({ first: 3, cush: [[0, far(h), cut], [1, far(h), cut]] }); eq([all.feats, all.pay.xp], [['kick', 'bank', 'combo'], 14], 'a pot counts for every feat that fits and pays as the type that pays most');
  eq(potPay(easy, rec(1, [[1, other]]), q, judge(setCall(s, other), rec(1, [[1, other]])), 0, { tier: 2 }).pay, { xp: 9, coins: 4 }, 'no way found to that pocket: a fluke');
  eq([paid({ cush: [[0, 0, cut], [0, 2, cut]] }, []).pay, paid({ cush: [[0, 0, cut], [0, 2, cut]] }, []).feats], [{ xp: 34, coins: 14 }, ['kick', 'sharp']], 'a kick off 2 cushions with no way found: a Tough kick, and a tough pot');
  eq(paid({ cush: [[0, 0, cut]] }, []).pay.xp, 9, 'off 1 cushion with no way found: a fluke, a plain pot');
  eq([paid({ high: 0.031 }, []).pay.xp, paid({ high: 0.029 }, []).pay.xp], [23, 9], 'a jump pot (3 cm or more off the cloth) with no way found: Tough');
  const up = { ang: 0, speed: 3, a: 0.2, b: 0, elev: 5 * Math.PI / 180 };
  eq([paid({ shot: up, bend: 0.1 }, []).pay.xp, paid({ shot: up, bend: 0.05 }, []).pay.xp, paid({ shot: { ...up, elev: 0.06 }, bend: 0.1 }, []).pay.xp, paid({ shot: up, bend: 0.1, cush: [[0, 0, 0.1]] }, []).pay.xp], [23, 9, 9, 9], 'a massé pot: the cue raised 4 degrees, the line turned 5, no cushion between');
  eq(paid({}, [{ ...easy.find(k => k.type === 'direct'), type: 'carom' }]).pay.xp, 11, 'a pot the picker finds only as a carom pays as a combo');
  // Spin Doctor: Solid or harder, the tip half way out below centre or to a side, against Hustler or harder.
  const tip = (a, b) => ({ shot: { ang: 0, speed: 2, a, b } }), spin = (more, cs = cands, vs = { tier: 3 }) => paid(more, cs, vs).feats.includes('spin');
  eq([spin(tip(0, -0.2)), spin(tip(0.2, 0)), spin(tip(0.15, -0.15)), spin(tip(0, 0.4)), spin(tip(0.19, 0.3)), spin(tip(0, -0.19))], [true, true, true, false, false, false], 'draw or side counts, follow alone does not');
  eq([spin(tip(0, -0.2), easy), spin(tip(0, -0.2), cands, { tier: 2 }), spin(tip(0, -0.2), cands, { boss: 3 })], [false, false, true], 'not on a Routine pot, not below Hustler');
  eq(potPay(easy, rec(1, [[1, h]], { cush: [[1, far(h), cut]] }), { ...q, phase: 'break' }, { ...after, turn: 0 }, 0, { tier: 2 }).feats, [], 'a pot on the break counts for no feat');
  eq(potPay(easy, rec(1, [[1, other]], { cush: [[1, far(other), cut]] }), q, judge(setCall(s, h), rec(1, [[1, other]])), 0, { tier: 2 }).feats, [], 'nor does a pot that does not keep the turn');
  eq([paid({}, easy, { tier: 3 }).pay.xp, paid({}, easy, { tier: 3, cue: 'twig' }).pay.xp], [10, 15], 'the Twig pays 1.5 times in a match');
  // The Performative's For show: a bank, a combo or a kick pays 2 times its usual pay, any other pot half. Hustler or harder.
  const show = { tier: 3, cue: 'performative' }, bank = { cush: [[1, far(h), cut]] };
  eq([paid({}, easy, show).pay, paid(bank, easy, show).pay, paid(bank, easy, { tier: 3 }).pay], [{ xp: 5, coins: 2 }, { xp: 25, coins: 10 }, { xp: 13, coins: 5 }], 'a direct pot pays half, a bank double');
  eq([paid({}, [], show).pay.xp, paid(bank, [], show).pay.xp], [5, 5], 'a fluke pays half, off a cushion too');
  eq([paid(bank, easy, { tier: 2, cue: 'performative' }).pay.xp, potPay(easy, rec(1, [[1, h]], bank), { ...q, bank: 2 }, after, 0, show, 0.4).pay.xp], [11, 13], 'off below Hustler, and off when every pot must be a bank');
  eq(potPay(easy, rec(1, [[1, h]], bank), { ...q, hand: 'any' }, after, 0, show, 0.4).pay.xp, 20, 'with ball in hand the type bonus is not paid, the 2 times is');
  eq(potPay(cands, rec(1, [[1, h]], { cush: [[0, far(h), cut]] }), q, after, 7, { tier: 6, cue: 'performative' }, 0.4).pay, { xp: 160, coins: 64 }, 'up to 16 times a plain pot');
  // The Aura's Aura farming: each pot in a row adds 25% in place of the run bonus; a miss ends the run and the next pot pays nothing.
  { const A = { tier: 3, cue: 'aura' }, a = { run: 0, owed: false }, hit = (vs = A, st = q, aft = after, au = a) => potPay(easy, rec(1, [[1, h]]), st, aft, 5, vs, 0.4, au).pay.xp, miss = () => potPay(easy, rec(1, []), q, judge(q, rec(1, [])), 0, A, 0.4, a);
    eq([hit(), hit(), hit(), hit(), hit(), { ...a }], [10, 13, 15, 18, 20, { run: 5, owed: false }], 'the 1st pot pays its usual pay with no run bonus, the 2nd 1.25 times, the 5th 2 times');
    miss(); eq([{ ...a }, hit(), { ...a }, hit()], [{ run: 0, owed: true }, 0, { run: 1, owed: false }, 13], 'a miss: minus aura. The next pot pays nothing and starts the new run');
    eq([hit(A, { ...q, phase: 'break' }), hit({ tier: 2, cue: 'aura' }), { ...a }], [15, 14, { run: 2, owed: false }], 'the break and a match below Hustler pay the usual way and leave the run');
    eq([potPay(easy, rec(1, [[1, other]]), q, judge(setCall(s, h), rec(1, [[1, other]])), 0, A, 0.4, a).pay.xp, { ...a }], [10, { run: 0, owed: true }], 'a pot that does not keep the turn pays its usual pay and ends the run');
    a.run = 99; a.owed = false; eq([hit({ tier: 6, cue: 'aura' }), a.run], [200, 100], 'the pay tops out at 20 times a plain pot'); }
  // The Nonchalant's Whatever: the first 2 flukes of a rack pay a flat 60 XP and 24 coins.
  { const N = { tier: 6, cue: 'nonchalant' }, f = { left: 2 }, fluke = (cs = [], vs = N, st = q, aft = after, more = {}) => potPay(cs, rec(1, [[1, h]], more), st, aft, 3, vs, 0.4, undefined, f).pay;
    eq([fluke(), fluke(), f.left, fluke(), f.left], [{ xp: 60, coins: 24 }, { xp: 60, coins: 24 }, 0, potPay([], rec(1, [[1, h]]), q, after, 3, N, 0.4).pay, 0], 'flat at any tier and run, twice; the 3rd fluke is a plain pot again');
    f.left = 2; eq([fluke(easy), fluke([], { tier: 2, cue: 'nonchalant' }).xp, fluke([], N, { ...q, phase: 'break' }).xp === 60, fluke([], N, q, judge(q, rec(1, [[1, h]]))).xp === 60, f.left], [potPay(easy, rec(1, [[1, h]]), q, after, 3, N, 0.4).pay, 12, false, false, 2], 'not a pot with a way found, not below Hustler, not on the break, not a pot that loses the turn');
    eq([fluke([], N, q, after, { cush: [[0, 0, cut], [0, 2, cut]] }), f.left], [{ xp: 60, coins: 24 }, 1], 'a kick off 2 cushions with no way found pays as the fluke while one is left'); }
  // The Seer's Omen: once the eye has opened, the shot pays as a plain pot with no run bonus and counts for nothing.
  { const seen = potPay(cands, rec(1, [[1, h]], { cush: [[0, far(h), cut]] }), q, after, 3, { tier: 6 }, 0.4, undefined, undefined, true), usual = potPay(cands, rec(1, [[1, h]], { cush: [[0, far(h), cut]] }), q, after, 3, { tier: 6 }, 0.4);
    eq([seen.pay, seen.run, seen.feats, seen.mine, seen.own], [{ xp: 13, coins: 5 }, 3, [], [], 1], 'a Tough kick on a run of 3 against Legend: a plain pot at Legend\'s rate, the run stays, no feat');
    assert(usual.pay.xp > 40 && usual.run === 4 && usual.feats.includes('kick'), `without the eye it pays ${usual.pay.xp} XP`); }
  // The Six Seven's Sixes and sevens: the 6 and the 7 pay 67 XP and 27 coins flat, no other ball pays, and the pay is held for the end of the rack.
  const ss = { tier: 6, cue: 'sixseven' }, pot6 = (ids, vs = ss, st = q) => { const pots = ids.map(id => [id, h]); return potPay(cands, rec(ids[0], pots), st, judge(setCall({ ...st, solids: -1 }, h), rec(ids[0], pots)), 3, vs, 0.4); };
  eq([pot6([6]).pay, pot6([6]).held, pot6([1]).pay, pot6([1]).held], [{ xp: 67, coins: 27 }, true, { xp: 0, coins: 0 }, true], 'the 6 pays flat at any tier, run and difficulty; the 1 pays nothing');
  eq(pot6([6, 7, 2]).pay, { xp: 134, coins: 54 }, 'the 6 and the 7 on one shot: 27 coins each here, the top-up comes with the pair');
  eq([pot6([6], { tier: 2, cue: 'sixseven' }).held, pot6([6], ss, { ...q, phase: 'break' }).held, pot6([6], ss, { ...q, phase: 'break' }).pay.xp], [undefined, undefined, 17], 'off below Hustler; on the break the 6 is a plain pot (with the run bonus and Legend\'s rate)');
  eq(potPay(cands, rec(6, [[6, h]]), { ...q, solids: 1 }, judge(setCall({ ...q, solids: 1 }, h), rec(6, [[6, h]])), 0, ss, 0.4).pay, { xp: 0, coins: 0 }, 'stripes in 8-ball: the 6 is the opponent\'s ball');
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
{ // Bank shots: with cushions lit the AI tries only a pot that banks or kicks off one of them, even Rookie, whose repertoire has no banks
  let pots = 0;
  for (let i = 0; i < 16; i++) {
    const { cue, balls } = randomLayout(rng(i), 5), B = [cue, ...balls].map(b => mk(b.x / 1000, b.y / 1000)), ids = [0, ...balls.map(b => b.id)], lit = [i % 6, (i + 1) % 6];
    for (const tier of [TIERS[0], TIERS[1]]) {
      const { pick } = aiShot(B.map(b => ({ ...b })), ids, SOLIDS, STRIPES, tier, rng(i), 0, c => onLit(lit, c));
      if (pick.type === 'safety' || pick.type === 'foul') continue;
      pots++; const X = pick.type === 'bank' ? pick.paths[1][1] : pick.paths[0][1];
      assert((pick.type === 'bank' || pick.type === 'kick') && lit.includes(cushionAt(X.x / 1000, X.y / 1000, 2 * P.R)), `${tier.name}, table ${i}: a ${pick.type} off a lit cushion (${lit})`);
    }
  }
  assert(pots > 3, `some tables have such a pot (${pots})`);
  ok('bank shots: the AI banks off a lit cushion or plays safe');
}
{ // Bank shots on the engine: each tier's forced banks drop where called, off a lit cushion, more often than the tier
  // below (npm run bench:types has the full table at 200-450 tables: 6 9 14 31 44 70%), and the planner's own chance for
  // them is close, since it weighs a bank against a safety on it. Fewer tables for the slow top tiers, whose gaps are wide.
  const r = TIERS.map((t, i) => makeRates(t, [200, 200, 100, 40, 40, 40, 20][i], ['lit']).lit), made = r.map(x => x.made / x.tries), est = r.map(x => x.est / x.tries);
  assert(made.every((x, i) => !i || x > made[i - 1]), `make rate rises every tier (${made.map(x => x.toFixed(2))})`);
  // the Chinese Masters plays by its engine check (aim.ts verify), not by this chance: left out
  assert(est.every((x, i) => TIERS[i].tricks || Math.abs(x - made[i]) < 0.2), `the planner's chance is near it (${est.map(x => x.toFixed(2))})`);
  ok('bank shots: forced banks drop more often tier by tier');
}
