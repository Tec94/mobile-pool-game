// The web demo's entry (scripts/demo-web.mjs): CanvasKit loads first, as Skia on the web draws with it.
import { registerRootComponent } from 'expo';
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { zoomPage } from './zoom';

zoomPage(); // a desktop window draws the match at a big phone's proportions

LoadSkiaWeb({ locateFile: (f: string) => '/play/' + f }).then(() => registerRootComponent(require('../App').default), () => {
  // No WebAssembly or WebGL here (an old phone, Lockdown Mode, a failed download): say so, in place of the loading mark.
  const root = document.getElementById('root')!;
  root.innerHTML = '<p class="fail">This browser cannot draw the table. <a href="/">Back to Runout</a></p>';
});
