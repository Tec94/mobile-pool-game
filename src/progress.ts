// The player's progress for the app: the profile, loaded once, and the pay of a finished match. The model is in src/progress/.
import { gain, unlock, type Profile } from './progress/profile';
import { CUES, type CueId } from './progress/cues';
import { cueGain, masteryNote, masteryOf, statsOf } from './progress/mastery';
import { loadProfile, saveProfile } from './progress/save';
import type { Pay } from './progress/pay';

// Pass and play pays a flat amount for each finished match, whoever wins (progression design: 40 XP and 20 coins).
export const PASS_PLAY: Pay = { xp: 40, coins: 20 };
let me: Profile | null = null;
export const profile = () => (me ??= loadProfile());
export function keep(p: Profile) { me = p; saveProfile(p); }
// Add the pay and save. cue = the player's own cue played for it (not a matched cue), which earns the XP as mastery.
// Gives the levels before and after, the coins of the level-ups and the mastery line, for the results card.
export function award(pay: Pay, cue?: CueId) {
  const g = gain(profile(), pay), m = cue ? cueGain(g.profile, cue, pay.xp) : null;
  keep(m ? m.profile : g.profile);
  return { ...g, mastery: m && cue ? masteryNote(CUES[cue].name, m) : '' };
}
// The player's own cue as it plays now, with its tuning.
export const ownStats = (id: CueId) => statsOf(id, masteryOf(profile(), id));
// Give a cue and save; an owned cue writes nothing. Learn calls this with 'pencil' at 10 lessons.
export function unlockCue(id: CueId) { const p = profile(), q = unlock(p, id); if (q !== p) keep(q); }
