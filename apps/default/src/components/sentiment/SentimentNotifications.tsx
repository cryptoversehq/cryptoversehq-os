/**
 * SentimentNotifications.tsx — §6.4 Sentiment Notifications System
 *
 * Three notification modes:
 *   1. Daily Digest Banner — shown once per day at session start
 *   2. Extreme Sentiment Toast — fired when F&G hits extreme zones
 *   3. Alert History Badge — shown on the Alerts tab when conditions fire
 *
 * Usage:
 *   <SentimentNotificationProvider />  ← mounts in App/Layout root
 *   <SentimentDigestBanner />          ← shows collapsible daily summary
 */
import React, { useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Brain, TrendingUp, TrendingDown, Bell, ChevronDown, ChevronUp } from 'lucide-react';
import { useSentimentStore } from '../../lib/sentimentStore';
import { FEAR_GREED_META } from '../../lib/sentimentTypes';
import { sentimentColor, fmtSentiment } from './sentimentUtils';
import { cn } from '@/lib/utils';

// ── Extreme condition monitor (runs as a side-effect hook) ────────────────────

const EXTREME_COOLDOWN_MS = 5 * 60 * 1000; // 5 min between toasts
const lastExtremeFired: Record<string, number> = {};

export function useSentimentExtremeAlerts() {
  const { getMarketFearGreed, getAllAggregates } = useSentimentStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const market = getMarketFearGreed();
      if (!market) return;

      const { index, zone } = market;
      const now = Date.now();

      // Fire extreme fear toast
      if (zone === 'extreme_fear') {
        const last = lastExtremeFired['extreme_fear'] ?? 0;
        if (now - last > EXTREME_COOLDOWN_MS) {
          lastExtremeFired['extreme_fear'] = now;
          const meta = FEAR_GREED_META.extreme_fear;
          toast.warning(`${meta.icon} Extreme Fear Alert`, {
            description: `F&G Index is ${Math.round(index)} — historical contrarian buy signal. Consider gradual accumulation.`,
            duration:    12_000,
            action: { label: 'View Signals', onClick: () => { window.location.href = '/sentiment/signals'; } },
          });
        }
      }

      // Fire extreme greed toast
      if (zone === 'extreme_greed') {
        const last = lastExtremeFired['extreme_greed'] ?? 0;
        if (now - last > EXTREME_COOLDOWN_MS) {
          lastExtremeFired['extreme_greed'] = now;
          const meta = FEAR_GREED_META.extreme_greed;
          toast.error(`${meta.icon} Extreme Greed Alert`, {
            description: `F&G Index is ${Math.round(index)} — market overextended. Consider reducing exposure.`,
            duration:    12_000,
            action: { label: 'View Signals', onClick: () => { window.location.href = '/sentiment/signals'; } },
          });
        }
      }
    }, 30_000); // check every 30s

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);
}

// ── Push notification helper ──────────────────────────────────────────────────

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied')  return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function sendPushNotification(title: string, body: string, icon?: string) {
  if (Notification.permission !== 'granted') return;
  new Notification(title, {
    body,
    icon:  icon ?? '/favicon.ico',
    badge: '/favicon.ico',
    tag:   'sentiment-alert',
  });
}

// ── Daily Digest Banner ───────────────────────────────────────────────────────

const DIGEST_STORAGE_KEY = 'sentiment_digest_shown';

function wasShownToday(): boolean {
  try {
    const d = localStorage.getItem(DIGEST_STORAGE_KEY);
    if (!d) return false;
    const shown = new Date(d);
    const today = new Date();
    return shown.toDateString() === today.toDateString();
  } catch { return false; }
}

function markShownToday() {
  try { localStorage.setItem(DIGEST_STORAGE_KEY, new Date().toISOString()); } catch { /* noop */ }
}

interface DigestData {
  fearGreed:    number;
  zone:         string;
  topBullish:   { symbol: string; sentiment: number }[];
  topBearish:   { symbol: string; sentiment: number }[];
  overallSent:  number;
  alertCount:   number;
}

