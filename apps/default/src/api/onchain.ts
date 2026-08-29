/**
 * api/onchain.ts
 *
 * On-Chain Analysis Endpoints — Part 12 §11.5
 *
 * GET    /api/onchain/whales        - Get whale transactions
 * POST   /api/onchain/alerts        - Create alert
 * GET    /api/onchain/alerts        - List user's alerts
 * DELETE /api/onchain/alerts/:id    - Delete alert
 * GET    /api/onchain/events        - Get triggered events
 */

import { registerRoute, requireAuth, ApiErrors } from './client';
import type {
  GetWhaleTransactionsRequest,
  GetWhaleTransactionsResponse,
  WhaleTransactionItem,
  CreateOnChainAlertRequest,
  CreateOnChainAlertResponse,
  ListOnChainAlertsResponse,
  OnChainAlertItem,
  ListOnChainEventsResponse,
} from './types';
import { useOnChainStore } from '../lib/onChainStore';
import type { OnChainEvent, OnChainAlert } from '../lib/onChainTypes';

function toWhaleItem(e: OnChainEvent): WhaleTransactionItem {
  return {
    id:           e.id,
    chain:        e.chain,
    txHash:       e.txHash,
    fromAddress:  e.fromAddress,
    toAddress:    e.toAddress,
    valueUsd:     e.valueUsd,
    asset:        e.asset,
    timestamp:    e.detectedAt,
    whaleTier:    e.whaleTier,
  };
}

function toAlertItem(a: OnChainAlert): OnChainAlertItem {
  return {
    id:           a.id,
    chain:        a.chain,
    alertType:    a.alertType,
    minValueUsd:  a.minValueUsd,
    isEnabled:    a.isEnabled,
    triggerCount: a.triggerCount,
    createdAt:    a.createdAt,
  };
}

// ─── GET /api/onchain/whales ───────────────────────────────────────────────────

registerRoute<GetWhaleTransactionsRequest, GetWhaleTransactionsResponse>(
  'GET', '/api/onchain/whales',
  (query, _auth) => {
    const store  = useOnChainStore.getState();
    const events = store.getWhaleEvents({
      chain:    query.chain as any,
      minValue: query.minValue,
    }).slice(0, query.limit ?? 50);
    return { events: events.map(toWhaleItem) };
  },
);

// ─── POST /api/onchain/alerts ─────────────────────────────────────────────────

registerRoute<CreateOnChainAlertRequest, CreateOnChainAlertResponse>(
  'POST', '/api/onchain/alerts',
  (body, auth) => {
    const a     = requireAuth(auth);
    const store = useOnChainStore.getState();
    const result = store.createAlert({
      userId:       a.userId,
      chain:        body.chain as any,
      alertType:    body.alertType as any,
      minValueUsd:  body.minValueUsd ?? 100_000,
      maxValueUsd:  body.maxValueUsd ?? null,
      watchAddress: body.address ?? null,
      label:        body.label ?? '',
    } as any);
    if (!result.ok || !result.alert) {
      throw ApiErrors.validation(result.error ?? 'Alert creation failed.');
    }
    return { alertId: result.alert.id };
  },
);

// ─── GET /api/onchain/alerts ──────────────────────────────────────────────────

registerRoute<Record<string, never>, ListOnChainAlertsResponse>(
  'GET', '/api/onchain/alerts',
  (_body, auth) => {
    const a     = requireAuth(auth);
    const store = useOnChainStore.getState();
    const alerts = store.getUserAlerts(a.userId);
    return { alerts: alerts.map(toAlertItem) };
  },
);

// ─── DELETE /api/onchain/alerts/:id ──────────────────────────────────────────

registerRoute<Record<string, never>, { ok: boolean }>(
  'DELETE', '/api/onchain/alerts/:id',
  (_body, auth, pathParams) => {
    const a     = requireAuth(auth);
    const store = useOnChainStore.getState();
    const id    = pathParams?.['id'] ?? '';
    const result = store.deleteAlert(id, a.userId);
    if (!result.ok) throw ApiErrors.storeError(result.error ?? 'Delete failed.');
    return { ok: true };
  },
);

// ─── GET /api/onchain/events ──────────────────────────────────────────────────

registerRoute<Record<string, never>, ListOnChainEventsResponse>(
  'GET', '/api/onchain/events',
  (_body, auth) => {
    const a     = requireAuth(auth);
    const store = useOnChainStore.getState();
    const events = store.getUserEvents(a.userId);
    return { events: events.map(toWhaleItem), total: events.length };
  },
);
