// The cues: their family, stats (1 to 10; the Nonchalant has 0 Aim), trick and how to get them, and the engine cue
// they make. The roster is the cue redesign's (26 cues in four families, each with one trick and one price for it).
import { CUE, P, type Cue } from '../physics/engine.ts';
import { guideLen } from '../shot/aim.ts';

export type Stat = 'power' | 'spin' | 'aim';
export const STATS: Stat[] = ['power', 'spin', 'aim'];
export type Family = 'craft' | 'machine' | 'relic' | 'joke';
export const FAMILIES: [Family, string][] = [['craft', 'Craft'], ['machine', 'Machine'], ['relic', 'Relic'], ['joke', 'Joke']];
export interface CueInfo {
  name: string; family: Family; power: number; spin: number; aim: number;
  lock?: Stat[];             // the stats tuning can't raise: the trick's price is in them
  tune?: false;              // takes no tuning at all (it still earns cue XP and mastery levels)
  trick?: string;            // the trick's name; the card shows does, cost (what the trick costs in play) and note (fine print)
  does: string; cost: string; note?: string;
  price?: number;            // coins
  quip?: string;             // a line after the price
  feat?: string;             // the feat that gives it (FEATS)
  level?: number;            // the level that gives it
  get?: string;              // a way to get it that is not a price, a feat or a level
  rare: 1 | 2 | 3;           // common, rare, trophy
}
const ROSTER = {
  house: { name: 'House Cue', family: 'craft', power: 3, spin: 3, aim: 5, does: 'No trick. Matched games give every cue these stats.', cost: 'No price.', rare: 1 },
  ironwood: { name: 'Ironwood', family: 'craft', power: 8, spin: 3, aim: 4, lock: ['spin'], trick: 'Hammer', does: 'On the break, the cue ball leaves 20% faster.', cost: 'Hard tip: 3 Spin, locked.', note: 'The break only, and a re-break too. About 5 more 8-ball breaks in 100 pot a ball. It does not help the 9-ball break.', price: 600, rare: 1 },
  whisper: { name: 'Whisper', family: 'craft', power: 2, spin: 6, aim: 6, lock: ['power'], trick: 'Soft hands', does: 'Twice a rack, a shot at 15% power or less needs no cushion after the hit. A soft tap up to a ball is a legal safety.', cost: 'Light cue: 2 Power, locked. Never on 2 of your turns in a row.', note: 'You still have to hit a legal ball first. Not on the break or a push-out. 15% power rolls the cue ball about 1 m.', price: 1500, rare: 1 },
  marquise: { name: 'Marquise', family: 'craft', power: 3, spin: 10, aim: 5, lock: ['power'], trick: 'True line', does: 'Side spin never moves the cue ball off its line: no squirt, no curve with a level cue. The line stays put as you add side.', cost: 'Light cue: 3 Power, locked.', note: 'A raised cue still curves the ball. That is a massé, and you asked for it.', price: 5000, rare: 2 },
  surveyor: { name: 'Surveyor', family: 'craft', power: 3, spin: 4, aim: 5, lock: ['aim'], trick: 'Sketch', does: 'The guide shows where the cue ball goes after the hit.', cost: 'The whole guide is 15% shorter. 5 Aim, locked.', note: 'The only cue that shows the cue ball\'s real path after the hit: 27 cm of it.', get: 'Pass 10 lessons', rare: 1 },
  banker: { name: 'Banker', family: 'craft', power: 6, spin: 4, aim: 3, lock: ['aim'], trick: 'Bank sight', does: 'On a bank, the object ball\'s line runs to the cushion and 60 cm off it.', cost: 'On any other shot, the line is 21 cm: 3 Aim, locked.', note: 'The 60 cm starts at the cushion. The line still stops at the first ball it meets and at a second cushion. A cushion touched within 15 cm of a pocket doesn\'t light the long line.', feat: 'bank', rare: 2 },
  plumb: { name: 'Plumb', family: 'craft', power: 7, spin: 5, aim: 6, lock: ['spin'], trick: 'Dead stop', does: 'On a straight shot the cue ball stops dead where it hits, whatever spin is on it.', cost: 'It always does. No follow and no draw on a straight shot. 5 Spin, locked.', note: 'Straight means within 3 degrees of dead straight on the first ball hit. The ghost ball on the guide fills in when it will stop. Not on the break.', price: 6000, rare: 2 },
  heirloom: { name: 'Heirloom', family: 'craft', power: 9, spin: 9, aim: 9, lock: ['power', 'spin', 'aim'], tune: false, does: 'No trick. 9 in everything.', cost: 'It takes no tuning.', note: 'Coming with the Penthouse.', get: 'Beat the Penthouse boss', rare: 3 },
  ratchet: { name: 'Ratchet', family: 'machine', power: 5, spin: 3, aim: 6, trick: 'Click stops', does: 'Power clicks in 10 exact steps. Each of the first five rolls the cue ball about twice as far as the one before. Notches on the power rail mark your last 3 pulls.', cost: 'No power in between the steps, on any shot. That includes the break and jumps.', note: 'The steps are at 8, 12, 17, 24, 33, 45, 58, 72, 86 and 100% of the pull. On bare cloth a Power 5 cue rolls about 0.4, 0.8, 1.6, 3.2 and 6 m at the first five.', level: 8, rare: 1 },
  ram: { name: 'Ram', family: 'machine', power: 10, spin: 5, aim: 5, trick: 'Overdrive', does: 'Pull past full power, up to 120%.', cost: 'Your next shot has no guide.', note: 'It draws the cue ball back from further away than any other cue can. Not on the break. A jump tops out at 100%. A break does not use up the no-guide shot: it waits for your next shot that is not a break. Past 100% the guide hides while you pull.', price: 6000, rare: 2 },
  gyro: { name: 'Gyro', family: 'machine', power: 5, spin: 8, aim: 3, lock: ['aim'], trick: 'Flywheel', does: 'Draw and stun hold 40% further on the way to the first ball.', cost: 'The wheel costs you sight: 3 Aim, locked.', note: 'Only with the tip at or below centre. A cushion ends it. Follow and side spin are unchanged.', level: 28, rare: 2 },
  optic: { name: 'Optic', family: 'machine', power: 3, spin: 6, aim: 4, lock: ['aim'], trick: 'Range', does: 'A number by the pull shows how far this pull would roll the cue ball on an empty table, and a mark on the guide shows where. A ring round the first ball hit shows how far that ball would roll.', cost: 'Short sight: 4 Aim, locked.', note: 'The mark and the ring read speed on bare cloth: no other balls, no cushions, no spin. The cue ball\'s mark shows when its roll ends before the first ball; past that there is only the number. The ring is a full circle centred on the first ball hit, never a point on its line: it shows reach, not direction.', level: 14, rare: 1 },
  vernier: { name: 'Vernier', family: 'machine', power: 5, spin: 5, aim: 7, trick: 'Two cushions', does: 'On a kick, the guide follows the cue ball off 2 cushions to the ball.', cost: 'It never shows the short line after the hit that 7 Aim gives other cues.', note: 'From the first cushion on, the line has no length limit: it runs to the ball, or stops at a third cushion. Other cues get only their guide\'s length past the first cushion, and only from 7 Aim.', feat: 'kick', rare: 2 },
  airbrake: { name: 'Airbrake', family: 'machine', power: 5, spin: 7, aim: 7, lock: ['aim'], trick: 'Brake', does: 'Arm it once a rack. Tap while the cue ball rolls and it stops dead.', cost: 'An armed shot is capped at 70% power. 7 Aim, locked.', note: 'Arm it before you pull, then tap anywhere on the table. It works after the cue ball has hit its first ball: a cushion does not count, and a tap before that does nothing. If you never tap, the brake is still used up. Not on the break or in the air.', level: 40, rare: 3 },
  twig: { name: 'Twig', family: 'relic', power: 1, spin: 1, aim: 1, lock: ['power', 'spin', 'aim'], tune: false, trick: 'Humble', does: 'Every pot pays 1.5 times its usual pay.', cost: '1 in everything. It takes no tuning.', level: 20, rare: 2 },
  star: { name: 'Fallen Star', family: 'relic', power: 7, spin: 2, aim: 6, trick: 'Meteor', does: 'Jumps from about 45% power, where other cues need about 75%.', cost: 'Top-heavy: you can strike only half as far below centre, so draw is weak.', note: 'The extra lift fades to nothing at full power, so a hard jump is no higher than any cue\'s.', feat: 'escape', rare: 2 },
  coil: { name: 'Coil', family: 'relic', power: 5, spin: 9, aim: 5, trick: 'Serpentine', does: 'A raised cue curves the cue ball 50% more.', cost: 'With the cue raised, the guide stops after 20 cm. You curve it by feel.', note: 'Raised means 4 degrees or more, so a jump has the short guide too. At full raise it curves further than any other cue can.', feat: 'spin', rare: 2 },
  seer: { name: 'Seer', family: 'relic', power: 3, spin: 4, aim: 8, lock: ['power', 'spin'], trick: 'Omen', does: '3 times a rack, tap the eye to arm it, then hold the pull still. The eye opens, and the guide turns gold if the ball goes in on this exact shot.', cost: 'Once the eye has opened, your next shot pays as a plain pot with no run bonus, and counts for no feat, gold or not. 3 Power and 4 Spin, locked.', note: 'A use is spent when the eye opens; un-arm it before then and you keep it. While it is open the shot is frozen: lift to play exactly it, or move to close it. Gold means the rules would rule this exact shot as no foul, a ball of yours in the called pocket (where no call is needed: a ball you may pot), and the rack not lost. Not on the break or a push-out.', feat: 'sharp', rare: 3 },
  hindsight: { name: 'Hindsight', family: 'relic', power: 8, spin: 6, aim: 4, trick: 'Take back', does: 'Once a rack, take your last shot back.', cost: 'The shot you play in its place has no guide at all, and you line it up from nothing: aim, pull and spin are reset.', note: 'When a shot ends your turn, fouls or loses the rack, the game stops and asks: take it back, or let it stand. After a pot, you can take it back until you pull again. Not on the break. The shot\'s pay and feat counts are taken back too.', feat: 'lives', rare: 3 },
  daybreak: { name: 'Daybreak', family: 'relic', power: 2, spin: 7, aim: 10, lock: ['power'], trick: 'Horizon', does: 'The object ball\'s line runs on until a ball, a cushion or a pocket stops it.', cost: 'Light cue: 2 Power, locked. It watches the object ball only: no short line after the hit, and on a kick the guide stops at the first cushion.', feat: 'legend', rare: 3 },
  sixseven: { name: 'Six Seven', family: 'joke', power: 6, spin: 7, aim: 5, trick: 'Sixes and sevens', does: 'The 6 and the 7 each pay 6.7 times a plain pot: 27 coins and 67 XP, flat. Pot both in one turn and each pays 67 coins and 67 XP.', cost: 'No other ball pays. If you are stripes in 8-ball, none of your pots pays that rack.', note: 'Flat means no bonus for difficulty, shot type, a run or the opponent. Against Hustler or harder only: below that the trick and its price are both off. Not on the break: a 6 or a 7 potted there pays as a plain pot. Winning still pays.', feat: 'thirteen', rare: 2 },
  nonchalant: { name: 'Nonchalant', family: 'joke', power: 7, spin: 7, aim: 0, lock: ['aim'], trick: 'Whatever', does: 'Too cool to call a pocket: any of your balls in any pocket counts. The first 2 flukes a rack each pay a flat 6 times a plain pot: 24 coins and 60 XP.', cost: 'Won\'t look either: no guide at all. 0 Aim, locked.', note: 'A fluke is a pot the game can find no way to play on purpose. Flat means no bonus for difficulty, shot type, a run or the opponent. From the 3rd fluke on, a fluke pays as a plain pot. The fluke pay needs Hustler or harder; the free pocket works against anyone. On the 8, any pocket wins.', feat: 'purist', rare: 2 },
  aura: { name: 'Aura', family: 'joke', power: 3, spin: 8, aim: 4, trick: 'Aura farming', does: 'Every pot in a row adds 25%: your 2nd pot pays 1.25 times its usual pay, your 5th pays 2 times. The run carries into the next rack and the next match.', cost: 'Miss, foul, play safe or leave the match: minus aura. It all goes, and your next pot pays nothing. That pot starts the new run.', note: 'The 25% steps take the place of the usual run bonus: on this card a pot\'s usual pay is counted without it. The pay tops out at 20 times a plain pot. The break and a push-out neither add to the run nor end it. Against Hustler or harder only: a match below that neither adds to the run nor ends it. Choosing another cue ends the run too.', feat: 'heater', rare: 2 },
  marble: { name: 'Marble', family: 'joke', power: 5, spin: 5, aim: 5, lock: ['power', 'spin', 'aim'], tune: false, trick: 'Mog', does: 'Ahead on balls potted this rack: 8 in everything.', cost: 'Behind: 2 in everything. Mogged.', note: 'Tied: 5 in everything. It counts balls potted: your group\'s in 8-ball, any ball in 9-ball, the break included. It changes the moment a shot is ruled on. It takes no tuning.', feat: 'unbeaten', rare: 2 },
  performative: { name: 'Performative', family: 'joke', power: 6, spin: 6, aim: 3, trick: 'For show', does: 'Banks, combos and kicks pay 2 times their usual pay.', cost: 'Any other pot pays half. Nobody was watching.', note: 'Up to 16 times a plain pot. A fluke pays half. The whole trick is off when Bank shots mode makes every pot a bank. Against Hustler or harder only.', price: 4000, quip: 'Ethically sourced.', rare: 1 },
  maxxed: { name: 'Maxxed', family: 'joke', power: 5, spin: 5, aim: 10, lock: ['power', 'spin', 'aim'], tune: false, trick: 'Statmaxxing', does: 'Before each rack, pick 1 stat. It\'s 10. Once a rack, at the start of a turn of yours, you may pick again.', cost: 'The other 2 stats are 5. Unmaxxed. It takes no tuning.', note: 'The second pick shows as 1 pip. It is spent when you make it. It can\'t be made on the break. The 3 choices are Powermaxxing, Spinmaxxing and Aimmaxxing. The card shows your last pick.', feat: 'tuning', rare: 2 },
} satisfies Record<string, CueInfo>;
export type CueId = keyof typeof ROSTER;
export const CUE_IDS = Object.keys(ROSTER) as CueId[];

