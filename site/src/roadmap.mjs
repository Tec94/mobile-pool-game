// The roadmap is a nine-ball run-out: one ball a step, potted in order. The balls before NOW are down, the cue waits
// on the ball at NOW, the rest stand on the table. To move the roadmap on, change NOW (and STEPS, if the plan changed).
import { CUE, HOLES, P } from '../../src/physics/engine.ts';

// name = its lines as printed on the cloth
export const STEPS = [
  { name: ['Real', 'physics'] },
  { name: ['8-ball and', '9-ball'] },
  { name: ['An AI that', 'banks'] },
  { name: ['Tournaments'] },
  { name: ['26 wild', 'cues'] },
  { name: ['App Store', 'review'] },
  { name: ['Out on', 'iPhone'] },
  { name: ['Leaderboards'] },
  { name: ['Online', 'play'] },
];
export const NOW = 5; // index into STEPS: 5 = the 6 ball
export const when = i => (i < NOW ? 'Done' : i === NOW ? 'Now' : i === NOW + 1 ? 'Next' : 'Later');

// The layout and the run: found by a search through the engine (every shot pots its ball with room to spare and
// leaves the next one on), checked by test/roadmap.test.mjs. BALLS = the cue ball, then the 1 to the 9.
export const BALLS = [[1.092, 0.434], [1.539, 0.654], [1.117, 0.694], [2.026, 0.17], [1.528, 0.265], [1.809, 0.716], [0.227, 0.163], [0.145, 0.462], [0.613, 0.606], [1.302, 0.89]];
// one row a shot: the pocket (HOLES index), power 0..1, tip height (-1 low to 1 high)
export const PLAN = [[3, 0.75, -0.7], [5, 0.5, -0.4], [1, 0.75, -0.7], [0, 0.5, -0.7], [3, 0.3, 0.4], [0, 0.3, 0.4], [2, 0.4, -0.7], [5, 0.4, 0], [3, 0.3, 0.7]];

// Where a ball is sent to drop in pocket h: just inside its mouth.
export const mouth = h => { const [x, y] = HOLES[h], in_ = 0.012; return h > 3 ? [x, y < 0 ? -0.01 : P.W + 0.01] : [x < 0 ? in_ : P.L - in_, y < 0 ? in_ : P.W - in_]; };
// Shot k (0 = the 1 ball) from where the cue ball lies: aimed through the ghost ball, as a player lines it up.
export function shotFor(B, k, plan = PLAN[k]) {
  const c = B[0], o = B[k + 1], t = mouth(plan[0]), d = Math.hypot(t[0] - o.x, t[1] - o.y);
  return { ang: Math.atan2(o.y - (t[1] - o.y) / d * 2 * P.R - c.y, o.x - (t[0] - o.x) / d * 2 * P.R - c.x), speed: plan[1] * CUE.maxSpeed, a: 0, b: plan[2] * CUE.tipLimit, elev: 0 };
}
