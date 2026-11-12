// The match HUD (screens spec: player plates, the 9-ball strip, the banner) and the results card. What they show comes
// from src/ui/hud.ts; this file only draws it.
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { P } from '../physics/engine';
import type { State } from '../rules/rules';
import { RAIL, type View as TableView } from '../render/table';
import { BALLS, C, CREAM, DARK, FONT, type Paint } from '../theme';
import { banner, fresh, type Plate, plates, strip } from './hud';
import { Slab, Txt } from './slab';

const RED = BALLS[2]; // fouls reuse the three-ball red (Quiet Slate)
const LINE = C.chalk + '66'; // chalk hairline at 40%: 3:1 on the ground
const POP = { animationName: { from: { opacity: 0, transform: [{ scale: 0.95 }] } }, animationDuration: '200ms', animationTimingFunction: 'ease-out' } as const; // a new ruling pops in
const TOP = 4, PLATE = 44, STRIP = 24, STRIP_PIP = 18, LIP = 3, FRAME = 30;
// Screen units the HUD takes above the table: the plates, and in 9-ball the strip of balls under them.
export const hudHeight = (game: number) => TOP + PLATE + 8 + (game === 9 ? STRIP : 0);

// The plates row sits above the table. The pause button comes in as `pause` at the start of the row (top left); the push
// out button, when the rules offer one, comes in as a child at the end. wait = what the AI is doing, for the banner.
// score = frames won in a race, as a chip beside each plate.
export function MatchHud({ rules, names, push, view, pad, calm, wait, score, pause, children }: { rules: State; names: string[]; push: boolean; view: TableView; pad: EdgeInsets; calm: boolean; wait?: string; score?: readonly number[]; pause: ReactNode; children?: ReactNode }) {
  const [a, b] = plates(rules, names), nine = strip(rules), next = nine.find(q => q.next);
  // Landscape: the banner sits between the plates, above the table, where it covers no pocket. Portrait: over the
  // foot rail, between the corner pockets.
  // 9-ball: both players share the balls, so the strip sits under the seam of the two plates. Landscape: that is the
  // middle of the table. Portrait: the seam, measured, as the pause button and the rail shift it off the table's middle.
  const [seam, setSeam] = useState(0), left = Math.max(pad.left, 8), wide = 9 * STRIP_PIP + 8 * 5;
  const mid = !view.land && seam ? left + seam - (score ? 3 * 8 + 2 * FRAME : 8) / 2 : view.ox + (view.land ? P.L : P.W) * view.s / 2; // the middle of the gaps (8) and frame chips between the plates
  const frames = (i: number) => score && (
    <Slab paint={i ? DARK : CREAM} lip={LIP} radius={3} face={styles.frames}>
      <Txt accessibilityLabel={`${names[i]}: ${score[i]} ${score[i] === 1 ? 'frame' : 'frames'}`} style={[styles.framesText, !i && { color: C.ink }]}>{score[i]}</Txt>
    </Slab>
  );
  const say = <Banner rules={rules} push={push} calm={calm} wait={wait} style={view.land ? { flex: 1 } : { position: 'absolute', top: view.oy - RAIL * view.s + 4, left: view.ox, width: P.W * view.s, paddingHorizontal: 0.12 * view.s }} />;
  return (
    <>
      {/* Landscape: the rail starts under the HUD, so the row spans the window; a spacer the size of the pause button
          keeps the plates and the banner centred on the table when no push out button is there. */}
      <View style={[styles.hud, { top: pad.top + TOP, left, right: Math.max(pad.right, 8) }]}>
        <View style={styles.row} accessibilityLiveRegion="polite">
          {pause}<PlateView p={a} land={view.land} />{frames(0)}{view.land && say}{frames(1)}<PlateView p={b} land={view.land} onX={setSeam} />{children || (view.land && <View style={styles.even} />)}
        </View>
      </View>
      {nine.length > 0 && (
        <View style={[styles.nine, { top: pad.top + TOP + PLATE + 6, left: mid - wide / 2, width: wide }]} accessible accessibilityLabel={`${next ? `Ball ${next.id} to hit. ` : ''}Potted: ${nine.filter(q => q.gone).map(q => q.id).join(', ') || 'none'}`}>
          {nine.map(q => (
            <Pip key={q.id} id={q.id} gone={q.gone} size={STRIP_PIP} style={q.next ? styles.next : undefined}>
              <Text maxFontSizeMultiplier={1} style={[styles.num, { color: q.gone ? C.chalk + '80' : q.id === 8 ? C.white : C.ink }]}>{q.id}</Text>
            </Pip>
          ))}
        </View>
      )}
      {!view.land && say}
    </>
  );
}

