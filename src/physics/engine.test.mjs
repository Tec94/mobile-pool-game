// Run: npm test   (checks the engine against known pool behaviour; ported from physics/engine.test.js)
import assert from 'node:assert';
import * as EngineAll from './engine.ts';
const { P, CUE, step, strike, predict, simulate, rack, jumpRuling } = EngineAll;
const { R, L, W } = P, D = 180 / Math.PI;
const mk = (x, y) => ({ x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true });
const SQUIRT = CUE.squirt; CUE.squirt = 0; // isolate table physics from cue deflection

function run(B, maxT = 60, each) {
  const ev = [], all = [];
  for (let i = 0; i < maxT / P.h; i++) {
    ev.length = 0; const mv = step(B, ev); all.push(...ev.map(e => ({ ...e, i })));
    if (each) each(i, ev);
    if (!mv) return { all, t: i * P.h };
  }
  throw new Error('did not come to rest');
}
const shot = (gap, speed, a, b, offY = 0) => {
  const B = [mk(0.5, 0.5), mk(0.5 + gap, 0.5 + offY)];
  strike(B[0], { ang: 0, speed, a, b });
  return B;
};

// 1. Stop, follow, draw on a straight shot (cue ball position 1.2 s after the strike, before the object ball can return).
{ const after = B => { for (let i = 0; i < 1200; i++) step(B); return B; };
  let B = after(shot(0.15, 3, 0, 0));
  assert(Math.abs(B[0].x - (0.65 - 2 * R)) < 0.08, 'stop shot: cue ball should die near contact, moved ' + (B[0].x - 0.65 + 2 * R));
  assert(B[1].x - 0.65 > 0.8, 'object ball should travel');
  B = after(shot(0.3, 3, 0, 0.4)); const follow = B[0].x - (0.8 - 2 * R);
  assert(follow > 0.3, 'follow: cue ball should roll forward, got ' + follow);
  B = after(shot(0.3, 3, 0, -0.4)); const draw = B[0].x - (0.8 - 2 * R);
  assert(draw < -0.3, 'draw: cue ball should come back, got ' + draw);
  console.log(`stop/follow/draw ok  (follow +${follow.toFixed(2)} m, draw ${draw.toFixed(2)} m)`); }

// 2. 90 degree rule: a stunned cue ball leaves at ~90 degrees to the object ball.
// 3. Throw: a stun cut throws the object ball off the line of centres by a few degrees.
{ const B = shot(2 * R + 0.003, 2, 0, 0, R); // half-ball hit, no roll yet
  const ev = []; let hit; while (!hit) { ev.length = 0; step(B, ev); hit = ev.find(e => e.t === 'bb'); }
  const ang = Math.abs(Math.atan2(B[0].vy, B[0].vx) - Math.atan2(B[1].vy, B[1].vx)) * D;
  assert(Math.abs(ang - 90) < 6, '90 degree rule, got ' + ang);
  const thr = hit.thr * D;
  assert(Math.abs(thr) > 1 && Math.abs(thr) < 7, 'cut throw should be 1-7 degrees, got ' + thr);
  // cue ball passes on the -y side of the object ball moving +x: it drags the object ball's near side forward,
  // so the object ball is thrown toward the cue ball's direction of travel (clockwise from the line of centres here).
  assert(thr < 0, 'cut throw direction');
  console.log(`90 degree rule ok (${ang.toFixed(1)} deg), cut throw ${thr.toFixed(2)} deg at ${(hit.cut * D).toFixed(1)} deg cut`); }

// 4. 30 degree rule: a rolling cue ball on a half-ball hit deflects ~30-35 degrees.
{ const B = shot(0.5, 2, 0, 0.4, R); let dir = null, hitI = -1;
  run(B, 60, (i, ev) => { if (ev.some(e => e.t === 'bb')) hitI = i;
    if (hitI >= 0 && dir === null && i > hitI + 5 && Math.hypot(B[0].vx - R * B[0].wy, B[0].vy + R * B[0].wx) < 1e-6) dir = Math.atan2(B[0].vy, B[0].vx) * D; });
  assert(Math.abs(dir) > 26 && Math.abs(dir) < 38, '30 degree rule, got ' + dir);
  console.log(`30 degree rule ok (${Math.abs(dir).toFixed(1)} deg)`); }

// 5. Sidespin throw on a straight shot: right english throws the object ball left, and vice versa.
{ const thr = a => { const B = shot(2 * R + 0.003, 1.5, a, 0); const ev = []; let h; while (!h) { ev.length = 0; step(B, ev); h = ev.find(e => e.t === 'bb'); } return h.thr * D; };
  const r = thr(0.4), l = thr(-0.4);
  assert(r > 0.5 && l < -0.5 && Math.abs(r + l) < 1e-6, `spin throw: right ${r}, left ${l}`);
  console.log(`spin throw ok (right english throws ${r.toFixed(2)} deg left)`); }

