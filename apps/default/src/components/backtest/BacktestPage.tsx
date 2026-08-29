/**
 * BacktestPage.tsx — Parts 3 + 4 + 5 + 6 + 7 complete
 *
 * Tabs:  [Backtest] [Optimize ✨]
 *
 * Backtest tab layout (left → right):
 *   [History Sidebar (collapsible)] | [Config Panel] | [Results + Trade Log]
 *
 * Optimize tab: OptimizePage — shares BacktestConfig; Apply Best patches config.
 *
 * Part 4.1 — Save Strategy: modal after successful run
 * Part 4.2 — Load Strategy: slide-in panel from sidebar
 * Part 5   — Compare: overlay equity curves + metrics table
 * Part 6.1 — Queue: enqueueBacktest() → max 3 concurrent, QueueBar
 * Part 6.2 — Notifications: useBacktestNotifications hook → Sonner toasts
 * Part 7   — Optimize: grid-search optimizer tab with live results table + chart
 */

import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FlaskConical, Plus, History, Trash2, X, RefreshCw,
  Database, Cpu, Save, FolderOpen, GitCompare, Sparkles,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../lib/authStore';
import { useSubscriptionAccess } from '@/hooks/useSubscriptionAccess';
import { toast } from 'sonner';
import { useBacktestStore } from '../../lib/backtestStore';
import { enqueueBacktest } from '../../lib/backtestQueue';
import type { EnrichedBacktestOutput } from '../../lib/backtestRunner';
import { useBacktestNotifications } from '../../hooks/useBacktestNotifications';
// Part 11.1 — Result cache
import { runCachedBacktest, useCacheStatus } from '../../lib/backtestCache';
// Part 11.2 — Background job tracking
import { useBackgroundJobStore } from '../../lib/backgroundJobStore';
// Part 12 — Error handling
import { resolveError, validateParamsFull, type ErrorInfo } from '../../lib/backtestErrors';
import { BacktestErrorMessage } from './BacktestErrorMessage';
import { BacktestConfigPanel } from './BacktestConfigPanel';
import { BacktestResultsPanel } from './BacktestResultsPanel';
import { TradeListTable } from './TradeListTable';
import { StrategySelectorModal } from './StrategySelectorModal';
import { CodeEditorModal } from './CodeEditorModal';
import { SaveStrategyModal } from './SaveStrategyModal';
import { LoadStrategyPanel } from './LoadStrategyPanel';
import { CompareModal } from './CompareModal';
import { QueueBar } from './QueueBar';
import { OptimizePage } from './OptimizePage';
import { RecentBacktestsSidebar } from './RecentBacktestsSidebar';
import { PostRunActionBar } from './PostRunActionBar';
import { MobileBacktestLayout, useIsMobile } from './MobileBacktestLayout';
import { BacktestVerificationPanel } from './BacktestVerificationPanel';
import type { BacktestConfig } from './BacktestConfigPanel';

import type { Strategy } from '../../lib/strategyTypes';
import type { BacktestSession } from '../../lib/backtestTypes';
import { DEFAULT_INITIAL_BALANCE, DEFAULT_FEE_RATE } from '../../lib/backtestTypes';
import { useBotBacktestContext } from '../../lib/botBacktestContext';
import { BacktestGuide } from './BacktestGuide';

type PageTab = 'backtest' | 'optimize';

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT CONFIG
// ─────────────────────────────────────────────────────────────────────────────

