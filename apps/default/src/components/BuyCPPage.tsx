/**
 * BuyCPPage.tsx — /buy-cp
 *
 * CP package picker. Selecting a package now navigates to the shared
 * internal payment page (PaymentPage.tsx, /payment/checkout?type=cp&pkg=...)
 * instead of redirecting out to NOWPayments' hosted checkout page. That
 * external redirect was the app's "second payment method" — SubscriptionPage
 * used the internal page, BuyCPPage used the hosted one. Both now go through
 * the same internal address/QR/check-payment flow, so there's a single
 * payment experience app-wide.
 */
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Gem, Zap, ArrowLeft, Info, Star,
  Clock, XCircle, CheckCircle2, AlertCircle, ArrowRight,
} from 'lucide-react';
import { useMonetizationStore, useLiveCpPackages, CP_PACKAGES, CpPackage } from '@/lib/monetizationStore';
import { useCpCoinsStore } from '@/lib/cpCoinsStore';
import { useNowPaymentsStore } from '@/lib/nowPaymentsStore';
import { useAuthStore } from '@/lib/authStore';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

function getDiscount(planId: string): number {
  if (planId === 'platinum') return 0.20;
  if (planId === 'gold')     return 0.10;
  return 0;
}

const STATUS_STYLE: Record<string, string> = {
  pending:   'text-amber-400 bg-amber-400/10 border-amber-400/20',
  completed: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  failed:    'text-red-400 bg-red-400/10 border-red-400/20',
  expired:   'text-gray-400 bg-gray-400/10 border-gray-400/20',
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending:   <Clock className="h-3 w-3" />,
  completed: <CheckCircle2 className="h-3 w-3" />,
  failed:    <XCircle className="h-3 w-3" />,
  expired:   <AlertCircle className="h-3 w-3" />,
};

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60000)    return `${Math.floor(d / 1000)}s ago`;
  if (d < 3600000)  return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function BuyCPPage() {
  const { user } = useAuthStore();
  const { getUserPlan } = useMonetizationStore();
  const { getBalance } = useCpCoinsStore();
  const { getPaymentsByUser } = useNowPaymentsStore();
  const navigate = useNavigate();

  const userId   = user?.id ?? 'demo_user';
  const planId   = getUserPlan(userId);
  const balance  = getBalance(userId);
  const discount = getDiscount(planId);
  const livePackages = useLiveCpPackages(); // priceUSD reflects any admin override (see /admin/settings)

  const cpHistory = useMemo(
    () => getPaymentsByUser(userId).filter(p => p.purchaseType === 'cp_purchase'),
    [userId],
  );

  const hasPending = cpHistory.some(p => p.status === 'pending');

  function handleBuy(pkg: CpPackage) {
    // Hands off to the single internal payment page — see PaymentPage.tsx.
    navigate(`/payment/checkout?type=cp&pkg=${pkg.id}`);
  }

  return (
    <div className="min-h-screen p-4 md:p-6 space-y-6 text-white">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-all">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <Gem className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-black tracking-tight">Buy CP Coins</h1>
          </div>
          <p className="text-xs text-white/40 mt-0.5">Paid via NOWPayments · USDT · CP credited after on-chain confirmation</p>
        </div>
      </div>

      {/* Balance banner */}
      <div className="rounded-2xl border border-primary/20 p-4 flex items-center justify-between flex-wrap gap-3"
        style={{ background: 'rgba(99,102,241,0.06)' }}>
        <div>
          <p className="text-[10px] text-white/40 uppercase tracking-wider">Current Balance</p>
          <p className="text-2xl font-black text-white">
            {balance.toLocaleString()} <span className="text-primary text-base font-bold">CP</span>
          </p>
        </div>
        {discount > 0 && (
          <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2">
            <Star className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-xs font-bold text-emerald-400">
              {(discount * 100).toFixed(0)}% discount active ({planId} plan)
            </span>
          </div>
        )}
      </div>

      {/* Pending warning */}
      {hasPending && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-2xl border border-amber-500/25 bg-amber-500/5">
          <Clock className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-amber-400">Payment Pending</p>
            <p className="text-[11px] text-amber-300/70 mt-0.5">
              A CP purchase is awaiting blockchain confirmation. Open it below and tap "Check Payment" once you've
              sent the funds — CP is credited the moment that confirms.
            </p>
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="rounded-2xl border border-white/6 p-4 space-y-3" style={{ background:'rgba(255,255,255,0.02)' }}>
        <p className="text-xs font-bold text-white/50 flex items-center gap-2">
          <Info className="h-3.5 w-3.5" /> How CP Purchase Works
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { n:'1', l:'Select Package', d:'Choose your CP bundle' },
            { n:'2', l:'Pay with USDT',  d:'Address shown on the payment page' },
            { n:'3', l:'Check Payment',  d:'Tap Check Payment once sent' },
            { n:'4', l:'CP Credited',    d:'Balance updated instantly' },
          ].map(s => (
            <div key={s.n} className="flex items-start gap-2">
              <div className="w-5 h-5 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-[9px] font-black text-primary shrink-0 mt-0.5">
                {s.n}
              </div>
              <div>
                <p className="text-[11px] font-bold text-white/70">{s.l}</p>
                <p className="text-[10px] text-white/30">{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Packages */}
      <section>
        <p className="text-[10px] text-white/30 uppercase tracking-widest mb-4 font-semibold">Purchase Packages</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {livePackages.map((pkg, i) => {
            const finalPrice    = +(pkg.priceUSD * (1 - discount)).toFixed(2);
            const didDiscount   = discount > 0;
            const existingPend  = cpHistory.find(p => p.itemId === `cp_${pkg.id}` && p.status === 'pending');
            return (
              <motion.div key={pkg.id}
                initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay: i*0.07 }}
                className={cn(
                  'rounded-2xl border p-5 flex flex-col gap-4 relative',
                  pkg.popular ? 'border-primary/40 shadow-xl shadow-primary/10' : 'border-white/6',
                  existingPend && 'border-amber-500/30',
                )}
                style={{ background:'rgba(255,255,255,0.03)' }}>

                {pkg.popular && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[9px] font-black px-2.5 py-0.5 rounded-full">
                    MOST POPULAR
                  </div>
                )}
                {existingPend && (
                  <div className="absolute -top-2.5 right-4 bg-amber-500 text-black text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Clock className="h-2.5 w-2.5" /> Pending
                  </div>
                )}

                <div>
                  <div className="text-2xl mb-1">{pkg.emoji}</div>
                  <h3 className="text-base font-black text-white">{pkg.name}</h3>
                  <p className="text-2xl font-black text-primary mt-1">
                    {pkg.cpAmount.toLocaleString()} <span className="text-sm text-white/50 font-normal">CP</span>
                  </p>
                  {pkg.savePct > 0 && (
                    <span className="inline-block mt-1 text-[9px] font-black bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full">
                      Save {pkg.savePct}%
                    </span>
                  )}
                </div>

                <div>
                  {didDiscount ? (
                    <div>
                      <p className="text-[10px] text-white/30 line-through">${pkg.priceUSD}</p>
                      <p className="text-xl font-black text-emerald-400">${finalPrice}</p>
                      <p className="text-[10px] text-emerald-400/70">{planId} discount applied</p>
                    </div>
                  ) : (
                    <p className="text-xl font-black text-white">
                      ${finalPrice} <span className="text-[10px] text-white/30 font-normal">USDT</span>
                    </p>
                  )}
                </div>

                <button
                  onClick={() => handleBuy(pkg)}
                  className={cn(
                    'w-full py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5',
                    existingPend
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : pkg.popular
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                        : 'bg-white/8 text-white hover:bg-white/15 border border-white/10',
                  )}>
                  {existingPend
                    ? <><Clock className="h-3.5 w-3.5" /> Continue Payment</>
                    : <><Zap className="h-3.5 w-3.5" /> Buy — ${finalPrice} USDT <ArrowRight className="h-3 w-3 opacity-60" /></>}
                </button>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Purchase history */}
      {cpHistory.length > 0 && (
        <section>
          <p className="text-[10px] text-white/30 uppercase tracking-widest mb-3 font-semibold">Purchase History</p>
          <div className="rounded-2xl border border-white/6 divide-y divide-white/4 overflow-hidden"
            style={{ background:'rgba(255,255,255,0.02)' }}>
            {cpHistory.slice(0, 10).map(tx => {
              const pkg = CP_PACKAGES.find(p => `cp_${p.id}` === tx.itemId);
              return (
                <div key={tx.paymentId} className="flex items-center gap-4 px-4 py-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white/80">
                      {pkg ? `${pkg.emoji} ${pkg.name}` : tx.itemLabel ?? tx.itemId} — {tx.cpAmount?.toLocaleString() ?? '?'} CP
                    </p>
                    <p className="text-[10px] text-white/30 mt-0.5">
                      ${(tx.amountUSD ?? 0).toFixed(2)} USDT · {timeAgo(tx.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border capitalize',
                      STATUS_STYLE[tx.status] ?? STATUS_STYLE.pending,
                    )}>
                      {STATUS_ICON[tx.status]} {tx.status}
                    </span>
                    {tx.status === 'pending' && pkg && (
                      <button
                        onClick={() => handleBuy(pkg)}
                        className="text-[9px] font-bold text-primary hover:underline flex items-center gap-0.5">
                        Continue <ArrowRight className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Discount info */}
      <div className="rounded-2xl border border-white/6 p-4 space-y-2" style={{ background:'rgba(255,255,255,0.02)' }}>
        <div className="flex items-center gap-2">
          <Info className="h-3.5 w-3.5 text-white/30" />
          <p className="text-xs font-bold text-white/40">Subscription Discounts</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px] text-white/40">
          <div className="flex items-center gap-2"><span className="text-amber-700">🥉 Bronze</span> — No discount</div>
          <div className="flex items-center gap-2"><span className="text-slate-300">🥈 Silver</span> — No discount</div>
          <div className="flex items-center gap-2"><span className="text-amber-400">🥇 Gold</span> — <span className="text-emerald-400 font-bold">10% off</span></div>
          <div className="flex items-center gap-2"><span className="text-sky-400">📊 Analytics Pro</span> — No discount</div>
          <div className="flex items-center gap-2"><span className="text-violet-400">💎 Platinum</span> — <span className="text-emerald-400 font-bold">20% off</span></div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/subscription')} className="text-primary hover:underline">Upgrade plan →</button>
          </div>
        </div>
      </div>

      {/* Use cases */}
      <div className="rounded-2xl border border-white/6 p-4" style={{ background:'rgba(255,255,255,0.02)' }}>
        <p className="text-xs font-bold text-white/40 mb-3">What can you do with CP?</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {[
            { emoji:'🏪', label:'Buy marketplace strategies' },
            { emoji:'📈', label:'Subscribe to plan upgrades' },
            { emoji:'🤖', label:'Deploy trading bots (500 CP)' },
            { emoji:'🏆', label:'Enter premium events' },
            { emoji:'💸', label:'Pay out your earnings' },
            { emoji:'🎁', label:'Gift to other traders' },
          ].map(({ emoji, label }) => (
            <div key={label} className="flex items-center gap-2 text-[10px] text-white/40">
              <span>{emoji}</span> {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
