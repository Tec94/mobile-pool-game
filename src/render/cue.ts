// The cue as the shot controls show it: the stick behind the cue ball on the table, the power rail and the fine aim
// dial. The app and scripts/ball-frames.mjs both draw them with the functions below.
import type { Skia, SkCanvas } from '@shopify/react-native-skia';
import { P } from '../physics/engine.ts';
import { C } from '../theme.ts';
import { BAR, fit, RAIL, toScreen } from './table.ts';
import type { Inset, View } from './table.ts';

const fill = (api: typeof Skia, hex: string, a = 1) => { const p = api.Paint(); p.setAntiAlias(true); p.setColor(api.Color(hex)); p.setAlphaf(a); return p; };
// A cue from its tip (ax, ay) to the end of its butt (bx, by), w0 wide at the tip and w1 at the butt: the chalked tip,
// the ferrule, the maple shaft and the dark wrap, the same parts as the approved rail picture.
function stick(api: typeof Skia, canvas: SkCanvas, ax: number, ay: number, bx: number, by: number, w0: number, w1: number) {
  const len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len;
  const at = (t: number, side: number) => { const h = side * (w0 + (w1 - w0) * t) / 2; return { x: ax + ux * len * t - uy * h, y: ay + uy * len * t + ux * h }; };
  for (const [from, to, hex] of [[0.6, 1, C.ink], [0.035, 0.6, C.frame], [0.015, 0.035, C.white], [0, 0.015, C.accent]] as [number, number, string][])
    canvas.drawPath(api.Path.Polygon([at(from, 1), at(to, 1), at(to, -1), at(from, -1)], true), fill(api, hex));
}

// The cue on the table, behind the cue ball at (x, y) along the aim and pulled back by the power (0..1).
// shortcut: seen from above at full length whatever the elevation; the side picture in the tip sheet shows the tilt.
export function drawCue(api: typeof Skia, canvas: SkCanvas, v: View, x: number, y: number, ang: number, power: number) {
  const ux = Math.cos(ang), uy = Math.sin(ang), gap = P.R + 0.0015 + power * 0.22, a = toScreen(v, x - ux * gap, y - uy * gap), b = toScreen(v, x - ux * (gap + 0.77), y - uy * (gap + 0.77));
  stick(api, canvas, a.x, a.y, b.x, b.y, Math.max(2, 0.012 * v.s), Math.max(3, 0.026 * v.s));
}

export const RAIL_TIP = 14, RAIL_LABEL = 24; // px from the top of the rail to the cue tip at rest; height of the label strip at its foot
// The power rail, w x h, pulled down: the fill grows from the top with its bright lower edge on the cue tip, and the
// cue moves as far as the finger (full power = 75% of the height). The label is text, drawn by the app over the foot.
export function drawRail(api: typeof Skia, canvas: SkCanvas, w: number, h: number, power: number) {
  const box = api.RRectXY(api.XYWHRect(0.5, 0.5, w - 1, h - 1), 14, 14), tip = RAIL_TIP + power * 0.75 * h;
  canvas.save(); canvas.clipRRect(box, 1, true); // 1 = ClipOp.Intersect
  canvas.drawRect(api.XYWHRect(0, 0, w, h), fill(api, C.panel));
  if (power > 0) {
    const glow = api.Paint(); glow.setAlphaf(Math.min(1, power * 20)); // fades in over the first 5%, where a release still cancels
    glow.setShader(api.Shader.MakeLinearGradient({ x: 0, y: 0 }, { x: 0, y: tip }, [api.Color('rgba(91,147,240,0.35)'), api.Color('rgba(91,147,240,0.85)')], null, 0)); // C.accent; 0 = TileMode.Clamp
    canvas.drawRect(api.XYWHRect(0, 0, w, tip), glow);
    canvas.drawRect(api.XYWHRect(0, tip - 2, w, 2), fill(api, C.chalk, Math.min(1, power * 20)));
  }
  stick(api, canvas, w / 2, tip, w / 2, tip + 1.3 * h, 8, 12);
  canvas.drawRect(api.XYWHRect(0, h - RAIL_LABEL, w, RAIL_LABEL), fill(api, C.panel));
  canvas.restore();
  const line = fill(api, C.chalk, 0.25); line.setStyle(1); line.setStrokeWidth(1); canvas.drawRRect(box, line); // 1 = PaintStyle.Stroke
}

