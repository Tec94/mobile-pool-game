import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { PENCIL_AT } from '../../learn/lessons';
import { keep, profile } from '../../progress';
import { CUE_IDS, CUES, type CueId, type CueInfo, specs } from '../../progress/cues';
import { MASTERY_XP, masteryLevel, masteryOf, points, STATS, statsOf, tunable, tuneDown, tuneUp, upCost, used } from '../../progress/mastery';
import { buy, FEATS, featCount, type FeatId, type Profile, select } from '../../progress/profile';
import { C, CREAM, DARK, FONT } from '../../theme';
import { CueArt } from '../CuePicture';
import type { Props } from '../Menus';
import { Panel, Shell, Split, useFrame, usePanel } from '../shell';
import { Blocks, feel, Hatch, Slab, Txt, TYPE } from '../slab';

const H = 150, ART = 100; // a card: the picture above ART, the name at ART..ART + 17, the foot on the last 24 pt of the face
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

// The cue rack: cream = owned, dark = not, each with its footer (in use, stats, or what gets it). The panel shows the
// chosen cue as simple stat blocks against the top of 10, or with Advanced, the real numbers, mastery and tuning.
// shortcut: pass and play stays on House Cue stats, so the pick only counts once a mode with own cues lands.
export function Cues({ go, done }: Pick<Props, 'go'> & { done: string[] }) {
  const [p, setP] = useState(profile), [up, setUp] = useState(() => CUE_IDS.indexOf(p.cue)), [adv, setAdv] = useState(false);
  const { land, side, width } = useFrame(), panel = usePanel(), left = land ? width - 2 * side - panel - 16 : width - 2 * side;
  const n = Math.max(1, Math.floor((left - 4) / (86 + 8))), cw = Math.floor(Math.min(104, (left - 8 - 8 * (n - 1)) / n)); // 4 pt each side for the chosen outline
  const put = (next: Profile) => { if (next !== p) { keep(next); setP(next); } };
  const foot = (id: CueId) => {
    const c: CueInfo = CUES[id], f = c.feat as FeatId | undefined, st = statsOf(id, masteryOf(p, id));
    if (p.cue === id) return 'In use';
    if (p.owned.includes(id)) return `${st.power}·${st.spin}·${st.aim}`;
    if (c.price !== undefined) return c.price.toLocaleString('en-US');
    if (f) return `${featCount(p, f)}/${FEATS[f].count}`;
    if (c.level) return `Level ${c.level}`;
    return id === 'pencil' ? `${done.length}/${PENCIL_AT} lessons` : 'Locked';
  };
  const id = CUE_IDS[up], c: CueInfo = CUES[id], owned = p.owned.includes(id), use = p.cue === id, w = panel - 24;
  const cta = owned ? { label: use ? 'In use' : 'Use', name: use ? `${c.name}, in use` : `Use ${c.name}`, off: use, onPress: () => put(select(p, id)) }
    : c.price !== undefined ? { label: `Buy ${c.price.toLocaleString('en-US')}`, name: `Buy ${c.name} for ${c.price} coins`, off: p.coins < c.price, quiet: true,
      onPress: () => { const next = buy(p, id); if (next !== p) feel(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)); put(next); } }
    : { label: 'Locked', name: `${c.name}, locked`, off: true, onPress: () => {} };
  // What gets a cue not yet owned.
  const f = c.feat as FeatId | undefined, need = owned ? [] : [
    c.price !== undefined && `${c.price.toLocaleString('en-US')} coins`, c.price !== undefined && p.coins < c.price && `${(c.price - p.coins).toLocaleString('en-US')} coins short`,
    f && `${FEATS[f].name}: ${featCount(p, f)} of ${FEATS[f].count}`, c.level && `Reach level ${c.level}`, id === 'pencil' && `${done.length} of ${PENCIL_AT} lessons passed`,
  ].filter((x): x is string => !!x).slice(0, 2);
  const line = [...need, c.perk].filter(Boolean).join(' · '), st = statsOf(id, masteryOf(p, id));
  return (
    <Shell title="Cues" back={() => go('home')} extra={<Txt style={styles.count}>{`${p.owned.length} / ${CUE_IDS.length}`}</Txt>}>
      <Split at={Math.floor(up / n) * (H + 13)} panel={
        <Panel head={<Txt numberOfLines={1} style={styles.head}>{c.name}</Txt>} cta={cta}
          picture={pw => <CueArt id={id} pose={[Math.round(pw), 24, 2, 12, 0, Math.round(pw) - 4, 3]} />}>
          <View style={{ gap: 8 }}>
            {!!line && <Txt style={[TYPE.small, { opacity: 0.8 }]}>{line}</Txt>}
            {adv ? <Advanced id={id} p={p} put={put} /> : STATS.map(s => (
              <View key={s} style={styles.stat} accessible accessibilityLabel={`${s} ${st[s]} of 10`}>
                <Txt style={[TYPE.body, styles.statName]}>{cap(s)}</Txt>
                <Blocks value={st[s]} width={Math.min(200, w - 44 - 23 - 16)} />
                <Txt style={[TYPE.body, TYPE.num, styles.bold, { width: 23 }]}>{st[s]}</Txt>
              </View>
            ))}
            <Pressable onPress={() => setAdv(!adv)} accessibilityRole="button" accessibilityLabel={adv ? 'Simple stats' : 'Advanced stats'} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} style={styles.link}>
              <Txt style={styles.linkText}>{adv ? '‹ Simple' : 'Advanced ›'}</Txt>
            </Pressable>
          </View>
        </Panel>}>
        <View style={styles.grid}>
          {CUE_IDS.map((k, i) => {
            const own = p.owned.includes(k), inUse = p.cue === k, ink = { color: own ? C.ink : C.chalk }, s2 = statsOf(k, masteryOf(p, k));
            return (
              <Slab key={k} paint={own ? CREAM : DARK} onPress={() => setUp(i)} accessibilityState={{ selected: i === up }}
                accessibilityLabel={`${CUES[k].name}${inUse ? ', in use' : own ? ', yours' : ''}${own ? `, power ${s2.power}, spin ${s2.spin}, aim ${s2.aim}` : ''}`}
                style={{ width: cw, height: H }} face={i === up && styles.chosen}>
                <View style={styles.art}><CueArt id={k} pose={[cw, ART - 4, cw / 2, 6, 90, ART - 12, 96 / 27]} /></View>
                <Txt numberOfLines={1} style={[styles.name, ink]}>{CUES[k].name}</Txt>
                <View style={[styles.foot, { backgroundColor: inUse ? C.gold : own ? CREAM[1] : DARK[1] }]}>
                  <Txt numberOfLines={1} style={[TYPE.small, styles.bold, TYPE.num, ink]}>{foot(k)}</Txt>
                </View>
              </Slab>
            );
          })}
        </View>
      </Split>
    </Shell>
  );
}

