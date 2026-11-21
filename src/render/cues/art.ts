// @ts-nocheck
// The 26 cues, drawn. This file is the browser prototype's drawing code as the review rounds approved it
// (/cue-redesign/round2/draft9/src: engine.js, craft.js, machine.js, relic.js, joke.js), unchanged but for two things:
// the text label, which the prototype drew through the browser's transform, and the exports. ctx is a Ctx2D
// (render/ctx2d.ts), which gives the drawings the canvas calls they were written against. index.ts is the typed way in.
// shortcut: not type-checked, so that the drawings stay a copy of the approved ones; npm run frames draws every cue.
// turn = how far the canvas is turned when the cue is drawn, in radians, so a number on a cue stays upright; flip = the
// cue is drawn mirrored across its length (the table does, to keep its lit edge up), so a number is mirrored back.
// A cue lies along x from its tip (t = 0) to the end of its butt (t = 1), 1.10 m long. v runs across it, -1 to 1.
// S = px per metre, K = how much fatter than life (1 on the table).
const LEN = 1.1, R = 0.0286;
const taper = t => (t < 0.5 ? 0.0065 + 0.004 * t / 0.5 : 0.0105 + 0.0045 * (t - 0.5) / 0.5);
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

export function G(ctx, cue, S, K, time, power, turn = 0, flip = false) {
  const hw = cue.hw || taper, mid = cue.mid || (() => 0), X = t => t * LEN * S, Y = (t, v) => (mid(t) + v * hw(t)) * S * K;
  const g = {
    ctx, S, K, X, Y, hw, time, power,
    path(pts) { ctx.beginPath(); pts.forEach(([t, v], i) => (i ? ctx.lineTo(X(t), Y(t, v)) : ctx.moveTo(X(t), Y(t, v)))); ctx.closePath(); },
    poly(pts, fill, a = 1) { g.path(pts); ctx.globalAlpha = a; ctx.fillStyle = fill; ctx.fill(); ctx.globalAlpha = 1; },
    edge(t0, t1, v0, v1) { const n = Math.max(1, Math.ceil((t1 - t0) * 240)), a = [], b = []; for (let i = 0; i <= n; i++) { const t = t0 + (t1 - t0) * i / n; a.push([t, v0]); b.unshift([t, v1]); } return [...a, ...b]; },
    band(t0, t1, fill, v0 = -1, v1 = 1, a = 1) { g.poly(g.edge(t0, t1, v0, v1), fill, a); },
    body(t0 = 0, t1 = 1) { g.path(g.edge(t0, t1, -1, 1)); },
    // n stripes from t0 to t1 in turn c1, c2; slant leans them, as a share of one stripe, so they read as a twist
    stripes(t0, t1, n, c1, c2, slant = 0) { const d = (t1 - t0) / n; for (let i = -1; i <= n; i++) { const a = t0 + d * i, s = d * slant; g.poly([[a - s, -1], [a + d - s, -1], [a + d + s, 1], [a + s, 1]], i % 2 ? c2 : c1); } },
    dash(t0, t1, n, c1, c2) { for (let i = 0; i < n; i++) g.band(t0, t1, i % 2 ? c2 : c1, -1 + 2 * i / n, -1 + 2 * (i + 1) / n); },
    // fine lines across the cue every step px: linen, knurling, grooves
    lines(t0, t1, step, col, a = 0.3, w = 1) { ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); for (let x = X(t0); x < X(t1); x += step) { const t = x / (LEN * S); ctx.moveTo(x, Y(t, -1)); ctx.lineTo(x, Y(t, 1)); } ctx.stroke(); ctx.globalAlpha = 1; },
    grain(t0, t1, col, a, seed, n = 5) { const r = rng(seed); ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.6, S * K * 0.0007); for (let i = 0; i < n; i++) { const v = -0.85 + 1.7 * r(), a0 = t0 + (t1 - t0) * r() * 0.5, a1 = a0 + (t1 - a0) * (0.4 + 0.6 * r()); ctx.beginPath(); ctx.moveTo(X(a0), Y(a0, v)); ctx.quadraticCurveTo(X((a0 + a1) / 2), Y((a0 + a1) / 2, v + 0.25 * (r() - 0.5)), X(a1), Y(a1, v + 0.2 * (r() - 0.5))); ctx.stroke(); } ctx.globalAlpha = 1; },
    speck(t0, t1, n, col, a, seed, rad = 0.0012) { const r = rng(seed); ctx.globalAlpha = a; ctx.fillStyle = col; for (let i = 0; i < n; i++) { const t = t0 + (t1 - t0) * r(), v = -0.9 + 1.8 * r(); ctx.beginPath(); ctx.arc(X(t), Y(t, v), Math.max(0.5, rad * S * (0.6 + 0.8 * r())), 0, 7); ctx.fill(); } ctx.globalAlpha = 1; },
    // a diamond len metres long, centred at (t, v), hv tall as a share of the half width
    diamond(t, v, len, hv, fill) { const d = len / LEN / 2; g.poly([[t - d, v], [t, v - hv], [t + d, v], [t, v + hv]], fill); },
    dot(t, v, rad, fill, a = 1) { ctx.globalAlpha = a; ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(X(t), Y(t, v), rad * S * Math.sqrt(K), 0, 7); ctx.fill(); ctx.globalAlpha = 1; },
    // Points: sharp spears of one wood let into another, each ringed by veneers. Seen from above: one whole point down
    // the middle and half of one at each edge. from = their base (toward the butt), to = their tips.
    points({ from, to, veneers = [], wood, half = 0.6, sides = true, low = 0 }) {
      const cols = [...veneers, wood], len = from - to, n = cols.length;
      cols.forEach((c, i) => { const k = i / n, h = half * (1 - 0.72 * k), a = to + len * 0.5 * k; g.poly([[from, -h], [a, 0], [from, h]], c); });
      if (sides) for (const s of [-1, 1]) cols.forEach((c, i) => { const k = i / n, h = half * 0.8 * (1 - 0.72 * k), a = to + low * len + (len - low * len) * 0.5 * k; g.poly([[from, s], [a, s], [from, s * (1 - h)]], c); });
    },
    // the round of the stick: one hard light line and one hard dark edge (flat), or a soft sheen (gloss)
    shade(kind = 'flat', t0 = 0, t1 = 1) {
      if (kind === 'flat') { g.band(t0, t1, '#fff', -0.66, -0.4, 0.2); g.band(t0, t1, '#000', 0.5, 1, 0.2); }
      else if (kind === 'lip') g.band(t0, t1, '#000', 0.42, 1, 0.26);
      else if (kind === 'matte') { g.band(t0, t1, '#000', 0.3, 1, 0.2); g.band(t0, t1, '#000', 0.68, 1, 0.2); g.band(t0, t1, '#fff', -1, -0.5, 0.06); } // a rough thing has no bright line, only a lit side and a dark one
      else { g.band(t0, t1, '#000', 0.2, 1, 0.16); g.band(t0, t1, '#000', 0.62, 1, 0.22); g.band(t0, t1, '#fff', -0.82, -0.2, 0.1); g.band(t0, t1, '#fff', -0.66, -0.44, 0.28); }
    },
    // a hard light line along the top edge, so a dark cue still has an outline on dark felt
    rim(col = '#8A94A0', a = 1, t0 = 0, t1 = 1) { g.band(t0, t1, col, -0.92, -0.66, a); },
    // a word or number, upright on the screen however the cue lies: label at a point in px, text at (t, v) with its height in metres
    label(x, y, str, px, col) { if (px < 3) return; ctx.save(); ctx.translate(x, y); ctx.rotate(-turn); if (flip) ctx.scale(-1, 1); ctx.fillStyle = col; ctx.fillText(str, 0, px * 0.07, px); ctx.restore(); }, // too small to read at match size
    text(t, v, str, size, col) { g.label(X(t), Y(t, v), str, size * S * Math.sqrt(K), col); },
    u(t) { return hw(t) * S * K; }, // half the cue's width in px at t: the unit for things drawn in their own square space
    tip(ferrule = '#F6F4EC') { g.band(0.008, 0.026, ferrule); g.band(0, 0.008, '#5B93F0'); },
  };
  return g;
}

const bump = (t, at, w, h) => { const d = (t - at) / w; return Math.abs(d) < 1 ? h * (1 - d * d) : 0; };
const pulse = (time, hz = 0.5) => 0.75 + 0.25 * Math.sin(time * 6.283 * hz);

