// The cushions a bank table asks the ball to bank off (litCushions in src/learn/lessons.ts): a still chalk glow on each
// nose, drawn with the marks under the balls. The app and scripts/ball-frames.mjs both use it.
import type { Skia, SkCanvas } from '@shopify/react-native-skia';
import { POCKET } from '../physics/engine.ts';
import { nose } from '../learn/lessons.ts';
import { toScreen, type View } from './table.ts';

// lit = the cushions to light, by number round the table, or null for none.
export function drawBank(api: typeof Skia, canvas: SkCanvas, v: View, lit: number[] | null) {
  if (!lit) return;
  const w = 0.6 * POCKET.deep, p = api.Paint(); p.setAntiAlias(true); p.setStyle(1); // 1 = PaintStyle.Stroke
  for (const k of lit) {
    const [a, b, c, d] = nose(k), l = Math.hypot(c - a, d - b), nx = (d - b) / l * w / 2, ny = (a - c) / l * w / 2; // half the glow's width, out from the cloth into the cushion
    const s = toScreen(v, a, b), e = toScreen(v, c, d), s2 = toScreen(v, a + nx, b + ny), e2 = toScreen(v, c + nx, d + ny);
    p.setStrokeCap(0); p.setColor(api.Color('rgba(238,242,234,0.2)')); p.setStrokeWidth(w * v.s); canvas.drawLine(s2.x, s2.y, e2.x, e2.y, p); // the glow over the cushion
    p.setStrokeCap(1); p.setColor(api.Color('rgba(238,242,234,0.85)')); p.setStrokeWidth(Math.max(1.5, 0.003 * v.s)); canvas.drawLine(s.x, s.y, e.x, e.y, p); // chalk on the nose
  }
}
