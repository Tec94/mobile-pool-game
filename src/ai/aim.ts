'worklet'; // every function here also runs on the AI's worklet runtime (src/ai/think.ts): define a function before its callers
// The AI's shot on the real engine: correct the picker's ghost-ball aim for throw, squirt and swerve, refine aim, speed
// and tip with noise-free rollouts within the tier's budget, and turn a pick into an engine Shot with the tier's strike noise. Port of the ai-progression prototype (engine-aim.js) plus the glue.
import { type Ball, CUE, type Ev, P, type Shot, step, strike } from '../physics/engine.ts';
import { type Cand, decide, dist, enumerate, escape, fancy, legalFor, nine, type Obj, oppBest, type Pick, type Planned, plays, POCKETS, potFor, type Pt, nineValue, rackOdds, safety, type Safety, type Tier, tierProb, winBall } from './shot-ai.ts';

// Direction the object ball actually leaves in, for a given strike. Stops at first contact.
function departure(cue: Ball, obj: Ball, shot: Shot) {
  const S = [{ ...cue }, { ...obj }], ev: Ev[] = [];
  strike(S[0], shot);
  for (let i = 0; i < 6000; i++) {
    ev.length = 0;
    if (!step(S, ev)) return null;
    if (ev.some((e) => e.t === 'bb')) return Math.atan2(S[1].vy, S[1].vx);
  }
  return null;
}
// Aim that sends the first ball along s.u at this speed and tip offset, probing the engine up to first contact only (with
// the rest of the table left out). null = a probe missed the ball, or the aim did not move it. Out of probes, it returns
// the last secant step, unmeasured. shortcut: corrects the first ball's departure only, so the cushion of a bank, a
// combo's second ball and a kick that misses its ball are left to refine(), which runs the shot to the pocket; tiers
// with no engine time (Rookie, Regular) play cushion shots and combos with this aim alone.
export function correctAim(cue: Ball, obj: Ball, s: { aim: number; u: Pt }, speed: number, a: number, b: number, maxProbes = 4): number | null {
  const want = Math.atan2(s.u.y, s.u.x);
  const miss = (ang: number) => { // signed error of the object ball's direction
    const got = departure(cue, obj, { ang, speed, a, b });
    return got === null ? null : Math.atan2(Math.sin(got - want), Math.cos(got - want));
  };
  // secant search on the aim; the first step is a small fixed nudge to measure the slope
  let x0 = s.aim, f0 = miss(x0), x1 = x0 + 0.001;
  if (f0 === null) return null;
  for (let i = 1; i < maxProbes && Math.abs(f0) > 0.0015; i++) { // 0.0015 rad = 0.09 degrees at the object ball
    const f1 = miss(x1);
    if (f1 === null || f1 === f0) return null;
    const x2 = x1 - f1 * (x1 - x0) / (f1 - f0);
    x0 = x1; f0 = f1; x1 = x2;
  }
  return Math.abs(f0) > 0.0015 ? x1 : x0;
}

// Starting speed for refine(), from distances on this cloth (P.mur): enough to roll the cue ball its planned leave (power)
// and the object ball 0.2 m past the pocket mouth (through cos of the cut), plus the approach, divided by the speed left
// once the ball rolls: 5(1+b)/7 of what the tip gave it (strike() slows an off-centre hit). The object ball leaves at
// (1+e)/2 of the hit along the line of centres, then slides down to 5/7 of that; each ball it drives on loses that again.
// A cushion leaves a ball rolling at about 0.55 of the speed it came in with, so energy / RAIL (measured on the engine).
// slow = the share of the speed a slow strike (1.5 of the tier's speed error) keeps: the object ball still reaches the pocket.
// shortcut: draw and follow are not in the cue ball's distance; refine() finds them on the engine. Rookie, with no
// engine time, plays this speed as it is.
const SOFT = 1; // m/s: a hooked AI's shot at its nearest ball
const K = 2 * P.mur * P.g, OBJ = 5 / 7 * (1 + P.eb) / 2, TIP = 0.3, RAIL = 0.3; // TIP: tip offset, ball radii, for full draw or follow
const ROLL = 0.4; // tip offset of a natural roll: a billiard's cue ball rolls from the start, as the picker plans it
// speed squared a ball needs at the start of `path` (mm polyline, its inner corners are cushions) to arrive with `end`
const need = (path: Pt[], end: number) => path.reduceRight((e, q, i) => (i ? (i < path.length - 1 ? e / RAIL : e) + K * dist(path[i - 1], q) / 1000 : e), end);
function speedFor(paths: Pt[][], power: number, v: Pt, u: Pt, b: number, slow: number) {
  const mr = CUE.massRatio ?? 0.316, rolls = 5 * (1 + b) / 7 * (1 + mr) / (1 + mr + 2.5 * b * b), c = Math.max(0.2, v.x * u.x + v.y * u.y);
  const obj = paths.slice(1).reduceRight((e, p, i, all) => need(p, e) / (i < all.length - 1 ? OBJ * OBJ : 1), K * 0.2);
  const at = Math.max(K * power / 1000, obj / (c * c * OBJ * OBJ * slow * slow)); // speed squared wanted at contact
  return Math.min(CUE.maxSpeed, Math.max(0.5, Math.sqrt(need(paths[0], at)) / rolls));
}

