// Device smoke test: the real engine on a Quiet Slate table. Pull back from anywhere to aim and shoot.
// The cue ball button opens the tip and cue angle sheet (spin, jump, masse).
// shortcut: no rules or HUD yet; this screen proves Skia, the engine and the ball animation on the phone.
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, PixelRatio, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Canvas, Picture, Skia, type SkPicture } from '@shopify/react-native-skia';
import Animated, { useFrameCallback, useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { scheduleOnUI } from 'react-native-worklets';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { initialWindowMetrics, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ball, CUE, P, predict, rack, Shot, strike } from './src/physics/engine';
import { advance, drawBalls, makeKit, newLook } from './src/render/balls';
import { newPace, nextFrame, type Pace, refresh, type Slot, spent } from './src/render/pace';
import { BAR, drawAim, drawTable, fit, toTable } from './src/render/table';
import { LEVEL, shotTip } from './src/render/tip';
import { C, CLOTHS } from './src/theme';
import { TipButton, TipSheet, tipStore } from './src/ui/TipControl';

const MAX_DRAG = 160; // px of pull-back for full power
const GUIDE_WORK = 3200; // ball-steps the aim guide may follow after first contact: one update stays inside a frame, even into the rack
const STILL = 1e9; // ms: a picture that stays on screen until the next one comes (the table at rest, the last frame of a shot)
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
  const view = { ...fit(width, height, pad), dpr: PixelRatio.get(), calm }, where = [view.land, view.s, view.ox, view.oy];
  const [cloth, setCloth] = useState(0); // shortcut: not saved between launches, save it when the settings screen exists
  const map = useRef(view); map.current = view; // the pan responder is created once, so it reads the latest mapping
  // The table never changes during play: one picture, drawn again only when the window does.
  const felt = useMemo(() => { const rec = Skia.PictureRecorder(); drawTable(Skia, rec.beginRecording(), view, CLOTHS[cloth]); return rec.finishRecordingAsPicture(); }, [...where, cloth]);

  const table = useRef(newTable());
  const [pull, setPull] = useState<number | null>(null); // % of full power while the player aims
  const want = useRef<number[] | null>(null); // the newest pull-back not yet drawn: touches can come faster than frames
  const [demo, setDemo] = useState(0);
  const [hud, setHud] = useState(__DEV__), [rates, setRates] = useState(''); // frame rate readout: hold the Rack button to show or hide it
  const tip = useRef(tipStore()).current, [sheet, setSheet] = useState(false);
  const moving = useRef(false);
  // The balls and the aim guide are Skia pictures, recorded on the JS thread and handed to the canvas through shared
  // values, so a frame of play or of aiming never re-renders React.
  const picture = useSharedValue(EMPTY), guide = useSharedValue(EMPTY);
  const draw = useRef(() => EMPTY);
  draw.current = () => {
    const rec = Skia.PictureRecorder(), { B, ids, look } = table.current;
    drawBalls(kit, rec.beginRecording(), B, ids, look, view);
    return rec.finishRecordingAsPicture();
  };
  // Frames of play wait in queue and the UI thread shows one on each display refresh (see src/render/pace.ts).
  const queue = useSharedValue<Slot<SkPicture>[]>([]), left = useSharedValue(STILL);
  const seen = useSharedValue([0, 0, 0, 0, 0]); // counts for the readout (refreshes, frames shown, refreshes with no frame ready, frames skipped), then the share of the last refreshes that came less than 12 ms apart: above a half is a 120 Hz display
  const beat = useFrameCallback(f => {
    'worklet';
    const dt = f.timeSincePreviousFrame ?? 0, r = refresh(queue.value, left.value, dt), s = seen.value;
    left.value = r.left;
    if (r.show) { queue.value = r.rest; picture.value = r.show; }
    seen.value = [s[0] + 1, s[1] + (r.show ? 1 : 0), s[2] + (r.dry ? 1 : 0), s[3] + r.skipped, dt ? 0.9 * s[4] + (dt < 12 ? 0.1 : 0) : s[4]];
  }, false);
  const live = useRef(beat); live.current = beat;
  const push = (pic: SkPicture, ms: number, first: boolean) => { 'worklet'; queue.value = first ? [{ pic, ms }] : [...queue.value, { pic, ms }]; if (first) left.value = 0; };
  const still = (pic: SkPicture) => { 'worklet'; queue.value = []; left.value = STILL; picture.value = pic; };
  const pace = useRef<Pace | null>(null), rate = useRef(0), made = useRef([0, 0]); // rate = the frame time a phone too slow for the display fell back to; made = frames made and the ms they took, for the readout
  // The table as it is now, shown at once in place of any frames that wait. Play that goes on starts its frames again.
  const paint = () => { pace.current = null; scheduleOnUI(still, draw.current()); };
  useEffect(paint, where);

  useEffect(() => {
    let raf = 0, on = true; // on = the UI thread's frame callback runs. It stops between shots: it keeps the display at full rate
    live.current.setActive(true); // a short run at launch measures the display's refresh interval for the first shot
    const rest = () => setTimeout(() => { if (!on) live.current.setActive(false); }, 300);
    let timer = rest(); on = false;
    const tick = (t: number) => {
      const { B, look } = table.current;
      if (want.current) { // one aim guide a frame, for the newest touch
        const { shot, pull } = shotFrom(want.current[0], want.current[1]), { cue, hit, lands, scratch, split } = predict(B, shot, 0.4, undefined, undefined, GUIDE_WORK);
        const rec = Skia.PictureRecorder(); drawAim(Skia, rec.beginRecording(), map.current, cue, hit && [hit.x, hit.y], lands, scratch && split < 0);
        guide.value = rec.finishRecordingAsPicture(); setPull(Math.round(pull * 100)); want.current = null;
      }
      const busy = () => moving.current || look.fx.length > 0; // effects (a ball falling into a pocket) outlive the last moving ball
      if (busy()) {
        let p = pace.current;
        const first = !p;
        if (!p) p = pace.current = newPace(Math.max(rate.current, seen.value[4] > 0.5 ? 1000 / 120 : 1000 / 60));
        if (!on) { on = true; clearTimeout(timer); live.current.setActive(true); }
        for (let n = 0, ms; n < 4 && busy() && (ms = nextFrame(p, t)); n++) { // at most 4 frames a turn, so a late JS thread still answers touches
          const t0 = performance.now();
          moving.current = advance(B, look, ms, moving.current);
          scheduleOnUI(push, draw.current(), busy() ? p.frame : STILL, first && !n);
          const cost = performance.now() - t0; spent(p, cost); rate.current = p.frame; made.current[0]++; made.current[1] += cost;
        }
      } else if (on) { on = false; pace.current = null; timer = rest(); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!hud) return;
    let was = seen.value, n = 0, cost = 0;
    const id = setInterval(() => { // twice a second
      const s = seen.value, [m, c] = made.current, k = m - n;
      setRates(`display ${s[4] > 0.5 ? 120 : 60} Hz  shown ${2 * (s[1] - was[1])}/s  none ready ${2 * (s[2] - was[2])}/s  skipped ${2 * (s[3] - was[3])}/s\nmade ${2 * k}/s  ${k ? ((c - cost) / k).toFixed(1) : '-'} ms each${pace.current ? `  for ${Math.round(1000 / pace.current.frame)} Hz` : ''}`);
      was = s; n = m; cost = c;
    }, 500);
    return () => clearInterval(id);
  }, [hud]);

  const shotFrom = (dx: number, dy: number): { shot: Shot; pull: number } => {
    const pull = Math.min(1, Math.hypot(dx, dy) / MAX_DRAG);
    const a = toTable(map.current, 0, 0), b = toTable(map.current, -dx, -dy); // aim opposite the pull
    const max = table.current.broken ? CUE.maxSpeed : CUE.breakSpeed;
    return { shot: { ang: Math.atan2(b.y - a.y, b.x - a.x), speed: Math.max(0.05, pull * max), ...shotTip(tip.get()) }, pull };
  };
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !moving.current,
    onPanResponderMove: (_, g) => { want.current = [g.dx, g.dy]; },
    onPanResponderRelease: (_, g) => {
      want.current = null; guide.value = EMPTY; setPull(null);
      const { shot, pull } = shotFrom(g.dx, g.dy);
      if (pull < 0.05) return;
      const { B } = table.current;
      if (!B[0].on) Object.assign(B[0], { x: P.L / 4, y: P.W / 2, on: true }); // shortcut: a scratch respots on the head spot, no ball in hand yet
      Haptics.impactAsync(pull > 0.7 ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light);
      strike(B[0], shot); table.current.broken = true; moving.current = true;
      tip.set(LEVEL); setSheet(false); // the cue goes back to level and centre ball after every shot
    },
  })).current;

  return (
    <View style={styles.root} {...pan.panHandlers}>
      <StatusBar style="light" />
      {/* The table has its own canvas: it is most of the drawing work and it does not change during play. */}
      <Canvas style={StyleSheet.absoluteFill}>
        <Picture picture={felt} />
      </Canvas>
      <Canvas style={StyleSheet.absoluteFill}>
        <Picture picture={guide} />
        <Picture picture={picture} />
      </Canvas>
      {hud && <Text pointerEvents="none" style={[styles.hud, { top: pad.top, left: pad.left + 8 }]}>{rates}</Text>}
      {/* Controls sit inside the safe area: a row under the table in portrait, a column beside it in landscape. */}
      <View style={[styles.bar, view.land ? { top: pad.top, bottom: pad.bottom, right: pad.right, width: BAR, flexDirection: 'column' } : { left: pad.left, right: pad.right, bottom: pad.bottom, height: BAR, flexDirection: 'row' }]}>
        {pull !== null && <Text maxFontSizeMultiplier={1.3} style={[styles.power, view.land ? { top: 8 } : { left: 16 }]}>{pull}%</Text>}
        <Btn label="Rack" onPress={() => { table.current = newTable(); moving.current = false; paint(); }} onLongPress={() => setHud(!hud)} />
        <Btn label={'Demo\n' + DEMOS[demo][0]} onPress={() => {
          table.current = newTable(); table.current.broken = true;
          strike(table.current.B[0], { ang: 0, speed: 1, a: 0, b: 0, ...DEMOS[demo][1] });
          paint(); moving.current = true; setDemo((demo + 1) % DEMOS.length);
        }} />
        <Btn label={'Felt\n' + CLOTHS[cloth].name} onPress={() => setCloth((cloth + 1) % CLOTHS.length)} />
        <TipButton store={tip} onPress={() => setSheet(!sheet)} />
      </View>
      {sheet && <TipSheet store={tip} land={view.land} calm={calm} felt={CLOTHS[cloth].felt} onDone={() => setSheet(false)}
        style={view.land ? { right: pad.right + BAR + 8, bottom: Math.max(pad.bottom, 8), width: 300 } : { left: pad.left + 8, right: pad.right + 8, bottom: pad.bottom + BAR + 8 }} />}
    </View>
  );
}

