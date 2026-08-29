/**
 * apiStatusService.ts — Super Admin API management layer
 *
 * ── Security model (matches taskadeSecretsService.ts / docs/01_data_layer.md) ──
 * API keys are stored ONLY in Taskade Space Settings → Secrets. They are
 * NEVER fetched, cached, or rendered in the browser. Every keyed request in
 * this module goes through `GenesisClient.proxy()` (via `proxySecretFetch`),
 * where Taskade's server substitutes the literal `{{secret}}` placeholder
 * server-side. The ONLY thing this module ever learns about a key is a
 * boolean-ish classification derived from the upstream HTTP status:
 *   active (2xx) · inactive (key rejected / API down) · no-key (401/403 or
 *   proxy says the alias doesn't exist).
 *
 * What this module owns:
 *   - API_REGISTRY   — static metadata for every external API the app uses
 *   - useApiMgmtStore — zustand store: enabled flags, expiry dates, logs,
 *                       last-test results (persisted to localStorage)
 *   - testApi()      — one minimal proxied request → classified result + log
 *   - isApiEnabled() — kill-switch consulted by feature code before calling
 *                      an external API (see note at bottom)
 */
import { create } from 'zustand';
import {
  proxySecretFetch,
  type SecretAlias,
} from './taskadeSecretsService';

// ─── Registry ─────────────────────────────────────────────────────────────────

export type ApiId = 'deepseek' | 'coingecko' | 'newsapi' | 'etherscan' | 'nowpayments';

export type ApiHealth = 'active' | 'inactive' | 'no_key' | 'unknown' | 'disabled';

export interface ApiTestSpec {
  /** How the test request is executed. */
  mode: 'proxy' | 'public';
  /** Secret alias in Space Settings → Secrets (proxy mode only). */
  alias?: SecretAlias;
  url: string;
  method?: 'GET' | 'POST';
  /** `{{secret}}` placeholder is substituted SERVER-SIDE by the proxy. */
  headers?: Record<string, string>;
  body?: unknown;
}

export interface ApiDefinition {
  id: ApiId;
  name: string;
  /** Emoji icon — keeps the page dependency-free and brand-safe. */
  icon: string;
  description: string;
  docsUrl: string;
  /** Where the key travels in real requests (informational only). */
  authNote: string;
  requiresKey: boolean;
  test: ApiTestSpec;
  /** Modules in this codebase that consume the API (shown in UI). */
  usedBy: string[];
}

