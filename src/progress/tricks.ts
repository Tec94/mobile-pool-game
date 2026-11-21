// The tricks that act on the controls of a match against the AI (the cue redesign's roster). The tricks of the stick
// are in cues.ts stick(), and the tricks that change pay are in pay.ts.
import type { Aura } from './pay.ts';
import { judge, type Rec, type State } from '../rules/rules.ts';

// The Ratchet's Click stops: the pull lands on one of 10 steps, close together where soft position play lives. Under
// 5% the pull stays as it is, so a short pull still cancels the shot.
export const STEPS = [0.08, 0.12, 0.17, 0.24, 0.33, 0.45, 0.58, 0.72, 0.86, 1];
export const ratchet = (pull: number) => (pull < 0.05 ? pull : STEPS.reduce((a, s) => (Math.abs(s - pull) < Math.abs(a - pull) ? s : a)));
// The notches on the rail: the last 3 pulls of the rack, newest last, each step once.
export const notch = (last: number[], pull: number) => [...last.filter(p => p !== pull), pull].slice(-3);

// The Ram's Overdrive: the pull goes to 120% of full power, so the 100% line sits at five sixths of the rail's travel.
// ok = Overdrive may act: not on the break, and not with the cue raised (a jump tops out at 100%).
export const OVER = 1.2;
export const overdrive = (pull: number, ok: boolean) => Math.min(ok ? OVER : 1, pull * OVER);
// Its price: a strike past 100% owes a shot with no guide, the next one that is not a break. owed = a shot is owed
// before this strike. Gives what is owed after it: a break changes nothing, and any other strike pays the old one off
// and owes a new one when it is past 100%.
export const ramOwes = (owed: boolean, power: number, brk: boolean) => (brk ? owed : power > 1);

// The Whisper's Soft hands: twice a rack, a shot at 15% of the pull or less needs no cushion after the hit, so a soft
// tap up to a ball is a legal safety. Never on 2 of the player's turns in a row.
// left = the uses left this rack; turn = the player's turns so far this rack; at = the turn it last acted on.
export interface Soft { left: number; turn: number; at: number }
export const newSoft = (): Soft => ({ left: 2, turn: 0, at: -2 }), SOFT = 0.15;
export const softCan = (w: Soft) => w.left > 0 && w.at !== w.turn - 1;
// The ruling on the player's shot with Soft hands. ruled = what the rules said (judge). A use is spent only when it
// saves the shot: the pull was soft, it was no break and no push-out, and no cushion after the hit was the one thing
// wrong (a legal ball was still hit first). Changes w when it acts.
export function softHands(w: Soft, pull: number, s: State, r: Rec, ruled: State, push = false): State {
  if (!softCan(w) || pull > SOFT + 1e-9 || s.phase === 'break' || push || !ruled.foul || r.railAfter) return ruled;
  const again = judge(s, { ...r, railAfter: true });
  if (again.foul) return ruled;
  w.left--; w.at = w.turn; return again;
}
// In 9-ball a foul by the opponent on the shot straight after a Soft hands shot leaves the opponent's count of fouls
// in a row as it was: the state to judge that shot from.
export const afterSoft = (s: State): State => (s.game === 9 ? { ...s, fouls: s.turn ? [s.fouls[0], s.fouls[1] - 1] : [s.fouls[0] - 1, s.fouls[1]] } : s);

// What the HUD shows after the player's name for a trick with a state (ui/MatchHud.tsx Trick).
// The Aura: what the next pot of the run pays, as a multiple of its usual pay.
export const auraLine = (a: Aura) => (a.owed ? { text: 'x0', dim: true, label: 'Minus aura: the next pot pays nothing' } : { text: `x${1 + 0.25 * a.run}`, label: `Aura: ${a.run} in a row, the next pot pays ${1 + 0.25 * a.run} times` });
export const RAM_LINE = { text: 'No guide', label: 'Overdrive: this shot has no guide' };
export const softLine = (w: Soft) => ({ text: '●'.repeat(w.left) + '○'.repeat(2 - w.left), dim: !softCan(w), label: softCan(w) ? `Soft hands: ${w.left} left this rack` : w.left ? 'Soft hands: not on this turn' : 'Soft hands: none left this rack' });
