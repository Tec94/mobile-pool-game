// Device smoke test: the real engine on a Quiet Slate table, with the shot controls. Drag or tap on the table to aim,
// turn the dial to aim finely, pull the rail down and let go to shoot. The table never fires a shot.
// The cue ball button opens the tip and cue angle sheet (spin, jump, masse).
// shortcut: no rules or HUD yet; this screen proves Skia, the engine and the ball animation on the phone.
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, PixelRatio, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Canvas, Picture, Skia } from '@shopify/react-native-skia';
import Animated, { useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { initialWindowMetrics, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ball, CUE, P, rack, Shot, strike } from './src/physics/engine';
import { advance, drawBalls, makeKit, newLook } from './src/render/balls';
import { drawCue, shotLayout } from './src/render/cue';
import { drawAim, drawTable, toTable } from './src/render/table';
import { LEVEL, shotTip } from './src/render/tip';
import { aimGuide, DRAG, guideFor, HOUSE_CUE, nearest, previewPower, swing, TAP_MS, tapAim } from './src/shot/aim';
import { C, CLOTHS } from './src/theme';
import { AimDial, PowerRail, shotStore } from './src/ui/ShotControls';
import { TipButton, TipSheet, tipStore } from './src/ui/TipControl';

// Sample shots, played from a fresh rack so the spin, jump and masse animation can be seen without aiming one.
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
  const lay = shotLayout(width, height, pad), view = { ...lay.view, dpr: PixelRatio.get(), calm }, where = [view.land, view.s, view.ox, view.oy];
  const [cloth, setCloth] = useState(0); // shortcut: not saved between launches, save it when the settings screen exists
  const map = useRef(view); map.current = view; // the pan responder is created once, so it reads the latest mapping
  // The table never changes during play: one picture, drawn again only when the window does.
  const felt = useMemo(() => { const rec = Skia.PictureRecorder(); drawTable(Skia, rec.beginRecording(), view, CLOTHS[cloth]); return rec.finishRecordingAsPicture(); }, [...where, cloth]);

  const table = useRef(newTable());
  const shot = useRef(shotStore(nearest(table.current.B))).current; // the held aim and the power on the rail
  const [demo, setDemo] = useState(0);
  const tip = useRef(tipStore()).current, [sheet, setSheet] = useState(false), [tools, setTools] = useState(false);
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
  // The guide and the cue stick are a second picture, drawn again when the aim, the power, the tip or the table
  // changes: while no ball moves the guide is always there, for the pull on the rail or for a firm shot without one.
  const shotOf = (power: number): Shot => ({ ang: shot.get().aim, speed: Math.max(0.05, power * (table.current.broken ? CUE.maxSpeed : CUE.breakSpeed)), ...shotTip(tip.get()) });
  const guide = useSharedValue(EMPTY);
  const sight = useRef(() => {});
  sight.current = () => {
    const rec = Skia.PictureRecorder(), c = rec.beginRecording(), { B } = table.current, { aim, power } = shot.get();
    if (!moving.current) {
      const g = aimGuide(B, shotOf(previewPower(power)), guideFor(HOUSE_CUE.aim));
      drawAim(Skia, c, view, g.path, g.ghost, g.lands, g.lost, g.ob); drawCue(Skia, c, view, B[0].x, B[0].y, aim, power);
    }
    guide.set(rec.finishRecordingAsPicture());
  };
  useEffect(() => { paint.current(); sight.current(); }, where);
  useEffect(() => { const off = [shot.sub(() => sight.current()), tip.sub(() => sight.current())]; return () => off.forEach(f => f()); }, []);
  // The table is at rest, or newly racked: the cue points at the nearest ball and the controls unlock.
  const settle = () => {
    const { B, look } = table.current; moving.current = false;
    if (!B[0].on) { Object.assign(B[0], { x: P.L / 4, y: P.W / 2, on: true }); look.last.set([B[0].x, B[0].y]); } // shortcut: a scratch respots on the head spot, no ball in hand yet
    paint.current(); shot.set({ aim: nearest(B, shot.get().aim), power: 0, fine: false, locked: false });
  };

  useEffect(() => {
    let raf = 0, last = 0, owed = 0;
    const tick = (t: number) => {
      const { B, look } = table.current;
      if (moving.current || look.fx.length) { // effects (a ball falling into a pocket) outlive the last moving ball
        owed = Math.min(50, owed + (last ? t - last : 16)); // real time, capped after a stall; the part of a millisecond left over carries on
        const ms = Math.floor(owed); owed -= ms;
        const was = moving.current; moving.current = advance(B, look, ms, was);
        paint.current(); if (was && !moving.current) settle();
      }
      last = t; raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // The rail calls this on release: the strike. The cue goes back to level and centre ball after every shot.
  // shortcut: no follow-through of the stick; the cue is off the table from the frame of the strike.
  const fire = (power: number) => {
    Haptics.impactAsync(power > 0.7 ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light);
    strike(table.current.B[0], shotOf(power)); table.current.broken = true; moving.current = true;
    tip.set(LEVEL); setSheet(false); setTools(false); shot.set({ power: 0, fine: false, locked: true });
  };
  // Where the finger is about the cue ball: its angle in the table frame and its distance on the screen.
  const finger = (px: number, py: number) => { const p = toTable(map.current, px, py), c = table.current.B[0]; return { ang: Math.atan2(p.y - c.y, p.x - c.x), lever: Math.hypot(p.x - c.x, p.y - c.y) * map.current.s }; };
  const touch = useRef<{ t: number; moved: boolean; ang: number; lever: number } | null>(null);
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !moving.current,
    // Any touch aims. (The rules put two cases before this one: a touch by the cue ball in hand, a touch on a pocket.)
    onPanResponderGrant: (_, g) => { touch.current = { t: Date.now(), moved: false, ...finger(g.x0, g.y0) }; },
    onPanResponderMove: (_, g) => { // a drag swings the aim by the turn of the finger about the cue ball
      const d = touch.current; if (!d || (!d.moved && Math.hypot(g.dx, g.dy) < DRAG)) return;
      const f = finger(g.moveX, g.moveY); d.moved = true;
      shot.set({ aim: swing(shot.get().aim, d.ang, f.ang, f.lever) }); d.ang = f.ang;
    },
    onPanResponderRelease: () => { // a tap points the cue at the tapped point
      const d = touch.current, s = shot.get(); touch.current = null; if (!d || d.moved || Date.now() - d.t >= TAP_MS || d.lever < P.R * map.current.s) return; // a tap on the cue ball itself points nowhere
      const aim = tapAim(s.aim, s.fine, d.ang); if (aim !== s.aim) { shot.set({ aim }); Haptics.selectionAsync(); }
    },
    onPanResponderTerminate: () => { touch.current = null; },
  })).current;

  return (
    <View style={styles.root} {...pan.panHandlers}>
      <StatusBar style="light" />
      <Canvas style={StyleSheet.absoluteFill}>
        <Picture picture={felt} />
        <Picture picture={guide} />
        <Picture picture={picture} />
      </Canvas>
      {/* The shot controls sit inside the safe area where shotLayout puts them. */}
      <PowerRail store={shot} box={lay.rail} onStrike={fire} />
      <AimDial store={shot} box={lay.dial} />
      <View style={[styles.at, lay.spin]}><TipButton store={tip} onPress={() => setSheet(!sheet)} /></View>
      <View style={[styles.at, lay.tools]}><Btn label="•••" name="Table tools" onPress={() => setTools(!tools)} /></View>
      {/* shortcut: the smoke-test buttons, behind one button until the menus exist. */}
      {tools && (
        <View onStartShouldSetResponder={() => true} style={[styles.tools, view.land ? { left: lay.tools.left + lay.tools.width + 12, bottom: height - lay.tools.top - lay.tools.height } : { left: lay.tools.left, bottom: height - lay.dial.top + 8 }]}>
          <Btn label="Rack" onPress={() => { table.current = newTable(); settle(); }} />
          <Btn label={'Demo\n' + DEMOS[demo][0]} onPress={() => {
            table.current = newTable(); table.current.broken = true;
            strike(table.current.B[0], { ang: 0, speed: 1, a: 0, b: 0, ...DEMOS[demo][1] });
            moving.current = true; shot.set({ power: 0, locked: true }); setDemo((demo + 1) % DEMOS.length);
          }} />
          <Btn label={'Felt\n' + CLOTHS[cloth].name} onPress={() => setCloth((cloth + 1) % CLOTHS.length)} />
        </View>
      )}
      {/* The sheet stops short of the rail, so a shot can be pulled while it is open. */}
      {sheet && <TipSheet store={tip} land={view.land} calm={calm} felt={CLOTHS[cloth].felt} onDone={() => setSheet(false)} width={view.land ? 300 : lay.rail.left - 8 - lay.tools.left}
        style={view.land ? { right: width - lay.rail.left + 8, bottom: Math.max(pad.bottom, 8) } : { left: lay.tools.left, bottom: height - lay.dial.top + 8 }} />}
    </View>
  );
}