// ---------- Craft. The real cuemaker's vocabulary: points, veneers, inlays, rings, wraps. A true cue's outline. ----------
const W = { maple: '#E3BE85', curl: '#C59758', ebony: '#1E1B1A', coco: '#8E4324', cocoDark: '#5E2815', purple: '#7B3F88', rose: '#5F2B22', bird: '#EBCB95', pearl: '#F4F2E8', ivory: '#EFE6D2', turq: '#35B7AE', silver: '#CBD0D3', steel: '#9AA3AB', brass: '#D9A23A', gold: '#F2C230', red: '#D4483B', green: '#2E8B62', ink: '#16191A', abalone: '#58C8C0', honey: '#C98A3A', cream: '#F3E7C8' };
const shaft = (g, to = 0.5, col = W.maple) => { g.band(0, to, col); g.grain(0.05, to, W.curl, 0.35, 7, 4); };
const collar = (g, t = 0.5, col = W.silver, w = 0.016) => { g.band(t, t + w, col); g.band(t + w * 0.4, t + w * 0.6, '#000', -1, 1, 0.25); };
// the figure of a wood: a few long flat leaf shapes in one darker value (not pen lines)
const figure = (g, t0, t1, col, seed, n = 3, a = 0.6) => { const r = rng(seed); for (let i = 0; i < n; i++) { const v = -0.66 + 1.32 * (i + 0.5) / n + 0.12 * (r() - 0.5), a0 = t0 + (t1 - t0) * 0.45 * r(), a1 = a0 + (t1 - a0) * (0.55 + 0.45 * r()), m = (a0 + a1) / 2; g.poly([[a0, v], [m, v - 0.11], [a1, v], [m, v + 0.11]], col, a); } };
// one spear point at height v0: veneers outside in, the wood last
const spear = (g, from, to, v0, half, cols) => cols.forEach((c, i) => { const k = i / cols.length, h = half * (1 - 0.74 * k), a = to + (from - to) * 0.5 * k; g.poly([[from, v0 - h], [a, v0], [from, v0 + h]], c); });
// a pointed oval len metres long (the marquise cut)
const lens = (g, t, v, len, hv, fill) => { const d = len / LEN / 2, up = [], dn = []; for (let i = 0; i <= 8; i++) { const k = -1 + i / 4; up.push([t + d * k, v - hv * (1 - k * k)]); dn.unshift([t + d * k, v + hv * (1 - k * k)]); } g.poly([...up, ...dn], fill); };
const CRAFT = [
  { name: 'House Cue', paint(g) { // one piece, full splice: plain rosewood points climbing into the maple, and the weight stencilled on, as bar cues have
      shaft(g, 1); g.points({ from: 0.72, to: 0.44, wood: W.rose, half: 0.7 }); g.band(0.72, 0.985, W.rose); figure(g, 0.73, 0.89, '#3F1B15', 3, 3);
      g.text(0.922, 0, '19', 0.0125, '#E9DCC0'); g.band(0.955, 0.962, W.pearl); g.band(0.985, 1, W.ink); g.tip(); g.shade(); } },
  { name: 'Ironwood', hw: t => taper(t) * (t > 0.87 ? 1 + 0.2 * Math.min(1, (t - 0.87) / 0.04) : 1), // a break cue: long hard ferrule, ironwood, stacked leather, and a steel weight held on by one hex bolt
    paint(g) { shaft(g); g.band(0.026, 0.056, W.pearl); collar(g, 0.5, W.steel, 0.02); g.band(0.52, 0.7, '#3A2A22'); figure(g, 0.53, 0.69, '#16100C', 13, 4, 0.8);
      g.band(0.532, 0.546, W.red); g.stripes(0.7, 0.88, 9, '#3E2D22', '#84654D'); g.band(0.692, 0.7, W.steel); g.band(0.88, 0.888, W.steel);
      g.band(0.888, 0.985, W.steel); g.band(0.888, 0.985, '#C9CED1', -1, -0.3); for (const t of [0.905, 0.975]) g.band(t, t + 0.004, '#59626A');
      { const c = g.ctx, x = g.X(0.944), hex = (r, col) => { c.fillStyle = col; c.beginPath(); for (let i = 0; i < 6; i++) c.lineTo(x + Math.cos(i * 1.0472) * r, Math.sin(i * 1.0472) * r); c.fill(); }, r = 0.0058 * g.S * Math.sqrt(g.K); hex(r, '#59626A'); hex(r * 0.62, '#C9CED1'); } g.band(0.985, 1, W.red); g.tip(W.pearl); g.shade(); } },
  { name: 'Whisper', hw: t => taper(t) * 0.88, paint(g) { // a finesse cue: slim, pale, two needle points, a single blue-grey feather laid along the sleeve
      shaft(g, 0.5, '#EBD9B0'); collar(g, 0.5, W.silver, 0.01); g.band(0.51, 0.72, '#F1E6CC'); g.grain(0.52, 0.72, '#D3C198', 0.6, 81, 5);
      g.points({ from: 0.72, to: 0.515, veneers: [W.silver], wood: W.ebony, half: 0.3, low: 0.25 });
      g.band(0.72, 0.726, W.ink); g.band(0.726, 0.885, '#EAF1F3'); g.lines(0.73, 0.885, 3, '#9FB2B9', 0.6); g.band(0.885, 0.891, W.ink);
      g.band(0.891, 0.985, '#F1E6CC'); { const up = [[0.918, 0], [0.925, -0.42], [0.936, -0.66], [0.949, -0.7], [0.95, -0.5], [0.951, -0.69], [0.968, -0.57], [0.969, -0.42], [0.97, -0.5], [0.979, -0.26], [0.983, 0]], lo = [[0.918, 0], [0.924, 0.36], [0.933, 0.6], [0.943, 0.68], [0.944, 0.5], [0.945, 0.67], [0.963, 0.56], [0.964, 0.4], [0.965, 0.5], [0.977, 0.24], [0.983, 0]], x = g.ctx; // the feather: a vane on each side of the quill, two splits in each, pointed toward the butt
        for (const [v, col, s] of [[up, '#5F7FA6', -1], [lo, '#7C9BC0', 1]]) { g.poly(v, col); x.save(); g.path(v); x.clip(); x.strokeStyle = '#46648A'; x.lineWidth = Math.max(0.6, 0.04 * g.u(0.94)); x.beginPath(); for (let t = 0.914; t < 0.982; t += 0.009) { x.moveTo(g.X(t), g.Y(t, 0)); x.lineTo(g.X(t + 0.011), g.Y(t + 0.011, s * 0.8)); } x.stroke(); x.restore(); } } // barbs, leaning toward its point
      g.poly([[0.894, 0.1], [0.91, 0.04], [0.94, -0.03], [0.983, 0], [0.94, 0.04], [0.91, 0.11], [0.895, 0.17]], '#F6F4EC'); g.band(0.985, 1, W.ink); g.tip(); g.shade(); } },
  { name: 'Marquise', paint(g) { // purpleheart, pearl points in turquoise and black, flecked linen, pearl and turquoise gems in the marquise cut
      shaft(g); collar(g); g.band(0.516, 0.72, W.purple); figure(g, 0.52, 0.7, '#4D2358', 11, 3, 0.7);
      g.points({ from: 0.72, to: 0.535, veneers: [W.ink, W.turq, W.ink], wood: W.pearl, half: 0.62 });
      g.dash(0.716, 0.726, 7, W.silver, W.ink); g.band(0.726, 0.89, '#E9E1CC');
      for (let r = 0; r < 5; r++) for (let i = 0; i < 16; i++) g.band(0.731 + i * 0.01 + (r % 2) * 0.005, 0.735 + i * 0.01 + (r % 2) * 0.005, '#8E8468', -0.78 + r * 0.36, -0.66 + r * 0.36);
      g.dash(0.89, 0.9, 7, W.silver, W.ink); g.band(0.9, 0.985, W.purple); for (const t of [0.918, 0.943, 0.968]) { lens(g, t, 0, 0.024, 0.7, W.pearl); g.diamond(t, 0, 0.012, 0.36, W.turq); }
      g.band(0.985, 1, W.ivory); g.tip(); g.shade(); } },
  { name: 'Surveyor', slide: 0.05, zoom: 0.8, paint(g) { // birdseye maple, ebony points with a sight notch, a rule engraved at the joint, the red and white bands of a ranging rod, a compass rose
      shaft(g); collar(g, 0.5, W.brass, 0.012); g.band(0.512, 0.72, W.bird); g.speck(0.56, 0.72, 34, '#A97C3E', 0.7, 5, 0.0013);
      g.points({ from: 0.72, to: 0.57, veneers: [W.ink, W.pearl], wood: W.ebony, half: 0.58 }); g.diamond(0.672, 0, 0.03, 0.2, W.pearl);
      for (let i = 0; i <= 10; i++) g.band(0.519 + i * 0.0048, 0.5202 + i * 0.0048, W.ink, i % 5 ? 0.55 : 0.1, 1);
      g.band(0.72, 0.726, W.brass); g.stripes(0.726, 0.89, 7, '#C8402F', '#F3EEDD'); g.band(0.89, 0.896, W.brass);
      g.band(0.896, 0.985, W.bird); g.speck(0.9, 0.985, 14, '#A97C3E', 0.7, 9, 0.0013);
      g.poly([[0.905, 0], [0.945, -0.24], [0.968, 0], [0.945, 0.24]], W.ebony); g.poly([[0.905, 0], [0.945, -0.24], [0.945, 0]], W.red); g.diamond(0.945, 0, 0.014, 0.78, W.ebony); g.dot(0.945, 0, 0.0026, W.pearl); // a compass rose, its north point long and red
      g.band(0.985, 1, W.ink); g.tip(); g.shade(); } },
  { name: 'Banker', slide: 0.07, zoom: 0.8, paint(g) { // honey amber with a small table let into it: a maple rail, green cloth, a ball, a pocket, and one pearl line that goes to the rail and comes back; dark leather; and the three round sights of a rail on rail maple
      shaft(g); collar(g, 0.5, W.brass); g.band(0.516, 0.72, W.honey); figure(g, 0.52, 0.7, '#9A6220', 17, 3, 0.7);
      g.band(0.526, 0.694, W.maple, -0.88, 0.88); g.band(0.526, 0.694, '#A9763A', 0.76, 0.88); g.band(0.534, 0.686, W.green, -0.72, 0.72); g.band(0.534, 0.686, '#237052', 0.5, 0.72);
      const c = g.ctx, u = g.u(0.61), rp = 0.0052 * g.S * Math.sqrt(g.K); c.save(); g.path(g.edge(0.534, 0.686, -0.72, 0.72)); c.clip(); c.fillStyle = W.ink; c.beginPath(); c.arc(g.X(0.668), g.Y(0.668, 0.72), rp, 0, 7); c.fill(); // the pocket, in the near rail
      c.strokeStyle = W.pearl; c.lineWidth = Math.max(1.2, u * 0.16); c.lineJoin = 'miter'; c.lineCap = 'butt'; c.beginPath(); c.moveTo(g.X(0.552), g.Y(0.552, 0.26)); c.lineTo(g.X(0.612), g.Y(0.612, -0.72)); c.lineTo(g.X(0.668), g.Y(0.668, 0.72)); c.stroke(); c.restore();
      g.dot(0.552, 0.26, 0.0045, W.pearl); // the ball that is about to run the line
      g.band(0.718, 0.724, W.brass); g.band(0.724, 0.89, '#3B2318'); g.lines(0.73, 0.89, 5, '#000', 0.35, 1.2); g.band(0.89, 0.896, W.brass);
      g.band(0.896, 0.985, '#D9A662'); for (const t of [0.914, 0.94, 0.966]) g.dot(t, 0, 0.004, W.pearl);
      g.band(0.985, 1, W.brass); g.tip(); g.shade(); } },
  { name: 'Plumb', hw: t => taper(t) * (t > 0.95 ? Math.max(0.1, 1 - 0.9 * (t - 0.95) / 0.05) : 1), paint(g) { // navy and brass: needle points, white linen with one plumb line down it, a brass bob let into the sleeve, and a butt turned to a point
      shaft(g); collar(g, 0.5, W.brass, 0.014); g.band(0.514, 0.72, '#27407A'); figure(g, 0.52, 0.7, '#182A56', 21, 3, 0.7);
      g.points({ from: 0.72, to: 0.525, veneers: [W.brass], wood: W.pearl, half: 0.36, low: 0.2 });
      g.band(0.72, 0.726, W.brass); g.band(0.726, 0.89, '#F1EEE4'); g.lines(0.73, 0.89, 3, '#A9A592', 0.55); g.band(0.726, 0.89, '#27407A', -0.07, 0.07); g.band(0.89, 0.896, W.brass);
      g.band(0.896, 0.95, '#27407A'); g.band(0.896, 0.91, W.brass, -0.07, 0.07); g.poly([[0.908, -0.42], [0.918, -0.6], [0.926, -0.42], [0.946, 0], [0.926, 0.42], [0.918, 0.6], [0.908, 0.42]], W.brass); g.poly([[0.908, -0.42], [0.918, -0.6], [0.926, -0.42], [0.946, 0], [0.908, 0]], '#F2D27A');
      g.band(0.95, 1, W.brass); g.band(0.95, 0.957, '#8A6A1E'); g.tip(); g.shade(); } },
  { name: 'Heirloom', hw: t => taper(t) * (t > 0.955 ? 1.25 : 1), // ebony and gold: one gold line from the tip, points lined in ivory, pearl and abalone between them, a wrap of fine gold wire, a crown, and a gold cap cut into three points
    paint(g) { shaft(g); g.band(0.026, 0.494, W.ebony, -0.13, 0.13); g.band(0.026, 0.494, W.gold, -0.07, 0.07); g.band(0.03, 0.037, W.gold); g.band(0.494, 0.5, W.ivory); collar(g, 0.5, W.brass, 0.014); g.band(0.514, 0.52, W.ivory); g.band(0.52, 0.72, W.ebony);
      for (const [v0, to] of [[-1, 0.565], [1, 0.565], [0, 0.565], [-0.5, 0.532], [0.5, 0.532]]) spear(g, 0.72, to, v0, 0.24, [W.gold, W.ivory, W.ebony]);
      for (const v of [-0.5, 0.5]) g.diamond(0.7, v, 0.016, 0.1, W.abalone); for (const v of [-0.25, 0.25]) g.diamond(0.612, v, 0.016, 0.1, W.pearl); g.diamond(0.546, 0, 0.012, 0.13, W.pearl);
      g.dash(0.716, 0.728, 9, W.gold, W.ink); g.band(0.728, 0.872, '#1B1614'); g.lines(0.742, 0.858, 2.5, W.gold, 0.9, 1); for (const t of [0.728, 0.862]) g.band(t, t + 0.01, W.gold);
      g.dash(0.872, 0.884, 9, W.gold, W.ink); g.band(0.884, 0.949, W.ebony);
      g.band(0.888, 0.946, W.gold, 0.38, 0.8); [-0.42, -0.8, -0.42].forEach((top, i) => { const a = 0.888 + i * 0.0193; g.poly([[a, 0.38], [a + 0.0097, top], [a + 0.0193, 0.38]], W.gold); g.dot(a + 0.0097, top, 0.0016, W.gold); }); // the crown, the full width of the sleeve
      for (const t of [0.8977, 0.917, 0.9363]) g.diamond(t, 0.59, 0.0085, 0.15, W.abalone);
      g.band(0.949, 0.955, W.ivory); g.band(0.955, 1, W.gold); g.band(0.955, 1, '#FFE27A', -1, -0.45); g.band(0.955, 1, '#B98A14', 0.5, 1); g.tip(); g.shade('flat', 0, 0.955); },
    teeth(g) { const c = g.ctx, x = g.X(1), u = g.u(1), d = 0.015 * g.S; for (let i = -1; i <= 1; i++) { c.moveTo(x - 1, (i - 0.5) * u * 2 / 3); c.lineTo(x + d, i * u * 2 / 3); c.lineTo(x - 1, (i + 0.5) * u * 2 / 3); c.closePath(); } },
    silhouette(g) { g.ctx.beginPath(); this.teeth(g); },
    over(g) { const c = g.ctx, u = g.u(1); c.fillStyle = W.gold; c.beginPath(); this.teeth(g); c.fill(); c.save(); c.beginPath(); this.teeth(g); c.clip(); c.fillStyle = '#FFE27A'; c.fillRect(g.X(1) - 1, -u, 0.02 * g.S, u * 0.55); c.fillStyle = '#B98A14'; c.fillRect(g.X(1) - 1, u * 0.5, 0.02 * g.S, u * 0.5); c.restore(); } }, // the cap's three points: the same gold, the same light and dark
];

