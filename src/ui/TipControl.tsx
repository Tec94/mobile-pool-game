// The spin button and the "Tip and cue angle" sheet (screens spec: the ring around the spin ball, with the side picture).
// Drawing and touch maths are in src/render/tip.ts; this file is the React Native shell around them.
import { useMemo, useRef, useSyncExternalStore } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Canvas, Picture, Skia, SkCanvas } from '@shopify/react-native-skia';
import Animated, { cubicBezier } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { drawSide, drawTip, drawTipBall, grab, LEVEL, MAX_ELEV, moveElev, moveSpin, padReach, ringAt, ringTurn, SIDE, spinLabel, tapSpin, Tip, zone, zoneLabel } from '../render/tip';
import { C } from '../theme';

// The tip lives outside React state: the game screen reads it when a shot is made and never re-renders for it. Only
// the button and the sheet below listen.
// shortcut: each touch move re-renders those two small components (one Skia picture each); move the pictures to
// shared values if a slow phone shows the dot trailing the finger.
export interface TipStore { get: () => Tip; set: (t: Tip) => void; sub: (f: () => void) => () => void }
export function tipStore(): TipStore {
  let v = LEVEL; const subs = new Set<() => void>();
  return { get: () => v, set: t => { v = t; subs.forEach(f => f()); }, sub: f => { subs.add(f); return () => { subs.delete(f); }; } };
}
const picture = (draw: (c: SkCanvas) => void) => { const rec = Skia.PictureRecorder(); draw(rec.beginRecording()); return rec.finishRecordingAsPicture(); };
const tick = () => { Haptics.selectionAsync(); }, tap = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); };
const press = (down: boolean) => ({ transform: [{ scale: down ? 0.97 : 1 }], transitionProperty: 'transform', transitionDuration: '120ms', transitionTimingFunction: 'ease-out' }) as const;

// The cue ball in the control bar. Its dot is the tip, and a badge gives the elevation when the cue is raised.
export function TipButton({ store, onPress }: { store: TipStore; onPress: () => void }) {
  const t = useSyncExternalStore(store.sub, store.get), S = 48;
  const ball = useMemo(() => picture(c => drawTipBall(Skia, c, S / 2, S / 2, S / 2, t)), [t.x, t.y]);
  return (
    <Pressable onPress={onPress} pressRetentionOffset={16} accessibilityRole="button" accessibilityLabel="Set spin and cue elevation" accessibilityValue={{ text: `${spinLabel(t)}. ${t.elev} degrees` }}>
      {({ pressed }) => (
        <Animated.View style={[{ width: S, height: S }, press(pressed)]}>
          <Canvas style={StyleSheet.absoluteFill}><Picture picture={ball} /></Canvas>
          {t.elev > 0 && <Text maxFontSizeMultiplier={1.3} style={styles.badge}>{t.elev}°</Text>}
        </Animated.View>
      )}
    </Pressable>
  );
}

