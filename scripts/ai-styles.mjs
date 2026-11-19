// Tournament AI styles against the plain tier at the same rating (src/ai/styles.ts), on the real engine and rules.
// Run: [BANK=1|2] [CALL8=1] npm run bench:styles [racks] [8|9] [rating...] [-- style|plain...]   (default 200 racks, 8-ball, ratings 1.5 3 4.5 6, the plain row and every style
// dealt at that rating, STYLE_RANGE)
// Per style and rating: the style's head-to-head rack wins against the plain tier (the breaker alternates, the same seeds
// for every style), then its game: shots a visit that pot, safeties per 100 visits, the opponent's pots after them,
// balls down on the break, closed% = the racks it won of those where it got to its last two balls, and the share of its pots that were banks or kicks, combos or kisses, and played with draw or follow.
import { breakSpot, rack, step, strike } from '../src/physics/engine.ts';
import { choose, handCue, judge, moveCue, newGame, newRec, record, setCall, spotBall } from '../src/rules/rules.ts';
import { choiceFor, nextSafeties, safetiesArg, think } from '../src/ai/turn.ts';
import { STYLE_BUMP, STYLE_IDS, STYLE_RANGE } from '../src/ai/styles.ts';

const argv = process.argv.slice(2), cut = argv.indexOf('--'), nums = (cut < 0 ? argv : argv.slice(0, cut)).map(Number);
const [n = 200, game = 8, ...rs] = nums, ratings = rs.length ? rs : [1.5, 3, 4.5, 6], only = cut < 0 ? STYLE_IDS : argv.slice(cut + 1);
const mk = (x, y) => ({ x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true });

// One 8-ball rack, seat 0 = (level, style a), seat 1 = (level, style b). Returns the winner and seat 0's numbers.
function duel(level, a, b, seed) {
  const breaker = seed % 2, [bx, by] = breakSpot(), R = rack(game), safe = [{ row: 0, rack: 0 }, { row: 0, rack: 0 }];
  let s = newGame(game, breaker, !process.env.CALL8, Number(process.env.BANK ?? 0), seed), B = [mk(bx - 1e-3, by), ...R.map(([, x, y]) => mk(x, y))], shots = 0;
  const ids = [0, ...R.map(([id]) => id)], me = { reach: 0, last: 0, lastMade: 0, visits: 0, pots: 0, safeties: 0, after: 0, broke: 0, bank: 0, combo: 0, spin: 0, potShots: 0 };
  let last = -1, lastSafe = false;
  while (s.phase !== 'over' && shots < 200 && !(s.phase === 'break' && shots)) {
    if (s.choice) { s = choose(s, choiceFor(s)); continue; }
    shots++;
    const seat = s.turn, brk = s.phase === 'break', m = think(B.map(x => ({ ...x })), ids, s, level + ((seat ? b : a) ? STYLE_BUMP[seat ? b : a] : 0), seed * 1000 + shots + seat * 7919, safetiesArg(safe[seat]), seat ? b : a);
    if (!brk) safe[seat] = nextSafeties(safe[seat], m.safety);
    if (seat !== last) { if (seat === 0) me.visits++; last = seat; }
    if (m.at) moveCue(B, m.at[0], m.at[1], s.hand); if (m.call >= 0) s = setCall(s, m.call);
    const r = newRec(), ev = []; strike(B[0], m.shot);
    for (let k = 0; k < 60000 && (ev.length = 0, step(B, ev)); k++) record(r, ev, B, ids);
    const before = s; s = judge(s, r);
    const down = r.pots.filter(p => p.id).length;
    if (seat === 1 && lastSafe) { if (down && !s.foul && s.turn === 1) me.after++; lastSafe = false; } // the reply to a safety: did it pot
    if (seat === 0) {
      const left = s.game === 9 ? before.balls.length : before.solids < 0 ? 8 : before.balls.filter(id => id !== 8 && (id < 8) === (before.solids === 0)).length + 1;
      if (!brk && left <= 2) me.reach = 1; // it got to its last two balls (the 8 or 9 counted) this rack
      if (!brk && !m.safety && left <= 2) { me.last++; me.lastMade += +(down > 0 && !s.foul && (s.turn === 0 || s.phase === 'over')); }
      if (brk) me.broke += down;
      else if (m.safety) me.safeties++;
      else if (down && !s.foul && s.turn === 0) { me.pots += down; me.potShots++; if (m.kind === 'bank' || m.kind === 'kick') me.bank++; if (m.kind === 'combo' || m.kind === 'carom' || m.kind === 'billiard') me.combo++; if (m.shot.b && Math.abs(m.shot.b) > 0.15) me.spin++; }
      lastSafe = !!m.safety;
    }
    for (const id of s.spot) spotBall(B, ids.indexOf(id)); if (s.hand) handCue(B, s.hand);
  }
  const won = s.phase === 'over' && s.winner === 0;
  return { won, done: s.phase === 'over', me: { ...me, closed: +(me.reach && won) } };
}

const pct = (x, d) => (d ? (100 * x / d).toFixed(0) : '-').padStart(5);
const ci = (x, d) => (d ? `${(100 * x / d).toFixed(1)}±${(196 * Math.sqrt((x / d) * (1 - x / d) / d)).toFixed(1)}` : '-').padStart(10); // 95% interval
for (const level of ratings) {
  console.log(`\n${game}-ball, rating ${level}, ${n} seeds a pair, each played with the style in both seats\nstyle        win% (95%)  pots/visit  safe/100v  pots after safe%  last2 made%  closed%  bank%  combo%  spin%`);
  for (const st of [...(cut < 0 ? [undefined] : []), ...only.filter(k => k !== 'plain' && level >= STYLE_RANGE[k][0] && level <= STYLE_RANGE[k][1]), ...(only.includes('plain') ? [undefined] : [])]) { // named styles: no plain row unless asked (-- plain), it is 50% by construction
    const t = { reach: 0, closed: 0, last: 0, lastMade: 0, won: 0, done: 0, visits: 0, pots: 0, safeties: 0, after: 0, broke: 0, bank: 0, combo: 0, spin: 0, potShots: 0 };
    for (let i = 0; i < n; i++) { // each seed twice, the style in either seat, so a seat's edge cancels out; its numbers from seat 0
      const d = duel(level, st, undefined, 7000 + i), e = duel(level, undefined, st, 7000 + i);
      t.won += +d.won + +(e.done && !e.won); t.done += +d.done + +e.done; for (const k in d.me) t[k] += d.me[k];
    }
    console.log((st ?? 'plain').padEnd(8), ci(t.won, t.done), (t.pots / t.visits).toFixed(2).padStart(10), (100 * t.safeties / t.visits).toFixed(0).padStart(10),
      pct(t.after, t.safeties).padStart(17), pct(t.lastMade, t.last).padStart(12), pct(t.closed, t.reach).padStart(8), pct(t.bank, t.potShots).padStart(6), pct(t.combo, t.potShots).padStart(7), pct(t.spin, t.potShots).padStart(6));
  }
}
