import { Text } from 'react-native';
import { LESSON_PAY, LESSONS, SOLO_RUN } from '../../learn/lessons';
import { Btn } from '../Btn';
import type { Props, LearnProps } from '../Menus';
import { Page, styles } from './legacy';

// Every lesson is open from the start; the first one not yet passed is only a suggestion.
export function Learn({ go, done, learn }: Pick<Props, 'go'> & LearnProps) {
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