// ---------- Machine. The trick is hardware you can see, and it changes the outline. Every cue carries a strip of lights. ----------
// The strip: n cells along the forearm that fill as the cue is pulled back. At rest one cell chases along it.
const leds = (g, col, t0 = 0.535, t1 = 0.69, n = 9, v0 = -0.28, v1 = 0.28) => {
  g.band(t0 - 0.004, t1 + 0.004, '#05080A', v0 - 0.14, v1 + 0.14);
  const lit = g.power > 0 ? Math.ceil(g.power * n - 1e-9) : -1, chase = Math.floor(g.time * 6) % n;
  for (let i = 0; i < n; i++) { const a = t0 + (t1 - t0) * i / n, on = lit >= 0 ? i < lit : i === chase; g.band(a + 0.002, a + (t1 - t0) / n - 0.002, on ? (g.power > 1 ? '#FF3B30' : col) : '#1D2A2E', v0, v1); }
};
const wheel = g => ({ x: g.X(0.94), r: 1.5 * g.u(0.94), c: g.ctx });
const MACHINE = [
  { name: 'Ratchet', led: '#FFB14A', accent: '#EC7428', // grey alloy, ten lights for ten clicks, and a toothed wheel with its pawl standing proud of the butt
    paint(g) { g.band(0, 0.5, '#C9CED1'); g.band(0.5, 1, '#59626A'); g.band(0.5, 0.515, '#EC7428'); leds(g, '#FFB14A', 0.535, 0.69, 10);
      g.band(0.72, 0.89, '#555F68'); g.lines(0.725, 0.89, 4, '#000', 0.35, 1.5); g.band(0.89, 1, '#2B3136'); g.band(0.985, 1, '#EC7428'); g.tip('#C9CED1'); g.shade('gloss'); },
    silhouette(g) { const { x, r, c } = wheel(g); c.beginPath(); c.arc(x, 0, r, 0, 6.2832); c.moveTo(x - r * 1.75, -r * 0.62); c.lineTo(x - r * 0.62, -r * 1.12); c.lineTo(x - r * 0.75, -r * 0.6); c.closePath(); },
    over(g) { const { x, r, c } = wheel(g), n = 12, rot = -Math.ceil(Math.min(1, g.power) * 10 - 1e-9) * 6.2832 / n, gear = (rr, col) => { c.fillStyle = col; c.beginPath(); for (let i = 0; i < n; i++) { const a = rot + i * 6.2832 / n; c.lineTo(x + Math.cos(a) * rr * 0.8, Math.sin(a) * rr * 0.8); c.lineTo(x + Math.cos(a + 5.4 / n) * rr, Math.sin(a + 5.4 / n) * rr); } c.closePath(); c.fill(); };
      gear(r, '#EC7428'); c.save(); c.beginPath(); c.rect(x - r, 0.25 * r, 2 * r, r); c.clip(); gear(r, '#9A4513'); c.restore(); // a sawtooth wheel: one colour, one hard dark side
      c.fillStyle = '#2B3136'; c.beginPath(); c.arc(x, 0, r * 0.5, 0, 7); c.fill(); c.fillStyle = '#C9CED1'; c.beginPath(); c.arc(x, 0, r * 0.26, 0, 7); c.fill(); c.fillStyle = '#2B3136'; c.beginPath(); c.arc(x, 0, r * 0.1, 0, 7); c.fill();
      c.fillStyle = '#AEB9C2'; c.beginPath(); c.moveTo(x - r * 1.75, -r * 0.62); c.lineTo(x - r * 0.62, -r * 1.12); c.lineTo(x - r * 0.75, -r * 0.6); c.closePath(); c.fill(); c.fillStyle = '#59626A'; c.beginPath(); c.moveTo(x - r * 1.75, -r * 0.62); c.lineTo(x - r * 0.75, -r * 0.6); c.lineTo(x - r * 0.72, -r * 0.76); c.closePath(); c.fill(); c.fillStyle = '#59626A'; c.beginPath(); c.arc(x - r * 1.42, -r * 0.7, r * 0.2, 0, 7); c.fill(); } }, // the pawl, and the pin it turns on
  { name: 'Ram', led: '#FF8A2A', accent: '#FF8A2A', hw: t => taper(t) * (t > 0.7 && t < 0.89 ? 0.78 : 1) + bump(t, 0.6, 0.11, 0.003), // an orange ram housing, a coil spring that squeezes with the pull, hazard stripes
    paint(g) { g.band(0, 0.5, '#B9C0C4'); g.band(0.5, 0.7, '#EC7428'); for (const t of [0.5, 0.692]) g.band(t, t + 0.01, '#2B3136'); leds(g, '#FFD27A');
      g.band(0.7, 0.89, '#3A4248'); g.band(0.7, 0.89, '#8A9299', -0.3, 0.3); const n = 9, sq = 1 - 0.4 * g.power, d = (0.89 - 0.705) * sq / n;
      for (let i = 0; i < n; i++) { const a = 0.89 - d * (n - i), w = d * 0.5, s = d * 0.32; g.poly([[a, -1], [a + w, -1], [a + w + s, 1], [a + s, 1]], '#C4CBCF'); g.poly([[a, -1], [a + w, -1], [a + w + s * 0.3, -0.4], [a + s * 0.3, -0.4]], '#F1F4F5'); g.poly([[a + s * 0.75, 0.5], [a + w + s * 0.75, 0.5], [a + w + s, 1], [a + s, 1]], '#7C858B'); }
      g.band(0.89, 0.985, '#2B3136'); g.stripes(0.9, 0.98, 8, '#F2C230', '#16191A', 0.9); g.band(0.985, 1, '#16191A'); g.tip('#B9C0C4'); g.shade('gloss'); } },
  { name: 'Gyro', led: '#4FE3D0', accent: '#4FE3D0', // graphite weave, teal body, and a rotor that spins in a ring at the butt
    paint(g) { g.band(0, 0.5, '#7B8791'); if (g.S >= 400) g.lines(0.03, 0.5, 7, '#A9B4BC', 0.7); g.band(0.5, 1, '#178F8A'); g.band(0.5, 0.512, '#D9E6E8'); leds(g, '#7FF5E6');
      g.band(0.72, 0.89, '#1A7A76'); const c = g.ctx; c.save(); g.path(g.edge(0.72, 0.89, -1, 1)); c.clip(); c.strokeStyle = '#0B4744'; c.lineWidth = 1; c.beginPath(); const h = g.Y(0.9, 1);
      for (let x = g.X(0.7); x < g.X(0.9); x += 4) { c.moveTo(x, -h); c.lineTo(x + 2 * h, h); c.moveTo(x, h); c.lineTo(x + 2 * h, -h); } c.stroke(); c.restore();
      g.band(0.89, 0.9, '#D9E6E8'); g.band(0.985, 1, '#D9E6E8'); g.tip('#D9E6E8'); g.shade('gloss'); },
    silhouette(g) { g.ctx.beginPath(); g.ctx.arc(g.X(0.945), 0, 0.03 * g.S * Math.sqrt(g.K), 0, 7); },
    over(g) { const c = g.ctx, x = g.X(0.945), r = 0.03 * g.S * Math.sqrt(g.K), a = g.time * 5; c.lineWidth = Math.max(1.5, r * 0.2); c.strokeStyle = '#D9E6E8'; c.beginPath(); c.arc(x, 0, r, 0, 7); c.stroke();
      c.fillStyle = '#0B2B2A'; c.beginPath(); c.arc(x, 0, r * 0.82, 0, 7); c.fill(); c.fillStyle = '#178F8A'; c.beginPath(); c.arc(x, 0, r * 0.62, 0, 7); c.fill(); // the rotor: a solid disc with five weights on its rim, so it never reads as a badge
      c.fillStyle = '#7FF5E6'; for (let i = 0; i < 5; i++) { const b = a + i * 1.2566; c.beginPath(); c.arc(x + Math.cos(b) * r * 0.62, Math.sin(b) * r * 0.62, r * 0.13, 0, 7); c.fill(); }
      c.strokeStyle = '#0B2B2A'; c.lineWidth = Math.max(1, r * 0.09); c.beginPath(); c.moveTo(x - Math.cos(a) * r * 0.4, -Math.sin(a) * r * 0.4); c.lineTo(x + Math.cos(a) * r * 0.4, Math.sin(a) * r * 0.4); c.stroke();
      c.strokeStyle = '#D9E6E8'; c.lineWidth = Math.max(1, r * 0.1); c.beginPath(); c.ellipse(x, 0, r * 0.82, r * 0.3, g.time * 0.6, 0, 7); c.stroke(); c.fillStyle = '#D9E6E8'; c.beginPath(); c.arc(x, 0, r * 0.2, 0, 7); c.fill(); } },
  { name: 'Optic', led: '#B8F26A', accent: '#B8F26A', hw: t => taper(t) * (t > 0.5 && t < 0.888 ? 1 + 0.5 * Math.max(0, Math.min(1, (t - 0.5) / 0.06, (0.888 - t) / 0.028)) : 1) + (t > 0.93 ? 0.0085 * Math.min(1, (t - 0.93) / 0.045) : 0), // a rangefinder: gunmetal that swells into a sight tube with a scale, a numbered range drum, a lens with a reticle in a flared bell, and a lime lens rim
    paint(g) { g.band(0, 0.5, '#A3AEB8'); g.band(0.5, 1, '#6B7783'); g.band(0.56, 0.86, '#3F4852'); g.band(0.56, 0.86, '#5B6672', -1, -0.55); leds(g, '#B8F26A', 0.59, 0.72, 7, -0.4, 0.0);
      for (const t of [0.56, 0.852]) g.band(t, t + 0.008, '#AEB9C2'); g.band(0.572, 0.58, '#B8F26A'); for (let i = 0; i < 6; i++) g.band(0.745 + i * 0.017, 0.749 + i * 0.017, '#D6F5A8', i % 2 ? 0.4 : 0.1, 0.85);
      g.band(0.888, 0.932, '#D5DCE1'); for (let i = 0; i < 9; i++) g.band(0.8905 + i * 0.0048, 0.8915 + i * 0.0048, '#2B3136', i % 4 ? 0.45 : 0.1, 1); ['1', '2', '3'].forEach((n, i) => g.text(0.897 + i * 0.013, -0.42, n, 0.0052, '#2B3136')); // the drum
      g.band(0.932, 0.988, '#7D8A96'); g.band(0.988, 1, '#B8F26A');
      const c = g.ctx, x = g.X(0.962), r = Math.min(g.u(0.962) * 0.62, g.X(0.986) - x); c.fillStyle = '#1D2A2E'; c.beginPath(); c.arc(x, 0, r, 0, 7); c.fill(); // the lens, and the reticle in it
      c.strokeStyle = '#B8F26A'; c.lineWidth = Math.max(1, r * 0.2); c.beginPath(); c.arc(x, 0, r * 0.93, 0, 7); c.moveTo(x + r * 0.42, 0); c.arc(x, 0, r * 0.42, 0, 7); c.moveTo(x - r * 0.93, 0); c.lineTo(x + r * 0.93, 0); c.moveTo(x, -r * 0.93); c.lineTo(x, r * 0.93); c.stroke();
      g.tip('#AEB9C2'); g.shade('gloss'); } },
  { name: 'Vernier', led: '#F2C230', accent: '#F2C230', slide: 0.07, zoom: 0.8, // a caliper: a brass beam engraved like a gauge, a fixed steel jaw at the joint and a jaw that slides, both out on one side, and the depth rod out of its end
    jaws: [[[0.512, -0.98], [0.524, -2.6], [0.531, -2.6], [0.531, -0.98]], [[0.585, -0.98], [0.585, -2.6], [0.592, -2.6], [0.604, -0.98]]],
    paint(g) { g.band(0, 0.5, '#C9CED1'); g.band(0.5, 1, '#C79632'); g.band(0.5, 0.512, '#59626A'); g.band(0.512, 0.531, '#C9CED1');
      for (let i = 0; i < 25; i++) g.band(0.536 + i * 0.0072, 0.5376 + i * 0.0072, '#3A2A0A', i % 5 ? 0.45 : -0.05, 1);
      g.band(0.585, 0.64, '#8A9299'); g.band(0.593, 0.632, '#C9CED1'); g.dot(0.6125, 0, 0.0056, '#3A2A0A'); g.dot(0.6125, 0, 0.003, '#F2C230');
      g.band(0.72, 0.89, '#3B3F45'); leds(g, '#FFE27A', 0.735, 0.875, 9); g.band(0.9, 0.985, '#C79632'); for (let i = 0; i < 6; i++) g.band(0.91 + i * 0.012, 0.9125 + i * 0.012, '#3A2A0A', -0.6, 0.6);
      g.band(0.985, 1, '#8A6A1E'); g.tip('#C9CED1'); g.shade('gloss'); },
    silhouette(g) { const c = g.ctx; c.beginPath(); for (const j of [...this.jaws, this.rod]) { j.forEach(([t, v], i) => (i ? c.lineTo(g.X(t), g.Y(t, v)) : c.moveTo(g.X(t), g.Y(t, v)))); c.closePath(); } },
    rod: [[0.998, -0.2], [1.032, -0.2], [1.032, 0.2], [0.998, 0.2]],
    over(g) { g.poly(this.rod, '#C9CED1'); g.poly([this.rod[3], this.rod[2], [1.032, 0.06], [0.998, 0.06]], '#8A9299'); this.jaws.forEach((j, i) => { g.poly(j, '#C9CED1'); const [a, b] = i ? [j[0], j[1]] : [j[3], j[2]], d = i ? 0.0028 : -0.0028; g.poly([a, b, [b[0] + d, b[1]], [a[0] + d, a[1]]], '#8A9299'); }); } }, // each jaw's measuring face, darker
  { name: 'Airbrake', led: '#7FE7FF', accent: '#FF5A3C', // white ceramic, gold traces, a cyan strip, and two red flaps that stand out of the butt like a jet's
    paint(g) { g.band(0, 1, '#F1F4F2'); g.band(0.5, 0.512, '#2B3136'); leds(g, '#7FE7FF', 0.535, 0.69, 9);
      for (const s of [-1, 1]) { g.band(0.705, 0.83, '#D9A23A', s * 0.6 - 0.07, s * 0.6 + 0.07); g.dot(0.705, s * 0.6, 0.002, '#D9A23A'); g.poly([[0.83, s * 0.53], [0.845, s * 0.9], [0.85, s * 0.9], [0.836, s * 0.53]], '#D9A23A'); }
      for (let i = 0; i < 5; i++) g.band(0.726 + i * 0.018, 0.735 + i * 0.018, '#8A9299', -0.34, 0.34);
      g.band(0.85, 0.864, '#FF5A3C'); g.band(0.864, 0.965, '#2B3136'); g.band(0.864, 0.965, '#161A1D', -0.55, 0.55); g.stripes(0.965, 0.985, 3, '#F2C230', '#16191A', 0.9); g.band(0.985, 1, '#FF5A3C'); g.tip(); g.shade('gloss'); },
    silhouette(g) { const c = g.ctx; c.beginPath(); for (const s of [-1, 1]) [[0.86, s], [0.874, s], [0.965, s * 2.9], [0.946, s * 3.15]].forEach(([t, v], i) => (i ? c.lineTo(g.X(t), g.Y(t, v)) : c.moveTo(g.X(t), g.Y(t, v)))); },
    over(g) { for (const s of [-1, 1]) { g.poly([[0.91, s * 0.7], [0.914, s * 0.7], [0.936, s * 2.1], [0.932, s * 2.1]], '#8A9299'); // the strut
        g.poly([[0.86, s], [0.874, s], [0.965, s * 2.9], [0.946, s * 3.15]], '#FF5A3C'); g.poly([[0.86, s], [0.866, s], [0.953, s * 3.05], [0.946, s * 3.15]], s < 0 ? '#FF8A6A' : '#B93A22');
        for (let i = 0; i < 3; i++) g.dot(0.887 + i * 0.022, s * (1.55 + i * 0.47), 0.0017, '#7A2414'); } } },
];

