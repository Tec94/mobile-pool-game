// One AI visit from N seeded random tables per tier, on the real engine (src/ai/bench.ts visit()).
// Run: npm run bench:visit [tables] [8|9] [tier index...]   (default 80 tables, both games, all tiers)
// Prints balls potted a visit, clear % (the 8 or the 9 down legally), first shot potted %, think time p50/max (ms).
import { visit } from '../src/ai/bench.ts';
import { TIERS } from '../src/ai/shot-ai.ts';

const [n = 80, game, ...only] = process.argv.slice(2).map(Number);
const pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] ?? 0;
for (const nine of game ? [game === 9] : [false, true]) {
  console.log(`${nine ? '9' : '8'}-ball, one visit from ${n} tables\ntier      balls  clear%  1st%   think p50/max ms`);
  for (const [t, tier] of TIERS.entries()) {
    if (only.length && !only.includes(t)) continue;
    let balls = 0, clear = 0, first = 0; const think = [];
    for (let i = 0; i < n; i++) { const v = visit(tier, 1000 + i, nine); balls += v.potted; clear += v.clear; first += v.first; think.push(...v.think); }
    console.log(tier.name.padEnd(8), (balls / n).toFixed(2).padStart(6), (100 * clear / n).toFixed(0).padStart(6), (100 * first / n).toFixed(0).padStart(6), `   ${pct(think, 0.5).toFixed(0)}/${pct(think, 1).toFixed(0)}`);
  }
}
