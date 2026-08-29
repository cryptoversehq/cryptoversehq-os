/**
 * CreatorEarningsPage.tsx — /creator/earnings
 * Earnings breakdown by source + payout requests table
 */
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, DollarSign, RefreshCw, Send, Check, X, Clock, Loader2, BarChart2, Award } from 'lucide-react';
import { useMonetizationStore, PayoutMethod, PayoutRequest, PendingEarning } from '@/lib/monetizationStore';
import { useCpCoinsStore } from '@/lib/cpCoinsStore';
import { useAuthStore } from '@/lib/authStore';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60000) return `${Math.floor(d/1000)}s ago`;
  if (d < 3600000) return `${Math.floor(d/60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d/3600000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

const STATUS_STYLES: Record<string, string> = {
  pending:  'text-amber-400 bg-amber-400/10 border-amber-400/20',
  approved: 'text-sky-400 bg-sky-400/10 border-sky-400/20',
  paid:     'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  rejected: 'text-red-400 bg-red-400/10 border-red-400/20',
};

const METHOD_LABELS: Record<PayoutMethod, string> = {
  cp_wallet: '💳 CP Wallet',
  bank:      '🏦 Bank',
  crypto:    '₿ Crypto',
};

function StatCard({ label, value, sub, icon, color }: { label:string;value:string;sub?:string;icon:React.ReactNode;color:string }) {
  return (
    <div className="rounded-2xl border border-white/6 p-4 flex gap-3 items-start" style={{ background:'rgba(255,255,255,0.03)' }}>
      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', color)}>{icon}</div>
      <div>
        <p className="text-[10px] text-white/40 uppercase tracking-wider">{label}</p>
        <p className="text-lg font-black text-white leading-tight">{value}</p>
        {sub && <p className="text-[10px] text-white/30 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// Monthly breakdown helper — last 2 months
function monthTotals(earnings: PendingEarning[], source: string) {
  const now = new Date();
  const thisMonth = earnings.filter(e => { const d = new Date(e.createdAt); return e.source === source && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).reduce((s,e)=>s+e.amountCP,0);
  const lastMonth = earnings.filter(e => { const d = new Date(e.createdAt); const lm = new Date(now.getFullYear(), now.getMonth()-1,1); return e.source === source && d.getMonth() === lm.getMonth() && d.getFullYear() === lm.getFullYear(); }).reduce((s,e)=>s+e.amountCP,0);
  const total = earnings.filter(e => e.source === source).reduce((s,e)=>s+e.amountCP,0);
  return { thisMonth, lastMonth, total };
}

export function CreatorEarningsPage() {
  const { user } = useAuthStore();
  const { getPendingEarnings, getTotalPending, submitPayoutRequest, payoutRequests } = useMonetizationStore();
  const { getBalance } = useCpCoinsStore();
  const navigate = useNavigate();

  const userId   = user?.id ?? 'demo_user';
  const earnings = getPendingEarnings(userId);
  const totPend  = getTotalPending(userId);
  const balance  = getBalance(userId);
  const myPayouts = payoutRequests.filter(p => p.userId === userId);

  const [showForm, setShowForm]   = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PayoutMethod>('cp_wallet');
  const [payAddr, setPayAddr]     = useState('');
  const [loading, setLoading]     = useState(false);

  const stratRow  = useMemo(() => monthTotals(earnings,'strategy_sale'), [earnings]);
  const copyRow   = useMemo(() => monthTotals(earnings,'copy_fee'),      [earnings]);
  const prizeRow  = useMemo(() => monthTotals(earnings,'event_prize'),   [earnings]);
  const refRow    = useMemo(() => monthTotals(earnings,'referral'),      [earnings]);

  const totalEarned   = stratRow.total + copyRow.total + prizeRow.total + refRow.total;
  const totalWithdrawn = myPayouts.filter(p => p.status === 'paid').reduce((s,p) => s+p.amountCP, 0);

  async function handlePayout() {
    const amount = parseInt(payAmount, 10);
    if (!amount || amount < 10) { toast.error('Minimum payout is 10 CP'); return; }
    setLoading(true);
    await new Promise(r => setTimeout(r, 700));
    const result = submitPayoutRequest({ userId, amountCP: amount, method: payMethod, address: payAddr || undefined });
    setLoading(false);
    if (result.ok) {
      toast.success(result.instant ? `${amount} CP credited to your wallet!` : 'Payout request submitted');
      setShowForm(false); setPayAmount(''); setPayAddr('');
    } else {
      toast.error(result.error ?? 'Payout failed');
    }
  }

  return (
    <div className="min-h-screen p-4 md:p-6 space-y-6 text-white">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Award className="h-5 w-5 text-amber-400" />
          <h1 className="text-xl font-black tracking-tight">Creator Earnings Dashboard</h1>
        </div>
        <button onClick={() => navigate('/wallet')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/5 border border-white/8 hover:bg-white/10 transition-all">
          <RefreshCw className="h-3 w-3" /> Wallet
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Strategy Sales" value={`${stratRow.total.toLocaleString()} CP`} sub="all time" icon={<BarChart2 className="h-4 w-4 text-violet-400" />} color="bg-violet-400/10" />
        <StatCard label="Copy Trading" value={`${copyRow.total.toLocaleString()} CP`} sub="fees earned" icon={<RefreshCw className="h-4 w-4 text-sky-400" />} color="bg-sky-400/10" />
        <StatCard label="Event Prizes" value={`${prizeRow.total.toLocaleString()} CP`} sub="all time" icon={<Award className="h-4 w-4 text-amber-400" />} color="bg-amber-400/10" />
        <StatCard label="Total Withdrawn" value={`${totalWithdrawn.toLocaleString()} CP`} sub={`${totPend.toLocaleString()} pending`} icon={<DollarSign className="h-4 w-4 text-emerald-400" />} color="bg-emerald-400/10" />
      </div>

      {/* Earnings breakdown */}
      <section>
        <p className="text-[10px] text-white/30 uppercase tracking-widest mb-3 font-semibold">Earnings Breakdown</p>
        <div className="rounded-2xl border border-white/6 overflow-hidden" style={{ background:'rgba(255,255,255,0.02)' }}>
          <div className="grid grid-cols-[1fr_100px_100px_120px] gap-2 px-4 py-2 border-b border-white/5">
            {['Source','This Month','Last Month','All Time'].map(h => (
              <p key={h} className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">{h}</p>
            ))}
          </div>
          {[
            { label:'Strategy Sales', data:stratRow, color:'text-violet-400' },
            { label:'Copy Trading Fees', data:copyRow, color:'text-sky-400' },
            { label:'Event Prizes', data:prizeRow, color:'text-amber-400' },
            { label:'Referral Bonuses', data:refRow, color:'text-emerald-400' },
          ].map(({ label, data, color }, i) => (
            <motion.div key={label} initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:i*0.05 }}
              className={cn('grid grid-cols-[1fr_100px_100px_120px] gap-2 px-4 py-3 border-b border-white/4 last:border-0', i%2===1&&'bg-white/[0.015]')}>
              <p className="text-xs font-semibold text-white/70">{label}</p>
              <p className={cn('text-xs font-bold', color)}>{data.thisMonth.toLocaleString()} CP</p>
              <p className="text-xs text-white/40">{data.lastMonth.toLocaleString()} CP</p>
              <p className="text-xs font-bold text-white/70">{data.total.toLocaleString()} CP</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Payout request form */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] text-white/30 uppercase tracking-widest font-semibold">Payout Requests</p>
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-[10px] font-bold hover:bg-primary/90 transition-all">
            <Send className="h-3 w-3" /> Request New Payout
          </button>
        </div>

        {showForm && (
          <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} className="overflow-hidden mb-4">
            <div className="rounded-2xl border border-white/8 p-5 space-y-4" style={{ background:'rgba(255,255,255,0.03)' }}>
              <p className="text-xs text-white/40">Available: <span className="text-amber-400 font-bold">{totPend.toLocaleString()} CP</span></p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] text-white/40 mb-1 block">Amount (CP)</label>
                  <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="e.g. 500"
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white focus:outline-none focus:border-primary/50" />
                </div>
                <div>
                  <label className="text-[10px] text-white/40 mb-1 block">Method</label>
                  <select value={payMethod} onChange={e => setPayMethod(e.target.value as PayoutMethod)}
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white focus:outline-none">
                    <option value="cp_wallet">CP Wallet (Instant)</option>
                    <option value="bank">Bank Transfer</option>
                    <option value="crypto">Crypto Wallet</option>
                  </select>
                </div>
                {payMethod !== 'cp_wallet' && (
                  <div>
                    <label className="text-[10px] text-white/40 mb-1 block">Address / IBAN</label>
                    <input type="text" value={payAddr} onChange={e => setPayAddr(e.target.value)} placeholder="0x... or IBAN"
                      className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white focus:outline-none" />
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={handlePayout} disabled={loading}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1.5 disabled:opacity-50">
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Submit
                </button>
                <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl bg-white/5 text-white/40 text-xs hover:bg-white/10">Cancel</button>
              </div>
            </div>
          </motion.div>
        )}

        <div className="rounded-2xl border border-white/6 overflow-hidden" style={{ background:'rgba(255,255,255,0.02)' }}>
          <div className="grid grid-cols-[100px_80px_80px_100px_100px] gap-2 px-4 py-2 border-b border-white/5">
            {['Requested','Amount','Status','Method','Action'].map(h => (
              <p key={h} className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">{h}</p>
            ))}
          </div>
          {myPayouts.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-white/20">No payout requests yet</div>
          )}
          {myPayouts.map((p, i) => (
            <motion.div key={p.id} initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:i*0.04 }}
              className="grid grid-cols-[100px_80px_80px_100px_100px] gap-2 px-4 py-3 border-b border-white/4 last:border-0 items-center">
              <p className="text-[10px] text-white/50">{timeAgo(p.createdAt)}</p>
              <p className="text-xs font-bold text-white">{p.amountCP.toLocaleString()} CP</p>
              <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full border capitalize w-fit', STATUS_STYLES[p.status])}>
                {p.status}
              </span>
              <p className="text-[10px] text-white/50">{METHOD_LABELS[p.method]}</p>
              <div>
                {p.status === 'paid' ? (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-400"><Check className="h-3 w-3" /> Paid</span>
                ) : p.status === 'pending' ? (
                  <span className="text-[10px] text-white/30 flex items-center gap-1"><Clock className="h-3 w-3" /> Pending</span>
                ) : (
                  <span className="text-[10px] text-red-400 flex items-center gap-1"><X className="h-3 w-3" /> {p.status}</span>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
