// Home only picks a mode: quick match as the big cream slab with the one Play, every other mode a tile that opens its
// screen in one tap and shows its state as a picture.
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { TIERS } from '../../ai/shot-ai';
import { addDays, dailyPick, streak, weekday } from '../../daily/daily';
import { LESSONS } from '../../learn/lessons';
import { profile } from '../../progress';
import { CUE_IDS, CUES } from '../../progress/cues';
import { shown } from '../../progress/rival';
import { isOpen, SCENARIOS, starCount, totalStars } from '../../scenarios/scenarios';
import { RIVAL } from '../../settings/settings';
import { C, CREAM, FONT, MODE } from '../../theme';
import { CueArt } from '../CuePicture';
import { DAYS, dateOf, THEMES } from '../days';
import type { DailyProps, LearnProps, Props, ScenarioProps } from '../Menus';
import { MiniTable, rackOf, SpinDot, tableOf } from '../MiniTable';
import { Shell, Tile, useFrame } from '../shell';
import { BallArt, Slab, Txt, TYPE } from '../slab';

type HomeProps = Props & LearnProps & ScenarioProps & Omit<DailyProps, 'day'>;
export const short = (l: { id: string; title: string }) => (l.id === 'bank' ? 'Banks' : l.title.split(/:| and /)[0]);

