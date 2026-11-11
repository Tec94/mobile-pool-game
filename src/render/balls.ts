// Ball animation: every ball is drawn as a real sphere seen from above, turned by the spin the engine gives it.
// That one rule covers rolling, sliding (stun, draw, follow), side spin, masse and spin kept in the air; the rest is
// what the engine does not move: height (jump), the drop into a pocket, leaving the table, landing marks and a speed
// smear. The Skia API is passed in, so the same code draws on the phone and in scripts/ball-frames.mjs.
import type { Skia, SkCanvas, SkFont, SkPaint, SkRuntimeEffect } from '@shopify/react-native-skia';
import { type Ball, type Ev, HOLES, P, step } from '../physics/engine.ts';
import { BALLS, C } from '../theme.ts';

const DROP = 220, OFF = 350, RING = 240; // ms: fall into a pocket, flight off the table, landing ring
const LAND_MIN = 0.3; // m/s: softer touchdowns (the last bounces of a hop) leave no ring

export interface Fx { t: 'pocket' | 'off' | 'land'; i: number; age: number; x: number; y: number; vx: number; vy: number; z: number; vz: number }
// m[i] = ball i's orientation, a row-major 3x3 whose columns are the ball's own axes in table coordinates.
export interface Look { m: number[][]; fx: Fx[]; pre: Float64Array; last: Float64Array }
export const newLook = (B: Ball[]): Look => ({
  m: B.map(() => [1, 0, 0, 0, 1, 0, 0, 0, 1]), fx: [], pre: new Float64Array(4 * B.length),
  last: Float64Array.from(B.flatMap(b => [b.x, b.y])),
});