export const API_REGISTRY: ApiDefinition[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    icon: '🧠',
    description: 'LLM powering the Lynx AI chat, strategy explanations and sentiment summaries.',
    docsUrl: 'https://platform.deepseek.com/docs',
    authNote: 'Authorization: Bearer {{secret}} (alias "deepseek")',
    requiresKey: true,
    test: {
      mode: 'proxy',
      alias: 'deepseek',
      url: 'https://api.deepseek.com/v1/models',
      headers: { Authorization: 'Bearer {{secret}}' },
    },
    usedBy: ['deepSeekClient.ts', 'agentRouter.ts', 'sentimentEngine.ts'],
  },
  {
    id: 'coingecko',
    name: 'CoinGecko',
    icon: '🦎',
    description: 'Market prices, coin metadata and charts. Currently on keyless public endpoints.',
    docsUrl: 'https://docs.coingecko.com',
    authNote: 'Public endpoints (no key). Pro tier would use x-cg-pro-api-key via proxy.',
    requiresKey: false,
    test: {
      mode: 'public',
      url: 'https://api.coingecko.com/api/v3/ping',
    },
    usedBy: ['coinGeckoService.ts', 'liveMarketService.ts', 'marketEngine.ts'],
  },
  {
    id: 'newsapi',
    name: 'NewsAPI',
    icon: '📰',
    description: 'Business & crypto headlines feeding the Sentiment / News modules.',
    docsUrl: 'https://newsapi.org/docs',
    authNote: 'X-Api-Key: {{secret}} (alias "newsapi")',
    requiresKey: true,
    test: {
      mode: 'proxy',
      alias: 'newsapi',
      url: 'https://newsapi.org/v2/top-headlines?category=business&pageSize=1',
      headers: { 'X-Api-Key': '{{secret}}' },
    },
    usedBy: ['sentimentStore.ts', 'sentimentEngine.ts'],
  },
  {
    id: 'etherscan',
    name: 'Etherscan',
    icon: '⛓️',
    description: 'On-chain balances, transactions and whale tracking for the On-Chain module.',
    docsUrl: 'https://docs.etherscan.io',
    authNote: 'Query param apikey={{secret}} (alias "etherscan"); low-rate keyless fallback.',
    requiresKey: true,
    test: {
      mode: 'proxy',
      alias: 'etherscan',
      url: 'https://api.etherscan.io/api?module=account&action=balance&address=0x0000000000000000000000000000000000000000&tag=latest&apikey={{secret}}',
      headers: {},
    },
    usedBy: ['etherscanAPI.ts', 'onChainApiGateway.ts', 'whaleDetectionEngine.ts'],
  },
  {
    id: 'nowpayments',
    name: 'NOWPayments',
    icon: '💸',
    description: 'Crypto payment processing for subscriptions and CP purchases.',
    docsUrl: 'https://documenter.getpostman.com/view/7907941/S1a32n38',
    authNote: 'x-api-key: {{secret}} (alias "nowpayments")',
    requiresKey: true,
    test: {
      mode: 'proxy',
      alias: 'nowpayments',
      // /v1/currencies requires a valid key → real key verification.
      url: 'https://api.nowpayments.io/v1/currencies',
      headers: { 'x-api-key': '{{secret}}' },
    },
    usedBy: ['nowPaymentsClient.ts', 'nowPaymentsStore.ts', 'adminPaymentStore.ts'],
  },
];

export const API_BY_ID: Record<ApiId, ApiDefinition> = Object.fromEntries(
  API_REGISTRY.map(d => [d.id, d]),
) as Record<ApiId, ApiDefinition>;

// ─── Logs & runtime state ─────────────────────────────────────────────────────

export type ApiLogKind = 'test' | 'enable' | 'disable' | 'expiry_set';

export interface ApiLogEntry {
  id: string;
  apiId: ApiId;
  kind: ApiLogKind;
  ok: boolean;
  /** Upstream HTTP status, when a response was received. */
  status?: number;
  latencyMs?: number;
  message: string;
  /** Display name of the super admin who triggered the action. */
  actor: string;
  timestamp: string; // ISO
}

export interface ApiTestResult {
  ok: boolean;
  health: ApiHealth;
  status?: number;
  latencyMs: number;
  message: string;
  at: string; // ISO
}

export interface ApiRuntimeState {
  enabled: boolean;
  /** ISO date the key expires, if the provider communicated one (manual entry). */
  keyExpiresAt: string | null;
  /** Last time the app touched this API (tests count; feature code can call markApiUsed). */
  lastUsedAt: string | null;
  lastTest: ApiTestResult | null;
}

const STATE_KEY = 'cryptoverse_api_mgmt_state_v1';
const LOGS_KEY  = 'cryptoverse_api_mgmt_logs_v1';
const MAX_LOGS_PER_API = 100;

function defaultRuntime(): ApiRuntimeState {
  return { enabled: true, keyExpiresAt: null, lastUsedAt: null, lastTest: null };
}

function loadState(): Record<ApiId, ApiRuntimeState> {
  const base = Object.fromEntries(
    API_REGISTRY.map(d => [d.id, defaultRuntime()]),
  ) as Record<ApiId, ApiRuntimeState>;
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
    for (const id of Object.keys(base) as ApiId[]) {
      if (saved[id]) base[id] = { ...base[id], ...saved[id] };
    }
  } catch { /* fresh state */ }
  return base;
}

function loadLogs(): ApiLogEntry[] {
  try { return JSON.parse(localStorage.getItem(LOGS_KEY) || '[]'); } catch { return []; }
}

function persist(state: Record<ApiId, ApiRuntimeState>, logs: ApiLogEntry[]) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
  } catch { /* storage full — non-fatal */ }
}

