// Run: npm test   (which card a scrolled hand focuses, and where a card's focus sits)
import assert from 'node:assert';
import { focusAt, offsetOf } from './hand.ts';
let n = 0; const ok = name => console.log(`ok ${++n} ${name}`);

{
  const max = 1300, cards = 17, step = max / (cards - 1);
  assert.equal(focusAt(0, max, cards), 0); assert.equal(focusAt(max / 2, max, cards), 8); assert.equal(focusAt(max, max, cards), 16);
  ok('the start, the middle and the end of the scroll focus the first, middle and last card');
  for (let i = 0; i < cards; i++) assert.equal(focusAt(offsetOf(i, max, cards), max, cards), i, `card ${i}`);
  ok('every snap offset focuses its own card, the last one too');
  assert.equal(focusAt(step * 2.49, max, cards), 2); assert.equal(focusAt(step * 2.51, max, cards), 3);
  ok('the focus moves on half way between two snap offsets');
  assert.equal(focusAt(-40, max, cards), 0); assert.equal(focusAt(max + 40, max, cards), 16);
  ok('a bounce past either end keeps the end card');
  assert.equal(focusAt(0, 0, cards), -1); assert.equal(focusAt(10, -5, cards), -1);
  ok('a row that cannot scroll (or has no layout yet) focuses nothing');
  assert.equal(offsetOf(0, max, 1), 0); assert.equal(focusAt(300, max, 1), 0);
  ok('one card: offset 0, always that card');
}
