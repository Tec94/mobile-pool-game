// The table and where it sits on the screen. The app and scripts/ball-frames.mjs both draw it with drawTable.
import type { Skia, SkCanvas } from '@shopify/react-native-skia';
import { HOLES, P, POCKET } from '../physics/engine.ts';
import { C } from '../theme.ts';

export const RAIL = 0.14; // m from the cushion nose to the outside of the frame; the WPA pockets sit up to 0.125 m into it

// Table metres -> screen. s = screen units per metre, (ox, oy) = the screen point of the playing field's top-left corner.
export interface View { land: boolean; s: number; ox: number; oy: number; dpr?: number; calm?: boolean } // calm = reduced motion

export interface Inset { top: number; right: number; bottom: number; left: number }
export const BAR = 64; // screen units kept for the controls: under the table in portrait, beside it in landscape, where a phone has room to spare

// The largest table that fits the window inside the safe area (notch, home indicator) and beside the controls, centred
// in that room. Portrait stands the table up with the head string at the bottom.
export function fit(w: number, h: number, pad: Inset = { top: 0, right: 0, bottom: 0, left: 0 }): View {
  const land = w > h, tw = (land ? P.L : P.W) + 2 * RAIL, th = (land ? P.W : P.L) + 2 * RAIL;
  const aw = w - pad.left - pad.right - (land ? BAR : 0), ah = h - pad.top - pad.bottom - (land ? 0 : BAR), s = Math.min(aw / tw, ah / th);
  return { land, s, ox: pad.left + (aw - tw * s) / 2 + RAIL * s, oy: pad.top + (ah - th * s) / 2 + RAIL * s };
}
export const toScreen = (v: View, x: number, y: number) => (v.land ? { x: v.ox + x * v.s, y: v.oy + (P.W - y) * v.s } : { x: v.ox + (P.W - y) * v.s, y: v.oy + (P.L - x) * v.s });
export const toTable = (v: View, px: number, py: number) => (v.land ? { x: (px - v.ox) / v.s, y: P.W - (py - v.oy) / v.s } : { x: P.L - (py - v.oy) / v.s, y: P.W - (px - v.ox) / v.s });

// Quiet Slate table, drawn in table metres under one transform so landscape and portrait share every line below.
// Line weights and dot sizes are the approved prototype's, scaled to a real table.
export function drawTable(api: typeof Skia, canvas: SkCanvas, v: View) {
  const { L, W } = P, { cc, sc, deep, ca, sa } = POCKET, cj = deep / Math.tan(ca), sj = deep * Math.tan(sa);
  const paint = (hex: string, a = 1, w = 0) => { const p = api.Paint(); p.setAntiAlias(true); p.setColor(api.Color(hex)); p.setAlphaf(a); if (w) { p.setStyle(1); p.setStrokeWidth(w); } return p; }; // 1 = PaintStyle.Stroke
  const frame = api.RRectXY(api.XYWHRect(-RAIL, -RAIL, L + 2 * RAIL, W + 2 * RAIL), 0.12, 0.12);
  canvas.save();
  canvas.concat(v.land ? [v.s, 0, v.ox, 0, -v.s, v.oy + W * v.s, 0, 0, 1] : [0, -v.s, v.ox + W * v.s, -v.s, 0, v.oy + L * v.s, 0, 0, 1]);
  canvas.drawRRect(frame, paint(C.frame));
  canvas.drawRect(api.XYWHRect(-deep, -deep, L + 2 * deep, W + 2 * deep), paint(C.felt)); // the cloth runs under the cushions and onto the pocket shelves
  const mark = paint(C.chalk, 0.3, Math.max(1 / v.s, 0.0045)); // chalk hairline, never thinner than one screen unit
  canvas.drawLine(L / 4, 0, L / 4, W, mark); // head string
  canvas.drawCircle(0.75 * L, W / 2, 0.01, paint(C.chalk, 0.3)); // foot spot
  // Cushions, cut at the WPA facing angles (the same numbers as SEGS in the engine). The hairline runs along the nose
  // and the facings, where felt meets cushion at 1.37:1.
  const cushion = paint(C.cushion), ends = [(q: number, far: number) => q, (q: number, far: number) => far - q];
  const cut = (pts: number[][]) => { const p = api.Path.Polygon(pts.map(([x, y]) => ({ x, y })), false); canvas.drawPath(p, cushion); canvas.drawPath(p, mark); };
  for (const fx of ends) {
    const X = (x: number) => fx(x, L);
    cut([[X(-deep), cc - cj], [X(0), cc], [X(0), W - cc], [X(-deep), W - cc + cj]]);
    for (const fy of ends) { const Y = (y: number) => fy(y, W); cut([[X(cc - cj), Y(-deep)], [X(cc), Y(0)], [X(L / 2 - sc), Y(0)], [X(L / 2 - sc + sj), Y(-deep)]]); }
  }
  // Sights: three between pockets on every rail, in the middle of the maple.
  const sight = paint(C.sight), d = (RAIL + deep) / 2;
  for (let k = 1; k < 8; k++) if (k !== 4) for (const y of [-d, W + d]) canvas.drawCircle(k * L / 8, y, 0.0095, sight);
  for (let k = 1; k < 4; k++) for (const x of [-d, L + d]) canvas.drawCircle(x, k * W / 4, 0.0095, sight);
  // One faint pool of light over the whole table: a touch of chalk in the middle, falling to shade at the corners.
  const lamp = api.Paint(); lamp.setDither(true);
  lamp.setShader(api.Shader.MakeRadialGradient({ x: L / 2, y: W / 2 }, 1.68, [api.Color('rgba(238,242,234,0.07)'), api.Color('rgba(0,0,0,0.4)')], [0.13, 1], 0)); // 0 = TileMode.Clamp
  canvas.drawRRect(frame, lamp);
  for (const [x, y, r] of HOLES) canvas.drawCircle(x, y, r, paint(C.pocket)); // after the light: a hole stays the darkest thing on the table
  canvas.restore();
}
