/**
 * botTypes.ts
 *
 * Complete type definitions for the CryptoVerse HQ Trading Bots system.
 *
 * Covers:
 *   - BotTemplate    (system-defined bot blueprints with default configs)
 *   - UserBot        (user-configured runtime instances)
 *   - BotExecution   (immutable execution/trade log)
 *   - Config schemas (per-type typed parameter objects)
 *   - Schedule types (continuous / interval / cron)
 *   - Performance    (metrics computed from execution log)
 *   - Filters/sort   (for bot list views)
 *   - Admin types    (template management, global stats)
 */

// ─────────────────────────────────────────────────────────────────────────────
// BOT TYPE
// ─────────────────────────────────────────────────────────────────────────────

/** All supported bot algorithm families. */
export type BotType =
  | 'grid'          // Places buy/sell orders at fixed price intervals around market price
  | 'martingale'    // Doubles down after each loss to recover faster on reversal
  | 'dca'           // Dollar-cost averages into a position on a schedule
  | 'arbitrage'     // Exploits price differences between coin pairs
  | 'rebalancing';  // Maintains target portfolio allocations by rebalancing on drift

// ─────────────────────────────────────────────────────────────────────────────
// BOT STATUS & LIFECYCLE
// ─────────────────────────────────────────────────────────────────────────────

/** Full lifecycle of a user bot instance. */
export type BotStatus =
  | 'active'    // Running — will execute on each tick/interval
  | 'paused'    // Suspended by user — preserves state, not executing
  | 'stopped'   // Fully stopped — all open grid orders cancelled
  | 'error';    // Halted due to an execution error; requires user intervention

/** Why a bot was stopped (logged in the bot record). */
export type BotStopReason =
  | 'user_stopped'         // User manually stopped the bot
  | 'user_paused'          // User paused
  | 'insufficient_balance' // Balance fell below minBalance requirement
  | 'max_loss_reached'     // Hit the configured max daily/total loss limit
  | 'daily_loss_limit'     // Daily loss limit specifically
  | 'error_threshold'      // Too many consecutive errors
  | 'rate_limited'         // API rate limit hit (auto-resume)
  | 'network_error'        // Connection lost (auto-resume)
  | 'admin_disabled';      // Admin deactivated the underlying template

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULE
// ─────────────────────────────────────────────────────────────────────────────

/** How the bot determines when to run its next execution cycle. */
export type BotScheduleType =
  | 'continuous' // Runs on every price tick (fastest, highest CPU)
  | 'interval'   // Runs every N minutes (e.g. "5m", "15m", "1h")
  | 'cron';      // Runs on a cron schedule (e.g. "0 */4 * * *")

/** Parsed interval — used when scheduleType === 'interval'. */
export interface BotIntervalSchedule {
  type: 'interval';
  /** Value string e.g. "5m", "15m", "1h", "4h", "1d" */
  value: string;
  /** Milliseconds equivalent of the interval */
  intervalMs: number;
}

/** Cron schedule — used when scheduleType === 'cron'. */
export interface BotCronSchedule {
  type: 'cron';
  // Standard 5-field cron expression — e.g. "0 every-4-hours * * *" or "0 0 * * *"
  expression: string;
  /** Human-readable description e.g. "Every 4 hours" */
  description: string;
}

export type BotSchedule =
  | { type: 'continuous' }
  | BotIntervalSchedule
  | BotCronSchedule;

// ─────────────────────────────────────────────────────────────────────────────
// PER-TYPE CONFIG SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Grid Bot configuration.
 * Places a ladder of buy orders below the current price and sell orders above.
 * Profits from price oscillation within the grid range.
 */
export interface GridBotConfig {
  coinId: string;             // Target trading pair (base coin vs USDT)
  coinSymbol: string;         // e.g. "BTC"
  totalInvestment: number;    // Total USD to allocate across grid
  gridCount: number;          // Number of grid levels (min 2, max 100)
  lowerPrice: number;         // Lower bound of the price grid (USD)
  upperPrice: number;         // Upper bound of the price grid (USD)
  /** If true, auto-adjusts grid bounds based on ATR volatility */
  autoAdjust: boolean;
  /** Stop-loss price — bot stops if price falls below this (0 = disabled) */
  stopLossPrice: number;
  /** Take-profit price — bot stops if price rises above this (0 = disabled) */
  takeProfitPrice: number;
  /** Fee rate per trade as a decimal (e.g. 0.001 = 0.1%) */
  feeRate: number;
}