function makeId() {
  return 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

/** Cap logs per API so localStorage never bloats. */
function capLogs(logs: ApiLogEntry[]): ApiLogEntry[] {
  const byApi: Partial<Record<ApiId, number>> = {};
  const out: ApiLogEntry[] = [];
  // newest-first assumed; keep first MAX per api
  for (const l of logs) {
    const n = (byApi[l.apiId] ?? 0) + 1;
    byApi[l.apiId] = n;
    if (n <= MAX_LOGS_PER_API) out.push(l);
  }
  return out;
}

// ─── Expiry helpers ───────────────────────────────────────────────────────────

export type ExpiryLevel = 'none' | 'ok' | 'expiring' | 'expired';
export const EXPIRY_WARNING_DAYS = 14;

export function expiryLevel(keyExpiresAt: string | null): ExpiryLevel {
  if (!keyExpiresAt) return 'none';
  const days = daysUntil(keyExpiresAt);
  if (days < 0) return 'expired';
  if (days <= EXPIRY_WARNING_DAYS) return 'expiring';
  return 'ok';
}

export function daysUntil(iso: string): number {
  return Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

// ─── Test execution ───────────────────────────────────────────────────────────

/** Classify a completed test into an ApiHealth value. */
function classify(def: ApiDefinition, status: number | undefined, transportError: boolean): ApiHealth {
  if (transportError) return def.requiresKey ? 'no_key' : 'inactive';
  if (status && status >= 200 && status < 300) return 'active';
  if (status === 401 || status === 403) return 'no_key';
  return 'inactive';
}

/**
 * Run one minimal test request for an API and classify the result.
 * Never throws. Never sees the key — proxy mode substitutes it server-side.
 */
export async function runApiTest(id: ApiId): Promise<ApiTestResult> {
  const def = API_BY_ID[id];
  const started = performance.now();
  const at = new Date().toISOString();
  try {
    let res: Response;
    if (def.test.mode === 'proxy') {
      res = await proxySecretFetch(def.test.alias as SecretAlias, {
        url: def.test.url,
        method: def.test.method ?? 'GET',
        headers: def.test.headers,
        body: def.test.body,
      });
    } else {
      res = await fetch(def.test.url, { method: def.test.method ?? 'GET' });
    }
    const latencyMs = Math.round(performance.now() - started);
    const health = classify(def, res.status, false);

    let detail = '';
    if (!res.ok) {
      try {
        const body = await res.json() as { message?: string; error?: { message?: string }; code?: string };
        detail = body?.message ?? body?.error?.message ?? body?.code ?? '';
      } catch { /* non-JSON body */ }
    }

    const message = res.ok
      ? `OK — upstream responded ${res.status} in ${latencyMs}ms.`
      : res.status === 401 || res.status === 403
        ? `Key rejected (${res.status}). Check alias "${def.test.alias}" in Space Settings → Secrets.${detail ? ` Upstream: ${detail}` : ''}`
        : res.status === 429
          ? `Rate limited (429) — the key works but quota is exhausted.`
          : `Upstream error ${res.status}.${detail ? ` ${detail}` : ''}`;

    return { ok: res.ok, health, status: res.status, latencyMs, message, at };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - started);
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      health: classify(def, undefined, true),
      latencyMs,
      message: def.test.mode === 'proxy'
        ? `Proxy transport error: ${msg} — the secret alias "${def.test.alias}" may not exist in Space Settings → Secrets.`
        : `Network error: ${msg}`,
      at,
    };
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface ApiMgmtState {
  apis: Record<ApiId, ApiRuntimeState>;
  logs: ApiLogEntry[];              // newest first
  testing: Partial<Record<ApiId, boolean>>;

  /** Effective health for UI: 'disabled' overrides last-test classification. */
  healthOf: (id: ApiId) => ApiHealth;
  logsFor: (id: ApiId, limit?: number) => ApiLogEntry[];

  testApi: (id: ApiId, actor: string) => Promise<ApiTestResult>;
  testAll: (actor: string) => Promise<void>;
  setEnabled: (id: ApiId, enabled: boolean, actor: string) => void;
  setKeyExpiry: (id: ApiId, isoDate: string | null, actor: string) => void;
  markApiUsed: (id: ApiId) => void;
  clearLogs: (id?: ApiId) => void;
}

export const useApiMgmtStore = create<ApiMgmtState>((set, get) => ({
  apis: loadState(),
  logs: loadLogs(),
  testing: {},

  healthOf: (id) => {
    const s = get().apis[id];
    if (!s.enabled) return 'disabled';
    return s.lastTest?.health ?? 'unknown';
  },

  logsFor: (id, limit = 50) => get().logs.filter(l => l.apiId === id).slice(0, limit),

  testApi: async (id, actor) => {
    set(st => ({ testing: { ...st.testing, [id]: true } }));
    const result = await runApiTest(id);
    set(st => {
      const apis = {
        ...st.apis,
        [id]: { ...st.apis[id], lastTest: result, lastUsedAt: result.at },
      };
      const entry: ApiLogEntry = {
        id: makeId(), apiId: id, kind: 'test', ok: result.ok,
        status: result.status, latencyMs: result.latencyMs,
        message: result.message, actor, timestamp: result.at,
      };
      const logs = capLogs([entry, ...st.logs]);
      persist(apis, logs);
      return { apis, logs, testing: { ...st.testing, [id]: false } };
    });
    return result;
  },

  testAll: async (actor) => {
    // Sequential on purpose — avoids tripping per-IP rate limits in one burst.
    for (const def of API_REGISTRY) {
      if (get().apis[def.id].enabled) await get().testApi(def.id, actor);
    }
  },

  setEnabled: (id, enabled, actor) => {
    set(st => {
      const apis = { ...st.apis, [id]: { ...st.apis[id], enabled } };
      const entry: ApiLogEntry = {
        id: makeId(), apiId: id, kind: enabled ? 'enable' : 'disable', ok: true,
        message: `${API_BY_ID[id].name} ${enabled ? 'ENABLED' : 'DISABLED'} by ${actor}.`,
        actor, timestamp: new Date().toISOString(),
      };
      const logs = capLogs([entry, ...st.logs]);
      persist(apis, logs);
      return { apis, logs };
    });
  },

  setKeyExpiry: (id, isoDate, actor) => {
    set(st => {
      const apis = { ...st.apis, [id]: { ...st.apis[id], keyExpiresAt: isoDate } };
      const entry: ApiLogEntry = {
        id: makeId(), apiId: id, kind: 'expiry_set', ok: true,
        message: isoDate
          ? `Key expiration for ${API_BY_ID[id].name} set to ${isoDate.slice(0, 10)}.`
          : `Key expiration for ${API_BY_ID[id].name} cleared.`,
        actor, timestamp: new Date().toISOString(),
      };
      const logs = capLogs([entry, ...st.logs]);
      persist(apis, logs);
      return { apis, logs };
    });
  },

  markApiUsed: (id) => {
    set(st => {
      const apis = { ...st.apis, [id]: { ...st.apis[id], lastUsedAt: new Date().toISOString() } };
      persist(apis, st.logs);
      return { apis };
    });
  },

  clearLogs: (id) => {
    set(st => {
      const logs = id ? st.logs.filter(l => l.apiId !== id) : [];
      persist(st.apis, logs);
      return { logs };
    });
  },
}));

// ─── Kill switch for feature code ─────────────────────────────────────────────
/**
 * Feature modules (deepSeekClient, coinGeckoService, etherscanAPI,
 * nowPaymentsClient, sentiment news fetchers…) should gate outbound calls:
 *
 *   import { isApiEnabled, markApiUsed } from '@/lib/apiStatusService';
 *   if (!isApiEnabled('deepseek')) return fallback();
 *   markApiUsed('deepseek');
 *
 * Reading through the store keeps the toggle reactive AND persisted.
 */
export function isApiEnabled(id: ApiId): boolean {
  return useApiMgmtStore.getState().apis[id].enabled;
}
export function markApiUsed(id: ApiId): void {
  useApiMgmtStore.getState().markApiUsed(id);
}
