'worklet'; // think() runs on the AI's worklet runtime (src/ai/think.ts): define a function before its callers
// The AI's turn in a match: what the AI seat does for a rules State and a table. Pure: no React. think() is the whole
// turn (break, group, cue ball in hand, call, shot); choiceFor() answers a decision the rules hand it; potPay() pays
// the human's pots in a match against the AI.
import { type Ball, CUE, HOLES, P, type Shot } from '../physics/engine.ts';
import { canCall, cushionAt, ENDS, jumped, nose, legalSpot, massed, onEight, potKind, type Hand, type Rec, type State } from '../rules/rules.ts';
import { aimSd, aiShot, gauss, now } from './aim.ts';
import { styled, type StyleId } from './styles.ts';
import { aiParams, chooseGroup, type Cand, EDGE, enumerate, makeProb, NINE, type Obj, type Pick, plan, rng, shotOdds, SIGMA_REF, SOLIDS, STRIPES, type Tier } from './shot-ai.ts';
import { type Aura, hustler, type Pay, shotPay, type ShotType as PayType, type Vs } from '../progress/pay.ts';
import type { FeatId } from '../progress/profile.ts';

// The AI's turn. at = where it puts the cue ball in hand (null = where it lies); call = the pocket it calls (-1 none);
// safety = it played a safety, for safetiesInRow; kind = the pot it played (kindOf, for the benches).
export interface Move { shot: Shot; at: [number, number] | null; call: number; safety: boolean; kind?: string }
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
// Bank shots: where the centre of a ball at (bx, by) meets cushion c to bank into pocket h (HOLES index): the line to the
// pocket's mirror image across the line a radius off the nose. null = that point is off cushion c, or c ends at pocket h
// (rules.ts banked() does not count that).
function railPoint(bx: number, by: number, h: number, c: number): [number, number] | null {
  if (ENDS[c].includes(h)) return null;
  const [x0, y0, x1, y1] = nose(c), e = Math.hypot(x1 - x0, y1 - y0), s = (P.L / 2 - x0) * (y0 - y1) + (P.W / 2 - y0) * (x1 - x0) > 0 ? 1 : -1;
  const nx = s * (y0 - y1) / e, ny = s * (x1 - x0) / e, [hx, hy] = HOLES[h]; // n: the unit normal into the table
  const db = (bx - x0) * nx + (by - y0) * ny - P.R, dh = (hx - x0) * nx + (hy - y0) * ny - P.R;
  if (db <= 0 || dh <= 0) return null;
  const t = db / (db + dh), x = bx + t * (hx - 2 * dh * nx - bx), y = by + t * (hy - 2 * dh * ny - by);
  return cushionAt(x, y, 1.5 * P.R) === c ? [x, y] : null;
}

