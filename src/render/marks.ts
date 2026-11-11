// What the rules ask the player to see on the table: the cue ball in hand and where it may go, and the called pocket.
// Drawn under the balls. The app and scripts/ball-frames.mjs both use it.
import type { Skia, SkCanvas } from '@shopify/react-native-skia';
import { HOLES, P } from '../physics/engine.ts';
import { C } from '../theme.ts';
import { toScreen, type View } from './table.ts';

// hand = the cue ball at (x, y) may be dragged ('kitchen' = only above the head string); call = the called pocket,
// -1 none; ask = a pocket must be called before the shot; ms = a clock for the pulse; zone = a lesson's ring [x, y, r]
// in metres, where the cue ball must stop.
export interface Marks { hand: false | 'any' | 'kitchen'; x: number; y: number; call: number; ask: boolean; ms: number; zone?: number[] | null }
export function drawMarks(api: typeof Skia, canvas: SkCanvas, v: View, m: Marks) {
  const r = P.R * v.s, p = api.Paint(); p.setAntiAlias(true);
  const ring = (x: number, y: number, rad: number, hex: string, a: number, w: number) => { p.setStyle(1); p.setColor(api.Color(hex)); p.setAlphaf(a); p.setStrokeWidth(w); canvas.drawCircle(x, y, rad, p); }; // 1 = PaintStyle.Stroke
  if (m.zone) { const c = toScreen(v, m.zone[0], m.zone[1]); p.setStyle(0); p.setColor(api.Color(C.chalk)); p.setAlphaf(0.1); canvas.drawCircle(c.x, c.y, m.zone[2] * v.s, p); ring(c.x, c.y, m.zone[2] * v.s, C.chalk, 0.8, 2); }
  if (m.hand === 'kitchen') { // the cue ball may only go above the head string: light that part of the cloth and the line
    const a = toScreen(v, 0, 0), b = toScreen(v, P.L / 4, P.W), h = toScreen(v, P.L / 4, 0);
    p.setStyle(0); p.setColor(api.Color(C.chalk)); p.setAlphaf(0.08);
    canvas.drawRect(api.XYWHRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)), p);
    p.setStyle(1); p.setAlphaf(0.7); p.setStrokeWidth(Math.max(1, 0.12 * r)); canvas.drawLine(h.x, h.y, b.x, b.y, p);
  }
  if (m.hand) { // a steady ring says "this ball moves"; a second ring grows out of it and fades, unless motion is reduced
    const c = toScreen(v, m.x, m.y), t = (m.ms % 1400) / 1400, e = 1 - (1 - t) ** 3;
    ring(c.x, c.y, 1.7 * r, C.accent, 0.95, Math.max(1.5, 0.22 * r));
    if (!v.calm) ring(c.x, c.y, (1.7 + 1.6 * e) * r, C.accent, 0.7 * (1 - t), Math.max(1, 0.16 * r));
  }
  HOLES.forEach(([x, y, rad], k) => { // every pocket asks for a call; the called one answers in the accent colour
    if (k !== m.call && !m.ask) return;
    const c = toScreen(v, x, y);
    if (k === m.call) ring(c.x, c.y, rad * v.s + 3, C.accent, 1, 3); else ring(c.x, c.y, rad * v.s + 2, C.chalk, 0.55, 1.5);
  });
}
