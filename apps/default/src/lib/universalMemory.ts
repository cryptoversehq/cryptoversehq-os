/**
 * universalMemory.ts - Lynx AI Universal Memory System (Sprint 5.1)
 * ONLY long-term memory. All AI engines use this. Survives refresh, logout, device.
 * Priority 4. Depends on contextEngine + memoryEngine.
 */

import type { OrchestratorContext, EngineContract } from './lynxOrchestrator';
import { cloudRecordStore } from './cloudData';

export type MemoryLevel = 'short' | 'medium' | 'long' | 'permanent' | 'archived';
export type MemoryCategory = 'user_profile' | 'preferences' | 'goals' | 'missions' | 'trading' | 'learning' | 'coins' | 'indicators' | 'academy' | 'coach' | 'risk' | 'weaknesses' | 'strengths' | 'emotional' | 'behavior' | 'portfolio' | 'conversation' | 'daily_summary' | 'weekly_summary' | 'monthly_summary' | 'milestones' | 'achievements' | 'mistakes' | 'repeated_mistakes' | 'repeated_successes' | 'coaching' | 'predictions' | 'business' | 'admin' | 'commands' | 'security' | 'rewards' | 'tournament' | 'career' | 'arena' | 'marketplace' | 'wallet' | 'subscription' | 'country' | 'device' | 'session' | 'context' | 'permanent' | 'custom';

export interface MemoryEntry {
  id: string; userId: string; category: MemoryCategory; level: MemoryLevel;
  importance: number; confidence: number; tags: string[]; content: any; summary: string;
  createdAt: number; lastAccessed: number; expiresAt: number | null;
  pinned: boolean; parentId: string | null; relatedIds: string[]; version: number; encrypted: boolean;
}

export interface MemorySearchResult {
  entry: MemoryEntry; relevanceScore: number; matchedTags: string[];
}

export interface MemorySnapshot {
  userId: string; entries: MemoryEntry[]; exportTimestamp: number; version: string;
}

const NEVER_FORGET: RegExp[] = [/achievement/, /milestone/, /permanent/, /goal_.*complete/];
const EXPIRY: Record<MemoryLevel, number | null> = { short: 7 * 86400000, medium: 30 * 86400000, long: 365 * 86400000, permanent: null, archived: null };

class UniversalMemory {
  private memory: Map<string, MemoryEntry[]> = new Map();
  private registered = false;
  constructor() { this.autoLoad(); }

  private remember(userId: string, category: MemoryCategory, content: any, opts?: { level?: MemoryLevel; importance?: number; confidence?: number; tags?: string[]; pinned?: boolean; parentId?: string | null; relatedIds?: string[]; }): MemoryEntry {
    const entries = this.getEntries(userId);
    const dup = entries.find(e => e.category === category && JSON.stringify(e.content) === JSON.stringify(content));
    if (dup) { dup.lastAccessed = Date.now(); dup.importance = Math.max(dup.importance, opts?.importance || 50); this.save(userId); return dup; }
    const level = opts?.level || this.inferLevel(category);
    const entry: MemoryEntry = {
      id: 'm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      userId, category, level, importance: opts?.importance || 50, confidence: opts?.confidence || 80,
      tags: opts?.tags || [], content, summary: this.summarizeContent(content),
      createdAt: Date.now(), lastAccessed: Date.now(),
      expiresAt: EXPIRY[level] ? Date.now() + EXPIRY[level]! : null,
      pinned: opts?.pinned || false, parentId: opts?.parentId || null,
      relatedIds: opts?.relatedIds || [], version: 1, encrypted: false,
    };
    entries.push(entry);
    if (entries.length > 100) this.compress(userId);
    this.save(userId);
    return entry;
  }

  private forget(userId: string, idOrCat: string): boolean {
    const entries = this.getEntries(userId);
    const idx = entries.findIndex(e => e.id === idOrCat || e.category === idOrCat);
    if (idx >= 0) { entries.splice(idx, 1); this.save(userId); return true; }
    return false;
  }

  private archive(userId: string, id: string): MemoryEntry | null {
    const e = this.getEntries(userId).find(e => e.id === id);
    if (e) { e.level = 'archived'; e.expiresAt = null; e.pinned = true; this.save(userId); }
    return e || null;
  }

  private restore(userId: string, id: string): MemoryEntry | null {
    const e = this.getEntries(userId).find(e => e.id === id && e.level === 'archived');
    if (e) { e.level = 'long'; e.expiresAt = Date.now() + (EXPIRY.long as number); e.pinned = false; this.save(userId); }
    return e || null;
  }

