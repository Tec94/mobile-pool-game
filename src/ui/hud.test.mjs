// Run: npm test   (what the match HUD shows for a rules State: the player plates, the 9-ball strip and the banner)
import assert from 'node:assert';
import { newGame, newRec, judge, setCall } from '../rules/rules.ts';
import { banner, fresh, plates, strip } from './hud.ts';
let n = 0; const ok = name => console.log(`ok ${++n} ${name}`);
const eq = (a, b, msg) => assert.deepStrictEqual(a, b, msg);
const rec = (first, pots = [], more = {}) => ({ ...newRec(), first, pots: pots.map(([id, pocket = 0]) => ({ id, pocket })), railAfter: true, crossed: true, ...more });
const play8 = (more = {}) => ({ ...newGame(8, 0, false), phase: 'play', hand: false, ...more });

{ // 8-ball plates
  let [a, b] = plates(newGame(8));
  eq([a.name, a.on, a.text, b.on, b.text, a.pips], ['Player 1', true, 'Break', false, 'Open', []], 'the breaker\'s plate says Break, the other is open');
  eq(plates(newGame(8), ['Ann', 'Bob']).map(q => [q.name, q.label]), [['Ann', 'Ann, to shoot, Break'], ['Bob', 'Bob, Open']], 'pass and play names go on the plates');
  [a, b] = plates(play8({ turn: 1 }));
  eq([a.on, a.text, b.on, b.text], [false, 'Open', true, 'Open'], 'open table after the break: both plates say Open, the turn moved');
  const s = play8({ solids: 1, balls: [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] }); // player 2 has solids; the 3 is down
  [a, b] = plates(s);
  eq(b.pips.map(p => p.id), [1, 2, 3, 4, 5, 6, 7], 'solids show balls 1 to 7');
  eq(b.pips.filter(p => p.gone).map(p => p.id), [3], 'a potted ball\'s pip goes hollow');
  eq([a.pips.map(p => p.id), a.text], [[9, 10, 11, 12, 13, 14, 15], ''], 'the other player has stripes, no text');
  eq(b.label, 'Player 2, solids, 6 left', 'the plate reads out the group and what is left');
  [a, b] = plates(play8({ solids: 0, balls: [8, 9, 10] }));
  eq([a.pips, a.text, a.label], [[{ id: 8, gone: false }], 'On the 8', 'Player 1, to shoot, On the 8'], 'a cleared group shows a single 8 pip, On the 8');
  eq(b.pips.length, 7, 'the opponent still has stripes');
  ok('8-ball plates');
}
{ // 9-ball plates and strip
  const s = { ...newGame(9), phase: 'play', balls: [2, 4, 5, 6, 7, 8, 9], fouls: [0, 2], turn: 1 };
  const [a, b] = plates(s);
  eq([a.text, a.warn, a.pips, b.text, b.warn, b.on], ['', false, [], '2 fouls · next loses', true, true], 'two fouls warn, no pips in 9-ball');
  const t = strip(s);
  eq(t.map(p => p.id), [1, 2, 3, 4, 5, 6, 7, 8, 9], 'nine pips 1 to 9');
  eq(t.filter(p => p.gone).map(p => p.id), [1, 3], 'potted balls are hollow');
  eq(t.filter(p => p.next).map(p => p.id), [2], 'the lowest ball on the table is the one to hit');
  eq(strip(newGame(8)), [], 'no strip in 8-ball');
  eq(plates({ ...s, fouls: [1, 0] })[0].text, '', 'one foul is no warning yet');
  ok('9-ball plates and strip');
}
{ // banner
  const foul = judge(play8({ balls: [1, 2, 3, 9, 10, 8] }), rec(1, [], { railAfter: false }));
  eq(banner(foul, false), { note: 'Foul: no rail after contact.', foul: true, hint: 'Ball in hand: drag the cue ball.' }, 'a foul is red and ball in hand stays as the hint');
  eq(banner(foul, false, 'Rookie is thinking…'), { note: 'Foul: no rail after contact.', foul: true, hint: 'Rookie is thinking…' }, 'the AI thinks: its wait replaces the hint, the ruling stays');
  eq(banner({ ...foul, hand: 'any' }, false, '').hint, '', 'the AI\'s turn, not thinking: no hint for the human');
  eq(banner({ ...foul, choice: [{ label: 'Shoot' }] }, false, 'x').hint, 'x', 'and shows over a decision the AI makes');
  eq(banner(newGame(8), false).hint, 'Ball in hand behind the line: drag the cue ball.', 'the break: in hand behind the head string');
  eq(banner(play8({ note: 'Solids.' }), false), { note: 'Solids.', foul: false, hint: '' }, 'a ruling that is not a foul');
  const eight = play8({ solids: 0, balls: [8, 9] });
  eq(banner(eight, false), { note: '', foul: false, hint: 'Call a pocket.' }, 'on the 8 with no call: the player must call it');
  eq(banner(setCall(eight, 2), false).hint, '', 'once called, the ask is gone');
  eq(banner(play8({ callAll: true }), false), { note: '', foul: false, hint: 'Call a pocket.' }, 'Call every shot: every shot asks for a pocket');
  eq(banner(play8({ hand: 'any', note: 'Foul: scratch. Ball in hand.' }), false).hint, 'Drag the cue ball.', 'the ruling says ball in hand: the hint does not repeat it');
  eq(banner(play8({ callAll: true, hand: 'any' }), false).hint, 'Ball in hand: drag the cue ball. Call a pocket.', 'in hand: place the ball, then call');
  eq(banner({ ...newGame(9), phase: 'play', hand: false, push: true }, true).hint, 'Push out: no ball or rail needed.', 'push out on');
  eq(banner({ ...play8(), phase: 'over', note: 'The 8 is down.' }, false), { note: '', foul: false, hint: '' }, 'the results card says it, not the banner');
  eq(banner({ ...foul, choice: [{ label: 'Shoot' }] }, false).note, '', 'a decision card says it, not the banner');
  const nine = { ...newGame(9), phase: 'play', hand: 'any', turn: 1, note: 'Foul: scratch.' };
  eq(banner({ ...nine, fouls: [0, 2] }, false).note, 'Foul: scratch.', '9-ball on two fouls: the plate warns, the banner keeps to the ruling');
  ok('banner');
}
{ // when the banner pops a note
  const balls = [1, 2], last = { note: 'Push out.', balls };
  eq([fresh(null, 'Push out.', balls), fresh(null, '', balls)], [true, false], 'a first note pops, no note does not');
  eq(fresh(last, 'Push out.', balls), false, 'the same note back after a decision card closes does not pop again');
  eq([fresh(last, 'Solids.', balls), fresh(last, 'Push out.', [1, 2])], [true, true], 'a new ruling or a new shot pops');
  ok('banner pop');
}
