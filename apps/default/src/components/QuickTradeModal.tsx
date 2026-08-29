import React, { useState } from 'react';
import { X, Zap, TrendingUp, TrendingDown } from 'lucide-react';
import { useTradingStore } from '@/lib/tradingStore';
import { COINS } from '@/lib/coins';
import { cn } from '@/lib/utils';

const QUICK_COINS = COINS.filter(c => ['BTC','ETH','BNB','SOL','XRP','ADA','DOGE','DOT','LINK','MATIC'].includes(c.symbol)).slice(0, 10);

interface Props { isOpen: boolean; onClose: () => void; }

export function QuickTradeModal({ isOpen, onClose }: Props) {
  const [symbol, setSymbol] = useState('BTC');
  const [amount, setAmount] = useState(100);
  const [type, setType] = useState<'long' | 'short'>('long');
  const [leverage, setLeverage] = useState(1);
  const [marginMode, setMarginMode] = useState<'isolated' | 'cross'>('isolated');
  const { openPosition, balance } = useTradingStore();

  if (!isOpen) return null;

  const coin = COINS.find(c => c.symbol === symbol);
  const color = coin?.color || '#6366f1';

  const handleTrade = () => {
    if (!coin || amount <= 0) return;
    const basePrice = type === 'long' ? 67500 : 3420; // placeholder — real price from market
    const mm = marginMode;
    openPosition({ coinId: coin.id, symbol: coin.symbol, name: coin.name, side: type, usdAmount: amount, currentPrice: basePrice, leverage, color: coin.color, stopLoss: type === 'long' ? basePrice * 0.95 : basePrice * 1.05, takeProfit: type === 'long' ? basePrice * 1.1 : basePrice * 0.9, marginMode: mm });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-white/10 rounded-2xl w-full max-w-md mx-4 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2"><Zap className="h-5 w-5 text-primary" /> Quick Trade</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10"><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>

        <div className="space-y-4">
          {/* Coin selector */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Coin</label>
            <div className="grid grid-cols-5 gap-1.5">
              {QUICK_COINS.map(c => (
                <button key={c.symbol} onClick={() => setSymbol(c.symbol)}
                  className={cn('py-2 rounded-lg text-xs font-bold transition-all', symbol === c.symbol ? 'text-white border-2' : 'bg-secondary/30 text-muted-foreground border border-transparent hover:border-white/10')}
                  style={symbol === c.symbol ? { backgroundColor: c.color + '30', borderColor: c.color } : {}}>
                  {c.symbol}
                </button>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Amount (USD) — Balance: ${balance.toLocaleString()}</label>
            <input type="number" value={amount} onChange={e => setAmount(Math.max(1, Number(e.target.value)))}
              className="w-full bg-secondary/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>

          {/* Buy/Sell + Leverage */}
          <div className="flex gap-3">
            <button onClick={() => setType('long')}
              className={cn('flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-all', type === 'long' ? 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-400' : 'bg-secondary/30 text-muted-foreground')}>
              <TrendingUp className="h-4 w-4" /> Long
            </button>
            <button onClick={() => setType('short')}
              className={cn('flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-all', type === 'short' ? 'bg-red-500/20 border border-red-400/40 text-red-400' : 'bg-secondary/30 text-muted-foreground')}>
              <TrendingDown className="h-4 w-4" /> Short
            </button>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Leverage: {leverage}x</label>
            <input type="range" min={1} max={20} value={leverage} onChange={e => setLeverage(Number(e.target.value))}
              className="w-full accent-primary" />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Margin Mode:</label>
            <select value={marginMode} onChange={e => setMarginMode(e.target.value as 'isolated' | 'cross')}
              className="text-[10px] bg-white/[0.05] border border-white/10 rounded-md px-2 py-1 text-white/80 cursor-pointer outline-none">
              <option value="isolated">Isolated</option>
              <option value="cross">Cross</option>
            </select>
          </div>

          <button onClick={handleTrade} disabled={amount <= 0}
            className="w-full py-3 rounded-2xl text-sm font-bold transition-all disabled:opacity-40"
            style={{ background: `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)`, color: '#0A1929' }}>
            {type === 'long' ? 'Buy' : 'Sell'} {symbol} — ${amount.toLocaleString()}
          </button>
        </div>

        <div className="mt-4 p-3 rounded-xl bg-secondary/20 border border-white/5">
          <p className="text-[10px] text-muted-foreground">Balance: ${balance.toLocaleString()} | Fee: 0.1% | {type === 'long' ? 'Profit if price rises' : 'Profit if price falls'}</p>
        </div>
      </div>
    </div>
  );
}
