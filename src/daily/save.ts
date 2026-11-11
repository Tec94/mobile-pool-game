// The daily state on the phone: one small JSON file in the app's documents, like the lessons.
import { File, Paths } from 'expo-file-system';
import { readDaily, type Daily } from './daily.ts';

const file = () => new File(Paths.document, 'daily.json');
export function loadDaily(today: string): Daily {
  try { const f = file(); return readDaily(f.exists ? f.textSync() : null, today); } catch { return readDaily(null, today); }
}
// false = not saved: the caller must not pay, or the day would pay again after the next launch.
export function saveDaily(d: Daily) {
  try { file().writeSync(JSON.stringify(d)); return true; } catch (e) { if (__DEV__) console.warn('daily not saved', e); return false; }
}
