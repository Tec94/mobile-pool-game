// How long the AI takes to pick a shot, per tier (src/ai/bench.ts). Run: npm run bench:ai [tables]   (default 40)
// Hermes on the phone has no JIT. For figures without one, strip the types first (node --jitless cannot) and run the copies with --jitless.
import { benchAI } from '../src/ai/bench.ts';

console.log(benchAI(+process.argv[2] || 40));
