'worklet'; // every function here also runs on the AI's worklet runtime (src/ai/think.ts): define a function before its callers
// Shot picker for the AI opponent: a typed port of the ai-progression prototype (shot-ai.js). Pure: no React, no engine
// calls. Units: mm and radians, origin at a corner of the playing field, x along the length (the engine's axes, x1000).
// shortcut: geometry only. Cue-ball travel is a rule of thumb (tangent line, plus or minus follow/draw, straight rolls with
// mirror bounces, stops at the first ball it meets), off the engine by 250-300 mm (median), so it only ranks the pots.
// aim.ts turns a pick into an engine Shot, corrects its aim and scores its leave where the engine stops the cue ball.
import { P } from '../physics/engine.ts';

// shortcut: the table is read once at load; setTable() (the 9 ft calibration table) is not followed. Read P per call if the app ever changes table size.
export const W = P.L * 1000, H = P.W * 1000, R = P.R * 1000;
export interface Pt { x: number; y: number }
export interface Obj extends Pt { id: number } // a ball on the table: its number and where it is
export type ShotType = 'direct' | 'bank' | 'kick' | 'combo' | 'carom' | 'billiard' | 'jump';
// A way to pot. G = cue-ball position at contact, v = its direction there, u = where the first ball leaves, first = that
// ball's id, via = a combo's first ball or a carom's helper ball, tol = the striker's angular tolerance (radians), paths = polylines for drawing.
// rails = the cushions of a bank or kick (1 when left out), elev = a jump's starting cue elevation (radians), set by the finders of a tier with tricks.
export interface Cand { type: ShotType; ball: number; pocket: number; aim: number; tol: number; cut: number; paths: Pt[][]; G: Pt; v: Pt; u: Pt; first: number; via?: number; rails?: number; elev?: number }
export interface Leave extends Pt { spin: number; power: number; path: Pt[]; travelled: number; scratch: boolean }
export interface Planned extends Cand { p: number; score: number; value: number; leave?: Leave; next?: Planned; deep?: boolean } // deep: plan() searched its leaves
// G, v and u are kept on a safety (the prototype dropped them) so the engine glue maps it like a pot.
// An escape (a hooked tier with tricks kicks or jumps to a legal hit) is a safety with rails or elev, as a Cand has them.
export interface Safety { type: 'safety'; ball: number; aim: number; paths: Pt[][]; leave: Leave; oppBest: number; hooked: boolean; G: Pt; v: Pt; u: Pt; rails?: number; elev?: number }
export type Pick = Planned | Safety | { type: 'foul' };
export interface Tier { name: string; sigma: number; types: ShotType[]; flair: number; temp: number; depth: number; planShare?: number; wPos: number; posErr: number; speedErr: number; tipErr: number; ctrl: number; wLeave: number; rack?: boolean; safetyAngles: number[]; budget: number; tries?: number; caromGap: number; rail: [number, number]; hard: number; run: number; spot?: number;
  // style hooks (src/ai/styles.ts), none on a plain tier: like = score bonus per shot type; safeAt = best pot value under which a
  // safety is weighed (0.3); spinLove = bonus for a leave played with draw or follow; hook = credit for a hook times this;
  // bankAim = aim error on a bank or kick times this
  like?: Partial<Record<ShotType, number>>; safeAt?: number; spinLove?: number; hook?: number; bankAim?: number;
  // trick hooks, only on the Chinese Masters: tricks = most cushions of a bank or kick, and on: jumps, escapes, double pots and
  // the engine check of every pot (aim.ts verify); show = how much more a checked trick shot is worth; think = ms deadline (aim.ts THINK; a tier with tricks: the hard stop past its ROLLOUTS)
  tricks?: number; show?: number; think?: number }
interface Pocket extends Pt { ax: [number, number]; m: number; c: number; back: number }
interface Rail { k: 'x' | 'y'; v: number }

// Margin kept after one cushion, measured on the engine (critique/probe5.js C, H). The window itself is 0.91 (bank) and 1.05 (kick)
// of the mirror geometry, but the rebound angle moves with speed, so under a tier's own speed error 0.76 to 0.87 is what it pots at.
export const RAIL_FACTOR = 0.8;
// Aim error a cushion adds on top of the reference player's (SIGMA_REF), for pricing the opponent's reply and pay. The
// AI's own tiers use their measured cushion error instead (Tier.rail, tierProb).
const RAIL_SIGMA = 0.3 * Math.PI / 180;
export const SIGMA_REF = 0.30 * Math.PI / 180; // "average player" aim error with a long aim line, used to price the reply of the opponent
// Pocket model measured on the engine's WPA pockets (critique/probe5.js A). x, y = centre of the window a ball must
// pass through (the middle of the mouth, not the corner of the field). A ball arriving at angle alpha off the pocket's
// axis has a window m*cos(alpha) - c wide. back = distance from that point to the hole centre, for drawing only.
const CORNER = { m: 86, c: 22, back: 105 }, SIDE = { m: 128, c: 44, back: 73 };
export const POCKETS: Pocket[] = [
  { x: 44, y: 44, ax: [1, 1], ...CORNER }, { x: W / 2, y: 8, ax: [0, 1], ...SIDE }, { x: W - 44, y: 44, ax: [-1, 1], ...CORNER },
  { x: 44, y: H - 44, ax: [1, -1], ...CORNER }, { x: W / 2, y: H - 8, ax: [0, -1], ...SIDE }, { x: W - 44, y: H - 44, ax: [-1, -1], ...CORNER },
];
const RAILS: Rail[] = [{ k: 'y', v: R }, { k: 'y', v: H - R }, { k: 'x', v: R }, { k: 'x', v: W - R }];

export const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const len = (a: Pt) => Math.sqrt(a.x * a.x + a.y * a.y); // not Math.hypot: enumerate() runs this hot, and hypot is several times slower
export const norm = (a: Pt): Pt => { const l = len(a); return { x: a.x / l, y: a.y / l }; };
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
export const dist = (a: Pt, b: Pt) => len(sub(a, b));
const mirror = <T extends Pt>(p: T, rail: Rail): T => ({ ...p, [rail.k]: 2 * rail.v - p[rail.k] });
function erf(x: number) { // Abramowitz-Stegun 7.1.26, |error| < 1.5e-7
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x < 0 ? -y : y;
}
export const makeProb = (tol: number, sigma: number) => erf(tol / (sigma * Math.SQRT2));
// Chance a striker with aim error sigma (radians) pots shot s.
export const potProb = (s: Cand, sigma: number) => makeProb(s.tol, s.type === 'bank' || s.type === 'kick' ? Math.hypot(sigma, RAIL_SIGMA) : sigma);
// Chance this tier pots shot s, as the engine measures it (npm run bench:types): banks and kicks at the tier's own
// cushion error (rail), any other shot but a straight pot at its aim error times hard. A bank or kick off n cushions at n
// times that, a jump at twice the kick's: only a ranking seed, aim.ts measures those on the engine (verify).
export function tierProb(tier: Tier, s: Cand) {
  const d = Math.PI / 180 * (s.rails ?? 1);
  return makeProb(s.tol, s.type === 'bank' ? tier.rail[0] * d : s.type === 'kick' ? tier.rail[1] * d : s.type === 'jump' ? 2 * tier.rail[1] * d : tier.sigma * (s.type === 'direct' ? 1 : tier.hard) * d);
}

