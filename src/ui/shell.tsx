// The frame of every menu in the hand design: a strip along the top (level, XP, Fresh Chalk, coins), a stage (the
// chosen thing, its options as keys, one cream button) and a hand of cards along the bottom edge. Landscape when the
// window is wider than tall; in portrait the hand becomes a stack of card headers.
import { createContext, type ReactNode, useContext, useRef } from 'react';
import { Platform, Pressable, ScrollView, type ScrollViewInstance, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { profile } from '../progress';
import { levelOf } from '../progress/profile';
import { C, CREAM, FONT, inkOn, type Paint } from '../theme';
import { BallArt, Chip, HandCard, Hatch, Slab, Txt, TYPE } from './slab';

// Fresh Chalk charges for the strip. The daily state lives in App, so Menus provides it here for every screen.
export const ChalkCount = createContext(0);

// Landscape or not, and the side gutter: the safe area plus 12, at least 16.
export function useFrame() {
  const { width, height } = useWindowDimensions(), pad = useSafeAreaInsets();
  return { land: width > height, side: Math.max(16, Math.max(pad.left, pad.right) + 12), pad, width };
}

// A menu: the strip on top, then the stage and the hand. back = a back chip named title; settings = the settings chip.
export function Shell({ title, back, settings, children }: { title?: string; back?: () => void; settings?: () => void; children: ReactNode }) {
  const { pad } = useFrame();
  return (
    <View style={[styles.shell, { paddingTop: pad.top }]}>
      <Strip title={title} back={back} settings={settings} />
      {children}
    </View>
  );
}

// The player's place: on home the level ball, else a back chip; then the XP bar, Fresh Chalk and coins.
export function Strip({ title, back, settings }: { title?: string; back?: () => void; settings?: () => void }) {
  const { land, side } = useFrame(), chalk = useContext(ChalkCount), p = profile(), { level, into, need } = levelOf(p.xp);
  const xp = <>
    <Hatch share={need ? into / need : 1} style={land ? { width: 130 } : { flex: 1 }} />
    <Txt style={[styles.small, TYPE.num]}>{need ? `${into} / ${need} XP` : 'Top level'}</Txt>
  </>;
  return (
    <View style={{ paddingHorizontal: side, paddingTop: land ? 10 : 8, gap: 8 }}>
      <View style={styles.row}>
        {back ? <Chip onPress={back} name="Back" style={styles.back}>{`‹ ${title ?? ''}`}</Chip>
          : <BallArt n={level} size={30} label={level} />}
        <Txt style={back ? styles.small : styles.level}>{`Level ${level}`}</Txt>
        {land && xp}
        <View style={{ flex: 1 }} />
        <Chip name={`Fresh Chalk, ${chalk} ${chalk === 1 ? 'charge' : 'charges'}`}><View style={styles.cube} /><Txt style={styles.chipNum}>{chalk}</Txt></Chip>
        <Chip name={`${p.coins} coins`}><View style={styles.coin} /><Txt style={styles.chipNum}>{p.coins.toLocaleString('en-US')}</Txt></Chip>
        {settings && <Chip onPress={settings} name="Settings"><Sliders /></Chip>}
      </View>
      {!land && <View style={styles.row}>{xp}</View>}
    </View>
  );
}

// The settings mark: three sliders.
const Sliders = () => (
  <View style={{ width: 15, height: 20, justifyContent: 'center', gap: 3 }}>
    {[3, 9, 5].map((x, i) => <View key={i} style={{ height: 2, backgroundColor: C.chalk }}><View style={[styles.knob, { left: x }]} /></View>)}
  </View>
);

// An underlined text link, for the line under the stage's button and small actions like a reset.
export function Link({ label, name, onPress }: { label: string; name?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={name ?? label} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} style={styles.link}>
      <Txt style={styles.linkText}>{label}</Txt>
    </Pressable>
  );
}

export interface Action { label: string; name?: string; onPress: () => void; off?: boolean } // off = cannot be pressed now
// The chosen thing: its title, one line, the option rows (children), and the one cream button, top right in landscape
// (with an optional link under it) and full width under the rows in portrait.
export function Stage({ title, line, cta, link, children }: { title: string; line?: string; cta: Action; link?: Action; children?: ReactNode }) {
  const { land, side } = useFrame();
  const button = (
    <Slab paint={CREAM} onPress={cta.onPress} disabled={cta.off} accessibilityLabel={cta.name ?? cta.label} style={land ? { width: 170, height: 58 } : { height: 58, marginTop: 6 }} face={styles.cta}>
      <Txt numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.ctaText}>{cta.label}</Txt>
    </Slab>
  );
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: side, paddingTop: land ? 6 : 12, paddingBottom: 12, gap: 8 }} keyboardShouldPersistTaps="handled">
      <View style={land && { minHeight: 58, paddingRight: 186 }}>
        <Txt accessibilityRole="header" style={TYPE.title}>{title}</Txt>
        {line && <Txt numberOfLines={2} style={styles.line}>{line}</Txt>}
      </View>
      {children}
      {land ? <View style={[styles.side, { right: side }]}>{button}{link && <Link {...link} />}</View>
        : <>{button}{link && <View style={{ alignItems: 'flex-end' }}><Link {...link} /></View>}</>}
    </ScrollView>
  );
}

