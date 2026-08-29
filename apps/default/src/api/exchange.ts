/**
 * api/exchange.ts
 *
 * Exchange Connection Endpoints — Part 12 §11.10 (Optional)
 *
 * POST   /api/exchange/connect              - Connect exchange account
 * GET    /api/exchange/connections          - List connections
 * DELETE /api/exchange/connections/:id      - Disconnect
 * GET    /api/exchange/balance/:id          - Get exchange balance
 */

import { registerRoute, requireAuth, ApiErrors } from './client';
import type {
  ConnectExchangeRequest,
  ConnectExchangeResponse,
  ListConnectionsResponse,
  ExchangeConnectionItem,
  GetExchangeBalanceResponse,
} from './types';
import { useExchangeStore } from '../lib/exchangeStore';
import type { ExchangeConnection } from '../lib/exchangeTypes';

function toConnectionItem(c: ExchangeConnection): ExchangeConnectionItem {
  return {
    id:          c.id,
    exchange:    c.exchange,
    label:       c.label,
    isActive:    c.isActive,
    isDemoMode:  c.isDemoMode,
    lastSyncAt:  c.lastSyncAt,
    totalTrades: c.totalTrades,
    totalPnl:    c.totalPnl,
    connectedAt: c.connectedAt,
  };
}

// ─── POST /api/exchange/connect ───────────────────────────────────────────────

registerRoute<ConnectExchangeRequest, ConnectExchangeResponse>(
  'POST', '/api/exchange/connect',
  async (body, auth) => {
    const a     = requireAuth(auth);
    const store = useExchangeStore.getState();

    const result = await store.addConnection({
      userId:    a.userId,
      exchange:  body.exchange as any,
      apiKey:    body.apiKey,
      apiSecret: body.apiSecret,
      label:     body.label ?? `${body.exchange.toUpperCase()} Account`,
      isDemoMode: body.isDemoMode ?? true,
    });

    if (!result.ok || !result.connection) {
      throw ApiErrors.storeError(result.error ?? 'Connection failed.');
    }

    return {
      connectionId: result.connection.id,
      exchange:     result.connection.exchange,
      isDemoMode:   result.connection.isDemoMode,
    };
  },
);

// ─── GET /api/exchange/connections ────────────────────────────────────────────

registerRoute<Record<string, never>, ListConnectionsResponse>(
  'GET', '/api/exchange/connections',
  (_body, auth) => {
    const a     = requireAuth(auth);
    const store = useExchangeStore.getState();
    const conns = store.getConnections(a.userId);
    return { connections: conns.map(toConnectionItem) };
  },
);

// ─── DELETE /api/exchange/connections/:id ────────────────────────────────────

registerRoute<Record<string, never>, { ok: boolean }>(
  'DELETE', '/api/exchange/connections/:id',
  (_body, auth, pathParams) => {
    const a     = requireAuth(auth);
    const store = useExchangeStore.getState();
    const id    = pathParams?.['id'] ?? '';
    const result = store.removeConnection(id, a.userId);
    if (!result.ok) throw ApiErrors.storeError(result.error ?? 'Disconnect failed.');
    return { ok: true };
  },
);

// ─── GET /api/exchange/balance/:id ────────────────────────────────────────────

registerRoute<Record<string, never>, GetExchangeBalanceResponse>(
  'GET', '/api/exchange/balance/:id',
  async (_body, auth, pathParams) => {
    requireAuth(auth);
    const store = useExchangeStore.getState();
    const id    = pathParams?.['id'] ?? '';

    // Force a sync to get fresh balances
    await store.forceSync(id).catch(() => {/* non-fatal */});

    const portfolio = store.getPortfolio(id);
    if (!portfolio) throw ApiErrors.notFound(`Connection '${id}' not found or no portfolio data.`);

    return {
      connectionId:  id,
      balances:      portfolio.balances,
      totalUsdValue: portfolio.totalUsdValue,
      updatedAt:     portfolio.updatedAt,
    };
  },
);
