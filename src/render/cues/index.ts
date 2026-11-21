// The cue drawings (art.ts), typed: a cue painted on a canvas, its shadow, the picture on its card, and the pictures
// the table replays. A cue lies along +x from its tip at (0, 0). S = px per metre, K = how much fatter than life
// (1 on the table), time in seconds and power 0..1 move its parts (lights, a spring, a rotor, flames).
import type { Skia, SkCanvas, SkFont, SkPicture } from '@shopify/react-native-skia';
import { Ctx2D } from '../ctx2d.ts';
import { DIGITS } from '../digits.ts';
import { ALL, G, LENGTH } from './art.ts';

// tail = how far the end piece runs past the butt, in metres at life size; slide and zoom move and shrink the cue on
// its card, so a mark further up the butt is in frame; accent = the cue's own colour, for its effects
export interface CueArt { name: string; tail?: number; slide?: number; zoom?: number; accent?: string; paint(g: unknown): void; over?(g: unknown): void; under?(g: unknown): void; silhouette?(g: unknown): void }
const NAMES = {
  house: 'House Cue', ironwood: 'Ironwood', whisper: 'Whisper', marquise: 'Marquise', surveyor: 'Surveyor', banker: 'Banker', plumb: 'Plumb', heirloom: 'Heirloom',
  ratchet: 'Ratchet', ram: 'Ram', gyro: 'Gyro', optic: 'Optic', vernier: 'Vernier', airbrake: 'Airbrake',
  twig: 'Twig', star: 'Fallen Star', coil: 'Coil', seer: 'Seer', hindsight: 'Hindsight', daybreak: 'Daybreak',
  sixseven: 'Six Seven', nonchalant: 'Nonchalant', aura: 'Aura', marble: 'Marble', performative: 'Performative', maxxed: 'Maxxed',
};
export type ArtId = keyof typeof NAMES;
export const ART_IDS = Object.keys(NAMES) as ArtId[];
const find = (name: string) => { const a = (ALL as CueArt[]).find(c => c.name === name); if (!a) throw new Error(`no drawing for ${name}`); return a; };
export const ART = Object.fromEntries(ART_IDS.map(id => [id, find(NAMES[id])])) as Record<ArtId, CueArt>;
export const CUE_LEN: number = LENGTH;
const SHADE = 'rgba(6,18,15,0.45)', REST = 1.3; // REST = the time every still picture is drawn at, as the review sheets were

// The digits on three cues (a weight stencil, a range drum, the 6, the 7 and a 10) are the ball numbers' face.
const fonts = new WeakMap<object, SkFont | null>();
function fontOf(api: typeof Skia) {
  if (!fonts.has(api)) { const face = api.Typeface.MakeFreeTypeFaceFromData(api.Data.fromBase64(DIGITS)); fonts.set(api, face ? api.Font(face, 10) : null); } // no face = no digits, the cue still draws
  return fonts.get(api) ?? null;
}
export const cueCtx = (api: typeof Skia, canvas: SkCanvas) => new Ctx2D(api, canvas, fontOf(api));

export function paintCue(ctx: Ctx2D, id: ArtId, S: number, K: number, time = REST, power = 0, turn = 0, flip = false) {
  const c = ART[id], g = G(ctx, c, S, K, time, power, turn, flip);
  if (c.under) c.under(g);
  ctx.save(); g.body(); ctx.clip(); c.paint(g); ctx.restore();
  if (c.over) c.over(g);
}
// The cue's outline in the shade colour. The caller moves it down and right on the screen: a shadow does not turn with the cue.
export function paintShade(ctx: Ctx2D, id: ArtId, S: number, K: number) {
  const c = ART[id], g = G(ctx, c, S, K, REST, 0);
  g.body(); ctx.fillStyle = SHADE; ctx.fill();
  if (c.silhouette) { c.silhouette(g); ctx.fill(); }
}
// The cue and its shadow (off px down and right) at (x, y), turned by ang.
function placed(ctx: Ctx2D, id: ArtId, x: number, y: number, ang: number, S: number, K: number, off: number, power = 0) {
  const at = (dx: number) => { ctx.translate(x + dx, y + dx); ctx.rotate(ang); };
  ctx.save(); at(off); paintShade(ctx, id, S, K); ctx.restore();
  ctx.save(); at(0); paintCue(ctx, id, S, K, REST, power, ang); ctx.restore();
}
// A card's picture in a w x h box: the butt half of the cue with its joint and the start of the shaft, leaning with
// the card's shape, its end low on the right so that what hangs off it stays inside.
export function paintCard(ctx: Ctx2D, id: ArtId, w: number, h: number) {
  const c = ART[id], K = 2.3, S = Math.min(300, Math.hypot(w, h) / 0.66) * (c.zoom || 1), ang = Math.atan2(h * 0.9, w * 0.75), back = (c.tail || 0) * S * K - (c.slide || 0) * S;
  const bx = w * 0.64 - Math.cos(ang) * back, by = h * 0.78 - Math.sin(ang) * back; // where the end of the butt goes
  placed(ctx, id, bx - Math.cos(ang) * CUE_LEN * S, by - Math.sin(ang) * CUE_LEN * S, ang, S, K, 3);
}
// The whole cue across a w x h box, so it is judged as one thing, with room past the butt for what hangs off it.
export function paintWhole(ctx: Ctx2D, id: ArtId, w: number, h: number, K = 1.8) {
  const room = Math.max(0.03, (ART[id].tail || 0) * K + 0.012), S = (w - 12) / (CUE_LEN + room);
  placed(ctx, id, 6, h / 2, 0, S, K, 2);
}

// The table's cue: recorded once for each step of the pull and replayed every frame, since a cue is some hundreds of
// shapes and the stick is drawn again on every frame of aiming. flip = mirrored across its length.
export interface CuePics { id: ArtId; S: number; flip: boolean; shade: SkPicture; at: (SkPicture | undefined)[] }
const STEPS = 20; // steps of the pull a cue's moving parts are drawn at
export function tablePics(api: typeof Skia, id: ArtId, S: number, flip: boolean, was?: CuePics | null): CuePics {
  if (was && was.id === id && was.S === S && was.flip === flip) return was;
  const rec = api.PictureRecorder(), ctx = cueCtx(api, rec.beginRecording());
  paintShade(ctx, id, S, 1);
  return { id, S, flip, shade: rec.finishRecordingAsPicture(), at: [] };
}
export function tablePic(api: typeof Skia, p: CuePics, power: number) {
  const k = Math.max(0, Math.min(STEPS, Math.ceil(power * STEPS - 1e-9)));
  if (!p.at[k]) { const rec = api.PictureRecorder(); paintCue(cueCtx(api, rec.beginRecording()), p.id, p.S, 1, REST, k / STEPS, 0, p.flip); p.at[k] = rec.finishRecordingAsPicture(); }
  return p.at[k]!;
}
