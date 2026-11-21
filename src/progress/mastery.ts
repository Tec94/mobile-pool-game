// Cue mastery (extra v1 features plan, cue levels and tuning): a cue earns the XP of what is played with it and climbs
// mastery levels 1 to 5. Each level from 2 gives a tuning point, and a point plus coins adds +1 to Power, Spin or Aim.
import { CUE_IDS, CUES, type CueId, type CueInfo, type Stat, STATS } from './cues.ts';
import type { Profile } from './profile.ts';

export { type Stat, STATS };
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
// A cue that takes no tuning (the Twig is the worst cue on purpose) still levels, for the Mastered finish.
export const tunable = (id: CueId) => (CUES[id] as CueInfo).tune !== false;
// A locked stat takes no points: the price of the cue's trick is in it.
export const locked = (id: CueId, stat: Stat) => !!(CUES[id] as CueInfo).lock?.includes(stat);
// The coins paid for a cue's tuning steps, for a refund.
export const paidCoins = (m: Mastery) => STEP_COINS.slice(0, m.paid).reduce((a, b) => a + b, 0);
// Tuningmaxxing (the feat of the Maxxed): every tuning step paid on MAXXED_AT cues. A paid step stays paid, so the count never falls.
export const MAXXED_AT = 3;
export const maxedCues = (p: Pick<Profile, 'mastery'>) => CUE_IDS.filter(id => (p.mastery[id]?.paid ?? 0) >= STEP_COINS.length).length;
// The stats a cue plays with: base plus its points, at most 10.
export function statsOf(id: CueId, m: Mastery = NONE) {
  const c: CueInfo = CUES[id];
  return { power: Math.min(10, c.power + m.power), spin: Math.min(10, c.spin + m.spin), aim: Math.min(10, c.aim + m.aim) };
}

// What one more point on a stat costs now: 0 when a paid step is free again, null when it cannot go up.
export function upCost(p: Profile, id: CueId, stat: Stat): number | null {
  const m = masteryOf(p, id), u = used(m);
  if (!p.owned.includes(id) || !tunable(id) || locked(id, stat) || u >= points(m) || m[stat] >= MAX_TUNE || CUES[id][stat] + m[stat] >= 10) return null;
  return u < m.paid ? 0 : STEP_COINS[m.paid];
}
// One more point on a stat, paying the next step if every paid one is in use. Anything not allowed or not affordable
// returns the same profile, so the page saves nothing.
export function tuneUp(p: Profile, id: CueId, stat: Stat): Profile {
  const cost = upCost(p, id, stat), m = masteryOf(p, id);
  if (cost === null || p.coins < cost) return p;
  const q = { ...p, coins: p.coins - cost, mastery: { ...p.mastery, [id]: { ...m, [stat]: m[stat] + 1, paid: m.paid + (cost ? 1 : 0) } } };
  return maxedCues(q) >= MAXXED_AT && !q.owned.includes('maxxed') ? { ...q, owned: [...q.owned, 'maxxed'] } : q;
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

// Mastery from the saved text, like readProfile: numbers out of range are fixed (readOne), and points that do not fit
// the level or the paid steps, or break a cap or a lock, are taken off (fit; the cue XP and the paid steps stay).
export function readOne(r: any): Mastery | null {
  if (!r || typeof r !== 'object') return null;
  const num = (v: unknown, max: number) => (typeof v === 'number' && v >= 0 ? Math.min(max, Math.floor(v)) : 0), xp = num(r.xp, 1e9);
  return { xp, power: num(r.power, MAX_TUNE), spin: num(r.spin, MAX_TUNE), aim: num(r.aim, MAX_TUNE), paid: Math.min(num(r.paid, STEP_COINS.length), masteryLevel(xp).level - 1) }; // no paid step past the level's points
}
export function fit(id: CueId, m: Mastery): Mastery {
  const fits = tunable(id) && used(m) <= Math.min(points(m), m.paid) && STATS.every(s => CUES[id][s] + m[s] <= 10 && !(m[s] && locked(id, s)));
  return fits ? m : { ...NONE, xp: m.xp, paid: m.paid };
}
export function readMastery(o: any): Profile['mastery'] {
  const out: Profile['mastery'] = {};
  for (const id of CUE_IDS) { const m = readOne(o?.[id]); if (m) out[id] = fit(id, m); }
  return out;
}
