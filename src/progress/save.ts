// The profile on the phone: one JSON file in the app's documents, like the settings, but progress is precious. A save
// writes a new file and moves it into place, and the last good file stays as a backup that loads when the main one
// is damaged or missing.
import { File, Paths } from 'expo-file-system';
import { readProfile, type Profile } from './profile.ts';

const file = (name: string) => new File(Paths.document, name);
const good = (name: string) => { try { const t = file(name).textSync(); JSON.parse(t); return t; } catch { return null; } };
export const loadProfile = (): Profile => readProfile(good('profile.json') ?? good('profile.bak.json'));
// Sync, like saveSettings: two quick saves cannot land out of order. A failed save keeps the last good file.
export function saveProfile(p: Profile) {
  try {
    file('profile.new.json').writeSync(JSON.stringify(p));
    if (good('profile.json')) file('profile.json').moveSync(file('profile.bak.json'), { overwrite: true });
    file('profile.new.json').moveSync(file('profile.json'), { overwrite: true });
  } catch (e) { if (__DEV__) console.warn('progress not saved', e); }
}
