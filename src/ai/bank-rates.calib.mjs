// Run: npm run test:calib   (calibration: slow, so not in npm test; CI runs it with npm run test:all. Run it before
// pushing an AI change.) Moved from turn.test.mjs.
import assert from 'node:assert';
import { makeRates } from './bench.ts';
import { TIERS as CLOCKED } from './shot-ai.ts';
let n = 0; const ok = name => console.log(`ok ${++n} ${name}`);
const TIERS = CLOCKED.map(t => ({ ...t, think: Infinity })); // no clock (Tier.think): the same search whatever the machine's load
{ // Bank shots on the engine: each tier's forced banks drop where called, off a lit cushion, more often than the tier
  // below (npm run bench:types has the full table at 200-450 tables: 6 9 14 31 44 70%), and the planner's own chance for
  // them is close, since it weighs a bank against a safety on it. Fewer tables for the slow top tiers, whose gaps are wide.
  const r = TIERS.map((t, i) => makeRates(t, [200, 200, 200, 40, 40, 40, 20][i], ['lit']).lit), made = r.map(x => x.made / x.tries), est = r.map(x => x.est / x.tries);
  assert(made.every((x, i) => !i || x > made[i - 1]), `make rate rises every tier (${made.map(x => x.toFixed(2))})`);
  // the Chinese Masters plays by its engine check (aim.ts verify), not by this chance: left out
  assert(est.every((x, i) => TIERS[i].tricks || Math.abs(x - made[i]) < 0.2), `the planner's chance is near it (${est.map(x => x.toFixed(2))})`);
  ok('bank shots: forced banks drop more often tier by tier');
}
