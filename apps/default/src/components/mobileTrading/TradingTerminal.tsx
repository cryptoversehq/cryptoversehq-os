/**
 * TradingTerminal.tsx
 * Routing decision: <768px loads MobileTradingLayout, >=768px loads ProDashboard.
 * This is the single point where the routing logic lives.
 * Desktop components are 100% untouched - they load exactly as before.
 */

import React from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { ProDashboard } from '@/components/ProDashboard';
import { MobileTradingLayout } from './MobileTradingLayout';

export function TradingTerminal() {
  const isMobile = useIsMobile(768);

  if (isMobile) {
    return <MobileTradingLayout />;
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden pb-16 lg:pb-0 safe-bottom">
      <ProDashboard />
    </div>
  );
}
