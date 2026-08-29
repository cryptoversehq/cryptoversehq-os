import React, { useRef, useMemo, useState } from 'react';
import { Download, X, Share2, Trophy, TrendingUp, TrendingDown, Target, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTradingStore } from '@/lib/tradingStore';
import type { TradeRecord } from '@/lib/tradingStore';

const INITIAL_BALANCE = 100_000;

interface Props {
  history: TradeRecord[];
  balance: number;
  onClose: () => void;
}

export function ShareCard({ history, balance, onClose }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [imageGenerated, setImageGenerated] = useState(false);

  const closedTrades = history.filter(r => r.action === 'close');
  const winners = closedTrades.filter(r => r.pnl > 0);
  const losers = closedTrades.filter(r => r.pnl < 0);
  const winRate = closedTrades.length > 0 ? (winners.length / closedTrades.length) * 100 : 0;
  const totalPnl = closedTrades.reduce((a, r) => a + r.pnl, 0);
  const totalPnlPct = ((balance - INITIAL_BALANCE) / INITIAL_BALANCE) * 100;

  const topAsset = useMemo(() => {
    if (closedTrades.length === 0) return null;
    const map = new Map<string, number>();
    for (const t of closedTrades) {
      map.set(t.symbol, (map.get(t.symbol) || 0) + t.pnl);
    }
    const entries = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    return entries[0];
  }, [closedTrades]);

  const handleDownload = async () => {
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(cardRef.current!, {
        backgroundColor: '#0A0A10',
        scale: 2,
        logging: false,
      });
      const link = document.createElement('a');
      link.download = `CryptoVerse_Portfolio_${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      setImageGenerated(true);
      setTimeout(() => setImageGenerated(false), 3000);
    } catch { /* html2canvas not available */ }
  };

  const handleCopyLink = () => {
    const summary = `CryptoVerse HQ Portfolio\nBalance: $${balance.toLocaleString()}\nP&L: ${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)} (${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(2)}%)\nWin Rate: ${winRate.toFixed(1)}%\nTop Asset: ${topAsset ? `${topAsset[0]} (${topAsset[1] >= 0 ? '+' : ''}$${topAsset[1].toFixed(0)})` : 'N/A'}`;
    navigator.clipboard.writeText(summary).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
        {/* Card */}
        <div
          ref={cardRef}
          className="bg-[#0A0A10] border border-white/10 rounded-3xl p-8 shadow-2xl w-full max-w-sm text-center"
        >
          {/* Logo */}
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-4xl">🚀</span>
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight">
            CryptoVerse <span className="text-[#FFD700]">HQ</span>
          </h2>
          <p className="text-[10px] text-white/30 uppercase tracking-widest mb-6">Portfolio Performance</p>

          {/* Balance */}
          <p className="text-4xl font-black font-mono text-white mb-1">
            ${balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
          <p className={cn(
            'text-lg font-mono font-bold flex items-center justify-center gap-1',
            totalPnl >= 0 ? 'text-green-400' : 'text-red-400',
          )}>
            {totalPnl >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
            {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(0)} ({totalPnlPct >= 0 ? '+' : ''}{totalPnlPct.toFixed(2)}%)
          </p>

          {/* Stats row */}
          <div className="flex justify-center gap-6 my-6">
            <div className="text-center">
              <Trophy className="h-4 w-4 text-amber-400 mx-auto mb-1" />
              <p className="text-2xl font-bold font-mono text-white">{winRate.toFixed(0)}%</p>
              <p className="text-[10px] text-white/40">Win Rate</p>
            </div>
            <div className="w-px bg-white/10" />
            <div className="text-center">
              <Target className="h-4 w-4 text-primary mx-auto mb-1" />
              <p className="text-2xl font-bold font-mono text-white">{closedTrades.length}</p>
              <p className="text-[10px] text-white/40">Trades</p>
            </div>
            <div className="w-px bg-white/10" />
            <div className="text-center">
              <TrendingUp className="h-4 w-4 text-blue-400 mx-auto mb-1" />
              <p className="text-2xl font-bold font-mono text-white">{closedTrades.length > 0 ? (winners.length / losers.length || Infinity).toFixed(1) : '—'}</p>
              <p className="text-[10px] text-white/40">PF</p>
            </div>
          </div>

          {topAsset && (
            <div className="inline-flex items-center gap-2 bg-white/5 rounded-full px-4 py-2 border border-white/5 mb-2">
              <span className="text-[10px] text-white/40 uppercase">Best Performer</span>
              <span className="text-sm font-bold font-mono text-white">{topAsset[0]}</span>
              <span className={cn('text-xs font-mono', topAsset[1] >= 0 ? 'text-green-400' : 'text-red-400')}>
                {topAsset[1] >= 0 ? '+' : ''}${topAsset[1].toFixed(0)}
              </span>
            </div>
          )}

          {/* Footer */}
          <p className="text-[9px] text-white/20 mt-4">Generated by CryptoVerse HQ · cryptoverse.app</p>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleDownload}
            className={cn(
              'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all',
              imageGenerated
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25',
            )}
          >
            <Download className="h-4 w-4" />
            {imageGenerated ? 'Downloaded!' : 'Download Image'}
          </button>
          <button
            onClick={handleCopyLink}
            className={cn(
              'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all',
              copied
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-secondary/50 text-muted-foreground border border-white/10 hover:text-foreground hover:border-white/20',
            )}
          >
            <Copy className="h-4 w-4" />
            {copied ? 'Copied!' : 'Copy Summary'}
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all"
          >
            <X className="h-4 w-4" />
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default ShareCard;
