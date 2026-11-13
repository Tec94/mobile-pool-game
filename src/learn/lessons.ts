// Learn mode (screens spec, s-learn and the lesson screen): thirteen lessons, all open from the start. Each is a fixed
// table and one goal, played in three steps: watch (the reference shot plays itself), guided (its spin and power are
// set and named), solo (three passes in a row). Pure TS: the screen feeds the engine's events in and draws the verdict.
// The reference shot of every lesson is checked to pass on the engine (lessons.test.mjs), so watch never fails.
import { type Ball, CUE, type Ev, step, strike } from '../physics/engine.ts';
import { ENDS, newRec, type Rec, record } from '../rules/rules.ts';
import { shotTip, type Tip } from '../render/tip.ts';

export interface Goal {
  pot?: number;       // this ball must go in
  pocket?: number;    // ...in this pocket (index into HOLES: 0 to 3 corners, 4 and 5 sides)
  first?: number;     // the cue ball must hit this ball first; default the ball to pot
  kick?: boolean;     // the cue ball must reach a cushion before it hits a ball
  safe?: boolean;     // nothing goes in, and a ball reaches a cushion after the hit (a legal safety)
  zone?: [number, number, number]; // the cue ball must stop inside this ring: centre x, y and radius, metres
}
export interface Lesson {
  id: string; title: string;
  say: string;        // the goal, in one line
  how: string;        // the guided step: what the spin and power are for
  cue: [number, number]; balls: [number, number, number][]; // cue ball, and [number, x, y] of each object ball
  goal: Goal;
  ref: { ang: number; power: number; tip: Tip }; // the reference shot: aim in radians, power 0 to 1 of the cue's top speed
  short?: string; long?: string; // what to change when the cue ball stops before the ring, or runs past it
}
export type Stage = 'watch' | 'guided' | 'solo';
export const SOLO_RUN = 3; // passes in a row that finish a lesson
export const LESSON_PAY = { xp: 50, coins: 0 }; // the first pass only; replays are free practice

