// The tip and cue angle control: where the tip meets the cue ball (spin) and how far the cue is raised (jump, masse).
// The ring around the cue ball sets the elevation, and a side picture shows the cue tilt. The app and
// scripts/ball-frames.mjs both draw it with the functions below.
import type { Skia, SkCanvas } from '@shopify/react-native-skia';
import { CUE } from '../physics/engine.ts';
import { BALLS, C } from '../theme.ts';

// x, y = tip offset as a part of the miscue limit (right and up are positive); elev = cue elevation in whole degrees.
export interface Tip { x: number; y: number; elev: number }
export const LEVEL: Tip = { x: 0, y: 0, elev: 0 };
export const MAX_ELEV = 80, NOTCHES = [15, 44, 60];
export const SIDE = { w: 104, h: 84 }; // size of the side picture

export const shotTip = (t: Tip, cue = CUE) => ({ a: t.x * cue.tipLimit, b: t.y * cue.tipLimit, elev: t.elev * Math.PI / 180 });
export const zone = (e: number) => (e >= 60 ? 'Massé' : e >= 44 ? 'Hop fades' : e >= 15 ? 'Jump' : 'Level');
export const zoneLabel = (t: Tip) => { const z = zone(t.elev); return z === 'Level' ? 'Level cue' : z === 'Jump' ? 'Jump zone' : z === 'Massé' ? (t.x ? 'Massé zone' : 'Massé: move the dot to one side') : z; };
export function spinLabel(t: Tip) {
  const m = Math.hypot(t.x, t.y); if (m < 0.01) return 'Center ball. No spin';
  const v = t.y > 0.15 ? 'top, follows through' : t.y < -0.15 ? 'bottom, draws back' : '', h = t.x > 0.15 ? 'right side' : t.x < -0.15 ? 'left side' : '';
  const s = [v, h].filter(Boolean).join(' with ') || 'slight spin';
  return `${s[0].toUpperCase() + s.slice(1)} · ${Math.round(m * 100)}%`;
}

// Each change gives the new tip and `bump`: true at the moments the hand must feel (the miscue ring, the catch at
// centre ball, a zone edge).
export function moveSpin(t: Tip, x: number, y: number) {
  const m = Math.hypot(x, y), was = t.x !== 0 || t.y !== 0, atLimit = Math.hypot(t.x, t.y) > 0.999; let bump = false;
  if (m > 1) { x /= m; y /= m; bump = !atLimit; }
  if (m < 0.12) { x = y = 0; bump = was; }
  return { tip: { ...t, x, y }, bump };
}
export function tapSpin(t: Tip, x: number, y: number) {
  for (const [mx, my] of [[0.7, 0], [-0.7, 0], [0, 0.7], [0, -0.7]]) if (Math.hypot(x - mx, y - my) < 0.18) { x = mx; y = my; }
  return moveSpin(t, x, y);
}
export function moveElev(t: Tip, e: number) {
  const elev = Math.round(Math.min(MAX_ELEV, Math.max(0, e)));
  return { tip: { ...t, elev }, bump: NOTCHES.some(n => (t.elev < n) !== (elev < n)) };
}

// Geometry of the control in a square of side D. The numbers are the approved prototype's, on its 214 unit grid:
// ring radius 92 (94 there, which clipped the bead), the ball inside 70% of the square, the dot travels 73% of the ball's radius (the miscue limit).
const U = 214, RING = 92, PAD = 0.35, REACH = 0.73, ang = (deg: number) => 180 + deg * 1.5; // 0 degrees at 9 o'clock, clockwise
export const padReach = (D: number) => PAD * D * REACH; // screen units of dot travel from centre to the miscue ring
// [degrees of elevation under the point, distance from the centre on the 214 grid]
export function ringAt(px: number, py: number, D: number) {
  const x = px / D * U - U / 2, y = py / D * U - U / 2; let a = Math.atan2(y, x) * 180 / Math.PI; if (a < 90) a += 360;
  return [(a - 180) / 1.5, Math.hypot(x, y)];
}
// Elevation change between two ringAt readings, by the short way round: a finger that crosses the cut at 6 o'clock
// (a full turn is 240 on this scale) does not throw the cue from level to full masse.
export const ringTurn = (from: number, to: number) => ((to - from + 360) % 240) - 120;
export function grab(px: number, py: number, D: number): 'ring' | 'pad' | null {
  const [deg, d] = ringAt(px, py, D);
  return d < PAD * U ? 'pad' : d >= 78 && deg >= -12 && deg <= 92 ? 'ring' : null;
}

