import { Skia } from '@shopify/react-native-skia';
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { PENCIL_AT } from '../../learn/lessons';
import { keep, profile } from '../../progress';
import { CUE_IDS, CUES, type CueId, type CueInfo, specs } from '../../progress/cues';
import { MASTERY_XP, masteryLevel, masteryOf, points, STATS, statsOf, tunable, tuneDown, tuneUp, upCost, used } from '../../progress/mastery';
import { buy, FEATS, featCount, type FeatId, type Profile, select } from '../../progress/profile';
import { C, CREAM, DARK, FONT } from '../../theme';
import { Btn } from '../Btn';
import { drawCueArt } from '../cueArt';
import type { Props } from '../Menus';
import { type Card, Hand, Row, Shell, Stage, useFrame } from '../shell';
import { Blocks, Hatch, Slab, Txt, TYPE } from '../slab';

const W = 104, ART = 110; // the picture ends above the name (110..127), the foot is 132..156
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

// A cue's own look (cueArt.ts) in a w x h box: tip at (x, y), turned deg, len long, k thick. Drawn once per cue and
// pose on an offscreen Skia surface and shown as an image: a canvas per card would want a GL context each, and a
// browser keeps only 16.
type Pose = [w: number, h: number, x: number, y: number, deg: number, len: number, k: number];
const pics = new Map<string, string>(), DPR = 3;
function CueArt({ id, pose }: { id: CueId; pose: Pose }) {
  const [w, h, x, y, deg, len, k] = pose, key = `${id} ${pose}`;
  let uri = pics.get(key);
  if (!uri) {
    const surface = Skia.Surface.Make(Math.ceil(w * DPR), Math.ceil(h * DPR));
    if (!surface) return null;
    const c = surface.getCanvas();
    c.scale(DPR, DPR); c.translate(x, y); c.rotate(deg, 0, 0);
    drawCueArt(Skia, c, id, len, k);
    pics.set(key, uri = `data:image/png;base64,${surface.makeImageSnapshot().encodeToBase64()}`);
  }
  return <Image source={{ uri }} style={{ width: w, height: h }} />;
}
const TALL: Pose = [W, 106, W / 2, 6, 90, 100, 96 / 27], FLAT: Pose = [250, 50, 4, 40, -6, 240, 2.2]; // card; stage
const small = (size: number): Pose => [size, size, 4, size - 4, -48, size * 1.1, size / 18]; // a portrait header

// The cue rack as a hand: cream = owned, dark = not, each with its footer (in use, stats, or what gets it). The stage
// shows the raised cue as simple stat blocks against the top of 10, or with Advanced stats, the real numbers, mastery
// and tuning. shortcut: pass and play stays on House Cue stats, so the pick only counts once a mode with own cues lands.
export function Cues({ go, done }: Pick<Props, 'go'> & { done: string[] }) {
  const [p, setP] = useState(profile), [up, setUp] = useState(() => CUE_IDS.indexOf(p.cue)), [adv, setAdv] = useState(false);
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
  const cards: Card[] = CUE_IDS.map(id => {
    const c = CUES[id], owned = p.owned.includes(id), use = p.cue === id, ink = { color: owned ? C.ink : C.chalk };
    return {
      key: id, paint: owned ? CREAM : DARK, name: `${c.name}${use ? ', in use' : owned ? ', yours' : ''}`, title: c.name, line: foot(id),
      art: size => <CueArt id={id} pose={small(size)} />,
      body: <>
        <View style={styles.art}><CueArt id={id} pose={TALL} /></View>
        <Txt numberOfLines={1} style={[styles.name, ink]}>{c.name}</Txt>
        <View style={[styles.foot, { backgroundColor: use ? C.gold : owned ? CREAM[1] : DARK[1] }]}>
          <Txt numberOfLines={1} style={[TYPE.small, styles.bold, TYPE.num, { color: owned ? C.ink : C.chalk }]}>{foot(id)}</Txt>
        </View>
      </>,
    };
  });
  const id = CUE_IDS[up], c: CueInfo = CUES[id], owned = p.owned.includes(id), use = p.cue === id;
  const cta = owned ? { label: use ? 'In use' : 'Use', name: use ? `${c.name}, in use` : `Use ${c.name}`, off: use, onPress: () => put(select(p, id)) }
    : c.price !== undefined ? { label: `Buy ${c.price.toLocaleString('en-US')}`, name: `Buy ${c.name} for ${c.price} coins`, off: p.coins < c.price, onPress: () => put(buy(p, id)) }
    : { label: 'Locked', name: `${c.name}, locked`, off: true, onPress: () => {} };
  // What gets a cue not yet owned goes on the stage's line.
  const f = c.feat as FeatId | undefined, need = owned ? [use ? 'In use' : 'Yours'] : [
    c.price !== undefined && `${c.price.toLocaleString('en-US')} coins`, c.price !== undefined && p.coins < c.price && `${(c.price - p.coins).toLocaleString('en-US')} coins short`,
    f && `${FEATS[f].name}: ${featCount(p, f)} of ${FEATS[f].count}`, c.level && `Reach level ${c.level}`, id === 'pencil' && `${done.length} of ${PENCIL_AT} lessons passed`,
  ].filter((x): x is string => !!x);
  return (
    <Shell title="Cues" back={() => go('home')}>
      <Stage title={c.name} line={`${need.join(' · ')} · ${c.perk ?? 'No perk'}`} cta={cta}
        link={adv ? { label: '‹ Simple stats', name: 'Simple stats', onPress: () => setAdv(false) } : { label: 'Advanced stats ›', name: 'Advanced stats', onPress: () => setAdv(true) }}>
        {adv ? <Advanced id={id} p={p} put={put} /> : <Simple id={id} p={p} />}
      </Stage>
      <Hand cards={cards} up={up} pick={setUp} width={W} />
    </Shell>
  );
}

