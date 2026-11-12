// The scenario stars on the phone: saved like the profile, a new file moved into place and the last good one kept.
import { loadJson, saveJson } from '../progress/save.ts';
import { readStars, type Stars } from './scenarios.ts';

export const loadStars = (): Stars => readStars(loadJson('scenarios') ?? null);
// false = not saved: the caller must not pay, or the stars would pay again after the next launch.
export const saveStars = (st: Stars) => saveJson('scenarios', st);
