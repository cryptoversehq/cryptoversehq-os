/**
 * BotCard.tsx — Individual bot card for the /bots list page.
 *
 * Shows: type icon, name, status badge, key metrics (profit, trades, win rate),
 * last-run / next-run info, and Start / Pause / Stop / View action buttons.
 */

import React, { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Play, Pause, Square, Eye, Trash2,
  TrendingUp, TrendingDown, Activity,
  Clock, Zap, ChevronDown, ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import type { UserBot } from '../../lib/botTypes';
import { useBotStore } from '../../lib/botStore';
import { useAuthStore } from '../../lib/authStore';
import { BotStatusBadge } from './BotStatusBadge';
import { BotErrorBanner } from './BotErrorBanner';
import {
  CV, BOT_TYPE_META, fmtUsd, fmtPct, fmtRelative,
} from './BotConstants';

interface Props {
  bot:      UserBot;
  onView:   (bot: UserBot) => void;
  onDelete: (bot: UserBot) => void;
}

export function BotCard({ bot, onView, onDelete }: Props) {
  const { startBot, pauseBot, stopBot } = useBotStore();
  const { user } = useAuthStore();
  const meta = BOT_TYPE_META[bot.templateType];

  // Spec 7: mobile collapsible — collapsed by default on small screens
  const [expanded, setExpanded] = useState(false);

  const isActive  = bot.status === 'active';
  const isPaused  = bot.status === 'paused';
  const isStopped = bot.status === 'stopped';
  const isError   = bot.status === 'error';

  const handleStart = useCallback(() => {
    const res = startBot(bot.id);
    if (!res.ok) toast.error(res.error ?? 'Failed to start bot');
    else toast.success(`${bot.name} started`);
  }, [bot.id, bot.name, startBot]);

  const handlePause = useCallback(() => {
    const res = pauseBot(bot.id);
    if (!res.ok) toast.error(res.error ?? 'Failed to pause bot');
    else toast.success(`${bot.name} paused`);
  }, [bot.id, bot.name, pauseBot]);

  const handleStop = useCallback(() => {
    const res = stopBot(bot.id, 'user_stopped');
    if (!res.ok) toast.error(res.error ?? 'Failed to stop bot');
    else toast.success(`${bot.name} stopped`);
  }, [bot.id, bot.name, stopBot]);

  const profitPositive = bot.totalProfit >= 0;
  const hasRan = bot.totalTrades > 0;

  // Mini sparkline from equity curve (last 20 points)
  const curve = bot.equityCurve.slice(-20);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="rounded-2xl border flex flex-col gap-0 overflow-hidden hover:translate-y-[-2px] transition-transform duration-200 cursor-pointer"
      style={{ background: meta.bgAlpha, borderColor: meta.borderAlpha }}
      onClick={() => {
        // On mobile, first tap expands the card; second tap opens detail
        if (window.innerWidth < 640 && !expanded) {
          setExpanded(true);
        } else {
          onView(bot);
        }
      }}
    >
      {/* ── Header ── */}
      <div className="flex items-start justify-between p-4 pb-3">
        <div className="flex items-center gap-3">
          {/* Type icon */}
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
            style={{ background: 'rgba(0,0,0,0.25)', border: `1px solid ${meta.borderAlpha}` }}
          >
            {meta.emoji}
          </div>
          <div>
            <p className="text-sm font-bold text-foreground leading-none truncate max-w-[160px]">
              {bot.name}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: meta.color }}>
              {meta.label}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <BotStatusBadge status={bot.status} />
          {/* Mobile expand toggle */}
          <button
            className="sm:hidden p-1 rounded-lg transition-colors"
            style={{ color: CV.gray }}
            onClick={e => { e.stopPropagation(); setExpanded(x => !x); }}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded
              ? <ChevronUp className="h-3.5 w-3.5" />
              : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* ── Expandable body: always visible on ≥sm, toggle on mobile ── */}
      <div className={expanded ? 'block' : 'hidden sm:block'}>
      {/* ── Spec 8: Error banner (compact) ── */}
      {(isError || bot.lastError) && (
        <div className="mx-4 mb-2" onClick={e => e.stopPropagation()}>
          <BotErrorBanner
            bot={bot}
            onStart={handleStart}
            compact={true}
          />
        </div>
      )}

      {/* ── Metrics row ── */}
      <div className="grid grid-cols-3 gap-px mx-4 mb-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
        {[
          {
            label: 'Profit',
            value: hasRan ? fmtPct(bot.totalProfitPct) : '—',
            icon: profitPositive ? TrendingUp : TrendingDown,
            color: hasRan ? (profitPositive ? CV.green : CV.red) : CV.gray,
          },
          {
            label: 'Trades',
            value: bot.totalTrades.toString(),
            icon: Activity,
            color: CV.gold,
          },
          {
            label: 'Win Rate',
            value: hasRan ? `${bot.winRate.toFixed(0)}%` : '—',
            icon: Zap,
            color: hasRan ? (bot.winRate >= 50 ? CV.green : CV.red) : CV.gray,
          },
        ].map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="flex flex-col items-center justify-center py-2 gap-0.5"
            style={{ background: 'var(--bg-card)' }}
          >
            <Icon className="h-3 w-3 mb-0.5" style={{ color }} />
            <span className="text-xs font-bold tabular-nums" style={{ color }}>{value}</span>
            <span className="text-[9px]" style={{ color: CV.gray }}>{label}</span>
          </div>
        ))}
      </div>

      {/* ── Mini sparkline ── */}
      {curve.length >= 2 && (
        <div className="mx-4 mb-3 h-8">
          <svg width="100%" height="32" preserveAspectRatio="none">
            <polyline
              points={curve.map((p, i) => {
                const x = (i / (curve.length - 1)) * 100;
                const min = Math.min(...curve.map(c => c.value));
                const max = Math.max(...curve.map(c => c.value));
                const range = max - min || 1;
                const y = 32 - ((p.value - min) / range) * 28 - 2;
                return `${x}%,${y}`;
              }).join(' ')}
              fill="none"
              stroke={profitPositive ? CV.green : CV.red}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}

      {/* ── Timing row ── */}
      <div className="flex items-center justify-between px-4 pb-3 text-[10px]" style={{ color: CV.gray }}>
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>Last: {fmtRelative(bot.lastRunAt)}</span>
        </div>
        {bot.nextRunAt && (
          <div className="flex items-center gap-1">
            <span>Next: {fmtRelative(bot.nextRunAt)}</span>
          </div>
        )}
      </div>

      </div> {/* end expandable body */}

      {/* ── Action buttons (always visible) ── */}
      <div
        className="flex items-center gap-1.5 px-4 py-3 border-t"
        style={{ borderColor: meta.borderAlpha }}
        onClick={e => e.stopPropagation()}
      >
        {/* Start */}
        {(isStopped || isPaused || isError) && (
          <button
            onClick={handleStart}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all active:scale-[0.97]"
            style={{ background: 'rgba(0,200,83,0.12)', color: CV.green, border: '1px solid rgba(0,200,83,0.25)' }}
          >
            <Play className="h-3 w-3 fill-current" /> Start
          </button>
        )}
        {/* Pause */}
        {isActive && (
          <button
            onClick={handlePause}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all active:scale-[0.97]"
            style={{ background: 'rgba(255,149,0,0.12)', color: CV.orange, border: '1px solid rgba(255,149,0,0.25)' }}
          >
            <Pause className="h-3 w-3 fill-current" /> Pause
          </button>
        )}
        {/* Stop */}
        {(isActive || isPaused) && (
          <button
            onClick={handleStop}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all active:scale-[0.97]"
            style={{ background: 'rgba(255,59,48,0.10)', color: CV.red, border: '1px solid rgba(255,59,48,0.22)' }}
          >
            <Square className="h-3 w-3 fill-current" /> Stop
          </button>
        )}
        {/* View detail */}
        <button
          onClick={() => onView(bot)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all active:scale-[0.97] ml-auto"
          style={{ background: 'rgba(255,215,0,0.08)', color: CV.gold, border: '1px solid rgba(255,215,0,0.20)' }}
        >
          <Eye className="h-3 w-3" /> Details
        </button>
        {/* Delete */}
        {(isStopped || isError) && (
          <button
            onClick={() => onDelete(bot)}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-all active:scale-[0.97]"
            style={{ background: 'var(--bg-secondary)', color: CV.gray, border: '1px solid var(--border-color)' }}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </motion.div>
  );
}