/**
 * Martingale Bot configuration.
 *
 * Cycle-based martingale that tracks consecutive losses.
 * After each losing trade the position size is multiplied by `multiplier`.
 * After a win, everything resets to `baseAmount`.
 * If `consecutiveLosses` reaches `maxConsecutiveLosses` the bot auto-stops.
 *
 * direction "both" → alternates long/short each cycle based on last result.
 */
export interface MartingaleBotConfig {
  coinId: string;
  coinSymbol: string;
  /** Initial position size in USD ($10–$1,000). */
  baseAmount: number;
  /** Multiplier applied to position size after each loss (1.5×–3.0×). */
  multiplier: number;
  /** Bot stops automatically after this many consecutive losses (3–10). */
  maxConsecutiveLosses: number;
  /** Profit target per trade cycle in % (1%–5%). */
  takeProfitPct: number;
  /** Trade direction: "long" (always buy), "short" (always sell), "both" (alternate). */
  direction: 'long' | 'short' | 'both';
  feeRate: number;

  // ── Legacy fields kept for backward-compat with botUtils helpers ──────────
  // (used only internally, not shown in UI)
  baseOrderSize: number;       // mirrors baseAmount
  safetyOrderSize: number;     // unused — set to baseAmount
  maxSafetyOrders: number;     // mirrors maxConsecutiveLosses
  priceDeviation: number;      // fixed at 2.5
  volumeMultiplier: number;    // mirrors multiplier
  stepScale: number;           // fixed at 1.0
  side: 'long' | 'short';     // derived from direction at runtime
  stopLossPct: number;         // fixed at 0
}

/**
 * DCA Bot configuration — spec-exact.
 *
 * Accumulates a position by placing buy orders as price drops.
 * Each subsequent order is triggered when price drops `priceDropPct`%
 * below the previous buy price. Exits when price rises `takeProfitPct`%
 * above the weighted-average entry.
 *
 * With `partialExit = true`, sells half the position on first TP hit,
 * then holds the rest. With `partialExit = false`, sells everything
 * and stops the bot.
 */
export interface DcaBotConfig {
  coinId:     string;
  coinSymbol: string;

  /** First purchase amount in USD ($100–$10,000). */
  initialInvestment: number;
  /** Total number of buy orders to place (2–20). */
  numberOfOrders: number;
  /** % price drop below the last buy price that triggers the next buy (1%–10%). */
  priceDropPct: number;
  /** % rise above weighted average entry to trigger the exit (2%–20%). */
  takeProfitPct: number;
  /** If true, sell half at TP and hold the rest; if false, sell all and stop. */
  partialExit: boolean;

  feeRate: number;

  // ── Legacy compat (kept so botUtils helpers compile) ──────────────────────
  orderSize:           number;   // mirrors initialInvestment
  interval:            string;   // unused — set to '1m'
  dipThresholdPct:     number;   // mirrors priceDropPct
  dipMultiplier:       number;   // unused — set to 1
  maxTotalInvestment:  number;   // auto-computed: initialInvestment * numberOfOrders
}

/**
 * A single monitored trading pair for the Arbitrage bot.
 * In demo/simulation mode the bot generates a synthetic spread against USDT.
 */
export interface ArbitragePair {
  /** CoinGecko coin id — used for live price lookup */
  coinId: string;
  /** Human-readable symbol, e.g. "BTC" */
  symbol: string;
  /** Display label, e.g. "BTC/USDT" */
  pair: string;
}

/**
 * Arbitrage Bot configuration — spec-exact.
 *
 * Scans up to 5 pairs every `scanIntervalSec` seconds.
 * For each pair it simulates a buy-market / sell-market spread.
 * When the best opportunity's profit % ≥ minProfitPct it fires
 * an atomic buy + sell execution and logs the arb cycle.
 */
export interface ArbitrageBotConfig {
  /**
   * Up to 5 trading pairs to monitor.
   * Spec: for (const pair of monitoredPairs)
   */
  monitoredPairs: ArbitragePair[];

