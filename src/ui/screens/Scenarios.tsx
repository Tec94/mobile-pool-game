import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { profile } from '../../progress';
import { levelOf, PACKS } from '../../progress/profile';
import { isOpen, par, SCENARIOS, STAR_COINS, starCount } from '../../scenarios/scenarios';
import { C, CREAM, DARK, FONT, MODE } from '../../theme';
import type { Props, ScenarioProps } from '../Menus';
import { type Card, Hand, Shell, Stage } from '../shell';
import { Slab, Txt, TYPE } from '../slab';

const starLine = (k: number) => `${'★'.repeat(k)}${'☆'.repeat(3 - k)}`;
let kept: number | undefined; // the chosen table outlives the screen, so a table returns to it

// The packs in level order as a hand: red = open, dark = opens at a level. The stage holds the raised pack's tables
// as number keys; in a pack a clear opens the next two tables.
export function Scenarios({ go, stars, play }: Pick<Props, 'go'> & ScenarioProps) {
  const { xp } = profile(), { level } = levelOf(xp), open = (i: number) => isOpen(i, stars, xp);
  // The first open table not yet cleared, else the first open one short of three stars.
  const next = () => {
    const at = SCENARIOS.map((_, i) => i).filter(open);
    return at.find(i => !((stars[SCENARIOS[i].id] ?? 0) & 1)) ?? at.find(i => starCount(stars[SCENARIOS[i].id]) < 3) ?? 0;
  };
  const [t, setT] = useState(() => kept ?? next()), choose = (i: number) => { kept = i; setT(i); };
  const s = SCENARIOS[t], tables = SCENARIOS.flatMap((x, i) => (x.pack === s.pack ? [i] : []));
  const got = (p: number) => SCENARIOS.reduce((n, x) => n + (x.pack === p ? starCount(stars[x.id]) : 0), 0);
  // A pack opens on its first open table not yet cleared, else its first.
  const pick = (p: number) => {
    const at = SCENARIOS.flatMap((x, i) => (x.pack === p ? [i] : []));
    choose(at.find(i => open(i) && !((stars[SCENARIOS[i].id] ?? 0) & 1)) ?? at[0]);
  };
  const cards: Card[] = PACKS.map(([name, at], p) => level >= at
    ? { key: name, paint: MODE.scenarios, name, title: name, line: `${got(p)} / ${3 * SCENARIOS.filter(x => x.pack === p).length} ★` }
    : { key: name, paint: DARK, name: `${name}, opens at level ${at}`, title: name, line: `Level ${at}` });
  const [pack, at] = PACKS[s.pack], packOpen = level >= at, n = tables.indexOf(t) + 1, k = starCount(stars[s.id]);
  return (
    <Shell title="Scenarios" back={() => go('home')}>
      <Stage title={pack} line={packOpen ? `${got(s.pack)} of ${3 * tables.length} stars. A clear opens the next two. A new star pays ${STAR_COINS} coins.` : `Opens at level ${at}.`}
        cta={{ label: `Play ${n}`, name: `Play ${s.title}`, onPress: () => play(t), off: !open(t) }}>
        {packOpen && <>
          <View style={styles.keys} accessibilityRole="radiogroup" accessibilityLabel={`${pack} tables`}>
            {tables.map((i, j) => {
              const x = SCENARIOS[i], on = i === t, ok = open(i), got = starCount(stars[x.id]);
              return (
                <Slab key={x.id} paint={on ? CREAM : [C.keyOff, 'transparent']} lip={on ? 3 : 0} radius={3} onPress={() => choose(i)} disabled={!ok} hitSlop={2}
                  accessibilityRole="radio" accessibilityLabel={`${x.title}, ${got} of 3 stars, ${ok ? 'open' : 'locked'}`} accessibilityState={{ checked: on, disabled: !ok }} aria-checked={on}
                  style={{ marginBottom: on ? 0 : 3 }} face={styles.key}>
                  <Txt style={[styles.num, on && { color: C.ink }]}>{j + 1}</Txt>
                  <Txt style={[styles.stars, on && { color: C.ink }]}>{starLine(got)}</Txt>
                </Slab>
              );
            })}
          </View>
          <Txt style={styles.say}>{`${s.title} · par ${par(s)} · ${open(t) ? s.say : 'Clear one of the two before'}${k ? ` · ${starLine(k)}` : ''}`}</Txt>
        </>}
      </Stage>
      <Hand cards={cards} up={s.pack} pick={pick} width={88} height={190} />
    </Shell>
  );
}

const styles = StyleSheet.create({
  keys: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  key: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  num: { fontFamily: FONT.display, fontSize: 16, lineHeight: 18, color: C.chalk, ...TYPE.num },
  stars: { fontFamily: FONT.bold, fontSize: 8, lineHeight: 10, color: C.chalk, opacity: 0.85 },
  say: { ...TYPE.body, opacity: 0.82 },
});