// One noise-free shot on a copy of the table. k = the ball to pot (or the safety's ball), first = the ball to hit first,
// pk = the pocket's aim point in metres (null for a safety), G = the ghost-ball spot. err (m) is signed and moves smoothly
// with the aim: before the right first hit, how far the cue ball passes G; after it, how far ball k passes pk.
// cr, or = the cushions the cue ball meets before its first hit and ball k after it (a kick, a bank): err is measured on
// the leg after them only, so the secant is not steered by an earlier leg that passes near the target; on the whole
// path when the ball never meets that many.
// strict: ball k counts as potted only in pk's pocket (a tier with tricks: a 3-cushion line can find another pocket), and
// any ball off the table is a foul (rules.ts), counted as a scratch. pots = the balls that dropped in a pocket.
function rollout(B: Ball[], shot: Shot, k: number, first: number, pk: Pt | null, G: Pt, cr = 0, or = 0, strict = false) {
  const S = B.map((b) => ({ ...b })), ev: Ev[] = [], c = S[0], o = S[k], pots: number[] = [];
  let hit = -1, rail = false, pot = false, scratch = false, near = Infinity, err = 0, drop = 0, legs = 0, near2 = Infinity, err2 = 0, got = false;
  const watch = (q: Ball, p: Pt) => { // closest approach of a moving ball q to p, signed by which side it passes on
    const v = Math.sqrt(q.vx * q.vx + q.vy * q.vy), dx = p.x - q.x, dy = p.y - q.y, d = dx * dx + dy * dy;
    if (v && d < near) { near = d; err = (q.vx * dy - q.vy * dx) / v; }
    if (v && d < near2 && legs >= (hit < 0 ? cr : or)) { near2 = d; err2 = (q.vx * dy - q.vy * dx) / v; got = true; }
  };
  strike(c, shot);
  for (let n = 0; n < 12000; n++) {
    const v = Math.sqrt(o.vx * o.vx + o.vy * o.vy);
    ev.length = 0;
    const mv = step(S, ev);
    for (const e of ev) {
      if (e.t === 'bb' && e.a === 0 && hit < 0) { hit = e.b!; near = Infinity; if (hit === first) { near2 = Infinity; got = false; legs = 0; } }
      else if (hit >= 0 && e.t === 'rail') rail = true;
      if (e.t === 'rail' && e.a === (hit < 0 ? 0 : k)) legs++;
      if (e.t === 'pocket' || e.t === 'off') { if (e.a === 0 || (strict && e.t === 'off')) scratch = true; else if (e.a === k) { pot = e.t === 'pocket' && (!strict || !pk || (e.x! - pk.x) ** 2 + (e.y! - pk.y) ** 2 < 0.04); drop = v; } }
      if (e.t === 'pocket') pots.push(e.a);
    }
    if (hit < 0) watch(c, G); else if (hit === first && pk && o.on) watch(o, pk);
    // A pot runs until nothing moves, so nextP scores the table as it is left (a ball knocked in, the 8 above all).
    // shortcut: a miss or a safety stops once the cue ball and ball k rest, so a later kiss or a rail reached by another
    // ball is not seen there; run those to rest too if the AI starts fouling on them.
    if (!mv || (hit >= 0 && !(pk && pot) && !(c.on && (c.vx || c.vy)) && !(o.on && (o.vx || o.vy)))) break;
  }
  // a ball potted fast enough would have reached the cushion behind the pocket had it missed
  return { pot: pot && !scratch, legal: hit === first, rail: rail || drop > 0.25, scratch, err: pk || hit !== first ? (got ? err2 : err) : 0, S, pots };
}
// Chance the tier pots its best next shot from where a rollout left the table (S, metres): the leave, measured on the
// engine instead of planned. 1 when the 8 (the 9) dropped legally, -1 when the 8 dropped early. 9-ball: on the lowest ball left,
// and nine = that best next shot is itself on the 9 (rackOdds).
// shortcut: scores the noise-free rest spot only; sampling the tier's posErr scatter around it and a depth-1 plan from it
// moved balls a visit by less than the bench's noise (0.15) at 300 tables, try again if the leave search changes.
function nextP(B: Ball[], S: Ball[], ids: number[], group: number[], tier: Tier) {
  const balls: Obj[] = [], w = ids.indexOf(winBall(group));
  S.forEach((b, i) => i && b.on && balls.push({ id: ids[i], x: b.x * 1000, y: b.y * 1000 }));
  if (w > 0 && B[w].on && !S[w].on) return { p: nine(group) || !balls.some((b) => group.includes(b.id)) ? 1 : -1, nine: false };
  const legal = legalFor(balls, group), all = enumerate({ x: S[0].x * 1000, y: S[0].y * 1000 }, balls, legal, potFor(balls, group));
  const mine = all.filter((c) => plays(tier, c, balls));
  let p = 0, k = false;
  for (const c of mine.length ? mine : all.filter((c) => c.type !== 'carom' && c.type !== 'billiard')) { const q = tierProb(tier, c); if (q > p) { p = q; k = c.ball === 9; } }
  return { p, nine: k };
}
// The opponent's best pot from where a rollout left the table (S, metres), as plan() prices a reply: a safety's real leave.
function reply(S: Ball[], ids: number[], opp: number[]) {
  const balls: Obj[] = [];
  S.forEach((b, i) => i && b.on && balls.push({ id: ids[i], x: b.x * 1000, y: b.y * 1000 }));
  return oppBest({ x: S[0].x * 1000, y: S[0].y * 1000 }, balls, opp);
}
type Roll = ReturnType<typeof rollout> & { shot: Shot; score: number; next: number; nextNine: boolean; extra: number; sure: number };
const SPEEDS = [1, 1.3, 0.8, 1.7, 0.65, 2.2, 0.5]; // a safety's speeds, tried in this order, times the starting speed
const DRAW = -(CUE.tipLimit - 0.05);
// A pot's speeds (times the starting speed) and tip heights, spread out first so a small budget still sees draw, follow
// and long and short rolls; later points fill in between.
const GRID: [number, number][] = [[1, DRAW], [1, TIP], [1.6, DRAW], [1.6, 0], [0.7, 0], [1.3, TIP], [2.2, DRAW], [0.7, TIP],
  [1.3, DRAW], [1.6, TIP], [0.5, 0], [2.2, 0], [1.3, 0], [0.85, DRAW], [0.85, 0], [1, 0], [2.6, DRAW], [0.6, DRAW]];
