// Each cue's look in the menus, from the approved prototype: p = its outline as [fraction along the cue, half width]
// (two points at one fraction make a step), seg = colour bands [from, to, colour], split = [from, gap] for a cue that
// forks into two prongs. Menu art only: the table draws every cue as the plain stick in render/cue.ts.
import type { Skia, SkCanvas } from '@shopify/react-native-skia';
import type { CueId } from '../progress/cues';

type Art = { p: [number, number][]; seg: [number, number, string][]; split?: [number, number] };
const TIP: [number, number, string][] = [[0, 0.012, '#5B93F0'], [0.012, 0.034, '#F6F4EC']];
const band = (a: number, b: number, n: number, c1: string, c2: string) =>
  Array.from({ length: n }, (_, i): [number, number, string] => [a + (b - a) * i / n, a + (b - a) * (i + 1) / n, i % 2 ? c2 : c1]);

export const CUE_ART = {
  house: { p: [[0, 0.5], [1, 1.15]], seg: [...TIP, [0.034, 0.6, '#E3BE85'], [0.6, 0.82, '#4A5C58'], [0.82, 1, '#9A5433']] },
  broomstick: { p: [[0, 0.5], [0.78, 0.62], [0.82, 1.1], [1, 2.7]], seg: [...TIP, [0.034, 0.78, '#C9B892'], [0.78, 0.83, '#C2413B'], ...band(0.83, 1, 5, '#E8C45A', '#D2A93C')] },
  pencil: { p: [[0, 0.16], [0.07, 1.25], [1, 1.25]], seg: [[0, 0.02, '#5B93F0'], [0.02, 0.07, '#EBCB9E'], [0.07, 0.88, '#F5C32C'], [0.88, 0.93, '#B9C0C4'], [0.93, 1, '#F08FA0']] },
  baguette: { p: [[0, 0.5], [0.034, 0.55], [0.1, 1.7], [0.2, 2.1], [0.88, 2.1], [0.96, 1.6], [1, 0.8]],
    seg: [...TIP, ...band(0.034, 1, 13, '#D9A55B', '#F3DDB0').map(([a, b, c], i): [number, number, string] => (i % 2 ? [a + 0.02, b - 0.02, c] : [a - 0.02, b + 0.02, c]))] },
  rod: { p: [[0, 0.3], [0.66, 0.55], [0.67, 1.9], [0.72, 1.9], [0.73, 0.95], [1, 0.95]], seg: [...TIP, [0.034, 0.66, '#7FA3B3'], [0.2, 0.21, '#EEF2EA'], [0.42, 0.43, '#EEF2EA'], [0.66, 0.73, '#C9CED1'], [0.73, 1, '#D8B48A']] },
  noodle: { p: [[0, 0.5], [0.034, 0.5], [0.036, 1.9], [1, 1.9]], seg: [...TIP, [0.034, 1, '#F06FA6'], [0.97, 1, '#C94F86']] },
  crowbar: { p: [[0, 0.5], [0.05, 0.72], [0.84, 0.72], [0.9, 1.2], [1, 2.3]], split: [0.92, 0.45], seg: [...TIP, [0.034, 0.1, '#AEB6BA'], [0.1, 0.84, '#D4483B'], [0.84, 1, '#AEB6BA']] },
  trombone: { p: [[0, 0.4], [0.8, 0.5], [0.9, 1.1], [1, 2.8]], seg: [...TIP, [0.034, 1, '#E2B646'], [0.3, 0.32, '#B98A2A'], [0.55, 0.57, '#B98A2A'], [0.8, 0.82, '#B98A2A'], [0.985, 1, '#FFE27A']] },
  chopsticks: { p: [[0, 0.8], [1, 1.7]], split: [0.03, 0.4], seg: [[0, 0.03, '#5B93F0'], [0.03, 0.62, '#EAD6A6'], [0.62, 0.66, '#F2C230'], [0.66, 1, '#B5432E']] },
  lightning: { p: [[0, 0.2], [0.86, 0.6], [0.88, 1.7], [0.93, 1.7], [0.95, 0.6], [1, 0.6]], seg: [[0, 0.012, '#5B93F0'], [0.012, 0.86, '#C9D6EE'], [0.86, 0.95, '#F2C230'], [0.95, 1, '#C9D6EE']] },
  periscope: { p: [[0, 0.5], [0.3, 0.5], [0.3, 0.85], [0.6, 0.85], [0.6, 1.2], [0.88, 1.2], [0.88, 1.9], [1, 1.9]],
    seg: [...TIP, [0.034, 0.3, '#7DB59C'], [0.3, 0.6, '#5C9A80'], [0.6, 0.88, '#7DB59C'], [0.88, 1, '#5C9A80'], [0.29, 0.31, '#E2B646'], [0.59, 0.61, '#E2B646'], [0.965, 1, '#9FD7F5']] },
  icicle: { p: [[0, 0.12], [1, 2.1]], seg: [[0, 0.012, '#5B93F0'], [0.012, 0.4, '#EAF7FC'], [0.4, 0.75, '#BFE3F2'], [0.75, 1, '#8FCBE6']] },
  cactus: { p: [[0, 0.5], [0.034, 0.6], [0.06, 1.5], ...Array.from({ length: 11 }, (_, i): [number, number] => [0.1 + i * 0.08, i % 2 ? 1.35 : 1.85]), [0.95, 1.5], [1, 0.9]],
    seg: [...TIP, ...band(0.034, 0.95, 12, '#4FAE6A', '#62C07C'), [0.95, 1, '#F28BB0']] },
  rocket: { p: [[0, 0.2], [0.1, 1.3], [0.8, 1.3], [0.88, 2.7], [0.91, 2.7], [0.91, 1.1], [1, 0.25]], seg: [[0, 0.012, '#5B93F0'], [0.012, 0.1, '#D4483B'], [0.1, 0.8, '#EEF2EA'], [0.3, 0.34, '#D4483B'], [0.8, 0.91, '#D4483B'], [0.91, 1, '#F2C230']] },
  wizard: { p: [[0, 0.45], [0.84, 0.8], [0.87, 0.8], [0.9, 2.1], [0.97, 2.1], [1, 1]], seg: [...TIP, [0.034, 0.87, '#A9805A'], [0.4, 0.42, '#7C5A3C'], [0.62, 0.64, '#7C5A3C'], [0.87, 1, '#B58CF0']] },
  golden: { p: [[0, 0.5], [1, 1.15]], seg: [...TIP, [0.034, 0.6, '#F2C230'], [0.6, 0.82, '#B8860B'], [0.82, 1, '#FFE27A']] },
  twig: { p: [[0, 0.3], [0.3, 0.45], [0.33, 0.95], [0.36, 0.45], [0.68, 0.55], [0.71, 1], [0.74, 0.55], [0.94, 0.6], [0.96, 1.6], [1, 0.2]], seg: [[0, 0.012, '#5B93F0'], [0.012, 0.94, '#B08C62'], [0.94, 1, '#6FB36A']] },
} satisfies Record<CueId, Art>;

