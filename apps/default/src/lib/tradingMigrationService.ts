/**
 * tradingMigrationService.ts — CryptoVerse HQ
 *
 * Priority 5: migrates genuinely per-user trading-related data to the shared
 * Taskade Users database, riding on the same generic per-user JSON sync
 * mechanism already used for Academy progress (syncStorage.ts's
 * syncKey/localCache/syncOnLogin, backed by the newly-registered @cv_data
 * field). The DB is the cross-device source of truth going forward;
 * localStorage remains the fast synchronous read path AND the offline
 * fallback — nothing here ever throws or blocks the UI, and no existing
 * store's action logic is touched (this file never imports into any of the
 * five stores below — it only observes them via zustand's `.subscribe()`
 * and `.getState()/.setState()`, so tradingStore/botStore/etc. behave
 * exactly as before whether or not this module is wired in).
 *
 * SCOPE — what is (and isn't) migrated, and why:
 *
 *   ✅ trading      — cv_trading_data_v1: balance, open positions, history
 *   ✅ bots         — cryptoverse_user_bots_v1 + cryptoverse_bot_executions_v1:
 *                     the user's bot list (config + performance) and its
 *                     trade execution log
 *   ✅ copyTrading  — cryptoverse_copy_relations_v1 + cryptoverse_copy_executions_v1:
 *                     who this user is copy-trading and the resulting fills
 *   ✅ marketplace  — cryptoverse_strategy_purchases_v1: strategies this
 *                     user purchased
 *   ✅ cpCoins      — cryptoverse_cp_coins_v1 + cryptoverse_cp_balance_v1:
 *                     this user's ledger + balance slice (both keys are
 *                     already Record<userId, ...> internally)
 *
 *   ❌ cryptoverse_copy_traders_v1 — the trader leaderboard/catalog: shared
 *      demo content, identical for every user, not owned by any one account.
 *   ❌ cryptoverse_strategies_v1 / _ratings_v1 — the marketplace catalog and
 *      public reviews: shared content, not per-user.
 *   ❌ cryptoverse_bot_grid_states_v1 / _mart_states_v1 / _dca_states_v1 /
 *      _arb_states_v1 / _rebal_states_v1 — live bot-ENGINE internals (active
 *      order slots, in-flight cycle state). These only make sense on the
 *      device actually running the bot's tick loop; syncing them cross-device
 *      would risk two tabs racing over the same in-flight state. Left
 *      device-local, same as before this migration.
 *
 * Note on scope granularity: several of these stores (trading, bots,
 * copy-trading relationships/executions, marketplace purchases) hold a
 * single flat table with no per-record user field at the storage layer —
 * exactly like the rest of this codebase, they assume one active user per
 * browser. This service mirrors "this browser's current table" for whichever
 * user is logged in at the time, consistent with that existing design. CP
 * coins is the one domain that's already keyed by userId internally, so only
 * the current user's slice of the ledger/balance map is synced.
 */

import { useAuthStore } from './authStore';
import { localCache, syncKey, syncOnLogin } from './syncStorage';
import { useTradingStore } from './tradingStore';
import { useBotStore } from './botStore';
import { useCopyTradingStore } from './copyTradingStore';
import { useStrategyStore } from './strategyStore';
import { useCpCoinsStore } from './cpCoinsStore';

const MIGRATED_FLAG_KEY = 'cryptoverse_trading_migrated';

function currentEmail(): string | null {
  try { return useAuthStore.getState().user?.email ?? null; } catch { return null; }
}
function currentUserId(): string | null {
  try { return useAuthStore.getState().user?.id ?? null; } catch { return null; }
}

interface Domain {
  name: string;
  read: () => Record<string, unknown> | null;
  write: (data: any) => void;
  isEmpty: (data: any) => boolean;
}

function tradingDomain(): Domain {
  return {
    name: 'trading',
    read: () => {
      const { balance, positions, history } = useTradingStore.getState();
      return { balance, positions, history };
    },
    write: (data) => {
      if (!data) return;
      const cur = useTradingStore.getState();
      useTradingStore.setState({
        balance:   typeof data.balance === 'number' ? data.balance : cur.balance,
        positions: Array.isArray(data.positions) ? data.positions : cur.positions,
        history:   Array.isArray(data.history) ? data.history : cur.history,
      });
    },
    // "Empty" = untouched default account (starting balance, no activity yet)
    isEmpty: (data) => !data || (!data.positions?.length && !data.history?.length && data.balance === 100_000),
  };
}

function botsDomain(): Domain {
  return {
    name: 'bots',
    read: () => {
      const { bots, executions } = useBotStore.getState();
      return { bots, executions };
    },
    write: (data) => {
      if (!data) return;
      const cur = useBotStore.getState();
      useBotStore.setState({
        bots:       data.bots && typeof data.bots === 'object' ? data.bots : cur.bots,
        executions: Array.isArray(data.executions) ? data.executions : cur.executions,
      });
    },
    isEmpty: (data) => !data?.bots || Object.keys(data.bots).length === 0,
  };
}

