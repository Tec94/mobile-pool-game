// Run: npm test. The tournament bracket (src/tournament/bracket.ts): the field, the order you meet it, the simulated
// matches, the prize and the saved run.
import assert from 'node:assert';
import test from 'node:test';
import { STYLE_RANGE } from '../ai/styles.ts';
import { breakerOf, cupOpen, endMatch, CUPS, ROSTER, medalOf, newRun, nextMatch, plays, prize, raceOf, readRun, recordMatch, roundName, sides, simMatch, stakes, wins } from './bracket.ts';

const opts = (o = {}) => ({ cup: 1, size: 8, best: 3, game: 8, callAll: true, bank: 0, ...o });
const none = { xp: 0, coins: 0 };

test('the field: in the cup band, styles only in the top half and never twice, each in its range, the strongest has one, same seed same field', () => {
  for (const size of [4, 8]) for (let seed = 1; seed < 60; seed++) for (const cup of [0, 3, 2]) {
    const r = newRun(opts({ size, cup }), seed), ai = r.field.slice(1), c = CUPS[cup];
    assert.equal(r.field.length, size);
    const st = ai.map(e => e.style).filter(Boolean);
    assert.equal(new Set(st).size, st.length, 'no style twice');
    assert(ai.at(-1).style, 'the strongest has a style');
    assert(ai.slice(0, Math.floor(ai.length / 2)).every(e => !e.style), 'the bottom half plays plain');
    for (const e of ai) { assert(e.rating >= c.lo - 0.1 && e.rating <= c.hi + 0.1, `${e.rating} in ${c.lo}..${c.hi}`); if (e.style) assert(e.rating >= STYLE_RANGE[e.style][0] && e.rating <= STYLE_RANGE[e.style][1]); }
    assert.deepStrictEqual(newRun(opts({ size, cup }), seed), r);
    for (const e of ai) assert(plays(e) <= 6, 'no one plays above Legend, where the AI is no longer modelled');
    for (const e of ai) assert(e.style ? e.name === ROSTER[e.style] : !Object.values(ROSTER).includes(e.name), 'a style is always its one character');
  }
});

test('you meet the field in rising strength: O1 first, the top half next, the strongest only in the final', () => {
  const r = newRun(opts(), 5);
  assert.deepStrictEqual(sides(r, 0), [0, 1]);
  assert.deepStrictEqual([sides(r, 1), sides(r, 2), sides(r, 3)], [[4, 5], [3, 6], [2, 7]]);
  assert.equal(roundName(r, 0), 'Quarterfinal'); assert.equal(roundName(r, 4), 'Semifinal'); assert.equal(roundName(r, 6), 'Final');
  assert.equal(roundName(newRun(opts({ size: 4 }), 5), 0), 'Semifinal');
});

test('a run to the title: each round sims the other matches once, the final is next, then champion', () => {
  let r = newRun(opts(), 9);
  assert.equal(nextMatch(r), 0);
  r = recordMatch(r, true, [2, 1], { xp: 100, coins: 50 });
  assert(r.res.slice(0, 4).every(Boolean), 'the quarterfinals are all played');
  assert.equal(nextMatch(r), 4); assert.equal(sides(r, 4)[0], 0);
  const semi = r.res[5]; assert(semi, 'the other semifinal is played as soon as both sides are known');
  r = recordMatch(r, true, [2, 0], { xp: 100, coins: 50 });
  assert.equal(nextMatch(r), 6);
  r = recordMatch(r, true, [2, 1], none);
  assert.equal(r.state, 'champion'); assert.equal(nextMatch(r), -1); assert.equal(wins(r), 3);
  assert.deepStrictEqual(r.earned, { xp: 200 + 1404, coins: 100 + 702 }, 'match pay plus the prize');
  assert.deepStrictEqual(r.res[5], semi, 'a simulated match never changes');
});

test('a loss ends the run and the rest of the bracket plays out; scores are in bracket order', () => {
  let r = recordMatch(newRun(opts(), 3), true, [2, 0], none);
  r = recordMatch(r, false, [1, 2], none);
  assert.equal(r.state, 'out'); assert.equal(nextMatch(r), -1); assert.equal(wins(r), 1);
  assert(r.res.every(Boolean), 'every match has a result, the final too');
  assert.deepStrictEqual(r.res[4].score, [1, 2]); assert.equal(r.res[4].w, 1);
});

test('a simulated match races to the format and favours the stronger side', () => {
  for (const best of [1, 3, 5]) {
    const r = newRun(opts({ best }), 4), s = simMatch(r, 3);
    assert.equal(Math.max(...s.score), raceOf(best));
  }
  let won = 0, want = 0; // the stronger side (as it plays, its style's bump counted) wins about as often as the logistic says
  for (let seed = 0; seed < 400; seed++) {
    const r = newRun(opts({ best: 1, cup: 3 }), seed), [a, b] = sides(r, 3), d = plays(r.field[a]) - plays(r.field[b]), s = simMatch(r, 3);
    won += s.w === (d < 0 ? 1 : 0); want += 1 / (1 + Math.exp(-1.2 * Math.abs(d)));
  }
  assert(Math.abs(won - want) < 30, `${won} of 400, ${want.toFixed(0)} expected`);
});