// 6. Banks, measured as the landing angle (rail contact to where the ball crosses the table centre line), 45 degrees in.
{ const bank = (a, speed, b = 0.4) => { const B = [mk(0.4, 0.75)]; strike(B[0], { ang: Math.PI / 4, speed, a, b });
    const ev = []; let h; while (!h) { ev.length = 0; step(B, ev); h = ev.find(e => e.t === 'rail'); }
    const x0 = B[0].x, y0 = B[0].y, sp = Math.hypot(B[0].vx, B[0].vy);
    while (B[0].y > W / 2 && (B[0].vx || B[0].vy)) step(B);
    return { out: Math.atan2(B[0].x - x0, y0 - B[0].y) * D, sp }; };
  const none = bank(0, 2.5), runE = bank(0.35, 2.5), rev = bank(-0.35, 2.5), slow = bank(0, 1), hard = bank(0, 5);
  console.log(`bank 45 deg in -> out: reverse ${rev.out.toFixed(1)}, none ${none.out.toFixed(1)}, running ${runE.out.toFixed(1)}; soft ${slow.out.toFixed(1)}, hard ${hard.out.toFixed(1)}`);
  assert(none.out > 44 && none.out < 54, 'medium rolling bank should land near the mirror angle, slightly long');
  assert(runE.out > none.out + 4, 'running english lengthens the bank');
  assert(rev.out < none.out - 4, 'reverse english shortens the bank');
  assert(slow.out > none.out && none.out > hard.out, 'more speed banks shorter');
  assert(none.sp < 2.5, 'cushion must lose energy'); }

// 7. Pockets: a straight shot into the corner drops the object ball; a ball along the rail passes the side pocket.
{ const B = [mk(1.36, 0.24), mk(1.85, 0.73)]; strike(B[0], { ang: Math.PI / 4, speed: 2.5, a: 0, b: 0 }); run(B);
  assert(!B[1].on, 'corner pot');
  const C = [mk(0.5, R)]; strike(C[0], { ang: 0, speed: 0.5, a: 0, b: 0.4 }); run(C);
  assert(C[0].on && C[0].x > L / 2 + 0.1, 'ball rolling down the rail should pass the side pocket');
  console.log('pockets ok'); }

// 8. Full-power break: stays finite, energy never rises, every ball ends on the table or in a pocket, no overlaps.
{ const B = [mk(L / 4, W / 2)], g = 2 * R + 1e-4;
  for (let i = 0; i < 5; i++) for (let k = 0; k <= i; k++) B.push(mk(0.75 * L + i * g * Math.cos(Math.PI / 6), W / 2 + (k - i / 2) * g));
  strike(B[0], { ang: 0.01, speed: 8, a: 0.1, b: 0.2 });
  const E = () => B.reduce((s, b) => s + 0.5 * (b.vx ** 2 + b.vy ** 2) + 0.2 * R * R * (b.wx ** 2 + b.wy ** 2 + b.wz ** 2), 0);
  let e0 = E(), worst = 0;
  const r = run(B, 90, i => { if (i % 50 === 0) { const e = E(); worst = Math.max(worst, e - e0); e0 = e; } });
  assert(worst < 1e-6, 'energy rose by ' + worst);
  for (const b of B) { assert(Number.isFinite(b.x + b.y)); if (b.on) assert(b.x > -0.012 && b.x < L + 0.012 && b.y > -0.012 && b.y < W + 0.012, "ball left the table"); }
  for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) if (B[i].on && B[j].on) assert(Math.hypot(B[i].x - B[j].x, B[i].y - B[j].y) > 2 * R - 0.001, 'overlap');
  console.log(`break ok  (rest after ${r.t.toFixed(1)} s, ${B.filter(b => !b.on).length} pocketed, ${r.all.filter(e => e.t === 'bb').length} ball contacts)`); }

// 9. The aim line is the same simulation, so its first contact matches the real shot exactly.
{ const B = [mk(0.5, 0.5), mk(1.2, 0.53)], s = { ang: 0.02, speed: 3, a: 0.2, b: -0.2 };
  const p = predict(B, s, Infinity); strike(B[0], s); const r = run(B);
  const h = r.all.find(e => e.t === 'bb');
  assert(p.hit && p.hit.cut === h.cut && p.hit.thr === h.thr, 'prediction must equal the shot');
  const end = p.ob[p.ob.length - 1];
  assert(Math.hypot(end[0] - B[1].x, end[1] - B[1].y) < 0.01 || !B[1].on, 'predicted object-ball path ends where the ball stops');
  console.log('aim line matches the shot'); }

