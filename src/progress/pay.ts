// What a shot and a match pay (progression design). The vs-AI modes call these; pass and play pays a flat amount (profile.ts passPlay).
import { MASTERS } from '../ai/shot-ai.ts';
import type { CueId } from './cues.ts';
import type { FeatId } from './profile.ts';

export interface Pay { xp: number; coins: number }
export type ShotType = 'direct' | 'bank' | 'combo' | 'kick';
// The opponent: an AI tier 1 Rookie to 6 Legend and 7, the Chinese Masters, or a boss and its rating. Neither = not an AI match, x1.
export interface Vs { tier?: number; boss?: number; cue?: CueId; tour?: number } // tour = a tournament round's multiplier (src/tournament/bracket.ts stakes), after the x12 cap
export interface Pot extends Vs {
  pRef: number | null;  // the average player's chance to make the shot; null = a fluke (no matching candidate)
  type?: ShotType;
  run?: number;         // pots in a row before this shot in the visit; two balls on one shot pay at the same step
  brk?: boolean;        // potted on the break
  hand?: boolean;       // the first shot after ball in hand
  foul?: boolean;       // potted on a foul
  theirs?: boolean;     // the opponent's ball
  show?: boolean;       // the Performative's For show acts on this pot: a bank, a combo or a kick pays 2 times, any other pot half
  aura?: number;        // the Aura's Aura farming: the pot's place in the run of pots, 1 = the first. Each place adds 25%, in place of the run bonus
}

// Band of a shot by pRef: its name and multiplier. Sharpshooter counts Tough and harder.
export const band = (pRef: number): [string, number] =>
  pRef >= 0.8 ? ['Routine', 1] : pRef >= 0.55 ? ['Solid', 1.5] : pRef >= 0.3 ? ['Tough', 2.5] : pRef >= 0.12 ? ['Brutal', 4] : ['Outrageous', 6];
const TYPE = { direct: 1, bank: 1.25, combo: 1.25, kick: 1.5 }, TIER = [0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.3]; // a pot against the Masters pays as against Legend: the win is what pays
// A tier outside 1 to 7 is a bug in the caller, not a pay to guess at.
function vs(v: Vs) {
  if (v.tier !== undefined && !TIER[v.tier - 1]) throw new Error(`AI tier ${v.tier} is not 1 to 7`);
  return (v.boss ? 0.7 + 0.1 * v.boss : v.tier ? TIER[v.tier - 1] : 1) * (v.cue === 'twig' ? 1.5 : 1);
}
// The opponent's rating, on the scale of the tiers. Tricks that change pay and some feats need Hustler (3) or harder.
export const rated = (v: Vs) => v.boss ?? v.tier ?? 0;
export const hustler = (v: Vs) => rated(v) >= 3;
const paid = (mult: number, tour = 1, cap = 12): Pay => ({ xp: Math.round(10 * Math.min(cap, mult) * tour), coins: Math.round(4 * Math.min(cap, mult) * tour) });

export function shotPay(p: Pot): Pay {
  if (p.foul || p.theirs) return { xp: 0, coins: 0 };
  const plain = p.pRef === null || p.brk, b = plain ? 1 : band(p.pRef!)[1];
  const type = plain || p.hand ? 1 : TYPE[p.type ?? 'direct'];
  const usual = (p.hand ? Math.min(b, 1.5) : b) * type * (p.aura ? 1 + 0.25 * (p.aura - 1) : 1 + Math.min(0.7, 0.1 * (p.run ?? 0))) * vs(p);
  // For show: the type is what happened, so with ball in hand the 2 times is paid though the type's own bonus is not. A fluke and a break pot pay half. Up to 16 times a plain pot.
  if (p.show) return !plain && (p.type ?? 'direct') !== 'direct' ? paid(2 * usual, p.tour, 16) : paid(Math.min(12, usual) / 2, p.tour);
  return paid(usual, p.tour, p.aura ? 20 : 12); // the Aura's pay tops out at 20 times a plain pot
}

// A safety pays as Tough: a legal hit, no pot, not a push-out nor ball in hand, a hard leave and the opponent then
// fails to pot. At most 2 a game.
export interface Safety extends Vs { legal: boolean; potted: boolean; push: boolean; hand: boolean; hardLeave: boolean; oppPotted: boolean; paidThisGame: number }
export const safetyPay = (s: Safety): Pay =>
  s.legal && !s.potted && !s.push && !s.hand && s.hardLeave && !s.oppPotted && s.paidThisGame < 2 ? paid(2.5 * vs(s), s.tour) : { xp: 0, coins: 0 };

