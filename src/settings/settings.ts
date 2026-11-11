// The player's settings and the last pass and play setup. They are saved between launches (src/settings/save.ts).
import { CLOTHS } from '../theme.ts';

export interface Settings {
  callAll: boolean;          // 8-ball shot calling: true = WPA, call every shot that is not obvious; false = call only the 8
  cloth: number;             // index into CLOTHS
  orient: 0 | 1 | 2;         // auto (follows the phone, even mid-match), portrait, landscape
  names: [string, string];   // pass and play: the last two names
  game: 8 | 9;               // pass and play: the last game
  race: 1 | 3 | 5;           // pass and play: frames to win the match
}
export const DEFAULTS: Settings = { callAll: true, cloth: 0, orient: 0, names: ['Player 1', 'Player 2'], game: 8, race: 1 };
export const RACES = [1, 3, 5] as const, NAME_MAX = 14;

// Settings from the saved text. A value that is missing, of the wrong type or out of range takes its default, so a
// save from an older or newer version of the app, or a damaged one, still loads.
export function readSettings(text: string | null): Settings {
  let o: any = null;
  try { o = JSON.parse(text ?? 'null'); } catch {}
  if (!o || typeof o !== 'object') return { ...DEFAULTS, names: [...DEFAULTS.names] };
  const name = (v: unknown, i: number) => typeof v === 'string' && v.trim() ? v.trim().slice(0, NAME_MAX) : DEFAULTS.names[i];
  return {
    callAll: typeof o.callAll === 'boolean' ? o.callAll : DEFAULTS.callAll,
    cloth: Number.isInteger(o.cloth) && o.cloth >= 0 && o.cloth < CLOTHS.length ? o.cloth : DEFAULTS.cloth,
    orient: [0, 1, 2].includes(o.orient) ? o.orient : DEFAULTS.orient,
    names: [name(o.names?.[0], 0), name(o.names?.[1], 1)],
    game: o.game === 9 ? 9 : 8,
    race: RACES.includes(o.race) ? o.race : DEFAULTS.race,
  };
}
