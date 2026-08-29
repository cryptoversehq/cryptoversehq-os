/**
 * DemoCheckoutPage.tsx — /payment/demo-checkout
 *
 * Simulates the hosted checkout page for development/sandbox testing.
 * ⛔  ACCESS RESTRICTED: Super Admin only (adminAuthStore level 6).
 * Regular users and non-admin visitors are shown a 403 screen and redirected.
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, CreditCard, Check, X, Loader2, Zap, Lock, ShieldOff } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useIronixPayStore } from '@/lib/ironixPayStore';
import { useAuthStore } from '@/lib/authStore';
import { useAdminAuthStore } from '@/lib/adminAuthStore';

// ── 403 Forbidden Screen ─────────────────────────────────────────────────────
function ForbiddenScreen() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'linear-gradient(135deg, #0f0f1a 0%, #1a0a0a 100%)' }}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm text-center space-y-6 rounded-3xl border border-red-500/20 p-8"
        style={{ background: 'rgba(239,68,68,0.04)' }}>
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <ShieldOff className="h-10 w-10 text-red-400" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-black text-red-400">403 — Forbidden</h1>
          <p className="text-sm text-white/40 leading-relaxed">
            This page is restricted to <span className="text-red-300 font-semibold">Super Admins</span> only.<br />
            You do not have permission to access the payment sandbox.
          </p>
        </div>
        <button onClick={() => navigate('/')}
          className="w-full py-3 rounded-2xl bg-white/5 text-white/50 text-sm hover:bg-white/10 transition-all border border-white/10">
          Return to Home
        </button>
      </motion.div>
    </div>
  );
}

export function DemoCheckoutPage() {
  const [searchParams]  = useSearchParams();
  const navigate        = useNavigate();
  const { user } = useAuthStore();
  const { markCompleted } = useIronixPayStore();

  // ── Super Admin gate ──────────────────────────────────────────────────────
  const adminSession = useAdminAuthStore(s => s.session);
  const isSuperAdmin = adminSession !== null && adminSession.level === 6;
  if (!isSuperAdmin) return <ForbiddenScreen />;

  const ref    = searchParams.get('ref')    ?? '';
  const amount = searchParams.get('amount') ?? '9.99';
  const plan   = searchParams.get('plan')   ?? 'plan';

  const [loading, setLoading] = useState(false);

  async function handlePay() {
    setLoading(true);
    await new Promise(r => setTimeout(r, 1500)); // Simulate processing

    // Mark the local record completed — the success page's webhook simulator
    // will credit CP (for cp_purchases) or activate the plan (for subscriptions).
    // Do NOT credit CP or activate plan here — that would bypass the webhook gate.
    const completedAt = new Date().toISOString();
    markCompleted(ref, completedAt);

    navigate(`/payment/success?ref=${ref}`);
  }

  function handleCancel() {
    navigate(`/payment/cancel?ref=${ref}`);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%)' }}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm rounded-3xl border border-white/10 overflow-hidden shadow-2xl"
        style={{ background: 'rgba(255,255,255,0.04)' }}>

        {/* Header */}
        <div className="px-6 py-5 border-b border-white/8 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
            <CreditCard className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xs font-black text-white">CryptoVerse Checkout</p>
            <p className="text-[10px] text-white/30 flex items-center gap-1"><Lock className="h-2.5 w-2.5" /> Secure · Sandbox Mode</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-lg font-black text-white">${parseFloat(amount).toFixed(2)}</p>
            <p className="text-[10px] text-white/40">USDT · TRON</p>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-300/80 flex items-start gap-2">
            <Zap className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-400" />
            <span><strong>Sandbox Mode.</strong> This simulates the payment checkout. In production, you'd be on NOWPayments' hosted page paying real crypto.</span>
          </div>

          <div className="space-y-2 text-xs text-white/50">
            <div className="flex justify-between">
              <span>Plan</span>
              <span className="capitalize font-semibold text-white">{plan}</span>
            </div>
            <div className="flex justify-between">
              <span>Amount</span>
              <span className="font-semibold text-white">${parseFloat(amount).toFixed(2)} USDT</span>
            </div>
            <div className="flex justify-between">
              <span>Network</span>
              <span className="font-semibold text-white">TRON (TRC-20)</span>
            </div>
            <div className="flex justify-between items-start">
              <span>Reference</span>
              <span className="font-mono text-[10px] text-white/40 max-w-[160px] text-right break-all">{ref}</span>
            </div>
          </div>

          <div className="h-px bg-white/5" />

          {/* Pay button */}
          <button onClick={handlePay} disabled={loading}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl font-bold text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-60 shadow-lg">
            {loading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing payment…</>
              : <><Check className="h-4 w-4" /> Simulate Payment ({amount} USDT)</>
            }
          </button>

          <button onClick={handleCancel} disabled={loading}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-sm text-white/40 hover:text-white/70 bg-white/5 hover:bg-white/8 transition-all disabled:opacity-40">
            <X className="h-3.5 w-3.5" /> Cancel
          </button>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/6 flex items-center justify-center gap-2 text-[10px] text-white/20">
          <ShieldCheck className="h-3 w-3" /> Powered by NOWPayments · HMAC-secured
        </div>
      </motion.div>
    </div>
  );
}
