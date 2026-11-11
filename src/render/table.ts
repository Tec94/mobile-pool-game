// The table and where it sits on the screen. The app and scripts/ball-frames.mjs both draw it with drawTable.
import type { Skia, SkCanvas } from '@shopify/react-native-skia';
import { HOLES, P, SEGS } from '../physics/engine.ts';
import { C } from '../theme.ts';

export const RAIL = 0.14; // m from the cushion nose to the outside of the frame; the WPA pockets sit up to 0.125 m into it

// Table metres -> screen. s = screen units per metre, (ox, oy) = the screen point of the playing field's top-left corner.
export interface View { land: boolean; s: number; ox: number; oy: number; dpr?: number; calm?: boolean } // calm = reduced motion

// The largest table that fits a w x h window with 60 units kept free under it. Portrait stands the table up with the
// head string at the bottom.
export function fit(w: number, h: number): View {
  const land = w > h, tw = (land ? P.L : P.W) + 2 * RAIL, th = (land ? P.W : P.L) + 2 * RAIL;
  const s = Math.min(w / tw, (h - 60) / th);
  return { land, s, ox: RAIL * s, oy: RAIL * s };
}
export const toScreen = (v: View, x: number, y: number) => (v.land ? { x: v.ox + x * v.s, y: v.oy + (P.W - y) * v.s } : { x: v.ox + (P.W - y) * v.s, y: v.oy + (P.L - x) * v.s });
export const toTable = (v: View, px: number, py: number) => (v.land ? { x: (px - v.ox) / v.s, y: P.W - (py - v.oy) / v.s } : { x: P.L - (py - v.oy) / v.s, y: P.W - (px - v.ox) / v.s });

// Drawn in table metres under one transform, so landscape and portrait share every line below.
export function drawTable(api: typeof Skia, canvas: SkCanvas, v: View) {
  const { L, W } = P, u = 1 / v.s; // u = one screen unit in metres
  const paint = (hex: string, a = 1, w = 0) => { const p = api.Paint(); p.setAntiAlias(true); p.setColor(api.Color(hex)); p.setAlphaf(a); if (w) { p.setStyle(1); p.setStrokeWidth(w); } return p; }; // 1 = PaintStyle.Stroke
  const box = (m: number, hex: string) => canvas.drawRect(api.XYWHRect(-m, -m, L + 2 * m, W + 2 * m), paint(hex));
  canvas.save();
  canvas.concat(v.land ? [v.s, 0, v.ox, 0, -v.s, v.oy + W * v.s, 0, 0, 1] : [0, -v.s, v.ox + W * v.s, -v.s, 0, v.oy + L * v.s, 0, 0, 1]);
  box(RAIL, C.frame); box(0.05, C.cushion); box(0, C.felt);
  for (const [x, y, r] of HOLES) canvas.drawCircle(x, y, r, paint(C.pocket));
  const nose = paint(C.chalk, 0.5, u);
  for (const [x1, y1, x2, y2] of SEGS) canvas.drawLine(x1, y1, x2, y2, nose);
  canvas.restore();
}