// Chrome button: hairline outline, a 44 pt target, and a 3% press that follows the finger down (no bounce). Its label
// grows with the system text size only as far as the control bar has room for.
function Btn({ label, name, onPress }: { label: string; name?: string; onPress: () => void }) {
  const [down, setDown] = useState(false);
  return (
    <Pressable onPress={onPress} onPressIn={() => setDown(true)} onPressOut={() => setDown(false)} pressRetentionOffset={16} accessibilityRole="button" accessibilityLabel={name ?? label.replace('\n', ' ')}>
      <Animated.View style={{ ...styles.btn, transform: [{ scale: down ? 0.97 : 1 }], transitionProperty: 'transform', transitionDuration: '120ms', transitionTimingFunction: 'ease-out' }}>
        <Text maxFontSizeMultiplier={1.3} style={styles.btnText}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.ground },
  at: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  tools: { position: 'absolute', flexDirection: 'row', gap: 8, padding: 8, backgroundColor: C.panel, borderColor: C.chalk + '40', borderWidth: 1, borderRadius: 12 },
  btn: { minWidth: 56, minHeight: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', borderColor: C.chalk + '66', borderWidth: 1, borderRadius: 6 }, // outline at 40%: 3:1 on the ground
  btnText: { color: C.chalk, fontSize: 13, lineHeight: 16, textAlign: 'center' },
});
