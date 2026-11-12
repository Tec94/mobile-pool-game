import { useState } from 'react';
import { Text, View } from 'react-native';
import { keep, profile } from '../../progress';
import { CUE_IDS, CUES, type CueId, type CueInfo, specLine, specs } from '../../progress/cues';
import { masteryLevel, masteryOf, points, STATS, statsOf, tunable, tuneDown, tuneUp, upCost, used } from '../../progress/mastery';
import { buy, FEATS, featCount, type FeatId, levelOf, type Profile, select } from '../../progress/profile';
import { Btn } from '../Btn';
import type { Props } from '../Menus';
import { Page, styles } from './legacy';

// The cue rack: level, XP and coins, then each cue with its stats, perk and how to get it. Owned cues can be picked.
// shortcut: pass and play stays on House Cue stats, so the pick only counts once a mode with own cues lands.
export function Cues({ go }: Pick<Props, 'go'>) {
  const [p, setP] = useState(profile), { level, into, need } = levelOf(p.xp);
  const put = (next: Profile) => { if (next !== p) { keep(next); setP(next); } };
  return (
    <Page title="Cues" back={() => go('home')}>
      <Text maxFontSizeMultiplier={1.3} style={styles.label}>{`Level ${level} · ${need ? `${need - into} XP to level ${level + 1}` : 'top level'} · ${p.coins} coins`}</Text>
      <Text maxFontSizeMultiplier={1.3} style={styles.note}>Pass and play is a matched game: both players use House Cue stats.</Text>
      {/* The Use buttons are radios: one group for the cue in use. */}
      <View style={styles.body} accessibilityRole="radiogroup" accessibilityLabel="Cue in use">
        {CUE_IDS.map(id => <CueRow key={id} id={id} p={p} put={put} />)}
      </View>
    </Page>
  );
}

function CueRow({ id, p, put }: { id: CueId; p: Profile; put: (p: Profile) => void }) {
  const c: CueInfo = CUES[id], owned = p.owned.includes(id), f = c.feat as FeatId | undefined, feat = f && FEATS[f], done = f ? featCount(p, f) : 0;
  const m = masteryOf(p, id), stats = statsOf(id, m);
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text maxFontSizeMultiplier={1.3} style={styles.label}>{c.name}</Text>
        <Text maxFontSizeMultiplier={1.3} style={styles.note}>{specLine(specs(id, stats))}</Text>
        {owned && <Mastery id={id} p={p} put={put} />}
        {c.perk && <Text maxFontSizeMultiplier={1.3} style={styles.note}>{c.perk}</Text>}
        {!owned && feat && <>
          <Text maxFontSizeMultiplier={1.3} style={styles.note}>{`${feat.name} ${done}/${feat.count}`}</Text>
          <View style={styles.bar}><View style={[styles.fill, { width: `${100 * done / feat.count}%` }]} /></View>
        </>}
        {!owned && c.level && <Text maxFontSizeMultiplier={1.3} style={styles.note}>{`Reach level ${c.level}`}</Text>}
        {!owned && c.get && <Text maxFontSizeMultiplier={1.3} style={styles.note}>{c.get}</Text>}
      </View>
      {owned ? <Btn label={p.cue === id ? 'In use' : 'Use'} name={`Use ${c.name}`} on={p.cue === id} onPress={() => put(select(p, id))} />
        : c.price !== undefined && <Btn label={`${c.price} coins`} name={`Buy ${c.name} for ${c.price} coins`} off={p.coins < c.price} onPress={() => put(buy(p, id))} />}
    </View>
  );
}

// A cue's mastery: its level and cue XP, and once it has points, a - and + for each stat. The spec lines above show
// the tuned numbers. Points move for free; a point past the paid ones costs the next step.
function Mastery({ id, p, put }: { id: CueId; p: Profile; put: (p: Profile) => void }) {
  const m = masteryOf(p, id), { level, into, need } = masteryLevel(m.xp), pts = points(m), free = pts - used(m);
  const head = `Mastery ${level}${need ? ` · ${need - into} cue XP to ${level + 1}` : ' · mastered'}`;
  if (!tunable(id)) return <Text maxFontSizeMultiplier={1.3} style={styles.note}>{`${head} · cannot be tuned`}</Text>;
  const cost = STATS.map(s => upCost(p, id, s)).find(x => x !== null);
  const next = !pts ? 'Mastery 2 gives a tuning point' : !free ? 'Every point in use' : cost === undefined ? 'No stat has room for more' : cost ? `Next point: ${cost} coins` : `${free} point${free > 1 ? 's' : ''} to place`;
  return <>
    <Text maxFontSizeMultiplier={1.3} style={styles.note}>{`${head} · ${next}`}</Text>
    {pts > 0 && <View style={[styles.seg, styles.wrap]}>
      {STATS.map(s => {
        const name = s[0].toUpperCase() + s.slice(1), up = upCost(p, id, s);
        return <View key={s} style={styles.tune}>
          <Btn label="−" name={`${name} down on ${CUES[id].name}`} off={!m[s]} onPress={() => put(tuneDown(p, id, s))} />
          <Text maxFontSizeMultiplier={1.3} style={[styles.note, styles.stat]}>{`${name} ${m[s] ? `+${m[s]}` : '0'}`}</Text>
          <Btn label="+" name={`${name} up on ${CUES[id].name}${up ? ` for ${up} coins` : ''}`} off={up === null || p.coins < up} onPress={() => put(tuneUp(p, id, s))} />
        </View>;
      })}
    </View>}
  </>;
}
