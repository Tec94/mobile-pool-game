// Run: npm test   (the progression model: levels, pay, cues, feats, gates and the saved profile)
import assert from 'node:assert';
import { CUE } from '../physics/engine.ts';
import { CUES, specLine, specs, stick } from './cues.ts';
import { matchPay, safetyPay, shotPay } from './pay.ts';
import { cueGain, masteryLevel, masteryNote, masteryOf, readMastery, statsOf, tuneDown, tuneUp, upCost } from './mastery.ts';
import { buy, feat, featCount, gain, levelNote, levelOf, NEW, opens, PACKS, readProfile, select, unlock, VENUES } from './profile.ts';
const eq = (a, b, msg) => assert.deepStrictEqual(a, b, msg);
let n = 0; const ok = name => console.log(`ok ${++n} ${name}`);

eq(levelOf(0), { level: 1, into: 0, need: 200 }, 'a new player is level 1 with 200 XP to go');
eq(levelOf(199).level, 1, 'one short of 200 is still level 1'); eq(levelOf(200), { level: 2, into: 0, need: 250 }, '200 XP leaves level 1');
eq(levelOf(68599).level, 49, 'one short of the cap'); eq(levelOf(68600), { level: 50, into: 0, need: 0 }, '68,600 XP is the cap, level 50');
eq(levelOf(1e6).level, 50, 'XP past the cap stays level 50');
ok('levels: 200 + 50 per level to leave it, cap 50');

{ const near = (a, b, msg) => assert(Math.abs(a - b) < 0.01, `${msg}: ${a} vs ${b}`);
  const h = stick('house');
  near(h.maxSpeed, 3.88, 'House Cue top speed'); near(h.breakSpeed, 10.34, 'House Cue break'); near(h.tipLimit, 0.367, 'House Cue tip limit');
  eq([h.squirt, h.maxElev], [CUE.squirt, CUE.maxElev], 'the rest of the engine cue is kept');
  near(stick('broomstick').maxSpeed, 3.97, 'Power 4'); near(stick('wizard').tipLimit, 0.5, 'Spin 10: 0.50 R'); near(stick('twig').tipLimit, 0.33, 'Spin 1: 0.33 R');
  near(stick('golden').maxSpeed, 4.41, 'Power 9');
  near(stick('rocket').maxSpeed, 4.95, 'Rocket Liftoff: Power 10 and 10% past the cap'); near(stick('rocket').breakSpeed, 12, 'Rocket break: Power 10, Liftoff does not count');
  eq(stick('wizard').squirt, 0, 'Wizard Staff Hex: no squirt');
  eq(stick('rocket', true), h, 'matched: House Cue stats, perks off'); eq(stick('wizard', true).squirt, CUE.squirt, 'matched Wizard squirts');
  eq(Object.keys(CUES).length, 17, '17 cues'); eq(CUES.house.aim, 5, 'House Cue Aim 5');
  ok('cue stats give the engine cue');
  eq(specLine(specs('house')), 'Power: 3.88 m/s top shot, 10.3 m/s break\nSpin: tip up to 10.5 mm off centre\nAim: guide 25 cm past contact', 'House Cue in real units');
  eq(specs('rocket').shot.toFixed(2) + ' ' + specs('rocket').brk.toFixed(1), '4.95 12.0', 'Rocket: Liftoff in the shot speed');
  eq([specs('twig').guideCm, specs('periscope').guideCm], [10, 60], 'Aim 1 Short 10 cm, Aim 9 Long 60 cm');
  ok('cue stats in real units');
}

