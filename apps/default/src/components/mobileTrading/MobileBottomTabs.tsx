/**
 * MobileBottomTabs.tsx
 * 5-tab bottom navigation: Trade | Positions | Orders | History | Portfolio
 * Exactly like Binance mobile - switching tabs does NOT reload chart.
 * Respects safe-area-inset-bottom.
 */

import React from 'react';
import { cn } from '@/lib/utils';

type TabId = 'trade' | 'positions' | 'orders' | 'history' | 'portfolio' | 'book';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'trade', label: 'Trade', icon: String.fromCodePoint(0x1F4B0) },
  { id: 'positions', label: 'Positions', icon: String.fromCodePoint(0x1F4CA) },
  { id: 'orders', label: 'Orders', icon: String.fromCodePoint(0x1F4CB) },
  { id: 'history', label: 'History', icon: String.fromCodePoint(0x1F4C4) },
  { id: 'portfolio', label: 'Portfolio', icon: String.fromCodePoint(0x1F4BC) },
  { id: 'book', label: 'Book', icon: String.fromCodePoint(0x1F4D6) },
];

interface Props {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export function MobileBottomTabs({ activeTab, onTabChange }: Props) {
  return (
    <nav
      className="flex-shrink-0 flex items-stretch bg-card border-t border-border backdrop-blur-md"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      role="tablist"
      aria-label="Trading sections"
    >
      {TABS.map(tab => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-1 min-h-[56px] text-[10px] font-medium transition-colors',
              isActive ? 'text-amber-400' : 'text-white/35 hover:text-white/60',
            )}
          >
            <span className="text-lg">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
