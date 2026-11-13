import { Skia } from '@shopify/react-native-skia';
import { Image } from 'react-native';
import type { CueId } from '../progress/cues';
import { drawCueArt } from './cueArt';

// A cue's own look (cueArt.ts) in a w x h box: tip at (x, y), turned deg, len long, k thick. Drawn once per cue and
// pose on an offscreen Skia surface and shown as an image: a canvas per card would want a GL context each, and a
// browser keeps only 16.
export type Pose = [w: number, h: number, x: number, y: number, deg: number, len: number, k: number];
const pics = new Map<string, string>(), DPR = 3;
export function CueArt({ id, pose }: { id: CueId; pose: Pose }) {
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
