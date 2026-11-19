import type { StyleId } from '../ai/styles.ts';
import type { CueId } from '../progress/cues.ts';
import type { Pay } from '../progress/pay.ts';
import { breakerOf, endMatch, type Live, nextMatch, plays, prize, raceOf, recordMatch, roundName, roundOf, roundTitle, type Run, sides, stakes, wins } from './bracket.ts';
import { fits } from './snap.ts';

// What Game needs to play a tournament match: the opponent, the rules, the breaker of the first rack, the saved state,
// save() after every strike and ruling, done() at the end (saves the result, returns what it paid), forfeit().
export interface TourMatch<Paid = unknown> {
  level: number; style?: StyleId; name: string; round: string; game: 8 | 9; race: number; callAll: boolean; bank: 0 | 1 | 2; breaker: 0 | 1;
  live: Live | null; save: (l: Live) => void; next: string | null; // next = the round a win goes to, null in the final
  stakes: number; prize: (won: boolean) => Pay | null; // the round's pay multiplier; the prize the end of this match would pay, if it ends the run
  done: (won: boolean, score: [number, number], pay: Pay, cue: CueId) => Paid | null; // cue = the cue the match was played with, for its mastery
  forfeit: (score: [number, number]) => void;
}

// The player's next match of the run io.get() holds, or undefined when the run is over. io.put saves a run (false if
// the save failed), io.pay pays a saved run's earnings, io.keep saves the live match without a render.
export function tourMatch<Paid>(io: { get: () => Run | null; put: (r: Run) => boolean; pay: (r: Run, cue?: CueId) => Paid; keep: (r: Run) => void }): TourMatch<Paid> | undefined {
  const r = io.get(), m = r ? nextMatch(r) : -1;
  if (!r || m < 0) return;
  const [a, b] = sides(r, m), o = r.field[r.field[a!].human ? b! : a!], last = m === r.res.length - 1;
  // Only this match ends: a forfeit from a card left open after the result must not lose the next one. A run that
  // could not be saved pays nothing now; the launch pays it once it is on disk.
  const end = (won: boolean, score: [number, number], pay: Pay, cue?: CueId) => {
    const now = io.get(), x = now && endMatch(now, m, won, score, pay);
    return x && io.put(x) ? io.pay(x, cue) : null;
  };
  return {
    level: plays(o), style: o.style ?? undefined, name: o.name, round: roundName(r, m), next: last ? null : roundTitle(r.opts.size, roundOf(r, m) + 1),
    game: r.opts.game, race: raceOf(r.opts.best), callAll: r.opts.callAll, bank: r.opts.bank, breaker: breakerOf(r, m), live: r.live, stakes: stakes(r, m),
    prize: (won) => { const x = recordMatch(r, won, [0, 0], { xp: 0, coins: 0 }); return x.state === 'playing' ? null : prize(x.opts, wins(x)); },
    save: (l) => { const x = io.get(); if (x) io.keep({ ...x, live: l }); },
    done: end,
    // a forfeit still pays the shots played, as the saved table's ledger has them (stakes already in)
    forfeit: (score) => { const t = io.get()?.live?.table; end(false, score, fits(t, r.opts.game) ? { ...t.ledger.shots } : { xp: 0, coins: 0 }); },
  };
}