// Turn orientation m by angular velocity (wx,wy,wz) for dt seconds (Rodrigues, exact at any spin rate).
export function turn(m: number[], wx: number, wy: number, wz: number, dt: number) {
  const w = Math.sqrt(wx * wx + wy * wy + wz * wz), a = w * dt; if (a < 1e-9) return;
  const x = wx / w, y = wy / w, z = wz / w, c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  const r = [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
  for (let k = 0; k < 3; k++) {
    const p = m[k], q = m[3 + k], u = m[6 + k];
    m[k] = r[0] * p + r[1] * q + r[2] * u; m[3 + k] = r[3] * p + r[4] * q + r[5] * u; m[6 + k] = r[6] * p + r[7] * q + r[8] * u;
  }
}

// Run the table for ms of play (1 step = 1 ms) while run is true, turn the balls and start the effects the engine's
// events call for. Returns whether balls are still travelling; effects in look.fx can outlive that by a few frames.
const ev: Ev[] = [];
export function advance(B: Ball[], look: Look, ms: number, run: boolean): boolean {
  const { pre, last, fx } = look;
  for (let i = 0; i < B.length; i++) { last[2 * i] = B[i].x; last[2 * i + 1] = B[i].y; }
  for (let k = 0; k < ms && run; k++) {
    for (let i = 0; i < B.length; i++) { const b = B[i]; pre[4 * i] = b.vx; pre[4 * i + 1] = b.vy; pre[4 * i + 2] = b.z || 0; pre[4 * i + 3] = b.vz || 0; }
    ev.length = 0; run = step(B, ev);
    for (let i = 0; i < B.length; i++) { const b = B[i]; if (b.on && (b.wx || b.wy || b.wz)) turn(look.m[i], b.wx, b.wy, b.wz, P.h); }
    for (const e of ev) {
      const i = e.a, vz = pre[4 * i + 3];
      // The engine clears a ball's motion as it leaves, so the effect starts from the state one step earlier.
      if (e.t === 'pocket' || e.t === 'off' || (e.t === 'land' && vz < -LAND_MIN)) fx.push({ t: e.t, i, age: 0, x: e.x, y: e.y, vx: pre[4 * i], vy: pre[4 * i + 1], z: pre[4 * i + 2], vz });
    }
  }
  for (const f of fx) f.age += ms;
  look.fx = fx.filter(f => f.age < (f.t === 'pocket' ? DROP : f.t === 'off' ? OFF : RING));
  return run;
}

// Table metres -> screen px. Portrait stands the table up with the head string at the bottom.
export interface View { land: boolean; s: number; pad: number; dpr?: number; calm?: boolean } // calm = reduced motion
export const toScreen = (v: View, x: number, y: number) => (v.land ? { x: v.pad + x * v.s, y: v.pad + (P.W - y) * v.s } : { x: v.pad + (P.W - y) * v.s, y: v.pad + (P.L - x) * v.s });

// The ball surface: n is the point under this pixel in the ball's own frame. A stripe is a band around the ball's
// y axis, the number spots sit on its z axis, and the cue ball carries six small spots so its spin can be read.
const SKSL = `
uniform float3 r0; uniform float3 r1; uniform float3 r2;
uniform float4 body; uniform float4 band; uniform float4 spot;
uniform float cut; uniform float six; uniform float e;
half4 main(float2 p) {
  float3 v = float3(p, sqrt(max(0.0, 1.0 - dot(p, p))));
  float3 n = abs(float3(dot(r0, v), dot(r1, v), dot(r2, v)));
  float4 c = mix(body, float4(band.rgb, 1.0), band.a * (1.0 - smoothstep(0.52 - e, 0.52 + e, n.y)));
  float w = e * sqrt(1.0 - cut * cut);
  c = mix(c, spot, smoothstep(cut - w, cut + w, mix(n.z, max(n.x, max(n.y, n.z)), six)));
  return half4(c);
}`;
const SPOT = Math.cos(Math.asin(0.46)), CUE_SPOT = Math.cos(Math.asin(0.17)); // spot radius 0.46 R (number), 0.17 R (cue ball)

export interface Kit { fx: SkRuntimeEffect; fill: SkPaint; line: SkPaint; ball: SkPaint; font: SkFont | null; col: (hex: string) => Float32Array; rect: (typeof Skia)['XYWHRect']; tw: number[] }
// font: any bold face at size 10, or null to leave the numbers off.
export function makeKit(api: typeof Skia, font: SkFont | null): Kit {
  const paint = (stroke: boolean) => { const p = api.Paint(); p.setAntiAlias(true); if (stroke) { p.setStyle(1); p.setStrokeCap(1); } return p; }; // 1 = PaintStyle.Stroke, StrokeCap.Round
  const cache: Record<string, Float32Array> = {};
  return { fx: api.RuntimeEffect.Make(SKSL)!, fill: paint(false), line: paint(true), ball: paint(false), font, rect: api.XYWHRect,
    col: hex => cache[hex] || (cache[hex] = api.Color(hex)), tw: [] };
}

// A ball axis in view space: x right, y down, z towards the eye.
const axis = (m: number[], i: number, land: boolean, k = 1) => (land ? [k * m[i], -k * m[3 + i], k * m[6 + i]] : [-k * m[3 + i], -k * m[i], k * m[6 + i]]);

export function drawBalls(kit: Kit, canvas: SkCanvas, B: Ball[], ids: number[], look: Look, v: View) {
  const { fill, line, ball, col, font } = kit, r = P.R * v.s, { land, calm } = v, dpr = v.dpr || 1;
  const hue = (id: number) => (id === 0 ? C.chalk : BALLS[(id - 1) % 8]);
  const circle = (x: number, y: number, rad: number, hex: string, a: number) => { fill.setColor(col(hex)); fill.setAlphaf(a); canvas.drawCircle(x, y, rad, fill); };
  const stroke = (hex: string, a: number, w: number) => { line.setColor(col(hex)); line.setAlphaf(a); line.setStrokeWidth(w); return line; };
  const lift = (z: number) => 1 + 2.5 * z; // a ball in the air is drawn larger: 10 cm up = 25%
  const shadow = (x: number, y: number, z: number, a = 1) => { const o = 0.25 * r + 0.5 * z * v.s; circle(x + o, y + o, r, '#000000', a * Math.max(0.18, 0.35 - 2 * z)); };

  const sphere = (i: number, x: number, y: number, rad: number, a: number) => {
    const id = ids[i], m = look.m[i], stripe = id > 8;
    // Portrait turns the pattern a quarter turn in the ball's own frame, so a racked ball reads upright either way.
    const X = land ? axis(m, 0, land) : axis(m, 1, land, -1), Y = land ? axis(m, 1, land) : axis(m, 0, land), Z = axis(m, 2, land);
    const body = col(id === 0 || stripe ? C.chalk : hue(id)), band = col(hue(id)), spot = col(id === 0 ? C.accent : C.chalk);
    ball.setShader(kit.fx.makeShader([...X, ...Y, ...Z, ...body, band[0], band[1], band[2], stripe ? 1 : 0, ...spot, id === 0 ? CUE_SPOT : SPOT, id === 0 ? 1 : 0, 1.2 / (rad * dpr)]));
    ball.setAlphaf(a);
    canvas.save(); canvas.translate(x, y); canvas.scale(rad, rad); canvas.drawCircle(0, 0, 1, ball); canvas.restore();
    if (font && id > 0) for (const k of [1, -1]) { // the number lies flat on its spot, so it turns and foreshortens with the ball
      if (k * Z[2] < 0.25) continue;
      const tw = kit.tw[id] ?? (kit.tw[id] = font.measureText(String(id)).width), f = rad * 0.062;
      canvas.save(); canvas.concat([k * X[0] * f, -Y[0] * f, x + k * Z[0] * rad, k * X[1] * f, -Y[1] * f, y + k * Z[1] * rad, 0, 0, 1]); // the far number reads upright after a half turn about its own upright, as on a real ball
      fill.setColor(col(C.ink)); fill.setAlphaf(a); canvas.drawText(String(id), -tw / 2, 3.6, fill, font); canvas.restore();
    }
    canvas.drawCircle(x, y, rad - 0.5 / dpr, stroke(C.chalk, 0.4 * a, 1 / dpr)); // rim: keeps the 7 and 8 an edge on dark slate
    canvas.drawArc(kit.rect(x - rad * 0.7, y - rad * 0.7, rad * 1.4, rad * 1.4), 205, 40, false, stroke(C.chalk, 0.75 * a, rad * 0.11)); // fixed highlight: the pattern moves under it
  };

  // Under everything: speed smears, landing rings, balls falling into pockets.
  for (let i = 0; i < B.length; i++) {
    const b = B[i]; if (!b.on || calm) continue;
    const p = toScreen(v, b.x, b.y), q = toScreen(v, look.last[2 * i], look.last[2 * i + 1]);
    // Above about 2.5 m/s a ball moves more than its own width per frame and strobes; a streak joins the frames.
    if (Math.hypot(p.x - q.x, p.y - q.y) > 1.5 * r) canvas.drawLine(q.x, q.y, p.x, p.y, stroke(hue(ids[i]), 0.16, 2 * r * lift(b.z || 0)));
  }
  for (const f of look.fx) {
    const t = f.age / (f.t === 'pocket' ? DROP : RING), p = toScreen(v, f.x, f.y);
    if (f.t === 'land' && !calm) canvas.drawCircle(p.x, p.y, r * (1 + 0.9 * (1 - (1 - t) ** 3)), stroke(C.chalk, 0.6 * (1 - t), 1));
    if (f.t !== 'pocket') continue;
    if (calm) { sphere(f.i, p.x, p.y, r, 1 - t); continue; }
    // The ball runs on to the middle of the hole (ease-out, it arrives with speed) while it falls away (ease-in, gravity).
    let H = HOLES[0]; for (const h of HOLES) if (Math.hypot(h[0] - f.x, h[1] - f.y) < Math.hypot(H[0] - f.x, H[1] - f.y)) H = h;
    const e = 1 - (1 - t) ** 3, c = toScreen(v, f.x + (H[0] - f.x) * e, f.y + (H[1] - f.y) * e), rad = r * (1 - 0.3 * t * t);
    sphere(f.i, c.x, c.y, rad, 1); circle(c.x, c.y, rad + 0.5, C.pocket, 1 - (1 - t) ** 2);
  }
  // Shadows lie on the cloth, under every ball; then the balls, lowest first so a jumping ball passes over.
  const order = B.map((_, i) => i).filter(i => B[i].on).sort((a, b) => (B[a].z || 0) - (B[b].z || 0));
  for (const i of order) { const b = B[i], p = toScreen(v, b.x, b.y); shadow(p.x, p.y, b.z || 0); }
  for (const i of order) { const b = B[i], p = toScreen(v, b.x, b.y); sphere(i, p.x, p.y, r * lift(b.z || 0), 1); }
  for (const f of look.fx) if (f.t === 'off') { // carries on over the rail on its arc and fades as it leaves
    const s = f.age / 1000, t = f.age / OFF, z = Math.max(0, f.z + f.vz * s - P.g * s * s / 2), p = toScreen(v, f.x + f.vx * s, f.y + f.vy * s), a = 1 - t * t;
    if (!calm) shadow(p.x, p.y, z, a);
    sphere(f.i, p.x, p.y, r * lift(z), a);
  }
}