// ---------- Relic. One material from tip to butt, hewn and not turned: no straight edge, no sheen, no clean shaft, no
// rings. The outline wanders (hw) and so does the centre line (mid). Each material has its own mark. ----------
const wave = (t, f, p = 0) => Math.sin(t * f + p);
const rough = t => 1 + 0.07 * wave(t, 31) + 0.05 * wave(t, 83, 1);
const bind = (g, t0, n, col = '#4B3A2A', d = 0.013) => { const c = g.ctx; c.strokeStyle = col; c.lineCap = 'round'; c.lineWidth = Math.max(1, g.S * g.K * 0.0014);
  for (let i = 0; i < n; i++) { const a = t0 + i * d; c.beginPath(); c.moveTo(g.X(a), g.Y(a, -1)); c.lineTo(g.X(a + d), g.Y(a + d, 1)); c.moveTo(g.X(a + d), g.Y(a + d, -1)); c.lineTo(g.X(a), g.Y(a, 1)); c.stroke(); } };
// angular chips: pits in iron, flakes in stone (never round dots, which are the Twig's lichen)
const chips = (g, t0, t1, n, col, a, seed, len = 0.006) => { const r = rng(seed); for (let i = 0; i < n; i++) { const t = t0 + (t1 - t0) * r(), v = -0.85 + 1.7 * r(), l = len * (0.5 + r()) / LEN, h = 0.1 + 0.16 * r(); g.poly([[t, v], [t + l, v - h], [t + l * 0.7, v + h]], col, a); } };
// rows of short offset dashes: the flats a hammer leaves
const hammered = (g, t0, t1, col, a, rows = 5, step = 0.011) => { for (let r = 0; r < rows; r++) for (let t = t0 + (r % 2) * step / 2; t < t1 - step * 0.6; t += step) g.band(t, t + step * 0.55, col, -0.86 + r * 1.72 / rows + 0.04, -0.86 + (r + 1) * 1.72 / rows - 0.1, a); };
// rune strokes in a unit box (x along the cue 0..1, y across -1..1)
// marks cut in a unit box (x along the cue 0..1, y across -1..1), made from the game itself and from no real alphabet:
// a ball, a rack, a cushion, a rail diamond, a cue and ball, a pocket. A two-point stroke is a dot.
const GLYPHS = [
  [[[0.5, -0.9], [0.82, -0.6], [0.95, 0], [0.82, 0.6], [0.5, 0.9], [0.18, 0.6], [0.05, 0], [0.18, -0.6], [0.5, -0.9]], [[0.49, 0], [0.51, 0]]],
  [[[0.1, 0], [0.12000000000000001, 0]], [[0.48, -0.45], [0.5, -0.45]], [[0.48, 0.45], [0.5, 0.45]], [[0.86, -0.9], [0.88, -0.9]], [[0.86, 0], [0.88, 0]], [[0.86, 0.9], [0.88, 0.9]]],
  [[[0.05, -0.9], [0.45, 0], [0.05, 0.9]], [[0.5, -0.9], [0.9, 0], [0.5, 0.9]]],
  [[[0.5, -0.9], [0.95, 0], [0.5, 0.9], [0.05, 0], [0.5, -0.9]]],
  [[[0.05, 0.9], [0.6, -0.15]], [[0.86, -0.7], [0.88, -0.7]]],
  [[[0.1, -0.9], [0.1, 0.25], [0.5, 0.9], [0.9, 0.25], [0.9, -0.9]], [[0.49, -0.25], [0.51, -0.25]]]];