  /**
   * Minimum profit % required to execute an arb trade (0.1%–2%).
   * Spec: if (profitPercent >= minProfitPercent)
   */
  minProfitPct: number;

  /**
   * Maximum USD committed per arbitrage execution ($100–$50,000).
   * Spec: maxPositionSize
   */
  maxPositionSize: number;

  /**
   * How often (in seconds) to scan for opportunities (5–60).
   * Spec: Scan Interval
   */
  scanIntervalSec: number;

  feeRate: number;

  // ── Legacy compat (kept so existing code referencing old fields compiles) ──
  pairA:          string;
  coinAId:        string;
  coinASymbol:    string;
  pairB:          string;
  coinBId:        string;
  coinBSymbol:    string;
  minSpreadPct:   number;   // mirrors minProfitPct
  maxPositionUsd: number;   // mirrors maxPositionSize
  maxHoldMinutes: number;   // unused — arb is instant
}

/**
 * A single arbitrage opportunity evaluated during one scan.
 * Spec: opportunities.push({ pair, buyPrice, sellPrice, profitPercent, profitAmount })
 */
export interface ArbitrageOpportunity {
  pair:          string;
  coinId:        string;
  symbol:        string;
  buyPrice:      number;
  sellPrice:     number;
  profitPercent: number;
  profitAmount:  number;
}

/**
 * A completed arb execution cycle — immutable record logged to state.
 * Maps to the spec's logArbitrage(best) call.
 */
export interface ArbitrageCycle {
  id:            string;
  pair:          string;
  symbol:        string;
  buyPrice:      number;
  sellPrice:     number;
  positionUsd:   number;
  profitPercent: number;
  netProfitUsd:  number;
  feesPaid:      number;
  executedAt:    string;
}

/**
 * Runtime state for the Arbitrage Bot.
 */
export interface ArbitrageState {
  botId:            string;
  /** Timestamp of the last scan (ISO-8601). Used to respect scanIntervalSec. */
  lastScanAt:       string | null;
  /** Total completed arbitrage cycles since bot started. */
  totalCycles:      number;
  /** Running total net profit from all cycles. */
  totalNetProfit:   number;
  /** Most recent N completed cycles (capped at 50). */
  recentCycles:     ArbitrageCycle[];
  /** Opportunities found in the last scan (may be empty). */
  lastScanOpps:     ArbitrageOpportunity[];
  lastUpdatedAt:    string;
}

/**
 * One asset entry in the Rebalancing Bot portfolio.
 * Spec: portfolio[i] + targetPercentages[i] are two parallel arrays;
 * we merge them into a single object for ergonomics.
 */
export interface RebalancingAsset {
  coinId:     string;
  coinSymbol: string;
  coinColor:  string;
  /** Target allocation percentage (0–100). All assets must sum to 100. */
  targetPct:  number;
}

/**
 * Rebalancing Bot configuration — spec-exact.
 *
 * Spec variable mapping:
 *   portfolio          → assets[].coinId  (up to 10)
 *   targetPercentages  → assets[].targetPct (sum to 100)
 *   rebalanceThreshold → rebalanceThresholdPct (1%–15%)
 *   rebalanceInterval  → rebalanceIntervalHours (1–168)
 *   minTradeSize       → minTradeSizeUsd ($10–$500)
 */
export interface RebalancingBotConfig {
  /**
   * Assets in the portfolio (up to 10).
   * Spec: portfolio = ["BTC","ETH","BNB"]
   */
  assets: RebalancingAsset[];

  /**
   * Trigger a rebalance when any asset's deviation exceeds this %.
   * Spec: rebalanceThreshold (1%–15%)
   */
  rebalanceThresholdPct: number;

  /**
   * Hours between rebalance checks (1–168).
   * Spec: rebalanceInterval (hours)
   */
  rebalanceIntervalHours: number;

  /**
   * Minimum USD trade size to execute — smaller trades are skipped.
   * Spec: minTradeSize ($10–$500)
   */
  minTradeSizeUsd: number;

  /**
   * Total portfolio value in USD — used to compute initial coin amounts.
   */
  totalPortfolioUsd: number;

  feeRate: number;

