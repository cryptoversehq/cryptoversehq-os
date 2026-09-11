/**
 * api/client.ts
 *
 * CryptoVerse HQ — Base API Client
 *
 * Architecture:
 *   This is a "virtual REST API" that routes requests to the underlying Zustand
 *   stores rather than to a remote HTTP server. It mirrors the REST contract
 *   defined in Part 12 exactly, so that:
 *     a) The UI can call `api.strategies.list(params)` without knowing whether
 *        the data comes from localStorage, a remote DB, or a hybrid.
 *     b) Swap-out to a real backend (Supabase, Taskade Edge Functions) requires
 *        only changing this file — no UI changes needed.
 *
 * Request flow:
 *   1. Caller invokes  api.strategies.list({ type: 'grid', page: 1 })
 *   2. client.request() resolves the current AuthContext from authStore
 *   3. The registered handler function runs synchronously against the stores
 *   4. The result is wrapped in ApiSuccess<T> | ApiError and returned
 *
 * Real HTTP calls are made only for operations that touch Taskade webhooks
 * (e.g. email OTP, password reset). Those bypass the store router and go
 * directly to the Taskade webhook endpoints discovered in discover_apis().
 *
 * Logging:
 *   All requests are logged in dev mode via DEV_LOG.
 *   In production, logging is a no-op.
 */

import type { ApiAuthContext, ApiError, ApiResponse, HttpMethod } from './types';
import { useAuthStore } from '../lib/authStore';
import { platformTransport } from '../lib/platformTransport';

// The token is held only in memory and is never included in logs or persisted state.

// ─── DEV LOGGING ──────────────────────────────────────────────────────────────

const IS_DEV = import.meta.env.DEV;

type ApiErrorCategory = 'network' | 'auth' | 'server' | 'client';
type ApiAuthRefresh = () => Promise<string>;

let refreshPromise: Promise<string> | null = null;
let authRefresh: ApiAuthRefresh | null = null;
let activeAccessToken: string | null = null;

export function configureApiAuthRefresh(refresh: ApiAuthRefresh | null): void {
  authRefresh = refresh;
}

export async function getValidToken(): Promise<string> {
  if (!authRefresh) throw ApiErrors.unauthorized('Authentication refresh is unavailable.');
  if (refreshPromise) return refreshPromise;
  refreshPromise = authRefresh();
  try {
    const token = await refreshPromise;
    activeAccessToken = token;
    return token;
  } finally {
    refreshPromise = null;
  }
}

function safePath(path: string): string {
  return path.split('?')[0];
}

function devLog(method: HttpMethod, path: string, durationMs: number, ok: boolean) {
  if (!IS_DEV) return;
  const color = ok ? '#22c55e' : '#ef4444';
  const badge = ok ? '✓' : '✗';
  console.log(
    `%c ${badge} ${method} ${safePath(path)} (${durationMs}ms)`,
    `color: ${color}; font-weight: bold; font-family: monospace`,
  );
}

// ─── REQUEST ID ───────────────────────────────────────────────────────────────

let _reqSeq = 0;
function nextRequestId() { return `req_${Date.now()}_${++_reqSeq}`; }

// ─── AUTH CONTEXT RESOLVER ────────────────────────────────────────────────────

export function resolveAuthContext(): ApiAuthContext | null {
  const { user } = useAuthStore.getState();
  if (!user) return null;
  return {
    userId:      user.id,
    displayName: user.displayName,
    plan:        user.plan as ApiAuthContext['plan'],
    level:       user.level,
    kycVerified: user.kycVerified,
    isAdmin:     (user as Record<string, unknown>)['isAdmin'] === true,
  };
}

// ─── HANDLER REGISTRY ─────────────────────────────────────────────────────────

export type ApiHandler<TReq = unknown, TRes = unknown> = (
  params:  TReq,
  auth:    ApiAuthContext | null,
  pathParams?: Record<string, string>,
) => TRes | Promise<TRes>;

interface RegisteredRoute {
  method:  HttpMethod;
  pattern: RegExp;
  paramNames: string[];
  handler: ApiHandler;
}

const _routes: RegisteredRoute[] = [];

/** Convert a path pattern like `/api/strategies/:id/rate` to a named regex. */
function compilePattern(pattern: string): { regex: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  const regexStr = '^' + pattern.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  }) + '(?:\\?.*)?$';
  return { regex: new RegExp(regexStr), paramNames };
}

/** Register a route handler. Called by each API module at import time. */
export function registerRoute<TReq = unknown, TRes = unknown>(
  method:  HttpMethod,
  pattern: string,
  handler: ApiHandler<TReq, TRes>,
) {
  const { regex, paramNames } = compilePattern(pattern);
  _routes.push({ method, pattern: regex, paramNames, handler: handler as ApiHandler });
}

// ─── CORE DISPATCHER ──────────────────────────────────────────────────────────

export async function dispatch<TRes = unknown>(
  method:  HttpMethod,
  path:    string,
  body?:   unknown,
): Promise<ApiResponse<TRes>> {
  const route = _routes.find(r => r.method === method && r.pattern.test(path));

  if (!route) {
    const requestId = nextRequestId();
    const err: ApiError = {
      ok: false,
      error: 'NOT_FOUND',
      message: `No handler registered for ${method} ${safePath(path)}`,
      details: { errorClass: ['client'] },
      requestId,
    };
    devLog(method, path, 0, false);
    return err;
  }

  let didRefresh = false;

  while (true) {
    const requestId = nextRequestId();
    const t0 = performance.now();
    const auth = resolveAuthContext();
    const match = path.match(route.pattern);
    const pathParams: Record<string, string> = {};
    if (match) route.paramNames.forEach((name, i) => { pathParams[name] = match[i + 1]; });

    try {
      const result = await Promise.resolve(route.handler(body ?? {}, auth, pathParams));
      const durationMs = Math.round(performance.now() - t0);
      devLog(method, path, durationMs, true);
      return { ok: true, data: result as TRes, meta: { requestId, durationMs, version: '1.0' } };
    } catch (err) {
      const durationMs = Math.round(performance.now() - t0);
      devLog(method, path, durationMs, false);
      const normalized = normalizeApiError(err);

      if (method === 'GET' && normalized.code === 'UNAUTHORIZED' && !didRefresh && authRefresh) {
        didRefresh = true;
        try {
          await getValidToken();
          continue;
        } catch {
          // Return a sanitized authorization error without exposing token data.
        }
      }

      return {
        ok: false,
        error: normalized.code,
        message: normalized.message,
        details: { ...(normalized.details ?? {}), errorClass: [normalized.category] },
        requestId,
      };
    }
  }
}

