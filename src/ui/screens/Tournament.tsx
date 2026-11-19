// The tournament (src/tournament/bracket.ts, spec /mnt/project-files/tournament/SPEC.md section 7): with no run in play
// the setup (cup, players, format, rules) and the cup's trophy; with one, the bracket and the next opponent, or how
// the run ended. The run is the App's: this screen only shows it and asks for a start, a match or an abandon.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { profile } from '../../progress';
import { levelOf } from '../../progress/profile';
import type { Settings } from '../../settings/settings';
import { CUPS, cupOpen, medalOf, NICK, nextMatch, type Opts, prize, raceOf, roundName, rounds, type Run, sides, stakes } from '../../tournament/bracket';
import { C, CREAM, DARK, FONT, MODE } from '../../theme';
import { Glyph, Trophy } from '../Glyph';
import type { Props } from '../Menus';
import { Cta, Panel, Shell, Split, useFrame, usePanel } from '../shell';
import { BallArt, Chip, Keys, Slab, Txt, TYPE } from '../slab';
import { Line } from './Setup';

export interface TourProps { run: Run | null; startRun: (o: Opts) => void; abandon: () => void; playTour: () => void }

export function Tournament(p: Props & TourProps) {
  const [fresh, setFresh] = useState(false); // New tournament pressed: the setup, the ended run kept until Start (its seed seeds the next)
  if (p.run && (p.run.state === 'playing' || !fresh)) return <Bracket {...p} run={p.run} again={() => setFresh(true)} />;
  return <TourSetup {...p} start={o => { setFresh(false); p.startRun(o); }} />;
}

const RACKS = { 1: 1, 3: 2.5, 5: 4 }; // racks a match, on average; 6 minutes a rack
const minutes = (o: Opts) => Math.round((rounds(o.size) * RACKS[o.best] * 6) / 5) * 5;
const cupName = (cup: number) => `${CUPS[cup].name} Cup`;
const n = (x: number) => x.toLocaleString('en-US');

// The coins and XP chips of a prize.
function Pay({ xp, coins }: { xp: number; coins: number }) {
  return (
    <View style={styles.pay}>
      <Chip name={`${n(coins)} coins`}><View style={styles.coin} /><Txt style={styles.payText}>{n(coins)}</Txt></Chip>
      <Slab paint={[C.gold, '#B8901A']} lip={3} radius={3} accessible accessibilityRole="text" accessibilityLabel={`${n(xp)} XP`} face={styles.xp}>
        <Txt style={[styles.payText, { color: C.ink }]}>{`${n(xp)} XP`}</Txt>
      </Slab>
    </View>
  );
}
// Six bars for a rating on the 1 to 6 tier scale; a part bar for a part of a tier.
function Bars({ rating, color, w = 5 }: { rating: number; color: string; w?: number }) {
  return <View style={styles.bars}>{Array.from({ length: 6 }, (_, k) => <View key={k} style={{ width: w, height: Math.max(3, w * 0.6), backgroundColor: color, opacity: rating >= k + 1 ? 1 : rating > k ? 0.55 : 0.22 }} />)}</View>;
}