  // ── Legacy compat (kept so existing code compiles) ────────────────────────
  /** @deprecated use assets instead */
  allocations: RebalancingAsset[];
  /** @deprecated use rebalanceThresholdPct */
  driftThresholdPct: number;
  /** @deprecated use rebalanceIntervalHours */
  checkInterval: string;
}

/** Discriminated union of all bot config types. */
export type BotConfig =
  | ({ type: 'grid' }        & GridBotConfig)
  | ({ type: 'martingale' }  & MartingaleBotConfig)
  | ({ type: 'dca' }         & DcaBotConfig)
  | ({ type: 'arbitrage' }   & ArbitrageBotConfig)
  | ({ type: 'rebalancing' } & RebalancingBotConfig);

// ─────────────────────────────────────────────────────────────────────────────
// BOT TEMPLATE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * System-defined bot blueprint.
 * Admins maintain these; users instantiate them into UserBot instances.
 */
export interface BotTemplate {
  id: string;                   // UUIDv4 primary key
  name: string;                 // e.g. "Grid Bot", "Safe DCA"
  type: BotType;
  description: string;          // Full description with use-case guidance
  shortDescription: string;     // One-liner for card display
  /** Complete default config object — fully typed per BotType */
  defaultConfig: BotConfig;
  /** Minimum virtual USD balance required to activate this bot */
  minBalance: number;
  riskLevel: 'low' | 'medium' | 'high';
  /** Is this template available to users? Admin-controlled. */
  isActive: boolean;
  /** Minimum subscription plan required to use this template */
  requiredPlan: 'bronze' | 'silver' | 'gold' | 'any';
  /** Minimum academy XP level required */
  requiredLevel: number;
  /** Estimated monthly return % shown on template card (from historical sim) */
  estimatedMonthlyReturnPct: number;
  /** Tags for discoverability e.g. ['beginner', 'btc', 'low-risk'] */
  tags: string[];
  /** Total number of active instances across all users */
  activeInstances: number;
  /** How many users have ever used this template */
  totalUsers: number;
  createdAt: string;            // ISO-8601
  updatedAt: string;            // ISO-8601
}

// ─────────────────────────────────────────────────────────────────────────────
// USER BOT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A user-created and configured bot instance.
 * Derived from a BotTemplate; config may differ from template defaults.
 */
export interface UserBot {
  id: string;                   // UUIDv4 primary key
  userId: string;               // references UserProfile.id
  templateId: string;           // references BotTemplate.id
  templateType: BotType;        // denormalized for fast filtering
  name: string;                 // user's custom label (max 60 chars)

  /** User-modified config — may differ from template defaults */
  config: BotConfig;

  status: BotStatus;
  stopReason: BotStopReason | null;
  lastError: string | null;     // last execution error message
  consecutiveErrors: number;    // resets on success; triggers stop at threshold

  // ── Schedule ──────────────────────────────────────────────────────────────
  scheduleType: BotScheduleType;
  scheduleValue: string;        // e.g. "5m", "0 */4 * * *", "continuous"
  lastRunAt: string | null;     // ISO-8601
  nextRunAt: string | null;     // ISO-8601 (estimated)

  // ── Performance (updated after each execution) ────────────────────────────
  totalTrades: number;
  totalBuyTrades: number;
  totalSellTrades: number;
  totalProfit: number;          // cumulative net USD profit (negative = loss)
  totalProfitPct: number;       // relative to initial investment
  totalFeesPaid: number;        // cumulative fees in USD
  winRate: number;              // % of sell trades that were profitable (0-100)
  winningTrades: number;
  losingTrades: number;
  bestTrade: number;            // highest single trade profit in USD
  worstTrade: number;           // lowest single trade profit (most negative)
  maxDrawdown: number;          // peak-to-trough drawdown % since bot started
  /** Running total amount invested (buys) */
  totalInvested: number;

  // ── Equity curve (sampled — max 500 points) ───────────────────────────────
  equityCurve: Array<{ ts: number; value: number }>;

  // ── Risk limits (user-configurable overrides) ─────────────────────────────
  /** Auto-stop if daily loss exceeds this USD amount (0 = disabled) */
  maxDailyLossUsd: number;
  /** Auto-stop if total loss exceeds this USD amount (0 = disabled) */
  maxTotalLossUsd: number;