// A jump's speeds (times JUMP_SPEED) and elevations, the measured best first (38 and 45 degrees at 3.5 to 4.5 m/s, a jump
// over a ball 200 to 600 mm away). Its tip stays at centre: side would curve it (a masse).
const JUMP_SPEED = 4, D = Math.PI / 180;
const JUMPS: [number, number, number][] = [[1.125, 0, 45 * D], [0.875, 0, 38 * D], [1.125, 0, 38 * D], [1, 0, 45 * D], [0.875, 0, 45 * D], [1, 0, 30 * D], [1.125, 0, 30 * D]];
// ms clock; a worklet runtime may have no performance, so Date.now there
export function now() { return typeof performance === 'undefined' ? Date.now() : performance.now(); } // a function declaration: the worklets plugin turns those into worklets, not a ternary of functions
const THINK = 2500; // ms: past this from the start of aiShot, refine runs no more rollouts and keeps the best so far (Tier.think: the tier's own)
// The search's budget: n rollouts run so far, cap (a tier with tricks: ROLLOUTS, so a table gives the same shot on every
// device), end = the wall clock's hard stop (ms, now()).
type Clock = { n: number; cap: number; end: number };
// One shot aiShot refines: its candidate, its search (refine), its check (verify), value, chance, shot and best rollout.
type Run = { c: Planned | Safety; more: ((n: number) => Roll) | null; verifyAt?: (s: Shot) => number; v: number; p: number; shot: Shot; r: Roll | null };
type Search = { runs: Run[]; mkRun: (c: Planned | Safety, free?: boolean) => Run; score: (x: Run, n: number) => void; checkRun: (x: Run) => void; late: () => boolean; stopped: () => boolean; clk: Clock };
function over(k: Clock) { return k.n >= k.cap || now() >= k.end; }
const FAIL = 1; // a pot's rollout score lost for each verify() rollout that does not pot it
// A tier with tricks checks its pots (refine, aiShot check): the shot again with the aim 2 sd either way, the speed
// 2 speedErr either way and the side tip 2 tipErr either way (a cushion takes side spin: half the cushion shots it
// missed were lost to side tip alone). Returns how many of the six still pot ball k legally with no scratch
// and no 8 down early (a safety or an escape, to null: still hit ball k first and send a ball to a cushion with no
// scratch), or -1 when the budget (clk) ran out first.
function verify(B: Ball[], ids: number[], group: number[], tier: Tier, s: Shot, sd: number, k: number, first: number, to: Pt | null, g: Pt, cr: number, or: number, clk: Clock) {
  const w = ids.indexOf(winBall(group)), f = 2 * tier.speedErr / 100;
  const ts = [{ ...s, ang: s.ang + 2 * sd }, { ...s, ang: s.ang - 2 * sd }, { ...s, speed: Math.min(CUE.maxSpeed, s.speed * (1 + f)) }, { ...s, speed: s.speed * (1 - f) }, { ...s, a: 2 * tier.tipErr }, { ...s, a: -2 * tier.tipErr }, ...(s.elev ? [{ ...s, elev: s.elev + 2 * sd }, { ...s, elev: s.elev - 2 * sd }] : [])];
  let n = 0;
  for (const t of ts) {
    if (over(clk)) return -1;
    clk.n++;
    const r = rollout(B, t, k, first, to, g, cr, or, true);
    n += +(to ? r.pot && r.legal && (nine(group) || w <= 0 || w === k || r.S[w].on) : r.legal && r.rail && !r.scratch);
  }
  return n * 6 / ts.length; // of six: a jump's eight (its tilt 2 sd either way too) scaled to six
}
// The shot in hand on the engine, a few full-table simulations per call of the search it returns (more(n) runs n more and
// returns the best so far): steer the aim until the right ball is hit first and ball k drops in the middle of the pocket
// (secant on err), then try other speeds and tip heights, and keep the rollout that best pots k without a scratch, hits
// first legally, sends a ball to a rail and leaves the best next shot (nextP) where the cue ball really stops; a safety,
// with its planned spin, stops nearest the planned spot. leave (with its planned spin) and G in mm. clk = the budget.
// cr, or = the cushions of a kick and a bank (rollout). A tier with tricks also scores a second ball of its own potted
// (extra; never the 8 or the 9) and checks each new best pot once its aim has converged or it tries speeds and tips
// (verifyAt = verify(), the rollouts of the six that pot): sure = that share, -1 unchecked. Checking each new best steers
// the search to a robust line, where checking only the pick does not; checking only converged pots misses the cushion
// shots, whose err rarely gets under 4 mm with another speed.
// opp = the opponent's group: a tier with tricks scores a safety's leave by the opponent's best pot from where the
// rollout really left the table (reply), not by the distance to the planned spot.
function refine(B: Ball[], ids: number[], group: number[], tier: Tier, k: number, first: number, pk: Pt | null, G: Pt, leave: Pt & { spin: number }, shot: Shot, clk: Clock, cr = 0, or = 0, verifyAt?: (s: Shot) => number, opp?: number[]) {
  const g = { x: G.x / 1000, y: G.y / 1000 }, to = pk && { x: pk.x / 1000, y: pk.y / 1000 };
  let best: Roll | null = null, sims = 0, r0: Roll | null = null, i = 0, gi = 0, tuned = false; // tuned: past the aim, on speed and tip
  const slope = [0, 0]; // d err / d aim, before the right first hit and after it
  const done = (r: Omit<Roll, 'sure'>) => r.legal && (!pk || (r.pot && Math.abs(r.err) < 0.004));
  const run = (s: Shot): Roll => {
    sims--; clk.n++;
    const r = rollout(B, s, k, first, to, g, cr, or, !!tier.tricks), c = r.S[0], np = pk && r.pot && r.legal ? nextP(B, r.S, ids, group, tier) : { p: 0, nine: false }, p = np.p;
    if (p < 0) r.pot = false; // the 8 went down early: the rack is lost
    const extra = tier.tricks && r.pot && r.legal ? r.pots.filter((j) => j !== k && group.includes(ids[j]) && ids[j] !== winBall(group)).length : 0;
    const off = Math.abs(r.err) * 5 + (pk ? 1 - Math.max(0, p) : opp ? reply(r.S, ids, opp) : Math.hypot(c.x * 1000 - leave.x, c.y * 1000 - leave.y) / 4000);
    const out = { ...r, shot: s, next: p, nextNine: np.nine, extra, sure: -1, score: 8 * +(r.pot && r.legal) + 4 * +!r.scratch + 2 * +r.legal + +r.rail - Math.min(0.99, off) + 0.5 * extra };
    if (verifyAt && out.score > (best?.score ?? -Infinity) && (done(out) || (tuned && out.legal && !!pk && out.pot))) { const n = verifyAt(s); if (n >= 0) { out.sure = n / 6; out.score -= FAIL * (6 - n); } }
    if (!best || out.score > best.score) best = out;
    return out;
  };
  const next = (r: Roll) => r.shot.ang - (slope[+r.legal] ? Math.max(-0.02, Math.min(0.02, r.err / slope[+r.legal])) : -0.001); // a secant step, or a nudge to measure the slope
  const grid: [number, number, number?][] = shot.elev ? JUMPS : pk ? GRID : SPEEDS.flatMap((m) => [shot.b, leave.spin * -DRAW].map((b): [number, number] => [m, b])).slice(1);
  return (n: number): Roll => {
    sims += n;
    if (!r0) r0 = run(shot);
    // aim: secant on err, with a slope for each thing err measures
    for (; i < 8 && sims >= 1 && !over(clk) && !done(r0); i++) {
      const x = next(r0);
      if (x === r0.shot.ang) { i = 8; break; } // err is flat at zero: the cue ball is blocked on its way to G
      const r1 = run({ ...shot, ang: x });
      if (r1.legal === r0.legal && r1.err !== r0.err) slope[+r1.legal] = (r1.err - r0.err) / (x - r0.shot.ang);
      r0 = r1;
    }
    // speed and tip, from the best aim so far, with one aim step at each if the ball missed
    tuned = true;
    for (; gi < grid.length && sims >= 1 && !over(clk) && best!.score <= 14.9875; gi++) { // stop: all four goals met, a near-certain next shot (or the leave)
      const [m, b, e] = grid[gi];
      if (m === 1 && b === shot.b && e === shot.elev) continue;
      const r = run({ ...shot, ang: best!.shot.ang, speed: Math.min(CUE.maxSpeed, Math.max(0.5, shot.speed * m)), b, ...(e === undefined ? {} : { elev: e }) });
      if (!done(r) && slope[+r.legal] && sims >= 1) run({ ...r.shot, ang: next(r) });
    }
    return best!;
  };
}

