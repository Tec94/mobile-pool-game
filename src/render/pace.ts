// Frame pacing. The engine and the drawing run on the JS thread, whose frames reach the screen a varying time after the
// display's refresh, so some refreshes got no frame and some got two. Play is not interactive once the ball is struck,
// so the JS thread makes each frame a little ahead of time (nextFrame) and the UI thread shows one on each display
// refresh (refresh). What the JS thread's timing varies by is taken up by the frames that wait.
export const AHEAD = 40; // ms of finished frames kept waiting: covers a JS thread that runs 2 frames late at 60 Hz
const STALL = 100; // ms: a JS thread this far behind (app in the background, a long task) does not replay the time it lost

export interface Pace { frame: number; next: number; owed: number; slow: number }
export const newPace = (frame: number): Pace => ({ frame, next: -1, owed: 0, slow: 0 });

// JS thread. The ms of play the next frame covers (the engine steps whole ms; the part left over carries on), or 0
// when enough frames wait already. now = the time in ms.
export function nextFrame(p: Pace, now: number): number {
  if (p.next < now - STALL) p.next = now;
  if (p.next > now + AHEAD) return 0;
  p.next += p.frame; p.owed += p.frame;
  const ms = Math.floor(p.owed); p.owed -= ms; return ms;
}
// JS thread. cost = the ms it took to make one frame. A phone that cannot make frames at the display's rate would
// show play in slow motion, so after 12 slow frames in a row the rate is halved (120 to 60 to 30 frames a second).
export function spent(p: Pace, cost: number) {
  p.slow = cost > 0.6 * p.frame ? p.slow + 1 : 0;
  if (p.slow >= 12 && p.frame < 30) { p.frame *= 2; p.slow = 0; }
}

export interface Slot<T> { pic: T; ms: number } // a finished frame and how long it stays on screen
// UI thread, on each display refresh. q = the frames that wait, left = the ms the frame on screen still has to show,
// dt = the ms since the last refresh. A refresh that comes late (or a display slower than the frames) takes more than
// one frame and shows the last, so play keeps to real time.
export function refresh<T>(q: Slot<T>[], left: number, dt: number) {
  'worklet';
  left = left <= 1 ? 0 : left - dt; // after a dry refresh nothing is owed: the time with no frame is not caught up
  let show: T | null = null, used = 0;
  while (left <= 1 && used < q.length) { left += q[used].ms; show = q[used++].pic; } // 1 ms early is on time: refresh times are not exact
  const dry = left <= 1; // no frame was ready: the next one shows as soon as it comes
  return { show, left, rest: used ? q.slice(used) : q, skipped: Math.max(0, used - 1), dry };
}
