/**
 * AdminRevenueDashboard.tsx — /admin/revenue
 * Platform revenue overview + payout management
 */
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { DollarSign, TrendingUp, Zap, BarChart2, Check, X, RefreshCw, Download, Clock, Users, ShoppingBag } from 'lucide-react';
import { useMonetizationStore, RevenueSource, PayoutRequest } from '@/lib/monetizationStore';
import { useAdminAuthStore } from '@/lib/adminAuthStore';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Period = 1 | 7 | 30 | 365;

const SOURCE_META: Record<RevenueSource, { label: string; color: string; emoji: string }> = {
  strategy_fee: { label:'Strategy Fees',    color:'#7c3aed', emoji:'🏪' },
  event_fee:    { label:'Event Fees',       color:'#f59e0b', emoji:'🏆' },
  subscription: { label:'Subscriptions',   color:'#3b82f6', emoji:'💎' },
  bot_fee:      { label:'Bot Deployment',   color:'#10b981', emoji:'🤖' },
  api_fee:      { label:'API Access',       color:'#06b6d4', emoji:'🔌' },
  cp_purchase:  { label:'CP Purchases',     color:'#f97316', emoji:'💰' },
};

const STATUS_STYLES: Record<string, string> = {
  pending:  'text-amber-400 bg-amber-400/10 border-amber-400/20',
  approved: 'text-sky-400 bg-sky-400/10 border-sky-400/20',
  paid:     'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  rejected: 'text-red-400 bg-red-400/10 border-red-400/20',
};

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60000) return `${Math.floor(d/1000)}s ago`;
  if (d < 3600000) return `${Math.floor(d/60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d/3600000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

function StatCard({ label, value, sub, icon, color }: { label:string;value:string;sub?:string;icon:React.ReactNode;color:string }) {
  return (
    <div className="rounded-2xl border border-white/6 p-4 flex gap-3 items-start" style={{ background:'rgba(255,255,255,0.03)' }}>
      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', color)}>{icon}</div>
      <div>
        <p className="text-[10px] text-white/40 uppercase tracking-wider truncate">{label}</p>
        <p className="text-lg font-black text-white leading-tight">{value}</p>
        {sub && <p className="text-[10px] text-white/30 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// Generate chart data for N days
function buildChartData(revenueLog: any[], days: number) {
  const buckets: Record<string, Record<RevenueSource, number>> = {};
  const now = Date.now();
  const since = now - days * 86400000;

  revenueLog.forEach(r => {
    const ts = new Date(r.createdAt).getTime();
    if (ts < since) return;
    const label = days <= 7
      ? new Date(r.createdAt).toLocaleDateString('en',{weekday:'short'})
      : days <= 31
        ? new Date(r.createdAt).toLocaleDateString('en',{month:'short',day:'numeric'})
        : new Date(r.createdAt).toLocaleDateString('en',{month:'short'});
    if (!buckets[label]) buckets[label] = { strategy_fee:0,event_fee:0,subscription:0,bot_fee:0,api_fee:0,cp_purchase:0 };
    buckets[label][r.source as RevenueSource] += r.amountCP + r.amountUSD * 100;
  });

  return Object.entries(buckets).map(([name, data]) => ({ name, ...data, total: Object.values(data).reduce((a,b)=>a+b,0) }));
}

export function AdminRevenueDashboard() {
  const { revenueLog, getRevenueSummary, getTotalRevenueCP, payoutRequests, approvePayoutRequest, rejectPayoutRequest } = useMonetizationStore();
  const { session } = useAdminAuthStore();
  const [period, setPeriod] = useState<Period>(30);
  const [loading, setLoading] = useState<string | null>(null);

  const summary    = useMemo(() => getRevenueSummary(period), [period, revenueLog]);
  const totalCP    = useMemo(() => getTotalRevenueCP(period), [period, revenueLog]);
  const chartData  = useMemo(() => buildChartData(revenueLog, period), [revenueLog, period]);
  const pendingPay = useMemo(() => payoutRequests.filter(p => p.status === 'pending'), [payoutRequests]);

  const totalUSD = useMemo(() =>
    revenueLog.filter(r => new Date(r.createdAt).getTime() > Date.now() - period*86400000)
      .reduce((s,r) => s + r.amountUSD, 0)
  , [revenueLog, period]);

  async function handleApprove(req: PayoutRequest) {
    setLoading(req.id);
    await new Promise(r => setTimeout(r,500));
    approvePayoutRequest(req.id, session?.adminId ?? 'admin');
    setLoading(null);
    toast.success(`Payout of ${req.amountCP} CP approved`);
  }

  async function handleReject(req: PayoutRequest) {
    setLoading(req.id + '_r');
    await new Promise(r => setTimeout(r,400));
    rejectPayoutRequest(req.id, session?.adminId ?? 'admin', 'Rejected by admin');
    setLoading(null);
    toast.error(`Payout rejected`);
  }

  return (
    <div className="min-h-screen p-4 md:p-6 space-y-6 text-white">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-black tracking-tight">Revenue Dashboard</h1>
          <p className="text-[11px] text-white/40 mt-0.5">Platform financial overview — all revenue streams</p>
        </div>
        <div className="flex items-center gap-2">
          {([1,7,30,365] as Period[]).map(d => (
            <button key={d} onClick={() => setPeriod(d)}
              className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold transition-all',
                period === d ? 'bg-primary text-primary-foreground' : 'bg-white/5 text-white/40 hover:bg-white/10')}>
              {d===1?'Today':d===7?'Week':d===30?'Month':'Year'}
            </button>
          ))}
          <button onClick={() => toast.info('Export coming soon')}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/5 text-white/40 hover:bg-white/10 border border-white/8">
            <Download className="h-3 w-3" /> Export
          </button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard label="Total Revenue" value={`${Math.round(totalCP/100)}$`} sub={`${totalCP.toLocaleString()} CP eq.`} icon={<DollarSign className="h-4 w-4 text-emerald-400" />} color="bg-emerald-400/10" />
        <StatCard label="Subscriptions" value={`$${totalUSD.toFixed(0)}`} sub="fiat revenue" icon={<Users className="h-4 w-4 text-sky-400" />} color="bg-sky-400/10" />
        <StatCard label="Strategy Fees" value={`${summary.strategy_fee.toLocaleString()} CP`} sub="20% platform cut" icon={<ShoppingBag className="h-4 w-4 text-violet-400" />} color="bg-violet-400/10" />
        <StatCard label="Event Fees" value={`${summary.event_fee.toLocaleString()} CP`} sub="10% platform cut" icon={<TrendingUp className="h-4 w-4 text-amber-400" />} color="bg-amber-400/10" />
        <StatCard label="Bot Fees" value={`${summary.bot_fee.toLocaleString()} CP`} sub="500 CP each" icon={<Zap className="h-4 w-4 text-emerald-400" />} color="bg-emerald-400/10" />
        <StatCard label="API Fees" value={`${summary.api_fee.toLocaleString()} CP`} sub="tiered access" icon={<BarChart2 className="h-4 w-4 text-cyan-400" />} color="bg-cyan-400/10" />
      </div>

      {/* Revenue chart */}
      <section>
        <p className="text-[10px] text-white/30 uppercase tracking-widest mb-3 font-semibold">Revenue Trend</p>
        <div className="rounded-2xl border border-white/6 p-4" style={{ background:'rgba(255,255,255,0.02)' }}>
          {chartData.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-xs text-white/20">No data for this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top:5, right:5, bottom:5, left:5 }}>
                <defs>
                  {Object.entries(SOURCE_META).map(([key, meta]) => (
                    <linearGradient key={key} id={`grad_${key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={meta.color} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={meta.color} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="name" tick={{ fill:'rgba(255,255,255,0.3)', fontSize:10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill:'rgba(255,255,255,0.3)', fontSize:10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background:'#1a1a2e', border:'1px solid rgba(255,255,255,0.1)', borderRadius:12, fontSize:11 }} labelStyle={{ color:'rgba(255,255,255,0.6)' }} />
                <Area type="monotone" dataKey="subscription" stackId="1" stroke="#3b82f6" fill="url(#grad_subscription)" strokeWidth={1.5} />
                <Area type="monotone" dataKey="strategy_fee" stackId="1" stroke="#7c3aed" fill="url(#grad_strategy_fee)" strokeWidth={1.5} />
                <Area type="monotone" dataKey="event_fee"    stackId="1" stroke="#f59e0b" fill="url(#grad_event_fee)"    strokeWidth={1.5} />
                <Area type="monotone" dataKey="bot_fee"      stackId="1" stroke="#10b981" fill="url(#grad_bot_fee)"      strokeWidth={1.5} />
                <Area type="monotone" dataKey="cp_purchase"  stackId="1" stroke="#f97316" fill="url(#grad_cp_purchase)"  strokeWidth={1.5} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* Revenue breakdown table */}
      <section>
        <p className="text-[10px] text-white/30 uppercase tracking-widest mb-3 font-semibold">Revenue Breakdown</p>
        <div className="rounded-2xl border border-white/6 overflow-hidden" style={{ background:'rgba(255,255,255,0.02)' }}>
          <div className="grid grid-cols-[1fr_100px_100px_80px] gap-2 px-4 py-2 border-b border-white/5">
            {['Source','CP Amount','USD Equiv.','Share'].map(h => (
              <p key={h} className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">{h}</p>
            ))}
          </div>
          {Object.entries(SOURCE_META).map(([source, meta], i) => {
            const cp  = summary[source as RevenueSource];
            const pct = totalCP > 0 ? ((cp / totalCP) * 100).toFixed(1) : '0.0';
            return (
              <motion.div key={source} initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:i*0.04 }}
                className={cn('grid grid-cols-[1fr_100px_100px_80px] gap-2 px-4 py-3 border-b border-white/4 last:border-0', i%2===1&&'bg-white/[0.015]')}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.color }} />
                  <span className="text-xs text-white/70">{meta.emoji} {meta.label}</span>
                </div>
                <p className="text-xs font-bold text-white">{cp.toLocaleString()} CP</p>
                <p className="text-xs text-white/50">${(cp/100).toFixed(2)}</p>
                <div className="flex items-center gap-1">
                  <div className="h-1 rounded-full bg-white/10 flex-1">
                    <div className="h-1 rounded-full" style={{ width:`${pct}%`, background: meta.color }} />
                  </div>
                  <span className="text-[10px] text-white/40 shrink-0">{pct}%</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Pending Payouts */}
      <section>
        <p className="text-[10px] text-white/30 uppercase tracking-widest mb-3 font-semibold flex items-center gap-2">
          <Clock className="h-3 w-3" /> Pending Payout Requests
          {pendingPay.length > 0 && (
            <span className="bg-amber-400/20 text-amber-400 text-[9px] font-black px-1.5 py-0.5 rounded-full">{pendingPay.length}</span>
          )}
        </p>
        {pendingPay.length === 0 ? (
          <div className="rounded-2xl border border-white/6 py-8 text-center" style={{ background:'rgba(255,255,255,0.02)' }}>
            <Check className="h-8 w-8 text-emerald-400/30 mx-auto mb-2" />
            <p className="text-xs text-white/20">No pending payout requests</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/6 overflow-hidden" style={{ background:'rgba(255,255,255,0.02)' }}>
            <div className="grid grid-cols-[1fr_80px_90px_80px_120px] gap-2 px-4 py-2 border-b border-white/5">
              {['User','Amount','Method','Requested','Actions'].map(h => (
                <p key={h} className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">{h}</p>
              ))}
            </div>
            {pendingPay.map((req, i) => (
              <motion.div key={req.id} initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:i*0.05 }}
                className="grid grid-cols-[1fr_80px_90px_80px_120px] gap-2 px-4 py-3 border-b border-white/4 last:border-0 items-center">
                <p className="text-xs font-semibold text-white/70 truncate">{req.userId}</p>
                <p className="text-xs font-bold text-amber-400">{req.amountCP.toLocaleString()} CP</p>
                <span className="text-[10px] text-white/50 capitalize">{req.method.replace('_',' ')}</span>
                <span className="text-[10px] text-white/30">{timeAgo(req.createdAt)}</span>
                <div className="flex items-center gap-1.5">
                  <button disabled={loading === req.id} onClick={() => handleApprove(req)}
                    className="flex items-center gap-0.5 text-[9px] font-bold px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25 disabled:opacity-50">
                    <Check className="h-2.5 w-2.5" /> Approve
                  </button>
                  <button disabled={loading === req.id+'_r'} onClick={() => handleReject(req)}
                    className="flex items-center gap-0.5 text-[9px] font-bold px-2 py-1 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 disabled:opacity-50">
                    <X className="h-2.5 w-2.5" /> Reject
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