// A standard normal draw from rnd (Box-Muller): the strike noise of aiShot and trickBreak.
export function gauss(rnd: () => number) { return Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd()); }
// The aim error (rad) of a shot of this type: side tip error squirts the cue ball off line (strike() adds a * squirt), so
// the aim itself scatters by the rest of sigma.
export function aimSd(tier: Tier, type: string) {
  const rad = tier.sigma * (type === 'direct' || type === 'safety' ? 1 : tier.hard * (type === 'bank' || type === 'kick' ? tier.bankAim ?? 1 : 1)) * Math.PI / 180;
  return Math.sqrt(Math.max(0, rad * rad - (tier.tipErr * CUE.squirt) ** 2));
}
const big = (c: Planned | Safety) => (c.rails ?? 1) >= 3 || !!c.elev; // a reel shot: 3 or 4 cushions, or a jump
const SHOW_MIN = 0.8; // a reel shot plays only checked on 5 of 6 (0.97 x 5/6)
// A tier with tricks' search, in rollouts: against Legend (npm run bench:masters 200 9) it wins as often as with no cap;
// with 60 it lost points. About 4 ms a rollout on Node JIT, 55 on the interpreter (the TIERS comment).
export const ROLLOUTS = 90; // a safety may run 2 x SPARE past it (tricksTail)
const SURE = 0.97, SHOW_GAP = 0.05, SAFE_P = 0.5, RESCUE = 12, RESCUE_SIMS = 20, SPARE = 10; // a trick shot's chance when verify() pots all six; the most make chance show gives up
// The Chinese Masters' last word on a shot, after the search (aiShot): a rescue search when no pot is trusted, the
// fancier pot for show, the reel shot, and the safety it falls back on. won = the best run so far; returns the one to play.
export function tricksTail(won: Run, srch: Search, cands: (Planned | Safety)[], cue: Obj, balls: Obj[], group: number[], oppGroup: number[], tier: Tier, rnd: () => number, safetiesInRow: number, ok?: (c: Cand) => boolean): Run {
  const { runs, mkRun, score, checkRun, late, stopped, clk } = srch;
  // A tier with tricks and no pot it trusts (SAFE_P) searches on before it plays safe: the next RESCUE pots of any kind, by
  // their seed chance, RESCUE_SIMS rollouts each, until the budget runs out. Most of the tables it played safe on had a pot the
  // geometric ranking put too low.
  const trusted = () => won.c.type !== 'safety' && won.v > 0 && won.p >= SAFE_P;
  if (!trusted() && !late()) {
    const tried = [...cands, ...runs.map((x) => x.c)], more = enumerate(cue, balls, legalFor(balls, group), potFor(balls, group), true, tier.tricks)
      .filter((c) => (!ok || ok(c)) && plays(tier, c, balls) && !tried.some((t) => t.type === c.type && t.ball === c.ball && t.pocket === c.pocket && Math.abs(t.aim - c.aim) < 1e-6))
      .map((c): Planned => ({ ...c, p: tierProb(tier, c), score: 0, value: 0 })).sort((a, b) => b.p - a.p).slice(0, RESCUE);
    for (const c of more) {
      if (late()) break;
      const x = mkRun(c, true);
      score(x, RESCUE_SIMS); checkRun(x); runs.push(x);
      // a pot displaces the planner's safety only once trusted: one that dropped once, checked 2 of 6, did out of rollouts
      if (won.c.type === 'safety' ? x.v > 0 && x.p >= SAFE_P : x.v > won.v || (x.p > won.p && x.v > 0)) won = x;
      if (trusted()) break;
    }
  }
  // show: a fancier pot (fancy: a cushion past the first, 2 for a jump, 1 for a kiss shot, combo, carom or billiard, and
  // 1 for each second ball potted) whose value times 1 + show x fancy is at least the best's, whose checked chance is at
  // most SHOW_GAP under it and whose rollout scored as well (pot, centre, leave), is played in its place. The last check
  // because the chance tops out at SURE, so value ties hide a worse leave or line.
  const fl = (x: Run) => (x.v > 0 ? Math.max(0, (x.c.rails ?? 1) - 1) + (x.c.elev ? 2 : 0) + +(x.c.type === 'combo' || x.c.type === 'carom' || x.c.type === 'billiard') + x.r!.extra : 0);
  const shown = (x: Run) => x.v * (1 + tier.show! * fl(x));
  for (const x of runs.filter((x) => fl(x) > fl(won) && x.r!.score >= (won.r?.score ?? 0)).sort((a, b) => shown(b) - shown(a))) {
    if (shown(x) < shown(won)) break;
    checkRun(x);
    if (shown(x) >= shown(won) && x.p >= won.p - SHOW_GAP) { won = x; break; }
  }
  // the reel shots (3 or 4 cushions, a jump) trade up to SHOW_GAP of checked chance, none of the next shot's, once the best
  // is checked: the rule above never gives up chance, so they played only when already best. Giving up some of the next
  // shot's chance as well cost one-visit clears for no more reel shots.
  const reel = !late() && (won.r?.sure ?? -1) >= 0 ? runs.filter((x) => big(x.c) && x.v > 0 && !big(won.c)).sort((a, b) => (b.c.rails ?? 1) - (a.c.rails ?? 1) || b.v - a.v)[0] : undefined; // most cushions first
  if (reel) { checkRun(reel); if (reel.r!.sure >= 0 && reel.p >= Math.max(SHOW_MIN, won.p - SHOW_GAP) && reel.r!.next >= (won.r?.next ?? 0)) won = reel; }
  // A tier with tricks has measured its pots: when none pots on the engine, or the best only in under SAFE_P of verify()'s
  // rollouts, it plays a safety or an escape after all, unless it must shoot (safetiesInRow). Out of rollouts it plays
  // its best pot, as Legend would, if one potted on the engine; at the hard stop (a slow device) always its best pot.
  // The fallback safety, and the search for a legal one below, each get SPARE rollouts past the budget: with it spent, one had one.
  const spare = () => { clk.cap = Math.max(clk.cap, clk.n + SPARE); };
  if (!trusted() && won.c.type !== 'safety' && safetiesInRow < 2 && !stopped() && (!late() || won.v <= 0)) {
    const s = safety(cue, balls, group, oppGroup, tier, rnd, false) ?? escape(cue, balls, group);
    if (s) { spare(); won = mkRun(s, true); score(won, RESCUE_SIMS); }
  }
  // A safety or escape whose best rollout fouls (wrong ball first, no cushion, a scratch) gives way to the best safety at
  // each other angle, least left to the opponent first, then the escape: the first that rolls out legal is played.
  const fouls = (x: Run) => x.c.type === 'safety' && !(x.r?.legal && x.r.rail && !x.r.scratch);
  if (fouls(won)) {
    spare();
    const alts = [...tier.safetyAngles.map((a) => safety(cue, balls, group, oppGroup, { ...tier, safetyAngles: [a] }, rnd, false)).sort((a, b) => (a?.oppBest ?? 9) - (b?.oppBest ?? 9)), escape(cue, balls, group)];
    for (const s of alts) {
      if (late() || stopped()) break;
      if (!s || (s.ball === won.c.ball && Math.abs(s.aim - won.c.aim) < 1e-9)) continue;
      const x = mkRun(s, true);
      score(x, SPARE);
      if (!fouls(x)) { won = x; break; }
    }
  }
  return won;
}
// The AI's turn on the engine table. B and ids as rules.ts has them (ball i is number ids[i], ball 0 the cue ball), in
// metres. Returns the Shot for strike(), the pick (picker units, mm) and the ms spent picking and correcting the aim.
// ok = the pots it may try (decide); none = every pot.
export function aiShot(B: Ball[], ids: number[], group: number[], oppGroup: number[], tier: Tier, rnd: () => number, safetiesInRow = 0, ok?: (c: Cand) => boolean): { shot: Shot; aim: Shot; pick: Pick; ms: [number, number]; rollouts: number } {
  const t0 = now(), mm = (b: Ball, i: number): Obj => ({ id: ids[i], x: b.x * 1000, y: b.y * 1000 });
  const cue = mm(B[0], 0), balls = B.map(mm).filter((_, i) => i && B[i].on), { pick, ranked } = decide(cue, balls, group, oppGroup, tier, rnd, safetiesInRow, ok);
  const t1 = now();
  if (pick.type === 'foul') { // no pot or safety reaches a legal ball: hit the nearest one softly, through whatever is in the way
    const legal = legalFor(balls, group), near = balls.filter((o) => legal.includes(o.id)).reduce<Obj | null>((a, o) => (!a || dist(o, cue) < dist(a, cue) ? o : a), null);
    const shot = { ang: near ? Math.atan2(near.y - cue.y, near.x - cue.x) : 0, speed: SOFT, a: 0, b: 0 }; // no legal ball at all: the rack is over
    // Bank shots: this ball may not go straight in (the 8 would lose the rack), so tap softer until it stays up.
    if (ok && near) { const k = ids.indexOf(near.id); for (const v of [0.6, 0.35, 0.2]) { if (!rollout(B, shot, k, k, null, cue).pot) break; shot.speed = v; } }
    return { shot, aim: shot, pick, ms: [t1 - t0, 0], rollouts: 0 };
  }
  // Pro and Legend refine their best few pots (tier.tries) on the engine and play the one worth most with the leave it
  // really gets: its chance times one plus the next shot's. Each gets a few rollouts, then the best of them the rest of
  // the budget. A safety maps like a pot: its ball, its leave, its line. A ranked pot with no leave (a combo) gets the
  // default one it is played with, so pick.leave is there for every pot, as decide() says.
  // A tier with tricks also refines the trick shots plan() kept, after its plain pots are refined and checked, as Legend's
  // order: a spent budget cuts the tricks, not the pick.
  const lead: (Planned | Safety)[] = pick.type === 'safety' ? [pick] : [pick, ...ranked.filter((c) => c !== pick)].slice(0, tier.tries ?? 1);
  const cands = tier.tricks && pick.type !== 'safety' ? [...lead, ...ranked.filter((c) => fancy(c) && !lead.includes(c))] : lead;
  let sims = Math.floor(tier.budget - 0.3 * cands.length); // an aim correction costs about 0.3 of a full simulation
  const clk: Clock = { n: 0, cap: tier.tricks ? ROLLOUTS : Infinity, end: t0 + (tier.think ?? THINK) };
  const mkRun = (c: Planned | Safety, free = false): Run => { // free: refined whatever its caller gives it (the rescue and the safety below)
    const lv = (c.leave ??= { spin: 0, power: 700, x: c.G.x, y: c.G.y, path: [c.G], travelled: 0, scratch: false }), b = c.type === 'billiard' ? ROLL : TIP * lv.spin, speed = c.elev ? JUMP_SPEED : speedFor(c.paths, lv.power, c.v, c.u, b, 1 - 1.5 * tier.speedErr / 100);
    // a jump's aim is not corrected here: the probe has no ball to jump over
    const first = ids.indexOf(c.type === 'safety' ? c.ball : c.first), start: Shot = c.elev ? { ang: c.aim, speed, a: 0, b: 0, elev: c.elev } : { ang: correctAim(B[0], B[first], c, speed, 0, b) ?? c.aim, speed, a: 0, b };
    const cr = tier.tricks && (c.type === 'kick' || c.type === 'safety') ? c.rails ?? +(c.type === 'kick') : 0, or = tier.tricks && c.type === 'bank' ? c.rails ?? 1 : 0;
    const k = ids.indexOf(c.ball), pk = c.type === 'safety' ? null : POCKETS[c.pocket], sd = aimSd(tier, c.type);
    const verifyAt = tier.tricks ? (s: Shot) => verify(B, ids, group, tier, s, sd, k, first, pk && { x: pk.x / 1000, y: pk.y / 1000 }, { x: c.G.x / 1000, y: c.G.y / 1000 }, cr, or, clk) : undefined;
    return { c, more: sims < 2 && !free ? null : refine(B, ids, group, tier, k, first, pk, c.G, lv, start, clk, cr, or, verifyAt, tier.tricks && !pk ? oppGroup : undefined), verifyAt, v: -Infinity, p: 0, shot: start, r: null as Roll | null };
  };
  const runs = lead.map((c) => mkRun(c)); // the trick shots' start below: their aim corrections would cost the pick's time
  // A tier with tricks: a pot's chance is the share verify() potted (SURE for all six). Its strike noise is so small that the
  // geometric seed says little: it was right about plain pots and wrong about cushion shots, and the engine is right about both.
  // Verify costs six rollouts, so only the pots that could be played are checked (checkRun, best first, below): an unchecked
  // pot counts SURE while there is time to check it, and its seed chance once there is none, as Legend plays it.
  const late = () => over(clk), stopped = () => now() >= clk.end; // stopped: the hard stop, not the count
  const value = (x: Run) => {
    const r = x.r!, c = x.c;
    x.p = c.type === 'safety' ? 0 : !tier.tricks ? c.p : r.sure >= 0 ? SURE * r.sure : late() ? c.p : SURE;
    x.v = c.type !== 'safety' && r.pot && r.legal && !r.scratch ? x.p * (1 + r.next + r.extra) : r.score / 16 - 1;
  };
  const score = (x: Run, n: number) => { x.r = x.more!(n); x.shot = x.r.shot; value(x); };
  const checkRun = (x: Run) => { // verify a tier with tricks' pot that refine() left unchecked (its aim did not converge)
    if (!x.verifyAt || !x.r || x.r.sure >= 0 || !(x.v > 0)) return;
    const n = x.verifyAt(x.r.shot);
    if (n >= 0) { x.r.sure = n / 6; x.r.score -= FAIL * (6 - n); }
    value(x);
  };
  const best = () => runs.reduce((a, x) => (x.v > a.v ? x : a));
  const settle = () => { for (let x = best(); x.verifyAt && x.r!.sure < 0 && x.v > 0 && !late(); x = best()) checkRun(x); }; // until the best is a checked pot
  if (runs[0].more) {
    const first = cands.length > 1 ? Math.min(6, Math.floor(sims / (cands.length + 1))) : sims; // shortcut: the 6 a try is a guess, retune with bench:visit
    const head = runs[0], pickSure = () => head.r?.sure === 1 && head.r.next >= 0.95; // checked on all six, a near-sure next shot
    // a sure next shot could not beat the best; a 9 is weighed on its own terms below, so it is always rolled out; a tier
    // with tricks always scores its trick shots (their seed chance says little)
    const worth = (x: Run) => x.c.type === 'safety' || (nine(group) && x.c.ball === 9) || (tier.tricks && fancy(x.c)) || 2 * x.c.p > Math.max(...runs.map((y) => y.v));
    // a tier with tricks: out of budget only the pick (its first rollout runs whatever the budget says, so there is a
    // shot), and once the pick is sure no plain alternative and only its first trick shot, for show: the rest would cost
    // rollouts on most shots for a shot it rarely plays. Its trick shots go after the plain pots are checked (settle).
    // Shown: the trick with the most cushions (a 4-cushion seed chance is a few %, so by chance one never ran), and the
    // first reel shot with a fair seed chance.
    const show = cands.filter(fancy).sort((a, b) => (b.rails ?? 1) - (a.rails ?? 1))[0], show2 = cands.find((c) => big(c) && c.type !== 'safety' && c.p >= 0.3), skip = (c: Planned | Safety) => !!tier.tricks && c !== pick && (late() || (pickSure() && c !== show && c !== show2));
    for (const x of runs) if (!skip(x.c) && worth(x)) { score(x, first); sims -= first; if (x === head) checkRun(x); }
    if (tier.tricks) { settle(); for (const c of cands) if (!lead.includes(c) && !skip(c)) { const x = mkRun(c, true); runs.push(x); score(x, first); sims -= first; } }
    const top = best();
    if (sims > 0 && cands.length > 1) score(top, sims);
    settle();
    if (tier.tricks && late()) for (const x of runs) if (x.r) value(x); // out of time: the unchecked pots at their seed chance
    // 9-ball: a 9 that went down early against the best route that potted, as plan() weighs them (nineValue), from the
    // leaves the engine really gave. shortcut: the route's next shot is the noise-free rest spot's, a little optimistic.
    // Hustler (tries 1) has no second rollout to weigh: plan() alone decides for it.
    const ref = nine(group) ? runs.filter((x) => x.c.ball !== 9 && x.r?.pot && x.v > 0).reduce<Run | null>((a, x) => (!a || x.v > a.v ? x : a), null) : null;
    if (ref) {
      // p as the tier prices it: a tier with tricks by verify(), as its routes are valued
      const w9 = ids.indexOf(9), odds = rackOdds(tier, ref.p, ref.r!.next, ref.r!.S[w9].on ? ref.r!.S.filter((b, i) => i && b.on).length : 0, ref.r!.nextNine); // the 9 knocked in: wins with p
      for (const x of runs) if (x.c.ball === 9 && x.v > 0) x.v = nineValue(x.v, x.p, ref.v, odds);
    }
    settle();
  }
  let won = best();
  if (tier.tricks) won = tricksTail(won, { runs, mkRun, score, checkRun, late, stopped, clk }, cands, cue, balls, group, oppGroup, tier, rnd, safetiesInRow, ok);
  const aim = won.shot, played = won.c;
  const t2 = now(), g = () => gauss(rnd);
  const tip = (x: number) => Math.max(-CUE.tipLimit, Math.min(CUE.tipLimit, x + g() * tier.tipErr)); // tipErr is in ball radii, as a and b are
  const shot: Shot = { ang: aim.ang + g() * aimSd(tier, played.type), speed: Math.min(CUE.maxSpeed, Math.max(0.5, aim.speed * (1 + g() * tier.speedErr / 100))), a: tip(0), b: tip(aim.b), ...(aim.elev ? { elev: Math.min(CUE.maxElev, aim.elev + g() * aimSd(tier, played.type)) } : {}) }; // a jump's tilt held as steadily as its line
  return { shot, aim, pick: played, ms: [t1 - t0, t2 - t1], rollouts: clk.n };
}
