// ─── Google Cloud Translation Service ─────────────────────────────────────────
// Architecture:
//  1. API key stored in env variable (VITE_GOOGLE_TRANSLATE_API_KEY)
//  2. Two-layer cache: memory (Map) + localStorage persistence
//  3. Batch translation for efficiency (up to 128 strings per request)
//  4. Automatic fallback to English if API fails
//  5. needsReview flag for strings that used AI translation
//  6. Supports all 30+ LangCode values

import { LangCode, TKey } from './i18n';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface TranslationRecord {
  key: string;
  en: string;
  translations: Partial<Record<LangCode, string>>;
  updatedAt: number;
  needsReview: boolean;
  source: 'static' | 'google' | 'manual';
}

export interface TranslationCacheEntry {
  text: string;
  source: 'static' | 'google' | 'manual';
  cachedAt: number;
  needsReview: boolean;
}

export interface GoogleTranslateResponse {
  data: {
    translations: Array<{
      translatedText: string;
      detectedSourceLanguage?: string;
    }>;
  };
}

export interface TranslationStats {
  totalCached: number;
  googleApiCalls: number;
  fallbacks: number;
  cacheHitRate: number;
  lastApiCall: number | null;
  apiConfigured: boolean;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const CACHE_VERSION = 'v1';
const CACHE_PREFIX = `cryptoverse_trans_${CACHE_VERSION}_`;
const STATS_KEY = 'cryptoverse_trans_stats';
const BATCH_SIZE = 100; // Google Translate API max
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Google Translate language code mapping (some differ from our LangCode)
const LANG_CODE_MAP: Partial<Record<LangCode, string>> = {
  zh: 'zh-CN',
  // all others match directly
};

// ─── In-Memory Cache ────────────────────────────────────────────────────────────

// Structure: cache.get(`${langCode}:${key}`) → TranslationCacheEntry
const memoryCache = new Map<string, TranslationCacheEntry>();

// ─── Stats Tracking ────────────────────────────────────────────────────────────

let stats: TranslationStats = (() => {
  try {
    const saved = localStorage.getItem(STATS_KEY);
    return saved ? JSON.parse(saved) : {
      totalCached: 0,
      googleApiCalls: 0,
      fallbacks: 0,
      cacheHitRate: 0,
      lastApiCall: null,
      apiConfigured: false,
    };
  } catch {
    return {
      totalCached: 0,
      googleApiCalls: 0,
      fallbacks: 0,
      cacheHitRate: 0,
      lastApiCall: null,
      apiConfigured: false,
    };
  }
})();

function saveStats() {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    // storage full, ignore
  }
}

// ─── API Key Management ────────────────────────────────────────────────────────

function getApiKey(): string | null {
  // 1. Vite env variable (set in .env as VITE_GOOGLE_TRANSLATE_API_KEY)
  const envKey = import.meta.env.VITE_GOOGLE_TRANSLATE_API_KEY;
  if (envKey && envKey !== 'undefined') return envKey;

  // 2. Runtime override (set via TranslationAdmin panel)
  const runtimeKey = localStorage.getItem('cryptoverse_translate_api_key') || localStorage.getItem('cryptoplay_translate_api_key');
  if (runtimeKey) return runtimeKey;

  return null;
}

export function setApiKey(key: string) {
  localStorage.setItem('cryptoverse_translate_api_key', key);
  stats.apiConfigured = true;
  saveStats();
}

export function clearApiKey() {
  localStorage.removeItem('cryptoverse_translate_api_key');
  localStorage.removeItem('cryptoplay_translate_api_key');
  stats.apiConfigured = false;
  saveStats();
}

export function isApiConfigured(): boolean {
  return !!getApiKey();
}

// ─── Cache Helpers ─────────────────────────────────────────────────────────────

function cacheKey(lang: LangCode, key: string): string {
  return `${lang}:${key}`;
}

function storageKey(lang: LangCode, key: string): string {
  return `${CACHE_PREFIX}${lang}_${key.replace(/\./g, '_')}`;
}

