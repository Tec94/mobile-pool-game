// Renders the ball animations to PNG frame strips with the app's own drawing code (Skia on CanvasKit, no phone needed).
// Run: node scripts/ball-frames.mjs [outDir] [fontFile]   Every picture is at the phone's real pixel size: the table is
// laid out by the app's own fit() for an iPhone window, then drawn at 3 px per pt, so one image pixel is one phone pixel.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { CUE, P, rack, strike } from '../src/physics/engine.ts';
import { advance, drawBalls, makeKit, newLook } from '../src/render/balls.ts';
import { drawTable, fit, toScreen } from '../src/render/table.ts';

const require = createRequire(import.meta.url);
const out = process.argv[2] || 'ball-frames', fontFile = process.argv[3] || '/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf';
globalThis.CanvasKit = await require('canvaskit-wasm/bin/full/canvaskit.js')({ locateFile: f => require.resolve('canvaskit-wasm/bin/full/' + f) });
const { JsiSkApi } = require('@shopify/react-native-skia/lib/commonjs/skia/web');
const Skia = JsiSkApi(CanvasKit);
const kit = makeKit(Skia, Skia.Font(Skia.Typeface.MakeFreeTypeFaceFromData(Skia.Data.fromBytes(new Uint8Array(readFileSync(fontFile)))), 10));
mkdirSync(out, { recursive: true });
CUE.squirt = 0;

const PHONE = { w: 393, h: 852, dpr: 3 }; // iPhone 15 and 16, in pt
const ball = (x, y) => ({ x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true });

// One scenario: n cells, each `every` frames (16 ms each) apart, showing w x h metres centred on at(B) or a fixed point.
// w = 0 shows the whole phone window instead.
function strip(name, { B, ids, shots, n, every = 1, w = 0, h, at, land = true, calm = false, skip = 0 }) {
  const { dpr } = PHONE, W = land ? PHONE.h : PHONE.w, H = land ? PHONE.w : PHONE.h, v = { ...fit(W, H), dpr, calm }, look = newLook(B);
  const cw = Math.round(w ? (land ? w : h) * v.s * dpr : W * dpr), ch = Math.round(w ? (land ? h : w) * v.s * dpr : H * dpr);
  const surface = CanvasKit.MakeSurface(n * cw + (n - 1) * 4, ch);
  const sk = surface.getCanvas(), c = new (require('@shopify/react-native-skia/lib/commonjs/skia/web/JsiSkCanvas').JsiSkCanvas)(CanvasKit, sk);
  sk.clear(CanvasKit.Color(16, 31, 28, 1));
  for (const [i, shot] of shots) strike(B[i], shot);
  let run = true;
  for (let k = 0; k < skip; k++) run = advance(B, look, 16, run);
  for (let f = 0; f < n; f++) {
    const p = typeof at === 'function' ? at(B) : at, o = w ? toScreen(v, p[0], p[1]) : { x: W / 2, y: H / 2 };
    c.save(); c.translate(f * (cw + 4), 0); c.clipRect(Skia.XYWHRect(0, 0, cw, ch), 1, true); c.scale(dpr, dpr); c.translate(cw / 2 / dpr - o.x, ch / 2 / dpr - o.y);
    drawTable(Skia, c, v); drawBalls(kit, c, B, ids, look, v); c.restore();
    for (let k = 0; k < every; k++) run = advance(B, look, 16, run);
  }
  writeFileSync(`${out}/${name}.png`, surface.makeImageSnapshot().encodeToBytes());
  console.log(name, n * cw, ch);
}