// A match against an AI tier 1 to 7. A win against the Chinese Masters (7) pays 10 times a win against Legend (Jack
// 2026-11-23: a ridiculous reward, it is that hard to beat) when the player ran out every rack they won; a loss to them,
// or a win with a rack they did not run out (lucky), pays as against Legend, so losing is no way to farm.
// A loss pays for the share of own balls potted; a loss by an early 8, a concede or a quit pays nothing.
// shortcut: no break-and-run x2 (held in the design).
export interface Match { tier: number; won: boolean; fouls: number; ownPotted?: number; early?: boolean; tour?: number; lucky?: boolean } // tour = a tournament match: its round's multiplier x the frames it takes to win (bracket.ts)
const MASTERS_WIN = 60; // a Masters win's factor where Legend's is 6
export function matchPay(m: Match): Pay {
  const k = m.won ? (m.fouls ? 1 : 1.2) : m.early ? 0 : Math.min(7, m.ownPotted ?? 0) / 7;
  const [xp, coins] = m.won ? [60, 40] : [20, 10], f = m.tier < MASTERS ? m.tier : m.won && !m.lucky ? MASTERS_WIN : 6, t = m.tour ?? 1;
  return { xp: Math.round(xp * f * k * t), coins: Math.round(coins * f * k * t) }; // this order, or a cup's pay moves by 1
}

