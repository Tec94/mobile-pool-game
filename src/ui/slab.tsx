// The hand design's pieces: a slab is a flat face on a solid lip of a darker colour (no border, no blur shadow). A press
// moves the face down onto the lip, at once: no scale, no fade. Keys, chips and cards are slabs.
import type { ReactNode } from 'react';
import { Pressable, type StyleProp, StyleSheet, Text, type TextProps, View, type ViewStyle } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { BALLS, C, CREAM, DARK, FONT, type Paint } from '../theme';

const PRESS = 3; // pt the face moves down when pressed
const SLOP = { top: 8, bottom: 8, left: 4, right: 4 }; // a 34 pt key or a 26 pt chip still takes a 44 pt touch

// Text with the cap every label in the game has on the system text size.
export const Txt = (p: TextProps) => <Text maxFontSizeMultiplier={1.3} {...p} />;

type A11y = Pick<React.ComponentProps<typeof Pressable>, 'accessibilityLabel' | 'accessibilityRole' | 'accessibilityState' | 'accessibilityHint' | 'accessibilityValue' | 'aria-checked' | 'hitSlop'>;
export interface SlabProps extends A11y {
  paint: Paint; lip?: number; radius?: number;
  onPress?: () => void; onLongPress?: () => void; disabled?: boolean;
  style?: StyleProp<ViewStyle>;     // the outer box: size, margins, position
  face?: StyleProp<ViewStyle>;      // the face: padding, layout of the children
  children?: ReactNode;
}
// A face on a lip. Static without onPress. Disabled = 40% opacity.
export function Slab({ paint: [face, lip], lip: h = 5, radius = 5, onPress, onLongPress, disabled, style, face: faceStyle, children, ...a11y }: SlabProps) {
  const body = (down: boolean) => <>
    <View style={[StyleSheet.absoluteFill, { top: h, backgroundColor: lip, borderRadius: radius }]} />
    <View style={[{ flexGrow: 1, marginBottom: h, backgroundColor: face, borderRadius: radius, overflow: 'hidden' }, faceStyle, down && { transform: [{ translateY: PRESS }] }]}>{children}</View>
  </>;
  const box = [disabled && { opacity: 0.4 }, style]; // a style's own opacity wins: the stage button shows off as dark, not dim
  if (!onPress) return <View style={box} {...a11y}>{body(false)}</View>;
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} disabled={disabled} accessibilityRole="button" pressRetentionOffset={16} {...a11y}
      accessibilityState={{ disabled: !!disabled, ...a11y.accessibilityState }} style={box}>
      {({ pressed }) => body(pressed)}
    </Pressable>
  );
}

// A key of a key group (a radio): 34 pt, off = flat chalk at 11%, on = cream on its lip. name = what a screen reader says.
export function Key({ label, name, on, off, onPress }: { label: string; name?: string; on: boolean; off?: boolean; onPress: () => void }) {
  return (
    <Slab paint={on ? CREAM : [C.keyOff, 'transparent']} lip={on ? PRESS : 0} radius={3} onPress={onPress} disabled={off} hitSlop={SLOP}
      accessibilityRole="radio" accessibilityLabel={name ?? label} accessibilityState={{ checked: on, disabled: !!off }} aria-checked={on}
      style={{ marginBottom: on ? 0 : PRESS }} face={styles.key}>
      <Txt style={[styles.keyText, { color: on ? C.ink : C.chalk }]}>{label}</Txt>
    </Slab>
  );
}

// A radio group of keys. label = the group's name for a screen reader; show = an optional small label in front.
export function Keys<T>({ label, show, value, pick, options }: { label: string; show?: string; value: T; pick: (v: T) => void; options: ([string, T] | [string, T, string])[] }) {
  return (
    <View style={styles.keys} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {show && <Txt style={styles.keyLabel}>{show}</Txt>}
      {options.map(([text, v, name]) => <Key key={text} label={text} name={name} on={v === value} onPress={() => pick(v)} />)}
    </View>
  );
}

// A chip: a small dark slab for coins, Fresh Chalk, back and small facts. Pressable with onPress.
export function Chip({ children, onPress, name, style }: { children: ReactNode; onPress?: () => void; name?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <Slab paint={DARK} lip={PRESS} radius={3} onPress={onPress} hitSlop={onPress && SLOP} accessibilityLabel={name} style={style} face={styles.chip}>
      {typeof children === 'string' ? <Txt style={styles.chipText}>{children}</Txt> : children}
    </Slab>
  );
}

