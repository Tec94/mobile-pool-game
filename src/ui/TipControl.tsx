// The spin button and the tip and cue angle sheet (screens spec: the ring around the spin ball, with the side picture).
// Drawing and touch maths are in src/render/tip.ts; this file is the React Native shell around them.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { BackHandler, PanResponder, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Canvas, Picture, Skia, SkCanvas } from '@shopify/react-native-skia';
import Animated, { cubicBezier, FadeOut, useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { drawSide, drawTip, drawTipBall, grab, LEVEL, MAX_ELEV, moveElev, moveSpin, padReach, ringAt, ringTurn, SIDE, spinLabel, tapSpin, Tip, zone, zoneLabel } from '../render/tip';
import { C, DARK, FONT } from '../theme';

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
// gives the elevation when the cue is raised. A press shrinks the ball by 3 pt at once, the travel of a slab face, and
// lets go in 120 ms (at once with reduced motion). land = the ball's top edge lines up with the table's (landscape).
export function TipButton({ store, onPress, land }: { store: TipStore; onPress: () => void; land?: boolean }) {
  const t = useSyncExternalStore(store.sub, store.get), B = 44, still = useReducedMotion(), [down, setDown] = useState(false);
  const ball = useMemo(() => picture(c => drawTipBall(Skia, c, B / 2, B / 2, B / 2, t)), [t.x, t.y]);
  return (
    <Pressable onPress={onPress} onPressIn={() => setDown(true)} onPressOut={() => setDown(false)} pressRetentionOffset={16} style={[styles.holder, land && styles.atTop]}
      accessibilityRole="button" accessibilityLabel="Set spin and cue elevation" accessibilityValue={{ text: `${spinLabel(t)}. ${t.elev} degrees` }}>
      <Animated.View style={{ transform: [{ scale: down ? 0.93 : 1 }], transitionProperty: 'transform', transitionDuration: still || down ? 0 : 120, transitionTimingFunction: EASE_OUT }}>
        <Canvas style={{ width: B, height: B }}><Picture picture={ball} /></Canvas>
      </Animated.View>
      {t.elev > 0 && <Text maxFontSizeMultiplier={1.3} style={styles.badge}>{t.elev}°</Text>}
    </Pressable>
  );
}

// The sheet: the ring with the cue ball, and the side picture, in a dark slab at the centre of the window (portrait: of
// the room left of the rail, as the cards). A touch outside it closes it as it lands and does nothing else: the catcher
// under the slab takes the touch, so it never aims the cue or turns the dial. The catcher stops `keep` pt short of the
// right edge, where the power rail is: a pull there shoots, and the strike closes the sheet. Android back and the screen
// reader's escape close it too.
const TRIM = 183 / 214; // the ring's picture is empty right of the ball and under it (src/render/tip.ts): the box ends at the ball
export function TipSheet({ store, land, keep, calm, felt, blend, onDone }: { store: TipStore; land: boolean; keep: number; calm: boolean; felt: string; blend: boolean; onDone: () => void }) {
  const t = useSyncExternalStore(store.sub, store.get), { width } = useWindowDimensions(), D = land ? 150 : Math.min(180, Math.floor((width - keep - 156) / TRIM)); // portrait: 294 pt wide on a 375 pt phone, smaller where the room left of the rail is less (156 = paddings, gap and the side picture)
  const size = useRef(D), drag = useRef<{ on: 'ring' | 'pad'; from: Tip; x: number; y: number; t: number; moved: boolean; a: number; e: number } | null>(null);
  if (size.current !== D) drag.current = null; // the phone turned during a drag: the touch no longer maps to the ring
  size.current = D; // the pan responder is created once, so it reads the latest size
  const close = useRef(onDone); close.current = onDone;
  useEffect(() => { const sub = BackHandler.addEventListener('hardwareBackPress', () => { close.current(); return true; }); return () => sub.remove(); }, []); // registered last, so it runs before the pause card's
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

  return <>
    {/* Not cancelable: a second finger on the table must not hand the touch to the table's aim. onPress: TalkBack's
        activation is a click with no press in. */}
    <Pressable style={[StyleSheet.absoluteFill, { right: keep }]} onPressIn={onDone} onPress={onDone} cancelable={false} accessibilityRole="button" accessibilityLabel="Close spin and cue elevation" />
    {/* It grows from 95% at the centre in 200 ms and fades out in 120 ms; with reduced motion it only fades in. The layer
        is the size of the window and lets touches through to the catcher, so the fade out blocks nothing. */}
    <Animated.View pointerEvents="box-none" accessibilityViewIsModal exiting={calm ? undefined : FadeOut.duration(120)} style={[styles.layer, !land && { right: keep, padding: 8 },
      { animationName: { from: { opacity: 0, transform: [{ scale: calm ? 1 : 0.95 }] } }, animationDuration: '200ms', animationTimingFunction: EASE_OUT }]}>
      {/* The sheet takes every touch that starts on it, so a slip off a handle does not close it. */}
      <View onStartShouldSetResponder={() => true} onResponderTerminationRequest={() => false} onAccessibilityEscape={onDone} style={styles.sheet}>
        <View {...pan.panHandlers} style={{ width: D * TRIM, height: D * TRIM }} accessible accessibilityRole="adjustable" accessibilityLabel="Cue elevation and tip position" accessibilityLiveRegion="polite"
          accessibilityValue={{ min: 0, max: MAX_ELEV, now: t.elev, text: `${t.elev} degrees, ${zone(t.elev)}. ${spinLabel(t)}` }}
          accessibilityActions={Object.keys(acts).map(name => ({ name, label: name }))} onAccessibilityAction={e => acts[e.nativeEvent.actionName]?.()}>
          <Canvas style={{ position: 'absolute', left: 0, top: 0, width: D, height: D }} pointerEvents="none"><Picture picture={ring} /></Canvas>
        </View>
        <View style={styles.side} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Canvas style={styles.sideView}><Picture picture={side} /></Canvas>
          <Text maxFontSizeMultiplier={1.3} style={styles.deg}>{t.elev}°</Text>
          {blend && <Text maxFontSizeMultiplier={1.3} style={styles.zone}>{zoneLabel(t)}</Text>}{/* one colour: the player learns the zones */}
        </View>
      </View>
    </Animated.View>
  </>;
}

const styles = StyleSheet.create({
  holder: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  atTop: { justifyContent: 'flex-start' },
  badge: { position: 'absolute', right: 0, top: 0, minWidth: 22, paddingHorizontal: 3, borderRadius: 3, overflow: 'hidden', backgroundColor: C.chalk, color: C.ink, fontFamily: FONT.bold, fontSize: 10, lineHeight: 13, textAlign: 'center', fontVariant: ['tabular-nums'] },
  layer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  // A dark slab: the lip is a solid bottom edge of the lip colour, not an outline. It hugs the ring and the side picture, 12 pt on every side.
  sheet: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: DARK[0], borderBottomWidth: 5, borderColor: DARK[1], borderRadius: 5 },
  side: { width: SIDE.w, alignItems: 'center' },
  sideView: { width: SIDE.w, height: SIDE.h, marginTop: -12 }, // the picture is empty at the top until the cue is raised: that part lies over the sheet's padding, so the column is as tall as the ring
  deg: { color: C.chalk, fontFamily: FONT.display, fontSize: 22, lineHeight: 26, paddingLeft: 5, fontVariant: ['tabular-nums'] }, // paddingLeft: the digits sit at the centre, not the digits and the degree sign
  zone: { color: C.chalk + 'B3', fontFamily: FONT.semi, fontSize: 11.5, lineHeight: 15, textAlign: 'center', minHeight: 30 }, // room for two lines, so the picture does not move when the text wraps
});
