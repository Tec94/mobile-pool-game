import { Skia } from '@shopify/react-native-skia';
import { Image } from 'react-native';
import type { CueId } from '../progress/cues';
import { cueCtx, paintCard, paintWhole } from '../render/cues';

// A cue's own look (render/cues) in a w x h box: the butt half leaning across a card, or with whole, the whole cue
// lying across the box. Drawn once per cue and box on an offscreen Skia surface and shown as an image: a canvas per
// card would want a GL context each, and a browser keeps only 16.
const pics = new Map<string, string>(), DPR = 3;
export function CueArt({ id, w, h, whole = false }: { id: CueId; w: number; h: number; whole?: boolean }) {
  const key = `${id} ${w} ${h} ${whole}`;
  let uri = pics.get(key);
  if (!uri) {
    const surface = Skia.Surface.Make(Math.ceil(w * DPR), Math.ceil(h * DPR));
    if (!surface) return null;
    const c = surface.getCanvas();
    c.scale(DPR, DPR);
    (whole ? paintWhole : paintCard)(cueCtx(Skia, c), id, w, h);
    pics.set(key, uri = `data:image/png;base64,${surface.makeImageSnapshot().encodeToBase64()}`);
  }
  return <Image source={{ uri }} style={{ width: w, height: h }} />;
}
