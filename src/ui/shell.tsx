// The frame of every menu: a strip along the top (level, XP, Fresh Chalk, coins, or a back chip and the title), then
// the body: a Split (choices left, the Panel with the one cream button right) or a grid of Tiles. Landscape when the
// window is wider than tall; in portrait a Split's panel goes under its choices.
import * as Haptics from 'expo-haptics';
import { createContext, type ReactNode, useContext, useRef } from 'react';
import { Platform, ScrollView, type ScrollViewInstance, type StyleProp, StyleSheet, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { profile } from '../progress';
import { levelOf } from '../progress/profile';
import { C, CREAM, DARK, FONT, inkOn, type Paint } from '../theme';
import { BallArt, Chip, feel, Hatch, Slab, Txt, TYPE } from './slab';

// Fresh Chalk charges for the strip. The daily state lives in App, so Menus provides it here for every screen.
export const ChalkCount = createContext(0);

// Landscape or not, and the side gutter: the safe area plus 12, at least 16.
export function useFrame() {
  const { width, height } = useWindowDimensions(), pad = useSafeAreaInsets();
  return { land: width > height, side: Math.max(16, Math.max(pad.left, pad.right) + 12), pad, width, height };
}

// A menu: the strip on top, then the body. back = a back chip named title; settings = the settings chip; extra = a fact after the title.
export function Shell({ title, back, settings, extra, children }: { title?: string; back?: () => void; settings?: () => void; extra?: ReactNode; children: ReactNode }) {
  const { pad } = useFrame();
  return (
    <View style={[styles.shell, { paddingTop: pad.top }]}>
      <Strip title={title} back={back} settings={settings} extra={extra} />
      {children}
    </View>
  );
}

// The player's place. Home: the level ball, level, XP bar, Fresh Chalk, coins, settings. Inner screens: a back chip,
// the title and an optional fact (progress), then Fresh Chalk and coins.
export function Strip({ title, back, settings, extra }: { title?: string; back?: () => void; settings?: () => void; extra?: ReactNode }) {
  const { land, side } = useFrame(), chalk = useContext(ChalkCount), p = profile(), { level, into, need } = levelOf(p.xp);
  const xp = <>
    <Hatch share={need ? into / need : 1} style={land ? { width: 130 } : { flex: 1 }} />
    <Txt style={[styles.small, TYPE.num]}>{need ? `${into} / ${need} XP` : 'Top level'}</Txt>
  </>;
  return (
    <View style={{ paddingHorizontal: side, paddingTop: land ? 10 : 8, gap: 8 }}>
      {/* each chip 3 pt down: its lip hangs under the face, so the face lines up with the level */}
      <View style={[styles.row, { minHeight: 32 }]}>
        {back ? <>
          <Chip onPress={back} name={`Back${title ? `, ${title}` : ''}`} style={[styles.lip, { minWidth: 26 }]}>‹</Chip>
          <Txt numberOfLines={1} accessibilityRole="header" style={[styles.level, { flexShrink: 1 }]}>{title}</Txt>
          {extra}
        </> : <>
          <BallArt n={level} size={30} label={level} />
          <Txt numberOfLines={1} style={[styles.level, { flexShrink: 1 }]}>{`Level ${level}`}</Txt>
          {land && xp}
        </>}
        <View style={{ flex: 1 }} />
        <Chip name={`Fresh Chalk, ${chalk} ${chalk === 1 ? 'charge' : 'charges'}`} style={styles.lip}><View style={styles.cube} /><Txt style={styles.chipNum}>{chalk}</Txt></Chip>
        <Chip name={`${p.coins} coins`} style={styles.lip}><View style={styles.coin} />
          <Txt style={styles.chipNum}>{p.coins >= 1e6 ? `${(p.coins / 1e6).toFixed(2)}M` : p.coins.toLocaleString('en-US')}</Txt></Chip>
        {settings && <Chip onPress={settings} name="Settings" style={styles.lip}><Sliders /></Chip>}
      </View>
      {!land && !back && <View style={styles.row}>{xp}</View>}
    </View>
  );
}

// The body of a screen with a panel: choices on the left (scrolling), the panel on the right. Portrait: the panel under them.
// at = the offset to open scrolled to (Infinity = the end).
export function Split({ children, panel, at }: { children: ReactNode; panel: ReactNode; at?: number }) {
  const { land, side, pad } = useFrame(), w = usePanel(), scroll = useRef<ScrollViewInstance>(null), opened = useRef(false);
  return (
    <View style={{ flex: 1, flexDirection: land ? 'row' : 'column', gap: 16, paddingHorizontal: side, paddingTop: 12, paddingBottom: Math.max(pad.bottom, 16) }}>
      <ScrollView ref={scroll} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" alwaysBounceVertical={false}
        onContentSizeChange={() => { if (at && !opened.current) { opened.current = true; if (at === Infinity) scroll.current?.scrollToEnd({ animated: false }); else scroll.current?.scrollTo({ y: at, animated: false }); } }}>{children}</ScrollView>
      <View style={land && { width: w }}>{panel}</View>
    </View>
  );
}
// The panel's width: at most 268 pt and 36% of the body in landscape, the body's width in portrait.
export function usePanel() { const { land, side, width } = useFrame(); return land ? Math.min(268, 0.36 * (width - 2 * side)) : width - 2 * side; }

// The panel: a head row, a picture (picture(w) at the panel's inner width; in portrait only on a window 700 pt tall),
// what else it holds (scrolls when tall), and the screen's one button at its foot.
export function Panel({ head, picture, children, cta }: { head: ReactNode; picture?: (w: number) => ReactNode; children?: ReactNode; cta: Action }) {
  const { land, height } = useFrame(), w = usePanel() - 24;
  return (
    <Slab paint={DARK} style={land && { flex: 1 }} face={styles.panel}>
      <View style={styles.row}>{head}</View>
      {picture && (land || height >= 700) && <View style={{ alignItems: 'center' }}>{picture(w)}</View>}
      <ScrollView style={land ? { flex: 1 } : { flexGrow: 0 }} alwaysBounceVertical={false}>{children}</ScrollView>
      <Cta {...cta} />
    </Slab>
  );
}

// The one cream button of a screen. off = it cannot be pressed now: a dark face, chalk at 60%.
export function Cta({ label, name, onPress, off, quiet }: Action) {
  const tall = useFrame().height >= 390;
  return (
    <Slab paint={off ? DARK : CREAM} onPress={() => { if (!quiet) feel(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)); onPress(); }} disabled={off} accessibilityLabel={name ?? label}
      style={{ height: tall ? 64 : 58, opacity: 1 }} face={styles.cta}>
      <Txt numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.ctaText, off && { color: C.chalk, opacity: 0.6 }]}>{label}</Txt>
    </Slab>
  );
}

