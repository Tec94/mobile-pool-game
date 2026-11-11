'worklet'; // every function here also runs on the AI's worklet runtime (src/ai/think.ts): define a function before its callers
// 8-ball and 9-ball rules: WPA Rules of Play, effective 2026-10-21 (wpapool.com/rules). Rule numbers below are that
// edition's (8-ball is section 4, 9-ball section 5, fouls section 3). Pure TS: the screen feeds it what happened on
// a shot (Rec, built from the engine's events) and draws what it decides (State).
// Not built, because the engine or a phone cannot produce them: 3.4 foot on floor, 3.6 touched ball, 3.7 double hit,
// 3.8 push shot, 3.9 balls still moving (the screen does not let a shot start), 3.12, 3.14, 3.15, stalemate.
// shortcut: no called safety (1.7), no three-ball break rule (5.3c is a tournament regulation), a ball frozen to a
// rail counts as driven to it (2.7), and on an open table the 8 may not be hit first even when a whole group is
// already down (4.4, last sentence); a call names a pocket only, so any legal ball in the called pocket counts (1.7
// asks for ball and pocket); no spotting of the nearest ball when every legal ball is above the head string (1.6).
// Add them when a real game shows the need.
import { type Ball, type Ev, type Game, HOLES, P } from '../physics/engine.ts';

export type Hand = false | 'any' | 'kitchen'; // cue ball in hand: anywhere, or above the head string (the kitchen)
export type Player = 0 | 1;
// A decision the rules give to the player at the table. rack = rack again, with `turn` to break.
export interface Option { label: string; turn?: Player; hand?: Hand; rack?: boolean }
export interface State {
  game: Game; turn: Player; phase: 'break' | 'play' | 'over';
  breaker: Player;        // who broke this rack: the break alternates (1.3)
  balls: number[];        // object balls on the table
  solids: -1 | Player;    // 8-ball: who has balls 1 to 7; -1 = open table
  hand: Hand;
  callAll: boolean;       // 8-ball: true = WPA call shot (1.7), false = only the pocket of the 8 is called
  call: number;           // the called pocket (index into HOLES), -1 = none
  fouls: [number, number];// 9-ball: fouls in a row
  push: boolean;          // 9-ball: the next shot may be a push out (5.4)
  winner: -1 | Player;
  choice: Option[] | null;// the player to shoot picks one before play goes on
  spot: number[];         // balls the table must put back on the foot spot (1.5)
  note: string;           // the ruling on the last shot, for the screen
}
// What happened on one shot. first = number of the first ball the cue ball hit (-1 none); pots in the order they fell;
// rails = object balls driven to a rail; railAfter = some ball reached a rail after the first hit; crossed = the cue
// ball crossed the head string, or hit a ball on or below it (3.11); direct = the first ball hit went straight into a
// pocket (an "obvious" shot, 1.7); mixed = a kick, a combination or a kiss; banks = the rails that ball touched
// (0 head, 1 foot, 2 and 3 the long rails): a touch of a rail its pocket sits on is a shot down the rail, not a bank.
export interface Rec { first: number; pots: { id: number; pocket: number }[]; off: number[]; rails: number[]; railAfter: boolean; crossed: boolean; direct: boolean; mixed: boolean; banks: number[] }
export const newRec = (): Rec => ({ first: -1, pots: [], off: [], rails: [], railAfter: false, crossed: false, direct: false, mixed: false, banks: [] });

export const newGame = (game: Game, breaker: Player = 0, callAll = true): State => ({
  game, turn: breaker, breaker, phase: 'break', balls: Array.from({ length: game === 8 ? 15 : 9 }, (_, i) => i + 1), solids: -1,
  hand: 'kitchen', callAll, call: -1, fouls: [0, 0], push: false, winner: -1, choice: null, spot: [], note: '',
});

