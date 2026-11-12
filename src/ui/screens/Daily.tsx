import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { addMonths, monthGrid, streak, weekday } from '../../daily/daily';
import { starCount } from '../../scenarios/scenarios';
import { Btn } from '../Btn';
import { dateOf, DAYS, monthName, THEMES } from '../days';
import type { DailyProps, Props } from '../Menus';
import { Page, styles } from './legacy';

// A month of daily tables. Every day from the first one opened to today plays at full pay; the grid is Monday first.
// It opens on the month of day, the day last played, so coming back from a table keeps its month.
export function Calendar({ go, daily, today, day, playDay }: Pick<Props, 'go'> & Omit<DailyProps, 'arm'>) {
  const [month, setMonth] = useState(day.slice(0, 7)), { current, best } = streak(daily.stars, today);
  const cells = monthGrid(month), weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(7 * w, 7 * w + 7));
  return (
    <Page title="Daily Table" back={() => go('home')}>
      <Text maxFontSizeMultiplier={1.3} style={styles.label}>{`Run ${current} · best ${best}`}</Text>
      <Text maxFontSizeMultiplier={1.3} style={styles.note}>One table a day, the same for everyone. Any day on the calendar can be played for its stars.</Text>
      <Btn label={`Play today\n${dateOf(today)} · ${THEMES[weekday(today)]}`} name={`Play today, ${THEMES[weekday(today)]}`} onPress={() => playDay(today)} />
      <View style={styles.top}>
        <Btn label="‹" name="Previous month" off={month <= daily.firstDay.slice(0, 7)} onPress={() => setMonth(addMonths(month, -1))} />
        <Text maxFontSizeMultiplier={1.3} accessibilityRole="header" style={[styles.label, styles.month]}>{`${monthName(month)} ${month.slice(0, 4)}`}</Text>
        <Btn label="›" name="Next month" off={month >= today.slice(0, 7)} onPress={() => setMonth(addMonths(month, 1))} />
      </View>
      <View style={styles.grid}>
        <View style={styles.week} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <Text key={i} maxFontSizeMultiplier={1.3} style={[styles.note, styles.cell]}>{d}</Text>)}
        </View>
        {weeks.map((w, i) => (
          <View key={i} style={styles.week}>
            {w.map((k, j) => {
              if (!k) return <View key={j} style={styles.cell} />;
              const open = k >= daily.firstDay && k <= today, n = starCount(daily.stars[k]);
              return (
                <Pressable key={k} disabled={!open} onPress={() => playDay(k)} accessibilityRole="button" accessibilityState={{ disabled: !open }}
                  accessibilityLabel={`${DAYS[weekday(k)]} ${+k.slice(8, 10)} ${monthName(k)}${open ? `, ${n} of 3 stars` : ''}${k === today ? ', today' : ''}`}
                  style={({ pressed }) => [styles.cell, styles.day, k === today && styles.today, { opacity: open ? (pressed ? 0.6 : 1) : 0.3 }]}>
                  <Text maxFontSizeMultiplier={1.2} style={styles.label}>{+k.slice(8, 10)}</Text>
                  <Text maxFontSizeMultiplier={1.2} style={styles.stars}>{n ? `${'★'.repeat(n)}${'☆'.repeat(3 - n)}` : ' '}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </Page>
  );
}
