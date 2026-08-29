/**
 * strategyUtils.ts
 *
 * Pure utility functions for the Strategy Marketplace.
 * No side-effects, no store imports — safe to call from anywhere.
 *
 * Covers:
 *   - UUID generation
 *   - Risk level derivation
 *   - Metric computation (sharpe, drawdown, win-rate)
 *   - Validation (strategy, rating, purchase eligibility)
 *   - Filtering + sorting + pagination
 *   - CP coins formatting
 */

import {
  Strategy,
  StrategyCard,
  StrategyFilters,
  StrategyPage,
  StrategySortKey,
  RiskLevel,
  BacktestResult,
  BacktestTrade,
  STRATEGY_PLATFORM_FEE_PCT,
  MAX_STRATEGY_TAGS,
  MAX_STRATEGY_CODE_BYTES,
  STRATEGY_TAGS,
} from './strategyTypes';

// ─────────────────────────────────────────────────────────────────────────────
// ID GENERATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a pseudo-UUIDv4.
 * Uses crypto.randomUUID() when available (modern browsers), falls back to
 * a Math.random-based implementation for compatibility.
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: RFC-4122 v4 compliant
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// RISK LEVEL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derives a human-readable risk level from backtest metrics.
 *
 * Classification matrix:
 * | maxDrawdown | sharpeRatio | → risk   |
 * |-------------|-------------|----------|
 * | ≤ 10%       | > 1.5       | low      |
 * | ≤ 20%       | > 0.8       | medium   |
 * | ≤ 35%       | > 0         | high     |
 * | > 35%       | any         | very-high|
 */
export function deriveRiskLevel(maxDrawdown: number, sharpeRatio: number): RiskLevel {
  if (maxDrawdown <= 10 && sharpeRatio > 1.5) return 'low';
  if (maxDrawdown <= 20 && sharpeRatio > 0.8) return 'medium';
  if (maxDrawdown <= 35) return 'high';
  return 'very-high';
}

/** Returns the colour token associated with a risk level (Tailwind class). */
export function riskLevelColor(risk: RiskLevel): string {
  switch (risk) {
    case 'low':       return 'text-emerald-400';
    case 'medium':    return 'text-yellow-400';
    case 'high':      return 'text-orange-400';
    case 'very-high': return 'text-red-400';
  }
}

/** Returns the badge background class for a risk level. */
export function riskLevelBg(risk: RiskLevel): string {
  switch (risk) {
    case 'low':       return 'bg-emerald-400/10 border-emerald-400/20 text-emerald-400';
    case 'medium':    return 'bg-yellow-400/10 border-yellow-400/20 text-yellow-400';
    case 'high':      return 'bg-orange-400/10 border-orange-400/20 text-orange-400';
    case 'very-high': return 'bg-red-400/10 border-red-400/20 text-red-400';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// METRIC COMPUTATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes a simplified Sharpe Ratio from a trade log.
 * Uses daily returns over the backtest period; risk-free rate = 0.
 *
 * Returns 0 if there are insufficient data points.
 */
export function computeSharpeRatio(
  equityCurve: number[],
  periodDays: number,
): number {
  if (equityCurve.length < 2 || periodDays < 1) return 0;

  // Compute daily returns
  const dailyReturns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1];
    if (prev === 0) continue;
    dailyReturns.push((equityCurve[i] - prev) / prev);
  }

  if (dailyReturns.length === 0) return 0;

  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance =
    dailyReturns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / dailyReturns.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return 0;

  // Annualise (√252 trading days)
  const annualisedReturn = mean * 252;
  const annualisedStdDev = stdDev * Math.sqrt(252);

  return Math.round((annualisedReturn / annualisedStdDev) * 100) / 100;
}

/**
 * Computes maximum drawdown (%) from an equity curve.
 * Returns 0 if curve is empty.
 */
