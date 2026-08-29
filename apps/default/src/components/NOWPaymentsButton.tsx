/**
 * NOWPaymentsButton.tsx
 *
 * Secure crypto payment button using NOWPayments.
 * Uses GenesisClient.proxy() — API key never enters the browser.
 *
 * Usage:
 *   <NOWPaymentsButton
 *     itemId="gold"
 *     itemLabel="Gold Plan"
 *     amountUSD={24.99}
 *     accentColor="#f59e0b"
 *   />
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, Loader2, ExternalLink, AlertCircle, ShieldCheck, Zap, Wallet, Copy, Check } from 'lucide-react';
import { useNowPaymentsStore } from '@/lib/nowPaymentsStore';
import { useAuthStore } from '@/lib/authStore';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface NOWPaymentsButtonProps {
  itemId:       string;
  itemLabel:    string;
  amountUSD:    number;
  accentColor?: string;
  className?:   string;
  payCurrency?: string;
  purchaseType?: 'subscription' | 'cp_purchase';
  cpAmount?:    number;
  /** Called after successful checkout creation with payment details */
  onCheckoutCreated?: (details: { payAddress: string; paymentUrl: string; payCurrency: string }) => void;
}

export function NOWPaymentsButton({
  itemId,
  itemLabel,
  amountUSD,
  accentColor = '#6366f1',
  className,
  payCurrency = 'usdttrc20',
  purchaseType = 'subscription',
  cpAmount,
  onCheckoutCreated,
}: NOWPaymentsButtonProps) {
  const { user } = useAuthStore();
  const { initiateCheckout, initiateCpCheckout, checkoutStatus, getPendingPayment } = useNowPaymentsStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentDetails, setPaymentDetails] = useState<{ payAddress: string; paymentUrl: string; payCurrency: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const pending = user ? getPendingPayment(user.id, itemId) : undefined;
  const isProcessing = loading || checkoutStatus === 'creating';
  const hasPending = !!pending;

  async function handleClick() {
    if (!user) { toast.error('Please sign in to purchase'); return; }
    setLoading(true);
    setError(null);

    let result;
    if (purchaseType === 'cp_purchase' && cpAmount) {
      result = await initiateCpCheckout({
        userId: user.id,
        packageId: itemId,
        cpAmount,
        amountUSD,
        packageLabel: itemLabel,
        payCurrency,
        userEmail:   user.email,
        userName:    user.displayName,
      });
    } else {
      result = await initiateCheckout({
        userId: user.id,
        itemId,
        amountUSD,
        itemLabel,
        payCurrency,
        userEmail:   user.email,
        userName:    user.displayName,
      });
    }

    setLoading(false);

    if (!result.ok) {
      setError(result.error ?? 'Checkout failed. Please try again.');
      toast.error('Payment setup failed');
      return;
    }

    if (result.payAddress) {
      const details = {
        payAddress:  result.payAddress,
        paymentUrl:  result.paymentUrl ?? `https://nowpayments.io/payment/`,
        payCurrency: result.payCurrency ?? payCurrency,
      };
      setPaymentDetails(details);
      onCheckoutCreated?.(details);
      toast.success('Payment address generated');
    }
  }

  function copyAddress() {
    if (!paymentDetails) return;
    navigator.clipboard.writeText(paymentDetails.payAddress).catch(() => {});
    setCopied(true);
    toast.success('Address copied');
    setTimeout(() => setCopied(false), 2000);
  }

  const payLabel = payCurrency === 'usdttrc20' ? 'USDT (TRC20)' : payCurrency;

  return (
    <div className={cn('space-y-2', className)}>
      {/* Payment created — show address */}
      {paymentDetails ? (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border p-4 space-y-3"
          style={{ borderColor: `${accentColor}40`, background: 'rgba(255,255,255,0.03)' }}
        >
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4" style={{ color: accentColor }} />
            <span className="text-xs font-bold text-white/70">Send {payLabel} to:</span>
          </div>

          <div className="flex items-center gap-2">
            <code className="flex-1 text-[11px] text-white/80 bg-black/20 rounded-lg px-3 py-2 break-all font-mono leading-relaxed">
              {paymentDetails.payAddress}
            </code>
            <button
              onClick={copyAddress}
              className="shrink-0 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4 text-white/50" />}
            </button>
          </div>

          <a
            href={paymentDetails.paymentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl text-xs font-bold transition-all"
            style={{ backgroundColor: `${accentColor}18`, color: accentColor, borderColor: `${accentColor}40`, border: '1px solid' }}
          >
            Track Payment <ExternalLink className="h-3 w-3" />
          </a>

          <p className="text-[10px] text-white/30 text-center">
            Payment confirmed automatically via webhook. CP or plan activated after blockchain confirmation.
          </p>
        </motion.div>
      ) : (
        <>
          {/* Main payment button */}
          <motion.button
            onClick={handleClick}
            disabled={isProcessing || hasPending}
            whileHover={(!isProcessing && !hasPending) ? { scale: 1.02 } : undefined}
            whileTap={(!isProcessing && !hasPending)  ? { scale: 0.98 } : undefined}
            className={cn(
              'w-full flex items-center justify-center gap-2.5 py-3.5 px-5 rounded-2xl font-bold text-sm transition-all shadow-lg',
              (isProcessing || hasPending) ? 'opacity-70 cursor-not-allowed' : 'hover:brightness-110',
            )}
            style={{
              background: isProcessing || hasPending
                ? 'rgba(255,255,255,0.05)'
                : `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`,
              boxShadow: hasPending ? 'none' : `0 8px 24px ${accentColor}40`,
              color: isProcessing || hasPending ? '#9ca3af' : '#fff',
            }}
          >
            {isProcessing ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Creating payment…</>
            ) : hasPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Awaiting confirmation…</>
            ) : (
              <><CreditCard className="h-4 w-4" /> Pay ${amountUSD.toFixed(2)} — {payLabel}<ExternalLink className="h-3.5 w-3.5 opacity-70" /></>
            )}
          </motion.button>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity:0, y:-4 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-400">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Trust badges */}
          <div className="flex items-center justify-center gap-3 text-[10px] text-white/30">
            <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> API key secure</span>
            <span>·</span>
            <span className="flex items-center gap-1"><Zap className="h-3 w-3" /> Auto-confirmed</span>
            <span>·</span>
            <span>{payLabel}</span>
          </div>
        </>
      )}
    </div>
  );
}
