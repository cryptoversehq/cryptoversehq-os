/**
 * PaymentCancelPage.tsx — /payment/cancel
 * Shown when user cancels the NOWPayments checkout.
 */
import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { XCircle, ArrowLeft, RefreshCw } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useIronixPayStore } from '@/lib/ironixPayStore';

export function PaymentCancelPage() {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const { markFailed, pollPaymentStatus } = useIronixPayStore();
  const clientRef      = searchParams.get('ref');

  // Mark the pending transaction as failed immediately
  useEffect(() => {
    if (!clientRef) return;
    const record = pollPaymentStatus(clientRef);
    if (record && record.status === 'pending') {
      markFailed(clientRef, 'failed');
    }
  }, [clientRef]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity:0, scale:0.95 }}
        animate={{ opacity:1, scale:1 }}
        className="w-full max-w-md rounded-3xl border border-white/8 p-8 text-center space-y-6"
        style={{ background:'rgba(255,255,255,0.03)' }}
      >
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <XCircle className="h-10 w-10 text-red-400" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-black text-white">Payment Cancelled</h1>
          <p className="text-sm text-white/40 leading-relaxed">
            No charges were made. You can try again whenever you're ready.
          </p>
        </div>

        {clientRef && (
          <div className="px-3 py-2 rounded-xl bg-white/5 border border-white/8">
            <p className="text-[10px] text-white/20 font-mono">ref: {clientRef}</p>
          </div>
        )}

        <div className="space-y-2">
          {(() => {
            // Detect whether this was a CP purchase by inspecting the client ref
            const record = clientRef ? pollPaymentStatus(clientRef) : null;
            const isCp   = record?.purchaseType === 'cp_purchase';
            return (
              <button
                onClick={() => navigate(isCp ? '/buy-cp' : '/subscription')}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-all"
              >
                <RefreshCw className="h-4 w-4" /> Try Again
              </button>
            );
          })()}
          <button onClick={() => navigate('/')}
            className="w-full flex items-center justify-center gap-2 py-2 text-xs text-white/40 hover:text-white/70 transition-colors">
            <ArrowLeft className="h-3 w-3" /> Back to Dashboard
          </button>
        </div>
      </motion.div>
    </div>
  );
}
