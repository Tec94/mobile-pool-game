// Device smoke test: the real engine on a Quiet Slate table. Pull back from anywhere to aim and shoot.
// shortcut: no spin, elevation, rules or HUD yet; this screen only proves Skia + the engine run on the phone.
import { useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Canvas, Circle, Line, Rect, vec } from '@shopify/react-native-skia';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { Ball, CUE, HOLES, P, predict, rack, SEGS, Shot, step, strike } from './src/physics/engine';

const C = { ground: '#101F1C', felt: '#27504A', cushion: '#1C3A35', frame: '#D9A866', pocket: '#08100E', chalk: '#EEF2EA' };
const COLORS = ['#F2C230', '#4B98EE', '#E0483C', '#8448C8', '#EC7428', '#3FBF7F', '#A8323F', '#16191A'];
const RAIL = 0.14; // m from the cushion nose to the outside of the frame; the WPA pockets sit up to 0.125 m into it
const MAX_DRAG = 160; // px of pull-back for full power

const newTable = () => {
  const ids = [0], B: Ball[] = [{ x: P.L / 4, y: P.W / 2, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true }];
  for (const [id, x, y] of rack(8)) { ids.push(id); B.push({ x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true }); }
  return { B, ids, broken: false };
};

export default function App() {
  const { width, height } = useWindowDimensions();
  const land = width > height;
  // Table metres -> screen px. Portrait stands the table up with the head string at the bottom.
  const s = land ? Math.min(width / (P.L + 2 * RAIL), (height - 60) / (P.W + 2 * RAIL)) : Math.min(width / (P.W + 2 * RAIL), (height - 60) / (P.L + 2 * RAIL));
  const PAD = RAIL * s;
  const toS = (x: number, y: number) => (land ? { x: PAD + x * s, y: PAD + (P.W - y) * s } : { x: PAD + y * s, y: PAD + (P.L - x) * s });
  const toT = (px: number, py: number) => (land ? { x: (px - PAD) / s, y: P.W - (py - PAD) / s } : { x: P.L - (py - PAD) / s, y: (px - PAD) / s });
  const map = useRef({ toT }); map.current.toT = toT; // the pan responder is created once, so it reads the latest mapping

  const table = useRef(newTable());
  const [, setFrame] = useState(0);
  const [aim, setAim] = useState<{ path: number[][]; pull: number } | null>(null);
  const moving = useRef(false);

  useEffect(() => {
    let raf = 0, last = 0;
    const tick = (t: number) => {
      if (moving.current) {
        const n = Math.min(50, Math.round((t - last) / (P.h * 1000)) || 16); // real time, capped after a stall
        for (let i = 0; i < n && moving.current; i++) moving.current = step(table.current.B);
        setFrame(f => f + 1);
      }
      last = t; raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const shotFrom = (dx: number, dy: number): { shot: Shot; pull: number } => {
    const pull = Math.min(1, Math.hypot(dx, dy) / MAX_DRAG);
    const a = map.current.toT(0, 0), b = map.current.toT(-dx, -dy); // aim opposite the pull
    const max = table.current.broken ? CUE.maxSpeed : CUE.breakSpeed;
    return { shot: { ang: Math.atan2(b.y - a.y, b.x - a.x), speed: Math.max(0.05, pull * max), a: 0, b: 0 }, pull };
  };
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !moving.current,
    onPanResponderMove: (_, g) => {
      const { shot, pull } = shotFrom(g.dx, g.dy);
      setAim({ pull, path: predict(table.current.B, shot, 0.4).cue });
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

  const tl = toS(0, P.W), br = toS(P.L, 0);
  const box = { x: Math.min(tl.x, br.x), y: Math.min(tl.y, br.y), w: Math.abs(br.x - tl.x), h: Math.abs(br.y - tl.y) };
  const r = P.R * s;
  const { B, ids } = table.current;
  const seg = (x: number, y: number) => { const p = toS(x, y); return vec(p.x, p.y); };

  return (
    <View style={styles.root} {...pan.panHandlers}>
      <StatusBar style="light" />
      <Canvas style={StyleSheet.absoluteFill}>
        <Rect x={box.x - PAD} y={box.y - PAD} width={box.w + 2 * PAD} height={box.h + 2 * PAD} color={C.frame} />
        <Rect x={box.x - 0.05 * s} y={box.y - 0.05 * s} width={box.w + 0.1 * s} height={box.h + 0.1 * s} color={C.cushion} />
        <Rect x={box.x} y={box.y} width={box.w} height={box.h} color={C.felt} />
        {HOLES.map(([x, y, rad], i) => { const p = toS(x, y); return <Circle key={'h' + i} cx={p.x} cy={p.y} r={rad * s} color={C.pocket} />; })}
        {SEGS.map(([x1, y1, x2, y2], i) => <Line key={'s' + i} p1={seg(x1, y1)} p2={seg(x2, y2)} color={C.chalk} strokeWidth={1} opacity={0.5} />)}
        {aim && aim.path.slice(1).map((q, i) => <Line key={'a' + i} p1={seg(aim.path[i][0], aim.path[i][1])} p2={seg(q[0], q[1])} color={C.chalk} strokeWidth={1.5} />)}
        {B.flatMap((b, i) => {
          if (!b.on) return [];
          const p = toS(b.x, b.y), id = ids[i], col = id === 0 ? C.chalk : COLORS[(id - 1) % 8];
          return [
            <Circle key={'d' + i} cx={p.x + r * 0.25} cy={p.y + r * 0.25} r={r} color="#000" opacity={0.35} />,
            <Circle key={'b' + i} cx={p.x} cy={p.y} r={r} color={id > 8 ? C.chalk : col} />,
            ...(id > 8 ? [<Circle key={'t' + i} cx={p.x} cy={p.y} r={r * 0.62} color={col} />] : []),
          ];
        })}
      </Canvas>
      {aim && <Text style={styles.power}>{Math.round(aim.pull * 100)}%</Text>}
      <Pressable style={styles.btn} onPress={() => { table.current = newTable(); moving.current = false; setFrame(f => f + 1); }}>
        <Text style={styles.btnText}>Rack</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.ground },
  power: { position: 'absolute', top: 48, alignSelf: 'center', color: C.chalk, fontSize: 18, fontWeight: '800' },
  btn: { position: 'absolute', bottom: 24, alignSelf: 'center', borderColor: C.chalk, borderWidth: 1, borderRadius: 6, paddingHorizontal: 20, paddingVertical: 8 },
  btnText: { color: C.chalk, fontSize: 16 },
});