// 10. A dead-straight centre-ball break is mirror-symmetric: balls that touch two others at once are solved together,
//     so the result must not depend on ball order. Checked 30 ms after the cue ball lands, before chaos takes over.
{ const B = [mk(L / 4, W / 2)], g = 2 * R + 1e-4, rows = [];
  for (let i = 0; i < 5; i++) { rows.push([]); for (let k = 0; k <= i; k++) { B.push(mk(0.75 * L + i * g * Math.cos(Math.PI / 6), W / 2 + (k - i / 2) * g)); rows[i].push(B[B.length - 1]); } }
  strike(B[0], { ang: 0, speed: 8, a: 0, b: 0 });
  const ev = []; let n = -1; while (n !== 0) { step(B, ev); if (n < 0 && ev.length) n = 31; if (n > 0) n--; }
  assert(Math.abs(B[0].vy) < 0.02, 'cue ball must not be kicked sideways by a square hit, vy ' + B[0].vy);
  for (const r of rows) for (let k = 0; k < r.length; k++) { const a = r[k], b = r[r.length - 1 - k];
    assert(Math.abs(a.vx - b.vx) < 0.05 && Math.abs(a.vy + b.vy) < 0.05, 'break must be mirror-symmetric'); }
  console.log('break symmetry ok'); }

// 11. Sidespin left on a resting ball is cleared when the table comes to rest; a cue passed to strike() overrides CUE.
{ const B = [mk(1, 0.5)]; B[0].wz = 100; assert(step(B) === false && B[0].wz === 0, 'spin must not leak into the next shot');
  const b = mk(0, 0); strike(b, { ang: 0, speed: 2, a: 0.5, b: 0 }, { squirt: 0.1 });
  assert(Math.abs(Math.atan2(b.vy, b.vx) - 0.05) < 1e-12, 'strike uses the cue it is given');
  assert(SQUIRT * 0.5 * D >= 1.8 && SQUIRT * 0.5 * D <= 2.5, 'the standard cue squirts 1.8 to 2.5 degrees at full side spin (measured range)');
  console.log('rest state and per-shot cue ok'); }

// 12. Fuzz: 300 random tables and shots (some with balls frozen together or on a rail). Energy never rises in any
//     step, every shot comes to rest, no ball ends overlapping another or outside the table, same input = same output.
{ let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const E = B => B.reduce((s, b) => s + 0.5 * (b.vx ** 2 + b.vy ** 2) + 0.2 * R * R * (b.wx ** 2 + b.wy ** 2 + b.wz ** 2), 0);
  let first;
  for (let n = 0; n < 300; n++) { const B = [], nb = 2 + Math.floor(rnd() * 14);
    while (B.length < nb) { const x = R + rnd() * (L - 2 * R), y = R + rnd() * (W - 2 * R); if (!B.some(b => Math.hypot(b.x - x, b.y - y) < 2 * R + 1e-4)) B.push(mk(x, y)); }
    if (n % 5 === 0 && B[0].x < L - 4 * R && !B.some((b, i) => i > 1 && Math.hypot(b.x - B[0].x - 2 * R, b.y - B[0].y) < 2 * R)) { B[1].x = B[0].x + 2 * R + 1e-5; B[1].y = B[0].y; }
    const m = rnd() * 0.5, t = rnd() * 7, s = { ang: rnd() * 7, speed: 0.2 + rnd() * 7.8, a: m * Math.cos(t), b: m * Math.sin(t) }, copy = B.map(b => ({ ...b }));
    strike(B[0], s); let e0 = E(B);
    run(B, 120, () => { const e = E(B); assert(e - e0 < 1e-9, 'energy rose in one step by ' + (e - e0)); e0 = e; });
    for (const b of B) { assert(Number.isFinite(b.x + b.y)); if (b.on) assert(b.x > -0.012 && b.x < L + 0.012 && b.y > -0.012 && b.y < W + 0.012, 'ball left the table'); }
    for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) if (B[i].on && B[j].on) assert(Math.hypot(B[i].x - B[j].x, B[i].y - B[j].y) > 2 * R - 1e-4, 'overlap at rest');
    if (n === 0) { strike(copy[0], s); run(copy); assert(JSON.stringify(copy) === JSON.stringify(B), 'same input must give the same result'); } }
  console.log('fuzz ok (300 random shots)'); }
// 13. Bot simulation: same outcome as playing the shot, and the step cap is honoured.
{ const B = [mk(1.36, 0.24), mk(1.85, 0.73)], s = { ang: Math.PI / 4, speed: 2.5, a: 0, b: 0 };
  const r = simulate(B, s); assert(r.settled && r.first === 1 && r.potted.includes(1) && B[1].on, 'simulate pots the ball on a copy');
  const c = simulate(B, s, CUE, 100); assert(!c.settled && c.steps <= 101, 'simulate stops at the cap');
  console.log('bot simulate ok'); }