// Cue ball in hand: a spot straight behind a legal ball on a clear line to a pocket, the shorter the shot the better.
// Bank shots (lit): the line is a bank into the pocket off a lit cushion (railPoint), as a straight pot would not count.
// null = no such spot is legal (it stays where the rules put it). shortcut: straight-in lines and one-cushion mirror
// banks only, scored by length, not by the picker; good enough to give the picker an easy pot, add the picker's value
// if the AI places badly.
export function placeCue(B: Ball[], ids: number[], hand: Hand, legal: number[], lit: number[] = []): [number, number] | null {
  let best = -Infinity, at: [number, number] | null = null;
  for (const id of legal) {
    const i = ids.indexOf(id), b = B[i];
    if (i < 0 || !b.on) continue;
    HOLES.forEach((h, k) => {
      for (const a of lit.length ? lit.map((c) => railPoint(b.x, b.y, k, c)) : [h]) { // where the ball is sent: the pocket, or the lit cushion
        if (!a) continue;
        const dx = a[0] - b.x, dy = a[1] - b.y, l1 = Math.sqrt(dx * dx + dy * dy), ux = dx / l1, uy = dy / l1, l2 = Math.hypot(h[0] - a[0], h[1] - a[1]), l = l1 + l2;
        if (k >= 4 && Math.abs(l2 ? (h[1] - a[1]) / l2 : uy) < 0.7) continue; // a side pocket takes no ball from a shallow angle
        if (!lane(B, b.x, b.y, a[0], a[1], [0, i]) || (l2 && !lane(B, a[0], a[1], h[0], h[1], [0, i]))) continue;
        const gx = b.x - 2 * P.R * ux, gy = b.y - 2 * P.R * uy;
        for (const d of [0.15, 0.35, 0.6]) {
          const x = gx - d * ux, y = gy - d * uy, score = -(d + l);
          if (score > best && legalSpot(B, x, y, hand) && lane(B, x, y, gx, gy, [0, i])) { best = score; at = [x, y]; }
        }
      }
    });
  }
  return at;
}
// 9-ball ball in hand: a spot behind the lowest ball (lo, an id) lined up to drive the 9 into a pocket, a combo of at
// most a 60 degree cut on the 9, the shorter the better. think() takes it when the picker values the table from there more.
export function comboSpot(B: Ball[], ids: number[], hand: Hand, lo: number): [number, number] | null {
  const i = ids.indexOf(lo), j = ids.indexOf(9), a = B[i], n = B[j];
  let best = -Infinity, at: [number, number] | null = null;
  if (i < 0 || j < 0 || !a.on || !n.on || lo === 9) return null;
  HOLES.forEach((h, k) => {
    const dx = h[0] - n.x, dy = h[1] - n.y, l = Math.sqrt(dx * dx + dy * dy), ux = dx / l, uy = dy / l;
    if (k >= 4 && Math.abs(uy) < 0.7) return; // a side pocket takes no ball from a shallow angle
    if (!lane(B, n.x, n.y, h[0], h[1], [0, j])) return;
    const gx = n.x - 2 * P.R * ux, gy = n.y - 2 * P.R * uy, ex = gx - a.x, ey = gy - a.y, m = Math.sqrt(ex * ex + ey * ey), wx = ex / m, wy = ey / m;
    if (wx * ux + wy * uy < 0.5 || !lane(B, a.x, a.y, gx, gy, [0, i, j])) return;
    const fx = a.x - 2 * P.R * wx, fy = a.y - 2 * P.R * wy;
    for (const d of [0.15, 0.35]) {
      const x = fx - d * wx, y = fy - d * wy, score = -(d + m + l);
      if (score > best && legalSpot(B, x, y, hand) && lane(B, x, y, fx, fy, [0, i])) { best = score; at = [x, y]; }
    }
  });
  return at;
}

// The break: full break speed from where the cue ball lies, at the 1 (the apex ball in both racks), with a little aim
// noise so racks differ.
export function breakShot(B: Ball[], ids: number[], rnd: () => number): Shot {
  const c = B[0], o = B[ids.indexOf(1)];
  return { ang: Math.atan2(o.y - c.y, o.x - c.x) + (rnd() - 0.5) * 0.01, speed: CUE.breakSpeed * (0.85 + 0.15 * rnd()), a: 0, b: 0 };
}

// The Chinese Masters' 8-ball break (a tier with tricks): full break speed into the 1 a ball radius off its centre, with
// the tier's own strike noise: off centre puts a ball down with no scratch about twice as often as full on. In 9-ball
// off centre scratches more often, which hands Legend ball in hand, so it breaks as the others. An aim searched per
// rack does not pay: its tiny noise decides the spread. aimSd, not raw sigma: its side tip error squirts the cue ball
// too, as aiShot's does.
export function trickBreak(B: Ball[], ids: number[], tier: Tier, rnd: () => number): Shot {
  const c = B[0], o = B[ids.indexOf(1)], g = () => gauss(rnd);
  const ang = Math.atan2(o.y - c.y, o.x - c.x) + Math.asin(P.R / Math.hypot(o.x - c.x, o.y - c.y));
  return { ang: ang + g() * aimSd(tier, 'direct'), speed: CUE.breakSpeed * Math.min(1, 1 + g() * tier.speedErr / 100), a: g() * tier.tipErr, b: g() * tier.tipErr };
}

