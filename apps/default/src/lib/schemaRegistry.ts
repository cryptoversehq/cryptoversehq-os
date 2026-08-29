/**
 * schemaRegistry.ts
 *
 * CryptoVerse HQ — Canonical Schema Registry (Part 14.3)
 *
 * Single source of truth for every data table in the system.
 * Documents:
 *   ✓ Table name and description
 *   ✓ Primary key field
 *   ✓ Foreign key relationships (field → parent table)
 *   ✓ Indexed fields (for query performance)
 *   ✓ Field types and nullability
 *   ✓ Persistence key (localStorage)
 *   ✓ Originating part (Parts 1–9)
 *
 * This file has ZERO runtime side-effects — it is documentation only.
 * The actual indexes are maintained in storeIndex.ts.
 * The actual data is stored in localStorage via each *Store.ts file.
 *
 * Migration path: when connecting a real DB (Supabase), use this registry
 * to generate the CREATE TABLE / CREATE INDEX DDL statements.
 */

// ─── FIELD TYPE ───────────────────────────────────────────────────────────────

type FieldType =
  | 'uuid'
  | 'string'
  | 'text'
  | 'number'
  | 'boolean'
  | 'datetime'
  | 'json'
  | 'enum';

interface FieldDef {
  type:        FieldType;
  nullable?:   boolean;
  default?:    string | number | boolean | null;
  enumValues?: string[];
  description?: string;
}

// ─── TABLE DEFINITION ─────────────────────────────────────────────────────────

interface ForeignKey {
  field:       string;
  refTable:    string;
  refField?:   string;       // defaults to 'id'
  onDelete?:   'CASCADE' | 'SET_NULL' | 'RESTRICT';
  nullable?:   boolean;
}

interface TableIndex {
  fields:    string[];
  unique?:   boolean;
  sparse?:   boolean;        // index only non-null values
  name?:     string;
}

interface TableDef {
  /** Table name (snake_case, matches localStorage key prefix) */
  name:           string;
  /** Human-readable description */
  description:    string;
  /** Primary key field */
  primaryKey:     string;
  /** Foreign key constraints */
  foreignKeys:    ForeignKey[];
  /** Secondary indexes for fast queries */
  indexes:        TableIndex[];
  /** Field definitions */
  fields:         Record<string, FieldDef>;
  /** localStorage key used for persistence */
  persistenceKey: string;
  /** Part of the spec where this table was defined */
  part:           number;
  /** Zustand store file that manages this table */
  store:          string;
}

// ─── SCHEMA REGISTRY ─────────────────────────────────────────────────────────