// Each joke cue has two copies, and both ship: "meme" (the joke as written) and "plain" (the same cue with the
// joke's words taken out). Which one shows is this setting, per cue: a word that turns sour in the news is changed
// here and nowhere else (the cue redesign's design note says when; the Marble and the Maxxed are switched together).
// A feat named after a cue's joke has its plain name in profile.ts (FEATS).
export const JOKE_COPY: Record<'sixseven' | 'nonchalant' | 'aura' | 'marble' | 'performative' | 'maxxed', 'meme' | 'plain'> =
  { sixseven: 'meme', nonchalant: 'meme', aura: 'meme', marble: 'meme', performative: 'meme', maxxed: 'meme' };
export const PLAIN: Record<keyof typeof JOKE_COPY, Partial<CueInfo>> = {
  sixseven: { name: 'Pair' },
  nonchalant: { name: 'Hoodie' },
  aura: { trick: 'Streak', cost: 'Miss, foul, play safe or leave the match: the streak goes, and your next pot pays nothing. That pot starts the new streak.' },
  marble: { trick: 'Upstage', cost: 'Behind: 2 in everything.' },
  performative: { name: 'Showboat', quip: undefined },
  maxxed: { name: 'Lopsided', trick: 'One stat', cost: 'The other 2 stats are 5. It takes no tuning.', note: 'The second pick shows as 1 pip. It is spent when you make it. It can\'t be made on the break. The card shows your last pick.' },
};
export const plain = (id: CueId) => id in JOKE_COPY && JOKE_COPY[id as keyof typeof JOKE_COPY] === 'plain';
export const CUES = Object.fromEntries(CUE_IDS.map(id => [id, plain(id) ? { ...ROSTER[id], ...PLAIN[id as keyof typeof JOKE_COPY] } : ROSTER[id]])) as Record<CueId, CueInfo>;