// The pocket to call: the pocket of the pick when it is a pot. On the 8 a call is a must, so a safety or a foul shot
// still calls the pocket nearest the 8 (a miss loses nothing).
export function callFor(s: State, pick: Pick, B: Ball[], ids: number[]) {
  if (!canCall(s)) return -1;
  if (pick.type !== 'safety' && pick.type !== 'foul') return holeOf(pick);
  if (!onEight(s)) return -1;
  const e = B[ids.indexOf(8)]; return nearHole(e.x, e.y);
}

// What the AI played, for the benches: its type, with the cushions of a bank or kick off 2 or more ('bank2', 'kick3');
// an escape is 'escape' and its cushions or 'escapejump'.
export const kindOf = (p: Pick | Cand) => (p.type === 'foul' ? 'foul' : p.type === 'safety' ? (p.rails ? `escape${p.rails}` : p.elev ? 'escapejump' : 'safety') : p.type + ((p.rails ?? 1) > 1 ? p.rails : ''));

// Bank shots: the pot banks the ball (or kicks the cue ball) off one of the lit cushions. The rail point is a ball
// centre one radius off the nose, so it is matched a little wider than the engine's touch. Off 2 cushions or more, any
// of them counts, as rules.ts banked() has it: a bank's cushion only when it does not end at the ball's pocket.
export const onLit = (lit: number[], c: Cand) => {
  if ((c.rails ?? 1) > 1) { const h = holeOf(c), q = c.type === 'bank' ? c.paths[1] : c.paths[0]; return q.slice(1, -1).some((X) => { const k = cushionAt(X.x / 1000, X.y / 1000, 1.5 * P.R); return lit.includes(k) && (c.type === 'kick' || !ENDS[k].includes(h)); }); }
  const X = c.type === 'bank' ? c.paths[1][1] : c.type === 'kick' ? c.paths[0][1] : null;
  return !!X && lit.includes(cushionAt(X.x / 1000, X.y / 1000, 1.5 * P.R));
};

