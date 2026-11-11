// The screens around a match: home, the pass and play setup, and settings (screens spec, s-home, s-passplay, s-prefs).
// shortcut: only what works today is on them. Quick match, practice, learn, career, cues and the other settings of
// the spec come with the work that makes them play.
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NAME_MAX, RACES, Settings } from '../settings/settings';
import { C, CLOTHS } from '../theme';
import { Btn } from './Btn';

export type Screen = 'home' | 'pass' | 'settings';
interface Props { set: Settings; change: (s: Partial<Settings>) => void; go: (to: Screen | 'match') => void }

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

export function Menus({ screen, set, change, go }: Props & { screen: Screen }) {
  if (screen === 'pass') return <PassPlay set={set} change={change} go={go} />;
  if (screen === 'settings') return <SettingsPage set={set} change={change} go={go} />;
  return (
    <Page title="Pool">
      <Btn label={'Pass and play\nTwo players, one phone'} name="Pass and play" onPress={() => go('pass')} />
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

function SettingsPage({ set, change, go }: Props) {
  return (
    <Page title="Settings" back={() => go('home')}>
      <Row label="Shot calling" note="8-ball. WPA: tap the pocket first for a bank or a combination. 8 only: every pot counts" value={set.callAll} pick={callAll => change({ callAll })} options={[['WPA', true], ['8 only', false]]} />
      <Row label="Table felt" value={set.cloth} pick={cloth => change({ cloth })} options={CLOTHS.map((c, i) => [c.name, i])} />
      <Row<Settings['orient']> label="Orientation" note="Auto follows the phone, even mid-match" value={set.orient} pick={orient => change({ orient })} options={[['Auto', 0], ['Portrait', 1], ['Landscape', 2]]} />
    </Page>
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
  input: { color: C.chalk, fontSize: 16, minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: C.chalk + '66', borderRadius: 6 },
});