function getDefaultConfig(): BacktestConfig {
  const today   = new Date();
  const yearAgo = new Date(today);
  yearAgo.setFullYear(today.getFullYear() - 1);

  return {
    mode:            'my_strategy',
    strategyId:      null,
    strategyName:    '',
    strategyType:    'grid',
    params: {
      coinId:         'bitcoin',
      symbol:         'BTC/USDT',
      timeframe:      '1h',
      startDate:      yearAgo.toISOString().slice(0, 10),
      endDate:        today.toISOString().slice(0, 10),
      initialBalance: DEFAULT_INITIAL_BALANCE,
      feeRate:        DEFAULT_FEE_RATE,
      strategyConfig: {},
    },
    enableSlippage:  true,
    includeWeekends: true,
    customCode:      '',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// (Session history rendering is now handled by RecentBacktestsSidebar)
// ─────────────────────────────────────────────────────────────────────────────

function _unused_SessionHistoryItem({
  session, isActive, onClick, onDelete,
}: {
  session:  BacktestSession;
  isActive: boolean;
  onClick:  () => void;
  onDelete: () => void;
}) {
  const ret    = session.metrics?.totalReturn;
  const hasRet = ret !== undefined && ret !== null;
  const isPos  = hasRet && ret >= 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -6 }}
      onClick={onClick}
      className={cn(
        'group flex items-start gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-200',
        isActive
          ? 'bg-primary/10 border border-primary/20'
          : 'hover:bg-secondary/30 border border-transparent',
      )}
    >
      <div className="flex-1 min-w-0">
        <p className={cn('text-xs font-medium truncate', isActive ? 'text-primary' : 'text-foreground')}>
          {session.sessionName}
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {session.params.symbol} · {session.params.timeframe}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <span className={cn(
            'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
            session.status === 'completed'
              ? 'bg-green-500/15 text-green-400'
              : session.status === 'running' || session.status === 'pending'
              ? 'bg-primary/15 text-primary'
              : 'bg-red-500/15 text-red-400',
          )}>
            {session.status}
          </span>
          {hasRet && (
            <span className={cn('text-[10px] font-semibold', isPos ? 'text-green-400' : 'text-red-400')}>
              {isPos ? '+' : ''}{ret!.toFixed(1)}%
            </span>
          )}
        </div>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDelete(); }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-all"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────

