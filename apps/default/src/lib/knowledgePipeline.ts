/**
 * knowledgePipeline.ts — Canonical Knowledge Pipeline for Lynx AI responses.
 *
 * The SINGLE canonical knowledge-access boundary. Do not create a second pipeline.
 *
 * Production path:
 *   User Query → lynxResponder → knowledgePipeline → real production data sources
 *   → knowledge provenance → verified knowledge fragments → Lynx response
 *
 * Responsibilities:
 *   - Mediate ALL knowledge-dependent data access (no direct realDataConnector /
 *     getCurrentPrice calls in the responder).
 *   - Preserve user scoping to the authenticated identity.
 *   - Attach truthful provenance (knowledgeProvenance).
 *   - Fail honestly: return null / UNAVAILABLE — never fabricate values or
 *     inject hardcoded fallback prices.
 *
 * Sources used (real, existing production modules):
 *   - realDataConnector (bridge to Zustand stores) for personal & system data
 *   - globalPriceEngine.getCurrentPrice for live market prices
 */

import { realDataConnector } from './realDataConnector';
import { getCurrentPrice } from './globalPriceEngine';
import { identityEngine } from './identityEngine';
import { useMonetizationStore } from './monetizationStore';
import { buildProvenance, type KnowledgeAuthority, type KnowledgeProvenance } from './knowledgeProvenance';

export interface KnowledgeFragment<T = any> {
  capability: string;
  data: T | null;
  provenance: KnowledgeProvenance;
  available: boolean;
}

function fragment(
  capability: string,
  data: any,
  source: string,
  sourceType: 'real_store' | 'live_api' | 'simulated' | 'derived' | 'unavailable',
  sourceModule: string,
  subjectScope: string | null,
  authority: KnowledgeAuthority,
): KnowledgeFragment {
  const ts = Date.now();
  return {
    capability,
    data: data ?? null,
    provenance: buildProvenance({ source, sourceType, sourceModule, capability, subjectScope, timestamp: ts, authority }),
    available: data !== null && authority !== 'unavailable',
  };
}

class KnowledgePipeline {
  /** User-scoped personal knowledge. Always scoped to the authenticated user. */
  getPersonalKnowledge(userId: string): any | null {
    const identity = identityEngine.getIdentity(userId);
    if (!identity) return null; // no authenticated subject → unavailable
    try {
      const data = realDataConnector.getUserPersonalData(userId);
      return data ?? null;
    } catch {
      return null;
    }
  }

  /** System / app aggregate knowledge (admin telemetry). */
  getSystemKnowledge(): any | null {
    try {
      return realDataConnector.getAppData() ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Live market price. Returns the real price or null when unavailable.
   * NO hardcoded fallback values — a missing live price is reported as
   * unavailable, never fabricated.
   */
  getMarketPrice(coinId: string): number | null {
    try {
      const p = getCurrentPrice(coinId);
      return typeof p?.price === 'number' ? p.price : null;
    } catch {
      return null;
    }
  }

  /**
   * Platform revenue knowledge. Mediated access to the monetization store.
   * NOTE: monetizationStore is seeded with demo/simulated revenue entries, so the
   * aggregate is NOT authoritative production business truth — it is classified
   * SYNTHETIC. Permission is enforced via identityEngine (admin roles only);
   * non-admins receive no value (UNAVAILABLE — never leaked).
   */
  getRevenueKnowledge(userId: string): KnowledgeFragment {
    const identity = identityEngine.getIdentity(userId);
    const isAdmin = !!identity && ['admin', 'senior_admin', 'super_admin', 'founder'].includes(identity.level);
    if (!isAdmin) {
      return fragment('revenue', null, 'useMonetizationStore', 'simulated', 'monetizationStore', userId, 'unavailable');
    }
    try {
      const total = useMonetizationStore.getState().getTotalRevenueCP(30);
      return fragment('revenue', total, 'useMonetizationStore', 'simulated', 'monetizationStore', userId, 'synthetic');
    } catch {
      return fragment('revenue', null, 'useMonetizationStore', 'simulated', 'monetizationStore', userId, 'unavailable');
    }
  }

  /** Generic verified-knowledge accessor with provenance. */
  getKnowledge(domain: 'personal' | 'system' | 'market' | 'revenue', opts: { userId?: string; coinId?: string } = {}): KnowledgeFragment {
    if (domain === 'personal') {
      const userId = opts.userId || '';
      const data = userId ? this.getPersonalKnowledge(userId) : null;
      return fragment('personal', data, 'realDataConnector', 'real_store', 'realDataConnector', userId || null, data ? 'authoritative' : 'unavailable');
    }
    if (domain === 'system') {
      const data = this.getSystemKnowledge();
      return fragment('system', data, 'realDataConnector', 'real_store', 'realDataConnector', null, data ? 'authoritative' : 'unavailable');
    }
    if (domain === 'revenue') {
      return this.getRevenueKnowledge(opts.userId || '');
    }
    const coinId = opts.coinId || 'bitcoin';
    const price = this.getMarketPrice(coinId);
    return fragment('market', price, 'globalPriceEngine', 'live_api', 'globalPriceEngine', null, price !== null ? 'authoritative' : 'unavailable');
  }
}

export const knowledgePipeline = new KnowledgePipeline();