// Each stat as 10 blocks: the better the cue, the more are filled, against the top of 10.
function Simple({ id, p }: { id: CueId; p: Profile }) {
  const { land } = useFrame(), st = statsOf(id, masteryOf(p, id));
  return <>
    <View style={styles.simple}>
      <View style={{ gap: 6 }}>
        {STATS.map(s => (
          <View key={s} style={styles.stat} accessible accessibilityLabel={`${s} ${st[s]} of 10`}>
            <Txt style={[TYPE.body, styles.statName]}>{cap(s)}</Txt>
            <Blocks value={st[s]} width={200} />
            <Txt style={[TYPE.body, TYPE.num, styles.bold]}>{st[s]}</Txt>
          </View>
        ))}
      </View>
      {land && <CueArt id={id} pose={FLAT} />}
    </View>
    {!land && <Txt style={[TYPE.small, { opacity: 0.7 }]}>Pass and play is a matched game: both players use House Cue stats.</Txt>}
  </>;
}

// The real numbers the stats make on the table, then the cue's mastery and its tuning.
function Advanced({ id, p, put }: { id: CueId; p: Profile; put: (p: Profile) => void }) {
  const { land } = useFrame(), sp = specs(id, statsOf(id, masteryOf(p, id)));
  const facts: [string, string, string][] = [[sp.shot.toFixed(2), 'm/s', 'Top shot speed'], [sp.brk.toFixed(1), 'm/s', 'Break speed'], [sp.tipMm.toFixed(1), 'mm', 'Tip reach off centre'], [String(sp.guideCm), 'cm', 'Guide past contact']];
  return <>
    <View style={[styles.facts, land && { marginRight: 186 }]}>
      {facts.map(([n, unit, what]) => (
        <Slab key={what} paint={DARK} lip={4} style={styles.fact} face={styles.factFace}>
          <Txt style={styles.big}>{n}<Txt style={[TYPE.small, styles.bold]}>{` ${unit}`}</Txt></Txt>
          <Txt style={[TYPE.small, { opacity: 0.8 }]}>{what}</Txt>
        </Slab>
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
  const cost = STATS.map(s => upCost(p, id, s)).find(x => x !== null);
  const next = !tunable(id) ? 'Cannot be tuned' : !pts ? 'Mastery 2 gives a tuning point' : !free ? 'Every point in use' : cost === undefined ? 'No stat has room for more' : cost ? `Next point: ${cost} coins` : `${free} point${free > 1 ? 's' : ''} to place`;
  return (
    <Row gap={14}>
      <View style={styles.mastery}>
        <Txt style={[TYPE.small, TYPE.num]}><Txt style={styles.bold}>{head}</Txt>{`  ${xp}`}</Txt>
        <Hatch share={need ? into / need : 1} style={{ width: 170 }} />
        <Txt style={[TYPE.small, { opacity: 0.8 }]}>{next}</Txt>
      </View>
      {tunable(id) && pts > 0 && <View style={styles.tunes}>{STATS.map(s => {
        const name = cap(s), cost = upCost(p, id, s);
        return <View key={s} style={styles.tune}>
          <Btn label="−" name={`${name} down on ${CUES[id].name}`} off={!m[s]} onPress={() => put(tuneDown(p, id, s))} />
          <Txt style={[TYPE.body, TYPE.num, styles.bold, styles.tuned]}>{`${name} ${m[s] ? `+${m[s]}` : '0'}`}</Txt>
          <Btn label="+" name={`${name} up on ${CUES[id].name}${cost ? ` for ${cost} coins` : ''}`} off={cost === null || p.coins < cost} onPress={() => put(tuneUp(p, id, s))} />
        </View>;
      })}</View>}
    </Row>
  );
}

const styles = StyleSheet.create({
  bold: { fontFamily: FONT.bold },
  art: { position: 'absolute', left: 0, top: 4 },
  name: { ...TYPE.name, fontSize: 14, textAlign: 'center', position: 'absolute', left: 3, right: 3, top: ART },
  foot: { position: 'absolute', left: 0, right: 0, top: ART + 22, height: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  simple: { flexDirection: 'row', alignItems: 'center', gap: 28 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statName: { width: 44, opacity: 0.8 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fact: { flexGrow: 1, flexBasis: 120 },
  factFace: { paddingHorizontal: 10, paddingVertical: 4 },
  big: { fontFamily: FONT.display, fontSize: 19, lineHeight: 22, color: C.chalk, fontVariant: ['tabular-nums'] },
  mastery: { gap: 3 },
  tunes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, maxWidth: '100%' }, // no shrink: on a narrow screen it takes lines of its own
  tune: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tuned: { minWidth: 64, textAlign: 'center' },
});
