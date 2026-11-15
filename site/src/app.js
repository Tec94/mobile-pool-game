// The waitlist page. The tables run the game's own engine (src/physics/engine.ts), turn the balls with the game's
// own code (src/render/balls.ts: advance) and show the game's own aim guide (src/shot/aim.ts: aimGuide). They are
// drawn on a 2D canvas to the same numbers as the app's Skia pictures. esbuild bundles this file to public/app.js.
import { breakSpot, CUE, HOLES, P, POCKET as CUT, rack, strike } from '../../src/physics/engine.ts';
import { CUES } from '../../src/progress/cues.ts';
import { advance, newLook } from '../../src/render/balls.ts';
import { cushions, RAIL } from '../../src/render/table.ts';
import { zone } from '../../src/render/tip.ts';
import { aimGuide } from '../../src/shot/aim.ts';
import { BALLS, C, CLOTHS } from '../../src/theme.ts';
import { CUE_ART } from '../../src/ui/cueArt.ts';
import { ball, POCKET, PRESETS, shotOf } from './presets.mjs';

const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = id => document.getElementById(id);
const TW = P.L + 2 * RAIL, TH = P.W + 2 * RAIL;
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const step01 = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const SPOT = Math.cos(Math.asin(0.52)), CUE_SPOT = Math.cos(Math.asin(0.17)); // the number spot and the cue ball's six spots, as in balls.ts

// A ball as the game draws it: a real sphere seen from above, turned by its spin. m = its orientation (look.m[i]).
// The game does this in a shader; here the same sums run for each pixel of the ball, which is a few hundred pixels.
const scratch = document.createElement('canvas'), sctx = scratch.getContext('2d'); let img = null;
function sphere(ctx, id, m, x, y, rad, a, dpr) {
  const R = rad * dpr, n = Math.ceil(R) + 1, size = 2 * n;
  if (scratch.width < size) scratch.width = scratch.height = size;
  if (!img || img.width !== size) img = sctx.createImageData(size, size);
  const d = img.data, X = [m[0], -m[3], m[6]], Y = [m[1], -m[4], m[7]], Z = [m[2], -m[5], m[8]]; // the ball's axes in view space: x right, y down, z to the eye
  const stripe = id > 8, hue = id ? BALLS[(id - 1) % 8] : C.white, body = rgb(id === 0 || stripe ? C.white : hue), band = rgb(hue), spot = rgb(id === 0 ? C.accent : C.white);
  const cut = id === 0 ? CUE_SPOT : SPOT, e = 1.2 / R, w = e * Math.sqrt(1 - cut * cut);
  for (let py = 0, k = 0; py < size; py++) for (let px = 0; px < size; px++, k += 4) {
    const u = (px + 0.5 - n) / R, v = (py + 0.5 - n) / R, q = u * u + v * v, cov = (1 - Math.sqrt(q)) * R + 0.5;
    if (cov <= 0) { d[k + 3] = 0; continue; }
    const z = Math.sqrt(Math.max(0, 1 - q)), nx = Math.abs(X[0] * u + X[1] * v + X[2] * z), ny = Math.abs(Y[0] * u + Y[1] * v + Y[2] * z), nz = Math.abs(Z[0] * u + Z[1] * v + Z[2] * z);
    const t = stripe ? 1 - step01(0.58 - e, 0.58 + e, ny) : 0, s = step01(cut - w, cut + w, id === 0 ? Math.max(nx, ny, nz) : nz);
    for (let c = 0; c < 3; c++) { const base = body[c] + (band[c] - body[c]) * t; d[k + c] = base + (spot[c] - base) * s; }
    d[k + 3] = 255 * Math.min(1, cov);
  }
  sctx.putImageData(img, 0, 0);
  ctx.globalAlpha = a; ctx.drawImage(scratch, 0, 0, size, size, x - n / dpr, y - n / dpr, size / dpr, size / dpr);
  if (id > 0) for (const k of [1, -1]) { // the number lies flat on its spot, so it turns and foreshortens with the ball
    const show = Math.min(1, (k * Z[2] - 0.35) / 0.15); if (show <= 0) continue;
    const f = rad * (id > 9 ? 0.06 : 0.074);
    ctx.save(); ctx.transform(k * X[0] * f, k * X[1] * f, -Y[0] * f, -Y[1] * f, x + k * Z[0] * rad, y + k * Z[1] * rad);
    ctx.globalAlpha = a * show; ctx.fillStyle = C.ink; ctx.font = '800 10px "Bricolage Grotesque", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(id, 0, 0.6); ctx.restore();
  }
  ctx.globalAlpha = 0.5 * a; ctx.strokeStyle = C.chalk; ctx.lineWidth = rad * 0.1; ctx.beginPath(); ctx.arc(x, y, rad * 0.95, 0, 7); ctx.stroke(); // rim
  ctx.globalAlpha = 0.8 * a; ctx.strokeStyle = '#fff'; ctx.lineWidth = rad * 0.14; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(x, y, rad * 0.76, 202 * Math.PI / 180, 248 * Math.PI / 180); ctx.stroke(); // the highlight stays put: the pattern moves under it
  ctx.globalAlpha = 1;
}

