import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { addDays, dailyPick, daysBetween, streak, weekday } from '../../daily/daily';
import { SCENARIOS, starCount } from '../../scenarios/scenarios';
import { C, CREAM, DARK, FONT, inkOn, MODE } from '../../theme';
import { DAYS, monthName, THEMES } from '../days';
import type { DailyProps, Props } from '../Menus';
import { MiniTable, tableOf } from '../MiniTable';
import { Panel, Shell, Split, Tile, useFrame, usePanel } from '../shell';
import { Slab, Txt, TYPE } from '../slab';

const starLine = (k: number) => `${'★'.repeat(k)}${'☆'.repeat(3 - k)}`;

// Every daily table from the first one opened to today, a week a row ending on today: blue = has stars, dark = none,
// cream = the chosen day, drawn on the right above Play. Every day plays at full pay. It opens on day, the day last played.
// shortcut: one cell per day, all rendered; window the grid if a player's days run into the hundreds.
export function Calendar({ go, daily, today, day, playDay }: Pick<Props, 'go'> & Omit<DailyProps, 'arm'>) {
  const days = Array.from({ length: daysBetween(daily.firstDay, today) + 1 }, (_, i) => addDays(daily.firstDay, i));
  const [k, setK] = useState(days.includes(day) ? day : today), run = streak(daily.stars, today).current, n = starCount(daily.stars[k]);
  const { land, side, width } = useFrame(), panel = usePanel(), left = land ? width - 2 * side - panel - 16 : width - 2 * side, cw = (left - 36) / 7;
  const name = (d: string) => `${DAYS[weekday(d)]} ${+d.slice(8, 10)} ${monthName(d)}`, head = `${DAYS[weekday(k)].slice(0, 3)} ${+k.slice(8, 10)} · ${THEMES[weekday(k)]}`;
  return (
    <Shell title="Daily Table" back={() => go('home')} extra={run > 0 && <Slab paint={MODE.daily} lip={3} radius={3} accessible accessibilityRole="text" style={{ marginTop: 3 }} face={styles.run}><Txt style={styles.runText}>{`${run}-day run`}</Txt></Slab>}>
      <Split end panel={
        <Panel head={<><Txt numberOfLines={1} style={styles.head}>{head}</Txt><View style={{ flex: 1 }} /><Txt style={styles.gold} accessibilityLabel={`${n} of 3 stars`}>{starLine(n)}</Txt></>}
          picture={w => <MiniTable width={w} {...tableOf(SCENARIOS[dailyPick(k, SCENARIOS)])} />}
          cta={{ label: 'Play', name: `Play ${name(k)}, ${THEMES[weekday(k)]}`, onPress: () => playDay(k) }} />}>
        <View style={styles.grid}>
          {/* empty cells first, so each row is a week that ends on today's weekday */}
          {Array.from({ length: (7 - days.length % 7) % 7 }, (_, i) => <View key={i} style={{ width: cw }} />)}
          {days.map((d, i) => {
            const got = starCount(daily.stars[d]), paint = d === k ? CREAM : got ? MODE.daily : DARK, ink = { color: inkOn(paint) }, first = i === 0 || d.endsWith('-01');
            return (
              <Tile key={d} paint={paint} name={`${name(d)}, ${got} of 3 stars${d === today ? ', today' : ''}`} onPress={() => setK(d)} style={{ width: cw, height: land ? 96 : 76 }} face={[styles.cell, !land && { paddingHorizontal: 4 }]}>
                <Txt style={[styles.wd, ink]}>{DAYS[weekday(d)][0]}{first && <Txt style={{ opacity: 0.6 }}>{` ${monthName(d).slice(0, 3)}`}</Txt>}</Txt>
                <Txt style={[styles.date, ink, !land && { fontSize: 18, lineHeight: 21 }]}>{+d.slice(8, 10)}</Txt>
                <Txt numberOfLines={1} style={[styles.stars, ink, !land && { fontSize: 9, letterSpacing: -0.5 }]}>{starLine(got)}</Txt>
              </Tile>
            );
          })}
        </View>
      </Split>
    </Shell>
  );
}

const styles = StyleSheet.create({
  run: { minHeight: 26, paddingHorizontal: 9, justifyContent: 'center' },
  runText: { fontFamily: FONT.bold, fontSize: 13, lineHeight: 16, color: C.ink },
  head: { fontFamily: FONT.display, fontSize: 17, lineHeight: 20, color: C.chalk, flexShrink: 1 },
  gold: { fontSize: 14, color: C.gold },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 6, rowGap: 13 },
  cell: { paddingVertical: 6, paddingHorizontal: 7 },
  wd: { fontFamily: FONT.bold, fontSize: 10, lineHeight: 13, opacity: 0.8 },
  date: { fontFamily: FONT.display, fontSize: 24, lineHeight: 27, ...TYPE.num },
  stars: { fontSize: 11, lineHeight: 14, marginTop: 4 },
});
