// Run: npm test   (the progression model: levels, pay, cues, feats, gates and the saved profile)
import assert from 'node:assert';
import { CUE } from '../physics/engine.ts';
import { afterSoft, auraLine, mog, mogLead, mogLine, newSoft, noteSunk, notch, overdrive, ramOwes, ratchet, softCan, softHands, softLine, STEPS } from './tricks.ts';
import { judge, newGame, newRec } from '../rules/rules.ts';
import { CUE_IDS, CUES, soon, specLine, specs, stick } from './cues.ts';
import { hustler, matchFeats, matchPay, newLedger, noteShot, rackOver, safetyPay, settle, shotPay } from './pay.ts';
import { cueGain, cueStats, masteryLevel, masteryNote, masteryOf, maxStats, nextPick, readMastery, statsOf, tuneDown, tuneUp, upCost } from './mastery.ts';
import { buy, feat, featCount, featName, FEATS, gain, levelNote, levelOf, matchEnd, NEW, opens, PACKS, passPlay, readProfile, runOwe, select, unlock, VENUES } from './profile.ts';
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
  near(stick('ratchet').maxSpeed, 4.06, 'Power 5'); near(stick('marquise').tipLimit, 0.5, 'Spin 10: 0.50 R'); near(stick('twig').tipLimit, 0.33, 'Spin 1: 0.33 R');
  near(stick('heirloom').maxSpeed, 4.41, 'Power 9');
  near(stick('ram').maxSpeed, 4.5, 'Power 10: the cap'); near(stick('ram').breakSpeed, 12, 'Power 10 break');
  eq(stick('marquise').squirt, 0, 'Marquise: no squirt');
  // the tricks of the stick act in a match against the AI only (on), and never for a matched game
  near(stick('ironwood', false, undefined, true).breakSpeed / stick('ironwood').breakSpeed, 1.2, 'Ironwood: the break 20% faster in a match');
  eq([stick('ironwood', false, undefined, true).maxSpeed, stick('ironwood', true, undefined, true).breakSpeed], [stick('ironwood').maxSpeed, stick('house').breakSpeed], 'the shot speed stays, and a matched game has no trick');
  eq([stick('marquise', false, undefined, true).minElev, stick('marquise').minElev, stick('coil', false, undefined, true).curl, stick('coil').curl], [0, CUE.minElev, 1.5, undefined], 'Marquise: dead flat; Coil: curl 1.5; neither outside a match');
  eq(stick('ram', true), h, 'matched: House Cue stats, tricks off'); eq(stick('marquise', true).squirt, CUE.squirt, 'a matched Marquise squirts');
  eq(Object.keys(CUES).length, 26, '26 cues'); eq(CUES.house.aim, 5, 'House Cue Aim 5');
  for (const id of CUE_IDS) { const c = CUES[id]; assert([c.price !== undefined, !!c.feat, !!c.level, !!c.get, id === 'house'].filter(Boolean).length === 1, `${id}: one way to get it`); assert(!c.feat || FEATS[c.feat]?.cue === id, `${id}: its feat gives it`); }
  eq(CUE_IDS.filter(id => CUES[id].price !== undefined).reduce((a, id) => a + CUES[id].price, 0), 23100, 'the six coin cues cost 23,100');
  eq([soon('surveyor'), soon('twig'), soon('house'), soon('airbrake')], [false, false, false, true], 'a trick that does not act yet is marked Soon; the House Cue has none');
  ok('cue stats give the engine cue');
  eq(specLine(specs('house')), 'Power: 3.88 m/s top shot, 10.3 m/s break\nSpin: tip up to 10.5 mm off centre\nAim: guide 32 cm past contact', 'House Cue in real units');
  eq(specs('ram').shot.toFixed(2) + ' ' + specs('ram').brk.toFixed(1), '4.50 12.0', 'Ram: Power 10');
  eq([specs('twig').guideCm, specs('heirloom').guideCm], [10, 54], 'Aim 1: 10 cm, Aim 9: 54 cm'); eq(specs('surveyor').guideCm, 27, 'Surveyor: 15% off the 32 cm of Aim 5');
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
  eq(pay(0.9, { cue: 'twig' }).xp, 15, 'Twig: x1.5'); eq(pay(0.9, { cue: 'ram' }).xp, 10, 'other cues: x1');
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

