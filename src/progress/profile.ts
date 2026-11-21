// The player's progress: total XP (the level comes from it), coins, cues and feat counts (progression design).
import { CUE_IDS, CUES, type CueId, type CueInfo, plain } from './cues.ts';
import { fit, type Mastery, MAXXED_AT, maxedCues, NONE, paidCoins, readMastery, readOne, tunable } from './mastery.ts';
import type { Pay } from './pay.ts';
import { newRival, readRival, type Rival } from './rival.ts';

// How a feat is counted in a match is in pay.ts and App.tsx; a feat here is its count and what a full one gives.
export const FEATS = {
  reel: { name: 'Reel It In', count: 25, coins: 500 },
  bank: { name: 'Bank Robber', count: 30, cue: 'banker' },
  combo: { name: 'Combo Chef', count: 30, coins: 500 },
  kick: { name: 'Kick Start', count: 15, cue: 'vernier' },
  sharp: { name: 'Sharpshooter', count: 200, cue: 'seer' },   // Tough or harder pots
  spin: { name: 'Spin Doctor', count: 75, cue: 'coil' },
  purist: { name: 'Purist', count: 10, cue: 'nonchalant' },   // wins with the aim line off
  giant: { name: 'Giant Killer', count: 1, coins: 500 },      // beat Shark or harder with the Twig
  long: { name: 'Long Shot', count: 25, coins: 300 },
  escape: { name: 'Escape Artist', count: 20, cue: 'star' },
  lives: { name: 'Nine Lives', count: 30, cue: 'hindsight' },
  order: { name: 'In Order', count: 10, coins: 300 },
  legend: { name: 'Living Legend', count: 10, cue: 'daybreak' }, // wins against Legend, or a Rival rated 6.0 or more
  thirteen: { name: 'Thirteen', count: 13, cue: 'sixseven' },    // the 6 and the 7 potted in one turn
  heater: { name: 'Heater', count: 1, cue: 'aura' },             // 7 balls of yours potted in one turn
  unbeaten: { name: 'Unbeaten', count: 5, cue: 'marble' },       // wins in a row
  tuning: { name: 'Tuningmaxxing', count: MAXXED_AT, cue: 'maxxed' }, // counted from the cues, not saved: mastery.ts maxedCues
} satisfies Record<string, { name: string; count: number; cue?: CueId; coins?: number }>;
export type FeatId = keyof typeof FEATS;
// The feat's name on screen: the Maxxed's feat has a plain name for when its cue shows its plain copy (cues.ts JOKE_COPY).
export const featName = (id: FeatId) => (id === 'tuning' && plain('maxxed') ? 'Tuned up' : FEATS[id].name);

// feats: progress from play and from scenarios apart, since scenarios may give at most half of a count.
export interface Profile { xp: number; coins: number; owned: CueId[]; cue: CueId; feats: Partial<Record<FeatId, { play: number; scen: number }>>; mastery: Partial<Record<CueId, Mastery>>; rival: Rival; trophies: number[]; tour?: { seed: number; xp: number; coins: number }; pp?: { day: string; n: number } }
// trophies: per tournament cup the best medal (src/tournament/bracket.ts medalOf); tour: the run paid so far (progress.ts payRun);
// pp: the pass and play matches paid on a day (passPlay)
export const NEW: Profile = { xp: 0, coins: 0, owned: ['house'], cue: 'house', feats: {}, mastery: {}, rival: newRival(), trophies: [0, 0, 0, 0] };
// Give a cue (Learn, a boss, a feat, a level). An owned cue returns the same profile, so the caller can skip the save.
export const unlock = (p: Profile, id: CueId): Profile => (p.owned.includes(id) ? p : { ...p, owned: [...p.owned, id] });
export const MAX_LEVEL = 50;
export const toLeave = (level: number) => 200 + 50 * (level - 1); // XP to go from this level to the next

// Level from total XP, with the XP into this level and the XP this level needs (0 at the cap).
export function levelOf(xp: number) {
  let level = 1;
  while (level < MAX_LEVEL && xp >= toLeave(level)) xp -= toLeave(level++);
  return level === MAX_LEVEL ? { level, into: 0, need: 0 } : { level, into: xp, need: toLeave(level) };
}

// The cues a level gives (Ratchet 8, Optic 14, Twig 20, Gyro 28, Airbrake 40): anyone at or past the level has them.
const LEVEL_CUES = CUE_IDS.filter(id => (CUES[id] as CueInfo).level).map(id => [id, (CUES[id] as CueInfo).level!] as const);
const withLevelCues = (p: Profile, level: number) => LEVEL_CUES.reduce((q, [id, at]) => (level >= at ? unlock(q, id) : q), p);

// Add pay. Each level-up pays 50 + 10 x the new level, and some levels give a cue. from, to and bonus are for the results card.
export function gain(p: Profile, pay: Pay) {
  const from = levelOf(p.xp).level, to = levelOf(p.xp + pay.xp).level;
  let bonus = 0; for (let l = from + 1; l <= to; l++) bonus += 50 + 10 * l;
  return { profile: withLevelCues({ ...p, xp: p.xp + pay.xp, coins: p.coins + pay.coins + bonus }, to), from, to, bonus };
}

