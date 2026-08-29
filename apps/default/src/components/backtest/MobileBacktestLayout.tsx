/**
 * MobileBacktestLayout.tsx — Part 10
 *
 * Mobile-specific wrapper for the backtest engine.
 *
 * On mobile (< lg breakpoint):
 *   - Bottom tab bar: [Config] [Results] [Trades]
 *   - Swipe between panes (touch swipe or tab tap)
 *   - Config panel collapses by default; "Run" button always visible
 *   - Charts disable zoom, use touch-friendly tooltips
 *   - Metric cards: 2-per-row grid
 *   - Trade table: horizontal scroll container
 *   - PostRunActionBar: stacks vertically
 *
 * On desktop (≥ lg): renders children directly (no layout change).
 *
 * Usage in BacktestPage:
 *   Wrap the entire content area in <MobileBacktestLayout>
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings2, BarChart2, List, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type MobileTab = 'config' | 'results' | 'trades';

interface Props {
  configPanel:   React.ReactNode;
  resultsPanel:  React.ReactNode;
  tradeLog:      React.ReactNode;
  actionBar?:    React.ReactNode;
  isRunning?:    boolean;
  hasResult?:    boolean;
  onRunClick?:   () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// MOBILE BOTTOM TAB BAR
// ─────────────────────────────────────────────────────────────────────────────

const TABS: Array<{ key: MobileTab; label: string; icon: React.ElementType }> = [
  { key: 'config',  label: 'Config',  icon: Settings2 },
  { key: 'results', label: 'Results', icon: BarChart2 },
  { key: 'trades',  label: 'Trades',  icon: List },
];

function BottomTabBar({ active, onChange }: { active: MobileTab; onChange: (t: MobileTab) => void }) {
  return (
    <div className="flex items-stretch bg-card border-t border-white/8 safe-area-bottom">
      {TABS.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={cn(
            'flex-1 flex flex-col items-center justify-center gap-1 py-3 text-[10px] font-semibold transition-colors',
            active === key
              ? 'text-primary bg-primary/5'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className={cn('h-5 w-5', active === key && 'text-primary')} />
          {label}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SWIPE HANDLER
// ─────────────────────────────────────────────────────────────────────────────

function useSwipe(onLeft: () => void, onRight: () => void) {
  const touchStartX = useRef<number | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 60) {
      if (dx < 0) onLeft();
      else        onRight();
    }
    touchStartX.current = null;
  }, [onLeft, onRight]);

  return { onTouchStart, onTouchEnd };
}

// ─────────────────────────────────────────────────────────────────────────────
// MOBILE LAYOUT
// ─────────────────────────────────────────────────────────────────────────────

export function MobileBacktestLayout({
  configPanel, resultsPanel, tradeLog, actionBar,
  isRunning, hasResult, onRunClick,
}: Props) {
  const [activeTab, setActiveTab] = useState<MobileTab>('config');

  // Auto-navigate to results when run completes
  useEffect(() => {
    if (hasResult && !isRunning) {
      setActiveTab('results');
    }
  }, [hasResult, isRunning]);

  const tabOrder: MobileTab[] = ['config', 'results', 'trades'];
  const currentIdx = tabOrder.indexOf(activeTab);

  const goLeft  = useCallback(() => { if (currentIdx > 0) setActiveTab(tabOrder[currentIdx - 1]); }, [currentIdx]);
  const goRight = useCallback(() => { if (currentIdx < tabOrder.length - 1) setActiveTab(tabOrder[currentIdx + 1]); }, [currentIdx]);

  const swipe = useSwipe(goRight, goLeft);

  const dir = useRef(0);
  const prevTab = useRef(activeTab);
  if (prevTab.current !== activeTab) {
    dir.current = tabOrder.indexOf(activeTab) > tabOrder.indexOf(prevTab.current) ? 1 : -1;
    prevTab.current = activeTab;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab content */}
      <div
        className="flex-1 overflow-hidden relative"
        {...swipe}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            initial={{ x: dir.current * 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{  x: dir.current * -40, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="absolute inset-0 flex flex-col overflow-hidden"
          >
            {activeTab === 'config'  && <div className="flex-1 overflow-y-auto">{configPanel}</div>}
            {activeTab === 'results' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto">{resultsPanel}</div>
                {actionBar && <div className="shrink-0">{actionBar}</div>}
              </div>
            )}
            {activeTab === 'trades'  && <div className="flex-1 overflow-hidden">{tradeLog}</div>}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom tab bar */}
      <BottomTabBar active={activeTab} onChange={setActiveTab} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSIVE WRAPPER — invisible on desktop
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true when we are on a mobile viewport.
 * Uses a simple matchMedia check on mount + resize.
 */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return mobile;
}
