/**
 * exchangeConnectionManager.ts
 * §4.1 — Exchange Connection Manager
 *
 * Implements the full connection lifecycle:
 *   – Key validation (format + simulated API call)
 *   – Permission inspection & withdrawal block
 *   – Secure masking (keys are NEVER stored in plaintext)
 *   – Test-connection ping
 *   – OAuth2 simulation
 *
 * All "API calls" are simulated. In a real backend these would be
 * proxied server-side so keys never touch the client over the wire.
 */

import { ExchangeId, ExchangePermission, TradingMode, EXCHANGE_META } from './exchangeTypes';

// ── Result types ───────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid:   boolean;
  error?:  string;
  /** Actual permissions the key has on the exchange (simulated) */
  permissions?: ExchangePermission[];
}

export interface ConnectionResult {
  success:       boolean;
  connectionId?: string;
  balanceUSD?:   number;
  balanceBTC?:   number;
  permissions?:  ExchangePermission[];
  maskedKey?:    string;
  error?:        string;
}

export interface TestConnectionResult {
  reachable:    boolean;
  latencyMs:    number;
  serverTime?:  number;
  error?:       string;
}

// ── Blocked permission list (§4.1) ────────────────────────────────────────────

const BLOCKED_PERMISSIONS: ExchangePermission[] = ['withdraw', 'transfer'];
const ALLOWED_PERMISSIONS: ExchangePermission[] = ['read', 'trade'];

// ── Key format validators ──────────────────────────────────────────────────────

interface KeyFormatRule {
  minLength: number;
  maxLength: number;
  pattern:   RegExp;
  label:     string;
}

const KEY_FORMATS: Record<ExchangeId, KeyFormatRule> = {
  binance: {
    minLength: 32,
    maxLength: 128,
    pattern:   /^[A-Za-z0-9]+$/,
    label:     'Binance API key (alphanumeric, 32–128 chars)',
  },
  coinbase: {
    minLength: 16,
    maxLength: 256,
    pattern:   /^[A-Za-z0-9\-_]+$/,
    label:     'Coinbase API key',
  },
  kraken: {
    minLength: 32,
    maxLength: 128,
    pattern:   /^[A-Za-z0-9+/=]+$/,
    label:     'Kraken API key',
  },
  okx: {
    minLength: 32,
    maxLength: 128,
    pattern:   /^[a-f0-9\-]+$/i,
    label:     'OKX API key (UUID format)',
  },
};

// ── Mask helper ────────────────────────────────────────────────────────────────

export function maskApiKey(key: string): string {
  if (!key || key.length < 8) return '****';
  const head = key.slice(0, 4);
  const tail = key.slice(-4);
  return `${head}${'·'.repeat(8)}${tail}`;
}

// ── Simulated API endpoints ────────────────────────────────────────────────────

const SIMULATED_ENDPOINTS: Record<ExchangeId, string> = {
  binance:  'https://api.binance.com/api/v3/account',
  coinbase: 'https://api.coinbase.com/v2/user',
  kraken:   'https://api.kraken.com/0/private/Balance',
  okx:      'https://www.okx.com/api/v5/account/balance',
};

// ── ExchangeConnectionManager ─────────────────────────────────────────────────

export class ExchangeConnectionManager {

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Full connection flow for API-key based exchanges (Binance, Kraken, OKX).
   * Steps: format-validate → simulate API ping → check permissions → block withdrawals → return result.
   */
  async connectWithApiKey(params: {
    exchangeId:  ExchangeId;
    apiKey:      string;
    apiSecret:   string;
    passphrase?: string;
    modes:       TradingMode[];
    requestedPermissions: ExchangePermission[];
  }): Promise<ConnectionResult> {

    const { exchangeId, apiKey, apiSecret, passphrase } = params;
    const ex = EXCHANGE_META[exchangeId];

    // ── Step 1: Format validation ──────────────────────────────────────────
    const fmtResult = this.validateKeyFormat(exchangeId, apiKey);
    if (!fmtResult.valid) {
      return { success: false, error: fmtResult.error };
    }

    if (!apiSecret || apiSecret.length < 16) {
      return { success: false, error: 'API secret must be at least 16 characters' };
    }

    if (ex.requiresPassphrase && (!passphrase || passphrase.length < 6)) {
      return { success: false, error: 'Passphrase is required and must be at least 6 characters for OKX' };
    }

    // ── Step 2: Simulate API validation call ───────────────────────────────
    const validation = await this.validateKeyWithExchange(exchangeId, apiKey, apiSecret);
    if (!validation.valid) {
      return { success: false, error: validation.error ?? 'Key validation failed' };
    }

    // ── Step 3: Check permissions returned by exchange ─────────────────────
    const grantedPermissions = validation.permissions ?? ['read'];
    const permissionCheck    = this.checkPermissions(grantedPermissions);
    if (!permissionCheck.allowed) {
      return {
        success: false,
        error: permissionCheck.error,
      };
    }

    // ── Step 4: Test connection with a lightweight balance request ─────────
    const testResult = await this.testConnection(exchangeId, apiKey);
    if (!testResult.reachable) {
      return { success: false, error: `Connection test failed: ${testResult.error}` };
    }

    return {
      success:     true,
      balanceUSD:  this.simulateBalance(exchangeId),
      balanceBTC:  this.simulateBalanceBTC(),
      permissions: grantedPermissions.filter(p => ALLOWED_PERMISSIONS.includes(p)),
      maskedKey:   maskApiKey(apiKey),
    };
  }