export const SCHEMA: Record<string, TableDef> = {

  // ──────────────────────────────────────────────────────────────────────────
  // PART 1 — USER ACCOUNT & AUTH
  // ──────────────────────────────────────────────────────────────────────────

  users: {
    name:        'users',
    description: 'Core user accounts — auth, profile, plan, level, balance',
    primaryKey:  'id',
    foreignKeys: [],
    indexes: [
      { fields: ['email'],       unique: true,  name: 'idx_users_email' },
      { fields: ['username'],    unique: true,  name: 'idx_users_username' },
      { fields: ['plan'],                       name: 'idx_users_plan' },
      { fields: ['level'],                      name: 'idx_users_level' },
      { fields: ['createdAt'],                  name: 'idx_users_created_at' },
      { fields: ['countryCode'],                name: 'idx_users_country' },
      { fields: ['isVerified'],                 name: 'idx_users_verified' },
    ],
    fields: {
      id:              { type: 'uuid' },
      email:           { type: 'string' },
      username:        { type: 'string' },
      displayName:     { type: 'string' },
      passwordHash:    { type: 'string' },
      avatarUrl:       { type: 'string', nullable: true },
      avatarSeed:      { type: 'string' },
      plan:            { type: 'enum', enumValues: ['bronze', 'silver', 'gold'] },
      level:           { type: 'number', default: 1 },
      xp:              { type: 'number', default: 0 },
      cpCoins:         { type: 'number', default: 0 },
      kycVerified:     { type: 'boolean', default: false },
      isVerified:      { type: 'boolean', default: false },
      countryCode:     { type: 'string', nullable: true },
      bio:             { type: 'text', nullable: true },
      createdAt:       { type: 'datetime' },
      lastLoginAt:     { type: 'datetime', nullable: true },
    },
    persistenceKey: 'cryptoverse_auth_v1',
    part:           1,
    store:          'authStore.ts',
  },

  login_history: {
    name:        'login_history',
    description: 'User login events for security audit trail',
    primaryKey:  'id',
    foreignKeys: [
      { field: 'userId', refTable: 'users', onDelete: 'CASCADE' },
    ],
    indexes: [
      { fields: ['userId', 'createdAt'], name: 'idx_login_history_user_date' },
      { fields: ['createdAt'],           name: 'idx_login_history_date' },
      { fields: ['ipAddress'],           name: 'idx_login_history_ip' },
    ],
    fields: {
      id:        { type: 'uuid' },
      userId:    { type: 'uuid' },
      ipAddress: { type: 'string' },
      device:    { type: 'string', nullable: true },
      location:  { type: 'string', nullable: true },
      success:   { type: 'boolean' },
      createdAt: { type: 'datetime' },
    },
    persistenceKey: 'cryptoverse_login_history_v1',
    part:           1,
    store:          'loginHistoryStore.ts',
  },

  // ──────────────────────────────────────────────────────────────────────────
  // PART 2 — CP COINS & SUBSCRIPTIONS
  // ──────────────────────────────────────────────────────────────────────────

  cp_coin_transactions: {
    name:        'cp_coin_transactions',
    description: 'All CP coin credits and debits for every user',
    primaryKey:  'id',
    foreignKeys: [
      { field: 'userId',    refTable: 'users', onDelete: 'CASCADE' },
      { field: 'toUserId',  refTable: 'users', onDelete: 'SET_NULL', nullable: true },
    ],
    indexes: [
      { fields: ['userId', 'createdAt'],     name: 'idx_cp_tx_user_date' },
      { fields: ['userId', 'type'],          name: 'idx_cp_tx_user_type' },
      { fields: ['createdAt'],               name: 'idx_cp_tx_date' },
      { fields: ['type'],                    name: 'idx_cp_tx_type' },
    ],
    fields: {
      id:          { type: 'uuid' },
      userId:      { type: 'uuid' },
      type:        { type: 'enum', enumValues: ['earn', 'spend', 'transfer', 'purchase', 'reward', 'refund'] },
      amount:      { type: 'number' },
      balance:     { type: 'number', description: 'Running balance after this transaction' },
      toUserId:    { type: 'uuid', nullable: true },
      description: { type: 'string' },
      refId:       { type: 'string', nullable: true, description: 'Related entity id (strategyId, etc.)' },
      createdAt:   { type: 'datetime' },
    },
    persistenceKey: 'cryptoverse_cp_transactions_v1',
    part:           2,
    store:          'cpCoinsStore.ts',
  },

  subscriptions: {
    name:        'subscriptions',
    description: 'User plan subscriptions and renewal history',
    primaryKey:  'id',
    foreignKeys: [
      { field: 'userId', refTable: 'users', onDelete: 'CASCADE' },
    ],
    indexes: [
      { fields: ['userId'],                  name: 'idx_subs_user' },
      { fields: ['userId', 'status'],        name: 'idx_subs_user_status' },
      { fields: ['expiresAt'],               name: 'idx_subs_expires', description: 'For renewal reminders' },
      { fields: ['plan'],                    name: 'idx_subs_plan' },
    ],
    fields: {
      id:          { type: 'uuid' },
      userId:      { type: 'uuid' },
      plan:        { type: 'enum', enumValues: ['bronze', 'silver', 'gold'] },
      status:      { type: 'enum', enumValues: ['active', 'expired', 'cancelled', 'trial'] },
      startedAt:   { type: 'datetime' },
      expiresAt:   { type: 'datetime' },
      autoRenew:   { type: 'boolean', default: false },
      priceCP:     { type: 'number' },
      createdAt:   { type: 'datetime' },
    },
    persistenceKey: 'cryptoverse_subscriptions_v1',
    part:           2,
    store:          'subscriptionStore.ts',
  },

  // ──────────────────────────────────────────────────────────────────────────
  // PART 3 — TRADING
  // ──────────────────────────────────────────────────────────────────────────

  trade_history: {
    name:        'trade_history',
    description: 'Every completed trade executed by any user',
    primaryKey:  'id',
    foreignKeys: [
      { field: 'userId', refTable: 'users', onDelete: 'CASCADE' },
    ],
    indexes: [
      { fields: ['userId', 'createdAt'],   name: 'idx_trade_user_date' },
      { fields: ['userId', 'coinId'],      name: 'idx_trade_user_coin' },
      { fields: ['userId', 'action'],      name: 'idx_trade_user_action' },
      { fields: ['coinId'],                name: 'idx_trade_coin' },
      { fields: ['createdAt'],             name: 'idx_trade_date' },
      { fields: ['pnl'],                   name: 'idx_trade_pnl', description: 'For leaderboard ranking' },
    ],
    fields: {
      id:        { type: 'uuid' },
      userId:    { type: 'uuid' },
      coinId:    { type: 'string' },
      symbol:    { type: 'string' },
      action:    { type: 'enum', enumValues: ['buy', 'sell', 'short', 'cover'] },
      price:     { type: 'number' },
      amount:    { type: 'number' },
      total:     { type: 'number' },
      fee:       { type: 'number', default: 0 },
      pnl:       { type: 'number', nullable: true },
      pnlPct:    { type: 'number', nullable: true },
      leverage:  { type: 'number', default: 1 },
      createdAt: { type: 'datetime' },
    },
    persistenceKey: 'cryptoverse_trade_history_v1',
    part:           3,
    store:          'tradingStore.ts',
  },

  watchlist: {
    name:        'watchlist',
    description: 'User-saved coin watchlists',
    primaryKey:  'id',
    foreignKeys: [
      { field: 'userId', refTable: 'users', onDelete: 'CASCADE' },
    ],
    indexes: [
      { fields: ['userId'],                 name: 'idx_watchlist_user' },
      { fields: ['userId', 'coinId'],       unique: true, name: 'idx_watchlist_user_coin' },
    ],
    fields: {
      id:        { type: 'uuid' },
      userId:    { type: 'uuid' },
      coinId:    { type: 'string' },
      symbol:    { type: 'string' },
      addedAt:   { type: 'datetime' },
      createdAt: { type: 'datetime' },
    },
    persistenceKey: 'cryptoverse_watchlist_v1',
    part:           3,
    store:          'watchlistStore.ts',
  },

  price_alerts: {
    name:        'price_alerts',
    description: 'User-configured price alert triggers',
    primaryKey:  'id',
    foreignKeys: [
      { field: 'userId', refTable: 'users', onDelete: 'CASCADE' },
    ],
    indexes: [
      { fields: ['userId'],                   name: 'idx_price_alerts_user' },
      { fields: ['userId', 'coinId'],         name: 'idx_price_alerts_user_coin' },
      { fields: ['coinId'],                   name: 'idx_price_alerts_coin' },
      { fields: ['isActive'],                 name: 'idx_price_alerts_active', sparse: true },
    ],
    fields: {
      id:          { type: 'uuid' },
      userId:      { type: 'uuid' },
      coinId:      { type: 'string' },
      condition:   { type: 'enum', enumValues: ['above', 'below', 'crosses_up', 'crosses_down'] },
      targetPrice: { type: 'number' },
      isActive:    { type: 'boolean', default: true },
      triggeredAt: { type: 'datetime', nullable: true },
      createdAt:   { type: 'datetime' },
    },
    persistenceKey: 'cryptoverse_price_alerts_v1',
    part:           3,
    store:          'priceAlertStore.ts',
  },

  // ──────────────────────────────────────────────────────────────────────────
  // PART 4 — STRATEGY MARKETPLACE
  // ──────────────────────────────────────────────────────────────────────────

  strategies: {
    name:        'strategies',
    description: 'Trading strategies listed on the marketplace',
    primaryKey:  'id',
    foreignKeys: [
      { field: 'creatorId', refTable: 'users', onDelete: 'CASCADE' },
    ],
    indexes: [
      { fields: ['creatorId'],                         name: 'idx_strategies_creator' },
      { fields: ['type'],                              name: 'idx_strategies_type' },
      { fields: ['rating'],                            name: 'idx_strategies_rating' },
      { fields: ['price'],                             name: 'idx_strategies_price' },
      { fields: ['totalSales'],                        name: 'idx_strategies_sales' },
      { fields: ['createdAt'],                         name: 'idx_strategies_date' },
      { fields: ['isListed'],                          name: 'idx_strategies_listed', sparse: true },
      { fields: ['requiredPlan'],                      name: 'idx_strategies_plan' },
      { fields: ['riskLevel'],                         name: 'idx_strategies_risk' },
    ],
    fields: {
      id:               { type: 'uuid' },
      creatorId:        { type: 'uuid' },
      name:             { type: 'string' },
      shortDescription: { type: 'string' },
      description:      { type: 'text' },
      type:             { type: 'enum', enumValues: ['grid', 'dca', 'martingale', 'arbitrage', 'custom'] },
      price:            { type: 'number' },
      isFree:           { type: 'boolean' },
      rating:           { type: 'number', default: 0 },
      ratingCount:      { type: 'number', default: 0 },
      totalSales:       { type: 'number', default: 0 },
      winRate:          { type: 'number' },
      maxDrawdown:      { type: 'number' },
      sharpeRatio:      { type: 'number' },
      isListed:         { type: 'boolean', default: false },
      requiredPlan:     { type: 'enum', enumValues: ['any', 'bronze', 'silver', 'gold'] },
      requiredLevel:    { type: 'number', default: 0 },
      riskLevel:        { type: 'enum', enumValues: ['low', 'medium', 'high', 'very_high'] },
      tags:             { type: 'json' },
      createdAt:        { type: 'datetime' },
      updatedAt:        { type: 'datetime' },
    },
    persistenceKey: 'cryptoverse_strategies_v1',
    part:           4,
    store:          'strategyStore.ts',
  },

  strategy_purchases: {
    name:        'strategy_purchases',
    description: 'Records of users who purchased a strategy',
    primaryKey:  'id',
    foreignKeys: [
      { field: 'strategyId', refTable: 'strategies', onDelete: 'RESTRICT' },
      { field: 'buyerId',    refTable: 'users',      onDelete: 'CASCADE'  },
    ],
    indexes: [
      { fields: ['buyerId'],                              name: 'idx_sp_buyer' },
      { fields: ['strategyId'],                           name: 'idx_sp_strategy' },
      { fields: ['buyerId', 'strategyId'], unique: true,  name: 'idx_sp_unique_purchase' },
      { fields: ['createdAt'],                            name: 'idx_sp_date' },
    ],
    fields: {
      id:          { type: 'uuid' },
      strategyId:  { type: 'uuid' },
      buyerId:     { type: 'uuid' },
      price:       { type: 'number' },
      purchasedAt: { type: 'datetime' },
      createdAt:   { type: 'datetime' },
    },
    persistenceKey: 'cryptoverse_strategy_purchases_v1',
    part:           4,
    store:          'strategyStore.ts',
  },

  strategy_ratings: {
    name:        'strategy_ratings',
    description: 'User reviews and star ratings for strategies',
    primaryKey:  'id',
    foreignKeys: [
      { field: 'strategyId', refTable: 'strategies', onDelete: 'CASCADE' },
      { field: 'userId',     refTable: 'users',      onDelete: 'CASCADE' },
    ],
    indexes: [
      { fields: ['strategyId'],                             name: 'idx_sr_strategy' },
      { fields: ['userId'],                                 name: 'idx_sr_user' },
      { fields: ['strategyId', 'userId'], unique: true,     name: 'idx_sr_unique_rating' },
      { fields: ['rating'],                                 name: 'idx_sr_score' },
      { fields: ['createdAt'],                              name: 'idx_sr_date' },
    ],
    fields: {
      id:         { type: 'uuid' },
      strategyId: { type: 'uuid' },
      userId:     { type: 'uuid' },
      rating:     { type: 'number', description: '1–5 stars' },
      review:     { type: 'text' },
      createdAt:  { type: 'datetime' },
    },
    persistenceKey: 'cryptoverse_strategy_ratings_v1',
    part:           4,
    store:          'strategyStore.ts',
  },

  // ──────────────────────────────────────────────────────────────────────────
  // PART 5 — TRADING BOTS
  // ──────────────────────────────────────────────────────────────────────────

  bot_templates: {
    name:        'bot_templates',
    description: 'Pre-built bot configuration templates',
    primaryKey:  'id',
    foreignKeys: [],
    indexes: [
      { fields: ['type'],          name: 'idx_bt_type' },
      { fields: ['requiredPlan'],  name: 'idx_bt_plan' },
      { fields: ['isActive'],      name: 'idx_bt_active', sparse: true },
      { fields: ['rating'],        name: 'idx_bt_rating' },
    ],
    fields: {
      id:            { type: 'uuid' },
      name:          { type: 'string' },
      type:          { type: 'enum', enumValues: ['grid', 'dca', 'martingale', 'arbitrage'] },
      shortDescription: { type: 'string' },
      minBalance:    { type: 'number' },
      requiredPlan:  { type: 'enum', enumValues: ['any', 'bronze', 'silver', 'gold'] },
      requiredLevel: { type: 'number' },
      rating:        { type: 'number' },
      totalUsers:    { type: 'number' },
      isActive:      { type: 'boolean' },
      createdAt:     { type: 'datetime' },
    },
    persistenceKey: 'cryptoverse_bot_templates_v1',
    part:           5,
    store:          'botTemplateStore.ts',
  },

  user_bots: {
    name:        'user_bots',
    description: 'User-created bot instances derived from templates',
    primaryKey:  'id',
    foreignKeys: [
      { field: 'userId',     refTable: 'users',         onDelete: 'CASCADE'  },
      { field: 'templateId', refTable: 'bot_templates', onDelete: 'RESTRICT' },
    ],
    indexes: [
      { fields: ['userId'],             name: 'idx_ub_user' },
      { fields: ['userId', 'status'],   name: 'idx_ub_user_status' },
      { fields: ['templateId'],         name: 'idx_ub_template' },
      { fields: ['status'],             name: 'idx_ub_status' },
      { fields: ['createdAt'],          name: 'idx_ub_date' },
      { fields: ['lastRunAt'],          name: 'idx_ub_last_run', sparse: true },
    ],
    fields: {
      id:           { type: 'uuid' },
      userId:       { type: 'uuid' },
      templateId:   { type: 'uuid' },
      name:         { type: 'string' },
      templateType: { type: 'string' },
      status:       { type: 'enum', enumValues: ['active', 'paused', 'stopped', 'error'] },
      config:       { type: 'json' },
      totalProfit:  { type: 'number', default: 0 },
      totalTrades:  { type: 'number', default: 0 },
      winRate:      { type: 'number', default: 0 },
      scheduleType: { type: 'enum', enumValues: ['continuous', 'interval', 'cron'] },
      scheduleValue:{ type: 'string', nullable: true },
      lastRunAt:    { type: 'datetime', nullable: true },
      createdAt:    { type: 'datetime' },
    },
    persistenceKey: 'cryptoverse_user_bots_v1',
    part:           5,
    store:          'botStore.ts',
  },

  bot_executions: {
    name:        'bot_executions',
    description: 'Immutable execution/trade log for every bot action',
    primaryKey:  'id',
    foreignKeys: [
      { field: 'botId',  refTable: 'user_bots', onDelete: 'CASCADE' },
      { field: 'userId', refTable: 'users',     onDelete: 'CASCADE' },
    ],
    indexes: [
      { fields: ['botId'],               name: 'idx_be_bot' },
      { fields: ['userId'],              name: 'idx_be_user' },
      { fields: ['userId', 'createdAt'], name: 'idx_be_user_date' },
      { fields: ['botId',  'createdAt'], name: 'idx_be_bot_date' },
      { fields: ['status'],              name: 'idx_be_status' },
      { fields: ['action'],              name: 'idx_be_action' },
      { fields: ['createdAt'],           name: 'idx_be_date' },
    ],
    fields: {
      id:        { type: 'uuid' },
      botId:     { type: 'uuid' },
      userId:    { type: 'uuid' },
      action:    { type: 'enum', enumValues: ['buy', 'sell', 'skip', 'error', 'rebalance'] },
      coinId:    { type: 'string' },
      price:     { type: 'number' },
      amount:    { type: 'number', nullable: true },
      total:     { type: 'number', nullable: true },
      pnl:       { type: 'number', nullable: true },
      fee:       { type: 'number', default: 0 },
      status:    { type: 'enum', enumValues: ['success', 'failed', 'skipped'] },
      errorMsg:  { type: 'string', nullable: true },
      metadata:  { type: 'json', nullable: true, description: 'Bot-type-specific state snapshot' },
      createdAt: { type: 'datetime' },
    },
    persistenceKey: 'cryptoverse_bot_executions_v1',
    part:           5,
    store:          'botStore.ts',
  },

  // ──────────────────────────────────────────────────────────────────────────
  // PART 6 — BACKTEST ENGINE
  // ──────────────────────────────────────────────────────────────────────────

  backtest_sessions: {
    name:        'backtest_sessions',
    description: 'Backtest run records with parameters and results',
    primaryKey:  'id',
    foreignKeys: [
      { field: 'userId',     refTable: 'users',      onDelete: 'CASCADE'  },
      { field: 'strategyId', refTable: 'strategies', onDelete: 'SET_NULL', nullable: true },
    ],
    indexes: [
      { fields: ['userId'],                   name: 'idx_bs_user' },
      { fields: ['userId', 'status'],         name: 'idx_bs_user_status' },
      { fields: ['userId', 'createdAt'],      name: 'idx_bs_user_date' },
      { fields: ['strategyId'],               name: 'idx_bs_strategy', sparse: true },
      { fields: ['status'],                   name: 'idx_bs_status' },
      { fields: ['createdAt'],                name: 'idx_bs_date' },
    ],
    fields: {
      id:           { type: 'uuid' },
      userId:       { type: 'uuid' },
      strategyId:   { type: 'uuid', nullable: true },
      strategyType: { type: 'string' },
      sessionName:  { type: 'string' },
      status:       { type: 'enum', enumValues: ['pending', 'queued', 'running', 'completed', 'failed'] },
      params:       { type: 'json', description: 'RunBacktestRequest parameters' },
      metrics:      { type: 'json', nullable: true },
      trades:       { type: 'json', nullable: true },
      createdAt:    { type: 'datetime' },
      completedAt:  { type: 'datetime', nullable: true },
    },
    persistenceKey: 'cryptoverse_backtest_sessions_v1',
    part:           6,
    store:          'backtestStore.ts',
  },

  backtest_queue: {
    name:        'backtest_queue',
    description: 'Priority queue for pending and in-progress backtest sessions',
    primaryKey:  'id',
    foreignKeys: [
      { field: 'sessionId', refTable: 'backtest_sessions', onDelete: 'CASCADE' },
      { field: 'userId',    refTable: 'users',             onDelete: 'CASCADE' },
    ],
    indexes: [
      { fields: ['sessionId'],              name: 'idx_bq_session', unique: true },
      { fields: ['userId'],                 name: 'idx_bq_user' },
      { fields: ['status'],                 name: 'idx_bq_status' },
      { fields: ['priority', 'enqueuedAt'], name: 'idx_bq_priority_date', description: 'Queue ordering' },
      { fields: ['enqueuedAt'],             name: 'idx_bq_date' },
    ],
    fields: {
      id:          { type: 'uuid' },
      sessionId:   { type: 'uuid' },
      userId:      { type: 'uuid' },
      priority:    { type: 'enum', enumValues: ['low', 'normal', 'high'] },
      status:      { type: 'enum', enumValues: ['pending', 'running', 'completed', 'failed', 'cancelled'] },
      retries:     { type: 'number', default: 0 },
      maxRetries:  { type: 'number', default: 3 },
      enqueuedAt:  { type: 'datetime' },
      startedAt:   { type: 'datetime', nullable: true },
      completedAt: { type: 'datetime', nullable: true },
      createdAt:   { type: 'datetime' },
    },
    persistenceKey: 'cryptoverse_backtest_queue_v1',
    part:           6,
    store:          'backtestStore.ts',
  },

  // ──────────────────────────────────────────────────────────────────────────
  // PART 7 — COPY TRADING
  // ──────────────────────────────────────────────────────────────────────────

  copy_relationships: {
    name:        'copy_relationships',
    description: 'Copy trading follow relationships between users',
    primaryKey:  'id',
    foreignKeys: [
      { field: 'followerId', refTable: 'users', onDelete: 'CASCADE' },
      { field: 'traderId',   refTable: 'users', onDelete: 'CASCADE' },
    ],
    indexes: [
      { fields: ['followerId'],                              name: 'idx_cr_follower' },
      { fields: ['traderId'],                                name: 'idx_cr_trader' },
      { fields: ['followerId', 'traderId'], unique: true,    name: 'idx_cr_unique_pair' },
      { fields: ['followerId', 'status'],                    name: 'idx_cr_follower_status' },
      { fields: ['traderId',   'status'],                    name: 'idx_cr_trader_status' },
      { fields: ['status'],                                  name: 'idx_cr_status' },
      { fields: ['createdAt'],                               name: 'idx_cr_date' },
    ],
    fields: {
      id:                { type: 'uuid' },
      followerId:        { type: 'uuid' },
      traderId:          { type: 'uuid' },
      traderName:        { type: 'string' },
      copyPercentage:    { type: 'number' },
      maxAmountPerTrade: { type: 'number' },
      stopLoss:          { type: 'number', nullable: true },
      takeProfit:        { type: 'number', nullable: true },
      status:            { type: 'enum', enumValues: ['active', 'paused', 'stopped'] },
      totalProfit:       { type: 'number', default: 0 },
      totalCopiedTrades: { type: 'number', default: 0 },
      winningTrades:     { type: 'number', default: 0 },
      createdAt:         { type: 'datetime' },
    },
    persistenceKey: 'cryptoverse_copy_relationships_v1',
    part:           7,
    store:          'copyTradingStore.ts',
  },

  copy_executions: {
    name:        'copy_executions',
    description: 'Individual copied trade records',
    primaryKey:  'id',
    foreignKeys: [
      { field: 'relationshipId', refTable: 'copy_relationships', onDelete: 'CASCADE' },
      { field: 'followerId',     refTable: 'users',              onDelete: 'CASCADE' },
      { field: 'traderId',       refTable: 'users',              onDelete: 'CASCADE' },
    ],
    indexes: [
      { fields: ['relationshipId'],                     name: 'idx_ce_relationship' },
      { fields: ['followerId'],                         name: 'idx_ce_follower' },
      { fields: ['traderId'],                           name: 'idx_ce_trader' },
      { fields: ['followerId', 'createdAt'],            name: 'idx_ce_follower_date' },
      { fields: ['status'],                             name: 'idx_ce_status' },
      { fields: ['createdAt'],                          name: 'idx_ce_date' },
    ],
    fields: {
      id:             { type: 'uuid' },
      relationshipId: { type: 'uuid' },
      followerId:     { type: 'uuid' },
      traderId:       { type: 'uuid' },
      coinId:         { type: 'string' },
      action:         { type: 'enum', enumValues: ['buy', 'sell'] },
      price:          { type: 'number' },
      amount:         { type: 'number' },
      total:          { type: 'number' },
      pnl:            { type: 'number', nullable: true },
      status:         { type: 'enum', enumValues: ['completed', 'failed', 'skipped'] },
      createdAt:      { type: 'datetime' },
    },
    persistenceKey: 'cryptoverse_copy_executions_v1',
    part:           7,
    store:          'copyTradingStore.ts',
  },

  // ──────────────────────────────────────────────────────────────────────────
  // PART 8 — ON-CHAIN, SENTIMENT, NFT
  // ──────────────────────────────────────────────────────────────────────────

  onchain_alerts: {
    name:        'onchain_alerts',
    description: 'User-configured whale / on-chain alert rules',
    primaryKey:  'id',
    foreignKeys: [
      { field: 'userId', refTable: 'users', onDelete: 'CASCADE' },
    ],
    indexes: [
      { fields: ['userId'],               name: 'idx_oa_user' },
      { fields: ['userId', 'chain'],      name: 'idx_oa_user_chain' },
      { fields: ['chain'],                name: 'idx_oa_chain' },
      { fields: ['isEnabled'],            name: 'idx_oa_enabled', sparse: true },
      { fields: ['createdAt'],            name: 'idx_oa_date' },
    ],
    fields: {
      id:           { type: 'uuid' },
      userId:       { type: 'uuid' },
      chain:        { type: 'enum', enumValues: ['ethereum', 'bsc', 'solana', 'polygon'] },
      alertType:    { type: 'enum', enumValues: ['whale_transfer', 'large_swap', 'wallet_watch', 'token_mint'] },
      minValueUsd:  { type: 'number' },
      maxValueUsd:  { type: 'number', nullable: true },
      watchAddress: { type: 'string', nullable: true },
      label:        { type: 'string', nullable: true },
      isEnabled:    { type: 'boolean', default: true },
      triggerCount: { type: 'number', default: 0 },
      createdAt:    { type: 'datetime' },
    },
    persistenceKey: 'cryptoverse_onchain_alerts_v1',
    part:           8,
    store:          'onChainStore.ts',
  },

  onchain_events: {
    name:        'onchain_events',
    description: 'Triggered on-chain events captured by alert rules',
    primaryKey:  'id',
    foreignKeys: [
      { field: 'alertId', refTable: 'onchain_alerts', onDelete: 'CASCADE'  },
      { field: 'userId',  refTable: 'users',          onDelete: 'CASCADE'  },
    ],
    indexes: [
      { fields: ['alertId'],           name: 'idx_oe_alert' },
      { fields: ['userId'],            name: 'idx_oe_user' },
      { fields: ['chain'],             name: 'idx_oe_chain' },
      { fields: ['whaleTier'],         name: 'idx_oe_tier' },
      { fields: ['detectedAt'],        name: 'idx_oe_date' },
      { fields: ['valueUsd'],          name: 'idx_oe_value' },
    ],
    fields: {
      id:           { type: 'uuid' },
      alertId:      { type: 'uuid' },
      userId:       { type: 'uuid' },
      chain:        { type: 'string' },
      txHash:       { type: 'string' },
      fromAddress:  { type: 'string' },
      toAddress:    { type: 'string' },
      valueUsd:     { type: 'number' },
      asset:        { type: 'string' },
      whaleTier:    { type: 'enum', enumValues: ['shrimp', 'fish', 'dolphin', 'shark', 'whale'] },
      detectedAt:   { type: 'datetime' },
      createdAt:    { type: 'datetime' },
    },
    persistenceKey: 'cryptoverse_onchain_events_v1',
    part:           8,
    store:          'onChainStore.ts',
  },

  sentiment_snapshots: {
    name:        'sentiment_snapshots',
    description: 'Point-in-time market sentiment readings per symbol',
    primaryKey:  'id',
    foreignKeys: [],
    indexes: [
      { fields: ['symbol'],               name: 'idx_ss_symbol' },
      { fields: ['symbol', 'timestamp'],  name: 'idx_ss_symbol_time', description: 'For historical queries' },
      { fields: ['fearGreedIndex'],       name: 'idx_ss_fear_greed' },
      { fields: ['timestamp'],            name: 'idx_ss_time' },
    ],
    fields: {
      id:              { type: 'uuid' },
      symbol:          { type: 'string' },
      fearGreedIndex:  { type: 'number' },
      fearGreedZone:   { type: 'enum', enumValues: ['extreme_fear', 'fear', 'neutral', 'greed', 'extreme_greed'] },
      bullishPct:      { type: 'number' },
      bearishPct:      { type: 'number' },
      neutralPct:      { type: 'number' },
      socialVolume:    { type: 'number' },
      twitterMentions: { type: 'number' },
      redditMentions:  { type: 'number' },
      newsSentiment:   { type: 'number' },
      timestamp:       { type: 'datetime' },
      createdAt:       { type: 'datetime' },
    },
    persistenceKey: 'cryptoverse_sentiment_snapshots_v1',
    part:           8,
    store:          'sentimentStore.ts',
  },

  sentiment_alerts: {
    name:        'sentiment_alerts',
    description: 'User-configured sentiment threshold alerts',
    primaryKey:  'id',
    foreignKeys: [
      { field: 'userId', refTable: 'users', onDelete: 'CASCADE' },
    ],
    indexes: [
      { fields: ['userId'],             name: 'idx_sa_user' },
      { fields: ['symbol'],             name: 'idx_sa_symbol' },
      { fields: ['userId', 'symbol'],   name: 'idx_sa_user_symbol' },
      { fields: ['isEnabled'],          name: 'idx_sa_enabled', sparse: true },
      { fields: ['createdAt'],          name: 'idx_sa_date' },
    ],
    fields: {
      id:        { type: 'uuid' },
      userId:    { type: 'uuid' },
      symbol:    { type: 'string' },
      condition: { type: 'enum', enumValues: ['above', 'below', 'crosses_up', 'crosses_down'] },
      threshold: { type: 'number' },
      metric:    { type: 'enum', enumValues: ['fear_greed', 'bullish_pct', 'social_volume'] },
      isEnabled: { type: 'boolean', default: true },
      createdAt: { type: 'datetime' },
    },
    persistenceKey: 'cryptoverse_sentiment_alerts_v1',
    part:           8,
    store:          'sentimentStore.ts',
  },

  nft_wallets: {
    name:        'nft_wallets',
    description: 'Tracked NFT wallets per user',
    primaryKey:  'id',
    foreignKeys: [
      { field: 'userId', refTable: 'users', onDelete: 'CASCADE' },
    ],
    indexes: [
      { fields: ['userId'],              name: 'idx_nw_user' },
      { fields: ['address', 'chain'],    unique: true, name: 'idx_nw_address_chain' },
      { fields: ['chain'],               name: 'idx_nw_chain' },
      { fields: ['createdAt'],           name: 'idx_nw_date' },
    ],
    fields: {
      id:        { type: 'uuid' },
      userId:    { type: 'uuid' },
      address:   { type: 'string' },
      chain:     { type: 'string' },
      label:     { type: 'string', nullable: true },
      createdAt: { type: 'datetime' },
    },
    persistenceKey: 'cryptoverse_nft_wallets_v1',
    part:           8,
    store:          'nftStore.ts',
  },

  // ──────────────────────────────────────────────────────────────────────────
  // PART 9 — LIVE EVENTS, RECOMMENDATIONS, EXCHANGE
  // ──────────────────────────────────────────────────────────────────────────

  live_events: {
    name:        'live_events',
    description: 'Scheduled trading competitions and live events',
    primaryKey:  'id',
    foreignKeys: [],
    indexes: [
      { fields: ['status'],              name: 'idx_le_status' },
      { fields: ['type'],                name: 'idx_le_type' },
      { fields: ['startTime'],           name: 'idx_le_start' },
      { fields: ['endTime'],             name: 'idx_le_end' },
    ],
    fields: {
      id:                   { type: 'uuid' },
      title:                { type: 'string' },
      type:                 { type: 'enum', enumValues: ['competition', 'hackathon', 'airdrop', 'webinar'] },
      status:               { type: 'enum', enumValues: ['upcoming', 'active', 'ended', 'cancelled'] },
      startTime:            { type: 'datetime' },
      endTime:              { type: 'datetime' },
      prizePool:            { type: 'number' },
      entryFee:             { type: 'number' },
      maxParticipants:      { type: 'number' },
      currentParticipants:  { type: 'number', default: 0 },
      createdAt:            { type: 'datetime' },
    },
    persistenceKey: 'cryptoverse_live_events_v1',
    part:           9,
    store:          'liveEventStore.ts',
  },

  event_participants: {
    name:        'event_participants',
    description: 'Users registered for live events',
    primaryKey:  'id',
    foreignKeys: [
      { field: 'eventId', refTable: 'live_events', onDelete: 'CASCADE' },
      { field: 'userId',  refTable: 'users',       onDelete: 'CASCADE' },
    ],
    indexes: [
      { fields: ['eventId'],                         name: 'idx_ep_event' },
      { fields: ['userId'],                          name: 'idx_ep_user' },
      { fields: ['eventId', 'userId'], unique: true, name: 'idx_ep_unique' },
      { fields: ['status'],                          name: 'idx_ep_status' },
      { fields: ['createdAt'],                       name: 'idx_ep_date' },
    ],
    fields: {
      id:          { type: 'uuid' },
      eventId:     { type: 'uuid' },
      userId:      { type: 'uuid' },
      displayName: { type: 'string' },
      status:      { type: 'enum', enumValues: ['registered', 'active', 'disqualified', 'completed'] },
      score:       { type: 'number', default: 0 },
      rank:        { type: 'number', nullable: true },
      createdAt:   { type: 'datetime' },
    },
    persistenceKey: 'cryptoverse_event_participants_v1',
    part:           9,
    store:          'liveEventStore.ts',
  },

  recommendations: {
    name:        'recommendations',
    description: 'AI-generated personalized recommendation cards',
    primaryKey:  'id',
    foreignKeys: [
      { field: 'userId', refTable: 'users', onDelete: 'CASCADE' },
    ],
    indexes: [
      { fields: ['userId'],              name: 'idx_rec_user' },
      { fields: ['userId', 'type'],      name: 'idx_rec_user_type' },
      { fields: ['userId', 'score'],     name: 'idx_rec_user_score', description: 'For ranking' },
      { fields: ['type'],                name: 'idx_rec_type' },
      { fields: ['expiresAt'],           name: 'idx_rec_expires', description: 'For cleanup' },
      { fields: ['isClicked'],           name: 'idx_rec_clicked', sparse: true },
      { fields: ['createdAt'],           name: 'idx_rec_date' },
    ],
    fields: {
      id:          { type: 'uuid' },
      userId:      { type: 'uuid' },
      type:        { type: 'enum', enumValues: ['strategy', 'bot', 'lesson', 'competition', 'trader'] },
      targetId:    { type: 'string' },
      score:       { type: 'number' },
      headline:    { type: 'string' },
      reason:      { type: 'text' },
      thumbnail:   { type: 'string' },
      tags:        { type: 'json' },
      isViewed:    { type: 'boolean', default: false },
      isClicked:   { type: 'boolean', default: false },
      isDismissed: { type: 'boolean', default: false },
      expiresAt:   { type: 'datetime' },
      createdAt:   { type: 'datetime' },
    },
    persistenceKey: 'cryptoverse_recommendations_v1',
    part:           9,
    store:          'aiRecommenderStore.ts',
  },

  exchange_connections: {
    name:        'exchange_connections',
    description: 'User-connected real exchange API accounts',
    primaryKey:  'id',
    foreignKeys: [
      { field: 'userId', refTable: 'users', onDelete: 'CASCADE' },
    ],
    indexes: [
      { fields: ['userId'],             name: 'idx_ec_user' },
      { fields: ['userId', 'exchange'], name: 'idx_ec_user_exchange' },
      { fields: ['exchange'],           name: 'idx_ec_exchange' },
      { fields: ['isActive'],           name: 'idx_ec_active', sparse: true },
      { fields: ['createdAt'],          name: 'idx_ec_date' },
    ],
    fields: {
      id:          { type: 'uuid' },
      userId:      { type: 'uuid' },
      exchange:    { type: 'enum', enumValues: ['binance', 'coinbase', 'kraken', 'bybit', 'okx'] },
      label:       { type: 'string' },
      isActive:    { type: 'boolean', default: true },
      isDemoMode:  { type: 'boolean', default: true },
      lastSyncAt:  { type: 'datetime', nullable: true },
      totalTrades: { type: 'number', default: 0 },
      totalPnl:    { type: 'number', default: 0 },
      connectedAt: { type: 'datetime' },
      createdAt:   { type: 'datetime' },
    },
    persistenceKey: 'cryptoverse_exchange_connections_v1',
    part:           9,
    store:          'exchangeStore.ts',
  },

  // ──────────────────────────────────────────────────────────────────────────
  // PART 8 (cont.) — NFT TABLES (checklist names: nft_collections, nft_wallet_tracking)
  // Implemented in nftStore.ts as `collections` and `wallets` record maps.
  // Registered here under their canonical checklist names.
  // ──────────────────────────────────────────────────────────────────────────

  nft_collections: {
    name:        'nft_collections',
    description: 'Live NFT collection registry — floor price, volume, supply, stats',
    primaryKey:  'id',
    foreignKeys: [],
    indexes: [
      { fields: ['chain'],              name: 'idx_nc_chain' },
      { fields: ['category'],           name: 'idx_nc_category' },
      { fields: ['floorPrice'],         name: 'idx_nc_floor' },
      { fields: ['volume24h'],          name: 'idx_nc_volume' },
      { fields: ['rank'],               name: 'idx_nc_rank' },
      { fields: ['isVerified'],         name: 'idx_nc_verified', sparse: true },
      { fields: ['createdAt'],          name: 'idx_nc_date' },
    ],
    fields: {
      id:              { type: 'uuid' },
      slug:            { type: 'string', description: 'URL-safe unique identifier' },
      name:            { type: 'string' },
      chain:           { type: 'enum', enumValues: ['ethereum', 'solana', 'polygon'] },
      category:        { type: 'enum', enumValues: ['art', 'gaming', 'pfp', 'music', 'sports', 'utility', 'metaverse'] },
      contractAddress: { type: 'string' },
      totalSupply:     { type: 'number' },
      floorPrice:      { type: 'number', description: 'In native chain currency' },
      floorPriceUsd:   { type: 'number' },
      volume24h:       { type: 'number' },
      volume7d:        { type: 'number' },
      volumeAllTime:   { type: 'number' },
      owners:          { type: 'number' },
      listed:          { type: 'number', description: 'Currently listed for sale' },
      rank:            { type: 'number' },
      isVerified:      { type: 'boolean', default: false },
      thumbnailUrl:    { type: 'string', nullable: true },
      createdAt:       { type: 'datetime' },
      updatedAt:       { type: 'datetime' },
    },
    persistenceKey: 'cryptoverse_nft_collections_v1',
    part:           8,
    store:          'nftStore.ts',
  },

  nft_wallet_tracking: {
    name:        'nft_wallet_tracking',
    description: 'User-tracked NFT wallets with portfolio snapshots',
    primaryKey:  'id',
    foreignKeys: [
      { field: 'userId', refTable: 'users', onDelete: 'CASCADE' },
    ],
    indexes: [
      { fields: ['userId'],                       name: 'idx_nwt_user' },
      { fields: ['address', 'chain'], unique: true, name: 'idx_nwt_address_chain' },
      { fields: ['chain'],                        name: 'idx_nwt_chain' },
      { fields: ['totalValueUsd'],                name: 'idx_nwt_value' },
      { fields: ['createdAt'],                    name: 'idx_nwt_date' },
    ],
    fields: {
      id:             { type: 'uuid' },
      userId:         { type: 'uuid' },
      address:        { type: 'string' },
      chain:          { type: 'enum', enumValues: ['ethereum', 'solana', 'polygon'] },
      label:          { type: 'string', nullable: true },
      totalNfts:      { type: 'number', default: 0 },
      totalValueUsd:  { type: 'number', default: 0 },
      lastSnapshotAt: { type: 'datetime', nullable: true },
      isOwn:          { type: 'boolean', default: false, description: 'User flagged this as their own wallet' },
      createdAt:      { type: 'datetime' },
    },
    persistenceKey: 'cryptoverse_nft_wallets_v1',
    part:           8,
    store:          'nftStore.ts',
  },

  // ──────────────────────────────────────────────────────────────────────────
  // PART 6 (cont.) — BACKTEST QUEUE
  // ──────────────────────────────────────────────────────────────────────────

  backtest_queue: {
    name:        'backtest_queue',
    description: 'Priority queue for pending and in-progress backtest jobs',
    primaryKey:  'id',
    foreignKeys: [
      { field: 'sessionId', refTable: 'backtest_sessions', onDelete: 'CASCADE' },
      { field: 'userId',    refTable: 'users',             onDelete: 'CASCADE' },
    ],
    indexes: [
      { fields: ['sessionId'],                name: 'idx_bq_session', unique: true },
      { fields: ['userId'],                   name: 'idx_bq_user' },
      { fields: ['status'],                   name: 'idx_bq_status' },
      { fields: ['priority', 'enqueuedAt'],   name: 'idx_bq_priority_date' },
      { fields: ['enqueuedAt'],               name: 'idx_bq_date' },
    ],
    fields: {
      id:          { type: 'uuid' },
      sessionId:   { type: 'uuid' },
      userId:      { type: 'uuid' },
      priority:    { type: 'enum', enumValues: ['low', 'normal', 'high'] },
      status:      { type: 'enum', enumValues: ['pending', 'running', 'completed', 'failed', 'cancelled'] },
      retries:     { type: 'number', default: 0 },
      maxRetries:  { type: 'number', default: 3 },
      enqueuedAt:  { type: 'datetime' },
      startedAt:   { type: 'datetime', nullable: true },
      completedAt: { type: 'datetime', nullable: true },
      createdAt:   { type: 'datetime' },
    },
    persistenceKey: 'cryptoverse_backtest_queue_v1',
    part:           6,
    store:          'backtestStore.ts',
  },

  // ──────────────────────────────────────────────────────────────────────────
  // OPTIONAL TABLES
  // ──────────────────────────────────────────────────────────────────────────

  real_trades: {
    name:        'real_trades',
    description: 'OPTIONAL — Real exchange trades synced from connected exchange accounts',
    primaryKey:  'id',
    foreignKeys: [
      { field: 'connectionId', refTable: 'exchange_connections', onDelete: 'CASCADE' },
      { field: 'userId',       refTable: 'users',                onDelete: 'CASCADE' },
    ],
    indexes: [
      { fields: ['connectionId'],             name: 'idx_rt_connection' },
      { fields: ['userId'],                   name: 'idx_rt_user' },
      { fields: ['userId', 'createdAt'],      name: 'idx_rt_user_date' },
      { fields: ['userId', 'symbol'],         name: 'idx_rt_user_symbol' },
      { fields: ['status'],                   name: 'idx_rt_status' },
      { fields: ['createdAt'],                name: 'idx_rt_date' },
    ],
    fields: {
      id:           { type: 'uuid' },
      connectionId: { type: 'uuid' },
      userId:       { type: 'uuid' },
      exchangeTradeId: { type: 'string', description: 'Original trade ID from the exchange' },
      symbol:       { type: 'string' },
      side:         { type: 'enum', enumValues: ['buy', 'sell'] },
      price:        { type: 'number' },
      amount:       { type: 'number' },
      total:        { type: 'number' },
      fee:          { type: 'number' },
      feeCurrency:  { type: 'string' },
      pnl:          { type: 'number', nullable: true },
      status:       { type: 'enum', enumValues: ['open', 'filled', 'cancelled', 'partial'] },
      createdAt:    { type: 'datetime' },
    },
    persistenceKey: 'cryptoverse_real_trades_v1',
    part:           9,
    store:          'exchangeStore.ts',
  },

  ai_recommendations: {
    name:        'ai_recommendations',
    description: 'OPTIONAL — Extended AI recommendation history with scoring metadata',
    primaryKey:  'id',
    foreignKeys: [
      { field: 'userId', refTable: 'users', onDelete: 'CASCADE' },
    ],
    indexes: [
      { fields: ['userId'],                   name: 'idx_air_user' },
      { fields: ['userId', 'type'],           name: 'idx_air_user_type' },
      { fields: ['userId', 'score'],          name: 'idx_air_user_score' },
      { fields: ['type'],                     name: 'idx_air_type' },
      { fields: ['strategyId'],               name: 'idx_air_strategy', sparse: true },
      { fields: ['isActedOn'],                name: 'idx_air_acted', sparse: true },
      { fields: ['createdAt'],                name: 'idx_air_date' },
    ],
    fields: {
      id:           { type: 'uuid' },
      userId:       { type: 'uuid' },
      type:         { type: 'enum', enumValues: ['strategy', 'bot', 'lesson', 'competition', 'trader'] },
      targetId:     { type: 'string' },
      strategyId:   { type: 'uuid', nullable: true },
      score:        { type: 'number', description: 'Relevance score 0–100' },
      modelVersion: { type: 'string', description: 'Recommender engine version that generated this' },
      features:     { type: 'json',   description: 'Feature vector used for scoring' },
      isViewed:     { type: 'boolean', default: false },
      isActedOn:    { type: 'boolean', default: false },
      isDismissed:  { type: 'boolean', default: false },
      expiresAt:    { type: 'datetime' },
      createdAt:    { type: 'datetime' },
    },
    persistenceKey: 'cryptoverse_ai_recommendations_v1',
    part:           9,
    store:          'aiRecommenderStore.ts',
  },

  user_behavior_logs: {
    name:        'user_behavior_logs',
    description: 'OPTIONAL — Click / view / interaction events for ML training and analytics',
    primaryKey:  'id',
    foreignKeys: [
      { field: 'userId', refTable: 'users', onDelete: 'CASCADE' },
    ],
    indexes: [
      { fields: ['userId'],                  name: 'idx_ubl_user' },
      { fields: ['userId', 'eventType'],     name: 'idx_ubl_user_event' },
      { fields: ['userId', 'createdAt'],     name: 'idx_ubl_user_date' },
      { fields: ['eventType'],               name: 'idx_ubl_event_type' },
      { fields: ['targetType'],              name: 'idx_ubl_target_type' },
      { fields: ['sessionId'],               name: 'idx_ubl_session' },
      { fields: ['createdAt'],               name: 'idx_ubl_date' },
    ],
    fields: {
      id:          { type: 'uuid' },
      userId:      { type: 'uuid' },
      sessionId:   { type: 'string', description: 'Browser session identifier' },
      eventType:   { type: 'enum', enumValues: ['page_view', 'click', 'search', 'trade', 'purchase', 'dismiss', 'hover'] },
      targetType:  { type: 'enum', enumValues: ['strategy', 'bot', 'lesson', 'event', 'recommendation', 'page'] },
      targetId:    { type: 'string', nullable: true },
      metadata:    { type: 'json',   nullable: true, description: 'Extra context (scroll depth, time-on-page, etc.)' },
      createdAt:   { type: 'datetime' },
    },
    persistenceKey: 'cryptoverse_user_behavior_logs_v1',
    part:           9,
    store:          'aiRecommenderStore.ts',
  },
};

