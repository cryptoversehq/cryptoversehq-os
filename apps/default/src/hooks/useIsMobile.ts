import { useState, useEffect } from 'react';

/**
 * Tracks whether the viewport is narrower than `breakpoint` (default 768px,
 * Tailwind's `md` cutoff), updating live on window resize/orientation change.
 *
 * Used by the trading terminal (ProDashboard) to switch between the desktop
 * multi-panel layout and the mobile single-pane tabbed layout, and by
 * TradingChart/OrderBook to adjust height, row counts, and font sizes.
 */
export function useIsMobile(breakpoint: number = 768) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < breakpoint;
  });

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < breakpoint);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [breakpoint]);

  return isMobile;
}
