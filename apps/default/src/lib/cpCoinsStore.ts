/**
 * cpCoinsStore.ts
 *
 * Manages the CP Coins virtual currency system for CryptoVerse HQ.
 *
 * CP Coins are the platform's internal currency used to:
 *   - Purchase strategies in the marketplace
 *   - Reward creators when their strategies are sold
 *   - Issue achievement, referral, and competition prizes
 *   - Allow admin grants and manual adjustments
 *
 * Architecture:
 *   - Per-user ledger stored in localStorage (key: cryptoverse_cp_coins_v1)
 *   - All mutations append an immutable CpTransaction record
 *   - Balance is always re-derived from the ledger (never stored separately)
 *     to prevent desyncs; for performance a cached balance snapshot is kept
 *   - The store is imported directly by strategyStore — NO circular deps
 */

import { create } from 'zustand';
import { cloudRecordStore } from './cloudData';
import {
  CpTransaction,
  CpTransactionType,
  CP_COINS_INITIAL_BALANCE,
} from './strategyTypes';
import { useTradingStore } from './tradingStore';
import { generateId } from './strategyUtils';

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENCE
// ─────────────────────────────────────────────────────────────────────────────

const LEDGER_KEY  = 'cryptoverse_cp_coins_v1';   // all transactions per user
const BALANCE_KEY = 'cryptoverse_cp_balance_v1'; // cached balance snapshots

type LedgerData    = Record<string, CpTransaction[]>;
type BalanceData   = Record<string, number>;

function loadLedger(): LedgerData {
  return cloudRecordStore.get<LedgerData>('wallet', LEDGER_KEY, {});
}
function saveLedger(data: LedgerData) {
  cloudRecordStore.set('wallet', LEDGER_KEY, data);
}

