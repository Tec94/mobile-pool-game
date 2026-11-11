// The match HUD (screens spec: player plates, the 9-ball strip, the banner) and the results card. What they show comes
// from src/ui/hud.ts; this file only draws it.
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { P } from '../physics/engine';
import type { State } from '../rules/rules';
import { BAR, RAIL, type View as TableView } from '../render/table';
import { BALLS, C } from '../theme';
import { banner, fresh, type Plate, plates, strip } from './hud';

const RED = BALLS[2]; // fouls reuse the three-ball red (Quiet Slate)
const LINE = C.chalk + '66'; // chalk hairline at 40%: 3:1 on the ground
const POP = { animationName: { from: { opacity: 0, transform: [{ scale: 0.95 }] } }, animationDuration: '200ms', animationTimingFunction: 'ease-out' } as const; // a new ruling pops in
const TOP = 4, PLATE = 44, STRIP = 24;
// Screen units the HUD takes above the table: the plates, and in 9-ball the strip of balls under them.
export const hudHeight = (game: number) => TOP + PLATE + 8 + (game === 9 ? STRIP : 0);

// The plates row sits above the table and out of the control column in landscape. The push out button, when the rules
// offer one, and the pause button come in as children at the end of the row. wait = what the AI is doing, for the banner.
export function MatchHud({ rules, names, push, view, pad, calm, wait, children }: { rules: State; names: string[]; push: boolean; view: TableView; pad: EdgeInsets; calm: boolean; wait?: string; children?: ReactNode }) {
  const [a, b] = plates(rules, names), nine = strip(rules), next = nine.find(q => q.next);
  // Landscape: the banner sits between the plates, above the table, where it covers no pocket. Portrait: over the
  // foot rail, between the corner pockets.
  const say = <Banner rules={rules} push={push} calm={calm} wait={wait} style={view.land ? { flex: 1 } : { position: 'absolute', top: view.oy - RAIL * view.s + 4, left: view.ox, width: P.W * view.s, paddingHorizontal: 0.12 * view.s }} />;
  return (
    <>
      <View style={[styles.hud, { top: pad.top + TOP, left: Math.max(pad.left, 8), right: Math.max(pad.right, 8) + (view.land ? BAR : 0) }]}>
        <View style={styles.row} accessibilityLiveRegion="polite">
          <PlateView p={a} land={view.land} />{view.land && say}<PlateView p={b} land={view.land} />{children}
        </View>
        {nine.length > 0 && (
          <View style={styles.nine} accessible accessibilityLabel={`${next ? `Ball ${next.id} to hit. ` : ''}Potted: ${nine.filter(q => q.gone).map(q => q.id).join(', ') || 'none'}`}>
            {nine.map(q => (
              <Pip key={q.id} id={q.id} gone={q.gone} size={18} style={q.next ? styles.next : undefined}>
                <Text maxFontSizeMultiplier={1} style={[styles.num, { color: q.gone ? C.chalk + '80' : q.id === 8 ? C.white : C.ink }]}>{q.id}</Text>
              </Pip>
            ))}
          </View>
        )}
      </View>
      {!view.land && say}
    </>
  );
}

// Line 1 the name; line 2 the group's pips (hollow once potted), or Open / Break / On the 8, or the 9-ball foul warning.
// The player to shoot is at full strength with a chalk underline.
function PlateView({ p, land }: { p: Plate; land: boolean }) {
  return (
    <View accessible accessibilityLabel={p.label} style={[styles.plate, land && { maxWidth: 200 }, !p.on && { opacity: 0.6 }]}>
      <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={styles.name}>{p.name}</Text>
      <View style={styles.l2}>
        {p.pips.map(q => <Pip key={q.id} id={q.id} gone={q.gone} size={8} />)}
        {!!p.text && <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={[styles.l2Text, p.warn && { color: RED }]}>{p.text}</Text>}
      </View>
      {p.on && <View style={styles.under} />}
    </View>
  );
}

// A ball as a flat disc: solid, or a white disc with a colour band for a stripe; a potted ball is an outline only.
function Pip({ id, gone, size, style, children }: { id: number; gone: boolean; size: number; style?: ViewStyle; children?: ReactNode }) {
  const hue = BALLS[(id - 1) % 8];
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }, gone ? { borderWidth: 1.5, borderColor: LINE } : { backgroundColor: id > 8 ? C.white : hue, overflow: 'hidden' }, (id === 7 || id === 8) && !gone && styles.eight, style]}>
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
        <Text maxFontSizeMultiplier={1.3} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75} style={styles.bannerText}>
          {!!say && <Text style={foul && { color: RED }}>{say}</Text>}{say && hint ? ' ' : ''}{hint}
        </Text>
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

const styles = StyleSheet.create({
  hud: { position: 'absolute', gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, height: PLATE },
  plate: { flex: 1, height: PLATE, paddingHorizontal: 10, justifyContent: 'center', gap: 3, borderRadius: 6, borderWidth: 1, borderColor: LINE, overflow: 'hidden' },
  name: { color: C.chalk, fontSize: 14, lineHeight: 17, fontWeight: '600' },
  l2: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 14 }, // fixed height: the plate never grows
  l2Text: { color: C.chalk + 'B3', fontSize: 12, lineHeight: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  under: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: C.chalk },
  eight: { borderWidth: 1, borderColor: LINE }, // the 7 and 8 keep an edge on the dark ground (a border: outline needs a style on web)
  nine: { flexDirection: 'row', justifyContent: 'center', gap: 5, height: 18 },
  num: { fontSize: 10, lineHeight: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  next: { borderWidth: 2, borderColor: C.chalk }, // inside the box: the pip keeps its size
  banner: { maxWidth: '100%', paddingVertical: 4, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: LINE, backgroundColor: '#000b' },
  bannerText: { color: C.chalk, fontSize: 13, lineHeight: 16, fontWeight: '600', textAlign: 'center' },
  sheet: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', padding: 24 },
  scroll: { flexGrow: 0, maxWidth: '100%', borderRadius: 10 }, // a long card (quick match pay) scrolls on a short landscape phone
  card: { width: 300, maxWidth: '100%', padding: 20, gap: 10, borderRadius: 10, borderWidth: 1, borderColor: LINE, backgroundColor: C.ground + 'F2', alignItems: 'center' },
  eyebrow: { color: C.chalk + 'B3', fontSize: 11, fontWeight: '600', letterSpacing: 0.9, textTransform: 'uppercase' },
  title: { color: C.chalk, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  why: { color: C.chalk, fontSize: 14, lineHeight: 19, textAlign: 'center' },
});
