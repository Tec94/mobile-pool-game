// The player's settings and the last pass and play and quick match setups. They are saved between launches (src/settings/save.ts).
import type { Mood } from '../progress/rival.ts';
import { CLOTHS } from '../theme.ts';

export interface Settings {
  callAll: boolean;          // 8-ball shot calling: true = WPA, call every shot that is not obvious; false = call only the 8
  cloth: number;             // index into CLOTHS
  menus: 0 | 1;              // which way up the menus are: landscape, portrait
  orient: 0 | 1 | 2;         // in a match: auto (follows the phone, even mid-match), portrait, landscape
  names: [string, string];   // pass and play: the last two names
  game: 8 | 9;               // pass and play: the last game
  race: 1 | 3 | 5;           // pass and play: frames to win the match
  tier: number;              // quick match: the AI tier, index into TIERS (src/ai/shot-ai.ts), or RIVAL
  aiGame: 8 | 9;             // quick match: the last game
  aiRace: 1 | 3 | 5;         // quick match: frames to win the match
  mood: Mood;                // the Rival's target win rate for the player (src/progress/rival.ts)
  zones: boolean;            // the cue angle ring: true = each zone in its own colour, blended; false = one colour
}
export const DEFAULTS: Settings = { callAll: true, cloth: 0, menus: 0, orient: 0, names: ['Player 1', 'Player 2'], game: 8, race: 1, tier: 0, aiGame: 8, aiRace: 1, mood: 'even', zones: true };
export const RACES = [1, 3, 5] as const, NAME_MAX = 14, TIER_COUNT = 6; // TIER_COUNT = TIERS.length, kept here so settings need no AI code
export const RIVAL = TIER_COUNT; // the quick match opponent that adapts, after the six tiers

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
    menus: o.menus === 1 ? 1 : 0,
    orient: [0, 1, 2].includes(o.orient) ? o.orient : DEFAULTS.orient,
    names: [name(o.names?.[0], 0), name(o.names?.[1], 1)],
    game: o.game === 9 ? 9 : 8,
    race: RACES.includes(o.race) ? o.race : DEFAULTS.race,
    tier: Number.isInteger(o.tier) && o.tier >= 0 && o.tier <= RIVAL ? o.tier : DEFAULTS.tier,
    aiGame: o.aiGame === 9 ? 9 : 8,
    aiRace: RACES.includes(o.aiRace) ? o.aiRace : DEFAULTS.aiRace,
    mood: ['relaxed', 'even', 'tough'].includes(o.mood) ? o.mood : DEFAULTS.mood,
    zones: typeof o.zones === 'boolean' ? o.zones : DEFAULTS.zones,
  };
}
