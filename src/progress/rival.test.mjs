// Run: npm test   (the Rival's rating: score, step, mood, range, the menu line and the save)
import assert from 'node:assert';
import { between, newRival, rate, readRival, score, shown } from './rival.ts';
const eq = (a, b, msg) => assert.deepStrictEqual(a, b, msg), near = (a, b, msg) => assert(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);
let n = 0; const ok = name => console.log(`ok ${++n} ${name}`);

near(score(8, true, 7), 1, 'a whitewash scores 1'); near(score(8, true, 0), 0.75, 'a win on the last ball 0.75');
near(score(8, false, 0), 0.25, 'a loss with no ball left 0.25'); near(score(8, false, 7), 0, 'a loss with all 7 left 0');
near(score(8, true, 3.5), 0.875, 'half the balls left: half way'); near(score(8, true, 12), 1, 'b is held to 0..7');
near(score(9, true, 5), 0.75, '9-ball: a win 0.75 whatever is left'); near(score(9, false, 0), 0.25, '9-ball: a loss 0.25');
ok('score: by the loser\'s balls left in 8-ball, flat in 9-ball');

near(rate({ rating: 1, matches: 0 }, 1, 'even').rating, 1.675, 'first matches step K 1.5: 1 + 1.5 x 0.45');
near(rate({ rating: 3, matches: 8 }, 0.25, 'even').rating, 2.88, 'after 8 matches K 0.4: 3 - 0.4 x 0.3');
near(rate({ rating: 3, matches: 8 }, 0.65, 'relaxed').rating, 3, 'relaxed wants 0.65'); near(rate({ rating: 3, matches: 8 }, 0.42, 'tough').rating, 3, 'tough wants 0.42');
eq(rate({ rating: 3, matches: 8 }, 0.55, 'even'), { rating: 3, matches: 9 }, 'a match on target leaves the rating and counts');
eq(rate({ rating: 0.6, matches: 0 }, 0, 'even').rating, 0.5, 'not below 0.5'); eq(rate({ rating: 6.4, matches: 0 }, 1, 'even').rating, 6.5, 'not above 6.5');
ok('rate: K 1.5 then 0.4 toward the mood\'s target, held to 0.5..6.5');

const T = ['Rookie', 'Regular', 'Hustler', 'Shark', 'Pro', 'Legend'];
eq(shown(1 - 1.5 * 0.3), '0.6', '0.55 in floats shows 0.6, not 0.5');
eq([shown(3.44), between(3.44, T)], ['3.4', 'between Hustler and Shark'], 'between two tiers');
eq([between(3, T), between(2.96, T), between(0.5, T), between(6.5, T), between(6.04, T)], ['plays like Hustler', 'plays like Hustler', 'below Rookie', 'above Legend', 'plays like Legend'], 'on a tier and past the ends');
ok('the menu line names where the rating sits');

eq(readRival(undefined), newRival(), 'no save: both start at 1.0'); eq(readRival({ 8: { rating: 9, matches: 3 }, 9: { rating: 'x' } }), { 8: { rating: 6.5, matches: 3 }, 9: { rating: 1, matches: 0 } }, 'out of range held, bad started over');
eq(readRival({ 8: { rating: 2.5, matches: -1 } })[8], { rating: 2.5, matches: 0 }, 'bad match count is 0');
ok('the saved ratings load in range');