  /**
   * OAuth2 flow simulation (Coinbase).
   * In real implementation: open popup → receive code → exchange for token → verify scopes.
   */
  async connectOAuth(params: {
    exchangeId: ExchangeId;
    requestedScopes: string[];
  }): Promise<ConnectionResult> {
    // Simulate the OAuth redirect + token exchange delay
    await this.delay(2000);

    // Simulate scope verification — never grant withdraw
    const grantedScopes: ExchangePermission[] = ['read', 'trade'];

    return {
      success:     true,
      balanceUSD:  this.simulateBalance('coinbase'),
      balanceBTC:  this.simulateBalanceBTC() * 0.5,
      permissions: grantedScopes,
      maskedKey:   undefined, // OAuth doesn't expose a key
    };
  }

  /**
   * Test whether an exchange connection is reachable.
   * Simulates a lightweight ping to the exchange's server-time endpoint.
   */
  async testConnection(exchangeId: ExchangeId, apiKey: string): Promise<TestConnectionResult> {
    const start = Date.now();
    // Simulate network latency 80–300ms
    const latencyMs = 80 + Math.floor(Math.random() * 220);
    await this.delay(latencyMs);

    // Simulate occasional failure (5% chance)
    if (Math.random() < 0.05) {
      return {
        reachable: false,
        latencyMs,
        error: 'Connection refused. Check your internet connection.',
      };
    }

    return {
      reachable:  true,
      latencyMs,
      serverTime: Date.now(),
    };
  }

  /**
   * Re-validate an existing stored connection (called on sync).
   */
  async revalidateConnection(exchangeId: ExchangeId, maskedKey: string): Promise<ValidationResult> {
    // We can't re-validate with a masked key — assume still valid
    // In real implementation: backend maintains the encrypted key and re-tests it
    await this.delay(400);
    return { valid: true, permissions: ['read', 'trade'] };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Validate API key format for the given exchange.
   * §4.1 Step 1: Format check before any network call.
   */
  private validateKeyFormat(exchangeId: ExchangeId, apiKey: string): ValidationResult {
    if (!apiKey || !apiKey.trim()) {
      return { valid: false, error: 'API key is required' };
    }

    const rule = KEY_FORMATS[exchangeId];

    if (apiKey.length < rule.minLength) {
      return {
        valid: false,
        error: `API key too short. Expected at least ${rule.minLength} characters for ${EXCHANGE_META[exchangeId].name}`,
      };
    }

    if (apiKey.length > rule.maxLength) {
      return {
        valid: false,
        error: `API key too long. Max ${rule.maxLength} characters`,
      };
    }

    if (!rule.pattern.test(apiKey)) {
      return {
        valid: false,
        error: `Invalid API key format. Expected: ${rule.label}`,
      };
    }

    return { valid: true };
  }

  /**
   * Simulate calling the exchange's account endpoint to validate the key.
   * §4.1: `validateBinanceKey` logic — simulated here as we can't make
   * real cross-origin calls without a backend proxy.
   *
   * Real implementation would be:
   *   GET https://api.binance.com/api/v3/account  { headers: X-MBX-APIKEY }
   *   200 → valid, 401 → invalid key/secret
   */
  private async validateKeyWithExchange(
    exchangeId: ExchangeId,
    apiKey:     string,
    apiSecret:  string,
  ): Promise<ValidationResult> {
    // Simulate API call delay (500–1500ms)
    await this.delay(500 + Math.random() * 1000);

    // Detect obviously test/demo keys and return appropriate response
    const testPrefixes = ['test', 'demo', 'fake', 'sample', 'example'];
    const isTestKey = testPrefixes.some(p => apiKey.toLowerCase().startsWith(p));
    if (isTestKey) {
      return { valid: false, error: 'Invalid API key or secret — connection refused (HTTP 401)' };
    }

    // Simulate what the exchange returns for valid keys
    // In real scenario: parse the returned account permissions from the JSON response
    const simulatedPermissions: ExchangePermission[] = ['read', 'trade'];

    // Occasionally simulate a key with withdrawal permission to test our guard
    // In practice, about 3% of users accidentally create keys with withdrawal enabled
    if (Math.random() < 0.03) {
      simulatedPermissions.push('withdraw');
    }

    return {
      valid:       true,
      permissions: simulatedPermissions,
    };
  }

  /**
   * §4.1: "Check if hasWithdrawPermission" — block if withdrawal is enabled.
   * This is the critical security gate described in the spec.
   */
  private checkPermissions(permissions: ExchangePermission[]): { allowed: boolean; error?: string } {
    for (const blocked of BLOCKED_PERMISSIONS) {
      if (permissions.includes(blocked)) {
        return {
          allowed: false,
          error:   `API key has "${blocked}" permission enabled. This is not allowed for security reasons. ` +
                   `Please create a new API key with only Spot Trading enabled and WITHOUT withdrawal permissions.`,
        };
      }
    }

    if (!permissions.includes('read')) {
      return {
        allowed: false,
        error:   'API key must have at least Read permission',
      };
    }

    return { allowed: true };
  }

  private simulateBalance(exchangeId: ExchangeId): number {
    const ranges: Record<ExchangeId, [number, number]> = {
      binance:  [5000,  80000],
      coinbase: [2000,  40000],
      kraken:   [3000,  60000],
      okx:      [8000, 100000],
    };
    const [min, max] = ranges[exchangeId];
    return parseFloat((Math.random() * (max - min) + min).toFixed(2));
  }

  private simulateBalanceBTC(): number {
    return parseFloat((Math.random() * 2.4 + 0.05).toFixed(6));
  }

  private delay(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────────

export const connectionManager = new ExchangeConnectionManager();