// A ball as the design draws it: a flat disc on a hard offset shadow, a chalk rim, a highlight tick, the number on a
// white dot. label = the text on the dot (a level), n = the colour (1 to 15; above 8 they repeat).
export function BallArt({ n, size, label }: { n: number; size: number; label?: string | number }) {
  const r = size / 2, col = BALLS[(n - 1) % 8], tick = r * 0.42, line = Math.max(1, r * 0.11);
  return (
    <View style={{ width: size, height: size }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <View style={[styles.disc, { width: size, height: size, borderRadius: r, left: r * 0.2, top: r * 0.24, backgroundColor: C.shade, opacity: 0.6 }]} />
      <View style={[styles.disc, { width: size, height: size, borderRadius: r, backgroundColor: col, borderWidth: 0.8, borderColor: C.chalk + '73', alignItems: 'center', justifyContent: 'center' }]}>
        {r >= 8 && <View style={{ width: r * 0.88, height: r * 0.88, borderRadius: r, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' }}>
          <Text allowFontScaling={false} style={{ fontFamily: FONT.display, fontSize: r * 0.56, lineHeight: r * 0.7, color: C.ink }}>{label ?? n}</Text>
        </View>}
      </View>
      {r >= 7 && <View style={[styles.disc, { width: tick, height: line, borderRadius: line, left: r * 0.5 - tick / 2, top: r * 0.5 - line / 2, backgroundColor: '#FFFFFFBF', transform: [{ rotate: '-45deg' }] }]} />}
    </View>
  );
}

// value of 10 as blocks, gold filled: a cue stat against the absolute top.
export function Blocks({ value, max = 10, width = 200 }: { value: number; max?: number; width?: number }) {
  return (
    <View style={[styles.blocks, { width }]}>
      {Array.from({ length: max }, (_, i) => <View key={i} style={[styles.block, i < value && { backgroundColor: C.gold }]} />)}
    </View>
  );
}

// The XP bar: gold on a chalk track, share 0 to 1. shortcut: plain gold, not hatched; hatch it if the plain bar reads flat.
export function Hatch({ share, style }: { share: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.track, style]}><View style={[styles.fill, { width: `${100 * Math.min(1, Math.max(0, share))}%` }]} /></View>;
}

// A card of the hand. up = raised 22 pt with a chalk outline (the chosen one); tilt in degrees, from the middle of the hand.
export function HandCard({ paint, up, tilt = 0, onPress, name, width, height, children }: { paint: Paint; up: boolean; tilt?: number; onPress: () => void; name: string; width: number; height: number; children: ReactNode }) {
  const still = useReducedMotion();
  return (
    <Animated.View style={{ width, height, transformOrigin: '50% 100%', transform: [{ translateY: up ? -22 : 0 }, { rotate: `${tilt}deg` }], zIndex: up ? 1 : 0,
      transitionProperty: 'transform', transitionDuration: still ? 0 : 180, transitionTimingFunction: 'ease-out' }}>
      <Slab paint={paint} onPress={onPress} accessibilityLabel={name} accessibilityState={{ selected: up }} style={{ flex: 1 }}
        face={[styles.card, up && styles.outline]}>{children}</Slab>
    </Animated.View>
  );
}

// The type of the design: titles in Bricolage Grotesque, the rest in Instrument Sans. Chalk; on a face, add { color: inkOn(paint) }.
export const TYPE = StyleSheet.create({
  title: { fontFamily: FONT.display, fontSize: 34, lineHeight: 38, color: C.chalk, letterSpacing: -0.5 },
  name: { fontFamily: FONT.display, fontSize: 16, lineHeight: 17, color: C.chalk },
  body: { fontFamily: FONT.semi, fontSize: 12.5, lineHeight: 17, color: C.chalk },
  small: { fontFamily: FONT.semi, fontSize: 10.5, lineHeight: 14, color: C.chalk },
  num: { fontVariant: ['tabular-nums'] },
});

const styles = StyleSheet.create({
  key: { height: 34, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', flexGrow: 0 },
  keyText: { fontFamily: FONT.bold, fontSize: 12.5, fontVariant: ['tabular-nums'] },
  keys: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, flexShrink: 1, maxWidth: '100%' },
  keyLabel: { fontFamily: FONT.bold, fontSize: 11, color: C.chalk, opacity: 0.7, marginRight: 4 },
  chip: { minHeight: 26, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 5 },
  chipText: { fontFamily: FONT.bold, fontSize: 13, color: C.chalk, fontVariant: ['tabular-nums'] },
  disc: { position: 'absolute', left: 0, top: 0 },
  blocks: { flexDirection: 'row', gap: 2 },
  block: { flex: 1, height: 10, borderRadius: 1, backgroundColor: C.chalk + '1F' },
  track: { height: 9, borderRadius: 2, backgroundColor: C.chalk + '1F', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: C.gold },
  card: { paddingTop: 11, paddingLeft: 11, paddingRight: 8 },
  outline: { outlineColor: C.chalk, outlineWidth: 2, outlineOffset: 2, outlineStyle: 'solid' },
});
