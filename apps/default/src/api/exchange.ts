import { registerRoute, requireAuth, request, ApiErrors } from './client';
import type {
  ConnectExchangeRequest,
  ConnectExchangeResponse,
  ListConnectionsResponse,
  GetExchangeBalanceResponse,
  SyncExchangeResponse,
  ExecuteExchangeOrderRequest,
  ExecuteExchangeOrderResponse,
} from './types';
import { EXCHANGE_META, type ExchangeId } from '../lib/exchangeTypes';

const MAX_CREDENTIAL_LENGTH = 512;
const MAX_LABEL_LENGTH = 80;

function isSupportedExchange(value: string): value is ExchangeId {
  return Object.prototype.hasOwnProperty.call(EXCHANGE_META, value);
}

function connectionId(pathParams?: Record<string, string>): string {
  const id = pathParams?.id?.trim() ?? '';
  if (!/^[A-Za-z0-9_-]{4,128}$/.test(id)) {
    throw ApiErrors.validation('Invalid exchange connection id.');
  }
  return id;
}

function validateConnectRequest(body: ConnectExchangeRequest) {
  const exchange = typeof body.exchange === 'string' ? body.exchange.trim().toLowerCase() : '';
  if (!isSupportedExchange(exchange)) throw ApiErrors.validation('Unsupported exchange.');

  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  const apiSecret = typeof body.apiSecret === 'string' ? body.apiSecret.trim() : '';
  const label = typeof body.label === 'string' && body.label.trim()
    ? body.label.trim().slice(0, MAX_LABEL_LENGTH)
    : `${exchange.toUpperCase()} Account`;
  const isDemoMode = body.isDemoMode === true;
  const hasControlChars = (value: string) => /[\u0000-\u001f\u007f]/.test(value);

  if (apiKey.length > MAX_CREDENTIAL_LENGTH || apiSecret.length > MAX_CREDENTIAL_LENGTH) {
    throw ApiErrors.validation('Credential value is too long.');
  }
  if (hasControlChars(apiKey) || hasControlChars(apiSecret) || hasControlChars(label)) {
    throw ApiErrors.validation('Credential and label values contain invalid characters.');
  }
  if (isDemoMode && (apiKey || apiSecret)) {
    throw ApiErrors.validation('Demo connections must not include live credentials.');
  }
  if (!isDemoMode && (apiKey.length < 8 || apiSecret.length < 8)) {
    throw ApiErrors.validation('Live connections require both exchange credentials.');
  }

  return { exchange, apiKey, apiSecret, label, isDemoMode };
}

registerRoute<ConnectExchangeRequest, ConnectExchangeResponse>(
  'POST', '/api/exchange/connect', async (body, auth) => {
    requireAuth(auth);
    const payload = validateConnectRequest(body);
    return request<ConnectExchangeResponse>('POST', '/api/exchange/connect', payload);
  },
);

registerRoute<Record<string, never>, ListConnectionsResponse>(
  'GET', '/api/exchange/connections', async (_body, auth) => {
    requireAuth(auth);
    return request<ListConnectionsResponse>('GET', '/api/exchange/connections');
  },
);

registerRoute<Record<string, never>, { ok: boolean }>(
  'DELETE', '/api/exchange/connections/:id', async (_body, auth, pathParams) => {
    requireAuth(auth);
    return request<{ ok: boolean }>('DELETE', `/api/exchange/connections/${encodeURIComponent(connectionId(pathParams))}`);
  },
);

registerRoute<Record<string, never>, GetExchangeBalanceResponse>(
  'GET', '/api/exchange/balance/:id', async (_body, auth, pathParams) => {
    requireAuth(auth);
    const id = connectionId(pathParams);
    return request<GetExchangeBalanceResponse>('GET', `/api/exchange/balance/${encodeURIComponent(id)}`);
  },
);

registerRoute<Record<string, never>, SyncExchangeResponse>(
  'POST', '/api/exchange/sync/:id', async (_body, auth, pathParams) => {
    requireAuth(auth);
    const id = connectionId(pathParams);
    return request<SyncExchangeResponse>('POST', `/api/exchange/sync/${encodeURIComponent(id)}`);
  },
);

registerRoute<ExecuteExchangeOrderRequest, ExecuteExchangeOrderResponse>(
  'POST', '/api/exchange/order', async (body, auth) => {
    requireAuth(auth);
    if (!body.connectionId || !/^[A-Za-z0-9_-]{4,128}$/.test(body.connectionId)) {
      throw ApiErrors.validation('Invalid exchange connection id.');
    }
    if (!body.symbol || !/^[A-Z0-9._-]{2,24}\/[A-Z0-9._-]{2,24}$/.test(body.symbol)) {
      throw ApiErrors.validation('Invalid trading symbol.');
    }
    if (!Number.isFinite(body.quantity) || body.quantity <= 0) {
      throw ApiErrors.validation('Order quantity must be greater than zero.');
    }
    if (body.orderType !== 'market' && (!Number.isFinite(body.price) || (body.price ?? 0) <= 0)) {
      throw ApiErrors.validation('A positive order price is required.');
    }
    return request<ExecuteExchangeOrderResponse>('POST', '/api/exchange/order', body);
  },
);
