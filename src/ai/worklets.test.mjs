// Run: npm test   (the AI runs on a worklet runtime: src/ai/think.ts). Compiles the files with a 'worklet' directive
// through babel-preset-expo, as Metro does, and checks what the worklets plugin made of them: every function think()
// reaches is a worklet, and none captures undefined. A worklet sees only what is defined before it in its file, so a
// call to a function defined further down breaks it, on the JS thread too. Then it plays a rack with the compiled code.
import assert from 'node:assert';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url), root = path.resolve(import.meta.dirname, '../..');
const babel = require('@babel/core'), preset = require.resolve('babel-preset-expo', { paths: [require.resolve('expo')] });
let n = 0; const ok = name => console.log(`ok ${++n} ${name}`);

globalThis.__DEV__ = false;
const done = {}, FILES = ['physics/engine', 'rules/rules', 'ai/shot-ai', 'ai/aim', 'ai/turn', 'progress/pay', 'progress/cues'];
function load(name) { // a compiled file as a CommonJS module; the other files of FILES come compiled too
  if (done[name]) return done[name].exports;
  const file = path.join(root, 'src', name + '.ts'), m = done[name] = { exports: {} };
  const { code } = babel.transformFileSync(file, { presets: [preset], babelrc: false, configFile: false, envName: 'production', caller: { name: 'metro', platform: 'ios', bundler: 'metro' } });
  const req = id => { const k = path.relative(path.join(root, 'src'), path.resolve(path.dirname(file), id)).replace(/\.ts$/, ''); return FILES.includes(k) ? load(k) : require(id); };
  new Function('require', 'module', 'exports', code)(req, m, m.exports);
  return m.exports;
}
const turn = load('ai/turn');
const seen = new Set(), bad = [];
const walk = (f, at) => {
  if (seen.has(f)) return; seen.add(f);
  if (!f.__workletHash) return bad.push(`${at}: not a worklet`);
  (f.__closure ?? []).forEach((v, i) => {
    const p = `${at} > ${f.name}[${i}]`;
    if (v === undefined) bad.push(`${p}: undefined (defined below its caller?)`);
    else if (typeof v === 'function') walk(v, p);
    else if (v && typeof v === 'object') JSON.stringify(v, (k, x) => (typeof x === 'function' && walk(x, `${p}.${k}`), x));
  });
};
walk(turn.think, 'think');
for (const k of FILES.slice(0, 4)) for (const [name, f] of Object.entries(load(k))) if (typeof f === 'function') walk(f, `${k}.${name}`);
assert.deepStrictEqual(bad, [], 'every function think() reaches is a worklet with all it captures defined');
assert(seen.size > 50, `${seen.size} worklets`);
ok(`the worklets plugin compiles think() and ${seen.size - 1} more worklets, none of them broken`);

// A rack on the compiled code, which is also what the JS thread runs: think() for both seats, to the end, at a rating between tiers (the Rival's aiParams).
const E = load('physics/engine'), Ru = load('rules/rules');
const mk = (x, y) => ({ x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true }), [bx, by] = E.breakSpot();
let s = Ru.newGame(8, 0, true), B = [mk(bx - 1e-3, by), ...E.rack(8).map(([, x, y]) => mk(x, y))], shots = 0;
const ids = [0, ...E.rack(8).map(([id]) => id)];
while (s.phase !== 'over' && shots < 150 && !(s.phase === 'break' && shots)) { // a rack started over ends the check too
  if (s.choice) { s = Ru.choose(s, turn.choiceFor(s)); continue; }
  shots++;
  const m = turn.think(B.map(b => ({ ...b })), ids, s, 2.5, shots, 0);
  if (m.at) Ru.moveCue(B, m.at[0], m.at[1], s.hand); if (m.call >= 0) s = Ru.setCall(s, m.call);
  const r = Ru.newRec(), ev = []; E.strike(B[0], m.shot);
  for (let k = 0; k < 60000 && (ev.length = 0, E.step(B, ev)); k++) Ru.record(r, ev, B, ids);
  s = Ru.judge(s, r); for (const id of s.spot) Ru.spotBall(B, ids.indexOf(id)); if (s.hand) Ru.handCue(B, s.hand);
}
assert(s.phase !== 'play' && shots < 150, `the rack ends (${shots} shots, ${s.note})`);
ok(`compiled code plays an 8-ball rack: ${shots} shots, ${s.note || s.phase}`);
