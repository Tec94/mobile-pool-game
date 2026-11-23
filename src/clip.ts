// The App Clip (targets/clip) runs this same bundle from RunoutClip.app: it opens straight into one quick match and
// offers the full game. Paths.bundle is the running .app, so no native module is needed to tell the two apart.
import { Linking } from 'react-native';
import { Paths } from 'expo-file-system';

export const CLIP = (() => { try { return !!Paths.bundle?.uri?.includes('RunoutClip.app'); } catch { return false; } })();
export const fullGame = () => Linking.openURL('https://apps.apple.com/app/id6833853680').catch(() => {});
