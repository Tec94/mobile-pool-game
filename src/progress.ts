// The player's progress for the app: the profile, loaded once, and the pay of a finished match. The model is in src/progress/.
import { type FeatId, gain, matchEnd, passPlay, runOwe, unlock, type Profile } from './progress/profile';
import { type CueId, CUES } from './progress/cues';
import { cueGain, cueStats, masteryNote } from './progress/mastery';
import type { Stat } from './progress/cues';
import { loadProfile, saveProfile } from './progress/save';
import type { Aura, Pay } from './progress/pay';
import { type Mood, rate, score, START } from './progress/rival';

// Pass and play pays a flat amount for a finished match, whoever wins (progression design: 40 XP and 20 coins), for
// the first 3 of a day (profile.ts passPlay). mark goes to award() with the pay, so the count is saved with it.
const PASS_PLAY: Pay = { xp: 40, coins: 20 };
export const passPlayPay = (day: string, lost: string) => passPlay(profile(), day, lost, PASS_PLAY);
let me: Profile | null = null;
export const profile = () => (me ??= loadProfile());
export function keep(p: Profile) { me = p; saveProfile(p); }
// Add the pay and save. cue = the player's own cue played for it (not a matched cue), which earns the XP as mastery.
// Gives the levels before and after, the coins of the level-ups and the mastery line, for the results card.
// then = a change saved in the same write (a tournament's paid mark and trophy), so the two cannot part.
export function award(pay: Pay, cue?: CueId, then = (p: Profile) => p) {
  const g = gain(profile(), pay), m = cue ? cueGain(g.profile, cue, pay.xp) : null;
  keep(then(m ? m.profile : g.profile));
  return { ...g, mastery: m && cue ? masteryNote(cue, m) : '' };
}
// The player's own cue as it plays now, with its tuning.
export const ownStats = (id: CueId) => cueStats(profile(), id);
// The Maxxed's pick, saved when it is made: the next rack, the lessons and the cue's card show it.
export function maxPick(pick: Stat) { const p = profile(); if (p.maxxed !== pick) keep({ ...p, maxxed: pick }); }
// Give a cue and save; an owned cue writes nothing. Learn calls this with 'surveyor' at 10 lessons.
export function unlockCue(id: CueId) { const p = profile(), q = unlock(p, id); if (q !== p) keep(q); }
// A match against the AI is over: count its feats and its part in the Unbeaten streak (profile.ts matchEnd), and save.
// Gives the names of the cues this gave, for the results card. aura = the Aura's run as the match left it.
export function featsDone(feats: Partial<Record<FeatId, number>>, won?: boolean, aura?: Aura) {
  const p = profile(), q = matchEnd(p, feats, won, aura);
  if (q !== p) keep(q);
  return q.owned.filter(id => !p.owned.includes(id)).map(id => CUES[id].name);
}
// A strike in a match that counts for the streak: the first one marks the match in the save, so that closing the app
// in it is a loss at the next launch (matchLeft), as leaving it is. A match left before its first strike is no loss.
export function matchOpen() { const p = profile(); if (!p.open) keep({ ...p, open: true }); }
// The Ram's shot with no guide, owed or paid off: saved at the strike, so that closing the app cannot drop it.
export function ramOwed(owed: boolean) { const { ram, ...p } = profile(); if (!!ram !== owed) keep(owed ? { ...p, ram: true } : p); }
export function matchLeft() { if (profile().open) featsDone({}, false); }
// A finished Rival match: move that game's rating (src/progress/rival.ts) and save. Gives the ratings before and after.
export function rivalDone(game: 8 | 9, won: boolean, left: number, mood: Mood): [number, number] {
  const p = profile(), r = p.rival[game], next = rate(r, score(game, won, left), mood);
  keep({ ...p, rival: { ...p.rival, [game]: next } });
  return [r.rating, next.rating];
}
// Back to the start rating, as a new save has it.
export function rivalReset(game: 8 | 9) { const p = profile(); keep({ ...p, rival: { ...p.rival, [game]: { ...START } } }); }
// A tournament run's pay: what it earned less what the profile says it already paid this run (Profile.tour), in one
// save with the new mark and the trophy, so a crash anywhere pays the rest at the next launch and never twice.
export function payRun(r: { seed: number; earned: Pay; medal: [number, number] | null }, cue?: CueId) {
  const o = runOwe(profile(), r);
  return o && award(o.owe, cue, o.mark);
}