// The tricks that act. A cue whose trick is not built yet shows it with a "Soon" tag and plays as a plain stick with
// its stats and locks, so no card claims what the table does not do.
export const BUILT: CueId[] = ['surveyor', 'twig', 'ironwood', 'marquise', 'coil', 'ratchet', 'performative', 'sixseven', 'aura', 'ram', 'whisper', 'marble', 'maxxed', 'plumb', 'gyro', 'star', 'daybreak', 'banker', 'vernier', 'optic', 'nonchalant', 'seer', 'hindsight'];
export const soon = (id: CueId) => !!CUES[id].trick && !BUILT.includes(id);

// The engine cue for a cue: Power 1 to 10 gives top speed 3.7 to 4.5 m/s and the break the same share of 12 m/s,
// Spin 1 to 10 gives a tip limit of 0.33 to 0.50 R. matched = both players on House Cue stats, tricks off.
// stats = the cue's stats after tuning (mastery's statsOf); the base stats when left out.
// on = a match against the AI, where the tricks act: the Ironwood's Hammer (the break 20% faster), the Marquise's True
// line (the cue lies dead flat, so side spin does not curve the ball) and the Coil's Serpentine (a raised cue curves
// the ball 50% more) and the Plumb's Dead stop (the cue ball stops at a straight first hit; the match leaves it off on
// the break) and the Gyro's Flywheel (draw and stun slide on 0.71 of the cloth's friction to the first ball) and the Fallen Star's Meteor (a soft jump lifts
// 1.6 times as much; LOW_TIP is its price). Everywhere the Marquise plays with no squirt.
export function stick(id: CueId, matched = false, stats?: Pick<CueInfo, 'power' | 'spin' | 'aim'>, on = false): Cue {
  const k = matched ? 'house' : id, c = matched || !stats ? CUES[k] : stats, top = 3.7 + (c.power - 1) * 0.8 / 9, t = on && !matched;
  return { ...CUE, maxSpeed: top, breakSpeed: top * CUE.breakSpeed / CUE.maxSpeed * (t && k === 'ironwood' ? 1.2 : 1), tipLimit: 0.33 + (c.spin - 1) * 0.17 / 9, squirt: k === 'marquise' ? 0 : CUE.squirt,
    ...(t && k === 'marquise' && { minElev: 0 }), ...(t && k === 'coil' && { curl: 1.5 }), ...(t && k === 'plumb' && { dead: true }), ...(t && k === 'gyro' && { glide: 0.71 }), ...(t && k === 'star' && { lift: 1.6 }) };
}
export const LOW_TIP = 0.5; // the Fallen Star is top-heavy: the tip goes only this share of the limit below centre

// The Surveyor's Sketch: the guide shows the cue ball's real path after contact, and pays with 15% of its length (Jack).
export const sketch = (id: CueId) => id === 'surveyor';
export const guideScale = (id: CueId) => (sketch(id) ? 0.85 : 1);

// What a cue's stats mean on the table, for the cue pages: top shot and break speed in m/s, the farthest the tip may
// sit from the centre in mm, and how much of the path past the first contact the aim guide shows, in cm.
export function specs(id: CueId, stats: Pick<CueInfo, 'power' | 'spin' | 'aim'> = CUES[id]) {
  const s = stick(id, false, stats);
  return { shot: s.maxSpeed, brk: s.breakSpeed, tipMm: s.tipLimit * P.R * 1000, guideCm: Math.round(guideLen(stats.aim) * guideScale(id) * 100) };
}
export const specLine = ({ shot, brk, tipMm, guideCm }: ReturnType<typeof specs>) =>
  `Power: ${shot.toFixed(2)} m/s top shot, ${brk.toFixed(1)} m/s break\nSpin: tip up to ${tipMm.toFixed(1)} mm off centre\nAim: guide ${guideCm} cm past contact`;
