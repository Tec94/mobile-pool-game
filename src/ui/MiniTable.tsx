// A small table drawn with plain Views (no Skia: a screen can hold 20 of them), in the engine's table frame (metres,
// P.L x P.W, as Lesson.cue / balls / Goal.zone). The tile around it carries the name, so it hides from screen readers.
import { View } from 'react-native';
import { type Lesson, litCushions } from '../learn/lessons';
import { nose } from '../rules/rules';
import { HOLES, P, rack } from '../physics/engine';
import { BALLS, C, CLOTHS } from '../theme';

export interface Table { cue?: [number, number]; balls?: [number, number, number][]; ring?: number; rings?: boolean; lit?: number[]; zone?: [number, number, number] }

// ring = the called pocket (index into HOLES, as Goal.pocket); rings = every pocket asks for a call; lit = cushion ids 0..5 as nose(k).
export function MiniTable({ width: w, cue, balls = [], ring, rings, lit = [], zone, cloth = 0 }: Table & { width: number; cloth?: number }) {
  const f = Math.max(4, w * 0.06), iw = w - 2 * f, s = iw / P.L, r = Math.max(2.5, w * 0.022), pr = r * 1.3;
  const disc = (x: number, y: number, d: number) => ({ position: 'absolute' as const, left: f + x * s - d / 2, top: f + y * s - d / 2, width: d, height: d, borderRadius: d / 2 });
  return (
    <View style={{ width: w, height: w / 2 + f, backgroundColor: C.frame, borderRadius: 6 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={{ position: 'absolute', left: f, top: f, width: iw, height: iw / 2, backgroundColor: CLOTHS[cloth]?.felt ?? CLOTHS[0].felt, borderRadius: 2 }} />
      {lit.map(k => {
        const [x0, y0, x1, y1] = nose(k), across = x0 === x1, t = 3;
        return <View key={k} style={{ position: 'absolute', backgroundColor: C.chalk, boxShadow: '0 0 6px #fff9',
          left: f + (across ? (x0 ? iw - t : 0) : Math.min(x0, x1) * s), top: f + (across ? Math.min(y0, y1) * s : (y0 ? iw / 2 - t : 0)),
          width: across ? t : Math.abs(x1 - x0) * s, height: across ? Math.abs(y1 - y0) * s : t }} />;
      })}
      {HOLES.map(([x, y], i) => {
        // the hole sits in the rail: draw it on the felt corner / side point, as the table reads at this size
        const hx = Math.min(P.L, Math.max(0, x)), hy = Math.min(P.W, Math.max(0, y)), on = ring === i;
        return <View key={i} style={[disc(hx, hy, 2 * pr), { backgroundColor: C.pocket }, (on || rings) && { outlineColor: on ? C.call : C.chalk, outlineWidth: on ? 2 : 1.5, outlineOffset: 1, outlineStyle: 'solid' }]} />;
      })}
      {zone && <View style={[disc(zone[0], zone[1], 2 * zone[2] * s), { borderWidth: 1.5, borderColor: C.chalk, opacity: 0.8 }]} />}
      {balls.map(([n, x, y]) => (
        <View key={n} style={[disc(x, y, 2 * r), { backgroundColor: n > 8 ? C.white : BALLS[(n - 1) % 8], overflow: 'hidden', boxShadow: '1px 1px 0 #0007', justifyContent: 'center' }]}>
          {n > 8 && <View style={{ height: r, backgroundColor: BALLS[(n - 1) % 8] }} />}
        </View>
      ))}
      {cue && <View style={[disc(cue[0], cue[1], 2 * r), { backgroundColor: C.white, boxShadow: '1px 1px 0 #0007' }]} />}
    </View>
  );
}

// A lesson's or a scenario's table: its pocket, its target ring, and the lit cushions of a bank table.
export const tableOf = (l: Lesson): Table => ({ cue: l.cue, balls: l.balls, ring: l.goal.pocket, zone: l.goal.zone, lit: litCushions(l) ?? undefined });
// The break: the real rack and the cue ball on the head spot.
export const rackOf = (game: 8 | 9): Table => ({ cue: [P.L / 4, P.W / 2], balls: rack(game) });

// Where a lesson hits the cue ball: a white disc with a red dot at the tip (x right, y up, -1..1 to 36% of the size).
export function SpinDot({ tip, size }: { tip: { x: number; y: number }; size: number }) {
  const d = size * 0.26;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.white, boxShadow: '2px 2px 0 #0006' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={{ position: 'absolute', width: d, height: d, borderRadius: d / 2, backgroundColor: C.call, left: size * (0.5 + tip.x * 0.36) - d / 2, top: size * (0.5 - tip.y * 0.36) - d / 2 }} />
    </View>
  );
}