// A table on two canvases: `felt` holds the empty table, `top` the balls, the guide and the cue. They are two so that
// a page can put type between them, printed on the cloth with the balls rolling over it.
function makeTable(top, felt) {
  const ctx = top.getContext('2d');
  let s = 1, dpr = 1;
  const X = x => (RAIL + x) * s, Y = y => (RAIL + P.W - y) * s;
  const disc = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); };

  function size() {
    const w = top.clientWidth; if (!w) return;
    dpr = Math.min(devicePixelRatio || 1, 2); s = w / TW;
    felt.width = top.width = Math.round(w * dpr); felt.height = top.height = Math.round(w * TH / TW * dpr);
    const g = felt.getContext('2d'), k = s * dpr, { L, W } = P, { deep } = CUT, cloth = CLOTHS[0];
    g.setTransform(k, 0, 0, -k, RAIL * k, (RAIL + W) * k); // table metres, y up
    const frame = () => { g.beginPath(); g.roundRect(-RAIL, -RAIL, TW, TH, 0.12); };
    frame(); g.fillStyle = C.frame; g.fill();
    g.fillStyle = cloth.felt; g.fillRect(-deep, -deep, L + 2 * deep, W + 2 * deep);
    g.strokeStyle = g.fillStyle = C.chalk + '4D'; g.lineWidth = Math.max(1 / s, 0.0045);
    g.beginPath(); g.moveTo(L / 4, 0); g.lineTo(L / 4, W); g.stroke();
    g.beginPath(); g.arc(0.75 * L, W / 2, 0.01, 0, 7); g.fill();
    for (const pts of cushions()) {
      g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.fillStyle = cloth.cushion; g.fill(); g.stroke();
    }
    g.fillStyle = C.sight; const d = (RAIL + deep) / 2, dot = (x, y) => { g.beginPath(); g.arc(x, y, 0.0095, 0, 7); g.fill(); };
    for (let i = 1; i < 8; i++) if (i !== 4) { dot(i * L / 8, -d); dot(i * L / 8, W + d); }
    for (let i = 1; i < 4; i++) { dot(-d, i * W / 4); dot(L + d, i * W / 4); }
    const lamp = g.createRadialGradient(L / 2, W / 2, 0.13 * 1.68, L / 2, W / 2, 1.68);
    lamp.addColorStop(0, 'rgba(238,242,234,0.07)'); lamp.addColorStop(1, 'rgba(0,0,0,0.4)');
    frame(); g.fillStyle = lamp; g.fill();
    g.fillStyle = C.pocket; for (const [x, y, r] of HOLES) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  }

  const lift = z => 1 + 2.5 * z; // a ball in the air is drawn larger: 10 cm up = 25%
  const shadow = (x, y, z, a = 1) => { const r = P.R * s, o = 0.5 * z * s; ctx.globalAlpha = a * Math.max(0.2, 0.45 - 2 * z); ctx.fillStyle = C.shade; disc(x + 0.28 * r + o, y + 0.36 * r + o, r); ctx.fill(); ctx.globalAlpha = 1; };
  // The balls, as drawBalls in the app: speed smears, landing rings and balls falling into pockets under everything,
  // then every shadow, then the balls, lowest first so a jumping ball passes over.
  function drawBalls(v) {
    const { B, ids, look } = v, r = P.R * s, hue = id => (id ? BALLS[(id - 1) % 8] : C.white);
    if (!calm) for (let i = 0; i < B.length; i++) {
      const b = B[i]; if (!b.on) continue;
      const px = X(b.x), py = Y(b.y), qx = X(look.last[2 * i]), qy = Y(look.last[2 * i + 1]);
      if (Math.hypot(px - qx, py - qy) > 1.5 * r) { ctx.globalAlpha = 0.16; ctx.strokeStyle = hue(ids[i]); ctx.lineWidth = 2 * r * lift(b.z || 0); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(px, py); ctx.stroke(); ctx.globalAlpha = 1; }
    }
    for (const f of look.fx) {
      const t = f.age / (f.t === 'pocket' ? 220 : 240);
      if (f.t === 'land' && !calm) { ctx.globalAlpha = 0.6 * (1 - t); ctx.strokeStyle = C.chalk; ctx.lineWidth = 1; disc(X(f.x), Y(f.y), r * (1 + 0.9 * (1 - (1 - t) ** 3))); ctx.stroke(); ctx.globalAlpha = 1; }
      if (f.t !== 'pocket' || t >= 1) continue;
      // The ball runs on to the middle of the hole (it arrives with speed) while it falls away (gravity).
      let H = HOLES[0]; for (const h of HOLES) if (Math.hypot(h[0] - f.x, h[1] - f.y) < Math.hypot(H[0] - f.x, H[1] - f.y)) H = h;
      const e = 1 - (1 - t) ** 3, cx = X(f.x + (H[0] - f.x) * e), cy = Y(f.y + (H[1] - f.y) * e), rad = r * (1 - 0.3 * t * t);
      sphere(ctx, ids[f.i], look.m[f.i], cx, cy, rad, 1, dpr);
      ctx.globalAlpha = t * t; ctx.fillStyle = C.pocket; disc(cx, cy, rad + 0.5); ctx.fill(); ctx.globalAlpha = 1;
    }
    const order = B.map((_, i) => i).filter(i => B[i].on).sort((a, b) => (B[a].z || 0) - (B[b].z || 0));
    for (const i of order) shadow(X(B[i].x), Y(B[i].y), B[i].z || 0);
    for (const i of order) sphere(ctx, ids[i], look.m[i], X(B[i].x), Y(B[i].y), r * lift(B[i].z || 0), 1, dpr);
    for (const f of look.fx) if (f.t === 'off') { // carries on over the rail on its arc and fades as it leaves
      const sec = f.age / 1000, t = f.age / 350, z = Math.max(0, f.z + f.vz * sec - P.g * sec * sec / 2), px = X(f.x + f.vx * sec), py = Y(f.y + f.vy * sec), a = 1 - t * t;
      if (a > 0) { shadow(px, py, z, a); sphere(ctx, ids[f.i], look.m[f.i], px, py, r * lift(z), a, dpr); }
    }
  }

  // The chalk guide, as drawAim in the app: the cue ball's line to its first contact (a gap is the ball in the air, a
  // small ring is where it lands), the ghost ball there, and a short line for the ball it meets. g = aimGuide's result.
  function drawAim(g) {
    const r = P.R * s; ctx.strokeStyle = C.chalk; ctx.lineCap = ctx.lineJoin = 'round'; ctx.globalAlpha = 0.92; ctx.lineWidth = Math.max(1.2, 0.19 * r);
    const line = pts => { if (pts.length > 1) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)))); ctx.stroke(); } };
    let run = [];
    for (const q of g.path) if ((q[2] || 0) > 0.05 * P.R) { line(run); run = []; } else run.push(q);
    line(run); line(g.ob);
    ctx.globalAlpha = 0.9; ctx.lineWidth = Math.max(1, 0.16 * r);
    for (const [x, y] of g.lands) { disc(X(x), Y(y), 0.7 * r); ctx.stroke(); }
    if (g.ghost) { disc(X(g.ghost[0]), Y(g.ghost[1]), 0.92 * r); ctx.stroke(); }
    if (g.lost) { const q = g.path[g.path.length - 1]; ctx.strokeStyle = C.warn; disc(X(q[0]), Y(q[1]), 0.92 * r); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }

  // The cue, as stick in the app's render/cue.ts, but 0.7 m long (0.48 m looks stubby on a table this wide). c = { x, y, ang, elev, back, a }: (x, y) = the ball it
  // strikes, back = metres from the ball's edge to the tip (negative = through where the ball was). A raised cue is
  // seen from above, so it is shorter by cos(elev), and its shadow falls further from it the higher the butt is.
  function drawCue(c) {
    const ux = Math.cos(c.ang), uy = Math.sin(c.ang), gap = P.R + 0.0015 + c.back, len = 0.7 * Math.max(0.6, Math.cos(c.elev));
    const ax = X(c.x - ux * gap), ay = Y(c.y - uy * gap), bx = X(c.x - ux * (gap + len)), by = Y(c.y - uy * (gap + len));
    const w0 = Math.max(2, 0.012 * s), w1 = Math.max(3, 0.026 * s), px = -(by - ay), py = bx - ax, n = Math.hypot(px, py), h = Math.sin(c.elev) * 0.7 * s;
    const quad = (f, t, col, ox, oy) => {
      const at = (q, side) => { const hw = side * (w0 + (w1 - w0) * q) / 2, o = q * h * 0.45 / (P.R * s); return [ax + (bx - ax) * q + px / n * hw + ox * (1 + o), ay + (by - ay) * q + py / n * hw + oy * (1 + o)]; };
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(...at(f, 1)); ctx.lineTo(...at(t, 1)); ctx.lineTo(...at(t, -1)); ctx.lineTo(...at(f, -1)); ctx.fill();
    };
    ctx.globalAlpha = 0.4 * c.a; quad(0, 1, C.shade, 0.28 * P.R * s, 0.36 * P.R * s);
    ctx.globalAlpha = c.a;
    for (const [f, t, col] of [[0.6, 1, C.ink], [0.035, 0.6, C.frame], [0.015, 0.035, C.white], [0, 0.015, C.accent]]) quad(f, t, col, 0, 0);
    ctx.globalAlpha = 1;
  }

  // v = { B, ids, look, guide, cue, puff: { x, y, age }, ring: HOLES index, fade }
  function draw(v) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, top.width, top.height);
    if (v.ring != null) { const [x, y, r] = HOLES[v.ring]; ctx.strokeStyle = C.white; ctx.lineWidth = r * s * 0.2; disc(X(x), Y(y), r * s * 0.62); ctx.stroke(); }
    top.style.opacity = v.fade ?? 1;
    if (v.guide) drawAim(v.guide);
    drawBalls(v);
    if (v.puff && v.puff.age < 260) { // chalk off the tip at the hit
      const t = v.puff.age / 260; ctx.globalAlpha = 0.55 * (1 - t); ctx.strokeStyle = C.chalk; ctx.lineWidth = 1.5; disc(X(v.puff.x), Y(v.puff.y), P.R * s * (0.5 + 1.6 * (1 - (1 - t) ** 3))); ctx.stroke(); ctx.globalAlpha = 1;
    }
    if (v.cue && v.cue.a > 0) drawCue(v.cue);
  }
  const toTable = e => { const q = top.getBoundingClientRect(), k = q.width / top.clientWidth || 1; return [(e.clientX - q.left) / k / s - RAIL, P.W - ((e.clientY - q.top) / k / s - RAIL)]; };
  size();
  return { size, draw, toTable, canvas: top, felt };
}

