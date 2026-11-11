// The Rival: the one quick match opponent that adapts (extra v1 features plan, section 2). It has a rating on the tier
// scale per game, which moves only between matches toward the win rate the player's mood asks for.
export type Mood = 'relaxed' | 'even' | 'tough';
export const MOODS: Mood[] = ['relaxed', 'even', 'tough'];
const TARGET: Record<Mood, number> = { relaxed: 0.65, even: 0.55, tough: 0.42 };
export interface Rating { rating: number; matches: number } // matches picks the step K
export type Rival = Record<8 | 9, Rating>;
export const START: Rating = { rating: 1, matches: 0 }, MIN = 0.5, MAX = 6.5;
export const newRival = (): Rival => ({ 8: { ...START }, 9: { ...START } });

// The result of a match for the player, 0 to 1. 8-ball: by the loser's own balls left on the table (b, 0 to 7), so a
// near thing moves the rating less. 9-ball: a flat 0.75 or 0.25, since an early 9 leaves the most balls and is the luckiest win.
export const score = (game: 8 | 9, won: boolean, b: number) =>
  0.5 + (won ? 1 : -1) * (game === 9 ? 0.25 : 0.25 + 0.25 * Math.min(7, Math.max(0, b)) / 7);
// The rating after a finished match: big steps for the first 8 matches, small after.
export function rate(r: Rating, o: number, mood: Mood): Rating {
  const k = r.matches < 8 ? 1.5 : 0.4;
  return { rating: Math.min(MAX, Math.max(MIN, r.rating + k * (o - TARGET[mood]))), matches: r.matches + 1 };
}
// The rating to one decimal, for the menus, the results card and match pay. The nudge keeps 0.55 (0.5499.. in floats) at 0.6.
export const tenth = (s: number) => Math.round(s * 10 + 1e-6) / 10;
export const shown = (s: number) => tenth(s).toFixed(1);
// Where a rating sits among the tier names, e.g. "between Hustler and Shark". names = the six tier names.
export function between(s: number, names: string[]) {
  const r = tenth(s);
  if (r < 1) return `below ${names[0]}`;
  if (r > names.length) return `above ${names[names.length - 1]}`;
  return Number.isInteger(r) ? `plays like ${names[r - 1]}` : `between ${names[Math.floor(r) - 1]} and ${names[Math.floor(r)]}`;
}
// The saved ratings: a missing or bad one starts over, a rating out of range is held to it.
export function readRival(o: any): Rival {
  const one = (v: any): Rating => v && typeof v === 'object' && Number.isFinite(v.rating)
    ? { rating: Math.min(MAX, Math.max(MIN, v.rating)), matches: Number.isInteger(v.matches) && v.matches >= 0 ? v.matches : 0 } : { ...START };
  return { 8: one(o?.[8]), 9: one(o?.[9]) };
}
