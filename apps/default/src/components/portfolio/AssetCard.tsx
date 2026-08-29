import React, { useState } from 'react';
import { TrendingUp, TrendingDown, Bell, BellRing, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PositionPnl } from '@/lib/portfolioPriceService';
import { priceAlertService, type PriceAlert } from '@/lib/priceAlertService';

interface AssetCardProps {
  data: PositionPnl;
  onClick?: () => void;
}

export function AssetCard({ data, onClick }: AssetCardProps) {
  const isProfit = data.unrealizedPnl >= 0;
  const pnlColor = isProfit ? 'text-green-400' : 'text-red-400';
  const pnlBg    = isProfit ? 'bg-green-500/10' : 'bg-red-500/10';
  const pnlBorder = isProfit ? 'border-green-500/20' : 'border-red-500/20';
  const pnlIcon  = isProfit ? TrendingUp : TrendingDown;
  const pnlLabel = isProfit ? 'Profit' : 'Loss';

  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertPrice, setAlertPrice] = useState(data.currentPrice.toFixed(2));
  const [alertDirection, setAlertDirection] = useState<'above' | 'below'>('above');
  const [alertSet, setAlertSet] = useState(false);

  const existingAlerts = priceAlertService.getAlertsForSymbol(data.symbol).filter(a => !a.triggered);

  const handleSetAlert = () => {
    const price = parseFloat(alertPrice);
    if (isNaN(price) || price <= 0) return;
    priceAlertService.addAlert(data.symbol, price, alertDirection);
    setAlertSet(true);
    setTimeout(() => setAlertSet(false), 2000);
    setShowAlertModal(false);
  };

  return (
    <>
      <div
        onClick={onClick}
        className={cn(
          'bg-card border border-white/5 rounded-2xl p-5 shadow-lg',
          'hover:border-white/10 transition-all duration-300',
          onClick && 'cursor-pointer hover:shadow-xl hover:-translate-y-0.5',
        )}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: data.color }} />
            <span className="font-bold text-lg">{data.symbol}</span>
            <span className={cn('px-2 py-0.5 rounded-md text-[10px] font-bold uppercase', data.side === 'long' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400')}>{data.side}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={(e) => { e.stopPropagation(); setShowAlertModal(true); }}
              className={cn('p-1.5 rounded-lg text-xs transition-all', existingAlerts.length > 0 ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20' : 'bg-secondary/30 text-muted-foreground hover:text-foreground hover:bg-secondary border border-white/5')}
              title={existingAlerts.length > 0 ? `${existingAlerts.length} alert(s) set` : 'Set price alert'}
            >
              {existingAlerts.length > 0 ? <BellRing className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
            </button>
            <span className="text-xs text-muted-foreground font-medium">{data.leverage}x</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Entry Price</p>
            <p className="text-sm font-mono font-semibold">${data.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Current Price</p>
            <p className="text-sm font-mono font-semibold">${data.currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Quantity</p>
            <p className="text-sm font-mono font-semibold">{data.quantity.toLocaleString(undefined, { maximumFractionDigits: 6 })}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Value</p>
            <p className="text-sm font-mono font-semibold">${data.valueUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
          </div>
        </div>
        <div className={cn('rounded-xl p-3 border', pnlBg, pnlBorder)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <pnlIcon className={cn('h-4 w-4', pnlColor)} />
              <span className="text-xs font-medium text-muted-foreground">{pnlLabel}</span>
            </div>
            <div className="text-right">
              <p className={cn('text-sm font-mono font-bold', pnlColor)}>{isProfit ? '+' : ''}{data.unrealizedPnl.toFixed(2)}</p>
              <p className={cn('text-xs font-mono', pnlColor, 'opacity-80')}>({isProfit ? '+' : ''}{data.unrealizedPnlPct.toFixed(2)}%)</p>
            </div>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2 text-right">Cost basis: ${data.costBasis.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
      </div>

      {showAlertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowAlertModal(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-card border border-white/10 rounded-2xl p-5 shadow-2xl max-w-sm w-full animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-amber-400" />
                <h3 className="font-semibold">Set Price Alert — {data.symbol}</h3>
              </div>
              <button onClick={() => setShowAlertModal(false)} className="p-1 rounded hover:bg-secondary text-muted-foreground"><X className="h-4 w-4" /></button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">Current price: ${data.currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
            <div className="flex gap-2 mb-3">
              <button onClick={() => setAlertDirection('above')} className={cn('flex-1 py-2 rounded-lg text-xs font-semibold transition-all', alertDirection === 'above' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-secondary/30 text-muted-foreground border border-white/5')}>Price goes ABOVE</button>
              <button onClick={() => setAlertDirection('below')} className={cn('flex-1 py-2 rounded-lg text-xs font-semibold transition-all', alertDirection === 'below' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-secondary/30 text-muted-foreground border border-white/5')}>Price goes BELOW</button>
            </div>
            <div className="mb-4">
              <label className="text-xs font-medium text-muted-foreground block mb-1">Target Price (USD)</label>
              <input type="number" step="any" value={alertPrice} onChange={(e) => setAlertPrice(e.target.value)} className="w-full h-10 px-3 rounded-lg bg-secondary/30 border border-white/10 text-sm font-mono focus:outline-none focus:border-primary/40 transition-colors" placeholder="0.00" />
            </div>
            <button onClick={handleSetAlert} className={cn('w-full py-2.5 rounded-xl text-sm font-semibold transition-all', alertSet ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-amber-500/15 text-amber-400 border border-amber-500/25 hover:bg-amber-500/25')}>{alertSet ? '✅ Alert Set!' : 'Set Alert'}</button>
            {existingAlerts.length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Active Alerts</p>
                {existingAlerts.map(a => (
                  <div key={a.id} className="flex items-center justify-between text-xs py-1">
                    <span className={a.direction === 'above' ? 'text-green-400' : 'text-red-400'}>{a.direction === 'above' ? '↑' : '↓'} ${a.targetPrice.toLocaleString()}</span>
                    <button onClick={() => priceAlertService.removeAlert(a.id)} className="text-muted-foreground hover:text-red-400"><X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default AssetCard;
