// Two players pass the phone: 8-ball or 9-ball under the WPA rules (src/rules), with the shot controls. Drag or tap on
// the table to aim, turn the dial to aim finely, pull the rail down and let go to shoot. The table never fires a shot.
// With the cue ball in hand, drag it; tap a pocket to call it. The cue ball button opens the tip and cue angle sheet
// (spin, jump, masse).
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { PanResponder, PixelRatio, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Canvas, Picture, Skia, type SkPicture } from '@shopify/react-native-skia';
import Animated, { useFrameCallback, useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { scheduleOnUI } from 'react-native-worklets';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { initialWindowMetrics, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ball, breakSpot, CUE, Game as Discipline, HOLES, P, rack, Shot, strike } from './src/physics/engine';
import { advance, drawBalls, makeKit, newLook } from './src/render/balls';
import { drawMarks } from './src/render/marks';
import { newPace, nextFrame, type Pace, refresh, type Slot, spent } from './src/render/pace';
import { drawCue, shotLayout } from './src/render/cue';
import { BAR, drawAim, drawTable, onTable, toScreen, toTable } from './src/render/table';
import { LEVEL, shotTip } from './src/render/tip';
import { canCall, choose, handCue, judge, moveCue, newGame, newRec, onEight, Rec, record, setCall, spotBall, State } from './src/rules/rules';
import { aimGuide, DRAG, guideFor, HOUSE_CUE, nearest, previewPower, swing, TAP_MS, tapAim } from './src/shot/aim';
import { C, CLOTHS } from './src/theme';
import { hudHeight, MatchHud, Results } from './src/ui/MatchHud';
import { AimDial, PowerRail, shotStore } from './src/ui/ShotControls';
import { TipButton, TipSheet, tipStore } from './src/ui/TipControl';

const GRAB = 36; // px: a touch this near the cue ball in hand drags it. The ball is smaller than a fingertip, so the
// ball keeps its distance from the finger and stays in view.
// Game button: the discipline, and for 8-ball whether shots are called the WPA way or only the pocket of the 8 is.
const MODES: [string, Discipline, boolean][] = [['8-ball', 8, true], ['8-ball\ncall 8 only', 8, false], ['9-ball', 9, true]];
const GUIDE_WORK = 3200; // ball-steps the aim guide may follow after first contact: one update stays inside a frame, even into the rack
const STILL = 1e9; // ms: a picture that stays on screen until the next one comes (the table at rest, the last frame of a shot)
// Sample shots, played from a fresh rack so the spin, jump and masse animation can be seen without aiming one.
const DEMOS: [string, Partial<Shot>][] = [['Draw', { speed: 2.5, b: -0.45 }], ['Side', { speed: 1.2, a: 0.45 }], ['Jump', { speed: 4.2, elev: 0.7 }], ['Massé', { speed: 3.5, a: 0.4, elev: 1.19 }]];
const kit = makeKit(Skia);
const EMPTY = (() => { const rec = Skia.PictureRecorder(); rec.beginRecording(); return rec.finishRecordingAsPicture(); })();

// A racked table for the start of a game. rec = the record of the shot in play; push = a push out was declared for it.
const newTable = (rules: State) => {
  const [x0, y0] = breakSpot(), ids = [0], B: Ball[] = [{ x: x0 - 1e-3, y: y0, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true }]; // above the head string, not on it
  for (const [id, x, y] of rack(rules.game)) { ids.push(id); B.push({ x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true }); }
  return { B, ids, look: newLook(B), rules, rec: null as Rec | null, push: false };
};

export default function App() {
  return <SafeAreaProvider initialMetrics={initialWindowMetrics}><Game /></SafeAreaProvider>;
}

function Game() {
  const { width, height } = useWindowDimensions();
  const pad = useSafeAreaInsets(), calm = useReducedMotion();
  const table = useRef(newTable(newGame(8))), HUD = hudHeight(table.current.rules.game); // screen units kept above the table for the HUD
  const lay = shotLayout(width, height, { ...pad, top: pad.top + HUD }), view = { ...lay.view, dpr: PixelRatio.get(), calm }, where = [view.land, view.s, view.ox, view.oy];
  const [cloth, setCloth] = useState(0); // shortcut: not saved between launches, save it when the settings screen exists
  const map = useRef(view); map.current = view; // the pan responder is created once, so it reads the latest mapping
  // The table never changes during play: one picture, drawn again only when the window does.
  const felt = useMemo(() => { const rec = Skia.PictureRecorder(); drawTable(Skia, rec.beginRecording(), view, CLOTHS[cloth]); return rec.finishRecordingAsPicture(); }, [...where, cloth]);

  const [mode, setMode] = useState(0);
  const rules = table.current.rules, [, redraw] = useReducer((n: number) => n + 1, 0); // the rules live with the table; redraw shows a change
  const shot = useRef(shotStore(nearest(table.current.B))).current; // the held aim and the power on the rail
  const stale = useRef(true); // the guide must be drawn again: the aim, the power, the tip or the table changed
  const [demo, setDemo] = useState(0);
  const [hud, setHud] = useState(__DEV__), [rates, setRates] = useState(''); // frame rate readout: hold the Rack button to show or hide it
  const tip = useRef(tipStore()).current, [sheet, setSheet] = useState(false), [tools, setTools] = useState(false);
  const moving = useRef(false), grab = useRef<{ x: number; y: number } | 'call' | null>(null);
  // The balls and the aim guide are Skia pictures, recorded on the JS thread and handed to the canvas through shared
  // values, so a frame of play or of aiming never re-renders React.
  const picture = useSharedValue(EMPTY), guide = useSharedValue(EMPTY);
  const draw = useRef(() => EMPTY);
  draw.current = () => {
    const rec = Skia.PictureRecorder(), c = rec.beginRecording(), { B, ids, look, rules: s, rec: shot } = table.current;
    drawMarks(Skia, c, view, { hand: !shot && !s.choice && s.hand, x: B[0].x, y: B[0].y, call: s.call, ask: !shot && onEight(s), ms: performance.now() });
    drawBalls(kit, c, B, ids, look, view);
    return rec.finishRecordingAsPicture();
  };
  // Frames of play wait in queue and the UI thread shows one on each display refresh (see src/render/pace.ts).
  const queue = useSharedValue<Slot<SkPicture>[]>([]), left = useSharedValue(STILL);
  const seen = useSharedValue([0, 0, 0, 0, 0]); // counts for the readout (refreshes, frames shown, refreshes with no frame ready, frames skipped), then the share of the last refreshes that came less than 12 ms apart: above a half is a 120 Hz display
  // One function for the life of the screen: a new one would register again and lose a refresh on each React render.
  const beat = useFrameCallback(useCallback(f => {
    'worklet';
    const dt = f.timeSincePreviousFrame ?? 0, r = refresh(queue.value, left.value, dt), s = seen.value;
    left.value = r.left;
    if (r.show) { queue.value = r.rest; picture.value = r.show; }
    seen.value = [s[0] + 1, s[1] + (r.show ? 1 : 0), s[2] + (r.dry ? 1 : 0), s[3] + r.skipped, dt ? 0.9 * s[4] + (dt < 12 ? 0.1 : 0) : s[4]];
  }, []), false);
  const live = useRef(beat); live.current = beat;
  const push = (pic: SkPicture, ms: number, first: boolean) => { 'worklet'; queue.value = first ? [{ pic, ms }] : [...queue.value, { pic, ms }]; if (first) left.value = 0; };
  const still = (pic: SkPicture) => { 'worklet'; queue.value = []; left.value = STILL; picture.value = pic; };
  const pace = useRef<Pace | null>(null), made = useRef([0, 0]); // made = frames made and the ms they took, for the readout
  // The table as it is now, shown at once in place of any frames that wait. Play that goes on starts its frames again.
  // A ball the rules or a finger moved did not travel there: no speed streak.
  // again = the guide is drawn again too; the pulse of the ring round the cue ball in hand does not need that.
  const paint = (again = true) => { const { B, look } = table.current; look.last.set(B.flatMap(b => [b.x, b.y])); pace.current = null; if (again) stale.current = true; scheduleOnUI(still, draw.current()); };
  useEffect(() => { touch.current = null; paint(); }, where); // a drag measured in the old layout ends when the window turns
  useEffect(() => { const again = () => { stale.current = true; }, off = [shot.sub(again), tip.sub(again)]; return () => off.forEach(f => f()); }, []);
  const shotOf = (power: number): Shot => ({ ang: shot.get().aim, speed: Math.max(0.05, power * (table.current.rules.phase === 'break' ? CUE.breakSpeed : CUE.maxSpeed)), ...shotTip(tip.get()) });
  // No shot can be made: balls move, the rules have not ruled on the last shot, a player has a decision to make, or the rack is over.
  const shut = () => { const t = table.current; return moving.current || !!t.rec || !!t.rules.choice || t.rules.phase === 'over'; };
  // Put a ruling on the table: a new rack, or the balls the rules spot and the cue ball in hand.
  const apply = useRef((s: State) => {});
  apply.current = (s: State) => {
    const t = table.current;
    if (s.phase === 'break') { table.current = newTable(s); moving.current = false; }
    else { for (const id of s.spot) spotBall(t.B, t.ids.indexOf(id)); if (s.hand) handCue(t.B, s.hand); Object.assign(t, { rules: s, rec: null, push: false }); }
    paint(); redraw();
    shot.set({ aim: nearest(table.current.B, shot.get().aim), power: 0, fine: false, locked: shut() }); // the cue points at the nearest ball and the controls unlock
  };


  useEffect(() => {
    let raf = 0, on = true; // on = the UI thread's frame callback runs. It stops between shots: it keeps the display at full rate
    live.current.setActive(true); // a short run at launch measures the display's refresh interval for the first shot
    const rest = () => setTimeout(() => { if (!on) live.current.setActive(false); }, 300);
    let timer = rest(); on = false;
    const tick = (t: number) => {
      const { B, ids, look, rules: s, rec, push: pushOut } = table.current;
      if (stale.current) { // one guide a frame, however many touches came. While a shot can be made the guide and the cue stick are always there: for the pull on the rail, or for a firm shot without one
        const rec = Skia.PictureRecorder(), c = rec.beginRecording(), { aim, power } = shot.get();
        if (!shut()) {
          const g = aimGuide(B, shotOf(previewPower(power)), guideFor(HOUSE_CUE.aim), GUIDE_WORK);
          drawAim(Skia, c, map.current, g.path, g.ghost, g.lands, g.lost, g.ob); drawCue(Skia, c, map.current, B[0].x, B[0].y, aim, power);
        }
        guide.value = rec.finishRecordingAsPicture(); stale.current = false;
      }
      const busy = () => moving.current || look.fx.length > 0; // effects (a ball falling into a pocket) outlive the last moving ball
      if (busy()) {
        let p = pace.current;
        const first = !p;
        if (!p) p = pace.current = newPace(seen.value[4] > 0.5 ? 1000 / 120 : 1000 / 60);
        if (!on) { on = true; clearTimeout(timer); live.current.setActive(true); }
        for (let n = 0, ms; n < 4 && busy() && (ms = nextFrame(p, t)); n++) { // at most 4 frames a turn, so a late JS thread still answers touches
          const t0 = performance.now();
          moving.current = advance(B, look, ms, moving.current, rec ? ev => record(rec, ev, B, ids) : undefined);
          scheduleOnUI(push, draw.current(), busy() ? p.frame : STILL, first && !n);
          const cost = performance.now() - t0; spent(p, cost); made.current[0]++; made.current[1] += cost;
        }
        if (!busy()) pace.current = null; // the last frame stays on screen: a shot struck before the next turn starts its frames again
      } else if (rec) { // the shot is over: when its last frame is on screen, the rules say what it was
        if (!queue.value.length) {
          const next = judge(s, rec, pushOut);
          if (next.phase === 'over' || next.note.startsWith('Foul')) Haptics.notificationAsync(next.winner < 0 ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success);
          apply.current(next);
        }
      } else {
        if (on) { on = false; pace.current = null; timer = rest(); }
        if (s.hand && !s.choice && !map.current.calm) paint(false); // the ring round the cue ball in hand pulses
      }
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

  // The rail calls this on release: the strike. The cue goes back to level and centre ball after every shot.
  // shortcut: no follow-through of the stick; the cue is off the table from the frame of the strike.
  const fire = (power: number) => {
    const t = table.current;
    if (shut() || (onEight(t.rules) && t.rules.call < 0)) { shot.set({ power: 0 }); return; } // the 8 needs its pocket called first: the HUD asks for it
    Haptics.impactAsync(power > 0.7 ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light);
    t.rec = newRec(); strike(t.B[0], shotOf(power)); moving.current = true;
    tip.set(LEVEL); setSheet(false); setTools(false); shot.set({ power: 0, fine: false, locked: true });
  };
  // Where the finger is about the cue ball: its angle in the table frame and its distance on the screen.
  const finger = (px: number, py: number) => { const p = toTable(map.current, px, py), c = table.current.B[0]; return { ang: Math.atan2(p.y - c.y, p.x - c.x), lever: Math.hypot(p.x - c.x, p.y - c.y) * map.current.s }; };
  const touch = useRef<{ t: number; moved: boolean; ang: number; lever: number } | null>(null);
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: e => !shut() && onTable(map.current, e.nativeEvent.pageX, e.nativeEvent.pageY), // a touch that misses a control must not turn the aim
    onPanResponderGrant: (_, g) => { // a touch by the cue ball in hand drags it, a touch on a pocket calls it, any other aims
      const t = table.current, s = t.rules, v = map.current, p = toTable(v, g.x0, g.y0), c = t.B[0], at = toScreen(v, c.x, c.y);
      const k = canCall(s) ? HOLES.findIndex(h => Math.hypot(h[0] - p.x, h[1] - p.y) < 0.1) : -1;
      grab.current = s.hand && Math.hypot(at.x - g.x0, at.y - g.y0) < GRAB ? { x: c.x - p.x, y: c.y - p.y } : k >= 0 ? 'call' : null;
      if (k >= 0 && grab.current === 'call') { t.rules = setCall(s, k === s.call ? -1 : k); Haptics.selectionAsync(); paint(); redraw(); }
      touch.current = grab.current ? null : { t: Date.now(), moved: false, ...finger(g.x0, g.y0) };
    },
    onPanResponderMove: (_, g) => {
      if (g.numberActiveTouches > 1) { touch.current = null; return; } // a second finger moves the centre of the touches: no aim and no ball follows that
      const h = grab.current, t = table.current;
      if (h) { if (h !== 'call') { const p = toTable(map.current, g.moveX, g.moveY); if (moveCue(t.B, p.x + h.x, p.y + h.y, t.rules.hand)) paint(); } return; }
      const d = touch.current; if (!d || (!d.moved && Math.hypot(g.dx, g.dy) < DRAG)) return; // a drag swings the aim by the turn of the finger about the cue ball
      const f = finger(g.moveX, g.moveY);
      if (d.moved) shot.set({ aim: swing(shot.get().aim, d.ang, f.ang, f.lever) }); // the turn is counted from where the drag began: a touch on the cue ball itself would turn a slip of 6 px into a whip
      d.moved = true; d.ang = f.ang;
    },
    onPanResponderRelease: () => { // a tap points the cue at the tapped point
      const d = touch.current, s = shot.get(); touch.current = grab.current = null;
      if (!d || d.moved || Date.now() - d.t >= TAP_MS || d.lever < P.R * map.current.s) return; // a tap on the cue ball itself points nowhere
      const aim = tapAim(s.aim, s.fine, d.ang); if (aim !== s.aim) { shot.set({ aim }); Haptics.selectionAsync(); }
    },
    onPanResponderTerminate: () => { touch.current = grab.current = null; },
  })).current;

  // A new rack. The break alternates after a finished rack (WPA 1.3); a rack started over keeps its breaker.
  const over = rules.phase === 'over';
  const rerack = (m: number, breaker = over ? 1 - rules.breaker : rules.breaker) => apply.current(newGame(MODES[m][1], breaker as 0 | 1, MODES[m][2]));

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
      {hud && <Text pointerEvents="none" style={[styles.rates, { top: pad.top + HUD, left: pad.left + 8 }]}>{rates}</Text>}
      {/* The player plates, the 9-ball strip and the banner with the last ruling (src/ui/MatchHud.tsx). */}
      <MatchHud rules={rules} push={table.current.push} view={view} pad={pad} calm={calm}>
        {rules.push && !rules.choice && <Btn label={table.current.push ? 'Push out: on' : 'Push out'} onPress={() => { if (!table.current.rec) { table.current.push = !table.current.push; redraw(); } }} />}
      </MatchHud>
      {/* A decision the rules hand to a player: a card over the table, and play waits for it. */}
      {rules.choice && (
        <View style={styles.sheet} pointerEvents="box-none">
          <View style={styles.card} accessibilityViewIsModal>
            <Text maxFontSizeMultiplier={1.3} accessibilityRole="header" style={styles.cardTitle}>{`Player ${rules.turn + 1}, your call`}</Text>
            {!!rules.note && <Text maxFontSizeMultiplier={1.3} style={styles.cardNote}>{rules.note}</Text>}
            {rules.choice.map((o, i) => <Btn key={o.label} label={o.label} onPress={() => apply.current(choose(rules, i))} />)}
          </View>
        </View>
      )}
      {over && <Results rules={rules}><Btn label="Rematch" onPress={() => rerack(mode)} /></Results>}
      {/* The shot controls sit inside the safe area where shotLayout puts them. */}
      <PowerRail store={shot} box={lay.rail} onStrike={fire} />
      <AimDial store={shot} box={lay.dial} />
      <View style={[styles.at, lay.spin]}><TipButton store={tip} onPress={() => { setSheet(!sheet); setTools(false); }} /></View>
      <View style={[styles.at, lay.tools]}><Btn label="•••" name="Table tools" onPress={() => { setTools(!tools); setSheet(false); }} /></View>
      {/* shortcut: the smoke-test buttons, behind one button until the menus exist. */}
      {tools && (
        <View onStartShouldSetResponder={() => true} style={[styles.tools, view.land ? { left: lay.tools.left + lay.tools.width + 12, bottom: height - lay.tools.top - lay.tools.height } : { left: lay.tools.left, bottom: height - lay.dial.top + 8 }]}>
          <Btn label="Rack" onPress={() => rerack(mode)} onLongPress={() => setHud(!hud)} />
          <Btn label={'Game\n' + MODES[mode][0]} onPress={() => { const m = (mode + 1) % MODES.length; setMode(m); rerack(m, 0); }} />
          <Btn label={'Demo\n' + DEMOS[demo][0]} onPress={() => { // a fresh rack, and the demo shot is its break
            rerack(mode); const t = table.current; t.B[0].y = P.W / 2; // the demo shots go straight down the middle
            t.rec = newRec(); strike(t.B[0], { ang: 0, speed: 1, a: 0, b: 0, ...DEMOS[demo][1] });
            paint(); moving.current = true; shot.set({ power: 0, locked: true }); setDemo((demo + 1) % DEMOS.length);
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
function Btn({ label, name, onPress, onLongPress }: { label: string; name?: string; onPress: () => void; onLongPress?: () => void }) {
  const [down, setDown] = useState(false);
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} onPressIn={() => setDown(true)} onPressOut={() => setDown(false)} pressRetentionOffset={16} accessibilityRole="button" accessibilityLabel={name ?? label.replace('\n', ' ')}>
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
  sheet: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { maxWidth: 320, alignSelf: 'center', padding: 16, gap: 10, borderRadius: 10, borderWidth: 1, borderColor: C.chalk + '66', backgroundColor: C.ground + 'F2' },
  cardTitle: { color: C.chalk, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  cardNote: { color: C.chalk, fontSize: 14, lineHeight: 19, textAlign: 'center' },
  rates: { position: 'absolute', color: C.chalk, fontSize: 10, lineHeight: 13, fontVariant: ['tabular-nums'] },
  btn: { minWidth: 56, minHeight: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', borderColor: C.chalk + '66', borderWidth: 1, borderRadius: 6 }, // outline at 40%: 3:1 on the ground
  btnText: { color: C.chalk, fontSize: 13, lineHeight: 16, textAlign: 'center' },
});
