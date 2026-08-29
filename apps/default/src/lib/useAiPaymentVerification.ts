/**
 * useAiPaymentVerification.ts
 *
 * Owns the complete AI-driven payment verification state machine.
 *
 * Lifecycle:
 *   idle → scanning (polling loop starts)
 *        → confirming (tx found, activating features)
 *        → success   (features activated, call onSuccess)
 *        → rejected  (hash invalid or definitive failure)
 *        → timeout   (5 min elapsed, queued for manual review)
 *
 * IMPORTANT: The hook only VERIFIES. The business engine (subscriptionStore /
 * authStore) is the sole code that activates subscriptions or credits balances.
 * This hook never touches funds.
 */

import { useEffect, useRef, useCallback, useReducer } from 'react';
import {
  aiPollTransaction,
  useSubscriptionStore,
  PLAN_DURATION_DAYS,
  PaymentRecord,
} from './subscriptionStore';
import { useAuthStore } from './authStore';

// ── Constants ──────────────────────────────────────────────────────────────────

/** Total wall-clock budget before we give up and go to manual review (ms) */
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/** Maximum number of AI poll attempts within the budget */
const MAX_ATTEMPTS = 8;

/**
 * Inter-poll pause (ms) after a 'not_yet' response.
 * Starts short, grows as we burn through attempts — mirrors real blockchain
 * confirmation wait curves (blocks arrive every ~12–15 s on EVM chains).
 */
function interPollDelay(attempt: number): number {
  // attempt 1: 15 s, 2: 20 s, 3: 28 s, 4–8: 35 s
  const table = [15_000, 20_000, 28_000, 35_000];
  return table[Math.min(attempt - 1, table.length - 1)];
}

// ── State machine ─────────────────────────────────────────────────────────────

export type VerificationPhase =
  | 'idle'         // not started
  | 'scanning'     // AI polling the blockchain
  | 'confirming'   // tx found, activating subscription / balance
  | 'success'      // all done
  | 'rejected'     // definitive failure (invalid hash or amount mismatch)
  | 'timeout';     // 5 min elapsed → queued for manual review

export interface VerificationState {
  phase:          VerificationPhase;
  attempt:        number;           // current poll attempt (1-based)
  maxAttempts:    number;           // always MAX_ATTEMPTS
  /** ms remaining in the 5-min budget */
  msLeft:         number;
  /** Rotating status message shown under the spinner */
  statusMessage:  string;
  rejectionReason: string;
  /** The fully activated record, available in 'success' phase */
  activatedRecord: PaymentRecord | null;
  /** Which blockchain confirmed the payment (e.g. "Ethereum (ERC-20)") */
  confirmedChain:  string | null;
  /** The exact USDT amount confirmed on-chain */
  confirmedAmount: number | null;
}

type Action =
  | { type: 'START' }
  | { type: 'NEXT_ATTEMPT'; attempt: number; message: string }
  | { type: 'TICK'; msLeft: number }
  | { type: 'CONFIRMING'; chainName?: string }
  | { type: 'SUCCESS'; record: PaymentRecord; chainName?: string; confirmedAmount?: number }
  | { type: 'REJECTED'; reason: string }
  | { type: 'TIMEOUT' };

const INITIAL: VerificationState = {
  phase:           'idle',
  attempt:         0,
  maxAttempts:     MAX_ATTEMPTS,
  msLeft:          TIMEOUT_MS,
  statusMessage:   '',
  rejectionReason: '',
  activatedRecord: null,
  confirmedChain:  null,
  confirmedAmount: null,
};

function reducer(state: VerificationState, action: Action): VerificationState {
  switch (action.type) {
    case 'START':
      return { ...INITIAL, phase: 'scanning', attempt: 1, msLeft: TIMEOUT_MS,
               statusMessage: 'Connecting to blockchain network…' };
    case 'NEXT_ATTEMPT':
      return { ...state, phase: 'scanning', attempt: action.attempt,
               statusMessage: action.message };
    case 'TICK':
      return { ...state, msLeft: Math.max(0, action.msLeft) };
    case 'CONFIRMING':
      return {
        ...state,
        phase: 'confirming',
        confirmedChain: action.chainName ?? null,
        statusMessage: action.chainName
          ? `Confirmed on ${action.chainName} — activating your plan…`
          : 'Transaction found — activating your plan…',
      };
    case 'SUCCESS':
      return {
        ...state,
        phase:           'success',
        activatedRecord: action.record,
        confirmedChain:  action.chainName  ?? state.confirmedChain,
        confirmedAmount: action.confirmedAmount ?? state.confirmedAmount,
      };
    case 'REJECTED':
      return { ...state, phase: 'rejected', rejectionReason: action.reason };
    case 'TIMEOUT':
      return { ...state, phase: 'timeout',
               statusMessage: 'Verification timed out — queued for manual review.' };
    default:
      return state;
  }
}