export function BacktestPage() {
  const { user }                                           = useAuthStore();
  const { submitBacktest, getUserSessions, deleteSession } = useBacktestStore();
  const { hasAccess: canBacktest } = useSubscriptionAccess('pro');

  // ── Part 10: Mobile detection ────────────────────────────────────────────
  const isMobile = useIsMobile();
  const showVerify = typeof window !== 'undefined' && window.location.search.includes('verify=1');

  // ── Tab ─────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<PageTab>('backtest');

  // ── Core state ──────────────────────────────────────────────────────────
  const [config,          setConfig]          = useState<BacktestConfig>(getDefaultConfig());
  const [errors,          setErrors]          = useState<ErrorInfo[]>([]);
  const [isRunning,       setIsRunning]       = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [enrichedResult,  setEnrichedResult]  = useState<EnrichedBacktestOutput | null>(null);
  const [lastRunOk,       setLastRunOk]       = useState<boolean | null>(null);

  // ── Modal / panel state ─────────────────────────────────────────────────
  const [marketOpen,  setMarketOpen]  = useState(false);
  const [codeOpen,    setCodeOpen]    = useState(false);
  const [saveOpen,    setSaveOpen]    = useState(false);
  const [loadOpen,    setLoadOpen]    = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // ── Part 6.2 — register notification callbacks ──────────────────────────
  useBacktestNotifications({
    onComplete: (job) => {
      // If the completing job is our current one, update the result
      if (job.result) {
        setEnrichedResult(job.result);
        setLastRunOk(true);
      }
    },
  });

  // ── Spec 6.1 — Bot Backtest Bridge: pre-load config from wizard ─────────
  const { botBacktestConfig, clearBotBacktestConfig, botOriginName } = useBotBacktestContext();
  const [botBannerDismissed, setBotBannerDismissed] = React.useState(false);
  React.useEffect(() => {
    if (botBacktestConfig) {
      setConfig(botBacktestConfig);
      setBotBannerDismissed(false);
      clearBotBacktestConfig();
    }
  }, []); // intentionally only on mount

  // ── Part 11.1 — Cache status for current config ─────────────────────────
  const cacheInput = { params: { ...config.params, strategyConfig: {} }, strategyType: config.strategyType };
  const { isCached, ttlLabel, invalidate: invalidateCache } = useCacheStatus(cacheInput);

  // ── Part 11.2 — Background job store ────────────────────────────────────
  const bgJobStore = useBackgroundJobStore();

  // Badge count for the History button
  const sessionCount = user?.id
    ? getUserSessions(user.id, {
        search: '', statuses: [], strategyTypes: [],
        symbols: [], timeframes: [], sortBy: 'newest',
      }).length
    : 0;

  // ── Run backtest — Part 11.1 cached + Part 11.2 background ──────────────
  const handleRun = useCallback(async (forceRefresh = false) => {
    if (!user?.id) return;
    if (!canBacktest) {
      toast('Backtesting requires Pro subscription.', {
        description: 'Upgrade to unlock strategy backtesting.',
        action: { label: 'Upgrade', onClick: () => window.location.href = '/subscription?plan=pro' },
        duration: 6000,
      });
      return;
    }

    // Part 12 — full typed validation
    const validation = validateParamsFull({
      initialBalance: config.params.initialBalance,
      startDate:      config.params.startDate,
      endDate:        config.params.endDate,
    });
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    setErrors([]);
    setIsRunning(true);
    setLastRunOk(null);

    const jobName = config.strategyName?.trim()
      || `${config.params.symbol} ${config.params.timeframe} ${config.strategyType}`;

    const runParams = { params: { ...config.params, strategyConfig: {} }, strategyType: config.strategyType };

    // Register with background job store (11.2)
    const jobId = `bt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    bgJobStore.registerJob({
      id:           jobId,
      userId:       user.id,
      name:         jobName,
      strategyType: config.strategyType,
      params:       runParams.params,
    });

    try {
      // Part 11.1 — use cache-aware runner
      const { output, cacheStatus, savedMs } = await runCachedBacktest(runParams, forceRefresh);

      // Update background job store
      bgJobStore.completeJob(jobId, output);

      setEnrichedResult(output);
      setLastRunOk(true);

      // Show cache-hit toast
      if (cacheStatus === 'hit') {
        const { toast } = await import('sonner');
        toast.success('Result loaded from cache', {
          description: `Saved ~${Math.round(savedMs / 1000)}s · expires in ${ttlLabel} · Click ↺ to force refresh`,
          icon: '⚡',
          duration: 4000,
          action: { label: 'Refresh', onClick: () => handleRun(true) },
        });
      }

      // Persist to session history store
      const storeResult = submitBacktest({
        userId:       user.id,
        params:       runParams.params,
        strategyId:   config.strategyId,
        strategyType: config.strategyType,
        sessionName:  jobName,
        priority:     1,
      });

      if (storeResult.ok && storeResult.sessionId) {
        setActiveSessionId(storeResult.sessionId);
      }

    } catch (err) {
      const info = resolveError(err);
      const msg  = info.message;
      bgJobStore.failJob(jobId, msg);
      setErrors([info]);
      setLastRunOk(false);
    } finally {
      setIsRunning(false);
    }
  }, [user?.id, config, submitBacktest, bgJobStore, ttlLabel]);

  // ── Load strategy (Part 4.2) ────────────────────────────────────────────
  const handleLoadStrategy = useCallback((strategy: Strategy) => {
    setConfig(c => ({
      ...c,
      mode:         'marketplace',
      strategyId:   strategy.id,
      strategyName: strategy.name,
      strategyType: strategy.type,
    }));
  }, []);

  // ── Save strategy callback (Part 4.1) ───────────────────────────────────
  const handleStrategySaved = useCallback((id: string, name: string) => {
    setConfig(c => ({ ...c, strategyId: id, strategyName: name }));
  }, []);

  // ── Marketplace select ──────────────────────────────────────────────────
  const handleSelectStrategy = useCallback((strategy: Strategy) => {
    setConfig(c => ({
      ...c,
      mode:         'marketplace',
      strategyId:   strategy.id,
      strategyName: strategy.name,
      strategyType: strategy.type,
    }));
  }, []);

  // ── Custom code save ─────────────────────────────────────────────────────
  const handleSaveCode = useCallback((code: string) => {
    setConfig(c => ({
      ...c,
      mode:         'custom_code',
      strategyType: 'custom',
      customCode:   code,
    }));
  }, []);

  // ── Part 7: Apply Best from optimizer ────────────────────────────────────
  const handleApplyBest = useCallback((patch: Record<string, unknown>) => {
    setConfig(c => ({
      ...c,
      params: {
        ...c.params,
        strategyConfig: { ...c.params.strategyConfig, ...patch },
      },
    }));
    // Switch back to backtest tab so user can immediately run
    setActiveTab('backtest');
  }, []);

  // ── New / reset ──────────────────────────────────────────────────────────
  const handleNewBacktest = useCallback(() => {
    setConfig(getDefaultConfig());
    setActiveSessionId(null);
    setEnrichedResult(null);
    setErrors([]);
    setLastRunOk(null);
  }, []);

  // ── Delete session ───────────────────────────────────────────────────────
  const handleDeleteSession = useCallback((sessionId: string) => {
    if (!user?.id) return;
    deleteSession(sessionId, user.id);
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
      setEnrichedResult(null);
    }
  }, [user?.id, deleteSession, activeSessionId]);

  const tradesToShow = enrichedResult?.trades ?? [];
  const hasResult    = enrichedResult !== null && !isRunning;

  // ── P1.1: Guide state ───────────────────────────────────────────────────
  const [showGuide, setShowGuide] = useState(() => {
    return !localStorage.getItem('cv_backtest_guide_dismissed');
  });
  const handleGuideDismiss = () => {
    setShowGuide(false);
    localStorage.setItem('cv_backtest_guide_dismissed', 'true');
  };

  return (
    /*
     * Part 13: navy base with subtle gold radial glow at top-right
     * mirrors the CryptoVerse HQ brand aesthetic
     */
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse 70% 50% at 90% 0%, rgba(255,215,0,0.06) 0%, transparent 70%), var(--background)',
      }}
    >

      {/* ── Spec 6.1: Bot-origin banner ── */}
      {config.strategyName.includes('Bot Backtest') && !botBannerDismissed && (
        <div
          className="flex items-center gap-2.5 px-5 py-2.5 border-b shrink-0 text-xs"
          style={{ background: 'rgba(96,165,250,0.08)', borderColor: 'rgba(96,165,250,0.18)' }}
        >
          <span className="text-base">🤖</span>
          <span style={{ color: '#93c5fd' }}>
            Config loaded from <strong className="text-blue-300">{config.strategyName.replace(' (Bot Backtest)', '')}</strong> — ready to test your bot's strategy.
          </span>
          <button
            onClick={() => setBotBannerDismissed(true)}
            className="ml-auto text-blue-400/50 hover:text-blue-400 transition-colors"
          >✕</button>
        </div>
      )}

      {/* ── Page Header (Part 13: navy card surface) ── */}
      <header
        className="flex items-center justify-between px-6 py-4 border-b shrink-0 gap-3 backdrop-blur-sm"
        style={{ borderColor: 'rgba(255,215,0,0.08)', background: 'var(--bg-card)' }}
      >
        <div className="flex items-center gap-3">
          {/* Gold flask icon badge */}
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(255,215,0,0.10)', border: '1px solid rgba(255,215,0,0.22)' }}
          >
            <FlaskConical className="h-5 w-5" style={{ color: '#FFD700' }} />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-lg font-bold text-foreground leading-none">Backtest Engine</h1>
            <p className="text-xs mt-0.5" style={{ color: '#9CA3AF' }}>
              Simulate with real CoinGecko data
            </p>
          </div>

          {/* ── Part 7: Tab switcher ── */}
          <div
            className="flex items-center gap-1 ml-2 rounded-xl p-1"
            style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,215,0,0.10)' }}
          >
            <button
              onClick={() => setActiveTab('backtest')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={activeTab === 'backtest' ? {
                background: 'rgba(255,215,0,0.12)',
                color: '#FFD700',
                border: '1px solid rgba(255,215,0,0.22)',
              } : { color: '#9CA3AF' }}
            >
              <FlaskConical className="h-3.5 w-3.5" />
              Backtest
            </button>
            <button
              onClick={() => setActiveTab('optimize')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={activeTab === 'optimize' ? {
                background: 'rgba(255,215,0,0.12)',
                color: '#FFD700',
                border: '1px solid rgba(255,215,0,0.22)',
              } : { color: '#9CA3AF' }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Optimize
            </button>
          </div>
        </div>

        {/* Header action bar */}
        <div className="flex items-center gap-1.5 flex-wrap justify-end">

          {/* Data source badge */}
          <AnimatePresence>
            {hasResult && enrichedResult && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={cn(
                  'hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border',
                  enrichedResult.data.source === 'coingecko'
                    ? 'bg-green-500/10 text-green-400 border-green-500/20'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                )}
              >
                {enrichedResult.data.source === 'coingecko'
                  ? <><Database className="h-3.5 w-3.5" /> Live</>
                  : <><Cpu className="h-3.5 w-3.5" /> Simulated</>}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Part 11.1 — Cache status badge */}
          {isCached && (
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              Cached · {ttlLabel}
            </div>
          )}

          {/* Part 11.1 — Force refresh */}
          {isCached && (
            <button
              onClick={() => handleRun(true)}
              disabled={isRunning}
              title="Force re-run (bypass cache)"
              className="p-2 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-secondary/40 transition-colors disabled:opacity-40"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Compare — Part 5 */}
          <button
            onClick={() => setCompareOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground bg-secondary/30 hover:bg-secondary/60 border border-transparent hover:border-border transition-all"
          >
            <GitCompare className="h-4 w-4" />
            <span className="hidden sm:inline">Compare</span>
          </button>

          {/* Load Strategy — Part 4.2 */}
          <button
            onClick={() => setLoadOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground bg-secondary/30 hover:bg-secondary/60 border border-transparent hover:border-border transition-all"
          >
            <FolderOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Load</span>
          </button>

          {/* History */}
          <button
            onClick={() => setShowHistory(s => !s)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all',
              showHistory
                ? 'bg-primary/10 text-primary border border-primary/20'
                : 'text-muted-foreground hover:text-foreground bg-secondary/30 hover:bg-secondary/60',
            )}
          >
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">History</span>
            {sessionCount > 0 && (
              <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
                {sessionCount}
              </span>
            )}
          </button>

          {/* New */}
          <button
            onClick={handleNewBacktest}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground bg-secondary/30 hover:bg-secondary/60 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New</span>
          </button>

          {/* Re-run */}
          {hasResult && (
            <button
              onClick={handleRun}
              disabled={isRunning}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground bg-secondary/30 hover:bg-secondary/60 transition-colors disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" />
              <span className="hidden sm:inline">Re-run</span>
            </button>
          )}

          {/* Save Strategy — Part 4.1 / Part 13: gold CTA */}
          <AnimatePresence>
            {hasResult && (
              <motion.button
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                onClick={() => setSaveOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-bold transition-all active:scale-[0.97]"
                style={{
                  background: 'linear-gradient(135deg, #FFD700 0%, #FFA800 100%)',
                  color: '#0b0e14',
                  boxShadow: '0 3px 14px rgba(255,215,0,0.30)',
                }}
              >
                <Save className="h-4 w-4" />
                Save
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* ── P1.1: Backtest quick-start guide ── */}
      {showGuide && <BacktestGuide onDismiss={handleGuideDismiss} />}

      {/* ── Part 15: Verification Panel (?verify=1) ── */}
      {showVerify && (
        <div className="flex-1 overflow-y-auto">
          <BacktestVerificationPanel />
        </div>
      )}

      {/* ── Part 7: Optimize Tab ── */}
      {!showVerify && activeTab === 'optimize' && (
        <div className="flex-1 overflow-hidden">
          <OptimizePage config={config} onApplyBest={handleApplyBest} />
        </div>
      )}

      {/* ── Main Area (Backtest Tab) ── */}
      {!showVerify && activeTab === 'backtest' && <div className="flex-1 flex overflow-hidden">

        {/* ── Part 8: Recent Backtests Sidebar ── */}
        <AnimatePresence>
          {showHistory && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 272, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: 'spring', damping: 24, stiffness: 300 }}
              className="border-r border-border bg-card/50 flex flex-col overflow-hidden shrink-0"
            >
              {/* Sidebar header with close */}
              <div className="flex items-center justify-between px-3 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <History className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">History</span>
                </div>
                <button
                  onClick={() => setShowHistory(false)}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Recent backtests widget */}
              <div className="flex-1 overflow-y-auto">
                <RecentBacktestsSidebar
                  onLoad={(session) => {
                    // Restore the session's params into config
                    setConfig(c => ({
                      ...c,
                      strategyType: session.strategyType,
                      strategyId:   session.strategyId,
                      params: { ...c.params, ...session.params },
                    }));
                    setActiveSessionId(session.id);
                    setShowHistory(false);
                  }}
                />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* ── Part 10: Responsive split layout ── */}
        {isMobile ? (
          /* Mobile: swipe tabs */
          <MobileBacktestLayout
            isRunning={isRunning}
            hasResult={hasResult}
            onRunClick={handleRun}
            configPanel={
              <BacktestConfigPanel
                config={config}
                onChange={setConfig}
                onRun={handleRun}
                onOpenMarket={() => setMarketOpen(true)}
                onOpenCode={() => setCodeOpen(true)}
                isRunning={isRunning}
                errors={errors}
                onErrorAction={(actionId, _code) => {
                  if (actionId === 'open_code_editor') setCodeOpen(true);
                  else if (actionId === 'retry' || actionId === 'wait_retry') handleRun();
                  else if (actionId === 'fix_balance') {
                    setConfig(c => ({ ...c, params: { ...c.params, initialBalance: 1000 } }));
                    setErrors([]);
                  }
                }}
                onDismissErrors={() => setErrors([])}
                lastRunOk={lastRunOk}
              />
            }
            resultsPanel={
              <>
                {user?.id && <QueueBar userId={user.id} />}
                <BacktestResultsPanel
                  enrichedResult={enrichedResult}
                  config={config}
                  isRunning={isRunning}
                />
              </>
            }
            actionBar={
              hasResult && enrichedResult ? (
                <PostRunActionBar
                  enrichedResult={enrichedResult}
                  config={config}
                  sessionCount={sessionCount}
                />
              ) : undefined
            }
            tradeLog={
              hasResult && tradesToShow.length > 0 ? (
                <div className="h-full overflow-x-auto overflow-y-auto">
                  <div className="px-4 py-4 min-w-[640px]">
                    <div className="flex items-center gap-2 mb-3">
                      <h3 className="text-sm font-semibold text-foreground">Trade Log</h3>
                      <span className="text-xs text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-full">
                        {tradesToShow.length} trades
                      </span>
                    </div>
                    <TradeListTable trades={tradesToShow} />
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground/50">
                  No trades yet — run a backtest first.
                </div>
              )
            }
          />
        ) : (
          /* Desktop: three-column split */
          <div className="flex-1 flex overflow-hidden min-w-0">

            {/* Config panel */}
            <div className="w-80 shrink-0 border-r border-border bg-card/30 overflow-hidden flex flex-col">
              <BacktestConfigPanel
                config={config}
                onChange={setConfig}
                onRun={handleRun}
                onOpenMarket={() => setMarketOpen(true)}
                onOpenCode={() => setCodeOpen(true)}
                isRunning={isRunning}
                errors={errors}
                onErrorAction={(actionId, _code) => {
                  if (actionId === 'open_code_editor') setCodeOpen(true);
                  else if (actionId === 'retry' || actionId === 'wait_retry') handleRun();
                  else if (actionId === 'fix_balance') {
                    setConfig(c => ({ ...c, params: { ...c.params, initialBalance: 1000 } }));
                    setErrors([]);
                  }
                }}
                onDismissErrors={() => setErrors([])}
                lastRunOk={lastRunOk}
              />
            </div>

            {/* Results + Trade Log */}
            <div className="flex-1 flex flex-col overflow-hidden min-w-0">

              {/* Part 6.1 — Queue bar */}
              {user?.id && <QueueBar userId={user.id} />}

              {/* Results panel */}
              <div className="flex-1 overflow-hidden">
                <BacktestResultsPanel
                  enrichedResult={enrichedResult}
                  config={config}
                  isRunning={isRunning}
                />
              </div>

              {/* Part 9 — Post-run integration actions */}
              <AnimatePresence>
                {hasResult && enrichedResult && (
                  <PostRunActionBar
                    enrichedResult={enrichedResult}
                    config={config}
                    sessionCount={sessionCount}
                  />
                )}
              </AnimatePresence>

              {/* Trade log */}
              <AnimatePresence>
                {hasResult && tradesToShow.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className="border-t border-border bg-card/30"
                  >
                    <div className="max-h-80 overflow-y-auto">
                      <div className="px-6 py-4">
                        <div className="flex items-center gap-2 mb-4">
                          <h3 className="text-sm font-semibold text-foreground">Trade Log</h3>
                          <span className="text-xs text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-full">
                            {tradesToShow.length} trades
                          </span>
                        </div>
                        <TradeListTable trades={tradesToShow} />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      }

      {/* ── Modals & Panels ── */}

      {/* Part 4.1 — Save Strategy */}
      {saveOpen && enrichedResult && (
        <SaveStrategyModal
          open={saveOpen}
          onClose={() => setSaveOpen(false)}
          enrichedResult={enrichedResult}
          config={config}
          onSaved={handleStrategySaved}
        />
      )}

      {/* Part 4.2 — Load Strategy */}
      <LoadStrategyPanel
        open={loadOpen}
        onClose={() => setLoadOpen(false)}
        onLoad={handleLoadStrategy}
      />

      {/* Part 5 — Compare */}
      <CompareModal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        currentResult={enrichedResult}
        currentName={
          config.strategyName?.trim() ||
          `${config.params.symbol} ${config.params.timeframe} ${config.strategyType}`
        }
      />

      {/* Existing modals */}
      <StrategySelectorModal
        open={marketOpen}
        onClose={() => setMarketOpen(false)}
        onSelect={handleSelectStrategy}
      />
      <CodeEditorModal
        open={codeOpen}
        code={config.customCode}
        onClose={() => setCodeOpen(false)}
        onChange={code => setConfig(c => ({ ...c, customCode: code }))}
        onSave={handleSaveCode}
      />
    </div>
  );
}