// A mode or a choice as one pressable slab: its title, then what it shows (children).
export function Tile({ paint, name, title, onPress, style, face, children }: { paint: Paint; name: string; title?: string; onPress?: () => void; style?: StyleProp<ViewStyle>; face?: StyleProp<ViewStyle>; children?: ReactNode }) {
  return (
    <Slab paint={paint} onPress={onPress} accessibilityRole="button" accessibilityLabel={name} style={style} face={[styles.tile, face]}>
      {title && <Txt numberOfLines={2} style={[styles.tileTitle, { color: inkOn(paint) }]}>{title}</Txt>}
      {children}
    </Slab>
  );
}

// The settings mark: three sliders.
const Sliders = () => (
  <View style={{ width: 19, height: 20, justifyContent: 'center', gap: 3 }}>
    {[3, 9, 5].map((x, i) => <View key={i} style={{ height: 2, backgroundColor: C.chalk }}><View style={[styles.knob, { left: x }]} /></View>)}
  </View>
);

export interface Action { label: string; name?: string; onPress: () => void; off?: boolean; quiet?: boolean } // off = cannot be pressed now; quiet = the press gives its own haptic
// A row of keys, chips or fields side by side, wrapping when the screen is narrow.
export const Row = ({ children, gap = 16 }: { children: ReactNode; gap?: number }) => <View style={[styles.row, styles.wrap, { columnGap: gap, rowGap: 8 }]}>{children}</View>;

const styles = StyleSheet.create({
  // 'clip' on the web: a focused card would scroll a 'hidden' overflow and lift the whole menu.
  shell: { flex: 1, backgroundColor: C.menu, overflow: Platform.OS === 'web' ? ('clip' as 'hidden') : 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wrap: { flexWrap: 'wrap', rowGap: 8 },
  lip: { marginTop: 3 },
  level: { fontFamily: FONT.display, fontSize: 20, lineHeight: 24, marginBottom: 4, color: C.chalk },
  small: { fontFamily: FONT.semi, fontSize: 12, color: C.chalk, opacity: 0.8 },
  chipNum: { fontFamily: FONT.bold, fontSize: 13, lineHeight: 16, color: C.chalk, fontVariant: ['tabular-nums'] },
  cube: { width: 10, height: 10, backgroundColor: C.blue, boxShadow: '1.5px 1.5px 0 #0006' },
  coin: { width: 11, height: 11, borderRadius: 6, backgroundColor: C.gold, boxShadow: '1.5px 1.5px 0 #0006' },
  knob: { position: 'absolute', top: -2, width: 4, height: 6, borderRadius: 1, backgroundColor: C.chalk },
  cta: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  ctaText: { fontFamily: FONT.display, fontSize: 28, lineHeight: 32, color: C.ink },
  panel: { padding: 12, gap: 8 },
  tile: { paddingVertical: 10, paddingHorizontal: 12 },
  tileTitle: { fontFamily: FONT.display, fontSize: 19, lineHeight: 21 },
});