// Line 1 the name; line 2 the group's pips (hollow once potted), or Open / Break / On the 8, or the 9-ball foul warning.
// The player to shoot is a cream slab with ink text, the other a dark one.
function PlateView({ p, land, onX }: { p: Plate; land: boolean; onX?: (x: number) => void }) {
  const ink = p.on ? C.ink : C.chalk, edge = p.on ? C.ink + '66' : LINE;
  return (
    <View onLayout={onX && (e => onX(e.nativeEvent.layout.x))} accessible accessibilityLabel={p.label} style={[styles.plate, land && { maxWidth: 200 }]}>
      <Slab paint={p.on ? CREAM : DARK} lip={LIP} radius={3} style={{ flex: 1 }} face={styles.plateFace}>
        <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={[styles.name, { color: ink }]}>{p.name}</Text>
        <View style={styles.l2}>
          {p.pips.map(q => <Pip key={q.id} id={q.id} gone={q.gone} size={10} edge={edge} />)}
          {!!p.text && <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={[styles.l2Text, { color: ink + 'B3' }, p.warn && { color: RED }]}>{p.text}</Text>}
        </View>
      </Slab>
    </View>
  );
}

// A ball as a flat disc: solid, or a white disc with a colour band for a stripe; a potted ball is an outline only.
// edge = the outline colour on the face behind it (dark balls on the dark ground, white ones on cream).
function Pip({ id, gone, size, edge = LINE, style, children }: { id: number; gone: boolean; size: number; edge?: string; style?: ViewStyle; children?: ReactNode }) {
  const hue = BALLS[(id - 1) % 8];
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }, gone ? { borderWidth: 1.5, borderColor: edge } : { backgroundColor: id > 8 ? C.white : hue, overflow: 'hidden' }, (edge !== LINE ? id > 8 : id === 7 || id === 8) && !gone && { borderWidth: 1, borderColor: edge }, style]}>
      {!gone && id > 8 && <View style={{ position: 'absolute', left: 0, right: 0, top: size / 4, height: size / 2, backgroundColor: hue }} />}
      {children}
    </View>
  );
}

// The ruling on the last shot for a moment (a foul a little longer, in red), then only what the player still has to do
// (drag the cue ball in hand, call the 8, push out on), which stays until it is done.
function Banner({ rules, push, calm, wait, style }: { rules: State; push: boolean; calm: boolean; wait?: string; style: ViewStyle }) {
  const { note, foul, hint } = banner(rules, push, wait), [shown, setShown] = useState({ n: 0, old: true }), last = useRef<{ note: string; balls: number[] } | null>(null);
  useEffect(() => { // a new shot (its balls) or a new ruling pops the note; anything else ends it
    if (!fresh(last.current, note, rules.balls)) { setShown(s => (s.old ? s : { ...s, old: true })); return; }
    last.current = { note, balls: rules.balls };
    setShown(s => ({ n: s.n + 1, old: false }));
    const t = setTimeout(() => setShown(s => ({ ...s, old: true })), foul ? 2800 : 2600);
    return () => clearTimeout(t);
  }, [note, foul, rules.balls]);
  const say = shown.old ? '' : note;
  return ( // the wrapper stays when the pill is gone, so the plates beside it in landscape do not move
    <View pointerEvents="none" style={[{ alignItems: 'center' }, style]}>
      {!!(say || hint) && <Animated.View key={shown.n} role="status" accessibilityLiveRegion="polite" style={[styles.banner, !calm && POP]}>
        <Slab paint={DARK} lip={LIP} radius={3} face={styles.bannerFace}>
          <Text maxFontSizeMultiplier={1.3} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75} style={styles.bannerText}>
            {!!say && <Text style={foul && { color: RED }}>{say}</Text>}{say && hint ? ' ' : ''}{hint}
          </Text>
        </Slab>
      </Animated.View>}
    </View>
  );
}

