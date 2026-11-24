// The Chinese Masters (rating 7) against Legend (6), full racks on the real engine and rules (as scripts/ai-styles.mjs duel()).
// Run: npm run bench:masters [racks] [8|9] [rating]   (default 200 racks, 8-ball, the opponent Legend: rating 6)
// With a rating it also prints the opponent's racks won and its x10 wins (pay.ts: its own shot ran the rack out, rules.ts
// ranOut; a lucky rack pays no x10), and of those the ones on 2 pots of its own or fewer.
// racks / 2 seeds, each played twice, the Masters in either seat; the breaker alternates with the seed. Prints the Masters' rack
// win %, its fumbles: the racks it had a visit in (after the break) and of those the ones where a visit of its ended
// with its balls still up, split by the shot that ended it (a missed trick shot, a missed plain pot, a safety or escape,
// a foul), the racks Legend won before the Masters had a shot (the ceiling of its win %), and the share of its pots by kind (turn.ts kindOf; double = two or more own balls on one shot, borrowed = a
// carom or billiard whose shot touched an opponent's ball; hanging = a kick whose cue ball sets off away from the ball it
// hits; frozen = a bank of a ball frozen on a cushion: the reels' types, counted on top of their kind). LOG=1 prints every Masters shot.
import { breakSpot, P, rack, step, strike } from '../src/physics/engine.ts';
import { choose, handCue, judge, moveCue, newGame, newRec, ranOut, record, setCall, spotBall } from '../src/rules/rules.ts';
import { choiceFor, nextSafeties, safetiesArg, think } from '../src/ai/turn.ts';
import { MASTERS } from '../src/ai/shot-ai.ts';

const [racks = 200, game = 8, rating = 6] = process.argv.slice(2).map(Number), n = Math.ceil(racks / 2);
const mk = (x, y) => ({ x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true });
const TRICK = /^(bank|kick)[2-4]$|^jump$/;

// One rack, the Masters in seat `me`. Returns whether it won and its numbers.
function duel(me, seed) {
  const breaker = seed % 2, [bx, by] = breakSpot(), R = rack(game), safe = [{ row: 0, rack: 0 }, { row: 0, rack: 0 }];
  let s = newGame(game, breaker, true, 0, seed), B = [mk(bx - 1e-3, by), ...R.map(([, x, y]) => mk(x, y))], shots = 0;
  const ids = [0, ...R.map(([id]) => id)], t = { visits: 0, fumbled: 0, trick: 0, plain: 0, safety: 0, foul: 0, kinds: {}, ms: [], oppPots: 0, x10: false };
  while (s.phase !== 'over' && shots < 200 && !(s.phase === 'break' && shots)) {
    if (s.choice) { s = choose(s, choiceFor(s)); continue; }
    shots++;
    const seat = s.turn, brk = s.phase === 'break', t0 = performance.now();
    const m = think(B.map(x => ({ ...x })), ids, s, seat === me ? MASTERS : rating, seed * 1000 + shots + seat * 7919, safetiesArg(safe[seat]));
    if (seat === me && !brk) t.ms.push(performance.now() - t0);
    if (!brk) safe[seat] = nextSafeties(safe[seat], m.safety);
    if (m.at) moveCue(B, m.at[0], m.at[1], s.hand); if (m.call >= 0) s = setCall(s, m.call);
    const r = newRec(), ev = [], B0 = B.map(x => ({ ...x })); let touched = false; strike(B[0], m.shot);
    for (let k = 0; k < 60000 && (ev.length = 0, step(B, ev)); k++) { record(r, ev, B, ids); for (const e of ev) if (e.t === 'bb') touched ||= [e.a, e.b].some(i => mine(s, 1 - seat, ids[i])); }
    const before = s; s = judge(s, r);
    if (seat !== me && !brk && !s.foul) t.oppPots += r.pots.filter(p => p.id).length;
    if (seat !== me) t.x10 = ranOut(seat, s);
    if (seat !== me || brk) { for (const id of s.spot) spotBall(B, ids.indexOf(id)); if (s.hand) handCue(B, s.hand); continue; }
    const own = r.pots.filter(p => p.id && (mine(s, me, p.id) || (p.id === 8 && s.winner === me))).length, kept = !s.foul && (s.turn === me || s.phase === 'over');
    if (process.env.LOG) console.log(seed, me, m.kind, own, kept ? 'kept' : s.foul ? 'FOUL' : 'over', s.note);
    if (t.last !== shots - 1) t.visits++; // shots in a row are one visit
    t.last = shots;
    if (kept && own && !m.safety) { t.kinds[m.kind] = (t.kinds[m.kind] ?? 0) + 1; if (own > 1) t.kinds.double = (t.kinds.double ?? 0) + 1; if (touched && game === 8 && /carom|billiard/.test(m.kind)) t.kinds.borrowed = (t.kinds.borrowed ?? 0) + 1;
      const f = B0[ids.indexOf(r.first)], c = B0[0], frozen = (b) => Math.min(b.x, b.y, P.L - b.x, P.W - b.y) < P.R + 0.002;
      if (/^kick/.test(m.kind) && f && Math.cos(m.shot.ang) * (f.x - c.x) + Math.sin(m.shot.ang) * (f.y - c.y) < 0) t.kinds.hanging = (t.kinds.hanging ?? 0) + 1;
      if (/^bank/.test(m.kind) && r.pots.some(p => frozen(B0[ids.indexOf(p.id)]))) t.kinds.frozen = (t.kinds.frozen ?? 0) + 1; }
    else if (s.phase !== 'over' || s.winner !== me) { // the table goes over with its balls up
      t.fumbled = 1;
      t[s.foul ? 'foul' : m.safety ? 'safety' : TRICK.test(m.kind) ? 'trick' : 'plain']++;
    }
    for (const id of s.spot) spotBall(B, ids.indexOf(id)); if (s.hand) handCue(B, s.hand);
  }
  return { won: s.phase === 'over' && s.winner === me, done: s.phase === 'over', t };
}
// ball id is player p's to pot (9-ball: every ball; 8-ball open table: none is anyone's yet)
function mine(s, p, id) { return s.game === 9 ? true : s.solids < 0 || id === 8 || !id ? false : (id < 8) === (s.solids === p); }