const mid = P.W / 2, follow = i => B => [B[i].x, B[i].y];
// 1. natural roll, a solid and a stripe side by side
strip('roll', { B: [ball(0.5, mid + 0.05), ball(0.5, mid - 0.05)], ids: [3, 11], shots: [[0, { ang: 0, speed: 0.6, a: 0, b: 0.4 }], [1, { ang: 0, speed: 0.6, a: 0, b: 0.4 }]], n: 10, w: 0.16, h: 0.2, at: B => [B[0].x, mid] });
// 2. draw: the cue ball slides forward spinning backwards, hits, and comes back
strip('draw', { B: [ball(0.5, mid), ball(0.9, mid)], ids: [0, 5], shots: [[0, { ang: 0, speed: 2.5, a: 0, b: -0.45 }]], n: 12, every: 2, w: 0.2, h: 0.14, at: follow(0) });
// 3. side spin on a soft shot, cue ball and a stripe struck the same way
strip('side', { B: [ball(0.5, mid + 0.05), ball(0.5, mid - 0.05)], ids: [0, 13], shots: [[0, { ang: 0, speed: 0.5, a: 0.45, b: 0 }], [1, { ang: 0, speed: 0.5, a: 0.45, b: 0 }]], n: 10, every: 2, w: 0.16, h: 0.2, at: B => [B[0].x, mid] });
// 4. jump over a blocker
strip('jump', { B: [ball(0.5, mid), ball(0.75, mid)], ids: [0, 8], shots: [[0, { ang: 0, speed: 4.2, a: 0, b: 0, elev: 40 * Math.PI / 180 }]], n: 14, w: 0.2, h: 0.16, at: follow(0) });
// 5. masse: the whole curve in one cell per 100 ms
strip('masse', { B: [ball(0.5, mid), ball(0.9, mid)], ids: [0, 2], shots: [[0, { ang: 0, speed: 3.5, a: 0.4, b: 0, elev: 68 * Math.PI / 180 }]], n: 8, every: 6, w: 0.7, h: 0.4, at: [0.75, mid] });
// 6. pocket: slow into a corner, fast into a side pocket
strip('pocket-slow', { B: [ball(0.12, 0.12)], ids: [14], shots: [[0, { ang: -3 * Math.PI / 4, speed: 0.5, a: 0, b: 0.4 }]], n: 12, w: 0.2, h: 0.2, at: [0.03, 0.03], skip: 16 });
strip('pocket-fast', { B: [ball(P.L / 2 - 0.1, 0.25)], ids: [6], shots: [[0, { ang: Math.atan2(-0.3, 0.1), speed: 3, a: 0, b: 0 }]], n: 10, w: 0.2, h: 0.2, at: [P.L / 2, -0.02], skip: 2 });
// 7. a jump that leaves the table
strip('off', { B: [ball(0.3, mid)], ids: [0], shots: [[0, { ang: Math.PI, speed: 4.5, a: 0, b: 0, elev: 42 * Math.PI / 180 }]], n: 9, w: 0.5, h: 0.16, at: [-0.05, mid], skip: 3 });
// 8. the break at full power
{ const B = [ball(P.L / 4, mid)], ids = [0]; for (const [id, x, y] of rack(8)) { ids.push(id); B.push(ball(x, y)); }
  strip('break', { B, ids, shots: [[0, { ang: 0, speed: 12, a: 0, b: 0 }]], n: 6, every: 2, w: 0.75, h: 0.6, at: [0.75 * P.L + 0.08, mid], skip: 4 }); }
// 9. the rack at rest, then the whole phone window after a break has settled, landscape and portrait
for (const land of [true, false]) { const B = [ball(P.L / 4, mid)], ids = [0], o = land ? 'land' : 'port'; for (const [id, x, y] of rack(8)) { ids.push(id); B.push(ball(x, y)); }
  strip('rack-' + o, { B, ids, shots: [], n: 1, w: 0.5, h: 0.4, at: [0.75 * P.L + 0.1, mid], land });
  strip('screen-' + o, { B, ids, shots: [[0, { ang: 0, speed: 9, a: 0, b: 0 }]], n: 1, land, skip: 1500 }); }
// 10. reduced motion: the pocket drop is a fade
strip('pocket-calm', { B: [ball(0.12, 0.12)], ids: [14], shots: [[0, { ang: -3 * Math.PI / 4, speed: 0.5, a: 0, b: 0.4 }]], n: 8, w: 0.2, h: 0.2, at: [0.03, 0.03], skip: 22, calm: true });
