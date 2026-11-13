import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { C, CLOTHS, FONT } from '../../theme';
import type { Settings } from '../../settings/settings';
import type { Props } from '../Menus';
import { Shell, useFrame } from '../shell';
import { Keys, Txt, TYPE } from '../slab';

// A setting: its name, an optional line on what it does, and its keys. Landscape: one row, every key group on one left
// edge. Portrait: a column, so name, note and keys each start at the gutter.
function Line({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  const { land } = useFrame();
  if (!land) return (
    <View style={styles.col}>
      <Txt style={styles.label}>{label}</Txt>
      {note && <Txt style={[styles.note, { flex: 0, minWidth: 0 }]}>{note}</Txt>}
      {children}
    </View>
  );
  return (
    <View style={styles.line}>
      <Txt style={[styles.label, styles.lift]}>{label}</Txt>
      <Txt style={[styles.note, styles.lift]}>{note ?? ''}</Txt>
      <View style={styles.keys}>{children}</View>
    </View>
  );
}

export function SettingsPage({ set, change, go }: Props) {
  const { land, side, pad } = useFrame();
  return (
    <Shell title="Settings" back={() => go('home')}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: side, paddingTop: 10, paddingBottom: pad.bottom + 16, gap: land ? 8 : 20 }}>
        <Line label="Calling">
          <Keys label="Calling" value={set.callAll} pick={callAll => change({ callAll })} options={[['Call every shot', true], ['Call only the 8-ball', false]]} />
        </Line>
        <Line label="Bank shots">
          <Keys<Settings['bank']> label="Bank shots" value={set.bank} pick={bank => change({ bank })} options={[['Off', 0], ['8-ball only', 1], ['Every ball', 2]]} />
        </Line>
        <Line label="Table felt"><Keys label="Table felt" value={set.cloth} pick={cloth => change({ cloth })} options={CLOTHS.map((c, i) => [c.name, i])} /></Line>
        <Line label="Menu orientation">
          <Keys<Settings['menus']> label="Menu orientation" value={set.menus} pick={menus => change({ menus })} options={[['Landscape', 0], ['Portrait', 1]]} />
        </Line>
        <Line label="Match orientation" note="Auto follows the phone, even mid-match.">
          <Keys<Settings['orient']> label="Match orientation" value={set.orient} pick={orient => change({ orient })} options={[['Auto', 0], ['Landscape', 2], ['Portrait', 1]]} />
        </Line>
        <Line label="Cue angle zones" note="Colours on the cue angle ring. One colour: learn the angles yourself.">
          <Keys label="Cue angle zones" value={set.zones} pick={zones => change({ zones })} options={[['Colours', true], ['One colour', false]]} />
        </Line>
      </ScrollView>
    </Shell>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 6, minHeight: 42 },
  label: { fontFamily: FONT.display, fontSize: 16, color: C.chalk, width: 160 },
  note: { ...TYPE.body, flex: 1, minWidth: 180, opacity: 0.82 },
  lift: { marginBottom: 3 }, // centre on the key face, not face and lip
  keys: { width: 212, alignItems: 'flex-start' },
  col: { alignItems: 'flex-start', gap: 6 },
});
