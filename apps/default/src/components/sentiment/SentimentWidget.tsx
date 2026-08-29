/**
 * SentimentWidget.tsx — §6.3 Dashboard Sentiment Widget
 *
 * Compact, always-visible sentiment summary for embedding in any page.
 * Designed for the main trading dashboard sidebar / panel.
 *
 * Features:
 *   • Mini Fear & Greed gauge with zone colour
 *   • 4 top coin sentiment pills
 *   • Live alert banner when extreme conditions detected
 *   • "Trade on Sentiment" CTA → /sentiment/signals (§6.1)
 *   • "What does this mean?" AI button (§6.2)
 *   • "View full analysis" link → /sentiment
 *   • Real-time polling via sentimentStore
 */
import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Minus, ExternalLink,
  Bot, Zap, AlertTriangle, Brain, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSentimentStore } from '../../lib/sentimentStore';
import { FEAR_GREED_META, TRACKED_SYMBOLS } from '../../lib/sentimentTypes';
import { sentimentColor, fmtSentiment } from './sentimentUtils';
import { cn } from '@/lib/utils';

// ── Mini gauge (arc SVG) ───────────────────────────────────────────────────────

function MiniGauge({ value, zone }: { value: number; zone: string }) {
  const meta     = FEAR_GREED_META[zone as keyof typeof FEAR_GREED_META] ?? FEAR_GREED_META.neutral;
  // Arc: 180° half-circle. value 0..100 → 0°..180°
  const angle    = (value / 100) * 180;
  const rad      = (angle - 90) * (Math.PI / 180);
  const cx = 50; const cy = 50; const r = 36;
  const needleX  = cx + r * Math.cos(rad);
  const needleY  = cy + r * Math.sin(rad);

  return (
    <div className="flex flex-col items-center">
      <svg width="90" height="52" viewBox="0 0 100 55">
        {/* Track */}
        <path d="M 14,50 A 36,36 0 0,1 86,50" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" strokeLinecap="round" />
        {/* Gradient fill arc */}
        <path d="M 14,50 A 36,36 0 0,1 86,50" fill="none"
          stroke="url(#fg-grad)" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${angle * 1.257} 200`} />
        <defs>
          <linearGradient id="fg-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#ef4444" />
            <stop offset="50%"  stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
        </defs>
        {/* Needle */}
        <line x1={cx} y1={cy} x2={needleX} y2={needleY}
          stroke={meta.color} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="3" fill={meta.color} />
      </svg>
      <p className="font-black text-lg leading-none" style={{ color: meta.color }}>
        {Math.round(value)}
      </p>
      <p className="text-[10px] font-bold mt-0.5" style={{ color: meta.color }}>
        {meta.icon} {meta.label}
      </p>
    </div>
  );
}

// ── Coin sentiment pill ───────────────────────────────────────────────────────

function CoinPill({ symbol, sentiment, trend }: {
  symbol:    string;
  sentiment: number;
  trend:     string | null;
}) {
  const color = sentimentColor(sentiment);
  const TrendIcon = trend === 'rising' ? TrendingUp : trend === 'falling' ? TrendingDown : Minus;

  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-xl"
      style={{ background: `${color}08`, border: `1px solid ${color}15` }}>
      <span className="text-xs font-black text-foreground">{symbol}</span>
      <div className="flex items-center gap-1">
        <TrendIcon className="h-3 w-3" style={{ color }} />
        <span className="text-[10px] font-bold" style={{ color }}>
          {sentiment >= 0 ? '+' : ''}{sentiment.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

// ── Extreme alert banner ──────────────────────────────────────────────────────

function ExtremeBanner({ zone, index }: { zone: string; index: number }) {
  const isExtremeFear  = zone === 'extreme_fear';
  const isExtremeGreed = zone === 'extreme_greed';
  if (!isExtremeFear && !isExtremeGreed) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
      style={{
        background: isExtremeFear ? 'rgba(239,68,68,0.07)' : 'rgba(34,197,94,0.07)',
        border: isExtremeFear ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(34,197,94,0.2)',
      }}>
      <AlertTriangle className={cn('h-3.5 w-3.5 shrink-0', isExtremeFear ? 'text-red-400' : 'text-emerald-400')} />
      <p className={cn('text-[11px] font-bold', isExtremeFear ? 'text-red-400' : 'text-emerald-400')}>
        {isExtremeFear
          ? `Extreme Fear (${index}) — Contrarian buy signal active`
          : `Extreme Greed (${index}) — Consider taking profits`}
      </p>
    </motion.div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────

interface SentimentWidgetProps {
  /** Compact mode: fewer coins, smaller gauge — for sidebar use */
  compact?: boolean;
  /** Show "Trade on Sentiment" CTA (§6.1) */
  showTradeCTA?: boolean;
  /** Show AI explain button (§6.2) */
  showAICTA?: boolean;
  /** Called when user clicks AI explain */
  onAIExplain?: (prompt: string) => void;
}

export function SentimentWidget({
  compact       = false,
  showTradeCTA  = true,
  showAICTA     = true,
  onAIExplain,
}: SentimentWidgetProps) {
  const navigate = useNavigate();
  const { getMarketFearGreed, getAllAggregates } = useSentimentStore();

  const market   = getMarketFearGreed();
  const allAggs  = getAllAggregates();

  const fg       = market?.index ?? 50;
  const zone     = market?.zone  ?? 'neutral';
  const meta     = FEAR_GREED_META[zone];

  // Top coins for pills
  const topCoins = TRACKED_SYMBOLS
    .slice(0, compact ? 3 : 5)
    .map(sym => {
      const agg = allAggs.find(a => a.symbol === sym);
      return {
        symbol:    sym,
        sentiment: agg?.latest.overallSentiment ?? 0,
        trend:     agg?.trend ?? null,
      };
    });

  const overallSentiment = allAggs.length > 0
    ? allAggs.reduce((s, a) => s + a.latest.overallSentiment, 0) / allAggs.length
    : 0;

  function handleAIExplain() {
    const prompt = `The Fear & Greed Index is currently ${Math.round(fg)} (${meta.label}). The overall market sentiment is ${overallSentiment >= 0 ? 'positive' : 'negative'} at ${overallSentiment.toFixed(2)}. Can you explain what this means for trading and what actions I should consider?`;
    if (onAIExplain) {
      onAIExplain(prompt);
    } else {
      toast.info('Lynx AI', { description: `Explaining F&G ${Math.round(fg)} (${meta.label}) — open the AI chat and ask: "${prompt.slice(0, 80)}…"` });
    }
  }

  function handleTrade() {
    navigate('/sentiment/signals');
  }

  return (
    <div className="rounded-2xl overflow-hidden space-y-0"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-amber-400" />
          <p className="text-xs font-black text-foreground">Market Sentiment</p>
        </div>
        <button
          onClick={() => navigate('/sentiment')}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
          Full Analysis <ExternalLink className="h-2.5 w-2.5 ml-0.5" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Gauge + overall */}
        <div className="flex items-center gap-4">
          <MiniGauge value={fg} zone={zone} />
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Overall</span>
              <span className="text-[10px] font-bold" style={{ color: sentimentColor(overallSentiment) }}>
                {overallSentiment >= 0 ? '+' : ''}{overallSentiment.toFixed(2)} ({fmtSentiment(overallSentiment)})
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/6 overflow-hidden relative">
              <div className="absolute inset-y-0 left-1/2 w-px bg-white/15" />
              <div className="absolute h-full rounded-full"
                style={{
                  left:  overallSentiment >= 0 ? '50%' : `${(overallSentiment + 1) / 2 * 100}%`,
                  width: `${Math.abs(overallSentiment) * 50}%`,
                  background: sentimentColor(overallSentiment),
                }} />
            </div>
            <p className="text-[9px] text-muted-foreground/50">{meta.description}</p>
          </div>
        </div>

        {/* Extreme banner */}
        <ExtremeBanner zone={zone} index={Math.round(fg)} />

        {/* Coin pills */}
        <div className="space-y-1.5">
          {topCoins.map(c => (
            <CoinPill key={c.symbol} {...c} />
          ))}
        </div>

        {/* CTAs */}
        <div className={cn('flex gap-2', compact ? 'flex-col' : 'flex-wrap')}>
          {showTradeCTA && (
            <button onClick={handleTrade}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-primary/12 text-primary border border-primary/20 hover:bg-primary/20 transition-all text-[11px] font-bold">
              <Zap className="h-3 w-3" /> Trade on Sentiment
            </button>
          )}
          {showAICTA && (
            <button onClick={handleAIExplain}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20 transition-all text-[11px] font-bold">
              <Bot className="h-3 w-3" /> What does this mean?
            </button>
          )}
        </div>

        {/* Navigate pills */}
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-white/5">
          {[
            { label: '📈 F&G',    path: '/sentiment/fear-greed' },
            { label: '📱 Social', path: '/sentiment/social'     },
            { label: '⚡ Signals', path: '/sentiment/signals'   },
            { label: '🔔 Alerts', path: '/sentiment/alerts'     },
          ].map(item => (
            <button key={item.path} onClick={() => navigate(item.path)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-bold text-muted-foreground border border-white/8 hover:border-white/20 hover:text-foreground transition-all">
              {item.label}
              <ChevronRight className="h-2.5 w-2.5" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
