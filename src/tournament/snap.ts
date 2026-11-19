// A tournament match as it is saved in the run (Run.live.table, written by Game in App.tsx at every strike and ruling):
// the table, the rules, the pay so far, the AI's counters, the cue as tuned, and the shot struck if one was in flight.
// The engine is deterministic, so that shot plays out the same again after a relaunch.
import { CUES, type CueId } from '../progress/cues.ts';
import type { Ball, Shot } from '../physics/engine.ts';
import type { State } from '../rules/rules.ts';
import type { Ledger } from '../progress/pay.ts';
import type { Safeties } from '../ai/turn.ts';

export interface Snap { v: 1; B: Ball[]; ids: number[]; rules: State; push: boolean; ledger: Ledger; safe: Safeties; seed: number; cue: CueId; stats: { power: number; spin: number; aim: number }; shot?: Shot }
// A snapshot from another app version, or of another game, may not fit: then the match starts a fresh rack at its saved score.
export function fits(t: unknown, game: 8 | 9): t is Snap {
  const s = t as Snap, num = (x: unknown) => Number.isFinite(x), all = (o: any, ks: string[]) => !!o && ks.every((k) => num(o[k]));
  return !!s && s.v === 1 && Array.isArray(s.B) && Array.isArray(s.ids) && s.ids.length === (game === 8 ? 16 : 10) && s.B.length === s.ids.length
    && s.B.every((b) => all(b, ['x', 'y', 'vx', 'vy', 'wx', 'wy', 'wz']) && typeof b.on === 'boolean')
    && s.rules?.game === game && typeof s.rules.phase === 'string' && Array.isArray(s.rules.balls) && typeof s.push === 'boolean'
    && all(s.ledger?.shots, ['xp', 'coins']) && all(s.ledger, ['run', 'fouls', 'own']) && all(s.safe, ['row', 'rack']) && num(s.seed) && !!CUES[s.cue]
    && all(s.stats, ['power', 'spin', 'aim']) && (s.shot === undefined || all(s.shot, ['ang', 'speed', 'a', 'b'])); // a shot in flight is struck again
}
