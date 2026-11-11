// Device smoke test: the real engine on a Quiet Slate table. Pull back from anywhere to aim and shoot.
// shortcut: no spin or elevation controls, rules or HUD yet (the Demo button plays spin, jump and masse shots);
// this screen proves Skia, the engine and the ball animation on the phone.
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, PixelRatio, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Canvas, Picture, Skia } from '@shopify/react-native-skia';
import Animated, { useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { initialWindowMetrics, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ball, CUE, P, predict, rack, Shot, strike } from './src/physics/engine';
import { advance, drawBalls, makeKit, newLook } from './src/render/balls';
import { BAR, drawAim, drawTable, fit, toTable } from './src/render/table';
import { C, CLOTHS } from './src/theme';

const MAX_DRAG = 160; // px of pull-back for full power
// Shots the screen has no controls for yet, played from a fresh rack so the spin, jump and masse animation can be seen.
const DEMOS: [string, Partial<Shot>][] = [['Draw', { speed: 2.5, b: -0.45 }], ['Side', { speed: 1.2, a: 0.45 }], ['Jump', { speed: 4.2, elev: 0.7 }], ['Massé', { speed: 3.5, a: 0.4, elev: 1.19 }]];
const kit = makeKit(Skia);
const EMPTY = (() => { const rec = Skia.PictureRecorder(); rec.beginRecording(); return rec.finishRecordingAsPicture(); })();

const newTable = () => {
  const ids = [0], B: Ball[] = [{ x: P.L / 4, y: P.W / 2, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true }];
  for (const [id, x, y] of rack(8)) { ids.push(id); B.push({ x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true }); }
  return { B, ids, look: newLook(B), broken: false };
};

export default function App() {
  return <SafeAreaProvider initialMetrics={initialWindowMetrics}><Game /></SafeAreaProvider>;
}

function Game() {
  const { width, height } = useWindowDimensions();
  const pad = useSafeAreaInsets(), calm = useReducedMotion();
  const view = { ...fit(width, height, pad), dpr: PixelRatio.get(), calm }, where = [view.land, view.s, view.ox, view.oy];
  const [cloth, setCloth] = useState(0); // shortcut: not saved between launches, save it when the settings screen exists
  const map = useRef(view); map.current = view; // the pan responder is created once, so it reads the latest mapping
  // The table never changes during play: one picture, drawn again only when the window does.
  const felt = useMemo(() => { const rec = Skia.PictureRecorder(); drawTable(Skia, rec.beginRecording(), view, CLOTHS[cloth]); return rec.finishRecordingAsPicture(); }, [...where, cloth]);

  const table = useRef(newTable());
  const [aim, setAim] = useState<{ path: number[][]; ghost: number[] | null; pull: number } | null>(null);
  const guide = useMemo(() => { const rec = Skia.PictureRecorder(), c = rec.beginRecording(); if (aim) drawAim(Skia, c, view, aim.path, aim.ghost); return rec.finishRecordingAsPicture(); }, [aim, ...where]);
  const [demo, setDemo] = useState(0);
  const moving = useRef(false);
  // The balls are one Skia picture, recorded here each frame and handed to the canvas through a shared value, so a
  // frame of play never re-renders React.
  const picture = useSharedValue(EMPTY);
  const paint = useRef(() => {});
  paint.current = () => {
    const rec = Skia.PictureRecorder(), { B, ids, look } = table.current;
    drawBalls(kit, rec.beginRecording(), B, ids, look, view);
    picture.set(rec.finishRecordingAsPicture());
  };
  useEffect(() => paint.current(), where);

  useEffect(() => {
    let raf = 0, last = 0, owed = 0;
    const tick = (t: number) => {
      const { B, look } = table.current;
      if (moving.current || look.fx.length) { // effects (a ball falling into a pocket) outlive the last moving ball
        owed = Math.min(50, owed + (last ? t - last : 16)); // real time, capped after a stall; the part of a millisecond left over carries on
        const ms = Math.floor(owed); owed -= ms;
        moving.current = advance(B, look, ms, moving.current);
        paint.current();
      }
      last = t; raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const shotFrom = (dx: number, dy: number): { shot: Shot; pull: number } => {
    const pull = Math.min(1, Math.hypot(dx, dy) / MAX_DRAG);
    const a = toTable(map.current, 0, 0), b = toTable(map.current, -dx, -dy); // aim opposite the pull
    const max = table.current.broken ? CUE.maxSpeed : CUE.breakSpeed;
    return { shot: { ang: Math.atan2(b.y - a.y, b.x - a.x), speed: Math.max(0.05, pull * max), a: 0, b: 0 }, pull };
  };
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !moving.current,
    onPanResponderMove: (_, g) => {
      const { shot, pull } = shotFrom(g.dx, g.dy), { cue, hit } = predict(table.current.B, shot, 0.4);
      setAim({ pull, path: cue, ghost: hit && [hit.x, hit.y] });
    },
    onPanResponderRelease: (_, g) => {
      setAim(null);
      const { shot, pull } = shotFrom(g.dx, g.dy);
      if (pull < 0.05) return;
      const { B } = table.current;
      if (!B[0].on) Object.assign(B[0], { x: P.L / 4, y: P.W / 2, on: true }); // shortcut: a scratch respots on the head spot, no ball in hand yet
      Haptics.impactAsync(pull > 0.7 ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light);
      strike(B[0], shot); table.current.broken = true; moving.current = true;
    },
  })).current;

  return (
    <View style={styles.root} {...pan.panHandlers}>
      <StatusBar style="light" />
      <Canvas style={StyleSheet.absoluteFill}>
        <Picture picture={felt} />
        <Picture picture={guide} />
        <Picture picture={picture} />
      </Canvas>
      {/* Controls sit inside the safe area: a row under the table in portrait, a column beside it in landscape. */}
      <View style={[styles.bar, view.land ? { top: pad.top, bottom: pad.bottom, right: pad.right, width: BAR, flexDirection: 'column' } : { left: pad.left, right: pad.right, bottom: pad.bottom, height: BAR, flexDirection: 'row' }]}>
        {aim && <Text style={[styles.power, view.land ? { top: 8 } : { left: 16 }]}>{Math.round(aim.pull * 100)}%</Text>}
        <Btn label="Rack" onPress={() => { table.current = newTable(); moving.current = false; paint.current(); }} />
        <Btn label={'Demo\n' + DEMOS[demo][0]} onPress={() => {
          table.current = newTable(); table.current.broken = true;
          strike(table.current.B[0], { ang: 0, speed: 1, a: 0, b: 0, ...DEMOS[demo][1] });
          moving.current = true; setDemo((demo + 1) % DEMOS.length);
        }} />
        <Btn label={'Felt\n' + CLOTHS[cloth].name} onPress={() => setCloth((cloth + 1) % CLOTHS.length)} />
      </View>
    </View>
  );
}

// Chrome button: hairline outline, a 44 pt target, and a 3% press that follows the finger down (no bounce).
function Btn({ label, onPress }: { label: string; onPress: () => void }) {
  const [down, setDown] = useState(false);
  return (
    <Pressable onPress={onPress} onPressIn={() => setDown(true)} onPressOut={() => setDown(false)} pressRetentionOffset={16} accessibilityRole="button" accessibilityLabel={label.replace('\n', ' ')}>
      <Animated.View style={{ ...styles.btn, transform: [{ scale: down ? 0.97 : 1 }], transitionProperty: 'transform', transitionDuration: '120ms', transitionTimingFunction: 'ease-out' }}>
        <Text style={styles.btnText}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.ground },
  bar: { position: 'absolute', alignItems: 'center', justifyContent: 'center', gap: 12 },
  power: { position: 'absolute', color: C.chalk, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  btn: { minWidth: 56, minHeight: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', borderColor: C.chalk + '66', borderWidth: 1, borderRadius: 6 }, // outline at 40%: 3:1 on the ground
  btnText: { color: C.chalk, fontSize: 13, lineHeight: 16, textAlign: 'center' },
});
