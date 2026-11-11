'worklet'; // think() runs on the AI's worklet runtime (src/ai/think.ts): define a function before its callers
// The AI's turn in a match: what the AI seat does for a rules State and a table. Pure: no React. think() is the whole
// turn (break, group, cue ball in hand, call, shot); choiceFor() answers a decision the rules hand it; potPay() pays
// the human's pots in a match against the AI.
import { type Ball, CUE, HOLES, P, type Shot } from '../physics/engine.ts';
import { canCall, legalSpot, onEight, type Hand, type Rec, type State } from '../rules/rules.ts';
import { aiShot } from './aim.ts';
import { chooseGroup, type Cand, enumerate, makeProb, NINE, type Obj, type Pick, rng, SIGMA_REF, SOLIDS, STRIPES, TIERS } from './shot-ai.ts';
import { type Pay, shotPay } from '../progress/pay.ts';

// The AI's turn. at = where it puts the cue ball in hand (null = where it lies); call = the pocket it calls (-1 none);
// safety = it played a safety, for safetiesInRow.
export interface Move { shot: Shot; at: [number, number] | null; call: number; safety: boolean }
const mm = (B: Ball[], ids: number[]): Obj[] => B.flatMap((b, i) => (i && b.on ? [{ id: ids[i], x: b.x * 1000, y: b.y * 1000 }] : []));
const nearHole = (x: number, y: number) => { let k = 0, d = Infinity; HOLES.forEach((h, i) => { const e = (h[0] - x) ** 2 + (h[1] - y) ** 2; if (e < d) { d = e; k = i; } }); return k; };
// The pocket of a pot (picker units, mm) as an index into HOLES: the end of the path of the potted ball.
export const holeOf = (c: { paths: { x: number; y: number }[][] }) => { const p = c.paths[c.paths.length - 1], q = p[p.length - 1]; return nearHole(q.x / 1000, q.y / 1000); };

// The groups of player p, its own and the opponent's, for the picker. 8-ball open table: null (the AI picks with chooseGroup).
export function groupsOf(s: State, p: number): [number[], number[]] | null {
  if (s.game === 9) return [NINE, NINE];
  if (s.solids < 0) return null;
  return s.solids === p ? [SOLIDS, STRIPES] : [STRIPES, SOLIDS];
}
// The balls player p may hit first, as rules.ts has them. group null = open table: any ball but the 8.
const legalIds = (s: State, group: number[] | null) =>
  s.game === 9 ? [Math.min(...s.balls)] : !group ? s.balls.filter(id => id !== 8) : s.balls.some(id => group.includes(id)) ? s.balls.filter(id => group.includes(id)) : [8];

// No ball (but the ones in `skip`) lies within two radii of the segment a-b.
function lane(B: Ball[], ax: number, ay: number, bx: number, by: number, skip: number[]) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
  return B.every((o, i) => skip.includes(i) || !o.on || (() => { const t = Math.max(0, Math.min(1, ((o.x - ax) * dx + (o.y - ay) * dy) / l2)); return (o.x - ax - dx * t) ** 2 + (o.y - ay - dy * t) ** 2 >= (2 * P.R) ** 2; })());
}
// Cue ball in hand: a spot straight behind a legal ball on a clear line to a pocket, the shorter the shot the better.
// null = no such spot is legal (it stays where the rules put it). shortcut: straight-in lines only, scored by length,
// not by the picker; good enough to give the picker an easy pot, add the picker's value if the AI places badly.
export function placeCue(B: Ball[], ids: number[], hand: Hand, legal: number[]): [number, number] | null {
  let best = -Infinity, at: [number, number] | null = null;
  for (const id of legal) {
    const i = ids.indexOf(id), b = B[i];
    if (i < 0 || !b.on) continue;
    HOLES.forEach((h, k) => {
      const dx = h[0] - b.x, dy = h[1] - b.y, l = Math.sqrt(dx * dx + dy * dy), ux = dx / l, uy = dy / l;
      if (k >= 4 && Math.abs(uy) < 0.7) return; // a side pocket takes no ball from a shallow angle
      if (!lane(B, b.x, b.y, h[0], h[1], [0, i])) return;
      const gx = b.x - 2 * P.R * ux, gy = b.y - 2 * P.R * uy;
      for (const d of [0.15, 0.35, 0.6]) {
        const x = gx - d * ux, y = gy - d * uy, score = -(d + l);
        if (score > best && legalSpot(B, x, y, hand) && lane(B, x, y, gx, gy, [0, i])) { best = score; at = [x, y]; }
      }
    });
  }
  return at;
}

// The break: full break speed from where the cue ball lies, at the 1 (the apex ball in both racks), with a little aim
// noise so racks differ.
export function breakShot(B: Ball[], ids: number[], rnd: () => number): Shot {
  const c = B[0], o = B[ids.indexOf(1)];
  return { ang: Math.atan2(o.y - c.y, o.x - c.x) + (rnd() - 0.5) * 0.01, speed: CUE.breakSpeed * (0.85 + 0.15 * rnd()), a: 0, b: 0 };
}

// The pocket to call: the pocket of the pick when it is a pot. On the 8 a call is a must, so a safety or a foul shot
// still calls the pocket nearest the 8 (a miss loses nothing).
export function callFor(s: State, pick: Pick, B: Ball[], ids: number[]) {
  if (!canCall(s)) return -1;
  if (pick.type !== 'safety' && pick.type !== 'foul') return holeOf(pick);
  if (!onEight(s)) return -1;
  const e = B[ids.indexOf(8)]; return nearHole(e.x, e.y);
}