export function SentimentDigestBanner() {
  const { getMarketFearGreed, getAllAggregates } = useSentimentStore();
  const [visible,  setVisible]  = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const market  = getMarketFearGreed();
  const allAggs = getAllAggregates();

  useEffect(() => {
    if (wasShownToday() || dismissed) return;
    // Delay banner 3s so it doesn't fight with bootstrap toasts
    const t = setTimeout(() => {
      setVisible(true);
      markShownToday();
    }, 3_000);
    return () => clearTimeout(t);
  }, []);

  if (!visible || dismissed || !market) return null;

  const fg   = market.index;
  const zone = market.zone;
  const meta = FEAR_GREED_META[zone];

  const sorted     = [...allAggs].sort((a, b) => b.latest.overallSentiment - a.latest.overallSentiment);
  const topBullish = sorted.slice(0, 2).map(a => ({ symbol: a.symbol, sentiment: a.latest.overallSentiment }));
  const topBearish = sorted.slice(-2).reverse().map(a => ({ symbol: a.symbol, sentiment: a.latest.overallSentiment }));
  const overallSent = allAggs.length > 0
    ? allAggs.reduce((s, a) => s + a.latest.overallSentiment, 0) / allAggs.length
    : 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="fixed top-4 right-4 z-50 w-80 rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: '#0f1117', border: `1px solid ${meta.color}25` }}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3"
          style={{ background: `${meta.color}08`, borderBottom: `1px solid ${meta.color}15` }}>
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4" style={{ color: meta.color }} />
            <p className="text-xs font-black text-foreground">Daily Sentiment Digest</p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setExpanded(e => !e)}
              className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors">
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            <button onClick={() => setDismissed(true)}
              className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Summary row */}
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="text-center">
            <p className="font-black text-2xl" style={{ color: meta.color }}>{Math.round(fg)}</p>
            <p className="text-[9px] font-bold text-muted-foreground">F&G INDEX</p>
          </div>
          <div className="flex-1 space-y-1">
            <p className="text-xs font-bold text-foreground">{meta.icon} {meta.label}</p>
            <p className="text-[10px] text-muted-foreground">
              Overall market: {' '}
              <span style={{ color: sentimentColor(overallSent) }} className="font-bold">
                {overallSent >= 0 ? '+' : ''}{overallSent.toFixed(2)} ({fmtSentiment(overallSent)})
              </span>
            </p>
          </div>
        </div>

        {/* Expanded detail */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
              style={{ overflow: 'hidden' }}>
              <div className="px-4 pb-4 space-y-3 border-t border-white/6">
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div>
                    <p className="text-[9px] font-bold text-emerald-400/70 uppercase mb-1.5">📈 Most Bullish</p>
                    {topBullish.map(c => (
                      <div key={c.symbol} className="flex items-center justify-between py-0.5">
                        <span className="text-[10px] font-bold text-foreground">{c.symbol}</span>
                        <span className="text-[10px]" style={{ color: sentimentColor(c.sentiment) }}>
                          +{c.sentiment.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-red-400/70 uppercase mb-1.5">📉 Most Bearish</p>
                    {topBearish.map(c => (
                      <div key={c.symbol} className="flex items-center justify-between py-0.5">
                        <span className="text-[10px] font-bold text-foreground">{c.symbol}</span>
                        <span className="text-[10px]" style={{ color: sentimentColor(c.sentiment) }}>
                          {c.sentiment.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="text-[10px] text-muted-foreground/60 pt-1 border-t border-white/5">
                  {meta.description}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer link */}
        <div className="px-4 py-2.5 border-t border-white/5 flex items-center justify-between">
          <a href="/sentiment" className="text-[10px] font-bold text-primary hover:underline">
            View full sentiment analysis →
          </a>
          <a href="/sentiment/signals" className="text-[10px] font-bold text-muted-foreground hover:text-foreground">
            ⚡ Signals
          </a>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Push notification preferences UI ─────────────────────────────────────────

export function SentimentPushToggle() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default',
  );

  async function handleEnable() {
    const granted = await requestNotificationPermission();
    setPermission(Notification.permission);
    if (granted) {
      toast.success('Push notifications enabled', {
        description: 'You will receive alerts when extreme sentiment is detected',
      });
      sendPushNotification('Sentiment Alerts Active 🧠', 'You will be notified when extreme market conditions are detected.');
    } else {
      toast.error('Push notifications blocked', {
        description: 'Enable them in browser settings and try again',
      });
    }
  }

  if (permission === 'granted') {
    return (
      <div className="flex items-center gap-2 text-[11px] text-emerald-400">
        <Bell className="h-3.5 w-3.5" />
        <span className="font-bold">Push notifications enabled</span>
      </div>
    );
  }

  return (
    <button onClick={handleEnable}
      className="flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-bold border border-amber-400/25 text-amber-400 bg-amber-400/5 hover:bg-amber-400/10 transition-all">
      <Bell className="h-3.5 w-3.5" />
      Enable Push Notifications
    </button>
  );
}

// ── Root provider (mount once in App layout) ──────────────────────────────────

export function SentimentNotificationProvider() {
  // Activates the extreme alert monitor as a background effect
  useSentimentExtremeAlerts();
  return null;
}
