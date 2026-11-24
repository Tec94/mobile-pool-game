// expo-file-system for the web demo: files live in memory, so a visit keeps nothing and a reload starts clean.
const files = new Map();
export const Paths = { document: 'doc', bundle: null };
export class File {
  constructor(_dir, name) { this.name = name; }
  get exists() { return files.has(this.name); }
  textSync() { if (!files.has(this.name)) throw new Error('no file ' + this.name); return files.get(this.name); }
  writeSync(s) { files.set(this.name, s); }
  moveSync(to) { files.set(to.name, this.textSync()); files.delete(this.name); }
}
