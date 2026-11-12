import { CLOTHS } from '../../theme';
import type { Settings } from '../../settings/settings';
import type { Props } from '../Menus';
import { Page, Row } from './legacy';

export function SettingsPage({ set, change, go }: Props) {
  return (
    <Page title="Settings" back={() => go('home')}>
      <Row label="Shot calling" note="8-ball. WPA: tap the pocket first for a bank or a combination. 8 only: every pot counts" value={set.callAll} pick={callAll => change({ callAll })} options={[['WPA', true], ['8 only', false]]} />
      <Row label="Table felt" value={set.cloth} pick={cloth => change({ cloth })} options={CLOTHS.map((c, i) => [c.name, i])} />
      <Row<Settings['orient']> label="Orientation" note="Auto follows the phone, even mid-match" value={set.orient} pick={orient => change({ orient })} options={[['Auto', 0], ['Portrait', 1], ['Landscape', 2]]} />
      <Row label="Cue angle zones" note="The ring of the tip sheet. One colour: learn the angles yourself" value={set.zones} pick={zones => change({ zones })} options={[['Colours', true], ['One colour', false]]} />
    </Page>
  );
}