// 14. Racks: 15 balls for 8-ball, a 9-ball diamond with the 1 on the foot spot and the 9 in the middle; both break cleanly.
{ for (const [game, n] of [[8, 15], [9, 9]]) {
    const S = rack(game); assert(S.length === n && new Set(S.map(s => s[0])).size === n, game + '-ball rack size');
    assert(S[0][0] === 1 && Math.abs(S[0][1] - 0.75 * L) < 1e-12 && Math.abs(S[0][2] - W / 2) < 1e-12, 'the 1 sits on the foot spot');
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) assert(Math.hypot(S[i][1] - S[j][1], S[i][2] - S[j][2]) > 2 * R, 'racked balls overlap');
    const B = [mk(L / 4, W / 2), ...S.map(s => mk(s[1], s[2]))], r = simulate(B, { ang: 0, speed: CUE.breakSpeed, a: 0, b: 0.1 }, CUE, 60000);
    assert(r.settled && r.balls.every(b => Number.isFinite(b.x + b.y)), game + '-ball break settles'); }
  const nine = rack(9), mid = nine.find(s => s[0] === 9), xs = nine.map(s => s[1]);
  assert(Math.abs(mid[2] - W / 2) < 1e-12 && Math.abs(mid[1] - (Math.min(...xs) + Math.max(...xs)) / 2) < 1e-12, 'the 9 is in the middle of the diamond');
  console.log('racks ok (8-ball and 9-ball)'); }
// 15. Calibration against measured tables: roll distance and lag time for the cloth speed (Jewett: speed = 2 t^2,
// new tournament cloth 100 to 130), side spin decay 5 to 15 rad/s^2 (Dr. Dave), a rolling ball square into a rail
// leaves at 0.82 of its speed (pool cushions measure 0.6 to 0.9, Dr. Dave; check 27 tests the rail against real tables).
{ const roll = v => ({ ...mk(0.2, W / 2), vx: v, wy: v / R });
  const b = roll(0.5), r = run([b]), a = P.mur * P.g;
  assert(Math.abs(b.x - 0.2 - 0.25 / (2 * a)) < 0.005 && Math.abs(r.t - 0.5 / a) < 0.02, 'rolling ball stops where v^2/(2 mu g) says');
  assert(1 / P.mur >= 100 && 1 / P.mur <= 130, 'table speed is in the new tournament cloth range');
  const s = roll(1); s.wz = 50; for (let i = 0; i < 1000; i++) step([s]);
  assert(50 - s.wz > 5 && 50 - s.wz < 15, 'side spin decays at 5 to 15 rad/s^2');
  const c = roll(1); c.x = L - 0.2; let vin = 0; while (c.vx > 0) { vin = c.vx; step([c]); }
  assert(Math.abs(-c.vx / vin - 0.818) < 0.02, 'rail rebound ratio ' + (-c.vx / vin));
  console.log(`calibration ok (table speed ${(1 / P.mur).toFixed(0)}, spin decay ${(50 - s.wz).toFixed(1)} rad/s^2, rail rebound ${(-c.vx / vin).toFixed(3)})`); }

// ---- Cue elevation: jump and masse (maths: https://claude.ai/artifact/TVh3RwdDyQP2htw8iHVYFd) ----
const el = d => d / D, cueAt = (x, y, ...rest) => [mk(x, y), ...rest];
const fade = e => { const g = 16 * Math.cos(el(e)) ** 8; return g / (1 + g ** 4) ** 0.25; };

// 16. A jump is a plain ballistic arc: apex = vz^2/2g, first landing = 2*vz*vh/g from the strike.
{ for (const [speed, e] of [[3, 30], [4, 45], [4.5, 50], [3.5, 40]]) {
    const B = cueAt(0.3, 0.55); strike(B[0], { ang: 0, speed, a: 0, b: 0, elev: el(e) });
    const vz = B[0].vz, vh = B[0].vx, want = Math.sqrt((P.lift * fade(e) * speed * Math.sin(el(e))) ** 2 - P.hopMin ** 2);
    assert(Math.abs(vz - want) < 1e-12, 'launch speed');
    let apex = 0, land = null; const ev = [];
    while (land === null) { ev.length = 0; step(B, ev); apex = Math.max(apex, B[0].z); const l = ev.find(q => q.t === 'land'); if (l) land = l.x - 0.3; }
    assert(Math.abs(apex - vz * vz / 2 / P.g) < 0.002, `apex ${apex} vs ${vz * vz / 2 / P.g}`);
    assert(Math.abs(land - 2 * vz * vh / P.g) < 0.01, `landing ${land} vs ${2 * vz * vh / P.g}`);
    assert(B[0].z === 0 && B[0].vz >= 0, 'ball is back on the slate');
  }
  const B = cueAt(0.3, 0.55); strike(B[0], { ang: 0, speed: 8, a: 0.3, b: 0.2 }); assert(B[0].vz === 0 && B[0].z === 0, 'a level cue never lifts the ball (no scoop jumps)');
  console.log('jump arc ok (apex and landing match the ballistic formulas)'); }

