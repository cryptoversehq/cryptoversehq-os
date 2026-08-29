# CryptoVerse AI — Bot Guide (for Bot Engineer Agent)

## Supported Bot Types
| Type | Description |
|------|-------------|
| **Grid Bot** | Places buy/sell orders at fixed price intervals around market price. Profits from price oscillation. |
| **Martingale Bot** | Doubles down after each loss to recover on reversal. Cycle-based with configurable multiplier. |
| **DCA Bot** | Dollar-cost averages into a position on a schedule. Regular buys at set intervals. |
| **Arbitrage Bot** | Exploits price differences between trading pairs. Scans for opportunities on schedule. |
| **Rebalancing Bot** | Maintains target portfolio allocations by rebalancing when drift exceeds threshold. |

## Bot Lifecycle Statuses
| Status | Meaning |
|--------|---------|
| **active** | Running — executes on each tick/interval |
| **paused** | Suspended by user — preserves state, not executing |
| **stopped** | Fully stopped — all open orders cancelled |
| **error** | Halted due to execution error — user intervention required |

## Stop Reasons
- `user_stopped` — Manual stop by user
- `user_paused` — User paused
- `insufficient_balance` — Balance below minBalance requirement
- `max_loss_reached` — Hit configured max daily/total loss limit
- `daily_loss_limit` — Daily loss limit reached
- `error_threshold` — Too many consecutive errors
- `rate_limited` — API rate limit hit (auto-resume)
- `network_error` — Connection lost (auto-resume)
- `admin_disabled` — Admin deactivated the underlying template

## Schedule Types
| Type | Behavior |
|------|----------|
| **continuous** | Runs on every price tick (fastest, highest CPU) |
| **interval** | Runs every N minutes (e.g., "5m", "15m", "1h", "4h", "1d") |
| **cron** | Runs on a cron schedule (e.g., "0 */4 * * *" = every 4 hours) |

## Grid Bot Configuration
- `coinId` / `coinSymbol` — Target trading pair
- `totalInvestment` — Total USD to allocate across grid
- `gridCount` — Number of grid levels (min 2, max 100)
- `lowerPrice` / `upperPrice` — Grid bounds in USD
- `autoAdjust` — If true, auto-adjusts bounds based on ATR volatility
- `stopLossPrice` — Bot stops if price falls below (0 = disabled)
- `takeProfitPrice` — Bot stops if price rises above (0 = disabled)
- `feeRate` — Fee per trade as decimal (e.g., 0.001 = 0.1%)

**How it works:** Creates a ladder of buy orders at each grid level below market, sell orders above. When price crosses a grid line, executes the order and re-places it at the adjacent level. Profits from oscillation.

## Martingale Bot Configuration
- `coinId` / `coinSymbol` — Target coin
- `baseAmount` — Starting order size in USD
- `multiplier` — Size multiplier after each loss (typically 1.5x-2x)
- `maxConsecutiveLosses` — Auto-stop threshold
- `takeProfit` — Take profit % per cycle
- `stopLoss` — Global stop loss %
- `direction` — "long", "short", or "both" (alternates each cycle)
- `minBalance` — Minimum balance to keep operating

**How it works:** Opens position at baseAmount. If loss → next position = baseAmount × multiplier. If maxConsecutiveLosses reached → stops. After win → resets. Direction "both" alternates long/short each cycle.

## DCA Bot Configuration
- `coinId` / `coinSymbol` — Target coin
- `baseAmount` — USD to invest per interval
- `orderType` — "fixed" (fixed USD) or "scale" (increases on dips)
- `interval` — Time between buys (e.g., "1d", "12h", "4h")
- `scaleBuyDrop` — % drop that triggers scale-up buy
- `scaleBuyMultiplier` — Multiplier on drop
- `minBalance` — Minimum balance to keep operating
- `takeProfit` / `stopLoss` / `trailingStop` — Exit conditions

**How it works:** Buys fixed amount at regular intervals. In scale mode, increases buy amount when price drops. Tracks average entry. Exits at takeProfit %.

## Arbitrage Bot Configuration
- `baseCoin` — e.g., "BTC"
- `quoteCoin` — e.g., "USDT"
- `pairs` — List of pairs to scan
- `minSpread` — Minimum % spread to execute
- `orderSize` — USD per trade
- `scanIntervalMs` — Scan frequency
- `maxSlippage` — Maximum acceptable slippage %
- `minBalance` — Minimum balance required

**How it works:** Scans price differences between pairs. When spread > minSpread, executes buy on cheaper + sell on expensive simultaneously.

## Rebalancing Bot Configuration
- `allocations` — Target % per coin (e.g., {BTC: 40, ETH: 30, SOL: 20, USDT: 10})
- `driftThreshold` — % deviation that triggers rebalance
- `rebalanceInterval` — How often to check
- `minTradeSize` — Minimum USD per rebalance trade
- `maxSlippage` — Maximum acceptable slippage
- `minBalance` — Minimum portfolio value

**How it works:** Monitors allocation vs targets. When any coin drifts beyond threshold, executes trades to restore targets.

## Performance Tracking
- Total P&L (USD and %), Win rate (%), Total executions
- Max drawdown (%), Sharpe ratio, Equity curve
- Runtime duration, Consecutive errors, Last error message

## Bot Limits
- Max consecutive errors before auto-stop: **5**
- Max bots: system managed
- Backtest required before production deployment

## AI Bot Engineer Rules
- Explain bot types and when each is appropriate
- Guide users through BotCreateWizard step by step
- Help configure parameters based on user goals
- Explain backtesting results in plain language
- Always emphasize: past performance ≠ future results
- Recommend conservative settings for beginners
- Suggest paper-testing before real deployment
- Bots amplify losses — always recommend stop conditions