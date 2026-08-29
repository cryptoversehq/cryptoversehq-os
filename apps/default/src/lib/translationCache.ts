interface CacheEntry {
text: string;
timestamp: number;
}

class TranslationCache {
private cache: Map<string, CacheEntry> = new Map();
private storageKey = 'crypto_translations';
private maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

constructor() {
this.loadFromStorage();
}

getKey(text: string, language: string): string {
return `${language}:${text}`;
}

get(text: string, language: string): string | null {
const key = this.getKey(text, language);
const entry = this.cache.get(key);

if (!entry) return null;
if (Date.now() - entry.timestamp > this.maxAge) {
this.cache.delete(key);
this.saveToStorage();
return null;
}

return entry.text;
}

set(text: string, language: string, translation: string): void {
const key = this.getKey(text, language);
this.cache.set(key, { text: translation, timestamp: Date.now() });
this.saveToStorage();
}

private loadFromStorage(): void {
try {
const data = localStorage.getItem(this.storageKey);
if (data) {
const parsed = JSON.parse(data);
Object.entries(parsed).forEach(([key, value]) => {
this.cache.set(key, value as CacheEntry);
});
}
} catch (e) {
console.warn('Failed to load translation cache:', e);
}
}

private saveToStorage(): void {
try {
const data = Object.fromEntries(this.cache);
localStorage.setItem(this.storageKey, JSON.stringify(data));
} catch (e) {
console.warn('Failed to save translation cache:', e);
}
}

clear(): void {
this.cache.clear();
localStorage.removeItem(this.storageKey);
}

size(): number {
return this.cache.size;
}
}

export const translationCache = new TranslationCache();