const nearest = (x: number, y: number) => { let k = 0, best = Infinity; HOLES.forEach((h, i) => { const d = (h[0] - x) ** 2 + (h[1] - y) ** 2; if (d < best) { best = d; k = i; } }); return [k, Math.sqrt(best)]; };
// The rail a point is at: 0 head (x = 0), 1 foot, 2 and 3 the long rails (y = 0, y = W). With `on`, that rail if the
// point is at it (a corner pocket is at two rails), else -1.
const side = (x: number, y: number, on = -1) => { const d = [x, P.L - x, y, P.W - y]; return on < 0 ? d.indexOf(Math.min(...d)) : d[on] < 0.05 ? on : -1; };
// Add one engine step's events to the record. ids[i] = the number of ball i; ball 0 is the cue ball.
export function record(r: Rec, ev: Ev[], B: Ball[], ids: number[]) {
  const head = P.L / 4, rail = (id: number) => { if (id && !r.rails.includes(id)) r.rails.push(id); if (r.first >= 0) r.railAfter = true; };
  for (const e of ev) {
    const id = ids[e.a];
    if (e.t === 'bb') {
      const other = ids[e.b!];
      if (!id && r.first < 0) { r.first = other; r.crossed ||= e.x > head || B[e.b!].x >= head; }
      else if (id === r.first || other === r.first) r.mixed = true; // a combination or a kiss: not an obvious shot
    } else if (e.t === 'rail') {
      if (!id && r.first < 0) { r.mixed = true; if (e.x > head) r.crossed = true; } // a kick is not an obvious shot
      if (id === r.first && nearest(e.x, e.y)[1] > 0.16) r.banks.push(side(e.x, e.y)); // nearer a pocket than this it is the jaws
      rail(id);
    } else if (e.t === 'pocket') {
      r.pots.push({ id, pocket: nearest(e.x, e.y)[0] }); rail(id); // 2.7: a potted ball counts as driven to a rail
      if (id && id === r.first && !r.mixed && r.banks.every(k => k === side(e.x, e.y, k))) r.direct = true;
    } else if (e.t === 'off') { r.off.push(id); rail(id); }
  }
}

// The shooter's own balls still on the table (8-ball, groups decided).
const own = (s: State, p: Player) => (s.solids < 0 ? [] : s.balls.filter(id => id !== 8 && (id < 8) === (s.solids === p)));
// 9-ball: the ball that must be hit first.
export const lowest = (s: State) => Math.min(...s.balls);
// The cue ball may hit ball id first on this shot (3.3): 9-ball the lowest ball; 8-ball on the break any ball, on an
// open table any ball but the 8, else the shooter's group, and the 8 once the group is down.
export function legalFirst(s: State, id: number) {
  if (s.game === 9) return id === lowest(s);
  const mine = own(s, s.turn);
  return s.phase === 'break' || (s.solids < 0 ? id !== 8 : mine.length ? mine.includes(id) : id === 8);
}
export const onEight = (s: State) => s.game === 8 && s.phase === 'play' && s.solids >= 0 && !own(s, s.turn).length;
// The shooter may name a pocket; on the 8 they must (4.8c makes an uncalled pocket a loss, so the screen insists).
export const canCall = (s: State) => s.game === 8 && s.phase === 'play' && (s.callAll || onEight(s));
export const setCall = (s: State, pocket: number): State => ({ ...s, call: pocket });

