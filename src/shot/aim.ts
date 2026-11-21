'worklet'; // aimGuide also runs on the worklet runtime (src/shot/far.ts): define a function before its callers
// The shot controls as plain numbers: how a touch turns the aim, how a pull on the rail becomes power, and what the
// guide shows. No drawing and no React here; src/ui/ShotControls.tsx and App.tsx are the shells around it.
// The aim is an angle in radians in the table frame. The screen shows the table mirrored (toScreen flips one axis in
// both orientations), so a clockwise turn on the glass is a smaller angle here.
import { P, POCKET, predict, STRAIGHT } from '../physics/engine.ts';
import type { Ball, Cue, Shot } from '../physics/engine.ts';

const TURN = 2 * Math.PI, DEG = Math.PI / 180, wrap = (a: number) => a - TURN * Math.round(a / TURN);
export const DRAG = 6, TAP_MS = 300; // px of travel before a touch on the table is a drag; a tap is shorter than this
// A drag on the table: the aim turns as the finger turns about the cue ball (`from` and `to` are the finger's angle
// before and after). lever = px from the finger to the cue ball: inside 40 px a small move is a big angle, so it is
// scaled down and the aim never whips.
export const swing = (aim: number, from: number, to: number, lever: number) => aim + wrap(to - from) * Math.min(1, lever / 40);
// A tap points the cue at the tapped point, but a stray tap must not destroy an aim set with the fine dial.
export const tapAim = (aim: number, fine: boolean, to: number) => (fine ? aim : to);
export const SENS = { Slow: 0.5, Normal: 1, Fast: 2 }; // shortcut: always Normal, the settings screen picks one
// The fine dial: px of drag to the right (portrait) or down (landscape). tick = the aim crossed a half degree line.
export function dialTurn(aim: number, px: number, sens = SENS.Normal) {
  const to = aim - px * 0.0012 * sens;
  return { aim: to, tick: Math.floor(to / (0.5 * DEG)) !== Math.floor(aim / (0.5 * DEG)) };
}
export const nudge = (aim: number, side: number) => aim - side * 0.1 * DEG; // a tap on the dial: side 1 = its right or lower half
// The power rail: dy = px the finger is below where it went down, pull = px of pull for full power, from = the power it had.
export const pullPower = (dy: number, pull: number, from = 0) => Math.min(1, Math.max(0, from + dy / pull));
// What the hand feels for a change of power: 1 = a tick at a 10% line, 2 = the heavy one on reaching full power.
export const powerTick = (was: number, now: number) => (Math.floor(now * 10) === Math.floor(was * 10) || now <= 0.05 ? 0 : now >= 1 ? 2 : 1);
// The power to strike with when the finger lifts, 0 = no shot. hist = [ms, power] for each move of the pull. A finger
// that has settled wobbles as it lifts, so the power from 80 ms earlier counts when it is within 0.04; a pull that
// still moves is taken as it is.
export function release(hist: number[][], now: number, power: number) {
  const old = hist.filter(q => now - q[0] >= 80).pop(), p = old && Math.abs(old[1] - power) < 0.04 ? old[1] : power;
  return power > 0.05 && p > 0.05 ? p : 0;
}
// as = the power the pull stands for, when a cue's trick makes it another number (the Ram's Overdrive)
export const railLabel = (power: number, pulling: boolean, as = power) => (power >= 0.05 ? Math.round(as * 100) + '%' : pulling ? 'Cancel' : 'Pull');
export const previewPower = (pull: number) => (pull > 0.05 ? pull : 0.7); // the guide shows the pull, or a firm shot when there is none
// The guide's length past the first contact grows with every Aim point (Jack: no point may do nothing): 10 cm at Aim 1
// to 60 cm at Aim 10, metres. 0 = Off; the line to the first contact is always drawn.
export const guideLen = (aim: number) => (aim <= 0 ? 0 : 0.1 + (Math.min(10, aim) - 1) * 0.5 / 9);
export const LONG = 7; // from this Aim a stub after the contact shows where the cue ball leaves the ghost ball
export const STUB = 4 * 0.028575; // m, 4 ball radii (P.R): the stub is this long at every Aim, power and spin, from a 30 degree cut
const FULL = 0.052; // sine of a 3 degree cut: fuller than this the cue ball stops or runs on through, and the tangent says nothing
// How far a ball runs on bare cloth, m: v = its speed, u = the speed of its contact point on the cloth (u = v for a
// ball struck at its centre, which slides until it rolls at 5/7 of v). It slides, then rolls. The Optic's numbers.
export const rollOut = (v: number, u = v) => (14 * v * u - 2 * u * u) / (49 * P.mus * P.g) + (v - u / 3.5) ** 2 / (2 * P.mur * P.g);
// The point d metres along a path, or null when the path is shorter.
export function pointAt(path: number[][], d: number) {
  for (let i = 1; i < path.length; i++) { const a = path[i - 1], b = path[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d <= l && l > 0) return [a[0] + (b[0] - a[0]) * d / l, a[1] + (b[1] - a[1]) * d / l]; d -= l; }
  return null;
}
// The Banker's Bank sight: BANK = metres of the object ball's line shown off the cushion, and the furthest the cushion
// may be from the ball. A cushion counts when it turns the ball 20 degrees or more (rules.ts potKind) and the ball
// meets it JAW or more along the cushion from a pocket's jaw, so the line can't be swept to find the pocket.
export const BANK = 0.6, JAW = 0.15;
const BEND = 20 * DEG;
const offJaws = (x: number, y: number) => { const { cc, sc } = POCKET, end = Math.min(x, P.L - x) < Math.min(y, P.W - y);
  return end ? y > cc + JAW && y < P.W - cc - JAW : Math.abs(x - P.L / 2) > sc + JAW && x > cc + JAW && x < P.L - cc - JAW; };
