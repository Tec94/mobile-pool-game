// The tournament run on the phone, saved like the profile (a new file moved into place, the last good one kept).
import { loadJson, saveJson } from '../progress/save.ts';
import { readRun, type Run } from './bracket.ts';

// damaged = there are files but none can be read: no run, and nothing is saved over them until a new run starts.
// damaged = a save was there but could not be read or played (none = no run, as saveRun(null) writes it)
export function loadRun() {
  const t = loadJson('tournament'), run = readRun(t ?? null);
  return { run, damaged: t === undefined || (!!t && !run && !/"none":true/.test(t)) };
}
// false = not saved: the caller must not pay for what it would have saved.
export const saveRun = (r: Run | null) => saveJson('tournament', r ?? { v: 1, none: true });