// The stroke. The game has no stroke yet (the stick leaves the table on the frame of the strike), so this one is the
// page's own: the cue draws back a little more, drives through the ball faster the harder the shot, stops dead a
// short way past where the ball was (or digs in and springs back when it is raised), rests, and lifts off.
// It stays where it struck: the ball leaves it behind. Returns what the scene calls each frame.
function stroke(v, table, shot, power, hit) {
  const c = v.cue, from = c.back, wind = from + 0.035 + 0.03 * power, T1 = 150, T2 = 105 - 45 * power, up = Math.sin(c.elev);
  const through = (0.02 + 0.07 * power) * (1 - up) + 0.004, spring = 0.018 * up * power;
  let t = 0, struck = false;
  return ms => {
    t += ms;
    if (calm && !struck) t = T1 + T2;
    if (t < T1) c.back = from + (wind - from) * (1 - (1 - t / T1) ** 2);
    else if (t < T1 + T2) c.back = wind * (1 - ((t - T1) / T2) ** 3); // it gathers speed all the way into the ball
    else {
      if (!struck) {
        struck = true; hit(); v.puff = { x: c.x, y: c.y, age: 0 };
        // The table takes the hit: a short shove along the shot that springs back.
        if (!calm && power > 0.3) { const k = 1 + 3 * power; for (const el of [table.canvas, table.felt]) el.animate([{ translate: `${Math.cos(shot.ang) * k}px ${-Math.sin(shot.ang) * k}px` }, { translate: '0 0' }], { duration: 260, easing: 'cubic-bezier(.2,1.8,.4,1)' }); }
      }
      const q = t - T1 - T2; v.puff.age = q;
      c.back = -through * (1 - (1 - Math.min(1, q / 140)) ** 3) + spring * Math.sin(Math.min(1, q / 180) * Math.PI);
      c.a = q < 520 ? 1 : Math.max(0, 1 - (q - 520) / 180);
      if (q > 520) c.back += 0.04 * ((q - 520) / 180) ** 2;
    }
    return struck;
  };
}

