// Builds the free web demo (the App Clip's one 8-ball match) into site/public/play, which runout.win serves at /play.
// The build runs in a copy of the repo, so the demo's entry, Metro config and app.json changes never touch the app.
// Needs the root `npm ci` first. Usage: node scripts/demo-web.mjs
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '..'), out = join(repo, 'site', 'public', 'play'), tmp = join(repo, '.demo-build');
if (!existsSync(join(repo, 'node_modules', 'react-native-web'))) throw new Error('run npm ci at the repo root first');
// The copy sits in the repo (git ignores it) so asset paths in the bundle are short and name no folder on the PC.
const SKIP = new Set(['.git', '.demo-build', 'node_modules', 'dist', 'site', 'ios', 'android', '.expo']);
// The link to node_modules goes first, so no delete can walk through it into the real packages.
const clean = () => { try { unlinkSync(join(tmp, 'node_modules')); } catch {} rmSync(tmp, { recursive: true, force: true }); };
clean();
for (const f of readdirSync(repo)) if (!SKIP.has(f)) cpSync(join(repo, f), join(tmp, f), { recursive: true });
symlinkSync(join(repo, 'node_modules'), join(tmp, 'node_modules'), 'junction');
cpSync(join(tmp, 'demo', 'metro.config.js'), join(tmp, 'metro.config.js'));
const pkg = JSON.parse(readFileSync(join(tmp, 'package.json'), 'utf8'));
writeFileSync(join(tmp, 'package.json'), JSON.stringify({ ...pkg, main: 'demo/index.ts' }));
const app = JSON.parse(readFileSync(join(tmp, 'app.json'), 'utf8'));
app.expo.experiments = { ...app.expo.experiments, baseUrl: '/play' };
app.expo.web = { output: 'single' }; // demo/index.html names the icon
writeFileSync(join(tmp, 'app.json'), JSON.stringify(app));
mkdirSync(join(tmp, 'public'), { recursive: true });
cpSync(join(tmp, 'demo', 'index.html'), join(tmp, 'public', 'index.html')); // the page template: dark ground and a loading mark
cpSync(join(repo, 'node_modules', 'canvaskit-wasm', 'bin', 'full', 'canvaskit.wasm'), join(tmp, 'public', 'canvaskit.wasm'));
rmSync(out, { recursive: true, force: true });

// expo export can stay up after it has written everything (seen on Linux), so the build ends at its last line. The
// output path is relative: on Windows the shell would split an absolute path with a space in it.
const x = spawn('npx', ['expo', 'export', '--platform', 'web', '--output-dir', '../site/public/play', ...process.argv.slice(2)], { cwd: tmp, env: { ...process.env, CI: '1' }, shell: process.platform === 'win32', detached: process.platform !== 'win32' });
const stop = () => { try { process.platform === 'win32' ? spawnSync('taskkill', ['/pid', String(x.pid), '/T', '/F']) : process.kill(-x.pid); } catch {} }; // the whole tree: npx, then expo
let log = '';
try {
await new Promise((ok, fail) => {
  const late = setTimeout(() => { stop(); fail(new Error('expo export took over 10 minutes')); }, 600_000);
  const end = () => { clearTimeout(late); ok(); };
  const read = d => { process.stderr.write(d); log += d; if (/Exported: /.test(log)) end(); };
  x.stdout.on('data', read); x.stderr.on('data', read);
  x.on('exit', code => (code === 0 || /Exported: /.test(log) ? end() : (clearTimeout(late), fail(new Error('expo export failed: ' + code)))));
});
} finally {
  stop();
  try { clean(); } catch {} // the copy is only for the build, failed or not; a locked file on Windows can stay until the next one
}
if (!existsSync(join(out, 'index.html'))) throw new Error('no index.html in ' + out);
rmSync(join(out, 'metadata.json'), { force: true }); // expo's build notes: nothing a visitor needs
console.log('demo built in', out);
