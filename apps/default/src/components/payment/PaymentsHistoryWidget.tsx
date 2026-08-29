/**
 * PaymentsHistoryWidget.tsx
 * Shows a user's payment history inline via NOWPayments.
 */
import React from 'react';
import { motion } from 'framer-motion';
import { CreditCard, CheckCircle2, Clock, XCircle, ExternalLink } from 'lucide-react';
import { useIronixPayStore } from '@/lib/ironixPayStore';
import { useAuthStore } from '@/lib/authStore';
import { cn } from '@/lib/utils';

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60000)    return `${Math.floor(d/1000)}s ago`;
  if (d < 3600000)  return `${Math.floor(d/60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d/3600000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  completed: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />,
  pending:   <Clock className="h-3.5 w-3.5 text-amber-400" />,
  failed:    <XCircle className="h-3.5 w-3.5 text-red-400" />,
  expired:   <XCircle className="h-3.5 w-3.5 text-gray-400" />,
  creating:  <Clock className="h-3.5 w-3.5 text-blue-400" />,
};
const STATUS_COLOR: Record<string, string> = {
  completed: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  pending:   'text-amber-400 bg-amber-400/10 border-amber-400/20',
  failed:    'text-red-400 bg-red-400/10 border-red-400/20',
  expired:   'text-gray-400 bg-gray-400/10 border-gray-400/20',
  creating:  'text-blue-400 bg-blue-400/10 border-blue-400/20',
};

export function PaymentsHistoryWidget() {
  const { user }            = useAuthStore();
  const { getPaymentsByUser } = useIronixPayStore();
  const payments            = getPaymentsByUser(user?.id ?? 'demo_user');

  if (payments.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-white/30 uppercase tracking-widest font-semibold flex items-center gap-2">
        <CreditCard className="h-3 w-3" /> Payment History
      </p>
      <div className="rounded-2xl border border-white/6 overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)' }}>
        {payments.slice(0, 5).map((p, i) => (
          <motion.div key={p.paymentId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
            className="flex items-center gap-3 px-4 py-3 border-b border-white/4 last:border-0">
            <div className={cn('flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full border capitalize shrink-0', STATUS_COLOR[p.status])}>
              {STATUS_ICON[p.status]} {p.status}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white/70 truncate capitalize">{p.planId} Plan</p>
              <p className="text-[10px] text-white/30 font-mono truncate">{p.clientReferenceId}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-bold text-white">${p.amountUSD.toFixed(2)}</p>
              <p className="text-[10px] text-white/30">{timeAgo(p.createdAt)}</p>
            </div>
            {p.checkoutUrl && p.status === 'pending' && (
              <a href={p.checkoutUrl} target="_blank" rel="noopener noreferrer"
                className="shrink-0 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                <ExternalLink className="h-3 w-3 text-white/40" />
              </a>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