// 17. Jumping a blocker: level hits the blocker, a firm 40 degree jump clears it and hits the ball behind,
// a soft one clips the blocker on the way up.
{ const T = () => cueAt(0.5, W / 2, mk(0.78, W / 2), mk(1.62, W / 2));
  const lvl = simulate(T(), { ang: 0, speed: 3.6, a: 0, b: 0 }), jmp = simulate(T(), { ang: 0, speed: 3.6, a: 0, b: 0, elev: el(40) }),
    soft = simulate(T(), { ang: 0, speed: 2.4, a: 0, b: 0, elev: el(40) });
  assert(lvl.first === 1 && soft.first === 1, 'level and soft shots hit the blocker');
  assert(jmp.first === 2 && !jmp.off.length, 'jump clears the blocker: the first ball the cue ball touches is the one behind');
  console.log('jump over a blocker ok'); }

// 18. Masse (Coriolis): whatever happens on the way, the ball ends up rolling at atan2(-a sin(elev), cos(elev) + b)
// from the aim, because cloth forces act at the contact point and cannot change v + 0.4 R (w x z).
{ let n = 0, worst = 0;
  for (const speed of [1.5, 2.5, 3.5]) for (const e of [10, 30, 50, 65, 75, 80]) for (const a of [-0.5, -0.25, 0.3]) for (const b of [-0.3, 0, 0.3]) {
    const B = cueAt(L / 2, W / 2), c = B[0], ang = 1; strike(c, { ang, speed, a, b, elev: el(e) });
    const want = Math.atan2(-a * Math.sin(el(e)), Math.cos(el(e)) + b); let got = null; const ev = [];
    for (let i = 0; i < 20000 && got === null; i++) { ev.length = 0; const mv = step(B, ev); if (ev.some(q => q.t === 'rail') || !mv) break;
      if (!c.z && !c.vz && Math.hypot(c.vx - R * c.wy, c.vy + R * c.wx) < 1e-7 && Math.hypot(c.vx, c.vy) > 0.05) got = Math.atan2(c.vy, c.vx) - ang; }
    if (got === null) continue; // reached a rail (or died) before it finished curving
    let d = Math.abs(got - want); if (d > Math.PI) d = 2 * Math.PI - d; worst = Math.max(worst, d * D); n++;
  }
  assert(n > 60 && worst < 0.3, `masse final direction: ${n} cases, worst error ${worst} deg`);
  console.log(`masse final direction ok (${n} shots, worst ${worst.toFixed(3)} deg off Coriolis)`); }

// 19. Masse round a blocker: the straight line is blocked, the curved shot reaches the hidden ball with no rail.
{ const T = () => cueAt(0.45, 0.3, mk(0.85, 0.3), mk(1.3, 0.3)); CUE.squirt = SQUIRT;
  assert(simulate(T(), { ang: 0, speed: 4.05, a: 0, b: 0 }).first === 1, 'straight line is blocked');
  for (const a of [0.35, 0.4, 0.45]) { const B = T(), ev = []; strike(B[0], { ang: 0.4, speed: 4.05, a, b: 0, elev: el(60) }); let hit = null, rail = false, top = 0;
    for (let i = 0; i < 12000 && !hit; i++) { ev.length = 0; if (!step(B, ev)) break; top = Math.max(top, B[0].z); for (const q of ev) { if (q.t === 'rail') rail = true; if (q.t === 'bb') hit = q; } }
    assert(hit && hit.b === 2 && !rail && top === 0, 'masse goes round (not over) to the hidden ball, english ' + a); }
  CUE.squirt = 0; console.log('masse round a blocker ok'); }

// 20. Leaving the table, and the rulings. Too much power on a jump is a foul; a low hop still meets the cushion.
{ const over = simulate(cueAt(1.6, 0.55), { ang: 0, speed: CUE.maxSpeed, a: 0, b: 0, elev: el(40) });
  assert(over.off.includes(0) && over.scratch && !over.balls[0].on, 'full-power jump leaves the table');
  const low = simulate(cueAt(1.9, 0.55), { ang: 0, speed: 3, a: 0, b: 0, elev: el(15) });
  assert(!low.off.length && low.balls[0].on && low.balls[0].x < L - R, 'a low hop bounces off the cushion');
  assert.deepStrictEqual(jumpRuling([], 8), { foul: false, ballInHand: false, headString: false, lossOfRack: false, respot: [], removed: [] });
  assert(jumpRuling([0], 9).foul && !jumpRuling([0], 9).lossOfRack);
  assert(jumpRuling([8], 8).lossOfRack && !jumpRuling([8], 9).lossOfRack);
  assert(!jumpRuling([8], 8, true).lossOfRack && jumpRuling([8], 8, true).respot[0] === 8, 'the 8 off the table on the break is spotted, not a loss');
  assert(jumpRuling([3], 8, true).headString && !jumpRuling([3], 8).headString && !jumpRuling([0], 8, true).headString, 'object ball off the table on the 8-ball break: cue ball above the head string');
  assert.deepStrictEqual(jumpRuling([9, 3], 9).respot, [9]); assert.deepStrictEqual(jumpRuling([9, 3], 9).removed, [3]);
  console.log('off the table and jump rulings ok'); }