// One loop for both tables; a table off the screen (or a hidden tab) costs nothing.
const scenes = [];
function scene(table, tick) {
  const sc = { table, tick, on: false, dirty: true };
  new IntersectionObserver(([e]) => { sc.on = e.isIntersecting; }, { rootMargin: '100px' }).observe(table.canvas);
  new ResizeObserver(() => { table.size(); sc.dirty = true; }).observe(table.canvas);
  scenes.push(sc); return sc;
}
let last = performance.now();
function frame(now) {
  const ms = Math.min(34, Math.round(now - last)); last = now; // a slow frame plays in slow motion, never a jump
  for (const sc of scenes) if (sc.on) sc.tick(ms, sc);
  requestAnimationFrame(frame);
}
document.fonts.ready.then(() => { for (const sc of scenes) sc.dirty = true; }); // ball numbers drawn before the font came

// ---- Hero: a break, again and again. With reduced motion it is a still rack. ----
{
  const table = makeTable($('hero'), $('hero-felt')), v = { B: [], ids: [], look: null, cue: null };
  let state, t, swing;
  const AIM = [0, 0.006, -0.008]; let n = 0; // three breaks, a hair apart, so the loop does not look like a film
  function set() {
    const r = rack(8), [cx, cy] = breakSpot();
    v.B = [ball(cx, cy), ...r.map(q => ball(q[1], q[2]))]; v.ids = [0, ...r.map(q => q[0])]; v.look = newLook(v.B); v.puff = null;
    const shot = { ang: Math.atan2(r[0][2] - cy, r[0][1] - cx) + AIM[n++ % 3], speed: 0.9 * CUE.breakSpeed, a: 0, b: 0 };
    v.cue = { x: cx, y: cy, ang: shot.ang, elev: CUE.minElev, back: 0.02, a: 0 }; state = 'aim'; t = 0;
    swing = stroke(v, table, shot, 1, () => { strike(v.B[0], shot); state = 'run'; });
  }
  set();
  scene(table, (ms, sc) => {
    if (calm) { if (sc.dirty) { table.draw(v); sc.dirty = false; } return; }
    t += ms; v.fade = 1;
    if (state === 'aim') { // the cue comes in and draws back, then the stroke
      v.cue.a = Math.min(1, t / 200);
      if (t < 900) v.cue.back = 0.02 + 0.2 * (1 - (1 - Math.min(1, t / 700)) ** 3); else swing(ms);
    } else if (state === 'run') { swing(ms); if (!advance(v.B, v.look, ms, true)) { state = 'rest'; t = 0; } }
    else if (t > 3200) set();
    else { advance(v.B, v.look, ms, false); if (t > 2400) v.fade = Math.max(0, 1 - (t - 2400) / 500); }
    table.draw(v);
  });
}

