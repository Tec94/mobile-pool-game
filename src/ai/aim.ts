// The AI's shot on the real engine: correct the picker's ghost-ball aim for throw, squirt and swerve, refine aim, speed
// and tip with noise-free rollouts within the tier's budget, and turn a pick into an engine Shot with the tier's strike noise. Port of the ai-progression prototype (engine-aim.js) plus the glue.
import { type Ball, CUE, type Ev, P, type Shot, step, strike } from '../physics/engine.ts';
import { decide, dist, enumerate, legalFor, NINE, type Obj, type Pick, POCKETS, potProb, type Pt, type Tier } from './shot-ai.ts';

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
function rollout(B: Ball[], shot: Shot, k: number, first: number, pk: Pt | null, G: Pt) {
  const S = B.map((b) => ({ ...b })), ev: Ev[] = [], c = S[0], o = S[k];
  let hit = -1, rail = false, pot = false, scratch = false, near = Infinity, err = 0, drop = 0;
  const watch = (q: Ball, p: Pt) => { // closest approach of a moving ball q to p, signed by which side it passes on
    const v = Math.sqrt(q.vx * q.vx + q.vy * q.vy), dx = p.x - q.x, dy = p.y - q.y, d = dx * dx + dy * dy;
    if (v && d < near) { near = d; err = (q.vx * dy - q.vy * dx) / v; }
  };
  strike(c, shot);
  for (let n = 0; n < 12000; n++) {
    const v = Math.sqrt(o.vx * o.vx + o.vy * o.vy);
    ev.length = 0;
    const mv = step(S, ev);
    for (const e of ev) {
      if (e.t === 'bb' && e.a === 0 && hit < 0) { hit = e.b!; near = Infinity; }
      else if (hit >= 0 && e.t === 'rail') rail = true;
      if (e.t === 'pocket' || e.t === 'off') { if (e.a === 0) scratch = true; else if (e.a === k) { pot = e.t === 'pocket'; drop = v; } }
    }
    if (hit < 0) watch(c, G); else if (hit === first && pk && o.on) watch(o, pk);
    // shortcut: stops once the cue ball and ball k rest, so a later kiss or a rail reached by another ball is not seen;
    // run to rest if the AI starts fouling on those.
    if (!mv || (hit >= 0 && !(c.on && (c.vx || c.vy)) && !(o.on && (o.vx || o.vy)))) break;
  }
  // a ball potted fast enough would have reached the cushion behind the pocket had it missed
  return { pot: pot && !scratch, legal: hit === first, rail: rail || drop > 0.25, scratch, err: pk || hit !== first ? err : 0, S };
}
// Chance the tier pots its best next shot from where a rollout left the table (S, metres): the leave, measured on the
// engine instead of planned. 1 when the 8 (the 9) dropped legally, -1 when the 8 dropped early. 9-ball: on the lowest ball left.
function nextP(B: Ball[], S: Ball[], ids: number[], group: number[], tier: Tier) {
  const balls: Obj[] = [], w = ids.indexOf(group === NINE ? 9 : 8);
  S.forEach((b, i) => i && b.on && balls.push({ id: ids[i], x: b.x * 1000, y: b.y * 1000 }));
  if (w > 0 && B[w].on && !S[w].on) return group === NINE || !balls.some((b) => group.includes(b.id)) ? 1 : -1;
  const legal = legalFor(balls, group), all = enumerate({ x: S[0].x * 1000, y: S[0].y * 1000 }, balls, legal, group === NINE ? NINE : legal);
  const mine = all.filter((c) => tier.types.includes(c.type));
  return Math.max(0, ...(mine.length ? mine : all).map((c) => potProb(c, tier.sigma * Math.PI / 180)));
}
type Roll = ReturnType<typeof rollout> & { shot: Shot; score: number };
const SPEEDS = [1, 1.3, 0.8, 1.7, 0.65, 2.2, 0.5]; // tried in this order, times the starting speed
// The shot in hand on the engine, within the tier's budget of full-table simulations: steer the aim until the right ball
// is hit first and ball k drops in the middle of the pocket (secant on err), then try other speeds and tip heights for the
// planned spin and for draw, stun and follow, and keep the rollout that best pots k without a scratch, hits first legally,
// sends a ball to a rail and leaves the best next shot (nextP) where the cue ball really stops; a safety, nearest the
// planned spot. leave (with its planned spin) and G in mm.
function refine(B: Ball[], ids: number[], group: number[], tier: Tier, k: number, first: number, pk: Pt | null, G: Pt, leave: Pt & { spin: number }, shot: Shot, sims: number): Shot {
  const g = { x: G.x / 1000, y: G.y / 1000 }, to = pk && { x: pk.x / 1000, y: pk.y / 1000 };
  let best: Roll | null = null;
  const slope = [0, 0]; // d err / d aim, before the right first hit and after it
  const run = (s: Shot): Roll => {
    sims--;
    const r = rollout(B, s, k, first, to, g), c = r.S[0], p = pk && r.pot && r.legal ? nextP(B, r.S, ids, group, tier) : 0;
    if (p < 0) r.pot = false; // the 8 went down early: the rack is lost
    const off = Math.abs(r.err) * 5 + (pk ? 1 - Math.max(0, p) : Math.hypot(c.x * 1000 - leave.x, c.y * 1000 - leave.y) / 4000);
    const out = { ...r, shot: s, score: 8 * +(r.pot && r.legal) + 4 * +!r.scratch + 2 * +r.legal + +r.rail - Math.min(0.99, off) };
    if (!best || out.score > best.score) best = out;
    return out;
  };
  const done = (r: Roll) => r.legal && (!pk || (r.pot && Math.abs(r.err) < 0.004));
  const next = (r: Roll) => r.shot.ang - (slope[+r.legal] ? Math.max(-0.02, Math.min(0.02, r.err / slope[+r.legal])) : -0.001); // a secant step, or a nudge to measure the slope
  // aim: secant on err, with a slope for each thing err measures
  let r0 = run(shot);
  for (let i = 0; i < 8 && sims >= 1 && !done(r0); i++) {
    const x = next(r0);
    if (x === r0.shot.ang) break; // err is flat at zero: the cue ball is blocked on its way to G
    const r1 = run({ ...shot, ang: x });
    if (r1.legal === r0.legal && r1.err !== r0.err) slope[+r1.legal] = (r1.err - r0.err) / (x - r0.shot.ang);
    r0 = r1;
  }
  // speed and tip, from the best aim so far, with one aim step at each if the ball missed
  const tips = [...new Set([shot.b, leave.spin * (CUE.tipLimit - 0.05), ...(pk ? [-(CUE.tipLimit - 0.05), 0, TIP] : [])])];
  for (const m of SPEEDS) for (const b of tips) {
    if (sims < 1 || best!.score > 14.9875) return best!.shot; // all four goals met, a near-certain next shot (or the leave)
    if (m === 1 && b === shot.b) continue;
    const r = run({ ...shot, ang: best!.shot.ang, speed: Math.min(CUE.maxSpeed, Math.max(0.5, shot.speed * m)), b });
    if (!done(r) && slope[+r.legal] && sims >= 1) run({ ...r.shot, ang: next(r) });
  }
  return best!.shot;
}