// 21. Masterable (jump zone, 15 to 44 degrees, every power): small changes on the controls give small, one-directional changes in the result (no cliffs).
{ const landing = (speed, e) => { const B = cueAt(0.3, 0.55); strike(B[0], { ang: 0, speed, a: 0, b: 0, elev: el(e) }); return 2 * B[0].vz * B[0].vx / P.g; };
  let perDeg = 0, perPct = 0;
  const pc = CUE.maxSpeed / 100;
  for (let e = 15; e < 44; e++) for (let s = 10 * pc; s <= 99 * pc; s += pc) { perDeg = Math.max(perDeg, Math.abs(landing(s, e + 1) - landing(s, e))); perPct = Math.max(perPct, landing(s + pc, e) - landing(s, e)); assert(landing(s + pc, e) >= landing(s, e)); }
  // Between the zones (44 to 60 degrees) the hop dies away: steeper, but never a jump of more than 11 cm per degree.
  for (let e = 44; e < 60; e++) assert(Math.abs(landing(CUE.maxSpeed, e + 1) - landing(CUE.maxSpeed, e)) < 0.11, 'transition cliff at ' + e);
  for (let e = 60; e <= 80; e++) assert(landing(CUE.maxSpeed, e) === 0, 'from 60 degrees up the ball stays down at any power');
  assert(perDeg < 2 * R && perPct < 2 * R, // one notch on either control moves the landing by less than a ball width
    `landing sensitivity ${perDeg} m per degree, ${perPct} m per 1% power`);
  let curve = 0; for (let e = 0; e < 80; e++) { const f = x => Math.atan2(0.5 * Math.sin(el(x)), Math.cos(el(x))) * D; assert(f(e + 1) > f(e)); curve = Math.max(curve, f(e + 1) - f(e)); }
  assert(curve < 3, 'masse curve per degree of elevation ' + curve);
  console.log(`control sensitivity ok (landing moves at most ${(perDeg * 100).toFixed(1)} cm per degree and ${(perPct * 100).toFixed(1)} cm per 1% power; curve at most ${curve.toFixed(1)} deg per degree)`); }

// 22. The aim line is honest for elevated shots, and random elevated shots on a full table always settle sanely.
{ const T = () => cueAt(0.5, W / 2, mk(0.78, W / 2), mk(1.62, W / 2)), sh = { ang: 0, speed: 3.6, a: 0.1, b: 0, elev: el(40) };
  const p = predict(T(), sh, Infinity), B = T(), ev = []; strike(B[0], sh); let land = null, hit = null;
  for (let i = 0; i < 9000 && !hit; i++) { ev.length = 0; step(B, ev); for (const q of ev) { if (q.t === 'land' && !land) land = q; if (q.t === 'bb') hit = q; } }
  assert(p.lands.length && p.lands[0][0] === land.x && p.hit.b === hit.b && p.apex > 0.06, 'aim line shows the real landing and hit');
  let s = 7; const rnd = () => (s = s * 16807 % 2147483647) / 2147483647; let offs = 0;
  for (let k = 0; k < 300; k++) { const B = [mk(0.3 + rnd() * 1.6, 0.2 + rnd() * 0.7)];
    for (let j = 0; j < 9; j++) { let q; do q = mk(0.1 + rnd() * 2, 0.1 + rnd() * 0.9); while (B.some(o => Math.hypot(o.x - q.x, o.y - q.y) < 2 * R + 1e-3)); B.push(q); }
    const m = Math.min(0.5, rnd()), t = rnd() * 7, r = simulate(B, { ang: rnd() * 7, speed: 1 + rnd() * 7, a: m * Math.cos(t), b: m * Math.sin(t), elev: el(rnd() * 80) }, CUE, 60000);
    assert(r.settled, 'elevated shot must come to rest'); offs += r.off.length;
    for (const b of r.balls) { assert([b.x, b.y, b.vx, b.vy, b.wx, b.wy, b.wz].every(Number.isFinite) && !b.z && !b.vz, 'finite and on the slate at rest');
      if (b.on) assert(b.x > -0.012 && b.x < L + 0.012 && b.y > -0.012 && b.y < W + 0.012, 'ball at rest is on the bed'); }
    for (let i = 0; i < r.balls.length; i++) for (let j = i + 1; j < r.balls.length; j++) { const a = r.balls[i], b = r.balls[j]; if (a.on && b.on) assert(Math.hypot(a.x - b.x, a.y - b.y) > 2 * R - 1e-3, 'no overlap at rest'); } }
  // A ball that comes down almost dead centre on another must roll off it, not sink in and rest on the same spot.
  for (const dx of [0, 5e-4]) { const T2 = [mk(1, 0.5), mk(1 + dx, 0.5)]; T2[0].z = 0.2; T2[0].vz = -0.1; let i = 0; while (step(T2) && i++ < 20000);
    assert(i < 20000 && !T2[0].z && Math.hypot(T2[0].x - T2[1].x, T2[0].y - T2[1].y) > 2 * R - 1e-3, 'ball landing on top of another must roll off'); }
  // The hop threshold has no cliff: one 1% power notch across it moves the first landing by under a ball width.
  { const fl = sp => { const b = mk(0.3, 0.5); strike(b, { ang: 0, speed: sp, a: 0, b: 0, elev: el(4) }); return 2 * b.vz * b.vx / P.g; };
    for (let sp = 6; sp < 8; sp += 0.08) assert(fl(sp + 0.08) - fl(sp) < 2 * R, 'hop cliff at ' + sp); }
  console.log(`aim line and elevated fuzz ok (300 random elevated shots, ${offs} balls left the table)`); }

