/**
 * WalletPage.tsx — /wallet
 * Balance, pending earnings, full transaction history, payout request
 */
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, TrendingUp, Clock, ArrowUpRight, ArrowDownRight, RefreshCw, DollarSign, Send, Eye, Loader2, ChevronDown } from 'lucide-react';
import { useMonetizationStore, PayoutMethod, useLiveCpPackages } from '@/lib/monetizationStore';
import { useCpCoinsStore } from '@/lib/cpCoinsStore';
import { useAcademyStore, getLevelInfo } from '@/lib/academyStore';
import { useAuthStore } from '@/lib/authStore';
import { useTradingStore } from '@/lib/tradingStore';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { toast as sonnerToast } from 'sonner';

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60000) return `${Math.floor(d/1000)}s ago`;
  if (d < 3600000) return `${Math.floor(d/60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d/3600000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

const TX_ICONS: Record<string, React.ReactNode> = {
  credit: <ArrowDownRight className="h-3.5 w-3.5 text-emerald-400" />,
  debit:  <ArrowUpRight className="h-3.5 w-3.5 text-red-400" />,
};

const SOURCE_LABELS: Record<string, string> = {
  strategy_sale: 'Strategy Sale',
  copy_fee:      'Copy Trading Fee',
  event_prize:   'Event Prize',
  referral:      'Referral Bonus',
};

const SOURCE_COLORS: Record<string, string> = {
  strategy_sale: 'text-violet-400 bg-violet-400/10',
  copy_fee:      'text-sky-400 bg-sky-400/10',
  event_prize:   'text-amber-400 bg-amber-400/10',
  referral:      'text-emerald-400 bg-emerald-400/10',
};

const DAILY_CP_CONVERT_LIMIT = 50000;

function getConvertedToday(userId: string): number {
  const today = new Date().toDateString();
  const transactions = useCpCoinsStore.getState().getHistory(userId) || [];
  return transactions
    .filter(t => t.type === 'sim_credit_purchase' && new Date(t.timestamp).toDateString() === today)
    .reduce((sum, t) => sum + t.amount, 0);
}

function checkDailyConversionLimit(userId: string, cpAmount: number): { allowed: boolean; remaining: number } {
  const converted = getConvertedToday(userId);
  const remaining = Math.max(0, DAILY_CP_CONVERT_LIMIT - converted);
  return {
    allowed: converted + cpAmount <= DAILY_CP_CONVERT_LIMIT,
    remaining,
  };
}

function XPLevelCard() {
  const totalXP     = useAcademyStore(s => s.totalXP);
  const usedXP      = useAcademyStore(s => s.usedXP);
  const availableXP = totalXP - usedXP;
  const level       = Math.min(10, Math.max(1, Math.floor(availableXP / 1000) + 1));
  const info        = getLevelInfo(totalXP);
  return (
    <div className="rounded-2xl border border-primary/20 p-5 bg-gradient-to-br from-primary/8 to-primary/3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Academy Level</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-foreground">Lv.{level}</span>
            <span className="text-sm font-semibold text-primary">{info.name}</span>
          </div>
          <div className="mt-2 w-48">
            <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
              <span>{info.progress}% to next</span>
              <span>{info.nextAt.toLocaleString()} XP</span>
            </div>
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${info.progress}%` }} />
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Available XP</p>
          <p className="text-2xl font-black font-mono text-foreground">⭐ {availableXP.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Total earned: {totalXP.toLocaleString()} XP</p>
        </div>
      </div>
    </div>
  );
}

