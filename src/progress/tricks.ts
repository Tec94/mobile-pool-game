// The tricks that act on the controls of a match against the AI (the cue redesign's roster). The tricks of the stick
// are in cues.ts stick(), and the tricks that change pay are in pay.ts.
import type { Aura } from './pay.ts';
import type { Ball } from '../physics/engine.ts';
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

// The Nonchalant's Whatever: the ruling on the player's shot with no pocket to call. Any of the player's balls in any
// pocket counts, and on the 8 any pocket wins (the 8's own pocket stands in for the call). A bank the mode asks for is
// still needed. The setting stays as it was for the opponent.
export const whatever = (s: State, r: Rec, push = false): State => ({ ...judge({ ...s, callAll: false, call: r.pots.find(p => p.id === 8)?.pocket ?? -1 }, r, push), callAll: s.callAll });
// Its paid flukes: the first 2 of a rack (turn.ts potPay).
export const newFlukes = () => ({ left: 2 });
export const flukeLine = (f: { left: number }) => ({ text: '●'.repeat(f.left) + '○'.repeat(2 - f.left), dim: !f.left, label: f.left ? `Whatever: the next ${f.left === 1 ? 'fluke' : '2 flukes'} this rack pay 6 times a plain pot` : 'Whatever: no paid flukes left this rack' });

// The Seer's Omen: 3 times a rack the player arms the eye and holds the pull still; the eye opens, and the guide is gold
// when this exact shot pots. left = the uses left this rack; armed = the eye waits for a still pull; open = it has
// answered and the shot is frozen at pull; plain = the eye opened, so the player's next shot pays as a plain pot.
export interface Omen { left: number; armed: boolean; open: boolean; gold: boolean; pull: number; plain: boolean }
export const newOmen = (plain = false): Omen => ({ left: 3, armed: false, open: false, gold: false, pull: 0, plain });
export const HOLD_MS = 600, STILL = 0.02; // the pull holds still: it moves less than 2% of the rail for 0.6 s
// Gold: the rules would rule the shot as no foul, with a ball potted that keeps the turn or wins the rack (a ball of
// the player's, in the called pocket where a call is needed). o = the shot played ahead (rules.ts ahead).
export const gold = (s: State, o: { r: Rec; next: State } | null) => !!o && !o.next.foul && o.r.pots.some(p => p.id) && (o.next.phase === 'over' ? o.next.winner === s.turn : o.next.turn === s.turn);
export const omenLine = (o: Omen) => ({ text: '●'.repeat(o.left) + '○'.repeat(3 - o.left), dim: !o.left, label: `Omen: ${o.left} left this rack${o.plain ? '. The next shot pays as a plain pot' : ''}` });

// The Hindsight's Take back: once a rack the player takes the last shot back. left = the uses left this rack; blind =
// the shot in its place is being lined up: it has no guide.
export const newPast = () => ({ left: 1, blind: false });
// What the ruling on the player's shot means for it. 'ask' = the shot ended the turn, fouled or lost the rack: the game
// stops and asks. 'keep' = a pot: it may be taken back until the next pull. 'no' = it won the rack.
export const hindsight = (next: State, me: number) => (next.phase === 'over' && next.winner === me ? 'no' : next.foul || next.turn !== me || next.phase === 'over' ? 'ask' : 'keep');
export const pastLine = (p: { left: number; blind: boolean }) => (p.blind ? { text: 'No guide', label: 'Take back: this shot has no guide' } : { text: p.left ? '●' : '○', dim: !p.left, label: p.left ? 'Take back: 1 left this rack' : 'Take back: none left this rack' });

// The Airbrake's Brake: armed once a rack, for a shot of 70% power at most. A tap on the table while that shot plays
// stops the cue ball dead where it was in the frame on screen. left = the uses left this rack; armed = the next strike
// is the braked shot; live = that shot is in play and no tap has acted; frames = a copy of the table for each of its
// last frames (the app makes frames ahead of the screen, so the table itself is past what the player sees).
export interface Kept { B: Ball[]; m: number[][]; fx: object[]; rec: Rec }
export interface Brake { left: number; armed: boolean; live: boolean; frames: Kept[] }
export const newBrake = (): Brake => ({ left: 1, armed: false, live: false, frames: [] }), BRAKE_MAX = 0.7, KEEP = 32;
// The copy to put back for a tap: the frame on screen is the newest one made, less the ones that still wait to be
// shown. null = the tap does nothing: the cue ball has not hit a ball yet (a cushion does not count), or it is in the
// air or off the table.
export const brakeAt = (frames: Kept[], waiting: number): Kept | null => {
  const f = frames[Math.max(0, frames.length - 1 - waiting)];
  return f && f.rec.first >= 0 && f.B[0].on && !((f.B[0].z || 0) > 0) ? f : null;
};
export const brakeLine = (b: Brake) => (b.live ? { text: 'Tap to stop', label: 'Brake: tap the table to stop the cue ball' } : b.armed ? { text: 'Armed', label: 'Brake: armed. This shot is 70% power at most' } : { text: b.left ? '●' : '○', dim: !b.left, label: b.left ? 'Brake: 1 left this rack' : 'Brake: none left this rack' });

// The Marble's Mog: ahead on balls potted this rack, 8 in every stat; behind, 2; tied, 5.
// The lead: with the groups set in 8-ball, each group's balls off the table, whoever potted them. Before that, and in
// 9-ball, sunk = the balls each player potted this rack (noteSunk).
export function mogLead(s: State, sunk: number[]) {
  const left = (p: number) => s.balls.filter(id => id !== 8 && (id < 8) === (s.solids === p)).length;
  return s.game === 8 && s.solids >= 0 ? left(1) - left(0) : sunk[0] - sunk[1];
}
export const mog = (lead: number) => { const v = lead > 0 ? 8 : lead < 0 ? 2 : 5; return { power: v, spin: v, aim: v }; };
// A ruled shot adds its potted balls to the shooter's count: in 8-ball every ball, in 9-ball only with no foul.
export function noteSunk(sunk: number[], s: State, r: Rec, ruled: State) { if (s.game === 8 || !ruled.foul) sunk[s.turn] += r.pots.filter(p => p.id).length; }

// What the HUD shows after the player's name for a trick with a state (ui/MatchHud.tsx Trick).
// The Aura: what the next pot of the run pays, as a multiple of its usual pay.
export const auraLine = (a: Aura) => (a.owed ? { text: 'x0', dim: true, label: 'Minus aura: the next pot pays nothing' } : { text: `x${1 + 0.25 * a.run}`, label: `Aura: ${a.run} in a row, the next pot pays ${1 + 0.25 * a.run} times` });
export const RAM_LINE = { text: 'No guide', label: 'Overdrive: this shot has no guide' };
export const softLine = (w: Soft) => ({ text: '●'.repeat(w.left) + '○'.repeat(2 - w.left), dim: !softCan(w), label: softCan(w) ? `Soft hands: ${w.left} left this rack` : w.left ? 'Soft hands: not on this turn' : 'Soft hands: none left this rack' });
// The number is the change to each stat, always 3: not the lead in balls.
export const mogLine = (lead: number) => (lead > 0 ? { text: 'Mogging +3', label: 'Mogging: 8 in every stat' } : lead < 0 ? { text: 'Mogged −3', dim: true, label: 'Mogged: 2 in every stat' } : null);
// The Maxxed: the second pick of the rack, as 1 pip.
export const maxLine = (left: boolean) => ({ text: left ? '●' : '○', dim: !left, label: left ? 'Statmaxxing: 1 more pick this rack, at the start of a turn' : 'Statmaxxing: no more picks this rack' });
