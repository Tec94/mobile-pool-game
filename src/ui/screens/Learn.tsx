import { useRef, useState } from 'react';
import { ScrollView, type ScrollViewInstance, StyleSheet, View } from 'react-native';
import { LESSONS } from '../../learn/lessons';
import { C, CREAM, DARK, FONT, inkOn, MODE } from '../../theme';
import type { LearnProps, Props } from '../Menus';
import { MiniTable, SpinDot, tableOf } from '../MiniTable';
import { Shell, Tile, useFrame } from '../shell';
import { Txt } from '../slab';
import { short } from './Home';

const W = 170; // a lesson tile in landscape

// Every lesson is open from the start: a tap starts it. Each tile draws its table, the pocket, the ring and where to hit
// the cue ball. Purple = passed, cream = the next one, dark = not yet. Landscape: two rows that run off the right edge.
export function Learn({ go, done, learn }: Pick<Props, 'go'> & LearnProps) {
  const { land, side, pad, width } = useFrame(), next = LESSONS.findIndex(l => !done.includes(l.id)), scroll = useRef<ScrollViewInstance>(null);
  const [rowH, setRowH] = useState(150), tw = land ? W : (width - 2 * side - 8) / 2;
  const tile = (i: number) => {
    const l = LESSONS[i], passed = done.includes(l.id), paint = passed ? MODE.learn : i === next ? CREAM : DARK, ink = { color: inkOn(paint) };
    return (
      <Tile key={l.id} paint={paint} name={`Lesson ${i + 1}, ${l.title}, ${passed ? 'passed' : 'not passed'}`} onPress={() => learn(i)}
        style={land ? { width: W, height: rowH } : { width: tw }} face={[styles.tile, paint === DARK && styles.outline]}>
        <MiniTable width={tw - 16} {...tableOf(l)} />
        <View style={styles.row}>
          <Txt style={[styles.num, ink, i !== next && { opacity: 0.7 }]}>{passed ? '✓' : i + 1}</Txt>
          <Txt numberOfLines={2} style={[styles.name, ink]}>{short(l)}</Txt>
        </View>
        <View style={styles.spin}><SpinDot tip={l.ref.tip} size={24} /></View>
      </Tile>
    );
  };
  const extra = <>
    <View style={styles.pips}>{LESSONS.map(l => <View key={l.id} style={[styles.pip, done.includes(l.id) && { backgroundColor: MODE.learn[0] }]} />)}</View>
    <Txt style={styles.count}>{`${done.length} / ${LESSONS.length}`}</Txt>
  </>;
  const cols = Array.from({ length: Math.ceil(LESSONS.length / 2) }, (_, c) => [2 * c, 2 * c + 1].filter(i => i < LESSONS.length));
  return (
    <Shell title="Learn" back={() => go('home')} extra={land && extra}>
      {land ? (
        <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1, marginTop: 12, marginBottom: Math.max(pad.bottom, 16) }}
          contentContainerStyle={{ paddingHorizontal: side, gap: 8 }}
          onLayout={e => { setRowH(Math.min(160, (e.nativeEvent.layout.height - 13) / 2)); scroll.current?.scrollTo({ x: Math.max(0, (Math.floor(Math.max(0, next) / 2) - 1) * (W + 8)), animated: false }); }}>
          {cols.map((c, k) => <View key={k} style={{ gap: 13 }}>{c.map(tile)}</View>)}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: side, paddingTop: 12, paddingBottom: Math.max(pad.bottom, 16), gap: 12 }}>
          <View style={styles.strip}>{extra}</View>
          <View style={styles.grid}>{LESSONS.map((_, i) => tile(i))}</View>
        </ScrollView>
      )}
    </Shell>
  );
}

const styles = StyleSheet.create({
  tile: { paddingVertical: 8, paddingHorizontal: 8 },
  outline: { borderWidth: 1.5, borderColor: MODE.learn[0] },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 7, paddingRight: 26 },
  num: { fontFamily: FONT.display, fontSize: 22, lineHeight: 22 },
  name: { fontFamily: FONT.display, fontSize: 15, lineHeight: 17, paddingTop: 3, flexShrink: 1 },
  spin: { position: 'absolute', right: 9, bottom: 9 },
  pips: { flexDirection: 'row', gap: 3 },
  pip: { width: 8, height: 12, borderRadius: 1.5, backgroundColor: C.chalk + '22' },
  count: { fontFamily: FONT.semi, fontSize: 12, color: C.chalk, opacity: 0.8, fontVariant: ['tabular-nums'] },
  strip: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, rowGap: 13 },
});
