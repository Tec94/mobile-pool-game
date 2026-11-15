// The three shots the page's table starts from. Each one pots its last ball as set (test/presets.test.mjs runs them
// through the engine), so the first press of Shoot always works; after that the visitor changes what they like.
import { CUE, P } from '../../src/physics/engine.ts';

export const ball = (x, y) => ({ x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true });
const hole = [P.L - 0.01, 0.01], cue = [0.55, 0.8], on = f => [cue[0] + (hole[0] - cue[0]) * f, cue[1] + (hole[1] - cue[1]) * f];
const to = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
const mc = [0.5, 0.3], mo = [1.9, 0.12], mid = [mc[0] + (mo[0] - mc[0]) * 0.45, mc[1] + (mo[1] - mc[1]) * 0.45];

// balls = [x, y] of the cue ball first and the ball to pot last; ids = their numbers; base = the angle from the cue
// ball to the ball to pot; off = degrees the aim is turned from it; x, y = tip offset as a part of the miscue limit.
export const PRESETS = [
  { name: 'Level', say: 'Low on the ball: it stops, then comes back.', balls: [cue, on(0.6)], ids: [0, 1], base: to(cue, hole), off: 0, power: 0.55, elev: 0, x: 0, y: -0.7 },
  { name: 'Jump', say: 'Raise the cue and hit down: the ball hops the 3.', balls: [cue, on(0.16), on(0.6)], ids: [0, 3, 1], base: to(cue, hole), off: 0, power: 1, elev: 34, x: 0, y: 0 },
  { name: 'Massé', say: 'Stand the cue up, hit one side: the ball bends round the 3.', balls: [mc, mid, mo], ids: [0, 3, 1], base: to(mc, mo), off: 21, power: 0.9, elev: 60, x: 0.6, y: 0 },
];
export const POCKET = 1; // HOLES index of the pocket every preset plays to: the corner at x = L, y = 0

// The engine shot for a set of controls.
export const shotOf = s => ({ ang: s.base + s.off * Math.PI / 180, speed: s.power * CUE.maxSpeed, a: s.x * CUE.tipLimit, b: s.y * CUE.tipLimit, elev: s.elev * Math.PI / 180 });