{ eq(NEW, { xp: 0, coins: 0, owned: ['house'], cue: 'house', feats: {}, mastery: {}, rival: { 8: { rating: 1, matches: 0 }, 9: { rating: 1, matches: 0 } }, trophies: [0, 0, 0, 0] }, 'a new profile: House Cue, nothing else');
  eq(gain(NEW, { xp: 40, coins: 20 }), { profile: { ...NEW, xp: 40, coins: 20 }, from: 1, to: 1, bonus: 0 }, 'pay adds up');
  eq(gain({ ...NEW, xp: 190 }, { xp: 40, coins: 20 }), { profile: { ...NEW, xp: 230, coins: 90 }, from: 1, to: 2, bonus: 70 }, 'a level-up pays 50 + 10 x the new level');
  eq(gain(NEW, { xp: 450, coins: 0 }).bonus, 150, 'two level-ups pay both');
  const at19 = { ...NEW, xp: 11250 }; eq(levelOf(at19.xp).level, 19, '11,250 XP is level 19');
  eq(gain({ ...at19, owned: ['house', 'ratchet', 'optic'] }, { xp: 1100, coins: 0 }).profile.owned, ['house', 'ratchet', 'optic', 'twig'], 'level 20 gives the Twig');
  eq(gain({ ...at19, owned: ['house', 'ratchet', 'optic', 'twig'] }, { xp: 1100, coins: 0 }).profile.owned, ['house', 'ratchet', 'optic', 'twig'], 'once');
  eq(gain(NEW, { xp: 44850, coins: 0 }).profile.owned, ['house', 'ratchet', 'gyro', 'optic', 'airbrake', 'twig'], 'a level cue belongs to anyone at or past its level: 8, 14, 20, 28, 40');
  eq(gain(NEW, { xp: 2449, coins: 0 }).profile.owned, ['house'], 'level 7: none yet'); eq(levelNote(gain(NEW, { xp: 2450, coins: 0 })).split(' · ')[1], 'Ratchet unlocked', 'level 8 says the Ratchet is unlocked');
  eq(gain(NEW, { xp: 0, coins: 0 }).profile === NEW, false, 'the old profile is not changed'); eq(NEW.xp, 0, 'NEW stays new');
  eq(levelNote(gain(NEW, { xp: 40, coins: 0 })), 'Level 1 · 40/200 XP', 'no level-up: the level and the XP into it');
  eq(levelNote(gain({ ...NEW, xp: 190 }, { xp: 40, coins: 0 })), 'Level 2! +70 coins · 30/250 XP', 'a level-up on the same line');
  eq(levelNote(gain(at19, { xp: 1100, coins: 0 })), 'Level 20! +250 coins · Twig unlocked', 'level 20 says the Twig is unlocked');
  eq(levelNote(gain({ ...NEW, xp: 68500 }, { xp: 100, coins: 0 })), 'Level 50! +550 coins', 'the cap has no XP to go');
  eq(levelNote(gain({ ...NEW, xp: 68600 }, { xp: 40, coins: 0 })), 'Level 50', 'nor after it');
  ok('pay and level-ups');
}
{ const rich = { ...NEW, coins: 1000 };
  eq(buy(rich, 'ironwood'), { ...rich, coins: 400, owned: ['house', 'ironwood'] }, 'buying costs the price');
  eq(buy({ ...rich, coins: 599 }, 'ironwood').coins, 599, 'not enough coins: no sale'); eq(buy({ ...rich, coins: 600 }, 'ironwood').coins, 0, 'the last coin buys it');
  eq(buy({ ...rich, owned: ['house', 'ironwood'] }, 'ironwood').coins, 1000, 'an owned cue is not sold again');
  eq(buy(rich, 'banker'), rich, 'a feat cue has no price'); eq(buy({ ...NEW, coins: 1e5 }, 'heirloom').coins, 1e5, 'nor the Heirloom');
  eq(select(rich, 'ironwood'), rich, 'a cue not owned cannot be selected');
  eq(select({ ...rich, owned: ['house', 'ironwood'] }, 'ironwood').cue, 'ironwood', 'an owned one can');
  eq(select(rich, 'house') === rich, true, 'the cue in use: the same profile, nothing to save');
  eq(unlock(NEW, 'surveyor').owned, ['house', 'surveyor'], 'unlock gives a cue'); eq(NEW.owned, ['house'], 'and leaves the old profile');
  const pen = unlock(NEW, 'surveyor'); eq(unlock(pen, 'surveyor') === pen, true, 'an owned cue: the same profile, nothing to save');
  ok('buying, selecting and unlocking');
}
{ let p = NEW;
  for (let i = 0; i < 29; i++) p = feat(p, 'bank');
  eq([featCount(p, 'bank'), p.owned], [29, ['house']], '29 banks of 30');
  p = feat(p, 'bank'); eq([featCount(p, 'bank'), p.owned], [30, ['house', 'banker']], 'the 30th gives the Banker');
  p = feat(p, 'bank'); eq([featCount(p, 'bank'), p.owned], [30, ['house', 'banker']], 'the count stops at 30, the cue is given once');
  p = feat(NEW, 'reel', 25); eq([p.coins, p.owned], [500, ['house']], 'Reel It In pays 500 coins and gives no cue');
  eq(Object.entries({ purist: 'nonchalant', escape: 'star', lives: 'hindsight', spin: 'coil', legend: 'daybreak', thirteen: 'sixseven', heater: 'aura', unbeaten: 'marble' }).map(([f, c]) => feat(NEW, f, FEATS[f].count).owned[1] === c), Array(8).fill(true), 'the feats that give cues');
  p = feat(NEW, 'long', 25); eq(p.coins, 300, 'Long Shot pays 300 coins'); eq(feat(p, 'long').coins, 300, 'once');
  p = feat(NEW, 'kick', 15, true); eq([featCount(p, 'kick'), p.owned], [7, ['house']], 'scenarios give at most half of Kick Start (7 of 15)');
  p = feat(p, 'kick', 8); eq(p.owned, ['house', 'vernier'], 'play makes up the rest');
  eq(featCount(feat(NEW, 'giant', 1, true), 'giant'), 0, 'Giant Killer cannot come from a scenario');
  const lost = { ...NEW, feats: { bank: { play: 30, scen: 0 } } };
  eq(feat(lost, 'bank').owned, ['house', 'banker'], 'a count reached with its cue missing gives the cue');
  eq(feat(feat(lost, 'bank'), 'bank').owned, ['house', 'banker'], 'still once');
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
  const all = { xp: 12345, coins: 678, owned: ['house', 'ironwood', 'ratchet', 'optic', 'twig'], cue: 'ironwood', feats: { bank: { play: 12, scen: 3 }, long: { play: 25, scen: 0 } }, mastery: { ironwood: { xp: 1200, power: 1, spin: 0, aim: 1, paid: 2 } }, rival: { 8: { rating: 3.4, matches: 12 }, 9: { rating: 1.6, matches: 2 } }, trophies: [3, 2, 0, 1] };
  eq(readProfile(JSON.stringify(all)), all, 'a good save round trips');
  eq(readProfile(JSON.stringify({ ...all, trophies: [4, -1, 'x'] })).trophies, [0, 0, 0, 0], 'a bad medal is none');
  eq(readProfile(JSON.stringify({ coins: 5 })), { ...NEW, coins: 5 }, 'an older save keeps what it has');
  ok('a missing, damaged or good save');
}
{ const p = readProfile(JSON.stringify({ xp: -5, coins: 'lots', owned: ['twig', 'laser', 'twig', 7], cue: 'golden', feats: { bank: { play: 2.7, scen: -1 }, storm: { play: 3 }, kick: 'x' }, extra: 1 }));
  eq(p, { xp: 0, coins: 0, owned: ['house', 'twig'], cue: 'house', feats: { bank: { play: 2, scen: 0 } }, mastery: {}, rival: NEW.rival, trophies: [0, 0, 0, 0] }, 'bad values take their defaults, unknown cues and feats are dropped, House Cue is always owned');
  eq(readProfile(JSON.stringify({ owned: [], cue: 'house' })).owned, ['house'], 'House Cue cannot be lost');
  eq(readProfile(JSON.stringify({ owned: 'house', cue: 'twig' })).cue, 'house', 'a selected cue that is not owned: House Cue');
  eq(readProfile(JSON.stringify({ xp: 1e300, coins: Infinity })).xp, 1e9, 'numbers are clamped');
  eq(readProfile('{"coins": 1e999}').coins, 1e9, 'even past what JSON can hold');
  eq(readProfile(JSON.stringify({ xp: 12350 })).owned, ['house', 'ratchet', 'optic', 'twig'], 'level 20 owns the Twig and the cues of the levels before');
  eq(readProfile(JSON.stringify({ xp: 12349 })).owned, ['house', 'ratchet', 'optic'], 'level 19 does not own the Twig');
  eq(readProfile(JSON.stringify({ feats: { spin: { play: 75, scen: 0 } } })).owned, ['house', 'coil'], 'a feat that is already full gives its new cue');
  eq(readProfile(JSON.stringify({ feats: { spin: { play: 74, scen: 0 } } })).owned, ['house'], 'one short does not');
  ok('bad values in a save');
}

