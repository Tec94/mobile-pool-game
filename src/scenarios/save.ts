// The scenario stars on the phone: one small JSON file in the app's documents, beside the lessons.
import { File, Paths } from 'expo-file-system';
import { readStars, type Stars } from './scenarios.ts';

const file = () => new File(Paths.document, 'scenarios.json');
export function loadStars(): Stars {
  try { const f = file(); return readStars(f.exists ? f.textSync() : null); } catch { return {}; }
}
// false = not saved: the caller must not pay, or the stars would pay again after the next launch.
export function saveStars(st: Stars) {
  try { file().writeSync(JSON.stringify(st)); return true; } catch (e) { if (__DEV__) console.warn('scenario stars not saved', e); return false; }
}