// The fine aim dial, w x h: ruled lines 9 px apart that move with the finger (they are the aim itself, 0.0012 rad per
// px), a centre mark, and a chevron at each end for the tap that nudges. It runs along its longer side.
export function drawDial(api: typeof Skia, canvas: SkCanvas, w: number, h: number, aim: number) {
  const up = h > w, len = up ? h : w, box = api.RRectXY(api.XYWHRect(0.5, 0.5, w - 1, h - 1), 12, 12);
  const line = (a: number, wd: number) => { const p = fill(api, C.chalk, a); p.setStyle(1); p.setStrokeWidth(wd); p.setStrokeCap(1); p.setStrokeJoin(1); return p; }; // stroke, round, round
  canvas.save(); canvas.clipRRect(box, 1, true);
  if (up) canvas.concat([0, 1, 0, 1, 0, 0, 0, 0, 1]); // draw along x below; a dial that stands up swaps the axes
  const across = up ? w : h;
  canvas.drawRect(api.XYWHRect(0, 0, len, across), fill(api, C.panel));
  const pos = -aim / 0.0012, rule = line(0.25, 1);
  for (let x = pos - 9 * Math.floor(pos / 9); x < len; x += 9) canvas.drawLine(x, 0, x, across, rule);
  canvas.drawLine(len / 2, 5, len / 2, across - 5, line(1, 2));
  for (const [x, d] of [[11, -1], [len - 11, 1]]) {
    canvas.drawRect(api.XYWHRect(x - 10, 0, 20, across), fill(api, C.panel));
    canvas.drawPath(api.Path.Polygon([{ x: x - d * 2.5, y: across / 2 - 5 }, { x: x + d * 2.5, y: across / 2 }, { x: x - d * 2.5, y: across / 2 + 5 }], false), line(0.7, 1.5));
  }
  canvas.restore();
  canvas.drawRRect(box, line(0.25, 1));
}

// Where the shot controls sit in a w x h window, inside the safe area, and the table that fits between them.
// Portrait: the rail right of the table, standing on the line of the frame's foot; under the table a row of the tools
// button, the dial and the spin button. Landscape: spin, dial and tools in a column on the left, the rail on the right.
// shortcut: the rail is always on the right, the Power side setting of the settings screen mirrors this.
export interface Box { left: number; top: number; width: number; height: number }
export const RAIL_W = 56, DIAL = 36; // DIAL = the thickness of the fine aim dial (it has a hit slop of 6 on each long side)
export function shotLayout(w: number, h: number, pad: Inset): { view: View; rail: Box; dial: Box; spin: Box; tools: Box } {
  const [t, r, b, l] = [pad.top, pad.right, pad.bottom, pad.left].map(p => Math.max(p, 8));
  if (w > h) { // fit() keeps BAR on the right, for the rail; the larger inset keeps the same on the left
    const top = t + 60, foot = h - b - 44;
    return { view: fit(w, h, { ...pad, left: l + BAR }), rail: { left: w - r - BAR + 4, top: t, width: RAIL_W, height: h - t - b },
      spin: { left: l + 8, top: t, width: 48, height: 48 }, dial: { left: l + 32 - DIAL / 2, top, width: DIAL, height: foot - 12 - top }, tools: { left: l + 4, top: foot, width: 56, height: 44 } };
  }
  const view = fit(w, h, { ...pad, right: r + RAIL_W + 8 }), row = h - b - BAR, foot = view.oy + (P.L + RAIL) * view.s, tall = Math.min(300, (P.L + 2 * RAIL) * view.s);
  return { view, rail: { left: w - r - RAIL_W, top: foot - tall, width: RAIL_W, height: tall },
    tools: { left: l, top: row + 10, width: 56, height: 44 }, dial: { left: l + 68, top: row + 32 - DIAL / 2, width: w - r - l - 128, height: DIAL }, spin: { left: w - r - 48, top: row + 8, width: 48, height: 48 } };
}