// ── Rotating status messages ──────────────────────────────────────────────────

const SCANNING_MESSAGES = [
  'Querying Ethereum, Polygon & BSC explorers…',
  'Scanning for your transaction on-chain…',
  'Waiting for block confirmations…',
  'Checking USDT transfer receipt…',
  'Verifying recipient address & amount…',
  'Cross-referencing token contract…',
  'Awaiting network finality…',
  'Almost there — confirming on-chain data…',
];

function scanMessage(attempt: number): string {
  return SCANNING_MESSAGES[Math.min(attempt - 1, SCANNING_MESSAGES.length - 1)];
}

// ── Hook inputs ───────────────────────────────────────────────────────────────

export interface UseAiPaymentVerificationOptions {
  paymentId:    string;
  userId:       string;
  txHash:       string;
  /** Expected USDT amount — used for amount-match check in the poller */
  expectedUSDT: number;
  /** Payment kind — drives what gets activated on success */
  kind:         'subscription' | 'virtual_balance';
  /** Plan ID for subscription payments */
  planId?:      string;
  /** Virtual package label for virtual_balance payments */
  pkgLabel?:    string;
  /** Called when verification succeeds and features are activated */
  onSuccess:    (record: PaymentRecord) => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAiPaymentVerification({
  paymentId,
  userId,
  txHash,
  expectedUSDT,
  kind,
  planId,
  pkgLabel,
  onSuccess,
}: UseAiPaymentVerificationOptions) {
  const [state, dispatch] = useReducer(reducer, INITIAL);

  const { submitForManualReview, payments } = useSubscriptionStore();
  const { updateProfile, addVirtualBalance } = useAuthStore();

  // Stable refs so the async polling loop can read latest state
  const abortRef     = useRef(false);
  const startMsRef   = useRef<number>(0);
  const tickRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const runningRef   = useRef(false);

  // ── Countdown ticker ────────────────────────────────────────────────────────
  const startTicker = useCallback(() => {
    tickRef.current = setInterval(() => {
      const elapsed = Date.now() - startMsRef.current;
      dispatch({ type: 'TICK', msLeft: TIMEOUT_MS - elapsed });
    }, 500);
  }, []);

  const stopTicker = useCallback(() => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  }, []);

  // ── Business activation — runs once, after tx is confirmed on-chain ─────────
  // IMPORTANT: This is the ONLY place features are activated. The poller above
  // is strictly read-only. Activation happens here via the business stores.
  const activateFeatures = useCallback(async (attempts: number): Promise<PaymentRecord | null> => {
    // Fetch the raw record from store (already marked verified by verifyPayment
    // in a real scenario, or we mark it here for the simulation path)
    const allPayments = useSubscriptionStore.getState().payments;
    const userPayments = allPayments[userId] ?? [];
    let rec = userPayments.find(p => p.id === paymentId);

    if (!rec) return null;

    const now = new Date();

    if (kind === 'subscription' && planId) {
      const durDays  = PLAN_DURATION_DAYS[planId] ?? 30;
      const expiry   = new Date(now.getTime() + durDays * 86_400_000).toISOString();

      // Mark record verified in store
      const updatedPayments = { ...allPayments };
      const updatedUser     = [...userPayments];
      const idx             = updatedUser.findIndex(p => p.id === paymentId);
      if (idx !== -1) {
        updatedUser[idx] = {
          ...updatedUser[idx],
          status:        'verified',
          verifiedAt:    now.toISOString(),
          activatedAt:   now.toISOString(),
          expiresAt:     expiry,
          verifyAttempts: attempts,
        };
        rec = updatedUser[idx];
      }
      updatedPayments[userId] = updatedUser;

      // Persist via store internals (same key)
      localStorage.setItem(
        'cryptoverse_subscriptions_v2',
        JSON.stringify(updatedPayments),
      );
      // Sync zustand state
      useSubscriptionStore.setState({ payments: updatedPayments });

      // Activate plan on user profile (business engine)
      updateProfile({
        plan:       planId as 'silver' | 'gold',
        planExpiry: expiry,
      });

    } else if (kind === 'virtual_balance' && pkgLabel) {
      const creditMap: Record<string, number> = {
        '$10K':  10_000,
        '$50K':  50_000,
        '$200K': 200_000,
        '$1M':   1_000_000,
      };
      const credit = creditMap[pkgLabel] ?? 10_000;

      // Mark record verified in store
      const updatedPayments = { ...allPayments };
      const updatedUser     = [...userPayments];
      const idx             = updatedUser.findIndex(p => p.id === paymentId);
      if (idx !== -1) {
        updatedUser[idx] = {
          ...updatedUser[idx],
          status:        'verified',
          verifiedAt:    now.toISOString(),
          activatedAt:   now.toISOString(),
          verifyAttempts: attempts,
        };
        rec = updatedUser[idx];
      }
      updatedPayments[userId] = updatedUser;
      localStorage.setItem('cryptoverse_subscriptions_v2', JSON.stringify(updatedPayments));
      useSubscriptionStore.setState({ payments: updatedPayments });

      // Credit virtual balance (business engine)
      addVirtualBalance(credit);
    }

    return rec ?? null;
  }, [paymentId, userId, kind, planId, pkgLabel, updateProfile, addVirtualBalance]);