{ eq([0, 299, 300, 999, 1000, 2500, 4999, 5000, 1e6].map(x => masteryLevel(x).level), [1, 1, 2, 2, 3, 4, 4, 5, 5], 'mastery levels at 300, 1,000, 2,500, 5,000 cue XP');
  eq(masteryLevel(400), { level: 2, into: 100, need: 700 }, 'cue XP into a level'); eq(masteryLevel(5000).need, 0, 'level 5 is the top');
  const g = cueGain(NEW, 'house', 320); eq([g.from, g.to, masteryOf(g.profile, 'house').xp], [1, 2, 320], 'cue XP adds up');
  eq(masteryNote('house', g), 'House Cue mastery 2: tuning point earned', 'a level-up line'); eq(masteryNote('banker', { from: 4, to: 5 }), 'Banker mastery 5, mastered: tuning point earned', 'mastered');
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
  eq(upCost(lvl(5000, 1e4, 'ram'), 'ram', 'power'), null, 'no stat above 10'); eq(upCost(lvl(5000, 1e4, 'coil'), 'coil', 'spin'), 300, 'Spin 9 takes +1');
  eq(upCost(lvl(5000, 1e4, 'banker', ['house']), 'banker', 'power'), null, 'a cue not owned');
  eq([upCost(lvl(5000, 1e4, 'ironwood'), 'ironwood', 'spin'), upCost(lvl(5000, 1e4, 'ironwood'), 'ironwood', 'power')], [null, 300], 'a locked stat takes no point, the others do');
  eq(['heirloom', 'marble', 'maxxed'].map(id => upCost(lvl(5000, 1e4, id), id, 'power')), [null, null, null], 'the Heirloom, the Marble and the Maxxed take no tuning');
  const t = statsOf('ratchet', { xp: 0, power: 2, spin: 0, aim: 2, paid: 2 }); eq(stick('ratchet', false, t).maxSpeed, stick('star').maxSpeed, 'tuned Power 7 hits like a Power 7 cue');
  eq(stick('ratchet', true, t), stick('house'), 'matched ignores tuning'); eq(specs('house', { power: 3, spin: 3, aim: 6 }).guideCm, 38, 'tuned Aim 6: one point longer than Aim 5');
  ok('tuning: points, coins, caps, free moves');
}
{ const m = readMastery({ house: { xp: 1000, power: 1, spin: 1, aim: 0, paid: 2 }, twig: { xp: 50, power: 1, paid: 1 }, ram: { xp: 5000, power: 1, paid: 1 }, bogus: { xp: 5 }, ratchet: { xp: 300, power: 1, spin: 1, paid: 2 }, whisper: 'x', ironwood: { xp: 300, spin: 1, paid: 1 } });
  eq(m.house, { xp: 1000, power: 1, spin: 1, aim: 0, paid: 2 }, 'a good record stays'); eq(m.twig, { xp: 50, power: 0, spin: 0, aim: 0, paid: 0 }, 'the Twig loses points');
  eq(m.ram.power, 0, 'past 10: points off'); eq(m.ratchet, { xp: 300, power: 0, spin: 0, aim: 0, paid: 1 }, 'more points than the level: points off, XP kept, paid at most the points');
  eq(m.ironwood, { xp: 300, power: 0, spin: 0, aim: 0, paid: 1 }, 'a point on a locked stat: off');
  eq(['bogus', 'whisper'].map(k => k in m), [false, false], 'unknown cues and bad records dropped');
  eq(readMastery({ house: { xp: -5, power: 9, paid: 99 } }).house, { xp: 0, power: 0, spin: 0, aim: 0, paid: 0 }, 'out of range numbers fixed');
  eq(readMastery({ house: { xp: 1000, paid: 4 } }).house.paid, 2, 'no more paid steps than the level has points');
  eq(readProfile(JSON.stringify({ mastery: { house: { xp: 300, power: 1, paid: 1 } } })).mastery.house.power, 1, 'mastery is read with the profile');
  eq(readProfile(null).mastery, {}, 'no save: no mastery');
  ok('a saved mastery is read defensively');
}
{ // Tuningmaxxing: every tuning step paid on 3 cues gives the Maxxed
  const ids = ['house', 'ironwood', 'ratchet'], max = (p, id) => ['power', 'power', 'aim', 'aim'].reduce((q, s) => tuneUp(q, id, s), p);
  let p = { ...NEW, coins: 1e5, owned: ids, mastery: Object.fromEntries(ids.map(id => [id, { xp: 5000, power: 0, spin: 0, aim: 0, paid: 0 }])) };
  p = max(max(p, 'house'), 'ironwood'); eq([featCount(p, 'tuning'), p.owned.includes('maxxed')], [2, false], '2 cues maxed: not yet');
  p = max(p, 'ratchet'); eq([featCount(p, 'tuning'), p.owned.at(-1), p.coins], [3, 'maxxed', 1e5 - 13500], 'the 3rd gives the Maxxed, for 13,500 coins of tuning');
  eq(featCount(tuneDown(p, 'house', 'aim'), 'tuning'), 3, 'a point taken off does not undo it');
  eq(readProfile(JSON.stringify({ ...p, owned: ids })).owned.includes('maxxed'), true, 'a save that lost the Maxxed gets it back'); eq(featName('tuning'), 'Tuningmaxxing', 'the feat under its meme name');
  ok('Tuningmaxxing gives the Maxxed');
}
{ // a save from before the cue redesign: each old cue becomes a new cue or coins
  const old = (id, m, more = {}) => readProfile(JSON.stringify({ coins: 100, owned: ['house', id], cue: id, mastery: m ? { [id]: m } : {}, ...more }));
  const got = p => [p.owned[1] ?? null, p.cue, p.coins], t = { xp: 1000, power: 1, spin: 0, aim: 1, paid: 2 };
  eq(got(old('rocket', { ...t, power: 0, spin: 1 })), ['ram', 'ram', 6100], 'Rocket: the Ram and 6,000 back'); eq(old('rocket', { ...t, power: 0, spin: 1 }).mastery.ram, { ...t, power: 0, spin: 1 }, 'with its mastery and tuning');
  eq(got(old('lightning')), ['ironwood', 'ironwood', 5500], 'Lightning Rod: the Ironwood and 5,400 back'); eq(old('lightning', { ...t, power: 0, spin: 1 }).mastery.ironwood, { ...t, power: 0, spin: 0 }, 'a point on Spin, now locked, comes off to place again');
  eq(got(old('noodle')), ['whisper', 'whisper', 100], 'Pool Noodle: the Whisper, same price'); eq(old('noodle', t).mastery.whisper, { ...t, power: 0 }, 'Power is locked on the Whisper');
  eq(got(old('wizard', t)), ['marquise', 'marquise', 100], 'Wizard Staff: the Marquise'); eq(got(old('pencil')), ['surveyor', 'surveyor', 100], 'Giant Pencil: the Surveyor');
  eq(got(old('golden', t)), ['heirloom', 'heirloom', 1000], 'Golden Cue: the Heirloom, its 2 tuning steps back in coins'); eq(old('golden', t).mastery.heirloom, { xp: 1000, power: 0, spin: 0, aim: 0, paid: 0 }, 'and its cue XP kept');
  eq(got(old('crowbar', t)), ['banker', 'banker', 100], 'Crowbar: the Banker'); eq(old('crowbar', t).mastery.banker, { ...t, aim: 0 }, 'Aim is locked on the Banker');
  eq(got(old('periscope')), ['vernier', 'vernier', 100], 'Periscope: the Vernier'); eq(got(old('cactus', t)), ['seer', 'seer', 100], 'Cactus: the Seer');
  eq(old('cactus', t).mastery.seer, { ...t, power: 0 }, 'Power and Spin are locked on the Seer');
  eq(got(old('broomstick')), [null, 'house', 500], 'Broomstick: 400 back, and the House Cue in hand'); eq(got(old('baguette')), [null, 'house', 1000], 'Baguette: 900 back');
  eq(got(old('trombone', t)), [null, 'house', 4000], 'Trombone: 3,000 and its 2 tuning steps back'); eq(old('trombone', t).mastery, {}, 'its cue XP is lost');
  eq(got(old('icicle')), [null, 'house', 8100], 'Icicle: 8,000 back'); eq(got(old('rod')), [null, 'house', 600], 'Fishing Rod: the 500 its feat pays now'); eq(got(old('chopsticks', t)), [null, 'house', 1500], 'Chopsticks: 500 and its tuning steps');
  const all = { xp: 500, coins: 100, owned: ['house', 'rocket', 'broomstick', 'twig'], cue: 'broomstick', mastery: { rocket: t, twig: { xp: 400 }, house: { xp: 300, power: 1, paid: 1 } } }, once = readProfile(JSON.stringify(all));
  eq([once.owned, once.cue, once.coins], [['house', 'ram', 'twig'], 'house', 6500], 'several at once; the cues that stay are kept');
  eq(readProfile(JSON.stringify(once)), once, 'the saved result reads back the same: nothing is paid twice');
  eq(readProfile(JSON.stringify({ coins: 100, owned: ['house'], mastery: { rocket: t } })).coins, 100, 'an old cue that was not owned gives nothing');
  ok('old cues are handed over or refunded');
}

