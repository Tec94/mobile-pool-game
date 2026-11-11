// Cue mastery (extra v1 features plan, cue levels and tuning): a cue earns the XP of what is played with it and climbs
// mastery levels 1 to 5. Each level from 2 gives a tuning point, and a point plus coins adds +1 to Power, Spin or Aim.
import { CUE_IDS, CUES, type CueId, type CueInfo } from './cues.ts';
import type { Profile } from './profile.ts';

export type Stat = 'power' | 'spin' | 'aim';
export const STATS: Stat[] = ['power', 'spin', 'aim'];
// xp = cue XP earned; power, spin, aim = points on each stat; paid = coin steps paid, so moving points is free.
export interface Mastery { xp: number; power: number; spin: number; aim: number; paid: number }
export const NONE: Mastery = { xp: 0, power: 0, spin: 0, aim: 0, paid: 0 };
export const MASTERY_XP = [0, 300, 1000, 2500, 5000]; // total cue XP for mastery levels 1 to 5
export const STEP_COINS = [300, 600, 1200, 2400];    // the coins of the 1st to 4th point on a cue
export const MAX_TUNE = 2;                           // at most +2 on a stat, and no stat above 10

export const masteryOf = (p: Profile, id: CueId): Mastery => p.mastery[id] ?? NONE;
// Mastery level from cue XP, with the XP into this level and the XP it needs (0 at level 5).
export function masteryLevel(xp: number) {
  let level = 1;
  while (level < MASTERY_XP.length && xp >= MASTERY_XP[level]) level++;
  return { level, into: xp - MASTERY_XP[level - 1], need: level < MASTERY_XP.length ? MASTERY_XP[level] - MASTERY_XP[level - 1] : 0 };
}
export const used = (m: Mastery) => m.power + m.spin + m.aim;
export const points = (m: Mastery) => masteryLevel(m.xp).level - 1;
// The Twig is the worst cue on purpose: it levels, for the Mastered finish, but takes no points.
export const tunable = (id: CueId) => id !== 'twig';
// The stats a cue plays with: base plus its points, at most 10.
export function statsOf(id: CueId, m: Mastery = NONE) {
  const c: CueInfo = CUES[id];
  return { power: Math.min(10, c.power + m.power), spin: Math.min(10, c.spin + m.spin), aim: Math.min(10, c.aim + m.aim) };
}

// What one more point on a stat costs now: 0 when a paid step is free again, null when it cannot go up.
export function upCost(p: Profile, id: CueId, stat: Stat): number | null {
  const m = masteryOf(p, id), u = used(m);
  if (!p.owned.includes(id) || !tunable(id) || u >= points(m) || m[stat] >= MAX_TUNE || CUES[id][stat] + m[stat] >= 10) return null;
  return u < m.paid ? 0 : STEP_COINS[m.paid];
}
// One more point on a stat, paying the next step if every paid one is in use. Anything not allowed or not affordable
// returns the same profile, so the page saves nothing.
export function tuneUp(p: Profile, id: CueId, stat: Stat): Profile {
  const cost = upCost(p, id, stat), m = masteryOf(p, id);
  if (cost === null || p.coins < cost) return p;
  return { ...p, coins: p.coins - cost, mastery: { ...p.mastery, [id]: { ...m, [stat]: m[stat] + 1, paid: m.paid + (cost ? 1 : 0) } } };
}
// Take a point off a stat. Free, and its paid step stays paid.
export function tuneDown(p: Profile, id: CueId, stat: Stat): Profile {
  const m = masteryOf(p, id);
  return m[stat] > 0 ? { ...p, mastery: { ...p.mastery, [id]: { ...m, [stat]: m[stat] - 1 } } } : p;
}
// Cue XP for what was played with a cue. from and to are mastery levels, for the results card.
export function cueGain(p: Profile, id: CueId, xp: number) {
  const m = masteryOf(p, id), from = masteryLevel(m.xp).level, to = masteryLevel(m.xp + xp).level;
  return { profile: xp > 0 ? { ...p, mastery: { ...p.mastery, [id]: { ...m, xp: m.xp + xp } } } : p, from, to };
}
// The results card line of a mastery level-up, or nothing. The Twig earns no points, so its line names none.
export function masteryNote(id: CueId, { from, to }: { from: number; to: number }) {
  if (to <= from) return '';
  const head = `${CUES[id].name} mastery ${to}${to === 5 ? ', mastered' : ''}`, n = to - from;
  return tunable(id) ? `${head}: ${n > 1 ? `${n} tuning points` : 'tuning point'} earned` : head;
}

// Mastery from the saved text, like readProfile: numbers out of range are fixed, and points that do not fit the level
// or the paid steps, or break a cap, are taken off (the cue XP and the paid steps stay).
export function readMastery(o: any): Profile['mastery'] {
  const out: Profile['mastery'] = {}, num = (v: unknown, max: number) => (typeof v === 'number' && v >= 0 ? Math.min(max, Math.floor(v)) : 0);
  for (const id of CUE_IDS) {
    const r = o?.[id];
    if (!r || typeof r !== 'object') continue;
    const xp = num(r.xp, 1e9), m: Mastery = { xp, power: num(r.power, MAX_TUNE), spin: num(r.spin, MAX_TUNE), aim: num(r.aim, MAX_TUNE), paid: Math.min(num(r.paid, STEP_COINS.length), masteryLevel(xp).level - 1) }; // no paid step past the level's points
    const fits = tunable(id) && used(m) <= Math.min(points(m), m.paid) && STATS.every(s => CUES[id][s] + m[s] <= 10);
    out[id] = fits ? m : { ...NONE, xp: m.xp, paid: m.paid };
  }
  return out;
}
