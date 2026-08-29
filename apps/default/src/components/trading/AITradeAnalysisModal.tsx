import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, TrendingUp, TrendingDown, Clock, Brain, Target, AlertTriangle, Zap } from 'lucide-react';
import { TradeRecord, useTradingStore } from '@/lib/tradingStore';

interface AIAnalysis {
  pnl: string;
  duration: string;
  direction: string;
  score: number;          // 1-10 overall trade quality
  positiveFeedback: string;
  areasForImprovement: string;
  suggestion: string;
}

function generateAnalysis(trade: TradeRecord): AIAnalysis {
  const pnlSign = trade.pnl >= 0 ? '+' : '';
  const isWin = trade.pnl >= 0;
  const durationMs = Date.now() - new Date(trade.timestamp).getTime();
  const durationMin = Math.max(1, Math.round(durationMs / 60000));
  const pnlPct = trade.pnlPct;
  const isLong = trade.side === 'long';
  const leverage = trade.leverage;

  // Score calculation (1-10)
  let score = 5;
  if (isWin) score += 2;
  if (pnlPct > 5) score += 2;
  else if (pnlPct > 0) score += 1;
  if (pnlPct < -5) score -= 3;
  else if (pnlPct < 0) score -= 1;
  if (durationMin < 5) score -= 1; // holding < 5 min = impulsive
  if (durationMin > 30 && isWin) score += 1; // patience rewarded
  if (leverage > 20) score -= 2; // high risk
  if (trade.takeProfit && trade.exitPrice && trade.exitPrice >= (trade.takeProfit || 0)) score += 1; // hit TP
  score = Math.max(1, Math.min(10, score));

  const positiveFeedback = isWin
    ? `Great entry timing! Captured ${pnlSign}${Math.abs(pnlPct).toFixed(2)}% ${isLong ? 'bullish' : 'bearish'} move.`
    : `Good risk management. Loss was limited to ${pnlSign}${Math.abs(pnlPct).toFixed(2)}% on ${trade.leverage}x.`;

  const areasForImprovement = durationMin < 5
    ? `Quick ${durationMin}min hold suggests impulsive entry. Consider waiting for confirmation signals.`
    : leverage > 20
      ? `${trade.leverage}x leverage is aggressive. High leverage amplifies both wins and losses.`
      : `Consider setting tighter stop-loss to protect gains earlier.`;

  const suggestion = isWin
    ? `Try scaling out: close 50% at current profit, let the rest run with a trailing stop.`
    : `Review the entry conditions. Was there an RSI divergence or volume spike you missed?`;

  return {
    pnl: `${pnlSign}${trade.pnl.toFixed(2)} USDT (${pnlSign}${pnlPct.toFixed(2)}%)`,
    duration: durationMin >= 60 ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}m` : `${durationMin}m`,
    direction: `${isLong ? 'Long' : 'Short'} ×${trade.leverage}`,
    score,
    positiveFeedback,
    areasForImprovement,
    suggestion,
  };
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  tradeId: string | null;
}

export function AITradeAnalysisModal({ isOpen, onClose, tradeId }: Props) {
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const { history } = useTradingStore();

  useEffect(() => {
    if (isOpen && tradeId) {
      setLoading(true);
      const timer = setTimeout(() => {
        const trade = history.find(r => r.id === tradeId || r.id === `close-${tradeId}-` ) ?? history.find(r => r.id.includes(tradeId));
        if (trade) {
          setAnalysis(generateAnalysis(trade));
        }
        setLoading(false);
      }, 600);
      return () => clearTimeout(timer);
    }
    if (!isOpen) {
      setAnalysis(null);
      setLoading(true);
    }
  }, [isOpen, tradeId, history]);

  if (!isOpen) return null;

  const scoreColor = (s: number) => s >= 7 ? 'text-emerald-400' : s >= 4 ? 'text-amber-400' : 'text-red-400';
  const scoreBg = (s: number) => s >= 7 ? 'bg-emerald-400/10 border-emerald-400/20' : s >= 4 ? 'bg-amber-400/10 border-amber-400/20' : 'bg-red-400/10 border-red-400/20';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
          className="bg-[#1a1e26] border border-white/[0.1] rounded-2xl p-6 w-[380px] max-w-[90vw] max-h-[85vh] overflow-y-auto shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-amber-400" />
              <h3 className="text-lg font-bold text-white">AI Trade Analysis</h3>
            </div>
            <button onClick={onClose} className="p-1 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.05] transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : analysis ? (
            <>
              {/* Trade Summary */}
              <div className="bg-white/[0.04] rounded-xl p-3 space-y-2 mb-4 text-[12px]">
                {[
                  { label: 'P&L', value: analysis.pnl, icon: analysis.pnl.startsWith('+') ? TrendingUp : TrendingDown, cls: analysis.pnl.startsWith('+') ? 'text-emerald-400' : 'text-red-400' },
                  { label: 'Duration', value: analysis.duration, icon: Clock },
                  { label: 'Position', value: analysis.direction, icon: Target },
                ].map(({ label, value, icon: Icon, cls }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-white/40 flex items-center gap-1.5"><Icon className="w-3 h-3" />{label}</span>
                    <span className={cn('font-semibold', cls ?? 'text-white/80')}>{value}</span>
                  </div>
                ))}
                {/* Trade Score */}
                <div className="flex items-center justify-between pt-2 border-t border-white/[0.05]">
                  <span className="text-white/40 flex items-center gap-1.5"><Zap className="w-3 h-3" />Trade Score</span>
                  <span className={scoreColor(analysis.score) + ' font-bold text-lg'}>{analysis.score}/10</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${analysis.score * 10}%`, background: `hsl(${(analysis.score / 10) * 120}, 70%, 50%)` }} />
                </div>
              </div>

              {/* AI Insights */}
              <div className="space-y-3">
                <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-400/5 border border-emerald-400/10">
                  <span className="text-sm mt-0.5">✅</span>
                  <p className="text-[11px] text-emerald-400/90 leading-relaxed">{analysis.positiveFeedback}</p>
                </div>
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-400/5 border border-amber-400/10">
                  <span className="text-sm mt-0.5">⚠️</span>
                  <p className="text-[11px] text-amber-400/90 leading-relaxed">{analysis.areasForImprovement}</p>
                </div>
                <div className="flex items-start gap-2 p-3 rounded-xl bg-violet-400/5 border border-violet-400/10">
                  <span className="text-sm mt-0.5">💡</span>
                  <p className="text-[11px] text-violet-400/90 leading-relaxed">{analysis.suggestion}</p>
                </div>
              </div>

              {/* Close button */}
              <button
                onClick={onClose}
                className="w-full mt-4 py-2.5 rounded-xl bg-amber-400/10 border border-amber-400/20 text-amber-400 text-[12px] font-bold hover:bg-amber-400/20 transition-colors"
              >
                Got it
              </button>
            </>
          ) : (
            <p className="text-center text-white/40 py-8">Trade data not found.</p>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function cn(...args: (string | undefined | false)[]) { return args.filter(Boolean).join(' '); }