{ // a quick match's ledger: shots add up, fouls and own balls feed matchPay, Fresh Chalk pays the match pay again
  const l = newLedger();
  noteShot(l, { pay: { xp: 10, coins: 5 }, run: 1, own: 1 }, false);
  noteShot(l, { pay: { xp: 4, coins: 2 }, run: 0, own: 0 }, true);
  eq(l, { shots: { xp: 14, coins: 7 }, run: 0, fouls: 1, own: 1 }, 'two shots: pay summed, the run is the last, a foul counted');
  const m = matchPay({ tier: 2, won: true, fouls: 1, ownPotted: 1 });
  eq(settle(l, { tier: 2, won: true, early: false }), { match: m, shots: { xp: 14, coins: 7 }, chalk: null, total: { xp: m.xp + 14, coins: m.coins + 7 } }, 'no chalk: match + shots');
  const twice = settle(l, { tier: 2, won: true, early: false }, (won, p) => (won ? p : { xp: 0, coins: 0 }));
  eq([twice.chalk, twice.total], [m, { xp: 2 * m.xp + 14, coins: 2 * m.coins + 7 }], 'chalk on a win: the match pay twice, the shots once');
  eq(settle(l, { tier: 2, won: false, early: false }, () => ({ xp: 0, coins: 0 })).chalk, null, 'chalk that paid nothing is no line');
  eq(settle(l, { tier: 2, won: false, early: true }).match, { xp: 0, coins: 0 }, 'an early 8 pays no match pay');
  ok('ledger: shots, fouls, own balls and Fresh Chalk');
}

