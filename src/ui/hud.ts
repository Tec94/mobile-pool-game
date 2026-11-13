// What the match HUD shows for a rules State: the two player plates, the 9-ball strip and the banner. Pure TS, so
// src/ui/hud.test.mjs checks it; src/ui/MatchHud.tsx draws it.
import { canCall, lowest, type State } from '../rules/rules.ts';

export interface Pip { id: number; gone: boolean } // gone = potted: the pip is drawn hollow
// text = line 2 when it is words; warn = draw it in the foul red; label = the plate read aloud.
export interface Plate { name: string; on: boolean; text: string; warn: boolean; pips: Pip[]; label: string }

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export function plates(s: State, names = ['Player 1', 'Player 2']): Plate[] {
  const pip = (id: number): Pip => ({ id, gone: !s.balls.includes(id) });
  return [0, 1].map(p => {
    const name = names[p], on = s.turn === p, warn = s.game === 9 && s.fouls[p] === 2;
    let text = '', pips: Pip[] = [];
    if (s.game === 9) text = warn ? '2 fouls · next loses' : ''; // WPA 5.8 warning: on the plate, where the banner's 2-line cap cannot cut it
    else if (s.phase === 'break') text = on ? 'Break' : 'Open';
    else if (s.solids < 0) text = 'Open';
    else {
      pips = (s.solids === p ? range(1, 7) : range(9, 15)).map(pip);
      if (pips.every(q => q.gone)) { pips = [pip(8)]; text = 'On the 8'; }
    }
    const left = pips.length ? `${s.solids === p ? 'solids' : 'stripes'}, ${pips.filter(q => !q.gone).length} left` : '';
    return { name, on, text, warn, pips, label: [name, on && 'to shoot', text || left].filter(Boolean).join(', ') };
  });
}

// 9-ball: balls 1 to 9; next = the lowest ball on the table, the one to hit first. Empty in 8-ball.
export const strip = (s: State) => (s.game === 9 ? range(1, 9).map(id => ({ id, gone: !s.balls.includes(id), next: id === lowest(s) })) : []);

// The banner over the table. note = the ruling on the last shot (shown for a moment); hint = what the player must do
// now (shown until it is done). The results card and a decision card show the ruling themselves. wait = what the
// other side is doing (the AI thinks, or '' while it shoots): it takes the place of the hint, even over a decision the
// AI makes. undefined = the player's own turn.
export function banner(s: State, push: boolean, wait?: string) {
  if (s.phase === 'over' || (s.choice && wait === undefined)) return { note: '', foul: false, hint: '' };
  if (wait !== undefined) return { note: s.choice ? '' : s.note, foul: !s.choice && s.foul, hint: wait };
  const ask = canCall(s) && s.call < 0, note = s.note;
  const said = /ball in hand/i.test(note); // the ruling already says it: the hint only says what to do
  const hint = [s.hand === 'kitchen' ? (said ? 'Drag the cue ball behind the line.' : 'Ball in hand behind the line: drag the cue ball.') : s.hand ? (said ? 'Drag the cue ball.' : 'Ball in hand: drag the cue ball.') : '',
    ask ? 'Call a pocket.' : '', s.lit.length ? 'Bank off a lit cushion.' : '', push ? 'Push out: no ball or rail needed.' : ''].filter(Boolean).join(' ');
  return { note, foul: s.foul, hint };
}

// Should the banner pop this note? Only a new ruling or a new shot (judge makes a new balls array): the same note coming
// back after a decision card closes was already read.
export const fresh = (last: { note: string; balls: number[] } | null, note: string, balls: number[]) => !!note && (!last || last.note !== note || last.balls !== balls);
