'worklet'; // styled() runs on the AI's worklet runtime (src/ai/think.ts): plain data and functions defined before their callers
// AI styles: a personality laid over a tier (tournament spec section 4). The edge is skill, never mere taste: a style
// plays its specialty better (aim, cue ball control, safeties), leans to it only as a tie-break (like), and stays at
// least as strong as the plain tier at the same rating (npm run bench:styles). Plain data and an id, so it crosses to
// the worklet runtime as a string and is applied there.
import type { ShotType, Tier } from './shot-ai.ts';

export type StyleId = 'banker' | 'spin' | 'wall' | 'gun' | 'closer';
export const STYLE_IDS: StyleId[] = ['banker', 'spin', 'wall', 'gun', 'closer'];
// The ratings each style is dealt at (tournament field): Spin's position play pays from 3.5 (at 3 it lost 53% of 9-ball
// racks); the Wall's safeties pay from 3.5 with its low-rating touch and bump (at 2.5 it still lost 56% of 9-ball racks);
// Gunslinger's edge is aim, which is nearly spent at Legend.
export const STYLE_RANGE: Record<StyleId, [number, number]> = { banker: [1, 7], closer: [1, 7], gun: [1, 5.5], wall: [3.5, 7], spin: [3.5, 7] };
// The rating a style plays on top of the one it is shown at: its tell (more banks, more safeties) costs some balls, and
// the bump pays that back so it wins at least half its racks against the plain tier it is shown as (Jack: "at or a
// bit above their difficulty rating"). Fitted with npm run bench:styles.
export const STYLE_BUMP: Record<StyleId, number> = { banker: 0.3, spin: 0.3, wall: 0.25, gun: 0, closer: 0.15 }; // at most 0.3
// The bump at a rating: below 4.5 the Wall's safeties are played with a club player's touch and cost more racks.
const WALL_LOW_BUMP = 0.5;
export const bumpOf = (id: StyleId, rating: number) => (id === 'wall' && rating < 4.5 ? WALL_LOW_BUMP : STYLE_BUMP[id]);
const ALL_ANGLES = [-60, -40, -20, 0, 20, 40, 60];
const add = (types: ShotType[], more: ShotType[]) => [...types, ...more.filter((t) => !types.includes(t))];

// The tier this style plays, from the plain tier at its rating (aiParams). need = balls this side still has to pot to
// win the rack (the 8 or the 9 counted). No style = the tier as it is.
export function styled(t: Tier, id?: StyleId, need = 9): Tier {
  if (id === 'banker') return { ...t, bankAim: 0.45, speedErr: t.speedErr * 0.6, budget: Math.max(8, t.budget * 1.5), types: add(t.types, ['bank', 'kick']), like: { bank: 0.35, kick: 0.35 }, sigma: t.sigma * 1.03 };
  if (id === 'spin') return { ...t, speedErr: t.speedErr * 0.5, tipErr: t.tipErr * 0.5, wPos: Math.min(1, t.wPos + 0.15), budget: t.budget * 1.4, spinLove: 0.3 };
  if (id === 'wall') return t.sigma > 0.2 // below Shark: safe only when the pot is poor, with the touch to play it
    ? { ...t, speedErr: t.speedErr * 0.5, safeAt: 0.15, wLeave: Math.max(t.wLeave, 0.5), rack: true, safetyAngles: ALL_ANGLES, hook: 1.5 }
    : { ...t, safeAt: 0.45, wLeave: 1, rack: true, safetyAngles: ALL_ANGLES, hook: 1.5 };
  if (id === 'gun') return { ...t, sigma: t.sigma * 0.85, hard: t.hard * 0.9, wPos: t.wPos * 0.6, speedErr: t.speedErr * 1.4, safetyAngles: [] };
  if (id === 'closer') return need <= 2 ? { ...t, sigma: t.sigma * 0.35, speedErr: t.speedErr * 0.4, posErr: t.posErr * 0.5, wPos: 1, budget: t.budget * 2, hard: t.hard * 0.5, safetyAngles: [] } : t; // at the end it goes for the win, never safe
  return t;
}
