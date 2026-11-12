import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { addDays, daysBetween, streak, weekday } from '../../daily/daily';
import { starCount } from '../../scenarios/scenarios';
import { C, DARK, FONT, MODE } from '../../theme';
import { dateOf, DAYS, monthName, THEMES } from '../days';
import type { DailyProps, Props } from '../Menus';
import { type Card, Hand, Row, Shell, Stage } from '../shell';
import { Chip, Txt, TYPE } from '../slab';

const starLine = (k: number) => `${'★'.repeat(k)}${'☆'.repeat(3 - k)}`;

// Every daily table from the first one opened to today, as a hand of days: blue = has stars, dark = none. Every day
// plays at full pay. It opens on day, the day last played, so coming back from a table keeps it raised.
// shortcut: one card per day, all rendered; window the hand if a player's days run into the hundreds.
export function Calendar({ go, daily, today, day, playDay }: Pick<Props, 'go'> & Omit<DailyProps, 'arm'>) {
  const days = Array.from({ length: daysBetween(daily.firstDay, today) + 1 }, (_, i) => addDays(daily.firstDay, i));
  const [up, setUp] = useState(Math.max(0, days.indexOf(day))), k = days[up] ?? today, { current, best } = streak(daily.stars, today);
  const n = starCount(daily.stars[k]), theme = THEMES[weekday(k)], isToday = k === today;
  const cards: Card[] = days.map(d => {
    const got = starCount(daily.stars[d]), paint = got ? MODE.daily : DARK, ink = { color: got ? C.ink : C.chalk };
    const note = got ? starLine(got) : d === today ? 'Today' : 'Not played';
    return {
      key: d, paint, title: dateOf(d), line: `${THEMES[weekday(d)]} · ${note}`,
      name: `${DAYS[weekday(d)]} ${+d.slice(8, 10)} ${monthName(d)}, ${got} of 3 stars${d === today ? ', today' : ''}`,
      body: <>
        <Txt style={[TYPE.small, styles.bold, ink]}>{DAYS[weekday(d)].slice(0, 3)}</Txt>
        <Txt style={[styles.date, ink]}>{+d.slice(8, 10)}</Txt>
        <Txt style={[TYPE.small, styles.bold, ink]}>{THEMES[weekday(d)]}</Txt>
        <Txt style={[TYPE.small, styles.bold, ink, { marginTop: 8, opacity: got ? 1 : 0.6 }]}>{note}</Txt>
      </>,
    };
  });
  return (
    <Shell title="Daily Table" back={() => go('home')}>
      <Stage title={theme} line={`${isToday ? 'Today, ' : ''}${dateOf(k)}. Any day can be played for its stars.`}
        cta={isToday ? { label: 'Play today', name: `Play today, ${theme}`, onPress: () => playDay(k) }
          : { label: 'Play', name: `Play ${DAYS[weekday(k)]} ${+k.slice(8, 10)} ${monthName(k)}, ${theme}`, onPress: () => playDay(k) }}>
        <Row gap={8}><Chip name={`${n} of 3 stars`}>{starLine(n)}</Chip><Chip>{`${current}-day run`}</Chip><Chip>{`Best run ${best}`}</Chip></Row>
      </Stage>
      <Hand cards={cards} up={up} pick={setUp} width={76} />
    </Shell>
  );
}

const styles = StyleSheet.create({
  bold: { fontFamily: FONT.bold },
  date: { fontFamily: FONT.display, fontSize: 32, lineHeight: 36, marginBottom: 4, ...TYPE.num },
});
