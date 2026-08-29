/**
 * StrategyCard.tsx — marketplace listing card
 */
import React from 'react';
import { TrendingUp, TrendingDown, ShoppingCart, Eye, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import type { StrategyCard as StrategyCardType } from '../../lib/strategyTypes';
import { Stars } from './StarRating';
import { CV, TYPE_META, RISK_META, fmtCP, fmtPct, fmtNum } from './MarketplaceUtils';
import { cn } from '../../lib/utils';

interface Props {
  strategy: StrategyCardType;
  owned?: boolean;
  onView: () => void;
  onPurchase?: () => void;
  rank?: number;
}

export function StrategyCard({ strategy: s, owned, onView, onPurchase, rank }: Props) {
  const type = TYPE_META[s.type];
  const risk = RISK_META[s.riskLevel];
  const isProfitPos = s.totalProfitPct > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="relative flex flex-col rounded-2xl overflow-hidden cursor-pointer group"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid rgba(255,215,0,0.10)',
        boxShadow: '0 2px 16px rgba(0,0,0,0.3)',
        backdropFilter: 'blur(8px)',
      }}
      onClick={onView}
      whileHover={{ scale: 1.015, boxShadow: '0 4px 32px rgba(255,215,0,0.10)' }}
    >
      {/* Rank badge */}
      {rank != null && (
        <div
          className="absolute top-3 left-3 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold z-10"
          style={{
            background: rank === 1 ? 'linear-gradient(135deg,#FFD700,#FFA800)' : rank === 2 ? 'rgba(192,192,192,0.25)' : 'rgba(205,127,50,0.20)',
            color:      rank === 1 ? '#0A1929' : rank <= 3 ? CV.gold : CV.gray,
            border:     `1px solid ${rank === 1 ? CV.gold : 'var(--border-color)'}`,
          }}
        >#{rank}</div>
      )}

      {/* Owned badge */}
      {owned && (
        <div
          className="absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full z-10"
          style={{ background: 'rgba(52,211,153,0.15)', color: CV.green, border: '1px solid rgba(52,211,153,0.25)' }}
        >✓ Owned</div>
      )}

      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-3">
          {/* Emoji icon */}
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
            style={{ background: CV.goldAlpha, border: `1px solid ${CV.goldBorder}` }}
          >
            {type.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm text-foreground leading-tight truncate pr-8">{s.name}</h3>
            <p className="text-xs mt-0.5 truncate" style={{ color: CV.gray }}>by {s.creatorName}</p>
            {(s as any).verified && (
              <span className="text-blue-500 text-xs flex items-center gap-1 font-semibold mt-1">
                ✅ Verified Track Record
              </span>
            )}
          </div>
        </div>

        {/* Short description */}
        <p className="text-xs mt-2 leading-relaxed line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
          {s.shortDescription}
        </p>

        {/* Tags row */}
        <div className="flex gap-1 flex-wrap mt-2">
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: `${type.color}18`, color: type.color, border: `1px solid ${type.color}30` }}
          >{type.label}</span>
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: risk.bg, color: risk.color, border: `1px solid ${risk.color}30` }}
          >{risk.label}</span>
          {s.tags.slice(0, 1).map(tag => (
            <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: CV.surface, color: CV.gray, border: `1px solid ${CV.border}` }}>
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Metrics strip */}
      <div className="grid grid-cols-3 gap-px mx-4 mb-3 rounded-xl overflow-hidden" style={{ background: CV.border }}>
        {[
          { label: 'Win Rate', value: `${s.winRate.toFixed(1)}%`, positive: s.winRate >= 50 },
          { label: 'Return',   value: fmtPct(s.totalProfitPct),   positive: isProfitPos },
          { label: 'Sharpe',   value: s.sharpeRatio.toFixed(2),   positive: s.sharpeRatio >= 1 },
        ].map(m => (
          <div key={m.label} className="flex flex-col items-center py-2" style={{ background: 'var(--bg-secondary)' }}>
            <span className="text-[10px]" style={{ color: CV.gray }}>{m.label}</span>
            <span
              className="text-xs font-bold mt-0.5 flex items-center gap-0.5"
              style={{ color: m.positive ? CV.green : CV.red }}
            >
              {m.positive
                ? <TrendingUp className="h-2.5 w-2.5" />
                : <TrendingDown className="h-2.5 w-2.5" />}
              {m.value}
            </span>
          </div>
        ))}
      </div>

      {/* Rating + sales */}
      <div className="flex items-center justify-between px-4 pb-3">
        <Stars rating={s.rating} size={12} count={s.ratingCount} />
        <span className="flex items-center gap-1 text-[10px]" style={{ color: CV.gray }}>
          <Users className="h-3 w-3" />
          {fmtNum(s.totalSales)} sold
        </span>
      </div>

      {/* Footer: price + CTA */}
      <div
        className="flex items-center justify-between px-4 py-3 border-t"
        style={{ borderColor: CV.border }}
      >
        <div>
          <p className="text-xs" style={{ color: CV.gray }}>Price</p>
          <p
            className="font-bold text-sm"
            style={{ color: s.isFree ? CV.green : CV.gold }}
          >{fmtCP(s.price)}</p>
        </div>

        <div className="flex gap-2" onClick={e => e.stopPropagation()}>
          <button
            onClick={onView}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{ background: CV.surface, color: 'var(--text-primary)', border: `1px solid ${CV.border}` }}
          >
            <Eye className="h-3.5 w-3.5" /> View
          </button>

          {!owned && onPurchase && (
            <button
              onClick={onPurchase}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={{
                background: s.isFree ? 'rgba(52,211,153,0.15)' : CV.goldAlpha,
                color:      s.isFree ? CV.green : CV.gold,
                border:     `1px solid ${s.isFree ? 'rgba(52,211,153,0.25)' : CV.goldBorder}`,
              }}
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              {s.isFree ? 'Get Free' : 'Buy'}
            </button>
          )}

          {owned && (
            <button
              onClick={onView}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={{ background: 'rgba(52,211,153,0.12)', color: CV.green, border: '1px solid rgba(52,211,153,0.20)' }}
            >
              ✓ View
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