function loadFromStorage(lang: LangCode, key: string): TranslationCacheEntry | null {
  try {
    const raw = localStorage.getItem(storageKey(lang, key));
    if (!raw) return null;
    const entry: TranslationCacheEntry = JSON.parse(raw);
    // Check TTL
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
      localStorage.removeItem(storageKey(lang, key));
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

function saveToStorage(lang: LangCode, key: string, entry: TranslationCacheEntry) {
  try {
    localStorage.setItem(storageKey(lang, key), JSON.stringify(entry));
  } catch {
    // localStorage full - clear old entries
    clearOldCacheEntries();
  }
}

function clearOldCacheEntries() {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(CACHE_PREFIX)) {
      keysToRemove.push(k);
    }
  }
  // Remove oldest half
  keysToRemove.slice(0, Math.floor(keysToRemove.length / 2)).forEach(k => {
    localStorage.removeItem(k);
  });
}

export function getFromCache(lang: LangCode, key: string): TranslationCacheEntry | null {
  // 1. Memory cache (fastest)
  const memKey = cacheKey(lang, key);
  const memEntry = memoryCache.get(memKey);
  if (memEntry) return memEntry;

  // 2. LocalStorage cache
  const storedEntry = loadFromStorage(lang, key);
  if (storedEntry) {
    memoryCache.set(memKey, storedEntry); // promote to memory
    return storedEntry;
  }

  return null;
}

export function setInCache(
  lang: LangCode,
  key: string,
  text: string,
  source: TranslationCacheEntry['source'],
  needsReview = false,
) {
  const entry: TranslationCacheEntry = {
    text,
    source,
    cachedAt: Date.now(),
    needsReview,
  };
  memoryCache.set(cacheKey(lang, key), entry);
  saveToStorage(lang, key, entry);
  stats.totalCached = memoryCache.size;
}

// ─── Manual Override ────────────────────────────────────────────────────────────

export function setManualTranslation(lang: LangCode, key: string, text: string) {
  setInCache(lang, key, text, 'manual', false);
}

// ─── Google Translate API ──────────────────────────────────────────────────────

function googleLangCode(lang: LangCode): string {
  return LANG_CODE_MAP[lang] ?? lang;
}

// Last known error for UI display
let lastError: string | null = null;
export function getLastError(): string | null { return lastError; }
export function clearLastError() { lastError = null; }

async function fetchFromGoogle(
  texts: string[],
  targetLang: LangCode,
): Promise<string[] | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  // Use GET with URLSearchParams — avoids CORS preflight that blocks POST JSON
  // Google Translate v2 fully supports GET requests
  const base = 'https://translation.googleapis.com/language/translate/v2';
  const params = new URLSearchParams({
    key: apiKey,
    source: 'en',
    target: googleLangCode(targetLang),
    format: 'text',
  });
  // Append each text as a separate 'q' param (GET multi-value)
  texts.forEach(t => params.append('q', t));

  try {
    lastError = null;
    const response = await fetch(`${base}?${params.toString()}`, {
      method: 'GET',
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      let friendly = `Google API error ${response.status}`;
      try {
        const parsed = JSON.parse(errBody);
        friendly = parsed?.error?.message ?? friendly;
      } catch { /* ignore */ }
      lastError = friendly;
      console.warn(`[TranslationService] ${friendly}`);
      return null;
    }

    const data: GoogleTranslateResponse = await response.json();
    stats.googleApiCalls++;
    stats.lastApiCall = Date.now();
    stats.apiConfigured = true;
    saveStats();

    return data.data.translations.map(t => t.translatedText);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    lastError = msg.includes('Failed to fetch')
      ? 'Network error — check your API key and internet connection'
      : msg;
    console.warn('[TranslationService] Fetch error:', lastError);
    return null;
  }
}

/**
 * Test whether the configured API key is valid by translating a single word.
 * Returns { ok, error } — use in the admin panel for live validation.
 */
export async function testApiKey(key: string): Promise<{ ok: boolean; error?: string }> {
  const base = 'https://translation.googleapis.com/language/translate/v2';
  const params = new URLSearchParams({ key, source: 'en', target: 'es', format: 'text', q: 'hello' });
  try {
    const res = await fetch(`${base}?${params.toString()}`);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      let msg = `Error ${res.status}`;
      try { msg = JSON.parse(body)?.error?.message ?? msg; } catch { /* ignore */ }
      return { ok: false, error: msg };
    }
    await res.json(); // confirm parseable
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}

