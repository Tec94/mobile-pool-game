import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated from 'react-native-reanimated';
import { C } from '../theme';

// Chrome button: hairline outline, a 44 pt target, and a 3% press that follows the finger down (no bounce). Its label
// grows with the system text size only as far as the control bar has room for. on = one choice of a set, and whether it is the chosen one; off = cannot be pressed now.
export function Btn({ label, name, on, off, onPress, onLongPress }: { label: string; name?: string; on?: boolean; off?: boolean; onPress: () => void; onLongPress?: () => void }) {
  const [down, setDown] = useState(false);
  return (
    <Pressable disabled={off} accessibilityState={{ disabled: off }} onPress={onPress} onLongPress={onLongPress} onPressIn={() => setDown(true)} onPressOut={() => setDown(false)} pressRetentionOffset={16} accessibilityRole={on === undefined ? 'button' : 'radio'}
      accessibilityLabel={name ?? label.replace('\n', ' ')} aria-checked={on}>
      <Animated.View style={{ ...styles.btn, ...(on && styles.on), opacity: off ? 0.4 : 1, transform: [{ scale: down ? 0.97 : 1 }], transitionProperty: 'transform', transitionDuration: '120ms', transitionTimingFunction: 'ease-out' }}>
        <Text maxFontSizeMultiplier={1.3} style={styles.btnText}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { minWidth: 56, minHeight: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', borderColor: C.chalk + '66', borderWidth: 1, borderRadius: 6 }, // outline at 40%: 3:1 on the ground
  on: { borderColor: C.accent, backgroundColor: C.accent + '33' },
  btnText: { color: C.chalk, fontSize: 13, lineHeight: 16, textAlign: 'center' },
});
