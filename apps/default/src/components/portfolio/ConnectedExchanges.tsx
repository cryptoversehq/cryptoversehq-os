import React from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EXCHANGE_META, type ExchangeConnection, type RealPortfolioSnapshot, type ExchangeId } from '@/lib/exchangeTypes';

interface ConnectedExchangesProps {
  connections: ExchangeConnection[];
  portfolios: Record<string, RealPortfolioSnapshot>;
  realExchangeTotal: number;
}

export function ConnectedExchanges({ connections, portfolios, realExchangeTotal }: ConnectedExchangesProps) {
  const connectedExchanges = connections.filter(c => c.status === 'connected');

  if (connectedExchanges.length === 0) return null;

  return (
    <div className="bg-card border border-white/5 rounded-2xl p-5 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <ExternalLink className="h-4 w-4 text-primary" />
          Connected Exchanges
          <span className="text-xs text-muted-foreground font-normal">
            ({connectedExchanges.length})
          </span>
        </h3>
        <span className="text-sm font-mono font-bold text-green-400">
          ${realExchangeTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {connectedExchanges.map(conn => {
          const meta = EXCHANGE_META[conn.exchangeId as ExchangeId];
          const portfolio = portfolios[conn.id];
          return (
            <div
              key={conn.id}
              className="bg-secondary/20 rounded-xl p-4 border border-white/5 hover:border-white/10 transition-colors"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{meta?.logo ?? '🔗'}</span>
                <div>
                  <p className="font-semibold text-sm">{meta?.name ?? conn.exchangeId}</p>
                  <p className="text-xs text-muted-foreground">{conn.label || conn.exchangeId}</p>
                </div>
                <span className="ml-auto flex items-center gap-1.5 text-xs">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  Connected
                </span>
              </div>
              {portfolio ? (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Value</span>
                    <span className="font-mono font-semibold">${portfolio.totalUSD.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Assets</span>
                    <span className="font-mono">{portfolio.assets.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Daily P&L</span>
                    <span className={cn('font-mono font-semibold', portfolio.dailyPnL >= 0 ? 'text-green-400' : 'text-red-400')}>
                      {portfolio.dailyPnL >= 0 ? '+' : ''}${portfolio.dailyPnL.toFixed(2)}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Syncing...</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ConnectedExchanges;