// The end of the rack: who won and why. The score, the pay and the buttons come in as children.
export function Results({ rules, title, kind = 'Pass and play', children }: { rules: State; title: string; kind?: string; children: ReactNode }) {
  return (
    <View style={styles.sheet} pointerEvents="box-none">
      <ScrollView style={styles.scroll} contentContainerStyle={styles.card} accessibilityViewIsModal>
        <Text maxFontSizeMultiplier={1.3} style={styles.eyebrow}>{kind} · {rules.game}-ball</Text>
        <Text maxFontSizeMultiplier={1.3} accessibilityRole="header" style={styles.title}>{title}</Text>
        {!!rules.note && <Text maxFontSizeMultiplier={1.3} style={styles.why}>{rules.note}</Text>}
        {children}
      </ScrollView>
    </View>
  );
}

// A button of a card or the results: cream = the one that goes on (Resume, Rematch, Next rack), dark on the ground, or by
// default a key-off face, which reads on a dark card.
export function Act({ label, paint, onPress }: { label: string; paint?: Paint; onPress: () => void }) {
  return (
    <Slab paint={paint ?? [C.keyOff, 'transparent']} lip={paint ? LIP : 0} radius={3} onPress={onPress} accessibilityLabel={label} style={!paint && { marginTop: LIP }} face={styles.act}>
      <Txt style={[styles.actText, paint === CREAM && { color: C.ink }]}>{label}</Txt>
    </Slab>
  );
}

const styles = StyleSheet.create({
  hud: { position: 'absolute', gap: 6 },
  even: { width: 56 }, // the width of the pause button (Btn minWidth)
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, height: PLATE },
  plate: { flex: 1, height: PLATE },
  plateFace: { paddingHorizontal: 10, justifyContent: 'center', gap: 3 },
  name: { fontFamily: FONT.display, fontSize: 14, lineHeight: 17 },
  l2: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 14 }, // fixed height: the plate never grows
  l2Text: { fontFamily: FONT.bold, fontSize: 12, lineHeight: 14, fontVariant: ['tabular-nums'] },
  frames: { width: FRAME, height: FRAME, alignItems: 'center', justifyContent: 'center' },
  framesText: { fontFamily: FONT.display, fontSize: 17, color: C.chalk, fontVariant: ['tabular-nums'] },
  nine: { position: 'absolute', flexDirection: 'row', justifyContent: 'center', gap: 5, height: STRIP_PIP },
  num: { fontFamily: FONT.bold, fontSize: 10, lineHeight: 18, fontVariant: ['tabular-nums'] },
  next: { borderWidth: 2, borderColor: C.chalk }, // inside the box: the pip keeps its size
  banner: { maxWidth: '100%' },
  bannerFace: { paddingVertical: 4, paddingHorizontal: 12 },
  bannerText: { color: C.chalk, fontFamily: FONT.bold, fontSize: 13, lineHeight: 16, textAlign: 'center' },
  sheet: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', padding: 24 },
  scroll: { flexGrow: 0, maxWidth: '100%', borderRadius: 10 }, // a long card (quick match pay) scrolls on a short landscape phone
  card: { width: 300, maxWidth: '100%', padding: 20, gap: 10, borderRadius: 10, borderWidth: 1, borderColor: LINE, backgroundColor: C.ground + 'F2', alignItems: 'center' },
  eyebrow: { color: C.chalk + 'B3', fontSize: 11, fontWeight: '600', letterSpacing: 0.9, textTransform: 'uppercase' },
  title: { color: C.chalk, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  why: { color: C.chalk, fontSize: 14, lineHeight: 19, textAlign: 'center' },
  act: { minHeight: 41, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  actText: { fontFamily: FONT.bold, fontSize: 15, color: C.chalk, textAlign: 'center' },
});
