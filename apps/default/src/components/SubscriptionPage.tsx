/**
 * SubscriptionPage.tsx — /subscription
 * 3 plans: Free, Pro ($20/mo), Pro+ ($40/mo)
 */
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2, Crown, Gift, Zap, Users, Copy, Share2 } from 'lucide-react';
import { useMonetizationStore, useLiveSubscriptionPlans, SubscriptionPlan, PlanId, getSubscriptionHistory, SubscriptionHistoryEntry } from '@/lib/monetizationStore';
import { useCpCoinsStore } from '@/lib/cpCoinsStore';
import { useAuthStore } from '@/lib/authStore';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { activateTrial, isTrialActive, getTrialState, getTrialDaysLeft } from '@/lib/trialStore';
import { getReferralCode, getReferralLink, getReferralCount, getTotalReferralBonus, getReferrals } from '@/lib/referralStore';

const PLAN_CARD_STYLES: Record<PlanId, { border: string; glow: string; bg: string }> = {
  free:     { border: 'border-slate-700/50',     glow: '',                             bg: 'from-slate-900/40 to-slate-800/20' },
  pro:      { border: 'border-blue-500/30',       glow: 'shadow-blue-500/10 shadow-xl', bg: 'from-blue-900/20 to-blue-800/10' },
  pro_plus: { border: 'border-amber-500/30',      glow: 'shadow-amber-500/15 shadow-xl',bg: 'from-amber-900/20 to-amber-800/10' },
};

