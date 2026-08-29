/**
 * alertTriggerSystem.ts — §4.4 Alert Trigger System
 *
 * Evaluates active alerts of all three types against simulated blockchain data:
 *
 *   'whale_transaction' — large value move on a chain (+ significance threshold)
 *   'wallet_activity'   — a specific tracked wallet made any move
 *   'exchange_flow'     — net inflow/outflow signal on an exchange crosses threshold
 *
 * Designed to be called by onChainStore's runTick() on each simulation interval.
 * Returns an array of TriggerResult objects — the store persists them as OnChainEvents.
 *
 * Design: Pure functions + stateless class. No async calls.
 */

import type { OnChainAlert, AlertType } from './onChainTypes';
import type { SimulatedTx } from './onChainSimulator';
import { calculateSignificance } from './whaleDetectionEngine';
import { flowAnalyzer } from './exchangeFlowAnalyzer';

// ── Result shape ──────────────────────────────────────────────────────────────

export interface TriggerResult {
  alertId:            string;
  userId:             string;
  matchedTx:          SimulatedTx | null;   // null for exchange_flow alerts
  significance:       number;
  significanceReason: string;
  triggerType:        AlertType;
}

// ── Exchange condition checker (§4.4 checkExchangeCondition) ─────────────────

const EXCHANGE_LABELS_LC = new Set([
  'binance cold wallet', 'binance hot wallet', 'binance btc hot',
  'coinbase custody', 'kraken exchange',
]);

function txIsExchangeDeposit(tx: SimulatedTx, targetExchange?: string): boolean {
  const toLabel = (tx.toLabel ?? '').toLowerCase();
  if (!targetExchange) return EXCHANGE_LABELS_LC.has(toLabel) || toLabel.includes('exchange');
  return toLabel.includes(targetExchange.toLowerCase());
}

// ── Wallet activity checker (§4.4 checkWalletCondition) ──────────────────────

function txInvolvesAddress(tx: SimulatedTx, address: string): boolean {
  const addr = address.trim().toLowerCase();
  if (!addr) return false;
  return (
    tx.fromAddress.toLowerCase() === addr ||
    tx.toAddress.toLowerCase()   === addr
  );
}

// ── Alert Trigger System class (§4.4 spec interface) ─────────────────────────

export class AlertTriggerSystem {

  /**
   * Main evaluation loop — called once per simulation tick.
   * Takes the current batch of simulated txs and evaluates every active alert.
   */
  checkAndTriggerAlerts(
    activeAlerts: OnChainAlert[],
    simulatedTxs: SimulatedTx[],
  ): TriggerResult[] {
    const results: TriggerResult[] = [];

    for (const alert of activeAlerts) {
      if (!alert.isActive) continue;

      const minSig = alert.minSignificance ?? 0.7;

      switch (alert.alertType) {
        case 'whale_transaction': {
          const triggered = this.checkWhaleCondition(alert, simulatedTxs, minSig);
          if (triggered) results.push(triggered);
          break;
        }
        case 'wallet_activity': {
          const triggered = this.checkWalletCondition(alert, simulatedTxs);
          if (triggered) results.push(triggered);
          break;
        }
        case 'exchange_flow': {
          const triggered = this.checkExchangeCondition(alert);
          if (triggered) results.push(triggered);
          break;
        }
        default: {
          // Backwards compat: alerts without alertType treated as whale_transaction
          const triggered = this.checkWhaleCondition(alert, simulatedTxs, minSig);
          if (triggered) results.push(triggered);
        }
      }
    }

    return results;
  }

  // ── §4.4 checkWhaleCondition ──────────────────────────────────────────────

  private checkWhaleCondition(
    alert:        OnChainAlert,
    txs:          SimulatedTx[],
    minSig:       number,
  ): TriggerResult | null {
    for (const tx of txs) {
      // Chain must match
      if (tx.chain !== alert.chain) continue;

      // Value condition
      if (alert.condition === 'above' && tx.valueUsd < alert.minValue) continue;
      if (alert.condition === 'below' && tx.valueUsd > alert.minValue) continue;

      // Optional target address filter (§4.4 spec: alert.targetAddress)
      if (alert.address.trim()) {
        if (!txInvolvesAddress(tx, alert.address)) continue;
      }

      // Significance gate
      const breakdown = calculateSignificance(tx);
      if (breakdown.total < minSig) continue;

      return {
        alertId:            alert.id,
        userId:             alert.userId,
        matchedTx:          tx,
        significance:       breakdown.total,
        significanceReason: breakdown.reason,
        triggerType:        'whale_transaction',
      };
    }
    return null;
  }

  // ── §4.4 checkWalletCondition ─────────────────────────────────────────────

  private checkWalletCondition(
    alert: OnChainAlert,
    txs:   SimulatedTx[],
  ): TriggerResult | null {
    for (const tx of txs) {
      if (tx.chain !== alert.chain) continue;

      // Must involve the tracked wallet
      if (!alert.address.trim()) continue;
      if (!txInvolvesAddress(tx, alert.address)) continue;

      // Value gate still applies
      if (alert.condition === 'above' && tx.valueUsd < alert.minValue) continue;
      if (alert.condition === 'below' && tx.valueUsd > alert.minValue) continue;

      const breakdown = calculateSignificance(tx);
      return {
        alertId:            alert.id,
        userId:             alert.userId,
        matchedTx:          tx,
        significance:       breakdown.total,
        significanceReason: `wallet activity: ${tx.valueUsd >= 1e6 ? `$${(tx.valueUsd / 1e6).toFixed(1)}M` : `$${Math.round(tx.valueUsd / 1000)}K`} moved`,
        triggerType:        'wallet_activity',
      };
    }
    return null;
  }

  // ── §4.4 checkExchangeCondition ───────────────────────────────────────────

  private checkExchangeCondition(alert: OnChainAlert): TriggerResult | null {
    // For exchange_flow alerts we evaluate the current flow signal
    const report = flowAnalyzer.analyzeExchangeFlow(alert.chain, 'BTC', 1);

    // Alert fires when any exchange has net flow exceeding minValue
    for (const entry of report.entries) {
      if (Math.abs(entry.netFlow) >= alert.minValue) {
        const direction = entry.signal === 'bullish' ? 'inflow' : 'outflow';
        return {
          alertId:            alert.id,
          userId:             alert.userId,
          matchedTx:          null,
          significance:       0.6,
          significanceReason: `${entry.exchange} net ${direction}: $${(Math.abs(entry.netFlow) / 1e6).toFixed(1)}M`,
          triggerType:        'exchange_flow',
        };
      }
    }
    return null;
  }
}

/** Shared singleton */
export const triggerSystem = new AlertTriggerSystem();