// ---- The practice table ----
{
  const table = makeTable($('table'), $('table-felt')), v = { B: [], ids: [], look: null, ring: POCKET }, say = $('say');
  const inp = { elev: $('elev'), aim: $('aim'), power: $('power') }, shoot = $('shoot'), dot = $('dot'), side = $('side').getContext('2d');
  const AIM_STAT = CUES.house.aim; // the guide is as long as the House Cue's in the game
  let p = PRESETS[1], st, state = 'aim', t = 0, sc, swing, acc = 0, pace = 1, down = [];

  const rackUp = () => { v.B = p.balls.map(q => ball(...q)); v.ids = p.ids; v.look = newLook(v.B); v.puff = null; state = 'aim'; shoot.disabled = false; guide(); };
  function guide() {
    const shot = shotOf(st), c = v.B[0];
    v.guide = aimGuide(v.B, shot, AIM_STAT);
    v.cue = { x: c.x, y: c.y, ang: shot.ang, elev: shot.elev, back: st.power * 0.22, a: 1 };
    if (sc) sc.dirty = true;
  }
  function show() { // the controls' pictures and labels
    $('zone').textContent = `${st.elev}° ${zone(st.elev)}`;
    dot.style.transform = `translate(${st.x * 26}px, ${-st.y * 26}px)`;
    const g = side, e = st.elev * Math.PI / 180, bx = 150, by = 112, r = 22, cx = bx - Math.cos(e) * r, cy = by - Math.sin(e) * r;
    g.clearRect(0, 0, 208, 150);
    g.strokeStyle = C.chalk + '66'; g.lineWidth = 2; g.beginPath(); g.moveTo(8, by + r + 1); g.lineTo(200, by + r + 1); g.stroke();
    g.fillStyle = C.white; g.beginPath(); g.arc(bx, by, r, 0, 7); g.fill();
    const seg = (a, b, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(cx - Math.cos(e) * a, cy - Math.sin(e) * a); g.lineTo(cx - Math.cos(e) * b, cy - Math.sin(e) * b); g.stroke(); };
    seg(3, 9, C.accent, 5); seg(9, 16, C.white, 5); seg(16, 120, C.frame, 6); seg(120, 190, C.ink, 7);
  }
  function load(q, keep) {
    p = q; if (!keep) st = { ...q };
    inp.elev.value = st.elev; inp.aim.value = st.off; inp.power.value = st.power;
    for (const k of $('presets').children) k.setAttribute('aria-checked', k.textContent === p.name);
    say.textContent = ''; show(); rackUp();
  }
  for (const q of PRESETS) {
    const k = document.createElement('button'); k.type = 'button'; k.textContent = q.name; k.setAttribute('role', 'radio');
    k.onclick = () => load(q); $('presets').append(k);
  }
  const change = (k, val) => { if (state !== 'aim') return; st[k] = val; show(); guide(); };
  inp.elev.oninput = () => change('elev', +inp.elev.value);
  inp.aim.oninput = () => change('off', +inp.aim.value);
  inp.power.oninput = () => change('power', +inp.power.value);

  // Aim: a tap anywhere on the table points the cue there; a mouse can also drag. A finger that drags scrolls the page.
  const aimAt = e => {
    const [x, y] = table.toTable(e), c = v.B[0], off = (Math.atan2(y - c.y, x - c.x) - st.base) * 180 / Math.PI;
    change('off', ((off + 540) % 360) - 180); inp.aim.value = st.off;
  };
  table.canvas.addEventListener('click', aimAt);
  table.canvas.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && e.buttons & 1) aimAt(e); });

  // Spin: drag the dot on the cue ball. 1 = the miscue limit.
  const pad = $('spin'), spin = e => {
    const q = pad.getBoundingClientRect(); let x = (e.clientX - q.left - q.width / 2) / 26, y = -(e.clientY - q.top - q.height / 2) / 26;
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; } if (m < 0.12) x = y = 0;
    st.x = x; st.y = y; show(); if (state === 'aim') guide();
  };
  pad.addEventListener('pointerdown', e => { pad.setPointerCapture(e.pointerId); spin(e); });
  pad.addEventListener('pointermove', e => { if (pad.hasPointerCapture(e.pointerId)) spin(e); });

  shoot.onclick = () => {
    if (state !== 'aim') return;
    const shot = shotOf(st); state = 'swing'; shoot.disabled = true; v.guide = null; down = []; acc = 0; pace = 1;
    swing = stroke(v, table, shot, st.power, () => { strike(v.B[0], shot); state = 'run'; });
  };
  sc = scene(table, (ms, me) => {
    if (state === 'aim') { if (me.dirty) { table.draw(v); me.dirty = false; } return; }
    swing(ms);
    if (state === 'run') {
      // A hop is over in a fifth of a second: while a ball is in the air the table runs at a third of the speed, so the eye can follow it.
      const want = !calm && v.B.some(b => b.on && (b.z || 0) > 0.002) ? 0.33 : 1; pace += (want - pace) * Math.min(1, ms / 60);
      acc += ms * pace; const n = Math.floor(acc); acc -= n;
      if (!advance(v.B, v.look, n, true, ev => { for (const e of ev) if (e.t === 'pocket' || e.t === 'off') down.push(e.a); })) {
        const last = v.B.length - 1;
        say.textContent = down.includes(0) ? 'The cue ball left the table.' : down.includes(last) ? `The ${v.ids[last]} is down.` : 'Missed.'; // for a screen reader: the page shows it
        state = 'rest'; t = 0;
      }
    } else if (state === 'rest') { t += ms; advance(v.B, v.look, ms, false); if (t > 1300) { rackUp(); me.dirty = true; } }
    table.draw(v);
  });
  load(p);
}

