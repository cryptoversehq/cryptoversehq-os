/**
 * SentimentPage.tsx
 * Root router for the complete Sentiment Analysis feature.
 *
 * Routes:
 *   /sentiment            → §3.1 Dashboard (default)
 *   /sentiment/fear-greed → §3.2 Fear & Greed Index History
 *   /sentiment/social     → §3.3 Social Media Analytics
 *   /sentiment/news       → §3.4 News Analytics
 *   /sentiment/alerts     → §3.5 Alerts Manager
 *   /sentiment/signals    → §3.6 Trading Signals
 *
 * Sidebar tabs map to all 6 pages.
 * Global header: market F&G pill, live count, refresh button.
 * Bootstrap: seedHistory + startPolling on mount.
 */
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3, TrendingUp, Users, Newspaper, Bell, Zap,
  RefreshCw, Wifi, WifiOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSentimentStore, registerSentimentNotifyHandler } from '../../lib/sentimentStore';
import { FEAR_GREED_META, TRACKED_SYMBOLS } from '../../lib/sentimentTypes';
import { sentimentEnv } from '../../lib/env';
import { isApiEnabled } from '../../lib/apiStatusService';
import { SentimentDashboard }  from './SentimentDashboard';
import { SentimentFearGreed }  from './SentimentFearGreed';
import { SentimentSocial }     from './SentimentSocial';
import { SentimentNews }       from './SentimentNews';
import { SentimentAlerts }     from './SentimentAlerts';
import { SentimentSignals }    from './SentimentSignals';
import { SentimentGuide }      from './SentimentGuide';
import { cn } from '@/lib/utils';

// ── Tabs matching spec routes ─────────────────────────────────────────────────
// NOTE: the former "Verify" (SentimentChecklist) and "Report" (SentimentReport)
// tabs were internal developer/QA pages — the Report tab in particular embedded
// a raw screenshot/iframe of the live app for build verification purposes.
// Neither belonged in the end-user product; both are removed from this nav.
// The underlying files are left in place (unused) rather than deleted outright,
// in case they're wanted again for internal QA outside the main nav.

const TABS = [
  { id: 'dashboard',  path: '/sentiment',              label: 'Dashboard',   emoji: '📊', icon: BarChart3      },
  { id: 'feargreed',  path: '/sentiment/fear-greed',   label: 'Fear & Greed',emoji: '📈', icon: TrendingUp     },
  { id: 'social',     path: '/sentiment/social',       label: 'Social',      emoji: '📱', icon: Users          },
  { id: 'news',       path: '/sentiment/news',         label: 'News',        emoji: '📰', icon: Newspaper      },
  { id: 'alerts',     path: '/sentiment/alerts',       label: 'Alerts',      emoji: '🔔', icon: Bell           },
  { id: 'signals',    path: '/sentiment/signals',      label: 'Signals',     emoji: '⚡', icon: Zap            },
] as const;

type TabId = typeof TABS[number]['id'];

function getTabFromPath(pathname: string): TabId {
  if (pathname === '/sentiment' || pathname === '/sentiment/') return 'dashboard';
  const tab = TABS.find(t => t.path !== '/sentiment' && pathname.startsWith(t.path));
  return tab?.id ?? 'dashboard';
}

// ── API status banner ─────────────────────────────────────────────────────────