// ─── QUERY HELPERS ────────────────────────────────────────────────────────────

/** Get all tables defined in a specific part. */
export function getTablesByPart(part: number): TableDef[] {
  return Object.values(SCHEMA).filter(t => t.part === part);
}

/** Get all foreign keys that reference a given parent table. */
export function getForeignKeysTo(parentTable: string): Array<{ childTable: string; field: string; def: ForeignKey }> {
  const result: Array<{ childTable: string; field: string; def: ForeignKey }> = [];
  for (const [tableName, def] of Object.entries(SCHEMA)) {
    for (const fk of def.foreignKeys) {
      if (fk.refTable === parentTable) {
        result.push({ childTable: tableName, field: fk.field, def: fk });
      }
    }
  }
  return result;
}

/** Get all indexed fields across all tables (for performance planning). */
export function getAllIndexedFields(): Array<{ table: string; index: TableIndex }> {
  const result: Array<{ table: string; index: TableIndex }> = [];
  for (const [tableName, def] of Object.entries(SCHEMA)) {
    for (const idx of def.indexes) {
      result.push({ table: tableName, index: idx });
    }
  }
  return result;
}

/** Total table count. */
export const TOTAL_TABLES = Object.keys(SCHEMA).length;

/** Total index count across all tables. */
export const TOTAL_INDEXES = Object.values(SCHEMA).reduce((sum, t) => sum + t.indexes.length, 0);
