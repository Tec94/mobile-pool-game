// A tournament against the AI (tournament spec, /mnt/project-files/tournament/SPEC.md): a single-elimination bracket of
// 4 or 8, the player against AI opponents with styles. Pure: no React, no files. The bracket knows entrants and who won;
// how a match is decided (played on this phone, simulated, later online) is the caller's.
import { STYLE_BUMP, STYLE_IDS, STYLE_RANGE, type StyleId } from '../ai/styles.ts';
import { rng } from '../ai/shot-ai.ts';
import type { Pay } from '../progress/pay.ts';
import type { TourOpts as Opts } from '../settings/settings.ts';

export type { Opts };

export interface Cup { name: string; lo: number; hi: number; level: number; prize: number }
// lo..hi = the field's ratings on the tier scale (1 Rookie .. 6 Legend); level = the player level that opens it without
// winning a silver or gold in the cup below; prize = XP a round won as champion of a best-of-1 (prize()).
export const CUPS: Cup[] = [
  { name: 'Club', lo: 1.0, hi: 2.4, level: 0, prize: 60 },
  { name: 'City', lo: 2.3, hi: 3.8, level: 10, prize: 180 },
  { name: 'Masters', lo: 3.6, hi: 5.0, level: 20, prize: 400 },
  { name: 'Legends', lo: 4.8, hi: 5.7, level: 30, prize: 750 }, // top 5.7: with a style's bump it still plays no higher than Legend (6)
];
// human = played on this phone (entrant 0 today; online opponents later). An AI without a style plays the plain tier
// at its rating; with one, at its rating plus the style's bump (STYLE_BUMP), and the rating is what is shown.
export interface Entrant { name: string; style: StyleId | null; rating: number; human?: boolean }
export interface Result { w: 0 | 1; score: [number, number] } // w = the side that won: 0 the first entrant of the match
export interface Run {
  v: 1; seed: number; opts: Opts; field: Entrant[];
  slots: number[];               // the first round, two entrants a match, in bracket order
  res: (Result | null)[];        // every match, round by round: first round 0..size/2-1, then the next round, then the final
  live: Live | null;             // the player's match in play: saved after every shot, so leaving the app loses nothing and re-rolls nothing
  state: 'playing' | 'out' | 'champion';
  earned: Pay;                   // what the run has earned: its matches, and the prize once it is over. What of it was
}                                // paid is marked in the profile in the same save as the pay (progress.ts payRun)
// score = frames won (the player's first); table = the caller's snapshot of the rack in play (balls, rules, ledger,
// AI seed), opaque here: the caller checks it fits before it uses it.
export interface Live { score: [number, number]; table?: unknown }

export const NICK: Record<StyleId, string> = { banker: 'The Banker', spin: 'Spin Doctor', wall: 'The Wall', gun: 'Gunslinger', closer: 'The Closer' };
// Each style is one character, met again from run to run; the plain players are drawn from NAMES.
// What each style does, in a line the player reads before the match.
export const TELL: Record<StyleId, string> = {
  banker: 'Banks and kicks out of trouble', spin: 'Puts the cue ball where it wants it', wall: 'Plays safe when the pot is not clean',
  gun: 'Fires at everything, never plays safe', closer: 'Sharper at the end, and never plays safe there',
};
export const ROSTER: Record<StyleId, string> = { banker: 'Rafe', spin: 'Juno', wall: 'Dez', gun: 'Kit', closer: 'Mara' };
// Original first names, none a real player's, none a ROSTER name.
const NAMES = ['Ollie', 'Tess', 'Niko', 'Bea', 'Sol', 'Ivo', 'Wren', 'Abe', 'Lula', 'Cass', 'Remy',
  'Pip', 'Hugo', 'Nell', 'Otis', 'Vera', 'Ezra', 'Fen', 'Gus', 'Ida', 'Jules', 'Kiki', 'Lev', 'Mo', 'Noor', 'Pia', 'Quin', 'Rosa', 'Sully',
  'Tam', 'Uma', 'Vic', 'Yara', 'Zed', 'Ari'];

export const rounds = (size: number) => Math.log2(size);
export const raceOf = (best: number) => (best + 1) / 2;
const shuffle = <T>(a: T[], rnd: () => number) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
// The first-round order for opponents O1 (weakest) .. On (strongest), you as top seed: you meet them in rising strength.
const ORDER = { 4: [0, 1, 2, 3], 8: [0, 1, 4, 5, 3, 6, 2, 7] };