// Half-width of the window a ball arriving along `dir` must pass through, or 0 if it cannot drop.
export function slack(pk: Pocket, dir: Pt) {
  const ax = norm({ x: pk.ax[0], y: pk.ax[1] });
  return Math.max(0, (pk.m * -dot(dir, ax) - pk.c) / 2);
}
// True when no ball (other than `ignore` ids) sits in the lane from a to b.
function clear(a: Pt, b: Pt, balls: Obj[], ignore: number[]) {
  const d = sub(b, a), l2 = dot(d, d);
  return balls.every((o) => {
    if (ignore.includes(o.id)) return true;
    const t = Math.max(0, Math.min(1, dot(sub(o, a), d) / l2));
    return dist(o, { x: a.x + d.x * t, y: a.y + d.y * t }) >= 2 * R - 0.01;
  });
}
// Where the straight line from a to the mirrored point m crosses the cushion, if it is a real cushion hit.
function railHit(a: Pt, m: Pt, rail: Rail): Pt | null {
  const t = (rail.v - a[rail.k]) / (m[rail.k] - a[rail.k]);
  if (!(t > 0 && t < 1)) return null;
  const X = { x: a.x + (m.x - a.x) * t, y: a.y + (m.y - a.y) * t };
  if (X.x < R - 1 || X.x > W - R + 1 || X.y < R - 1 || X.y > H - R + 1) return null;
  return POCKETS.some((p) => dist(p, X) < 110) ? null : X;
}
// Every order of n cushions (indices into RAILS) with no cushion twice in a row, n = 0 to 4.
const SEQS: number[][][] = [[[]]];
for (let n = 1; n <= 4; n++) SEQS.push(SEQS[n - 1].flatMap((q) => [0, 1, 2, 3].filter((k) => k !== q[q.length - 1]).map((k) => [...q, k])));
// The path from a to b off the cushions q in this order (mirror unfolding: b mirrored across the cushions, last first),
// or null when a crossing is no real cushion hit (railHit). image = a mirrored across them in order: a ball arriving
// at b comes in on the line from there.
function unfold(a: Pt, b: Pt, q: number[]): Pt[] | null {
  const pts = [a];
  for (let i = 0; i < q.length; i++) {
    let img = b;
    for (let j = q.length - 1; j >= i; j--) img = mirror(img, RAILS[q[j]]);
    const X = railHit(pts[i], img, RAILS[q[i]]);
    if (!X) return null;
    pts.push(X);
  }
  pts.push(b);
  return pts;
}
const image = (a: Pt, q: number[]) => q.reduce((p, k) => mirror(p, RAILS[k]), a);
// Every leg of a polyline is clear of balls (the ids in ignore aside; the last leg also ignores last).
function lanes(pts: Pt[], balls: Obj[], ignore: number[], last: number) {
  for (let i = 1; i < pts.length; i++) if (!clear(pts[i - 1], pts[i], balls, i < pts.length - 1 ? ignore : [...ignore, last])) return false;
  return true;
}
const span = (pts: Pt[]) => pts.reduce((l, p, i) => (i ? l + dist(pts[i - 1], p) : 0), 0);
// Striking ball coming from `from` must send ball B along unit vector u, within angle objTol.
// Returns the ghost-ball position, strike direction, cut angle and the striker's own angular tolerance.
export function strike(from: Pt, B: Pt, u: Pt, objTol: number) {
  const G = { x: B.x - 2 * R * u.x, y: B.y - 2 * R * u.y };
  const v = norm(sub(G, from)), c = dot(v, u);
  if (c < 0.17) return null; // cuts thinner than ~80 degrees are not attempted
  return { G, v, cut: Math.acos(Math.min(1, c)), tol: objTol * 2 * R * c / dist(G, from) };
}
type Strike = NonNullable<ReturnType<typeof strike>>;
const SLIDE = 150; // mm a struck object ball travels before it rolls, for kiss(): fitted on the engine (120 to 200 drop alike)
const spot = (X: Pt, b: number) => ({ G: { x: X.x + 2 * R * Math.cos(b), y: X.y + 2 * R * Math.sin(b) }, n: { x: -Math.cos(b), y: -Math.sin(b) } });
// A rolling ball does not leave a ball it kisses on the tangent line: it bends forward, to tan(t) = sin c cos c /
// (sin^2 c + 2/5 f) off its own line for a cut c, where f is the share of natural roll it has (1: rolling, at most
// atan(sqrt(10) / 4.8) = 33.4 degrees off the tangent line; 0: stun, the tangent line, 90 degrees - c).
const bend = (c: number, f: number) => Math.atan2(Math.sin(c) * Math.cos(c), Math.sin(c) ** 2 + 0.4 * f);
// Kiss: the spots 2R from ball X where a ball coming from `from` meets X and leaves straight toward T, and the line of
// centres n there (from the spot to X). slide = mm the ball travels before it rolls: it starts stunned and its roll grows
// as travel / slide (0: rolling from the start). Secant on the spot's angle about X from each stun spot (Thales: a right
// angle between X and T), so one spot each side of X at most. shortcut: the roll grows with travel alone, though a hard
// shot slides further, and the curve from the tangent line onto the bent line is left out (it grows with speed); refine()
// corrects both on the engine. Fitted there (SLIDE): Legend's noise-free caroms the picker rates p >= 0.8 drop 87 of 103
// (13 of 96 when taken as rolling). Model speed if a tier with no engine time ever plays kisses.
function kiss(from: Pt, X: Pt, T: Pt, slide: number) {
  const d = dist(X, T), e = dist(from, X), a = Math.atan2(T.y - X.y, T.x - X.x);
  // fast way out (enumerate() runs this often): T must be about ahead, as far as the spot can be off X seen from both ends
  const ahead = Math.acos(Math.max(-1, Math.min(1, dot(sub(X, from), sub(T, X)) / (d * e))));
  if (d <= 2 * R || ahead > 0.583 + Math.asin(Math.min(1, 2 * R / e)) + Math.asin(2 * R / d)) return [];
  const miss = (b: number) => {
    const { G, n } = spot(X, b), v = norm(sub(G, from)), side = Math.sign(v.x * n.y - v.y * n.x);
    const off = Math.atan2(T.y - G.y, T.x - G.x) - Math.atan2(v.y, v.x) + side * bend(Math.acos(Math.max(-1, Math.min(1, dot(v, n)))), Math.min(1, dist(G, from) / slide));
    return Math.atan2(Math.sin(off), Math.cos(off));
  };
  let prev = NaN; // both starts can converge on the same spot: keep it once
  return [a + Math.acos(2 * R / d), a - Math.acos(2 * R / d)].flatMap((b) => {
    let b0 = b, f0 = miss(b0), b1 = b + 0.01;
    for (let i = 0; i < 8 && Math.abs(f0) > 1e-4; i++) {
      const f1 = miss(b1);
      if (f1 === f0) break;
      [b0, f0, b1] = [b1, f1, b1 - f1 * (b1 - b0) / (f1 - f0)];
    }
    if (!(Math.abs(f0) <= 1e-3) || Math.abs(Math.atan2(Math.sin(b0 - prev), Math.cos(b0 - prev))) < 0.01) return [];
    prev = b0;
    return [spot(X, b0)];
  });
}
// Every way to send ball B into pocket pk: straight, or off one cushion (bank), or off 2 to `tricks` cushions.
function routes(B: Obj, pk: Pocket, balls: Obj[], tricks = 0) {
  const out: { u: Pt; objTol: number; path: Pt[]; bank: boolean; rails?: number }[] = [];
  const u = norm(sub(pk, B)), s = slack(pk, u);
  if (s && clear(B, pk, balls, [B.id])) out.push({ u, objTol: Math.atan(s / dist(B, pk)), path: [B, pk], bank: false });
  for (const rail of RAILS) {
    if (Math.abs(pk[rail.k] - rail.v) < 3 * R) continue; // pocket sits on this rail
    const m = mirror(pk, rail), X = railHit(B, m, rail);
    if (!X) continue;
    const s2 = slack(pk, norm(sub(pk, X)));
    if (!s2 || !clear(B, X, balls, [B.id]) || !clear(X, pk, balls, [B.id])) continue;
    out.push({ u: norm(sub(m, B)), objTol: Math.atan(s2 / dist(B, m)) * RAIL_FACTOR, path: [B, X, pk], bank: true });
  }
  // shortcut: the mirror line, as for one cushion, though a ball comes off a cushion shorter than it went in (more so on each
  // one); the window times RAIL_FACTOR per cushion only ranks it, aim.ts finds the real line and checks it on the engine.
  for (let n = 2; n <= tricks; n++) for (const q of SEQS[n]) {
    const last = RAILS[q[n - 1]];
    if (Math.abs(pk[last.k] - last.v) < 3 * R) continue; // a ball off the pocket's own rail runs along it
    const path = unfold(B, pk, q);
    if (!path) continue;
    const s2 = slack(pk, norm(sub(pk, path[n])));
    if (!s2 || !lanes(path, balls, [B.id], B.id)) continue;
    out.push({ u: norm(sub(path[1], B)), objTol: Math.atan(s2 / span(path)) * RAIL_FACTOR ** n, path, bank: true, rails: n });
  }
  return out;
}

