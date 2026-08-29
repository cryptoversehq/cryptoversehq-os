/**
 * feedbackStore.ts — CryptoVerse HQ Feedback System
 * Stores user feedback in Taskade project + localStorage fallback.
 * Feature ratings: 👍/👎 per feature with per-user dedup.
 */

const FEEDBACK_KEY = 'cv_feedback';
const RATINGS_KEY = 'cv_feature_ratings';
import { cloudDataLayer, cloudRecordStore } from './cloudData';

const FEEDBACK_PROJECT = '3dMq65zUi1A7ayiC'; // CryptoVerse Users project

export interface FeedbackEntry {
  id: string; userId: string; userName: string;
  rating: number; // 1-5 stars
  feature: string; wantsFeature: string;
  bugs: string; timestamp: string;
}

export interface FeatureRating {
  featureId: string; featureName: string;
  likes: number; dislikes: number;
  userVotes: Record<string, 'like'|'dislike'>; // userId → vote
}

// ─── Feedback ───────────────────────────────────────────────────────────────

function loadFeedback(): FeedbackEntry[] {
  return cloudRecordStore.get<FeedbackEntry[]>('feedback', FEEDBACK_KEY, []);
}
function saveFeedback(entries: FeedbackEntry[]): void {
  cloudRecordStore.set('feedback', FEEDBACK_KEY, entries.slice(0, 500));
}

export async function submitFeedback(params: {
  userId: string; userName: string; rating: number;
  feature: string; bugs: string;
}): Promise<void> {
  const entry: FeedbackEntry = {
    id: `fb_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
    ...params, timestamp: new Date().toISOString(),
  };
  const list = [entry, ...loadFeedback()];
  saveFeedback(list);

  // Try to persist to Taskade project
  try {
    await cloudDataLayer.createProjectNode(FEEDBACK_PROJECT, {
      content: `Feedback: ${params.rating}★`,
      attributes: {
        '@cv_email': params.userId,
        '@cv_fname': params.userName,
        '@cv_data': JSON.stringify({ type:'feedback', ...params, timestamp: entry.timestamp }),
      },
    });
  } catch { /* localStorage fallback is sufficient */ }
}

export function getFeedback(): FeedbackEntry[] {
  return loadFeedback().sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

// ─── Feature Ratings ────────────────────────────────────────────────────────

function loadRatings(): Record<string, FeatureRating> {
  return cloudRecordStore.get<Record<string, FeatureRating>>('feedback', RATINGS_KEY, {});
}
function saveRatings(r: Record<string, FeatureRating>): void {
  cloudRecordStore.set('feedback', RATINGS_KEY, r);
}

export function voteFeature(featureId: string, featureName: string, userId: string, vote: 'like'|'dislike'): FeatureRating {
  const ratings = loadRatings();
  if (!ratings[featureId]) ratings[featureId] = { featureId, featureName, likes:0, dislikes:0, userVotes:{} };
  const r = ratings[featureId];
  const prev = r.userVotes[userId];
  if (prev === vote) { delete r.userVotes[userId]; if (vote==='like') r.likes--; else r.dislikes--; }
  else {
    if (prev) { if (prev==='like') r.likes--; else r.dislikes--; }
    r.userVotes[userId] = vote;
    if (vote==='like') r.likes++; else r.dislikes++;
  }
  saveRatings(ratings);
  return { ...r };
}

export function getRatings(): Record<string, FeatureRating> { return loadRatings(); }

export function getPopularFeatures(limit = 5): FeatureRating[] {
  return Object.values(loadRatings())
    .sort((a,b) => (b.likes - b.dislikes) - (a.likes - a.dislikes))
    .slice(0, limit);
}