{ const pay = (pRef, more = {}) => shotPay({ pRef, ...more });
  eq(pay(0.9), { xp: 10, coins: 4 }, 'Routine direct pot: the base pay');
  eq([0.8, 0.55, 0.3, 0.12, 0.1199].map(p => pay(p).xp), [10, 15, 25, 40, 60], 'bands: Routine from .80, Solid .55, Tough .30, Brutal .12, Outrageous under');
  eq(pay(0.6, { type: 'bank' }), { xp: 19, coins: 8 }, 'Solid bank: x1.5 x1.25, rounded');
  eq([pay(0.9, { type: 'combo' }).xp, pay(0.9, { type: 'kick' }).xp], [13, 15], 'combo x1.25, kick x1.5');
  eq([1, 2, 3, 4, 5, 6].map(tier => pay(0.9, { tier }).xp), [8, 9, 10, 11, 12, 13], 'tiers Rookie .8 to Legend 1.3');
  eq(pay(0.9, { boss: 5 }).xp, 12, 'a boss of rating 5: x1.2');
  for (const tier of [0, 7, 1.5, -1]) assert.throws(() => pay(0.9, { tier }), /tier/, `tier ${tier} is a bug`);
  eq([0, 3, 7, 9].map(run => pay(0.9, { run }).xp), [10, 13, 17, 17], 'run: +10% per pot in a row, at most +70%');
  eq(pay(0.9, { cue: 'twig' }).xp, 15, 'Twig: x1.5'); eq(pay(0.9, { cue: 'rocket' }).xp, 10, 'other cues: x1');
  eq(pay(0.05, { type: 'kick', tier: 6, run: 7, cue: 'twig' }), { xp: 120, coins: 48 }, 'all multipliers together: at most x12');
  eq(pay(null, { type: 'kick' }).xp, 10, 'a fluke pays as Routine'); eq(pay(0.05, { brk: true }).xp, 10, 'a break pot pays as Routine');
  eq(pay(0.05, { type: 'bank', hand: true }).xp, 15, 'first shot after ball in hand: at most Solid, no type x'); eq(pay(0.9, { hand: true }).xp, 10, 'ball in hand keeps a lower band');
  eq(pay(0.05, { foul: true }), { xp: 0, coins: 0 }, 'a foul pot pays nothing'); eq(pay(0.05, { theirs: true }), { xp: 0, coins: 0 }, 'the opponent\'s ball pays nothing');
  ok('shot pay');
}

{ const good = { legal: true, potted: false, push: false, hand: false, hardLeave: true, oppPotted: false, paidThisGame: 0 };
  eq(safetyPay(good), { xp: 25, coins: 10 }, 'a good safety pays as Tough');
  eq(safetyPay({ ...good, tier: 6 }).xp, 33, 'the tier counts'); eq(safetyPay({ ...good, cue: 'twig' }).xp, 38, 'the Twig counts');
  for (const [k, v] of [['legal', false], ['potted', true], ['push', true], ['hand', true], ['hardLeave', false], ['oppPotted', true], ['paidThisGame', 2]])
    eq(safetyPay({ ...good, [k]: v }), { xp: 0, coins: 0 }, `no pay when ${k} is ${v}`);
  eq(safetyPay({ ...good, paidThisGame: 1 }).xp, 25, 'the second safety of a game still pays');
  ok('safety pay: Tough, at most 2 a game');
}
{ eq(matchPay({ tier: 3, won: true, fouls: 1 }), { xp: 180, coins: 120 }, 'a win: 60 and 40 a tier');
  eq(matchPay({ tier: 3, won: true, fouls: 0 }), { xp: 216, coins: 144 }, 'a win with no fouls: +20%');
  eq(matchPay({ tier: 2, won: false, ownPotted: 7, fouls: 0 }), { xp: 40, coins: 20 }, 'a loss with all 7 down: 20 and 10 a tier');
  eq(matchPay({ tier: 2, won: false, ownPotted: 3, fouls: 2 }), { xp: 17, coins: 9 }, 'a loss pays for the share of own balls potted');
  eq(matchPay({ tier: 2, won: false, ownPotted: 9, fouls: 0 }).xp, 40, 'at most 7 own balls count');
  eq(matchPay({ tier: 6, won: false, ownPotted: 6, fouls: 0, early: true }), { xp: 0, coins: 0 }, 'early 8, concede or quit: nothing');
  ok('match pay vs AI');
}