// The real numbers the stats make on the table, then the cue's mastery and its tuning.
function Advanced({ id, p, put }: { id: CueId; p: Profile; put: (p: Profile) => void }) {
  const sp = specs(id, statsOf(id, masteryOf(p, id)));
  const facts: [string, string, string][] = [[sp.shot.toFixed(2), 'm/s', 'Top shot speed'], [sp.brk.toFixed(1), 'm/s', 'Break speed'], [sp.tipMm.toFixed(1), 'mm', 'Tip reach off centre'], [String(sp.guideCm), 'cm', 'Guide past contact']];
  return <>
    <View style={styles.facts}>
      {facts.map(([n, unit, what]) => (
        <View key={what} style={{ width: '46%' }}>
          <Txt style={styles.big}>{n}<Txt style={[TYPE.small, styles.bold]}>{` ${unit}`}</Txt></Txt>
          <Txt style={[TYPE.small, { opacity: 0.8 }]}>{what}</Txt>
        </View>
      ))}
    </View>
    {p.owned.includes(id) && <Mastery id={id} p={p} put={put} />}
  </>;
}

// A cue's mastery: its level and cue XP, and once it has points, a - and + for each stat. The numbers above show the
// tuned cue. Points move for free; a point past the paid ones costs the next step.
function Mastery({ id, p, put }: { id: CueId; p: Profile; put: (p: Profile) => void }) {
  const m = masteryOf(p, id), { level, into, need } = masteryLevel(m.xp), pts = points(m), free = pts - used(m);
  const head = `Mastery ${level} of ${MASTERY_XP.length}`, xp = need ? `${into} / ${need} cue XP` : 'Mastered';
  const cost = STATS.map(s => upCost(p, id, s)).find(x => x !== null), tunes = tunable(id) && pts > 0, priced = tunes && !!cost;
  const next = !tunable(id) ? 'Cannot be tuned' : !pts ? 'Mastery 2 gives a tuning point' : !free ? 'Every point in use' : cost === undefined ? 'No stat has room for more' : `${free} point${free > 1 ? 's' : ''} to place`;
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.mastery}>
        <Txt style={[TYPE.small, TYPE.num]}><Txt style={styles.bold}>{head}</Txt>{priced ? '\n' : '  '}{xp}</Txt>
        <Hatch share={need ? into / need : 1} />
        {!priced && <Txt style={[TYPE.small, { opacity: 0.8 }]}>{next}</Txt>}
      </View>
      {tunes && <View style={styles.tunes}>{STATS.map(s => {
        const name = cap(s), cost = upCost(p, id, s);
        return <View key={s} style={styles.tune}>
          <Slab paint={DARK} lip={3} radius={3} onPress={() => put(tuneDown(p, id, s))} disabled={!m[s]} accessibilityLabel={`${name} down on ${CUES[id].name}`} hitSlop={5} face={styles.key}>
            <Txt style={styles.keyText}>−</Txt>
          </Slab>
          <Txt style={[TYPE.body, TYPE.num, styles.bold, styles.tuned]}>{`${name} ${m[s] ? `+${m[s]}` : '0'}`}</Txt>
          <Slab paint={DARK} lip={3} radius={3} onPress={() => put(tuneUp(p, id, s))} disabled={cost === null || p.coins < cost} accessibilityLabel={`${name} up on ${CUES[id].name}${cost ? ` for ${cost} coins` : ''}`} hitSlop={5} face={styles.key}>
            <Txt style={styles.keyText}>{cost ? `+ ${cost.toLocaleString('en-US')}` : '+'}</Txt>
          </Slab>
        </View>;
      })}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  bold: { fontFamily: FONT.bold },
  art: { position: 'absolute', left: 0, top: 0 },
  name: { ...TYPE.name, fontSize: 13, textAlign: 'center', position: 'absolute', left: 3, right: 3, top: ART },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 13, paddingTop: 4, paddingLeft: 4 },
  chosen: { outlineColor: C.chalk, outlineWidth: 3, outlineOffset: 2, outlineStyle: 'solid' },
  head: { fontFamily: FONT.display, fontSize: 22, lineHeight: 26, color: C.chalk, flexShrink: 1 },
  count: { fontFamily: FONT.semi, fontSize: 12, color: C.chalk, opacity: 0.8, fontVariant: ['tabular-nums'] },
  link: { height: 28, justifyContent: 'center', alignSelf: 'flex-start' },
  linkText: { fontFamily: FONT.bold, fontSize: 12, lineHeight: 16, color: C.chalk, textDecorationLine: 'underline', opacity: 0.9 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statName: { width: 44, opacity: 0.8 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 24, rowGap: 6 },
  big: { fontFamily: FONT.display, fontSize: 19, lineHeight: 22, color: C.chalk, fontVariant: ['tabular-nums'] },
  mastery: { gap: 3 },
  tunes: { gap: 8 },
  tune: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tuned: { minWidth: 56, textAlign: 'center' },
  key: { minWidth: 34, height: 34, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' }, // Btn's minWidth is the HUD's
  keyText: { fontFamily: FONT.bold, fontSize: 13, lineHeight: 16, color: C.chalk, ...TYPE.num },
});