// A jump clears the balls in the lane from a to b (the ids in ignore aside): there is one, and each lies 200 to 650 mm
// along it from a. Measured on the engine (a ball in the lane, the object ball 0.1 to 0.7 m past it): no legal hit with
// the blocker 120 mm away, from 200 mm a cue raised 38 to 45 degrees at 3.5 to 4.5 m/s lands one.
function jumpable(a: Pt, b: Pt, balls: Obj[], ignore: number[]) {
  const d = sub(b, a), l = len(d);
  let n = 0;
  for (const o of balls) {
    if (ignore.includes(o.id)) continue;
    const t = dot(sub(o, a), d) / l;
    if (Math.abs(d.x * (o.y - a.y) - d.y * (o.x - a.x)) / l >= 2 * R || t < -2 * R || t > l + 2 * R) continue;
    if (t < 200 || t > 650) return false;
    n++;
  }
  return n > 0;
}
const JUMP = 38 * Math.PI / 180, JUMP_FACTOR = 0.5; // a jump's starting elevation; its window against a level pot's, a ranking seed

// All candidate pots for the cue ball against `legal` object balls. Each has an aim angle and a tolerance.
// legalIds = balls the cue ball may hit first. potIds = balls that may be potted (9-ball: any ball, through the lowest).
// tricks = most cushions of a bank or kick (Tier.tricks), and with it jumps over a ball in the lane; 0 = one cushion, no jumps.
export function enumerate(cue: Pt, balls: Obj[], legalIds: number[], potIds = legalIds, kisses = true, tricks = 0) {
  const shots: Cand[] = [], legal = balls.filter((b) => legalIds.includes(b.id)), targets = balls.filter((b) => potIds.includes(b.id));
  const add = (type: ShotType, ball: number, pocket: number, st: Strike, aimDir: Pt, paths: Pt[][], u: Pt, first: number, extra = {}) =>
    shots.push({ type, ball, pocket, aim: Math.atan2(aimDir.y, aimDir.x), tol: st.tol, cut: st.cut, paths, G: st.G, v: st.v, u, first, ...extra });
  for (const B of targets) POCKETS.forEach((pk, pi) => {
    for (const r of routes(B, pk, balls, tricks)) {
      const st = legalIds.includes(B.id) && strike(cue, B, r.u, r.objTol);
      if (st && clear(cue, st.G, balls, [B.id]))
        add(r.bank ? 'bank' : 'direct', B.id, pi, st, st.v, [[cue, st.G], r.path], r.u, B.id, r.rails ? { rails: r.rails } : {});
      else if (st && tricks && !r.bank && jumpable(cue, st.G, balls, [B.id]))
        add('jump', B.id, pi, { ...st, tol: st.tol * JUMP_FACTOR }, st.v, [[cue, st.G], r.path], r.u, B.id, { elev: JUMP });
      if (r.bank) continue; // kick-banks are left out on purpose
      for (const rail of st ? RAILS : []) { // kick: cue ball off one cushion first
        const kst = strike(mirror(cue, rail), B, r.u, r.objTol);
        if (!kst) continue;
        const X = railHit(cue, mirror(kst.G, rail), rail);
        if (!X || !clear(cue, X, balls, []) || !clear(X, kst.G, balls, [B.id])) continue;
        add('kick', B.id, pi, { ...kst, tol: kst.tol * RAIL_FACTOR }, norm(sub(X, cue)), [[cue, X, kst.G], r.path], r.u, B.id);
      }
      // kick off 2 to `tricks` cushions: the cue ball comes into the ghost ball from its own image across them
      for (let n = 2; n <= (legalIds.includes(B.id) ? tricks : 0); n++) for (const q of SEQS[n]) {
        const kst = strike(image(cue, q), B, r.u, r.objTol), path = kst && unfold(cue, kst.G, q);
        if (!kst || !path || !lanes(path, balls, [], B.id)) continue;
        add('kick', B.id, pi, { ...kst, tol: kst.tol * RAIL_FACTOR ** n }, norm(sub(path[1], cue)), [path, r.path], r.u, B.id, { rails: n });
      }
      for (const A of legal) { // combo: cue -> A -> B -> pocket (A = B needs no check: strike() refuses a cut of 180 degrees)
        const mid = strike(A, B, r.u, r.objTol);
        if (!mid || !clear(A, mid.G, balls, [A.id, B.id])) continue;
        const first = strike(cue, A, mid.v, mid.tol);
        if (!first || !clear(cue, first.G, balls, [A.id])) continue;
        add('combo', B.id, pi, first, first.v, [[cue, first.G], [A, mid.G], r.path], mid.v, A.id, { via: A.id });
      }
      // billiard: the cue ball rolls into A at GA and bends off it into B's ghost ball (straight pots of B only); aim.ts
      // strikes it at natural roll, so it rolls from the start
      const GB = { x: B.x - 2 * R * r.u.x, y: B.y - 2 * R * r.u.y };
      for (const A of kisses ? legal : []) for (const { G: GA, n } of A.id === B.id ? [] : kiss(cue, A, GB, 0)) {
        const mid = strike(GA, B, r.u, r.objTol);
        if (!mid || !clear(GA, mid.G, balls, [A.id, B.id])) continue;
        const first = strike(cue, A, n, mid.tol);
        if (!first || !clear(cue, GA, balls, [A.id])) continue;
        add('billiard', B.id, pi, first, first.v, [[cue, GA, mid.G], r.path], n, A.id);
      }
    }
  });
  // carom: cue -> O, which rolls into helper ball H at G2 and bends off it into the pocket. The kiss is a cut on H whose
  // tolerance is O's. Never off the 8 while it may not drop: the kiss pushes it along n, often toward a pocket.
  for (const O of kisses ? legal.filter((b) => potIds.includes(b.id)) : []) for (const H of balls) {
    if (H.id === O.id || (H.id === 8 && !potIds.includes(8))) continue;
    POCKETS.forEach((pk, pi) => {
      for (const { G: G2, n } of kiss(O, H, pk, SLIDE)) {
        const t = norm(sub(pk, G2)), s = slack(pk, t);
        if (!s) continue;
        const mid = strike(O, H, n, Math.atan(s / dist(G2, pk)));
        if (!mid || !clear(O, G2, balls, [O.id, H.id]) || !clear(G2, pk, balls, [O.id, H.id])) continue;
        const first = strike(cue, O, mid.v, mid.tol);
        if (!first || !clear(cue, first.G, balls, [O.id])) continue;
        add('carom', O.id, pi, first, first.v, [[cue, first.G], [O, G2, pk]], mid.v, O.id, { via: H.id });
      }
    });
  }
  return shots;
}

