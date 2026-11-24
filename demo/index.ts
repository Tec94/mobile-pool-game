// The web demo's entry (scripts/demo-web.mjs): CanvasKit loads first, as Skia on the web draws with it.
import { registerRootComponent } from 'expo';
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

LoadSkiaWeb({ locateFile: (f: string) => '/play/' + f }).then(() => registerRootComponent(require('../App').default));