// The level line of the results card, one line so a level-up makes the card no taller: the level and the XP into
// it, or the level-up with its coins and the cue the level gave (the last one, if a jump passed two).
export function levelNote({ profile, from, to, bonus }: ReturnType<typeof gain>) {
  const { level, into, need } = levelOf(profile.xp), xp = need ? `${into}/${need} XP` : '';
  if (to === from) return [`Level ${level}`, xp].filter(Boolean).join(' · ');
  const got = LEVEL_CUES.filter(([, at]) => from < at && to >= at).pop();
  return [`Level ${to}! +${bonus} coins`, got ? `${CUES[got[0]].name} unlocked` : xp].filter(Boolean).join(' · ');
}

// A cue with a price that is not owned, for at most the coins there are. Anything else leaves the profile as it is.
export function buy(p: Profile, id: CueId): Profile {
  const price = (CUES[id] as CueInfo).price;
  return price === undefined || p.owned.includes(id) || p.coins < price ? p : { ...unlock(p, id), coins: p.coins - price };
}
// The cue in use or one not owned returns the same profile, so the cues page saves nothing.
export const select = (p: Profile, id: CueId): Profile => (p.owned.includes(id) && p.cue !== id ? { ...p, cue: id } : p);

export function featCount(p: Pick<Profile, 'feats' | 'mastery'>, id: FeatId) {
  const f = p.feats[id], count = FEATS[id].count;
  if (id === 'tuning') return Math.min(count, maxedCues(p));
  return f ? Math.min(count, f.play + Math.min(f.scen, Math.floor(count / 2))) : 0;
}
// Count n more of a feat, from play or from a scenario. Reaching the count gives its cue or its coins, once.
export function feat(p: Profile, id: FeatId, n = 1, scen = false): Profile {
  const f = p.feats[id] ?? { play: 0, scen: 0 }, F: { count: number; cue?: CueId; coins?: number } = FEATS[id];
  const next = { ...p, feats: { ...p.feats, [id]: scen ? { ...f, scen: f.scen + n } : { ...f, play: f.play + n } } };
  if (featCount(next, id) < F.count) return next;
  if (F.cue) return unlock(next, F.cue); // unlock is once, and puts back a cue a damaged save lost
  return featCount(p, id) >= F.count ? next : { ...next, coins: next.coins + (F.coins ?? 0) };
}

// Pass and play pays its flat pay for the first PP_CAP finished matches of a day (the Daily Table's day, daily.ts
// dayKey), and nothing for a match that ended on the loser's own foul or early 8 (lost says which). Before the cap,
// losing a 9-ball race to 1 on three fouls in five shots, over and over, paid more an hour than honest play against
// the AI. Gives the pay, the line for the results card when the pay is nothing, and the count to save with the pay.
// shortcut: the day is the phone's clock, so a clock moved on a day pays 3 more; count on a server if online play comes.
export const PP_CAP = 3;
export function passPlay(p: Profile, day: string, lost: string, pay: Pay) {
  const n = p.pp?.day === day ? p.pp.n : 0, none: Pay = { xp: 0, coins: 0 }, same = (q: Profile) => q;
  if (lost) return { pay: none, note: `No pay: the match ended on ${lost}.`, mark: same };
  if (n >= PP_CAP) return { pay: none, note: `No pay: ${PP_CAP} paid matches a day.`, mark: same };
  return { pay, note: '', mark: (q: Profile): Profile => ({ ...q, pp: { day, n: n + 1 } }) };
}

// What opens at a level (scenario packs) or a number of stars (venues).
export const PACKS: [string, number][] = [['Pots', 1], ['Cut shots', 3], ['Banks', 5], ['Position', 8], ['9-ball', 9], ['Combos', 11], ['Kicks', 14], ['Safeties and escapes', 18], ['Trick shots', 22]];
export const VENUES: [string, number][] = [['Garage', 0], ['Corner Bar', 8], ['Social Club', 18], ['Pool Hall', 29], ['Tournament Floor', 40], ['Penthouse', 52]];
export const opens = (gates: [string, number][], n: number) => gates.filter(g => n >= g[1]).map(g => g[0]);

