// What the rules ask the player to see on the table: the cue ball in hand and where it may go, and the called pocket.
// Drawn under the balls. The app and scripts/ball-frames.mjs both use it.
import type { Skia, SkCanvas } from '@shopify/react-native-skia';
import { HOLES, P } from '../physics/engine.ts';
import { C } from '../theme.ts';
import { toScreen, type View } from './table.ts';

// hand = the cue ball at (x, y) may be dragged ('kitchen' = only above the head string); call = the called pocket,
// -1 none; ask = a pocket must be called before the shot; ms = a clock for the pulse; at = when on that clock the
// player called the pocket (none = long ago); zone = a lesson's ring [x, y, r] in metres, where the cue ball must stop.
export interface Marks { hand: false | 'any' | 'kitchen'; x: number; y: number; call: number; ask: boolean; ms: number; at?: number; zone?: number[] | null }
export const SETTLE = 240; // ms the called pocket takes to close its ring: the frame loop redraws the marks that long
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
  // The pockets, all inside the black of the hole. A call is asked: three chalk arcs turn slowly in every pocket. The
  // called (or a lesson's marked) pocket: the arcs close into a red ring, lit from behind, over SETTLE ms from m.at; at
  // rest it is a still picture. The other pockets stop and fall back while one is called.
  if (m.call < 0 && !m.ask) return;
  const e = v.calm ? 1 : 1 - (1 - Math.min(1, Math.max(0, (m.ms - (m.at ?? 0)) / SETTLE))) ** 4; // a strong ease-out
  const turn = v.calm ? 0 : (m.call < 0 ? m.ms : m.at ?? 0) * 0.03; // degrees: a third of a turn in 4 s, held where the call stopped it
  p.setStyle(1); p.setStrokeCap(1); // 1 = StrokeCap.Round
  HOLES.forEach(([x, y, rad], k) => {
    if (k !== m.call && !m.ask) return;
    const c = toScreen(v, x, y), R = rad * v.s, pick = k === m.call, r = (pick ? 0.86 - 0.22 * e : 0.64) * R, box = api.XYWHRect(c.x - r, c.y - r, 2 * r, 2 * r);
    if (pick) { // the light: a tight halo on the ring, gone well inside it and before the rim, so the hole keeps its black centre and edge
      const g = api.Paint(); g.setAntiAlias(true); g.setAlphaf(e);
      g.setShader(api.Shader.MakeRadialGradient(c, R, [C.call + '00', C.call + '80', C.call + '00'].map(h => api.Color(h)), [0.4, 0.64, 0.9], 0)); canvas.drawCircle(c.x, c.y, R, g); // 0 = TileMode.Clamp
    }
    p.setColor(api.Color(pick ? C.call : C.chalk)); p.setAlphaf(pick ? 1 : m.call < 0 ? 0.8 : 0.8 - 0.4 * e); p.setStrokeWidth((pick ? 0.24 : 0.17) * R); // the others fall back to 40%: 3.5:1 on the hole
    if (pick && e >= 1) canvas.drawCircle(c.x, c.y, r, p);
    else for (let i = 0; i < 3; i++) canvas.drawArc(box, turn + 120 * i + (pick ? 90 * e : 0), pick ? 76 + 44 * e : 76, false, p);
  });
}
