import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LESSON_PAY, LESSONS, SOLO_RUN } from '../../learn/lessons';
import { C, DARK, FONT, MODE, type Paint } from '../../theme';
import type { Props, LearnProps } from '../Menus';
import { type Card, Hand, Row, Shell, Stage } from '../shell';
import { Chip, Txt } from '../slab';

const NOT_YET: Paint = [DARK[0], MODE.learn[1]], W = 54;
let kept: number | undefined; // the raised lesson outlives the screen, so a lesson returns to it

// Every lesson is open from the start; the first one not yet passed is only a suggestion. The hand is the lessons as
// narrow spines: purple = passed, dark on a purple lip = not yet.
export function Learn({ go, done, learn }: Pick<Props, 'go'> & LearnProps) {
  const next = LESSONS.findIndex(l => !done.includes(l.id));
  const [up, setUp] = useState(kept ?? Math.max(0, next)), pick = (i: number) => { kept = i; setUp(i); };
  const cards: Card[] = LESSONS.map((l, i) => {
    const passed = done.includes(l.id);
    return {
      key: l.id, paint: passed ? MODE.learn : NOT_YET, name: `Lesson ${i + 1}, ${l.title}, ${passed ? 'passed' : 'not passed'}`,
      title: `${i + 1}  ${l.title}`, line: passed ? 'Passed' : i === next ? 'Suggested next' : undefined,
      body: <>
        <Txt style={styles.num}>{i + 1}</Txt>
        <View style={styles.spine}>
          <Txt numberOfLines={1} style={styles.name}>{l.title.split(/:| and /)[0]}</Txt>
          {passed && <Txt style={[styles.name, styles.tick]}>✓</Txt>}
        </View>
      </>,
    };
  });
  const l = LESSONS[up], passed = done.includes(l.id);
  return (
    <Shell title="Learn" back={() => go('home')}>
      <Stage title={l.title} line={`Lesson ${up + 1} of ${LESSONS.length}. ${l.say} Watch, try it guided, then do it ${SOLO_RUN} times in a row.`}
        cta={{ label: 'Start', name: `Start ${l.title}`, onPress: () => learn(up) }}>
        <Row gap={8}>
          <Chip>{`${done.length} of ${LESSONS.length} passed`}</Chip>
          <Chip>{passed ? 'Passed · replay any time' : `+${LESSON_PAY.xp} XP on the first pass`}</Chip>
        </Row>
      </Stage>
      <Hand cards={cards} up={up} pick={pick} width={W} />
    </Shell>
  );
}

const SPINE = 108; // the name runs down the spine, from under the number; its tick stays above y 375 at 375 high
const styles = StyleSheet.create({
  num: { position: 'absolute', left: 0, right: 0, top: 8, fontFamily: FONT.display, fontSize: 18, lineHeight: 22, color: C.chalk, textAlign: 'center', fontVariant: ['tabular-nums'] },
  spine: { position: 'absolute', width: SPINE, height: 20, alignSelf: 'center', top: 30 + SPINE / 2 - 10, transform: [{ rotate: '90deg' }], flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontFamily: FONT.bold, fontSize: 12, lineHeight: 20, color: C.chalk, flexShrink: 1 },
  tick: { flexShrink: 0, transform: [{ rotate: '-90deg' }] }, // upright on the turned spine
});