// Chrome button: hairline outline, a 44 pt target, and a 3% press that follows the finger down (no bounce). Its label
// grows with the system text size only as far as the control bar has room for.
function Btn({ label, onPress, onLongPress }: { label: string; onPress: () => void; onLongPress?: () => void }) {
  const [down, setDown] = useState(false);
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} onPressIn={() => setDown(true)} onPressOut={() => setDown(false)} pressRetentionOffset={16} accessibilityRole="button" accessibilityLabel={label.replace('\n', ' ')}>
      <Animated.View style={{ ...styles.btn, transform: [{ scale: down ? 0.97 : 1 }], transitionProperty: 'transform', transitionDuration: '120ms', transitionTimingFunction: 'ease-out' }}>
        <Text maxFontSizeMultiplier={1.3} style={styles.btnText}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.ground },
  bar: { position: 'absolute', alignItems: 'center', justifyContent: 'center', gap: 12 },
  power: { position: 'absolute', color: C.chalk, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  hud: { position: 'absolute', color: C.chalk, fontSize: 10, lineHeight: 13, fontVariant: ['tabular-nums'] },
  btn: { minWidth: 56, minHeight: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', borderColor: C.chalk + '66', borderWidth: 1, borderRadius: 6 }, // outline at 40%: 3:1 on the ground
  btnText: { color: C.chalk, fontSize: 13, lineHeight: 16, textAlign: 'center' },
});