// 23. Pockets do not play wider at speed, and a cue's massRatio sets what spin costs. Effective size = width of the
// band of rolling-ball paths, straight at a corner pocket, that drop. The band that touches nothing is the mouth less
// one ball, 2.32 in. Dr. Dave's geometric model of the same pocket (TP 3.6: mouth 4.59 in, 142 degree facings; BD Dec
// 2004) gives 3.05 in slow and 2.75 in fast. Ours is tighter: the cushion grip that the rails are calibrated with also
// slows and turns a ball that clips a pocket point. Not tuned to the model, because no measured pocket data was found.
{ const size = v => { let n = 0; const q = Math.SQRT1_2;
    for (let o = -0.06; o <= 0.06; o += 0.001) { const b = { ...mk(0.29 + q * o, 0.29 - q * o), vx: -v * q, vy: -v * q, wx: v * q / R, wy: -v * q / R };
      for (let i = 0; i < 4000 && b.on && Math.hypot(b.x, b.y) < 0.45; i++) step([b]);
      if (!b.on && Math.hypot(b.x, b.y) < 0.15) n++; }
    return n * 0.001 / 0.0254; };
  const slow = size(1), fast = size(4.5);
  assert(fast > 2.32 && fast <= slow && slow < 3.05, `corner pocket size ${slow} in slow, ${fast} in fast`);
  const v = m => { const c = mk(1, 0.5); strike(c, { ang: 0, speed: 3, a: 0, b: -0.5 }, { ...CUE, massRatio: m }); return c.vx; };
  assert(Math.abs(v(0.316) / 3 - 0.678) < 0.002 && Math.abs(v(2.28) / 3 - 0.84) < 0.002, 'massRatio 2.28 halves the speed cost of full spin');
  console.log(`pocket size ok (corner, straight in: ${slow.toFixed(2)} in at 1 m/s, ${fast.toFixed(2)} in at 4.5 m/s), per-cue massRatio ok`); }

// 24. Pocket geometry is inside the WPA table spec (Recommended Equipment Specifications, section 9), and every
// hole sits behind the cushion nose line, outside the playing field. Shelf = mouth line to the slate drop.
{ const { POCKET: K, HOLES, SEGS } = EngineAll, inch = 0.0254, deg = (a, b) => Math.acos((a[0] * b[0] + a[1] * b[1]) / Math.hypot(...a) / Math.hypot(...b)) * D;
  const corner = K.cc * Math.SQRT2 / inch, side = 2 * K.sc / inch;
  const cShelf = (K.cc / Math.SQRT2 - (K.r - K.cornerOut * Math.SQRT2)) / inch, sShelf = (K.sideOut - K.r) / inch;
  const [rail, , cj, , sj] = SEGS, along = [rail[2] - rail[0], rail[3] - rail[1]], back = [-along[0], -along[1]];
  const cAng = deg(along, [cj[2] - cj[0], cj[3] - cj[1]]), sAng = deg(back, [sj[2] - sj[0], sj[3] - sj[1]]);
  assert(corner >= 4.5 && corner <= 4.625 && side >= 5 && side <= 5.125, `mouths ${corner} / ${side} in`);
  assert(Math.abs(cAng - 142) <= 1 && Math.abs(sAng - 104) <= 1, `facing angles ${cAng} / ${sAng}`);
  assert(cShelf >= 1 && cShelf <= 2.25 && sShelf >= 0 && sShelf <= 0.375, `shelves ${cShelf} / ${sShelf} in`);
  for (const [x, y] of HOLES) assert(x < 0 || x > L || y < 0 || y > W, 'pocket centre must be outside the playing field');
  // The same pockets on a 9 ft table (100 x 50 in), and back again.
  EngineAll.setTable(2.54, 1.27); assert(P.L === 2.54 && SEGS.length === 20 && HOLES.length === 6 && HOLES[5][0] === 1.27 && Math.abs(HOLES[5][1] - 1.27 - K.sideOut) < 1e-12, '9 ft table');
  EngineAll.setTable(L, W); assert(P.L === L && P.W === W && SEGS.length === 20 && HOLES[4][0] === L / 2, 'back to the 8 ft table');
  console.log(`pocket geometry ok (corner ${corner.toFixed(2)} in, ${cAng.toFixed(0)} deg, shelf ${cShelf.toFixed(2)} in; side ${side.toFixed(2)} in, ${sAng.toFixed(0)} deg, shelf ${sShelf.toFixed(2)} in)`); }