// A new run: the field drawn from the seed. Ratings spread over the cup's band (O1 weakest .. On strongest); the top
// half of the field (O4..O7 of 8, O2 and O3 of 4) gets a style each, never twice, each one dealt only where it has an
// edge (STYLE_RANGE). The rest play the plain tier: the player meets a character from the second round on.
export function newRun(opts: Opts, seed: number): Run {
  const rnd = rng(seed), cup = CUPS[opts.cup], n = opts.size - 1, names = shuffle(NAMES, rnd);
  const base = Array.from({ length: n }, (_, i) => Math.round((cup.lo + (cup.hi - cup.lo) * (i + 0.5) / n + (rnd() - 0.5) * 0.2) * 100) / 100).sort((a, b) => a - b);
  let left = shuffle(Object.keys(STYLE_RANGE) as StyleId[], rnd);
  const field: Entrant[] = base.map((rating, i) => ({ name: names[i], style: null, rating }));
  for (let i = n - 1; i >= Math.floor(n / 2); i--) { // strongest first, so the final is always a character
    const fits = left.find((k) => base[i] >= STYLE_RANGE[k][0] && base[i] <= STYLE_RANGE[k][1]);
    if (fits) { left = left.filter((k) => k !== fits); field[i] = { ...field[i], style: fits, name: ROSTER[fits] }; }
  }
  field.unshift({ name: 'You', style: null, rating: 0, human: true });
  return { v: 1, seed, opts, field, slots: ORDER[opts.size], res: Array(opts.size - 1).fill(null), live: null, state: 'playing', earned: { xp: 0, coins: 0 } };
}

// The two entrants of match m (null = not known yet), and the round it is in.
export function sides(run: Run, m: number): [number | null, number | null] {
  const first = run.slots.length / 2;
  if (m < first) return [run.slots[2 * m], run.slots[2 * m + 1]];
  let start = 0, size = first;
  while (m >= start + size) { start += size; size /= 2; }
  const prev = start - 2 * size, k = m - start, win = (i: number) => { const r = run.res[i], s = sides(run, i); return r ? s[r.w] : null; };
  return [win(prev + 2 * k), win(prev + 2 * k + 1)];
}
export function roundOf(run: Run, m: number) { let start = 0, size = run.slots.length / 2, r = 0; while (m >= start + size) { start += size; size /= 2; r++; } return r; }
// The round's name for the player: Final, Semifinal, Quarterfinal.
export const roundTitle = (size: number, round: number) => ['Final', 'Semifinal', 'Quarterfinal'][rounds(size) - 1 - round];
export const roundName = (run: Run, m: number) => roundTitle(run.opts.size, roundOf(run, m));
// Who breaks the first rack of match m: the player (0), or in best of 1 a seeded coin flip, since sudden death would
// hand the player the break every time. Racks after alternate, as in quick match.
export const breakerOf = (run: Run, m: number): 0 | 1 => (run.opts.best > 1 ? 0 : rng(run.seed * 17 + m + 1)() < 0.5 ? 0 : 1);
// The player's next match, or -1 when the run is over.
const human = (run: Run, i: number | null) => i !== null && !!run.field[i].human;
export const nextMatch = (run: Run) => (run.state !== 'playing' ? -1 : run.res.findIndex((r, m) => !r && sides(run, m).some((i) => human(run, i))));
// The rating an entrant plays at: a style's bump on top (STYLE_BUMP).
export const plays = (e: Entrant) => Math.min(6, e.rating + (e.style ? STYLE_BUMP[e.style] : 0)); // above Legend aiParams extrapolates to near-perfect play
// The stakes of match m: every match and shot pays x1 in the first round, x1.5 in the second, x2 in the final of 8
// (pay.ts Vs.tour), so a field of 4 never starts above quick match.
export const stakes = (run: Run, m: number) => 1 + 0.5 * roundOf(run, m);

// A simulated AI-vs-AI match: rack by rack the stronger wins with a logistic chance, raced to the format. Seeded by the
// run and the match, so it never changes.
export function simMatch(run: Run, m: number): Result {
  const [a, b] = sides(run, m), rnd = rng(run.seed * 31 + m + 1), race = raceOf(run.opts.best);
  const p = 1 / (1 + Math.exp(-1.2 * (plays(run.field[a!]) - plays(run.field[b!])))), score: [number, number] = [0, 0];
  while (Math.max(...score) < race) score[rnd() < p ? 0 : 1]++;
  return { w: score[0] === race ? 0 : 1, score };
}
// Every AI-vs-AI match that can be played now (both sides known), in order.
function simReady(run: Run): Run {
  const res = [...run.res];
  for (let m = 0; m < res.length; m++) { const s = sides({ ...run, res }, m); if (!res[m] && s[0] !== null && s[1] !== null && !s.some((i) => human(run, i))) res[m] = simMatch({ ...run, res }, m); }
  return { ...run, res };
}
// The player's match is over: won or not, and the frames (the player's first). The rest of the round plays out; once
// the player is out, the whole bracket does, and the prize joins what the run earned. pay = what the match paid.
export function recordMatch(run: Run, won: boolean, score: [number, number], pay: Pay): Run {
  const m = nextMatch(run);
  if (m < 0) return run;
  const me = human(run, sides(run, m)[0]) ? 0 : 1, res = [...run.res];
  res[m] = { w: (won ? me : 1 - me) as 0 | 1, score: me === 0 ? score : [score[1], score[0]] };
  const final = m === res.length - 1, state = !won ? 'out' : final ? 'champion' : 'playing';
  const next = simReady({ ...run, res, live: null, state, earned: add(run.earned, pay) });
  return state === 'playing' ? next : { ...next, earned: add(next.earned, prize(run.opts, wins(next))) };
}
// The end of match m, as the match screen saw it: null when m is no longer the player's match (a forfeit tapped on a
// card left open after the result), so only the match that was played can end.
export const endMatch = (run: Run, m: number, won: boolean, score: [number, number], pay: Pay) => (nextMatch(run) === m ? recordMatch(run, won, score, pay) : null);
const add = (a: Pay, b: Pay): Pay => ({ xp: a.xp + b.xp, coins: a.coins + b.coins });

