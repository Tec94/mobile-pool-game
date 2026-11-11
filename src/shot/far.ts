// The aim guide worked out off the JS thread, on the AI's worklet runtime (src/ai/think.ts): the AI does not think on
// the human's turn, so the runtime is free then. Copies go across: a value handed to a worklet is frozen in dev builds.
import { runOnRuntimeAsync } from 'react-native-worklets';
import { runtime } from '../ai/think';
import type { Ball, Cue, Shot } from '../physics/engine';
import { aimGuide } from './aim';

export type Guide = ReturnType<typeof aimGuide>;
export interface GuideAsk { B: Ball[]; shot: Shot; aim: number; budget: number; stick: Cue }
export const nearGuide = (a: GuideAsk): Guide => aimGuide(a.B, a.shot, a.aim, a.budget, a.stick);
// null = no worklet runtime here (web).
export function farGuide(): ((a: GuideAsk) => Promise<Guide>) | null {
  const r = runtime();
  return r && (a => { try { return runOnRuntimeAsync(r, aimGuide, a.B.map(b => ({ ...b })), { ...a.shot }, a.aim, a.budget, { ...a.stick }); } catch (e) { return Promise.reject(e); } });
}
