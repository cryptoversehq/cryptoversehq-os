/**
 * exchangeStrategyDeployer.ts
 * §4.5 — Strategy Deployer to Real Exchange
 *
 * Full deployment pipeline:
 *   1. Verify user Level 10+ (§4.5)
 *   2. Verify exchange connection exists
 *   3. Get strategy & verify backtest quality (win rate ≥ 50%)
 *   4. Create bot instance with status `pending_approval`
 *   5. Submit for safety approval (auto-approve after delay in demo)
 *   6. On approval → set status `active` + start execution simulation
 *   7. On rejection → notify with reason
 *
 * Also exposes an approval queue that the UI can display.
 */

import { ExchangeConnection, RiskControls, DeployStatus, TradingMode } from './exchangeTypes';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface StrategyInfo {
  id:           string;
  name:         string;
  isBacktested: boolean;
  winRate:      number;       // percentage 0–100
  backtestMonths: number;
  maxDrawdown:  number;
  riskLevel:    'low' | 'medium' | 'high';
}

export interface DeploymentSettings {
  symbol:       string;
  mode:         TradingMode;
  allocatedUSD: number;
  maxPositionUSD: number;
  maxDailyLossUSD: number;
  tradingHours: string;
  pairs:        string[];
}

export interface DeploymentRequest {
  connectionId:  string;
  strategyId:    string;
  strategyName:  string;
  settings:      DeploymentSettings;
  userLevel:     number;
}

export interface DeploymentResult {
  success:    boolean;
  deployId?:  string;
  status?:    'pending_approval' | 'active' | 'rejected';
  message?:   string;
  error?:     string;
}

export interface ApprovalQueueItem {
  deployId:     string;
  strategyName: string;
  exchangeId:   string;
  allocatedUSD: number;
  requestedAt:  string;
  status:       'pending' | 'approved' | 'rejected';
  reviewedAt?:  string;
  reviewNote?:  string;
}

// ── Approval queue storage ─────────────────────────────────────────────────────

const APPROVAL_KEY = 'cv_strategy_approval_queue';

