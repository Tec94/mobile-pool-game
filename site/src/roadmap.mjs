// The roadmap is a nine-ball run-out: one ball a step, potted in order. The balls before NOW are down, the cue waits
// on the ball at NOW, the rest stand on the table. To move the roadmap on, change NOW and SINCE (and STEPS, if the plan changed).
// The status is also in public/index.html (the chip by the name, the footer) and in public/og.png: change those too. test/roadmap.test.mjs holds the chip to NOW.
import { CUE, HOLES, P } from '../../src/physics/engine.ts';

export const STEPS = ['Real physics', '8-ball and 9-ball', 'An AI that banks', 'Scenarios and lessons', 'Tournaments', 'App Store review', 'Out on iPhone', 'Online play', 'Leaderboards'];
// What the steps after the one in hand hold, a line each, shown with their rows. No dates: none are set.
export const PLANS = {
  6: ['The waitlist gets an email at launch.', 'Every cue is won by playing. None are sold.'],
  7: ['Invite a friend.', 'Or get matched with a stranger.', 'Ranked games and online tournaments.', 'In 8-ball and 9-ball.'],
  8: ['Daily Table scores, scenario stars, tournament wins and win streaks.', 'Friends and global boards.', 'Out together with online play.'],
};
// The rest of the plan, in one block with no ball: a heading and its lines each.
export const ALSO = [
  ['Sign-in', ['Optional: Apple, Google or email.']],
  ['Tip jar', ['Through Apple, if you want to back the game.', 'Tips unlock nothing. The game stays one price.']],
  ['iPad and Android', ['The same game on more screens.']],
  ['More cues and modes', ['New cues to win, new ways to play.']],
];
export const NOW = 5; // index into STEPS: 5 = the 6 ball
export const SINCE = 'Sent 20 Nov'; // the tag of the step in hand
export const FILM = 2; // how many of the done steps are potted before the visitor's eyes; the ones before are down already
// The film starts when the row of the step in hand and the whole table are in view together (the row may be a tenth
// under the fold); on a screen too short for both, when the whole table is in view, or the row and most of the table. In px, from the top of the screen.
export const inView = (top, bottom, row, rowH, vh) => {
  const rowIn = row < vh + rowH * 0.1 + 1, fits = row - top <= vh; // fits: the table and the row can be on the screen together
  return top > -4 ? rowIn || (!fits && bottom < vh + 4) : rowIn && top > (fits ? -0.25 : -0.4) * (bottom - top); // a little of the table off the top; more on a screen too short for both
};
// A visitor who leaves the film before its first ball drops gets the film again when they come back; later, the end.
export const replays = (k, firstDown) => k === NOW - FILM && !firstDown;
export const when = i => (i < NOW ? 'Done' : i === NOW ? SINCE : i === NOW + 1 ? 'Next' : 'Later');

// The layout and the run: built shot by shot through the engine, so that every shot pots its ball with the aim up to
// 0.3 degrees off and leaves the next one on, with room on the table for the cue that waits on the 6 or the 7. test/roadmap.test.mjs runs them. BALLS = the cue ball, then the 1 to the 9.
export const BALLS = [[0.712, 0.807], [0.906, 0.506], [1.684, 0.387], [2.083, 0.732], [2.041, 1.006], [1.432, 0.656], [1.135, 0.323], [0.306, 0.189], [0.087, 0.914], [0.192, 0.382]];
// one row a shot: the pocket (HOLES index), power 0..1, tip height (-1 low to 1 high)
export const PLAN = [[4, 0.5, -0.4], [1, 0.75, 0], [3, 0.35, -0.4], [3, 0.4, -0.8], [4, 0.25, -0.2], [4, 0.3, -0.6], [0, 0.25, -0.4], [2, 0.25, 0], [0, 0.5, -0.8]];

// Where a ball is sent to drop in pocket h: just inside its mouth.
export const mouth = h => { const [x, y] = HOLES[h], in_ = 0.012; return h > 3 ? [x, y < 0 ? -0.01 : P.W + 0.01] : [x < 0 ? in_ : P.L - in_, y < 0 ? in_ : P.W - in_]; };
// Shot k (0 = the 1 ball) from where the cue ball lies: aimed through the ghost ball, as a player lines it up.
export function shotFor(B, k, plan = PLAN[k]) {
  const c = B[0], o = B[k + 1], t = mouth(plan[0]), d = Math.hypot(t[0] - o.x, t[1] - o.y);
  return { ang: Math.atan2(o.y - (t[1] - o.y) / d * 2 * P.R - c.y, o.x - (t[0] - o.x) / d * 2 * P.R - c.x), speed: plan[1] * CUE.maxSpeed, a: 0, b: plan[2] * CUE.tipLimit, elev: 0 };
}
