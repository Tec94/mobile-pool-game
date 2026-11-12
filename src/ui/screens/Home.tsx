import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { LESSONS } from '../../learn/lessons';
import { profile, rivalReset } from '../../progress';
import { between, MOODS, shown } from '../../progress/rival';
import { streak, weekday } from '../../daily/daily';
import { SCENARIOS, starCount, totalStars } from '../../scenarios/scenarios';
import { NAME_MAX, RACES, RIVAL, type Settings } from '../../settings/settings';
import { TIERS } from '../../ai/shot-ai';
import { C } from '../../theme';
import { Btn } from '../Btn';
import { dateOf, THEMES } from '../days';
import type { DailyProps, LearnProps, Props, ScenarioProps } from '../Menus';
import { Page, Row, styles } from './legacy';

export function Home({ set, change, go, done, stars, daily, today }: Props & Pick<LearnProps, 'done'> & Pick<ScenarioProps, 'stars'> & Pick<DailyProps, 'daily' | 'today'>) {
  const next = LESSONS.find(l => !done.includes(l.id)), run = streak(daily.stars, today).current, k = starCount(daily.stars[today]);
  return (
    <Page title="Pool">
      <Btn label={'Quick match\n8-ball or 9-ball against the AI'} name="Quick match" onPress={() => go('quick')} />
      <Btn label={`Daily Table\n${dateOf(today)} · ${THEMES[weekday(today)]} · ${'★'.repeat(k)}${'☆'.repeat(3 - k)}${run ? ` · run ${run}` : ''}`}
        name={`Daily Table, ${dateOf(today)}, ${THEMES[weekday(today)]}, ${k} of 3 stars${run ? `, run of ${run} days` : ''}`} onPress={() => go('calendar')} />
      <Text maxFontSizeMultiplier={1.3} style={styles.note}>{`Fresh Chalk: ${daily.chalk.charges}${daily.chalk.armed ? ', one armed' : ''} · doubles the match pay of a quick match win`}</Text>
      <Btn label={'Pass and play\nTwo players, one phone'} name="Pass and play" onPress={() => go('pass')} />
      <Btn label={`Learn\n${next ? `Next: ${next.title}` : 'Every lesson passed'}`} name="Learn" onPress={() => go('learn')} />
      <Btn label={`Scenarios\n${totalStars(stars)} of ${3 * SCENARIOS.length} stars`} name="Scenarios" onPress={() => go('scenarios')} />
      <Btn label="Cues" onPress={() => go('cues')} />
      <Btn label="Settings" onPress={() => go('settings')} />
    </Page>
  );
}

export function PassPlay({ set, change, go }: Props) {
  const [names, setNames] = useState(set.names);
  const start = () => { change({ names: names.map((n, i) => n.trim() || `Player ${i + 1}`) as [string, string] }); go('match'); };
  return (
    <Page title="Pass and play" back={() => go('home')}>
      {names.map((n, i) => (
        <View key={i} style={styles.field}>
          <Text maxFontSizeMultiplier={1.3} style={styles.label} nativeID={`p${i}`}>Player {i + 1}</Text>
          <TextInput value={n} onChangeText={t => setNames(i ? [names[0], t] : [t, names[1]])} maxLength={NAME_MAX} autoCorrect={false} autoComplete="off" returnKeyType="done"
            selectTextOnFocus accessibilityLabelledBy={`p${i}`} accessibilityLabel={`Player ${i + 1} name`} placeholder={`Player ${i + 1}`} placeholderTextColor={C.chalk + '80'} style={styles.input} />
        </View>
      ))}
      <Row<Settings['game']> label="Game" value={set.game} pick={game => change({ game })} options={[['8-ball', 8], ['9-ball', 9]]} />
      <Row label="Race to" note="Frames to win. The break alternates" value={set.race} pick={race => change({ race })} options={RACES.map(r => [String(r), r])} />
      <Btn label="Rack them up" onPress={start} />
    </Page>
  );
}

// The opponent is the Rival, who adapts between matches, or a fixed AI tier; the setup is kept for next time, as pass
// and play keeps its own. The Rival's rating is always shown: hidden adaptation would make the player doubt every win.
export function QuickMatch({ set, change: save, go, daily, arm }: Props & Pick<DailyProps, 'daily' | 'arm'>) {
  const { charges, armed } = daily.chalk;
  const [sure, setSure] = useState(false), s = profile().rival[set.aiGame].rating, names = TIERS.map(t => t.name);
  const change = (p: Partial<Settings>) => { setSure(false); save(p); }; // any change disarms a reset, so one tap never resets another game
  // A reset throws the rating away, so it takes a second tap (no Alert: it does nothing on web).
  const reset = () => { if (sure) rivalReset(set.aiGame); setSure(!sure); };
  return (
    <Page title="Quick match" back={() => go('home')}>
      <Row<Settings['aiGame']> label="Game" note="9-ball: hit the lowest ball first. Potting the 9 wins" value={set.aiGame} pick={aiGame => change({ aiGame })} options={[['8-ball', 8], ['9-ball', 9]]} />
      <Row label="Opponent" note={set.tier === RIVAL ? `Rival ${shown(s)}, ${between(s, names)}. Adapts after each match` : undefined} value={set.tier} pick={tier => change({ tier })} options={[['Rival', RIVAL], ...TIERS.map((t, i): [string, number] => [t.name, i])]} />
      {set.tier === RIVAL && <Row label="Rival mood" note="How often you should win once the rating settles" value={set.mood} pick={mood => change({ mood })} options={MOODS.map(m => [m[0].toUpperCase() + m.slice(1), m])} />}
      {set.tier === RIVAL && <Btn label={sure ? `Tap again: ${set.aiGame}-ball Rival back to ${shown(1)}` : 'Reset Rival rating'} onPress={reset} />}
      <Row label="Race to" note="Frames to win. The break alternates" value={set.aiRace} pick={aiRace => change({ aiRace })} options={RACES.map(r => [String(r), r])} />
      {charges > 0 && <Row label="Fresh Chalk" note={`${charges} left. Doubles the match pay of your next win, and stays on through a loss`} value={armed} pick={arm} options={[['Off', false], ['On', true]]} />}
      <Btn label="Rack them up" onPress={() => go('ai')} />
    </Page>
  );
}