// ---- Cue-ball travel (rule of thumb, see shortcut note at top) ----
const SPINS = [-1, 0, 1]; // draw, stun, follow
const POWERS = [300, 700, 1300, 2200]; // roll distance scale, mm
// Roll a ball from p along unit d for distance L: mirror off cushions, stop at the first ball, drop in pockets.
function roll(p: Pt, d: Pt, L: number, balls: Obj[], ignore: number[]) {
  let { x, y } = p, dx = d.x, dy = d.y, travelled = 0;
  const path: Pt[] = [{ x, y }], STEP = 10;
  for (; travelled < L; travelled += STEP) {
    let nx = x + dx * STEP, ny = y + dy * STEP;
    if (nx < R || nx > W - R) { dx = -dx; nx = x + dx * STEP; path.push({ x, y }); }
    if (ny < R || ny > H - R) { dy = -dy; ny = y + dy * STEP; path.push({ x, y }); }
    if (POCKETS.some((pk) => Math.hypot(pk.x - nx, pk.y - ny) < pk.m / 2)) { path.push({ x: nx, y: ny }); return { x: nx, y: ny, path, travelled, scratch: true }; }
    if (balls.some((b) => !ignore.includes(b.id) && Math.hypot(b.x - nx, b.y - ny) < 2 * R)) break;
    x = nx; y = ny;
  }
  path.push({ x, y });
  return { x, y, path, travelled, scratch: false };
}
// Where the cue ball can be left after contact at G: one option per spin and power.
function leaves(G: Pt, v: Pt, u: Pt, balls: Obj[], ignore: number[], powers = POWERS): Leave[] {
  const c = dot(v, u), t = { x: v.x - c * u.x, y: v.y - c * u.y }, out: Leave[] = [];
  for (const spin of SPINS) for (const power of powers) {
    const d = { x: t.x + spin * 0.5 * c * v.x, y: t.y + spin * 0.5 * c * v.y }, m = len(d);
    const r = m < 0.02 ? { x: G.x, y: G.y, path: [G], travelled: 0, scratch: false } : roll(G, norm(d), power * m, balls, ignore);
    out.push({ spin, power, ...r });
  }
  return out;
}