const MIRROR = [[-1, -0.25], [-0.72, -0.82], [-0.1, -1.04], [0.55, -0.9], [1, -0.35], [1.02, 0.3], [0.62, 0.86], [0, 1.02], [-0.66, 0.8], [-1, 0.3]];
// a line through points: outlines made of straight runs and corners
const pl = pts => t => { for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) { const [a, x] = pts[i - 1], [b, y] = pts[i]; return x + (y - x) * (t - a) / (b - a); } return pts[pts.length - 1][1]; };
const STAR_HW = pl([[0, 0.006], [0.03, 0.0074], [0.06, 0.0062], [0.1, 0.0084], [0.13, 0.0068], [0.165, 0.0092], [0.2, 0.0076], [0.235, 0.0098], [0.27, 0.0082], [0.31, 0.0104], [0.34, 0.0088], [0.375, 0.0108], [0.41, 0.0092], [0.45, 0.0114], [0.485, 0.0098], [0.52, 0.012], [0.555, 0.0102], [0.59, 0.0126], [0.63, 0.0108], [0.665, 0.0132], [0.7, 0.0114], [0.74, 0.0138], [0.775, 0.0118], [0.81, 0.0142], [0.845, 0.0124], [0.868, 0.02], [0.895, 0.0265], [0.925, 0.023], [0.95, 0.0285], [0.975, 0.021], [0.99, 0.013], [1, 0.0065]]);
const STAR_MID = pl([[0, 0], [0.3, 0.001], [0.6, -0.0012], [0.845, 0.0005], [0.895, -0.004], [0.95, 0.003], [1, 0]]);
const sun = g => { const r = 1.5 * g.u(0.95); return { x: g.X(1) - 0.35 * r, r, c: g.ctx }; }; // set from the butt end, so the disc covers the end at every size
const RELIC = [
  { name: 'Twig', accent: '#8FBF6A', // a real twig: bark, knots, lichen, two shoots and the last leaf
    hw: t => (0.0042 + 0.0068 * t) * (1 + 0.09 * wave(t, 37)) + bump(t, 0.34, 0.022, 0.0035) + bump(t, 0.69, 0.026, 0.0045) + bump(t, 0.965, 0.03, 0.004),
    mid: t => 0.0045 * wave(t, 6.2) * Math.min(1, t * 5),
    paint(g) { g.band(0, 1, '#6E5137'); g.band(0.02, 0.125, '#D9C49A'); for (let i = 0; i < 5; i++) g.poly([[0.12, -1 + 0.4 * i], [0.15 + 0.014 * (i % 2), -0.8 + 0.4 * i], [0.12, -0.6 + 0.4 * i]], '#D9C49A');
      g.grain(0.14, 1, '#3F2D1D', 0.8, 12, 16); g.grain(0.14, 1, '#927252', 0.6, 13, 9); g.speck(0.2, 1, 30, '#A5B884', 0.85, 14, 0.0022);
      for (const t of [0.34, 0.69]) { g.dot(t, 0, 0.0036, '#3F2D1D'); g.dot(t, 0, 0.002, '#8A6B4A'); }
      g.band(0.988, 1, '#D9C49A'); g.dot(0.994, 0, 0.0016, '#8A6B4A'); g.tip('#D9C49A'); g.shade('matte'); },
    shoots(g) { const q = Math.sqrt(g.K); return [[0.34, -1, 0.02, false], [0.69, 1, 0.032, true]].map(([t, side, len, leaf]) => { const x = g.X(t), y = g.Y(t, side * 0.8), L = len * g.S * q; return { x, y, L, side, leaf, x2: x + L * 0.55, y2: y + side * L, w: Math.max(1.6, 0.0034 * g.S * q) }; }); },
    silhouette(g) { const c = g.ctx; c.beginPath(); for (const s of this.shoots(g)) { c.moveTo(s.x - s.w / 2, s.y); c.lineTo(s.x2 - s.w / 2, s.y2); c.lineTo(s.x2 + s.w / 2, s.y2); c.lineTo(s.x + s.w / 2, s.y); c.closePath();
        if (s.leaf) { const a = s.side * 0.62, cx = s.x2 + s.L * 0.42, cy = s.y2 + s.side * s.L * 0.3; c.moveTo(cx + Math.cos(a) * s.L * 0.6, cy + Math.sin(a) * s.L * 0.6); c.ellipse(cx, cy, s.L * 0.6, s.L * 0.25, a, 0, 6.2832); } } },
    over(g) { const c = g.ctx; c.lineCap = 'round';
      for (const s of this.shoots(g)) { c.strokeStyle = '#6E5137'; c.lineWidth = s.w; c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x2, s.y2); c.stroke();
        if (s.leaf) { c.fillStyle = '#6FB36A'; c.beginPath(); c.ellipse(s.x2 + s.L * 0.42, s.y2 + s.side * s.L * 0.3, s.L * 0.6, s.L * 0.25, s.side * 0.62, 0, 7); c.fill(); c.strokeStyle = '#3F7F45'; c.lineWidth = Math.max(1.2, s.L * 0.035); c.beginPath(); c.moveTo(s.x2, s.y2); c.lineTo(s.x2 + s.L * 0.85, s.y2 + s.side * s.L * 0.6); c.stroke(); } } } },
  { name: 'Fallen Star', accent: '#FF8A2A', hw: STAR_HW, mid: STAR_MID, // a shard of meteoric iron: every edge a broken flat, one face worn to bright metal with the crossed lines of its crystal, one vein that forks and still burns
    paint(g) { g.band(0, 1, '#5A6072'); chips(g, 0.03, 1, 110, '#2A2E37', 0.8, 31); chips(g, 0.03, 1, 50, '#7C8494', 0.8, 33, 0.005);
      const c = g.ctx, win = [[0.162, -0.5], [0.19, -0.8], [0.238, -0.72], [0.288, -0.4], [0.281, 0.34], [0.252, 0.74], [0.2, 0.6], [0.168, 0.3]]; // one face worn to the bright metal, and the crossed lines of its crystal
      g.poly(win, '#C9CED6'); c.save(); g.path(win); c.clip(); c.strokeStyle = '#7A8090'; { const h = g.u(0.23), xa = g.X(0.14), L = g.X(0.31) - xa, wd = Math.max(0.8, 0.0009 * g.S * Math.sqrt(g.K)); // the crystal: bands in three directions, unevenly spaced, in two widths
        [[0.18, 1], [0.3, 2], [0.38, 1], [0.52, 1], [0.6, 2], [0.74, 1], [0.82, 1]].forEach(([f, k], i) => { const x = xa + L * f, d = i % 2 ? 1 : -1; c.lineWidth = wd * k; c.beginPath(); c.moveTo(x - d * h * 0.577, -h); c.lineTo(x + d * h * 0.577, h); c.stroke(); });
        for (const [v, k] of [[-0.5, 1], [0.12, 2], [0.42, 1]]) { c.lineWidth = wd * k; c.beginPath(); c.moveTo(xa, h * v); c.lineTo(xa + L, h * v); c.stroke(); } } c.restore();
            const p = pulse(g.time, 0.6), q = Math.sqrt(g.K), vein = [[0.34, 0.05], [0.385, -0.3], [0.43, 0.25], [0.475, -0.2], [0.52, 0.3], [0.565, -0.25], [0.6, 0.3], [0.645, -0.3], [0.69, 0.3], [0.735, -0.25], [0.78, 0.3], [0.825, -0.2], [0.865, 0.25], [0.9, -0.3], [0.935, 0.2], [0.965, -0.15]];
      const forks = [[[0.6, 0.3], [0.625, 0.65], [0.64, 0.95]], [[0.9, -0.3], [0.925, -0.62], [0.955, -0.85]]]; c.lineJoin = c.lineCap = 'round';
      for (const [wd, col, al] of [[0.0042, '#FF5A1F', 0.55 * p], [0.0016, '#FFD27A', 1]]) { c.strokeStyle = col; c.globalAlpha = al;
        for (let i = 1; i < vein.length; i++) { c.lineWidth = Math.max(wd > 0.002 ? 1.6 : 0.9, wd * Math.min(1, 0.25 + i / 8) * g.S * q); c.beginPath(); c.moveTo(g.X(vein[i - 1][0]), g.Y(...vein[i - 1])); c.lineTo(g.X(vein[i][0]), g.Y(...vein[i])); c.stroke(); }
        for (const f of forks) { c.lineWidth = Math.max(0.6, wd * 0.7 * g.S * q); c.beginPath(); f.forEach(([t, v], k) => (k ? c.lineTo(g.X(t), g.Y(t, v)) : c.moveTo(g.X(t), g.Y(t, v)))); c.stroke(); } }
      c.globalAlpha = 1; g.tip('#5A606B'); g.shade('matte'); g.band(0, 0.86, '#8A93A3', -1, -0.58); for (const [a, b, col] of [[0.86, 0.885, '#6F7889'], [0.885, 0.925, '#8A93A3'], [0.925, 0.945, '#6F7889'], [0.945, 0.98, '#8A93A3'], [0.98, 1, '#6F7889']]) g.poly([[a, -1.4], [b, -1.4], [b + 0.007, -0.58], [a + 0.007, -0.58]], col); }, // the lit top; on the head it breaks into five flats
    over(g) { const c = g.ctx, u = g.u(0.93); c.fillStyle = '#FF8A2A'; for (let i = 0; i < 6; i++) { const ph = (g.time * 0.35 + i * 0.29) % 1, x = g.X(0.9 + i * 0.016) - ph * u * 1.2, y = (i % 2 ? 1 : -1) * u * (1.15 + 0.5 * ph + 0.12 * i), s = u * 0.16 * (1 - ph * 0.7); c.globalAlpha = 1 - ph; c.beginPath(); c.moveTo(x - s, y); c.lineTo(x, y - s * 1.3); c.lineTo(x + s, y); c.lineTo(x, y + s * 1.3); c.fill(); } c.globalAlpha = 1; } }, // embers: hard specks, no glow
  { name: 'Coil', accent: '#5CE0A0', // the snake is the cue: tail to the tip, scales the whole length, the head for a butt
    hw: t => (0.0052 + 0.0082 * Math.sin(Math.min(1, t / 0.8) * 1.5708) - bump(t, 0.9, 0.035, 0.0035) + bump(t, 0.95, 0.045, 0.0085)) * (t > 0.95 ? Math.sqrt(Math.max(0.05, 1 - ((t - 0.95) / 0.052) ** 2)) : 1),
    mid: t => 0.0062 * wave(t, 12.5) * Math.min(1, t * 2.5) * (t > 0.86 ? Math.max(0, 1 - (t - 0.86) / 0.1) : 1),
    paint(g) { g.band(0, 1, '#2BAF80'); g.band(0, 1, '#E4D9A0', 0.38, 1);
      const c = g.ctx, H = 0.03 * g.S * g.K, st = Math.max(3, 0.0055 * g.S); c.strokeStyle = '#0B4F3A'; c.globalAlpha = 0.55; c.lineWidth = Math.max(0.6, g.S * g.K * 0.0006); c.beginPath();
      for (let x = g.X(0.03) - H; x < g.X(1) + H; x += st) { c.moveTo(x, -H); c.lineTo(x + H * 0.9, H); c.moveTo(x + H * 0.9, -H); c.lineTo(x, H); } c.stroke(); c.globalAlpha = 1;
      for (let t = 0.07; t < 0.9; t += 0.046) { g.diamond(t, -0.28, 0.032, 0.5, '#E2B646'); g.diamond(t, -0.28, 0.013, 0.2, '#1A6B50'); }
      g.band(0.945, 1, '#2BAF80'); g.band(0.918, 0.946, '#2BAF80', -1, 0.38); g.poly([[0.89, 0.38], [0.945, 1.05], [0.946, 0.38]], '#2BAF80'); g.poly([[0.925, 0], [0.955, -0.45], [0.992, -0.25], [0.992, 0.25], [0.955, 0.45]], '#1A7A5A');
      for (const s of [-1, 1]) { g.dot(0.956, s * 0.68, 0.0029, '#F2C230'); g.dot(0.956, s * 0.68, 0.0011, '#16191A'); }
      g.poly([[1, -0.5], [0.984, 0], [1, 0.5]], '#0B3F2F'); g.tip('#DCE8A0'); g.shade('matte'); },
    over(g) { const c = g.ctx, x = g.X(0.99), y = g.Y(1, 0), L = 0.02 * g.S * Math.sqrt(g.K); c.strokeStyle = '#E0483C'; c.lineCap = 'round'; c.lineWidth = Math.max(1, L * 0.1); c.beginPath(); c.moveTo(x, y); c.lineTo(x + L * 0.75, y); c.lineTo(x + L * 1.15, y - L * 0.3); c.moveTo(x + L * 0.75, y); c.lineTo(x + L * 1.15, y + L * 0.3); c.stroke(); } },
  { name: 'Seer', accent: '#7FB8FF', // one long bone, cracked with age, cut with runes, bound in sinew, and an eye carved into the knuckle
    hw: t => (taper(t) * (0.92 + 0.05 * wave(t, 17)) + bump(t, 0.5, 0.03, 0.002) + bump(t, 0.935, 0.06, 0.016)) * (t > 0.965 ? Math.sqrt(Math.max(0.05, 1 - ((t - 0.965) / 0.036) ** 2)) : 1),
    mid: t => 0.0025 * wave(t, 4.2) * Math.min(1, t * 4),
    paint(g) { g.band(0, 1, '#E6DDC6'); g.grain(0.03, 1, '#B7AC8E', 0.7, 23, 9); g.grain(0.1, 0.9, '#7A6F58', 0.7, 25, 4);
      const c = g.ctx; c.strokeStyle = '#5B5140'; c.lineWidth = Math.max(0.9, g.S * g.K * 0.0016); c.lineCap = c.lineJoin = 'round';
      [0.1, 0.165, 0.23, 0.295, 0.36, 0.425, 0.57, 0.635, 0.7, 0.765].forEach((t0, i) => { const gl = GLYPHS[i % GLYPHS.length], w = 0.019; for (const s of gl) { c.beginPath(); s.forEach(([x, y], j) => { const t = t0 + x * w, px = g.X(t), py = g.Y(t, y * 0.6); j ? c.lineTo(px, py) : c.moveTo(px, py); }); c.stroke(); } });
      bind(g, 0.48, 3, '#7A5A3C'); bind(g, 0.84, 2, '#7A5A3C');
      const x = g.X(0.935), y = g.Y(0.935, 0), ry = g.Y(0.935, 0.6) - y, rx = ry * 1.3; c.fillStyle = '#B7AC8E'; c.beginPath(); c.ellipse(x, y, rx * 1.3, ry * 1.3, 0, 0, 7); c.fill(); // the carved lid
      c.fillStyle = '#3A2A1C'; c.beginPath(); c.ellipse(x, y, rx * 1.12, ry * 1.08, 0, 0, 7); c.fill();
      c.fillStyle = '#F1ECDD'; c.beginPath(); c.moveTo(x - rx, y); c.quadraticCurveTo(x, y - ry * 1.5, x + rx, y); c.quadraticCurveTo(x, y + ry * 1.5, x - rx, y); c.fill();
      c.fillStyle = '#3A7BE0'; c.beginPath(); c.arc(x, y, ry * 0.62, 0, 7); c.fill(); c.fillStyle = '#1B1410'; c.beginPath(); c.ellipse(x, y, ry * 0.16, ry * 0.5, 0, 0, 7); c.fill(); c.fillStyle = '#F1ECDD'; c.beginPath(); c.arc(x - ry * 0.22, y - ry * 0.24, ry * 0.11, 0, 7); c.fill();
      g.tip('#E6DDC6'); g.shade('matte'); } },
  { name: 'Hindsight', accent: '#A9C8F0', tail: 0.013, // one blade of volcanic glass, knapped down both edges, a bone cord grip, a bone ferrule, and a black mirror on the end with a spiral cut in it that winds back to the cue ball
    hw: t => { const b = 0.0045 + 0.0125 * Math.sin(Math.min(1, t / 0.82) * 1.5708); return t > 0.9 ? Math.max(0.008, b * (1 - (t - 0.9) / 0.075)) : b + 0.0009 * Math.abs(wave(t, 75)) * Math.min(1, (0.9 - t) / 0.04); }, // the blade narrows to a neck that never goes under 16 mm, so the mirror is held on
    mid: t => 0.0038 * Math.sin(Math.min(t, 0.9) * 3.1416) * Math.min(1, t * 3),
    paint(g) { g.band(0, 1, '#1E2430'); g.band(0, 1, '#56688C', -1, -0.1);
      const r = rng(77); for (let i = 0; i < 40; i++) { const a = 0.03 + i * 0.0215, b = a + 0.0215, m = a + 0.0215 * (0.3 + 0.4 * r()), up = i % 2 ? 1 : -1, d = 0.75 + 0.2 * r(), two = (i >> 1) % 2;
        g.poly([[a, up], [b, up], [m, up * (1 - d)]], up < 0 ? (two ? '#8098C4' : '#6B7FA8') : (two ? '#2C3852' : '#161B26')); if (i % 2 === 0) g.poly([[a, up], [m, up * (1 - d)], [a + 0.004, up]], '#DCEBFF', 0.9); }
      g.stripes(0.7, 0.84, 15, '#D8CDB4', '#B5A98C', 0.9); g.band(0.69, 0.7, '#8E8468'); g.band(0.84, 0.85, '#8E8468');
      for (const [a, b] of [[0, 0.69], [0.85, 1]]) { g.band(a, b, '#A9C8F0', -1, -0.6); g.band(a, b, '#5E7BA8', 0.74, 1); } g.band(0.008, 0.026, '#D8CDB4'); g.band(0, 0.008, '#5B93F0'); },
    silhouette(g) { const c = g.ctx, r = 0.028 * g.S * g.K, x = g.X(1) - r * 0.55, y = g.Y(0.9, 0); c.beginPath(); MIRROR.forEach(([a, b], i) => (i ? c.lineTo(x + a * r, y + b * r) : c.moveTo(x + a * r, y + b * r))); c.closePath(); },
    over(g) { const c = g.ctx, r = 0.028 * g.S * g.K, x = g.X(1) - r * 0.55, y = g.Y(0.9, 0), P = (a, b, k = 1) => [x + a * r * k, y + b * r * k], poly = (pts, col, k = 1) => { c.fillStyle = col; c.beginPath(); pts.forEach(([a, b], i) => (i ? c.lineTo(...P(a, b, k)) : c.moveTo(...P(a, b, k)))); c.closePath(); c.fill(); };
      poly(MIRROR, '#A9C8F0'); c.save(); c.beginPath(); MIRROR.forEach(([a, b], i) => (i ? c.lineTo(...P(a, b, 0.82)) : c.moveTo(...P(a, b, 0.82)))); c.closePath(); c.clip(); // in the glass: a spiral, and the cue ball where it ends
      c.fillStyle = '#0E141C'; c.fillRect(x - r, y - r, 2 * r, 2 * r); poly([[-0.9, -0.2], [-0.3, -0.9], [-0.02, -0.9], [-0.9, 0.12]], '#1F2B3D'); // one hard light across it
      c.strokeStyle = '#A9C8F0'; c.lineWidth = Math.max(1, r * 0.16); c.lineCap = 'butt'; c.lineJoin = 'round'; c.beginPath(); for (let i = 0; i <= 40; i++) { const k = i / 40, a = 1.5708 - k * 1.1 * 6.2832, rr = 0.56 - 0.4 * k, [px, py] = P(0.02 + rr * Math.cos(a), 0.04 + rr * Math.sin(a)); i ? c.lineTo(px, py) : c.moveTo(px, py); } c.stroke(); // one line cut in the glass, winding in
      poly([[0.08, 0.34], [0.08, 0.84], [-0.42, 0.59]], '#A9C8F0'); // and an arrowhead on its outer end that points back toward the tip: the way the shot goes when it is taken back
      c.fillStyle = '#F6F4EC'; c.beginPath(); c.arc(...P(0.02, 0.04), r * 0.16, 0, 7); c.fill();
      c.restore(); } },
  { name: 'Daybreak', accent: '#FFE27A', tail: 0.04, // gold, hammered flat by flat, brighter step by step from the tip to the sun, cast collars, three straight rays cut from the sun to the tip, and the sun itself for a pommel
    hw: t => taper(t) * (1 + 0.04 * wave(t, 26)) + bump(t, 0.3, 0.014, 0.0018) + bump(t, 0.5, 0.016, 0.0022) + bump(t, 0.86, 0.018, 0.003),
    paint(g) { for (const [a, b, col] of [[0, 0.3, '#A8741C'], [0.3, 0.5, '#C8962A'], [0.5, 0.86, '#E0AE2E'], [0.86, 1, '#F2C230']]) g.band(a, b, col); if (g.S >= 400) for (let r = 0; r < 2; r++) for (let t = 0.035 + r * 0.013; t < 0.97; t += 0.026) g.poly([[t, r - 0.9], [t + 0.015, r - 0.9], [t + 0.021, r - 0.12], [t + 0.006, r - 0.12]], t < 0.3 ? '#C08A28' : t < 0.5 ? '#DCAB3A' : t < 0.86 ? '#EBC14E' : '#F8D45C'); // two rows of large cut facets, each one step brighter than the gold it is cut in
      for (const v of [-0.55, 0, 0.55]) g.poly([[0.985, v - 0.07], [0.985, v + 0.07], [0.05, v * 0.2 + 0.02], [0.05, v * 0.2 - 0.02]], '#FFF6D8');
      { const c = g.ctx; c.fillStyle = '#FFE9A0'; for (let t = 0.545; t < 0.85; t += 0.049) { c.beginPath(); c.arc(g.X(t), g.Y(t, 0), (0.35 + 0.4 * (t - 0.545) / 0.294) * g.u(t), 3.1416, 6.2832); c.fill(); } } // a sun that rises along the butt: seven half discs, each larger than the last
      for (const [t, w] of [[0.3, 0.014], [0.5, 0.016], [0.86, 0.018]]) { g.band(t - w * 0.7, t + w * 0.7, '#FFE27A'); g.band(t - w * 0.7, t - w * 0.5, '#7A5510'); g.band(t + w * 0.5, t + w * 0.7, '#7A5510'); g.band(t - w * 0.3, t + w * 0.3, '#FFF6D8', -1, -0.2); }
      g.tip('#F3D272'); g.shade('matte'); },
    rays(g) { const { x, r, c } = sun(g), n = 12, sp = g.time * 0.2, da = 0.15; for (let i = 0; i < n; i++) { const a = sp + i * 6.2832 / n, r1 = r * (i % 2 ? 1.5 : 2.0); c.moveTo(x + Math.cos(a - da) * r * 0.95, Math.sin(a - da) * r * 0.95); c.lineTo(x + Math.cos(a) * r1, Math.sin(a) * r1); c.lineTo(x + Math.cos(a + da) * r * 0.95, Math.sin(a + da) * r * 0.95); c.closePath(); } },
    silhouette(g) { const { x, r, c } = sun(g); c.beginPath(); c.arc(x, 0, r, 0, 6.2832); this.rays(g); }, // the shadow has the rays' own outline
    over(g) { const { x, r, c } = sun(g); c.fillStyle = '#FFE27A'; c.beginPath(); this.rays(g); c.fill(); // twelve hard rays, long and short, and three flat discs
      for (const [k, col] of [[1, '#F2C230'], [0.55, '#FFE27A'], [0.27, '#FFF6D8']]) { c.fillStyle = col; c.beginPath(); c.arc(x, 0, r * k, 0, 7); c.fill(); }
      c.save(); c.beginPath(); c.arc(x, 0, r, 0, 7); c.clip(); c.fillStyle = '#C8961F'; c.beginPath(); c.arc(x - r * 0.12, -r * 0.2, r * 1.02, 0, 7); c.rect(x + r * 2, -r * 2, -r * 4, r * 4); c.fill('evenodd'); c.restore(); } }, // one hard dark edge on the disc
];

