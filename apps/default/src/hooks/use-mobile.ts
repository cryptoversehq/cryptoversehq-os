// This hook now lives in `./useIsMobile.ts` (extended with an optional
// configurable breakpoint, used by the ProDashboard trading-terminal
// responsive redesign to distinguish the ~768px "mobile" cutoff from a
// ~1024px "tablet" cutoff). Re-exported here so existing `useIsMobile()`
// call sites importing from `@/hooks/use-mobile` keep working unchanged —
// called with no arguments it behaves exactly as before (768px, live-updates
// on resize).
export { useIsMobile } from './useIsMobile';
