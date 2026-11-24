// Quick match and pass and play set up: one option per row on the left, the table they make and Play on the right.
// The opponent is the Rival, who adapts between matches, or a fixed AI tier; each mode keeps its own setup.
import { type ReactNode, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { MASTERS, TIERS } from '../../ai/shot-ai';
import { profile, rivalReset } from '../../progress';
import { matchPay } from '../../progress/pay';
import { MOODS, shown } from '../../progress/rival';
import { NAME_MAX, RACES, RIVAL, type Settings } from '../../settings/settings';
import { C, CREAM, DARK, FONT, SEAL } from '../../theme';
import type { DailyProps, Props } from '../Menus';
import { MiniTable, rackOf } from '../MiniTable';
import { Panel, Shell, Split, useFrame, usePanel } from '../shell';
import { BallArt, Key, Keys, num, Slab, Txt } from '../slab';

const GAMES: [string, 8 | 9][] = [['8-ball', 8], ['9-ball', 9]];
const LABEL = 76;
const RACE_KEYS = RACES.map((r): [string, typeof r] => [String(r), r]);
const TOP = MASTERS - 1, WIN = matchPay({ tier: MASTERS, won: true, fouls: 0 }); // the Chinese Masters' index in TIERS; what a win pays at most (no fouls)

// A row: its label, centred on the key face, then its keys. Under 430 pt wide the label goes above, and note at its right.
// The keys' box has a set width and stretches its child: on a phone, Yoga sizes a wrapping row that shrinks to its
// keys a fraction too narrow, so the last key wraps, and gives the row one line's height, so rows overlap.
export function Line({ label, note, children }: { label: string; note?: ReactNode; children: ReactNode }) {
  const { width, side, land } = useFrame(), narrow = width < 430, panel = usePanel();
  return (
    <View style={[styles.line, narrow && { flexDirection: 'column', alignItems: 'stretch', gap: 4 }]}>
      {narrow && note ? <View style={styles.line}><Txt style={[styles.label, { flex: 1 }]}>{label}</Txt>{note}</View>
        : <Txt style={[styles.label, !narrow && { marginBottom: 3 }]}>{label}</Txt>}
      <View style={!narrow && { width: width - 2 * side - LABEL - (land ? panel + 16 : 0) }}>{children}</View>
    </View>
  );
}

let typed: [string, string] | undefined; // the names being typed outlive a page change
export function Setup({ mode, set, change: save, go, daily, arm }: Props & Pick<DailyProps, 'daily' | 'arm'> & { mode: 'quick' | 'pass' }) {
  const quick = mode === 'quick', [sure, setSure] = useState(false), [names, setTyped] = useState(typed ?? set.names);
  const change = (p: Partial<Settings>) => { setSure(false); save(p); }; // any change disarms a reset, so one tap never resets another game
  const reset = () => { if (sure) rivalReset(set.aiGame); setSure(!sure); }; // a reset throws the rating away: a second tap (no Alert: it does nothing on web)
  const setNames = (v: [string, string]) => { typed = v; setTyped(v); };
  const game = quick ? set.aiGame : set.game, rival = set.tier === RIVAL, rating = shown(profile().rival[set.aiGame].rating);
  const opp = quick ? (rival ? `Rival ${rating}` : TIERS[set.tier].name) : names[1].trim() || 'Player 2', me = quick ? 'You' : names[0].trim() || 'Player 1';
  const start = () => { if (quick) return go('ai'); change({ names: names.map((n, i) => n.trim() || `Player ${i + 1}`) as [string, string] }); go('match'); };
  const { charges, armed } = daily.chalk, narrow = useFrame().width < 430;
  // What a Masters win pays, where it adds no height: beside the Opponent label on a phone, else in the panel's free space.
  const pays = quick && set.tier === TOP && <Txt numberOfLines={narrow ? 1 : 2} style={[styles.note, !narrow && { textAlign: 'center' }]}>Win pays up to{narrow ? ' ' : '\n'}<Txt style={{ color: C.gold }}>{`${num(WIN.xp)} XP · ${num(WIN.coins)} coins`}</Txt></Txt>;
  return (
    <Shell title={quick ? 'Quick match' : 'Pass and play'} back={() => go('home')}>
      <Split panel={
        <Panel head={<>
          <BallArt n={1} size={26} label={quick ? undefined : me.slice(0, 2)} /><Txt numberOfLines={1} style={[styles.name, quick && { flexShrink: 0 }]}>{me}</Txt>
          <View style={{ flex: 1 }} />
          <Txt numberOfLines={2} style={[styles.name, { textAlign: 'right' }]}>{opp}</Txt><BallArt n={8} size={26} label={opp[0]} />
        </>} picture={w => <MiniTable width={w} {...rackOf(game)} rings={game === 8 && set.callAll} lit={game === 8 && set.bank ? [0, 1] : undefined} cloth={set.cloth} />}
          cta={{ label: 'Play', name: quick ? 'Play quick match' : 'Play pass and play', onPress: start }}>{!narrow && pays}</Panel>}>
        <View style={{ gap: 17 }}>
          <View style={styles.group}>
            <Line label="Game"><Keys label="Game" value={game} pick={g => change(quick ? { aiGame: g } : { game: g })} options={GAMES} /></Line>
            <Line label="Race to"><Keys label="Race to" value={quick ? set.aiRace : set.race} pick={r => change(quick ? { aiRace: r } : { race: r })} options={RACE_KEYS} /></Line>
          </View>
          {quick ? <View style={styles.group}>
            <Line label="Opponent" note={narrow && pays}>
              <View style={styles.opps} accessibilityRole="radiogroup" accessibilityLabel="Opponent">
                {[RIVAL, ...TIERS.map((_, i) => i)].map(t => {
                  // The Masters chip is off the ladder: seal red (cream on its red lip when picked), set apart, its name on two lines and no bars.
                  const on = set.tier === t, top = t === TOP, ink = { color: on ? (top ? SEAL[1] : C.ink) : C.chalk };
                  return (
                    <Slab key={t} paint={on ? (top ? [CREAM[0], SEAL[1]] : CREAM) : top ? SEAL : [C.keyOff, 'transparent']} lip={on ? 3 : 0} radius={3} onPress={() => change({ tier: t })} hitSlop={{ top: 4, bottom: 4 }}
                      accessibilityRole="radio" accessibilityLabel={t === RIVAL ? `Rival, rating ${rating}` : TIERS[t].name} accessibilityState={{ checked: on }} aria-checked={on}
                      style={{ flexGrow: 1, marginBottom: on ? 0 : 3, marginLeft: top ? 4 : 0 }} face={styles.opp}>
                      <Txt numberOfLines={top ? 2 : 1} style={[styles.oppName, ink, top && styles.two]}>{t === RIVAL ? 'Rival' : top ? TIERS[t].name.replace(' ', '\n') : TIERS[t].name}</Txt>
                      {t === RIVAL ? <Txt style={[styles.rating, ink]}>{rating}</Txt>
                        : !top && <View style={styles.bars}>{TIERS.slice(0, TOP).map((_, k) => <View key={k} style={[styles.bar, { backgroundColor: ink.color, opacity: k <= t ? 1 : 0.22 }]} />)}</View>}
                    </Slab>
                  );
                })}
              </View>
            </Line>
            {rival && <Line label="Mood"><View style={styles.line}>
              <View style={{ flex: 1 }}><Keys label="Rival mood" value={set.mood} pick={mood => change({ mood })} options={MOODS.map(m => [m[0].toUpperCase() + m.slice(1), m])} /></View>
              <Slab paint={DARK} lip={3} radius={3} onPress={reset} hitSlop={{ top: 5, bottom: 5, left: 4, right: 4 }} accessibilityLabel={sure ? `Tap again to reset the ${set.aiGame}-ball Rival` : 'Reset Rival rating'} style={{ marginLeft: 8 }} face={styles.reset}>
                <Txt style={styles.resetText}>{sure ? 'Sure?' : 'Reset'}</Txt>
              </Slab>
            </View></Line>}
          </View> : <View style={styles.group}>
            {names.map((n, i) => (
              <Line key={i} label={`Player ${i + 1}`}>
                <TextInput value={n} onChangeText={t => setNames(i ? [names[0], t] : [t, names[1]])} maxLength={NAME_MAX} autoCorrect={false} autoCapitalize="words" autoComplete="off" returnKeyType="done" maxFontSizeMultiplier={1.3}
                  selectTextOnFocus accessibilityLabel={`Player ${i + 1} name`} placeholder={`Player ${i + 1}`} placeholderTextColor={C.chalk + '80'} style={styles.input} />
              </Line>
            ))}
          </View>}
          {game === 8 && <View style={styles.group}>
            <Line label="Call"><Keys label="Call" value={set.callAll} pick={callAll => change({ callAll })} options={[['Every shot', true], ['Only the 8-ball', false]]} /></Line>
            <Line label="Bank shots"><Keys<Settings['bank']> label="Bank shots" value={set.bank} pick={bank => change({ bank })} options={[['Off', 0], ['8-ball only', 1], ['Every ball', 2]]} /></Line>
          </View>}
          {quick && charges > 0 && <Line label="Chalk">
            <View style={styles.keys} accessibilityRole="radiogroup" accessibilityLabel="Fresh Chalk">
              <Key label="Off" name="Chalk off" on={!armed} onPress={() => arm(false)} />
              <Key label="Win pays ×2" name="Chalk on: win pays double" on={armed} onPress={() => arm(true)} icon={<View style={styles.cube} />} />
            </View>
          </Line>}
        </View>
      </Split>
    </Shell>
  );
}

const styles = StyleSheet.create({
  group: { gap: 9 },
  line: { flexDirection: 'row', alignItems: 'center' },
  label: { width: LABEL, fontFamily: FONT.bold, fontSize: 11, lineHeight: 14, letterSpacing: 0.6, textTransform: 'uppercase', color: C.chalk, opacity: 0.6 },
  keys: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 4, rowGap: 8 },
  opps: { flexDirection: 'row', gap: 4, maxWidth: 452 }, // eight keys on one line, each as wide as its name and the room left shared: 306 pt in all, so they fit 315 on a 667 pt landscape phone
  opp: { height: 40, alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 1 },
  oppName: { fontFamily: FONT.bold, fontSize: 10, lineHeight: 13 },
  two: { lineHeight: 12, textAlign: 'center' },
  note: { fontFamily: FONT.bold, fontSize: 12, lineHeight: 14, color: C.chalk + 'B3' },
  rating: { fontFamily: FONT.bold, fontSize: 10, lineHeight: 12, opacity: 0.7, fontVariant: ['tabular-nums'] },
  bars: { flexDirection: 'row', gap: 2 },
  bar: { width: 3, height: 3 }, // six to a key: 28 pt, no wider than the names
  reset: { height: 28, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
  resetText: { fontFamily: FONT.bold, fontSize: 12, lineHeight: 16, color: C.chalk },
  name: { fontFamily: FONT.display, fontSize: 15, lineHeight: 18, color: C.chalk, flexShrink: 1 },
  cube: { width: 9, height: 9, backgroundColor: C.blue },
  input: { width: 190, maxWidth: '100%', height: 34, paddingHorizontal: 10, borderRadius: 3, backgroundColor: C.chalk + '12', borderBottomWidth: 2, borderBottomColor: C.chalk, color: C.chalk, fontFamily: FONT.bold, fontSize: 13.5 },
});