// Table frame: x along the table from the head rail (0) to the foot rail (P.L = 2.2352), y across it (P.W = 1.1176).
export const LESSONS: Lesson[] = [
  { id: 'aim', title: 'Aim and the ghost ball', say: 'Pot the 1 in the far corner.', how: 'Aim the cue ball at the ghost ball the guide draws, the spot it must reach to send the 1 in.',
    cue: [1.0, 0.45], balls: [[1, 1.8, 0.8]], goal: { pot: 1, pocket: 3 }, ref: { ang: 0.398, power: 0.4, tip: { x: 0, y: 0, elev: 0 } } },
  { id: 'power', title: 'Power control', say: 'Pot the 1 and stop the cue ball in the ring.', how: 'Soft power. Watch the rail: the cue ball only has to roll as far as the ring.',
    cue: [0.9, 0.56], balls: [[1, 1.7, 0.9]], goal: { pot: 1, pocket: 3, zone: [1.971, 1.079, 0.16] }, ref: { ang: 0.4067, power: 0.3, tip: { x: 0, y: 0, elev: 0 } },
    short: 'Use a little more power.', long: 'Use a little less power.' },
  { id: 'follow', title: 'Follow: top spin', say: 'Pot the 1 and follow the cue ball into the ring.', how: 'Hit high on the cue ball. Top spin keeps it rolling forward after the hit.',
    cue: [1.0, 0.4], balls: [[1, 1.7, 0.85]], goal: { pot: 1, pocket: 3, zone: [2.148, 0.743, 0.16] }, ref: { ang: 0.5822, power: 0.45, tip: { x: 0, y: 0.6, elev: 0 } },
    short: 'Hit higher on the cue ball, or a little harder.', long: 'Hit a little softer, or less high.' },
  { id: 'draw', title: 'Draw: back spin', say: 'Pot the 1 and draw the cue ball back into the ring.', how: 'Hit low on the cue ball with firm power. Softer and the back spin wears off before the cue ball arrives.',
    cue: [1.0, 0.4], balls: [[1, 1.7, 0.85]], goal: { pot: 1, pocket: 3, zone: [1.65, 1.035, 0.16] }, ref: { ang: 0.584, power: 0.6, tip: { x: 0, y: -0.7, elev: 0 } },
    short: 'Hit lower on the cue ball, or harder.', long: 'Hit softer, or less low.' },
  { id: 'stun', title: 'Stun: stop the cue ball', say: 'Pot the 1 and stop the cue ball dead in the ring.', how: 'Hit a little below centre, firm. The cue ball slides into the 1 with no spin and stops.',
    cue: [1.444, 0.558], balls: [[1, 1.85, 0.85]], goal: { pot: 1, pocket: 3, zone: [1.799, 0.841, 0.1] }, ref: { ang: 0.63, power: 0.5, tip: { x: 0, y: -0.5, elev: 0 } },
    short: 'Hit a little lower, or firmer.', long: 'If it rolled on, hit lower. If it drew back, hit nearer the centre.' },
  { id: 'side', title: 'Side spin', say: 'Pot the 1 and bring the cue ball off the cushion into the ring.', how: 'Side spin changes the angle the cue ball takes off a cushion. Hit on the side the guide marks.',
    cue: [1.4, 0.5], balls: [[1, 1.85, 0.85]], goal: { pot: 1, pocket: 3, zone: [1.904, 0.711, 0.16] }, ref: { ang: 0.6558, power: 0.5, tip: { x: 0.5, y: 0, elev: 0 } },
    short: 'More side, or a little more power.', long: 'Less side, or a little less power.' },
  // Banks off the y = W rail, so the cue lies away from the lesson strip in landscape.
  { id: 'bank', title: 'One-cushion banks', say: 'Bank the 1 off a lit cushion into the far side pocket.', how: 'Send the 1 into the cushion so it comes off at the same angle it went in, a little shorter at speed.',
    cue: [0.7, 0.5176], balls: [[1, 0.76, 0.8176]], goal: { pot: 1, pocket: 4 }, ref: { ang: 1.3848, power: 0.45, tip: { x: 0, y: 0, elev: 0 } } },
  { id: 'kick', title: 'Kick shots', say: 'The 2 is in the way. Send the cue ball off a cushion to hit the 1 first.', how: 'Pick the point on the cushion halfway between the cue ball and the 1, mirrored, and aim there.',
    cue: [0.7, 0.56], balls: [[2, 1.2, 0.56], [1, 1.7, 0.56]], goal: { first: 1, kick: true }, ref: { ang: -0.4538, power: 0.45, tip: { x: 0, y: 0, elev: 0 } } },
  { id: 'combo', title: 'Combos', say: 'Hit the 1 into the 2 and pot the 2.', how: 'Find the ghost ball for the 2 first, then send the 1 to that spot.',
    cue: [1.2, 0.5], balls: [[1, 1.853, 0.85], [2, 1.95, 0.92]], goal: { first: 1, pot: 2, pocket: 3 }, ref: { ang: 0.475, power: 0.4, tip: { x: 0, y: 0, elev: 0 } } },
  { id: 'position', title: 'Position play', say: 'Pot the 1 and leave the cue ball in the ring for the 2.', how: 'Pick where the cue ball must stop before the shot, then choose spin and power to get there.',
    cue: [0.8, 0.5], balls: [[1, 1.75, 0.95], [2, 1.2, 0.2]], goal: { pot: 1, pocket: 3, zone: [2.025, 0.901, 0.16] }, ref: { ang: 0.4524, power: 0.5, tip: { x: 0, y: -0.4, elev: 0 } },
    short: 'More power, or more draw.', long: 'Less power.' },
  { id: 'safety', title: 'Safeties', say: 'Hit the 1 softly, pot nothing, and hide the cue ball in the ring behind the 2.', how: 'A safety still needs a ball to reach a cushion after the hit. Soft power, thin hit.',
    cue: [0.6, 0.5], balls: [[1, 1.6, 0.9], [2, 1.75, 0.35]], goal: { first: 1, safe: true, zone: [1.998, 0.626, 0.16] }, ref: { ang: 0.3556, power: 0.3, tip: { x: 0, y: 0, elev: 0 } },
    short: 'Use a little more power.', long: 'Use a little less power.' },
  { id: 'jump', title: 'Jump shots', say: 'Jump the cue ball over the 2 and hit the 1 first.', how: 'Raise the back of the cue into the jump zone and hit hard. The cue ball hops over the 2.',
    cue: [0.9, 0.56], balls: [[2, 1.12, 0.56], [1, 1.6, 0.56]], goal: { first: 1 }, ref: { ang: 0, power: 0.9, tip: { x: 0, y: 0, elev: 40 } } },
  { id: 'masse', title: 'Massé: curve the cue ball', say: 'Curve the cue ball around the 2 to hit the 1 first.', how: 'Raise the cue into the massé zone and hit to one side of the cue ball. It curves toward that side.',
    cue: [0.9, 0.56], balls: [[2, 1.1, 0.56], [1, 1.45, 0.56]], goal: { first: 1 }, ref: { ang: -0.524, power: 0.5, tip: { x: 0.6, y: 0, elev: 65 } } },
];

// The table of a lesson: ball 0 is the cue ball. ids[i] = the number of ball i.
export function lessonTable(l: Lesson): { B: Ball[]; ids: number[] } {
  const mk = (x: number, y: number): Ball => ({ x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true });
  return { B: [mk(...l.cue), ...l.balls.map(([, x, y]) => mk(x, y))], ids: [0, ...l.balls.map(([id]) => id)] };
}

// The record of a lesson shot: the rules' record (its cush says which cushions each ball touched), whether the cue ball
// reached a cushion before any ball (a kick), and where the cue ball was when it first hit a ball.
export type LessonRec = Rec & { kick: boolean; hit: [number, number] | null };
export const newLessonRec = (): LessonRec => ({ ...newRec(), kick: false, hit: null });
export function noteLesson(r: LessonRec, ev: Ev[], B: Ball[], ids: number[]) {
  for (const e of ev) {
    if (e.t === 'rail' && !ids[e.a] && !r.hit) r.kick = true; // r.first is only set by record() below
    if (e.t === 'bb' && !ids[e.a] && !r.hit) r.hit = [B[0].x, B[0].y];
  }
  record(r, ev, B, ids);
}

