// Run: npm test   (checks the frame pacing: frames are made ahead at the display's rate and shown one per refresh)
import assert from 'node:assert';
import { AHEAD, newPace, nextFrame, refresh, spent } from './pace.ts';
let n = 0; const ok = name => console.log(`ok ${++n} ${name}`);

// The app's two loops: the JS thread makes frames when it runs (at the times in `js`), the display refreshes every `hz`.
function play(frame, hz, js, until) {
  const p = newPace(frame), shown = [], gaps = []; let q = [], left = 0, made = 0, dry = 0, skipped = 0, last = -1, t = 0;
  for (let v = 0; v * hz <= until; v++) {
    const now = v * hz;
    for (; js.length && js[0] <= now; js.shift()) for (let k = 0, ms; k < 4 && (ms = nextFrame(p, js[0])); k++) q.push({ pic: (t += ms), ms: p.frame });
    const r = refresh(q, left, v ? hz : 0); q = r.rest; left = r.left; skipped += r.skipped; dry += r.dry ? 1 : 0;
    if (r.show !== null) { if (last >= 0) gaps.push(now - last); last = now; shown.push(r.show); made++; }
  }
  return { shown, gaps, dry, skipped, t, waiting: q.reduce((a, s) => a + s.ms, 0) };
}
const every = (step, until, jitter = () => 0) => Array.from({ length: Math.floor(until / step) }, (_, i) => i * step + jitter(i));

{ // 60 Hz display, JS thread up to 20 ms late: every refresh still gets one frame, 16 or 17 ms of play further on.
  const r = play(1000 / 60, 1000 / 60, every(1000 / 60, 2000, i => [0, 20, 3, 14, 7][i % 5]), 2000);
  assert(r.gaps.every(g => Math.abs(g - 1000 / 60) < 1e-6), 'a frame on every refresh');
  assert(r.shown.every((s, i) => i === 0 || [16, 17].includes(s - r.shown[i - 1])), 'each frame is one refresh of play further on');
  assert.equal(r.skipped, 0);
  ok('a late JS thread does not miss a refresh');
}
{ // 120 Hz display and frames, JS thread woken 60 times a second: two frames a wake, still one per refresh.
  const r = play(1000 / 120, 1000 / 120, every(1000 / 60, 2000, i => [0, 6][i % 2]), 2000);
  assert(r.gaps.every(g => Math.abs(g - 1000 / 120) < 1e-6), 'a frame on every refresh');
  assert(r.shown.every((s, i) => i === 0 || [8, 9].includes(s - r.shown[i - 1])), '8 or 9 ms of play a frame');
  ok('120 frames a second from a JS thread that wakes 60 times a second');
}
{ // Play keeps to real time: frames for 120 Hz on a display at 60 Hz (Low Power Mode) show every second frame.
  const r = play(1000 / 120, 1000 / 60, every(1000 / 60, 2000), 2000);
  assert(Math.abs(r.shown.at(-1) - 2000) < 2 * AHEAD, `2 s of display shows 2 s of play, got ${r.shown.at(-1)}`);
  assert(r.skipped > 100, 'the frames between are skipped');
  ok('a display slower than the frames skips frames, play keeps to real time');
}
{ // Frames at 60 on a display at 120 stay on screen for two refreshes.
  const r = play(1000 / 60, 1000 / 120, every(1000 / 60, 1000), 1000);
  assert(r.gaps.every(g => Math.abs(g - 1000 / 60) < 1e-6), 'one frame each two refreshes');
  ok('a display faster than the frames holds each frame');
}
{ // The JS thread stops for 300 ms: the display runs dry, then play continues from where it stopped, with no burst.
  const r = play(1000 / 60, 1000 / 60, every(1000 / 60, 2000).filter(t => t < 500 || t > 800), 2000);
  assert(r.dry > 10, 'the display ran dry');
  assert(r.shown.every((s, i) => i === 0 || s - r.shown[i - 1] <= 17), 'no play is skipped after the stall');
  assert(r.waiting <= AHEAD + 2 * 1000 / 60, `the frames that wait do not grow after the stall, ${r.waiting} ms`);
  const short = play(1000 / 60, 1000 / 60, every(1000 / 60, 2000).filter(t => t < 500 || t > 590), 2000);
  assert(short.waiting <= AHEAD + 2 * 1000 / 60, `nor after a stall of 90 ms, ${short.waiting} ms`);
  ok('a stalled JS thread pauses play and does not replay the lost time');
}
{ // A phone that needs 6 ms for a frame cannot make 120 a second: the rate halves once, and not again at 60.
  const p = newPace(1000 / 120); for (let i = 0; i < 40; i++) spent(p, 6);
  assert.equal(p.frame, 1000 / 60);
  ok('the frame rate halves when frames cost too much to make');
}
console.log('pacing checks passed');
