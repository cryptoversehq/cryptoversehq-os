/**
 * AdminSettings.tsx — Super Admin · Pricing Settings
 *
 * Lets a Super Admin (Level 6) change the USD price of the Silver / Gold /
 * Platinum plans without a code deploy. The new price takes effect
 * immediately on:
 *   - /subscription  (SubscriptionPage.tsx — displayed price + "Pay $X" button)
 *   - /payment/checkout  (PaymentPage.tsx — the amount actually sent to NOWPayments)
 *
 * Access mirrors AdminApiManagement.tsx: re-verified on render (defense in
 * depth against direct URL access), independent of the sidebar's minLevel
 * gate in AdminPortalLayout.
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldAlert, DollarSign, RotateCcw, Check, History, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminAuthStore } from '@/lib/adminAuthStore';
import { useAuthStore } from '@/lib/authStore';
import {
  useAdminPricingStore, DEFAULT_PLAN_PRICES, EDITABLE_PLAN_IDS, type EditablePlanId,
  DEFAULT_CP_PACKAGE_PRICES, EDITABLE_CP_PACKAGE_IDS, type EditableCpPackageId,
} from '@/lib/adminPricingStore';

const PLAN_META: Record<EditablePlanId, { name: string; emoji: string; color: string }> = {
  silver:   { name: 'Silver',   emoji: '🥈', color: '#94a3b8' },
  gold:     { name: 'Gold',     emoji: '🥇', color: '#f59e0b' },
  platinum: { name: 'Platinum', emoji: '💎', color: '#7c3aed' },
};

const CP_PKG_META: Record<EditableCpPackageId, { name: string; emoji: string; color: string; cpAmount: number }> = {
  starter:     { name: 'Starter',     emoji: '🌱', color: '#22c55e', cpAmount: 5_000 },
  trader:      { name: 'Trader',      emoji: '📈', color: '#6366f1', cpAmount: 12_000 },
  whale:       { name: 'Whale',       emoji: '🐋', color: '#0ea5e9', cpAmount: 50_000 },
  institution: { name: 'Institution', emoji: '🏛️', color: '#a855f7', cpAmount: 200_000 },
};

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function SuperAdminOnly403() {
  return (
    <div className="flex-1 flex items-center justify-center p-8 min-h-[60vh]">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="max-w-sm w-full text-center space-y-5 rounded-3xl border border-red-500/20 bg-red-500/4 p-8">
        <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <ShieldAlert className="h-8 w-8 text-red-400" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-xl font-black text-red-400">403 — Super Admin Only</h1>
          <p className="text-xs text-white/40 leading-relaxed">
            Pricing Settings change what every user is charged.
            Access is restricted to <span className="text-amber-300 font-semibold">Super Admin (Level 6)</span>.
            This access attempt may be logged.
          </p>
        </div>
        <a href="/admin/dashboard"
          className="block w-full py-2.5 rounded-2xl bg-white/5 border border-white/10 text-white/50 text-sm hover:bg-white/10 transition-all">
          Back to Dashboard
        </a>
      </motion.div>
    </div>
  );
}

function PriceCard({ planId, actor }: { planId: EditablePlanId; actor: string }) {
  const meta        = PLAN_META[planId];
  const currentUSD  = useAdminPricingStore(s => s.getPrice(planId));
  const setPrice    = useAdminPricingStore(s => s.setPrice);
  const resetPrice   = useAdminPricingStore(s => s.resetPrice);
  const isDefault    = currentUSD === DEFAULT_PLAN_PRICES[planId];

  const [value, setValue]   = useState(String(currentUSD));
  const [error, setError]   = useState<string | null>(null);
  const [saved, setSaved]   = useState(false);

  const dirty = Number(value) !== currentUSD;

  function handleSave() {
    const num = Number(value);
    const result = setPrice(planId, num, actor);
    if (!result.ok) { setError(result.error ?? 'Could not save price.'); return; }
    setError(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleReset() {
    resetPrice(planId, actor);
    setValue(String(DEFAULT_PLAN_PRICES[planId]));
    setError(null);
  }

  return (
    <div className="rounded-2xl border bg-[#0d0d14] p-5 space-y-4" style={{ borderColor: `${meta.color}30` }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">{meta.emoji}</span>
          <div>
            <h3 className="text-sm font-bold text-white">{meta.name} Plan</h3>
            <p className="text-[10px] text-white/30">
              Default ${DEFAULT_PLAN_PRICES[planId]}
              {!isDefault && <span className="text-amber-400"> · currently overridden</span>}
            </p>
          </div>
        </div>
        {!isDefault && (
          <button onClick={handleReset}
            title="Reset to default price"
            className="p-1.5 rounded-lg text-white/30 hover:text-amber-400 hover:bg-amber-500/10 transition-all">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-white/30 text-sm font-bold">$</span>
        <input
          type="number"
          min={0}
          step="0.01"
          value={value}
          onChange={e => { setValue(e.target.value); setError(null); }}
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm font-bold text-white outline-none focus:border-white/25 [color-scheme:dark]"
        />
        <button
          onClick={handleSave}
          disabled={!dirty || value === ''}
          className={cn(
            'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all',
            !dirty || value === ''
              ? 'bg-white/5 text-white/20 cursor-not-allowed'
              : 'text-white hover:brightness-110',
          )}
          style={dirty && value !== '' ? { background: meta.color } : undefined}
        >
          {saved ? <Check className="h-3.5 w-3.5" /> : 'Save'}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/8 px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-red-300/90">{error}</p>
        </div>
      )}

      <p className="text-[10px] text-white/25 leading-relaxed">
        Applies instantly to the Subscription page and the crypto checkout amount.
        Users mid-payment on the old price keep their already-generated address until it expires.
      </p>
    </div>
  );
}

function CpPriceCard({ pkgId, actor }: { pkgId: EditableCpPackageId; actor: string }) {
  const meta        = CP_PKG_META[pkgId];
  const currentUSD  = useAdminPricingStore(s => s.getCpPrice(pkgId));
  const setCpPrice  = useAdminPricingStore(s => s.setCpPrice);
  const resetCpPrice = useAdminPricingStore(s => s.resetCpPrice);
  const isDefault    = currentUSD === DEFAULT_CP_PACKAGE_PRICES[pkgId];

  const [value, setValue] = useState(String(currentUSD));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = Number(value) !== currentUSD;
  const perCp = currentUSD / meta.cpAmount;

  function handleSave() {
    const num = Number(value);
    const result = setCpPrice(pkgId, num, actor);
    if (!result.ok) { setError(result.error ?? 'Could not save price.'); return; }
    setError(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleReset() {
    resetCpPrice(pkgId, actor);
    setValue(String(DEFAULT_CP_PACKAGE_PRICES[pkgId]));
    setError(null);
  }

  return (
    <div className="rounded-2xl border bg-[#0d0d14] p-5 space-y-4" style={{ borderColor: `${meta.color}30` }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">{meta.emoji}</span>
          <div>
            <h3 className="text-sm font-bold text-white">{meta.name} — {meta.cpAmount.toLocaleString()} CP</h3>
            <p className="text-[10px] text-white/30">
              Default ${DEFAULT_CP_PACKAGE_PRICES[pkgId]}
              {!isDefault && <span className="text-amber-400"> · currently overridden</span>}
            </p>
          </div>
        </div>
        {!isDefault && (
          <button onClick={handleReset}
            title="Reset to default price"
            className="p-1.5 rounded-lg text-white/30 hover:text-amber-400 hover:bg-amber-500/10 transition-all">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-white/30 text-sm font-bold">$</span>
        <input
          type="number"
          min={0}
          step="1"
          value={value}
          onChange={e => { setValue(e.target.value); setError(null); }}
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm font-bold text-white outline-none focus:border-white/25 [color-scheme:dark]"
        />
        <button
          onClick={handleSave}
          disabled={!dirty || value === ''}
          className={cn(
            'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all',
            !dirty || value === ''
              ? 'bg-white/5 text-white/20 cursor-not-allowed'
              : 'text-white hover:brightness-110',
          )}
          style={dirty && value !== '' ? { background: meta.color } : undefined}
        >
          {saved ? <Check className="h-3.5 w-3.5" /> : 'Save'}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/8 px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-red-300/90">{error}</p>
        </div>
      )}

      <p className="text-[10px] text-white/25 leading-relaxed">
        ≈ ${perCp.toFixed(4)} / CP. Silver plan prices CP at $0.01 each — keep packages at or above that
        rate so buying CP directly never undercuts a subscription.
      </p>
    </div>
  );
}

function CpChangeLog() {
  const log = useAdminPricingStore(s => s.cpLog);
  if (log.length === 0) {
    return <p className="text-center text-[11px] text-white/20 py-6">No CP price changes yet.</p>;
  }
  return (
    <div className="rounded-2xl border border-white/6 bg-[#0d0d14] overflow-hidden">
      {log.slice(0, 12).map(entry => (
        <div key={entry.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-white/4 last:border-0">
          <span className="text-base">{CP_PKG_META[entry.pkgId].emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-white/60">
              <span className="font-semibold text-white/80 capitalize">{entry.pkgId}</span>{' '}
              ${entry.fromUSD} → <span className="font-bold" style={{ color: CP_PKG_META[entry.pkgId].color }}>${entry.toUSD}</span>
            </p>
            <p className="text-[10px] text-white/25">{entry.changedBy} · {timeAgo(entry.changedAt)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ChangeLog() {
  const log = useAdminPricingStore(s => s.log);
  if (log.length === 0) {
    return <p className="text-center text-[11px] text-white/20 py-6">No price changes yet.</p>;
  }
  return (
    <div className="rounded-2xl border border-white/6 bg-[#0d0d14] overflow-hidden">
      {log.slice(0, 12).map(entry => (
        <div key={entry.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-white/4 last:border-0">
          <span className="text-base">{PLAN_META[entry.planId].emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-white/60">
              <span className="font-semibold text-white/80 capitalize">{entry.planId}</span>{' '}
              ${entry.fromUSD} → <span className="font-bold" style={{ color: PLAN_META[entry.planId].color }}>${entry.toUSD}</span>
            </p>
            <p className="text-[10px] text-white/25">{entry.changedBy} · {timeAgo(entry.changedAt)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AdminSettings() {
  const { session }       = useAdminAuthStore();
  const { user: appUser } = useAuthStore();

  const isSuperAdmin = session?.level === 6 || appUser?.role === 'super_admin';
  const actor = session?.displayName ?? appUser?.displayName ?? 'Super Admin';

  if (!isSuperAdmin) return <SuperAdminOnly403 />;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-11 w-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <DollarSign className="h-5 w-5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-lg font-black text-white flex items-center gap-2">
            Pricing Settings
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-red-500/15 border border-red-500/25 text-red-400 tracking-wide">
              SUPER ADMIN
            </span>
          </h1>
          <p className="text-[11px] text-white/35">Change what Silver / Gold / Platinum cost — no deploy needed</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {EDITABLE_PLAN_IDS.map(id => <PriceCard key={id} planId={id} actor={actor} />)}
      </div>

      <div className="space-y-2">
        <p className="text-[10px] text-white/30 uppercase tracking-widest font-semibold flex items-center gap-1.5">
          <History className="h-3 w-3" /> Recent changes
        </p>
        <ChangeLog />
      </div>

      {/* ── CP Package Pricing ── */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <div className="h-11 w-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
          <DollarSign className="h-5 w-5 text-emerald-400" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <h2 className="text-base font-black text-white">CP Package Pricing</h2>
          <p className="text-[11px] text-white/35">Change what the Buy CP packages cost — keeps CP purchases from undercutting subscriptions</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {EDITABLE_CP_PACKAGE_IDS.map(id => <CpPriceCard key={id} pkgId={id} actor={actor} />)}
      </div>

      <div className="space-y-2">
        <p className="text-[10px] text-white/30 uppercase tracking-widest font-semibold flex items-center gap-1.5">
          <History className="h-3 w-3" /> Recent CP price changes
        </p>
        <CpChangeLog />
      </div>
    </div>
  );
}

export default AdminSettings;