// The AI's turn on the engine table. B and ids as rules.ts has them (ball i is number ids[i], ball 0 the cue ball), in
// metres. Returns the Shot for strike(), the pick (picker units, mm) and the ms spent picking and correcting the aim.
export function aiShot(B: Ball[], ids: number[], group: number[], oppGroup: number[], tier: Tier, rnd: () => number, safetiesInRow = 0): { shot: Shot; aim: Shot; pick: Pick; ms: [number, number] } {
  const t0 = performance.now(), mm = (b: Ball, i: number): Obj => ({ id: ids[i], x: b.x * 1000, y: b.y * 1000 });
  const cue = mm(B[0], 0), balls = B.map(mm).filter((_, i) => i && B[i].on), { pick } = decide(cue, balls, group, oppGroup, tier, rnd, safetiesInRow);
  const t1 = performance.now();
  if (pick.type === 'foul') { // no pot or safety reaches a legal ball: hit the nearest one softly, through whatever is in the way
    const legal = legalFor(balls, group), near = balls.filter((o) => legal.includes(o.id)).reduce<Obj | null>((a, o) => (!a || dist(o, cue) < dist(a, cue) ? o : a), null);
    const shot = { ang: near ? Math.atan2(near.y - cue.y, near.x - cue.x) : 0, speed: SOFT, a: 0, b: 0 }; // no legal ball at all: the rack is over
    return { shot, aim: shot, pick, ms: [t1 - t0, 0] };
  }
  // a safety maps like a pot: its ball, the leave it planned, and the line it sends that ball along
  const b = TIP * pick.leave!.spin, speed = speedFor(pick.paths, pick.leave!.power, pick.v, pick.u, b, 1 - 1.5 * tier.speedErr / 100);
  const first = ids.indexOf(pick.type === 'safety' ? pick.ball : pick.first), start = { ang: correctAim(B[0], B[first], pick, speed, 0, b) ?? pick.aim, speed, a: 0, b };
  const sims = Math.floor(tier.budget - 0.3); // an aim correction costs about 0.3 of a full simulation; one rollout alone has nothing to compare with
  const aim = sims < 2 ? start : refine(B, ids, group, tier, ids.indexOf(pick.ball), first, pick.type === 'safety' ? null : POCKETS[pick.pocket], pick.G, pick.leave!, start, sims);
  const t2 = performance.now(), g = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd()); // Box-Muller
  const tip = (x: number) => Math.max(-CUE.tipLimit, Math.min(CUE.tipLimit, x + g() * tier.tipErr)); // tipErr is in ball radii, as a and b are
  // side tip error squirts the cue ball off line (strike() adds a * squirt), so the aim itself scatters by the rest of sigma
  const rad = tier.sigma * Math.PI / 180, aimSd = Math.sqrt(Math.max(0, rad * rad - (tier.tipErr * CUE.squirt) ** 2));
  const shot = { ang: aim.ang + g() * aimSd, speed: Math.min(CUE.maxSpeed, Math.max(0.5, aim.speed * (1 + g() * tier.speedErr / 100))), a: tip(0), b: tip(aim.b) };
  return { shot, aim, pick, ms: [t1 - t0, t2 - t1] };
}
