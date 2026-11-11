// Renders the ball animations to PNG frame strips with the app's own drawing code (Skia on CanvasKit, no phone needed).
// Run: node scripts/ball-frames.mjs [outDir]   Every picture is at the phone's real pixel size: the table is
// laid out by the app's own fit() for an iPhone window, then drawn at 3 px per pt, so one image pixel is one phone pixel.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { CUE, P, rack, strike } from '../src/physics/engine.ts';
import { advance, drawBalls, makeKit, newLook } from '../src/render/balls.ts';
import { drawCue, drawDial, drawRail } from '../src/render/cue.ts';
import { drawAim, drawTable, fit, toScreen } from '../src/render/table.ts';
import { drawSide, drawTip, drawTipBall, shotTip, SIDE } from '../src/render/tip.ts';
import { aimGuide, guideFor, HOUSE_CUE } from '../src/shot/aim.ts';
import { C, CLOTHS } from '../src/theme.ts';

const require = createRequire(import.meta.url);
const out = process.argv[2] || 'ball-frames';
globalThis.CanvasKit = await require('canvaskit-wasm/bin/full/canvaskit.js')({ locateFile: f => require.resolve('canvaskit-wasm/bin/full/' + f) });
const { JsiSkApi } = require('@shopify/react-native-skia/lib/commonjs/skia/web');
const { JsiSkCanvas } = require('@shopify/react-native-skia/lib/commonjs/skia/web/JsiSkCanvas');
const Skia = JsiSkApi(CanvasKit);
const kit = makeKit(Skia);
mkdirSync(out, { recursive: true });
CUE.squirt = 0;

const PHONE = { w: 393, h: 852, dpr: 3 }; // iPhone 15 and 16, in pt
const SAFE = { port: { top: 59, right: 0, bottom: 34, left: 0 }, land: { top: 0, right: 59, bottom: 21, left: 59 } }; // their safe area insets
const ball = (x, y) => ({ x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true });