export function WalletPage() {
  const { user } = useAuthStore();
  const { getPendingEarnings, getEarningsBySource, getTotalPending, submitPayoutRequest } = useMonetizationStore();
  const { getBalance, getHistory } = useCpCoinsStore();
  const navigate = useNavigate();

  const userId   = user?.id ?? 'demo_user';
  const balance  = getBalance(userId);
  const history  = getHistory(userId).slice(0, 50);
  const simBalance = useTradingStore(s => s.balance);
  const addSimBalance = useTradingStore(s => s.addSimulationBalance);
  const pending  = getPendingEarnings(userId);
  const totPend  = getTotalPending(userId);
  const bySource = getEarningsBySource(userId);

  const [showPayout, setShowPayout] = useState(false);
  const [payAmount, setPayAmount]   = useState('');
  const [customAmount, setCustomAmount] = useState(0);
  const [cpNeeded, setCpNeeded] = useState(0);
  const [payMethod, setPayMethod]   = useState<PayoutMethod>('cp_wallet');
  const [payAddr, setPayAddr]       = useState('');
  const [loading, setLoading]       = useState(false);
  const [histFilter, setHistFilter] = useState<'all'|'credit'|'debit'>('all');

  // ── P2-3: Advanced filters ──────────────────────────────────────────────
  const [filterType, setFilterType] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterMinAmount, setFilterMinAmount] = useState('');
  const [filterMaxAmount, setFilterMaxAmount] = useState('');

  const filteredHist = useMemo(() => {
    let filtered = history;
    // Direction filter
    if (histFilter !== 'all') filtered = filtered.filter(t => t.direction === histFilter);
    // Type filter
    if (filterType !== 'all') filtered = filtered.filter(t => t.type === filterType);
    // Date filters
    if (filterDateFrom) filtered = filtered.filter(t => new Date(t.createdAt) >= new Date(filterDateFrom));
    if (filterDateTo) filtered = filtered.filter(t => new Date(t.createdAt) <= new Date(filterDateTo));
    // Amount filters
    if (filterMinAmount) filtered = filtered.filter(t => t.amount >= parseInt(filterMinAmount));
    if (filterMaxAmount) filtered = filtered.filter(t => t.amount <= parseInt(filterMaxAmount));
    return filtered;
  }, [history, histFilter, filterType, filterDateFrom, filterDateTo, filterMinAmount, filterMaxAmount]);

  const hasAdvancedFilters = filterType !== 'all' || filterDateFrom || filterDateTo || filterMinAmount || filterMaxAmount;

  const clearAdvancedFilters = () => {
    setFilterType('all');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterMinAmount('');
    setFilterMaxAmount('');
  };

  // ── P2-2: CSV export ────────────────────────────────────────────────────
  const exportWalletHistoryCSV = () => {
    const rows = filteredHist.map(t => ({
      Date: new Date(t.createdAt).toLocaleDateString(),
      Type: t.type,
      Description: t.description.replace(/,/g, ''),
      Amount: t.direction === 'credit' ? `+${t.amount}` : `-${t.amount}`,
      Balance: t.balanceAfter,
    }));
    const headers = ['Date', 'Type', 'Description', 'Amount', 'Balance'];
    const csv = [headers.join(','), ...rows.map(r => Object.values(r).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `cryptoverse_wallet_history_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  async function handlePayout() {
    const amount = parseInt(payAmount, 10);
    if (!amount || amount < 10) { toast.error('Minimum payout is 10 CP'); return; }
    setLoading(true);
    await new Promise(r => setTimeout(r, 700));
    const result = submitPayoutRequest({ userId, amountCP: amount, method: payMethod, address: payAddr || undefined });
    setLoading(false);
    if (result.ok) {
      toast.success(result.instant ? `${amount} CP credited to your wallet instantly!` : 'Payout request submitted for review');
      setShowPayout(false); setPayAmount(''); setPayAddr('');
    } else {
      toast.error(result.error ?? 'Payout failed');
    }
  }

  return (
    <div className="min-h-screen p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-black tracking-tight">Wallet & Transactions</h1>
        </div>
        <button onClick={() => navigate('/buy-cp')}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all">
          <DollarSign className="h-3.5 w-3.5" /> Buy CP
        </button>
      </div>

      {/* Balance card */}
      <div className="rounded-2xl border border-primary/20 p-6 bg-gradient-to-br from-primary/10 to-primary/5">
        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Available Balance</p>
        <p className="text-4xl font-black text-foreground">{balance.toLocaleString()} <span className="text-lg text-primary font-bold">CP</span></p>
        <div className="flex flex-wrap gap-2 mt-4">
          <button onClick={() => navigate('/buy-cp')}
            className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-secondary/30 border border-border hover:bg-secondary/50 transition-all">
            Buy CP
          </button>
          <button onClick={() => setShowPayout(!showPayout)}
            className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-secondary/30 border border-border hover:bg-secondary/50 transition-all flex items-center gap-1">
            <Send className="h-3 w-3" /> Request Payout
          </button>
          <button onClick={() => navigate('/creator/earnings')}
            className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-secondary/30 border border-border hover:bg-secondary/50 transition-all flex items-center gap-1">
            <Eye className="h-3 w-3" /> Earnings Dashboard
          </button>
        </div>
      </div>

      {/* ── XP & Level Card ── */}
      <XPLevelCard />

      {/* ── Sim Credits Section ── */}
      <div className="rounded-2xl border border-emerald-500/20 p-5 bg-gradient-to-br from-emerald-500/8 to-emerald-500/3">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Simulator Balance</p>
            <p className="text-2xl font-black text-foreground font-mono">${simBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          </div>
          <div className="text-right">
            <span className="text-xs text-muted-foreground block">10 CP = $1 Sim</span>
            <span className="text-[10px] font-semibold text-muted-foreground block mt-0.5">
              Daily Cap: {getConvertedToday(userId).toLocaleString()} / {DAILY_CP_CONVERT_LIMIT.toLocaleString()} CP
            </span>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mb-3">Convert CP to simulator credits for paper trading</p>

        {/* Preset packages */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { cp: 1000, sim: 100, label: '1,000 CP', sub: '$100 Sim' },
            { cp: 5000, sim: 500, label: '5,000 CP', sub: '$500 Sim' },
            { cp: 10000, sim: 1000, label: '10,000 CP', sub: '$1,000 Sim', popular: true },
          ].map((pkg, idx) => (
            <button
              key={idx}
              onClick={() => {
                const currentCP = getBalance(userId);
                if (currentCP < pkg.cp) {
                  toast.error(`Not enough CP! You have ${currentCP.toLocaleString()} CP, need ${pkg.cp.toLocaleString()} CP.`);
                  return;
                }
                const limitCheck = checkDailyConversionLimit(userId, pkg.cp);
                if (!limitCheck.allowed) {
                  toast.error(`Daily conversion limit exceeded! Remaining today: ${limitCheck.remaining.toLocaleString()} CP (Limit: 50,000 CP/day).`);
                  return;
                }
                useCpCoinsStore.getState().debit({
                  userId, amount: pkg.cp, type: 'sim_credit_purchase' as any,
                  description: `Purchase ${pkg.sim} simulator credits`
                });
                addSimBalance(pkg.sim);
                toast.success(`✅ ${pkg.sim} added to simulator balance!`);
              }}
              className={cn(
                'rounded-xl p-3 text-center border transition-all',
                pkg.popular
                  ? 'bg-emerald-500/15 border-emerald-500/30 hover:bg-emerald-500/25'
                  : 'bg-card/50 border-border hover:bg-secondary/50',
              )}
            >
              <p className="text-sm font-bold text-foreground font-mono">{pkg.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{pkg.sub}</p>
              {pkg.popular && <p className="text-[9px] font-bold text-emerald-400 mt-1">Best Value</p>}
            </button>
          ))}
        </div>

        {/* Custom Amount */}
        <div className="rounded-xl bg-card/60 border border-border p-4">
          <p className="text-xs font-semibold text-foreground mb-3">Custom Amount</p>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[120px]">
              <label className="text-[10px] text-muted-foreground mb-1 block">Simulator USD</label>
              <input
                type="number"
                value={customAmount || ''}
                onChange={(e) => {
                  const val = Math.max(0, Number(e.target.value));
                  setCustomAmount(val);
                  setCpNeeded(val * 10);
                }}
                placeholder="Enter amount..."
                className="w-full h-9 px-3 rounded-lg bg-secondary/30 border border-border text-sm text-foreground font-mono focus:outline-none focus:border-primary/40 placeholder:text-muted-foreground"
              />
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">CP Cost</p>
              <p className={cn('text-sm font-bold font-mono', cpNeeded > getBalance(userId) ? 'text-red-400' : 'text-emerald-400')}>
                {cpNeeded.toLocaleString()} CP
              </p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">Available</p>
              <p className="text-sm font-bold font-mono text-foreground">{getBalance(userId).toLocaleString()} CP</p>
            </div>
            <button
              onClick={() => {
                if (customAmount <= 0) { toast.error('Enter an amount greater than 0.'); return; }
                const currentCP = getBalance(userId);
                if (currentCP < cpNeeded) {
                  toast.error(`Not enough CP! You have ${currentCP.toLocaleString()} CP, need ${cpNeeded.toLocaleString()} CP.`);
                  return;
                }
                const limitCheck = checkDailyConversionLimit(userId, cpNeeded);
                if (!limitCheck.allowed) {
                  toast.error(`Daily conversion limit exceeded! Remaining today: ${limitCheck.remaining.toLocaleString()} CP (Limit: 50,000 CP/day).`);
                  return;
                }
                useCpCoinsStore.getState().debit({
                  userId, amount: cpNeeded, type: 'sim_credit_purchase' as any,
                  description: `Purchase ${customAmount} simulator credits`
                });
                addSimBalance(customAmount);
                toast.success(`✅ ${customAmount} added to simulator balance!`);
                setCustomAmount(0);
                setCpNeeded(0);
              }}
              disabled={customAmount <= 0 || cpNeeded > getBalance(userId)}
              className={cn(
                'px-5 py-2 rounded-xl text-xs font-semibold transition-all',
                customAmount > 0 && cpNeeded <= getBalance(userId)
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
                  : 'bg-secondary/30 text-muted-foreground border border-border cursor-not-allowed',
              )}
            >
              {customAmount > 0 ? `Buy ${customAmount}` : 'Enter Amount'}
            </button>
          </div>
        </div>
      </div>

      {/* ── NFT Credits Section ── */}
      <div className="rounded-2xl border border-violet-500/20 p-5 bg-gradient-to-br from-violet-500/8 to-violet-500/3">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🖼️</span>
            <div>
              <p className="text-xs font-semibold text-foreground">NFT Credits</p>
              <p className="text-[10px] text-muted-foreground">Convert CP to NFT credits for NFT purchases</p>
            </div>
          </div>
        </div>
        <div className="nft-credits-section rounded-xl p-4 bg-secondary/30 border border-border">
          <p className="text-muted-foreground text-xs">NFT Credits will be available soon.</p>
        </div>
      </div>

      {/* Payout form */}
      <AnimatePresence>
        {showPayout && (
          <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} exit={{ opacity:0, height:0 }}
            className="overflow-hidden">
            <div className="rounded-2xl border border-border p-5 space-y-4 bg-card/50">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2"><Send className="h-4 w-4 text-primary" /> Request Payout</h3>
              <p className="text-xs text-muted-foreground">Available to request: <span className="text-amber-400 font-bold">{totPend.toLocaleString()} CP</span></p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] text-white/40 mb-1 block">Amount (CP)</label>
                  <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="e.g. 500"
                    className="w-full px-3 py-2 rounded-xl bg-secondary/30 border border-border text-xs text-foreground focus:outline-none focus:border-primary/50" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Payout Method</label>
                  <select value={payMethod} onChange={e => setPayMethod(e.target.value as PayoutMethod)}
                    className="w-full px-3 py-2 rounded-xl bg-secondary/30 border border-border text-xs text-foreground focus:outline-none focus:border-primary/50">
                    <option value="cp_wallet">CP Wallet (Instant)</option>
                    <option value="bank">Bank Transfer</option>
                    <option value="crypto">Crypto Wallet</option>
                  </select>
                </div>
                {payMethod !== 'cp_wallet' && (
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-1 block">Address / IBAN</label>
                    <input type="text" value={payAddr} onChange={e => setPayAddr(e.target.value)} placeholder="0x... or IBAN"
                      className="w-full px-3 py-2 rounded-xl bg-secondary/30 border border-border text-xs text-foreground focus:outline-none focus:border-primary/50" />
                  </div>
                )}
              </div>
              <div className="fee-breakdown rounded-xl p-3 bg-secondary/30 border border-border space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Est. Gas Fee</span>
                  <span className="font-semibold text-foreground">~2 USDT</span>
                </div>
                <div className="flex justify-between">
                  <span>Platform Fee</span>
                  <span className="font-semibold text-foreground">0%</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1 font-bold text-foreground">
                  <span>Net Payout</span>
                  <span className="text-emerald-400">
                    {payMethod === 'crypto'
                      ? `${Math.max(0, +((+payAmount / 100) - 2).toFixed(2))} USDT`
                      : `${+payAmount.toLocaleString()} CP`}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handlePayout} disabled={loading}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 flex items-center gap-1.5 disabled:opacity-50">
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Submit Request
                </button>
                <button onClick={() => setShowPayout(false)} className="px-4 py-2 rounded-xl bg-secondary/30 text-secondary-foreground text-xs hover:bg-secondary/50">Cancel</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pending Earnings */}
      {pending.length > 0 && (
        <section>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-3 font-semibold flex items-center gap-2">
            <Clock className="h-3 w-3" /> Pending Earnings
            <span className="bg-amber-400/20 text-amber-400 text-[9px] font-black px-1.5 py-0.5 rounded-full">{totPend.toLocaleString()} CP</span>
          </p>
          <div className="rounded-2xl border border-border divide-y divide-border bg-card/50">
            {Object.entries(bySource).filter(([,v]) => v > 0).map(([source, amount]) => (
              <div key={source} className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full', SOURCE_COLORS[source])}>
                    {SOURCE_LABELS[source] ?? source}
                  </span>
                </div>
                <span className="text-sm font-black text-amber-400">+{amount.toLocaleString()} CP</span>
              </div>
            ))}
            <div className="px-4 py-3 flex items-center justify-between bg-secondary/10">
              <span className="text-xs font-bold text-muted-foreground">Total Pending</span>
              <div className="flex items-center gap-3">
                <span className="text-sm font-black text-amber-400">{totPend.toLocaleString()} CP</span>
                <button onClick={() => setShowPayout(true)}
                  className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 transition-colors">
                  Request Payout
                </button>
              </div>
            </div>
          </div>
        </section>
      )}


      {/* Transaction History */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Recent Transactions</p>
            {filteredHist.length > 0 && (
              <button onClick={exportWalletHistoryCSV}
                className="text-[9px] px-2 py-1 rounded-lg bg-green-500/15 text-green-400 border border-green-500/25 hover:bg-green-500/25 transition-all flex items-center gap-1">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                CSV
              </button>
            )}
            {hasAdvancedFilters && (
              <button onClick={clearAdvancedFilters} className="text-[9px] px-2 py-1 rounded-lg bg-secondary/30 text-muted-foreground border border-border hover:text-foreground transition-all">Clear Filters</button>
            )}
          </div>
          <div className="flex items-center gap-1">
            {(['all','credit','debit'] as const).map(f => (
              <button key={f} onClick={() => setHistFilter(f)}
                className={cn('text-[9px] font-bold px-2 py-0.5 rounded-full capitalize transition-all',
                  histFilter === f ? 'bg-secondary/30 text-foreground border border-border' : 'text-muted-foreground hover:text-foreground')}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Advanced filters row */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="h-7 text-[10px] px-2 rounded-lg bg-secondary/30 border border-border text-muted-foreground focus:outline-none">
            <option value="all">All Types</option>
            <option value="purchase_strategy">Purchase</option>
            <option value="sell_strategy">Sale</option>
            <option value="subscription_reward">Subscription</option>
            <option value="referral_bonus">Referral</option>
            <option value="daily_reward">Daily Reward</option>
            <option value="achievement_reward">Achievement</option>
            <option value="sim_credit_purchase">Sim Credits</option>
            <option value="platform_fee">Fee</option>
          </select>
          <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="h-7 text-[10px] px-2 rounded-lg bg-secondary/30 border border-border text-muted-foreground focus:outline-none" title="From" />
          <span className="text-[10px] text-muted-foreground">to</span>
          <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="h-7 text-[10px] px-2 rounded-lg bg-secondary/30 border border-border text-muted-foreground focus:outline-none" title="To" />
          <input type="number" placeholder="Min CP" value={filterMinAmount} onChange={(e) => setFilterMinAmount(e.target.value)} className="h-7 w-[72px] text-[10px] px-2 rounded-lg bg-secondary/30 border border-border text-muted-foreground focus:outline-none placeholder:text-muted-foreground" />
          <input type="number" placeholder="Max CP" value={filterMaxAmount} onChange={(e) => setFilterMaxAmount(e.target.value)} className="h-7 w-[72px] text-[10px] px-2 rounded-lg bg-secondary/30 border border-border text-muted-foreground focus:outline-none placeholder:text-muted-foreground" />
        </div>
        <div className="rounded-2xl border border-border overflow-hidden bg-card/50">
          <div className="grid grid-cols-[1fr_100px_80px_70px] gap-2 px-4 py-2 border-b border-border">
            {['Description','Type','Amount','When'].map(h => (
              <p key={h} className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{h}</p>
            ))}
          </div>
          {filteredHist.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">No transactions yet</div>
          )}
          {filteredHist.slice(0, 30).map((tx, i) => (
            <motion.div key={tx.id} initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay: i*0.02 }}
              className="grid grid-cols-[1fr_100px_80px_70px] gap-2 px-4 py-2.5 border-b border-border last:border-0 hover:bg-secondary/10 items-center">
              <p className="text-[11px] text-foreground/70 truncate">{tx.description}</p>
              <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full w-fit capitalize',
                tx.type === 'purchase_strategy' ? 'bg-violet-400/10 text-violet-400' :
                tx.type === 'sell_strategy'     ? 'bg-emerald-400/10 text-emerald-400' :
                tx.type === 'competition_prize' ? 'bg-amber-400/10 text-amber-400' :
                tx.type === 'platform_fee'      ? 'bg-red-400/10 text-red-400' :
                'bg-secondary/30 text-muted-foreground')}>
                {tx.type.replace(/_/g,' ')}
              </span>
              <span className={cn('text-xs font-bold', tx.direction === 'credit' ? 'text-emerald-400' : 'text-red-400')}>
                {tx.direction === 'credit' ? '+' : '-'}{tx.amount.toLocaleString()} CP
              </span>
              <span className="text-[10px] text-muted-foreground">{timeAgo(tx.createdAt)}</span>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
