import { Canvas, Picture, Skia, type SkPicture } from '@shopify/react-native-skia';
import { Image, Platform } from 'react-native';
import type { CueId } from '../progress/cues';
import { cueCtx, paintCard, paintWhole } from '../render/cues';

// A cue's own look (render/cues) in a w x h box: the butt half leaning across a card, or with whole, the whole cue
// lying across the box. Drawn once per cue and box. On a phone it is a recorded picture in a canvas; a browser keeps
// only 16 GL contexts, so on the web it is painted on an offscreen surface and shown as a PNG.
const pics = new Map<string, SkPicture>(), pngs = new Map<string, string>(), DPR = 3;
export function CueArt({ id, w, h, whole = false }: { id: CueId; w: number; h: number; whole?: boolean }) {
  const key = `${id} ${w} ${h} ${whole}`;
  if (Platform.OS !== 'web') {
    let pic = pics.get(key);
    if (!pic) { const rec = Skia.PictureRecorder(); (whole ? paintWhole : paintCard)(cueCtx(Skia, rec.beginRecording()), id, w, h); pics.set(key, pic = rec.finishRecordingAsPicture()); }
    return <Canvas style={{ width: w, height: h }}><Picture picture={pic} /></Canvas>;
  }
  let uri = pngs.get(key);
  if (!uri) {
    const surface = Skia.Surface.Make(Math.ceil(w * DPR), Math.ceil(h * DPR));
    if (!surface) return null;
    const c = surface.getCanvas();
    c.scale(DPR, DPR);
    (whole ? paintWhole : paintCard)(cueCtx(Skia, c), id, w, h);
    pngs.set(key, uri = `data:image/png;base64,${surface.makeImageSnapshot().encodeToBase64()}`);
  }
  return <Image source={{ uri }} style={{ width: w, height: h }} />;
}