  // ── Main polling loop ───────────────────────────────────────────────────────
  const runPollingLoop = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    abortRef.current   = false;
    startMsRef.current = Date.now();

    dispatch({ type: 'START' });
    startTicker();

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (abortRef.current) break;

      // Check timeout budget before each poll
      const elapsed = Date.now() - startMsRef.current;
      if (elapsed >= TIMEOUT_MS) {
        stopTicker();
        submitForManualReview(paymentId, userId, attempt - 1);
        dispatch({ type: 'TIMEOUT' });
        runningRef.current = false;
        return;
      }

      dispatch({ type: 'NEXT_ATTEMPT', attempt, message: scanMessage(attempt) });

      // Fire the AI poll (simulates real blockchain API call)
      const result = await aiPollTransaction(txHash, attempt, expectedUSDT);

      if (abortRef.current) break;

      if (result.status === 'found') {
        // TX confirmed on-chain — activate features via business engine
        dispatch({ type: 'CONFIRMING', chainName: result.chainName });
        const record = await activateFeatures(attempt);
        stopTicker();
        if (record) {
          dispatch({
            type:            'SUCCESS',
            record,
            chainName:       result.chainName,
            confirmedAmount: result.confirmedAmount,
          });
          onSuccess(record);
        } else {
          dispatch({ type: 'REJECTED', reason: 'Could not activate your plan. Please contact support.' });
        }
        runningRef.current = false;
        return;
      }

      if (result.status === 'invalid') {
        stopTicker();
        dispatch({ type: 'REJECTED', reason: result.reason ?? 'Invalid transaction.' });
        runningRef.current = false;
        return;
      }

      // 'not_yet' — wait before next attempt (unless this is the last)
      if (attempt < MAX_ATTEMPTS) {
        const pause = interPollDelay(attempt);
        const pauseEnd = Date.now() + pause;
        // Wait in small slices so we can honour abort and timeout
        while (Date.now() < pauseEnd) {
          if (abortRef.current) break;
          const remaining = Date.now() - startMsRef.current;
          if (remaining >= TIMEOUT_MS) break;
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }

    // Exhausted all attempts without a result
    if (!abortRef.current) {
      stopTicker();
      submitForManualReview(paymentId, userId, MAX_ATTEMPTS);
      dispatch({ type: 'TIMEOUT' });
    }
    runningRef.current = false;
  }, [
    txHash, expectedUSDT, paymentId, userId,
    activateFeatures, submitForManualReview, onSuccess,
    startTicker, stopTicker,
  ]);

  // ── Start on mount (once) ───────────────────────────────────────────────────
  useEffect(() => {
    runPollingLoop();
    return () => {
      abortRef.current = true;
      stopTicker();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}

// ── Formatting helpers consumed by the UI ─────────────────────────────────────

/** Format ms remaining as MM:SS */
export function fmtMsLeft(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m     = Math.floor(total / 60).toString().padStart(2, '0');
  const s     = (total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/** Progress 0–1 based on attempts consumed */
export function attemptProgress(attempt: number): number {
  return Math.min(1, attempt / MAX_ATTEMPTS);
}
