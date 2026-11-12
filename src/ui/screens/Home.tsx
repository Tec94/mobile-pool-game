// Home: the hand of the six modes. A tap raises a card and the stage shows it; quick match and pass and play are set
// up and started right on the stage, the others open their own screens.
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { LESSON_PAY, LESSONS, SOLO_RUN } from '../../learn/lessons';
import { PASS_PLAY, profile, rivalReset } from '../../progress';
import { CUE_IDS, CUES } from '../../progress/cues';
import { PACKS } from '../../progress/profile';
import { between, MOODS, shown } from '../../progress/rival';
import { streak, weekday } from '../../daily/daily';
import { isOpen, par, SCENARIOS, starCount, totalStars } from '../../scenarios/scenarios';
import { NAME_MAX, RACES, RIVAL, type Settings } from '../../settings/settings';
import { TIERS } from '../../ai/shot-ai';
import { C, CREAM, FONT, MODE } from '../../theme';
import { dateOf, THEMES } from '../days';
import type { DailyProps, LearnProps, Props, ScenarioProps } from '../Menus';
import { type Card, Hand, Link, Row, Shell, Stage } from '../shell';
import { BallArt, Chip, Keys, Txt } from '../slab';

type HomeProps = Props & LearnProps & ScenarioProps & Omit<DailyProps, 'day'>;
const GAMES: [string, 8 | 9][] = [['8-ball', 8], ['9-ball', 9]];
const raceKeys = RACES.map((r, i): [string, typeof r, string] => [i ? String(r) : `Race to ${r}`, r, String(r)]);
const starLine = (k: number) => `${'★'.repeat(k)}${'☆'.repeat(3 - k)}`;
const ball = (n: number) => (size: number) => <BallArt n={n} size={size} />;

let kept = 0; // the raised card outlives the screen, so a match or a page returns to it
export function Home(p: HomeProps) {
  const { set, go, done, stars, daily, today } = p;
  // The Cues card has no stage: a tap opens the all-cues screen. kept was 5 (Cues) in an older build.
  const [up, setUp] = useState(kept < 5 ? kept : 0), pick = (i: number) => cards[i].key === 'cues' ? go('cues') : (kept = i, setUp(i));
  const me = profile(), wd = THEMES[weekday(today)], k = starCount(daily.stars[today]), run = streak(daily.stars, today).current;
  const next = LESSONS.find(l => !done.includes(l.id));
  const opp = set.tier === RIVAL ? `Rival ${shown(me.rival[set.aiGame].rating)}` : TIERS[set.tier].name;
  const cards: Card[] = [
    { key: 'quick', paint: CREAM, name: 'Quick match', title: 'Quick match', line: `${opp} · ${set.aiGame}-ball`, art: ball(8) },
    { key: 'daily', paint: MODE.daily, name: `Daily Table, ${dateOf(today)}, ${wd}, ${k} of 3 stars${run ? `, run of ${run} days` : ''}`, title: 'Daily Table', line: `${wd} · ${starLine(k)}`, art: ball(2) },
    { key: 'scenarios', paint: MODE.scenarios, name: 'Scenarios', title: 'Scenarios', line: `${totalStars(stars)} of ${3 * SCENARIOS.length} stars`, art: ball(3) },
    { key: 'learn', paint: MODE.learn, name: 'Learn', title: 'Learn', line: next ? `Next: ${next.title}` : 'Every lesson passed', art: ball(4) },
    { key: 'pass', paint: MODE.pass, name: 'Pass and play', title: 'Pass and play', line: 'Two players', art: ball(5) },
    { key: 'cues', paint: MODE.cues, name: 'Cues', title: 'Cues', line: `${CUES[me.cue].name} · ${me.owned.length} of ${CUE_IDS.length}`, art: ball(6) },
  ];
  const Stages = [QuickStage, DailyStage, ScenarioStage, LearnStage, PassStage], S = Stages[up];
  return (
    <Shell settings={() => go('settings')}>
      <S {...p} />
      <Hand cards={cards} up={up} pick={pick} />
    </Shell>
  );
}

// The opponent is the Rival, who adapts between matches, or a fixed AI tier; the setup is kept for next time, as pass
// and play keeps its own. The Rival's rating is always shown: hidden adaptation would make the player doubt every win.
function QuickStage({ set, change: save, go, daily, arm }: HomeProps) {
  const { charges, armed } = daily.chalk;
  const [sure, setSure] = useState(false), s = profile().rival[set.aiGame].rating, names = TIERS.map(t => t.name);
  const change = (p: Partial<Settings>) => { setSure(false); save(p); }; // any change disarms a reset, so one tap never resets another game
  // A reset throws the rating away, so it takes a second tap (no Alert: it does nothing on web).
  const reset = () => { if (sure) rivalReset(set.aiGame); setSure(!sure); };
  const rival = set.tier === RIVAL;
  return (
    <Stage title="Quick match" line={rival ? `Rival ${shown(s)}, ${between(s, names)}. Adapts after each match.` : '8-ball or 9-ball against the AI.'}
      cta={{ label: 'Play', name: 'Play quick match', onPress: () => go('ai') }}>
      <Row>
        <Keys label="Game" value={set.aiGame} pick={aiGame => change({ aiGame })} options={GAMES} />
        <Keys label="Race to" value={set.aiRace} pick={aiRace => change({ aiRace })} options={raceKeys} />
        {charges > 0 && <Keys label="Fresh Chalk" value={armed} pick={arm} options={[['Chalk off', false, 'Off'], ['On, win ×2', true, 'On']]} />}
        {rival && <Link label={sure ? `Tap again: ${set.aiGame}-ball Rival back to ${shown(1)}` : 'Reset Rival rating'} onPress={reset} />}
      </Row>
      <Row>
        <Keys label="Opponent" value={set.tier} pick={tier => change({ tier })} options={[['Rival', RIVAL], ...TIERS.map((t, i): [string, number] => [t.name, i])]} />
        {rival && <Keys label="Rival mood" show="Mood" value={set.mood} pick={mood => change({ mood })} options={MOODS.map(m => [m[0].toUpperCase() + m.slice(1), m])} />}
      </Row>
    </Stage>
  );
}