// ---- The cues: all 17 stand in a rack, drawn from the app's own outlines (CUE_ART). The one under the pointer, the
// finger or the arrow keys steps forward and its name and stats show large. ----
{
  const rackEl = $('rack'), name = $('cue-name'), bars = $('cue-bars'), dpr = Math.min(devicePixelRatio || 1, 2), W = 44, H = 420, ids = Object.keys(CUES);
  let at = -1;
  const pick = i => {
    if (i === at) return; at = i;
    [...rackEl.children].forEach((b, j) => b.setAttribute('aria-pressed', j === i));
    const cue = CUES[ids[i]]; name.textContent = cue.name;
    bars.querySelectorAll('u').forEach((u, k) => { const n = cue[['power', 'spin', 'aim'][k]]; u.style.setProperty('--n', n); u.setAttribute('aria-label', `${n} of 10`); });
  };
  ids.forEach((id, i) => {
    const b = document.createElement('button'), cv = document.createElement('canvas'), g = cv.getContext('2d'), { p: P_, seg, split } = CUE_ART[id];
    b.type = 'button'; b.setAttribute('aria-label', CUES[id].name); cv.width = W * dpr; cv.height = H * dpr;
    const w = f => { for (let j = 1; j < P_.length; j++) if (f <= P_[j][0]) { const [a, wa] = P_[j - 1], [c, wc] = P_[j]; return c === a ? wc : wa + (wc - wa) * (f - a) / (c - a); } return P_.at(-1)[1]; };
    const len = H - 16, k = 6.2;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.translate(W / 2, 8); g.rotate(Math.PI / 2); // tip up
    for (const [a, c, col] of seg) {
      const f = [a, ...P_.map(q => q[0]).filter(x => x > a && x < c), c], hole = split && c > split[0] ? split[1] : 0;
      g.fillStyle = col;
      for (const sgn of hole ? [1, -1] : [1]) {
        g.beginPath();
        f.forEach(x => g.lineTo(x * len, -sgn * w(x) * k));
        [...f].reverse().forEach(x => g.lineTo(x * len, (hole ? -sgn * w(x) * hole : w(x)) * k));
        g.fill();
      }
    }
    b.append(cv); b.onpointerenter = b.onfocus = b.onclick = () => pick(i);
    rackEl.append(b);
  });
  // A finger slid along the rack picks the cue under it (pointerenter does not fire for a touch that moves).
  rackEl.addEventListener('pointermove', e => { const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('button'); if (el?.parentElement === rackEl) pick([...rackEl.children].indexOf(el)); });
  rackEl.addEventListener('keydown', e => { const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (d) { e.preventDefault(); const i = (at + d + ids.length) % ids.length; pick(i); rackEl.children[i].focus(); } });
  pick(ids.indexOf('rocket'));
}

