// The screens around a match, one file each in src/ui/screens: home (which sets up quick match and pass and play),
// settings, cues, learn, scenarios and the Daily Table. This file only routes.
import type { Daily } from '../daily/daily';
import type { Stars } from '../scenarios/scenarios';
import type { Settings } from '../settings/settings';
import { Cues } from './screens/Cues';
import { Calendar } from './screens/Daily';
import { Home } from './screens/Home';
import { Learn } from './screens/Learn';
import { Scenarios } from './screens/Scenarios';
import { SettingsPage } from './screens/SettingsPage';
import { ChalkCount } from './shell';

export type Screen = 'home' | 'settings' | 'cues' | 'learn' | 'scenarios' | 'calendar';
// match = pass and play, ai = quick match against the AI
export interface Props { set: Settings; change: (s: Partial<Settings>) => void; go: (to: Screen | 'match' | 'ai') => void }
export interface LearnProps { done: string[]; learn: (lesson: number) => void }
export interface ScenarioProps { stars: Stars; play: (scenario: number) => void }
export interface DailyProps { daily: Daily; today: string; day: string; playDay: (day: string) => void; arm: (on: boolean) => void }


export function Menus(p: Props & LearnProps & ScenarioProps & DailyProps & { screen: Screen }) {
  return <ChalkCount.Provider value={p.daily.chalk.charges}>{page(p)}</ChalkCount.Provider>;
}

function page({ screen, set, change, go, done, learn, stars, play, daily, today, day, playDay, arm }: Props & LearnProps & ScenarioProps & DailyProps & { screen: Screen }) {
  if (screen === 'settings') return <SettingsPage set={set} change={change} go={go} />;
  if (screen === 'cues') return <Cues go={go} done={done} />;
  if (screen === 'learn') return <Learn go={go} done={done} learn={learn} />;
  if (screen === 'scenarios') return <Scenarios go={go} stars={stars} play={play} />;
  if (screen === 'calendar') return <Calendar go={go} daily={daily} today={today} day={day} playDay={playDay} />;
  return <Home set={set} change={change} go={go} done={done} learn={learn} stars={stars} play={play} daily={daily} today={today} playDay={playDay} arm={arm} />;
}