// The two cushions a bank table lights (Jack: "highlight the cushions the user has to bank from, randomize it and
// select 2 adjacent cushions"): the one its reference shot banks the ball off, so the table stays solvable, and one
// of its two neighbours, picked by the table's id (FNV-1a), so a table (and the daily table that plays it) always
// lights the same pair. null = the table wants no bank. The bank tables: this lesson and the Banks scenarios.
// Worked out once per table, by playing the reference shot on the engine up to its first bank. The cache keys on the
// table itself, not its id: the scenario generator judges many tables before they have one.
const LIT = new WeakMap<Lesson, number[] | null>();
export function litCushions(l: Lesson): number[] | null {
  if (l.id !== 'bank' && (l as Lesson & { type?: string }).type !== 'bank') return null;
  if (!LIT.has(l)) {
    const { B, ids } = lessonTable(l), r = newLessonRec(), ev: Ev[] = [], at = () => r.cush.find(c => c[0] === l.goal.pot)?.[1];
    strike(B[0], { ang: l.ref.ang, speed: l.ref.power * CUE.maxSpeed, ...shotTip(l.ref.tip) });
    for (let i = 0; i < 40000 && at() === undefined; i++) { ev.length = 0; const mv = step(B, ev); noteLesson(r, ev, B, ids); if (!mv) break; }
    // bit 8 of the hash: bit 0 is only the parity of the id's letters, and the top bits barely change from one table
    // number to the next. Never a cushion that ends at the target pocket: a ball comes off it away from that pocket, so
    // a touch there would be a pot along the rail that brushed its nose, not a bank.
    const k = at(), h = [...l.id].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 0x01000193), 0x811c9dc5) >>> 0, d = h >>> 8 & 1 ? 1 : 5, n = (k ?? 0) + d;
    LIT.set(l, k === undefined ? null : [k, (ENDS[n % 6].includes(l.goal.pocket ?? -1) ? k + 6 - d : n) % 6]);
  }
  return LIT.get(l)!;
}

// Did the shot pass, and if not, what to change. cue = the cue ball at rest.
export function verdict(l: Lesson, r: LessonRec, cue: Ball): { ok: boolean; say: string } {
  const g = l.goal, want = g.first ?? g.pot ?? -1, no = (say: string) => ({ ok: false, say });
  if (r.pots.some(p => !p.id) || r.off.includes(0)) return no(`The cue ball went in. ${l.long ?? 'Change the spin or the power.'}`);
  if (r.first < 0) return no('The cue ball hit nothing. Use more power, or follow the guide to the ghost ball.');
  if (g.kick && !r.kick) return no('Go off a cushion first: a kick reaches the rail before any ball.');
  if (r.first !== want) return no(`The cue ball hit the ${r.first} first. ${l.how}`);
  if (g.pot !== undefined) {
    const p = r.pots.find(q => q.id === g.pot);
    if (!p) return no(`The ${g.pot} missed the pocket. Watch where the guide sends it.`);
    if (g.pocket !== undefined && p.pocket !== g.pocket) return no(`The ${g.pot} went in the wrong pocket. Aim for the marked one.`);
    const lit = litCushions(l);
    if (lit && !r.cush.some(([id, k]) => id === g.pot && lit.includes(k))) return no('Bank it off a lit cushion.');
  }
  if (g.safe && r.pots.length) return no('A ball went in. A safety leaves the balls on the table.');
  if (g.safe && !r.railAfter) return no('No ball reached a cushion after the hit: that is a foul. A touch more power.');
  if (g.zone) {
    // short or long is measured along the line from the hit to the ring: a draw comes back toward the shooter
    const [zx, zy, zr] = g.zone, [hx, hy] = r.hit ?? l.cue, ux = zx - hx, uy = zy - hy, along = ((cue.x - hx) * ux + (cue.y - hy) * uy) / Math.hypot(ux, uy);
    if (Math.hypot(cue.x - zx, cue.y - zy) > zr) return no(along < 0 ? `The cue ball went the wrong way. ${l.how}`
      : along < Math.hypot(ux, uy) ? `The cue ball stopped short of the ring. ${l.short ?? ''}`.trim() : `The cue ball ran past the ring. ${l.long ?? ''}`.trim());
  }
  return { ok: true, say: 'That is the shot.' };
}

// The ids of the passed lessons from the saved text. Anything that is not a known lesson id is dropped, so a damaged
// save or one from another version still loads.
export function readDone(text: string | null): string[] {
  let o: unknown = null;
  try { o = JSON.parse(text ?? 'null'); } catch {}
  return Array.isArray(o) ? LESSONS.map(l => l.id).filter(id => o.includes(id)) : [];
}
export const PENCIL_AT = 10; // lessons passed that unlock the Giant Pencil cue (progression design)
