// The screens around a match: home, the pass and play setup, settings, cues, learn, scenarios and the Daily Table (screens spec,
// s-home, s-passplay, s-prefs, s-learn).
// shortcut: only what works today is on them. Quick match, practice, career and the other settings of
// the spec come with the work that makes them play.
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LESSON_PAY, LESSONS, SOLO_RUN } from '../learn/lessons';
import { keep, profile } from '../progress';
import { addMonths, type Daily, monthGrid, streak, weekday } from '../daily/daily';
import { isOpen, par, SCENARIOS, starCount, type Stars, totalStars } from '../scenarios/scenarios';
import { CUE_IDS, CUES, type CueId, type CueInfo, specLine, specs } from '../progress/cues';
import { masteryLevel, masteryOf, STATS, statsOf, tunable, tuneDown, tuneUp, upCost, used, points } from '../progress/mastery';
import { buy, FEATS, featCount, type FeatId, levelOf, PACKS, select, type Profile } from '../progress/profile';
import { NAME_MAX, RACES, Settings } from '../settings/settings';
import { C, CLOTHS } from '../theme';
import { Btn } from './Btn';

export type Screen = 'home' | 'pass' | 'settings' | 'cues' | 'learn' | 'scenarios' | 'calendar';
interface Props { set: Settings; change: (s: Partial<Settings>) => void; go: (to: Screen | 'match') => void }
interface LearnProps { done: string[]; learn: (lesson: number) => void }
interface ScenarioProps { stars: Stars; play: (scenario: number) => void }
interface DailyProps { daily: Daily; today: string; day: string; playDay: (day: string) => void }

// A setting: its name, an optional line on what it does, and one button for each value.
function Row<T>({ label, note, value, pick, options }: { label: string; note?: string; value: T; pick: (v: T) => void; options: [string, T][] }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text maxFontSizeMultiplier={1.3} style={styles.label}>{label}</Text>
        {note && <Text maxFontSizeMultiplier={1.3} style={styles.note}>{note}</Text>}
      </View>
      <View style={styles.seg} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map(([name, v]) => <Btn key={name} label={name} on={v === value} onPress={() => pick(v)} />)}
      </View>
    </View>
  );
}

function Page({ title, back, children }: { title: string; back?: () => void; children: React.ReactNode }) {
  const pad = useSafeAreaInsets();
  return (
    <ScrollView style={styles.page} contentContainerStyle={[styles.body, { paddingTop: pad.top + 16, paddingBottom: pad.bottom + 16, paddingLeft: pad.left + 16, paddingRight: pad.right + 16 }]} keyboardShouldPersistTaps="handled">
      <View style={styles.top}>
        {back && <Btn label="‹" name="Back" onPress={back} />}
        <Text maxFontSizeMultiplier={1.3} accessibilityRole="header" style={styles.title}>{title}</Text>
      </View>
      {children}
    </ScrollView>
  );
}

export function Menus({ screen, set, change, go, done, learn, stars, play, daily, today, day, playDay }: Props & LearnProps & ScenarioProps & DailyProps & { screen: Screen }) {
  if (screen === 'pass') return <PassPlay set={set} change={change} go={go} />;
  if (screen === 'settings') return <SettingsPage set={set} change={change} go={go} />;
  if (screen === 'cues') return <Cues go={go} />;
  if (screen === 'learn') return <Learn go={go} done={done} learn={learn} />;
  if (screen === 'scenarios') return <Scenarios go={go} stars={stars} play={play} />;
  if (screen === 'calendar') return <Calendar go={go} daily={daily} today={today} day={day} playDay={playDay} />;
  const next = LESSONS.find(l => !done.includes(l.id)), run = streak(daily.stars, today).current, k = starCount(daily.stars[today]);
  return (
    <Page title="Pool">
      <Btn label={`Daily Table\n${dateOf(today)} · ${THEMES[weekday(today)]} · ${'★'.repeat(k)}${'☆'.repeat(3 - k)}${run ? ` · run ${run}` : ''}`}
        name={`Daily Table, ${dateOf(today)}, ${THEMES[weekday(today)]}, ${k} of 3 stars${run ? `, run of ${run} days` : ''}`} onPress={() => go('calendar')} />
      <Text maxFontSizeMultiplier={1.3} style={styles.note}>{`Fresh Chalk: ${daily.chalk.charges} · will double a win against the computer`}</Text>
      <Btn label={'Pass and play\nTwo players, one phone'} name="Pass and play" onPress={() => go('pass')} />
      <Btn label={`Learn\n${next ? `Next: ${next.title}` : 'Every lesson passed'}`} name="Learn" onPress={() => go('learn')} />
      <Btn label={`Scenarios\n${totalStars(stars)} of ${3 * SCENARIOS.length} stars`} name="Scenarios" onPress={() => go('scenarios')} />
      <Btn label="Cues" onPress={() => go('cues')} />
      <Btn label="Settings" onPress={() => go('settings')} />
    </Page>
  );
}