// Difficulty tiers. Aim error (sigma, degrees) separates the low tiers. The high tiers are separated by
// control: depth = how many shots ahead the run is planned, wPos = how much the plan is trusted,
// posErr = scatter of the cue ball's resting spot (fraction of its roll), safetyAngles = safeties searched,
// speedErr (percent) and tipErr (ball radii) = the strike noise the engine build applies to get that scatter (probe3.js H),
// rack = a miss or a safety is priced with the rack at stake, so defence grows as the rack runs down,
// wLeave = how much the tier cares what a miss (or a safety) leaves the opponent.
// ctrl (depth 0 only): 0 = cue ball ends up anywhere, 1 = at least avoids the scratch.
// planShare = share of turns that are planned at all; it sets Hustler half way between Regular and Shark.
// caromGap = widest gap (mm, between the ball surfaces) between the potted ball and the helper it is kissed off.
// budget = engine time for the shot in hand, in full-table simulations (aim.ts refine()); tries = pots it is split over.
// Measured on the engine (npm run bench:visit): budget past about 20 a shot and depth 2 add no balls a visit; aim error
// (sigma) moves it most. Balls a visit grow each tier, steeper from Shark up (Jack 2026-11-12: top tiers punish a single
// mistake): at 150-200 tables 1.31, 1.75, 2.61, 3.81, 5.25, 6.21 in 8-ball (clears 0, 2, 2, 10, 30, 46%), 0.40, 0.51,
// 0.70, 1.41, 2.57, 3.99 in 9-ball. With no noise at all Legend runs 6.45 and clears 65%: the planner's ceiling.
// Keep tipErr x CUE.squirt (rad) at or under sigma: aim.ts takes the squirt out of the aim error, and past sigma it is all squirt.
// rail = the aim error (degrees) a bank and a kick really pot at, fitted on the engine (npm run bench:types): Rookie and
// Regular have no engine time to correct a cushion, so theirs is large; Pro and Legend refine it out. hard = aim error
// times this on any pot but a straight one (Rookie, Regular), so those rise every tier too. Make % at 200-450 tables, each
// type forced (Rookie..Legend): straight 62 74 78 88 94 99, bank 8 12 24 35 46 65, kick 7 9 21 33 58 78, combo 5 12 15 23
// 34 54, Bank shots mode 6 9 14 31 44 70, carom (Hustler up) 29 29 38 66, billiard (Shark up) 13 24 42. The planner's
// chance matches within a few points, but for caroms and billiards, which it rates at 0.6 of what Shark and up make.
// Hustler's speedErr of 6 (not 8): a forced bank's rebound swings with speed (lit cushions 11% at 8).
// Balls a visit after this (2026-11-17, 200 tables): 8-ball 1.32 1.69 2.62 3.64 5.08 6.01, 9-ball 0.48 0.64 0.96 1.57 2.73 4.64.
// run = the tier's chance to pot each ball of a 9-ball run after the next shot (rackOdds), fitted on the engine so a route's
// predicted odds match the racks it clears in one visit (500 tables: Hustler 0.009 / 0.017, Pro 0.25 / 0.19, Legend
// 0.56 / 0.51 before the fit; the planned next shot is noise-free, so the bare continuation rate, 0.57 0.82 0.875 0.953,
// ran high). Rookie and Regular never play the 9 early (no combo or billiard): theirs only shape the Rival.
// Taking the 9 early, new against before at the same tier (2026-11-19, a seed played twice with sides swapped; seeds new
// won both ways / old won both ways): open table, 1600 racks: 53.4 51.8 50.7 50.4% (Hustler..Legend, +-2.5), 82/29
// 78/49 43/36 48/46; first shot with ball in hand, 1000 racks: 53.6 55.1 53.0 52.3% (+-3.1), 80/44 87/36 58/31 49/27.
// Pro and Legend run out so often that a 9 beating their route by EDGE is rare: their gain is in ball in hand. On open
// tables the choice flips under 1% of decisions, each +0.06 of a visit's clears (about 0.05 points a decision): 1600 racks
// cannot show it, about 100k would. Hustler's open-table 53.4 comes from ball in hand after fouls (50.9 without the combo
// spot). EDGE 0 to 0.15 clear alike within noise. Route odds after the run fit, predicted / cleared (500 tables): Hustler
// .011 / .015, Shark .068 / .057, Pro .213 / .193, Legend .568 / .509 (a non-9 combo route goes on at the run rate). Combo p9 runs high (Shark .19 / .12, Legend .49 / .40):
// tierProb for combos, also 8-ball's, a follow-up.
// Hustler's spot (0.45, Jack 2026-11-20): it takes the ball-in-hand combo spot only by that margin, so its one-visit clears
// with ball in hand are 10.1% (2000 racks; 16.4 at EDGE, 4.4 before the 9 went early).
// Shark's budget of 12 (not 17) and Pro's wLeave of 0.6 (not 0.9: fewer safeties) keep Shark, Pro and Legend apart.
// The Chinese Masters (2026-11-24, at f92592b): its noise alone adds nothing over Legend (6.22 balls, 52% clears at 60
// tables): the strength is in tricks, verify, the rescue search and budget 45 (33: 74 of 140 clears in place of 94).
// At 994bf30 (search budget ROLLOUTS in aim.ts, think 7000 ms only a hard stop), one visit, 200 tables (bench:visit):
// 8-ball 7.20 balls, 70% clears (Legend 6.00, 47), 9-ball 6.13, 84% (4.46, 49). Against Legend, 400 racks each way
// (bench:masters): 8-ball 74.3% ±4.3, 9-ball 71.0% ±4.4 (at most 86.8 / 76.5%: Legend wins before it has a shot); it
// hands the table over with balls up in 25-27% of the racks it gets a visit in. Ridiculous pots 25% / 22%, 3+ cushion
// or jump pots about 0.74 a rack in 8-ball and 0.34 in 9-ball. Forced make % at 300 tables (bench:types, tables with a
// try): bank2 96 (52), bank3 85 (11), bank4 95 (7), kick2 93 (87), kick3 93 (37), kick4 95 (7), jump 97 (33).
// The search counts rollouts, not ms, so every device gets the same rollout budget: one visit, 60 tables (bench:why),
// 48 and 49 clears on V8's JIT and on its interpreter alike (Legend 31 and 31; at f690253). bench:why: 5.5 ms of aiShot a
// rollout on JIT, 74 on the interpreter. Think on full racks, interpreter only (a phone; 10 racks, f690253): 8-ball p50
// 2980 ms, p90 5052, 1 of 57 shots at the hard stop; 9-ball 960 / 3281; JIT p50 168 / 92 ms. Massé, kick-banks and
// jump-kicks are not built: each is one more finder and its engine checks on every shot, which the phone cannot spare.
export const TIERS: Tier[] = [
  { name: 'Rookie',  sigma: 0.52, types: ['direct'],                          flair: 0,    temp: 0.25, depth: 0, wPos: 0,   posErr: 0.20, speedErr: 15, tipErr: 0.1, ctrl: 0, wLeave: 0, safetyAngles: [], budget: 1, caromGap: 0, rail: [0.91, 1.43], hard: 1.5, run: 0.45 },
  { name: 'Regular', sigma: 0.42, types: ['direct', 'bank'],                  flair: 0.03, temp: 0.08, depth: 0, wPos: 0,   posErr: 0.16, speedErr: 12, tipErr: 0.08, ctrl: 1, wLeave: 0, safetyAngles: [], budget: 2, caromGap: 0, rail: [0.76, 1.29], hard: 1.2, run: 0.5 },
  { name: 'Hustler', sigma: 0.34, types: ['direct', 'bank', 'combo', 'carom'], flair: 0.05, temp: 0.08, depth: 1, planShare: 0.5, wPos: 0.5, posErr: 0.11, speedErr: 6, tipErr: 0.06, ctrl: 1, wLeave: 0.3, safetyAngles: [0], budget: 9, caromGap: 60, rail: [0.39, 0.63], hard: 1, run: 0.62, spot: 0.45 },
  { name: 'Shark',   sigma: 0.20, types: ['direct', 'bank', 'combo', 'kick', 'carom', 'billiard'], flair: 0.05, temp: 0.04, depth: 1, tries: 2, wPos: 0.8, posErr: 0.08, speedErr: 5, tipErr: 0.035, ctrl: 1, wLeave: 0.6, rack: true, safetyAngles: [-30, 0, 30], budget: 12, caromGap: 10000, rail: [0.22, 0.34], hard: 1, run: 0.7 },
  { name: 'Pro',     sigma: 0.12, types: ['direct', 'bank', 'combo', 'kick', 'carom', 'billiard'], flair: 0.04, temp: 0.02, depth: 1, tries: 3, wPos: 0.9, posErr: 0.05, speedErr: 2.5, tipErr: 0.02, ctrl: 1, wLeave: 0.6, rack: true, safetyAngles: [-60, -40, -20, 0, 20, 40, 60], budget: 24, caromGap: 10000, rail: [0.14, 0.16], hard: 1, run: 0.84 },
  { name: 'Legend',  sigma: 0.05, types: ['direct', 'bank', 'combo', 'kick', 'carom', 'billiard'], flair: 0.03, temp: 0.01, depth: 1, tries: 3, wPos: 1,   posErr: 0.03, speedErr: 1, tipErr: 0.01, ctrl: 1, wLeave: 1, rack: true, safetyAngles: [-60, -40, -20, 0, 20, 40, 60], budget: 33, caromGap: 10000, rail: [0.07, 0.08], hard: 1, run: 0.94 },
  // The meme tier (Jack 2026-11-23): above Legend, near unbeatable. Off the rating scale: the Rival and the cups stop at Legend.
  { name: 'Chinese Masters', sigma: 0.0125, types: ['direct', 'bank', 'combo', 'kick', 'carom', 'billiard', 'jump'], flair: 0.03, temp: 0.01, depth: 1, tries: 3, wPos: 1, posErr: 0.02, speedErr: 0.25, tipErr: 0.002, ctrl: 1, wLeave: 1, rack: true, safetyAngles: [-60, -40, -20, 0, 20, 40, 60], budget: 45, caromGap: 10000, rail: [0.04, 0.05], hard: 1, run: 0.97, tricks: 4, show: 0.15, think: 7000 },
];
export const MASTERS = 7; // its rating: a whole tier past Legend, and no rating between the two plays any of it
// The AI for a rating s on the tier scale (1 Rookie .. 6 Legend; the Rival plays 0.5 to 6.5; 7 = the Chinese Masters): numeric dials on the line
// through the two nearest rows, past 1 and 6 along the end pair's slope. Whole settings come from the upper row with
// chance f (a seeded draw each turn, rnd), else the lower; no rnd = the nearer row. A whole rating is its tier exactly.
// tries and ctrl are whole on purpose (a count of rollouts, a flag). Depth comes from the upper row when only it plans,
// so planShare alone fades planning in (else the draw and the share would multiply).
export function aiParams(s: number, rnd?: () => number): Tier {
  if (s >= MASTERS) return { ...TIERS[MASTERS - 1] };
  const i = Math.min(5, Math.max(1, Math.floor(s))), f = s - i, lo = TIERS[i - 1], hi = TIERS[i];
  if (f === 0 || f === 1) return { ...TIERS[i - 1 + f] };
  const at = (a: number, b: number) => Math.max(0, (1 - f) * a + f * b);
  const share = (t: Tier) => (t.depth ? t.planShare ?? 1 : 0); // planning fades in as a share of turns, 0 to 1 over Regular to Shark
  const up = rnd ? rnd() < f : f >= 0.5, w = up ? hi : lo;
  return {
    ...w, sigma: at(lo.sigma, hi.sigma), speedErr: at(lo.speedErr, hi.speedErr), tipErr: at(lo.tipErr, hi.tipErr), posErr: at(lo.posErr, hi.posErr),
    flair: at(lo.flair, hi.flair), temp: at(lo.temp, hi.temp), wPos: Math.min(1, at(lo.wPos, hi.wPos)), wLeave: Math.min(1, at(lo.wLeave, hi.wLeave)),
    planShare: Math.min(1, at(share(lo), share(hi))), rail: [at(lo.rail[0], hi.rail[0]), at(lo.rail[1], hi.rail[1])], hard: at(lo.hard, hi.hard), run: Math.min(0.97, at(lo.run, hi.run)), budget: Math.max(1, at(lo.budget, hi.budget)), depth: lo.depth ? w.depth : hi.depth,
  };
}
// 9-ball: pass NINE as the group for both sides. The lowest ball must be hit first, any ball may drop, the 9 wins.
export const NINE = [1, 2, 3, 4, 5, 6, 7, 8, 9];
// By its length, not by identity: a worklet runtime gets copies of NINE (src/ai/think.ts), and SOLIDS and STRIPES have 7.
export const nine = (group: number[]) => group.length === 9;
export const legalFor = (balls: Obj[], group: number[]): number[] => {
  if (nine(group)) return balls.length ? [Math.min(...balls.map((b) => b.id))] : [];
  const own = balls.filter((b) => group.includes(b.id)).map((b) => b.id);
  return own.length ? own : balls.some((b) => b.id === 8) ? [8] : [];
};
export const potFor = (balls: Obj[], group: number[]) => (nine(group) ? NINE : legalFor(balls, group));
export const winBall = (group: number[]) => (nine(group) ? 9 : 8);
// 9-ball: the chance a shot wins the rack this visit. Only the 9 counts and a miss hands the table over either way, so of
// two shots the one that wins the rack more often is the better one. p = the shot's chance, next = the next shot's,
// n = balls left after the shot (0 when it drops the 9: it wins with p), nextNine = the next shot is itself on the 9.
// The balls after the next one go at the tier's run rate.
export const rackOdds = (tier: Tier, p: number, next: number, n: number, nextNine = false) => (!n ? p : nextNine ? p * next : p * next * tier.run ** (n - 1));

