/**
 * OnChainPage.tsx — CryptoVerse HQ On-Chain Analytics Hub
 *
 * Spec §3.1 dashboard layout:
 *  - Network selector (5 chains with live status)
 *  - Live Whale Alerts (card feed with View/Track/Alert actions)
 *  - Smart Money Tracker table (top 5 wallets)
 *  - Exchange Flow Analysis summary
 *
 * Sub-routes linked from this hub:
 *  /on-chain/smart-money      → SmartMoneyPage
 *  /on-chain/exchange-flow    → ExchangeFlowPage
 *  /on-chain/alerts           → AlertsPage
 *  /on-chain/wallet/:address  → WalletTrackerPage
 */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Globe, Bell, ArrowRight, TrendingUp, TrendingDown,
  Activity, Shield, Zap, Users, RefreshCw, Lock,
} from 'lucide-react';
import { EngineStatsPanel } from './EngineStatsPanel';
import { ApiStatusPanel }  from './ApiStatusPanel';
import { OnChainGuide }    from './OnChainGuide';
import { AIInsightsPanel } from './AIInsightsPanel';
import { useOnChainStore } from '../../lib/onChainStore';
import { useAuthStore } from '../../lib/authStore';
import { WhaleFeed }           from './WhaleFeed';
import { SmartMoneyWallets }   from './SmartMoneyWallets';
import { AlertsManager }       from './AlertsManager';
import { ExchangeFlows }       from './ExchangeFlows';
import { TrendingTokens }      from './TrendingTokens';
import {
  ALL_CHAINS, CHAIN_DISPLAY, SMART_MONEY_WALLETS,
  generateExchangeFlows, fmtUsd, timeAgo,
} from './onChainUtils';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Gated feature card (subscription upsell)
// ─────────────────────────────────────────────────────────────────────────────

