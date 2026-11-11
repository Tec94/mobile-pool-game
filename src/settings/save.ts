// Settings on the phone: one small JSON file in the app's documents, read once at launch.
import { File, Paths } from 'expo-file-system';
import { readSettings, Settings } from './settings.ts';

const file = () => new File(Paths.document, 'settings.json');
export function loadSettings(): Settings {
  try { const f = file(); return readSettings(f.exists ? f.textSync() : null); } catch { return readSettings(null); }
}
// Sync: a write that fails is caught here, and two quick changes cannot land out of order. A failed write loses only the last change of a setting; the game goes on.
export function saveSettings(s: Settings) {
  try { file().writeSync(JSON.stringify(s)); } catch (e) { if (__DEV__) console.warn('settings not saved', e); }
}
