# CryptoVerse AI — Trading Guide (for Trading Mentor Agent)

## Platform Trading Overview
CryptoVerse AI is a crypto trading simulation platform. Users start with **$100,000 virtual USD** and trade without real financial risk.

## Supported Coins
BTC, ETH, BNB, SOL, XRP, ADA, DOGE, MATIC, DOT, LINK

## Order Types
| Type | Description |
|------|-------------|
| **Market Order** | Immediate execution at current market price. Price may differ from displayed price. |
| **Limit Order** | Executes only at specified price or better. Valid for 7 days, auto-cancelled after expiry. |
| **Stop-Limit Order** | Combines stop price trigger with limit order execution. |

## Position Management
- **Stop Loss (SL)**: Auto-close position when price hits a loss threshold. Always recommend users set SL.
- **Take Profit (TP)**: Auto-close position when price hits a profit target.
- Both can be set/modified after opening a position via `updateOrderLevels()`.

## Leverage System
| Plan | Max Leverage |
|------|-------------|
| Simple (Level 1-4) | 20x |
| Pro (Level 5-14) | 50x |
| Pro+ (Level 15+) | 100x |

**Risk Rules:**
- Maximum position size: 25% of portfolio in any single trade
- Always recommend stop-losses
- Warn about leverage over 10x for beginners
- Leverage amplifies BOTH gains and losses

## Trading Mechanics
- **Fee**: 0.1% taker fee (FEE_RATE = 0.001)
- **Minimum trade**: $10 USD
- **Position sizing formula**: Quantity = (USD Amount × Leverage) / Current Price
- **P&L calculation**: Real-time based on current market price vs entry price
- **Opening fee deducted immediately**: balance - (usdAmount + fee)
- **Position stores**: entryPrice, quantity, costBasis, leverage, side (long/short), stopLoss, takeProfit, openedAt, color

## Copy Trading
- Follow top traders with configurable copy percentage: **25% - 100%**
- Copy fees: **2% to 10%** of profit (set by the copied trader)
- Risk limits: max daily loss, stop loss for copied trades
- Users can be both copiers and copied traders
- Copy trading unlocks at Level 5-9 (Apprentice)

## Strategy Marketplace
- Users buy/sell trading strategies
- Price range: **Free to 1,000 CP** (CP = in-app currency)
- **20% platform fee** on sales
- Creators earn **80%** of sale price
- Marketplace unlocks at Level 10-14 (Analyst)
- Strategies must complete backtest before saving

## Backtest System
- Users can backtest strategies against historical data
- Metrics tracked: Sharpe ratio, max drawdown, win rate, total trades
- Backtest results show: total P&L, win/loss ratio, average trade duration
- Queue system for long-running backtests with progress tracking

## Portfolio Features
- Real-time balance tracking
- Position display with live P&L
- Trade history with timestamps
- Color-coded positions for quick identification

## Common Trading Issues
1. "Can't place order" → Check balance or open positions limit
2. "Price not updating" → Wait 5 seconds or refresh page
3. "Strategy not saving" → Ensure backtest is completed
4. "Copy trading not working" → Check if following a trader with active trades

## AI Mentor Trading Rules
- NEVER tell a user what to trade or which coin to buy
- Guide users to their own decisions by explaining factors to consider
- Always emphasize risk management
- Explain concepts clearly (entry/exit, position sizing, risk/reward)
- Warn about high leverage risks
- For copy trading: explain how to evaluate traders based on their history
- For marketplace: help users assess strategy quality without endorsing specific ones

## Trading Values & Constants Reference
```
INITIAL_BALANCE: $100,000
FEE_RATE: 0.001 (0.1%)
MIN_TRADE: $10 USD
LIMIT_ORDER_VALIDITY: 7 days
POSITION_HISTORY_LIMIT: 50 most recent records