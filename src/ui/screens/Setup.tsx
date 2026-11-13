// Quick match and pass and play set up: one option per row on the left, the table they make and Play on the right.
// The opponent is the Rival, who adapts between matches, or a fixed AI tier; each mode keeps its own setup.
import { type ReactNode, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { TIERS } from '../../ai/shot-ai';
import { profile, rivalReset } from '../../progress';
import { MOODS, shown } from '../../progress/rival';
import { NAME_MAX, RACES, RIVAL, type Settings } from '../../settings/settings';
import { C, CREAM, DARK, FONT } from '../../theme';
import type { DailyProps, Props } from '../Menus';
import { MiniTable, rackOf } from '../MiniTable';
import { Panel, Shell, Split, useFrame } from '../shell';
import { BallArt, Key, Keys, Slab, Txt } from '../slab';

const GAMES: [string, 8 | 9][] = [['8-ball', 8], ['9-ball', 9]];
const RACE_KEYS = RACES.map((r): [string, typeof r] => [String(r), r]);

// A row: its label, centred on the key face, then its keys. Under 430 pt wide the label goes above.
function Line({ label, children }: { label: string; children: ReactNode }) {
  const narrow = useFrame().width < 430;
  return (
    <View style={[styles.line, narrow && { flexDirection: 'column', alignItems: 'flex-start', gap: 4 }]}>
      <Txt style={[styles.label, !narrow && { marginBottom: 3 }]}>{label}</Txt>
      <View style={styles.keys}>{children}</View>
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
  const { charges, armed } = daily.chalk, { width, side } = useFrame(), oppW = width < 430 ? Math.floor((width - 2 * side - 24) / 7) : 56; // portrait: all seven on one line
  return (
    <Shell title={quick ? 'Quick match' : 'Pass and play'} back={() => go('home')}>
      <Split panel={
        <Panel head={<>
          <BallArt n={1} size={26} label={quick ? undefined : me.slice(0, 2)} /><Txt numberOfLines={1} style={styles.name}>{me}</Txt>
          <View style={{ flex: 1 }} />
          <Txt numberOfLines={1} style={styles.name}>{opp}</Txt><BallArt n={8} size={26} label={opp[0]} />
        </>} picture={w => <MiniTable width={w} {...rackOf(game)} rings={game === 8 && set.callAll} lit={game === 8 && set.bank ? [0, 1] : undefined} cloth={set.cloth} />}
          cta={{ label: 'Play', name: quick ? 'Play quick match' : 'Play pass and play', onPress: start }} />}>
        <View style={{ gap: 17 }}>
          <View style={styles.group}>
            <Line label="Game"><Keys label="Game" value={game} pick={g => change(quick ? { aiGame: g } : { game: g })} options={GAMES} /></Line>
            <Line label="Race to"><Keys label="Race to" value={quick ? set.aiRace : set.race} pick={r => change(quick ? { aiRace: r } : { race: r })} options={RACE_KEYS} /></Line>
          </View>
          {quick ? <View style={styles.group}>
            <Line label="Opponent">
              <View style={styles.keys} accessibilityRole="radiogroup" accessibilityLabel="Opponent">
                {[RIVAL, ...TIERS.map((_, i) => i)].map(t => {
                  const on = set.tier === t, ink = { color: on ? C.ink : C.chalk };
                  return (
                    <Slab key={t} paint={on ? CREAM : [C.keyOff, 'transparent']} lip={on ? 3 : 0} radius={3} onPress={() => change({ tier: t })} hitSlop={{ top: 4, bottom: 4 }}
                      accessibilityRole="radio" accessibilityLabel={t === RIVAL ? `Rival, rating ${rating}` : TIERS[t].name} accessibilityState={{ checked: on }} aria-checked={on}
                      style={{ marginBottom: on ? 0 : 3 }} face={[styles.opp, { width: oppW }]}>
                      <Txt numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.oppName, ink]}>{t === RIVAL ? 'Rival' : TIERS[t].name}</Txt>
                      {t === RIVAL ? <Txt style={[styles.rating, ink]}>{rating}</Txt>
                        : <View style={styles.bars}>{TIERS.map((_, k) => <View key={k} style={[styles.bar, { backgroundColor: ink.color, opacity: k <= t ? 1 : 0.22 }]} />)}</View>}
                    </Slab>
                  );
                })}
              </View>
            </Line>
            {rival && <Line label="Mood">
              <Keys label="Rival mood" value={set.mood} pick={mood => change({ mood })} options={MOODS.map(m => [m[0].toUpperCase() + m.slice(1), m])} />
              <Slab paint={DARK} lip={3} radius={3} onPress={reset} hitSlop={{ top: 5, bottom: 5, left: 4, right: 4 }} accessibilityLabel={sure ? `Tap again to reset the ${set.aiGame}-ball Rival` : 'Reset Rival rating'} style={{ marginLeft: 8 }} face={styles.reset}>
                <Txt style={styles.resetText}>{sure ? 'Sure?' : 'Reset'}</Txt>
              </Slab>
            </Line>}
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
  label: { width: 76, fontFamily: FONT.bold, fontSize: 11, lineHeight: 14, letterSpacing: 0.6, textTransform: 'uppercase', color: C.chalk, opacity: 0.6 },
  keys: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 4, rowGap: 8, flexShrink: 1 },
  opp: { height: 40, alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 2 },
  oppName: { fontFamily: FONT.bold, fontSize: 12, lineHeight: 14 },
  rating: { fontFamily: FONT.bold, fontSize: 10, lineHeight: 12, opacity: 0.7, fontVariant: ['tabular-nums'] },
  bars: { flexDirection: 'row', gap: 2 },
  bar: { width: 5, height: 3 },
  reset: { height: 28, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
  resetText: { fontFamily: FONT.bold, fontSize: 12, lineHeight: 16, color: C.chalk },
  name: { fontFamily: FONT.display, fontSize: 15, lineHeight: 18, color: C.chalk, flexShrink: 1 },
  cube: { width: 9, height: 9, backgroundColor: C.blue },
  input: { width: 190, maxWidth: '100%', height: 34, paddingHorizontal: 10, borderRadius: 3, backgroundColor: C.chalk + '12', borderBottomWidth: 2, borderBottomColor: C.chalk, color: C.chalk, fontFamily: FONT.bold, fontSize: 13.5 },
});
