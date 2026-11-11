// The screens around a match: home, the pass and play setup, settings, cues, learn and scenarios (screens spec,
// s-home, s-passplay, s-prefs, s-learn).
// shortcut: only what works today is on them. Quick match, practice, career and the other settings of
// the spec come with the work that makes them play.
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LESSON_PAY, LESSONS, SOLO_RUN } from '../learn/lessons';
import { keep, profile } from '../progress';
import { isOpen, par, SCENARIOS, starCount, type Stars, totalStars } from '../scenarios/scenarios';
import { CUE_IDS, CUES, type CueId, type CueInfo } from '../progress/cues';
import { buy, FEATS, featCount, type FeatId, levelOf, PACKS, select, type Profile } from '../progress/profile';
import { NAME_MAX, RACES, Settings } from '../settings/settings';
import { C, CLOTHS } from '../theme';
import { Btn } from './Btn';

export type Screen = 'home' | 'pass' | 'settings' | 'cues' | 'learn' | 'scenarios';
interface Props { set: Settings; change: (s: Partial<Settings>) => void; go: (to: Screen | 'match') => void }
interface LearnProps { done: string[]; learn: (lesson: number) => void }
interface ScenarioProps { stars: Stars; play: (scenario: number) => void }

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

export function Menus({ screen, set, change, go, done, learn, stars, play }: Props & LearnProps & ScenarioProps & { screen: Screen }) {
  if (screen === 'pass') return <PassPlay set={set} change={change} go={go} />;
  if (screen === 'settings') return <SettingsPage set={set} change={change} go={go} />;
  if (screen === 'cues') return <Cues go={go} />;
  if (screen === 'learn') return <Learn go={go} done={done} learn={learn} />;
  if (screen === 'scenarios') return <Scenarios go={go} stars={stars} play={play} />;
  const next = LESSONS.find(l => !done.includes(l.id));
  return (
    <Page title="Pool">
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
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text maxFontSizeMultiplier={1.3} style={styles.label}>{c.name}</Text>
        <Text maxFontSizeMultiplier={1.3} style={styles.note}>{`Power ${c.power} · Spin ${c.spin} · Aim ${c.aim}`}</Text>
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

const styles = StyleSheet.create({
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
  input: { color: C.chalk, fontSize: 16, minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: C.chalk + '66', borderRadius: 6 },
});
