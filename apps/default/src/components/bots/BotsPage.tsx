/**
 * BotsPage.tsx — Route /bots
 *
 * Spec 3.1 layout:
 *   Header: "🤖 Trading Bots" + [Create Bot] CTA
 *   Stats row: Total / Active / Profit / Trades
 *   "My Active Bots" section — horizontal list of BotCards
 *   "Bot Templates" row — 5 template cards with [Create] buttons
 *   Filter/search panel (collapsed by default)
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, Bot, Activity,
  TrendingUp, TrendingDown, BarChart2,
  X, SlidersHorizontal, ChevronDown, ChevronRight,
  Play, Pause, Square, Settings, Trash2, ShoppingBag, ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import type { UserBot, BotType, BotStatus } from '../../lib/botTypes';
import { DEFAULT_BOT_FILTERS } from '../../lib/botTypes';
import type { BotFilters } from '../../lib/botTypes';
import { useBotStore } from '../../lib/botStore';
import { useBotTemplateStore } from '../../lib/botTemplateStore';
import type { BotTemplate } from '../../lib/botTypes';
import { useAuthStore } from '../../lib/authStore';
import { BotCard } from './BotCard';
import { BotCreateWizard } from './BotCreateWizard';
import { SubscriptionGate } from '@/components/SubscriptionGate';
import { BotDetailModal } from './BotDetailModal';
import { BotMarketplace } from './BotMarketplace';
import { BotVerificationPanel } from './BotVerificationPanel';
import { CV, BOT_TYPE_META, fmtUsd, fmtPct, fmtRelative } from './BotConstants';

// ─────────────────────────────────────────────────────────────────────────────
// STAT CARD
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div
      className="flex flex-col gap-2 p-4 rounded-2xl border"
      style={{ background: `${color}08`, borderColor: `${color}22` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className="h-3.5 w-3.5" style={{ color: `${color}80` }} />
      </div>
      <span className="text-2xl font-bold tabular-nums" style={{ color }}>{value}</span>
      {sub && <span className="text-[10px]" style={{ color: CV.gray }}>{sub}</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FILTER CHIP
// ─────────────────────────────────────────────────────────────────────────────

function FilterChip({ label, active, color, onClick }: {
  label: string; active: boolean; color: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all"
      style={active
        ? { background: `${color}18`, color, border: `1px solid ${color}40` }
        : { background: 'var(--bg-secondary)', color: CV.gray, border: '1px solid var(--border-color)' }
      }
    >
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INLINE ACTIVE BOT ROW  (spec 3.1 list layout)
// ─────────────────────────────────────────────────────────────────────────────

function ActiveBotRow({ bot, onView, onStart, onPause, onStop, onDelete }: {
  bot:      UserBot;
  onView:   (b: UserBot) => void;
  onStart:  (b: UserBot) => void;
  onPause:  (b: UserBot) => void;
  onStop:   (b: UserBot) => void;
  onDelete: (b: UserBot) => void;
}) {
  const meta        = BOT_TYPE_META[bot.templateType];
  const isActive    = bot.status === 'active';
  const isPaused    = bot.status === 'paused';
  const isStopped   = bot.status === 'stopped' || bot.status === 'error';
  const profitPos   = bot.totalProfit >= 0;
  const hasRan      = bot.totalTrades > 0;
  const cfg         = bot.config as any;

  // Config summary string
  let configLine = '';
  if (cfg.coinSymbol) configLine += `${cfg.coinSymbol}/USDT`;
  if (bot.templateType === 'grid')       configLine += `  |  Range: ${(cfg.lowerPrice ?? 0).toLocaleString()}–${(cfg.upperPrice ?? 0).toLocaleString()}  |  Grids: ${cfg.gridCount ?? '—'}`;
  if (bot.templateType === 'martingale') configLine += `  |  Base: ${cfg.baseAmount ?? '—'}  |  Mult: ${cfg.multiplier ?? '—'}×  |  Max Losses: ${cfg.maxConsecutiveLosses ?? '—'}`;
  if (bot.templateType === 'dca')        configLine += `  |  Orders: ${cfg.numberOfOrders ?? '—'}  |  Drop: ${cfg.priceDropPct ?? '—'}%`;
  if (bot.templateType === 'arbitrage') {
    const pairs = (cfg.monitoredPairs ?? []).map((p: any) => p.symbol).join('/');
    configLine = `${pairs}  |  Min: ${cfg.minProfitPct ?? '—'}%  |  Scan: ${cfg.scanIntervalSec ?? '—'}s`;
  }
  if (bot.templateType === 'rebalancing') {
    const assets = (cfg.assets ?? cfg.allocations ?? []).map((a: any) => a.coinSymbol).join('/');
    configLine = `${assets}  |  Threshold: ${cfg.rebalanceThresholdPct ?? cfg.driftThresholdPct ?? '—'}%  |  Every ${cfg.rebalanceIntervalHours ?? '—'}h`;
  }

  // Uptime
  const uptimeStr = bot.startedAt
    ? (() => {
        const ms   = Date.now() - new Date(bot.startedAt).getTime();
        const d    = Math.floor(ms / 86_400_000);
        const h    = Math.floor((ms % 86_400_000) / 3_600_000);
        return d > 0 ? `${d}d ${h}h` : `${h}h`;
      })()
    : '—';

  // Mini sparkline points
  const curve = bot.equityCurve.slice(-30);
  const min   = Math.min(...curve.map(p => p.value));
  const max   = Math.max(...curve.map(p => p.value));
  const range = max - min || 1;

  // Progress bar: profit progress (0→maxDailyLoss)
  const profitPct = hasRan ? Math.min(100, Math.max(0, Math.abs(bot.totalProfitPct))) : 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="rounded-2xl border overflow-hidden"
      style={{ background: meta.bgAlpha, borderColor: meta.borderAlpha }}
    >
      {/* ── Main content (clickable) ── */}
      <div
        className="p-4 cursor-pointer"
        onClick={() => onView(bot)}
      >
        {/* Row 1: icon + name + status + action icons */}
        <div className="flex items-center gap-3 mb-2">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
            style={{ background: 'rgba(0,0,0,0.25)', border: `1px solid ${meta.borderAlpha}` }}
          >
            {meta.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-foreground truncate">{bot.name}</span>
              {/* Status dot */}
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: isActive ? CV.green : isPaused ? CV.orange : CV.gray }}
              />
              <span className="text-[10px]" style={{ color: isActive ? CV.green : isPaused ? CV.orange : CV.gray }}>
                {bot.status.charAt(0).toUpperCase() + bot.status.slice(1)}
              </span>
            </div>
            <p className="text-[10px] truncate mt-0.5" style={{ color: CV.gray }}>{configLine}</p>
          </div>
          {/* Action icons */}
          <div
            className="flex items-center gap-1 shrink-0"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => onView(bot)}
              className="p-1.5 rounded-lg transition-all hover:bg-secondary/20"
              title="Settings"
            >
              <Settings className="h-3.5 w-3.5" style={{ color: CV.gray }} />
            </button>
            {isActive && (
              <button
                onClick={() => onPause(bot)}
                className="p-1.5 rounded-lg transition-all hover:bg-secondary/20"
                title="Pause"
              >
                <Pause className="h-3.5 w-3.5 fill-current" style={{ color: CV.orange }} />
              </button>
            )}
            {(isPaused || isStopped) && (
              <button
                onClick={() => onStart(bot)}
                className="p-1.5 rounded-lg transition-all hover:bg-secondary/20"
                title="Start"
              >
                <Play className="h-3.5 w-3.5 fill-current" style={{ color: CV.green }} />
              </button>
            )}
            {(isActive || isPaused) && (
              <button
                onClick={() => onStop(bot)}
                className="p-1.5 rounded-lg transition-all hover:bg-secondary/20"
                title="Stop"
              >
                <Square className="h-3.5 w-3.5 fill-current" style={{ color: CV.red }} />
              </button>
            )}
            {isStopped && (
              <button
                onClick={() => onDelete(bot)}
                className="p-1.5 rounded-lg transition-all hover:bg-secondary/20"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" style={{ color: CV.gray }} />
              </button>
            )}
          </div>
        </div>

        {/* Row 2: profit + trades + uptime */}
        <div className="flex items-center gap-4 mb-2.5 text-xs">
          <span style={{ color: CV.gray }}>Profit:</span>
          <span
            className="font-bold tabular-nums"
            style={{ color: hasRan ? (profitPos ? CV.green : CV.red) : CV.gray }}
          >
            {hasRan ? `${profitPos ? '+' : ''}${fmtUsd(bot.totalProfit, false)} (${fmtPct(bot.totalProfitPct)})` : '—'}
          </span>
          <span className="mx-1" style={{ color: 'rgba(156,163,175,0.30)' }}>|</span>
          <span style={{ color: CV.gray }}>Trades:</span>
          <span className="font-bold" style={{ color: CV.gold }}>{bot.totalTrades}</span>
          <span className="mx-1" style={{ color: 'rgba(156,163,175,0.30)' }}>|</span>
          <span style={{ color: CV.gray }}>Uptime:</span>
          <span className="font-bold" style={{ color: CV.gray }}>{uptimeStr}</span>
        </div>

        {/* Row 3: sparkline progress bar */}
        <div className="relative h-2 rounded-full overflow-hidden mb-2" style={{ background: 'rgba(255,255,255,0.06)' }}>
          {curve.length >= 2 ? (
            <svg
              className="absolute inset-0"
              width="100%"
              height="8"
              preserveAspectRatio="none"
              viewBox={`0 0 ${curve.length - 1} 8`}
            >
              <polyline
                points={curve.map((p, i) => {
                  const y = 8 - ((p.value - min) / range) * 7 - 0.5;
                  return `${i},${y}`;
                }).join(' ')}
                fill="none"
                stroke={profitPos ? CV.green : CV.red}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.9"
              />
            </svg>
          ) : (
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width:      `${profitPct}%`,
                background: profitPos
                  ? `linear-gradient(90deg, ${CV.green}80, ${CV.green})`
                  : `linear-gradient(90deg, ${CV.red}80, ${CV.red})`,
              }}
            />
          )}
        </div>

        {/* Row 4: last trade */}
        <p className="text-[10px]" style={{ color: CV.gray }}>
          Last trade: {bot.lastRunAt ? fmtRelative(bot.lastRunAt) : 'Never'}
        </p>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE CARD  (spec 3.1 bottom row)