function PassStage({ set, change, go }: HomeProps) {
  const [names, setNames] = useState(set.names);
  const start = () => { change({ names: names.map((n, i) => n.trim() || `Player ${i + 1}`) as [string, string] }); go('match'); };
  return (
    <Stage title="Pass and play" line={`Two players, one phone. Pays ${PASS_PLAY.xp} XP and ${PASS_PLAY.coins} coins a match.`} cta={{ label: 'Play', name: 'Play pass and play', onPress: start }}>
      <Row gap={10}>
        {names.map((n, i) => (
          <View key={i} style={styles.field}>
            <Txt style={styles.fieldLabel} nativeID={`p${i}`}>Player {i + 1}</Txt>
            <TextInput value={n} onChangeText={t => setNames(i ? [names[0], t] : [t, names[1]])} maxLength={NAME_MAX} autoCorrect={false} autoComplete="off" returnKeyType="done" maxFontSizeMultiplier={1.3}
              selectTextOnFocus accessibilityLabelledBy={`p${i}`} accessibilityLabel={`Player ${i + 1} name`} placeholder={`Player ${i + 1}`} placeholderTextColor={C.chalk + '80'} style={styles.input} />
          </View>
        ))}
      </Row>
      <Row>
        <Keys<Settings['game']> label="Game" value={set.game} pick={game => change({ game })} options={GAMES} />
        <Keys label="Race to" value={set.race} pick={race => change({ race })} options={raceKeys} />
      </Row>
    </Stage>
  );
}

function DailyStage({ go, daily, today, playDay }: HomeProps) {
  const { current, best } = streak(daily.stars, today), k = starCount(daily.stars[today]), wd = THEMES[weekday(today)];
  return (
    <Stage title="Daily Table" line={`${dateOf(today)} · ${wd}. One table a day, the same for everyone.`}
      cta={{ label: 'Play today', name: `Play today, ${wd}`, onPress: () => playDay(today) }} link={{ label: 'All days ›', name: 'All days', onPress: () => go('calendar') }}>
      <Row gap={8}><Chip name={`${k} of 3 stars today`}>{starLine(k)}</Chip><Chip>{`Run ${current}`}</Chip><Chip>{`Best ${best}`}</Chip></Row>
    </Stage>
  );
}

// The next table to play: the first open one not yet cleared, else the first open one short of three stars.
function ScenarioStage({ go, stars, play }: HomeProps) {
  const xp = profile().xp, open = SCENARIOS.map((_, i) => i).filter(i => isOpen(i, stars, xp));
  const i = open.find(i => !((stars[SCENARIOS[i].id] ?? 0) & 1)) ?? open.find(i => starCount(stars[SCENARIOS[i].id]) < 3);
  const all = { label: 'All packs', onPress: () => go('scenarios') };
  if (i === undefined) return <Stage title="Scenarios" line="Every open table has all three stars." cta={all} />;
  const s = SCENARIOS[i], pack = SCENARIOS.filter(t => t.pack === s.pack), got = pack.reduce((n, t) => n + starCount(stars[t.id]), 0);
  return (
    <Stage title={s.title} line={`${PACKS[s.pack][0]} · par ${par(s)} · ${s.say}`} cta={{ label: 'Play', name: `Play ${s.title}`, onPress: () => play(i) }} link={{ ...all, label: 'All packs ›' }}>
      <Row gap={8}><Chip>{`${PACKS[s.pack][0]} ${got} / ${3 * pack.length} ★`}</Chip><Chip>{`All ${totalStars(stars)} / ${3 * SCENARIOS.length} ★`}</Chip></Row>
    </Stage>
  );
}

// Every lesson is open from the start; the first one not yet passed is only a suggestion.
function LearnStage({ go, done, learn }: HomeProps) {
  const i = LESSONS.findIndex(l => !done.includes(l.id)), all = { label: 'All lessons', onPress: () => go('learn') };
  const chips = <Row gap={8}><Chip>{`${done.length} of ${LESSONS.length} passed`}</Chip><Chip>{`+${LESSON_PAY.xp} XP`}</Chip></Row>;
  if (i < 0) return <Stage title="Learn" line="Every lesson passed. Replay any of them." cta={all}>{chips}</Stage>;
  return (
    <Stage title={LESSONS[i].title} line={`Lesson ${i + 1} of ${LESSONS.length}. Watch, then guided, then solo ${SOLO_RUN} in a row.`}
      cta={{ label: 'Start', name: `Start ${LESSONS[i].title}`, onPress: () => learn(i) }} link={{ ...all, label: 'All lessons ›' }}>{chips}</Stage>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fieldLabel: { fontFamily: FONT.bold, fontSize: 11, color: C.chalk, opacity: 0.7 },
  input: { width: 150, height: 34, paddingHorizontal: 10, borderRadius: 3, backgroundColor: C.chalk + '12', borderBottomWidth: 2, borderBottomColor: C.chalk, color: C.chalk, fontFamily: FONT.bold, fontSize: 13.5 },
});
