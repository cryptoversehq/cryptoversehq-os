/**
 * MobileChart.tsx
 * Full-width, edge-to-edge chart for mobile.
 * No padding, no margins, no white borders.
 * Wraps TradingChart with compact mode + external timeframe control.
 */

import React from 'react';
import { TradingChart } from '@/components/trading/TradingChart';
import { ChartErrorBoundary } from '@/components/common/ChartErrorBoundary';
import { getBasePrice as getBase } from '@/lib/priceSimulation';
import type { OrderBook } from '@/lib/marketEngine';
import type { Timeframe } from '@/lib/marketEngine';

interface MobileChartProps {
  coinId: string;
  coinSymbol: string;
  coinColor: string;
  currentPrice: number;
  prevPrice: number;
  priceChange24h: number;
  high24h: number;
  low24h: number;
  vol24h: number;
  orderBook: OrderBook | null;
  positions: { entryPrice: number; side: string; color: string }[];
  timeframe: string;
  wsConnected: boolean;
  onTimeframeChange?: (tf: string) => void;
}

export function MobileChart(props: MobileChartProps) {
  const {
    coinId, coinSymbol, coinColor, currentPrice, prevPrice, priceChange24h,
    high24h, low24h, vol24h, orderBook, positions, timeframe, wsConnected,
    onTimeframeChange,
  } = props;

  return (
    <div className="w-full h-full overflow-hidden bg-background" style={{ padding: 0, margin: 0 }}>
      <ChartErrorBoundary label="Mobile Chart">
        <TradingChart
          coinId={coinId}
          coinSymbol={coinSymbol}
          coinColor={coinColor}
          basePrice={getBase(coinId)}
          currentPrice={currentPrice}
          prevPrice={prevPrice}
          priceChange24h={priceChange24h}
          high24h={high24h}
          low24h={low24h}
          vol24h={vol24h}
          orderBook={orderBook}
          positions={positions}
          beginnerMode={false}
          showTickerBar={false}
          compact
          timeframe={timeframe as Timeframe}
          onTimeframeChange={onTimeframeChange as ((tf: Timeframe) => void) | undefined}
        />
      </ChartErrorBoundary>
    </div>
  );
}
