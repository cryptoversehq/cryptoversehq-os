import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, Target, AlertTriangle, PieChart,
  RefreshCcw, Brain, Sparkles, ShieldCheck, Bell, BellRing,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useTradingStore } from '@/lib/tradingStore';
import { useExchangeStore } from '@/lib/exchangeStore';
import { PortfolioHeader } from '@/components/portfolio/PortfolioHeader';
import { StatCards } from '@/components/portfolio/StatCards';
import { EquityChart } from '@/components/portfolio/EquityChart';
import { TradeHistory } from '@/components/portfolio/TradeHistory';
import { ConnectedExchanges } from '@/components/portfolio/ConnectedExchanges';
import { PortfolioAllocation } from '@/components/portfolio/PortfolioAllocation';
import { AssetCard } from '@/components/portfolio/AssetCard';
import { PortfolioHistoryChart } from '@/components/portfolio/PortfolioHistoryChart';
import { PerformanceAttribution } from '@/components/portfolio/PerformanceAttribution';
import { RiskMetrics } from '@/components/portfolio/RiskMetrics';
import {
  subscribePortfolioPrices,
  computePositionsWithPnl,
  type PositionPnl,
  getLatestPrices,
  getPriceForSymbol,
} from '@/lib/portfolioPriceService';
import { analyzePortfolioHealth, type PortfolioHealthReport } from '@/features/portfolioHealthEnhanced';
import { portfolioHistory } from '@/lib/portfolioHistoryService';
import { priceAlertService } from '@/lib/priceAlertService';

const INITIAL_BALANCE = 100_000;