// Draws a cue lying along x: tip at 0, butt at len, centred on y = 0; k scales its thickness.
export function drawCueArt(api: typeof Skia, canvas: SkCanvas, id: CueId, len: number, k: number) {
  const { p: P, seg, split } = CUE_ART[id] as Art;
  const w = (f: number) => {
    for (let j = 1; j < P.length; j++) if (f <= P[j][0]) { const [a, wa] = P[j - 1], [b, wb] = P[j]; return b === a ? wb : wa + (wb - wa) * (f - a) / (b - a); }
    return P[P.length - 1][1];
  };
  for (const [a, b, col] of seg) {
    const f = [a, ...P.map(q => q[0]).filter(v => v > a && v < b), b], hole = split && b > split[0] ? split[1] : 0, paint = api.Paint();
    paint.setAntiAlias(true); paint.setColor(api.Color(col));
    // One band is a polygon: along one edge and back along the other, or along the gap of a fork, once per prong.
    for (const s of hole ? [1, -1] : [1]) {
      const pts = [...f.map(v => ({ x: v * len, y: -s * w(v) * k })), ...[...f].reverse().map(v => ({ x: v * len, y: (hole ? -s * w(v) * hole : w(v)) * k }))];
      canvas.drawPath(api.Path.Polygon(pts, true), paint);
    }
  }
}