  private search(userId: string, query: string, filters?: { category?: MemoryCategory; level?: MemoryLevel; tags?: string[]; minImportance?: number }): MemorySearchResult[] {
    const entries = this.getEntries(userId);
    const lower = query.toLowerCase();
    const results: MemorySearchResult[] = [];
    for (const e of entries) {
      if (filters?.category && e.category !== filters.category) continue;
      if (filters?.level && e.level !== filters.level) continue;
      if (filters?.tags && !filters.tags.some(t => e.tags.includes(t))) continue;
      if (filters?.minImportance && e.importance < filters.minImportance) continue;
      let score = 0;
      const matchedTags: string[] = [];
      if (e.summary.toLowerCase().includes(lower)) score += 40;
      const cs = typeof e.content === 'string' ? e.content : JSON.stringify(e.content);
      if (cs.toLowerCase().includes(lower)) score += 30;
      for (const t of e.tags) { if (t.toLowerCase().includes(lower)) { score += 20; matchedTags.push(t); } }
      if (e.category.toLowerCase().includes(lower)) score += 10;
      score += e.importance * 0.2;
      if (e.pinned) score += 15;
      if (score > 0) results.push({ entry: e, relevanceScore: Math.min(100, Math.round(score)), matchedTags });
    }
    return results.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 50);
  }

  private summarize(userId: string, category?: MemoryCategory): string {
    const entries = category ? this.getEntries(userId).filter(e => e.category === category) : this.getEntries(userId);
    if (entries.length === 0) return 'No memories.';
    const cats = new Set(entries.map(e => e.category)).size;
    const pinned = entries.filter(e => e.pinned).length;
    const avg = Math.round(entries.reduce((s, e) => s + e.importance, 0) / entries.length);
    const oldest = entries.reduce((min, e) => Math.min(min, e.createdAt), Infinity);
    const days = Math.ceil((Date.now() - oldest) / 86400000);
    return 'Summary: ' + entries.length + ' entries in ' + cats + ' categories. Pinned: ' + pinned + '. Avg importance: ' + avg + '. Spanning ' + days + ' days.';
  }

  private compress(userId: string): number {
    const entries = this.getEntries(userId);
    let removed = 0;
    const now = Date.now();
    const filtered = entries.filter(e => {
      if (e.expiresAt && e.expiresAt < now && !e.pinned && !NEVER_FORGET.some(p => p.test(e.category + '_' + e.summary))) { removed++; return false; }
      return true;
    });
    const seen: Map<string, MemoryEntry[]> = new Map();
    for (const e of filtered) {
      const k = e.category + '_' + e.summary.substring(0, 50);
      if (!seen.has(k)) seen.set(k, []);
      seen.get(k)!.push(e);
    }
    const merged: MemoryEntry[] = [];
    for (const [, group] of seen) {
      if (group.length > 1) {
        const best = group.reduce((a, b) => a.importance >= b.importance ? a : b);
        best.relatedIds = [...new Set([...best.relatedIds, ...group.flatMap(e => [e.id])])];
        merged.push(best);
        removed += group.length - 1;
      } else merged.push(group[0]);
    }
    this.memory.set(userId, merged);
    this.save(userId);
    return removed;
  }

  private merge(userId: string, id1: string, id2: string): MemoryEntry | null {
    const entries = this.getEntries(userId);
    const e1 = entries.find(e => e.id === id1);
    const e2 = entries.find(e => e.id === id2);
    if (!e1 || !e2) return null;
    e1.importance = Math.max(e1.importance, e2.importance);
    e1.confidence = Math.max(e1.confidence, e2.confidence);
    e1.tags = [...new Set([...e1.tags, ...e2.tags])];
    e1.relatedIds = [...new Set([...e1.relatedIds, ...e2.relatedIds, e2.id])];
    e1.version++;
    e1.lastAccessed = Date.now();
    entries.splice(entries.indexOf(e2), 1);
    this.save(userId);
    return e1;
  }

  private pin(userId: string, id: string): MemoryEntry | null {
    const e = this.getEntries(userId).find(e => e.id === id);
    if (e) { e.pinned = true; this.save(userId); }
    return e || null;
  }

  private exportMemory(userId: string): MemorySnapshot {
    return { userId, entries: this.getEntries(userId), exportTimestamp: Date.now(), version: '1.0' };
  }

  private importMemory(snapshot: MemorySnapshot): number {
    const existing = this.getEntries(snapshot.userId);
    let count = 0;
    for (const incoming of snapshot.entries) {
      const dup = existing.find(e => e.category === incoming.category && JSON.stringify(e.content) === JSON.stringify(incoming.content));
      if (!dup) { incoming.userId = snapshot.userId; existing.push(incoming); count++; }
    }
    this.save(snapshot.userId);
    return count;
  }

  private restoreSnapshot(snapshot: MemorySnapshot): void {
    this.memory.set(snapshot.userId, snapshot.entries);
    this.save(snapshot.userId);
  }

  private async hydrateUser(userId: string): Promise<void> {
    // cloudRecordStore.get() is synchronous, but we want to ensure cloud data is loaded
    const entries = cloudRecordStore.get<MemoryEntry[]>('universal_memory', userId, []);
    this.memory.set(userId, entries);
  }

  // Orchestrator
  private async execute(context: OrchestratorContext): Promise<void> {
    const userId = context.userId || 'anonymous';
    if (context.snapshot && Object.keys(context.snapshot).length > 0) {
      this.remember(userId, 'context', context.snapshot, { level: 'short', importance: 30, tags: ['auto'] });
    }
    if (Math.random() < 0.01) this.compress(userId);
  }

  /**
   * Single operation boundary used by memoryAccessGateway after authorization.
   * The store implementations remain private so callers cannot select an
   * operation without crossing the gateway first.
   */
  executeOperation(
    userId: string,
    operation: 'remember' | 'search' | 'forget' | 'import' | 'restore' | 'archive' | 'restoreEntry' | 'summarize' | 'export' | 'merge' | 'pin' | 'compress',
    payload: any,
  ): any {
    switch (operation) {
      case 'remember':
        return this.remember(userId, payload.category, payload.content, payload.opts);
      case 'search':
        return this.search(userId, payload.query, payload.filters);
      case 'forget':
        return this.forget(userId, payload.idOrCategory);
      case 'import':
        return this.importMemory(payload.snapshot);
      case 'restore':
        this.restoreSnapshot(payload.snapshot);
        return true;
      case 'archive':
        return this.archive(userId, payload.id);
      case 'restoreEntry':
        return this.restore(userId, payload.id);
      case 'summarize':
        return this.summarize(userId, payload.category);
      case 'export':
        return this.exportMemory(userId);
      case 'merge':
        return this.merge(userId, payload.id1, payload.id2);
      case 'pin':
        return this.pin(userId, payload.id);
      case 'compress':
        return this.compress(userId);
      default:
        throw new Error('Unsupported memory operation');
    }
  }

  getOrchestratorContract(): EngineContract {
    return {
      name: 'universalMemory', priority: 4, dependencies: ['contextEngine', 'memoryEngine'],
      initialize: async () => { this.registered = true; },
      execute: (ctx) => this.execute(ctx),
      shutdown: async () => { this.registered = false; },
      health: () => ({ status: this.registered ? 'healthy' : 'degraded', lastRun: null, lastDuration: 0, errorCount: 0, totalRuns: 0, avgDuration: 0 }),
    };
  }

  // Private
  private getEntries(userId: string): MemoryEntry[] {
    if (!this.memory.has(userId)) this.memory.set(userId, this.load(userId) || []);
    return this.memory.get(userId)!;
  }

  private inferLevel(cat: MemoryCategory): MemoryLevel {
    if (cat === 'permanent' || cat === 'achievements' || cat === 'milestones') return 'permanent';
    if (cat === 'context' || cat === 'session') return 'short';
    if (cat === 'emotional' || cat === 'behavior' || cat === 'coaching') return 'medium';
    return 'long';
  }

  private summarizeContent(c: any): string {
    if (typeof c === 'string') return c.substring(0, 200);
    if (typeof c === 'object' && c !== null) { try { const s = JSON.stringify(c); return s.length > 200 ? s.substring(0, 197) + '...' : s; } catch { return '[Object]'; } }
    return String(c).substring(0, 200);
  }

  private save(userId: string): void {
    const entries = this.memory.get(userId);
    if (entries) {
      // Canonical private-memory backend is cloudRecordStore ONLY.
      // No localStorage fallback: private memory must never persist to anonymous/local storage.
      Promise.resolve(cloudRecordStore.set('universal_memory', userId, entries)).catch(() => {});
    }
  }

  private load(userId: string): MemoryEntry[] | null {
    // Canonical private-memory backend is cloudRecordStore ONLY.
    // No localStorage fallback: private memory must never be read from anonymous/local storage.
    const cloudData = cloudRecordStore.get<MemoryEntry[]>('universal_memory', userId, []);
    if (cloudData && cloudData.length > 0) {
      return cloudData;
    }
    return null;
  }

  /**
   * Auto-load is handled lazily via getEntries() -> load().
   * No need for eager loading — memory is hydrated on first access per user.
   */
  private autoLoad(): void {}
}

export const universalMemory = new UniversalMemory();