// ---------- Joke. Six cues from the internet of 2024 to 2026; on each one the trick is the joke. The family's marks:
// a hot pink ferrule and joint ring, flat sticker colour, and one thing on the butt that no cue should have. Those things are
// drawn in their own square units (1 = half the butt's width), so they keep their shape however fat the cue is drawn. ----------
const PINK = '#FF5FA2';
const pinks = g => { g.band(0.492, 0.508, PINK); g.tip(PINK); };
const shape = (c, pts, close = true) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); if (close) c.closePath(); };
// the two balls on the Six Seven: [x, r] of each, in px
const balls67 = g => { const r = 0.0235 * g.S * g.K, x7 = g.X(1) - r * 0.5; return [[x7 - r * 1.94, r], [x7, r]]; };
// The bust on the Marble, in its own units (1 = 56 mm): x across the cue, y up from the base of the neck. He lies on his back along the cue, so from above he is seen
// face on: shoulders out of the gold end block, the crown of the head away from the tip. A face seen from the front is a face at any angle; four profiles were not.
const mirror = pts => pts.concat(pts.slice().reverse().map(([x, y]) => [-x, y]));
const HEAD = mirror([[0.6, 0.22], [0.56, 0.38], [0.24, 0.52], [0.24, 0.64], [0.32, 0.64], [0.38, 0.76], [0.63, 0.98], [0.58, 1.32], [0.55, 1.62], [0.43, 1.84], [0.2, 1.96]]); // shoulders, neck, a chin as wide as the neck, a jaw wider than the cheeks, a skull
const HAIR = [[0, 2.0, 0.16], [0.24, 1.96, 0.15], [-0.24, 1.96, 0.15], [0.44, 1.83, 0.14], [-0.44, 1.83, 0.14], [0.56, 1.64, 0.12], [-0.56, 1.64, 0.12]]; // seven curls round the crown [x, y, radius]
const LEAVES = [[0.66, 1.4, -0.3, 0.95], [0.6, 1.6, -0.5, 0.87], [0.48, 1.78, -0.7, 0.71], [0.3, 1.9, -0.92, 0.38]]; // the laurel: four leaves up each side of the head [x, y, the way it points]
const BUST_SHADE = [[[-0.38, 0.76], [-0.63, 0.98], [-0.58, 1.32], [-0.55, 1.62], [-0.44, 1.62], [-0.47, 1.3], [-0.5, 1.02], [-0.32, 0.86]], [[-0.24, 0.64], [0.24, 0.64], [0.24, 0.55], [-0.24, 0.55]], [[-0.6, 0.22], [-0.56, 0.38], [-0.24, 0.52], [-0.12, 0.52], [-0.4, 0.36], [-0.42, 0.22]]]; // the far side of the jaw and cheek, the neck under the chin, the far shoulder
const bust = (g, m = 0.046) => { const u = m * g.S * g.K, x0 = g.X(1) - 0.22 * u, c = g.ctx, P = ([x, y]) => [x0 + y * u, -x * u], M = pts => pts.map(P);
  return { u, c, P, M, fill(pts, col) { shape(c, M(pts)); c.fillStyle = col; c.fill(); }, line(pts, col, w) { shape(c, M(pts), false); c.strokeStyle = col; c.lineWidth = Math.max(1, w * u); c.lineJoin = 'miter'; c.lineCap = 'butt'; c.stroke(); } }; };
// flames for the Aura: uneven tongues leaning back toward the butt, nothing at the joint, a few loose licks
const flames = (g, s, seed, lvl) => { const c = g.ctx, q = Math.sqrt(g.K), r = rng(seed), list = []; let t = 0.07;
  for (;;) { const w = 0.022 + 0.03 * r(); if (t + w > 0.995) break; list.push([t, w, 0.4 + 0.6 * r(), r() * 6.28, r() < 0.3]); t += w * (0.5 + 0.35 * r()); }
  for (const [col, k] of [['#5B2BA8', 1], ['#B84FE0', 0.62], ['#F3D6FF', 0.3]]) { c.fillStyle = col;
    for (const [t0, w0, hh, ph, lick] of list) { const env = t0 < 0.5 ? 0.25 : 0.25 + 0.75 * Math.min(1, (t0 - 0.5) / 0.26), fl = 0.8 + 0.2 * Math.sin(g.time * 6 + ph), h = 0.075 * g.S * q * lvl * env * hh * fl * k; if (h < 0.6) continue;
      const w = w0 * (0.45 + 0.55 * k), tm = t0 + w0 / 2, x0 = g.X(tm - w / 2), x1 = g.X(tm + w / 2), yb = g.Y(tm, s * 0.6), ye = g.Y(tm, s), xt = g.X(tm) + h * (0.55 + 0.15 * Math.sin(g.time * 4 + ph)), yt = ye + s * h;
      c.beginPath(); c.moveTo(x0, yb); c.quadraticCurveTo(x0 + (x1 - x0) * 0.1, ye + s * h * 0.55, xt, yt); c.quadraticCurveTo(x1 + (x1 - x0) * 0.25, ye + s * h * 0.3, x1, yb); c.closePath(); c.fill();
      if (lick && k < 0.9 && t0 > 0.5) { const d = h * 0.9, lx = xt + d * 0.5, ly = yt + s * d * 0.75, lr = Math.max(0.8, h * 0.2); c.beginPath(); c.moveTo(lx - lr, ly); c.quadraticCurveTo(lx, ly + s * lr * 2.6, lx + lr * 1.4, ly + s * lr * 2.4); c.quadraticCurveTo(lx + lr, ly + s * lr * 0.6, lx - lr, ly); c.fill(); } } } };
// the one flame that wraps the end of the Aura's butt and trails off behind it
const capFlame = (g, lvl) => { const c = g.ctx, x = g.X(0.992), u = g.u(1), fl = 0.85 + 0.15 * Math.sin(g.time * 5);
  for (const [col, k] of [['#5B2BA8', 1], ['#B84FE0', 0.62], ['#F3D6FF', 0.3]]) { const h = u * (1.3 + 2.4 * lvl) * k * fl, w = u * (0.55 + 0.5 * k); c.fillStyle = col; c.beginPath(); c.moveTo(x, -w); c.quadraticCurveTo(x + h * 0.5, -w * 1.1, x + h, w * 0.2); c.quadraticCurveTo(x + h * 0.45, w * 1.15, x, w); c.closePath(); c.fill(); } };