const tot = { won: 0, wonRan: 0, oppWon: 0, x10: 0, x10few: 0, done: 0, ran: 0, cold: 0, fumbled: 0, trick: 0, plain: 0, safety: 0, foul: 0, pots: 0, kinds: {}, ms: [] };
for (let i = 0; i < n; i++) for (const me of [0, 1]) {
  const { won, done, t } = duel(me, 7000 + i);
  const oppWon = done && !won, x10 = oppWon && t.x10;
  tot.won += +won; tot.wonRan += +(won && t.visits > 0); tot.oppWon += +oppWon; tot.x10 += +x10; tot.x10few += +(x10 && t.oppPots <= 2); tot.done += +done; tot.ran += +(t.visits > 0); tot.cold += +(!won && !t.visits); tot.fumbled += t.fumbled; tot.ms.push(...t.ms);
  for (const k of ['trick', 'plain', 'safety', 'foul']) tot[k] += t[k];
  for (const [k, v] of Object.entries(t.kinds)) tot.kinds[k] = (tot.kinds[k] ?? 0) + v;
}
const pct = (x, d) => (d ? (100 * x / d).toFixed(1) : '-'), ci = (x, d) => `${pct(x, d)} ±${(196 * Math.sqrt((x / d) * (1 - x / d) / d)).toFixed(1)}`;
const pots = Object.entries(tot.kinds).filter(([k]) => !['double', 'borrowed', 'hanging', 'frozen'].includes(k)).reduce((a, [, v]) => a + v, 0), q = tot.ms.sort((a, b) => a - b);
console.log(`${game}-ball, Chinese Masters against rating ${rating}, ${n} seeds each played with the Masters in both seats (${2 * n} racks)`);
console.log(`rack win % ${ci(tot.won, tot.done)} (won ${tot.won} of the ${tot.done} racks played to the end; ${2 * n - tot.done} unfinished: a foul on the break or the 200-shot cap)`);
console.log(`racks Legend won before the Masters had a shot after the break: ${tot.cold}, so at most ${pct(2 * n - tot.cold, 2 * n)}% can be won`);
console.log(`racks it had a visit in ${tot.ran}, won ${pct(tot.wonRan, tot.ran)}% of them; racks with a fumble (table handed over, its balls up) ${tot.fumbled} = ${pct(tot.fumbled, tot.ran)}%`);
console.log(`fumbles: missed trick ${tot.trick}, missed plain pot ${tot.plain}, safety or escape ${tot.safety}, foul ${tot.foul}`);
console.log(`pot shots ${pots}, by kind %: ` + Object.entries(tot.kinds).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v, pots)}`).join(', '));
console.log(`ridiculous (2+ cushions, jump, carom, billiard, combo, double) ${pct(Object.entries(tot.kinds).filter(([k]) => TRICK.test(k) || ['carom', 'billiard', 'combo', 'double'].includes(k)).reduce((a, [, v]) => a + v, 0), pots)}% of pot shots`);
console.log(`think ms p50 ${q[Math.floor(q.length / 2)]?.toFixed(0)}, max ${q[q.length - 1]?.toFixed(0)}`);
if (rating !== 6) console.log(`rating ${rating}: racks won ${tot.oppWon} (${pct(tot.oppWon, tot.done)}%), x10 wins (its own shot ran the rack out) ${tot.x10}, of them on 2 balls potted or fewer ${tot.x10few}`);
