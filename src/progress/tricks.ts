// The tricks that act on the controls of a match against the AI (the cue redesign's roster). The tricks of the stick
// are in cues.ts stick(), and the tricks that change pay are in pay.ts.
import type { Aura } from './pay.ts';

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

// What the HUD shows after the player's name for a trick with a state (ui/MatchHud.tsx Trick).
// The Aura: what the next pot of the run pays, as a multiple of its usual pay.
export const auraLine = (a: Aura) => (a.owed ? { text: 'x0', dim: true, label: 'Minus aura: the next pot pays nothing' } : { text: `x${1 + 0.25 * a.run}`, label: `Aura: ${a.run} in a row, the next pot pays ${1 + 0.25 * a.run} times` });
export const RAM_LINE = { text: 'No guide', label: 'Overdrive: this shot has no guide' };
