/**
 * NFTPage.tsx — NFT & Metaverse Analytics main hub
 * Route: /nft  (nested sub-routes via /*)
 *
 * Renders:
 *  - Dashboard    /nft            — marketplace selector, KPIs, top collections, trending mints
 *  - Collection   /nft/collection/:slug
 *  - Item         /nft/item/:collection/:tokenId
 *  - Live Sales   /nft/live-sales
 *  - Watchlist    /nft/watchlist
 *  - Whales       /nft/whales
 *  - Trading Sim  /nft/simulate
 *  - Wallet Track /nft/wallets
 *  - Alerts       /nft/alerts
 */
import React, { useEffect, useState, useMemo } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Grid3X3, Activity, Wallet, TrendingUp, Bell, Eye, Star,
  Zap, BarChart3, Shield, RefreshCw, Globe, ShoppingBag, HelpCircle,
} from 'lucide-react';
import { useNftStore, registerNftNotifyHandler } from '../../lib/nftStore';
import { getNFTAlertEngine } from '../../lib/nftAlertEngine';
import { useAuthStore } from '../../lib/authStore';
import { NFT_CHAIN_META } from '../../lib/nftTypes';
import { fmtUsd, fmtNative } from './nftUtils';
import { toast } from 'sonner';
import { NFTDashboard }        from './NFTDashboard';
import { CollectionDetailPage } from './CollectionDetailPage';
import { NFTItemPage }         from './NFTItemPage';
import { LiveSalesPage }       from './LiveSalesPage';
import { NFTWatchlistPage }    from './NFTWatchlistPage';
import { NFTWhalesPage }       from './NFTWhalesPage';
import { NFTTradingPage }      from './NFTTradingPage';
import { NFTWalletPage }       from './NFTWalletPage';
import { NFTAlertsPage }       from './NFTAlertsPage';
import { MetaversePage }       from './MetaversePage';
import { NFTFinalReport }      from './NFTFinalReport';
import { NFTGuide, hasSeenNFTGuide } from './NFTGuide';
import { cn } from '@/lib/utils';

// ── Top-level tabs ─────────────────────────────────────────────────────────────

const TABS = [
  { id: 'dashboard',  label: '📊 Dashboard',   path: '/nft' },
  { id: 'live-sales', label: '⚡ Live Sales',  path: '/nft/live-sales' },
  { id: 'metaverse',  label: '🌐 Metaverse',   path: '/nft/metaverse' },
  { id: 'watchlist',  label: '👁️ Watchlist',   path: '/nft/watchlist' },
  { id: 'whales',     label: '🐋 Whales',      path: '/nft/whales' },
  { id: 'simulate',   label: '🎮 Trading Sim', path: '/nft/simulate' },
  { id: 'wallets',    label: '👜 Wallets',     path: '/nft/wallets' },
  { id: 'alerts',     label: '🔔 Alerts',      path: '/nft/alerts' },
  { id: 'report',     label: '📋 Report',      path: '/nft/report'   },
];

function activeTab(pathname: string) {
  if (pathname === '/nft') return 'dashboard';
  const match = TABS.find(t => t.path !== '/nft' && pathname.startsWith(t.path));
  return match?.id ?? 'dashboard';
}

export function NFTPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { seedCollections, startPolling, stopPolling, getGlobalStats } = useNftStore();
  const [stats, setStats] = useState(() => getGlobalStats());
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    seedCollections();
    startPolling();

    // §7: Wire NFT store notifications to toast
    registerNftNotifyHandler(n => {
      const TYPE_MAP: Record<string, 'success' | 'info' | 'error' | 'warning'> = {
        trade:        'success',
        achievement:  'success',
        system:       'info',
        liquidation:  'error',
      };
      const fn = TYPE_MAP[n.type] ?? 'info';
      toast[fn](`${n.title}`, { description: n.message, duration: 5_000 });
    });

    // §7: Wire NFT alert engine notifications to toast
    const alertEngine = getNFTAlertEngine();
    alertEngine.onNotification(n => {
      const TYPE_MAP: Record<string, 'success' | 'info' | 'warning' | 'error'> = {
        nft_alert:   'info',
        whale_alert: 'warning',
        price_drop:  'error',
        price_pump:  'success',
      };
      const fn = TYPE_MAP[n.type] ?? 'info';
      toast[fn](`${n.title}`, { description: n.message, duration: 6_000 });
    });

    const id = setInterval(() => setStats(getGlobalStats()), 5_000);
    return () => { stopPolling(); clearInterval(id); };
  }, []);

  // Auto-show guide on first visit
  useEffect(() => {
    if (!hasSeenNFTGuide()) {
      const timer = setTimeout(() => setShowGuide(true), 600);
      return () => clearTimeout(timer);
    }
  }, []);

  const curTab = activeTab(location.pathname);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="shrink-0 px-4 sm:px-6 pt-5 pb-0 border-b border-border"
        style={{ background: 'var(--bg-secondary)' }}>
        <div className="max-w-7xl mx-auto">
          {/* Title */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-black text-foreground flex items-center gap-2">
                <span className="text-2xl">🖼️</span>
                NFT & Metaverse Analytics
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {stats.totalCollections} collections · {stats.verifiedCollections} verified · {stats.blueChipCount} blue-chips
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowGuide(true)}
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border border-white/10 text-primary/80 hover:text-primary hover:border-primary/30 transition-colors">
                <HelpCircle className="h-3.5 w-3.5" /> New to NFTs?
              </button>
              <Link to="/nft/watchlist"
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border border-white/10 text-muted-foreground hover:text-foreground transition-colors">
                <Eye className="h-3.5 w-3.5" /> Watchlist
              </Link>
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE
              </span>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex gap-0.5 overflow-x-auto scrollbar-hide -mb-px">
            {TABS.map(tab => {
              const isActive = tab.id === curTab;
              return (
                <button key={tab.id} onClick={() => navigate(tab.path)}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap shrink-0',
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-white/20',
                  )}>
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div key={curTab} className="h-full"
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}>
            <Routes>
              <Route index                       element={<NFTDashboard />} />
              <Route path="collection/:slug"     element={<CollectionDetailPage />} />
              <Route path="item/:slug/:tokenId"  element={<NFTItemPage />} />
              <Route path="live-sales"           element={<LiveSalesPage />} />
              <Route path="metaverse"            element={<MetaversePage />} />
              <Route path="watchlist"            element={<NFTWatchlistPage />} />
              <Route path="whales"               element={<NFTWhalesPage />} />
              <Route path="simulate"             element={<NFTTradingPage />} />
              <Route path="wallets"              element={<NFTWalletPage />} />
              <Route path="wallets/:id"          element={<NFTWalletPage />} />
              <Route path="alerts"               element={<NFTAlertsPage />} />
              <Route path="report"               element={<NFTFinalReport />} />
              <Route path="*"                    element={<Navigate to="/nft" replace />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Beginner guide (auto-shows on first visit) */}
      {showGuide && <NFTGuide onClose={() => setShowGuide(false)} />}
    </div>
  );
}
