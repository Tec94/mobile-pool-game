// The part of the browser's Canvas 2D API that the cue drawings use (src/render/cues), on a Skia canvas. The cues
// were drawn and reviewed in a browser prototype; with this the same drawing code runs on the phone and in
// scripts/ball-frames.mjs, so a cue looks as it did on the review sheets.
// shortcut: a path is kept in the space it is drawn in, not the space it was built in (the browser fixes each point
// as it is added). Every cue builds and draws a path under one transform, so the two agree.
import type { Skia, SkCanvas, SkColor, SkFont, SkPaint, SkPathBuilder } from '@shopify/react-native-skia';

type Cap = 'butt' | 'round' | 'square';
type Join = 'miter' | 'round' | 'bevel';
const CAPS: Cap[] = ['butt', 'round', 'square'], JOINS: Join[] = ['miter', 'round', 'bevel'], TAU = 2 * Math.PI; // in the order of Skia's StrokeCap and StrokeJoin
const colors = new Map<string, SkColor>();

export class Ctx2D {
  fillStyle = '#000'; strokeStyle = '#000'; lineWidth = 1; lineCap: Cap = 'butt'; lineJoin: Join = 'miter'; globalAlpha = 1;
  private b: SkPathBuilder; private open = false; private saved: [string, string, number, Cap, Join, number][] = [];
  private fillPaint: SkPaint; private strokePaint: SkPaint;
  private api: typeof Skia; readonly canvas: SkCanvas; readonly font: SkFont | null;
  // font = the face for fillText (digits only: render/digits.ts); none = no text
  constructor(api: typeof Skia, canvas: SkCanvas, font: SkFont | null = null) { // fields set by hand: node runs this file with its types stripped, which has no parameter properties
    this.api = api; this.canvas = canvas; this.font = font;
    this.b = api.PathBuilder.Make();
    this.fillPaint = api.Paint(); this.fillPaint.setAntiAlias(true);
    this.strokePaint = api.Paint(); this.strokePaint.setAntiAlias(true); this.strokePaint.setStyle(1); // 1 = PaintStyle.Stroke
  }
  private paint(stroke: boolean) {
    const p = stroke ? this.strokePaint : this.fillPaint, css = stroke ? this.strokeStyle : this.fillStyle;
    let c = colors.get(css); if (!c) colors.set(css, c = this.api.Color(css));
    p.setColor(c); p.setAlphaf(c[3] * this.globalAlpha);
    if (stroke) { p.setStrokeWidth(this.lineWidth); p.setStrokeCap(CAPS.indexOf(this.lineCap)); p.setStrokeJoin(JOINS.indexOf(this.lineJoin)); }
    return p;
  }
  // save and restore keep the styles as well as the transform and the clip, as the browser does
  save() { this.canvas.save(); this.saved.push([this.fillStyle, this.strokeStyle, this.lineWidth, this.lineCap, this.lineJoin, this.globalAlpha]); }
  restore() { const s = this.saved.pop(); if (!s) return; this.canvas.restore(); [this.fillStyle, this.strokeStyle, this.lineWidth, this.lineCap, this.lineJoin, this.globalAlpha] = s; }
  translate(x: number, y: number) { this.canvas.translate(x, y); }
  rotate(rad: number) { this.canvas.rotate(rad * 180 / Math.PI, 0, 0); }
  scale(x: number, y: number) { this.canvas.scale(x, y); }

  beginPath() { this.b.reset(); this.open = false; }
  moveTo(x: number, y: number) { this.b.moveTo(x, y); this.open = true; }
  // a line with no point to start from starts the path there
  lineTo(x: number, y: number) { if (this.open) this.b.lineTo(x, y); else this.moveTo(x, y); }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number) { if (!this.open) this.moveTo(cx, cy); this.b.quadTo(cx, cy, x, y); }
  bezierCurveTo(ax: number, ay: number, bx: number, by: number, x: number, y: number) { if (!this.open) this.moveTo(ax, ay); this.b.cubicTo(ax, ay, bx, by, x, y); }
  closePath() { this.b.close(); }
  // as four lines, so a rect with a negative width winds the other way (a cue cuts a hole with one)
  rect(x: number, y: number, w: number, h: number) { this.moveTo(x, y); this.b.lineTo(x + w, y); this.b.lineTo(x + w, y + h); this.b.lineTo(x, y + h); this.b.close(); }
  roundRect(x: number, y: number, w: number, h: number, r: number) { this.b.addRRect(this.api.RRectXY(this.api.XYWHRect(x, y, w, h), r, r)); this.open = true; }
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw = false) { this.ellipse(x, y, r, r, 0, a0, a1, ccw); }
  // An arc as cubic curves of a quarter turn or less: Skia's own arc takes no turned ellipse and draws nothing for a
  // full turn. A path already begun is joined to the arc's start by a line, as the browser does.
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw = false) {
    let sweep = a1 - a0;
    if (ccw) sweep = sweep <= -TAU ? -TAU : -(((-sweep % TAU) + TAU) % TAU); else sweep = sweep >= TAU ? TAU : ((sweep % TAU) + TAU) % TAU;
    const n = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-9)), d = sweep / n, k = 4 / 3 * Math.tan(d / 4), cr = Math.cos(rot), sr = Math.sin(rot);
    const at = (a: number, t = 0): [number, number] => { const px = rx * (Math.cos(a) - t * Math.sin(a)), py = ry * (Math.sin(a) + t * Math.cos(a)); return [x + px * cr - py * sr, y + px * sr + py * cr]; };
    this.lineTo(...at(a0));
    for (let i = 0; i < n; i++) { const a = a0 + i * d; this.b.cubicTo(...at(a, k), ...at(a + d, -k), ...at(a + d)); }
  }

  fill(rule?: 'evenodd') { const p = this.b.build(); this.canvas.drawPath(rule ? this.api.PathBuilder.MakeFromPath(p).setFillType(1).build() : p, this.paint(false)); } // 1 = FillType.EvenOdd
  stroke() { this.canvas.drawPath(this.b.build(), this.paint(true)); }
  clip() { this.canvas.clipPath(this.b.build(), 1, true); } // 1 = ClipOp.Intersect
  fillRect(x: number, y: number, w: number, h: number) { this.canvas.drawRect(this.api.XYWHRect(Math.min(x, x + w), Math.min(y, y + h), Math.abs(w), Math.abs(h)), this.paint(false)); }
  // text centred on (x, y), px tall
  fillText(str: string, x: number, y: number, px: number) {
    const f = this.font; if (!f) return;
    f.setSize(px); const m = f.getMetrics();
    this.canvas.drawText(str, x - f.getTextWidth(str) / 2, y - (m.ascent + m.descent) / 2, this.paint(false), f);
  }
}
