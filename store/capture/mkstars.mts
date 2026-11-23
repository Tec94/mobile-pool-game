import { SCENARIOS } from '../../src/scenarios/data.ts';
const o: Record<string, number> = {}; SCENARIOS.forEach((s, i) => { if (i % 12 < 10) o[s.id] = [7, 7, 3, 7, 1, 7, 3, 7][i % 8]; });
console.log(JSON.stringify(o));
