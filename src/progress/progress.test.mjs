// Run: npm test   (the progression model: levels, pay, cues, feats, gates and the saved profile)
import assert from 'node:assert';
import { CUE } from '../physics/engine.ts';
import { CUES, stick } from './cues.ts';
import { matchPay, safetyPay, shotPay } from './pay.ts';
import { buy, feat, featCount, gain, levelOf, NEW, opens, PACKS, select, VENUES } from './profile.ts';
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
  near(stick('rocket').maxSpeed, 4.95, 'Rocket Liftoff: Power 10 and 10% past the cap'); near(stick('rocket').breakSpeed, 13.2, 'Rocket break');
  eq(stick('wizard').squirt, 0, 'Wizard Staff Hex: no squirt');
  eq(stick('rocket', true), h, 'matched: House Cue stats, perks off'); eq(stick('wizard', true).squirt, CUE.squirt, 'matched Wizard squirts');
  eq(Object.keys(CUES).length, 17, '17 cues'); eq(CUES.house.aim, 5, 'House Cue Aim 5');
  ok('cue stats give the engine cue');
}

{ const pay = (pRef, more = {}) => shotPay({ pRef, ...more });
  eq(pay(0.9), { xp: 10, coins: 4 }, 'Routine direct pot: the base pay');
  eq([0.8, 0.55, 0.3, 0.12, 0.1199].map(p => pay(p).xp), [10, 15, 25, 40, 60], 'bands: Routine from .80, Solid .55, Tough .30, Brutal .12, Outrageous under');
  eq(pay(0.6, { type: 'bank' }), { xp: 19, coins: 8 }, 'Solid bank: x1.5 x1.25, rounded');
  eq([pay(0.9, { type: 'combo' }).xp, pay(0.9, { type: 'kick' }).xp], [13, 15], 'combo x1.25, kick x1.5');
  eq([1, 2, 3, 4, 5, 6].map(tier => pay(0.9, { tier }).xp), [8, 9, 10, 11, 12, 13], 'tiers Rookie .8 to Legend 1.3');
  eq(pay(0.9, { boss: 5 }).xp, 12, 'a boss of rating 5: x1.2');
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

{ eq(NEW, { xp: 0, coins: 0, owned: ['house'], cue: 'house', feats: {} }, 'a new profile: House Cue, nothing else');
  eq(gain(NEW, { xp: 40, coins: 20 }), { profile: { ...NEW, xp: 40, coins: 20 }, from: 1, to: 1, bonus: 0 }, 'pay adds up');
  eq(gain({ ...NEW, xp: 190 }, { xp: 40, coins: 20 }), { profile: { ...NEW, xp: 230, coins: 90 }, from: 1, to: 2, bonus: 70 }, 'a level-up pays 50 + 10 x the new level');
  eq(gain(NEW, { xp: 450, coins: 0 }).bonus, 150, 'two level-ups pay both');
  const at19 = { ...NEW, xp: 11250 }; eq(levelOf(at19.xp).level, 19, '11,250 XP is level 19');
  eq(gain(at19, { xp: 1100, coins: 0 }).profile.owned, ['house', 'twig'], 'level 20 gives the Twig');
  eq(gain({ ...at19, owned: ['house', 'twig'] }, { xp: 1100, coins: 0 }).profile.owned, ['house', 'twig'], 'once');
  eq(gain(NEW, { xp: 0, coins: 0 }).profile === NEW, false, 'the old profile is not changed'); eq(NEW.xp, 0, 'NEW stays new');
  ok('pay and level-ups');
}
{ const rich = { ...NEW, coins: 1000 };
  eq(buy(rich, 'baguette'), { ...rich, coins: 100, owned: ['house', 'baguette'] }, 'buying costs the price');
  eq(buy({ ...rich, coins: 899 }, 'baguette').coins, 899, 'not enough coins: no sale'); eq(buy({ ...rich, coins: 900 }, 'baguette').coins, 0, 'the last coin buys it');
  eq(buy({ ...rich, owned: ['house', 'baguette'] }, 'baguette').coins, 1000, 'an owned cue is not sold again');
  eq(buy(rich, 'crowbar'), rich, 'a feat cue has no price'); eq(buy({ ...NEW, coins: 1e5 }, 'golden').coins, 1e5, 'nor the Golden Cue');
  eq(select(rich, 'baguette'), rich, 'a cue not owned cannot be selected');
  eq(select({ ...rich, owned: ['house', 'baguette'] }, 'baguette').cue, 'baguette', 'an owned one can');
  ok('buying and selecting');
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
  ok('feats');
}

{ eq(opens(PACKS, 1), ['Pots'], 'level 1: Pots'); eq(opens(PACKS, 10), ['Pots', 'Cut shots', 'Banks', 'Position', '9-ball'], 'level 10');
  eq(opens(PACKS, 22).length, 9, 'level 22: all nine packs');
  eq(opens(VENUES, 0), ['Garage'], 'no stars: the Garage'); eq(opens(VENUES, 28), ['Garage', 'Corner Bar', 'Social Club'], '28 stars');
  eq(opens(VENUES, 52).at(-1), 'Penthouse', '52 stars: the Penthouse');
  ok('gates: packs by level, venues by stars');
}