function TourSetup({ set, change, go, start }: Props & { start: (o: Opts) => void }) {
  const me = profile(), level = levelOf(me.xp).level, open = (c: number) => cupOpen(c, me.trophies, level);
  const o: Opts = { ...set.tour, cup: open(set.tour.cup) ? set.tour.cup : 0 }, pick = (x: Partial<Opts>) => change({ tour: { ...o, ...x } });
  const won = prize(o, rounds(o.size));
  return (
    <Shell title="Tournament" back={() => go('home')}>
      <Split panel={
        <Panel head={<>
          <Txt numberOfLines={1} style={styles.cup}>{cupName(o.cup)}</Txt><View style={{ flex: 1 }} />
          <View accessible accessibilityLabel={`About ${minutes(o)} minutes`} style={styles.clock}><Glyph id="clock" size={14} color={C.chalk} /><Txt style={styles.clockText}>{`${minutes(o)} min`}</Txt></View>
        </>} picture={w => <View style={{ alignItems: 'center', gap: 6 }}>
          <Trophy medal={medalOf(o)} size={Math.min(w, 110)} />
          <View style={styles.pay} accessible accessibilityLabel={`Medals won in the ${cupName(o.cup)}: ${['none', 'bronze', 'silver', 'gold'][me.trophies[o.cup]]}`}>
            {[1, 2, 3].map(k => <Trophy key={k} medal={me.trophies[o.cup] >= k ? k : 0} size={20} />)}
          </View>
        </View>} cta={{ label: 'Start', name: `Start the ${cupName(o.cup)}`, onPress: () => start(o) }}>
          <View style={{ alignItems: 'center', paddingVertical: 6, gap: 6 }}><Txt style={styles.prizeNote}>The title prize, on top of match pay ×1 to ×2</Txt><Pay {...won} /></View>
        </Panel>}>
        <View style={{ gap: 9 }}>
          <Line label="Cup">
            <View style={styles.cups} accessibilityRole="radiogroup" accessibilityLabel="Cup">
              {CUPS.map((c, i) => {
                const on = o.cup === i, ok = open(i), ink = on ? C.ink : C.chalk;
                return (
                  <Slab key={c.name} paint={on ? CREAM : [ok ? C.keyOff : '#EEF2EA0D', 'transparent']} lip={on ? 3 : 0} radius={3} onPress={ok ? () => pick({ cup: i }) : undefined} disabled={!ok}
                    accessibilityRole="radio" accessibilityLabel={ok ? cupName(i) : `${cupName(i)}, opens at level ${c.level}, or with a silver or gold in the ${cupName(i - 1)}`} accessibilityState={{ checked: on, disabled: !ok }} aria-checked={on}
                    hitSlop={{ top: 4, bottom: 4 }} style={{ flex: 1, marginBottom: on ? 0 : 3 }} face={styles.cupKey}>
                    <View style={styles.row}>{!ok && <Glyph id="lock" size={12} color={C.chalk + 'B3'} />}<Txt numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.cupKeyName, { color: ink, opacity: ok ? 1 : 0.7 }]}>{c.name}</Txt></View>
                    {ok ? <Bars rating={c.hi} color={ink} /> : <Txt style={styles.lockText}>{`Level ${c.level}`}</Txt>}
                  </Slab>
                );
              })}
            </View>
          </Line>
          <Line label="Players"><Keys<Opts['size']> label="Players" value={o.size} pick={size => pick({ size })} options={[['4', 4], ['8', 8]]} /></Line>
          <Line label="Format"><Keys<Opts['best']> label="Format" value={o.best} pick={best => pick({ best })} options={[['Best of 1', 1], ['Best of 3', 3], ['Best of 5', 5]]} /></Line>
          <Line label="Game"><Keys<Opts['game']> label="Game" value={o.game} pick={game => pick({ game })} options={[['8-ball', 8], ['9-ball', 9]]} /></Line>
          {o.game === 8 && <>
            <Line label="Call"><Keys label="Call" value={o.callAll} pick={callAll => pick({ callAll })} options={[['Every shot', true], ['Only the 8-ball', false]]} /></Line>
            <Line label="Bank shots"><Keys<Settings['bank']> label="Bank shots" value={o.bank} pick={bank => pick({ bank })} options={[['Off', 0], ['8-ball only', 1], ['Every ball', 2]]} /></Line>
          </>}
        </View>
      </Split>
    </Shell>
  );
}

// Match m of round r, k-th in its round.
const matchOf = (size: number, r: number, k: number) => { let m = 0; for (let i = 0; i < r; i++) m += size >> (i + 1); return m + k; };
const won = (run: Run, m: number) => { const r = run.res[m]; return r ? sides(run, m)[r.w] : null; };
const ROW = 34, GAP = 2, BLOCK = 2 * ROW + GAP, UNIT = BLOCK + 8, LINE = 2; // eight players fit a phone in landscape