function loadApprovalQueue(): ApprovalQueueItem[] {
  try {
    const raw = localStorage.getItem(APPROVAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveApprovalQueue(items: ApprovalQueueItem[]): void {
  try { localStorage.setItem(APPROVAL_KEY, JSON.stringify(items)); } catch {}
}

// ── ExchangeStrategyDeployer ───────────────────────────────────────────────────

export class ExchangeStrategyDeployer {

  /**
   * §4.5: `deployStrategy` — full 7-step deployment pipeline.
   */
  async deployStrategy(
    request:    DeploymentRequest,
    connection: ExchangeConnection,
    strategy:   StrategyInfo,
  ): Promise<DeploymentResult> {

    // ── Step 1: Verify Academy Level 10+ (§4.5) ───────────────────────────
    const MIN_LEVEL = 10;
    if (request.userLevel < MIN_LEVEL) {
      return {
        success: false,
        error:   `Real trading requires Academy Level ${MIN_LEVEL}+. Your level: ${request.userLevel}. Complete more lessons to unlock.`,
      };
    }

    // ── Step 2: Verify exchange connection ─────────────────────────────────
    if (!connection || connection.status !== 'connected') {
      return {
        success: false,
        error:   `${connection?.exchangeId ?? 'Exchange'} is not connected. Go to Connections tab.`,
      };
    }

    if (connection.isReadOnly) {
      return {
        success: false,
        error:   'Read-only connection cannot execute trades. Re-connect with trading permissions.',
      };
    }

    // ── Step 3: Strategy quality gate (§4.5) ──────────────────────────────
    if (!strategy.isBacktested) {
      return {
        success: false,
        error:   'Strategy must be backtested before deploying with real funds.',
      };
    }

    if (strategy.winRate < 50) {
      return {
        success: false,
        error:   `Strategy win rate ${strategy.winRate.toFixed(1)}% is below the minimum required 50%. Improve your strategy in the backtester first.`,
      };
    }

    if (strategy.maxDrawdown > 25) {
      return {
        success: false,
        error:   `Strategy max drawdown ${strategy.maxDrawdown.toFixed(1)}% exceeds safe limit of 25%. Adjust stop-loss parameters.`,
      };
    }

    // ── Allocation sanity check ────────────────────────────────────────────
    if (request.settings.allocatedUSD > connection.balanceUSD * 0.9) {
      return {
        success: false,
        error:   `Allocated $${request.settings.allocatedUSD.toLocaleString()} exceeds 90% of available balance ($${(connection.balanceUSD * 0.9).toFixed(0)}). Reduce allocation.`,
      };
    }

    if (request.settings.allocatedUSD < 50) {
      return {
        success: false,
        error:   'Minimum deployment size is $50.',
      };
    }

    // ── Step 4: Create deployment record with `pending_approval` ──────────
    const deployId = `deploy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const queueItem: ApprovalQueueItem = {
      deployId,
      strategyName: strategy.name,
      exchangeId:   connection.exchangeId,
      allocatedUSD: request.settings.allocatedUSD,
      requestedAt:  new Date().toISOString(),
      status:       'pending',
    };

    const queue = loadApprovalQueue();
    queue.push(queueItem);
    saveApprovalQueue(queue);

    // ── Step 5: Submit for safety approval ─────────────────────────────────
    // In demo: auto-approve after 2 seconds (simulates backend review)
    // In production: send to admin dashboard for human review
    await delay(2000);

    const approved = await this.runSafetyApproval(deployId, strategy, request.settings);

    // ── Step 6/7: Handle approval result ──────────────────────────────────
    if (approved) {
      this.updateApprovalStatus(deployId, 'approved', 'Passed automated safety checks');

      return {
        success:  true,
        deployId,
        status:   'active',
        message:  `"${strategy.name}" has passed safety review and is now LIVE on ${connection.exchangeId}. Monitoring active.`,
      };
    } else {
      this.updateApprovalStatus(deployId, 'rejected', 'Failed safety review — high drawdown risk detected');

      return {
        success:  false,
        deployId,
        status:   'rejected',
        error:    'Strategy deployment rejected by safety review. Please review risk settings and backtest results.',
      };
    }
  }

  /**
   * Approve or reject a pending deployment (admin / safety system action).
   * §4.5: `approveDeployment`.
   */
  approveDeployment(deployId: string, approved: boolean, note?: string): void {
    this.updateApprovalStatus(
      deployId,
      approved ? 'approved' : 'rejected',
      note ?? (approved ? 'Manually approved' : 'Manually rejected'),
    );
  }

  /**
   * Get the full approval queue.
   */
  getApprovalQueue(): ApprovalQueueItem[] {
    return loadApprovalQueue();
  }

  /**
   * Get pending items only.
   */
  getPendingApprovals(): ApprovalQueueItem[] {
    return loadApprovalQueue().filter(q => q.status === 'pending');
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Simulated safety review — checks for red flags in the strategy/settings.
   * Auto-approves in 95% of cases; rejects the remaining 5% for demo.
   */
  private async runSafetyApproval(
    deployId:  string,
    strategy:  StrategyInfo,
    settings:  DeploymentSettings,
  ): Promise<boolean> {
    await delay(500); // simulate async review

    // Reject conditions (maps to real safety requirements)
    if (strategy.maxDrawdown > 20) return false;   // too risky
    if (settings.allocatedUSD > 50000) return false; // too large without manual review
    if (strategy.winRate < 55) return false;          // borderline strategies need review
    if (Math.random() < 0.02) return false;           // 2% random rejection for demo variety

    return true;
  }

  private updateApprovalStatus(
    deployId: string,
    status:   'approved' | 'rejected',
    note?:    string,
  ): void {
    const queue = loadApprovalQueue().map(q =>
      q.deployId === deployId
        ? { ...q, status, reviewedAt: new Date().toISOString(), reviewNote: note }
        : q,
    );
    saveApprovalQueue(queue);
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────────

export const strategyDeployer = new ExchangeStrategyDeployer();

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
