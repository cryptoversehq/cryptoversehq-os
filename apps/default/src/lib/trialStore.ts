/**
 * trialStore.ts — 7-day Pro trial for new users.
 * One trial per user, stored in localStorage.
 */
import { cloudRecordStore } from './cloudData';

const TRIAL_KEY = 'trial';
const TRIAL_DURATION_DAYS = 7;

export interface TrialState {
  activated: boolean;
  startedAt: string | null;
  expiresAt: string | null;
}

const EMPTY_TRIAL: TrialState = { activated: false, startedAt: null, expiresAt: null };

function loadTrial(): TrialState {
  return cloudRecordStore.get<TrialState>('trial', TRIAL_KEY, EMPTY_TRIAL);
}

function saveTrial(state: TrialState) {
  cloudRecordStore.set('trial', TRIAL_KEY, state);
}

export function activateTrial(): TrialState {
  const now = new Date();
  const expires = new Date(now.getTime() + TRIAL_DURATION_DAYS * 86400000);
  const state: TrialState = {
    activated: true,
    startedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  };
  saveTrial(state);
  return state;
}

export function isTrialActive(): boolean {
  const trial = loadTrial();
  if (!trial.activated || !trial.expiresAt) return false;
  return new Date(trial.expiresAt) > new Date();
}

export function getTrialState(): TrialState {
  return loadTrial();
}

export function getTrialDaysLeft(): number {
  const trial = loadTrial();
  if (!trial.activated || !trial.expiresAt) return 0;
  const remaining = new Date(trial.expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(remaining / 86400000));
}

export function clearTrial() {
  saveTrial({ activated: false, startedAt: null, expiresAt: null });
}
