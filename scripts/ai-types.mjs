// Make rate of each AI tier per shot type, on the real engine (src/ai/bench.ts makeRates()).
// Run: npm run bench:types [tables] [tier index...]   (default 120 tables, all tiers)
// For each table and type, the AI may only try pots of that type (lit = Bank shots mode: a bank or kick off a random lit
// pair); made = that ball in the pocket it picked, legal first hit, no scratch (lit: and banked off a lit cushion).
// try% = share of tables where the tier took a pot of that type, est = the picker's own chance for the pots it took (for
// bank2 .. jump only the geometric seed: the Masters plays them by its engine check).
// DUMP=/tmp/x writes each shot (type, tol, made) to /tmp/x<tier>.json, to refit TIERS rail and hard.
import { makeRates, TYPES } from '../src/ai/bench.ts';
import { TIERS } from '../src/ai/shot-ai.ts';

const [n = 120, ...only] = process.argv.slice(2).map(Number);
console.log(`make % (try %, est %) over ${n} tables\ntier     ` + TYPES.map((t) => t.padStart(15)).join(''));
for (const [t, tier] of TIERS.entries()) {
  if (only.length && !only.includes(t)) continue;
  const r = makeRates(tier, n);
  if (process.env.DUMP) (await import('node:fs')).writeFileSync(`${process.env.DUMP}${t}.json`, JSON.stringify(r));
  console.log(tier.name.padEnd(8), TYPES.map((k) => { const x = r[k]; return x.tries ? `${(100 * x.made / x.tries).toFixed(0)} (${(100 * x.tries / n).toFixed(0)},${(100 * x.est / x.tries).toFixed(0)})`.padStart(15) : '-'.padStart(15); }).join(''));
}
