// The daily state on the phone: saved like the profile, a new file moved into place and the last good one kept.
import { loadJson, saveJson } from '../progress/save.ts';
import { readDaily, type Daily } from './daily.ts';

// damaged = there are files but none can be read: start fresh but do not save over them at launch.
export function loadDaily(today: string) {
  const t = loadJson('daily');
  return { daily: readDaily(t ?? null, today), damaged: t === undefined };
}
// false = not saved: the caller must not pay, or the day would pay again after the next launch.
export const saveDaily = (d: Daily) => saveJson('daily', d);
