// The cues: their stats (1 to 10), perk and how to get them, and the engine cue they make (progression design).
import { CUE, type Cue } from '../physics/engine.ts';

export interface CueInfo {
  name: string; power: number; spin: number; aim: number;
  perk?: string;             // shortcut: only Liftoff, Hex and Humble act; the others are text until their work lands
  price?: number;            // coins
  feat?: string;             // the feat that gives it (FEATS)
  level?: number;            // the level that gives it
  get?: string;              // a way to get it that has no mode yet (Learn, a career boss)
}
export const CUES = {
  house: { name: 'House Cue', power: 3, spin: 3, aim: 5 },
  broomstick: { name: 'Broomstick', power: 4, spin: 2, aim: 4, price: 400 },
  pencil: { name: 'Giant Pencil', power: 3, spin: 4, aim: 5, perk: 'Sketch: shows the cue ball path after contact', get: 'Finish 10 Learn lessons' },
  baguette: { name: 'Baguette', power: 5, spin: 4, aim: 3, perk: 'Crusty: break +10%', price: 900 },
  rod: { name: 'Fishing Rod', power: 3, spin: 6, aim: 4, perk: 'Reel: backspin +15%', feat: 'reel' },
  noodle: { name: 'Pool Noodle', power: 2, spin: 5, aim: 7, perk: 'Soft touch', price: 1500 },
  crowbar: { name: 'Crowbar', power: 6, spin: 4, aim: 5, perk: 'Heist', feat: 'bank' },
  trombone: { name: 'Trombone', power: 5, spin: 6, aim: 5, perk: 'Slide: side spin +15%', price: 3000 },
  chopsticks: { name: 'Chopsticks', power: 4, spin: 7, aim: 6, perk: 'Pinch', feat: 'combo' },
  lightning: { name: 'Lightning Rod', power: 8, spin: 4, aim: 5, perk: 'Thunder: break +20%', price: 6000 },
  periscope: { name: 'Periscope', power: 5, spin: 5, aim: 9, perk: 'Up and over', feat: 'kick' },
  icicle: { name: 'Icicle', power: 6, spin: 8, aim: 6, perk: 'Frost', price: 8000 },
  cactus: { name: 'Cactus', power: 7, spin: 7, aim: 7, feat: 'sharp' },
  rocket: { name: 'Rocket', power: 10, spin: 5, aim: 5, perk: 'Liftoff: top speed +10% past the cap', price: 12000, get: 'or beat the Pool Hall boss' },
  wizard: { name: 'Wizard Staff', power: 6, spin: 10, aim: 7, perk: 'Hex: side spin never pushes the cue ball off the aim line', feat: 'spin' },
  golden: { name: 'Golden Cue', power: 9, spin: 9, aim: 9, get: 'Beat the Penthouse boss' },
  twig: { name: 'Twig', power: 1, spin: 1, aim: 1, perk: 'Humble: shot pay x1.5', level: 20 },
} satisfies Record<string, CueInfo>;
export type CueId = keyof typeof CUES;
export const CUE_IDS = Object.keys(CUES) as CueId[];

// The engine cue for a cue: Power 1 to 10 gives top speed 3.7 to 4.5 m/s and the break the same share of 12 m/s,
// Spin 1 to 10 gives a tip limit of 0.33 to 0.50 R. matched = both players on House Cue stats, perks off.
// The Rocket's Liftoff lifts shots only; its break stays at the Power 10 12 m/s.
export function stick(id: CueId, matched = false): Cue {
  const k = matched ? 'house' : id, c: CueInfo = CUES[k], top = 3.7 + (c.power - 1) * 0.8 / 9;
  return { ...CUE, maxSpeed: top * (k === 'rocket' ? 1.1 : 1), breakSpeed: top * CUE.breakSpeed / CUE.maxSpeed, tipLimit: 0.33 + (c.spin - 1) * 0.17 / 9, squirt: k === 'wizard' ? 0 : CUE.squirt };
}