function Bracket({ run, go, abandon, playTour, again }: Props & TourProps & { run: Run; again: () => void }) {
  const { land, side, width } = useFrame(), panelW = usePanel(), R = rounds(run.opts.size), next = nextMatch(run);
  const areaW = land ? width - 2 * side - panelW - 16 : width - 2 * side, gapX = land ? 20 : 12, colW = (areaW - (R - 1) * gapX) / R;
  const x = (r: number) => r * (colW + gapX), mid = (r: number, k: number) => (k + 0.5) * (1 << r) * UNIT - 7;
  const names = R === 3 ? (land ? ['Quarterfinal', 'Semifinal', 'Final'] : ['Quarters', 'Semis', 'Final']) : ['Semifinal', 'Final'];
  const lit = (m: number) => { const w = won(run, m); return w !== null && !!run.field[w].human; }, line = (on: boolean) => ({ backgroundColor: on ? CREAM[0] : C.chalk + '33' });
  const parts = [];
  for (let r = 0; r < R; r++) for (let k = 0; k < run.opts.size >> (r + 1); k++) {
    const m = matchOf(run.opts.size, r, k), y = mid(r, k) - BLOCK / 2, res = run.res[m];
    parts.push(<View key={`m${m}`} style={{ position: 'absolute', left: x(r), top: y, width: colW, gap: GAP }}>
      {sides(run, m).map((i, s) => {
        if (i === null) return <View key={s} style={[styles.slot, styles.unknown]} accessible accessibilityLabel="Not decided yet" />;
        // A forfeit ends short of the race: the winner's box says W/O (walkover), the loser's is blank.
        const walk = !!res && Math.max(...res.score) < raceOf(run.opts.best), mark = res ? (walk ? (res.w === s ? 'W/O' : '–') : String(res.score[s])) : '';
        const e = run.field[i], you = !!e.human, foe = m === next && !you, lost = !!res && res.w !== s, gold = run.state === 'champion' && m === run.res.length - 1 && you;
        const paint = you ? CREAM[0] : foe ? MODE.tour[0] : '#EEF2EA14', ink = you ? C.ink : C.chalk;
        return (
          <View key={s} accessible accessibilityLabel={`${e.name}${e.style ? `, ${NICK[e.style]}` : ''}${you ? '' : `, rating ${e.rating.toFixed(1)}`}${res ? `, ${walk ? (res.w === s ? 'won by forfeit' : 'forfeited') : res.score[s]}` : ''}${foe ? ', your next opponent' : ''}`}
            style={[styles.slot, { backgroundColor: paint, opacity: lost ? 0.6 : 1 }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={styles.row}><Txt numberOfLines={1} style={[styles.slotName, { color: ink }]}>{e.name}</Txt>{e.style && <Glyph id={e.style} size={11} color={ink} />}</View>
              {!you && <Bars rating={e.rating} color={ink} w={6} />}
            </View>
            {res && <View style={[styles.score, { backgroundColor: gold ? C.gold : you ? '#16191A1F' : '#0004' }]}><Txt style={[styles.scoreText, { color: gold || you ? C.ink : C.chalk }]}>{mark}</Txt></View>}
          </View>
        );
      })}
    </View>);
    if (r < R - 1) { // the line from this match to the next round's
      const on = lit(m), bx = x(r) + colW, half = gapX / 2, ny = mid(r + 1, k >> 1);
      parts.push(<View key={`h${m}`} style={[styles.abs, line(on), { left: bx, top: mid(r, k) - LINE / 2, width: half, height: LINE }]} />);
      parts.push(<View key={`v${m}`} style={[styles.abs, line(on), { left: bx + half - LINE / 2, top: Math.min(mid(r, k), ny), width: LINE, height: Math.abs(ny - mid(r, k)) }]} />);
      if (k % 2 === 0) parts.push(<View key={`n${m}`} style={[styles.abs, line(on || lit(m + 1)), { left: bx + half, top: ny - LINE / 2, width: half, height: LINE }]} />);
    }
  }
  return (
    <Shell title={cupName(run.opts.cup)} back={() => go('home')} extra={<Trophy medal={run.state === 'champion' ? medalOf(run.opts) : 0} size={24} />}>
      <Split panel={<Card run={run} next={next} abandon={abandon} play={playTour} again={again} />}>
        <View style={{ height: 14, marginBottom: 10 }}>{names.map((t, r) => <Txt key={t} style={[styles.head, styles.abs, { left: x(r) }]}>{t}</Txt>)}</View>
        <View style={{ height: (run.opts.size / 2) * UNIT }}>{parts}</View>
      </Split>
    </Shell>
  );
}

// The panel by the bracket: the next opponent with Play and Abandon, or how the run ended with New tournament.
function Card({ run, next, abandon, play, again }: { run: Run; next: number; abandon: () => void; play: () => void; again: () => void }) {
  const [sure, setSure] = useState(false), { land } = useFrame();
  const face = [styles.card, land && { flex: 1 }];
  if (next < 0) {
    const champ = run.state === 'champion', lostAt = run.res.findIndex((r, m) => r && sides(run, m).some((i, s) => i !== null && run.field[i].human && r.w !== s));
    return (
      <Slab paint={DARK} style={land && { flex: 1 }} face={face}>
        <View style={styles.center}>
          <Trophy medal={champ ? medalOf(run.opts) : 0} size={land ? 110 : 80} />
          <Txt accessibilityRole="header" style={styles.end}>{champ ? 'Champion' : `Out in the ${roundName(run, lostAt).toLowerCase()}`}</Txt>
          <Pay {...run.earned} />
        </View>
        <Cta label="New cup" onPress={again} />
      </Slab>
    );
  }
  const [a, b] = sides(run, next), e = run.field[run.field[a!].human ? b! : a!];
  return (
    <Slab paint={DARK} style={land && { flex: 1 }} face={face}>
      <View style={styles.row}>
        <Txt style={styles.head}>{roundName(run, next)}</Txt><View style={{ flex: 1 }} />
        {stakes(run, next) > 1 && <Chip name={`This round pays times ${stakes(run, next)}`}>{`Pays ×${stakes(run, next)}`}</Chip>}
        <Chip>{`Best of ${run.opts.best}`}</Chip>
      </View>
      <View style={[styles.row, { gap: 14, flex: land ? 1 : undefined, paddingVertical: land ? 0 : 6 }]} accessible accessibilityLabel={`Next: ${e.name}${e.style ? `, ${NICK[e.style]}` : ''}, rating ${e.rating.toFixed(1)}, race to ${raceOf(run.opts.best)}`}>
        <BallArt n={7} size={land ? 64 : 60} label={e.name[0]} />
        <View style={{ flex: 1, gap: 3 }}>
          <View style={styles.row}><Txt numberOfLines={1} style={styles.foe}>{e.name}</Txt>{e.style && <Glyph id={e.style} size={20} color={C.chalk} />}</View>
          {e.style && <Txt style={styles.nick}>{NICK[e.style]}</Txt>}
          <Bars rating={e.rating} color={C.chalk} w={12} />
        </View>
      </View>
      <View style={[styles.row, { gap: 8 }]}>
        <Slab paint={sure ? [C.warn, '#A33A30'] : DARK} lip={4} radius={4} onPress={() => { if (sure) abandon(); setSure(!sure); }} accessibilityLabel={sure ? 'Tap again to abandon: a loss' : 'Abandon the tournament'}
          style={{ height: 58 }} face={styles.abandon}><Txt style={[styles.abandonText, sure && { color: C.ink }]}>{sure ? 'Abandon?' : 'Abandon'}</Txt></Slab>
        <View style={{ flex: 1 }}><Cta label="Play" name={`Play the ${roundName(run, next).toLowerCase()} against ${e.name}`} onPress={play} /></View>
      </View>
    </Slab>
  );
}

// The Home tile's picture: the bracket as lines, the player's path cream. size = players, w x h the box.
export function MiniBracket({ run, w, h }: { run: Run; w: number; h: number }) {
  const R = rounds(run.opts.size), colW = w / (R + 0.7), unit = h / (run.opts.size / 2), mid = (r: number, k: number) => (k + 0.5) * (1 << r) * unit;
  const parts = [], ink = (on: boolean) => ({ backgroundColor: on ? CREAM[0] : '#16191A59' }), me = (i: number | null) => i !== null && !!run.field[i].human;
  for (let r = 0; r < R; r++) for (let k = 0; k < run.opts.size >> (r + 1); k++) { // a match: its two entry lines, joined at the right
    const m = matchOf(run.opts.size, r, k), y = mid(r, k), s = (unit * (1 << r)) / 4, ends = sides(run, m);
    ends.forEach((i, e) => parts.push(<View key={`${m}${e}`} style={[styles.abs, ink(me(i)), { left: r * colW, top: y + (e ? s : -s) - 1.5, width: colW, height: 3 }]} />));
    parts.push(<View key={`v${m}`} style={[styles.abs, ink(me(won(run, m))), { left: (r + 1) * colW - 1.5, top: y - s - 1.5, width: 3, height: 2 * s + 3 }]} />);
  }
  const champ = run.state === 'champion', y = h / 2;
  parts.push(<View key="out" style={[styles.abs, ink(champ), { left: R * colW, top: y - 1.5, width: colW * 0.3, height: 3 }]} />);
  return <View style={{ width: w, height: h }}>{parts}<View style={[styles.abs, { left: R * colW + colW * 0.3, top: y - 10 }]}><Trophy medal={champ ? medalOf(run.opts) : 0} size={20} /></View></View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  abs: { position: 'absolute' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 8 },
  cup: { fontFamily: FONT.display, fontSize: 20, lineHeight: 24, color: C.chalk, flexShrink: 1 },
  clock: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  clockText: { fontFamily: FONT.bold, fontSize: 13, lineHeight: 16, color: C.chalk, opacity: 0.8, ...TYPE.num },
  pay: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  payText: { fontFamily: FONT.bold, fontSize: 13, lineHeight: 16, color: C.chalk, ...TYPE.num },
  coin: { width: 11, height: 11, borderRadius: 6, backgroundColor: C.gold },
  xp: { minHeight: 26, paddingHorizontal: 9, justifyContent: 'center' },
  bars: { flexDirection: 'row', gap: 2 },
  cups: { flexDirection: 'row', gap: 4, maxWidth: 416 },
  cupKey: { height: 44, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 2 },
  cupKeyName: { fontFamily: FONT.bold, fontSize: 12, lineHeight: 15 },
  lockText: { fontFamily: FONT.bold, fontSize: 11, lineHeight: 13, color: C.chalk, opacity: 0.7 },
  head: { fontFamily: FONT.bold, fontSize: 11, lineHeight: 14, letterSpacing: 0.6, textTransform: 'uppercase', color: C.chalk, opacity: 0.6 },
  prizeNote: { fontFamily: FONT.semi, fontSize: 11.5, lineHeight: 15, color: C.chalk, opacity: 0.75, textAlign: 'center' },
  slot: { height: ROW, borderRadius: 3, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', gap: 4 },
  unknown: { backgroundColor: '#EEF2EA0A', borderWidth: 1, borderStyle: 'dashed', borderColor: '#EEF2EA26' },
  slotName: { fontFamily: FONT.bold, fontSize: 13, lineHeight: 15, flexShrink: 1 },
  score: { minWidth: 18, height: 18, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
  scoreText: { fontFamily: FONT.bold, fontSize: 11, lineHeight: 13, ...TYPE.num },
  card: { padding: 12, gap: 12 },
  end: { fontFamily: FONT.display, fontSize: 26, lineHeight: 30, color: C.chalk, textAlign: 'center' },
  foe: { fontFamily: FONT.display, fontSize: 26, lineHeight: 30, color: C.chalk, flexShrink: 1 },
  nick: { fontFamily: FONT.bold, fontSize: 14, lineHeight: 18, color: C.chalk, opacity: 0.7 },
  abandon: { width: 92, alignItems: 'center', justifyContent: 'center' },
  abandonText: { fontFamily: FONT.bold, fontSize: 13, lineHeight: 16, color: C.chalk, opacity: 0.85 },
});