const HEALTH_GRADE_STYLES: Record<string, { bg: string; text: string; border: string; icon: React.ElementType }> = {
  Excellent: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30', icon: Sparkles },
  Good:      { bg: 'bg-blue-500/10',  text: 'text-blue-400',  border: 'border-blue-500/30',  icon: ShieldCheck },
  Moderate:  { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30', icon: Target },
  Poor:      { bg: 'bg-red-500/10',   text: 'text-red-400',   border: 'border-red-500/30',   icon: AlertTriangle },
};

export function Portfolio() {
  const { balance, history, positions, resetBalance } = useTradingStore();
  const exchangeConnections = useExchangeStore(s => s.connections);
  const exchangePortfolios = useExchangeStore(s => s.portfolios);

  // ── Live price subscription ─────────────────────────────────────────────
  const [positionPnls, setPositionPnls] = useState<PositionPnl[]>([]);
  useEffect(() => {
    const unsub = subscribePortfolioPrices(() => {
      const pnls = computePositionsWithPnl();
      setPositionPnls(pnls);

      // Check price alerts on every update
      const prices: Record<string, number> = {};
      for (const p of pnls) {
        prices[p.symbol] = p.currentPrice;
      }
      const triggered = priceAlertService.checkAlerts(prices);
      for (const alert of triggered) {
        toast(
          `${alert.direction === 'above' ? '📈' : '📉'} Price Alert — ${alert.symbol}`,
          {
            description: `Price ${alert.direction} $${alert.targetPrice.toLocaleString()}! Current: $${(prices[alert.symbol] ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
            duration: 8000,
          }
        );
      }
    });
    return unsub;
  }, []);

  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);

  // ── AI Portfolio health ─────────────────────────────────────────────────
  const [healthReport, setHealthReport] = useState<PortfolioHealthReport | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const refreshHealth = useCallback(async () => {
    setHealthLoading(true);
    try { const report = await analyzePortfolioHealth('free'); setHealthReport(report); } catch {}
    finally { setHealthLoading(false); }
  }, []);

  useEffect(() => { if (history.length > 0 || positions.length > 0) refreshHealth(); }, [history.length, positions.length, refreshHealth]);

  // ── Derived stats ───────────────────────────────────────────────────────
  const closedTrades = history.filter(r => r.action === 'close');
  const winners = closedTrades.filter(r => r.pnl > 0);
  const losers = closedTrades.filter(r => r.pnl < 0);
  const winRate = closedTrades.length > 0 ? (winners.length / closedTrades.length) * 100 : 0;
  const grossWin = winners.reduce((a, r) => a + r.pnl, 0);
  const grossLoss = Math.abs(losers.reduce((a, r) => a + r.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
  const bestTrade = closedTrades.length > 0 ? Math.max(...closedTrades.map(r => r.pnl)) : 0;
  const worstTrade = closedTrades.length > 0 ? Math.min(...closedTrades.map(r => r.pnl)) : 0;

  const maxDrawdown = useMemo(() => {
    let peak = INITIAL_BALANCE, maxDD = 0;
    let equity = INITIAL_BALANCE;
    for (const t of [...history].reverse()) {
      if (t.action === 'open') equity -= t.costBasis + t.fee;
      else equity += t.costBasis + t.pnl;
      if (equity > peak) peak = equity;
      const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
      if (dd > maxDD) maxDD = dd;
    }
    return maxDD;
  }, [history]);

  // ── Grand total ─────────────────────────────────────────────────────────
  const realExchangeTotal = Object.values(exchangePortfolios).reduce((sum, p) => sum + p.totalUSD, 0);
  const grandTotal = balance + realExchangeTotal;
  const hasExchanges = exchangeConnections.filter(c => c.status === 'connected').length > 0;

  // ── Save portfolio history snapshot when grandTotal changes ────────────
  useEffect(() => {
    if (grandTotal > 0) {
      portfolioHistory.addSnapshot({
        grandTotal,
        simulatedBalance: balance,
        realExchangeTotal,
        openPositionsCount: positions.length,
      });
    }
  }, [grandTotal, balance, realExchangeTotal, positions.length]);

  // ── Health grade ────────────────────────────────────────────────────────
  const gradeStyle = healthReport ? HEALTH_GRADE_STYLES[healthReport.grade] ?? HEALTH_GRADE_STYLES.Moderate : null;
  const GradeIcon = gradeStyle?.icon ?? Target;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">

      {/* Header */}
      <PortfolioHeader
        tradeCount={history.length}
        positionCount={positions.length}
      />

      {/* ── AI Portfolio Health ──────────────────────────────────────── */}
      {healthReport && (
        <div className={cn('bg-card border rounded-2xl p-5 shadow-lg', gradeStyle?.border ?? 'border-border')}>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className={cn('p-2.5 rounded-xl', gradeStyle?.bg ?? 'bg-primary/10')}>
                <Brain className={cn('h-5 w-5', gradeStyle?.text ?? 'text-primary')} />
              </div>
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  Portfolio Health
                  <span className={cn('px-2 py-0.5 rounded-lg text-xs font-bold border', gradeStyle?.bg, gradeStyle?.text, gradeStyle?.border)}>
                    <GradeIcon className="h-3 w-3 inline mr-1" />{healthReport.grade}
                  </span>
                </h3>
                <p className="text-xs text-muted-foreground">Score {healthReport.score}/100 · Win rate {healthReport.winRate}% · P&L ${healthReport.pnl.toLocaleString()}</p>
              </div>
            </div>
            <button onClick={refreshHealth} disabled={healthLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/50 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50">
              <RefreshCcw className={cn('h-3.5 w-3.5', healthLoading && 'animate-spin')} />Refresh Analysis
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div className="bg-secondary/20 rounded-xl p-3">
              <p className="text-xs text-muted-foreground mb-0.5">Diversification</p>
              <p className="text-sm font-semibold">{healthReport.diversification.score}/100</p>
              <p className="text-xs text-muted-foreground mt-0.5">{healthReport.diversification.detail}</p>
            </div>
            <div className="bg-secondary/20 rounded-xl p-3">
              <p className="text-xs text-muted-foreground mb-0.5">Concentration Risk</p>
              <p className={cn('text-sm font-semibold', healthReport.concentration.risk ? 'text-red-400' : 'text-green-400')}>{healthReport.concentration.risk ? '⚠️ High' : '✅ Low'}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{healthReport.concentration.detail}</p>
            </div>
            <div className="bg-secondary/20 rounded-xl p-3">
              <p className="text-xs text-muted-foreground mb-0.5">Volatility</p>
              <p className="text-sm font-semibold">{healthReport.volatility.level}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{healthReport.volatility.detail}</p>
            </div>
          </div>
          {healthReport.suggestions.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI Suggestions</p>
              {healthReport.suggestions.map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <Sparkles className="h-3.5 w-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                  <span className="text-muted-foreground">{s}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stat Cards */}
      <StatCards
        grandTotal={grandTotal}
        balance={balance}
        realExchangeTotal={realExchangeTotal}
        hasExchanges={hasExchanges}
        winRate={winRate}
        closedTradesCount={closedTrades.length}
        winnersCount={winners.length}
        losersCount={losers.length}
        profitFactor={profitFactor}
        grossWin={grossWin}
        maxDrawdown={maxDrawdown}
        bestTrade={bestTrade}
        worstTrade={worstTrade}
      />

      {/* Asset Allocation + Position Cards */}
      {positions.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2">
            <PortfolioAllocation onSelectAsset={(symbol) => setSelectedAsset(s => s === symbol ? null : symbol)} />
          </div>
          <div className="lg:col-span-3">
            <div className="flex items-center gap-2 mb-3">
              <PieChart className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">Open Positions</h3>
              {positionPnls.length > 0 && <span className="text-xs text-muted-foreground">· Live prices updated every 30s</span>}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-1">
              {(selectedAsset ? positionPnls.filter(p => p.symbol === selectedAsset) : positionPnls).map(p => (
                <AssetCard key={p.positionId} data={p} onClick={selectedAsset ? undefined : () => setSelectedAsset(p.symbol)} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Equity Curve */}
      <EquityChart history={history} balance={balance} />

      {/* Portfolio Value History */}
      <PortfolioHistoryChart />

      {/* Performance Attribution */}
      <PerformanceAttribution history={history} />

      {/* Risk Metrics */}
      <RiskMetrics history={history} />

      {/* Connected Exchanges */}
      <ConnectedExchanges
        connections={exchangeConnections}
        portfolios={exchangePortfolios}
        realExchangeTotal={realExchangeTotal}
      />

      {/* Trade History */}
      <TradeHistory history={history} />
    </div>
  );
}
