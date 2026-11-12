// The passed lessons on the phone: saved like the profile, a new file moved into place and the last good one kept.
import { loadJson, saveJson } from '../progress/save.ts';
import { readDone } from './lessons.ts';

export const loadDone = (): string[] => readDone(loadJson('learn', true) ?? null);
// false = not saved: the caller must not pay, or the lesson would pay again after the next launch.
export const saveDone = (done: string[]) => saveJson('learn', done);