// 25. A thin hit is found wherever the steps fall. A ball that grazes another by 0.02 mm at break speed touches it for
// less than one step, so the whole step is swept, not only its end.
{ let n = 0;
  for (const v of [1, 4.5, 12]) for (const depth of [1e-4, 2e-5]) for (let ph = 0; ph < 20; ph++, n++) {
    const B = [{ ...mk(0.5 + ph * v * P.h / 20, 0.5), vx: v, wy: v / R }, mk(0.9, 0.5 + 2 * R - depth)], ev = [];
    for (let i = 0; i < 600 && !ev.length; i++) step(B, ev);
    assert(ev.some(e => e.t === 'bb'), `thin hit missed: ${v} m/s, ${depth * 1e3} mm deep, step phase ${ph}/20`); }
  console.log(`thin hits ok (${n} grazes, found at every step phase)`); }

// 26. A clip of a pocket point does not depend on where the steps fall. The same line of travel (6 mm into the far
// point of the side pocket), started at 20 different fractions of a step, leaves the point in the same direction.
{ const px = L / 2 + EngineAll.POCKET.sc, a = -25 / D, dx = Math.cos(a), dy = Math.sin(a), off = R - 0.006; let n = 0, dir = 0;
  for (const v of [1, 4.5, 8]) { let lo = 9, hi = -9;
    for (let ph = 0; ph < 20; ph++, n++) { const back = 0.4 + ph * v * P.h / 20, ev = [];
      const b = { ...mk(px - dx * back - dy * off, -dy * back + dx * off), vx: v * dx, vy: v * dy, wx: -v * dy / R, wy: v * dx / R };
      for (let i = 0; i < 3000 && !ev.length; i++) step([b], ev);
      assert(ev[0].t === 'rail' && Math.abs(Math.hypot(ev[0].x - px, ev[0].y) - R) < 1e-9, 'the ball meets the point at one ball radius');
      dir = Math.atan2(b.vy, b.vx); lo = Math.min(lo, dir); hi = Math.max(hi, dir); }
    assert(hi - lo < 1e-6, `pocket point: the direction after the clip changes by ${(hi - lo) * D} deg with the step phase at ${v} m/s`); }
  console.log(`pocket point ok (${n} clips, same direction at every step phase: ${(dir * D).toFixed(1)} deg)`); }

// 27. Cloth and cushions together, against real-table figures. These are quoted for a 9 ft table, so the check sets one.
// (a) Bob Jewett (AzBilliards 2023): a ball needs 2, 4.2, 7.9 and 14.5 ft/s and about 20 mph to travel 1, 2, 3, 4 and 5
//     table lengths. (b) Dr. Dave: on a kick straight across the table, 1/3, 2/3 and all of the maximum side spin move
//     the ball about 1, 2 and 3 diamonds along the rail it comes back to.
{ EngineAll.setTable(2.54, 1.27); const len = [], dia = [], mr = CUE.massRatio;
  for (const [v, n] of [[0.61, 1], [1.28, 2], [2.41, 3], [4.42, 4], [8.9, 5]]) { const b = { ...mk(R + 1e-4, P.W / 2), vx: v, wy: v / R }; let d = 0, px = b.x;
    while (step([b])) { d += Math.abs(b.x - px); px = b.x; }
    len.push(d / (P.L - 2 * R)); assert(Math.abs(len[n - 1] / n - 1) < 0.08, `${v} m/s should travel ${n} table lengths, went ${len[n - 1]}`); }
  for (const k of [1, 2, 3]) { const off = k / 6, c = mk(0.3 * P.L, R + 1e-4), ev = []; // ball speed 2.2 m/s at each offset
    strike(c, { ang: Math.PI / 2, speed: 2.2 * (1 + mr + 2.5 * off * off) / (1 + mr), a: off, b: 0 });
    while (ev.filter(e => e.t === 'rail').length < 2 && step([c], ev));
    dia.push(Math.abs(c.x - 0.3 * P.L) / (P.L / 8)); assert(Math.abs(dia[k - 1] - k) < 0.25, `${k}/3 side spin should move the kick ${k} diamonds, moved ${dia[k - 1]}`); }
  EngineAll.setTable(L, W);
  console.log(`9 ft table ok (1 to 5 lengths: ${len.map(x => x.toFixed(2)).join(', ')}; side spin kick: ${dia.map(x => x.toFixed(2)).join(', ')} diamonds)`); }
console.log('all checks passed');
