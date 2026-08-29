import React from 'react';
import { TrendingUp, Target, AlertTriangle, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  icon: React.ElementType;
}

function StatCard({ label, value, sub, color, icon: Icon }: StatCardProps) {
  return (
    <div className="bg-card border border-white/5 rounded-2xl p-5 shadow-lg relative overflow-hidden group">
      <div className={cn('absolute inset-0 bg-gradient-to-br to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500', color ?? 'from-primary/10')} />
      <div className="flex items-start gap-4">
        <div className={cn('p-2.5 rounded-xl flex-shrink-0', color ? color.replace('from-', 'bg-').replace('/10', '/20') : 'bg-primary/20')}>
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
          <p className="text-xl font-bold font-mono">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

interface StatCardsProps {
  grandTotal: number;
  balance: number;
  realExchangeTotal: number;
  hasExchanges: boolean;
  winRate: number;
  closedTradesCount: number;
  winnersCount: number;
  losersCount: number;
  profitFactor: number;
  grossWin: number;
  maxDrawdown: number;
  bestTrade: number;
  worstTrade: number;
}

export function StatCards({
  grandTotal, balance, realExchangeTotal, hasExchanges,
  winRate, closedTradesCount, winnersCount, losersCount,
  profitFactor, grossWin, maxDrawdown, bestTrade, worstTrade,
}: StatCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        label={hasExchanges ? 'Grand Total (Sim + Live)' : 'Current Balance'}
        value={`$${grandTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
        sub={`$${balance.toLocaleString()} simulated${hasExchanges ? ` + $${realExchangeTotal.toLocaleString()} real` : ''}`}
        icon={Activity}
        color="from-primary/10"
      />
      <StatCard
        label="Win Rate"
        value={closedTradesCount > 0 ? `${winRate.toFixed(1)}%` : '—'}
        sub={`${winnersCount}W / ${losersCount}L`}
        icon={Target}
        color="from-green-500/10"
      />
      <StatCard
        label="Profit Factor"
        value={profitFactor === Infinity ? '∞' : profitFactor.toFixed(2)}
        sub={`Gross win $${grossWin.toFixed(0)}`}
        icon={TrendingUp}
        color="from-blue-500/10"
      />
      <StatCard
        label="Max Drawdown"
        value={`${maxDrawdown.toFixed(2)}%`}
        sub={`Best $${bestTrade.toFixed(0)} / Worst $${worstTrade.toFixed(0)}`}
        icon={AlertTriangle}
        color="from-orange-500/10"
      />
    </div>
  );
}

export default StatCards;