// The angle from the cue ball to the nearest object ball, or `keep` when the table has none.
export function nearest(B: Ball[], keep = 0) {
  let best = Infinity, ang = keep;
  B.forEach((b, i) => { const d = Math.hypot(b.x - B[0].x, b.y - B[0].y); if (i && b.on && d < best) { best = d; ang = Math.atan2(b.y - B[0].y, b.x - B[0].x); } });
  return ang;
}
// What drawAim needs for a shot: the cue ball's path, the object ball's path, the ghost ball at the first contact,
// the touchdowns of a jump, `lost` when the cue ball leaves the table before it meets anything, `first` = the index
// in B of the ball the ghost touches (-1 none, or a kick whose ring is on the cushion), and `stub` = [from, to] after
// the contact, or none. dead = the cue ball stops dead at the ghost ball (the Plumb's stick on a straight hit).
// aim = the Aim stat of the cue (lessons pass 10). From LONG the guide shows a stub after the ghost ball: the tangent
// line, the way the cue ball leaves on a stun shot. Jack: the real path after contact (it bends with follow, draw and
// side, and comes off cushions) gives away the skill of reading spin and power. The stub is worked out from the
// contact itself, not from the cue ball's path after it, which spin bends from the first step. No stub after a jump: the
// cue ball meets the ball in the air or still hopping.
// budget = the limit on the work after the first contact (see predict), so one guide stays inside a frame.
// stick = the engine cue that will strike, so the guide squirts as the shot will.
// real = draw the cue ball's real path after the contact in place of the stub (a lesson's watch stage, where the shot
// plays itself next anyway, and the Surveyor's Sketch), at any Aim. scale = the share of the guide length the cue keeps.
// trick = the guide of a cue's trick, in a match against the AI:
//  'daybreak': the object ball's line runs on to the first ball, cushion or pocket it meets, or to where it stops. No
//    stub, and on a kick the guide stops at the first cushion.
//  'banker': on a bank (see BANK) the object ball's line runs to the cushion and BANK off it, or to the next thing it meets.
//  'vernier': on a kick the cue ball's line runs on off 2 cushions to the ball, and stops at a third. No stub.
// roll = how far the first ball hit would run on bare cloth with the speed the hit gives it, m (the Optic's ring).
export function aimGuide(B: Ball[], shot: Shot, aim: number, budget?: number, stick?: Cue, real = false, scale = 1, trick = '') {
  const L = guideLen(aim) * scale, day = trick === 'daybreak', far = !day && (real || aim >= LONG);
  const g = day ? predict(B, shot, Infinity, stick, undefined, budget, false, 1) : trick === 'banker' ? predict(B, shot, 2 * BANK, stick, undefined, budget, false, 2)
    : predict(B, shot, L, stick, undefined, budget, real, undefined, trick === 'vernier' ? 2 : 0), k = g.split < 0 ? g.cue.length : g.split + 1;
  // predict runs until both balls have gone the length, so the faster one overshoots it: cut each path to the length.
  const clip = (p: number[][], len: number) => {
    const out = p.slice(0, 1);
    for (let i = 1; i < p.length && len > 0; i++) { const a = p[i - 1], b = p[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]), t = d > len ? len / d : 1; out.push(a.map((v, j) => v + (b[j] - v) * t)); len -= d; }
    return out;
  };
  // A kick: the cue ball meets a cushion first. Below LONG the line stops there, so the ring goes there too and no
  // object ball path hangs loose beyond it.
  const q = g.cue[k - 1], h = g.hit, kick = g.split >= 0 && !!h && Math.hypot(q[0] - h.x, q[1] - h.y) > 1e-6;
  if (kick && !far) return { path: g.cue.slice(0, k), ob: [], ghost: [q[0], q[1]], lands: g.lands, lost: false, first: -1, stub: [] as number[][], dead: false, roll: 0 };
  const roll = h ? rollOut(g.ov[0], g.ov[1]) : 0, dead = !!stick?.dead && !!h && !h.air && h.cut! <= STRAIGHT;
  if (trick === 'vernier') { // the whole line to the ball, or to the last point worked out (a third cushion, the budget, where it stops)
    const path = h && !kick ? g.cue.slice(0, k) : [...g.cue.slice(0, h ? g.at : g.cue.length), ...(h ? [[h.x, h.y, 0]] : [])];
    return { path, ob: clip(g.ob, L), ghost: h && [h.x, h.y], lands: g.lands, lost: g.scratch && g.split < 0, first: h ? h.b! : -1, stub: [] as number[][], dead, roll };
  }
  const m = g.met[0], to = m ? g.ob.slice(0, m[0] + 1) : g.ob, reach = to.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - to[i][0], p[1] - to[i][1]), 0);
  const bank = trick === 'banker' && !!m && m[1] === 1 && m[2] >= BEND && reach <= BANK && offJaws(to[to.length - 1][0], to[to.length - 1][1]);
  const ob = day ? to : bank ? [...to, ...clip(g.ob.slice(m[0], g.met[1] ? g.met[1][0] + 1 : g.ob.length), BANK).slice(1)] : clip(g.ob, L);
  const after = !far ? [] : clip(g.cue.slice(k - 1), L).slice(1);
  let path = [...g.cue.slice(0, k), ...after], stub: number[][] = [];
  if (h && after.length && !real) {
    const O = B[h.b!], R2 = 0.05715; // 2 P.R: centre to centre at contact
    // A kick from LONG: the line runs on from the cushion to the ghost ball and stops there.
    // shortcut: the line stops where the cue ball first comes within 2 mm of touching the ball, which a near miss before the real hit would fool; keep the index of the hit in predict if that shows.
    const j = after.findIndex(p => Math.hypot(p[0] - O.x, p[1] - O.y) < R2 + 2e-3);
    path = kick ? [...g.cue.slice(0, k), ...after.slice(0, j < 0 ? after.length : j), [h.x, h.y, 0]] : g.cue.slice(0, k);
    // The cue ball comes in along d. The object ball's offset from that line is the same all along it, so the cut
    // (s = its sine) is exact even though the ghost sits up to a step past the true contact. The cue ball leaves
    // square to the line of centres, away from the object ball's side.
    const p = path[path.length - 2], dx = h.x - p[0], dy = h.y - p[1], n = Math.hypot(dx, dy), ux = dx / n, uy = dy / n;
    const s = Math.max(-1, Math.min(1, ((O.y - h.y) * ux - (O.x - h.x) * uy) / R2)), c = Math.sqrt(1 - s * s), sg = s < 0 ? -1 : 1;
    const ex = sg * (s * ux + c * uy), ey = sg * (s * uy - c * ux);
    let t = STUB * Math.min(1, Math.abs(s) / 0.5); // it grows with the cut, whole from a 30 degree cut: no pop as it shows
    if (ex) t = Math.min(t, ((ex > 0 ? P.L - P.R : P.R) - h.x) / ex); // and stops where the cue ball meets a cushion
    if (ey) t = Math.min(t, ((ey > 0 ? P.W - P.R : P.R) - h.y) / ey);
    const ahead = (O.x - h.x) * ux + (O.y - h.y) * uy > 0; // the ball lies ahead of the line: a kick whose line was cut at a near miss gets no stub, not a wrong one
    if (n > 0 && Math.abs(s) > FULL && t > 0 && ahead && !h.air && !g.lands.length) stub = [[h.x, h.y], [h.x + t * ex, h.y + t * ey]];
  }
  return { path, ob, ghost: h && [h.x, h.y], lands: g.lands, lost: g.scratch && g.split < 0, first: h ? h.b! : -1, stub, dead, roll };
}
// The first len metres of a path: the guide the Coil shows with its cue raised.
export function shorten(path: number[][], len: number) {
  const out = path.slice(0, 1);
  for (let i = 1; i < path.length && len > 0; i++) {
    const [ax, ay] = path[i - 1], [bx, by] = path[i], d = Math.hypot(bx - ax, by - ay);
    out.push(d <= len ? path[i] : [ax + (bx - ax) * len / d, ay + (by - ay) * len / d, path[i][2] ?? 0]); len -= d;
  }
  return out;
}