// Run-out planner. value ~ expected balls potted from here: P(make) x (1 + trust x value of the position left).
// Searches the `width` best pots, every cue-ball leave of each, and recurses `depth` shots ahead.
// Rack sense (Shark and up): handing over the table costs a reply plus the rack times the opponent's chance to run out,
// so a miss gets dearer and a safety more attractive as the rack runs down. need = balls a side still has to pot.
const R_REF = 0.75, RACK = 4, HOOK = 0.2; // reference player's pot rate per further ball; value of the rack in balls; credit for a hook
const REPLY = 2, WIN = 3; // a reply is worth about 2 balls to the opponent; potting the 8 is worth 3
// 9-ball: the value of a shot on the 9 early (a combo or a billiard), p9 its chance and v9 its own value, against the best
// route (its value ref, odds = its rackOdds). Lifted to ref plus the rack (RACK balls) times the gain when p9 beats the
// odds by EDGE, dropped below ref when p9 is under them, else left as it was. EDGE: the picked shot's estimate runs high
// (the best of several noisy ones: Hustler's open-table picks rated 0.19 dropped 0.13), and a missed 9 hands over the
// whole rack, often with the 9 by a pocket, where a route usually breaks down later on fewer balls. It is what keeps a
// tier with no run from firing 5% combos. RACK sets how far apart the two rank (the softmax, the safety gate).
export const EDGE = 0.1;
export function nineValue(v9: number, p9: number, ref: number, odds: number) {
  return p9 > odds + EDGE ? Math.max(v9, ref + RACK * (p9 - odds)) : p9 < odds ? Math.min(v9, ref + RACK * (p9 - odds)) : v9;
}
// 9-ball: the chance shot s, planned on a table of n balls, wins the rack this visit: p on the 9, else its route's rackOdds.
// A route goes on at its planned next shot's chance, 0 when plan() searched its leaves and found no shot (hooked), and
// at the run rate when it did not search (depth 0; a combo, carom or billiard moves a second ball). By deep, not by
// leave: decide() and aiShot give every pick a leave.
export function shotOdds(tier: Tier, s: Planned, n: number) {
  const next = s.next ? s.next.p : s.deep ? 0 : tier.run;
  return s.ball === 9 ? s.p : rackOdds(tier, s.p, next, n - 1, s.next?.ball === 9);
}
const need = (balls: Obj[], group: number[]) => (nine(group) ? balls.length : balls.filter((b) => group.includes(b.id)).length + 1);
const replyCost = (tier: Tier, balls: Obj[], oppGroup: number[]) => REPLY + (tier.rack ? RACK * Math.pow(R_REF, need(balls, oppGroup) - 1) : 0);
export const oppBest = (cue: Pt, balls: Obj[], oppGroup: number[]) => Math.max(0, ...enumerate(cue, balls, legalFor(balls, oppGroup), potFor(balls, oppGroup), false).map((s) => potProb(s, SIGMA_REF)));
// A trick shot: a bank or kick off 2 cushions or more, or a jump.
export const fancy = (s: { type: string; rails?: number; elev?: number }) => (s.rails ?? 1) > 1 || !!s.elev;
// The tier plays this shot: its type is in the repertoire, and a carom's helper ball is close enough.
export function plays(tier: Tier, s: Cand, balls: Obj[]) {
  const at = (id?: number) => balls.find((b) => b.id === id)!;
  return tier.types.includes(s.type) && (s.type !== 'carom' || dist(at(s.via), at(s.ball)) - 2 * R <= tier.caromGap);
}
// ok = the pots this shot may try (bank shots: a bank or kick off a lit cushion); the shots after it are not filtered.
export function plan(cue: Pt, balls: Obj[], group: number[], tier: Tier, depth: number, width: number, oppGroup?: number[], kisses = true, ok?: (c: Cand) => boolean): Planned[] {
  const win = winBall(group);
  // tricks only for the shot in hand: the shots after it are priced without them, as without kisses
  let cands = enumerate(cue, balls, legalFor(balls, group), potFor(balls, group), kisses, kisses ? tier.tricks ?? 0 : 0);
  if (ok) cands = cands.filter(ok);
  const inRepertoire = cands.filter((s) => plays(tier, s, balls));
  // outside the repertoire only when nothing else exists, and never a carom or a billiard
  cands = inRepertoire.length ? inRepertoire : cands.filter((s) => s.type !== 'carom' && s.type !== 'billiard');
  const all: Planned[] = cands.map((s) => {
    const p = tierProb(tier, s);
    return { ...s, p, value: 0, score: p * (s.ball === win ? WIN : 1) * (1 + (s.type === 'direct' || s.type === 'kick' ? 0 : tier.flair)) * (1 + (tier.like?.[s.type] ?? 0)) };
  }).sort((a, b) => b.score - a.score);
  const shots = all.slice(0, width), alt = all.find((s) => s.ball !== 9);
  if (nine(group) && alt && !shots.includes(alt)) shots.push(alt); // the 9 scores WIN times its chance: keep a route to price it against
  // a tier with tricks keeps the best trick shot of each family too (bank and kick off 2, 3 and 4 cushions, jump): their
  // chance here is a seed, so aim.ts gives them engine time. The best two overall were nearly always 2-cushion ones.
  if (kisses && tier.tricks) for (const s of all) if (fancy(s) && !shots.some((t) => t.type === s.type && t.rails === s.rails)) shots.push(s);
  for (const s of shots) {
    s.value = s.score;
    if (depth && s.type !== 'combo' && s.type !== 'carom' && s.type !== 'billiard') { // these move a second ball, so the table after them is unknown here
      const after = balls.filter((b) => b.id !== s.ball);
      s.value = -Infinity; s.deep = true;
      for (const lv of leaves(s.G, s.v, s.u, balls, [s.first, s.ball], oppGroup ? POWERS : [300, 1300])) {
        // the next shot is priced without caroms and billiards: they took half of decide()'s time and are rarely the best
        const sub = lv.scratch ? null : plan({ x: lv.x, y: lv.y }, after, group, tier, depth - 1, Math.max(1, width - 2), undefined, false);
        const value = lv.scratch ? -s.p * (s.ball === win ? WIN : 0.5) : s.score * (1 + tier.wPos * (sub![0] ? sub![0].value : 0)) * (lv.spin ? 1 + (tier.spinLove ?? 0) : 1);
        if (value > s.value) Object.assign(s, { value, leave: lv, next: sub && sub[0] });
      }
    }
    // price the miss: the opponent shoots from about where the cue ball was heading, with this ball still on the table
    if (oppGroup && tier.wLeave) s.value -= tier.wLeave * (1 - s.p) * replyCost(tier, balls, oppGroup) * oppBest(s.leave && !s.leave.scratch ? s.leave : cue, balls, oppGroup);
  }
  // 9-ball: the 9 early against the best route (nineValue)
  const ref = nine(group) ? shots.filter((s) => s.ball !== 9).reduce<Planned | null>((a, s) => (!a || s.value > a.value ? s : a), null) : null;
  if (ref) { const odds = shotOdds(tier, ref, balls.length); for (const s of shots) if (s.ball === 9) s.value = nineValue(s.value, s.p, ref.value, odds); }
  return shots.sort((a, b) => b.value - a.value);
}

