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
export type ShotType = 'direct' | 'bank' | 'kick' | 'combo' | 'carom' | 'billiard';
// A way to pot. G = cue-ball position at contact, v = its direction there, u = where the first ball leaves, first = that
// ball's id, via = a combo's first ball or a carom's helper ball, tol = the striker's angular tolerance (radians), paths = polylines for drawing.
export interface Cand { type: ShotType; ball: number; pocket: number; aim: number; tol: number; cut: number; paths: Pt[][]; G: Pt; v: Pt; u: Pt; first: number; via?: number }
export interface Leave extends Pt { spin: number; power: number; path: Pt[]; travelled: number; scratch: boolean }
export interface Planned extends Cand { p: number; score: number; value: number; leave?: Leave; next?: Planned }
// G, v and u are kept on a safety (the prototype dropped them) so the engine glue maps it like a pot.
export interface Safety { type: 'safety'; ball: number; aim: number; paths: Pt[][]; leave: Leave; oppBest: number; hooked: boolean; G: Pt; v: Pt; u: Pt }
export type Pick = Planned | Safety | { type: 'foul' };
export interface Tier { name: string; sigma: number; types: ShotType[]; flair: number; temp: number; depth: number; planShare?: number; wPos: number; posErr: number; speedErr: number; tipErr: number; ctrl: number; wLeave: number; rack?: boolean; safetyAngles: number[]; budget: number; tries?: number; caromGap: number }
interface Pocket extends Pt { ax: [number, number]; m: number; c: number; back: number }
interface Rail { k: 'x' | 'y'; v: number }

// Margin kept after one cushion, measured on the engine (critique/probe5.js C, H). The window itself is 0.91 (bank) and 1.05 (kick)
// of the mirror geometry, but the rebound angle moves with speed, so under a tier's own speed error 0.76 to 0.87 is what it pots at.
export const RAIL_FACTOR = 0.8;
// Aim error a cushion adds on top of the striker's, measured on the engine (scripts/ai-visit.mjs, Shark and Legend both
// fit 0.3 degrees): with RAIL_FACTOR alone, banks and kicks potted 0.6 to 0.7 of the chance the planner gave them.
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
// Every way to send ball B into pocket pk: straight, or off one cushion (bank).
function routes(B: Obj, pk: Pocket, balls: Obj[]) {
  const out: { u: Pt; objTol: number; path: Pt[]; bank: boolean }[] = [];
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
  return out;
}

