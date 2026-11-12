// Run: npm test   (the self-checks of the ai-progression prototype, check.js 1-8, on the engine's table size)
import assert from 'node:assert';
import * as S from './shot-ai.ts';
const { W, H, R } = S;
let n = 0; const ok = name => console.log(`ok ${++n} ${name}`);
const deg = (r) => r * 180 / Math.PI;

{ // 1. Straight-in shot to the top side pocket is found, aimed straight up, zero cut. 2. A blocker on the line removes it.
  const cue = { id: 0, x: W / 2, y: 800 }, balls = [{ id: 1, x: W / 2, y: 300 }];
  const s = S.enumerate(cue, balls, [1]).find((x) => x.type === 'direct' && x.pocket === 1);
  assert(s && Math.abs(deg(s.aim) + 90) < 1e-6 && s.cut < 1e-6, 'straight-in shot');
  ok('a straight-in shot is found');
  const blocked = S.enumerate(cue, [...balls, { id: 9, x: W / 2, y: 550 }], [1]);
  assert(!blocked.some((x) => x.type === 'direct' && x.pocket === 1), 'blocked shot removed');
  ok('a blocker on the line removes it');
}
{ // 3. Bank paths obey angle in = angle out at the cushion.
  const rnd = S.rng(7); let k = 0;
  for (let i = 0; i < 200; i++) {
    const { cue, balls } = S.randomLayout(rnd, 3);
    for (const s of S.enumerate(cue, balls, [1, 2, 3]).filter((x) => x.type === 'bank')) {
      const [B, X, P] = s.paths[1], a = S.norm(S.sub(X, B)), b = S.norm(S.sub(P, X));
      const onLong = Math.abs(X.y - R) < 1 || Math.abs(X.y - (H - R)) < 1;
      assert(Math.abs(onLong ? a.x - b.x : a.y - b.y) < 1e-9 && Math.abs(onLong ? a.y + b.y : a.x + b.x) < 1e-9, 'bank reflection');
      k++;
    }
    for (const s of S.enumerate(cue, balls, [1, 2, 3]).filter((x) => x.type === 'bank' || x.type === 'kick')) { // a pocket's jaws are no cushion
      const X = s.type === 'bank' ? s.paths[1][1] : s.paths[0][1];
      assert(S.POCKETS.every((p) => S.dist(p, X) >= 110), `${s.type} off the jaws of a pocket`);
    }
  }
  assert(k > 50, 'banks were generated');
  ok('banks reflect angle in = angle out, and no bank or kick uses a pocket\'s jaws');
}
{ // 4. The tolerance formula agrees with an independent ray simulation of direct shots.
  const rnd = S.rng(11), sigma = 0.3 * Math.PI / 180; let diff = 0, k = 0;
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  while (k < 150) {
    const { cue, balls } = S.randomLayout(rnd, 1);
    const B = balls[0], s = S.enumerate(cue, [B], [B.id]).find((x) => x.type === 'direct');
    if (!s) continue;
    const pk = S.POCKETS[s.pocket], slack = S.slack(pk, S.norm(S.sub(pk, B)));
    let made = 0; const N = 2000;
    for (let i = 0; i < N; i++) {
      const a = s.aim + gauss() * sigma, w = { x: Math.cos(a), y: Math.sin(a) };
      const cb = S.sub(B, cue), proj = cb.x * w.x + cb.y * w.y, perp2 = cb.x * cb.x + cb.y * cb.y - proj * proj;
      if (perp2 >= 4 * R * R) continue; // missed the ball entirely
      const t = proj - Math.sqrt(4 * R * R - perp2);
      const u = S.norm(S.sub(B, { x: cue.x + w.x * t, y: cue.y + w.y * t }));
      const bp = S.sub(pk, B), off = Math.abs(bp.x * u.y - bp.y * u.x);
      if (off < slack && bp.x * u.x + bp.y * u.y > 0) made++;
    }
    diff += Math.abs(made / N - S.makeProb(s.tol, sigma)); k++;
  }
  assert(diff / k < 0.04, `tolerance formula matches simulation (gap ${(diff / k).toFixed(3)})`);
  ok('the tolerance formula matches a ray simulation');
}
{ // 5. Open table: the AI takes the group it can pot. Solids are straight in, the one stripe is frozen behind the 8.
  const cue = { id: 0, x: W / 2, y: 800 };
  const balls = [{ id: 1, x: W / 2, y: 300 }, { id: 2, x: 400, y: 300 }, { id: 9, x: 1800, y: 560 }, { id: 8, x: 1800 + 2 * R + 1, y: 560 }, { id: 10, x: 1800 - 2 * R - 1, y: 560 }, { id: 11, x: 1800, y: 560 + 2 * R + 1 }, { id: 12, x: 1800, y: 560 - 2 * R - 1 }];
  assert(S.chooseGroup(cue, balls, S.TIERS[4])[0] === 1, 'open table picks the open group');
  ok('an open table picks the group it can pot');
}
{ // 6. 9-ball: only the lowest ball may be hit first, and a combo from it onto the 9 is a candidate.
  const cue = { id: 0, x: 1900, y: 560 }, balls = [{ id: 1, x: 500, y: 560 }, { id: 9, x: 150, y: 560 - 60 }, { id: 5, x: 1000, y: 900 }];
  const shots = S.enumerate(cue, balls, S.legalFor(balls, S.NINE), S.NINE);
  assert(shots.length && shots.every((x) => x.first === 1), '9-ball: first contact is always the lowest ball');
  assert(shots.some((x) => x.type === 'combo' && x.ball === 9 && x.via === 1), '9-ball: combo on the 9 is found');
  assert(shots.every((x) => x.type !== 'combo' || x.via !== x.ball), '9-ball: a combo is two balls');
  assert(S.plan(cue, balls, S.NINE, S.TIERS[5], 1, 4, S.NINE).length > 0, '9-ball: planner runs');
  ok('9-ball: the lowest ball first, and a combo on the 9');
}
{ // 7. Pocket model: half the window a ball has, straight in and at an angle (engine measurements, critique/probe5.js A).
  const near = (a, b) => Math.abs(a - b) < 1e-9, d = (deg) => ({ x: -Math.sin(deg * Math.PI / 180), y: -Math.cos(deg * Math.PI / 180) });
  assert(near(S.slack(S.POCKETS[0], S.norm({ x: -1, y: -1 })), 32), 'corner pocket, straight in: 64 mm window');
  assert(near(S.slack(S.POCKETS[1], d(0)), 42) && near(S.slack(S.POCKETS[1], d(60)), 10), 'side pocket: 84 mm straight in, 20 mm at 60 degrees');
  assert(S.slack(S.POCKETS[1], d(75)) === 0, 'side pocket shuts at a shallow angle');
  ok('pocket windows match the engine measurements');
}
{ // 8. Stalemate guard: after two safeties in a row a tier takes its best pot.
  const rnd = S.rng(3), tier = S.TIERS[4]; let seen = 0;
  for (let i = 0; i < 400 && seen < 5; i++) {
    const { cue, balls } = S.randomLayout(rnd, 4), own = [1, 2], opp = [3, 4];
    if (S.decide(cue, balls, own, opp, tier, S.rng(i)).pick.type !== 'safety' || !S.plan(cue, balls, own, tier, 0, 4, opp).length) continue;
    seen++; assert(!['safety', 'foul'].includes(S.decide(cue, balls, own, opp, tier, S.rng(i), 2).pick.type), 'third safety in a row is refused');
  }
  assert(seen === 5, 'guard was exercised');
  ok('a third safety in a row is refused');
}
{ // Repertoire and control. Rookie plays only straight pots while it has one; Regular (ctrl 1) never picks a leave that scratches.
  const rnd = S.rng(13); let scratches = 0;
  for (let i = 0; i < 30; i++) {
    const { cue, balls } = S.randomLayout(rnd, 7), own = S.enumerate(cue, balls, S.SOLIDS);
    if (own.some((x) => x.type === 'direct')) assert(S.plan(cue, balls, S.SOLIDS, S.TIERS[0], 0, 4).every((x) => x.type === 'direct'), 'Rookie: direct only');
    const { pick } = S.decide(cue, balls, S.SOLIDS, S.STRIPES, S.TIERS[1], rnd); if (pick.leave?.scratch) scratches++;
  }
  assert.strictEqual(scratches, 0, 'Regular avoids the scratch');
  const cue = { id: 0, x: 600, y: 600 }, balls = [{ id: 1, x: 300, y: 300 }]; let followed = 0; // dead straight into the corner
  for (let i = 0; i < 40; i++) { const { pick } = S.decide(cue, balls, S.SOLIDS, S.STRIPES, S.TIERS[0], S.rng(i)); if (pick.pocket === 0 && pick.leave.scratch) followed++; }
  assert(followed > 0, 'Rookie (ctrl 0) sometimes follows the ball in');
  ok('Rookie keeps to straight pots, Regular keeps out of the pockets');
}
{ // Draw: on a dead-straight pot a stun stops dead, so a planned leave anywhere else came off the spin.
  const cue = { id: 0, x: W / 2, y: 800 }, s = S.plan(cue, [{ id: 1, x: W / 2, y: 300 }, { id: 2, x: 400, y: 800 }], S.SOLIDS, S.TIERS[5], 1, 4, S.STRIPES).find((x) => x.pocket === 1);
  assert(s.leave.spin && S.dist(s.leave, s.G) > 50, `the cue ball moves off the contact point (spin ${s.leave.spin})`);
  ok('a straight pot can draw or follow');
}
{ // Calibration in miniature (check.js runs 120 tables): one visit each from 8 random full tables. Legend thinks for
  // about 2 s here, so only Rookie, Shark and Legend play.
  const potted = [S.TIERS[0], S.TIERS[3], S.TIERS[5]].map((tier) => {
    const rnd = S.rng(42); let k = 0;
    for (let i = 0; i < 8; i++) {
      let { cue, balls } = S.randomLayout(rnd, 7);
      for (;;) {
        const { pick } = S.decide(cue, balls, S.SOLIDS, S.STRIPES, tier, rnd);
        if (pick.type === 'safety' || pick.type === 'foul' || rnd() > pick.p || pick.leave.scratch) break;
        k++; balls = balls.filter((b) => b.id !== pick.ball);
        if (pick.ball === 8) break;
        cue = { id: 0, x: pick.leave.x, y: pick.leave.y };
      }
    }
    return k;
  });
  assert(potted[2] > potted[1] && potted[1] > potted[0], `higher tiers run more balls (${potted.join(' ')})`);
  ok('higher tiers run more balls');
}
{ // Safety quality (check.js): the best pot an average player is left with is worse after each tier's chosen safety.
  for (const tier of S.TIERS.filter((t) => t.safetyAngles.length)) {
    const rnd = S.rng(9); let before = 0, after = 0;
    for (let i = 0; i < 60; i++) {
      const { cue, balls } = S.randomLayout(rnd, 4), s = S.safety(cue, balls, [1, 2, 3, 4], [9, 10, 11, 12], tier, rnd, false);
      if (!s) continue;
      before += Math.max(0, ...S.enumerate(cue, balls, [9, 10, 11, 12]).map((x) => S.makeProb(x.tol, S.SIGMA_REF)));
      after += s.oppBest;
    }
    assert(after < 0.8 * before, `${tier.name}: reply ${after.toFixed(1)} after the safety, ${before.toFixed(1)} before`);
  }
  ok('a safety makes the reply harder');
}
// A ball from `from` into ball X at spot G leaves bent off its own line by tan t = sin c cos c / (sin^2 c + 2/5 f),
// c = the cut, f = its share of natural roll: travel / slide (a struck object ball slides 150 mm; 0 = rolling from the
// start): the direction it leaves in (radians).
const rollsOff = (from, G, X, slide) => {
  const v = S.norm(S.sub(G, from)), n = S.norm(S.sub(X, G)), c = Math.acos(v.x * n.x + v.y * n.y), side = Math.sign(v.x * n.y - v.y * n.x);
  return Math.atan2(v.y, v.x) - side * Math.atan2(Math.sin(c) * Math.cos(c), Math.sin(c) ** 2 + 0.4 * Math.min(1, S.dist(G, from) / slide));
};
const heads = (from, G, X, T, slide = 0) => { const e = rollsOff(from, G, X, slide) - Math.atan2(T.y - G.y, T.x - G.x); return Math.abs(Math.atan2(Math.sin(e), Math.cos(e))) < 1e-3; };
{ // Carom: the 1 rolls into the 9 (just under the top side pocket), glances off it and drops. It meets the 9 at a spot
  // 2R from it, one each side of the 9, from which it rolls on to the pocket. A ball in either lane removes it.
  const P = S.POCKETS[1], H9 = { id: 9, x: W / 2, y: 300 };
  const carom = (O, cue, more = []) => S.enumerate(cue, [O, H9, ...more], [1]).find((x) => x.type === 'carom' && x.ball === 1 && x.pocket === 1 && x.via === 9);
  for (const side of [-1, 1]) {
    const O = { id: 1, x: W / 2 + side * 300, y: 600 }, cue = { id: 0, x: W / 2 + side * 500, y: 900 }, s = carom(O, cue);
    assert(s, `carom found on side ${side}`);
    const G2 = s.paths[1][1];
    assert(Math.abs(S.dist(G2, H9) - 2 * R) < 1e-6 && heads(O, G2, H9, P, 150) && Math.sign(G2.x - H9.x) === side, `ghost spot on side ${side}: ${JSON.stringify(G2)}`);
    assert(s.first === 1 && S.dist(s.paths[1][2], P) < 1e-6 && s.tol > 0, 'the 1 is hit first and its path ends in the pocket');
    const mid = (a, b) => ({ id: 5, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    assert(!carom(O, cue, [mid(G2, P)]) && !carom(O, cue, [mid(O, G2)]) && !carom(O, cue, [mid(cue, s.G)]), `a ball in any lane removes the carom (side ${side})`);
  }
  ok('a carom is found on both sides of the helper ball, and a ball in its lanes removes it');
}
{ // Billiard, 9-ball: the cue ball hits the 1 (the lowest) first and carries on along its tangent line into the 9, which
  // drops in the top side pocket. The cue ball meets the 1 at a spot 2R from it from which it rolls on into the 9's
  // ghost ball. A ball in the cue ball's lane from the 1 to the 9 removes it.
  const P = S.POCKETS[1], B9 = { id: 9, x: W / 2, y: 250 }, GB = { x: W / 2, y: 250 + 2 * R };
  const billiard = (A, cue, more = []) => S.enumerate(cue, [A, B9, ...more], [1], S.NINE).find((x) => x.type === 'billiard' && x.ball === 9 && x.pocket === 1 && x.first === 1);
  const A = { id: 1, x: W / 2 - 250, y: 500 }, sides = new Set();
  for (const cue of [{ id: 0, x: W / 2 - 700, y: 500 }, { id: 0, x: W / 2 - 300, y: 800 }]) { // from the left, then from below the 1
    const s = billiard(A, cue), side = s && Math.sign((s.G.x - A.x) * (GB.y - A.y) - (s.G.y - A.y) * (GB.x - A.x));
    assert(s, `billiard found from ${JSON.stringify(cue)}`); sides.add(side);
    const [, GA, at9] = s.paths[0];
    assert(S.dist(s.G, GA) < 1e-9 && Math.abs(S.dist(GA, A) - 2 * R) < 1e-6 && heads(cue, GA, A, GB) && S.dist(at9, GB) < 1e-6, `cue ball's spots on side ${side}`);
    assert(S.dist(s.paths[1][1], P) < 1e-6 && s.tol > 0, 'the 9 goes to the pocket');
    const mid = (a, b) => ({ id: 5, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    assert(!billiard(A, cue, [mid(GA, GB)]) && !billiard(A, cue, [mid(cue, GA)]), `a ball in either of the cue ball's lanes removes it (side ${side})`);
  }
  assert.strictEqual(sides.size, 2, 'the cue ball meets the 1 on either side of the line to the 9');
  ok('a billiard (hit the lowest, carry on into the 9) is found on both sides, and a ball in its lane removes it');
}
{ // Repertoire: Hustler plays a carom only off a helper ball within 60 mm of the potted ball; Shark off any; Rookie and
  // Regular never play a carom or a billiard, not even when nothing else is on.
  const H9 = { id: 9, x: W / 2, y: 300 }, cue = { id: 0, x: W / 2 - 500, y: 900 };
  const caroms = (O, tier) => S.plan(cue, [O, H9], [1], tier, 0, 1000).filter((x) => x.type === 'carom' && x.via === 9);
  const near = { id: 1, x: W / 2 - 100, y: 360 }, far = { id: 1, x: W / 2 - 100, y: 370 }; // gaps 59 and 65 mm
  assert(caroms(near, S.TIERS[2]).length && !caroms(far, S.TIERS[2]).length, 'Hustler: a carom 59 mm off the helper, none 65 mm off');
  assert(caroms(far, S.TIERS[3]).length, 'Shark: a carom 65 mm off the helper');
  const [s] = S.plan(cue, [near, H9], [1], S.TIERS[3], 1, 1000).filter((x) => x.type === 'carom');
  assert(Math.abs(s.score - s.p * (1 + S.TIERS[3].flair)) < 1e-12 && !s.leave, 'a carom gets the flair, and no planned leave (the helper moves)');
  const rnd = S.rng(17); let exotic = 0, only = 0;
  for (let i = 0; i < 300; i++) {
    const { cue, balls } = S.randomLayout(rnd, 7), all = S.enumerate(cue, balls, S.SOLIDS);
    if (!all.some((x) => x.type === 'carom' || x.type === 'billiard')) continue;
    exotic++; only += !all.some((x) => x.type === 'direct');
    const at = (id) => balls.find((b) => b.id === id);
    for (const x of all.filter((x) => x.type === 'carom')) assert(x.tol > 0 && heads(at(x.ball), x.paths[1][1], at(x.via), S.POCKETS[x.pocket], 150), 'a carom rolls off its helper into an open pocket');
    for (const x of all.filter((x) => x.type === 'billiard')) assert(x.first !== x.ball && heads(cue, x.G, at(x.first), x.paths[0][2]), 'a billiard rolls off one ball into another');
    for (const tier of S.TIERS.slice(0, 2)) assert(S.plan(cue, balls, S.SOLIDS, tier, 0, 1000).every((x) => x.type !== 'carom' && x.type !== 'billiard'), `${tier.name} plays no carom or billiard`);
  }
  assert(exotic > 20 && only > 0, `tables with a carom or billiard ${exotic}, with no direct pot ${only}`);
  ok('Hustler plays caroms off a close helper only, with the flair; Rookie and Regular never play caroms or billiards');
}
{ // The Rival's dials: a whole rating is its tier, a fraction lies on the line between two, past the ends along the end pair.
  for (let k = 1; k <= 6; k++) assert.deepStrictEqual(S.aiParams(k), S.TIERS[k - 1], `aiParams(${k}) is ${S.TIERS[k - 1].name}`);
  const near = (a, b, msg) => assert(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);
  near(S.aiParams(3.4).sigma, 0.284, '3.4 aims between Hustler and Shark'); near(S.aiParams(0.5).sigma, 0.57, '0.5 aims past Rookie');
  near(S.aiParams(6.5).sigma, 0.015, '6.5 aims past Legend');
  near(S.aiParams(2.5).planShare, 0.25, 'planning fades in: half way from Regular (0) to Hustler (0.5)'); near(S.aiParams(3.5).planShare, 0.75, 'and on to Shark (1)');
  const lo = S.aiParams(0.5), hi = S.aiParams(6.5);
  assert(lo.flair >= 0 && lo.budget >= 1 && lo.wPos === 0 && hi.wPos === 1 && hi.wLeave === 1 && hi.temp > 0 && hi.tipErr > 0, 'past the ends the dials stay in range');
  const rnd = S.rng(3), up = Array.from({ length: 400 }, () => S.aiParams(3.25, rnd).safetyAngles.length === 3).filter(Boolean).length;
  assert(up > 70 && up < 130, `whole settings come from Shark a quarter of the time (${up} of 400)`);
  assert.strictEqual(S.aiParams(3.4).name, 'Hustler', 'no draw: the nearer row');
  const r2 = S.rng(5), planned = Array.from({ length: 400 }, () => { const t = S.aiParams(2.5, r2); return t.depth ? t.planShare : 0; }).reduce((a, b) => a + b) / 400;
  near(planned, 0.25, 'turns planned at 2.5 = the share alone, not share x the depth draw');
  ok('aiParams: a rating on the tier scale gives the dials, a whole one its tier');
}
