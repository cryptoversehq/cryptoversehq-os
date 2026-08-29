import { useSyncExternalStore } from 'react';
import {
  getLynxLifecycleState,
  subscribeLynxLifecycle,
  type LynxLifecycleState,
} from '@/lib/lynxLifecycle';

export interface LynxRuntimeSnapshot {
  state: LynxLifecycleState;
  ready: boolean;
  failed: boolean;
}

export function useLynxRuntime(): LynxRuntimeSnapshot {
  const state = useSyncExternalStore(
    subscribeLynxLifecycle,
    getLynxLifecycleState,
    getLynxLifecycleState,
  );

  return {
    state,
    ready: state === 'ready',
    failed: state === 'failed',
  };
}
