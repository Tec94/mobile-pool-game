// The old menu look, kept for the screens not yet in the hand design. It goes when the last of them is restyled.
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../../theme';
import { Btn } from '../Btn';

// A setting: its name, an optional line on what it does, and one button for each value.
export function Row<T>({ label, note, value, pick, options }: { label: string; note?: string; value: T; pick: (v: T) => void; options: [string, T][] }) {
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

export function Page({ title, back, children }: { title: string; back?: () => void; children: React.ReactNode }) {
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

export const styles = StyleSheet.create({
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
  seg: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flexShrink: 1, maxWidth: '100%' }, // six AI tiers wrap on a phone
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
