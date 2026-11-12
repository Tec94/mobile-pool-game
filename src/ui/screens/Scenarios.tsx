import { Text, View } from 'react-native';
import { profile } from '../../progress';
import { levelOf, PACKS } from '../../progress/profile';
import { isOpen, par, SCENARIOS, starCount } from '../../scenarios/scenarios';
import { Btn } from '../Btn';
import type { Props, ScenarioProps } from '../Menus';
import { Page, styles } from './legacy';

// The packs in level order. A pack opens at its level; in it a clear opens the next two tables.
export function Scenarios({ go, stars, play }: Pick<Props, 'go'> & ScenarioProps) {
  const { xp } = profile(), { level } = levelOf(xp);
  return (
    <Page title="Scenarios" back={() => go('home')}>
      <Text maxFontSizeMultiplier={1.3} style={styles.note}>Stars: clear it, clear it within par tries, clear it with the aim guide off. Each new star pays 30 coins and XP; harder tables pay more.</Text>
      {PACKS.map(([name, at], p) => (
        <View key={name} style={styles.body}>
          <Text maxFontSizeMultiplier={1.3} accessibilityRole="header" style={styles.label}>{level >= at ? name : `${name} · opens at level ${at}`}</Text>
          {level >= at && SCENARIOS.map((s, i) => {
            if (s.pack !== p) return null;
            const k = starCount(stars[s.id]), open = isOpen(i, stars, xp);
            return <Btn key={s.id} off={!open} label={`${s.title}  ${'★'.repeat(k)}${'☆'.repeat(3 - k)}\n${open ? `Par ${par(s)} · ${s.say}` : 'Clear one of the two before'}`}
              name={`${s.title}, ${k} of 3 stars, ${open ? 'open' : 'locked'}`} onPress={() => play(i)} />;
          })}
        </View>
      ))}
    </Page>
  );
}
