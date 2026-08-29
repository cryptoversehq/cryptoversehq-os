/**
 * featurePreviewStore.ts — Free users can try each locked feature once.
 * Stores which features have been previewed in localStorage.
 */
import { cloudRecordStore } from './cloudData';

const PREVIEW_KEY = 'cryptoverse_feature_previews_v1';

export type FeatureKey = string;

interface PreviewState {
  previewed: Record<FeatureKey, boolean>;
}

function loadPreviews(): PreviewState {
  return cloudRecordStore.get<PreviewState>('feature_previews', PREVIEW_KEY, { previewed: {} });
}

function savePreviews(state: PreviewState) {
  cloudRecordStore.set('feature_previews', PREVIEW_KEY, state);
}

export function hasPreviewed(feature: FeatureKey): boolean {
  return loadPreviews().previewed[feature] === true;
}

export function markPreviewed(feature: FeatureKey): void {
  const state = loadPreviews();
  state.previewed[feature] = true;
  savePreviews(state);
}

export function getPreviewedFeatures(): string[] {
  const state = loadPreviews();
  return Object.keys(state.previewed).filter(k => state.previewed[k]);
}

export function resetPreviews(): void {
  savePreviews({ previewed: {} });
}