{ eq(NEW, { xp: 0, coins: 0, owned: ['house'], cue: 'house', feats: {}, mastery: {}, rival: { 8: { rating: 1, matches: 0 }, 9: { rating: 1, matches: 0 } } }, 'a new profile: House Cue, nothing else');
  eq(gain(NEW, { xp: 40, coins: 20 }), { profile: { ...NEW, xp: 40, coins: 20 }, from: 1, to: 1, bonus: 0 }, 'pay adds up');
  eq(gain({ ...NEW, xp: 190 }, { xp: 40, coins: 20 }), { profile: { ...NEW, xp: 230, coins: 90 }, from: 1, to: 2, bonus: 70 }, 'a level-up pays 50 + 10 x the new level');
  eq(gain(NEW, { xp: 450, coins: 0 }).bonus, 150, 'two level-ups pay both');
  const at19 = { ...NEW, xp: 11250 }; eq(levelOf(at19.xp).level, 19, '11,250 XP is level 19');
  eq(gain(at19, { xp: 1100, coins: 0 }).profile.owned, ['house', 'twig'], 'level 20 gives the Twig');
  eq(gain({ ...at19, owned: ['house', 'twig'] }, { xp: 1100, coins: 0 }).profile.owned, ['house', 'twig'], 'once');
  eq(gain(NEW, { xp: 0, coins: 0 }).profile === NEW, false, 'the old profile is not changed'); eq(NEW.xp, 0, 'NEW stays new');
  eq(levelNote(gain(NEW, { xp: 40, coins: 0 })), 'Level 1 · 40/200 XP', 'no level-up: the level and the XP into it');
  eq(levelNote(gain({ ...NEW, xp: 190 }, { xp: 40, coins: 0 })), 'Level 2! +70 coins · 30/250 XP', 'a level-up on the same line');
  eq(levelNote(gain(at19, { xp: 1100, coins: 0 })), 'Level 20! +250 coins · Twig unlocked', 'level 20 says the Twig is unlocked');
  eq(levelNote(gain({ ...NEW, xp: 68500 }, { xp: 100, coins: 0 })), 'Level 50! +550 coins', 'the cap has no XP to go');
  eq(levelNote(gain({ ...NEW, xp: 68600 }, { xp: 40, coins: 0 })), 'Level 50', 'nor after it');
  ok('pay and level-ups');
}
{ const rich = { ...NEW, coins: 1000 };
  eq(buy(rich, 'baguette'), { ...rich, coins: 100, owned: ['house', 'baguette'] }, 'buying costs the price');
  eq(buy({ ...rich, coins: 899 }, 'baguette').coins, 899, 'not enough coins: no sale'); eq(buy({ ...rich, coins: 900 }, 'baguette').coins, 0, 'the last coin buys it');
  eq(buy({ ...rich, owned: ['house', 'baguette'] }, 'baguette').coins, 1000, 'an owned cue is not sold again');
  eq(buy(rich, 'crowbar'), rich, 'a feat cue has no price'); eq(buy({ ...NEW, coins: 1e5 }, 'golden').coins, 1e5, 'nor the Golden Cue');
  eq(select(rich, 'baguette'), rich, 'a cue not owned cannot be selected');
  eq(select({ ...rich, owned: ['house', 'baguette'] }, 'baguette').cue, 'baguette', 'an owned one can');
  eq(select(rich, 'house') === rich, true, 'the cue in use: the same profile, nothing to save');
  eq(unlock(NEW, 'pencil').owned, ['house', 'pencil'], 'unlock gives a cue'); eq(NEW.owned, ['house'], 'and leaves the old profile');
  const pen = unlock(NEW, 'pencil'); eq(unlock(pen, 'pencil') === pen, true, 'an owned cue: the same profile, nothing to save');
  ok('buying, selecting and unlocking');
}
{ let p = NEW;
  for (let i = 0; i < 49; i++) p = feat(p, 'bank');
  eq([featCount(p, 'bank'), p.owned], [49, ['house']], '49 banks of 50');
  p = feat(p, 'bank'); eq([featCount(p, 'bank'), p.owned], [50, ['house', 'crowbar']], 'the 50th gives the Crowbar');
  p = feat(p, 'bank'); eq([featCount(p, 'bank'), p.owned], [50, ['house', 'crowbar']], 'the count stops at 50, the cue is given once');
  p = feat(NEW, 'long', 25); eq(p.coins, 300, 'Long Shot pays 300 coins'); eq(feat(p, 'long').coins, 300, 'once');
  p = feat(NEW, 'kick', 15, true); eq([featCount(p, 'kick'), p.owned], [7, ['house']], 'scenarios give at most half of Kick Start (7 of 15)');
  p = feat(p, 'kick', 8); eq(p.owned, ['house', 'periscope'], 'play makes up the rest');
  eq(featCount(feat(NEW, 'giant', 1, true), 'giant'), 0, 'Giant Killer cannot come from a scenario');
  const lost = { ...NEW, feats: { bank: { play: 50, scen: 0 } } };
  eq(feat(lost, 'bank').owned, ['house', 'crowbar'], 'a count reached with its cue missing gives the cue');
  eq(feat(feat(lost, 'bank'), 'bank').owned, ['house', 'crowbar'], 'still once');
  eq(feat({ ...NEW, coins: 300, feats: { long: { play: 25, scen: 0 } } }, 'long').coins, 300, 'coins are not paid again');
  ok('feats');
}

