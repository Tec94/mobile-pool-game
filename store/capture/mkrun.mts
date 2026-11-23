import { newRun, recordMatch } from '../../src/tournament/bracket.ts';
let r = newRun({ cup: 1, size: 8, best: 3, game: 8, callAll: true, bank: 0 } as any, 4242);
r = recordMatch(r, true, [2, 0], { xp: 120, coins: 90 });
r = recordMatch(r, true, [2, 1], { xp: 160, coins: 120 });
console.log(JSON.stringify(r));
