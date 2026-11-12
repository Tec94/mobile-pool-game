// The spin button and the "Tip and cue angle" sheet (screens spec: the ring around the spin ball, with the side picture).
// Drawing and touch maths are in src/render/tip.ts; this file is the React Native shell around them.
import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Canvas, Picture, Skia, SkCanvas } from '@shopify/react-native-skia';
import Animated, { cubicBezier, useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { drawSide, drawTip, drawTipBall, grab, LEVEL, MAX_ELEV, moveElev, moveSpin, padReach, ringAt, ringTurn, SIDE, spinLabel, tapSpin, Tip, zone, zoneLabel } from '../render/tip';
import { C, DARK, FONT } from '../theme';
import { Btn } from './Btn';

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
const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1); // a strong ease-out: a press and the sheet answer at once
const tick = () => { Haptics.selectionAsync(); }, tap = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); };

// The cue ball in the control bar: the bare ball on the ground, in a 48 pt touch box. Its dot is the tip, and a badge
// gives the elevation when the cue is raised. A press shrinks the ball by 3 pt, the travel of a slab face (at once with reduced motion).
export function TipButton({ store, onPress }: { store: TipStore; onPress: () => void }) {
  const t = useSyncExternalStore(store.sub, store.get), B = 44, still = useReducedMotion(), [down, setDown] = useState(false);
  const ball = useMemo(() => picture(c => drawTipBall(Skia, c, B / 2, B / 2, B / 2, t)), [t.x, t.y]);
  return (
    <Pressable onPress={onPress} onPressIn={() => setDown(true)} onPressOut={() => setDown(false)} pressRetentionOffset={16} style={styles.holder}
      accessibilityRole="button" accessibilityLabel="Set spin and cue elevation" accessibilityValue={{ text: `${spinLabel(t)}. ${t.elev} degrees` }}>
      <Animated.View style={{ transform: [{ scale: down ? 0.93 : 1 }], transitionProperty: 'transform', transitionDuration: still ? 0 : 120, transitionTimingFunction: EASE_OUT }}>
        <Canvas style={{ width: B, height: B }}><Picture picture={ball} /></Canvas>
      </Animated.View>
      {t.elev > 0 && <Text maxFontSizeMultiplier={1.3} style={styles.badge}>{t.elev}°</Text>}
    </Pressable>
  );
}

// The sheet. The table stays live around it: a pull on the table still aims and shoots while it is open.
// width = the sheet's own; a sheet narrower than the big ring and the side picture need takes a smaller ring.
export function TipSheet({ store, land, calm, felt, blend, onDone, width, style }: { store: TipStore; land: boolean; calm: boolean; felt: string; blend: boolean; onDone: () => void; width: number; style: ViewStyle }) {
  const t = useSyncExternalStore(store.sub, store.get), D = Math.min(land ? 150 : 190, width - 140); // 140 = side picture, gap, padding and border
  const size = useRef(D), drag = useRef<{ on: 'ring' | 'pad'; from: Tip; x: number; y: number; t: number; moved: boolean; a: number; e: number } | null>(null);
  if (size.current !== D) drag.current = null; // the phone turned during a drag: the touch no longer maps to the ring
  size.current = D; // the pan responder is created once, so it reads the latest size
  const ring = useMemo(() => picture(c => drawTip(Skia, c, D, t, blend)), [D, t, blend]);
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
      animationName: { from: { opacity: 0, transform: [calm ? { translateY: 0 } : land ? { translateX: 24 } : { translateY: 24 }] } }, animationDuration: '220ms', animationTimingFunction: EASE_OUT }}>
      <View style={styles.head}>
        <Text maxFontSizeMultiplier={1.3} style={styles.eyebrow}>TIP AND CUE ANGLE</Text>
        <Btn label="Done" onPress={onDone} />
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
          <Text maxFontSizeMultiplier={1.3} style={styles.zone}>{blend ? zoneLabel(t) : ''}</Text>{/* one colour: the player learns the zones */}
        </View>
      </View>
      <Text maxFontSizeMultiplier={1.3} style={styles.label} accessibilityLiveRegion="polite">{spinLabel(t)}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  holder: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', right: 0, top: 0, minWidth: 22, paddingHorizontal: 3, borderRadius: 3, overflow: 'hidden', backgroundColor: C.chalk, color: C.ink, fontFamily: FONT.bold, fontSize: 10, lineHeight: 13, textAlign: 'center', fontVariant: ['tabular-nums'] },
  // A dark slab: the lip is a solid bottom edge of the lip colour, not an outline.
  sheet: { position: 'absolute', gap: 8, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 14, backgroundColor: DARK[0], borderBottomWidth: 5, borderColor: DARK[1], borderRadius: 5 },
  head: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: C.chalk + 'B3', fontFamily: FONT.bold, fontSize: 11, letterSpacing: 0.9 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  deg: { color: C.chalk, fontFamily: FONT.display, fontSize: 22, fontVariant: ['tabular-nums'] },
  zone: { color: C.chalk + 'B3', fontFamily: FONT.semi, fontSize: 11.5, textAlign: 'center', minHeight: 30 }, // room for two lines, so the picture does not move when the text wraps
  label: { color: C.chalk + 'B3', fontFamily: FONT.semi, fontSize: 13, textAlign: 'center' },
});