export function Home({ set, go, done, stars, daily, today }: HomeProps) {
  const { land, side, pad, width, height } = useFrame(), [box, setBox] = useState({ w: width - 2 * side, h: 300 });
  const me = profile(), wd = weekday(today), k = starCount(daily.stars[today]), run = streak(daily.stars, today).current;
  const nextLesson = LESSONS.findIndex(l => !done.includes(l.id)), total = totalStars(stars), all = 3 * SCENARIOS.length;
  // The next table to play: the first open one not yet cleared, else the first open one short of three stars.
  const open = SCENARIOS.map((_, i) => i).filter(i => isOpen(i, stars, me.xp));
  const ns = open.find(i => !((stars[SCENARIOS[i].id] ?? 0) & 1)) ?? open.find(i => starCount(stars[SCENARIOS[i].id]) < 3);
  const opp = set.tier === RIVAL ? `Rival ${shown(me.rival[set.aiGame].rating)}` : TIERS[set.tier].name;
  // Sizes: landscape from the body's measured box, portrait from the window.
  const heroW = land ? Math.min(300, Math.max(240, 0.37 * box.w)) : width - 2 * side, rest = box.w - heroW - 8, rowH = (box.h - 8) / 2;
  const dailyW = land ? (rest - 8) * 2 / 3 : width - 2 * side, smallW = land ? (rest - 16) / 3 : (width - 2 * side - 8) / 2, tileH = land ? rowH - 5 : 150;
  const heroTable = land ? Math.min(heroW - 24, (box.h - 186) * 2 / 1.12) : Math.min(heroW - 24, 420);
  const scenW = Math.min(smallW - 24, (tileH - 88) / 0.56); // a table is 0.56 of its width tall

  const hero = (
    <Slab paint={CREAM} style={land ? { width: heroW } : { minHeight: 300 }} face={styles.hero}>
      <Txt accessibilityRole="header" style={styles.heroTitle}>Quick match</Txt>
      {(!land || box.h >= 300) && heroTable > 60 && <View style={{ alignItems: 'center' }}><MiniTable width={heroTable} {...rackOf(set.aiGame)} cloth={set.cloth} /></View>}
      <Pressable onPress={() => go('setup')} accessibilityRole="button" accessibilityLabel={`Change match setup, ${set.aiGame}-ball, race to ${set.aiRace}, ${opp}`} hitSlop={8} style={styles.change}>
        {[`${set.aiGame}-ball`, `Race to ${set.aiRace}`, opp].map(t => <View key={t} style={styles.tag}><Txt numberOfLines={1} style={styles.tagText}>{t}</Txt></View>)}
        <View style={{ flex: 1 }} />
        <Txt style={[styles.tagText, { opacity: 0.6 }]}>Change ›</Txt>
      </Pressable>
      <View style={{ flex: 1 }} />
      <Slab paint={[C.ink, '#000']} lip={4} radius={4} onPress={() => go('ai')} accessibilityLabel="Play quick match" style={{ height: 60 }} face={styles.center}>
        <Txt style={styles.play}>Play</Txt>
      </Slab>
    </Slab>
  );
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const tiles = {
    daily: (
      <Tile paint={MODE.daily} name={`Daily Table, ${dateOf(today)}, ${THEMES[wd]}, ${k} of 3 stars${run ? `, run of ${run} days` : ''}`} title="Daily Table" onPress={() => go('calendar')} style={{ flex: 2, minHeight: 120 }}>
        <Txt style={styles.line}>{`${DAYS[wd].slice(0, 3)} ${+today.slice(8, 10)} · ${THEMES[wd]}`}</Txt>
        <View style={{ flex: 1 }} />
        <View style={styles.week}>
          {week.map(d => {
            const got = starCount(daily.stars[d]) > 0, now = d === today;
            return <View key={d} style={[styles.day, { backgroundColor: now ? CREAM[0] : got ? C.ink : '#16191A21' }]}><Txt style={[styles.dayText, { color: got && !now ? MODE.daily[0] : C.ink }]}>{DAYS[weekday(d)][0]}</Txt></View>;
          })}
        </View>
        {dailyW >= 250 && <View style={styles.dayTable}><MiniTable width={Math.min(140, dailyW - 170)} {...tableOf(SCENARIOS[dailyPick(today, SCENARIOS)])} /></View>}
      </Tile>
    ),
    scenarios: (
      <Tile paint={MODE.scenarios} name={`Scenarios, ${total} of ${all} stars`} title="Scenarios" onPress={() => go('scenarios')} style={{ flex: 1, minHeight: 120 }} face={{ gap: 4 }}>
        {ns !== undefined && scenW > 50 && <View style={{ marginTop: 2 }}><MiniTable width={scenW} {...tableOf(SCENARIOS[ns])} /></View>}
        <View style={{ flex: 1 }} />
        <Txt style={[styles.count, { color: C.chalk }]}>{total}<Txt style={styles.of}>{` / ${all} ★`}</Txt></Txt>
        <View style={styles.track}><View style={[styles.fill, { width: `${Math.max(2, 100 * total / all)}%` }]} /></View>
      </Tile>
    ),
    learn: (
      <Tile paint={MODE.learn} name={`Learn, ${done.length} of ${LESSONS.length} passed${nextLesson >= 0 ? `, next ${LESSONS[nextLesson].title}` : ''}`} title="Learn" onPress={() => go('learn')} style={{ flex: 1, minHeight: 120 }}>
        {nextLesson >= 0 && <Txt numberOfLines={1} style={[styles.line, { color: C.chalk }]}>{`Next: ${short(LESSONS[nextLesson])}`}</Txt>}
        {nextLesson >= 0 && <View style={styles.spin}><SpinDot tip={LESSONS[nextLesson].ref.tip} size={34} /></View>}
        <View style={{ flex: 1 }} />
        <View style={styles.pips}>{LESSONS.map(l => <View key={l.id} style={[styles.pip, done.includes(l.id) && { backgroundColor: C.chalk }]} />)}</View>
      </Tile>
    ),
    pass: (
      <Tile paint={MODE.pass} name={`Pass and play, ${set.names[0]} against ${set.names[1]}`} title="Pass and play" onPress={() => go('pass')} style={{ flex: 1, minHeight: 120 }}>
        <View style={{ flex: 1 }} />
        <View style={styles.vs}>
          <BallArt n={1} size={34} label={set.names[0].slice(0, 2)} /><Txt style={styles.vsText}>vs</Txt><BallArt n={2} size={34} label={set.names[1].slice(0, 2)} />
        </View>
      </Tile>
    ),
    cues: (
      <Tile paint={MODE.cues} name={`Cues, ${CUES[me.cue].name} in use, ${me.owned.length} of ${CUE_IDS.length} cues`} title="Cues" onPress={() => go('cues')} style={{ flex: 1, minHeight: 120 }}>
        <Txt numberOfLines={1} style={styles.line}>{CUES[me.cue].name}</Txt>
        <Txt style={[styles.line, styles.owned]}>{`${me.owned.length} / ${CUE_IDS.length}`}</Txt>
        <View style={styles.cue}><CueArt id={me.cue} pose={[Math.round(smallW), 80, 6, 72, -24, Math.round(smallW * 1.3), 4]} /></View>
      </Tile>
    ),
  };
  if (!land) return (
    <Shell settings={() => go('settings')}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: side, paddingTop: 12, paddingBottom: Math.max(pad.bottom, 16), gap: 8 }}>
        {hero}
        {tiles.daily}
        <View style={styles.pair}>{tiles.scenarios}{tiles.learn}</View>
        <View style={styles.pair}>{tiles.pass}{tiles.cues}</View>
      </ScrollView>
    </Shell>
  );
  const body = (
    <View style={[styles.pair, { flex: 1, minHeight: 300 }]} onLayout={e => { const { width: w, height: h } = e.nativeEvent.layout; if (w !== box.w || h !== box.h) setBox({ w, h }); }}>
      {hero}
      <View style={{ flex: 1, gap: 8 }}>
        <View style={[styles.pair, { flex: 1 }]}>{tiles.daily}{tiles.scenarios}</View>
        <View style={[styles.pair, { flex: 1 }]}>{tiles.learn}{tiles.pass}{tiles.cues}</View>
      </View>
    </View>
  );
  const padding = { paddingHorizontal: side, paddingTop: 12, paddingBottom: Math.max(pad.bottom, 16) };
  return (
    <Shell settings={() => go('settings')}>
      {height < 360 ? <ScrollView contentContainerStyle={[padding, { flexGrow: 1 }]}>{body}</ScrollView> : <View style={[padding, { flex: 1 }]}>{body}</View>}
    </Shell>
  );
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', gap: 8 },
  hero: { padding: 12, gap: 10 },
  heroTitle: { fontFamily: FONT.display, fontSize: 28, lineHeight: 30, color: C.ink, letterSpacing: -0.4 },
  change: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 },
  tag: { backgroundColor: '#16191A14', borderRadius: 3, paddingVertical: 5, paddingHorizontal: 8, flexShrink: 1 },
  tagText: { fontFamily: FONT.bold, fontSize: 12, lineHeight: 16, color: C.ink },
  center: { alignItems: 'center', justifyContent: 'center' },
  play: { fontFamily: FONT.display, fontSize: 30, lineHeight: 34, color: CREAM[0] },
  line: { fontFamily: FONT.bold, fontSize: 12, lineHeight: 16, color: C.ink, marginTop: 3 },
  week: { flexDirection: 'row', gap: 3 },
  day: { width: 17, height: 22, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontFamily: FONT.bold, fontSize: 10, lineHeight: 12 },
  dayTable: { position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' },
  count: { fontFamily: FONT.display, fontSize: 22, lineHeight: 24, ...TYPE.num },
  of: { fontFamily: FONT.bold, fontSize: 13, opacity: 0.8 },
  track: { height: 8, borderRadius: 2, backgroundColor: '#0003', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: C.chalk },
  spin: { position: 'absolute', right: 12, top: 54 },
  pips: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  pip: { width: 8, height: 12, borderRadius: 1.5, backgroundColor: '#0003' },
  vs: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  vsText: { fontFamily: FONT.display, fontSize: 15, lineHeight: 18, color: C.ink },
  owned: { position: 'absolute', right: 12, top: 10 },
  cue: { position: 'absolute', left: 0, bottom: 0 },
});
