// The AI thinks off the JS thread: a top tier takes 1 to 2.6 s of engine work with no JIT, which would freeze the
// screen. think() and all it calls (turn.ts, aim.ts, shot-ai.ts, rules.ts, engine.ts) are worklets by a file-level
// 'worklet' directive, so they run on a worklet runtime of their own. Only plain data crosses: balls, ids, the State,
// numbers; the runtime gets copies of what the functions capture. Web has no worklet runtimes: there think() runs on
// the JS thread after a timeout, so the "thinking" frame paints first.
import { Platform } from 'react-native';
import { createWorkletRuntime, runOnRuntimeAsync, type WorkletRuntime } from 'react-native-worklets';
import type { Ball } from '../physics/engine';
import type { State } from '../rules/rules';
import { type Move, think } from './turn';

// A dropped think (pause, new ruling, leaving) still runs to completion on the serial runtime: there is no cancel API.
let rt: WorkletRuntime | null | undefined; // undefined = not made yet, null = cannot be made here
export const runtime = () => { if (rt === undefined) { try { rt = Platform.OS === 'web' ? null : createWorkletRuntime({ name: 'ai' }); } catch { rt = null; } } return rt; };

// The AI's move for this table. Copies go across: a value handed to a worklet is frozen on the JS thread in dev builds.
export function thinkAsync(B: Ball[], ids: number[], s: State, tier: number, seed: number, safeties: number): Promise<Move> {
  const args: Parameters<typeof think> = [B.map(b => ({ ...b })), [...ids], JSON.parse(JSON.stringify(s)), tier, seed, safeties], r = runtime();
  if (r) { try { return runOnRuntimeAsync(r, think, ...args); } catch (e) { return Promise.reject(e); } } // a sync throw (dev, a function that is not a worklet) goes to the fallback too
  return new Promise((ok, no) => setTimeout(() => { try { ok(think(...args)); } catch (e) { no(e); } }, 50));
}