export function SubscriptionPage() {
  const { user } = useAuthStore();
  const { getUserPlan, upgradePlan } = useMonetizationStore();
  const { getBalance } = useCpCoinsStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const userId       = user?.id ?? 'demo_user';
  const currentPlan  = (getUserPlan(userId) as PlanId) || 'free';
  const cpBalance    = getBalance(userId);
  const [loading, setLoading] = useState<PlanId | null>(null);

  const plans = useLiveSubscriptionPlans();
  // Sort: Free, Pro, Pro+
  const sortedPlans = [...plans].sort((a, b) => {
    const order: PlanId[] = ['free', 'pro', 'pro_plus'];
    return order.indexOf(a.id) - order.indexOf(b.id);
  });

  const highlightedPlan = searchParams.get('plan') as PlanId | null;

  // Plan rank for ordering
  const PLAN_RANK: Record<PlanId, number> = { free: 0, pro: 1, pro_plus: 2 };
  const currentRank = PLAN_RANK[currentPlan] ?? 0;

  // Trial state
  const trialData = getTrialState();
  const trialActive = isTrialActive();
  const trialDaysLeft = getTrialDaysLeft();
  const [activatingTrial, setActivatingTrial] = useState(false);

  // Referral state
  const referralCode = getReferralCode(userId);
  const referralLink = getReferralLink(userId);
  const referralCount = getReferralCount(userId);
  const totalBonus = getTotalReferralBonus(userId);

  async function handleActivateTrial() {
    setActivatingTrial(true);
    await new Promise(r => setTimeout(r, 600));
    activateTrial();
    setActivatingTrial(false);
    toast.success('7-day Pro trial activated! Enjoy all premium features.');
    setTimeout(() => window.location.reload(), 800);
  }

  function handleCopyReferral() {
    navigator.clipboard.writeText(referralLink).then(() => {
      toast.success('Referral link copied!');
    }).catch(() => {
      toast.error('Failed to copy link');
    });
  }

  async function handleUpgrade(plan: SubscriptionPlan) {
    if (plan.id === currentPlan) return;
    setLoading(plan.id);
    await new Promise(r => setTimeout(r, 600));
    const result = upgradePlan(userId, plan.id, false, 'crypto');
    setLoading(null);
    if (result.ok) {
      toast.success(`Upgraded to ${plan.name}!`);
      setTimeout(() => window.location.reload(), 800);
    } else {
      toast.error(result.error ?? 'Upgrade failed');
    }
  }

  async function handlePayWithCP(plan: SubscriptionPlan) {
    if (plan.id === currentPlan) return;
    const canAfford = cpBalance >= plan.priceCP;
    if (!canAfford) {
      toast.error(`You need ${plan.priceCP.toLocaleString()} CP. Current balance: ${cpBalance.toLocaleString()} CP`);
      return;
    }
    setLoading(plan.id);
    const { useCpCoinsStore } = await import('@/lib/cpCoinsStore');
    const debit = useCpCoinsStore.getState().debit({ userId, amount: plan.priceCP, type: 'subscription_purchase', description: `Purchase ${plan.name} plan with CP` });
    if (!debit.ok) { setLoading(null); toast.error(debit.error ?? 'CP debit failed'); return; }
    await new Promise(r => setTimeout(r, 600));
    const result = upgradePlan(userId, plan.id, true, 'cp'); // adminOverride=true, paymentMethod=cp
    setLoading(null);
    if (result.ok) {
      toast.success(`Upgraded to ${plan.name} with CP!`);
      setTimeout(() => window.location.reload(), 800);
    } else {
      toast.error(result.error ?? 'Upgrade failed');
    }
  }

  return (
    <div className="min-h-screen p-4 md:p-6 space-y-8 text-white pb-20">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <Crown className="h-6 w-6 text-amber-400" />
          <h1 className="text-2xl font-black tracking-tight">Subscription Plans</h1>
        </div>
        <p className="text-sm text-white/40">Choose the plan that fits your trading journey</p>
        <div className="inline-flex items-center gap-2 bg-secondary/30 border border-border rounded-xl px-3 py-1.5 text-xs">
          <span className="text-white/40">Current:</span>
          <span className="font-bold capitalize text-primary">
            {currentPlan === 'pro_plus' ? 'Pro+' : currentPlan === 'pro' ? 'Pro' : 'Free'}
          </span>
          <span className="text-white/20">·</span>
          <span className="text-white/40">Balance:</span>
          <span className="font-bold text-amber-400">{cpBalance.toLocaleString()} CP</span>
          <button onClick={() => navigate('/buy-cp')} className="text-[10px] text-primary hover:underline ml-1">Buy CP</button>
        </div>
      </div>

      {/* Trial Banner */}
      {currentPlan === 'free' && !trialActive && !trialData.activated && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto max-w-2xl rounded-2xl border border-emerald-500/25 p-5 flex items-center justify-between gap-4 flex-wrap"
          style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(16,185,129,0.02))' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
              <Gift className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Try Pro free for 7 days</p>
              <p className="text-xs text-white/40">Unlock all premium features — no commitment, cancel anytime.</p>
            </div>
          </div>
          <button
            disabled={activatingTrial}
            onClick={handleActivateTrial}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 text-black text-xs font-bold hover:bg-emerald-400 transition-colors"
          >
            {activatingTrial ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            {activatingTrial ? 'Activating...' : 'Start Free Trial'}
          </button>
        </motion.div>
      )}

      {/* Trial Active Countdown */}
      {trialActive && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto max-w-2xl rounded-2xl border border-amber-500/25 p-4 flex items-center justify-between gap-4 flex-wrap"
          style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(245,158,11,0.02))' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
              <Zap className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Pro Trial Active</p>
              <p className="text-xs text-amber-300/70">{trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''} remaining — upgrade to keep your access.</p>
            </div>
          </div>
          <Link
            to="/subscription?plan=pro"
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-black text-xs font-bold hover:bg-amber-400 transition-colors"
          >
            <Crown className="h-3.5 w-3.5" />
            Upgrade Now
          </Link>
        </motion.div>
      )}

      {/* Plan Cards */}
      <section>
        <p className="text-[10px] text-white/30 uppercase tracking-widest mb-4 font-semibold">Plans</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {sortedPlans.map((plan, i) => {
            const isActive    = currentPlan === plan.id;
            const isLoading   = loading === plan.id;
            const isHighlight = highlightedPlan === plan.id;
            const styles      = PLAN_CARD_STYLES[plan.id] ?? PLAN_CARD_STYLES.free;
            const planRank    = PLAN_RANK[plan.id] ?? 0;
            const isLower     = planRank < currentRank;
            const isHigher    = planRank > currentRank;

            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className={cn(
                  'rounded-2xl border p-6 flex flex-col gap-5 relative overflow-hidden',
                  styles.border, styles.glow,
                  isHighlight && 'ring-2 ring-primary/50',
                  isActive && 'ring-1 ring-emerald-500/40',
                )}
                style={{ background: `linear-gradient(180deg, ${plan.id === 'pro_plus' ? 'rgba(251,191,36,0.06)' : plan.id === 'pro' ? 'rgba(59,130,246,0.06)' : 'rgba(255,255,255,0.02)'}, transparent)` }}
              >
                {isHighlight && (
                  <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[9px] font-black px-3 py-0.5 rounded-full whitespace-nowrap">
                    Recommended
                  </div>
                )}
                {isActive && currentPlan !== 'free' && (
                  <div className="absolute top-3 right-3 bg-emerald-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full">
                    CURRENT
                  </div>
                )}
                {/* Header */}
                <div className="text-center space-y-1">
                  <div className="text-3xl mb-1">{plan.icon}</div>
                  <h3 className="text-lg font-black text-white">{plan.name}</h3>
                  <div className="mt-1">
                    {plan.priceUSD === 0 ? (
                      <span className="text-2xl font-black text-white">FREE</span>
                    ) : (
                      <>
                        <span className="text-2xl font-black text-white">${plan.priceUSD}</span>
                        <span className="text-xs text-white/40">/mo</span>
                      </>
                    )}
                  </div>
                  <div className="text-[10px] text-white/40 mt-0.5">
                    {plan.cpPerMonth.toLocaleString()} CP/month included
                  </div>
                  {plan.priceCP > 0 && (
                    <div className="text-[10px] text-amber-400/60 mt-0.5">
                      {plan.priceCP.toLocaleString()} CP to buy
                    </div>
                  )}
                </div>

                {/* Feature highlights */}
                <div className="space-y-1.5 flex-1">
                  <p className="text-[10px] text-white/30 uppercase tracking-wider font-semibold mb-2">Includes</p>
                  <FeatureHighlight on={plan.features.marketplace.buy} label="Strategy Marketplace" />
                  <FeatureHighlight on={plan.features.bots.limit > 0} label="AI Trading Bots" />
                  <FeatureHighlight on={plan.features.copyTrading} label="Copy Trading" />
                  <FeatureHighlight on={plan.features.onChain} label="On-Chain Analytics" />
                  <FeatureHighlight on={plan.features.sentiment} label="Sentiment Analysis" />
                  <FeatureHighlight on={plan.features.nft} label="NFT Analytics" />
                  <FeatureHighlight on={plan.features.realExchange} label="Real Exchange" />
                  <FeatureHighlight on={plan.features.apiAccess} label="API Access" />
                </div>

                {/* Action */}
                {/* Action */}
                {isActive ? (
                  currentPlan === 'free' ? null : (
                    <div className="w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <Check className="h-3.5 w-3.5" /> Current Plan
                    </div>
                  )
                ) : isLower ? (
                  <button
                    disabled={isLoading}
                    onClick={() => handleUpgrade(plan)}
                    className={cn(
                      'w-full py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5',
                      plan.priceUSD === 0
                        ? 'bg-secondary/50 text-white/70 hover:bg-white/15 border border-border'
                        : plan.id === 'pro_plus'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/20 hover:bg-amber-500/30'
                          : 'bg-secondary/50 text-white/50 border border-border hover:bg-white/15',
                    )}
                  >
                    {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Downgrade'}
                  </button>
                ) : isHigher ? (
                  <div className="space-y-2">
                    {/* Pay with CP */}
                    {plan.priceCP > 0 && (
                      <button
                        disabled={isLoading}
                        onClick={() => handlePayWithCP(plan)}
                        className={cn(
                          'w-full py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2',
                          cpBalance >= plan.priceCP
                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25 hover:bg-amber-500/25'
                            : 'bg-secondary/30 text-white/20 cursor-not-allowed border border-border',
                        )}
                      >
                        {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : `Pay with CP (${plan.priceCP.toLocaleString()} CP)`}
                      </button>
                    )}

                    {/* Crypto payment */}
                    {plan.priceUSD > 0 && (
                      <button
                        onClick={() => navigate(`/payment/checkout?plan=${plan.id}`)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:brightness-110 shadow-lg"
                        style={{
                          background: `linear-gradient(135deg, ${
                            plan.id === 'pro_plus' ? '#f59e0b' : '#3b82f6'
                          }, ${
                            plan.id === 'pro_plus' ? '#f59e0bcc' : '#3b82f6cc'
                          })`,
                        }}
                      >
                        Pay ${plan.priceUSD} with Crypto
                      </button>
                    )}
                  </div>
                ) : null}
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Transaction History */}
      <TransactionHistory userId={userId} currentPlan={currentPlan} />

      {/* Referral Section */}
      <section>
        <p className="text-[10px] text-white/30 uppercase tracking-widest mb-4 font-semibold">Referral Program</p>
        <div className="rounded-2xl border border-white/6 p-5 space-y-4" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/25 flex items-center justify-center shrink-0">
              <Users className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Invite friends — earn 500 CP each</p>
              <p className="text-xs text-white/40">You and your friend both get <span className="text-purple-400 font-bold">500 CP</span> when they join with your link.</p>
            </div>
          </div>

          {/* Referral link */}
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-black/30 border border-border rounded-xl px-4 py-2.5 text-xs text-white/50 truncate font-mono">
              {referralLink}
            </div>
            <button
              onClick={handleCopyReferral}
              className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-purple-500 text-white text-xs font-bold hover:bg-purple-400 transition-colors"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy Link
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-white/[0.03] border border-border p-3 text-center">
              <p className="text-lg font-black text-white">{referralCount}</p>
              <p className="text-[10px] text-white/30">Invites</p>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-border p-3 text-center">
              <p className="text-lg font-black text-purple-400">{totalBonus.toLocaleString()}</p>
              <p className="text-[10px] text-white/30">CP Earned</p>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-border p-3 text-center">
              <p className="text-lg font-black text-amber-400">500</p>
              <p className="text-[10px] text-white/30">Per Referral</p>
            </div>
          </div>

          {/* Referral history */}
          {referralCount > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-white/25 uppercase tracking-wider font-semibold">Recent Referrals</p>
              {getReferrals(userId).slice(0, 5).map(r => (
                <div key={r.id} className="flex items-center justify-between text-xs py-1.5 px-3 rounded-lg bg-white/[0.02]">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-[10px] font-bold text-purple-400">
                      {r.refereeName.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-white/60">{r.refereeName}</span>
                  </div>
                  <span className="text-purple-400 font-bold">+{r.bonusCP} CP</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ── Feature highlight pill ──────────────────────────────────────────────────

function FeatureHighlight({ on, label }: { on: boolean; label: string }) {
  if (!on) return null;
  return (
    <div className="flex items-center gap-2 text-[11px] text-white/60">
      <Check className="h-3 w-3 text-emerald-400 shrink-0" />
      {label}
    </div>
  );
}

// ── Transaction History ─────────────────────────────────────────────────────

const PAYMENT_LABELS: Record<SubscriptionHistoryEntry['paymentMethod'], { label: string; color: string }> = {
  cp:     { label: 'CP',     color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  crypto: { label: 'Crypto', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  free:   { label: 'Free',   color: 'text-slate-400 bg-slate-500/10 border-slate-500/20' },
};

const PLAN_BADGES: Record<string, string> = {
  free:     'bg-slate-500/15 text-slate-400 border-slate-500/20',
  pro:      'bg-blue-500/15 text-blue-400 border-blue-500/25',
  pro_plus: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function TransactionHistory({ userId, currentPlan }: { userId: string; currentPlan: string }) {
  const [history, setHistory] = useState<SubscriptionHistoryEntry[]>([]);

  useEffect(() => {
    setHistory(getSubscriptionHistory(userId));
  }, [userId]);

  // Listen for changes (e.g., after a purchase)
  useEffect(() => {
    const id = setInterval(() => {
      const fresh = getSubscriptionHistory(userId);
      if (fresh.length !== history.length) setHistory(fresh);
    }, 2000);
    return () => clearInterval(id);
  }, [userId, history.length]);

  const isActive = (entry: SubscriptionHistoryEntry) => {
    const stillValid = new Date(entry.validUntil) > new Date();
    const matchesCurrent = entry.planId === currentPlan;
    return stillValid && matchesCurrent;
  };

  if (history.length === 0) {
    return (
      <section className="text-center py-12">
        <p className="text-sm text-white/30">No subscription history yet.</p>
        <p className="text-xs text-white/15 mt-1">Upgrade your plan to start your journey.</p>
      </section>
    );
  }

  return (
    <section>
      <p className="text-[10px] text-white/30 uppercase tracking-widest mb-4 font-semibold">Transaction History</p>
      <div className="rounded-2xl border border-white/6 overflow-hidden overflow-x-auto" style={{ background: 'rgba(255,255,255,0.02)' }}>
        <div className="min-w-[600px]">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_100px_120px_100px_100px_100px] border-b border-border text-[10px] text-white/30 uppercase tracking-wider font-semibold">
            <div className="p-3">Plan</div>
            <div className="p-3">Payment</div>
            <div className="p-3">Price</div>
            <div className="p-3 text-right">Purchased</div>
            <div className="p-3 text-right">Valid Until</div>
            <div className="p-3 text-right">Status</div>
          </div>
          {history.map((entry, i) => {
            const active = isActive(entry);
            return (
              <div key={entry.id} className={cn('grid grid-cols-[1fr_100px_120px_100px_100px_100px] items-center text-xs', i % 2 === 0 ? '' : 'bg-white/[0.015]')}>
                <div className="p-3 flex items-center gap-2">
                  <span className={cn('px-2 py-0.5 rounded-md text-[10px] font-bold border', PLAN_BADGES[entry.planId] ?? PLAN_BADGES.free)}>
                    {entry.planName}
                  </span>
                </div>
                <div className="p-3">
                  <span className={cn('px-2 py-0.5 rounded-md text-[10px] font-semibold border', PAYMENT_LABELS[entry.paymentMethod].color)}>
                    {PAYMENT_LABELS[entry.paymentMethod].label}
                  </span>
                </div>
                <div className="p-3 text-white/60">
                  {entry.paymentMethod === 'cp'
                    ? <span className="text-amber-400">{entry.priceCP.toLocaleString()} CP</span>
                    : entry.paymentMethod === 'free'
                      ? <span className="text-slate-400">—</span>
                      : <span>${entry.priceUSD}</span>
                  }
                </div>
                <div className="p-3 text-right text-white/40">{formatDate(entry.purchasedAt)}</div>
                <div className="p-3 text-right text-white/40">{formatDate(entry.validUntil)}</div>
                <div className="p-3 text-right">
                  {active
                    ? <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">Active</span>
                    : <span className="text-[10px] text-white/25 bg-secondary/30 border border-border px-2 py-0.5 rounded-md">Expired</span>
                  }
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