test('prize: champion all, runner-up 40%, semifinal of 8 15%, first match nothing; longer formats and cups pay more', () => {
  const o = opts({ cup: 1, size: 8, best: 3 });
  assert.deepStrictEqual(prize(o, 3), { xp: 1404, coins: 702 }, 'coins are half the XP');
  assert.deepStrictEqual([2, 1, 0].map(w => prize(o, w).xp), [562, 211, 0]);
  assert.deepStrictEqual([0, 1, 2].map(w => prize(opts({ cup: 0, size: 4, best: 1 }), w).xp), [0, 48, 120]);
  assert.equal(prize(opts({ cup: 3, size: 8, best: 5 }), 3).xp, 9450);
});

test('best of 1: a seeded coin flip breaks; longer formats: the player breaks', () => {
  const flips = Array.from({ length: 200 }, (_, s) => breakerOf(newRun(opts({ best: 1 }), s), 0));
  assert(flips.filter(b => b === 0).length > 70 && flips.filter(b => b === 0).length < 130);
  assert.equal(breakerOf(newRun(opts({ best: 1 }), 7), 0), breakerOf(newRun(opts({ best: 1 }), 7), 0));
  assert.equal(breakerOf(newRun(opts({ best: 3 }), 7), 0), 0);
});

test('a saved run reads back; a damaged, foreign or newer one is no run', () => {
  const r = recordMatch(newRun(opts(), 2), true, [2, 1], none);
  assert.deepStrictEqual(readRun(JSON.stringify(r)), r);
  for (const bad of [null, '', '{', '[]', '{"v":2}', JSON.stringify({ ...r, v: 2 }), JSON.stringify({ ...r, field: [] }), JSON.stringify({ ...r, opts: { ...r.opts, best: 2 } })]) assert.equal(readRun(bad), null);
});

test('stakes rise each round from x1, in a field of 4 too; a run that is over takes no more results', () => {
  const r = newRun(opts(), 1), r4 = newRun(opts({ size: 4 }), 1);
  assert.deepStrictEqual([0, 4, 6].map(m => stakes(r, m)), [1, 1.5, 2]); assert.deepStrictEqual([0, 2].map(m => stakes(r4, m)), [1, 1.5]);
  const out = recordMatch(r, false, [0, 0], none);
  assert.equal(recordMatch(out, true, [2, 0], none), out, 'nothing after the end');
  assert.deepStrictEqual(out.earned, { xp: 0, coins: 0 }, 'a forfeit of the first match pays no prize');
  assert.equal(breakerOf(newRun(opts({ size: 4, best: 3 }), 3), 0), 0);
});

test('medals and cups: bronze for 4, silver for 8 best of 1, gold for 8 longer; a cup opens by level or a silver below', () => {
  assert.deepStrictEqual([opts({ size: 4 }), opts({ best: 1 }), opts({ best: 5 })].map(medalOf), [1, 2, 3]);
  assert(cupOpen(0, [0, 0, 0, 0], 1)); assert(!cupOpen(1, [1, 0, 0, 0], 9)); assert(cupOpen(1, [2, 0, 0, 0], 1)); assert(cupOpen(1, [0, 0, 0, 0], 10));
});

test('a saved run that cannot be played is no run', () => {
  const r = newRun(opts(), 2);
  for (const bad of [{ ...r, opts: { ...r.opts, cup: 'length' } }, { ...r, live: { score: [1.5, 0] } }, { ...r, res: r.res.map(() => ({ w: 0, score: [2, 0] })) },
    { ...r, res: [{ w: 0, score: [2, 'x'] }, ...r.res.slice(1)] }, { ...r, field: r.field.map(e => ({ ...e, human: true })) },
    { ...r, field: r.field.map(e => ({ ...e, human: false })) }, { ...r, slots: r.slots.map(() => 0) },
    { ...r, res: [...r.res.slice(0, -1), { w: 0, score: [1, 0] }] }, // a final with neither finalist known
    { ...r, live: { score: [raceOf(r.opts.best), 0] } }, { ...r, res: [{ w: 0, score: [9, 0] }, ...r.res.slice(1)] }, // a live match already won, a score past the race
    { ...r, field: r.field.map((e, i) => (i === 1 ? { ...e, rating: 9 } : e)) }]) assert.equal(readRun(JSON.stringify(bad)), null);
  assert.deepStrictEqual(readRun(JSON.stringify({ ...r, live: { score: [1, 0], table: { any: 1 } } })).live.score, [1, 0], 'the table inside is the game\'s to check');
});

test('only the match in play can end: a forfeit after the result does not lose the next one', () => {
  const r = newRun(opts(), 4), x = endMatch(r, 0, true, [2, 1], none);
  assert.equal(nextMatch(x), 4); assert.equal(endMatch(x, 0, false, [0, 0], none), null, 'match 0 is over');
  assert.equal(endMatch(x, 4, false, [0, 1], none).state, 'out');
});