{ eq(opens(PACKS, 1), ['Pots'], 'level 1: Pots'); eq(opens(PACKS, 10), ['Pots', 'Cut shots', 'Banks', 'Position', '9-ball'], 'level 10');
  eq(opens(PACKS, 22).length, 9, 'level 22: all nine packs');
  eq(opens(VENUES, 0), ['Garage'], 'no stars: the Garage'); eq(opens(VENUES, 28), ['Garage', 'Corner Bar', 'Social Club'], '28 stars');
  eq(opens(VENUES, 52).at(-1), 'Penthouse', '52 stars: the Penthouse');
  ok('gates: packs by level, venues by stars');
}

{ for (const t of [null, '{oops', '[1,2]', '"x"', 'null', '7']) eq(readProfile(t), NEW, `${t}: a new profile`);
  readProfile(null).owned.push('x'); eq(NEW.owned, ['house'], 'the new profile is not shared');
  const all = { xp: 12345, coins: 678, owned: ['house', 'baguette', 'twig'], cue: 'baguette', feats: { bank: { play: 12, scen: 3 }, long: { play: 25, scen: 0 } }, mastery: { baguette: { xp: 1200, power: 1, spin: 1, aim: 0, paid: 2 } }, rival: { 8: { rating: 3.4, matches: 12 }, 9: { rating: 1.6, matches: 2 } } };
  eq(readProfile(JSON.stringify(all)), all, 'a good save round trips');
  eq(readProfile(JSON.stringify({ coins: 5 })), { ...NEW, coins: 5 }, 'an older save keeps what it has');
  ok('a missing, damaged or good save');
}
{ const p = readProfile(JSON.stringify({ xp: -5, coins: 'lots', owned: ['twig', 'laser', 'twig', 7], cue: 'golden', feats: { bank: { play: 2.7, scen: -1 }, storm: { play: 3 }, kick: 'x' }, extra: 1 }));
  eq(p, { xp: 0, coins: 0, owned: ['house', 'twig'], cue: 'house', feats: { bank: { play: 2, scen: 0 } }, mastery: {}, rival: NEW.rival }, 'bad values take their defaults, unknown cues and feats are dropped, House Cue is always owned');
  eq(readProfile(JSON.stringify({ owned: [], cue: 'house' })).owned, ['house'], 'House Cue cannot be lost');
  eq(readProfile(JSON.stringify({ owned: 'house', cue: 'twig' })).cue, 'house', 'a selected cue that is not owned: House Cue');
  eq(readProfile(JSON.stringify({ xp: 1e300, coins: Infinity })).xp, 1e9, 'numbers are clamped');
  eq(readProfile('{"coins": 1e999}').coins, 1e9, 'even past what JSON can hold');
  eq(readProfile(JSON.stringify({ xp: 12350 })).owned, ['house', 'twig'], 'level 20 owns the Twig');
  eq(readProfile(JSON.stringify({ xp: 12349 })).owned, ['house'], 'level 19 does not');
  ok('bad values in a save');
}