{ // pass and play: the flat pay for the first 3 finished matches of a day, nothing for a match lost on a foul or an early 8
  const flat = { xp: 40, coins: 20 }, play = (p, day, lost = '') => { const r = passPlay(p, day, lost, flat); return [r.mark(p), r.pay, r.note]; };
  let p = readProfile(null), pay, note;
  for (let i = 0; i < 3; i++) { [p, pay, note] = play(p, '2026-11-21'); eq([pay, note], [flat, ''], `match ${i + 1} of the day pays`); }
  eq(p.pp, { day: '2026-11-21', n: 3 }, 'the count is in the profile');
  [p, pay, note] = play(p, '2026-11-21'); eq([pay, note, p.pp.n], [{ xp: 0, coins: 0 }, 'No pay: 3 paid matches a day.', 3], 'the fourth pays nothing');
  [p, pay] = play(p, '2026-11-22'); eq([pay, p.pp], [flat, { day: '2026-11-22', n: 1 }], 'a new day pays again');
  [p, pay, note] = play(p, '2026-11-22', 'a foul'); eq([pay, note, p.pp.n], [{ xp: 0, coins: 0 }, 'No pay: the match ended on a foul.', 1], 'a match lost on a foul pays nothing and is not counted');
  eq(readProfile(JSON.stringify(p)).pp, p.pp, 'the count is read back');
  eq([readProfile(JSON.stringify({ pp: { day: 5, n: 2 } })).pp, readProfile(JSON.stringify({ pp: { day: '2026-11-22', n: 'x' } })).pp], [undefined, { day: '2026-11-22', n: 0 }], 'a damaged count is read safely');
  ok('pass and play pays 3 matches a day');
}

{ // a match won only on the break: no match pay, no Fresh Chalk spent, the break's pots still paid
  const l = newLedger(); let asked = 0; const chalk = (won, p) => { asked++; return p; };
  noteShot(l, { pay: { xp: 10, coins: 4 }, run: 1, own: 0 }, false, true);
  eq(settle(l, { tier: 1, won: true, early: false, racks: 1 }, chalk), { match: { xp: 0, coins: 0 }, shots: { xp: 10, coins: 4 }, chalk: null, total: { xp: 10, coins: 4 }, note: 'Won on the break: no match pay.' }, 'race to 1 won on the break: the shots only');
  eq(asked, 0, 'Fresh Chalk is not asked, so no charge is spent');
  eq(settle(l, { tier: 1, won: true, early: false, racks: 2 }).match, matchPay({ tier: 1, won: true, fouls: 0 }), 'one of two racks won in play: the win pays');
  noteShot(l, { pay: { xp: 0, coins: 0 }, run: 0, own: 0 }, false, true);
  eq(settle(l, { tier: 1, won: true, early: false, racks: 2 }).note, 'Won on the break: no match pay.', 'both racks on the break: no pay');
  eq(settle(l, { tier: 2, won: false, early: false, racks: 2 }).match, matchPay({ tier: 2, won: false, fouls: 0, ownPotted: 0 }), 'a loss pays as before');
  eq(settle(newLedger(), { tier: 1, won: true, early: false, racks: 1 }).note, undefined, 'a rack the AI handed over pays');
  eq(settle({ ...newLedger() }, { tier: 1, won: true, early: false }).note, undefined, 'no rack count: pays as before');
  ok('a win on the break alone pays no match pay');
}