  // ── Timestamps ────────────────────────────────────────────────────────────
  createdAt: string;            // ISO-8601
  updatedAt: string;            // ISO-8601
  startedAt: string | null;     // ISO-8601 — when status last became 'active'
  stoppedAt: string | null;     // ISO-8601 — when status last became 'stopped'
  pausedAt: string | null;      // ISO-8601 — when status last became 'paused'
}

// ─────────────────────────────────────────────────────────────────────────────
// BOT EXECUTION
// ─────────────────────────────────────────────────────────────────────────────

/** Outcome of a single execution cycle. */
export type ExecutionStatus = 'pending' | 'completed' | 'failed' | 'skipped';

/**
 * An immutable record of one buy or sell trade made by a bot.
 * Never mutated after creation — append-only log.
 */
export interface BotExecution {
  id: string;                   // UUIDv4 primary key
  botId: string;                // references UserBot.id
  userId: string;               // references UserProfile.id (denormalized)
  templateType: BotType;        // denormalized for fast filtering

  action: 'buy' | 'sell';
  coinId: string;
  coinSymbol: string;

  /** Price at execution time (simulated market price) */
  price: number;
  /** Coin quantity traded */
  amount: number;
  /** USD value: price × amount */
  total: number;
  /** Fee charged on this trade in USD */
  fee: number;

  /** Net P&L for sell trades (null for buys) */
  pnl: number | null;
  /** P&L as % of cost basis (null for buys) */
  pnlPct: number | null;

  status: ExecutionStatus;
  errorMessage: string | null;

  /** Which scheduled cycle triggered this execution */
  cycleId: string;

  executedAt: string;           // ISO-8601
}

// ─────────────────────────────────────────────────────────────────────────────
// GRID STATE (internal — persisted per grid bot)
// ─────────────────────────────────────────────────────────────────────────────

/** Represents one level in the price grid. */
export interface GridLevel {
  index: number;                // 0 = lowest level
  price: number;                // USD price this level sits at
  side: 'buy' | 'sell';        // Current order type at this level
  filled: boolean;              // Has this level been executed?
  orderId: string;              // Reference to the BotExecution.id that filled it
  filledAt: string | null;      // ISO-8601
}

/** Full grid state for a running grid bot — stored alongside the UserBot. */
export interface GridState {
  botId: string;
  levels: GridLevel[];
  initialPrice: number;         // Price when the grid was first set up
  lastTickPrice: number;        // Last price processed by the tick engine
  lastUpdatedAt: string;        // ISO-8601
}

// ─────────────────────────────────────────────────────────────────────────────
// MARTINGALE STATE
// ─────────────────────────────────────────────────────────────────────────────

/** Tracks the current martingale cycle state. */
export interface MartingaleState {
  botId: string;
  // ── Spec-aligned fields ───────────────────────────────────────────────────
  /** Number of consecutive losses in the current cycle (resets on win). */
  consecutiveLosses: number;
  /** Current position-size multiplier: baseAmount × currentMultiplier. */
  currentMultiplier: number;
  /** Direction for the next trade (resolved from config.direction). */
  nextSide: 'long' | 'short';
  /** Price at which the current open trade was entered (0 = no open trade). */
  openEntryPrice: number;
  /** USD size of the current open trade. */
  openPositionUsd: number;
  /** True when a trade is open waiting for TP or loss signal. */
  hasOpenTrade: boolean;
  // ── Legacy fields (kept for botUtils compat) ──────────────────────────────
  safetyOrdersFilled: number;
  weightedAvgEntry: number;
  totalInvestedUsd: number;
  totalCoinAmount: number;
  baseOrderFilled: boolean;
  lastOrderPrice: number;
  takeProfitPrice: number;
  lastUpdatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// DCA STATE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DCA Bot runtime state — tracks the accumulation position.
 *
 * Spec variable mapping:
 *   ordersPlaced     → spec `ordersPlaced`
 *   totalInvestment  → spec `totalInvestment`
 *   totalShares      → spec `totalShares`
 *   averagePrice     → spec `averagePrice`
 *   firstBuyPrice    → price of order #1 (reference for drop calculation)
 *   lastBuyPrice     → price of the most recent buy (drop threshold anchor)
 *   partialExitDone  → true after the first half-sell (partialExit mode)
 *   remainingShares  → coins still held after partial exit
 */
export interface DcaState {
  botId: string;

