import React from 'react';
import { Link } from 'react-router-dom';
import { BarChart2, Coins } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PortfolioHeaderProps {
  tradeCount: number;
  positionCount: number;
}

export function PortfolioHeader({ tradeCount, positionCount }: PortfolioHeaderProps) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <BarChart2 className="h-6 w-6 text-primary" />
          Portfolio & Performance
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          {tradeCount} total trade records · {positionCount} open position{positionCount !== 1 ? 's' : ''}
        </p>
      </div>
      <Link
        to="/wallet"
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/50 transition-all"
      >
        <Coins className="h-4 w-4" />
        Buy Credits
      </Link>
    </div>
  );
}

export default PortfolioHeader;
