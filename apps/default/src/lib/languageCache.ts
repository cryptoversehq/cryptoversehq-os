/** languageCache.ts - Smart Response Cache with LRU eviction, TTL, stats. */
type CacheEntry = { query: string; response: string; language: string; timestamp: number; ttl: number; accessCount: number; lastAccessed: number; };
export type CacheStats = { totalEntries: number; activeEntries: number; hitRate: number; totalHits: number; totalMisses: number; memoryUsage: number; };

export class LanguageCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize = 10000;
  private defaultTTL = 86400000;
  private hits = 0;
  private misses = 0;

  get(query: string, language: string): string | null {
    const key = language + ':' + query.toLowerCase().trim().replace(/\s+/g, ' ');
    const e = this.cache.get(key);
    if (!e) { this.misses++; return null; }
    if (Date.now() - e.timestamp > e.ttl) { this.cache.delete(key); this.misses++; return null; }
    e.accessCount++; e.lastAccessed = Date.now(); this.cache.set(key, e); this.hits++;
    return e.response;
  }

  set(query: string, response: string, language: string, ttl?: number): void {
    if (this.cache.size >= this.maxSize) this.evictLRU();
    const key = language + ':' + query.toLowerCase().trim().replace(/\s+/g, ' ');
    this.cache.set(key, { query, response, language, timestamp: Date.now(), ttl: ttl || this.defaultTTL, accessCount: 0, lastAccessed: Date.now() });
  }

  private evictLRU(): void {
    let oldKey = ''; let oldTime = Infinity;
    for (const [k, e] of this.cache) { if (e.lastAccessed < oldTime) { oldTime = e.lastAccessed; oldKey = k; } }
    if (oldKey) this.cache.delete(oldKey);
  }

  evictExpired(): number { const now = Date.now(); let c = 0; for (const [k, e] of this.cache) { if (now - e.timestamp > e.ttl) { this.cache.delete(k); c++; } } return c; }

  getStats(): CacheStats { const total = this.hits + this.misses; return { totalEntries: this.cache.size, activeEntries: this.cache.size, hitRate: total > 0 ? (this.hits / total) * 100 : 0, totalHits: this.hits, totalMisses: this.misses, memoryUsage: this.estMem() }; }

  private estMem(): number { let t = 0; for (const [k, e] of this.cache) { t += k.length * 2 + e.query.length * 2 + e.response.length * 2 + 50; } return t; }

  clear(): void { this.cache.clear(); this.hits = 0; this.misses = 0; }

  getPopular(limit = 10): Array<{ query: string; lang: string; count: number }> {
    return [...this.cache.values()].sort((a, b) => b.accessCount - a.accessCount).slice(0, limit).map(e => ({ query: e.query, lang: e.language, count: e.accessCount }));
  }

  warm(entries: Array<{ query: string; response: string; language: string }>): void { for (const e of entries) this.set(e.query, e.response, e.language); }
}

export const languageCache = new LanguageCache();