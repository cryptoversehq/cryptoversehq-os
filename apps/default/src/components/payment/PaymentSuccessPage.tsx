/**
 * PaymentSuccessPage.tsx — /payment/success
 *
 * Handles both subscription upgrades AND CP purchases.
 * Polls for webhook confirmation, then:
 *   - Subscription → activates plan
 *   - CP purchase  → credits CP coins via cpCoinsStore
 *
 * CP is NEVER credited before webhook fires.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Loader2, Crown, Gem, ArrowRight, RefreshCw, Clock } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useIronixPayStore } from '@/lib/ironixPayStore';
import { useAuthStore } from '@/lib/authStore';
import { useCpCoinsStore } from '@/lib/cpCoinsStore';
import { CP_PACKAGES } from '@/lib/monetizationStore';

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS        = 40; // 2 min total

export function PaymentSuccessPage() {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const { pollPaymentStatus, handleWebhookEvent } = useIronixPayStore();
  const { user, updateProfile }                   = useAuthStore();
  const { credit }                                = useCpCoinsStore();

  const clientRef = searchParams.get('ref') ?? '';
  const [status,  setStatus]  = useState<'waiting' | 'confirmed' | 'timeout'>('waiting');
  const [polls,   setPolls]   = useState(0);
  const [planId,  setPlanId]  = useState<string | null>(null);
  const [cpAmount,setCpAmount]= useState<number | null>(null);

  // creditCp is the safe function passed to the webhook handler
  const creditCp = useCallback((params: { userId: string; amount: number; type: string; description: string; referenceId: string }) => {
    credit(params);
  }, [credit]);

  const activatePlan = useCallback((pid: string) => {
    setPlanId(pid);
    updateProfile({
      plan:       pid as any,
      planExpiry: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    });
    setStatus('confirmed');
  }, [updateProfile]);

  useEffect(() => {
    if (!clientRef) return;
    let intervalId: ReturnType<typeof setInterval>;
    let pollCount = 0;

    const check = () => {
      const record = pollPaymentStatus(clientRef);

      if (record?.status === 'completed') {
        clearInterval(intervalId);

        if (record.purchaseType === 'cp_purchase') {
          // CP purchase already credited by webhook handler — just show success
          setCpAmount(record.cpAmount ?? 0);
          setPlanId(null);
          setStatus('confirmed');
        } else {
          // Subscription — extract planId and activate
          const parts = clientRef.split('_');
          const pid   = parts[1] ?? 'silver';
          activatePlan(pid);
        }
        return;
      }

      pollCount++;
      setPolls(pollCount);
      if (pollCount >= MAX_POLLS) {
        clearInterval(intervalId);
        setStatus('timeout');
      }
    };

    check();
    intervalId = setInterval(check, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [clientRef, pollPaymentStatus, activatePlan]);

  // Simulate webhook for demo/sandbox
  async function simulateWebhook() {
    const record = pollPaymentStatus(clientRef);
    const now    = Math.floor(Date.now() / 1000);

    if (record?.purchaseType === 'cp_purchase') {
      const body = JSON.stringify({
        id: `evt_${Date.now()}`,
        event_type: 'session.completed',
        data: {
          session_id:          `sim_${Date.now()}`,
          amount_received:     Math.round((record.amountUSD ?? 0) * 1_000_000),
          currency:            'USDT',
          client_reference_id: clientRef,
          status:              'complete',
          completed_at:        now,
        },
        created: now,
      });
      await handleWebhookEvent({
        rawBody:     body,
        signature:   'sim_skip_verify',
        timestamp:   String(now),
        activatePlan,
        creditCp,
      });
      // The handler updates the store; the polling will pick it up next tick
      // Force immediate re-check
      const updated = pollPaymentStatus(clientRef);
      if (updated?.status === 'completed') {
        setCpAmount(updated.cpAmount ?? 0);
        setStatus('confirmed');
      }
    } else {
      // Subscription simulation
      const parts  = clientRef.split('_');
      const pid    = parts[1] ?? 'silver';
      const body   = JSON.stringify({
        id:         `evt_${Date.now()}`,
        event_type: 'session.completed',
        data: {
          session_id:          `sim_session_${Date.now()}`,
          amount_received:     999000,
          currency:            'USDT',
          client_reference_id: clientRef,
          status:              'complete',
          completed_at:        now,
        },
        created: now,
      });
      await handleWebhookEvent({
        rawBody:     body,
        signature:   'sim_skip_verify',
        timestamp:   String(now),
        activatePlan,
        creditCp,
      });
      activatePlan(pid);
    }
  }

  const isCpPurchase = cpAmount !== null && planId === null;

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity:0, scale:0.95 }}
        animate={{ opacity:1, scale:1 }}
        className="w-full max-w-md rounded-3xl border border-white/8 p-8 text-center space-y-6"
        style={{ background:'rgba(255,255,255,0.03)' }}
      >
        {/* Icon */}
        <div className="flex justify-center">
          {status === 'confirmed' ? (
            <motion.div initial={{ scale:0 }} animate={{ scale:1 }}
              transition={{ type:'spring', stiffness:200 }}
              className="w-20 h-20 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-400" />
            </motion.div>
          ) : status === 'timeout' ? (
            <div className="w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Clock className="h-10 w-10 text-amber-400" />
            </div>
          ) : (
            <div className="w-20 h-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
            </div>
          )}
        </div>

        {/* Message */}
        {status === 'confirmed' && (
          <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} className="space-y-2">
            {isCpPurchase ? (
              <>
                <h1 className="text-2xl font-black text-white">CP Credited!</h1>
                <p className="text-sm text-white/50">
                  <span className="text-emerald-400 font-black text-lg">{cpAmount?.toLocaleString()}</span>{' '}
                  <span className="text-primary font-bold">CP</span> has been added to your wallet.
                </p>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-black text-white">Payment Confirmed!</h1>
                <p className="text-sm text-white/50">
                  Your <span className="text-emerald-400 font-bold capitalize">{planId}</span> plan is now active.
                  Welcome to the next level.
                </p>
              </>
            )}
          </motion.div>
        )}

        {status === 'waiting' && (
          <div className="space-y-2">
            <h1 className="text-xl font-black text-white">Confirming Payment…</h1>
            <p className="text-sm text-white/40">
              Waiting for blockchain confirmation via NOWPayments webhook.
              This usually takes 10–60 seconds.
            </p>
            <div className="flex justify-center mt-2">
              <div className="h-1.5 w-48 bg-white/10 rounded-full overflow-hidden">
                <motion.div className="h-full bg-primary rounded-full"
                  animate={{ width:`${Math.min((polls / MAX_POLLS) * 100, 95)}%` }}
                  transition={{ duration:0.5 }} />
              </div>
            </div>
            <p className="text-[10px] text-white/20">Poll {polls}/{MAX_POLLS}</p>
          </div>
        )}

        {status === 'timeout' && (
          <div className="space-y-2">
            <h1 className="text-xl font-black text-amber-400">Verification Pending</h1>
            <p className="text-xs text-white/40 leading-relaxed">
              We haven't received confirmation yet. Your payment is likely processing on-chain.
              Check back in a few minutes — your balance will update automatically once confirmed.
            </p>
          </div>
        )}

        {/* Reference */}
        {clientRef && (
          <div className="px-3 py-2 rounded-xl bg-white/5 border border-white/8">
            <p className="text-[10px] text-white/30 font-mono">ref: {clientRef}</p>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2">
          {status === 'confirmed' && isCpPurchase && (
            <button onClick={() => navigate('/wallet')}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-emerald-500 text-white font-bold text-sm hover:bg-emerald-400 transition-all">
              <Gem className="h-4 w-4" /> View Wallet <ArrowRight className="h-4 w-4" />
            </button>
          )}
          {status === 'confirmed' && !isCpPurchase && (
            <button onClick={() => navigate('/')}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-emerald-500 text-white font-bold text-sm hover:bg-emerald-400 transition-all">
              <Crown className="h-4 w-4" /> Start Trading <ArrowRight className="h-4 w-4" />
            </button>
          )}
          {status === 'timeout' && (
            <button onClick={() => navigate('/wallet')}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-all">
              Check Wallet & Transaction Status
            </button>
          )}
          {status === 'waiting' && (
            <button onClick={simulateWebhook}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-white/5 text-white/40 text-xs hover:bg-white/10 transition-all border border-white/8">
              <RefreshCw className="h-3 w-3" /> Simulate Confirmation (Demo/Test)
            </button>
          )}
          <button onClick={() => navigate('/wallet')} className="w-full py-2 text-xs text-white/30 hover:text-white/60 transition-colors">
            View Wallet & Payments
          </button>
        </div>
      </motion.div>
    </div>
  );
}