// The sheet. The table stays live around it: a pull on the table still aims and shoots while it is open.
// width = the sheet's own; a sheet narrower than the big ring and the side picture need takes a smaller ring.
export function TipSheet({ store, land, calm, felt, onDone, width, style }: { store: TipStore; land: boolean; calm: boolean; felt: string; onDone: () => void; width: number; style: ViewStyle }) {
  const t = useSyncExternalStore(store.sub, store.get), D = Math.min(land ? 150 : 190, width - 140); // 140 = side picture, gap, padding and border
  const size = useRef(D), drag = useRef<{ on: 'ring' | 'pad'; from: Tip; x: number; y: number; t: number; moved: boolean; a: number; e: number } | null>(null);
  if (size.current !== D) drag.current = null; // the phone turned during a drag: the touch no longer maps to the ring
  size.current = D; // the pan responder is created once, so it reads the latest size
  const ring = useMemo(() => picture(c => drawTip(Skia, c, D, t)), [D, t]);
  const side = useMemo(() => picture(c => drawSide(Skia, c, t.elev, felt)), [t.elev, felt]);
  const put = ({ tip, bump }: { tip: Tip; bump: boolean }) => { store.set(tip); if (bump) tick(); };

  // Both handles move by the drag from where they are, so nothing jumps to the finger and the thumb need not cover
  // the dot. A quick tap on the ball places the dot.
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: e => grab(e.nativeEvent.locationX, e.nativeEvent.locationY, size.current) !== null,
    onPanResponderGrant: e => {
      const { locationX: x, locationY: y } = e.nativeEvent;
      drag.current = { on: grab(x, y, size.current)!, from: store.get(), x, y, t: Date.now(), moved: false, a: ringAt(x, y, size.current)[0], e: store.get().elev };
    },
    onPanResponderMove: (e, g) => {
      const d = drag.current; if (!d) return;
      if (d.on === 'ring') {
        const a = ringAt(d.x + g.dx, d.y + g.dy, size.current)[0]; // the finger is the start point plus the drag
        d.e += ringTurn(d.a, a); d.a = a; // not clamped, so a finger that overshoots an end comes back the same way
        put(moveElev(store.get(), d.e));
      } else {
        if (!d.moved && Math.hypot(g.dx, g.dy) < 6) return;
        d.moved = true; const k = padReach(size.current);
        put(moveSpin(store.get(), d.from.x + g.dx / k, d.from.y - g.dy / k));
      }
    },
    onPanResponderRelease: () => {
      const d = drag.current, now = store.get(); drag.current = null; if (!d) return;
      if (d.on === 'ring') { if (now.elev > 0 && now.elev < 4) { store.set({ ...now, elev: 0 }); tap(); } } // almost level means level
      else if (!d.moved && Date.now() - d.t < 300) { const c = size.current / 2, k = padReach(size.current); store.set(tapSpin(now, (d.x - c) / k, -(d.y - c) / k).tip); tap(); }
    },
    onPanResponderTerminationRequest: () => false, // a second finger on the table must not take the drag and shoot
    onPanResponderTerminate: () => { drag.current = null; },
  })).current;

  // VoiceOver and TalkBack: the control is one adjustable element. Swipe up and down change the elevation; the
  // actions menu moves the tip.
  const nudge = (dx: number, dy: number) => store.set(moveSpin(t, t.x + dx, t.y + dy).tip);
  const acts: Record<string, () => void> = { increment: () => store.set(moveElev(t, t.elev + 5).tip), decrement: () => store.set(moveElev(t, t.elev - 5).tip),
    'Tip higher': () => nudge(0, 0.2), 'Tip lower': () => nudge(0, -0.2), 'Tip left': () => nudge(-0.2, 0), 'Tip right': () => nudge(0.2, 0) };

  return (
    // Reduced motion: the sheet fades in and does not slide.
    // The sheet takes every touch that starts on it, so a slip off a handle never aims the cue on the table below.
    <Animated.View onStartShouldSetResponder={() => true} onResponderTerminationRequest={() => false} style={{ ...styles.sheet, ...(land && { gap: 6, paddingTop: 8, paddingBottom: 8 }), width, ...style,
      animationName: { from: { opacity: 0, transform: [calm ? { translateY: 0 } : land ? { translateX: 24 } : { translateY: 24 }] } }, animationDuration: '220ms', animationTimingFunction: cubicBezier(0.23, 1, 0.32, 1) }}>
      <View style={styles.head}>
        <Text maxFontSizeMultiplier={1.3} style={styles.eyebrow}>TIP AND CUE ANGLE</Text>
        <Chip label="Done" onPress={onDone} />
      </View>
      <View style={styles.row}>
        <View {...pan.panHandlers} style={{ width: D, height: D }} accessible accessibilityRole="adjustable" accessibilityLabel="Cue elevation and tip position"
          accessibilityValue={{ min: 0, max: MAX_ELEV, now: t.elev, text: `${t.elev} degrees, ${zone(t.elev)}. ${spinLabel(t)}` }}
          accessibilityActions={Object.keys(acts).map(name => ({ name, label: name }))} onAccessibilityAction={e => acts[e.nativeEvent.actionName]?.()}>
          <Canvas style={StyleSheet.absoluteFill} pointerEvents="none"><Picture picture={ring} /></Canvas>
        </View>
        <View style={{ width: SIDE.w, alignItems: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Canvas style={{ width: SIDE.w, height: SIDE.h }}><Picture picture={side} /></Canvas>
          <Text maxFontSizeMultiplier={1.3} style={styles.deg}>{t.elev}°</Text>
          <Text maxFontSizeMultiplier={1.3} style={styles.zone}>{zoneLabel(t)}</Text>
        </View>
      </View>
      <Text maxFontSizeMultiplier={1.3} style={styles.label} accessibilityLiveRegion="polite">{spinLabel(t)}</Text>
    </Animated.View>
  );
}

// Sheet button: a 44 pt target with the same 3% press as the control bar buttons.
function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} pressRetentionOffset={16} accessibilityRole="button" accessibilityLabel={label}>
      {({ pressed }) => <Animated.View style={[styles.chip, press(pressed)]}><Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.chipText}>{label}</Text></Animated.View>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: { position: 'absolute', right: -6, top: -6, minWidth: 26, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 9, overflow: 'hidden', backgroundColor: C.chalk, color: C.ink, fontSize: 11, fontWeight: '700', textAlign: 'center', fontVariant: ['tabular-nums'] },
  sheet: { position: 'absolute', gap: 8, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 14, backgroundColor: C.panel, borderColor: C.chalk + '40', borderWidth: 1, borderRadius: 20 },
  head: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: C.chalk + 'B3', fontSize: 11, fontWeight: '600', letterSpacing: 0.9 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  deg: { color: C.chalk, fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  zone: { color: C.chalk + 'B3', fontSize: 11.5, textAlign: 'center', minHeight: 30 }, // room for two lines, so the picture does not move when the text wraps
  label: { color: C.chalk + 'B3', fontSize: 13, textAlign: 'center' },
  chip: { minHeight: 44, minWidth: 56, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderColor: C.chalk + '66', borderWidth: 1, borderRadius: 12 },
  chipText: { color: C.chalk + 'CC', fontSize: 12.5, fontWeight: '600' },
});