function classifyError(code: ApiError['error']): ApiErrorCategory {
  if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') return 'auth';
  if (code === 'SERVER_ERROR' || code === 'STORE_ERROR' || code === 'RATE_LIMITED') return 'server';
  return 'client';
}

function normalizeApiError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) return error;
  const rawMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
  const isNetwork = /network|fetch|timeout|abort|offline/i.test(rawMessage);
  return new ApiClientError(
    'SERVER_ERROR',
    isNetwork ? 'Network request failed.' : rawMessage,
    undefined,
    isNetwork ? 'network' : 'server',
  );
}

// ─── ERROR CLASS ──────────────────────────────────────────────────────────────

export class ApiClientError extends Error {
  public readonly category: ApiErrorCategory;

  constructor(
    public readonly code:    ApiError['error'],
    message:                 string,
    public readonly details?: Record<string, string[]>,
    category?: ApiErrorCategory,
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.category = category ?? classifyError(code);
  }
}

// Convenience constructors
export const ApiErrors = {
  unauthorized: (msg = 'Authentication required.')          => new ApiClientError('UNAUTHORIZED',         msg),
  forbidden:    (msg = 'Insufficient permissions.')         => new ApiClientError('FORBIDDEN',            msg),
  notFound:     (msg = 'Resource not found.')               => new ApiClientError('NOT_FOUND',            msg),
  conflict:     (msg = 'Resource already exists.')          => new ApiClientError('CONFLICT',             msg),
  validation:   (msg: string, d?: Record<string,string[]>) => new ApiClientError('VALIDATION_ERROR',     msg, d),
  balance:      (msg = 'Insufficient CP coins.')            => new ApiClientError('INSUFFICIENT_BALANCE', msg),
  planRequired: (msg = 'Upgrade your plan to access this.') => new ApiClientError('PLAN_REQUIRED',       msg),
  kycRequired:  (msg = 'KYC verification required.')        => new ApiClientError('KYC_REQUIRED',        msg),
  levelRequired:(msg = 'Higher level required.')            => new ApiClientError('LEVEL_REQUIRED',      msg),
  storeError:   (msg: string)                               => new ApiClientError('STORE_ERROR',         msg),
};

// ─── TYPED FETCH SHORTCUTS ────────────────────────────────────────────────────

/** Typed convenience wrappers — used by UI components. */
export const apiGet  = <T>(path: string) => dispatch<T>('GET',    path);
export const apiPost = <T>(path: string, body: unknown) => dispatch<T>('POST',   path, body);
export const apiPut  = <T>(path: string, body: unknown) => dispatch<T>('PUT',    path, body);
export const apiDel  = <T>(path: string) => dispatch<T>('DELETE', path);

/** Real Render API request seam for server-authoritative domains. */
export async function request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (activeAccessToken) headers.Authorization = `Bearer ${activeAccessToken}`;
  return platformTransport.request<T>(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// ─── REAL HTTP CLIENT (for Taskade webhooks) ───────────────────────────────────

export interface TaskadeWebhookRequest {
  flowId:  string;
  payload: Record<string, unknown>;
}

/** Fire a Taskade webhook endpoint (real HTTP). */
export async function callTaskadeWebhook(
  flowId:  string,
  payload: Record<string, unknown>,
): Promise<ApiResponse<Record<string, unknown>>> {
  const requestId = nextRequestId();
  const t0        = performance.now();

  const requestPath = `/api/taskade/webhooks/${flowId}/run`;
  const requestOptions = (): RequestInit => ({
    method: 'POST',
    credentials: 'include',
    headers: activeAccessToken ? { Authorization: `Bearer ${activeAccessToken}` } : undefined,
    body: JSON.stringify(payload),
  });

  try {
    const json = await platformTransport.request<Record<string, unknown>>(requestPath, requestOptions());
    const durationMs = Math.round(performance.now() - t0);
    devLog('POST', requestPath, durationMs, true);
    return { ok: true, data: json, meta: { requestId, durationMs } };
  } catch (err) {
    const normalized = normalizeApiError(err);
    devLog('POST', requestPath, Math.round(performance.now() - t0), false);
    return {
      ok: false,
      error: normalized.code,
      message: normalized.message,
      details: { ...(normalized.details ?? {}), errorClass: [normalized.category] },
      requestId,
    };
  }
}

// ─── AUTH GUARD ───────────────────────────────────────────────────────────────

/** Throws UNAUTHORIZED if no auth context is present. */
export function requireAuth(auth: ApiAuthContext | null): ApiAuthContext {
  if (!auth) throw ApiErrors.unauthorized();
  return auth;
}

/** Throws FORBIDDEN if the user is not an admin. */
export function requireAdmin(auth: ApiAuthContext | null): ApiAuthContext {
  const a = requireAuth(auth);
  if (!a.isAdmin) throw ApiErrors.forbidden('Admin access required.');
  return a;
}
