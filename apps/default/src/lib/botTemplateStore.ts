/**
 * botTemplateStore.ts
 *
 * Manages the system-defined bot template catalogue for CryptoVerse HQ.
 *
 * Templates are the blueprints users instantiate into UserBot instances.
 * They are admin-controlled: admins activate/deactivate templates.
 * Users cannot create or edit templates — only instantiate them.
 *
 * Persistence:
 *   - Templates stored under `cryptoverse_bot_templates_v1`
 *   - Seed data applied on first load (5 templates, one per BotType)
 *   - Admin changes persist immediately to localStorage
 */

import { create } from 'zustand';
import {
  BotTemplate,
  BotType,
  BotConfig,
  BOT_FEE_RATE,
} from './botTypes';
import { generateId } from './strategyUtils';
import { cloudRecordStore } from './cloudData';

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENCE
// ─────────────────────────────────────────────────────────────────────────────

const TEMPLATES_KEY         = 'cryptoverse_bot_templates_v1';
const TEMPLATES_VERSION_KEY = 'cryptoverse_bot_templates_version';
const TEMPLATES_CURRENT_VERSION = 'v5'; // bump when seed data changes

function loadTemplates(): Record<string, BotTemplate> {
  return cloudRecordStore.get<Record<string, BotTemplate>>('bot_templates', TEMPLATES_KEY, {});
}
function saveTemplates(data: Record<string, BotTemplate>) {
  cloudRecordStore.set('bot_templates', TEMPLATES_KEY, data);
}

// ─────────────────────────────────────────────────────────────────────────────
// SEED DATA — one complete template per BotType
// ─────────────────────────────────────────────────────────────────────────────