function loadBalances(): BalanceData {
  return cloudRecordStore.get<BalanceData>('wallet', BALANCE_KEY, {});
}
function saveBalances(data: BalanceData) {
  cloudRecordStore.set('wallet', BALANCE_KEY, data);
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface CpCoinsState {
  /** In-memory ledger: userId → sorted array of transactions (newest first) */
  ledger: LedgerData;

  /** Cached balances: userId → current balance */
  balances: BalanceData;

  // ── Queries ────────────────────────────────────────────────────────────────

  /** Returns the current CP coin balance for a user (0 for unknown users). */
  getBalance: (userId: string) => number;

  /** Returns the full transaction history for a user, newest first. */
  getHistory: (userId: string) => CpTransaction[];

  /** Returns only transactions of a specific type. */
  getHistoryByType: (userId: string, type: CpTransactionType) => CpTransaction[];

  /** Refreshes this user wallet from the server-authoritative CP API. */
  refreshFromServer: (userId: string) => Promise<void>;

  // ── Mutations ──────────────────────────────────────────────────────────────

  /**
   * Initialises a new user's CP coin wallet with the starting balance.
   * No-ops if the user already has a ledger entry.
   */
  initUser: (userId: string) => void;

  /**
   * Credits CP coins to a user's wallet.
   * Returns the new balance.
   */
  credit: (params: {
    userId:      string;
    amount:      number;
    type:        CpTransactionType;
    description: string;
    referenceId?: string;
  }) => number;

  /**
   * Debits CP coins from a user's wallet.
   * Returns { ok: true, newBalance } or { ok: false, error }.
   */
  debit: (params: {
    userId:      string;
    amount:      number;
    type:        CpTransactionType;
    description: string;
    referenceId?: string;
  }) => { ok: boolean; newBalance?: number; error?: string };

  /**
   * Transfers CP coins from one user to another atomically.
   * Used when a buyer purchases a strategy (debit buyer, credit seller + platform).
   * Returns { ok: true } or { ok: false, error }.
   */
  transfer: (params: {
    fromUserId:      string;
    toUserId:        string;
    amount:          number;                  // total sale price
    creatorAmount:   number;                  // after platform fee
    platformAmount:  number;                  // platform fee portion
    description:     string;
    referenceId?:    string;                  // e.g. purchaseId
  }) => { ok: boolean; error?: string };

  // ── Admin operations ───────────────────────────────────────────────────────

  /**
   * Admin manual credit — grants CP coins to any user.
   * Always succeeds regardless of balance.
   */
  adminGrant: (params: {
    userId:      string;
    amount:      number;
    description: string;
    adminId:     string;
  }) => number;

  /**
   * Admin manual debit — forcibly removes CP coins from a user.
   * Can reduce balance below zero (to handle penalty scenarios).
   */
  adminDeduct: (params: {
    userId:      string;
    amount:      number;
    description: string;
    adminId:     string;
  }) => number;

  /**
   * Withdraw CP coins to simulation trading balance.
   * Debits CP and credits the user's simulation balance.
   */
  withdraw: (params: {
    userId: string;
    amount: number;
  }) => { ok: boolean; error?: string };

  /**
   * Refund a strategy purchase.
   * Credits the buyer and debits the creator (if creatorAmount provided).
   */
  refundPurchase: (params: {
    buyerId: string;
    creatorId?: string;
    totalAmount: number;
    creatorAmount?: number;
    description: string;
    referenceId?: string;
  }) => { ok: boolean; error?: string };

  /**
   * Recalculates a user's balance from scratch by replaying their ledger.
   * Useful for consistency checks.
   */
  recomputeBalance: (userId: string) => number;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function makeTransaction(params: {
  userId:      string;
  type:        CpTransactionType;
  direction:   'credit' | 'debit';
  amount:      number;
  balanceAfter: number;
  description: string;
  referenceId?: string | null;
}): CpTransaction {
  return {
    id:           generateId(),
    userId:       params.userId,
    type:         params.type,
    direction:    params.direction,
    amount:       params.amount,
    balanceAfter: params.balanceAfter,
    description:  params.description,
    referenceId:  params.referenceId ?? null,
    createdAt:    new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// STORE
// ─────────────────────────────────────────────────────────────────────────────

export const useCpCoinsStore = create<CpCoinsState>((set, get) => {
  // Hydrate from the CloudDataLayer cache on first access
  const ledger   = loadLedger();
  const balances = loadBalances();

  return {
    ledger,
    balances,

    // ── Queries ──────────────────────────────────────────────────────────────

    getBalance: (userId) => {
      return get().balances[userId] ?? 0;
    },

    getHistory: (userId) => {
      return get().ledger[userId] ?? [];
    },

    getHistoryByType: (userId, type) => {
      return (get().ledger[userId] ?? []).filter(t => t.type === type);
    },

    refreshFromServer: async (userId) => {
      const [balanceResponse, ledgerResponse] = await Promise.all([
        fetch('https://cryptoversehq-os.onrender.com/api/cp/balance', { credentials: 'include', headers: { Accept: 'application/json' } }),
        fetch('https://cryptoversehq-os.onrender.com/api/cp/ledger', { credentials: 'include', headers: { Accept: 'application/json' } }),
      ]);
      if (!balanceResponse.ok || !ledgerResponse.ok) throw new Error('Unable to refresh CP wallet from server');
      const balanceBody = await balanceResponse.json();
      const ledgerBody = await ledgerResponse.json();
      const serverEntries = Array.isArray(ledgerBody?.entries) ? ledgerBody.entries : [];
      const transactions = serverEntries.map((entry: { id: string; amount: number | string; entry_type?: string; reference_key?: string | null; created_at: string }) => ({
        id: entry.id,
        userId,
        type: (entry.entry_type || 'subscription_reward') as CpTransactionType,
        direction: Number(entry.amount) >= 0 ? 'credit' : 'debit',
        amount: Math.abs(Number(entry.amount) || 0),
        balanceAfter: 0,
        description: entry.entry_type || 'CP ledger entry',
        referenceId: entry.reference_key ?? null,
        createdAt: entry.created_at,
      } satisfies CpTransaction));
      const newLedger = { ...get().ledger, [userId]: transactions };
      const newBalances = { ...get().balances, [userId]: Number(balanceBody?.balance) || 0 };
      saveLedger(newLedger);
      saveBalances(newBalances);
      set({ ledger: newLedger, balances: newBalances });
    },

    // ── Mutations ─────────────────────────────────────────────────────────────

    initUser: (userId) => {
      const { ledger, balances } = get();

      // Already initialised
      if (ledger[userId]) return;

      const balanceAfter = CP_COINS_INITIAL_BALANCE;
      const tx = makeTransaction({
        userId,
        type:         'subscription_reward',
        direction:    'credit',
        amount:       CP_COINS_INITIAL_BALANCE,
        balanceAfter,
        description:  `Welcome bonus — ${CP_COINS_INITIAL_BALANCE} CP Coins`,
      });

      const newLedger   = { ...ledger,   [userId]: [tx] };
      const newBalances = { ...balances, [userId]: balanceAfter };

      saveLedger(newLedger);
      saveBalances(newBalances);
      set({ ledger: newLedger, balances: newBalances });
    },

    credit: ({ userId, amount, type, description, referenceId }) => {
      const { ledger, balances } = get();

      if (amount <= 0) return balances[userId] ?? 0;

      const current     = balances[userId] ?? 0;
      const balanceAfter = current + amount;

      const tx = makeTransaction({
        userId, type, direction: 'credit', amount, balanceAfter, description, referenceId,
      });

      const userHistory = [tx, ...(ledger[userId] ?? [])];
      const newLedger   = { ...ledger,   [userId]: userHistory };
      const newBalances = { ...balances, [userId]: balanceAfter };

      saveLedger(newLedger);
      saveBalances(newBalances);
      set({ ledger: newLedger, balances: newBalances });

      return balanceAfter;
    },

    debit: ({ userId, amount, type, description, referenceId }) => {
      const { ledger, balances } = get();

      if (amount <= 0) {
        return { ok: true, newBalance: balances[userId] ?? 0 };
      }

      const current = balances[userId] ?? 0;

      if (current < amount) {
        return {
          ok: false,
          error: `Insufficient CP Coins. Balance: ${current}, Required: ${amount}.`,
        };
      }

      const balanceAfter = current - amount;
      const tx = makeTransaction({
        userId, type, direction: 'debit', amount, balanceAfter, description, referenceId,
      });

      const userHistory = [tx, ...(ledger[userId] ?? [])];
      const newLedger   = { ...ledger,   [userId]: userHistory };
      const newBalances = { ...balances, [userId]: balanceAfter };

      saveLedger(newLedger);
      saveBalances(newBalances);
      set({ ledger: newLedger, balances: newBalances });

      return { ok: true, newBalance: balanceAfter };
    },

    transfer: ({ fromUserId, toUserId, amount, creatorAmount, platformAmount, description, referenceId }) => {
      const { ledger, balances } = get();

      const fromBalance = balances[fromUserId] ?? 0;
      if (fromBalance < amount) {
        return {
          ok: false,
          error: `Insufficient CP Coins. Balance: ${fromBalance}, Required: ${amount}.`,
        };
      }

      // Debit buyer
      const buyerAfter = fromBalance - amount;
      const buyerTx = makeTransaction({
        userId: fromUserId, type: 'purchase_strategy', direction: 'debit',
        amount, balanceAfter: buyerAfter, description, referenceId,
      });

      // Credit creator
      const creatorBalance = balances[toUserId] ?? 0;
      const creatorAfter   = creatorBalance + creatorAmount;
      const creatorTx = makeTransaction({
        userId: toUserId, type: 'sell_strategy', direction: 'credit',
        amount: creatorAmount, balanceAfter: creatorAfter,
        description: `${description} (creator share)`, referenceId,
      });

      // Record platform fee as a deduction note on buyer's ledger
      const platformTx = makeTransaction({
        userId: fromUserId, type: 'platform_fee', direction: 'debit',
        amount: 0, // informational entry; amount already included in buyer debit
        balanceAfter: buyerAfter,
        description: `Platform fee: ${platformAmount} CP`, referenceId,
      });

      const newLedger = {
        ...ledger,
        [fromUserId]: [platformTx, buyerTx,  ...(ledger[fromUserId] ?? [])],
        [toUserId]:   [creatorTx, ...(ledger[toUserId] ?? [])],
      };
      const newBalances = {
        ...balances,
        [fromUserId]: buyerAfter,
        [toUserId]:   creatorAfter,
      };

      saveLedger(newLedger);
      saveBalances(newBalances);
      set({ ledger: newLedger, balances: newBalances });

      return { ok: true };
    },

    // ── Admin operations ──────────────────────────────────────────────────────

    adminGrant: ({ userId, amount, description, adminId }) => {
      const { ledger, balances } = get();

      const current     = balances[userId] ?? 0;
      const balanceAfter = current + amount;

      const tx = makeTransaction({
        userId,
        type:         'admin_grant',
        direction:    'credit',
        amount,
        balanceAfter,
        description:  `Admin grant by ${adminId}: ${description}`,
        referenceId:  adminId,
      });

      const newLedger   = { ...ledger,   [userId]: [tx, ...(ledger[userId] ?? [])] };
      const newBalances = { ...balances, [userId]: balanceAfter };

      saveLedger(newLedger);
      saveBalances(newBalances);
      set({ ledger: newLedger, balances: newBalances });

      return balanceAfter;
    },

    adminDeduct: ({ userId, amount, description, adminId }) => {
      const { ledger, balances } = get();

      const current     = balances[userId] ?? 0;
      const balanceAfter = Math.max(0, current - amount);

      const tx = makeTransaction({
        userId,
        type:         'admin_deduct',
        direction:    'debit',
        amount:       Math.min(amount, current),
        balanceAfter,
        description:  `Admin deduction by ${adminId}: ${description}`,
        referenceId:  adminId,
      });

      const newLedger   = { ...ledger,   [userId]: [tx, ...(ledger[userId] ?? [])] };
      const newBalances = { ...balances, [userId]: balanceAfter };

      saveLedger(newLedger);
      saveBalances(newBalances);
      set({ ledger: newLedger, balances: newBalances });

      return balanceAfter;
    },

    withdraw: ({ userId, amount }) => {
      const result = get().debit({
        userId,
        amount,
        type: 'withdraw_to_balance',
        description: `Withdraw ${amount} CP to simulation balance`,
      });

      if (!result.ok) return result;

      useTradingStore.getState().addSimulationBalance(amount);

      return { ok: true };
    },

    refundPurchase: ({ buyerId, creatorId, totalAmount, creatorAmount, description, referenceId }) => {
      const { ledger, balances } = get();

      // Credit the buyer
      const buyerBalance = balances[buyerId] ?? 0;
      const buyerAfter = buyerBalance + totalAmount;
      const buyerTx = makeTransaction({
        userId: buyerId,
        type: 'refund_strategy',
        direction: 'credit',
        amount: totalAmount,
        balanceAfter: buyerAfter,
        description: `Refund: ${description}`,
        referenceId: referenceId ?? null,
      });

      const newLedger: LedgerData = { ...ledger, [buyerId]: [buyerTx, ...(ledger[buyerId] ?? [])] };
      const newBalances: BalanceData = { ...balances, [buyerId]: buyerAfter };

      // If creator amount provided, debit the creator
      if (creatorId && creatorAmount && creatorAmount > 0) {
        const creatorBalance = newBalances[creatorId] ?? 0;
        const creatorAfter = Math.max(0, creatorBalance - creatorAmount);
        const creatorTx = makeTransaction({
          userId: creatorId,
          type: 'refund_strategy',
          direction: 'debit',
          amount: Math.min(creatorAmount, creatorBalance),
          balanceAfter: creatorAfter,
          description: `Refund reversal: ${description}`,
          referenceId: referenceId ?? null,
        });

        newLedger[creatorId] = [creatorTx, ...(newLedger[creatorId] ?? [])];
        newBalances[creatorId] = creatorAfter;
      }

      saveLedger(newLedger);
      saveBalances(newBalances);
      set({ ledger: newLedger, balances: newBalances });

      return { ok: true };
    },

    recomputeBalance: (userId) => {
      const { ledger, balances } = get();
      const history = ledger[userId] ?? [];

      // Replay from oldest to newest (history is newest-first, so reverse)
      const sorted = [...history].reverse();
      let balance = 0;

      for (const tx of sorted) {
        if (tx.direction === 'credit') {
          balance += tx.amount;
        } else {
          balance -= tx.amount;
        }
      }

      const recomputed = Math.max(0, Math.round(balance * 100) / 100);

      if (recomputed !== (balances[userId] ?? 0)) {
        const newBalances = { ...balances, [userId]: recomputed };
        saveBalances(newBalances);
        set({ balances: newBalances });
      }

      return recomputed;
    },
  };
});
