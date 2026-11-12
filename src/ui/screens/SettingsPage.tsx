import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { C, CLOTHS, FONT } from '../../theme';
import type { Settings } from '../../settings/settings';
import type { Props } from '../Menus';
import { Shell, useFrame } from '../shell';
import { Keys, Txt, TYPE } from '../slab';

// A setting: its name, an optional line on what it does, and its keys. The keys wrap under the name on a narrow screen.
function Line({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return (
    <View style={styles.line}>
      <Txt style={styles.label}>{label}</Txt>
      <Txt style={styles.note}>{note ?? ''}</Txt>
      {children}
    </View>
  );
}

export function SettingsPage({ set, change, go }: Props) {
  const { side, pad } = useFrame();
  return (
    <Shell title="Settings" back={() => go('home')}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: side, paddingTop: 10, paddingBottom: pad.bottom + 16, gap: 8 }}>
        <Line label="Shot calling" note="8-ball. WPA: tap the pocket first for a bank or a combination. 8 only: every pot counts">
          <Keys label="Shot calling" value={set.callAll} pick={callAll => change({ callAll })} options={[['WPA', true], ['8 only', false]]} />
        </Line>
        <Line label="Table felt"><Keys label="Table felt" value={set.cloth} pick={cloth => change({ cloth })} options={CLOTHS.map((c, i) => [c.name, i])} /></Line>
        <Line label="Menus" note="Which way up the menus are">
          <Keys<Settings['menus']> label="Menus" value={set.menus} pick={menus => change({ menus })} options={[['Landscape', 0], ['Portrait', 1]]} />
        </Line>
        <Line label="In a match" note="Auto follows the phone, even mid-match">
          <Keys<Settings['orient']> label="In a match" value={set.orient} pick={orient => change({ orient })} options={[['Auto', 0], ['Landscape', 2], ['Portrait', 1]]} />
        </Line>
        <Line label="Cue angle zones" note="The ring of the tip sheet. One colour: learn the angles yourself">
          <Keys label="Cue angle zones" value={set.zones} pick={zones => change({ zones })} options={[['Colours', true], ['One colour', false]]} />
        </Line>
      </ScrollView>
    </Shell>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 6, minHeight: 42 },
  label: { fontFamily: FONT.display, fontSize: 16, color: C.chalk, width: 140 },
  note: { ...TYPE.body, flex: 1, minWidth: 180, opacity: 0.82 },
});
