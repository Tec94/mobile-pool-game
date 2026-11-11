// When to work out the aim guide on the JS thread and when off it. A guide costs 1 to 35 ms with no JIT, most at low
// power: a slow cue ball takes many engine steps to reach its first contact. On the JS thread that is a dropped frame
// for the rail and the cue stick, so a slow guide goes to another thread (far) and the screen shows it when it comes.
// A fast one stays on the JS thread and is on screen in the same frame as the stick.
export const FAST = 4; // ms: a guide that cost less than this is worked out on the JS thread
// sync = the guide now; far = the guide on another thread, null where there is none (web).
// show(guide, ms, off) = a guide to draw, what it cost and whether it came from the other thread.
// ask(a, pull): the latest ask wins; while one is away the newest waits, the ones between are dropped.
// pull = the rail is being pulled: those guides are the slow ones, so they go far without a slow one first.
// drop(): the table changed; a guide still away is not shown.
export function guidePacer<A, G>(sync: (a: A) => G, far: ((a: A) => Promise<G>) | null, show: (g: G, ms: number, off: boolean) => void, now: () => number = () => performance.now()) {
  let cost = 0, busy = false, next: [A, boolean] | null = null, gen = 0;
  const go = (a: A, pull: boolean) => {
    const t = now(), id = gen;
    if (!far || (!pull && cost < FAST)) { const g = sync(a); cost = now() - t; show(g, cost, false); return; }
    busy = true;
    const end = (g: G | null) => {
      busy = false;
      if (g && id === gen) { cost = now() - t; show(g, cost, true); }
      const n = next ?? (!g && id === gen ? [a, pull] as [A, boolean] : null); next = null; // a failed one is worked out here
      if (n) go(...n);
    };
    far(a).then(end, () => { far = null; end(null); }); // the other thread failed: the JS thread from now on
  };
  return { ask: (a: A, pull = false) => { if (busy) next = [a, pull]; else go(a, pull); }, drop: () => { gen++; next = null; } };
}