{ eq(shotPay({ pRef: 0.9, tier: 3, tour: 2 }), { xp: 20, coins: 8 }, 'a tournament final pays its shots x2');
  eq(safetyPay({ tier: 3, tour: 1.5 }).xp, Math.round(1.5 * safetyPay({ tier: 3 }).xp), 'and its safeties');
  eq(matchPay({ tier: 3, won: true, fouls: 1, tour: 3 }), { xp: 540, coins: 360 }, 'a match: x its round and frames');
  eq(settle(newLedger(), { tier: 3, won: true, early: false, tour: 3 }).match, matchPay({ tier: 3, won: true, fouls: 0, tour: 3 }), 'settle passes the tournament multiplier');
  ok('tournament stakes in the pay');
}
{ const r = { seed: 5, earned: { xp: 300, coins: 150 }, medal: null }, a = runOwe(NEW, r), p = gain(NEW, a.owe).profile, q = a.mark(p);
  eq(a.owe, { xp: 300, coins: 150 }, 'a run pays what it earned');
  eq(runOwe(q, r), null, 'paid once: nothing again, and no save');
  const more = runOwe(q, { ...r, earned: { xp: 1000, coins: 500 } });
  eq(more.owe, { xp: 700, coins: 350 }, 'after a crash or the next match: only the rest');
  eq(runOwe(q, { ...r, seed: 6 }).owe, r.earned, 'a new run (new seed) pays from nothing');
  const champ = runOwe(q, { ...r, medal: [1, 2] }), won = champ.mark({ ...q, trophies: [0, 3, 0, 0] });
  eq([champ.owe, won.trophies[1]], [{ xp: 0, coins: 0 }, 3], 'a trophy saves even with nothing owed, and never lowers a better medal');
  eq(runOwe(champ.mark(q), { ...r, medal: [1, 2] }), null, 'a champion run already in: no save at every launch');
  ok('a tournament run pays once');
}
{ // feats counted in a match: the ledger holds them until the match ends, and the profile takes them then
  const pot = (ids, run = 1, feats = []) => ({ pay: { xp: 1, coins: 1 }, run, own: ids.length, feats, mine: ids });
  eq([hustler({ tier: 2 }), hustler({ tier: 3 }), hustler({ boss: 2.9 }), hustler({ boss: 3 })], [false, true, false, true], 'Hustler or harder: tier 3, or a Rival or boss rated 3.0');
  let l = newLedger();
  for (const id of [1, 2, 3, 4, 5, 6]) noteShot(l, pot([id], 1, id === 2 ? ['bank'] : []), false, false, true);
  eq([l.feats, l.pairs], [{ bank: 1 }, undefined], 'six balls in a turn: no Heater yet, and no 7 for the pair');
  noteShot(l, pot([7]), false, false, true); noteShot(l, pot([8]), false, false, true);
  eq([l.feats, l.pairs], [{ bank: 1, heater: 1 }, 1], 'the seventh ball: Heater once, and the 6 and the 7 are a pair');
  rackOver(l, true, true); eq([l.feats.thirteen, l.pairs, l.turn], [1, 0, undefined], 'a rack that ends counts its pair');
  noteShot(l, pot([6]), false, false, true); noteShot(l, pot([], 0), false, false, true); noteShot(l, pot([7]), false, false, true);
  eq(l.pairs, 0, 'the 6 and the 7 in two turns are no pair');
  noteShot(l, pot([6]), false, false, true); noteShot(l, pot([], 0), true, false, true, true); rackOver(l, false, true);
  eq(l.feats.thirteen, 1, 'a pair in a rack the player loses on their own shot is dropped');
  l = newLedger(); for (const id of [1, 2, 3, 4, 5, 6, 7]) noteShot(l, pot([id]), false);
  eq([l.feats, l.pairs], [undefined, undefined], 'below Hustler neither counts');
  l = newLedger(); l.behind = true; rackOver(l, true, true); l.behind = true; rackOver(l, false, true); l.behind = true; rackOver(l, true, false);
  eq(l.feats, { lives: 1 }, 'Nine Lives: only a rack won from behind against Hustler or harder');
  eq(matchFeats({ ...newLedger(), feats: { kick: 2 } }, { vs: { tier: 6 }, won: true, cue: 'twig' }), { kick: 2, legend: 1, giant: 1 }, 'a win against Legend with the Twig');
  eq(matchFeats(newLedger(), { vs: { tier: 4 }, won: true, cue: 'house' }), {}, 'Shark with another cue: neither');
  eq(matchFeats(newLedger(), { vs: { boss: 6 }, won: true, dry: true }), {}, 'a win on the break alone counts for none');
  eq([{ tier: 3 }, { tier: 2 }].map(vs => matchFeats(newLedger(), { vs, won: true, pure: true })).concat(matchFeats(newLedger(), { vs: { tier: 3 }, won: false, pure: true }), matchFeats(newLedger(), { vs: { tier: 3 }, won: true })), [{ purist: 1 }, {}, {}, {}], 'Purist: a win against Hustler or harder with the guide off all match');
  eq([matchFeats({ ...newLedger(), down: true }, { vs: { tier: 3 }, won: true }), matchFeats({ ...newLedger(), down: true }, { vs: { tier: 3 }, won: false })], [{ lives: 1 }, {}], 'a 9-ball race won from 2 racks down');
  let p = { ...NEW, open: true };
  p = matchEnd(p, { heater: 1, kick: 3 }, true);
  eq([p.owned.includes('aura'), featCount(p, 'kick'), featCount(p, 'unbeaten'), p.open], [true, 3, 1, undefined], 'the match saves its feats, gives the cue and adds to the streak');
  p = matchEnd(p, {}); eq(featCount(p, 'unbeaten'), 1, 'a win on the break alone leaves the streak');
  p = matchEnd(p, {}, false); eq(featCount(p, 'unbeaten'), 0, 'a loss ends it');
  for (let i = 0; i < 5; i++) p = matchEnd(p, {}, true);
  p = matchEnd(p, {}, false); eq([featCount(p, 'unbeaten'), p.owned.includes('marble')], [5, true], 'five in a row give the Marble, and a later loss leaves it done');
  eq(readProfile(JSON.stringify({ ...NEW, open: true })).open, true, 'a match in play is read back, so a closed app is a loss');
  ok('feats are counted in matches');
}
{ // the Six Seven's pay is held for the end of the rack
  const six = (ids, run = 1) => ({ pay: { xp: 67 * ids.length, coins: 27 * ids.length }, run, own: ids.length, mine: ids, held: true });
  let l = newLedger();
  noteShot(l, six([6]), false, false, true); eq([l.shots, l.held], [{ xp: 0, coins: 0 }, { xp: 67, coins: 27 }], 'the 6: held, not paid yet');
  noteShot(l, six([7]), false, false, true); eq(l.held, { xp: 134, coins: 134 }, 'the 7 in the same turn: each is topped up to 67 coins');
  rackOver(l, false, true); eq([l.shots, l.held], [{ xp: 134, coins: 134 }, undefined], 'the rack ends, lost to the AI\'s own pot of the 8: paid');
  noteShot(l, six([6, 7]), false, false, true); eq(l.held, { xp: 134, coins: 134 }, 'both on one shot');
  noteShot(l, six([], 0), false, false, true, true); rackOver(l, false, true); eq(l.shots, { xp: 134, coins: 134 }, 'a rack lost on the player\'s own shot pays none of it');
  noteShot(l, six([6], 0), false, false, true); noteShot(l, six([7]), false, false, true); rackOver(l, true, true); eq(l.shots, { xp: 268, coins: 188 }, 'the 6 and the 7 in two turns: 27 coins each');
  ok('the Six Seven pays at the end of the rack');
}
{ // the tricks on the controls
  eq([0, 0.04, 0.05, 0.099, 0.101, 0.2, 0.5, 0.92, 0.94, 1].map(ratchet), [0, 0.04, 0.08, 0.08, 0.12, 0.17, 0.45, 0.86, 1, 1], 'Ratchet: a pull lands on the nearest step; under 5% it still cancels');
  eq([STEPS.length, STEPS.every((s, i) => !i || s > STEPS[i - 1])], [10, true], '10 rising steps');
  eq([notch([], 0.33), notch([0.08, 0.33, 0.58], 1), notch([0.08, 0.33, 0.58], 0.33)], [[0.33], [0.33, 0.58, 1], [0.08, 0.58, 0.33]], 'notches: the last 3 pulls, each step once');
  assert(Math.abs(overdrive(5 / 6, true) - 1) < 1e-9, 'Ram: 100% sits at five sixths of the pull'); eq([overdrive(1, true), overdrive(1, false), overdrive(0.5, false)], [1.2, 1, 0.6], 'the full pull is 120%; 100% on the break and with the cue raised');
  eq([ramOwes(false, 1.1, false), ramOwes(true, 0.8, false), ramOwes(true, 1.1, false), ramOwes(true, 1, true), ramOwes(false, 1, false)], [true, false, true, true, false], 'a strike past 100% owes a blind shot; the next strike that is no break pays it off, or owes again');
  eq([readProfile(JSON.stringify({ ...NEW, ram: true })).ram, readProfile(JSON.stringify({ ...NEW, ram: 1 })).ram], [true, undefined], 'the owed shot is saved');
  ok('tricks on the controls');
}
{ // the Aura's run lives in the profile between matches
  let p = { ...NEW, owned: ['house', 'aura'], cue: 'aura' };
  p = matchEnd(p, {}, true, { run: 4, owed: false }); eq(p.aura, { run: 4, owed: false }, 'a settled match saves the run');
  eq([matchEnd(p, {}, undefined, { run: 4, owed: false }) === p, matchEnd(p, {}).aura], [true, { run: 4, owed: false }], 'the same run writes nothing; a match below Hustler leaves it');
  eq(matchEnd(p, {}, false).aura, { run: 0, owed: true }, 'a match that was left ends it');
  eq([select(p, 'house').aura, select({ ...p, aura: { run: 0, owed: false } }, 'house').aura, matchEnd({ ...p, cue: 'house' }, {}, false).aura], [{ run: 0, owed: true }, { run: 0, owed: false }, { run: 4, owed: false }], 'choosing another cue ends a run; with another cue in hand a loss does not');
  eq([readProfile(JSON.stringify(p)).aura, readProfile(JSON.stringify({ ...p, aura: { run: -3, owed: 'yes' } })).aura, readProfile(JSON.stringify({ ...p, aura: 5 })).aura], [{ run: 4, owed: false }, { run: 0, owed: false }, undefined], 'read defensively');
  eq([auraLine({ run: 0, owed: false }).text, auraLine({ run: 3, owed: false }).text, auraLine({ run: 0, owed: true }).text], ['x1', 'x1.75', 'x0'], 'the HUD shows what the next pot pays');
  ok('the Aura keeps its run');
}
{ // the Whisper's Soft hands: twice a rack a soft shot needs no cushion after the hit
  const s = { ...newGame(9), phase: 'play', hand: null, balls: [1, 2, 9] }, tap = { ...newRec(), first: 1, railAfter: false }, w = newSoft();
  const foul = judge(s, tap); eq([foul.foul, foul.hand], [true, 'any'], 'no cushion after the hit is a foul');
  eq([softHands(w, 0.16, s, tap, foul).foul, softHands(w, 0.1, s, tap, foul, true).foul, softHands(w, 0.1, { ...s, phase: 'break' }, tap, foul).foul, w.left], [true, true, true, 2], 'not above 15% of the pull, not on a push-out, not on the break');
  const wrong = { ...tap, first: 2 }; eq([softHands(w, 0.1, s, wrong, judge(s, wrong)).foul, softHands(w, 0.1, s, { ...tap, first: -1 }, judge(s, { ...tap, first: -1 })).foul, w.left], [true, true, 2], 'a legal ball must still be hit first');
  const fine = { ...tap, railAfter: true }; softHands(w, 0.1, s, fine, judge(s, fine)); eq(w.left, 2, 'a shot that needs no saving spends no use');
  const ok1 = softHands(w, 0.15, s, tap, foul); eq([ok1.foul, ok1.turn, ok1.hand, { ...w }, softLine(w).text], [false, 1, false, { left: 1, turn: 0, at: 0 }, '●○'], 'a soft tap up to a ball: a legal safety, one use spent');
  w.turn++; eq([softCan(w), softHands(w, 0.1, s, tap, foul).foul, softLine(w).dim], [false, true, true], 'never on 2 of the player\'s turns in a row');
  w.turn++; eq([softCan(w), softHands(w, 0.1, s, tap, foul).foul, w.left], [true, false, 0], 'the turn after that it acts again');
  w.turn += 2; eq([softCan(w), softHands(w, 0.1, s, tap, foul).foul, softLine(w).text], [false, true, '○○'], 'twice a rack');
  // 9-ball: the opponent's foul on the shot straight after leaves its count of fouls in a row as it was
  const ai = { ...s, turn: 1, fouls: [0, 2] }, miss = { ...newRec(), first: -1 };
  eq([judge(ai, miss).phase, judge(afterSoft(ai), miss).phase, judge(afterSoft(ai), miss).fouls[1], judge(afterSoft(ai), fine).fouls[1]], ['over', 'play', 2, 0], 'a third foul there does not lose the rack; a legal shot clears the count as usual');
  ok('the Whisper\'s Soft hands');
}
{ // the Marble's Mog: 8 in every stat when ahead on balls potted this rack, 2 when behind, 5 when tied
  eq([mog(2), mog(0), mog(-1)], [{ power: 8, spin: 8, aim: 8 }, { power: 5, spin: 5, aim: 5 }, { power: 2, spin: 2, aim: 2 }], 'ahead, tied, behind');
  const open = { ...newGame(8), phase: 'play', solids: -1 }, sunk = [0, 0], pots = (...ids) => ({ ...newRec(), pots: ids.map(id => ({ id, pocket: 0 })) });
  noteSunk(sunk, open, pots(3, 0), { ...open, foul: true }); noteSunk(sunk, { ...open, turn: 1 }, pots(9, 10), open);
  eq([sunk, mogLead(open, sunk)], [[1, 2], -1], '8-ball before the groups are set: every ball counts for the player who potted it, the cue ball for none');
  eq([mogLead({ ...open, solids: 0, balls: [1, 2, 8, 9, 10, 11] }, sunk), mogLead({ ...open, solids: 1, balls: [1, 2, 8, 9, 10, 11] }, sunk)], [1, -1], 'groups set: each group\'s balls off the table, whoever potted them');
  const nine = { ...newGame(9), phase: 'play' }, n9 = [0, 0];
  noteSunk(n9, nine, pots(1, 2), nine); noteSunk(n9, { ...nine, turn: 1 }, pots(3), { ...nine, foul: true });
  eq([n9, mogLead(nine, n9), mogLine(1).text, mogLine(-2).text, mogLine(0)], [[2, 0], 2, 'Mogging +3', 'Mogged −3', null], '9-ball: a ball counts for the player who potted it with no foul');
  ok('the Marble\'s Mog');
}
{ // the Maxxed's Statmaxxing: the picked stat is 10, the other two are 5
  eq([maxStats(), maxStats('power'), maxStats('spin')], [{ power: 5, spin: 5, aim: 10 }, { power: 10, spin: 5, aim: 5 }, { power: 5, spin: 10, aim: 5 }], 'with no pick, Aim');
  eq([nextPick(), nextPick('power'), nextPick('spin')], ['power', 'spin', 'aim'], 'the button steps through the three');
  const p = { ...NEW, owned: ['house', 'maxxed'], maxxed: 'spin', mastery: { house: { xp: 300, power: 1, spin: 0, aim: 0, paid: 1 } } };
  eq([cueStats(p, 'maxxed'), cueStats(p, 'house').power, cueStats(NEW, 'maxxed').aim], [{ power: 5, spin: 10, aim: 5 }, CUES.house.power + 1, 10], 'the card and the lessons show the last pick; another cue shows its tuning');
  eq([readProfile(JSON.stringify(p)).maxxed, readProfile(JSON.stringify({ ...p, maxxed: 'luck' })).maxxed], ['spin', undefined], 'the pick is saved and read defensively');
  ok('the Maxxed\'s Statmaxxing');
}