function PassPlay({ set, change, go }: Props) {
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

// Every lesson is open from the start; the first one not yet passed is only a suggestion.
function Learn({ go, done, learn }: Pick<Props, 'go'> & LearnProps) {
  const next = LESSONS.findIndex(l => !done.includes(l.id));
  return (
    <Page title="Learn" back={() => go('home')}>
      <Text maxFontSizeMultiplier={1.3} style={styles.note}>{`Every lesson is open. Each is watch, then guided, then solo: ${SOLO_RUN} in a row to pass. The first pass pays ${LESSON_PAY.xp} XP. ${done.length} of ${LESSONS.length} done.`}</Text>
      {LESSONS.map((l, i) => {
        const passed = done.includes(l.id);
        return <Btn key={l.id} label={`${passed ? '✓' : i + 1}  ${l.title}\n${passed ? 'Done · replay any time' : i === next ? 'Suggested next' : 'Open'}`} name={`Lesson ${i + 1}, ${l.title}, ${passed ? 'done' : 'open'}`} onPress={() => learn(i)} />;
      })}
    </Page>
  );
}

// The packs in level order. A pack opens at its level; in it a clear opens the next two tables.
function Scenarios({ go, stars, play }: Pick<Props, 'go'> & ScenarioProps) {
  const { xp } = profile(), { level } = levelOf(xp);
  return (
    <Page title="Scenarios" back={() => go('home')}>
      <Text maxFontSizeMultiplier={1.3} style={styles.note}>Stars: clear it, clear it within par tries, clear it with the aim guide off. Each new star pays 30 coins and XP; harder tables pay more.</Text>
      {PACKS.map(([name, at], p) => (
        <View key={name} style={styles.body}>
          <Text maxFontSizeMultiplier={1.3} accessibilityRole="header" style={styles.label}>{level >= at ? name : `${name} · opens at level ${at}`}</Text>
          {level >= at && SCENARIOS.map((s, i) => {
            if (s.pack !== p) return null;
            const k = starCount(stars[s.id]), open = isOpen(i, stars, xp);
            return <Btn key={s.id} off={!open} label={`${s.title}  ${'★'.repeat(k)}${'☆'.repeat(3 - k)}\n${open ? `Par ${par(s)} · ${s.say}` : 'Clear one of the two before'}`}
              name={`${s.title}, ${k} of 3 stars, ${open ? 'open' : 'locked'}`} onPress={() => play(i)} />;
          })}
        </View>
      ))}
    </Page>
  );
}

// The Daily Table's weekday themes, Sunday first, as THEME in daily/daily.ts.
const THEMES = ['Trick shot', 'Pots', 'Cut shots', 'Banks', 'Position', 'Combos', 'Kicks and safeties'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = (k: string) => MONTHS[+k.slice(5, 7) - 1];
const dateOf = (k: string) => `${DAYS[weekday(k)].slice(0, 3)} ${+k.slice(8, 10)} ${monthName(k).slice(0, 3)}`; // Wed 11 Nov

// A month of daily tables. Every day from the first one opened to today plays at full pay; the grid is Monday first.
// It opens on the month of day, the day last played, so coming back from a table keeps its month.
function Calendar({ go, daily, today, day, playDay }: Pick<Props, 'go'> & DailyProps) {
  const [month, setMonth] = useState(day.slice(0, 7)), { current, best } = streak(daily.stars, today);
  const cells = monthGrid(month), weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(7 * w, 7 * w + 7));
  return (
    <Page title="Daily Table" back={() => go('home')}>
      <Text maxFontSizeMultiplier={1.3} style={styles.label}>{`Run ${current} · best ${best}`}</Text>
      <Text maxFontSizeMultiplier={1.3} style={styles.note}>One table a day, the same for everyone. Any day on the calendar can be played for its stars.</Text>
      <Btn label={`Play today\n${dateOf(today)} · ${THEMES[weekday(today)]}`} name={`Play today, ${THEMES[weekday(today)]}`} onPress={() => playDay(today)} />
      <View style={styles.top}>
        <Btn label="‹" name="Previous month" off={month <= daily.firstDay.slice(0, 7)} onPress={() => setMonth(addMonths(month, -1))} />
        <Text maxFontSizeMultiplier={1.3} accessibilityRole="header" style={[styles.label, styles.month]}>{`${monthName(month)} ${month.slice(0, 4)}`}</Text>
        <Btn label="›" name="Next month" off={month >= today.slice(0, 7)} onPress={() => setMonth(addMonths(month, 1))} />
      </View>
      <View style={styles.grid}>
        <View style={styles.week} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <Text key={i} maxFontSizeMultiplier={1.3} style={[styles.note, styles.cell]}>{d}</Text>)}
        </View>
        {weeks.map((w, i) => (
          <View key={i} style={styles.week}>
            {w.map((k, j) => {
              if (!k) return <View key={j} style={styles.cell} />;
              const open = k >= daily.firstDay && k <= today, n = starCount(daily.stars[k]);
              return (
                <Pressable key={k} disabled={!open} onPress={() => playDay(k)} accessibilityRole="button" accessibilityState={{ disabled: !open }}
                  accessibilityLabel={`${DAYS[weekday(k)]} ${+k.slice(8, 10)} ${monthName(k)}${open ? `, ${n} of 3 stars` : ''}${k === today ? ', today' : ''}`}
                  style={({ pressed }) => [styles.cell, styles.day, k === today && styles.today, { opacity: open ? (pressed ? 0.6 : 1) : 0.3 }]}>
                  <Text maxFontSizeMultiplier={1.2} style={styles.label}>{+k.slice(8, 10)}</Text>
                  <Text maxFontSizeMultiplier={1.2} style={styles.stars}>{n ? `${'★'.repeat(n)}${'☆'.repeat(3 - n)}` : ' '}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </Page>
  );
}

function SettingsPage({ set, change, go }: Props) {
  return (
    <Page title="Settings" back={() => go('home')}>
      <Row label="Shot calling" note="8-ball. WPA: tap the pocket first for a bank or a combination. 8 only: every pot counts" value={set.callAll} pick={callAll => change({ callAll })} options={[['WPA', true], ['8 only', false]]} />
      <Row label="Table felt" value={set.cloth} pick={cloth => change({ cloth })} options={CLOTHS.map((c, i) => [c.name, i])} />
      <Row<Settings['orient']> label="Orientation" note="Auto follows the phone, even mid-match" value={set.orient} pick={orient => change({ orient })} options={[['Auto', 0], ['Portrait', 1], ['Landscape', 2]]} />
    </Page>
  );
}

// The cue rack: level, XP and coins, then each cue with its stats, perk and how to get it. Owned cues can be picked.
// shortcut: pass and play stays on House Cue stats, so the pick only counts once a mode with own cues lands.
function Cues({ go }: Pick<Props, 'go'>) {
  const [p, setP] = useState(profile), { level, into, need } = levelOf(p.xp);
  const put = (next: Profile) => { if (next !== p) { keep(next); setP(next); } };
  return (
    <Page title="Cues" back={() => go('home')}>
      <Text maxFontSizeMultiplier={1.3} style={styles.label}>{`Level ${level} · ${need ? `${need - into} XP to level ${level + 1}` : 'top level'} · ${p.coins} coins`}</Text>
      <Text maxFontSizeMultiplier={1.3} style={styles.note}>Pass and play is a matched game: both players use House Cue stats.</Text>
      {/* The Use buttons are radios: one group for the cue in use. */}
      <View style={styles.body} accessibilityRole="radiogroup" accessibilityLabel="Cue in use">
        {CUE_IDS.map(id => <CueRow key={id} id={id} p={p} put={put} />)}
      </View>
    </Page>
  );
}

function CueRow({ id, p, put }: { id: CueId; p: Profile; put: (p: Profile) => void }) {
  const c: CueInfo = CUES[id], owned = p.owned.includes(id), f = c.feat as FeatId | undefined, feat = f && FEATS[f], done = f ? featCount(p, f) : 0;
  const m = masteryOf(p, id), stats = statsOf(id, m);
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text maxFontSizeMultiplier={1.3} style={styles.label}>{c.name}</Text>
        <Text maxFontSizeMultiplier={1.3} style={styles.note}>{specLine(specs(id, stats))}</Text>
        {owned && <Mastery id={id} p={p} put={put} />}
        {c.perk && <Text maxFontSizeMultiplier={1.3} style={styles.note}>{c.perk}</Text>}
        {!owned && feat && <>
          <Text maxFontSizeMultiplier={1.3} style={styles.note}>{`${feat.name} ${done}/${feat.count}`}</Text>
          <View style={styles.bar}><View style={[styles.fill, { width: `${100 * done / feat.count}%` }]} /></View>
        </>}
        {!owned && c.level && <Text maxFontSizeMultiplier={1.3} style={styles.note}>{`Reach level ${c.level}`}</Text>}
        {!owned && c.get && <Text maxFontSizeMultiplier={1.3} style={styles.note}>{c.get}</Text>}
      </View>
      {owned ? <Btn label={p.cue === id ? 'In use' : 'Use'} name={`Use ${c.name}`} on={p.cue === id} onPress={() => put(select(p, id))} />
        : c.price !== undefined && <Btn label={`${c.price} coins`} name={`Buy ${c.name} for ${c.price} coins`} off={p.coins < c.price} onPress={() => put(buy(p, id))} />}
    </View>
  );
}

// A cue's mastery: its level and cue XP, and once it has points, a - and + for each stat. The spec lines above show
// the tuned numbers. Points move for free; a point past the paid ones costs the next step.
function Mastery({ id, p, put }: { id: CueId; p: Profile; put: (p: Profile) => void }) {
  const m = masteryOf(p, id), { level, into, need } = masteryLevel(m.xp), pts = points(m), free = pts - used(m);
  const head = `Mastery ${level}${need ? ` · ${need - into} cue XP to ${level + 1}` : ' · mastered'}`;
  if (!tunable(id)) return <Text maxFontSizeMultiplier={1.3} style={styles.note}>{`${head} · cannot be tuned`}</Text>;
  const cost = STATS.map(s => upCost(p, id, s)).find(x => x !== null);
  const next = !pts ? 'Mastery 2 gives a tuning point' : !free ? 'Every point in use' : cost === undefined ? 'No stat has room for more' : cost ? `Next point: ${cost} coins` : `${free} point${free > 1 ? 's' : ''} to place`;
  return <>
    <Text maxFontSizeMultiplier={1.3} style={styles.note}>{`${head} · ${next}`}</Text>
    {pts > 0 && <View style={[styles.seg, styles.wrap]}>
      {STATS.map(s => {
        const name = s[0].toUpperCase() + s.slice(1), up = upCost(p, id, s);
        return <View key={s} style={styles.tune}>
          <Btn label="−" name={`${name} down on ${CUES[id].name}`} off={!m[s]} onPress={() => put(tuneDown(p, id, s))} />
          <Text maxFontSizeMultiplier={1.3} style={[styles.note, styles.stat]}>{`${name} ${m[s] ? `+${m[s]}` : '0'}`}</Text>
          <Btn label="+" name={`${name} up on ${CUES[id].name}${up ? ` for ${up} coins` : ''}`} off={up === null || p.coins < up} onPress={() => put(tuneUp(p, id, s))} />
        </View>;
      })}
    </View>}
  </>;
}

const styles = StyleSheet.create({
  wrap: { flexWrap: 'wrap', marginTop: 4 },
  stat: { minWidth: 64, textAlign: 'center' },
  tune: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  page: { flex: 1, backgroundColor: C.ground },
  body: { gap: 12, width: '100%', maxWidth: 560, alignSelf: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  title: { color: C.chalk, fontSize: 28, fontWeight: '800' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderColor: C.chalk + '26' },
  rowText: { flex: 1, minWidth: 160, gap: 2 },
  label: { color: C.chalk, fontSize: 15, fontWeight: '600' },
  note: { color: C.chalk, fontSize: 13, lineHeight: 17, opacity: 0.75 },
  seg: { flexDirection: 'row', gap: 6 },
  field: { gap: 6 },
  bar: { height: 4, marginTop: 4, borderRadius: 2, backgroundColor: C.chalk + '26' },
  fill: { height: 4, borderRadius: 2, backgroundColor: C.accent },
  month: { flex: 1, textAlign: 'center' },
  grid: { gap: 4 },
  week: { flexDirection: 'row', gap: 4 },
  cell: { flex: 1, textAlign: 'center' },
  day: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.chalk + '66', borderRadius: 6 },
  today: { borderColor: C.accent, backgroundColor: C.accent + '33' },
  stars: { color: C.chalk, fontSize: 11, lineHeight: 14 },
  input: { color: C.chalk, fontSize: 16, minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: C.chalk + '66', borderRadius: 6 },
});
