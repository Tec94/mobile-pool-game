// The profile on the phone: one JSON file in the app's documents, like the settings, but progress is precious. A save
// writes a new file and moves it into place, and the last good file stays as a backup that loads when the main one
// is damaged or missing. The Daily Table saves the same way.
import { File, Paths } from 'expo-file-system';
import { readProfile, type Profile } from './profile.ts';

const file = (name: string) => new File(Paths.document, name);
// A file is good when it holds a JSON object: null, [] or a damaged file falls to the next one.
const good = (name: string) => {
  try { const t = file(name).textSync(), o = JSON.parse(t); return o && typeof o === 'object' && !Array.isArray(o) ? t : null; } catch { return null; }
};
// A good new file is the newest complete save: a crash after its write and before its move leaves it there.
// undefined = files are there but none is good, so the caller must not save over them unasked.
export function loadJson(base: string) {
  const names = [`${base}.new.json`, `${base}.json`, `${base}.bak.json`];
  for (const n of names) { const t = good(n); if (t) return t; }
  return names.some(n => { try { return file(n).exists; } catch { return false; } }) ? undefined : null;
}
// Sync, like saveSettings: two quick saves cannot land out of order. A failed save keeps the last good file.
export function saveJson(base: string, o: object) {
  try {
    file(`${base}.new.json`).writeSync(JSON.stringify(o));
    if (good(`${base}.json`)) file(`${base}.json`).moveSync(file(`${base}.bak.json`), { overwrite: true });
    file(`${base}.new.json`).moveSync(file(`${base}.json`), { overwrite: true });
    return true;
  } catch (e) { if (__DEV__) console.warn(`${base} not saved`, e); return false; }
}
export const loadProfile = (): Profile => readProfile(loadJson('profile') ?? null);
export const saveProfile = (p: Profile) => saveJson('profile', p);
