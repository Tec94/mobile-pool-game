// The web has no build-time fonts: load the three faces under the names in FONT before the first frame.
import { useFonts } from 'expo-font';
import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque/800ExtraBold';
import { InstrumentSans_600SemiBold } from '@expo-google-fonts/instrument-sans/600SemiBold';
import { InstrumentSans_700Bold } from '@expo-google-fonts/instrument-sans/700Bold';
import { FONT } from '../theme';

export function useFontsReady() {
  const [ok, error] = useFonts({ [FONT.display]: BricolageGrotesque_800ExtraBold, [FONT.semi]: InstrumentSans_600SemiBold, [FONT.bold]: InstrumentSans_700Bold });
  return ok || !!error; // a font that fails shows the system font, not a blank app
}
