// The strip above the table in a lesson (screens spec, the lesson screen): which lesson and step, the goal, and in the
// guided step the spin and power to use. The pause button comes in as a child at the end of the row.
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { type Lesson, SOLO_RUN, type Stage } from '../learn/lessons';
import { BAR } from '../render/table';
import { spinLabel, zoneLabel } from '../render/tip';
import { C } from '../theme';

export const LESSON_HUD = 92; // screen units above the table: the step, the goal on up to two lines, one line of help

const STEP: Record<Stage, string> = { watch: 'Watch', guided: 'Guided', solo: 'Solo' };
// A scenario names itself and its tries in head and line.
export function LessonHud({ lesson, n, stage, run, land, pad, head, line: said, children }: { lesson: Lesson; n: number; stage: Stage; run: number; land: boolean; pad: EdgeInsets; head?: string; line?: string; children?: ReactNode }) {
  const { tip, power } = lesson.ref;
  const line = said ?? stage === 'guided' ? `${spinLabel(tip)}${tip.elev ? ` · ${zoneLabel(tip)} ${tip.elev}°` : ''} · power about ${Math.round(power * 100)}%`
    : stage === 'solo' ? `${run} of ${SOLO_RUN} in a row. No help with spin and power.` : 'Watch the spin and the power.';
  return (
    <View style={[styles.hud, { top: pad.top + 4, left: Math.max(pad.left, 8), right: Math.max(pad.right, 8) + (land ? BAR : 0) }]}>
      <View style={styles.text} accessible accessibilityLiveRegion="polite">
        <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={styles.eyebrow}>{head ?? `Lesson ${n + 1} · ${STEP[stage]}`}</Text>
        <Text maxFontSizeMultiplier={1.2} numberOfLines={2} style={styles.say}>{lesson.say}</Text>
        <Text maxFontSizeMultiplier={1.2} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.line}>{line}</Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  hud: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 8, height: LESSON_HUD - 8 },
  text: { flex: 1, gap: 2 },
  eyebrow: { color: C.chalk + 'B3', fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9, textTransform: 'uppercase' },
  say: { color: C.chalk, fontSize: 15, lineHeight: 19, fontWeight: '700' },
  line: { color: C.chalk, fontSize: 13, lineHeight: 17 },
});