function APIBanner() {
  const configured = [
    sentimentEnv.hasTwitter    && 'Twitter',
    sentimentEnv.hasReddit     && 'Reddit',
    isApiEnabled('newsapi')    && 'News API',
  ].filter(Boolean) as string[];

  if (configured.length > 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 rounded-xl mb-4"
        style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
        <Wifi className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
        <p className="text-[11px] text-emerald-400 font-bold">
          Live data: {configured.join(', ')} · Remaining sources simulated
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 rounded-xl mb-4"
      style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
      <WifiOff className="h-3.5 w-3.5 text-amber-400 shrink-0" />
      <p className="text-[11px] text-amber-400">
        Simulation mode — configure{' '}
        <code className="font-mono">VITE_TWITTER_BEARER_TOKEN</code> /{' '}
        <code className="font-mono">VITE_REDDIT_CLIENT_ID</code> /{' '}
        <code className="font-mono">VITE_NEWS_API_KEY</code> for live data
      </p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function SentimentPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const {
    seedHistory, startPolling, stopPolling, runTick, refreshFromServer,
    getMarketFearGreed, getAllAggregates,
  } = useSentimentStore();

  const [selectedSymbol, setSelectedSymbol] = useState('BTC');
  const [refreshing,     setRefreshing]     = useState(false);
  const [lastUpdate,     setLastUpdate]     = useState(new Date());

  const activeTab = getTabFromPath(location.pathname);

  // Bootstrap on mount
  useEffect(() => {
    seedHistory();
    startPolling();
    registerSentimentNotifyHandler(n => {
      const fn = n.type === 'trade' ? 'success' : n.type === 'liquidation' ? 'error' : 'info';
      (toast as any)[fn](n.title, { description: n.message, duration: 6_000 });
    });
    return () => stopPolling();
  }, []);

  // ── P1: Beginner education guide on first visit ──
  const SENTIMENT_GUIDE_KEY = 'cv_sentiment_guide_dismissed';
  const [showGuide, setShowGuide] = useState(() => {
    try { return localStorage.getItem(SENTIMENT_GUIDE_KEY) !== 'true'; } catch { return true; }
  });
  function dismissGuide() {
    try { localStorage.setItem(SENTIMENT_GUIDE_KEY, 'true'); } catch {}
    setShowGuide(false);
  }

  async function handleRefresh() {
    setRefreshing(true);
    const serverResult = await refreshFromServer('BTC');
    if (serverResult.ok) {
      setLastUpdate(new Date());
      setRefreshing(false);
      toast.success(serverResult.message);
      return;
    }

    const result = runTick();
    setLastUpdate(new Date());
    setRefreshing(false);
    toast.info(`Local simulation update — ${result.generated} snapshots, ${result.triggered} alerts`);
  }

  function navigateTo(tab: typeof TABS[number]) {
    navigate(tab.path);
  }

  const market  = getMarketFearGreed();
  const allAggs = getAllAggregates();
  const fgMeta  = FEAR_GREED_META[market?.zone ?? 'neutral'];

  // Alert badge: extreme market conditions
  const hasExtremeAlert = allAggs.some(a => {
    const fg = a.latest.fearGreedIndex;
    const hasExtreme = fg <= 20 || fg >= 80;
    return hasExtreme;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Page header ── */}
      <div className="shrink-0 px-4 sm:px-6 pt-5 pb-0"
        style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.06) 0%, rgba(96,165,250,0.04) 100%)' }}>

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-2xl"
              style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}>
              🧠
            </div>
            <div>
              <h1 className="font-black text-xl text-foreground">Market Sentiment Analytics</h1>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {TRACKED_SYMBOLS.length} assets · {allAggs.length} live signals · {lastUpdate.toLocaleTimeString()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Market F&G pill */}
            {market && (
              <button
                onClick={() => navigateTo(TABS[1])}
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl border hover:opacity-80 transition-opacity"
                style={{ background: `${fgMeta.color}10`, borderColor: `${fgMeta.color}25` }}>
                <span>{fgMeta.icon}</span>
                <div className="text-left">
                  <p className="text-[10px] font-black leading-tight" style={{ color: fgMeta.color }}>
                    {market.index} — {fgMeta.label}
                  </p>
                  <p className="text-[9px] text-muted-foreground">Market F&G</p>
                </div>
              </button>
            )}

            {/* Alert bell with badge */}
            <button onClick={() => navigateTo(TABS[4])}
              className="relative p-2 rounded-xl border border-border text-muted-foreground hover:text-foreground transition-colors">
              <Bell className="h-4 w-4" />
              {hasExtremeAlert && (
                <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-red-400 shadow-[0_0_6px_#ef4444]" />
              )}
            </button>

            <button onClick={handleRefresh} disabled={refreshing}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:text-foreground transition-all disabled:opacity-50">
              <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        <APIBanner />

        {/* Tab bar */}
        <div className="flex gap-0 overflow-x-auto scrollbar-hide -mb-px">
          {TABS.map(tab => {
            const isActive   = activeTab === tab.id;
            const isAlertTab = tab.id === 'alerts' && hasExtremeAlert;
            return (
              <button
                key={tab.id}
                onClick={() => navigateTo(tab)}
                className={cn(
                  'relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold whitespace-nowrap border-b-2 transition-all',
                  isActive
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                )}>
                <span className="text-base">{tab.emoji}</span>
                <span className="hidden sm:inline">{tab.label}</span>
                {isAlertTab && (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 absolute top-1.5 right-1" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Page content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

          {/* §P1: Beginner guide on first visit */}
          {showGuide && <SentimentGuide onDismiss={dismissGuide} />}

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}>

              {activeTab === 'dashboard' && (
                <SentimentDashboard
                  selectedSymbol={selectedSymbol}
                  onSelectSymbol={setSelectedSymbol}
                />
              )}
              {activeTab === 'feargreed' && <SentimentFearGreed />}
              {activeTab === 'social'    && <SentimentSocial />}
              {activeTab === 'news'      && <SentimentNews />}
              {activeTab === 'alerts'    && <SentimentAlerts />}
              {activeTab === 'signals'   && <SentimentSignals />}

            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
