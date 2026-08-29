/**
 * tradingHelpText.ts
 *
 * Shared plain-English explanations for trading terminology, used by
 * InfoTooltip across both order-entry panels. Previously these strings
 * were only defined inline in TradePanel.tsx (the now-retired
 * Dashboard.tsx terminal) — ProTradePanel (the live /trading terminal)
 * had no equivalent. Centralizing them here means both panels — and any
 * future ones — read from the same source instead of copies drifting
 * apart over time.
 */
export type OrderTab = 'Limit' | 'Market' | 'Stop-Limit';

export const ORDER_TYPE_HELP: Record<OrderTab, string> = {
  Limit: 'You pick the exact price. The order only fills if the market reaches that price — you might wait, but you control the price.',
  Market: 'Fills immediately at the current price. Fast and certain, but you accept whatever the price is right now.',
  'Stop-Limit': 'Waits until the price crosses your "stop" trigger, then places a limit order. Used to enter or exit automatically without watching the screen.',
};

export const LEVERAGE_HELP =
  'Leverage multiplies both your position size and your risk. At 10x, a 10% price move against you can wipe out your margin.';

export const TPSL_HELP =
  "Take Profit auto-closes your position once it's up by a price you choose. Stop Loss auto-closes it if it drops too far, limiting your loss. Both are optional.";

export const STOP_PRICE_HELP =
  'Once the market price crosses this level, your order becomes active and tries to fill at the Price you set below.';