// Rule on a finished shot. push = the shooter declared a push out (9-ball, 5.4).
export function judge(s: State, r: Rec, push = false): State {
  const me = s.turn, opp = (1 - me) as Player, brk = s.phase === 'break', G = s.game;
  const pots = r.pots.filter(p => p.id), scratch = pots.length < r.pots.length || r.off.includes(0);
  const gone = (id: number) => pots.some(p => p.id === id) || r.off.includes(id);
  const mine = own(s, me), legal = (id: number) => legalFirst(s, id);
  // 3.1, 3.5, 3.3, 3.2, 3.11, 3.3, and the 9-ball break (5.3b). A push out suspends 3.2 and 3.3.
  const foul = scratch ? 'scratch' : r.off.length ? 'ball off the table' : push ? ''
    : r.first < 0 ? 'no ball hit' : !legal(r.first) ? 'wrong ball first'
    : s.hand === 'kitchen' && !r.crossed ? 'ball behind the head string played from behind it'
    : pots.length ? '' : brk ? (G === 9 && r.rails.length < 4 ? 'fewer than four balls to a rail' : '') : r.railAfter ? '' : 'no rail after contact';
  const n: State = { ...s, phase: 'play', balls: s.balls.filter(id => !gone(id)), hand: false, call: -1, push: false, choice: null, spot: [], note: foul && `Foul: ${foul}.`, fouls: [s.fouls[0], s.fouls[1]] };
  const spot = (id: number) => { n.balls.push(id); n.spot.push(id); };
  const pass = (hand: Hand = false) => { n.turn = opp; n.hand = hand; };
  const over = (w: Player, why: string) => { n.phase = 'over'; n.winner = w; n.hand = false; n.note = why; };

  if (G === 9) {
    if (gone(9) && (foul || push || r.off.includes(9))) spot(9); // 5.6
    if (foul) { pass('any'); if (++n.fouls[me] >= 3) over(opp, 'Three fouls in a row.'); return n; } // 5.8
    n.fouls[me] = 0;
    if (push) { pass(); n.note = 'Push out.'; n.choice = [{ label: 'Shoot' }, { label: 'Pass it back', turn: me }]; return n; }
    if (n.spot.length === 0 && gone(9)) over(me, 'The 9 is down.');
    else if (!pots.length) pass();
    n.push = brk;
    return n;
  }

  if (brk) { // 4.3
    if (gone(8)) spot(8);
    if (pots.some(p => p.id === 8)) {
      n.note += ' The 8 went down on the break.';
      if (foul) { pass(); n.choice = [{ label: 'Spot the 8, ball in hand behind the line', hand: 'kitchen' }, { label: 'Break again', rack: true }]; } // (f)
      else n.choice = [{ label: 'Spot the 8 and play on' }, { label: 'Break again', rack: true }]; // (e)
    } else if (foul) { // (g), (h)
      pass(scratch ? 'kitchen' : false);
      if (!scratch) n.choice = [{ label: 'Play it as it lies' }, { label: 'Ball in hand behind the line', hand: 'kitchen' }];
    } else if (!pots.length && r.rails.length < 4) { // (d)
      pass(); n.note = 'Illegal break: fewer than four balls to a rail.';
      n.choice = [{ label: 'Play it as it lies' }, { label: 'Rack again and break', rack: true }, { label: 'Make them break again', rack: true, turn: me }];
    } else if (!pots.length) pass(); // (c): a ball down and no foul keeps the breaker at the table, and the table stays open
    return n;
  }
  if (gone(8)) { // 4.8, and the win
    const win = !foul && onEight(s) && pots.some(p => p.id === 8 && p.pocket === s.call);
    over(win ? me : opp, win ? 'The 8 is down.' : `Lost the rack: the 8 ${r.off.includes(8) ? 'left the table' : foul ? 'went down on a foul' : !onEight(s) ? 'went down early' : 'went in a pocket that was not called'}.`);
    return n;
  }
  if (foul) { pass('any'); return n; } // 4.9
  // A pot counts when it is the called ball in the called pocket (1.7). With no call, WPA counts the obvious shot: the
  // ball that was hit first, straight in. With call shot off, every pot counts.
  const good = pots.filter(p => (s.call >= 0 ? p.pocket === s.call : !s.callAll || (r.direct && p.id === r.first)));
  if (pots.length && !good.length) n.note = 'Not called: the turn passes.';
  if (s.solids < 0) { // 4.4: the first ball legally potted decides the groups
    const p = good[0];
    if (p) { n.solids = p.id < 8 ? me : opp; n.note = `${p.id < 8 ? 'Solids' : 'Stripes'}.`; } else pass();
  } else if (!good.some(p => mine.includes(p.id))) pass(); // 4.5
  return n;
}

