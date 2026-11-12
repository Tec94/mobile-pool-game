import { StyleSheet } from 'react-native';
import { C, CREAM, DARK, FONT } from '../theme';
import { Slab, Txt } from './slab';

// Chrome button: a dark key-sized slab (cream when it is the chosen one of a set), 34 pt with a 44 pt touch. Its label
// grows with the system text size only as far as the control bar has room for. on = one choice of a set, and whether it is the chosen one; off = cannot be pressed now.
export function Btn({ label, name, on, off, onPress, onLongPress }: { label: string; name?: string; on?: boolean; off?: boolean; onPress: () => void; onLongPress?: () => void }) {
  return (
    <Slab paint={on ? CREAM : DARK} lip={3} radius={3} onPress={onPress} onLongPress={onLongPress} disabled={off} hitSlop={{ top: 5, bottom: 5, left: 0, right: 0 }}
      accessibilityRole={on === undefined ? 'button' : 'radio'} accessibilityLabel={name ?? label.replace('\n', ' ')} aria-checked={on} face={styles.btn}>
      <Txt style={[styles.text, on && { color: C.ink }]}>{label}</Txt>
    </Slab>
  );
}

const styles = StyleSheet.create({
  btn: { minWidth: 56, minHeight: 34, paddingHorizontal: 10, paddingVertical: 4, alignItems: 'center', justifyContent: 'center' },
  text: { color: C.chalk, fontFamily: FONT.bold, fontSize: 13, lineHeight: 16, textAlign: 'center' },
});