{ eq([0, 299, 300, 999, 1000, 2500, 4999, 5000, 1e6].map(x => masteryLevel(x).level), [1, 1, 2, 2, 3, 4, 4, 5, 5], 'mastery levels at 300, 1,000, 2,500, 5,000 cue XP');
  eq(masteryLevel(400), { level: 2, into: 100, need: 700 }, 'cue XP into a level'); eq(masteryLevel(5000).need, 0, 'level 5 is the top');
  const g = cueGain(NEW, 'house', 320); eq([g.from, g.to, masteryOf(g.profile, 'house').xp], [1, 2, 320], 'cue XP adds up');
  eq(masteryNote('house', g), 'House Cue mastery 2: tuning point earned', 'a level-up line'); eq(masteryNote('rod', { from: 4, to: 5 }), 'Fishing Rod mastery 5, mastered: tuning point earned', 'mastered');
  eq(masteryNote('house', { from: 1, to: 3 }), 'House Cue mastery 3: 2 tuning points earned', 'two levels at once');
  eq(masteryNote('twig', { from: 1, to: 2 }), 'Twig mastery 2', 'the Twig earns no point'); eq(masteryNote('house', { from: 2, to: 2 }), '', 'no level-up, no line'); eq(cueGain(NEW, 'house', 0).profile, NEW, 'no XP, same profile');
  ok('cue mastery: XP and levels');
}
{ const lvl = (xp, coins = 10000, id = 'house', owned = ['house', id]) => ({ ...NEW, coins, owned, mastery: { [id]: { ...masteryOf(NEW, id), xp } } });
  const p1 = lvl(300);
  eq(upCost(NEW, 'house', 'power'), null, 'mastery 1: no point'); eq(upCost(p1, 'house', 'power'), 300, 'the 1st point costs 300');
  const a = tuneUp(p1, 'house', 'power'); eq([a.coins, masteryOf(a, 'house').power, masteryOf(a, 'house').paid], [9700, 1, 1], 'a point bought');
  eq(tuneUp(a, 'house', 'spin'), a, 'one point at mastery 2'); eq(statsOf('house', masteryOf(a, 'house')), { power: 4, spin: 3, aim: 5 }, 'tuned stats');
  const b = tuneUp(tuneDown(a, 'house', 'power'), 'house', 'spin'); eq([b.coins, masteryOf(b, 'house').spin, masteryOf(b, 'house').power], [9700, 1, 0], 'moving a point is free');
  const p5 = lvl(5000); let q = p5; for (const s of ['power', 'power', 'spin', 'aim']) q = tuneUp(q, 'house', s);
  eq(q.coins, 10000 - 300 - 600 - 1200 - 2400, '4 steps: 300, 600, 1,200, 2,400'); eq(upCost(q, 'house', 'spin'), null, 'all 4 points in use');
  eq(upCost(tuneDown(q, 'house', 'aim'), 'house', 'power'), null, 'at most +2 a stat');
  eq(tuneUp(lvl(300, 299), 'house', 'power').coins, 299, 'too few coins: nothing');
  eq(upCost(lvl(5000, 1e4, 'twig'), 'twig', 'power'), null, 'the Twig cannot be tuned');
  eq(upCost(lvl(5000, 1e4, 'rocket'), 'rocket', 'power'), null, 'no stat above 10'); eq(upCost(lvl(5000, 1e4, 'golden'), 'golden', 'spin'), 300, 'Golden 9 takes +1');
  eq(upCost(lvl(5000, 1e4, 'rod', ['house']), 'rod', 'spin'), null, 'a cue not owned');
  const t = statsOf('broomstick', { xp: 0, power: 2, spin: 0, aim: 2, paid: 2 }); eq(stick('broomstick', false, t).maxSpeed, stick('crowbar').maxSpeed, 'tuned Power 6 hits like a Power 6 cue');
  eq(stick('broomstick', true, t), stick('house'), 'matched ignores tuning'); eq(specs('house', { power: 3, spin: 3, aim: 7 }).guideCm, 60, 'tuned Aim 7: Long guide');
  ok('tuning: points, coins, caps, free moves');
}
{ const m = readMastery({ house: { xp: 1000, power: 1, spin: 1, aim: 0, paid: 2 }, twig: { xp: 50, power: 1, paid: 1 }, rocket: { xp: 5000, power: 1, paid: 1 }, bogus: { xp: 5 }, broomstick: { xp: 300, power: 1, spin: 1, paid: 2 }, noodle: 'x' });
  eq(m.house, { xp: 1000, power: 1, spin: 1, aim: 0, paid: 2 }, 'a good record stays'); eq(m.twig, { xp: 50, power: 0, spin: 0, aim: 0, paid: 0 }, 'the Twig loses points');
  eq(m.rocket.power, 0, 'past 10: points off'); eq(m.broomstick, { xp: 300, power: 0, spin: 0, aim: 0, paid: 1 }, 'more points than the level: points off, XP kept, paid at most the points');
  eq(['bogus', 'noodle'].map(k => k in m), [false, false], 'unknown cues and bad records dropped');
  eq(readMastery({ house: { xp: -5, power: 9, paid: 99 } }).house, { xp: 0, power: 0, spin: 0, aim: 0, paid: 0 }, 'out of range numbers fixed');
  eq(readMastery({ house: { xp: 1000, paid: 4 } }).house.paid, 2, 'no more paid steps than the level has points');
  eq(readProfile(JSON.stringify({ mastery: { house: { xp: 300, power: 1, paid: 1 } } })).mastery.house.power, 1, 'mastery is read with the profile');
  eq(readProfile(null).mastery, {}, 'no save: no mastery');
  ok('a saved mastery is read defensively');
}
