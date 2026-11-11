// Scenarios (progression design, "Levels, career and scenarios"): nine packs of 12 set-piece tables. Player level opens
// a pack; in a pack the first table is open and clearing one opens the next two. Each table holds 3 stars: clear it,
// clear it within par tries, clear it with the aim guide off. A first-time star pays 30 coins and the XP of the shot,
// so a harder table pays more. A scenario is a Learn lesson (same table, goal and verdict) with a pack and a measured
// difficulty: tol = half the width of the aim window that clears it on the engine (scripts/make-scenarios.mjs).
import type { Lesson } from '../learn/lessons.ts';
import { makeProb, SIGMA_REF } from '../ai/shot-ai.ts';
import { band, type Pay, shotPay, type ShotType } from '../progress/pay.ts';
import { feat, levelOf, PACKS, type Profile } from '../progress/profile.ts';
import type { CueId } from '../progress/cues.ts';
import { SCENARIOS } from './data.ts';

export { SCENARIOS };
export interface Scenario extends Lesson { pack: number; tol: number; type: ShotType }
export type Stars = Record<string, number>; // scenario id -> star bits: 1 clear, 2 within par, 4 guide off
export const STAR_COINS = 30;

// The average player's chance to clear it at the first try, from the aim window (the reward model of the AI).
export const pRef = (s: Scenario) => makeProb(s.tol, SIGMA_REF);
// Par tries: one more for each band harder (Routine 2 ... Outrageous 6).
export const par = (s: Scenario) => 2 + ['Routine', 'Solid', 'Tough', 'Brutal', 'Outrageous'].indexOf(band(pRef(s))[0]);
export const starsFor = (s: Scenario, tries: number, guideOff: boolean) => 1 | (tries <= par(s) ? 2 : 0) | (guideOff ? 4 : 0);
export const starCount = (bits = 0) => (bits & 1) + ((bits >> 1) & 1) + ((bits >> 2) & 1);
export const totalStars = (st: Stars) => Object.values(st).reduce((n, b) => n + starCount(b), 0);

// Open: the pack's level is reached, and it is the first of its pack or one of the two before it is cleared.
export function isOpen(i: number, st: Stars, xp: number) {
  const s = SCENARIOS[i], prev = (k: number) => SCENARIOS[k]?.pack === s.pack && (st[SCENARIOS[k].id] ?? 0) & 1;
  return levelOf(xp).level >= PACKS[s.pack][1] && (SCENARIOS[i - 1]?.pack !== s.pack || !!prev(i - 1) || !!prev(i - 2));
}

// A clear: the stars it adds and their pay. had = the star bits before; cue = the cue it was played with (the Twig pays x1.5).
export function clear(s: Scenario, had: number, tries: number, guideOff: boolean, cue: CueId) {
  const bits = had | starsFor(s, tries, guideOff), n = starCount(bits) - starCount(had);
  const pay: Pay = { xp: n * shotPay({ pRef: pRef(s), type: s.type, cue }).xp, coins: n * STAR_COINS };
  return { bits, n, pay };
}

// The feats a first clear counts, from scenarios (at most half of a feat's count, see feat()).
export function clearFeats(p: Profile, s: Scenario): Profile {
  let q = p;
  if (s.type !== 'direct') q = feat(q, s.type, 1, true);
  if (pRef(s) < 0.55) q = feat(q, 'sharp', 1, true); // Tough or harder
  return q;
}

// The stars from the saved text: known ids with bits 1 to 7 only, so a damaged save or one from another version loads.
export function readStars(text: string | null): Stars {
  let o: any = null;
  try { o = JSON.parse(text ?? 'null'); } catch {}
  const st: Stars = {};
  if (o && typeof o === 'object' && !Array.isArray(o)) for (const s of SCENARIOS) { const b = o[s.id]; if (Number.isInteger(b) && b >= 1 && b <= 7) st[s.id] = b; }
  return st;
}
