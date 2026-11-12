// The aim guide worked out off the JS thread, on a worklet runtime of its own: the AI's runtime (src/ai/think.ts) is
// serial and a think that was dropped still runs to its end there, which would hold a guide for seconds.
// Copies go across: a value handed to a worklet is frozen in dev builds.
import { Platform } from 'react-native';
import { createWorkletRuntime, runOnRuntimeAsync, type WorkletRuntime } from 'react-native-worklets';
import type { Ball, Cue, Shot } from '../physics/engine';
import { aimGuide } from './aim';

export type Guide = ReturnType<typeof aimGuide>;
export interface GuideAsk { B: Ball[]; shot: Shot; aim: number; budget: number; stick: Cue; real?: boolean } // real: see aimGuide
export const nearGuide = (a: GuideAsk): Guide => aimGuide(a.B, a.shot, a.aim, a.budget, a.stick, a.real);
// null = no worklet runtime here (web).
let rt: WorkletRuntime | null | undefined; // undefined = not made yet, null = cannot be made here
export function farGuide(): ((a: GuideAsk) => Promise<Guide>) | null {
  if (rt === undefined) { try { rt = Platform.OS === 'web' ? null : createWorkletRuntime({ name: 'guide' }); } catch { rt = null; } }
  const r = rt;
  return r && (a => { try { return runOnRuntimeAsync(r, aimGuide, a.B.map(b => ({ ...b })), { ...a.shot }, a.aim, a.budget, { ...a.stick }, !!a.real); } catch (e) { return Promise.reject(e); } });
}