// A quick match's pay so far: what the human's shots earned, the run of pots this visit, and the fouls and own balls
// potted that matchPay reads at the end. noteShot adds a shot the rules have judged (potPay in src/ai/turn.ts).
// brk = the racks won on the player's own break shot (not in a ledger saved before it was counted).
// For the feats (profile.ts FEATS), which the match counts and its end saves: feats = the counts so far; turn = the
// player's own balls potted this turn; pairs = the 6 and the 7 potted in one turn this rack, counted when the rack
// ends and not when the player's own shot loses it (or the pair and then the 8 on a foul is a loop); behind = this
// 8-ball rack the opponent was 3 balls or more ahead; down = this match the player was 2 racks down.
// held = the Six Seven's pay this rack: paid when the rack ends, and not when the player's own shot loses it.
// aura = the Aura's run of pots and whether the next pot is owed (pays nothing): from the profile at the start of the
// match, changed by potPay, saved when the match settles.
// lucky = a rack the player won and did not run out: the AI's shot gave it (a foul on the 8, an early 8, three fouls)
// or the 9 went down with balls left (on the break, a combo). The Masters' win pays x10 only when no rack was lucky.
// In 9-ball one pot pays x10 when the Masters clears to the 9 and misses it: accepted (Jack: "you get it to fumble, and off of that one fumble you run the whole table").
// npm run bench:masters 300 <game> <rating> (2026-11-24, at b3d4209), the AI at that rating against the Masters: racks won
// 9-ball rating 1 3.0%, rating 3 5.0%, 8-ball rating 3 2.7%; x10 wins (its own shot ran the rack out) 9-ball 1 and 6 of
// 300, 8-ball 5; on 2 balls potted or fewer 9-ball 1 and 1, 8-ball 0.
export interface Ledger { shots: Pay; run: number; fouls: number; own: number; brk?: number; feats?: Partial<Record<FeatId, number>>; turn?: { ids: number[]; hot?: boolean; pair?: boolean }; pairs?: number; behind?: boolean; down?: boolean; held?: Pay; aura?: Aura; lucky?: boolean }
export interface Aura { run: number; owed: boolean }
export const newLedger = (): Ledger => ({ shots: { xp: 0, coins: 0 }, run: 0, fouls: 0, own: 0 });
const count = (l: Ledger, id: FeatId, n = 1) => { if (n) (l.feats ??= {})[id] = (l.feats[id] ?? 0) + n; };
// p = what potPay gave: feats = the feats its pots count for; mine = the player's own balls potted to keep the turn
// (none on the break). hard = the opponent is Hustler or harder; lost = this shot lost the rack.
export function noteShot(l: Ledger, p: { pay: Pay; run: number; own: number; feats?: FeatId[]; mine?: number[]; held?: boolean }, foul: boolean, brkWin = false, hard = false, lost = false) {
  const to = p.held ? l.held ??= { xp: 0, coins: 0 } : l.shots;
  to.xp += p.pay.xp; to.coins += p.pay.coins; l.run = p.run; l.own += p.own; l.fouls += +foul;
  if (brkWin) l.brk = (l.brk ?? 0) + 1;
  for (const f of p.feats ?? []) count(l, f);
  const t = l.turn ??= { ids: [] }; t.ids.push(...(p.mine ?? []));
  if (hard && !t.hot && t.ids.length >= 7) { t.hot = true; count(l, 'heater'); }                               // Heater: 7 of your balls in one turn
  if (hard && !t.pair && t.ids.includes(6) && t.ids.includes(7)) { t.pair = true; l.pairs = (l.pairs ?? 0) + 1; if (p.held) to.coins += 80; } // Thirteen: the 6 and the 7 in one turn. With the Six Seven each of the two is topped up from 27 to 67 coins
  if (!p.run) delete l.turn; // the turn is over
  if (lost) { l.pairs = 0; delete l.held; }
}
// A rack is over. Counts its pairs, pays what the Six Seven held, and in 8-ball a comeback (Nine Lives): won after the opponent was 3 balls ahead.
// ran = the player's own shot won it with none of their balls left (Ledger lucky).
export function rackOver(l: Ledger, won: boolean, hard: boolean, ran = true) {
  if (won && !ran) l.lucky = true;
  count(l, 'thirteen', l.pairs ?? 0);
  if (l.held) { l.shots.xp += l.held.xp; l.shots.coins += l.held.coins; delete l.held; }
  if (won && hard && l.behind) count(l, 'lives');
  l.pairs = 0; l.behind = false; delete l.turn; l.run = 0;
}
// The feats of a finished match: what its shots and racks counted, and what the result counts. A win on the break
// alone (settle's note) counts for none. Living Legend: a win against Legend, or a Rival rated 6.0 or more. Giant
// Killer: a win against Shark or harder with the Twig. Nine Lives in 9-ball: a race won after being 2 racks down.
// Purist: a win against Hustler or harder with the aim guide off for every shot of the match (pure).
export function matchFeats(l: Ledger, m: { vs: Vs; won: boolean; cue?: CueId; dry?: boolean; pure?: boolean }): Partial<Record<FeatId, number>> {
  const f = { ...l.feats }, r = rated(m.vs), add = (id: FeatId) => { f[id] = (f[id] ?? 0) + 1; };
  if (m.won && !m.dry) { if (r >= 6) add('legend'); if (r >= 4 && m.cue === 'twig') add('giant'); if (r >= 3 && l.down) add('lives'); if (r >= 3 && m.pure) add('purist'); }
  return f;
}
// The pay lines of a finished match. chalk = what Fresh Chalk paid (the match pay again on a win, not the shot pay),
// null when it paid nothing.
// racks = the racks the player won. A match in which every one of them ended on the player's own break shot pays
// nothing for the win and spends no Fresh Chalk (note says why): with a seeded rack the 9 still goes down on about 6%
// of 9-ball breaks, and breaking, then leaving when it stays up, paid about as much an hour as playing Rookie well.
// The break's pots still pay as shots. A rack the AI hands over (three fouls, an early 8) is not won on the break.
// luck = why a Masters win paid as Legend's: setup says it pays up to x10. Not note, which cancels the feats.
export interface Settled { match: Pay; shots: Pay; chalk: Pay | null; total: Pay; note?: string; luck?: string; got?: string[] } // got = the cues the match's feats gave
export const BREAK_ONLY = 'Won on the break: no match pay.', NOT_RUN = 'A rack was not run out: pays as a Legend win.';
export function settle(l: Ledger, m: { tier: number; won: boolean; early: boolean; tour?: number; racks?: number }, chalk?: (won: boolean, match: Pay) => Pay): Settled {
  const dry = m.won && !!m.racks && (l.brk ?? 0) >= m.racks;
  const match = dry ? { xp: 0, coins: 0 } : matchPay({ ...m, fouls: l.fouls, ownPotted: l.own, lucky: l.lucky }), x = chalk && !dry ? chalk(m.won, match) : null, c = x && (x.xp || x.coins) ? x : null;
  return { match, shots: { ...l.shots }, chalk: c, total: { xp: match.xp + l.shots.xp + (c?.xp ?? 0), coins: match.coins + l.shots.coins + (c?.coins ?? 0) }, ...(dry && { note: BREAK_ONLY }), ...(!dry && m.won && m.tier >= MASTERS && l.lucky && { luck: NOT_RUN }) };
}
