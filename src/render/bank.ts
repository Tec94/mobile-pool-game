// The cushions a bank table or a bank shots match asks the ball to bank off (litCushions in src/learn/lessons.ts, State.lit): a still chalk glow over the
// whole cushion and a chalk line on its nose, drawn with the marks under the balls. The app and scripts/ball-frames.mjs both use it.
import type { Skia, SkCanvas } from '@shopify/react-native-skia';
import { nose } from '../rules/rules.ts';
import { cushions, toScreen, type View } from './table.ts';

// lit = the cushions to light, by number round the table, or null for none.
export function drawBank(api: typeof Skia, canvas: SkCanvas, v: View, lit: number[] | null) {
  if (!lit) return;
  const p = api.Paint(), all = cushions(); p.setAntiAlias(true);
  for (const k of lit) {
    const [a, b, c, d] = nose(k), s = toScreen(v, a, b), e = toScreen(v, c, d);
    p.setStyle(0); p.setColor(api.Color('rgba(238,242,234,0.16)')); canvas.drawPath(api.Path.Polygon(all[k].map(([x, y]) => toScreen(v, x, y)), true), p); // the glow: the cushion itself, 0 = PaintStyle.Fill
    p.setStyle(1); p.setStrokeCap(1); p.setColor(api.Color('rgba(238,242,234,0.85)')); p.setStrokeWidth(Math.max(1.5, 0.003 * v.s)); canvas.drawLine(s.x, s.y, e.x, e.y, p); // chalk on the nose
  }
}
