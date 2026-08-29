/**
 * BotMarketplace.tsx — Spec 6.2: Bot Strategy Marketplace
 *
 * Full-screen marketplace view:
 * - Browse published bots with performance metrics
 * - Filter by type, sort by return / win rate / copies
 * - Star (upvote) bots
 * - Copy a bot → opens BotCreateWizard pre-seeded with config
 * - Publish your own bot via PublishBotModal
 */

import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Star, Copy, TrendingUp, TrendingDown,
  ShoppingBag, Check, AlertTriangle, Loader2,
  CheckCircle2, Filter, X, Award,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { useBotMarketplaceStore, type MarketplaceBot } from '../../lib/botMarketplaceStore';
import { useBotStore } from '../../lib/botStore';
import { useBotTemplateStore } from '../../lib/botTemplateStore';
import { useAuthStore } from '../../lib/authStore';
import { useTradingStore } from '../../lib/tradingStore';
import { BOT_TYPE_META, CV, fmtPct } from './BotConstants';
import type { BotType } from '../../lib/botTypes';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type SortKey = 'top' | 'return' | 'win_rate' | 'copies' | 'newest';

// ─────────────────────────────────────────────────────────────────────────────
// SMALL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function sortBots(bots: MarketplaceBot[], key: SortKey): MarketplaceBot[] {
  return [...bots].sort((a, b) => {
    if (key === 'top')      return b.stars - a.stars;
    if (key === 'return')   return b.metrics.totalReturn - a.metrics.totalReturn;
    if (key === 'win_rate') return b.metrics.winRate - a.metrics.winRate;
    if (key === 'copies')   return b.copies - a.copies;
    if (key === 'newest')   return b.publishedAt - a.publishedAt;
    return 0;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MARKETPLACE BOT CARD
// ─────────────────────────────────────────────────────────────────────────────

function MarketplaceBotCard({
  bot,
  onStar,
  onCopy,
  isStarred,
  isCopying,
}: {
  bot:       MarketplaceBot;
  onStar:    (id: string) => void;
  onCopy:    (bot: MarketplaceBot) => void;
  isStarred: boolean;
  isCopying: boolean;
}) {
  const meta  = BOT_TYPE_META[bot.botType];
  const isPos = bot.metrics.totalReturn >= 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-3 p-4 rounded-2xl border transition-all hover:translate-y-[-2px] duration-200"
      style={{ background: meta.bgAlpha, borderColor: meta.borderAlpha }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl shrink-0">{meta.emoji}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-foreground truncate">{bot.name}</span>
              {bot.verified && (
                <span title="Verified — 100+ backtest runs">
                  <Award className="h-3.5 w-3.5 shrink-0" style={{ color: CV.gold }} />
                </span>
              )}
            </div>
            <p className="text-[10px] mt-0.5" style={{ color: CV.gray }}>
              by {bot.authorName}
            </p>
          </div>
        </div>
        {/* Star */}
        <button
          onClick={() => onStar(bot.id)}
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all shrink-0',
            isStarred
              ? 'text-amber-400 bg-amber-400/10 border border-amber-400/30'
              : 'text-muted-foreground bg-secondary/40 border border-white/8 hover:text-amber-400',
          )}
        >
          <Star className={cn('h-3 w-3', isStarred && 'fill-current')} />
          {bot.stars}
        </button>
      </div>

      {/* Description */}
      <p className="text-[11px] leading-relaxed line-clamp-2" style={{ color: CV.gray }}>
        {bot.description}
      </p>

      {/* Metrics grid */}
      <div className="grid grid-cols-3 gap-1.5">
        {[
          { label: 'Return',   value: `${isPos ? '+' : ''}${bot.metrics.totalReturn.toFixed(1)}%`, color: isPos ? CV.green : CV.red },
          { label: 'Win Rate', value: `${bot.metrics.winRate.toFixed(1)}%`, color: bot.metrics.winRate >= 55 ? CV.green : CV.orange },
          { label: 'Sharpe',   value: bot.metrics.sharpeRatio.toFixed(2),   color: bot.metrics.sharpeRatio >= 1 ? CV.green : CV.gray },
          { label: 'Trades',   value: bot.metrics.totalTrades.toString(),    color: 'var(--foreground)' },
          { label: 'Max DD',   value: `${bot.metrics.maxDrawdown.toFixed(1)}%`, color: CV.red },
          { label: 'Copies',   value: bot.copies.toString(),                 color: CV.gold },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="flex flex-col items-center px-2 py-1.5 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.04)' }}
          >
            <span className="text-[8px] uppercase tracking-wide" style={{ color: CV.gray }}>{label}</span>
            <span className="text-[11px] font-bold tabular-nums mt-0.5" style={{ color }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Tags */}
      {bot.tags.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {bot.tags.map(tag => (
            <span
              key={tag}
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{ background: `${meta.color}14`, color: meta.color, border: `1px solid ${meta.color}28` }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-auto pt-1 border-t" style={{ borderColor: `${meta.color}18` }}>
        <span className="text-[10px] font-bold flex-1" style={{ color: CV.green }}>
          ~{bot.metrics.avgMonthlyPct.toFixed(1)}%/mo
        </span>
        <button
          onClick={() => onCopy(bot)}
          disabled={isCopying}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-[0.97]"
          style={{
            background: `${meta.color}18`,
            color:       meta.color,
            border:      `1px solid ${meta.color}30`,
            opacity:     isCopying ? 0.6 : 1,
          }}
        >
          {isCopying
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Copy className="h-3.5 w-3.5" />}
          {isCopying ? 'Copying…' : 'Use This Bot'}
        </button>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN MARKETPLACE
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  /** Called after successfully copying a bot — opens wizard pre-seeded */
  onCopied?: (config: any, name: string) => void;
}

export function BotMarketplace({ onCopied }: Props) {
  const { user }                                      = useAuthStore();
  const { getAllBots, toggleStar, copyBot }            = useBotMarketplaceStore();
  const { createBot, startBot }                       = useBotStore();
  const { getActiveTemplates: getTemplates }          = useBotTemplateStore();
  const tradingBalance                                = useTradingStore(s => s.balance);

  const [search,   setSearch]   = useState('');
  const [typeFilter, setTypeFilter] = useState<BotType | 'all'>('all');
  const [sort,     setSort]     = useState<SortKey>('top');
  const [copying,  setCopying]  = useState<string | null>(null);
  const [copied,   setCopied]   = useState<string | null>(null);

  const allBots = getAllBots();

  const filtered = useMemo(() => {
    let bots = allBots;
    if (typeFilter !== 'all') bots = bots.filter(b => b.botType === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      bots = bots.filter(b =>
        b.name.toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q) ||
        b.tags.some(t => t.toLowerCase().includes(q)),
      );
    }
    return sortBots(bots, sort);
  }, [allBots, typeFilter, search, sort]);

  const handleStar = useCallback((id: string) => {
    if (!user) { toast.error('Login required to star bots.'); return; }
    toggleStar(id, user.id);
  }, [user, toggleStar]);

  const handleCopy = useCallback(async (bot: MarketplaceBot) => {
    if (!user) { toast.error('Login required to copy bots.'); return; }
    setCopying(bot.id);
    try {
      const result = copyBot(bot.id, user.id);
      if (!result.ok) { toast.error(result.error ?? 'Failed to copy bot.'); return; }

      // Find matching template
      const templates = getTemplates().filter(t => t.type === bot.botType && t.isActive);
      const template  = templates[0];
      if (!template) { toast.error(`No ${bot.botType} template found.`); return; }

      // Create the bot directly
      const createResult = createBot({
        userId:             user.id,
        templateId:         template.id,
        name:               result.name ?? `${bot.name} (copy)`,
        config:             result.config!,
        scheduleType:       'interval',
        scheduleValue:      '1m',
        userTradingBalance: tradingBalance ?? 10_000,
        userPlan:           (user as any).subscription ?? 'bronze',
        userLevel:          (user as any).level ?? 0,
      });

      if (!createResult.ok) { toast.error(createResult.errors?.join(' ') ?? 'Failed.'); return; }
      startBot(createResult.bot!.id);
      setCopied(bot.id);

      toast.success(`🤖 ${createResult.bot!.name} created!`, {
        description: `Copied from ${bot.authorName}'s bot. Now running!`,
      });

      onCopied?.(result.config, result.name ?? '');
      setTimeout(() => setCopied(null), 2_000);
    } finally {
      setCopying(null);
    }
  }, [user, copyBot, createBot, startBot, getTemplates, tradingBalance, onCopied]);

  const TYPE_TABS: Array<{ label: string; value: BotType | 'all' }> = [
    { label: '🌐 All',         value: 'all' },
    { label: '⚡ Grid',        value: 'grid' },
    { label: '📈 DCA',         value: 'dca' },
    { label: '🎲 Martingale',  value: 'martingale' },
    { label: '🔀 Arbitrage',   value: 'arbitrage' },
    { label: '⚖️ Rebalancing', value: 'rebalancing' },
  ];

  const SORT_TABS: Array<{ label: string; value: SortKey }> = [
    { label: '⭐ Top Rated',  value: 'top' },
    { label: '📈 Best Return', value: 'return' },
    { label: '🎯 Win Rate',   value: 'win_rate' },
    { label: '👥 Most Copied',value: 'copies' },
    { label: '🆕 Newest',     value: 'newest' },
  ];

  return (
    <div className="flex flex-col gap-4 pb-6">
      {/* Search + Sort */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div
          className="flex items-center gap-2 flex-1 px-3 py-2 rounded-xl border"
          style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <Search className="h-4 w-4 shrink-0" style={{ color: CV.gray }} />
          <input
            type="text"
            placeholder="Search bots…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ color: CV.gray }}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Type filter chips */}
      <div className="flex gap-1.5 flex-wrap">
        {TYPE_TABS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => setTypeFilter(value)}
            className="px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all"
            style={typeFilter === value
              ? { background: 'rgba(255,215,0,0.12)', color: CV.gold, border: '1px solid rgba(255,215,0,0.30)' }
              : { background: 'rgba(255,255,255,0.04)', color: CV.gray, border: '1px solid rgba(255,255,255,0.08)' }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Sort tabs */}
      <div className="flex gap-1 flex-wrap">
        {SORT_TABS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => setSort(value)}
            className="px-2 py-1 rounded-lg text-[10px] font-semibold transition-all"
            style={sort === value
              ? { background: 'rgba(255,255,255,0.08)', color: 'var(--foreground)' }
              : { background: 'transparent', color: CV.gray }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-16 rounded-2xl gap-3"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
        >
          <ShoppingBag className="h-10 w-10" style={{ color: CV.gray }} />
          <p className="text-sm font-semibold" style={{ color: CV.gray }}>No bots found</p>
          <p className="text-xs" style={{ color: 'rgba(156,163,175,0.5)' }}>
            Try adjusting your search or filters
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <AnimatePresence>
            {filtered.map(bot => (
              <MarketplaceBotCard
                key={bot.id}
                bot={bot}
                onStar={handleStar}
                onCopy={handleCopy}
                isStarred={user ? bot.starredBy.includes(user.id) : false}
                isCopying={copying === bot.id}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      <p className="text-[10px] text-center" style={{ color: 'rgba(156,163,175,0.4)' }}>
        {filtered.length} of {allBots.length} bots · Performance is simulated on CryptoVerse HQ demo engine
      </p>
    </div>
  );
}
