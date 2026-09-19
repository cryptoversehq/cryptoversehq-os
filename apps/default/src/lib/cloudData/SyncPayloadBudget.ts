/**
 * SyncPayloadBudget.ts — keep the per-user cloud document inside the proxy's limit.
 *
 * P0.1. The Taskade node attribute @cv_data holds EVERY synced object of a user as a
 * single JSON document, and every write serialises the whole thing. Once that
 * document exceeds what the proxy in front of the Taskade API accepts, every write
 * fails with 413 Content Too Large — even when the actual change is one number.
 * Retrying cannot help, which is what produced the request storm.
 *
 * This module decides what actually goes on the wire:
 *   1. nothing is changed while the payload fits;
 *   2. otherwise long arrays are trimmed (history / rollup arrays are the usual
 *      reason a document grows without bound) — the NEWEST entries are kept;
 *   3. if that is still too large, the largest entries are deferred to local-only,
 *      and reported back so the caller can surface/act on it.
 *
 * PURITY: no I/O, no clock, no randomness — so it is unit-testable and the same
 * input always yields the same wire payload.
 *
 * SAFETY: it only engages when the caller supplies a finite limit. The provider
 * supplies the size the SERVER itself rejected, so a healthy account is never
 * modified, and a first-ever 413 causes one failed write followed by a self-healing
 * retry — no manual intervention, no silent data loss beyond trimming.
 */

export interface SyncPayloadOptions {
  /** Hard limit in characters. `Infinity` = never trim (the healthy-account default). */
  limitChars: number;
  /** Longest array kept inside any entity. Defaults to 100. */
  maxArrayItems?: number;
  /** objectType prefixes that must never be evicted, only trimmed (e.g. auth_profile). */
  criticalPrefixes?: readonly string[];
}

export interface SyncPayloadResult<T> {
  /** The object that goes on the wire. */
  payload: Record<string, T>;
  /** Serialized size of `payload`, in characters. */
  chars: number;
  /** How many arrays were shortened. */
  trimmedArrays: number;
  /** Keys dropped from the remote payload (they remain in the local cache). */
  deferred: string[];
  /** True when the result is within the limit. */
  fits: boolean;
}

const DEFAULT_MAX_ARRAY_ITEMS = 100;

/** JSON length in characters — the unit the proxy limit is expressed in. */
export function payloadSize(value: unknown): number {
  try {
    const json = JSON.stringify(value);
    return typeof json === 'string' ? json.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Shorten every array inside `value` to `maxItems`, keeping the most RECENT entries
 * (trailing slice) — history arrays are appended, so the tail is the live end.
 */
function trimArrays(value: unknown, maxItems: number, counter: { count: number }): unknown {
  if (Array.isArray(value)) {
    const next = value.length > maxItems ? value.slice(-maxItems) : value;
    if (value.length > maxItems) counter.count += 1;
    return next.map(item => trimArrays(item, maxItems, counter));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = trimArrays(inner, maxItems, counter);
    }
    return out;
  }
  return value;
}

/**
 * Build the payload for one node write.
 *
 * `data` is the whole document (keys look like `${objectType}_${key}`), exactly the
 * shape TaskadeCloudProvider.parseData() produces.
 */
export function buildSyncPayload<T>(
  data: Record<string, T>,
  options: SyncPayloadOptions,
): SyncPayloadResult<T> {
  const limit = options.limitChars;
  const maxArrayItems = options.maxArrayItems ?? DEFAULT_MAX_ARRAY_ITEMS;
  const original = payloadSize(data);

  // Healthy path: no finite limit known, or the document already fits. Untouched.
  if (!Number.isFinite(limit) || original <= limit) {
    return { payload: data, chars: original, trimmedArrays: 0, deferred: [], fits: true };
  }

  // 1. Trim long arrays.
  const counter = { count: 0 };
  const trimmed: Record<string, T> = {};
  for (const [key, value] of Object.entries(data)) {
    trimmed[key] = trimArrays(value, maxArrayItems, counter) as T;
  }
  let chars = payloadSize(trimmed);
  if (chars <= limit) {
    return { payload: trimmed, chars, trimmedArrays: counter.count, deferred: [], fits: true };
  }

  // 2. Still too large: defer the biggest entries, largest first, never the critical
  //    ones (a missing auth_profile would break the next sign-in, whereas a missing
  //    chat history is a cache miss).
  const criticalPrefixes = options.criticalPrefixes ?? [];
  const isCritical = (key: string) => criticalPrefixes.some(prefix => key.startsWith(prefix));

  const evictionOrder = Object.entries(trimmed)
    .filter(([key]) => !isCritical(key))
    .map(([key, value]) => [key, payloadSize(value)] as const)
    .sort((a, b) => b[1] - a[1]);

  const payload: Record<string, T> = { ...trimmed };
  const deferred: string[] = [];
  for (const [key, size] of evictionOrder) {
    if (chars <= limit) break;
    delete payload[key];
    deferred.push(key);
    chars -= size;
  }

  return { payload, chars, trimmedArrays: counter.count, deferred, fits: chars <= limit };
}

/** Compact, loggable summary — used for the single structured warning per account. */
export function describeBudget(result: SyncPayloadResult<unknown>): string {
  return [
    `chars=${result.chars}`,
    result.trimmedArrays > 0 ? `trimmedArrays=${result.trimmedArrays}` : null,
    result.deferred.length > 0 ? `deferred=${result.deferred.length}` : null,
    result.fits ? 'fits=true' : 'fits=false',
  ].filter(Boolean).join(' ');
}
