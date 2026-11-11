// Cost of recording the pictures the app makes on the JS thread: ms (CanvasKit in Node, with JIT) and Skia calls,
// the better measure for the phone, where each call crosses JSI. Run: node scripts/draw-bench.mjs
import { createRequire } from 'node:module';
import { P, rack } from '../src/physics/engine.ts';
import { drawBalls, makeKit, newLook } from '../src/render/balls.ts';
import { drawRail, shotLayout } from '../src/render/cue.ts';
import { drawMarks } from '../src/render/marks.ts';

const require = createRequire(import.meta.url);
globalThis.CanvasKit = await require('canvaskit-wasm/bin/full/canvaskit.js')({ locateFile: f => require.resolve('canvaskit-wasm/bin/full/' + f) });
const { JsiSkApi } = require('@shopify/react-native-skia/lib/commonjs/skia/web');
const { JsiSkCanvas } = require('@shopify/react-native-skia/lib/commonjs/skia/web/JsiSkCanvas');
const Skia = JsiSkApi(CanvasKit), kit = makeKit(Skia);
let calls = 0; // every canvas call; the paint and shader calls the drawing makes come on top
for (const k of Object.getOwnPropertyNames(JsiSkCanvas.prototype)) { const f = JsiSkCanvas.prototype[k]; if (k !== 'constructor' && typeof f === 'function') JsiSkCanvas.prototype[k] = function (...a) { calls++; return f.apply(this, a); }; }

const mk = (x, y) => ({ x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true });
const B = [mk(P.L / 4, P.W / 2), ...rack(8).map(([, x, y]) => mk(x, y))], ids = [0, ...rack(8).map(([id]) => id)], look = newLook(B);
const v = { ...shotLayout(844, 390, { top: 0, right: 59, bottom: 21, left: 59 }).view, dpr: 3, calm: false };
const pic = draw => { const rec = Skia.PictureRecorder(), c = rec.beginRecording(); draw(c); return rec.finishRecordingAsPicture(); };
const row = (name, draw) => {
  for (let i = 0; i < 200; i++) pic(draw); // warm up
  calls = 0; pic(draw); const n = calls, ms = [];
  for (let i = 0; i < 500; i++) { const t = performance.now(); pic(draw); ms.push(performance.now() - t); }
  ms.sort((a, b) => a - b); console.log(name.padEnd(44), `${String(n).padStart(4)} canvas calls  p50 ${ms[250].toFixed(3)} ms`);
};
const marks = c => drawMarks(Skia, c, v, { hand: 'kitchen', x: B[0].x, y: B[0].y, call: -1, ask: false, ms: performance.now() });
row('ball in hand pulse: marks + 16 balls', c => { marks(c); drawBalls(kit, c, B, ids, look, v); });
row('ball in hand pulse: marks only', marks);
row('rail at 37%', c => drawRail(Skia, c, 56, 300, 0.37));
