import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { PENCIL_AT } from '../../learn/lessons';
import { keep, profile } from '../../progress';
import { CUE_IDS, CUES, type CueId, type CueInfo, FAMILIES, specs, type Stat } from '../../progress/cues';
import { cueStats, locked, MASTERY_XP, masteryLevel, masteryOf, points, STATS, tunable, tuneDown, tuneUp, upCost, used } from '../../progress/mastery';
import { buy, FEATS, featCount, type FeatId, featName, type Profile, select } from '../../progress/profile';
import { C, CREAM, DARK, FONT } from '../../theme';
import { CueArt } from '../CuePicture';
import { Glyph } from '../Glyph';
import type { Props } from '../Menus';
import { Panel, Shell, Split, useFrame, usePanel } from '../shell';
import { Blocks, feel, Hatch, Slab, Txt, TYPE } from '../slab';

const H = 150, ART = 100, PIC = 48; // a card: the picture above ART, the name at ART..ART + 17, the foot on the last 24 pt of the face; PIC = the panel's picture, tall enough for what hangs off a cue
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

// The cue rack: cream = owned, dark = not, each with its footer (in use, stats, or what gets it). The panel shows the
// chosen cue: its trick, its stats as blocks against the top of 10 with the tuning keys on each owned stat, its mastery,
// and the one button. Advanced swaps the trick text for the real numbers; upgrading never hides behind it.
// shortcut: pass and play stays on House Cue stats, so the pick only counts once a mode with own cues lands.
export function Cues({ go, done }: Pick<Props, 'go'> & { done: string[] }) {
  const [p, setP] = useState(profile), [up, setUp] = useState(() => CUE_IDS.indexOf(p.cue)), [adv, setAdv] = useState(false);
  const { land, side, width } = useFrame(), panel = usePanel(true), left = land ? width - 2 * side - panel - 16 : width - 2 * side;
  const n = Math.max(1, Math.floor((left - 4) / (86 + 8))), cw = Math.floor((left - 8 - 8 * (n - 1)) / n); // 4 pt each side for the chosen outline
  const put = (next: Profile) => { if (next !== p) { keep(next); setP(next); } };
  const foot = (id: CueId) => {
    const c: CueInfo = CUES[id], f = c.feat as FeatId | undefined, st = cueStats(p, id);
    if (p.cue === id) return 'In use';
    if (p.owned.includes(id)) return `${st.power}·${st.spin}·${st.aim}`;
    if (c.price !== undefined) return c.price.toLocaleString('en-US');
    if (f) return `${featCount(p, f)}/${FEATS[f].count}`;
    if (c.level) return `Level ${c.level}`;
    return id === 'surveyor' ? `${done.length}/${PENCIL_AT} lessons` : 'Locked';
  };
  const id = CUE_IDS[up], c: CueInfo = CUES[id], owned = p.owned.includes(id), use = p.cue === id;
  // What gets a cue not yet owned: the first of it names the locked button.
  const f = c.feat as FeatId | undefined, need = owned ? [] : [
    c.price !== undefined && p.coins < c.price && `${(c.price - p.coins).toLocaleString('en-US')} coins short`,
    f && `${featName(f)} ${featCount(p, f)}/${FEATS[f].count}`, c.level && `Reach level ${c.level}`, c.get && (id === 'surveyor' ? `${done.length}/${PENCIL_AT} lessons` : c.get),
  ].filter((x): x is string => !!x).slice(0, 2);
  const cta = owned ? { label: use ? 'In use' : 'Use', name: use ? `${c.name}, in use` : `Use ${c.name}`, off: use, onPress: () => put(select(p, id)) }
    : c.price !== undefined ? { label: `Buy ${c.price.toLocaleString('en-US')}`, name: `Buy ${c.name} for ${c.price} coins`, off: p.coins < c.price, quiet: true,
      onPress: () => { const next = buy(p, id); if (next !== p) feel(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)); put(next); } }
    : { label: need[0] ?? 'Locked', name: `${c.name}, locked${need[0] ? `: ${need[0]}` : ''}`, off: true, onPress: () => {} };
  const rest = c.price !== undefined ? need : need.slice(1); // what the button does not already say
  const family = FAMILIES.find(x => x[0] === c.family)![1], st = cueStats(p, id), m = masteryOf(p, id);
  const barW = Math.max(60, Math.min(170, panel - 24 - 44 - 23 - 16 - (owned && tunable(id) ? 96 : 0)));
  return (
    <Shell title="Cues" back={() => go('home')} extra={<Txt style={styles.count}>{`${p.owned.length} / ${CUE_IDS.length}`}</Txt>}>
      <Split wide at={Math.floor(up / n) * (H + 13)} panel={
        <Panel head={<>
          <Txt numberOfLines={1} style={styles.head}>{c.name}</Txt>
          <Txt numberOfLines={1} style={[TYPE.small, styles.family]}>{family}</Txt>
          <View style={{ flex: 1 }} />
          <Pressable onPress={() => setAdv(!adv)} accessibilityRole="switch" accessibilityState={{ checked: adv }} accessibilityLabel="Advanced stats" hitSlop={10}
            style={[styles.adv, adv && styles.advOn]}>
            <Txt style={[styles.advText, adv && { color: C.ink }]}>Advanced</Txt>
          </Pressable>
        </>} cta={cta}
          picture={land ? undefined : pw => <CueArt id={id} w={Math.round(pw)} h={PIC} whole />}>
          <View style={{ gap: 7 }}>
            {adv ? <Advanced id={id} p={p} quip={c.quip} note={c.note} /> : (
              <Txt style={TYPE.small} accessibilityLabel={`${c.trick ? `Trick: ${c.trick}. ` : ''}${c.does} ${c.cost}`}>
                {!!c.trick && <Txt style={styles.bold}>{`${c.trick}. `}</Txt>}{c.does}<Txt style={{ opacity: 0.7 }}>{` ${c.cost}`}</Txt>
              </Txt>
            )}
            {rest.length > 0 && <Txt style={[TYPE.small, styles.bold, { color: C.gold }]}>{rest.join(' · ')}</Txt>}
            <View style={{ gap: 3 }}>
              {STATS.map(s => <StatRow key={s} id={id} s={s} p={p} put={put} value={st[s]} tuned={owned ? m[s] : 0} barW={barW} />)}
            </View>
            {owned && <Mastery id={id} p={p} />}
          </View>
        </Panel>}>
        <View style={styles.grid}>
          {CUE_IDS.map((k, i) => {
            const own = p.owned.includes(k), inUse = p.cue === k, ink = { color: own ? C.ink : C.chalk }, s2 = cueStats(p, k);
            return (
              <Slab key={k} paint={own ? CREAM : DARK} onPress={() => setUp(i)} accessibilityState={{ selected: i === up }}
                accessibilityLabel={`${CUES[k].name}${inUse ? ', in use' : own ? ', yours' : ''}${own ? `, power ${s2.power}, spin ${s2.spin}, aim ${s2.aim}` : ''}`}
                style={{ width: cw, height: H }} face={i === up && styles.chosen}>
                <View style={styles.art}><CueArt id={k} w={cw} h={ART - 4} /></View>
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

// A stat: its name, its blocks (tuning points in chalk), its value, and on an owned cue that tunes, − and + keys.
// A point moves back for free; + places a point, for free while paid ones are spare, else for the next step's coins.
function StatRow({ id, s, p, put, value, tuned, barW }: { id: CueId; s: Stat; p: Profile; put: (p: Profile) => void; value: number; tuned: number; barW: number }) {
  const name = cap(s), tunes = p.owned.includes(id) && tunable(id), cost = upCost(p, id, s), cue = CUES[id].name;
  return (
    <View style={styles.stat}>
      <View style={styles.statLine} accessible accessibilityLabel={`${name} ${value} of 10${tuned ? `, ${tuned} tuned` : ''}`}>
        <Txt style={[TYPE.body, styles.statName]}>{name}</Txt>
        <Blocks value={value} tuned={tuned} width={barW} />
        <Txt style={[TYPE.body, TYPE.num, styles.bold, { width: 23, textAlign: 'right' }]}>{value}</Txt>
      </View>
      {tunes && <View style={styles.keys}>
        <Slab paint={DARK} lip={3} radius={3} onPress={() => put(tuneDown(p, id, s))} disabled={!tuned} accessibilityLabel={`${name} down on ${cue}`} hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }} face={styles.key} style={!tuned && { opacity: 0.35 }}>
          <Txt style={styles.keyText}>−</Txt>
        </Slab>
        {locked(id, s) ? <View style={[styles.key, styles.plus]} accessible accessibilityLabel={`${name} is locked on ${cue}`}><Glyph id="lock" color={C.chalk} /></View> // the price of the trick: no plus
          : <Slab paint={cost !== null && p.coins >= cost ? CREAM : DARK} lip={3} radius={3} onPress={() => { feel(() => Haptics.selectionAsync()); put(tuneUp(p, id, s)); }} disabled={cost === null || p.coins < cost}
            accessibilityLabel={`${name} up on ${cue}${cost ? ` for ${cost} coins` : ''}`} hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }} face={[styles.key, styles.plus]} style={(cost === null || p.coins < cost) && { opacity: 0.35 }}>
            <Txt style={[styles.keyText, cost !== null && p.coins >= cost && { color: C.ink }]}>{cost ? `+${cost.toLocaleString('en-US')}` : '+'}</Txt>
          </Slab>}
      </View>}
    </View>
  );
}

// The real numbers the stats make on the table, the cue's fine print and its line.
function Advanced({ id, p, quip, note }: { id: CueId; p: Profile; quip?: string; note?: string }) {
  const sp = specs(id, cueStats(p, id));
  const facts: [string, string, string][] = [[sp.shot.toFixed(2), 'm/s', 'Top shot speed'], [sp.brk.toFixed(1), 'm/s', 'Break speed'], [sp.tipMm.toFixed(1), 'mm', 'Tip reach off centre'], [String(sp.guideCm), 'cm', 'Guide past contact']];
  return <>
    <View style={styles.facts}>
      {facts.map(([n, unit, what]) => (
        <View key={what} style={{ width: '46%' }} accessible accessibilityLabel={`${what}: ${n} ${unit}`}>
          <Txt style={styles.big}>{n}<Txt style={[TYPE.small, styles.bold]}>{` ${unit}`}</Txt></Txt>
          <Txt style={[TYPE.small, { opacity: 0.8 }]}>{what}</Txt>
        </View>
      ))}
    </View>
    {!!note && <Txt style={[TYPE.small, { opacity: 0.7 }]}>{note}</Txt>}
    {!!quip && <Txt style={[TYPE.small, { opacity: 0.7, fontStyle: 'italic' }]}>{quip}</Txt>}
  </>;
}

// A cue's mastery in one line: its level, its cue XP bar, and what tuning it has to give.
function Mastery({ id, p }: { id: CueId; p: Profile }) {
  const m = masteryOf(p, id), { level, into, need } = masteryLevel(m.xp), pts = points(m), free = pts - used(m);
  const cost = STATS.map(s => upCost(p, id, s)).find(x => x !== null);
  const next = !tunable(id) ? 'Takes no tuning' : !pts ? 'Mastery 2: first point' : !free ? (need ? 'All points placed' : 'Fully tuned') : cost === undefined ? 'No room' : `${free} point${free > 1 ? 's' : ''} to place`;
  return (
    <View style={styles.mastery} accessible accessibilityLabel={`Mastery ${level} of ${MASTERY_XP.length}, ${need ? `${into} of ${need} cue XP` : 'mastered'}. ${next}`}>
      <Txt style={[TYPE.small, styles.bold, TYPE.num]}>{`Mastery ${level}`}</Txt>
      <View style={{ flex: 1 }}><Hatch share={need ? into / need : 1} /></View>
      <Txt style={[TYPE.small, TYPE.num, free > 0 && tunable(id) && { color: C.gold, fontFamily: FONT.bold }]}>{next}</Txt>
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
  family: { opacity: 0.6, marginTop: 4 },
  count: { fontFamily: FONT.semi, fontSize: 12, color: C.chalk, opacity: 0.8, fontVariant: ['tabular-nums'] },
  adv: { height: 24, paddingHorizontal: 8, borderRadius: 3, borderWidth: 1, borderColor: C.chalk + '66', justifyContent: 'center' },
  advOn: { backgroundColor: C.chalk, borderColor: C.chalk },
  advText: { fontFamily: FONT.bold, fontSize: 11, lineHeight: 14, color: C.chalk },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 27 },
  statLine: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  statName: { width: 44, opacity: 0.8 },
  keys: { flexDirection: 'row', gap: 4, marginBottom: 3 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 24, rowGap: 6 },
  big: { fontFamily: FONT.display, fontSize: 19, lineHeight: 22, color: C.chalk, fontVariant: ['tabular-nums'] },
  mastery: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  key: { minWidth: 28, height: 24, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' }, // Btn's minWidth is the HUD's
  plus: { minWidth: 52 },
  keyText: { fontFamily: FONT.bold, fontSize: 12.5, lineHeight: 16, color: C.chalk, ...TYPE.num },
});