// The AI's whole turn, it being player s.turn. B is changed (the cue ball in hand goes to its spot): pass a copy.
// level = the AI's rating on the tier scale (aiParams: TIERS index + 1, or the Rival's). safeties = safetiesInRow for aiShot (see nextSafeties).
// style = a tournament opponent's style (src/ai/styles.ts); none = the plain tier. deadline = ms in place of the tier's
// think (tests pass Infinity: no clock, so the same search on any machine).
export function think(B: Ball[], ids: number[], s: State, level: number, seed: number, safeties: number, style?: StyleId, deadline?: number): Move {
  const t0 = now(), rnd = rng(seed), T = styled({ ...aiParams(level, rnd), ...(deadline === undefined ? {} : { think: deadline }) }, style, s.game === 9 ? s.balls.length : s.solids < 0 ? 8 : s.balls.filter(id => id !== 8 && (id < 8) === (s.solids === s.turn)).length + 1);
  if (s.phase === 'break') return { shot: T.tricks && s.game === 8 ? trickBreak(B, ids, T, rnd) : breakShot(B, ids, rnd), at: null, call: -1, safety: false };
  // open table: the group it would pick from where the cue ball lies now. By value: on the runtime its SOLIDS is a copy
  const g = groupsOf(s, s.turn) ?? (chooseGroup({ x: B[0].x * 1000, y: B[0].y * 1000 }, mm(B, ids), T)[0] === 1 ? [SOLIDS, STRIPES] : [STRIPES, SOLIDS]);
  // From the kitchen a ball behind the head string may not be hit first (rules.ts, crossed): leave those out, unless no other is left.
  // shortcut: 9-ball keeps NINE whole (the picker knows it by its length), so a lowest ball behind the line is still a foul.
  const ahead = (l: number[]) => { const k = s.hand === 'kitchen' ? l.filter(id => { const b = B[ids.indexOf(id)]; return b && b.on && b.x >= P.L / 4; }) : l; return k.length ? k : l; };
  if (s.hand) { // place first, then shoot from there
    let at = placeCue(B, ids, s.hand, ahead(legalIds(s, g[0])), s.lit);
    const combo = s.game === 9 && T.types.includes('combo') ? comboSpot(B, ids, s.hand, legalIds(s, g[0])[0]) : null;
    if (combo) { // the combo spot when the 9 is its best shot and wins the rack more often (by EDGE, as nineValue; Hustler by spot) than the
      // best shot from the straight-in spot (or where the cue ball lies). shortcut: two more plan() calls, about 7 ms (Node JIT).
      const balls = mm(B, ids), top = (p: [number, number] | null) => plan(p ? { x: p[0] * 1000, y: p[1] * 1000 } : { x: B[0].x * 1000, y: B[0].y * 1000 }, balls, NINE, T, T.depth, 4, NINE)[0];
      const c = top(combo), r = top(at);
      if (c?.ball === 9 && (!r || shotOdds(T, c, balls.length) > shotOdds(T, r, balls.length) + (T.spot ?? EDGE))) at = combo;
    }
    if (at) { B[0].x = at[0]; B[0].y = at[1]; }
  }
  const lit = s.lit, ok = lit.length ? (c: Cand) => onLit(lit, c) : undefined; // bank shots: no other pot counts
  const T2 = T.think === undefined ? T : { ...T, think: T.think - (now() - t0) }; // the deadline counts the cue ball's placement too
  const { shot, pick } = aiShot(B, ids, s.game === 9 ? g[0] : ahead(g[0]), g[1], T2, rnd, safeties, ok);
  return { shot, at: s.hand ? [B[0].x, B[0].y] : null, call: callFor(s, pick, B, ids), safety: pick.type === 'safety', kind: kindOf(pick) };
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

// Every pot the shooter (s.turn) has on this table, for potPay. Picker units (mm). With caroms and billiards: a pot
// the picker can find that way is no fluke.
export function candsFor(B: Ball[], ids: number[], s: State): Cand[] {
  const g = groupsOf(s, s.turn), legal = legalIds(s, g && g[0]);
  return enumerate({ x: B[0].x * 1000, y: B[0].y * 1000 }, mm(B, ids), legal, s.game === 9 ? s.balls : legal);
}

// The human's pots on one shot against the AI (progress/pay.ts). A pot's difficulty is the easiest way the picker found
// for that ball and pocket before the strike; none = a fluke, paid as a plain pot. Its type is what happened on the
// table (rules.ts potKind), the one that pays most: a kick, then a bank, then a combo; a pot the picker found only as
// a carom or a billiard pays as a combo. A pot with no way found pays as a Tough pot when it was a kick off 2
// cushions or more, a jump or a massé: the picker knows no such ways, and they are no luck.
// before/after = the State around judge(); run = pots in a row this visit before the shot; vs = the opponent (pay.ts);
// lim = the cue's tip limit. Returns the pay, the run after the shot, the shooter's own balls potted (for matchPay;
// the 8 and a foul do not count), and for the feats: feats = what the pots count for, mine = the own balls potted.
// A pot counts for a feat when it kept the turn or won the rack, and never on the break. Spin Doctor: a Solid or
// harder pot against Hustler or harder with the tip half way or more out to its limit, below centre or to a side
// (follow alone does not count).
// flukes = the Nonchalant's paid flukes left this rack, changed here: against Hustler or harder and not on the break, a
// pot of the shooter's with no way found that keeps the turn or wins the rack pays a flat 60 XP and 24 coins while one is left.
// plain = the Seer's eye opened for this shot: each pot pays as a plain pot with no run bonus, adds nothing to the run
// and counts for no feat.
const TOUGH = 0.4; // a chance in the Tough band (pay.ts band)
export function potPay(cands: Cand[], r: Rec, before: State, after: State, run: number, vs: Vs, lim = CUE.tipLimit, aura?: Aura, flukes?: { left: number }, plain = false): { pay: Pay; run: number; own: number; feats: FeatId[]; mine: number[]; held?: boolean } {
  const pay = { xp: 0, coins: 0 }, foul = after.foul, me = before.turn, brk = before.phase === 'break', feats: FeatId[] = [];
  const mine = (id: number) => before.game === 9 || after.solids < 0 || id === 8 || (id < 8) === (after.solids === me);
  const pots = r.pots.filter(p => p.id), counts = !foul && !brk && (after.turn === me || (after.phase === 'over' && after.winner === me));
  // The Performative's For show, against Hustler or harder. Off when Bank shots mode makes every pot a bank; a bank that the mode asks for on the 8 pays its usual pay.
  const show = vs.cue === 'performative' && hustler(vs) && before.bank !== 2;
  // The Six Seven's Sixes and sevens, against Hustler or harder and not on the break: the 6 and the 7 each pay 6.7 times
  // a plain pot, flat, and no other ball pays. held = this pay waits for the end of the rack (pay.ts noteShot), where
  // a pair in one turn is topped up.
  const six = vs.cue === 'sixseven' && hustler(vs) && !brk;
  // The Aura's Aura farming, against Hustler or harder and not on the break (the caller leaves aura out on a push-out).
  // aura is the run so far and is changed here. A ball of the shooter's potted with no foul on a shot that keeps the
  // turn or wins the rack adds 1 to the run, and pays 25% more for each pot before it in the run, in place of the run
  // bonus. Any other shot ends the run, and the next such pot is owed: it pays nothing and starts the new run.
  const au = aura && hustler(vs) && !brk ? aura : null, zero = { xp: 0, coins: 0 };
  const fl = flukes && hustler(vs) && !brk ? flukes : null;
  const odd = jumped(r) || massed(r), sh = r.shot, spun = !!sh && hustler(vs) && Math.hypot(sh.a, Math.min(0, sh.b)) >= lim / 2 - 1e-9;
  for (const p of pots) {
    const best = cands.reduce<Cand | null>((a, k) => (k.ball === p.id && holeOf(k) === p.pocket && (!a || k.tol > a.tol) ? k : a), null), k = potKind(r, p);
    const pRef = plain ? null : best ? makeProb(best.tol, SIGMA_REF) : odd || k.kicks >= 2 ? TOUGH : null;
    const type: PayType = plain ? 'direct' : k.kicks ? 'kick' : k.bank ? 'bank' : k.combo || best?.type === 'carom' || best?.type === 'billiard' ? 'combo' : 'direct';
    const ask = { pRef, type, run: au || plain ? 0 : run, brk, hand: !!before.hand, foul, theirs: !mine(p.id), show: show && !(p.id === 8 && before.lit.length > 0), ...vs };
    const g = fl && !best && counts && mine(p.id) && fl.left > 0 ? (fl.left--, { xp: 60, coins: 24 })
      : six ? ((p.id === 6 || p.id === 7) && mine(p.id) && !foul ? { xp: 67, coins: 27 } : zero)
      : au && counts && mine(p.id) ? (au.owed ? (au.owed = false, au.run = 1, zero) : shotPay({ ...ask, aura: ++au.run }))
      : shotPay(ask);
    pay.xp += g.xp; pay.coins += g.coins;
    if (!counts || !mine(p.id) || plain) continue;
    if (k.kicks) feats.push('kick'); if (k.bank) feats.push('bank'); if (k.combo) feats.push('combo');
    if (pRef !== null && pRef < 0.55) feats.push('sharp'); if (pRef !== null && pRef < 0.8 && spun) feats.push('spin');
  }
  if (au && !(counts && pots.some(p => mine(p.id)))) { au.run = 0; au.owed = true; }
  const own = foul ? [] : pots.filter(p => p.id !== 8 && mine(p.id)).map(p => p.id);
  return { pay, run: after.turn === me && !foul ? run + (plain ? 0 : pots.length) : 0, own: own.length, feats, mine: counts && !plain ? own : [], ...(six && { held: true }) };
}