  // ── Spec fields ───────────────────────────────────────────────────────────
  /** How many buy orders have been placed so far (starts at 0, first buy → 1). */
  ordersPlaced: number;
  /** Total USD invested across all orders. Spec: totalInvestment. */
  totalInvestment: number;
  /** Total coins accumulated. Spec: totalShares. */
  totalShares: number;
  /** Weighted average buy price. Spec: averagePrice. */
  averagePrice: number;
  /** Price of the very first buy — used as the initial drop anchor. */
  firstBuyPrice: number;
  /** Price of the most recent buy — each new buy triggers off this. */
  lastBuyPrice: number;
  /** True after the partial exit sell has fired (partialExit mode). */
  partialExitDone: boolean;
  /** Coins remaining after partial exit (0 until partial exit fires). */
  remainingShares: number;

  // ── Legacy compat fields (kept so existing code compiles) ─────────────────
  totalBuys:        number;     // alias for ordersPlaced
  totalInvestedUsd: number;     // alias for totalInvestment
  totalCoinAmount:  number;     // alias for totalShares
  weightedAvgEntry: number;     // alias for averagePrice
  lastBuyAt:        string | null;
  nextBuyAt:        string | null;
  lastUpdatedAt:    string;
}

// ─────────────────────────────────────────────────────────────────────────────
// REBALANCING STATE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One asset's live state in the rebalancing portfolio.
 * Spec: currentValues[asset], currentPercent, targetPercent, deviation
 */
export interface RebalancingHolding {
  coinId:       string;
  coinSymbol:   string;
  coinColor:    string;
  /** Target allocation %. Spec: targetPercent = targetPercentages[i] */
  targetPct:    number;
  /** Current allocation % of total portfolio. Spec: currentPercent */
  currentPct:   number;
  /** Current USD value of this holding. Spec: currentValues[asset] */
  currentValue: number;
  /** Coins held. Used to recalculate value when price updates. */
  coinAmount:   number;
  /** currentPct - targetPct. Spec: deviation */
  driftPct:     number;
}

/**
 * A single trade generated during a rebalance cycle.
 * Spec: trades.push({ action: 'sell'|'buy', asset, amount: sellAmount|buyAmount })
 */
export interface RebalancingTrade {
  coinId:     string;
  coinSymbol: string;
  action:     'buy' | 'sell';
  /** USD amount to trade. Spec: sellAmount | buyAmount */
  amountUsd:  number;
  /** Executed price (simulated) */
  price:      number;
  /** Net P&L (for sells) */
  pnl:        number | null;
  executedAt: string;
}

/**
 * A completed rebalance cycle — logged to history.
 */
export interface RebalanceCycle {
  id:            string;
  executedAt:    string;
  totalValue:    number;
  tradesCount:   number;
  trades:        RebalancingTrade[];
  totalFeesUsd:  number;
  /** Allocations snapshot after this rebalance */
  snapshotAfter: Array<{ coinSymbol: string; pct: number }>;
}

/**
 * Rebalancing Bot runtime state.
 *
 * Spec variable mapping:
 *   currentValues      → holdings[i].currentValue
 *   totalValue         → sum(holdings[i].currentValue)
 *   currentPercent[i]  → holdings[i].currentPct
 *   deviation[i]       → holdings[i].driftPct
 */
export interface RebalancingState {
  botId: string;

  /**
   * Current live holdings with simulated coin amounts.
   * Initialised from totalPortfolioUsd × targetPct at bot start.
   */
  holdings: RebalancingHolding[];

  /** Timestamp of the last completed rebalance. */
  lastRebalanceAt: string | null;

  /**
   * When the next rebalance check is due (ISO-8601).
   * Spec: scheduleNextRebalance(rebalanceInterval)
   */
  nextRebalanceAt: string | null;

  /** Total number of completed rebalance cycles. */
  totalRebalances: number;

  /** Recent rebalance cycle history (max 20). */
  rebalanceHistory: RebalanceCycle[];

  /** Trades executed in the most recent rebalance cycle. */
  lastTrades: RebalancingTrade[];

  lastUpdatedAt: string;