// A row of the stage: keys, chips or fields side by side, wrapping when the screen is narrow.
export const Row = ({ children, gap = 16 }: { children: ReactNode; gap?: number }) => <View style={[styles.row, styles.wrap, { gap }]}>{children}</View>;

export interface Card {
  key: string; paint: Paint; name: string; // name = what a screen reader says
  title: string; line?: string;
  art?: (size: number) => ReactNode;       // drawn bottom right in landscape, at the end of the header in portrait
  body?: ReactNode;                        // landscape only: in place of title, line and art
}
// The choices as cards. Tap one: it rises and the stage follows (pick). Landscape: a row along the bottom edge that runs
// off it and scrolls sideways, opening on the raised card. The scroller holds the whole cards and runs off the screen
// itself, so nothing in it can scroll up and down (a focused card would, on the web). Portrait: a stack of 50 pt headers, the chosen one outlined, opening near it.
export function Hand({ cards, up, pick, width = 110, height = 200 }: { cards: Card[]; up: number; pick: (i: number) => void; width?: number; height?: number }) {
  const { land, side, width: screen } = useFrame(), scroll = useRef<ScrollViewInstance>(null), mid = (cards.length - 1) / 2, step = Math.min(1.1, 3.3 / Math.max(1, mid));
  if (!land) return (
    <ScrollView ref={scroll} style={{ flexGrow: 0, maxHeight: 50 * Math.min(cards.length, 6) + 85, marginBottom: -40 }} contentContainerStyle={{ paddingHorizontal: side }}
      onLayout={() => scroll.current?.scrollTo({ y: Math.max(0, 50 * (up - 2)), animated: false })}>
      {cards.map((c, i) => {
        const ink = { color: inkOn(c.paint) }, last = i === cards.length - 1;
        return (
          <Slab key={c.key} paint={c.paint} onPress={() => pick(i)} accessibilityLabel={c.name} accessibilityState={{ selected: i === up }}
            style={{ height: last ? 95 : 55, marginBottom: last ? 0 : -5 }} face={i === up && styles.chosen}>
            <View style={styles.head}>
              <Txt numberOfLines={1} style={[styles.headTitle, ink]}>{c.title}</Txt>
              {c.line && <Txt numberOfLines={1} style={[TYPE.small, ink, { flexShrink: 1 }]}>{c.line}</Txt>}
              <View style={{ flex: 1 }} />
              {c.art?.(32)}
            </View>
          </Slab>
        );
      })}
    </ScrollView>
  );
  return (
    <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, height: height + 26, marginBottom: -42 }} contentContainerStyle={{ paddingHorizontal: side, paddingTop: 26, gap: 4 }}
      onLayout={() => scroll.current?.scrollTo({ x: Math.max(0, side + up * (width + 4) - (screen - width) / 2), animated: false })}>
      {cards.map((c, i) => {
        const ink = { color: inkOn(c.paint) };
        return (
          <HandCard key={c.key} paint={c.paint} up={i === up} tilt={(i - mid) * step} onPress={() => pick(i)} name={c.name} width={width} height={height}>
            {c.body ?? <>
              <Txt style={[TYPE.name, ink]}>{c.title}</Txt>
              {c.line && <Txt style={[TYPE.small, ink, { marginTop: 3 }]}>{c.line}</Txt>}
              {c.art && <View style={styles.art}>{c.art(56)}</View>}
            </>}
          </HandCard>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // 'clip' on the web: a focused card would scroll a 'hidden' overflow and lift the whole menu.
  shell: { flex: 1, backgroundColor: C.menu, overflow: Platform.OS === 'web' ? ('clip' as 'hidden') : 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wrap: { flexWrap: 'wrap', rowGap: 8 },
  back: { marginRight: 4 },
  level: { fontFamily: FONT.display, fontSize: 20, color: C.chalk },
  small: { fontFamily: FONT.semi, fontSize: 12, color: C.chalk, opacity: 0.8 },
  chipNum: { fontFamily: FONT.bold, fontSize: 13, color: C.chalk, fontVariant: ['tabular-nums'] },
  cube: { width: 10, height: 10, backgroundColor: C.blue, boxShadow: '1.5px 1.5px 0 #0006' },
  coin: { width: 11, height: 11, borderRadius: 6, backgroundColor: C.gold, boxShadow: '1.5px 1.5px 0 #0006' },
  knob: { position: 'absolute', top: -2, width: 4, height: 6, borderRadius: 1, backgroundColor: C.chalk },
  link: { height: 28, justifyContent: 'center', alignSelf: 'flex-end' },
  linkText: { fontFamily: FONT.bold, fontSize: 12, color: C.chalk, textDecorationLine: 'underline', opacity: 0.9 },
  line: { ...TYPE.body, opacity: 0.82, marginTop: 3 },
  side: { position: 'absolute', top: 6, width: 170, alignItems: 'flex-end' },
  cta: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  ctaText: { fontFamily: FONT.display, fontSize: 26, lineHeight: 30, color: C.ink },
  art: { position: 'absolute', right: 6, top: 92 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 50, paddingHorizontal: 14 },
  headTitle: { fontFamily: FONT.display, fontSize: 18, lineHeight: 22 },
  chosen: { outlineColor: C.chalk, outlineWidth: 2, outlineOffset: -2, outlineStyle: 'solid' },
});