// ─────────────────────────────────────────────────────────────────────────────

const RISK_COLOR: Record<string, string> = {
  low:    CV.green,
  medium: CV.orange,
  high:   CV.red,
};

function TemplateCard({ template, onCreate }: {
  template: BotTemplate;
  onCreate: (template: BotTemplate) => void;
}) {
  const meta = BOT_TYPE_META[template.type];
  return (
    <div
      className="flex flex-col gap-2.5 p-3.5 rounded-2xl border transition-all hover:translate-y-[-2px] duration-200"
      style={{ background: meta.bgAlpha, borderColor: meta.borderAlpha }}
    >
      <div className="text-2xl">{meta.emoji}</div>
      <div>
        <p className="text-xs font-bold text-foreground leading-snug">{meta.label}</p>
        <p
          className="text-[10px] font-semibold mt-0.5"
          style={{ color: RISK_COLOR[template.riskLevel] }}
        >
          {template.riskLevel.charAt(0).toUpperCase() + template.riskLevel.slice(1)} Risk
        </p>
      </div>
      <p className="text-[10px] leading-snug line-clamp-2" style={{ color: CV.gray }}>
        {template.shortDescription}
      </p>
      <div className="flex items-center justify-between mt-auto">
        <span className="text-[10px] font-bold" style={{ color: CV.green }}>
          ~{template.estimatedMonthlyReturnPct}%/mo
        </span>
      </div>
      <button
        onClick={() => onCreate(template)}
        className="w-full py-1.5 rounded-xl text-xs font-bold transition-all active:scale-[0.97]"
        style={{
          background: `${meta.color}18`,
          color:       meta.color,
          border:      `1px solid ${meta.color}30`,
        }}
      >
        Create
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SORT OPTIONS
// ─────────────────────────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { label: 'Newest',       value: 'newest' },
  { label: 'Most Profit',  value: 'most_profit' },
  { label: 'Win Rate',     value: 'best_win_rate' },
  { label: 'Most Trades',  value: 'most_trades' },
  { label: 'Name A→Z',     value: 'name_asc' },
];

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

export function BotsPage() {
  const { user } = useAuthStore();
  const { getUserBots, getUserBotStats, startBot, pauseBot, stopBot, deleteBot } = useBotStore();
  const { getActiveTemplates: getTemplates } = useBotTemplateStore();
  useBotTemplateStore(); // ensure store initialized

  const [pageTab,          setPageTab]          = useState<'my_bots' | 'marketplace'>('my_bots');
  const [showVerify,       setShowVerify]       = useState(false);
  const [filters,          setFilters]         = useState<BotFilters>(DEFAULT_BOT_FILTERS);
  const [showWizard,       setShowWizard]       = useState(false);
  const [selectedBot,      setSelectedBot]      = useState<UserBot | null>(null);
  const [showFilters,      setShowFilters]      = useState(false);
  const [preselectedType,  setPreselectedType]  = useState<BotType | null>(null);
  const [showAllBots,      setShowAllBots]      = useState(false);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const unsub = useBotStore.subscribe(() => setTick(t => t + 1));
    return unsub;
  }, []);

  const allBots = useMemo(() =>
    user ? getUserBots(user.id, filters) : [],
  [user, getUserBots, filters, tick]);

  const activeBots = useMemo(() =>
    user ? getUserBots(user.id, { ...DEFAULT_BOT_FILTERS, statuses: ['active', 'paused'] }) : [],
  [user, getUserBots, tick]);

  const stats = useMemo(() =>
    user ? getUserBotStats(user.id) : { total: 0, active: 0, paused: 0, stopped: 0, error: 0, totalProfit: 0, totalTrades: 0 },
  [user, getUserBotStats, tick]);

  const templates = useMemo(() => getTemplates(), [getTemplates]);

  const handleToggleType   = useCallback((t: BotType)   => setFilters(f => ({ ...f, types:    f.types.includes(t)    ? f.types.filter(x => x !== t)    : [...f.types, t]    })), []);
  const handleToggleStatus = useCallback((s: BotStatus) => setFilters(f => ({ ...f, statuses: f.statuses.includes(s) ? f.statuses.filter(x => x !== s) : [...f.statuses, s] })), []);

  const handleStart  = useCallback((bot: UserBot) => { const r = startBot(bot.id);  if (!r.ok) toast.error(r.error ?? 'Failed'); else toast.success(`${bot.name} started`);  }, [startBot]);
  const handlePause  = useCallback((bot: UserBot) => { const r = pauseBot(bot.id);  if (!r.ok) toast.error(r.error ?? 'Failed'); else toast.success(`${bot.name} paused`);   }, [pauseBot]);
  const handleStop   = useCallback((bot: UserBot) => { const r = stopBot(bot.id, 'user_stopped'); if (!r.ok) toast.error(r.error ?? 'Failed'); else toast.success(`${bot.name} stopped`); }, [stopBot]);
  const handleDelete = useCallback((bot: UserBot) => {
    if (!user) return;
    const r = deleteBot(bot.id, user.id);
    if (!r.ok) toast.error(r.error ?? 'Failed');
    else { toast.success(`${bot.name} deleted`); setSelectedBot(null); }
  }, [deleteBot, user]);

  const handleTemplateCreate = useCallback((template: BotTemplate) => {
    setPreselectedType(template.type);
    setShowWizard(true);
  }, []);

  const profitPositive = stats.totalProfit >= 0;
  const displayBots    = showAllBots ? allBots : allBots.slice(0, 6);

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse 70% 45% at 90% 0%, rgba(255,215,0,0.05) 0%, transparent 70%), var(--background)',
      }}
    >
      {/* ── PAGE HEADER ── */}
      <header
        className="flex items-center justify-between px-6 py-4 border-b shrink-0 backdrop-blur-sm"
        style={{ borderColor: 'rgba(255,215,0,0.08)', background: 'var(--bg-card)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(255,215,0,0.10)', border: '1px solid rgba(255,215,0,0.22)' }}
          >
            <Bot className="h-5 w-5" style={{ color: CV.gold }} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground leading-none">🤖 Trading Bots</h1>
            <p className="text-xs mt-0.5" style={{ color: CV.gray }}>
              Automated strategies on the demo engine
              <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] font-semibold text-amber-400">🧪 Demo</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Tab switcher */}
          <div
            className="hidden sm:flex items-center gap-1 p-1 rounded-xl"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
          >
            {[
              { id: 'my_bots' as const,     label: '🤖 My Bots',     icon: Bot },
              { id: 'marketplace' as const, label: '🛒 Marketplace',  icon: ShoppingBag },
            ].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setPageTab(id)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={pageTab === id
                  ? { background: 'rgba(255,215,0,0.14)', color: CV.gold }
                  : { color: CV.gray }
                }
              >
                {label}
              </button>
            ))}
          </div>

          {/* Spec 9: Verification */}
          <button
            onClick={() => setShowVerify(true)}
            className="p-2.5 rounded-xl transition-all"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: CV.gray }}
            title="Run Spec 9 Verification Checklist"
          >
            <ShieldCheck className="h-4 w-4" />
          </button>

          <SubscriptionGate requiredLevel="pro" featureName="Create Bot">
            <button
              onClick={() => { setPreselectedType(null); setShowWizard(true); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all active:scale-[0.97]"
              style={{
                background: 'linear-gradient(135deg, #FFD700 0%, #FFA800 100%)',
                color:      'var(--bg-card)',
                boxShadow:  '0 3px 16px rgba(255,215,0,0.28)',
              }}
            >
              <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Create Bot</span>
            </button>
          </SubscriptionGate>
        </div>
      </header>

      {/* Mobile tabs */}
      <div
        className="sm:hidden flex border-b px-4 gap-1"
        style={{ borderColor: 'rgba(255,215,0,0.08)' }}
      >
        {[
          { id: 'my_bots' as const,     label: '🤖 My Bots' },
          { id: 'marketplace' as const, label: '🛒 Marketplace' },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setPageTab(id)}
            className="flex-1 py-2.5 text-xs font-semibold transition-all border-b-2"
            style={pageTab === id
              ? { borderColor: CV.gold, color: CV.gold }
              : { borderColor: 'transparent', color: CV.gray }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── SCROLLABLE BODY ── */}
      <div className="flex-1 overflow-y-auto px-6 py-5 pb-24 lg:pb-6 space-y-6">

        {/* ── MARKETPLACE TAB ── */}
        {pageTab === 'marketplace' && (
          <BotMarketplace
            onCopied={() => setPageTab('my_bots')}
          />
        )}

        {/* ── MY BOTS TAB ── */}
        {pageTab !== 'marketplace' && <>

        {/* STATS ROW */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Bots"   value={stats.total.toString()}              sub={`${stats.active} active`}       icon={Bot}                                    color={CV.gold}  />
          <StatCard label="Active Now"   value={stats.active.toString()}             sub={`${stats.paused} paused`}       icon={Activity}                               color={CV.green} />
          <StatCard label="Total Profit" value={fmtUsd(stats.totalProfit)}           sub={profitPositive ? '↑ Gaining' : '↓ Down'} icon={profitPositive ? TrendingUp : TrendingDown} color={profitPositive ? CV.green : CV.red} />
          <StatCard label="Total Trades" value={stats.totalTrades.toLocaleString()} sub="across all bots"               icon={BarChart2}                              color={CV.gold}  />
        </div>

        {/* ══ MY ACTIVE BOTS ══ */}
        <section>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-px" style={{ background: 'rgba(255,215,0,0.10)' }} />
            <span className="text-xs font-bold uppercase tracking-widest shrink-0" style={{ color: CV.gold }}>
              My Active Bots
            </span>
            <div className="flex-1 h-px" style={{ background: 'rgba(255,215,0,0.10)' }} />
          </div>

          {activeBots.length === 0 ? (
            /* Empty state */
            <div
              className="flex flex-col items-center gap-4 py-10 rounded-2xl border"
              style={{ background: 'rgba(255,215,0,0.03)', borderColor: 'rgba(255,215,0,0.10)', borderStyle: 'dashed' }}
            >
              <div className="text-4xl opacity-40">🤖</div>
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">No active bots</p>
                <p className="text-xs mt-1" style={{ color: CV.gray }}>
                  Create your first bot and let it trade for you 24/7
                </p>
              </div>
              <button
                onClick={() => { setPreselectedType(null); setShowWizard(true); }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-[0.97]"
                style={{
                  background: 'linear-gradient(135deg, #FFD700 0%, #FFA800 100%)',
                  color:      'var(--bg-card)',
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Create Your First Bot
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <AnimatePresence>
                {activeBots.map(bot => (
                  <ActiveBotRow
                    key={bot.id}
                    bot={bot}
                    onView={setSelectedBot}
                    onStart={handleStart}
                    onPause={handlePause}
                    onStop={handleStop}
                    onDelete={handleDelete}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </section>

        {/* ══ ALL BOTS (with filters) ══ */}
        {stats.total > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-px" style={{ background: 'var(--border-color)' }} />
              <span className="text-xs font-bold uppercase tracking-widest shrink-0" style={{ color: CV.gray }}>
                All Bots
              </span>
              <div className="flex-1 h-px" style={{ background: 'var(--border-color)' }} />
            </div>

            {/* Filter bar */}
            <div className="flex flex-col gap-2 mb-3">
              <div className="flex items-center gap-2">
                <div
                  className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
                >
                  <Search className="h-3.5 w-3.5 shrink-0" style={{ color: CV.gray }} />
                  <input
                    type="text"
                    placeholder="Search bots…"
                    value={filters.search}
                    onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                  />
                  {filters.search && (
                    <button onClick={() => setFilters(f => ({ ...f, search: '' }))}>
                      <X className="h-3 w-3" style={{ color: CV.gray }} />
                    </button>
                  )}
                </div>
                <select
                  value={filters.sortBy}
                  onChange={e => setFilters(f => ({ ...f, sortBy: e.target.value as any }))}
                  className="px-3 py-2 rounded-xl text-sm text-foreground outline-none appearance-none"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
                >
                  {SORT_OPTIONS.map(o => (
                    <option key={o.value} value={o.value} style={{ background: 'var(--bg-card)' }}>{o.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => setShowFilters(s => !s)}
                  className="p-2.5 rounded-xl transition-all"
                  style={{
                    background: showFilters ? 'rgba(255,215,0,0.12)' : 'var(--bg-card)',
                    border:     showFilters ? '1px solid rgba(255,215,0,0.30)' : '1px solid var(--border-color)',
                    color:      showFilters ? CV.gold : CV.gray,
                  }}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
              </div>

              <AnimatePresence>
                {showFilters && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-col gap-2 py-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-semibold uppercase tracking-wide mr-1" style={{ color: 'rgba(156,163,175,0.60)' }}>Type:</span>
                        {(Object.keys(BOT_TYPE_META) as BotType[]).map(t => (
                          <FilterChip key={t} label={`${BOT_TYPE_META[t].emoji} ${BOT_TYPE_META[t].label}`} active={filters.types.includes(t)} color={BOT_TYPE_META[t].color} onClick={() => handleToggleType(t)} />
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-semibold uppercase tracking-wide mr-1" style={{ color: 'rgba(156,163,175,0.60)' }}>Status:</span>
                        {(['active', 'paused', 'stopped', 'error'] as BotStatus[]).map(s => (
                          <FilterChip key={s} label={s.charAt(0).toUpperCase() + s.slice(1)} active={filters.statuses.includes(s)} color={s === 'active' ? CV.green : s === 'paused' ? CV.orange : s === 'error' ? CV.red : CV.gray} onClick={() => handleToggleStatus(s)} />
                        ))}
                      </div>
                      {(filters.types.length > 0 || filters.statuses.length > 0 || filters.search) && (
                        <button onClick={() => setFilters(DEFAULT_BOT_FILTERS)} className="self-start text-[11px] font-semibold px-2.5 py-1 rounded-lg" style={{ color: CV.red, background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.18)' }}>
                          Clear All Filters
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {allBots.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: CV.gray }}>
                No bots match your filters.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  <AnimatePresence>
                    {displayBots.map(bot => (
                      <BotCard key={bot.id} bot={bot} onView={setSelectedBot} onDelete={handleDelete} />
                    ))}
                  </AnimatePresence>
                </div>
                {allBots.length > 6 && (
                  <button
                    onClick={() => setShowAllBots(s => !s)}
                    className="w-full mt-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1"
                    style={{ color: CV.gray, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
                  >
                    {showAllBots ? <><ChevronDown className="h-3.5 w-3.5" /> Show Less</> : <><ChevronRight className="h-3.5 w-3.5" /> Show All {allBots.length} Bots</>}
                  </button>
                )}
              </>
            )}
          </section>
        )}

        {/* ══ BOT TEMPLATES ══ */}
        <section>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-px" style={{ background: 'rgba(255,215,0,0.10)' }} />
            <span className="text-xs font-bold uppercase tracking-widest shrink-0" style={{ color: CV.gold }}>
              Bot Templates
            </span>
            <div className="flex-1 h-px" style={{ background: 'rgba(255,215,0,0.10)' }} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {templates.map(template => (
              <TemplateCard
                key={template.id}
                template={template}
                onCreate={handleTemplateCreate}
              />
            ))}
          </div>
        </section>

        </>} {/* end my_bots tab */}

      </div>

      {/* ── WIZARD ── */}
      <AnimatePresence>
        {showWizard && (
          <BotCreateWizard
            open={showWizard}
            onClose={() => { setShowWizard(false); setPreselectedType(null); }}
            initialType={preselectedType ?? undefined}
            onCreate={bot => {
              toast.success(`${bot.name} created and started!`);
              setSelectedBot(bot);
              setShowWizard(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* ── DETAIL PANEL ── */}
      <AnimatePresence>
        {selectedBot && (
          <BotDetailModal
            bot={selectedBot}
            onClose={() => setSelectedBot(null)}
          />
        )}
      </AnimatePresence>

      {/* ── SPEC 9: VERIFICATION PANEL ── */}
      <AnimatePresence>
        {showVerify && (
          <BotVerificationPanel
            open={showVerify}
            onClose={() => setShowVerify(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
