// What a shot and a match pay (progression design). The vs-AI modes call these; pass and play pays PASS_PLAY.
import type { CueId } from './cues.ts';

export interface Pay { xp: number; coins: number }
export type ShotType = 'direct' | 'bank' | 'combo' | 'kick';
// The opponent: an AI tier 1 Rookie to 6 Legend, or a boss and its rating. Neither = not an AI match, x1.
export interface Vs { tier?: number; boss?: number; cue?: CueId }
export interface Pot extends Vs {
  pRef: number | null;  // the average player's chance to make the shot; null = a fluke (no matching candidate)
  type?: ShotType;
  run?: number;         // pots in a row before this shot in the visit; two balls on one shot pay at the same step
  brk?: boolean;        // potted on the break
  hand?: boolean;       // the first shot after ball in hand
  foul?: boolean;       // potted on a foul
  theirs?: boolean;     // the opponent's ball
}

// Band of a shot by pRef: its name and multiplier. Sharpshooter counts Tough and harder.
export const band = (pRef: number): [string, number] =>
  pRef >= 0.8 ? ['Routine', 1] : pRef >= 0.55 ? ['Solid', 1.5] : pRef >= 0.3 ? ['Tough', 2.5] : pRef >= 0.12 ? ['Brutal', 4] : ['Outrageous', 6];
const TYPE = { direct: 1, bank: 1.25, combo: 1.25, kick: 1.5 }, TIER = [0.8, 0.9, 1, 1.1, 1.2, 1.3];
const vs = (v: Vs) => (v.boss ? 0.7 + 0.1 * v.boss : v.tier ? TIER[v.tier - 1] : 1) * (v.cue === 'twig' ? 1.5 : 1);
const paid = (mult: number): Pay => ({ xp: Math.round(10 * Math.min(12, mult)), coins: Math.round(4 * Math.min(12, mult)) });

export function shotPay(p: Pot): Pay {
  if (p.foul || p.theirs) return { xp: 0, coins: 0 };
  const plain = p.pRef === null || p.brk, b = plain ? 1 : band(p.pRef!)[1];
  const type = plain || p.hand ? 1 : TYPE[p.type ?? 'direct'];
  return paid((p.hand ? Math.min(b, 1.5) : b) * type * (1 + Math.min(0.7, 0.1 * (p.run ?? 0))) * vs(p));
}

// A safety pays as Tough: a legal hit, no pot, not a push-out nor ball in hand, a hard leave and the opponent then
// fails to pot. At most 2 a game.
export interface Safety extends Vs { legal: boolean; potted: boolean; push: boolean; hand: boolean; hardLeave: boolean; oppPotted: boolean; paidThisGame: number }
export const safetyPay = (s: Safety): Pay =>
  s.legal && !s.potted && !s.push && !s.hand && s.hardLeave && !s.oppPotted && s.paidThisGame < 2 ? paid(2.5 * vs(s)) : { xp: 0, coins: 0 };

// A match against an AI tier 1 to 6. A loss pays for the share of own balls potted; a loss by an early 8, a concede
// or a quit pays nothing. shortcut: no break-and-run x2 (held in the design).
export interface Match { tier: number; won: boolean; fouls: number; ownPotted?: number; early?: boolean }
export function matchPay(m: Match): Pay {
  const k = m.won ? (m.fouls ? 1 : 1.2) : m.early ? 0 : Math.min(7, m.ownPotted ?? 0) / 7;
  const [xp, coins] = m.won ? [60, 40] : [20, 10];
  return { xp: Math.round(xp * m.tier * k), coins: Math.round(coins * m.tier * k) };
}
