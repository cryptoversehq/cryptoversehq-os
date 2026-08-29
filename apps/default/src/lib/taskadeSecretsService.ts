/**
 * taskadeSecretsService.ts — Taskade Space Secrets integration
 *
 * ── How secrets actually work in a Genesis app (see docs/01_data_layer.md) ──
 * Secrets are NEVER delivered to the browser. There is no `secrets.get()`.
 * Instead, `GenesisClient.proxy()` takes a request template containing the
 * literal placeholder `{{secret}}` plus a `secretAlias`; Taskade's server
 * resolves the key from Space Settings → Secrets, substitutes it, and
 * forwards the request server-side. The raw key never enters client code —
 * which is the correct model for a client-side app where anything in JS is
 * readable by every visitor.
 *
 * Consequences for this module's API:
 *   - `getSecret(name)` (returning the raw key) is impossible by design.
 *   - Verification = make ONE minimal proxied request against the target API
 *     and classify the response. That's `verifySecret()` below.
 *
 * Setup (user action, per API):
 *   Space Settings → Secrets → add key with the EXACT alias used here
 *   (e.g. alias `newsapi` holding the NewsAPI key).
 */
import { GenesisClient } from '@taskade/genesis-client';

export const SPACE_ID = 'rdem1z86swzzv7vq';

/** Central registry of the secret aliases this app expects. */
export const SECRET_ALIASES = {
  newsapi:   'newsapi',
  etherscan: 'etherscan',
  coingecko: 'coingecko', // not needed yet — public endpoints work keyless
  deepseek:  'deepseek',  // wire LAST, per integration plan
  nowpayments: 'nowpayments', // NOWPayments — x-api-key header
  opensea:   'opensea',   // OpenSea v2 API — X-API-KEY header
  blur:      'blur',      // Blur marketplace — authToken header
} as const;

export type SecretAlias = keyof typeof SECRET_ALIASES;

let _client: GenesisClient | null = null;
function client(): GenesisClient {
  if (!_client) _client = new GenesisClient({ spaceId: SPACE_ID });
  return _client;
}

export interface ProxyRequest {
  url:      string;
  method?:  'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Use the literal string `{{secret}}` where the key belongs,
   *  e.g. { 'X-Api-Key': '{{secret}}' } or { Authorization: 'Bearer {{secret}}' } */
  headers?: Record<string, string>;
  body?:    unknown;
}

/**
 * Make a server-side proxied request that injects the named Space Secret.
 * Returns a normal `Response` for BOTH 2xx and non-2xx upstream statuses —
 * always branch on `res.ok`. Throws only on network/proxy transport failure.
 */
export async function proxySecretFetch(alias: SecretAlias, req: ProxyRequest): Promise<Response> {
  return client().proxy({
    secretAlias: SECRET_ALIASES[alias],
    url:     req.url,
    method:  req.method ?? 'GET',
    headers: req.headers,
    body:    req.body,
  });
}

export interface SecretVerification {
  alias:   SecretAlias;
  ok:      boolean;
  /** HTTP status from the upstream API, if a response was received. */
  status?: number;
  message: string;
}

/** Minimal, cheap test request per API. */
const VERIFY_REQUESTS: Partial<Record<SecretAlias, ProxyRequest>> = {
  newsapi: {
    url: 'https://newsapi.org/v2/top-headlines?category=business&pageSize=1',
    headers: { 'X-Api-Key': '{{secret}}' },
  },
  deepseek: {
    url: 'https://api.deepseek.com/v1/models',
    method: 'GET',
    headers: { 'Authorization': 'Bearer {{secret}}' },
  },
  etherscan: {
    url: 'https://api.etherscan.io/api?module=account&action=balance&address=0x0000000000000000000000000000000000000000&tag=latest',
    headers: {},
  },
  opensea: {
    url: 'https://api.opensea.io/api/v2/collections?limit=1',
    headers: { 'X-API-KEY': '{{secret}}' },
  },
};

/**
 * Verify that a secret is configured AND accepted by its API, by making one
 * minimal proxied request. Never throws — always resolves to a report object.
 */
export async function verifySecret(alias: SecretAlias): Promise<SecretVerification> {
  const req = VERIFY_REQUESTS[alias];
  if (!req) {
    return { alias, ok: false, message: `No verification request wired for "${alias}" yet (by design — step-by-step rollout).` };
  }
  try {
    const res = await proxySecretFetch(alias, req);
    if (res.ok) {
      return { alias, ok: true, status: res.status, message: 'Secret accepted by the upstream API.' };
    }
    let detail = '';
    try {
      const body = await res.json() as { message?: string; code?: string; error?: { message?: string } };
      detail = body?.message ?? body?.error?.message ?? body?.code ?? '';
    } catch { /* non-JSON error body */ }
    const hint =
      res.status === 401 ? ' — key missing/invalid: check the alias name and value in Space Settings → Secrets.' :
      res.status === 429 ? ' — rate limited: the key works, but quota is exhausted.' : '';
    return { alias, ok: false, status: res.status, message: `Upstream returned ${res.status}${detail ? `: ${detail}` : ''}${hint}` };
  } catch (err) {
    return {
      alias, ok: false,
      message: `Proxy transport error: ${err instanceof Error ? err.message : String(err)} — the secret alias may not exist in Space Settings → Secrets.`,
    };
  }
}

/** Verify every wired alias sequentially (unwired ones report as skipped). */
export async function verifyAllSecrets(aliases: SecretAlias[] = ['newsapi']): Promise<SecretVerification[]> {
  const out: SecretVerification[] = [];
  for (const a of aliases) out.push(await verifySecret(a));
  return out;
}

// ── Secret CRUD (write operations) ───────────────────────────────────────────

/**
 * Save a secret value under the given alias in Space Settings → Secrets.
 * Creates the secret if it doesn't exist; overwrites if it does.
 * Never throws — returns success boolean.
 */
export async function setSecret(alias: string, value: string): Promise<boolean> {
  try {
    await client().secrets.set(alias, value);
    return true;
  } catch (err) {
    console.error('[taskadeSecretsService] setSecret failed:', err);
    return false;
  }
}

/**
 * Remove a secret by alias from Space Settings → Secrets.
 * Never throws — returns success boolean.
 */
export async function deleteSecret(alias: string): Promise<boolean> {
  try {
    await client().secrets.delete(alias);
    return true;
  } catch (err) {
    console.error('[taskadeSecretsService] deleteSecret failed:', err);
    return false;
  }
}

/**
 * List all secret aliases currently stored in Space Settings.
 * Returns an empty array if the API is unavailable or no secrets exist.
 */
export async function listSecretAliases(): Promise<string[]> {
  try {
    const listing = await client().secrets.list();
    // The API returns an array of { key: string } objects or string[]
    if (!listing) return [];
    if (Array.isArray(listing)) {
      return listing.map((s: unknown) => typeof s === 'string' ? s : (s as Record<string,unknown>)?.key as string ?? '').filter(Boolean);
    }
    return [];
  } catch (err) {
    console.error('[taskadeSecretsService] listSecretAliases failed:', err);
    return [];
  }
}

/**
 * Check whether a secret alias exists in Space Settings.
 */
export async function secretExists(alias: string): Promise<boolean> {
  const aliases = await listSecretAliases();
  return aliases.includes(alias);
}
