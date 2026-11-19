// The tournament run on the phone, saved like the profile (a new file moved into place, the last good one kept).
import { loadJson, saveJson } from '../progress/save.ts';
import { readRun, type Run } from './bracket.ts';

// damaged = there are files but none can be read: no run, and nothing is saved over them until a new run starts.
export function loadRun() { const t = loadJson('tournament'); return { run: readRun(t ?? null), damaged: t === undefined }; }
// false = not saved: the caller must not pay for what it would have saved.
export const saveRun = (r: Run | null) => saveJson('tournament', r ?? { v: 1, none: true });