  // ── Legacy compat ─────────────────────────────────────────────────────────
  nextCheckAt: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// BOT PERFORMANCE SNAPSHOT
// ─────────────────────────────────────────────────────────────────────────────

/** Lightweight performance snapshot shown on dashboard cards. */
export type BotPerformanceSnapshot = Pick<UserBot,
  | 'id' | 'name' | 'templateType' | 'status'
  | 'totalTrades' | 'totalProfit' | 'totalProfitPct'
  | 'winRate' | 'maxDrawdown' | 'totalFeesPaid'
  | 'lastRunAt' | 'nextRunAt' | 'startedAt'
>;

// ─────────────────────────────────────────────────────────────────────────────
// FILTERS & SORTING
// ─────────────────────────────────────────────────────────────────────────────

export type BotSortKey =
  | 'newest'
  | 'oldest'
  | 'most_profit'
  | 'best_win_rate'
  | 'most_trades'
  | 'lowest_drawdown'
  | 'name_asc';

export interface BotFilters {
  search: string;
  types: BotType[];
  statuses: BotStatus[];
  sortBy: BotSortKey;
}

export const DEFAULT_BOT_FILTERS: BotFilters = {
  search:   '',
  types:    [],
  statuses: [],
  sortBy:   'newest',
};

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Fee rate applied to all simulated bot trades (0.1%). */
export const BOT_FEE_RATE = 0.001;

/** Halt a bot after this many consecutive errors. */
export const BOT_MAX_CONSECUTIVE_ERRORS = 5;

/** Maximum number of equity curve data points stored per bot. */
export const BOT_MAX_EQUITY_POINTS = 500;

/** Maximum number of executions stored per bot before rolling (newest kept). */
export const BOT_MAX_EXECUTIONS_PER_BOT = 200;

/** Total maximum executions across all bots (global ring buffer). */
export const BOT_MAX_TOTAL_EXECUTIONS = 5_000;

/** Maximum number of bots a single user may create. */
export const BOT_MAX_PER_USER = 20;

/** Maximum number of grid levels. */
export const GRID_MAX_LEVELS = 100;

/** Maximum number of martingale safety orders. */
export const MARTINGALE_MAX_SAFETY_ORDERS = 15;

/** All valid interval strings users may choose for bot schedules. */
export const BOT_INTERVAL_OPTIONS: Array<{ label: string; value: string; ms: number }> = [
  { label: '1 minute',   value: '1m',  ms: 60_000 },
  { label: '5 minutes',  value: '5m',  ms: 300_000 },
  { label: '15 minutes', value: '15m', ms: 900_000 },
  { label: '30 minutes', value: '30m', ms: 1_800_000 },
  { label: '1 hour',     value: '1h',  ms: 3_600_000 },
  { label: '4 hours',    value: '4h',  ms: 14_400_000 },
  { label: '12 hours',   value: '12h', ms: 43_200_000 },
  { label: '1 day',      value: '1d',  ms: 86_400_000 },
  { label: '7 days',     value: '7d',  ms: 604_800_000 },
];

// ─────────────────────────────────────────────────────────────────────────────
// RESULT TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateBotResult {
  ok: boolean;
  bot?: UserBot;
  errors?: string[];
}

export interface BotActionResult {
  ok: boolean;
  error?: string;
}

export interface BotExecutionResult {
  ok: boolean;
  execution?: BotExecution;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Global aggregate statistics for the admin bot dashboard. */
export interface BotGlobalStats {
  totalBots:       number;
  activeBots:      number;
  pausedBots:      number;
  stoppedBots:     number;
  errorBots:       number;
  totalExecutions: number;
  totalVolume:     number;        // USD traded across all bots
  totalFees:       number;        // Total fees collected
  totalProfit:     number;        // Sum of all bot profits
  byType: Record<BotType, {
    count:      number;
    active:     number;
    executions: number;
    profit:     number;
  }>;
  topPerformingBots: Array<{
    botId:  string;
    name:   string;
    userId: string;
    profit: number;
    trades: number;
  }>;
}

/** Admin audit entry for bot-related admin actions. */
export interface BotAdminAuditEntry {
  id:          string;
  timestamp:   string;
  adminId:     string;
  adminName:   string;
  action:      'activate_template' | 'deactivate_template' | 'force_stop_bot' | 'update_template';
  targetId:    string;
  targetLabel: string;
  details:     string;
}