// The AI's whole turn, it being player s.turn. B is changed (the cue ball in hand goes to its spot): pass a copy.
// tier = index into TIERS. safeties = safetiesInRow for aiShot (see nextSafeties).
export function think(B: Ball[], ids: number[], s: State, tier: number, seed: number, safeties: number): Move {
  const rnd = rng(seed), T = TIERS[tier];
  if (s.phase === 'break') return { shot: breakShot(B, ids, rnd), at: null, call: -1, safety: false };
  // open table: the group it would pick from where the cue ball lies now. By value: on the runtime its SOLIDS is a copy
  const g = groupsOf(s, s.turn) ?? (chooseGroup({ x: B[0].x * 1000, y: B[0].y * 1000 }, mm(B, ids), T)[0] === 1 ? [SOLIDS, STRIPES] : [STRIPES, SOLIDS]);
  // From the kitchen a ball behind the head string may not be hit first (rules.ts, crossed): leave those out, unless no other is left.
  // shortcut: 9-ball keeps NINE whole (the picker knows it by its length), so a lowest ball behind the line is still a foul.
  const ahead = (l: number[]) => { const k = s.hand === 'kitchen' ? l.filter(id => { const b = B[ids.indexOf(id)]; return b && b.on && b.x >= P.L / 4; }) : l; return k.length ? k : l; };
  if (s.hand) { // place first, then shoot from there
    const at = placeCue(B, ids, s.hand, ahead(legalIds(s, g[0])));
    if (at) { B[0].x = at[0]; B[0].y = at[1]; }
  }
  const { shot, pick } = aiShot(B, ids, s.game === 9 ? g[0] : ahead(g[0]), g[1], T, rnd, safeties);
  return { shot, at: s.hand ? [B[0].x, B[0].y] : null, call: callFor(s, pick, B, ids), safety: pick.type === 'safety' };
}

// The AI's move when think() itself fails: a soft hit at the nearest legal ball (as aiShot's 'foul' pick), so the match goes on.
export function softMove(B: Ball[], ids: number[], s: State): Move {
  const c = B[0], g = groupsOf(s, s.turn);
  let ang = 0, d = Infinity;
  for (const id of legalIds(s, g && g[0])) { const b = B[ids.indexOf(id)], e = b && b.on ? Math.hypot(b.x - c.x, b.y - c.y) : Infinity; if (e < d) { d = e; ang = Math.atan2(b.y - c.y, b.x - c.x); } }
  return { shot: { ang, speed: 1, a: 0, b: 0 }, at: null, call: callFor(s, { type: 'foul' }, B, ids), safety: false }; // 1 m/s: aim.ts SOFT
}

// A decision the rules give the AI: take ball in hand when an option gives it, else the first option (shoot on after
// a push out, play the table as it lies, spot the 8 and play on). shortcut: a fixed rule, no look at the table.
export const choiceFor = (s: State) => Math.max(0, s.choice?.findIndex(o => o.hand) ?? 0);

// safetiesInRow for decide(): visits in a row that ended with a safety, or 2 once the side played four in the rack.
export interface Safeties { row: number; rack: number }
export const nextSafeties = (k: Safeties, safety: boolean): Safeties => (safety ? { row: k.row + 1, rack: k.rack + 1 } : { row: 0, rack: k.rack });
export const safetiesArg = (k: Safeties) => (k.rack >= 4 ? 2 : Math.min(2, k.row));

// Every pot the shooter (s.turn) has on this table, for potPay. Picker units (mm).
export function candsFor(B: Ball[], ids: number[], s: State): Cand[] {
  const g = groupsOf(s, s.turn), legal = legalIds(s, g && g[0]);
  return enumerate({ x: B[0].x * 1000, y: B[0].y * 1000 }, mm(B, ids), legal, s.game === 9 ? s.balls : legal);
}

// The human's pots on one shot against the AI (progress/pay.ts): each pot is matched to a candidate the picker found
// before the strike (same ball, same pocket) for its pRef; none = a fluke. before/after = the State around judge();
// run = pots in a row this visit before the shot; tier = TIERS index. Returns the pay, the run after the shot, and the
// shooter's own balls potted (for matchPay; the 8 and a foul do not count).
export function potPay(cands: Cand[], r: Rec, before: State, after: State, run: number, tier: number): { pay: Pay; run: number; own: number } {
  const pay = { xp: 0, coins: 0 }, foul = after.note.startsWith('Foul'), me = before.turn;
  const mine = (id: number) => before.game === 9 || after.solids < 0 || id === 8 || (id < 8) === (after.solids === me);
  const pots = r.pots.filter(p => p.id);
  for (const p of pots) {
    const c = cands.find(k => k.ball === p.id && holeOf(k) === p.pocket);
    const g = shotPay({ pRef: c ? makeProb(c.tol, SIGMA_REF) : null, type: c?.type, run, brk: before.phase === 'break', hand: !!before.hand, foul, theirs: !mine(p.id), tier: tier + 1 });
    pay.xp += g.xp; pay.coins += g.coins;
  }
  return { pay, run: after.turn === me && !foul ? run + pots.length : 0, own: foul ? 0 : pots.filter(p => p.id !== 8 && mine(p.id)).length };
}
