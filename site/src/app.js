// The waitlist page. The tables run the game's own engine (src/physics/engine.ts) and are drawn on a 2D canvas to the
// same numbers as the app's Skia table (src/render/table.ts). esbuild bundles this file to public/app.js.
import { breakSpot, CUE, HOLES, P, POCKET as CUT, predict, rack, step, strike } from '../../src/physics/engine.ts';
import { CUES } from '../../src/progress/cues.ts';
import { cushions, RAIL } from '../../src/render/table.ts';
import { zone } from '../../src/render/tip.ts';
import { BALLS, C, CLOTHS } from '../../src/theme.ts';
import { CUE_ART } from '../../src/ui/cueArt.ts';
import { ball, POCKET, PRESETS, shotOf } from './presets.mjs';

const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = id => document.getElementById(id);
const TW = P.L + 2 * RAIL, TH = P.W + 2 * RAIL, HOUSE = CUE_ART.house.seg;

// A table on a canvas. It keeps the picture of the empty table and draws balls, the aim guide and the cue over it.
function makeTable(canvas) {
  const ctx = canvas.getContext('2d'), felt = document.createElement('canvas');
  let s = 1, dpr = 1;
  const X = x => (RAIL + x) * s, Y = y => (RAIL + P.W - y) * s;
  const disc = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); };

  function size() {
    const w = canvas.clientWidth; if (!w) return;
    dpr = Math.min(devicePixelRatio || 1, 2); s = w / TW;
    felt.width = canvas.width = Math.round(w * dpr); felt.height = canvas.height = Math.round(w * TH / TW * dpr);
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

  // id 0 = the cue ball, 9 to 15 = stripes. k shrinks a ball that is dropping into a pocket.
  function drawBall(b, id, k = 1) {
    const z = b.z || 0, r = P.R * s * k * (1 + z / 0.22), x = X(b.x), y = Y(b.y), lift = z * s * 1.6;
    ctx.fillStyle = 'rgba(6,18,15,0.6)'; disc(x + r * 0.2 + lift, y + r * 0.24 + lift, P.R * s * k); ctx.fill();
    const col = id ? BALLS[(id - 1) % 8] : C.white;
    ctx.fillStyle = id > 8 ? C.white : col; disc(x, y, r); ctx.fill();
    if (id > 8) { ctx.save(); disc(x, y, r); ctx.clip(); ctx.fillStyle = col; ctx.fillRect(x - r, y - r * 0.56, 2 * r, r * 1.12); ctx.restore(); }
    ctx.strokeStyle = C.chalk + '73'; ctx.lineWidth = Math.max(0.8, r * 0.08); disc(x, y, r); ctx.stroke();
    if (id) {
      ctx.fillStyle = C.white; disc(x, y, r * 0.5); ctx.fill();
      ctx.fillStyle = C.ink; ctx.font = `800 ${r * (id > 9 ? 0.56 : 0.68)}px "Bricolage Grotesque", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(id, x, y + r * 0.04);
    }
    ctx.strokeStyle = id ? 'rgba(246,244,236,0.75)' : 'rgba(22,25,26,0.18)'; ctx.lineWidth = r * 0.13; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y, r * 0.74, -2.5, -1.95); ctx.stroke();
  }

  // The chalk guide, as drawAim in the app: a gap in the line is the ball in the air, a small ring is where it lands,
  // the big ring is the cue ball where it first meets a ball, and the second line is that ball's path.
  function drawAim(g) {
    const r = P.R * s; ctx.strokeStyle = C.chalk; ctx.globalAlpha = 0.92; ctx.lineWidth = Math.max(1.2, 0.19 * r); ctx.lineCap = ctx.lineJoin = 'round';
    const line = pts => { if (pts.length > 1) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)))); ctx.stroke(); } };
    // Unlike the app, the flight is drawn too, as a fainter line: a visitor has not learnt yet that a gap means "in the air".
    let run = [], up = false;
    const end = () => { ctx.globalAlpha = up ? 0.3 : 0.92; line(run); run = run.slice(-1); };
    for (const q of g.cue.slice(0, g.split < 0 ? undefined : g.split + 1)) { const air = (q[2] || 0) > 0.05 * P.R; if (air !== up) { end(); up = air; } run.push(q); }
    end(); ctx.globalAlpha = 0.92; line(g.ob);
    for (const [x, y] of g.lands) { disc(X(x), Y(y), 0.7 * r); ctx.stroke(); }
    if (g.hit) { const q = g.cue[g.split]; disc(X(q[0]), Y(q[1]), 0.92 * r); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }

  // The house cue behind the cue ball. A raised cue is seen from above, so it looks shorter by cos(elev).
  function drawCue(b, ang, elev, back) {
    const len = 1.45 * Math.cos(elev) * s, k = 0.0125 * s, dx = -Math.cos(ang), dy = Math.sin(ang), x0 = X(b.x) + dx * (P.R * 1.25 + back) * s, y0 = Y(b.y) + dy * (P.R * 1.25 + back) * s;
    const w = f => (0.5 + 0.65 * f) * k, at = (f, side) => [x0 + dx * f * len - dy * side * w(f), y0 + dy * f * len + dx * side * w(f)];
    for (const [a, c, col] of HOUSE) {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(...at(a, 1)); ctx.lineTo(...at(c, 1)); ctx.lineTo(...at(c, -1)); ctx.lineTo(...at(a, -1)); ctx.fill();
    }
  }

  // v = { B, ids, fx, guide, cue: { ang, elev, back }, ring: HOLES index, fade }
  function draw(v) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(felt, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (v.ring != null) { const [x, y, r] = HOLES[v.ring]; ctx.strokeStyle = C.white; ctx.lineWidth = r * s * 0.2; disc(X(x), Y(y), r * s * 0.62); ctx.stroke(); }
    ctx.globalAlpha = v.fade ?? 1;
    for (const f of v.fx) drawBall(f, f.id, 1 - f.age / 220);
    if (v.guide) drawAim(v.guide);
    // Balls on the cloth first, a ball in the air on top.
    v.B.map((b, i) => [b, v.ids[i]]).filter(q => q[0].on).sort((a, b) => (a[0].z || 0) - (b[0].z || 0)).forEach(q => drawBall(...q));
    if (v.cue) drawCue(v.B[0], v.cue.ang, v.cue.elev, v.cue.back);
    ctx.globalAlpha = 1;
  }
  const toTable = e => { const q = canvas.getBoundingClientRect(); return [(e.clientX - q.left) / s - RAIL, P.W - ((e.clientY - q.top) / s - RAIL)]; };
  size();
  return { size, draw, toTable, canvas };
}

// Run a view's balls for ms of play (one engine step = 1 ms). A ball that drops leaves a 220 ms shrinking picture.
const ev = [];
function advance(v, ms) {
  let moving = true;
  for (let i = 0; i < ms && moving; i++) {
    ev.length = 0; moving = step(v.B, ev);
    for (const e of ev) if (e.t === 'pocket' || e.t === 'off') v.fx.push({ x: e.x, y: e.y, id: v.ids[e.a], age: 0 });
  }
  for (const f of v.fx) f.age += ms;
  v.fx = v.fx.filter(f => f.age < 220);
  return moving;
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
  const table = makeTable($('hero')), v = { B: [], ids: [], fx: [], cue: null };
  let state, t;
  const AIM = [0, 0.006, -0.008]; let n = 0; // three breaks, a hair apart, so the loop does not look like a film
  function set() {
    const r = rack(8), [cx, cy] = breakSpot();
    v.B = [ball(cx, cy), ...r.map(q => ball(q[1], q[2]))]; v.ids = [0, ...r.map(q => q[0])]; v.fx = [];
    const ang = Math.atan2(r[0][2] - cy, r[0][1] - cx) + AIM[n++ % 3];
    v.cue = { ang, elev: CUE.minElev, back: 0.05 }; state = 'aim'; t = 0;
  }
  set();
  scene(table, (ms, sc) => {
    if (calm) { if (sc.dirty) { table.draw(v); sc.dirty = false; } return; }
    t += ms; v.fade = 1;
    if (state === 'aim') { // pull back, then through the ball
      v.cue.back = t < 1100 ? 0.05 + 0.2 * Math.min(1, t / 900) ** 2 : 0.25 * (1 - (t - 1100) / 70);
      if (t >= 1170) { strike(v.B[0], { ang: v.cue.ang, speed: 0.9 * CUE.breakSpeed, a: 0, b: 0 }); v.cue = null; state = 'run'; }
    } else if (state === 'run') { if (!advance(v, ms)) { state = 'rest'; t = 0; } }
    else if (t > 3200) set();
    else if (t > 2400) v.fade = Math.max(0, 1 - (t - 2400) / 500);
    table.draw(v);
  });
}

// ---- The practice table ----
{
  const table = makeTable($('table')), v = { B: [], ids: [], fx: [], ring: POCKET }, say = $('say');
  const inp = { elev: $('elev'), aim: $('aim'), power: $('power') }, shoot = $('shoot'), dot = $('dot'), side = $('side').getContext('2d');
  let p = PRESETS[1], st, state = 'aim', t = 0, sc;

  const rackUp = () => { v.B = p.balls.map(q => ball(...q)); v.ids = p.ids; v.fx = []; state = 'aim'; shoot.disabled = false; guide(); };
  function guide() {
    v.guide = predict(v.B, shotOf(st), 0.7);
    v.cue = { ang: shotOf(st).ang, elev: st.elev * Math.PI / 180, back: 0.02 + 0.2 * st.power };
    if (sc) sc.dirty = true;
  }
  function show() { // the controls' pictures and labels
    $('zone').textContent = `${st.elev}° · ${zone(st.elev)}`;
    dot.style.transform = `translate(${st.x * 26}px, ${-st.y * 26}px)`;
    const g = side, e = st.elev * Math.PI / 180, bx = 150, by = 112, r = 22, cx = bx - Math.cos(e) * r, cy = by - Math.sin(e) * r;
    g.clearRect(0, 0, 208, 150); g.lineCap = 'round';
    g.strokeStyle = C.chalk + '66'; g.lineWidth = 2; g.beginPath(); g.moveTo(8, by + r + 1); g.lineTo(200, by + r + 1); g.stroke();
    g.fillStyle = C.white; g.beginPath(); g.arc(bx, by, r, 0, 7); g.fill();
    const seg = (a, b, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'butt'; g.beginPath(); g.moveTo(cx - Math.cos(e) * a, cy - Math.sin(e) * a); g.lineTo(cx - Math.cos(e) * b, cy - Math.sin(e) * b); g.stroke(); };
    seg(3, 9, C.accent, 5); seg(9, 16, C.white, 5); seg(16, 190, '#E3BE85', 6);
  }
  function load(q, keep) {
    p = q; if (!keep) st = { ...q };
    inp.elev.value = st.elev; inp.aim.value = st.off; inp.power.value = st.power;
    for (const k of $('presets').children) k.setAttribute('aria-checked', k.textContent === p.name);
    if (!keep) say.textContent = p.say;
    show(); rackUp();
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

  shoot.onclick = () => { if (state !== 'aim') return; state = 'swing'; t = 0; shoot.disabled = true; v.guide = null; };
  sc = scene(table, (ms, me) => {
    if (state === 'aim') { if (me.dirty) { table.draw(v); me.dirty = false; } return; }
    t += ms;
    if (state === 'swing') {
      v.cue.back = (0.02 + 0.2 * st.power) * Math.max(0, 1 - t / 80);
      if (t >= 80 || calm) { strike(v.B[0], shotOf(st)); state = 'run'; t = 0; }
    } else if (state === 'run') {
      if (t > 150) v.cue = null;
      if (!advance(v, ms)) {
        const n = v.B.length - 1, lost = !v.B[0].on;
        say.textContent = lost ? 'The cue ball is gone. Rack it again.' : !v.B[n].on ? `The ${v.ids[n]} is down.` : 'Missed. Change the aim, the angle or the spin.';
        state = 'rest'; t = 0;
      }
    } else if (t > 1300) { rackUp(); me.dirty = true; }
    table.draw(v);
  });
  load(p);
}

// ---- The cues: each card draws its cue from the app's own outlines (CUE_ART), tip up and to the right. ----
{
  const hand = $('hand'), dpr = Math.min(devicePixelRatio || 1, 2), S = 124;
  for (const [id, cue] of Object.entries(CUES)) {
    const li = document.createElement('li'), cv = document.createElement('canvas'), g = cv.getContext('2d'), { p: P_, seg, split } = CUE_ART[id];
    li.className = 'slab'; cv.width = cv.height = S * dpr;
    const w = f => { for (let j = 1; j < P_.length; j++) if (f <= P_[j][0]) { const [a, wa] = P_[j - 1], [b, wb] = P_[j]; return b === a ? wb : wa + (wb - wa) * (f - a) / (b - a); } return P_.at(-1)[1]; };
    const len = S * 1.2, k = 3.4;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.translate(S * 0.9, S * 0.1); g.rotate(Math.PI * 0.75);
    for (const [a, b, col] of seg) {
      const f = [a, ...P_.map(q => q[0]).filter(x => x > a && x < b), b], hole = split && b > split[0] ? split[1] : 0;
      g.fillStyle = col;
      for (const sgn of hole ? [1, -1] : [1]) {
        g.beginPath();
        f.forEach(x => g.lineTo(x * len, -sgn * w(x) * k));
        [...f].reverse().forEach(x => g.lineTo(x * len, (hole ? -sgn * w(x) * hole : w(x)) * k));
        g.fill();
      }
    }
    const b = document.createElement('b'); b.textContent = cue.name;
    const bars = document.createElement('div'); bars.className = 'bars';
    for (const stat of ['power', 'spin', 'aim']) bars.insertAdjacentHTML('beforeend', `<span>${stat[0].toUpperCase() + stat.slice(1)}</span><u style="--n:${cue[stat]}" role="img" aria-label="${cue[stat]} of 10"></u>`);
    li.append(cv, b, bars);
    li.onclick = () => { for (const o of hand.children) o.classList.toggle('up', o === li && !li.classList.contains('up')); };
    hand.append(li);
  }
  hand.children[0].classList.add('up');
}

// ---- The waitlist forms ----
{
  const forms = document.querySelectorAll('form.join'), q = new URLSearchParams(location.search);
  const ref = (q.get('ref') || q.get('utm_source') || '').slice(0, 40);
  const done = () => { for (const f of forms) { f.classList.add('sent'); f.querySelector('.done').hidden = false; } try { localStorage.setItem('joined', '1'); } catch {} };
  let was = q.has('joined'); try { was ||= localStorage.getItem('joined'); } catch {}
  if (was) done();
  for (const f of forms) {
    const note = f.querySelector('.note'), email = f.elements.email, btn = f.querySelector('button'), idle = note.textContent;
    f.elements.ref.value = ref;
    const bad = text => { note.textContent = text; note.classList.add('bad'); email.setAttribute('aria-invalid', 'true'); email.focus(); };
    email.addEventListener('input', () => { note.textContent = idle; note.classList.remove('bad'); email.removeAttribute('aria-invalid'); });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim())) return bad(email.value.trim() ? 'That email does not look right.' : 'Type your email to join.');
      btn.disabled = true;
      try {
        const r = await fetch('/api/join', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(f))) });
        if (r.ok) done(); else if (r.status === 400) bad('That email does not look right.'); else throw 0;
      } catch { note.textContent = 'That did not go through. Try again.'; note.classList.add('bad'); }
      btn.disabled = false;
    });
  }
}

// Sections come up once as they scroll in.
if (!calm) {
  const io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { e.target.classList.add('seen'); io.unobserve(e.target); } }, { rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('main h2, main .lede, .bench, .deal li, .price, .again form').forEach((el, i) => {
    if (el.getBoundingClientRect().top < innerHeight) return; // already on the screen: leave it
    el.classList.add('in'); if (el.matches('.deal li')) el.style.setProperty('--i', i % 6); io.observe(el);
  });
}
requestAnimationFrame(frame);