function buildSeedTemplates(): Record<string, BotTemplate> {
  const now = new Date().toISOString();

  const seeds: Omit<BotTemplate, 'id' | 'createdAt' | 'updatedAt'>[] = [

    // ── 1. Grid Bot ─────────────────────────────────────────────────────────
    {
      name:             'BTC Grid Bot',
      type:             'grid',
      description:      'Automatically places a ladder of buy and sell orders at fixed price intervals around the current Bitcoin price. Profits whenever the price oscillates within the configured grid range — no need to predict direction. Ideal for sideways or mildly volatile markets.',
      shortDescription: 'Auto-grid on BTC/USDT. Profits from volatility in both directions.',
      defaultConfig: {
        type:            'grid',
        coinId:          'bitcoin',
        coinSymbol:      'BTC',
        totalInvestment: 1_000,
        gridCount:       10,
        lowerPrice:      60_000,
        upperPrice:      70_000,
        autoAdjust:      false,
        stopLossPrice:   0,
        takeProfitPrice: 0,
        feeRate:         BOT_FEE_RATE,
      } as BotConfig,
      minBalance:                   1_000,
      riskLevel:                    'medium',
      isActive:                     true,
      requiredPlan:                 'any',
      requiredLevel:                0,
      estimatedMonthlyReturnPct:    4.2,
      tags:                         ['grid', 'btc', 'automated', 'sideways-market'],
      activeInstances:              0,
      totalUsers:                   0,
    },

    // ── 2. Martingale Bot ────────────────────────────────────────────────────
    {
      name:             'ETH Martingale Bot',
      type:             'martingale',
      description:      'Increases position size after each loss to recover all losses with a single winning trade. Starts with a $100 base position, doubles it after every loss (up to 5 consecutive losses), then resets on a win. Direction alternates between long and short for balance. High risk, high reward — not suitable for beginners.',
      shortDescription: 'Doubles down after losses. One win recovers all.',
      defaultConfig: {
        type:                 'martingale',
        coinId:               'ethereum',
        coinSymbol:           'ETH',
        // ── spec fields ──────────────────────────────────────────────────────
        baseAmount:           100,
        multiplier:           2.0,
        maxConsecutiveLosses: 5,
        takeProfitPct:        2.0,
        direction:            'both',
        feeRate:              BOT_FEE_RATE,
        // ── legacy compat ────────────────────────────────────────────────────
        baseOrderSize:        100,
        safetyOrderSize:      100,
        maxSafetyOrders:      5,
        priceDeviation:       2.5,
        volumeMultiplier:     2.0,
        stepScale:            1.0,
        side:                 'long',
        stopLossPct:          0,
      } as BotConfig,
      minBalance:                   500,
      riskLevel:                    'high',
      isActive:                     true,
      requiredPlan:                 'silver',
      requiredLevel:                2,
      estimatedMonthlyReturnPct:    7.8,
      tags:                         ['martingale', 'eth', 'high-risk', 'high-reward', 'consecutive-loss'],
      activeInstances:              0,
      totalUsers:                   0,
    },

    // ── 3. DCA Bot ───────────────────────────────────────────────────────────
    {
      name:             'BTC DCA Accumulator',
      type:             'dca',
      description:      'Builds a Bitcoin position progressively as the price falls. Places an initial $1,000 buy, then adds a further order each time price drops 3% below the last entry — up to 5 total orders. When price rises 5% above the weighted average entry, the bot sells half the position (partial exit) and continues monitoring for another exit on the remainder.',
      shortDescription: 'Buys BTC dips across 5 orders, exits at 5% profit.',
      defaultConfig: {
        type:               'dca',
        coinId:             'bitcoin',
        coinSymbol:         'BTC',
        // ── spec fields ────────────────────────────────────────────────────
        initialInvestment:  1_000,
        numberOfOrders:     5,
        priceDropPct:       3,
        takeProfitPct:      5,
        partialExit:        true,
        feeRate:            BOT_FEE_RATE,
        // ── legacy compat ──────────────────────────────────────────────────
        orderSize:          1_000,
        interval:           '1m',
        dipThresholdPct:    3,
        dipMultiplier:      1,
        maxTotalInvestment: 0,
      } as BotConfig,
      minBalance:                   1_000,
      riskLevel:                    'low',
      isActive:                     true,
      requiredPlan:                 'any',
      requiredLevel:                0,
      estimatedMonthlyReturnPct:    2.1,
      tags:                         ['dca', 'btc', 'beginner-friendly', 'accumulation', 'low-risk'],
      activeInstances:              0,
      totalUsers:                   0,
    },

    // ── 4. Arbitrage Bot ─────────────────────────────────────────────────────
    {
      name:             'Multi-Pair Arb Bot',
      type:             'arbitrage',
      description:      'Scans BTC/USDT, ETH/USDT, and SOL/USDT every 10 seconds for inter-market spread opportunities. When any pair\'s simulated spread exceeds 0.5%, the bot fires an atomic buy + sell execution and logs the arb cycle. Picks the highest-profit opportunity each scan. Low-risk, high-frequency returns.',
      shortDescription: 'Scans 3 pairs every 10s — captures the best spread opportunity.',
      defaultConfig: {
        type: 'arbitrage',
        // ── spec fields ──────────────────────────────────────────────────────
        monitoredPairs: [
          { coinId: 'bitcoin',  symbol: 'BTC', pair: 'BTC/USDT' },
          { coinId: 'ethereum', symbol: 'ETH', pair: 'ETH/USDT' },
          { coinId: 'solana',   symbol: 'SOL', pair: 'SOL/USDT' },
        ],
        minProfitPct:    0.5,
        maxPositionSize: 5_000,
        scanIntervalSec: 10,
        feeRate:         BOT_FEE_RATE,
        // ── legacy compat ────────────────────────────────────────────────────
        pairA:           'BTC/USDT',
        coinAId:         'bitcoin',
        coinASymbol:     'BTC',
        pairB:           'ETH/USDT',
        coinBId:         'ethereum',
        coinBSymbol:     'ETH',
        minSpreadPct:    0.5,
        maxPositionUsd:  5_000,
        maxHoldMinutes:  0,
      } as BotConfig,
      minBalance:                   1_000,
      riskLevel:                    'medium',
      isActive:                     true,
      requiredPlan:                 'silver',
      requiredLevel:                3,
      estimatedMonthlyReturnPct:    4.2,
      tags:                         ['arbitrage', 'btc', 'eth', 'sol', 'spread', 'market-neutral'],
      activeInstances:              0,
      totalUsers:                   0,
    },

    // ── 5. Rebalancing Bot ───────────────────────────────────────────────────
    {
      name:             'Crypto Index Rebalancer',
      type:             'rebalancing',
      description:      'Maintains a target 40/30/30 allocation across BTC, ETH, and BNB. Every 24 hours it checks each asset\'s deviation from target. If any drift exceeds 5%, it sells the overweight assets and buys the underweight ones — only executing trades ≥$50 to avoid dust. Ideal for long-term passive portfolio management.',
      shortDescription: 'Keeps BTC/ETH/BNB at target 40/30/30 — rebalances every 24h.',
      defaultConfig: {
        type: 'rebalancing',
        // ── spec fields ──────────────────────────────────────────────────────
        assets: [
          { coinId: 'bitcoin',     coinSymbol: 'BTC', coinColor: '#F7931A', targetPct: 40 },
          { coinId: 'ethereum',    coinSymbol: 'ETH', coinColor: '#627EEA', targetPct: 30 },
          { coinId: 'binancecoin', coinSymbol: 'BNB', coinColor: '#F3BA2F', targetPct: 30 },
        ],
        rebalanceThresholdPct:   5,
        rebalanceIntervalHours:  24,
        minTradeSizeUsd:         50,
        totalPortfolioUsd:       5_000,
        feeRate:                 BOT_FEE_RATE,
        // ── legacy compat ────────────────────────────────────────────────────
        allocations: [
          { coinId: 'bitcoin',     coinSymbol: 'BTC', coinColor: '#F7931A', targetPct: 40 },
          { coinId: 'ethereum',    coinSymbol: 'ETH', coinColor: '#627EEA', targetPct: 30 },
          { coinId: 'binancecoin', coinSymbol: 'BNB', coinColor: '#F3BA2F', targetPct: 30 },
        ],
        driftThresholdPct: 5,
        checkInterval:     '1d',
      } as BotConfig,
      minBalance:                   5_000,
      riskLevel:                    'low',
      isActive:                     true,
      requiredPlan:                 'silver',
      requiredLevel:                1,
      estimatedMonthlyReturnPct:    1.8,
      tags:                         ['rebalancing', 'portfolio', 'btc', 'eth', 'bnb', 'low-risk', 'long-term'],
      activeInstances:              0,
      totalUsers:                   0,
    },
  ];

  const record: Record<string, BotTemplate> = {};
  seeds.forEach(s => {
    const id = generateId();
    record[id] = { ...s, id, createdAt: now, updatedAt: now };
  });
  return record;
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE INTERFACE
// ─────────────────────────────────────────────────────────────────────────────

export interface BotTemplateState {
  templates: Record<string, BotTemplate>;

  // ── Queries ────────────────────────────────────────────────────────────────

  /** Returns all active templates (visible to users), sorted by type. */
  getActiveTemplates: () => BotTemplate[];

  /** Returns all templates (admin view, includes inactive). */
  getAllTemplates: () => BotTemplate[];

  /** Returns a single template by ID, or null. */
  getTemplate: (id: string) => BotTemplate | null;

  /** Returns templates filtered by BotType. */
  getTemplatesByType: (type: BotType) => BotTemplate[];

  // ── Admin mutations ────────────────────────────────────────────────────────

  /** Activates a deactivated template (makes it available to users). */
  activateTemplate: (id: string) => { ok: boolean; error?: string };

  /** Deactivates a template (hides it from users, existing bots keep running). */
  deactivateTemplate: (id: string) => { ok: boolean; error?: string };

  /**
   * Updates editable template metadata (admin only).
   * Does NOT update defaultConfig — changes only affect new bot instances.
   */
  updateTemplate: (
    id: string,
    patch: Partial<Pick<BotTemplate,
      | 'name' | 'description' | 'shortDescription' | 'riskLevel'
      | 'minBalance' | 'requiredPlan' | 'requiredLevel'
      | 'estimatedMonthlyReturnPct' | 'tags'
    >>,
  ) => { ok: boolean; error?: string };

  /** Increments the activeInstances counter when a user starts a bot. */
  incrementActiveInstances: (templateId: string) => void;

  /** Decrements the activeInstances counter when a user stops a bot. */
  decrementActiveInstances: (templateId: string) => void;

  /** Increments the totalUsers counter when a user creates a bot from this template. */
  incrementTotalUsers: (templateId: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// STORE
// ─────────────────────────────────────────────────────────────────────────────

export const useBotTemplateStore = create<BotTemplateState>((set, get) => {
  let templates = loadTemplates();

  // Seed if empty OR if the seed version has changed (re-seeds with updated defaults)
  const storedVersion = cloudRecordStore.get<string>('bot_templates', TEMPLATES_VERSION_KEY, '');
  if (Object.keys(templates).length === 0 || storedVersion !== TEMPLATES_CURRENT_VERSION) {
    templates = buildSeedTemplates();
    saveTemplates(templates);
    cloudRecordStore.set('bot_templates', TEMPLATES_VERSION_KEY, TEMPLATES_CURRENT_VERSION);
  }

  return {
    templates,

    // ── Queries ───────────────────────────────────────────────────────────────

    getActiveTemplates: () => {
      const typeOrder: BotType[] = ['grid', 'dca', 'martingale', 'arbitrage', 'rebalancing'];
      return Object.values(get().templates)
        .filter(t => t.isActive)
        .sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type));
    },

    getAllTemplates: () => {
      return Object.values(get().templates)
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    getTemplate: (id) => {
      return get().templates[id] ?? null;
    },

    getTemplatesByType: (type) => {
      return Object.values(get().templates).filter(t => t.type === type && t.isActive);
    },

    // ── Admin mutations ───────────────────────────────────────────────────────

    activateTemplate: (id) => {
      const { templates } = get();
      const t = templates[id];
      if (!t) return { ok: false, error: 'Template not found.' };
      if (t.isActive) return { ok: false, error: 'Template is already active.' };

      const updated = { ...t, isActive: true, updatedAt: new Date().toISOString() };
      const next    = { ...templates, [id]: updated };
      saveTemplates(next);
      set({ templates: next });
      return { ok: true };
    },

    deactivateTemplate: (id) => {
      const { templates } = get();
      const t = templates[id];
      if (!t) return { ok: false, error: 'Template not found.' };
      if (!t.isActive) return { ok: false, error: 'Template is already inactive.' };

      const updated = { ...t, isActive: false, updatedAt: new Date().toISOString() };
      const next    = { ...templates, [id]: updated };
      saveTemplates(next);
      set({ templates: next });
      return { ok: true };
    },

    updateTemplate: (id, patch) => {
      const { templates } = get();
      const t = templates[id];
      if (!t) return { ok: false, error: 'Template not found.' };

      const updated = { ...t, ...patch, updatedAt: new Date().toISOString() };
      const next    = { ...templates, [id]: updated };
      saveTemplates(next);
      set({ templates: next });
      return { ok: true };
    },

    incrementActiveInstances: (templateId) => {
      const { templates } = get();
      const t = templates[templateId];
      if (!t) return;
      const updated = { ...t, activeInstances: t.activeInstances + 1, updatedAt: new Date().toISOString() };
      const next    = { ...templates, [templateId]: updated };
      saveTemplates(next);
      set({ templates: next });
    },

    decrementActiveInstances: (templateId) => {
      const { templates } = get();
      const t = templates[templateId];
      if (!t) return;
      const updated = { ...t, activeInstances: Math.max(0, t.activeInstances - 1), updatedAt: new Date().toISOString() };
      const next    = { ...templates, [templateId]: updated };
      saveTemplates(next);
      set({ templates: next });
    },

    incrementTotalUsers: (templateId) => {
      const { templates } = get();
      const t = templates[templateId];
      if (!t) return;
      const updated = { ...t, totalUsers: t.totalUsers + 1, updatedAt: new Date().toISOString() };
      const next    = { ...templates, [templateId]: updated };
      saveTemplates(next);
      set({ templates: next });
    },
  };
});
