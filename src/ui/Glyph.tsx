import { PaintStyle, Skia, StrokeCap, StrokeJoin } from '@shopify/react-native-skia';
import { Image } from 'react-native';
import type { StyleId } from '../ai/styles';

// Small marks drawn from SVG paths (tournament mock, /mnt/project-files/tournament/mock): the AI styles, a lock, a
// clock, the trophy. Drawn once per mark, colour and size on an offscreen Skia surface and shown as an image, as
// CuePicture does: a canvas each would want a GL context each. A part is [path, stroke width]; 0 = filled.
type Part = [string, number];
const ring = (x: number, y: number, r: number) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
export const GLYPHS: Record<StyleId | 'lock' | 'clock', Part[]> = { // a 14 x 14 box
  banker: [['M2 2.4 6.4 10.6 11.6 3', 1.8], ['M8 4.3 11.7 2.9 11.6 6.9', 1.8], ['M1.2 12.7h11.6', 1.8]],
  spin: [[ring(7, 7, 5.6), 1.7], [ring(9.1, 5, 2.1), 0]],
  wall: [['M7 .9 12.4 2.8v4.3c0 3-2.2 5-5.4 6-3.2-1-5.4-3-5.4-6V2.8z', 0]],
  gun: [[ring(7, 7, 3.9), 1.6], ['M7 .9v3.2M7 9.9v3.2M.9 7h3.2M9.9 7h3.2', 1.6], [ring(7, 7, 1.1), 0]],
  closer: [['M3 1.3v11.5', 1.9], ['M3 2h9.2L9.7 5.2 12.2 8.4H3z', 0]],
  lock: [['M3 6.5h8v6.5H3z', 0], ['M4.8 6.5V4.6a2.2 2.2 0 0 1 4.4 0v1.9', 1.6]],
  clock: [[ring(7, 7, 5.6), 1.6], ['M7 4v3.3l2.2 1.4', 1.6]],
};
// The trophy, in a 48 x 48 box: drawn twice, the lip colour 2 pt down and right, the face over it.
const CUP = 'M12 5h24v11a12 12 0 0 1-24 0zM12 8H5.5v3.5A8 8 0 0 0 13.5 19.5v-3.6A4.4 4.4 0 0 1 9.1 11.6h2.9zM36 8h6.5v3.5a8 8 0 0 1-8 8v-3.6a4.4 4.4 0 0 0 4.4-4.3H36zM21 27h6v7h-6zM14 34h20v6H14z';
// Medal colours [face, lip]: none, bronze, silver, gold.
export const MEDALS = [['#EEF2EA33', '#0000'], ['#C8763A', '#8E4F22'], ['#C9D0CF', '#8C9594'], ['#F2C230', '#B8901A']] as const;

const pics = new Map<string, string>(), DPR = 3;
function draw(key: string, size: number, box: number, parts: [string, number, string, number?][]) {
  let uri = pics.get(key);
  if (uri) return uri;
  const surface = Skia.Surface.Make(Math.ceil(size * DPR), Math.ceil(size * DPR));
  if (!surface) return null;
  const c = surface.getCanvas();
  c.scale((size * DPR) / box, (size * DPR) / box);
  for (const [d, stroke, color, shift = 0] of parts) {
    const path = Skia.Path.MakeFromSVGString(d), paint = Skia.Paint();
    if (!path) continue;
    paint.setAntiAlias(true); paint.setColor(Skia.Color(color));
    if (stroke) { paint.setStyle(PaintStyle.Stroke); paint.setStrokeWidth(stroke); paint.setStrokeCap(StrokeCap.Round); paint.setStrokeJoin(StrokeJoin.Round); }
    c.save(); c.translate(shift, shift); c.drawPath(path, paint); c.restore();
  }
  pics.set(key, uri = `data:image/png;base64,${surface.makeImageSnapshot().encodeToBase64()}`);
  return uri;
}

export function Glyph({ id, size = 14, color }: { id: keyof typeof GLYPHS; size?: number; color: string }) {
  const uri = draw(`${id} ${size} ${color}`, size, 14, GLYPHS[id].map(([d, w]) => [d, w, color]));
  return uri ? <Image source={{ uri }} style={{ width: size, height: size }} /> : null;
}
export function Trophy({ medal, size }: { medal: number; size: number }) {
  const [face, lip] = MEDALS[medal], uri = draw(`cup ${medal} ${size}`, size, 48, [[CUP, 0, lip, 2], [CUP, 0, face]]);
  return uri ? <Image source={{ uri }} style={{ width: size, height: size }} accessibilityIgnoresInvertColors /> : null;
}