// The 15 cues of the first roster that retired with the cue redesign (the House Cue and the Twig stayed). to = the
// new cue its owner gets, with its mastery and tuning. price = what it cost: back in full when no cue takes its place,
// and the difference back when the new cue costs less (5,400 for a Lightning Rod, 6,000 for a Rocket). The Fishing Rod
// and the Chopsticks came from feats that now pay 500 coins, so that is their price.
const OLD: Record<string, { to?: CueId; price?: number }> = {
  rocket: { to: 'ram', price: 12000 }, wizard: { to: 'marquise' }, pencil: { to: 'surveyor' }, golden: { to: 'heirloom' }, noodle: { to: 'whisper', price: 1500 },
  lightning: { to: 'ironwood', price: 6000 }, crowbar: { to: 'banker' }, periscope: { to: 'vernier' }, cactus: { to: 'seer' },
  broomstick: { price: 400 }, baguette: { price: 900 }, trombone: { price: 3000 }, icicle: { price: 8000 }, rod: { price: 500 }, chopsticks: { price: 500 },
};
// A save from before the redesign: its old cues become new cues or coins. Gives the new cues, their mastery, the coins
// back and the new id of each old cue. A point on a stat the new cue locks comes off (its paid step stays, to place
// again); tuning on a cue that takes none, or that left with no cue in its place, is paid back, and its cue XP is lost.
// It needs no mark to run once: the old ids are in a save only until its first write, and reading the same save twice gives the same profile.
function handOver(o: any) {
  const out = { owned: [] as CueId[], mastery: {} as Profile['mastery'], coins: 0, now: {} as Record<string, CueId> };
  for (const [old, { to, price = 0 }] of Object.entries(OLD)) {
    if (!Array.isArray(o.owned) || !o.owned.includes(old)) continue;
    const m = readOne(o.mastery?.[old]) ?? NONE, keeps = !!to && tunable(to);
    out.coins += (to ? Math.max(0, price - ((CUES[to] as CueInfo).price ?? 0)) : price) + (keeps ? 0 : paidCoins(m));
    if (!to) continue;
    out.owned.push(to); out.now[old] = to;
    const lock = (CUES[to] as CueInfo).lock ?? [];
    out.mastery[to] = keeps ? fit(to, { ...m, power: lock.includes('power') ? 0 : m.power, spin: lock.includes('spin') ? 0 : m.spin, aim: lock.includes('aim') ? 0 : m.aim }) : { ...NONE, xp: m.xp };
  }
  return out;
}

// The profile from the saved text, like readSettings: a value that is missing, of the wrong type or out of range takes
// its default, unknown cues and feats are dropped, the cues of the first roster are handed over (handOver), House Cue
// is always owned, a level's cue and a full feat's cue are owned even if the save lost them, and the selected cue is an owned one.
export function readProfile(text: string | null): Profile {
  let o: any = null;
  try { o = JSON.parse(text ?? 'null'); } catch {}
  if (!o || typeof o !== 'object') return { ...NEW, owned: [...NEW.owned], mastery: {}, rival: newRival(), trophies: [0, 0, 0, 0] };
  const num = (v: unknown) => (typeof v === 'number' && v >= 0 ? Math.min(1e9, Math.floor(v)) : 0);
  const xp = num(o.xp), was = handOver(o), feats: Profile['feats'] = {};
  for (const id of Object.keys(FEATS) as FeatId[]) { const f = o.feats?.[id]; if (f && typeof f === 'object') feats[id] = { play: num(f.play), scen: num(f.scen) }; }
  const mastery = { ...readMastery(o.mastery), ...was.mastery }, full = (Object.keys(FEATS) as FeatId[]).filter(id => featCount({ feats, mastery }, id) >= FEATS[id].count).map(id => (FEATS[id] as { cue?: CueId }).cue);
  const p = withLevelCues({ ...NEW, owned: CUE_IDS.filter(id => id === 'house' || was.owned.includes(id) || full.includes(id) || (Array.isArray(o.owned) && o.owned.includes(id))) }, levelOf(xp).level);
  const owned = CUE_IDS.filter(id => p.owned.includes(id)), cue = was.now[o.cue] ?? o.cue; // in the roster's order, as the rack shows them
  return { xp, coins: Math.min(1e9, num(o.coins) + was.coins), owned, cue: owned.includes(cue) ? cue : 'house', feats, mastery, rival: readRival(o.rival),
    trophies: [0, 1, 2, 3].map(i => { const m = o.trophies?.[i]; return Number.isInteger(m) && m >= 0 && m <= 3 ? m : 0; }),
    ...(o.tour && Number.isInteger(o.tour.seed) ? { tour: { seed: o.tour.seed, xp: num(o.tour.xp), coins: num(o.tour.coins) } } : {}),
    ...(typeof o.pp?.day === 'string' ? { pp: { day: o.pp.day, n: num(o.pp.n) } } : {}) };
}

// A tournament run (src/tournament/bracket.ts): what it still owes the player, and the profile change that marks it
// paid and puts in its trophy, saved with the pay (progress.ts payRun). null = nothing to pay or save. Paying again
// after a crash pays only the rest: the mark is what this run (its seed) was paid before.
export function runOwe(p: Profile, r: { seed: number; earned: Pay; medal: [number, number] | null }) {
  const before = p.tour?.seed === r.seed ? p.tour : { xp: 0, coins: 0 };
  const owe = { xp: Math.max(0, r.earned.xp - before.xp), coins: Math.max(0, r.earned.coins - before.coins) }, m = r.medal;
  if (!owe.xp && !owe.coins && (!m || p.trophies[m[0]] >= m[1])) return null;
  return { owe, mark: (q: Profile): Profile => ({ ...q, tour: { seed: r.seed, ...r.earned }, trophies: m ? q.trophies.map((t, i) => (i === m[0] ? Math.max(t, m[1]) : t)) : q.trophies }) };
}