// Open table (8-ball before groups are set): plan both groups, take the one whose best line is worth more.
// shortcut: compares this visit only; add a penalty for balls with no pocket when the engine build can see them.
export const SOLIDS = [1, 2, 3, 4, 5, 6, 7], STRIPES = [9, 10, 11, 12, 13, 14, 15];
export function chooseGroup(cue: Pt, balls: Obj[], tier: Tier) {
  const v = (g: number[], o: number[]) => { const r = plan(cue, balls, g, tier, tier.depth, 4, o); return r.length ? r[0].value : -Infinity; };
  return v(SOLIDS, STRIPES) >= v(STRIPES, SOLIDS) ? SOLIDS : STRIPES;
}

// Defensive shot: clip a legal ball and leave the opponent the worst best shot. hope = no search, just hit something.
export function safety(cue: Pt, balls: Obj[], group: number[], oppGroup: number[], tier: Tier, rnd: () => number, hope: boolean): Safety | null {
  const rad = Math.PI / 180, opts: Safety[] = [];
  for (const B of balls.filter((b) => legalFor(balls, group).includes(b.id))) {
    const base = Math.atan2(B.y - cue.y, B.x - cue.x);
    for (const a of hope ? [0] : tier.safetyAngles) {
      const u = { x: Math.cos(base + a * rad), y: Math.sin(base + a * rad) };
      const G = { x: B.x - 2 * R * u.x, y: B.y - 2 * R * u.y };
      if (!clear(cue, G, balls, [B.id])) continue;
      const v = norm(sub(G, cue)), c = dot(v, u);
      for (const lv of leaves(G, v, u, balls, [B.id])) {
        const obj = roll(B, u, lv.power * c, balls, [B.id]);
        if (lv.scratch || obj.scratch || dist(lv, obj) < 2 * R) continue;
        if (lv.path.length < 3 && obj.path.length < 3) continue; // legal hit: a ball must reach a cushion after contact
        const table = balls.map((b) => (b.id === B.id ? { ...b, x: obj.x, y: obj.y } : b));
        const replies = enumerate(lv, table, legalFor(table, oppGroup), potFor(table, oppGroup), false);
        opts.push({ type: 'safety', ball: B.id, aim: Math.atan2(v.y, v.x), paths: [[cue, G], obj.path], leave: lv, G, v, u,
          oppBest: Math.max(0, ...replies.map((s) => potProb(s, SIGMA_REF))), hooked: !replies.some((s) => s.type === 'direct') });
      }
    }
  }
  if (!opts.length) return null;
  return hope ? opts[Math.floor(rnd() * opts.length)] : opts.reduce((a, b) => (b.oppBest < a.oppBest ? b : a));
}