const fill = (api: typeof Skia, hex: string, a = 1) => { const p = api.Paint(); p.setAntiAlias(true); p.setColor(api.Color(hex)); p.setAlphaf(a); return p; };
const line = (api: typeof Skia, hex: string, w: number, a = 1) => { const p = fill(api, hex, a); p.setStyle(1); p.setStrokeWidth(w); p.setStrokeCap(1); return p; }; // stroke, round cap
// The cue ball with the tip dot on it, radius r at (cx, cy). The same picture is the spin button in the control bar.
export function drawTipBall(api: typeof Skia, canvas: SkCanvas, cx: number, cy: number, r: number, t: Tip, marks = false) {
  const ball = api.Paint(); ball.setAntiAlias(true);
  ball.setShader(api.Shader.MakeRadialGradient({ x: cx - 0.3 * r, y: cy - 0.4 * r }, 1.5 * r, [api.Color(C.white), api.Color('#BFC4BC')], [0, 1], 0)); // 0 = TileMode.Clamp
  canvas.drawCircle(cx, cy, r, ball);
  if (marks) { // the miscue ring and the four 70% marks
    canvas.drawCircle(cx, cy, REACH * r + 0.1 * r, line(api, C.ink, 1, 0.3));
    for (const [mx, my] of [[0.7, 0], [-0.7, 0], [0, 0.7], [0, -0.7]]) canvas.drawCircle(cx + mx * REACH * r, cy - my * REACH * r, 3, fill(api, C.ink, 0.3));
  }
  canvas.drawCircle(cx + t.x * REACH * r, cy - t.y * REACH * r, marks ? 11 : Math.max(4, 0.21 * r), fill(api, BALLS[2]));
}
// The whole control in a square of side D: the elevation ring in four zones with the bead, and the cue ball inside.
export function drawTip(api: typeof Skia, canvas: SkCanvas, D: number, t: Tip) {
  const k = D / U, c = D / 2, r = RING * k, oval = api.XYWHRect(c - r, c - r, 2 * r, 2 * r), a = ang(t.elev) * Math.PI / 180;
  // Zones are told apart by the gaps; the one in use is bright.
  [0, ...NOTCHES].forEach((from, i) => { const to = NOTCHES[i] ?? MAX_ELEV, on = t.elev >= from && (t.elev < to || to === MAX_ELEV);
    canvas.drawArc(oval, ang(from + 0.6), (to - from - 1.2) * 1.5, false, line(api, C.chalk, 9 * k, on ? 1 : 0.22)); });
  drawTipBall(api, canvas, c, c, PAD * D, t, true);
  const bx = c + r * Math.cos(a), by = c + r * Math.sin(a);
  canvas.drawCircle(bx, by, 12 * k, fill(api, C.ink)); canvas.drawCircle(bx, by, 12 * k, line(api, C.chalk, 4 * k));
}
// Side view: the cue ball on the cloth and the cue at its real tilt.
export function drawSide(api: typeof Skia, canvas: SkCanvas, elev: number, felt: string) {
  const e = elev * Math.PI / 180, ux = -Math.cos(e), uy = -Math.sin(e), px = 72 + ux * 13, py = 58 + uy * 13;
  canvas.drawRect(api.XYWHRect(0, 70, SIDE.w, 14), fill(api, felt));
  canvas.drawOval(api.XYWHRect(63, 67.5, 22, 5), fill(api, C.shade, 0.5));
  canvas.drawCircle(72, 58, 12, fill(api, C.white));
  canvas.drawLine(px, py, px + ux * 62, py + uy * 62, line(api, C.frame, 5));
  canvas.drawLine(px, py, px + ux * 4, py + uy * 4, line(api, C.accent, 5)); // the chalked tip
}
