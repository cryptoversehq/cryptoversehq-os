/**
 * lynxLifecycle.ts — Lightweight lifecycle state for the Lynx AI runtime.
 *
 * Deliberately FREE of any engine imports. UI (e.g. useLynxRuntime) and App
 * subscribe to readiness through this module so they never pull the ~45-engine
 * bootstrap graph into the initial bundle. Pulling that graph eagerly at boot
 * evaluates engine modules during initial module load, which can throw before
 * React mounts and white-screen the app. The engine graph is loaded lazily,
 * only when bootstrapLynx() is actually invoked after authentication.
 */

export type LynxLifecycleState =
  | 'not_started'
  | 'initializing'
  | 'ready'
  | 'failed'
  | 'shutting_down';

let lifecycleState: LynxLifecycleState = 'not_started';
const lifecycleListeners = new Set<(state: LynxLifecycleState) => void>();

export function setLynxLifecycleState(next: LynxLifecycleState): void {
  lifecycleState = next;
  lifecycleListeners.forEach(listener => listener(next));
}

export function getLynxLifecycleState(): LynxLifecycleState {
  return lifecycleState;
}

export function subscribeLynxLifecycle(listener: (state: LynxLifecycleState) => void): () => void {
  lifecycleListeners.add(listener);
  return () => lifecycleListeners.delete(listener);
}