const soft = (c, pts) => { const n = pts.length; c.moveTo(...pts[0]); for (let i = 1; i < n - 1; i++) { const a = pts[i], b = pts[i + 1]; i < n - 2 ? c.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2) : c.quadraticCurveTo(a[0], a[1], b[0], b[1]); } c.closePath(); };
const JOKE = [
  { name: 'Six Seven', accent: '#3FBF7F', tail: 0.012, // the 6 ball's green up front, the 7 ball's maroon behind, six ivory rings on one and seven on the other, and the two balls for a butt
    paint(g) { g.band(0, 0.5, '#3FBF7F'); g.band(0.5, 1, '#A8323F'); for (let i = 0; i < 6; i++) g.band(0.308 + i * 0.03, 0.317 + i * 0.03, W.ivory); for (let i = 0; i < 7; i++) g.band(0.536 + i * 0.03, 0.545 + i * 0.03, W.ivory); g.band(0.905, 1, W.ivory);
      pinks(g); g.shade(); },
    silhouette(g) { const c = g.ctx; c.beginPath(); for (const [x, r] of balls67(g)) { c.moveTo(x + r, 0); c.arc(x, 0, r, 0, 6.2832); } },
    over(g) { const c = g.ctx; balls67(g).forEach(([x, r], i) => { const col = i ? '#A8323F' : '#3FBF7F', dark = i ? '#6E1D27' : '#23875A';
        c.fillStyle = dark; c.beginPath(); c.arc(x, 0, r, 0, 7); c.fill(); c.save(); c.beginPath(); c.arc(x, 0, r, 0, 7); c.clip(); c.fillStyle = col; c.beginPath(); c.arc(x - r * 0.1, -r * 0.16, r, 0, 7); c.fill(); c.restore(); // a flat ball: one colour, one hard dark edge
        c.fillStyle = '#F6F4EC'; c.beginPath(); c.arc(x, -r * 0.04, r * 0.56, 0, 7); c.fill(); g.label(x, -r * 0.04, i ? '7' : '6', r * 0.95, '#16191A'); }); } },
  { name: 'Nonchalant', accent: '#C9CDD3', tail: 0.074, // a grey hoodie of a cue with its hood up, seen from above as it lies on the table, headphones on over the hood: a ribbed cuff and hem, a front pocket, and the two strings down its front
    paint(g) { const c = g.ctx, q = Math.sqrt(g.K); g.band(0, 1, '#C3C7CE');
      for (const v of [-0.62, 0.62]) g.band(0.06, 1, '#8E929A', v - 0.06, v + 0.06); for (const [a, b] of [[0.03, 0.06], [0.508, 0.535], [0.975, 1]]) { g.band(a, b, '#9499A1'); g.lines(a, b, 3, '#5A5E66', 0.7); } // two long seams, the ribbed cuff and the ribbed hem
      g.poly([[0.6, -0.7], [0.66, -0.7], [0.74, -0.36], [0.74, 0.36], [0.66, 0.7], [0.6, 0.7]], '#A9ADB5'); c.lineCap = 'butt'; c.strokeStyle = '#4A4E56'; c.lineWidth = Math.max(2, 0.0034 * g.S * q); for (const s of [-1, 1]) { c.beginPath(); c.moveTo(g.X(0.655), g.Y(0.655, s * 0.7)); c.quadraticCurveTo(g.X(0.715), g.Y(0.715, s * 0.62), g.X(0.74), g.Y(0.74, s * 0.36)); c.stroke(); } // the pocket: one filled patch, wide at the hem, and a curved opening for each hand
      g.band(0.598, 0.602, '#8E929A', -0.7, 0.7); g.band(0.738, 0.742, '#8E929A', -0.36, 0.36); // the pocket's two seams
      for (const [v, t1] of [[-0.34, 0.86], [0.34, 0.885]]) { const n = 16, us = g.u(0.93); c.strokeStyle = '#F6F4EC'; c.lineWidth = Math.max(1.2, 0.12 * us); c.lineCap = 'round'; c.beginPath(); for (let i = 0; i <= n; i++) { const k = i / n, t = 0.972 - k * (0.972 - t1 - 0.012), vv = v + 0.2 * Math.sin(k * 6.2832) * (v < 0 ? 1 : -1); i ? c.lineTo(g.X(t), g.Y(t, vv)) : c.moveTo(g.X(t), g.Y(t, vv)); } c.stroke(); c.lineCap = 'butt';
        g.dot(0.972, v, 0.0024, '#4A4E56'); g.dot(t1 + 0.014, v, 0.0016, '#F6F4EC'); g.band(t1, t1 + 0.012, PINK, v - 0.1, v + 0.1); } // the two cords: each out of a dark eyelet, down the front in a soft curve, to a knot and a pink tip
      pinks(g); g.shade('lip'); },
    hood(g) { const k = g.S * g.K, x = g.X(1) - 0.003 * k, L = 0.068 * k, h = 0.029 * k, n = g.u(1), c = g.ctx, bx = x + L * 0.5; // the hood from above: an egg that grows out of the butt end, and a band over it with a cup at each end, two thirds of each cup over the hood
      return { k, x, L, h, c, bx, egg() { c.moveTo(x, -n); c.bezierCurveTo(x + L * 0.1, -h * 1.02, x + L * 0.3, -h * 1.06, x + L * 0.52, -h); c.bezierCurveTo(x + L * 0.86, -h * 0.9, x + L, -h * 0.5, x + L, 0); c.bezierCurveTo(x + L, h * 0.5, x + L * 0.86, h * 0.9, x + L * 0.52, h); c.bezierCurveTo(x + L * 0.3, h * 1.06, x + L * 0.1, h * 1.02, x, n); c.closePath(); },
        cup(s, grow = 0) { const a = 0.015 * k + grow, b = 0.0085 * k + grow; c.roundRect(bx - a, s * (h - 0.002 * k) - b, a * 2, b * 2, Math.min(a, b) * 0.9); } }; },
    silhouette(g) { const H = this.hood(g); H.c.beginPath(); H.egg(); H.cup(-1); H.cup(1); },
    over(g) { const H = this.hood(g), { c, k, x, L, h, bx } = H, dark = '#2B2D33';
      c.fillStyle = '#C3C7CE'; c.beginPath(); H.egg(); c.fill(); c.save(); c.beginPath(); H.egg(); c.clip(); c.fillStyle = '#9499A1'; c.fillRect(x - 0.002 * k, -h * 1.2, 0.008 * k, h * 2.4);
      c.fillStyle = 'rgba(0,0,0,0.16)'; c.fillRect(x - 0.01 * k, h * 0.5, L * 1.3, h); // the hood: one colour, one hard dark side
      c.fillStyle = '#8E929A'; c.fillRect(x, -Math.max(0.5, 0.0009 * k), L * 0.7, Math.max(1, 0.0018 * k)); // the seam down its middle
      { const n = g.u(1); c.strokeStyle = '#8E929A'; c.lineWidth = Math.max(1, 0.07 * n); c.beginPath(); for (const s of [-1, 1]) { c.moveTo(x + L * 0.02, s * n * 0.45); c.quadraticCurveTo(x + L * 0.16, s * h * 0.5, x + L * 0.3, s * h * 0.74); } c.stroke(); } // two gathers fanning from the neck, either side of the seam
      c.fillStyle = '#A9ADB5'; c.beginPath(); c.ellipse(x + L * 1.06, 0, L * 0.3 + 0.0034 * k, h * 0.74 + 0.0034 * k, 0, 0, 7); c.fill(); // the cloth rim of the opening
      c.fillStyle = dark; c.beginPath(); c.ellipse(x + L * 1.06, 0, L * 0.3, h * 0.74, 0, 0, 7); c.fill(); // the way in, and nobody home
      c.strokeStyle = PINK; c.lineWidth = Math.max(1.2, 0.0022 * k); c.beginPath(); c.ellipse(x + L * 1.06, 0, L * 0.3, h * 0.74, 0, 1.5708, 4.7124); c.stroke(); // the lining shows at its edge
      c.strokeStyle = PINK; c.lineWidth = 0.009 * k; c.beginPath(); c.moveTo(bx, -h * 1.2); c.quadraticCurveTo(bx + 0.022 * k, 0, bx, h * 1.2); c.stroke(); c.restore(); // the headband, bowed over the crown
      for (const s of [-1, 1]) { c.fillStyle = PINK; c.beginPath(); H.cup(s); c.fill(); c.fillStyle = dark; c.beginPath(); H.cup(s, -0.0022 * k); c.fill(); } } }, // a cup at each end of it: a dark pad, pink at its rim
  { name: 'Aura', accent: '#B58CF0', live: true, tail: 0.02, // dark violet with one bright line from the tip. The aura does the talking: low along the shaft, taller on the butt, taller again with every pot in the run, out on a miss
    paint(g) { g.band(0, 1, '#2A2438'); g.band(0, 0.5, '#5A5175'); g.band(0.03, 0.5, '#B58CF0', -0.24, 0.24); g.band(0.5, 0.985, '#B58CF0', -0.1, 0.1); g.band(0.985, 1, '#B58CF0'); g.band(0.484, 0.516, '#16121E'); for (let i = 0; i < 10; i++) for (const s of [-1, 1]) { const a = 0.56 + i * 0.041; g.poly([[a, s * 0.14], [a + 0.028, s * 0.14], [a + 0.036, s * 0.74], [a + 0.016, s * 0.42]], '#4B3A7A'); } pinks(g); g.shade('gloss'); g.rim('#8E86A8', 0.9); },
    under(g) { if (g.power < 0) return; const lvl = g.power > 0 ? 0.3 + 0.7 * Math.min(1, g.power) : 0.3 + 0.05 * Math.sin(g.time * 1.3); flames(g, -1, 41, lvl); flames(g, 1, 57, lvl); capFlame(g, lvl); },
    over(g) { const c = g.ctx, q = Math.sqrt(g.K); if (g.power < 0) { c.fillStyle = '#B84FE0'; [0.6, 0.78, 0.975].forEach((t, i) => { const x = g.X(t), y = g.Y(t, -1) - 0.006 * g.S * q, r = Math.max(1.5, 0.0045 * g.S * q); c.globalAlpha = 0.6 + 0.15 * Math.sin(g.time * 3 + i * 2.1); c.beginPath(); c.moveTo(x - r, y); c.lineTo(x, y - r * 1.5); c.lineTo(x + r, y); c.lineTo(x, y + r * 1.5); c.fill(); }); c.globalAlpha = 1; return; } // out, but for three embers
      const lvl = g.power > 0 ? 0.3 + 0.7 * Math.min(1, g.power) : 0.3; c.fillStyle = '#F3E9FF'; for (let i = 0; i < 4; i++) { const ph = (g.time * 0.5 + i * 0.37) % 1, t = 0.62 + i * 0.1, x = g.X(t) + 0.02 * g.S * ph, y = g.Y(t, i % 2 ? 1 : -1) + (i % 2 ? 1 : -1) * 0.07 * g.S * q * lvl * (0.5 + 0.8 * ph), r = 0.004 * g.S * q * (1 - ph) * (0.6 + lvl); c.globalAlpha = 1 - ph; c.beginPath(); for (let k = 0; k < 8; k++) { const a = k * 0.7854, rr = k % 2 ? r * 0.3 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.fill(); } c.globalAlpha = 1; } },
  { name: 'Marble', accent: '#EDEBE6', tail: 0.11, // a statue lying down: a fluted marble column, a laurel wrap, a gold block for an end, and out of it a bust on its back, seen face on: a laurel, two blank eyes under a heavy brow, and far too much jaw
    paint(g) { g.band(0, 1, '#EDEBE6'); g.grain(0.03, 0.5, '#B4B8BF', 0.7, 61, 5); g.band(0.508, 0.522, '#D9A927'); for (let i = 0; i < 5; i++) g.band(0.528, 0.712, '#B4B8BF', -0.86 + i * 0.4, -0.72 + i * 0.4);
      g.band(0.716, 0.728, '#D9A927'); g.band(0.728, 0.872, '#F6F4EE'); g.band(0.735, 0.865, '#D9A927', -0.05, 0.05); for (let i = 0; i < 6; i++) for (const s of [-1, 1]) { const a = 0.74 + i * 0.021; g.poly([[a, s * 0.08], [a + 0.008, s * 0.62], [a + 0.02, s * 0.78], [a + 0.016, s * 0.2]], '#D9A927'); }
      g.band(0.872, 0.884, '#D9A927'); g.grain(0.89, 1, '#B4B8BF', 0.7, 67, 3); pinks(g); g.shade();
      const t0 = 1 - 0.03 * g.K / LEN; g.band(t0, 1, '#E0B030'); g.band(t0, 1, '#F3D272', -1, -0.55); g.band(t0, 1, '#9A7414', 0.55, 1); }, // the gold block the bust comes out of is the end of the cue itself
    silhouette(g) { const b = bust(g, 0.056); shape(b.c, b.M(HEAD)); for (const [hx, hy, r] of HAIR) { const [x, y] = b.P([hx, hy]); b.c.moveTo(x + b.u * r, y); b.c.arc(x, y, b.u * r, 0, 6.2832); } },
    over(g) { const b = bust(g, 0.056), c = b.c, gold = '#E0B030', cut = '#C9CCD2', ink = '#AEB3BE';
      b.fill(HEAD, '#F7F5F0'); c.fillStyle = '#F7F5F0'; for (const [hx, hy, r] of HAIR) { c.beginPath(); c.arc(...b.P([hx, hy]), b.u * r, 0, 7); c.fill(); } // marble, hair and all
      for (const pts of BUST_SHADE) b.fill(pts, cut); // one hard shade down the far side
      c.strokeStyle = ink; c.lineWidth = Math.max(1, b.u * 0.045); c.lineCap = 'butt'; for (const [x, y, r] of [[-0.36, 1.74, 0.1], [-0.18, 1.74, 0.1], [0, 1.74, 0.1], [0.18, 1.74, 0.1], [0.36, 1.74, 0.1], [-0.18, 1.86, 0.09], [0, 1.86, 0.09], [0.18, 1.86, 0.09]]) { c.beginPath(); c.arc(...b.P([x, y]), b.u * r, 1.5708, 4.7124); c.stroke(); } // a fringe of five curls on the brow, cut and not drawn
      for (const s of [-1, 1]) { const eye = []; for (let i = 0; i <= 16; i++) { const f = (i <= 8 ? i : 16 - i) / 4 - 1; eye.push([s * (0.27 + 0.15 * f), 1.34 + (i <= 8 ? 1 : -1) * 0.055 * (1 - f * f)]); } b.fill(eye, ink); b.line([[s * 0.08, 1.45], [s * 0.47, 1.53]], ink, 0.06); } // two blank eyes under a heavy brow
      b.fill([[0, 1.44], [-0.05, 1.44], [-0.12, 1.06], [0, 1.06]], cut); b.line([[-0.08, 1.06], [0.08, 1.06]], ink, 0.045); // the nose: one straight ridge with a shaded side
      b.fill([[-0.14, 0.94], [0, 0.965], [0.14, 0.94], [0, 0.885]], cut); b.line([[0, 0.68], [0, 0.78]], cut, 0.04); // a straight mouth, and the cleft in the chin
      for (const s of [-1, 1]) for (const [x, y, dx, dy] of LEAVES) { const at = (f, o) => [s * (x + dx * f - dy * o), y + dy * f + dx * o]; b.fill([at(0, 0), at(0.1, 0.075), at(0.3, 0), at(0.1, -0.075)], s > 0 ? gold : '#C4941A'); } } }, // the laurel: the only gold on him
  { name: 'Performative', accent: '#8DB255', tail: 0.05, slide: 0.06, zoom: 0.84, // bamboo from tip to whisk: a tote bag for a wrap with its two straps, a matcha for a sleeve, and a tea whisk for an end, its tines swelling out and curling back in
    whisk(g) { const u = g.u(1), x = g.X(1), L = 3.2 * u, c = g.ctx; return { c, u, x, L,
      out() { c.moveTo(x, -u * 0.92); c.bezierCurveTo(x + L * 0.2, -u * 0.98, x + L * 0.3, -u * 2.12, x + L * 0.55, -u * 2.12); c.bezierCurveTo(x + L * 0.85, -u * 2.12, x + L * 1.03, -u * 1.75, x + L * 1.03, -u * 1.3); c.lineTo(x + L * 1.03, u * 1.3); c.bezierCurveTo(x + L * 1.03, u * 1.75, x + L * 0.85, u * 2.12, x + L * 0.55, u * 2.12); c.bezierCurveTo(x + L * 0.3, u * 2.12, x + L * 0.2, u * 0.98, x, u * 0.92); c.closePath(); },
      tine(v, k = 1) { c.moveTo(x, v * u * 0.82); c.bezierCurveTo(x + L * 0.2 * k, v * u * 0.86, x + L * 0.3 * k, v * u * 1.9, x + L * 0.55 * k, v * u * 1.9); c.bezierCurveTo(x + L * 0.82 * k, v * u * 1.9, x + L * 0.97 * k, v * u * 1.6, x + L * k, v * u * 1.2); } }; },
    strap(g, t, s) { const c = g.ctx, us = g.u(t), x0 = g.X(t - 0.03), x1 = g.X(t + 0.03), y = g.Y(t, s * 0.9), d = Math.max(0.8, us * 0.13) * -s, top = y + s * us * 2.1; // a flat loop of webbing, fallen back toward the butt
      c.moveTo(x0 - d, y); c.bezierCurveTo(x0 + us * 0.9 - d, top - d * 1.4, x1 + us * 1.5 + d, top - d * 1.4, x1 + d, y); c.lineTo(x1 - d, y); c.bezierCurveTo(x1 + us * 1.5 - d, top + d * 1.4, x0 + us * 0.9 + d, top + d * 1.4, x0 + d, y); c.closePath(); },
    paint(g) { g.band(0, 1, '#D9C58A'); for (const t of [0.075, 0.184, 0.293, 0.402, 0.94]) { g.band(t, t + 0.005, '#A8934E'); g.band(t + 0.005, t + 0.008, '#EFE2B0'); } g.grain(0.03, 0.5, '#BFA968', 0.6, 23, 4); // bamboo: a node ring every 12 cm
      g.band(0.508, 0.715, '#EFE6CF'); g.lines(0.51, 0.715, 2.5, '#C2B694', 0.5); for (const t of [0.516, 0.704]) g.dash(t, t + 0.004, 9, '#A99C78', '#EFE6CF');
      const c = g.ctx, x = g.X(0.612), s = g.u(0.612) * 0.62; c.fillStyle = '#D4483B'; for (const d of [-1, 1]) { c.beginPath(); c.arc(x + d * s * 0.28, -s * 0.2, s * 0.32, 0, 7); c.fill(); } shape(c, [[x - s * 0.58, -s * 0.06], [x + s * 0.58, -s * 0.06], [x, s * 0.66]]); c.fill(); // the tote's print: one heart
      g.band(0.715, 0.74, '#F6F1E2'); g.band(0.74, 0.756, '#DCE8B4'); g.band(0.756, 0.885, '#8DB255'); g.band(0.756, 0.885, '#A5C56F', -1, -0.45); g.band(0.885, 0.9, '#F6F1E2'); // a matcha, side on: cream rim, foam, green, cream foot
      g.band(0.985, 1, '#16191A'); pinks(g); g.shade(); },
    silhouette(g) { const w = this.whisk(g); w.c.beginPath(); w.out(); this.strap(g, 0.565, -1); this.strap(g, 0.655, 1); },
    over(g) { const w = this.whisk(g), { c, u, x, L } = w; c.lineJoin = 'round'; c.lineCap = 'round';
      c.fillStyle = '#6E5E2C'; c.beginPath(); w.out(); c.fill(); // the whisk: dark between the tines
      c.strokeStyle = '#C9B86F'; c.lineWidth = Math.max(1.2, u * 0.22); c.beginPath(); for (const v of [-0.26, 0, 0.26]) w.tine(v, 0.45); c.stroke(); // the inner knot of short tines
      c.strokeStyle = '#EFE2B0'; c.lineWidth = Math.max(1.5, u * 0.27); c.beginPath(); for (let i = -3; i <= 3; i++) w.tine(i / 3); c.stroke(); // seven tines that swell out and curl back in
      c.strokeStyle = '#8DB255'; c.beginPath(); for (let i = -3; i <= 3; i++) { const v = i / 3; c.moveTo(x + L * 0.906, v * u * 1.62); c.lineTo(x + L, v * u * 1.2); } c.stroke(); // their tips, green from the tea
      c.fillStyle = '#EFE6CF'; c.beginPath(); this.strap(g, 0.565, -1); this.strap(g, 0.655, 1); c.fill(); } }, // the tote's two straps, one fallen to each side
  { name: 'Maxxed', accent: '#F2C230', tail: 0.047, // a stat chart for a butt: three bars of ten cells, two of them at 5 of 10, and the third run off the end of its scale, through the end stop and the end of the cue, to a 10
    bar(g) { const u = g.u(1), xe = g.X(1); return { u, xe, x: xe + 0.5 * u, w: 2.6 * u, h: u }; },
    bits(g) { const u = g.u(1), xe = g.X(1); return [[-1, '#14181A', [[0.3, 1.15], [0.95, 1.6], [0.8, 1.1]]], [-1, '#F6F4EC', [[1.05, 1.3], [1.6, 1.85], [1.55, 1.28]]], [1, '#F6F4EC', [[0.25, 1.12], [0.75, 1.75], [0.9, 1.2]]], [1, '#14181A', [[1.1, 1.25], [1.45, 1.6], [1.7, 1.22]]], [-1, '#F6F4EC', [[0.06, 0.42], [0.4, 0.62], [0.12, 0.9]]], [1, '#14181A', [[0.08, 0.45], [0.42, 0.7], [0.1, 0.92]]]].map(([s, col, pts]) => [col, pts.map(([a, b]) => [xe + a * u, s * b * u])]); }, // six shards of the end stop, black and white, thrown past the end
    paint(g) { g.band(0, 1, '#2F6BFF'); for (const t of [0.3, 0.36, 0.42]) g.poly([[t, -1], [t + 0.022, 0], [t, 1], [t + 0.02, 1], [t + 0.042, 0], [t + 0.02, -1]], '#F6F4EC'); // three chevrons up the shaft, pointing the way the numbers go
      g.band(0.545, 0.97, '#F6F4EC'); for (const v of [-0.62, 0.62]) { g.band(0.56, 0.95, '#8E96A3', v - 0.22, v + 0.22); g.band(0.56, 0.755, '#2F6BFF', v - 0.22, v + 0.22); } // the chart: two stats at 5 of 10, five cells lit and five dark
      for (let i = 1; i < 10; i++) for (const s of [-1, 1]) g.band(0.5585 + i * 0.039, 0.5615 + i * 0.039, '#F6F4EC', s < 0 ? -0.86 : 0.38, s < 0 ? -0.38 : 0.86); // real gaps between the ten cells
      for (const s of [-1, 1]) g.poly([[0.961, s], [0.968, s], [0.968, s * 0.62], [0.9655, s * 0.5], [0.9665, s * 0.42], [0.961, s * 0.56]], '#14181A'); // the end stop of the scale, broken open where the bar goes through
      g.band(0.56, 1, '#F2C230', -0.28, 0.28); g.band(0.56, 1, '#C4941A', 0.16, 0.28); pinks(g); g.shade(); }, // and the one that got everything
    silhouette(g) { const c = g.ctx, b = this.bar(g); c.beginPath(); c.rect(b.xe - 1, -0.28 * b.u, b.x - b.xe + 1, 0.56 * b.u); c.rect(b.x, -b.h, b.w, 2 * b.h); for (const [, pts] of this.bits(g)) { pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); } },
    over(g) { const c = g.ctx, b = this.bar(g), u = b.u; c.fillStyle = '#F2C230'; c.fillRect(b.xe - 1, -0.28 * u, b.x - b.xe + 2, 0.56 * u); c.fillRect(b.x, -b.h, b.w, 2 * b.h); c.fillStyle = '#C4941A'; c.fillRect(b.xe - 1, 0.16 * u, b.x - b.xe + 2, 0.12 * u); c.fillRect(b.x, b.h * 0.55, b.w, b.h * 0.45); // past the end it is still the bar for half a width, then it swells to carry its number
      for (const [col, pts] of this.bits(g)) { c.fillStyle = col; shape(c, pts); c.fill(); }
      g.label(b.x + b.w - u * 1.25, 0, '10', u * 1.45, '#16191A'); } },
];

export const LENGTH = LEN, ALL = [...CRAFT, ...MACHINE, ...RELIC, ...JOKE];