function copyTradingDomain(): Domain {
  return {
    name: 'copyTrading',
    read: () => {
      const { relationships, executions } = useCopyTradingStore.getState();
      return { relationships, executions };
    },
    write: (data) => {
      if (!data) return;
      const cur = useCopyTradingStore.getState();
      useCopyTradingStore.setState({
        relationships: data.relationships && typeof data.relationships === 'object' ? data.relationships : cur.relationships,
        executions:    data.executions && typeof data.executions === 'object' ? data.executions : cur.executions,
      });
    },
    isEmpty: (data) => !data?.relationships || Object.keys(data.relationships).length === 0,
  };
}

function marketplaceDomain(): Domain {
  return {
    name: 'marketplace',
    read: () => {
      const { purchases } = useStrategyStore.getState();
      return { purchases };
    },
    write: (data) => {
      if (!data) return;
      const cur = useStrategyStore.getState();
      useStrategyStore.setState({
        purchases: data.purchases && typeof data.purchases === 'object' ? data.purchases : cur.purchases,
      });
    },
    isEmpty: (data) => !data?.purchases || Object.keys(data.purchases).length === 0,
  };
}

function cpCoinsDomain(): Domain {
  return {
    name: 'cpCoins',
    read: () => {
      const uid = currentUserId();
      if (!uid) return null;
      const { ledger, balances } = useCpCoinsStore.getState();
      return { ledger: { [uid]: ledger[uid] ?? [] }, balances: { [uid]: balances[uid] ?? 0 } };
    },
    write: (data) => {
      const uid = currentUserId();
      if (!uid || !data) return;
      const cur = useCpCoinsStore.getState();
      useCpCoinsStore.setState({
        ledger:   { ...cur.ledger, [uid]: data.ledger?.[uid] ?? cur.ledger[uid] ?? [] },
        balances: { ...cur.balances, [uid]: typeof data.balances?.[uid] === 'number' ? data.balances[uid] : cur.balances[uid] },
      });
    },
    isEmpty: (data) => {
      const uid = currentUserId();
      return !uid || !data?.ledger?.[uid]?.length;
    },
  };
}

function allDomains(): Domain[] {
  return [tradingDomain(), botsDomain(), copyTradingDomain(), marketplaceDomain(), cpCoinsDomain()];
}

export interface TradingMigrationResult {
  migrated: string[];
  skipped:  string[];
}

/**
 * One-time bulk push: if this browser already had local trading/bot/copy/
 * marketplace/CP-coin data from before this migration existed, push it to
 * the DB once so it isn't stranded on a single device. Safe to call every
 * load — gated by a flag, and each domain independently skips if it looks
 * like an untouched default (nothing meaningful to push yet).
 */
export async function migrateTradingDataOnce(): Promise<TradingMigrationResult> {
  const result: TradingMigrationResult = { migrated: [], skipped: [] };
  try {
    if (localStorage.getItem(MIGRATED_FLAG_KEY) === 'true') return result;
    const email = currentEmail();
    if (!email) return result;

    for (const domain of allDomains()) {
      try {
        const local = domain.read();
        if (domain.isEmpty(local)) { result.skipped.push(domain.name); continue; }
        syncKey(email, domain.name, { ...local, updatedAt: new Date().toISOString() });
        result.migrated.push(domain.name);
      } catch {
        result.skipped.push(domain.name);
      }
    }
    localStorage.setItem(MIGRATED_FLAG_KEY, 'true');
  } catch {
    // leave the flag unset so it retries next load
  }
  return result;
}

/**
 * Pulls this user's trading data from the DB (call right after login/on an
 * existing session load). Only applies remote data into a domain when the
 * LOCAL slice for that domain is empty — so an active local session is never
 * clobbered by a stale or blank remote copy. This is how a second device
 * picks up data that was pushed from the first.
 */
export async function hydrateTradingData(email: string): Promise<void> {
  if (!email) return;
  try {
    await syncOnLogin(email);
    for (const domain of allDomains()) {
      const remote = localCache.get<any>(email, domain.name);
      if (!remote) continue;
      const local = domain.read();
      if (domain.isEmpty(local)) {
        domain.write(remote);
      }
    }
  } catch {
    // DB unreachable — local state stands, nothing lost
  }
}

let _mirrorsWired = false;

/**
 * Wires up debounced background sync for all five domains — call once
 * after login. From then on, every future change to trading/bots/copy-
 * trading/marketplace-purchases/CP-coins is mirrored to the DB automatically
 * (via the same 2s-debounced batching syncKey already uses elsewhere).
 * Safe to call more than once — no-ops after the first call.
 */
export function wireTradingMirrors(): void {
  if (_mirrorsWired) return;
  _mirrorsWired = true;

  const mirror = (domain: Domain) => {
    const email = currentEmail();
    if (!email) return;
    const data = domain.read();
    if (domain.isEmpty(data)) return;
    syncKey(email, domain.name, { ...data, updatedAt: new Date().toISOString() });
  };

  useTradingStore.subscribe(() => mirror(tradingDomain()));
  useBotStore.subscribe(() => mirror(botsDomain()));
  useCopyTradingStore.subscribe(() => mirror(copyTradingDomain()));
  useStrategyStore.subscribe(() => mirror(marketplaceDomain()));
  useCpCoinsStore.subscribe(() => mirror(cpCoinsDomain()));
}

/** Convenience: run the full login-time sequence in one call. */
export async function onTradingLogin(email: string): Promise<void> {
  if (!email) return;
  await migrateTradingDataOnce().catch(() => {});
  await hydrateTradingData(email).catch(() => {});
  wireTradingMirrors();
}
