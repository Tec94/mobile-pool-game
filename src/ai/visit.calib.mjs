// Run: npm run test:calib   (calibration: slow, so not in npm test; CI runs it with npm run test:all. Run it before
// pushing an AI change.) Moved from aim.test.mjs.
import assert from 'node:assert';
import { visit } from './bench.ts';
import { TIERS as CLOCKED } from './shot-ai.ts';
let n = 0; const ok = name => console.log(`ok ${++n} ${name}`);
const TIERS = CLOCKED.map(t => ({ ...t, think: Infinity })); // no clock (Tier.think): the same search whatever the machine's load
{ // Tiers on the engine: one visit from each of 10 seeded full tables (bench.ts visit(), as npm run bench:visit plays them).
  // Better tiers run more balls from planning and position, so Legend > Shark > Rookie by a margin (Shark 2.9x Rookie, Legend 1.6x Shark over 200 tables; 10 are noisy).
  const run = (t, nine = false) => Array.from({ length: 10 }, (_, i) => visit(TIERS[t], 1 + i, nine).potted).reduce((a, b) => a + b, 0);
  const [rookie, shark, legend] = [0, 3, 5].map((t) => run(t));
  assert(shark > 1.5 * rookie && legend > 1.3 * shark, `balls in 10 visits: Rookie ${rookie}, Shark ${shark}, Legend ${legend}`);
  const [rookie9, legend9] = [0, 5].map((t) => run(t, true));
  assert(legend9 > 2 * rookie9, `9-ball balls in 10 visits: Rookie ${rookie9}, Legend ${legend9}`);
  ok('Legend runs more balls than Shark, and Shark than Rookie, on the engine, and Legend than Rookie in 9-ball');
}
