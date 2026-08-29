/**
 * emotionalDetection.ts — CryptoVerse HQ Feature #7
 * Detects user mood from chat text & trading behavior. Offers support.
 * Trading Psychology reports weekly. Pro+ only.
 */
import { deepSeekAsk } from '@/lib/deepSeekClient';
import { useTradingStore } from '@/lib/tradingStore';

const MOOD_KEY = 'cv_feat_mood';
const MOOD_HISTORY_KEY = 'cv_feat_mood_history';

export type Mood = 'calm'|'confident'|'happy'|'anxious'|'angry'|'fearful'|'worried'|'neutral';

export interface MoodEntry {
  timestamp: string; mood: Mood; trigger: string; message?: string;
}

// ─── Analyze chat text ─────────────────────────────────────────────────────

export async function analyzeMood(text: string): Promise<{ mood: Mood; message?: string }> {
  const r = await deepSeekAsk(
    `Analyze the emotional tone of this text: "${text}". Return JSON: {"mood":"calm|confident|happy|anxious|angry|fearful|worried|neutral","score":0-100,"message":"optional supportive response if negative"}. Only JSON.`
  );
  try {
    const j = JSON.parse(r.replace(/```json\n?/g,'').replace(/\n?```/g,'').trim()) as { mood: string; score: number; message?: string };
    const mood = (['calm','confident','happy','anxious','angry','fearful','worried','neutral'].includes(j.mood) ? j.mood : 'neutral') as Mood;
    return { mood, message: mood==='angry'||mood==='anxious'||mood==='fearful' ? (j.message||'Take a moment to breathe. Trading decisions are better when calm.') : undefined };
  } catch { return { mood: 'neutral' }; }
}

// ─── Analyze trading behavior ──────────────────────────────────────────────

export function analyzeTradingBehavior(): { signal: string | null; mood: Mood } {
  try {
    const s = useTradingStore.getState();
    const recent = (s.history||[]).filter(t => {
      const ts = new Date(t.timestamp).getTime();
      return ts > Date.now() - 3 * 60 * 60_000; // last 3 hours
    });

    if (recent.length > 10) return { signal: 'High trade frequency — possible stress trading', mood: 'anxious' };

    const highLev = recent.filter(t => t.leverage > 20);
    if (highLev.length > 3) return { signal: 'Elevated leverage usage — overconfidence risk', mood: 'confident' };

    if (recent.length === 0 && (s.history||[]).length > 0) {
      const last = s.history!.reduce((a,b) => new Date(a.timestamp) > new Date(b.timestamp) ? a : b);
      if (Date.now() - new Date(last.timestamp).getTime() > 24*60*60_000)
        return { signal: 'No recent trades — possible hesitation or fear', mood: 'fearful' };
    }

    return { signal: null, mood: 'neutral' };
  } catch { return { signal: null, mood: 'neutral' }; }
}

// ─── Mood tracking ─────────────────────────────────────────────────────────

export function saveMoodEntry(entry: MoodEntry): void {
  try {
    const h = JSON.parse(localStorage.getItem(MOOD_HISTORY_KEY)||'[]') as MoodEntry[];
    if (h.length > 0 && h[h.length-1].mood === entry.mood) return;
    h.push(entry);
    localStorage.setItem(MOOD_HISTORY_KEY, JSON.stringify(h.slice(-200)));
  } catch {}
}

export function getMoodHistory(days = 7): MoodEntry[] {
  try {
    const h = JSON.parse(localStorage.getItem(MOOD_HISTORY_KEY)||'[]') as MoodEntry[];
    const cutoff = Date.now() - days * 86400000;
    return h.filter(e => new Date(e.timestamp).getTime() > cutoff);
  } catch { return []; }
}

export async function generatePsychologyReport(): Promise<string> {
  const history = getMoodHistory(7);
  if (history.length < 3) return 'Not enough mood data yet. Keep chatting and trading!';

  const summary = history.map(e => `[${e.timestamp.slice(11,16)}] ${e.mood}`).join(', ');
  const report = await deepSeekAsk(
    `User mood history (last 7 days): ${summary}. Give a brief "Trading Psychology Report": best mood for trading, patterns noticed, 1 tip. Be supportive and concise.`
  );
  return report;
}

export function getCurrentMoodMeter(): { mood: Mood; percentage: number } {
  const history = getMoodHistory(1); // last 24h
  if (history.length === 0) return { mood: 'neutral', percentage: 50 };
  const positive = history.filter(e => ['calm','confident','happy'].includes(e.mood)).length;
  return { mood: history[history.length-1].mood, percentage: Math.round((positive / history.length) * 100) };
}