// ---- The waitlist forms ----
{
  const forms = document.querySelectorAll('form.join'), q = new URLSearchParams(location.search);
  const ref = (q.get('ref') || q.get('utm_source') || '').slice(0, 40);
  const done = keep => { for (const f of forms) { f.classList.add('sent'); f.querySelector('.done').hidden = false; } if (keep) try { localStorage.setItem('joined', '1'); } catch {} };
  let was = q.has('joined'); try { was ||= localStorage.getItem('joined'); } catch {}
  if (was) done(false);
  for (const f of forms) {
    const note = f.querySelector('.note'), email = f.elements.email, btn = f.querySelector('button');
    f.elements.ref.value = ref;
    const bad = text => { note.textContent = text; email.setAttribute('aria-invalid', 'true'); email.focus(); };
    email.addEventListener('input', () => { note.textContent = ''; email.removeAttribute('aria-invalid'); });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim())) return bad(email.value.trim() ? 'That email does not look right.' : 'Type your email to join.');
      btn.disabled = true;
      try {
        const r = await fetch('/api/join', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(f))) });
        if (r.ok) done(true); else if (r.status === 400) bad('That email does not look right.'); else throw 0;
      } catch { note.textContent = 'That did not go through. Try again.'; }
      btn.disabled = false;
    });
  }
}

requestAnimationFrame(frame);
