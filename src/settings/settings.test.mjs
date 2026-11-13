// Run: npm test
import assert from 'node:assert';
import { DEFAULTS, readSettings } from './settings.ts';
const eq = (a, b, msg) => assert.deepStrictEqual(a, b, msg);
let n = 0; const ok = name => console.log(`ok ${++n} ${name}`);

eq(readSettings(null), DEFAULTS, 'no save: the defaults'); eq(readSettings('{oops'), DEFAULTS, 'a damaged save: the defaults');
eq(readSettings('[1,2]').race, 1, 'an array is no save'); eq(readSettings('"x"'), DEFAULTS, 'a string is no save');
readSettings(null).names[0] = 'x'; eq(DEFAULTS.names[0], 'Player 1', 'the defaults are not shared');
ok('a missing or damaged save loads the defaults');

const all = { callAll: false, cloth: 1, menus: 1, orient: 2, names: ['Jack', 'Sam'], game: 9, race: 5, tier: 6, aiGame: 9, aiRace: 3, mood: 'tough', zones: false, bank: 2 };
eq(readSettings(JSON.stringify(all)), all, 'every value round trips');
eq(readSettings(JSON.stringify({ callAll: false })), { ...DEFAULTS, callAll: false }, 'an older save keeps what it has');
ok('a good save loads as saved');

const bad = readSettings(JSON.stringify({ callAll: 'no', cloth: 7, menus: 2, orient: 1.5, names: ['  ', 42], game: 10, race: 2, tier: 7, aiGame: '9', aiRace: 4, mood: 'angry', zones: 'no', bank: 3, extra: 1 }));
eq(bad, DEFAULTS, 'out of range and wrong types take their defaults; unknown keys are dropped');
eq(readSettings(JSON.stringify({ names: ['  Jack  ', 'A very long name indeed'] })).names, ['Jack', 'A very long na'], 'names are trimmed and cut to 14');
ok('bad values take their defaults');
eq(readSettings(JSON.stringify({ tier: -1 })).tier, 0, 'no tier below Rookie'); eq(readSettings(JSON.stringify({ tier: 2.5 })).tier, 0, 'a tier is a whole number');
ok('the quick match setup loads in range');
eq(readSettings(JSON.stringify({ menus: '1' })).menus, 0, 'menus is the number 0 or 1'); eq(readSettings(JSON.stringify({ orient: 1 })).menus, 0, 'a save from before menus: landscape menus, its match setting kept');
ok('menus load landscape unless saved as portrait');
eq([readSettings(null).bank, readSettings(JSON.stringify({ bank: 1 })).bank, readSettings(JSON.stringify({ bank: '1' })).bank], [0, 1, 0], 'bank shots: off by default, 0 to 2');
ok('bank shots load in range');