// One scenario: n cells, each `every` frames (16 ms each) apart, showing w x h metres centred on at(B) or a fixed point.
// w = 0 shows the whole phone window instead. aim = a shot to draw the aim guide for, as the app does while the player aims;
// pull = the power on the rail, which draws the cue stick behind the cue ball as well.
function strip(name, { B, ids, shots, n, every = 1, w = 0, h, at, land = true, calm = false, skip = 0, cloth = 0, aim, pull }) {
  const { dpr } = PHONE, W = land ? PHONE.h : PHONE.w, H = land ? PHONE.w : PHONE.h, v = { ...fit(W, H, SAFE[land ? 'land' : 'port']), dpr, calm }, look = newLook(B);
  const cw = Math.round(w ? (land ? w : h) * v.s * dpr : W * dpr), ch = Math.round(w ? (land ? h : w) * v.s * dpr : H * dpr);
  const surface = CanvasKit.MakeSurface(n * cw + (n - 1) * 4, ch);
  const sk = surface.getCanvas(), c = new JsiSkCanvas(CanvasKit, sk);
  sk.clear(CanvasKit.Color(16, 31, 28, 1));
  for (const [i, shot] of shots) strike(B[i], shot);
  let run = true;
  for (let k = 0; k < skip; k++) run = advance(B, look, 16, run);
  for (let f = 0; f < n; f++) {
    const p = typeof at === 'function' ? at(B) : at, o = w ? toScreen(v, p[0], p[1]) : { x: W / 2, y: H / 2 };
    c.save(); c.translate(f * (cw + 4), 0); c.clipRect(Skia.XYWHRect(0, 0, cw, ch), 1, true); c.scale(dpr, dpr); c.translate(cw / 2 / dpr - o.x, ch / 2 / dpr - o.y);
    drawTable(Skia, c, v, CLOTHS[cloth]); if (aim) { const g = aimGuide(B, aim, guideFor(HOUSE_CUE.aim)); drawAim(Skia, c, v, g.path, g.ghost, g.lands, g.lost, g.ob); if (pull !== undefined) drawCue(Skia, c, v, B[0].x, B[0].y, aim.ang, pull); } // as App.tsx does
    drawBalls(kit, c, B, ids, look, v); c.restore();
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
// 9. the rack at rest, then the whole phone window (blue cloth with the rack, slate after a break has settled)
for (const land of [true, false]) { const B = [ball(P.L / 4, mid)], ids = [0], o = land ? 'land' : 'port'; for (const [id, x, y] of rack(8)) { ids.push(id); B.push(ball(x, y)); }
  strip('rack-' + o, { B, ids, shots: [], n: 1, w: 0.5, h: 0.4, at: [0.75 * P.L + 0.1, mid], land });
  if (land) strip('screen-blue', { B, ids, shots: [], n: 1, cloth: 1 }); // the blue cloth option, before the break
  strip('screen-' + o, { B, ids, shots: [[0, { ang: 0, speed: 9, a: 0, b: 0 }]], n: 1, land, skip: 1500 }); }
// 10. reduced motion: the pocket drop is a fade
strip('pocket-calm', { B: [ball(0.12, 0.12)], ids: [14], shots: [[0, { ang: -3 * Math.PI / 4, speed: 0.5, a: 0, b: 0.4 }]], n: 8, w: 0.2, h: 0.2, at: [0.03, 0.03], skip: 22, calm: true });
// 11. the aim guide on a cut shot, in landscape and in portrait
for (const land of [true, false]) strip('aim-' + (land ? 'land' : 'port'), { B: [ball(0.6, mid - 0.1), ball(1.2, mid + 0.02)], ids: [0, 4], shots: [], n: 1, w: 1, h: 0.4, at: [1, mid], land, aim: { ang: Math.atan2(0.09, 0.6), speed: 2, a: 0, b: 0 } });
// 12. the aim guide with a raised cue: a jump over a blocker, a masse round one, and a jump that loses the cue ball
for (const [name, t, speed, ang, B] of [['jump', { x: 0, y: 0, elev: 40 }, 3.2, 0, [ball(0.6, mid), ball(0.85, mid), ball(1.6, mid)]],
  ['masse', { x: 0.8, y: 0, elev: 65 }, 3.5, 0.12, [ball(0.6, mid), ball(1.0, mid), ball(1.4, mid - 0.03)]], ['lost', { x: 0, y: 0, elev: 42 }, 4.5, Math.PI, [ball(0.3, mid)]]])
  strip('aim-' + name, { B, ids: [0, 8, 4].slice(0, B.length), shots: [], n: 1, w: 1.9, h: 0.5, at: [0.75, mid], aim: { ang, speed, ...shotTip(t) } });
// 13. the tip and cue angle control at 3 px per pt: the ring with the cue ball, the side picture and the control bar
// button, for a level cue, the Jump 40 preset with draw, and the Massé 65 preset with right side; then the smaller landscape ring
{ const tips = [{ x: 0, y: 0, elev: 0 }, { x: 0, y: -0.7, elev: 40 }, { x: 0.8, y: 0.2, elev: 65 }], dpr = PHONE.dpr, cell = 190 + 6 + SIDE.w + 6 + 48 + 12;
  const surface = CanvasKit.MakeSurface(cell * 4 * dpr, 190 * dpr), sk = surface.getCanvas(), c = new JsiSkCanvas(CanvasKit, sk);
  c.drawColor(Skia.Color(C.panel)); c.scale(dpr, dpr);
  [...tips, tips[2]].forEach((t, i) => { const D = i < 3 ? 190 : 150;
    c.save(); c.translate(i * cell, 0); drawTip(Skia, c, D, t);
    c.translate(D + 6, (D - SIDE.h) / 2); drawSide(Skia, c, t.elev, CLOTHS[0].felt);
    c.translate(SIDE.w + 6, 0); drawTipBall(Skia, c, 24, 24, 24, t); c.restore(); });
  writeFileSync(`${out}/tip-control.png`, surface.makeImageSnapshot().encodeToBytes()); console.log('tip-control'); }
// 14. the shot controls at 3 px per pt: the power rail at rest, at 50% and at full power, then the fine aim dial as it
// lies in portrait and as it stands in landscape
{ const dpr = PHONE.dpr, surface = CanvasKit.MakeSurface(520 * dpr, 316 * dpr), sk = surface.getCanvas(), c = new JsiSkCanvas(CanvasKit, sk);
  c.drawColor(Skia.Color(C.ground)); c.scale(dpr, dpr); c.translate(8, 8);
  [0, 0.5, 1].forEach((p, i) => { c.save(); c.translate(i * 68, 0); drawRail(Skia, c, 56, 300, p); c.restore(); });
  c.save(); c.translate(216, 0); drawDial(Skia, c, 220, 48, 0); c.translate(0, 60); drawDial(Skia, c, 220, 48, 0.004); c.translate(236, -60); drawDial(Skia, c, 48, 200, 0); c.restore();
  writeFileSync(`${out}/shot-controls.png`, surface.makeImageSnapshot().encodeToBytes()); console.log('shot-controls'); }
// 15. the cue stick behind the cue ball with the guide, at rest and pulled back to 60%, in landscape and in portrait
for (const land of [true, false]) for (const pull of [0, 0.6]) strip(`stick-${land ? 'land' : 'port'}-${pull * 100}`, { B: [ball(0.9, mid - 0.1), ball(1.5, mid + 0.02)], ids: [0, 4], shots: [], n: 1, w: 1.9, h: 0.5, at: [0.9, mid], land, aim: { ang: Math.atan2(0.09, 0.6), speed: 2, a: 0, b: 0 }, pull });
// 16. the app icon, written to assets/: the 8 ball as the app draws it, on the cloth under the lamp. `felt` off leaves
// the ball alone on a clear ground, for the Android adaptive icon and the launch screen.
function icon(file, n, k, felt) {
  const surface = CanvasKit.MakeSurface(n, n), sk = surface.getCanvas(), c = new JsiSkCanvas(CanvasKit, sk), r = n * k, B = [ball(0, 0)];
  if (felt) {
    const lamp = Skia.Paint(); lamp.setDither(true); // the table's own light (drawTable), over the middle of the icon
    lamp.setShader(Skia.Shader.MakeRadialGradient({ x: n / 2, y: n / 2 }, 0.75 * n, [Skia.Color('rgba(238,242,234,0.07)'), Skia.Color('rgba(0,0,0,0.4)')], [0.13, 1], 0));
    c.drawColor(Skia.Color(CLOTHS[0].felt)); c.drawPaint(lamp);
  }
  // Up and left a little, so the ball and its shadow together sit in the middle.
  drawBalls(kit, c, B, [8], newLook(B), { land: true, s: r / P.R, ox: n / 2 - 0.1 * r, oy: n / 2 - 0.13 * r - P.W * r / P.R });
  writeFileSync(`assets/${file}.png`, surface.makeImageSnapshot().encodeToBytes());
}
icon('icon', 1024, 0.33, true); icon('favicon', 48, 0.33, true);
icon('icon-mark', 1024, 0.21, false); // inside the 61% circle that every Android icon mask keeps

