import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { profile } from '../../progress';
import { levelOf, PACKS } from '../../progress/profile';
import { isOpen, SCENARIOS, starCount, totalStars } from '../../scenarios/scenarios';
import { C, CREAM, DARK, FONT, MODE } from '../../theme';
import type { Props, ScenarioProps } from '../Menus';
import { MiniTable, tableOf } from '../MiniTable';
import { Shell, Tile, useFrame } from '../shell';
import { Slab, Txt, TYPE } from '../slab';

const starLine = (k: number) => `${'★'.repeat(k)}${'☆'.repeat(3 - k)}`;
const Lock = ({ color }: { color: string }) => (
  <View style={{ alignItems: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <View style={[styles.shackle, { borderColor: color }]} /><View style={[styles.lockBody, { backgroundColor: color }]} />
  </View>
);
let kept: number | undefined; // the chosen pack outlives the screen, so a table returns to it

// The packs as tabs and the chosen pack's tables as a grid of drawn layouts: a tap on an open table plays it.
// In a pack a clear opens the next two tables; a pack opens at a level.
export function Scenarios({ go, stars, play }: Pick<Props, 'go'> & ScenarioProps) {
  const { land, side, pad, width } = useFrame(), { xp } = profile(), { level } = levelOf(xp), open = (i: number) => isOpen(i, stars, xp);
  // The first open table not yet cleared, else the first open one short of three stars.
  const at = SCENARIOS.map((_, i) => i).filter(open);
  const next = at.find(i => !((stars[SCENARIOS[i].id] ?? 0) & 1)) ?? at.find(i => starCount(stars[SCENARIOS[i].id]) < 3);
  const [pack, setPack] = useState(() => kept ?? SCENARIOS[next ?? 0].pack), pick = (p: number) => { kept = p; setPack(p); };
  const got = (p: number) => SCENARIOS.reduce((n, x) => n + (x.pack === p ? starCount(stars[x.id]) : 0), 0);
  const size = (p: number) => SCENARIOS.filter(x => x.pack === p).length, total = totalStars(stars);
  const cols = land ? 6 : 3, tw = (width - 2 * side - 8 * (cols - 1)) / cols, packOpen = level >= PACKS[pack][1];
  const tables = SCENARIOS.flatMap((x, i) => (x.pack === pack ? [i] : []));
  return (
    <Shell title="Scenarios" back={() => go('home')} extra={<Txt style={styles.total}>{`★ ${total} / ${3 * SCENARIOS.length}`}</Txt>}>
      <ScrollView contentContainerStyle={{ paddingTop: 12, paddingBottom: Math.max(pad.bottom, 16), gap: 12 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: side, gap: 5 }}
          accessibilityRole="radiogroup" accessibilityLabel="Packs">
          {PACKS.map(([name, lv], p) => {
            const on = p === pack, ok = level >= lv, ink = { color: C.chalk };
            return (
              <Slab key={name} paint={on ? MODE.scenarios : [C.keyOff, 'transparent']} lip={on ? 3 : 0} radius={3} onPress={() => pick(p)} hitSlop={{ top: 5, bottom: 5 }}
                accessibilityRole="radio" accessibilityLabel={ok ? `${name}, ${got(p)} of ${3 * size(p)} stars` : `${name}, opens at level ${lv}`} accessibilityState={{ checked: on }} aria-checked={on}
                style={[{ marginBottom: on ? 0 : 3 }, !ok && { opacity: 0.5 }]} face={styles.tab}>
                <Txt style={[styles.tabName, ink]}>{name}</Txt>
                {ok ? <Txt style={[styles.tabSmall, ink]}>{`★ ${got(p)}/${3 * size(p)}`}</Txt> : <><Lock color={C.chalk} /><Txt style={[styles.tabSmall, ink]}>{`Lv ${lv}`}</Txt></>}
              </Slab>
            );
          })}
        </ScrollView>
        <View style={[styles.grid, { paddingHorizontal: side }]}>
          {tables.map((i, j) => {
            const x = SCENARIOS[i], ok = packOpen && open(i), k = starCount(stars[x.id]), paint = i === next ? CREAM : DARK, ink = { color: i === next ? C.ink : C.chalk };
            return (
              <Tile key={x.id} paint={paint} name={`${x.title}, ${k} of 3 stars${ok ? '' : ', locked'}`} onPress={ok ? () => play(i) : undefined}
                style={[{ width: tw }, !ok && { opacity: 0.45 }]} face={styles.tile}>
                <MiniTable width={tw - 14} {...tableOf(x)} />
                <View style={styles.foot}>
                  <Txt style={[styles.num, ink]}>{j + 1}</Txt>
                  {ok ? <Txt style={[styles.stars, { color: i === next ? C.ink : C.gold }]}>{starLine(k)}</Txt>
                    : packOpen ? <Lock color={C.chalk} /> : <Txt style={[styles.tabSmall, ink]}>{`Lv ${PACKS[pack][1]}`}</Txt>}
                </View>
              </Tile>
            );
          })}
        </View>
      </ScrollView>
    </Shell>
  );
}

const styles = StyleSheet.create({
  total: { fontFamily: FONT.bold, fontSize: 13, color: C.gold, ...TYPE.num },
  tab: { height: 34, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  tabName: { fontFamily: FONT.bold, fontSize: 13, lineHeight: 16 },
  tabSmall: { fontFamily: FONT.bold, fontSize: 11, lineHeight: 14, opacity: 0.75, ...TYPE.num },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 13 },
  tile: { paddingVertical: 7, paddingHorizontal: 7 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  num: { fontFamily: FONT.display, fontSize: 17, lineHeight: 20, ...TYPE.num },
  stars: { fontFamily: FONT.bold, fontSize: 13, lineHeight: 16 },
  shackle: { width: 7, height: 5, borderWidth: 1.5, borderBottomWidth: 0, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  lockBody: { width: 10, height: 7, borderRadius: 1.5 },
});