function GatedFeatureCard({ title, description, plan, upgradeLink }: {
  title: string; description: string; plan: string; upgradeLink: string;
}) {
  const navigate = useNavigate();
  return (
    <div className="rounded-2xl p-6 flex flex-col items-center text-center gap-3"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
      <div className="w-12 h-12 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.2)' }}>
        <Lock className="h-5 w-5" style={{ color: '#FFD700' }} />
      </div>
      <div>
        <p className="font-bold text-sm text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
      <span className="px-3 py-1 rounded-full text-[10px] font-bold"
        style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.25)' }}>
        {plan} Plan Required
      </span>
      <button onClick={() => navigate(upgradeLink)}
        className="px-4 py-2 rounded-xl text-xs font-bold"
        style={{ background: 'linear-gradient(135deg,#FFD700,#FFA800)', color: '#0A1929' }}>
        Upgrade to {plan}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Network selector card
// ─────────────────────────────────────────────────────────────────────────────

type ChainStatus = 'active' | 'partial' | 'inactive';

const CHAIN_STATUS_DEMO: Record<string, ChainStatus> = {
  ethereum: 'active',
  bitcoin:  'active',
  bnb:      'active',
  solana:   'partial',
  polygon:  'active',
};

function NetworkCard({ chain }: { chain: typeof ALL_CHAINS[0] }) {
  const display = CHAIN_DISPLAY[chain];
  const status  = CHAIN_STATUS_DEMO[chain];
  const dot = status === 'active' ? '#34d399' : status === 'partial' ? '#fbbf24' : '#ef4444';
  const label = status === 'active' ? 'Active' : status === 'partial' ? 'Partial' : 'Inactive';

  return (
    <motion.div whileHover={{ y: -2 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="flex flex-col items-center gap-2 px-4 py-3 rounded-2xl cursor-pointer select-none"
      style={{ background: `${display.color}14`, border: `1px solid ${display.color}30` }}>
      <span className="text-2xl font-black" style={{ color: display.color }}>{display.icon}</span>
      <p className="text-xs font-bold text-foreground">{display.name}</p>
      <div className="flex items-center gap-1">
        <div className="w-2 h-2 rounded-full" style={{ background: dot,
          boxShadow: status === 'active' ? `0 0 4px ${dot}` : 'none',
          animation: status === 'active' ? 'pulse 2s infinite' : 'none',
        }} />
        <span className="text-[10px] font-semibold" style={{ color: dot }}>{label}</span>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Exchange flow mini-table
// ─────────────────────────────────────────────────────────────────────────────

function ExchangeFlowMini() {
  const navigate = useNavigate();
  const [flows, setFlows] = useState(generateExchangeFlows().slice(0, 3));

  useEffect(() => {
    const t = setInterval(() => setFlows(generateExchangeFlows().slice(0, 3)), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="rounded-2xl p-4"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Net Inflows/Outflows (Last 24h)</p>
        <button onClick={() => navigate('/on-chain/exchange-flow')}
          className="flex items-center gap-1 text-xs text-primary hover:underline">
          Detailed Analysis <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      <div className="space-y-2.5">
        {flows.map(f => {
          const isInflow = f.net24h >= 0;
          const barW = Math.min(100, Math.abs(f.net24h) / f.inflow24h * 100);
          return (
            <div key={`${f.exchange}-${f.chain}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm">{f.logo}</span>
                <span className="text-sm font-semibold text-foreground w-20 shrink-0">{f.exchange}:</span>
                <div className="flex-1 h-2 rounded-full bg-secondary/30 overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                    style={{
                      width: `${barW}%`,
                      marginLeft: isInflow ? '50%' : `${50 - barW * 0.5}%`,
                      background: isInflow ? '#34d399' : '#ef4444',
                    }} />
                </div>
                <span className="text-xs font-mono font-bold w-20 text-right"
                  style={{ color: isInflow ? '#34d399' : '#ef4444' }}>
                  {isInflow ? '+' : ''}{fmtUsd(f.net24h)}
                </span>
                <span className="text-[10px] font-bold w-16 text-right"
                  style={{ color: isInflow ? '#34d399' : '#ef4444' }}>
                  {isInflow ? '🟢 Inflow' : '🔴 Outflow'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Smart money mini-table
// ─────────────────────────────────────────────────────────────────────────────

function SmartMoneyMini() {
  const navigate = useNavigate();
  const top = SMART_MONEY_WALLETS.slice(0, 4);

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border"
        style={{ background: 'var(--bg-secondary)' }}>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Top Smart Wallets This Week
        </p>
        <button onClick={() => navigate('/on-chain/smart-money')}
          className="flex items-center gap-1 text-xs text-primary hover:underline">
          View All <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      <div className="grid px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border"
        style={{ gridTemplateColumns: '2.5rem 1fr 4.5rem 4rem 4.5rem 5rem', gap: '0.5rem',
          background: 'var(--bg-secondary)' }}>
        <span>Rank</span>
        <span>Wallet</span>
        <span className="text-right">PnL (30d)</span>
        <span className="text-right">Trades</span>
        <span className="text-right">Win Rate</span>
        <span></span>
      </div>

      {top.map((w, i) => {
        const chain = CHAIN_DISPLAY[w.chain];
        const isPos = w.pnl30d >= 0;
        return (
          <div key={w.address}
            className="grid items-center px-4 py-3 hover:bg-secondary/20 transition-colors border-b border-border last:border-0 cursor-pointer"
            style={{ gridTemplateColumns: '2.5rem 1fr 4.5rem 4rem 4.5rem 5rem', gap: '0.5rem' }}
            onClick={() => navigate(`/on-chain/wallet/${w.address}`)}>
            <span className="font-black text-sm text-center"
              style={{ color: i < 3 ? '#FFD700' : 'var(--muted-foreground)' }}>#{i + 1}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold" style={{ color: chain.color }}>{chain.icon}</span>
                <span className="font-mono text-xs text-foreground truncate">{w.address.slice(0, 10)}…</span>
              </div>
              {i < 3 && <p className="text-[10px] text-muted-foreground">
                {i === 0 ? '🏆 3 weeks top' : i === 1 ? '🆕 New this week' : '⭐ Consistent'}
              </p>}
            </div>
            <span className={cn('text-right font-bold text-xs', isPos ? 'text-emerald-400' : 'text-red-400')}>
              {isPos ? '+' : ''}{fmtUsd(Math.abs(w.pnl30d))}
            </span>
            <span className="text-right text-xs text-foreground">{w.trades30d}</span>
            <span className="text-right font-bold text-xs"
              style={{ color: w.winRate >= 70 ? '#34d399' : w.winRate >= 55 ? '#fbbf24' : '#ef4444' }}>
              {w.winRate}%
            </span>
            <div className="flex justify-end">
              <button
                onClick={e => { e.stopPropagation(); navigate(`/on-chain/wallet/${w.address}`); }}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold border transition-all"
                style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.25)' }}>
                Track
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabs
// ─────────────────────────────────────────────────────────────────────────────

type TabId = 'dashboard' | 'whale' | 'smart' | 'alerts' | 'flows' | 'trending';

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export function OnChainPage() {
  const navigate   = useNavigate();
  const { user }   = useAuthStore();
  const userId     = user?.id ?? 'demo_user';

  const getGlobalStats  = useOnChainStore(s => s.getGlobalStats);
  const getUnreadCount  = useOnChainStore(s => s.getUnreadCount);
  const startPollingForUser = useOnChainStore(s => s.startPollingForUser);
  const getUserAlerts   = useOnChainStore(s => s.getUserAlerts);

  // Subscription gating
  const userPlan = user?.plan ?? 'bronze';
  const canSmartMoney = userPlan === 'silver' || userPlan === 'gold';
  const canExchangeFlow = userPlan === 'gold';
  const canAdvancedAlerts = userPlan === 'gold';
  const canExport = false; // Platinum only

  const [activeTab, setActiveTab] = useState<TabId>('dashboard');

  // OnChainGuide — show on first visit
  const ONCHAIN_GUIDE_KEY = 'cv_onchain_guide_dismissed';
  const [showGuide, setShowGuide] = useState(() => {
    try { return localStorage.getItem(ONCHAIN_GUIDE_KEY) !== 'true'; } catch { return true; }
  });

  function dismissGuide() {
    try { localStorage.setItem(ONCHAIN_GUIDE_KEY, 'true'); } catch {}
    setShowGuide(false);
  }

  // Track whether we're using real data or simulated — driven by the store
  const dataSource   = useOnChainStore(s => s.dataSource);
  const usingRealData = dataSource === 'live';

  // Seed demo alerts on first visit
  useEffect(() => {
    const existing = getUserAlerts(userId);
    if (existing.length === 0) {
      useOnChainStore.getState().createAlert({ userId, name: 'Demo Whale Alert', chain: 'ethereum',
        address: '', minValue: 1_000_000, condition: 'above', notifyEmail: false, notifyInApp: true });
      useOnChainStore.getState().createAlert({ userId, name: 'BTC Mega Move', chain: 'bitcoin',
        address: '', minValue: 5_000_000, condition: 'above', notifyEmail: false, notifyInApp: true });
      useOnChainStore.getState().createAlert({ userId, name: 'SOL Dolphin', chain: 'solana',
        address: '', minValue: 100_000, condition: 'above', notifyEmail: false, notifyInApp: true });
    }
    startPollingForUser(userId);
  }, [userId]);

  const stats  = getGlobalStats();
  const unread = getUnreadCount(userId);

  const TABS: { id: TabId; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'Dashboard',       icon: '⛓️' },
    { id: 'whale',     label: 'Whale Feed',       icon: '🐋' },
    { id: 'smart',     label: 'Smart Money',      icon: '🧠' },
    { id: 'alerts',    label: 'My Alerts',        icon: '🔔' },
    { id: 'flows',     label: 'Exchange Flows',   icon: '💱' },
    { id: 'trending',  label: 'Trending',         icon: '🔥' },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* ── Top header ───────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 sm:px-6 pt-5 pb-0 border-b border-border bg-background">

        {/* Title row */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Globe className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-black text-foreground">⛓️ On-Chain Analytics</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Whale tracking · Smart money · Exchange flows · 5 blockchains
            </p>
          </div>

          {/* Alerts quick button */}
          <button onClick={() => navigate('/on-chain/alerts')}
            className="relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border border-border text-muted-foreground hover:text-foreground transition-all">
            <Bell className="h-4 w-4" />
            Alerts
            {unread > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center bg-primary text-primary-foreground">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 overflow-x-auto pb-px hide-scrollbar">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-all',
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}>
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.id === 'alerts' && unread > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-black bg-primary text-primary-foreground">
                  {unread}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="h-full">

            {/* ── DASHBOARD ──────────────────────────────────────────── */}
            {activeTab === 'dashboard' && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

                {/* §P2 — Data Source Badge + Toggle */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className={cn(
                    'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border',
                    usingRealData
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/25',
                  )}>
                    <span className={cn('w-2 h-2 rounded-full', usingRealData ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400')} />
                    {usingRealData ? '🟢 Live Data (Etherscan)' : '🟡 Simulated Data'}
                    <span className="font-normal text-muted-foreground">| 5 chains monitored</span>
                  </div>
                </div>

                {/* §P1 — Beginner education guide on first visit */}
                {showGuide && <OnChainGuide onDismiss={dismissGuide} />}

                {/* Network Selector */}
                <section>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                    Network Selector
                  </p>
                  <div className="grid grid-cols-5 gap-3">
                    {ALL_CHAINS.map(c => <NetworkCard key={c} chain={c} />)}
                  </div>
                </section>

                {/* Summary stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { icon: <Shield className="h-3.5 w-3.5" />,   label: 'Active Alerts',    value: stats.activeAlerts.toString(),   color: '#60a5fa' },
                    { icon: <Activity className="h-3.5 w-3.5" />, label: 'Events Detected',  value: stats.totalEvents.toString(),    color: '#a78bfa' },
                    { icon: <Zap className="h-3.5 w-3.5" />,      label: 'Volume Tracked',   value: fmtUsd(stats.totalVolumeUsd),   color: '#34d399' },
                    { icon: <Users className="h-3.5 w-3.5" />,    label: 'Unread Events',    value: unread.toString(),               color: (unread > 0 ? '#FFD700' : '#6b7280') as string },
                  ].map(s => (
                    <div key={s.label} className="rounded-2xl p-4"
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                      <div className="flex items-center gap-1.5 mb-2" style={{ color: s.color }}>
                        {s.icon}
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{s.label}</span>
                      </div>
                      <p className="font-black text-2xl" style={{ color: s.color }}>{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* Live Whale Alerts section */}
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Whale Alerts
                    </p>
                    <button onClick={() => setActiveTab('whale')}
                      className="flex items-center gap-1 text-xs text-primary hover:underline">
                      View All <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                  <WhaleFeed userId={userId} />
                </section>

                {/* Smart Money + Exchange Flow side-by-side */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <section>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                      Smart Money Tracker
                    </p>
                    {canSmartMoney ? (
                      <SmartMoneyMini />
                    ) : (
                      <GatedFeatureCard
                        title="Smart Money Tracking"
                        description="Follow top-performing wallets across 5 blockchains"
                        plan="Pro"
                        upgradeLink="/subscription"
                      />
                    )}
                  </section>

                  <section>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                      Exchange Flow Analysis
                    </p>
                    {canExchangeFlow ? (
                      <ExchangeFlowMini />
                    ) : (
                      <GatedFeatureCard
                        title="Exchange Flow Analysis"
                        description="Track exchange inflows/outflows to gauge market sentiment"
                        plan="Pro+"
                        upgradeLink="/subscription"
                      />
                    )}
                  </section>
                </div>

                {/* Business Logic Engine Stats Panel */}
                <section>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                    Business Logic Engines
                  </p>
                  <EngineStatsPanel />
                </section>

                {/* ── §P2: AI Insights Panel ── */}
                <section>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                    🤖 AI Analysis
                  </p>
                  <AIInsightsPanel userId={userId} />
                </section>

                {/* API Integration Status — Admin only, hidden from users */}
                {/* <ApiStatusPanel /> */}

              </div>
            )}

            {/* ── SUB TABS ──────────────────────────────────────────── */}
            {activeTab === 'whale' && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
                <WhaleFeed userId={userId} />
              </div>
            )}
            {activeTab === 'smart' && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
                <SmartMoneyWallets />
              </div>
            )}
            {activeTab === 'alerts' && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
                <AlertsManager userId={userId} />
              </div>
            )}
            {activeTab === 'flows' && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
                <ExchangeFlows />
              </div>
            )}
            {activeTab === 'trending' && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
                <TrendingTokens />
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