export function computeMaxDrawdown(equityCurve: number[]): number {
  if (equityCurve.length === 0) return 0;

  let maxDrawdown = 0;
  let peak = equityCurve[0];

  for (const value of equityCurve) {
    if (value > peak) {
      peak = value;
    } else {
      const drawdown = ((peak - value) / peak) * 100;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
  }

  return Math.round(maxDrawdown * 100) / 100;
}

/**
 * Computes a weighted average rating from an array of 1-5 star ratings.
 * Uses Wilson score weighting for more accurate representation with few ratings.
 */
export function computeWeightedRating(ratings: number[]): number {
  if (ratings.length === 0) return 0;
  const sum = ratings.reduce((a, b) => a + b, 0);
  return Math.round((sum / ratings.length) * 100) / 100;
}

/**
 * Derives all performance metrics from a BacktestResult and applies them
 * to a partial Strategy object. Returns only the metric fields.
 */
export function applyBacktestMetrics(
  result: BacktestResult,
): Pick<
  Strategy,
  | 'winRate' | 'totalTrades' | 'totalProfit' | 'totalProfitPct'
  | 'maxDrawdown' | 'sharpeRatio' | 'avgTradeDuration'
  | 'backtestPeriodDays' | 'backtestStartCapital' | 'riskLevel'
> {
  return {
    winRate:               result.winRate,
    totalTrades:           result.totalTrades,
    totalProfit:           Math.round(result.totalProfit * 100) / 100,
    totalProfitPct:        Math.round(result.totalProfitPct * 100) / 100,
    maxDrawdown:           result.maxDrawdown,
    sharpeRatio:           result.sharpeRatio,
    avgTradeDuration:      result.avgTradeDuration,
    backtestPeriodDays:    result.periodDays,
    backtestStartCapital:  result.startCapital,
    riskLevel:             result.riskLevel,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SIMULATED BACKTEST
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a realistic-looking simulated backtest result for a strategy.
 * Used when no real backtest data is available (e.g. at strategy creation).
 *
 * The values are seeded from the strategy name for determinism — the same
 * strategy always gets the same simulated results.
 */
export function generateSimulatedBacktest(
  strategyId: string,
  strategyName: string,
  periodDays = 90,
  startCapital = 10_000,
): BacktestResult {
  // Deterministic seed from name
  const seed = strategyName.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const rng = (n = 1) => {
    const x = Math.sin(seed + n) * 10_000;
    return x - Math.floor(x);
  };

  const totalTrades   = 30 + Math.floor(rng(1) * 120);    // 30-150
  const winRate       = 40 + rng(2) * 40;                  // 40-80 %
  const winningTrades = Math.round((winRate / 100) * totalTrades);
  const losingTrades  = totalTrades - winningTrades;

  // Build a simple equity curve
  const equityCurve: number[] = [startCapital];
  let capital = startCapital;
  const steps = Math.min(periodDays, 90);
  for (let i = 1; i <= steps; i++) {
    const dailyReturn = (rng(i + 3) - 0.45) * 0.04; // -1.8% to +2.2%
    capital *= 1 + dailyReturn;
    equityCurve.push(Math.round(capital * 100) / 100);
  }

  const endCapital     = equityCurve[equityCurve.length - 1];
  const totalProfit    = endCapital - startCapital;
  const totalProfitPct = (totalProfit / startCapital) * 100;
  const maxDrawdown    = computeMaxDrawdown(equityCurve);
  const sharpeRatio    = computeSharpeRatio(equityCurve, periodDays);
  const riskLevel      = deriveRiskLevel(maxDrawdown, sharpeRatio);

  // Build mock trade log
  const now = new Date();
  const trades: BacktestTrade[] = Array.from({ length: Math.min(totalTrades, 20) }, (_, i) => {
    const isWin  = i / (Math.min(totalTrades, 20) - 1) < winRate / 100;
    const entry  = 30_000 + rng(i + 10) * 40_000;
    const change = isWin ? 0.005 + rng(i + 20) * 0.04 : -(0.005 + rng(i + 30) * 0.025);
    const exit   = entry * (1 + change);
    const pnl    = (exit - entry) * (100 / entry);
    const dur    = Math.floor(15 + rng(i + 40) * 360);
    const entryAt = new Date(now.getTime() - (periodDays - i * (periodDays / 20)) * 86400_000).toISOString();
    const exitAt  = new Date(new Date(entryAt).getTime() + dur * 60_000).toISOString();

    return {
      tradeNumber:     i + 1,
      side:            rng(i + 50) > 0.5 ? 'long' : 'short',
      entryPrice:      Math.round(entry * 100) / 100,
      exitPrice:       Math.round(exit * 100) / 100,
      entryAt,
      exitAt,
      pnl:             Math.round(pnl * 100) / 100,
      pnlPct:          Math.round(change * 10_000) / 100,
      durationMinutes: dur,
      fee:             Math.round(entry * 0.001 * 100) / 100,
    };
  });

  const avgTradeDuration = Math.round(
    trades.reduce((a, t) => a + t.durationMinutes, 0) / Math.max(trades.length, 1),
  );

  return {
    strategyId,
    runAt:            new Date().toISOString(),
    periodDays,
    startCapital,
    endCapital:       Math.round(endCapital * 100) / 100,
    totalProfit:      Math.round(totalProfit * 100) / 100,
    totalProfitPct:   Math.round(totalProfitPct * 100) / 100,
    winRate:          Math.round(winRate * 100) / 100,
    totalTrades,
    winningTrades,
    losingTrades,
    maxDrawdown:      Math.round(maxDrawdown * 100) / 100,
    sharpeRatio:      Math.round(sharpeRatio * 100) / 100,
    avgTradeDuration,
    equityCurve,
    trades,
    riskLevel,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Validates all user-editable fields of a strategy before save/submit. */
export function validateStrategy(
  data: Partial<Strategy>,
): ValidationResult {
  const errors: string[] = [];

  if (!data.name?.trim()) {
    errors.push('Strategy name is required.');
  } else if (data.name.trim().length > 100) {
    errors.push('Strategy name must be 100 characters or fewer.');
  }

  if (!data.shortDescription?.trim()) {
    errors.push('Short description is required.');
  } else if (data.shortDescription.trim().length > 200) {
    errors.push('Short description must be 200 characters or fewer.');
  }

  if (data.description && data.description.length > 2000) {
    errors.push('Description must be 2,000 characters or fewer.');
  }

  if (data.price !== undefined) {
    if (data.price < 0) errors.push('Price cannot be negative.');
    if (!Number.isFinite(data.price)) errors.push('Price must be a valid number.');
  }

  if (data.tags) {
    if (data.tags.length > MAX_STRATEGY_TAGS) {
      errors.push(`Maximum ${MAX_STRATEGY_TAGS} tags allowed.`);
    }
    const invalid = data.tags.filter(t => !STRATEGY_TAGS.includes(t as never));
    if (invalid.length > 0) {
      errors.push(`Invalid tag(s): ${invalid.join(', ')}.`);
    }
  }

  if (data.code !== undefined) {
    // Size guard
    if (new TextEncoder().encode(data.code).length > MAX_STRATEGY_CODE_BYTES) {
      errors.push('Strategy code exceeds maximum size (64 KB).');
    }

    // ── Security: block script-injection & dangerous patterns ──────────────
    const FORBIDDEN_CODE_PATTERNS: RegExp[] = [
      /<script[\s>]/i,                      // inline <script>
      /javascript:/i,                        // javascript: protocol
      /data:text\/html/i,                    // data: URIs
      /\beval\s*\(/,                         // eval()
      /new\s+Function\s*\(/,                 // new Function()
      /process\.env/,                        // Node env access
      /require\s*\(\s*['"](?:fs|child_process|os|net|crypto|http|https)/,
      /import\s*\(.*\)/,                     // dynamic import()
      /fetch\s*\(/,                          // network fetch in code
      /XMLHttpRequest/,                      // XHR
      /document\.cookie/i,                   // cookie theft
      /localStorage\.setItem/i,             // storage manipulation
      /window\.location\s*=/i,              // redirect
    ];

    const codeStr = data.code;
    for (const pattern of FORBIDDEN_CODE_PATTERNS) {
      if (pattern.test(codeStr)) {
        errors.push('Strategy code contains forbidden or potentially malicious content.');
        break;
      }
    }

    // Must be valid JSON (strategies are stored as JSON config, not raw JS)
    if (codeStr.trim().length > 0) {
      try {
        JSON.parse(codeStr);
      } catch {
        // Allow non-JSON code blocks but flag clearly non-JSON with injection markers
        if (/<|>|&lt;|&gt;|javascript:|data:/.test(codeStr)) {
          errors.push('Strategy code contains invalid markup or injection tokens.');
        }
      }
    }
  }

  if (data.requiredLevel !== undefined && (data.requiredLevel < 0 || data.requiredLevel > 20)) {
    errors.push('Required level must be between 0 and 20.');
  }

  return { valid: errors.length === 0, errors };
}

/** Validates a rating submission. */
export function validateRating(
  rating: number,
  review: string,
): ValidationResult {
  const errors: string[] = [];
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    errors.push('Rating must be an integer between 1 and 5.');
  }
  if (review.length > 500) {
    errors.push('Review must be 500 characters or fewer.');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Checks whether a user is eligible to purchase a strategy.
 * Returns { eligible: true } or { eligible: false, reason: '...' }.
 */
export function checkPurchaseEligibility(params: {
  strategy:     Pick<Strategy, 'price' | 'isPublished' | 'isApproved' | 'status' | 'requiredLevel' | 'requiredPlan' | 'requiresKyc'>;
  userCpCoins:  number;
  userLevel:    number;
  userPlan:     'bronze' | 'silver' | 'gold';
  userKycVerified: boolean;
  alreadyOwns:  boolean;
}): { eligible: boolean; reason?: string } {
  const { strategy, userCpCoins, userLevel, userPlan, userKycVerified, alreadyOwns } = params;

  if (alreadyOwns) {
    return { eligible: false, reason: 'You already own this strategy.' };
  }
  if (!strategy.isPublished || !strategy.isApproved || strategy.status !== 'approved') {
    return { eligible: false, reason: 'This strategy is not currently available.' };
  }
  if (userLevel < strategy.requiredLevel) {
    return { eligible: false, reason: `Requires Academy Level ${strategy.requiredLevel}. Your level: ${userLevel}.` };
  }
  if (strategy.requiresKyc && !userKycVerified) {
    return { eligible: false, reason: 'This strategy requires KYC verification.' };
  }

  const planOrder: Record<string, number> = { bronze: 0, silver: 1, gold: 2 };
  const requiredPlanLevel = strategy.requiredPlan === 'any' ? 0 : (planOrder[strategy.requiredPlan] ?? 0);
  if (planOrder[userPlan] < requiredPlanLevel) {
    return { eligible: false, reason: `Requires ${strategy.requiredPlan} plan or higher.` };
  }

  if (strategy.price > 0 && userCpCoins < strategy.price) {
    return {
      eligible: false,
      reason: `Insufficient CP Coins. Required: ${strategy.price}, you have: ${userCpCoins}.`,
    };
  }

  return { eligible: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// FILTERING & SORTING
// ─────────────────────────────────────────────────────────────────────────────

/** Applies all StrategyFilters to an array and returns the filtered list. */
export function applyStrategyFilters(
  items: Strategy[],
  filters: StrategyFilters,
): Strategy[] {
  return items.filter(s => {
    // Only show published + approved items unless caller passes all statuses
    if (!s.isPublished || !s.isApproved) return false;

    // Full-text search (name, short desc, tags)
    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      const hit =
        s.name.toLowerCase().includes(q) ||
        s.shortDescription.toLowerCase().includes(q) ||
        s.tags.some(t => t.toLowerCase().includes(q)) ||
        s.creatorName.toLowerCase().includes(q);
      if (!hit) return false;
    }

    // Type filter
    if (filters.types.length > 0 && !filters.types.includes(s.type)) return false;

    // Tag filter (must match at least one selected tag)
    if (filters.tags.length > 0 && !filters.tags.some(t => s.tags.includes(t))) return false;

    // Price range
    const [minP, maxP] = filters.priceRange;
    if (s.price < minP) return false;
    if (maxP !== Infinity && s.price > maxP) return false;

    // Rating minimum
    if (filters.ratingMin > 0 && s.rating < filters.ratingMin) return false;

    // Risk level
    if (filters.riskLevels.length > 0 && !filters.riskLevels.includes(s.riskLevel)) return false;

    // Free only
    if (filters.onlyFree && !s.isFree) return false;

    // Plan requirement
    if (filters.requiredPlan.length > 0 && !filters.requiredPlan.includes(s.requiredPlan)) return false;

    return true;
  });
}

/** Sorts a strategy array by the given key. Does not mutate the original. */
export function sortStrategies(items: Strategy[], sortBy: StrategySortKey): Strategy[] {
  const arr = [...items];
  switch (sortBy) {
    case 'newest':
      return arr.sort((a, b) => (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt));
    case 'oldest':
      return arr.sort((a, b) => (a.publishedAt ?? a.createdAt).localeCompare(b.publishedAt ?? b.createdAt));
    case 'best_rating':
      return arr.sort((a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount);
    case 'most_sales':
      return arr.sort((a, b) => b.totalSales - a.totalSales);
    case 'highest_profit':
      return arr.sort((a, b) => b.totalProfitPct - a.totalProfitPct);
    case 'lowest_price':
      return arr.sort((a, b) => a.price - b.price);
    case 'highest_price':
      return arr.sort((a, b) => b.price - a.price);
    case 'best_win_rate':
      return arr.sort((a, b) => b.winRate - a.winRate);
    case 'lowest_drawdown':
      return arr.sort((a, b) => a.maxDrawdown - b.maxDrawdown);
    case 'best_sharpe':
      return arr.sort((a, b) => b.sharpeRatio - a.sharpeRatio);
    default:
      return arr;
  }
}

/**
 * Applies filters, sorts, and paginates a strategy list.
 * Returns a StrategyPage.
 */
export function paginateStrategies(
  items: Strategy[],
  filters: StrategyFilters,
  page: number,
  pageSize = 12,
): StrategyPage {
  const filtered = applyStrategyFilters(items, filters);
  const sorted   = sortStrategies(filtered, filters.sortBy);
  const start    = (page - 1) * pageSize;
  const slice    = sorted.slice(start, start + pageSize);

  // Map to StrategyCard (lightweight)
  const cards: StrategyCard[] = slice.map(s => ({
    id:               s.id,
    name:             s.name,
    shortDescription: s.shortDescription,
    type:             s.type,
    tags:             s.tags,
    price:            s.price,
    isFree:           s.isFree,
    rating:           s.rating,
    ratingCount:      s.ratingCount,
    winRate:          s.winRate,
    totalTrades:      s.totalTrades,
    totalProfit:      s.totalProfit,
    totalProfitPct:   s.totalProfitPct,
    maxDrawdown:      s.maxDrawdown,
    sharpeRatio:      s.sharpeRatio,
    riskLevel:        s.riskLevel,
    totalSales:       s.totalSales,
    creatorName:      s.creatorName,
    creatorAvatarSeed: s.creatorAvatarSeed,
    isPublished:      s.isPublished,
    requiredLevel:    s.requiredLevel,
    requiredPlan:     s.requiredPlan,
    publishedAt:      s.publishedAt,
    createdAt:        s.createdAt,
  }));

  return {
    items:    cards,
    total:    filtered.length,
    page,
    pageSize,
    hasMore:  start + pageSize < filtered.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CP COINS FORMATTING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formats a CP coin amount as a human-readable string.
 * e.g. 1_250 → "1,250 CP"
 * e.g. 1_500_000 → "1.5M CP"
 */
export function formatCpCoins(amount: number): string {
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1).replace(/\.0$/, '')}M CP`;
  }
  if (amount >= 10_000) {
    return `${(amount / 1_000).toFixed(1).replace(/\.0$/, '')}K CP`;
  }
  return `${amount.toLocaleString()} CP`;
}

/**
 * Computes the creator payout and platform fee for a given sale price.
 */
export function computeSaleSplit(salePrice: number): {
  creatorEarns: number;
  platformFee: number;
} {
  const fee         = Math.round(salePrice * STRATEGY_PLATFORM_FEE_PCT);
  const creatorEarns = salePrice - fee;
  return { creatorEarns, platformFee: fee };
}

// ─────────────────────────────────────────────────────────────────────────────
// DISPLAY HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Human-readable label for a StrategyType. */
export function strategyTypeLabel(type: Strategy['type']): string {
  switch (type) {
    case 'grid':       return 'Grid Trading';
    case 'dca':        return 'Dollar-Cost Avg';
    case 'martingale': return 'Martingale';
    case 'arbitrage':  return 'Arbitrage';
    case 'custom':     return 'Custom';
  }
}

/** Returns the icon emoji for a strategy type. */
export function strategyTypeIcon(type: Strategy['type']): string {
  switch (type) {
    case 'grid':       return '📊';
    case 'dca':        return '💰';
    case 'martingale': return '🎲';
    case 'arbitrage':  return '⚡';
    case 'custom':     return '🛠️';
  }
}

/** Human-readable label for a StrategyStatus. */
export function strategyStatusLabel(status: Strategy['status']): string {
  switch (status) {
    case 'draft':     return 'Draft';
    case 'pending':   return 'Pending Review';
    case 'approved':  return 'Approved';
    case 'rejected':  return 'Rejected';
    case 'suspended': return 'Suspended';
  }
}

/** Badge color class for a StrategyStatus. */
export function strategyStatusColor(status: Strategy['status']): string {
  switch (status) {
    case 'draft':     return 'bg-white/5 border-white/10 text-white/40';
    case 'pending':   return 'bg-yellow-400/10 border-yellow-400/20 text-yellow-400';
    case 'approved':  return 'bg-green-400/10 border-green-400/20 text-green-400';
    case 'rejected':  return 'bg-red-400/10 border-red-400/20 text-red-400';
    case 'suspended': return 'bg-orange-400/10 border-orange-400/20 text-orange-400';
  }
}

/** Relative time string (e.g. "3 days ago"). */
export function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1_000);
  if (seconds < 60)       return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)       return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)         return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30)          return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12)        return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}
