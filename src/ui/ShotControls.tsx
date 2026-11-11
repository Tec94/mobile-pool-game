// The shot controls: the power rail (pull down, release to strike) and the fine aim dial. The numbers are in
// src/shot/aim.ts and the drawing in src/render/cue.ts; this file is the React Native shell around them.
// Feel: every haptic fires on the touch move that causes it, one per step, and the picture alone says the same.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { Canvas, Picture, Skia, SkCanvas } from '@shopify/react-native-skia';
import Animated, { useSharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Box, DIAL, drawDial, drawRail, RAIL_LABEL } from '../render/cue';
import { dialTurn, nudge, powerTick, pullPower, railLabel, release, TAP_MS } from '../shot/aim';
import { C } from '../theme';

// The shot being set up lives outside React state, as the tip does: a frame of aiming or pulling redraws Skia
// pictures through shared values and never renders the game screen.
// aim = radians in the table frame; power = 0..1; fine = the dial was used for this shot; locked = balls are moving.
export interface ShotState { aim: number; power: number; fine: boolean; locked: boolean }
export interface ShotStore { get: () => ShotState; set: (s: Partial<ShotState>) => void; sub: (f: () => void) => () => void }
export function shotStore(aim: number): ShotStore {
  let v: ShotState = { aim, power: 0, fine: false, locked: false }; const subs = new Set<() => void>();
  return { get: () => v, set: s => { v = { ...v, ...s }; subs.forEach(f => f()); }, sub: f => { subs.add(f); return () => { subs.delete(f); }; } };
}
const picture = (draw: (c: SkCanvas) => void) => { const rec = Skia.PictureRecorder(); draw(rec.beginRecording()); return rec.finishRecordingAsPicture(); };
const EMPTY = picture(() => {});
const tick = () => { Haptics.selectionAsync(); };
const dim = (locked: boolean) => ({ opacity: locked ? 0.35 : 1, transitionProperty: 'opacity', transitionDuration: '200ms' }) as const; // the controls wait while balls move

// The power rail. A pull starts anywhere on it and is measured from where the finger went down, so the thumb never
// has to find the cue. Release above 5% strikes; under 5%, or a touch the system takes away, cancels.
// shortcut: the label is React state of this small component (one render per whole percent); draw it in the Skia
// picture if a slow phone shows the number behind the finger.
// shortcut: one finger at a time, so the aim cannot be turned during a pull; that needs gesture-handler.
// shortcut: no Strike control "Tap" mode; the settings screen adds it.
export function PowerRail({ store, box, onStrike }: { store: ShotStore; box: Box; onStrike: (power: number) => void }) {
  const locked = useSyncExternalStore(store.sub, () => store.get().locked), [label, setLabel] = useState('Pull');
  const pic = useSharedValue(EMPTY), pull = useRef<{ from: number; hist: number[][]; id: number; y: number } | null>(null);
  const now = useRef({ box, onStrike }); now.current = { box, onStrike }; // the pan responder is created once, so it reads the latest
  useEffect(() => {
    let was = -1;
    const draw = () => {
      const { power } = store.get(); setLabel(railLabel(power, !!pull.current));
      if (power !== was) { was = power; pic.set(picture(c => drawRail(Skia, c, box.width, box.height, power))); }
    };
    draw(); return store.sub(draw);
  }, [box.width, box.height]);
  const setPower = (p: number) => {
    const k = powerTick(store.get().power, p);
    if (k === 2) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); else if (k) tick();
    store.set({ power: p });
  };
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !store.get().locked,
    onPanResponderGrant: e => { pull.current = { from: store.get().power, hist: [], id: e.nativeEvent.identifier, y: e.nativeEvent.pageY }; },
    onPanResponderMove: e => { // the pull is the travel of the finger that went down on the rail: a second finger elsewhere does not change the power
      const d = pull.current, f = d && e.nativeEvent.touches.find(t => t.identifier === d.id); if (!d || !f) return;
      const p = pullPower(f.pageY - d.y, now.current.box.height, d.from);
      d.hist.push([Date.now(), p]); if (d.hist.length > 60) d.hist.shift();
      setPower(p);
    },
    onPanResponderRelease: () => {
      const d = pull.current; pull.current = null; if (!d) return;
      const p = release(d.hist, Date.now(), store.get().power);
      if (p) now.current.onStrike(p); else store.set({ power: 0 });
    },
    onPanResponderTerminationRequest: () => false, // a second finger on the table must not take the pull
    onPanResponderTerminate: () => { pull.current = null; store.set({ power: 0 }); },
  })).current;

  // VoiceOver and TalkBack: swipe up and down set the power in steps of 10%, a double tap strikes at that power.
  const pct = Math.round(store.get().power * 100);
  const act = (name: string) => {
    const p = store.get().power; if (store.get().locked) return;
    if (name === 'activate') { if (p > 0.05) onStrike(p); }
    else setPower(Math.min(1, Math.max(0, Math.round(p * 10 + (name === 'increment' ? 1 : -1)) / 10)));
  };
  return (
    <Animated.View {...pan.panHandlers} style={[styles.at, box, dim(locked)]} accessible accessibilityRole="adjustable" accessibilityLabel="Power" accessibilityHint="Pull down and release to shoot"
      accessibilityState={{ disabled: locked }} accessibilityValue={{ min: 0, max: 100, now: pct, text: `${pct} percent` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }, { name: 'activate', label: 'Shoot' }]} onAccessibilityAction={e => act(e.nativeEvent.actionName)}>
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none"><Picture picture={pic} /></Canvas>
      <Text maxFontSizeMultiplier={1.15} numberOfLines={1} style={styles.label}>{label}</Text>
    </Animated.View>
  );
}

