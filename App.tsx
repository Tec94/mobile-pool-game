// Two players pass the phone: 8-ball or 9-ball under the WPA rules (src/rules). Pull back from anywhere to aim and shoot.
// With the cue ball in hand, drag it; tap a pocket to call it. The cue ball button opens the tip and cue angle sheet
// (spin, jump, masse).
// shortcut: the line of text above the table stands in for the designed HUD.
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { PanResponder, PixelRatio, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Canvas, Picture, Skia } from '@shopify/react-native-skia';
import Animated, { useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { initialWindowMetrics, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ball, CUE, Game as Discipline, HOLES, P, predict, rack, Shot, strike } from './src/physics/engine';
import { advance, drawBalls, makeKit, newLook } from './src/render/balls';
import { drawMarks } from './src/render/marks';
import { BAR, drawAim, drawTable, fit, toScreen, toTable } from './src/render/table';
import { LEVEL, shotTip } from './src/render/tip';
import { canCall, choose, handCue, judge, lowest, moveCue, newGame, newRec, onEight, Rec, record, setCall, spotBall, State } from './src/rules/rules';
import { C, CLOTHS } from './src/theme';
import { TipButton, TipSheet, tipStore } from './src/ui/TipControl';

const MAX_DRAG = 160; // px of pull-back for full power
const HUD = 40; // screen units kept above the table for whose turn it is and the last ruling
const GRAB = 36; // px: a touch this near the cue ball in hand drags it. The ball is smaller than a fingertip, so the
// ball keeps its distance from the finger and stays in view.
// Game button: the discipline, and for 8-ball whether shots are called the WPA way or only the pocket of the 8 is.
const MODES: [string, Discipline, boolean][] = [['8-ball', 8, true], ['8-ball\ncall 8 only', 8, false], ['9-ball', 9, true]];
// Sample shots, played from a fresh rack so the spin, jump and masse animation can be seen without aiming one.
const DEMOS: [string, Partial<Shot>][] = [['Draw', { speed: 2.5, b: -0.45 }], ['Side', { speed: 1.2, a: 0.45 }], ['Jump', { speed: 4.2, elev: 0.7 }], ['Massé', { speed: 3.5, a: 0.4, elev: 1.19 }]];
const kit = makeKit(Skia);
const EMPTY = (() => { const rec = Skia.PictureRecorder(); rec.beginRecording(); return rec.finishRecordingAsPicture(); })();

// A racked table for the start of a game. rec = the record of the shot in play; push = a push out was declared for it.
const newTable = (rules: State) => {
  const ids = [0], B: Ball[] = [{ x: P.L / 4 - 1e-3, y: P.W / 2, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true }]; // above the head string, not on it
  for (const [id, x, y] of rack(rules.game)) { ids.push(id); B.push({ x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true }); }
  return { B, ids, look: newLook(B), rules, rec: null as Rec | null, push: false };
};

export default function App() {
  return <SafeAreaProvider initialMetrics={initialWindowMetrics}><Game /></SafeAreaProvider>;
}

function Game() {
  const { width, height } = useWindowDimensions();
  const pad = useSafeAreaInsets(), calm = useReducedMotion();
  const view = { ...fit(width, height, { ...pad, top: pad.top + HUD }), dpr: PixelRatio.get(), calm }, where = [view.land, view.s, view.ox, view.oy];
  const [cloth, setCloth] = useState(0); // shortcut: not saved between launches, save it when the settings screen exists
  const map = useRef(view); map.current = view; // the pan responder is created once, so it reads the latest mapping
  // The table never changes during play: one picture, drawn again only when the window does.
  const felt = useMemo(() => { const rec = Skia.PictureRecorder(); drawTable(Skia, rec.beginRecording(), view, CLOTHS[cloth]); return rec.finishRecordingAsPicture(); }, [...where, cloth]);

  const [mode, setMode] = useState(0);
  const table = useRef(newTable(newGame(8)));
  const rules = table.current.rules, [, redraw] = useReducer((n: number) => n + 1, 0); // the rules live with the table; redraw shows a change
  const [aim, setAim] = useState<{ path: number[][]; ghost: number[] | null; lands: number[][]; lost: boolean; pull: number } | null>(null);
  const guide = useMemo(() => { const rec = Skia.PictureRecorder(), c = rec.beginRecording(); if (aim) drawAim(Skia, c, view, aim.path, aim.ghost, aim.lands, aim.lost); return rec.finishRecordingAsPicture(); }, [aim, ...where]);
  const [demo, setDemo] = useState(0);
  const tip = useRef(tipStore()).current, [sheet, setSheet] = useState(false);
  const moving = useRef(false), grab = useRef<{ x: number; y: number } | 'call' | null>(null);
  // The balls are one Skia picture, recorded here each frame and handed to the canvas through a shared value, so a
  // frame of play never re-renders React.
  const picture = useSharedValue(EMPTY);
  const paint = useRef(() => {});
  paint.current = () => {
    const rec = Skia.PictureRecorder(), c = rec.beginRecording(), { B, ids, look, rules: s, rec: shot } = table.current;
    if (!moving.current) look.last.set(B.flatMap(b => [b.x, b.y])); // a ball the rules or a finger moved did not travel there: no speed streak
    drawMarks(Skia, c, view, { hand: !shot && !s.choice && s.hand, x: B[0].x, y: B[0].y, call: s.call, ask: !shot && onEight(s), ms: performance.now() });
    drawBalls(kit, c, B, ids, look, view);
    picture.set(rec.finishRecordingAsPicture());
  };
  useEffect(() => paint.current(), where);
  // Put a ruling on the table: a new rack, or the balls the rules spot and the cue ball in hand.
  const apply = useRef((s: State) => {});
  apply.current = (s: State) => {
    const t = table.current;
    if (s.phase === 'break') { table.current = newTable(s); moving.current = false; }
    else { for (const id of s.spot) spotBall(t.B, t.ids.indexOf(id)); if (s.hand) handCue(t.B, s.hand); Object.assign(t, { rules: s, rec: null, push: false }); }
    paint.current(); redraw();
  };

  useEffect(() => {
    let raf = 0, last = 0, owed = 0;
    const tick = (t: number) => {
      const { B, ids, look, rules: s, rec, push } = table.current;
      if (moving.current || look.fx.length) { // effects (a ball falling into a pocket) outlive the last moving ball
        owed = Math.min(50, owed + (last ? t - last : 16)); // real time, capped after a stall; the part of a millisecond left over carries on
        const ms = Math.floor(owed); owed -= ms;
        moving.current = advance(B, look, ms, moving.current, rec ? ev => record(rec, ev, B, ids) : undefined);
        paint.current();
      } else if (rec) { // the shot is over: the rules say what it was
        const next = judge(s, rec, push);
        if (next.phase === 'over' || next.note.startsWith('Foul')) Haptics.notificationAsync(next.winner < 0 ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success);
        apply.current(next);
      } else if (s.hand && !s.choice && !map.current.calm) paint.current(); // the ring round the cue ball in hand pulses
      last = t; raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const shotFrom = (dx: number, dy: number): { shot: Shot; pull: number } => {
    const pull = Math.min(1, Math.hypot(dx, dy) / MAX_DRAG);
    const a = toTable(map.current, 0, 0), b = toTable(map.current, -dx, -dy); // aim opposite the pull
    const max = table.current.rules.phase === 'break' ? CUE.breakSpeed : CUE.maxSpeed;
    return { shot: { ang: Math.atan2(b.y - a.y, b.x - a.x), speed: Math.max(0.05, pull * max), ...shotTip(tip.get()) }, pull };
  };
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => { const t = table.current; return !moving.current && !t.rec && !t.rules.choice && t.rules.phase !== 'over'; },
    onPanResponderGrant: (_, g) => { // a touch by the cue ball in hand drags it, a touch on a pocket calls it, any other aims
      const t = table.current, s = t.rules, v = map.current, p = toTable(v, g.x0, g.y0), c = t.B[0], at = toScreen(v, c.x, c.y);
      const k = canCall(s) ? HOLES.findIndex(h => Math.hypot(h[0] - p.x, h[1] - p.y) < 0.1) : -1;
      grab.current = s.hand && Math.hypot(at.x - g.x0, at.y - g.y0) < GRAB ? { x: c.x - p.x, y: c.y - p.y } : k >= 0 ? 'call' : null;
      if (k >= 0 && grab.current === 'call') { t.rules = setCall(s, k === s.call ? -1 : k); Haptics.selectionAsync(); paint.current(); redraw(); }
    },
    onPanResponderMove: (_, g) => {
      const d = grab.current, t = table.current;
      if (d) { if (d !== 'call') { const p = toTable(map.current, g.moveX, g.moveY); if (moveCue(t.B, p.x + d.x, p.y + d.y, t.rules.hand)) paint.current(); } return; }
      const { shot, pull } = shotFrom(g.dx, g.dy), { cue, hit, lands, scratch, split } = predict(table.current.B, shot, 0.4);
      setAim({ pull, path: cue, ghost: hit && [hit.x, hit.y], lands, lost: scratch && split < 0 });
    },
    onPanResponderRelease: (_, g) => {
      setAim(null);
      if (grab.current) { grab.current = null; return; }
      const { shot, pull } = shotFrom(g.dx, g.dy), t = table.current;
      if (pull < 0.05 || t.rec || moving.current || t.rules.choice || (onEight(t.rules) && t.rules.call < 0)) return; // the 8 needs its pocket called first: the HUD asks for it
      Haptics.impactAsync(pull > 0.7 ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light);
      t.rec = newRec(); strike(t.B[0], shot); moving.current = true; paint.current();
      tip.set(LEVEL); setSheet(false); // the cue goes back to level and centre ball after every shot
    },
    onPanResponderTerminate: () => { setAim(null); grab.current = null; },
  })).current;

  // A new rack. The break alternates after a finished rack (WPA 1.3); a rack started over keeps its breaker.
  const over = rules.phase === 'over';
  const rerack = (m: number, breaker = over ? 1 - rules.breaker : rules.breaker) => apply.current(newGame(MODES[m][1], breaker as 0 | 1, MODES[m][2]));
  const group = rules.solids < 0 ? 'Open table' : (rules.solids === rules.turn ? 'Solids' : 'Stripes') + (onEight(rules) ? ', on the 8' : '');
  const who = over ? `Player ${rules.winner + 1} wins` : `Player ${rules.turn + 1} · ${rules.phase === 'break' ? 'Break' : rules.game === 8 ? group : `Ball ${lowest(rules)}${rules.fouls[rules.turn] === 2 ? ' · on 2 fouls' : ''}`}`;
  const hint = [rules.note, rules.hand === 'kitchen' ? 'Ball in hand behind the line: drag the cue ball.' : rules.hand ? 'Ball in hand: drag the cue ball.' : '',
    canCall(rules) && rules.call < 0 ? (onEight(rules) ? 'Tap a pocket to call the 8.' : !rules.hand && !rules.note ? 'Tap a pocket to call a bank or a combination.' : '') : '', table.current.push ? 'Push out: no ball or rail needed.' : ''].filter(Boolean).join(' ');

  return (
    <View style={styles.root} {...pan.panHandlers}>
      <StatusBar style="light" />
      <Canvas style={StyleSheet.absoluteFill}>
        <Picture picture={felt} />
        <Picture picture={guide} />
        <Picture picture={picture} />
      </Canvas>
      {/* Whose turn, what they are on, and the last ruling: one strip above the table, read out when it changes. */}
      <View style={[styles.hud, { top: pad.top, left: Math.max(pad.left, 8), right: Math.max(pad.right, 8) + (view.land ? BAR : 0) }]}>
        <View style={styles.hudText} accessible accessibilityLiveRegion="polite">
          <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={styles.who}>{who}</Text>
          <Text maxFontSizeMultiplier={1.2} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.note}>{hint}</Text>
        </View>
        {rules.push && !rules.choice && <Btn label={table.current.push ? 'Push out: on' : 'Push out'} onPress={() => { if (!table.current.rec) { table.current.push = !table.current.push; redraw(); } }} />}
      </View>
      {/* A decision the rules hand to a player, or the end of the rack: a card over the table, and play waits for it. */}
      {(rules.choice || over) && (
        <View style={styles.sheet} pointerEvents="box-none">
          <View style={styles.card} accessibilityViewIsModal>
            <Text maxFontSizeMultiplier={1.3} accessibilityRole="header" style={styles.cardTitle}>{over ? `Player ${rules.winner + 1} wins` : `Player ${rules.turn + 1}, your call`}</Text>
            {!!rules.note && <Text maxFontSizeMultiplier={1.3} style={styles.cardNote}>{rules.note}</Text>}
            {over ? <Btn label="New rack" onPress={() => rerack(mode)} /> : rules.choice!.map((o, i) => <Btn key={o.label} label={o.label} onPress={() => apply.current(choose(rules, i))} />)}
          </View>
        </View>
      )}
      {/* Controls sit inside the safe area: a row under the table in portrait, a column beside it in landscape. */}
      <View style={[styles.bar, view.land ? { top: pad.top, bottom: pad.bottom, right: pad.right, width: BAR, flexDirection: 'column' } : { left: pad.left, right: pad.right, bottom: pad.bottom, height: BAR, flexDirection: 'row' }]}>
        {aim && <Text maxFontSizeMultiplier={1.3} style={[styles.power, view.land ? { top: 8 } : { left: 16 }]}>{Math.round(aim.pull * 100)}%</Text>}
        <Btn label="Rack" onPress={() => rerack(mode)} />
        <Btn label={'Game\n' + MODES[mode][0]} onPress={() => { const m = (mode + 1) % MODES.length; setMode(m); rerack(m, 0); }} />
        <Btn label={'Demo\n' + DEMOS[demo][0]} onPress={() => { // a fresh rack, and the demo shot is its break
          rerack(mode); const t = table.current;
          t.rec = newRec(); strike(t.B[0], { ang: 0, speed: 1, a: 0, b: 0, ...DEMOS[demo][1] });
          moving.current = true; setDemo((demo + 1) % DEMOS.length);
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
function Btn({ label, onPress }: { label: string; onPress: () => void }) {
  const [down, setDown] = useState(false);
  return (
    <Pressable onPress={onPress} onPressIn={() => setDown(true)} onPressOut={() => setDown(false)} pressRetentionOffset={16} accessibilityRole="button" accessibilityLabel={label.replace('\n', ' ')}>
      <Animated.View style={{ ...styles.btn, transform: [{ scale: down ? 0.97 : 1 }], transitionProperty: 'transform', transitionDuration: '120ms', transitionTimingFunction: 'ease-out' }}>
        <Text maxFontSizeMultiplier={1.3} style={styles.btnText}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.ground },
  bar: { position: 'absolute', alignItems: 'center', justifyContent: 'center', gap: 12 },
  hud: { position: 'absolute', height: HUD, flexDirection: 'row', alignItems: 'center', gap: 8 },
  hudText: { flex: 1, justifyContent: 'center' },
  who: { color: C.chalk, fontSize: 15, lineHeight: 18, fontWeight: '700' },
  note: { color: C.chalk, fontSize: 13, lineHeight: 16, opacity: 0.85 },
  sheet: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { maxWidth: 320, alignSelf: 'center', padding: 16, gap: 10, borderRadius: 10, borderWidth: 1, borderColor: C.chalk + '66', backgroundColor: C.ground + 'F2' },
  cardTitle: { color: C.chalk, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  cardNote: { color: C.chalk, fontSize: 14, lineHeight: 19, textAlign: 'center' },
  power: { position: 'absolute', color: C.chalk, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  btn: { minWidth: 56, minHeight: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', borderColor: C.chalk + '66', borderWidth: 1, borderRadius: 6 }, // outline at 40%: 3:1 on the ground
  btnText: { color: C.chalk, fontSize: 13, lineHeight: 16, textAlign: 'center' },
});