// ─── Core Translation Function ─────────────────────────────────────────────────

/**
 * Translate a single key-value pair.
 * Returns cached result immediately if available, otherwise calls Google API.
 */
export async function translateOne(
  key: TKey | string,
  englishText: string,
  targetLang: LangCode,
): Promise<string> {
  if (targetLang === 'en') return englishText;

  // Check cache first
  const cached = getFromCache(targetLang, key);
  if (cached) return cached.text;

  // Try Google Translate
  const results = await fetchFromGoogle([englishText], targetLang);
  if (results && results[0]) {
    const translated = results[0];
    setInCache(targetLang, key, translated, 'google', true);
    return translated;
  }

  // Fallback: return English
  stats.fallbacks++;
  saveStats();
  return englishText;
}

/**
 * Batch translate multiple key-value pairs.
 * Splits into chunks of BATCH_SIZE for efficiency.
 */
export async function translateBatch(
  entries: Array<{ key: string; en: string }>,
  targetLang: LangCode,
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const toFetch: Array<{ key: string; en: string }> = [];

  // Separate cached from uncached
  for (const entry of entries) {
    if (targetLang === 'en') {
      results.set(entry.key, entry.en);
      continue;
    }
    const cached = getFromCache(targetLang, entry.key);
    if (cached) {
      results.set(entry.key, cached.text);
    } else {
      toFetch.push(entry);
    }
  }

  if (toFetch.length === 0) {
    onProgress?.(entries.length, entries.length);
    return results;
  }

  // Batch API calls
  let done = results.size;
  for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
    const chunk = toFetch.slice(i, i + BATCH_SIZE);
    const texts = chunk.map(e => e.en);
    const translated = await fetchFromGoogle(texts, targetLang);

    chunk.forEach((entry, idx) => {
      const text = translated?.[idx] ?? entry.en;
      const source = translated ? 'google' : 'static';
      setInCache(targetLang, entry.key, text, source as TranslationCacheEntry['source'], !!translated);
      results.set(entry.key, text);
    });

    done += chunk.length;
    onProgress?.(done, entries.length);
  }

  return results;
}

// ─── Cache Management ──────────────────────────────────────────────────────────

export function clearCache(lang?: LangCode) {
  if (lang) {
    // Clear specific language
    const prefix = `${lang}:`;
    for (const key of memoryCache.keys()) {
      if (key.startsWith(prefix)) memoryCache.delete(key);
    }
    // Clear localStorage for that lang
    const storagePrefix = `${CACHE_PREFIX}${lang}_`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(storagePrefix)) localStorage.removeItem(k);
    }
  } else {
    // Clear all
    memoryCache.clear();
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) localStorage.removeItem(k);
    }
  }
  stats.totalCached = memoryCache.size;
  saveStats();
}

export function getCacheEntries(lang: LangCode): Array<{ key: string; entry: TranslationCacheEntry }> {
  const prefix = `${lang}:`;
  const entries: Array<{ key: string; entry: TranslationCacheEntry }> = [];
  for (const [k, v] of memoryCache.entries()) {
    if (k.startsWith(prefix)) {
      entries.push({ key: k.slice(prefix.length), entry: v });
    }
  }
  return entries;
}

export function getTranslationStats(): TranslationStats {
  const totalRequests = stats.googleApiCalls + stats.fallbacks;
  return {
    ...stats,
    apiConfigured: isApiConfigured(),
    cacheHitRate: totalRequests > 0
      ? Math.round(((totalRequests - stats.fallbacks) / totalRequests) * 100)
      : 0,
    totalCached: memoryCache.size,
  };
}

// ─── Export DB Schema (for reference) ─────────────────────────────────────────
// The full TranslationRecord schema describes how translations would be persisted
// in a production database (Firestore, PostgreSQL, etc.)
//
// {
//   key: "nav.trade",
//   en: "Trading Simulator",
//   translations: {
//     fa: "شبیه‌ساز معاملات",
//     ar: "محاكي التداول",
//     es: "Simulador de Trading",
//     zh: "交易模拟器",
//     ... 40+ languages
//   },
//   updatedAt: 1700000000000,
//   needsReview: false,      // true = auto-translated, needs human check
//   source: "google"         // "static" | "google" | "manual"
// }