// Matches won by the player.
export const wins = (run: Run) => run.res.filter((r, m) => r && human(run, sides(run, m)[r.w])).length;

// The prize at the end of a run, by how far the player got: champion all of it, runner-up 40%, a semifinal of 8 15%,
// the first match lost nothing. XP = the cup's base x rounds x frames (best of 1, 3, 5: 1, 2.6, 4.2), coins half of it:
// a top run still pays well under the price of the dearest cue (Rocket 12,000).
const FRAMES = { 1: 1, 3: 2.6, 5: 4.2 }, SHARE = [0, 0.15, 0.4, 1];
export function prize(opts: Opts, won: number): Pay {
  const n = rounds(opts.size), share = !won ? 0 : won >= n ? 1 : SHARE[3 - (n - won)];
  const xp = Math.round(CUPS[opts.cup].prize * n * FRAMES[opts.best] * share);
  return { xp, coins: Math.round(xp / 2) };
}
// Trophies: per cup the best medal won, 0 none, 1 bronze (champion of 4), 2 silver (of 8, best of 1), 3 gold (of 8,
// best of 3 or 5). A cup opens at its level, or with any medal of 2 or more in the cup below.
export const medalOf = (o: Opts) => (o.size === 4 ? 1 : o.best === 1 ? 2 : 3);
export const cupOpen = (cup: number, trophies: number[], level: number) => !cup || level >= CUPS[cup].level || (trophies[cup - 1] ?? 0) >= 2;

// A saved run, or null when it is missing, damaged or from a newer app (never a crash).
export function readRun(text: string | null): Run | null {
  let o: any = null;
  try { o = JSON.parse(text ?? 'null'); } catch { return null; }
  const op = o?.opts, int = Number.isInteger;
  if (!o || o.v !== 1 || !int(o.seed) || !int(op?.cup) || !CUPS[op.cup] || ![4, 8].includes(op.size) || ![1, 3, 5].includes(op.best)
    || ![8, 9].includes(op.game) || typeof op.callAll !== 'boolean' || ![0, 1, 2].includes(op.bank)) return null;
  const n = op.size, race = raceOf(op.best);
  const pay = (p: any) => p && Number.isFinite(p.xp) && Number.isFinite(p.coins) && p.xp >= 0 && p.coins >= 0;
  const score = (s: any, top: number) => Array.isArray(s) && s.length === 2 && s.every((x: any) => int(x) && x >= 0 && x <= top);
  const entrant = (e: any) => e && typeof e.name === 'string' && Number.isFinite(e.rating) && e.rating >= 0 && e.rating <= 7
    && (e.style === null || STYLE_IDS.includes(e.style));
  if (!Array.isArray(o.field) || o.field.length !== n || !o.field.every(entrant) || o.field.filter((e: any) => e.human).length !== 1) return null;
  if (!Array.isArray(o.slots) || o.slots.length !== n || [...o.slots].sort((x: number, y: number) => x - y).some((v: number, i: number) => v !== i)) return null;
  if (!Array.isArray(o.res) || o.res.length !== n - 1) return null;
  // a result only where both entrants are known (sides reads the earlier results, so check in order)
  for (let m = 0; m < n - 1; m++) {
    const r = o.res[m];
    // the loser short of the race; the winner may be too (a walkover), so no tie can stand
    if (r !== null && !((r.w === 0 || r.w === 1) && score(r.score, race) && r.score[1 - r.w] < race && sides(o, m).every((i) => i !== null))) return null;
  }
  // the state follows from the results: out after the player's loss, champion after winning the final
  const mine = o.res.map((r: Result | null, m: number) => r && sides(o, m).indexOf(o.field.findIndex((e: Entrant) => e.human)));
  const lost = o.res.some((r: Result | null, m: number) => r && mine[m] >= 0 && mine[m] !== r.w), fin = o.res[n - 2];
  if (o.state !== (lost ? 'out' : fin && mine[n - 2] === fin.w ? 'champion' : 'playing') || !pay(o.earned)) return null;
  if (o.live !== null && !score(o.live?.score, race - 1)) return null; // a live match has not been won yet
  return o.state === 'playing' && nextMatch(o) < 0 ? null : (o as Run); // a run in play always has a match for the player
}