// All candidate pots for the cue ball against `legal` object balls. Each has an aim angle and a tolerance.
// legalIds = balls the cue ball may hit first. potIds = balls that may be potted (9-ball: any ball, through the lowest).
export function enumerate(cue: Pt, balls: Obj[], legalIds: number[], potIds = legalIds, kisses = true) {
  const shots: Cand[] = [], legal = balls.filter((b) => legalIds.includes(b.id)), targets = balls.filter((b) => potIds.includes(b.id));
  const add = (type: ShotType, ball: number, pocket: number, st: Strike, aimDir: Pt, paths: Pt[][], u: Pt, first: number, extra = {}) =>
    shots.push({ type, ball, pocket, aim: Math.atan2(aimDir.y, aimDir.x), tol: st.tol, cut: st.cut, paths, G: st.G, v: st.v, u, first, ...extra });
  for (const B of targets) POCKETS.forEach((pk, pi) => {
    for (const r of routes(B, pk, balls)) {
      const st = legalIds.includes(B.id) && strike(cue, B, r.u, r.objTol);
      if (st && clear(cue, st.G, balls, [B.id]))
        add(r.bank ? 'bank' : 'direct', B.id, pi, st, st.v, [[cue, st.G], r.path], r.u, B.id);
      if (r.bank) continue; // kick-banks are left out on purpose
      for (const rail of st ? RAILS : []) { // kick: cue ball off one cushion first
        const kst = strike(mirror(cue, rail), B, r.u, r.objTol);
        if (!kst) continue;
        const X = railHit(cue, mirror(kst.G, rail), rail);
        if (!X || !clear(cue, X, balls, []) || !clear(X, kst.G, balls, [B.id])) continue;
        add('kick', B.id, pi, { ...kst, tol: kst.tol * RAIL_FACTOR }, norm(sub(X, cue)), [[cue, X, kst.G], r.path], r.u, B.id);
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
// (sigma) moves it most, Legend at 0.15 degrees runs 4.8 balls against 4.1 at 0.19. Shark's budget of 12 (not 17) and
// Pro's wLeave of 0.6 (not 0.9: fewer safeties) set Shark, Pro and Legend apart: at 300 tables 2.76, 3.66, 4.04 balls in
// 8-ball and 0.83, 1.05, 1.40 in 9-ball, against 2.88, 3.47, 4.04 and 0.88, 0.86, 1.40. tries 2, 3 or 4 changed nothing.
export const TIERS: Tier[] = [
  { name: 'Rookie',  sigma: 0.71, types: ['direct'],                          flair: 0,    temp: 0.25, depth: 0, wPos: 0,   posErr: 0.20, speedErr: 15, tipErr: 0.1, ctrl: 0, wLeave: 0, safetyAngles: [], budget: 1, caromGap: 0 },
  { name: 'Regular', sigma: 0.42, types: ['direct', 'bank'],                  flair: 0.03, temp: 0.08, depth: 0, wPos: 0,   posErr: 0.16, speedErr: 12, tipErr: 0.08, ctrl: 1, wLeave: 0, safetyAngles: [], budget: 2, caromGap: 0 },
  { name: 'Hustler', sigma: 0.35, types: ['direct', 'bank', 'combo', 'carom'], flair: 0.05, temp: 0.08, depth: 1, planShare: 0.5, wPos: 0.5, posErr: 0.11, speedErr: 8, tipErr: 0.06, ctrl: 1, wLeave: 0.3, safetyAngles: [0], budget: 9, caromGap: 60 },
  { name: 'Shark',   sigma: 0.30, types: ['direct', 'bank', 'combo', 'kick', 'carom', 'billiard'], flair: 0.05, temp: 0.04, depth: 1, tries: 2, wPos: 0.8, posErr: 0.10, speedErr: 7, tipErr: 0.055, ctrl: 1, wLeave: 0.6, rack: true, safetyAngles: [-30, 0, 30], budget: 12, caromGap: 10000 },
  { name: 'Pro',     sigma: 0.24, types: ['direct', 'bank', 'combo', 'kick', 'carom', 'billiard'], flair: 0.04, temp: 0.02, depth: 1, tries: 3, wPos: 0.9, posErr: 0.08, speedErr: 5, tipErr: 0.04, ctrl: 1, wLeave: 0.6, rack: true, safetyAngles: [-60, -40, -20, 0, 20, 40, 60], budget: 24, caromGap: 10000 },
  { name: 'Legend',  sigma: 0.19, types: ['direct', 'bank', 'combo', 'kick', 'carom', 'billiard'], flair: 0.03, temp: 0.01, depth: 1, tries: 3, wPos: 1,   posErr: 0.07, speedErr: 3.5, tipErr: 0.03, ctrl: 1, wLeave: 1, rack: true, safetyAngles: [-60, -40, -20, 0, 20, 40, 60], budget: 33, caromGap: 10000 },
];
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

// Run-out planner. value ~ expected balls potted from here: P(make) x (1 + trust x value of the position left).
// Searches the `width` best pots, every cue-ball leave of each, and recurses `depth` shots ahead.
// Rack sense (Shark and up): handing over the table costs a reply plus the rack times the opponent's chance to run out,
// so a miss gets dearer and a safety more attractive as the rack runs down. need = balls a side still has to pot.
const R_REF = 0.75, RACK = 4, HOOK = 0.2; // reference player's pot rate per further ball; value of the rack in balls; credit for a hook
const REPLY = 2, WIN = 3; // a reply is worth about 2 balls to the opponent; potting the 8 is worth 3
const need = (balls: Obj[], group: number[]) => (nine(group) ? balls.length : balls.filter((b) => group.includes(b.id)).length + 1);
const replyCost = (tier: Tier, balls: Obj[], oppGroup: number[]) => REPLY + (tier.rack ? RACK * Math.pow(R_REF, need(balls, oppGroup) - 1) : 0);
const oppBest = (cue: Pt, balls: Obj[], oppGroup: number[]) => Math.max(0, ...enumerate(cue, balls, legalFor(balls, oppGroup), potFor(balls, oppGroup), false).map((s) => potProb(s, SIGMA_REF)));
// The tier plays this shot: its type is in the repertoire, and a carom's helper ball is close enough.
export function plays(tier: Tier, s: Cand, balls: Obj[]) {
  const at = (id?: number) => balls.find((b) => b.id === id)!;
  return tier.types.includes(s.type) && (s.type !== 'carom' || dist(at(s.via), at(s.ball)) - 2 * R <= tier.caromGap);
}
export function plan(cue: Pt, balls: Obj[], group: number[], tier: Tier, depth: number, width: number, oppGroup?: number[], kisses = true): Planned[] {
  const sigma = tier.sigma * Math.PI / 180, win = winBall(group);
  let cands = enumerate(cue, balls, legalFor(balls, group), potFor(balls, group), kisses);
  const inRepertoire = cands.filter((s) => plays(tier, s, balls));
  // outside the repertoire only when nothing else exists, and never a carom or a billiard
  cands = inRepertoire.length ? inRepertoire : cands.filter((s) => s.type !== 'carom' && s.type !== 'billiard');
  const shots: Planned[] = cands.map((s) => {
    const p = potProb(s, sigma);
    return { ...s, p, value: 0, score: p * (s.ball === win ? WIN : 1) * (1 + (s.type === 'direct' || s.type === 'kick' ? 0 : tier.flair)) };
  }).sort((a, b) => b.score - a.score).slice(0, width);
  for (const s of shots) {
    s.value = s.score;
    if (depth && s.type !== 'combo' && s.type !== 'carom' && s.type !== 'billiard') { // these move a second ball, so the table after them is unknown here
      const after = balls.filter((b) => b.id !== s.ball);
      s.value = -Infinity;
      for (const lv of leaves(s.G, s.v, s.u, balls, [s.first, s.ball], oppGroup ? POWERS : [300, 1300])) {
        // the next shot is priced without caroms and billiards: they took half of decide()'s time and are rarely the best
        const sub = lv.scratch ? null : plan({ x: lv.x, y: lv.y }, after, group, tier, depth - 1, Math.max(1, width - 2), undefined, false);
        const value = lv.scratch ? -s.p * (s.ball === win ? WIN : 0.5) : s.score * (1 + tier.wPos * (sub![0] ? sub![0].value : 0));
        if (value > s.value) Object.assign(s, { value, leave: lv, next: sub && sub[0] });
      }
    }
    // price the miss: the opponent shoots from about where the cue ball was heading, with this ball still on the table
    if (oppGroup && tier.wLeave) s.value -= tier.wLeave * (1 - s.p) * replyCost(tier, balls, oppGroup) * oppBest(s.leave && !s.leave.scratch ? s.leave : cue, balls, oppGroup);
  }
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

// One turn: plan the run, fall back to a safety when no pot is good enough. Returns { ranked, pick }.
// pick is a pot (with .leave and .next), a safety, or { type: 'foul' } when no ball can be reached.
// safetiesInRow = visits in a row this side has ended with a safety. After two, it must take its best pot, so a rack cannot stall.
// The caller also passes 2 once this side has played four safeties in the rack (critique/probe5.js F).
export function decide(cue: Pt, balls: Obj[], group: number[], oppGroup: number[], tier: Tier, rnd: () => number, safetiesInRow = 0): { ranked: Planned[]; pick: Pick } {
  // planShare: the share of turns on which the tier plans at all (Hustler). Trust (wPos) barely moves run length, this does.
  const ranked = plan(cue, balls, group, tier, tier.planShare === undefined || rnd() < tier.planShare ? tier.depth : 0, 4, oppGroup);
  // weigh the best pot against the best safety on the same scale; skip the search when a good pot is on
  if (!ranked.length || (tier.safetyAngles.length && ranked[0].value < 0.3 && safetiesInRow < 2)) {
    // shortcut: a fully hooked AI fouls here, add kick safeties when the engine is in
    const s = safety(cue, balls, group, oppGroup, tier, rnd, !tier.safetyAngles.length);
    if (!ranked.length) return { ranked, pick: s || { type: 'foul' } };
    const sv = s && tier.wLeave * ((tier.rack && s.hooked ? HOOK : 0) - replyCost(tier, balls, oppGroup) * s.oppBest);
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