// The player to shoot took option i of the choice.
export function choose(s: State, i: number): State {
  const o = s.choice![i], turn = o.turn ?? s.turn;
  return o.rack ? newGame(s.game, turn, s.callAll) : { ...s, choice: null, turn, hand: o.hand ?? s.hand };
}

// --- Where balls may go ---------------------------------------------------------------------------------------------
const clear = (B: Ball[], i: number, x: number, y: number, gap = 0) => B.every((b, k) => k === i || !b.on || (b.x - x) ** 2 + (b.y - y) ** 2 >= (2 * P.R + gap) ** 2);
// May the cue ball lie here? On the playing surface, touching no ball, and above the head string when the rules say so.
const EDGE = 0.96 * P.R; // a ball at rest on a cushion: its centre is 0.963 R from the nose line
export const legalSpot = (B: Ball[], x: number, y: number, hand: Hand) =>
  x >= EDGE && x <= P.L - EDGE && y >= EDGE && y <= P.W - EDGE && (hand !== 'kitchen' || x < P.L / 4) && clear(B, 0, x, y);
// Move the cue ball in hand towards (x, y): held on the table, and slid round a ball in the way. False = it cannot go there.
export function moveCue(B: Ball[], x: number, y: number, hand: Hand) {
  const lim = (v: number, hi: number) => Math.max(P.R, Math.min(hi - P.R, v));
  x = lim(x, hand === 'kitchen' ? P.L / 4 + P.R - 1e-3 : P.L); y = lim(y, P.W);
  for (let k = 1; k < B.length; k++) { const b = B[k], dx = x - b.x, dy = y - b.y, d = Math.sqrt(dx * dx + dy * dy), m = 2 * P.R + 1e-4;
    if (b.on && d < m && d > 0) { x = b.x + dx / d * m; y = b.y + dy / d * m; break; } }
  if (!legalSpot(B, x, y, hand)) return false;
  Object.assign(B[0], { x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, z: 0, vz: 0, on: true });
  return true;
}
// Put the cue ball in hand on the table: where it lies if that is legal, else the free place nearest the head spot.
export function handCue(B: Ball[], hand: Hand) {
  const c = B[0], hx = P.L / 4 - 1e-3, hy = P.W / 2; if (c.on && legalSpot(B, c.x, c.y, hand)) return;
  let best = Infinity, bx = hx, by = hy;
  for (let x = hx; x >= P.R; x -= P.R / 2) for (let k = -Math.floor(hy / P.R * 2) + 2; hy + k * P.R / 2 <= P.W - P.R; k++) {
    const y = hy + k * P.R / 2, d = (x - hx) ** 2 + (y - hy) ** 2; if (d < best && legalSpot(B, x, y, hand)) { best = d; bx = x; by = y; } }
  Object.assign(c, { x: bx, y: by, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, z: 0, vz: 0, on: true });
}
// 1.5: spot ball i on the long string, as near the foot spot as it fits, towards the foot rail first; a hair off the cue ball.
export function spotBall(B: Ball[], i: number) {
  const y = P.W / 2, x0 = 0.75 * P.L, ok = (x: number) => clear(B, i, x, y) && (!B[0].on || (B[0].x - x) ** 2 + (B[0].y - y) ** 2 >= (2 * P.R + 1e-3) ** 2);
  let x = x0; while (x <= P.L - P.R && !ok(x)) x += 5e-4;
  if (x > P.L - P.R) { x = x0; while (x > P.R && !ok(x)) x -= 5e-4; }
  Object.assign(B[i], { x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, z: 0, vz: 0, on: true });
}