// A hooked tier with tricks escapes, full on a legal ball: a kick off 1 to 3 cushions or a jump, the fewest cushions
// first (a jump between one and two), then the shortest. G = the cue ball's centre at contact; aim.ts refines it like a
// safety, so the engine finds the real line. null = none found: it fouls as any tier would.
export function escape(cue: Pt, balls: Obj[], group: number[]): Safety | null {
  let best: Safety | null = null, cost = Infinity;
  for (const B of balls.filter((b) => legalFor(balls, group).includes(b.id))) for (let n = 0; n <= 3; n++) for (const q of SEQS[n]) {
    const v = norm(sub(B, image(cue, q))), G = { x: B.x - 2 * R * v.x, y: B.y - 2 * R * v.y }, path = n ? unfold(cue, G, q) : [cue, G];
    if (!path) continue;
    const jump = !n && jumpable(cue, G, balls, [B.id]), c = (jump ? 1500 : 1000 * n) + span(path);
    if (!n && !jump || c >= cost || (!jump && !lanes(path, balls, [], B.id))) continue;
    const d = norm(sub(path[1], cue)), leave = { spin: 0, power: 700, x: G.x, y: G.y, path: [G], travelled: 0, scratch: false };
    best = { type: 'safety', ball: B.id, aim: Math.atan2(d.y, d.x), paths: [path], leave, oppBest: 1, hooked: false, G, v, u: v, ...(n ? { rails: n } : { elev: JUMP }) };
    cost = c;
  }
  return best;
}

// One turn: plan the run, fall back to a safety when no pot is good enough. Returns { ranked, pick }.
// pick is a pot (with .leave and .next), a safety, or { type: 'foul' } when no ball can be reached.
// safetiesInRow = visits in a row this side has ended with a safety. After two, it must take its best pot, so a rack cannot stall.
// The caller also passes 2 once this side has played four safeties in the rack (critique/probe5.js F).
export function decide(cue: Pt, balls: Obj[], group: number[], oppGroup: number[], tier: Tier, rnd: () => number, safetiesInRow = 0, ok?: (c: Cand) => boolean): { ranked: Planned[]; pick: Pick } {
  // planShare: the share of turns on which the tier plans at all (Hustler). Trust (wPos) barely moves run length, this does.
  const ranked = plan(cue, balls, group, tier, tier.planShare === undefined || rnd() < tier.planShare ? tier.depth : 0, 4, oppGroup, true, ok);
  // weigh the best pot against the best safety on the same scale; skip the search when a good pot is on
  if (!ranked.length || (tier.safetyAngles.length && ranked[0].value < (tier.safeAt ?? 0.3) && safetiesInRow < 2)) {
    // shortcut: a fully hooked AI fouls here but a tier with tricks, which escapes; a hooked Legend could kick too
    const s = safety(cue, balls, group, oppGroup, tier, rnd, !tier.safetyAngles.length);
    if (!ranked.length) return { ranked, pick: s || (tier.tricks && escape(cue, balls, group)) || { type: 'foul' } };
    const sv = s && tier.wLeave * ((tier.rack && s.hooked ? HOOK * (tier.hook ?? 1) : 0) - replyCost(tier, balls, oppGroup) * s.oppBest);
    if (s && sv! > ranked[0].value) return { ranked, pick: s };
  }
  const w = ranked.map((s) => Math.exp((s.value - ranked[0].value) / tier.temp));
  let r = rnd() * w.reduce((a, b) => a + b, 0), i = 0;
  while ((r -= w[i]) > 0) i++;
  const pick = ranked[i];
  if (!pick.leave) { // unplanned: the cue ball goes wherever the hit sends it
    const all = leaves(pick.G, pick.v, pick.u, balls, [pick.first, pick.ball]), ok = all.filter((l) => !l.scratch);
    const pool = tier.ctrl && ok.length ? ok : all;
    pick.leave = pool[Math.floor(rnd() * pool.length)];
  }
  return { ranked, pick };
}

export function rng(seed: number) { // mulberry32
  return () => { let t = (seed += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Random legal layout: ids 1-7 solids, 8, 9-15 stripes. `per` balls left in each group.
export function randomLayout(rnd: () => number, per = 5) {
  const ids = [...Array(per).keys()].map((i) => i + 1).concat([8], [...Array(per).keys()].map((i) => i + 9));
  const balls: Obj[] = [];
  const place = (id: number) => {
    for (;;) {
      const p = { id, x: 2 * R + rnd() * (W - 4 * R), y: 2 * R + rnd() * (H - 4 * R) };
      if (balls.every((b) => dist(b, p) > 2 * R + 2)) return balls.push(p);
    }
  };
  ids.forEach(place); place(0);
  const cue = balls.pop()!;
  return { cue, balls };
}