// The fine aim dial: a drag along it turns the aim 0.0012 rad per px with a tick each half degree, and a tap on
// either half nudges 0.1 degree toward that side. It lies under the table in portrait and stands beside it in landscape.
// shortcut: no undo of a big swing and no aim sensitivity setting (SENS in aim.ts); both come with the settings screen.
export function AimDial({ store, box }: { store: ShotStore; box: Box }) {
  const locked = useSyncExternalStore(store.sub, () => store.get().locked);
  const pic = useSharedValue(EMPTY), drag = useRef<{ last: number; moved: number; t: number; side: number } | null>(null);
  const size = useRef(box); size.current = box;
  useEffect(() => {
    let was = NaN;
    const draw = () => { const { aim } = store.get(); if (aim !== was) { was = aim; pic.set(picture(c => drawDial(Skia, c, box.width, box.height, aim))); } };
    draw(); return store.sub(draw);
  }, [box.width, box.height]);
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !store.get().locked,
    onPanResponderGrant: e => {
      const { width, height } = size.current, { locationX: x, locationY: y } = e.nativeEvent;
      drag.current = { last: 0, moved: 0, t: Date.now(), side: (height > width ? y > height / 2 : x > width / 2) ? 1 : -1 };
    },
    onPanResponderMove: (_, g) => {
      const d = drag.current; if (!d) return;
      const at = size.current.height > size.current.width ? g.dy : g.dx, step = at - d.last; d.last = at; d.moved += Math.abs(step);
      if (d.moved < 4) return; // slop: a tap that slips is not a turn
      const to = dialTurn(store.get().aim, step); if (to.tick) tick();
      store.set({ aim: to.aim, fine: true });
    },
    onPanResponderRelease: () => {
      const d = drag.current; drag.current = null;
      if (d && d.moved < 4 && Date.now() - d.t < TAP_MS) { store.set({ aim: nudge(store.get().aim, d.side), fine: true }); tick(); }
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: () => { drag.current = null; },
  })).current;
  return (
    <Animated.View {...pan.panHandlers} hitSlop={box.height > box.width ? { left: (44 - DIAL) / 2, right: (44 - DIAL) / 2 } : { top: (44 - DIAL) / 2, bottom: (44 - DIAL) / 2 }} style={[styles.at, box, dim(locked)]} accessible accessibilityRole="adjustable" accessibilityLabel="Fine aim" accessibilityHint="A tenth of a degree for each step"
      accessibilityState={{ disabled: locked }} accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={e => { if (!store.get().locked) store.set({ aim: nudge(store.get().aim, e.nativeEvent.actionName === 'increment' ? 1 : -1), fine: true }); }}>
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none"><Picture picture={pic} /></Canvas>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  at: { position: 'absolute' },
  label: { position: 'absolute', left: 0, right: 0, bottom: 0, height: RAIL_LABEL, lineHeight: RAIL_LABEL, textAlign: 'center', color: C.chalk + 'CC', fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
