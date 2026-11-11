// The passed lessons on the phone: one small JSON file in the app's documents, beside the settings.
import { File, Paths } from 'expo-file-system';
import { readDone } from './lessons.ts';

const file = () => new File(Paths.document, 'learn.json');
export function loadDone(): string[] {
  try { const f = file(); return readDone(f.exists ? f.textSync() : null); } catch { return []; }
}
export function saveDone(done: string[]) {
  try { file().writeSync(JSON.stringify(done)); } catch (e) { if (__DEV__) console.warn('lessons not saved', e); }
}
