// Run: npm test
import assert from 'node:assert';
import { DEFAULTS, readSettings } from './settings.ts';
const eq = (a, b, msg) => assert.deepStrictEqual(a, b, msg);
let n = 0; const ok = name => console.log(`ok ${++n} ${name}`);

eq(readSettings(null), DEFAULTS, 'no save: the defaults'); eq(readSettings('{oops'), DEFAULTS, 'a damaged save: the defaults');
eq(readSettings('[1,2]').race, 1, 'an array is no save'); eq(readSettings('"x"'), DEFAULTS, 'a string is no save');
readSettings(null).names[0] = 'x'; eq(DEFAULTS.names[0], 'Player 1', 'the defaults are not shared');
ok('a missing or damaged save loads the defaults');

const all = { callAll: false, cloth: 1, orient: 2, names: ['Jack', 'Sam'], game: 9, race: 5, tier: 5, aiGame: 9, aiRace: 3, zones: false };
eq(readSettings(JSON.stringify(all)), all, 'every value round trips');
eq(readSettings(JSON.stringify({ callAll: false })), { ...DEFAULTS, callAll: false }, 'an older save keeps what it has');
ok('a good save loads as saved');

const bad = readSettings(JSON.stringify({ callAll: 'no', cloth: 7, orient: 1.5, names: ['  ', 42], game: 10, race: 2, tier: 6, aiGame: '9', aiRace: 4, zones: 'no', extra: 1 }));
eq(bad, DEFAULTS, 'out of range and wrong types take their defaults; unknown keys are dropped');
eq(readSettings(JSON.stringify({ names: ['  Jack  ', 'A very long name indeed'] })).names, ['Jack', 'A very long na'], 'names are trimmed and cut to 14');
ok('bad values take their defaults');
eq(readSettings(JSON.stringify({ tier: -1 })).tier, 0, 'no tier below Rookie'); eq(readSettings(JSON.stringify({ tier: 2.5 })).tier, 0, 'a tier is a whole number');
ok('the quick match setup loads in range');
