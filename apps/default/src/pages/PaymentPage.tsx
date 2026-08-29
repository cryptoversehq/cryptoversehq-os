/**
 * PaymentPage.tsx — /payment/checkout?plan=silver|gold|platinum  OR  ?type=cp&pkg=starter|trader|whale|institution
 *
 * Fully internal crypto payment page (no redirect to NOWPayments hosted page).
 * This is the SINGLE payment method for the whole app — subscriptions
 * (SubscriptionPage) and CP purchases (BuyCPPage) both route here instead of
 * each rolling their own checkout UI. Previously BuyCPPage redirected out to
 * NOWPayments' hosted `nowpayments.io/payment/?iid=...` page while
 * SubscriptionPage used this internal page — two different payment
 * experiences for the same underlying NOWPayments integration. Now both use
 * this page exclusively.
 *
 * Flow:
 *   Step 1 — Choose payment currency (USDT TRC20 default; BTC / ETH / BNB optional)
 *   Step 2 — Address screen: network, full address + one-click copy, exact amount,
 *            QR code, 15-minute countdown, share button, "Check Payment" button.
 *
 * Payment confirmation happens two ways:
 *   • Automatically via the NOWPayments IPN webhook (server-side, logs only)
 *   • Manually via the "Check Payment" button (client polls payment status —
 *     this is the path that actually activates the plan / credits CP; see
 *     handleCheck() below)
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck, Copy, Check, Share2, RefreshCw, Loader2, ArrowLeft,
  Wallet, Network, Coins, AlertTriangle, CheckCircle2, ExternalLink, History,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/authStore';
import { useMonetizationStore, useLiveSubscriptionPlans, useLiveCpPackages, PlanId } from '@/lib/monetizationStore';
import { useCpCoinsStore } from '@/lib/cpCoinsStore';
import { useNowPaymentsStore, LocalPaymentRecord, HARD_TIMEOUT_MINUTES } from '@/lib/nowPaymentsStore';
import { NOWPAYMENTS_PAY_CURRENCIES, getPayCurrencyMeta, fmtPayAmount } from '@/lib/nowPaymentsClient';
import { PaymentQR, PaymentCountdown } from '@/components/payment/PaymentQR';
import { sendPaymentReminderEmail } from '@/lib/paymentReminder';

const PLAN_ACCENT: Record<string, string> = {
  silver:   '#94a3b8',
  gold:     '#f59e0b',
  platinum: '#7c3aed',
};

function getCpDiscount(planId: string): number {
  if (planId === 'platinum') return 0.20;
  if (planId === 'gold')     return 0.10;
  return 0;
}

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60000)    return `${Math.floor(d / 1000)}s ago`;
  if (d < 3600000)  return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

// ─── Copyable row ─────────────────────────────────────────────────────────────
function CopyRow({ label, value, display, mono = true }: { label: string; value: string; display?: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value).then(
      () => { setCopied(true); toast.success(`${label} copied`); setTimeout(() => setCopied(false), 2000); },
      () => toast.error('Copy failed — please copy manually'),
    );
  }
  return (
    <div className="space-y-1">
      <p className="text-[10px] text-white/35 uppercase tracking-widest font-semibold">{label}</p>
      <div className="flex items-center gap-2">
        <code className={cn('flex-1 text-xs text-white/85 bg-black/25 rounded-xl px-3 py-2.5 break-all leading-relaxed', mono && 'font-mono')}>
          {display ?? value}
        </code>
        <button
          onClick={copy}
          aria-label={`Copy ${label}`}
          className="shrink-0 p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/8 transition-all"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4 text-white/50" />}
        </button>
      </div>
    </div>
  );
}

// ─── Unified payment item (subscription plan OR CP package) ───────────────────
interface PaymentItem {
  kind:      'subscription' | 'cp';
  id:        string;
  name:      string;
  emoji:     string;
  priceUSD:  number;
  cpAmount?: number;
}

// ─── Main page ────────────────────────────────────────────────────────────────
export function PaymentPage() {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const { user }       = useAuthStore();
  const { upgradePlan, getUserPlan } = useMonetizationStore();
  const { credit: creditCp } = useCpCoinsStore();
  const {
    initiateCheckout, initiateCpCheckout, pollPayment, markFailed, cancelPayment, reconcileStalePayments,
    getPendingPayment, getPaymentsByUser, checkoutStatus,
  } = useNowPaymentsStore();

  const userId = user?.id ?? 'demo_user';

  const isCpRequest = searchParams.get('type') === 'cp';
  const planParam   = (searchParams.get('plan') ?? '') as PlanId;
  const pkgParam    = searchParams.get('pkg') ?? '';

  const livePlans    = useLiveSubscriptionPlans(); // priceUSD reflects any admin override (see /admin/settings)
  const livePackages = useLiveCpPackages();

  const subscriptionPlan = !isCpRequest ? livePlans.find(p => p.id === planParam && p.priceUSD > 0) : undefined;
  const cpPackageRaw      = isCpRequest ? livePackages.find(p => p.id === pkgParam) : undefined;

  const userCurrentPlan = getUserPlan(userId);
  const cpDiscount      = getCpDiscount(userCurrentPlan);
  const cpFinalPriceUSD = cpPackageRaw ? +(cpPackageRaw.priceUSD * (1 - cpDiscount)).toFixed(2) : 0;

  const item: PaymentItem | null = subscriptionPlan
    ? { kind: 'subscription', id: subscriptionPlan.id, name: `${subscriptionPlan.name} Plan`, emoji: subscriptionPlan.emoji, priceUSD: subscriptionPlan.priceUSD }
    : cpPackageRaw
      ? { kind: 'cp', id: cpPackageRaw.id, name: cpPackageRaw.name, emoji: cpPackageRaw.emoji, priceUSD: cpFinalPriceUSD, cpAmount: cpPackageRaw.cpAmount }
      : null;

  // The key used to look up / store this item's pending payment record —
  // matches the itemId convention nowPaymentsStore already used (`cp_<id>`
  // for CP packages, plain plan id for subscriptions) so in-flight payments
  // created before this refactor still resolve correctly.
  const paymentItemId = item ? (item.kind === 'cp' ? `cp_${item.id}` : item.id) : '';

  const accent = item?.kind === 'subscription' ? (PLAN_ACCENT[item.id] ?? '#6366f1') : '#6366f1';
  const backRoute = isCpRequest ? '/buy-cp' : '/subscription';

  const [payCurrency, setPayCurrency] = useState('usdttrc20');
  const [creating, setCreating]       = useState(false);
  const [checking, setChecking]       = useState(false);
  const [expired, setExpired]         = useState(false);
  const [cancelled, setCancelled]     = useState(false);
  const [completed, setCompleted]     = useState(false);

  // Backstop: force-expire any payment stuck 'pending' past HARD_TIMEOUT_MINUTES
  // (e.g. the tab was closed before the 15-min on-screen countdown ever fired),
  // so a checkout can never sit "awaiting confirmation" forever.
  useEffect(() => { reconcileStalePayments(); }, [reconcileStalePayments]);

  // Resume a still-valid pending payment for this item after a reload
  const pending: LocalPaymentRecord | undefined = item ? getPendingPayment(userId, paymentItemId) : undefined;
  const active = pending && pending.expiresAt && new Date(pending.expiresAt).getTime() > Date.now() && !expired && !cancelled
    ? pending
    : undefined;

  const history = useMemo(
    () => getPaymentsByUser(userId).slice(0, 5),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, checkoutStatus, completed, expired, cancelled],
  );

  const meta = getPayCurrencyMeta(active?.payCurrency ?? payCurrency);

  // Invalid / missing plan or package → back to the picking page
  useEffect(() => {
    if (!item) navigate(backRoute, { replace: true });
  }, [item, navigate, backRoute]);

  const handleExpire = useCallback(() => {
    if (active) markFailed(active.orderId, 'expired');
    setExpired(true);
  }, [active, markFailed]);

  // ── "you left before paying" reminder email ──────────────────────────────
  // If the user backgrounds/closes the tab while a payment address is still
  // open (not completed, not expired), email them the address/amount so
  // they can finish later. Fires at most once per order.
  const reminderSentRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!active?.payAddress || !user?.email || !item) return;
    const orderId = active.orderId;

    function handleVisibility() {
      if (document.visibilityState !== 'hidden') return;
      if (reminderSentRef.current.has(orderId)) return;
      reminderSentRef.current.add(orderId);
      sendPaymentReminderEmail({
        email:       user!.email,
        displayName: user!.displayName,
        planName:    item!.name,
        priceUSD:    item!.priceUSD,
        payAddress:  active!.payAddress!,
        network:     meta.network,
        payAmount:   active!.payAmount != null ? fmtPayAmount(active!.payAmount, meta.value) : undefined,
        checkoutUrl: `${window.location.origin}${window.location.pathname}${window.location.search}`,
      });
    }

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [active, user, item, meta]);

  if (!item) return null;

  async function handleCreate() {
    if (!item) return;
    if (!user) { toast.error('Please sign in to continue'); return; }
    setCreating(true);
    setExpired(false);

    const result = item.kind === 'subscription'
      ? await initiateCheckout({
          userId,
          itemId:      item.id,
          amountUSD:   item.priceUSD,
          itemLabel:   item.name,
          payCurrency,
          userEmail:   user?.email,
          userName:    user?.displayName,
        })
      : await initiateCpCheckout({
          userId,
          packageId:    item.id,
          cpAmount:     item.cpAmount ?? 0,
          amountUSD:    item.priceUSD,
          packageLabel: `${item.name} — ${(item.cpAmount ?? 0).toLocaleString()} CP`,
          payCurrency,
          userEmail:    user?.email,
          userName:     user?.displayName,
        });

    setCreating(false);
    if (!result.ok) {
      toast.error(result.error ?? 'Could not create payment. Please try again.');
      return;
    }
    toast.success('Payment address generated');
  }

  async function handleCheck() {
    if (!item || !active) return;
    setChecking(true);
    const status = await pollPayment(active.orderId);
    setChecking(false);

    if (status === 'completed') {
      if (item.kind === 'subscription') {
        upgradePlan(userId, item.id as PlanId, true, 'crypto'); // paid in USD — activate without CP debit
        setTimeout(() => window.location.reload(), 1000);
      } else {
        creditCp({
          userId,
          amount:      item.cpAmount ?? 0,
          type:        'cp_purchase',
          description: `${item.name} — ${(item.cpAmount ?? 0).toLocaleString()} CP`,
          referenceId: active.paymentId,
        });
      }
      setCompleted(true);
      toast.success(item.kind === 'subscription' ? `Payment confirmed — welcome to ${item.name}!` : `Payment confirmed — ${(item.cpAmount ?? 0).toLocaleString()} CP credited!`);
    } else if (status === 'expired') {
      setExpired(true);
      toast.error('This payment expired. Please generate a new address.');
    } else if (status === 'failed') {
      toast.error('Payment failed. Please generate a new address or contact support.');
    } else {
      toast.info('Payment not detected yet. Blockchain confirmation can take a few minutes — try again shortly.');
    }
  }

  function handleCancel() {
    if (!active) return;
    cancelPayment(active.orderId);
    setCancelled(true);
    toast.info('Payment request cancelled. You can start a new one anytime.');
  }

  function handleRetry() {
    setExpired(false);
    setCancelled(false);
  }

  async function handleShare() {
    if (!item || !active?.payAddress) return;
    const text =
      `CryptoVerse HQ — ${item.name} payment\n` +
      `Network: ${meta.network}\n` +
      `Amount: ${active.payAmount != null ? fmtPayAmount(active.payAmount, meta.value) : `$${item.priceUSD} in ${meta.symbol}`}\n` +
      `Address: ${active.payAddress}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'CryptoVerse HQ Payment', text }); } catch { /* user cancelled */ }
    } else {
      navigator.clipboard.writeText(text).catch(() => {});
      toast.success('Payment details copied — paste them in your messenger');
    }
  }

  // ─── Success screen ─────────────────────────────────────────────────────────
  if (completed) {
    return (
      <div className="min-h-full flex items-center justify-center p-6">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md text-center space-y-6 rounded-3xl border border-emerald-500/25 p-8"
          style={{ background: 'rgba(16,185,129,0.05)' }}>
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-400" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-black text-white">Payment Confirmed 🎉</h1>
            <p className="text-sm text-white/50">
              {item.kind === 'subscription' ? (
                <>Your <span className="font-bold" style={{ color: accent }}>{item.name}</span> is now active.</>
              ) : (
                <><span className="font-bold" style={{ color: accent }}>{(item.cpAmount ?? 0).toLocaleString()} CP</span> has been added to your balance.</>
              )}
              {' '}A receipt has been recorded in your payment history.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => navigate(backRoute)}
              className="py-3 rounded-2xl bg-white/5 text-white/60 text-sm font-bold hover:bg-white/10 border border-white/10 transition-all">
              {item.kind === 'subscription' ? 'View Plans' : 'Buy More CP'}
            </button>
            <button onClick={() => navigate('/dashboard')}
              className="py-3 rounded-2xl text-sm font-bold text-white transition-all hover:brightness-110"
              style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }}>
              Go to Dashboard
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-full p-4 md:p-6 text-white">
      <div className="max-w-lg mx-auto space-y-4">

        {/* Back */}
        <button onClick={() => navigate(backRoute)}
          className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> {item.kind === 'subscription' ? 'Back to plans' : 'Back to CP packages'}
        </button>

        {/* Secure-mode banner */}
        <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-500/20 px-4 py-3"
          style={{ background: 'rgba(16,185,129,0.05)' }}>
          <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
          <p className="text-xs text-emerald-300/80">
            Your payment is completely secure. Addresses are generated per-order and confirmed on-chain.
          </p>
        </div>

        {/* Order summary */}
        <div className="rounded-3xl border p-5 space-y-4"
          style={{ borderColor: `${accent}35`, background: 'rgba(255,255,255,0.03)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-3xl">{item.emoji}</div>
              <div>
                <h1 className="text-base font-black">{item.name}</h1>
                <p className="text-[11px] text-white/35">
                  {item.kind === 'subscription' ? 'Monthly subscription · CryptoVerse HQ' : `${(item.cpAmount ?? 0).toLocaleString()} CP · CryptoVerse HQ`}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black" style={{ color: accent }}>${item.priceUSD}</p>
              <p className="text-[10px] text-white/35">{item.kind === 'subscription' ? 'per month' : 'one-time'}</p>
            </div>
          </div>

          {/* ── Step 1: currency selection ── */}
          {!active && (
            <>
              <div className="h-px bg-white/6" />
              <div className="space-y-2">
                <p className="text-[10px] text-white/35 uppercase tracking-widest font-semibold flex items-center gap-1.5">
                  <Coins className="h-3 w-3" /> Pay with
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {NOWPAYMENTS_PAY_CURRENCIES.map(c => {
                    const selected = payCurrency === c.value;
                    return (
                      <button key={c.value} onClick={() => setPayCurrency(c.value)}
                        className={cn(
                          'flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition-all',
                          selected ? 'border-transparent ring-1' : 'border-white/8 hover:border-white/20',
                        )}
                        style={selected ? { background: `${accent}14`, boxShadow: `inset 0 0 0 1px ${accent}66` } : { background: 'rgba(255,255,255,0.02)' }}>
                        <span className="text-lg">{c.emoji}</span>
                        <span className="min-w-0">
                          <span className="block text-xs font-bold text-white truncate">{c.label}</span>
                          <span className="block text-[10px] text-white/35 truncate">{c.network}</span>
                        </span>
                        {selected && <Check className="h-4 w-4 ml-auto shrink-0" style={{ color: accent }} />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <motion.button
                onClick={handleCreate}
                disabled={creating}
                whileHover={!creating ? { scale: 1.01 } : undefined}
                whileTap={!creating ? { scale: 0.99 } : undefined}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm text-white transition-all disabled:opacity-60"
                style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)`, boxShadow: `0 8px 24px ${accent}30` }}>
                {creating
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating payment address…</>
                  : <><Wallet className="h-4 w-4" /> Continue — pay ${item.priceUSD} in {getPayCurrencyMeta(payCurrency).symbol}</>}
              </motion.button>
            </>
          )}

          {/* ── Step 2: address screen ── */}
          <AnimatePresence>
            {active && active.payAddress && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <div className="h-px bg-white/6" />

                {/* Network — shown clearly */}
                <div className="flex items-center justify-between rounded-2xl border border-white/8 px-4 py-3"
                  style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <span className="flex items-center gap-2 text-[11px] text-white/40">
                    <Network className="h-3.5 w-3.5" /> Network
                  </span>
                  <span className="text-xs font-black px-2.5 py-1 rounded-full"
                    style={{ background: `${accent}18`, color: accent }}>
                    {meta.network}
                  </span>
                </div>

                {/* QR */}
                <div className="flex flex-col items-center gap-2">
                  <PaymentQR value={active.payAddress} size={210} />
                  <p className="text-[10px] text-white/30">Scan with your wallet app</p>
                </div>

                {/* Address + exact amount */}
                <CopyRow label="Wallet address" value={active.payAddress} />
                <CopyRow
                  label="Exact amount"
                  value={active.payAmount != null ? active.payAmount.toFixed(meta.decimals) : String(item.priceUSD)}
                  display={active.payAmount != null ? fmtPayAmount(active.payAmount, meta.value) : `≈ $${item.priceUSD} in ${meta.symbol}`}
                />

                <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-amber-300/80 leading-relaxed">
                    Send <strong>only {meta.symbol}</strong> on the <strong>{meta.network}</strong> network, and send the <strong>exact amount</strong>. Wrong network or amount may result in lost funds.
                  </p>
                </div>

                {/* Pending since / countdown */}
                <div className="flex items-center justify-between text-[10px] text-white/30">
                  <span>Payment requested {timeAgo(active.createdAt)}</span>
                  <span>Auto-cancels after {HARD_TIMEOUT_MINUTES} min if unconfirmed</span>
                </div>
                {active.expiresAt && (
                  <PaymentCountdown expiresAt={active.expiresAt} onExpire={handleExpire} />
                )}

                {/* Actions */}
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={handleShare}
                    className="flex items-center justify-center gap-1.5 py-3 rounded-2xl bg-white/5 border border-white/10 text-xs font-bold text-white/70 hover:bg-white/10 transition-all">
                    <Share2 className="h-3.5 w-3.5" /> Share
                  </button>
                  <button onClick={handleCheck} disabled={checking}
                    className="flex items-center justify-center gap-1.5 py-3 rounded-2xl text-xs font-bold text-white transition-all hover:brightness-110 disabled:opacity-60"
                    style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }}>
                    {checking
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…</>
                      : <><RefreshCw className="h-3.5 w-3.5" /> I've sent it — Check Payment</>}
                  </button>
                </div>
                <button onClick={handleCancel}
                  className="w-full py-2.5 rounded-2xl text-xs font-bold text-red-300/70 hover:text-red-300 hover:bg-red-500/5 border border-transparent hover:border-red-500/15 transition-all">
                  Cancel this payment request
                </button>

                <a href={`https://nowpayments.io/payment/?iid=${active.paymentId}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1 text-[10px] text-white/30 hover:text-white/60 transition-colors">
                  Track on NOWPayments <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Expired / cancelled state */}
          {(expired || cancelled) && !active && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className={cn(
                'flex items-center gap-2.5 rounded-2xl border px-4 py-3',
                cancelled ? 'border-white/10 bg-white/5' : 'border-red-500/25 bg-red-500/5',
              )}>
              <AlertTriangle className={cn('h-4 w-4 shrink-0', cancelled ? 'text-white/40' : 'text-red-400')} />
              <p className={cn('text-xs flex-1', cancelled ? 'text-white/50' : 'text-red-300/80')}>
                {cancelled
                  ? 'You cancelled this payment request. No charge was made.'
                  : 'This payment was not confirmed in time and has expired.'}
              </p>
              <button onClick={handleRetry}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white transition-all hover:brightness-110"
                style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }}>
                <RefreshCw className="h-3 w-3" /> Retry
              </button>
            </motion.div>
          )}
        </div>

        {/* Trust footer */}
        <div className="flex items-center justify-center gap-3 text-[10px] text-white/25">
          <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> API key never leaves the server</span>
          <span>·</span>
          <span>Auto-confirmed via webhook</span>
        </div>

        {/* Payment history */}
        {history.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] text-white/30 uppercase tracking-widest font-semibold flex items-center gap-1.5">
              <History className="h-3 w-3" /> Your recent payments
            </p>
            <div className="rounded-2xl border border-white/6 overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)' }}>
              {history.map(p => (
                <div key={p.orderId} className="flex items-center gap-3 px-4 py-3 border-b border-white/4 last:border-0">
                  <span className={cn(
                    'text-[9px] font-bold px-1.5 py-0.5 rounded-full border capitalize shrink-0',
                    p.status === 'completed' ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' :
                    p.status === 'pending'   ? 'text-amber-400 bg-amber-400/10 border-amber-400/20' :
                    'text-red-400 bg-red-400/10 border-red-400/20',
                  )}>
                    {p.status}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white/70 capitalize truncate">
                      {p.purchaseType === 'cp_purchase' ? `${p.cpAmount?.toLocaleString()} CP` : `${p.itemId} plan`}
                    </p>
                    <p className="text-[10px] text-white/30">{getPayCurrencyMeta(p.payCurrency ?? '').label}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold text-white">${(p.amountUSD ?? 0).toFixed(2)}</p>
                    <p className="text-[10px] text-white/30">{timeAgo(p.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
