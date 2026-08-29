/**
 * api/bots.ts
 *
 * Trading Bots Endpoints — Part 12 §11.2
 *
 * GET    /api/bots/templates   - List bot templates
 * GET    /api/bots/user        - List user's bots
 * POST   /api/bots             - Create new bot
 * PUT    /api/bots/:id         - Update bot
 * DELETE /api/bots/:id         - Delete bot
 * POST   /api/bots/:id/start   - Start bot
 * POST   /api/bots/:id/stop    - Stop bot
 */

import { registerRoute, requireAuth, ApiErrors } from './client';
import type {
  ListBotTemplatesResponse,
  BotTemplateItem,
  ListUserBotsResponse,
  UserBotItem,
  CreateBotRequest,
  CreateBotResponse,
  UpdateBotRequest,
  UpdateBotResponse,
  BotActionResponse,
} from './types';
import { useBotStore } from '../lib/botStore';
import { useBotTemplateStore } from '../lib/botTemplateStore';
import type { UserBot } from '../lib/botTypes';

function toBotItem(b: UserBot): UserBotItem {
  return {
    id:          b.id,
    name:        b.name,
    templateId:  b.templateId,
    type:        b.templateType,
    status:      b.status as UserBotItem['status'],
    totalProfit: b.totalProfit,
    totalTrades: b.totalTrades,
    winRate:     b.winRate,
    createdAt:   b.createdAt,
    lastRunAt:   b.lastRunAt,
  };
}

// ─── GET /api/bots/templates ───────────────────────────────────────────────────

registerRoute<Record<string, never>, ListBotTemplatesResponse>(
  'GET', '/api/bots/templates',
  () => {
    const store = useBotTemplateStore.getState();
    const templates: BotTemplateItem[] = Object.values(store.templates)
      .filter(t => t.isActive)
      .map(t => ({
        id:           t.id,
        name:         t.name,
        type:         t.type,
        description:  t.shortDescription,
        minBalance:   t.minBalance,
        requiredPlan: t.requiredPlan,
        requiredLevel: t.requiredLevel,
        rating:       t.rating,
        totalUsers:   t.totalUsers,
        isActive:     t.isActive,
      }));
    return { templates };
  },
);

// ─── GET /api/bots/user ────────────────────────────────────────────────────────

registerRoute<Record<string, never>, ListUserBotsResponse>(
  'GET', '/api/bots/user',
  (_body, auth) => {
    const a    = requireAuth(auth);
    const store = useBotStore.getState();
    const bots  = store.getUserBots(a.userId);
    return { bots: bots.map(toBotItem) };
  },
);

// ─── POST /api/bots ────────────────────────────────────────────────────────────

registerRoute<CreateBotRequest, CreateBotResponse>(
  'POST', '/api/bots',
  (body, auth) => {
    const a    = requireAuth(auth);
    const store = useBotStore.getState();

    const result = store.createBot({
      userId:          a.userId,
      templateId:      body.templateId,
      name:            body.name,
      config:          body.config as any,
      scheduleType:    (body.scheduleType ?? 'continuous') as UserBot['scheduleType'],
      scheduleValue:   body.scheduleValue ?? '',
      userTradingBalance: 10_000,
      userPlan:        a.plan,
      userLevel:       a.level,
    });

    if (!result.ok || !result.bot) {
      throw ApiErrors.validation(result.errors?.join(' ') ?? 'Bot creation failed.');
    }
    return { botId: result.bot.id };
  },
);

// ─── PUT /api/bots/:id ─────────────────────────────────────────────────────────

registerRoute<UpdateBotRequest, UpdateBotResponse>(
  'PUT', '/api/bots/:id',
  (body, auth, pathParams) => {
    requireAuth(auth);
    const store = useBotStore.getState();
    const id    = pathParams?.['id'] ?? '';

    const result = store.updateBot(id, {
      name:          body.name,
      config:        body.config as any,
      scheduleType:  body.scheduleType as any,
      scheduleValue: body.scheduleValue,
    });

    if (!result.ok) throw ApiErrors.storeError(result.error ?? 'Update failed.');
    return { botId: id };
  },
);

// ─── DELETE /api/bots/:id ──────────────────────────────────────────────────────

registerRoute<Record<string, never>, { ok: boolean }>(
  'DELETE', '/api/bots/:id',
  (_body, auth, pathParams) => {
    const a    = requireAuth(auth);
    const store = useBotStore.getState();
    const id    = pathParams?.['id'] ?? '';
    const result = store.deleteBot(id, a.userId);
    if (!result.ok) throw ApiErrors.storeError(result.error ?? 'Delete failed.');
    return { ok: true };
  },
);

// ─── POST /api/bots/:id/start ──────────────────────────────────────────────────

registerRoute<Record<string, never>, BotActionResponse>(
  'POST', '/api/bots/:id/start',
  (_body, auth, pathParams) => {
    requireAuth(auth);
    const store  = useBotStore.getState();
    const id     = pathParams?.['id'] ?? '';
    const result = store.startBot(id);
    if (!result.ok) throw ApiErrors.storeError(result.error ?? 'Start failed.');
    return { botId: id, status: 'active' };
  },
);

// ─── POST /api/bots/:id/stop ───────────────────────────────────────────────────

registerRoute<Record<string, never>, BotActionResponse>(
  'POST', '/api/bots/:id/stop',
  (_body, auth, pathParams) => {
    requireAuth(auth);
    const store  = useBotStore.getState();
    const id     = pathParams?.['id'] ?? '';
    const result = store.stopBot(id);
    if (!result.ok) throw ApiErrors.storeError(result.error ?? 'Stop failed.');
    return { botId: id, status: 'stopped' };
  },
);
