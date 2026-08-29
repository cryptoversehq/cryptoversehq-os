/**
 * EngineStatsPanel.tsx — Live Engine Statistics
 *
 * Surfaces internals of all four business-logic engines:
 *   §4.1 WhaleDetectionEngine  — significance distribution histogram + recent scored txs
 *   §4.2 SmartMoneyIdentifier  — wallet metrics breakdown + smart score bars
 *   §4.3 ExchangeFlowAnalyzer  — per-exchange signal table + overall market sentiment
 *   §4.4 AlertTriggerSystem    — trigger type distribution + recent trigger log
 *
 * Shown as an expandable panel on the On-Chain Dashboard.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Zap, Brain, BarChart2, Bell, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useOnChainStore } from '../../lib/onChainStore';
import { useAuthStore } from '../../lib/authStore';
import { simulateTick } from '../../lib/onChainSimulator';
import { whaleEngine, calculateSignificance } from '../../lib/whaleDetectionEngine';
import { smartMoneyId, calculateWalletMetrics } from '../../lib/smartMoneyIdentifier';
import { flowAnalyzer } from '../../lib/exchangeFlowAnalyzer';
import { SMART_MONEY_WALLETS, CHAIN_DISPLAY, fmtUsd, ALL_CHAINS } from './onChainUtils';
import { cn } from '@/lib/utils';

// ── Score bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ value, max = 100, color, label }: { value: number; max?: number; color: string; label: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-32 text-muted-foreground shrink-0 truncate">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="font-mono font-bold w-10 text-right shrink-0" style={{ color }}>
        {max === 1 ? value.toFixed(2) : Math.round(value)}
      </span>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function EngineSection({ icon, title, color, children }: {
  icon: React.ReactNode; title: string; color: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl p-4"
      style={{ background: 'rgba(255,255,255,0.025)', border: `1px solid ${color}20` }}>
      <div className="flex items-center gap-2 mb-4" style={{ color }}>
        {icon}
        <p className="text-xs font-bold uppercase tracking-wider">{title}</p>
      </div>
      {children}
    </div>
  );
}

// ── §4.1 Whale Detection Stats ────────────────────────────────────────────────

function WhaleEngineStats() {
  const [scored, setScored] = useState<Array<{ sig: number; tier: string; value: number }>>([]);

  useEffect(() => {
    const txs = simulateTick(ALL_CHAINS);
    const s = txs.map(tx => ({
      sig:   parseFloat(calculateSignificance(tx).total.toFixed(2)),
      tier:  tx.whaleTier,
      value: tx.valueUsd,
    }));
    setScored(s.sort((a, b) => b.sig - a.sig).slice(0, 8));
  }, []);

  // Significance histogram (buckets: 0-0.2, 0.2-0.4, 0.4-0.6, 0.6-0.8, 0.8-1.0)
  const buckets = [0, 0.2, 0.4, 0.6, 0.8, 1.0];
  const hist = buckets.slice(0, -1).map((lo, i) => {
    const hi = buckets[i + 1];
    return {
      range: `${lo.toFixed(1)}-${hi.toFixed(1)}`,
      count: scored.filter(s => s.sig >= lo && s.sig < hi).length,
      isAboveThreshold: lo >= 0.7,
    };
  });

  return (
    <EngineSection icon={<Zap className="h-4 w-4" />} title="§4.1 Whale Detection Engine" color="#FFD700">
      <div className="grid sm:grid-cols-3 gap-4 mb-4">
        <div className="text-center">
          <p className="text-2xl font-black text-amber-400">{scored.filter(s => s.sig >= 0.7).length}</p>
          <p className="text-[10px] text-muted-foreground uppercase">High Significance (≥0.7)</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-black text-foreground">{scored.length}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Txs Scanned (last tick)</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-black text-violet-400">{(whaleEngine.threshold * 100).toFixed(0)}%</p>
          <p className="text-[10px] text-muted-foreground uppercase">Significance Threshold</p>
        </div>
      </div>

      {/* Histogram */}
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
        Significance Distribution
      </p>
      <ResponsiveContainer width="100%" height={80}>
        <BarChart data={hist} margin={{ top: 0, right: 0, left: -20, bottom: 0 }} barGap={2}>
          <XAxis dataKey="range" tick={{ fontSize: 9, fill: '#6B7280' }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return <div className="rounded-lg px-2 py-1 text-xs" style={{ background: '#0a1929', border: '1px solid rgba(255,255,255,0.1)' }}>
              <p>{label}: <span className="font-bold text-amber-400">{payload[0]?.value} txs</span></p>
            </div>;
          }} />
          <Bar dataKey="count" radius={[3,3,0,0]} maxBarSize={40}>
            {hist.map((d, i) => <Cell key={i} fill={d.isAboveThreshold ? '#FFD700' : '#374151'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Recent high-significance txs */}
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-3 mb-2">
        Recent Scored Txs (descending)
      </p>
      <div className="space-y-1">
        {scored.slice(0, 5).map((s, i) => (
          <ScoreBar key={i} value={s.sig} max={1} label={`${fmtUsd(s.value)} · ${s.tier}`} color={s.sig >= 0.7 ? '#FFD700' : '#6b7280'} />
        ))}
      </div>
    </EngineSection>
  );
}

// ── §4.2 Smart Money Stats ────────────────────────────────────────────────────

function SmartMoneyStats() {
  const wallets = useMemo(() =>
    SMART_MONEY_WALLETS.slice(0, 5).map(w => ({
      ...w,
      metrics: calculateWalletMetrics(w.address, 30, w.trades30d),
    })), []);

  return (
    <EngineSection icon={<Brain className="h-4 w-4" />} title="§4.2 Smart Money Identifier" color="#a78bfa">
      <div className="grid sm:grid-cols-3 gap-4 mb-4">
        <div className="text-center">
          <p className="text-2xl font-black text-violet-400">
            {wallets.filter(w => w.metrics.smartScore >= 70).length}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase">Smart Wallets (score ≥70)</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-black text-foreground">
            {Math.round(wallets.reduce((s, w) => s + w.metrics.winRate, 0) / wallets.length)}%
          </p>
          <p className="text-[10px] text-muted-foreground uppercase">Avg Win Rate</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-black text-emerald-400">
            {(wallets.reduce((s, w) => s + w.metrics.sharpeRatio, 0) / wallets.length).toFixed(2)}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase">Avg Sharpe Ratio</p>
        </div>
      </div>

      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
        Smart Score Breakdown (Top 5)
      </p>
      <div className="space-y-1.5">
        {wallets.map((w, i) => (
          <ScoreBar key={i} value={w.metrics.smartScore} max={100}
            label={`${CHAIN_DISPLAY[w.chain].icon} ${w.address.slice(0, 10)}…`}
            color={w.metrics.smartScore >= 70 ? '#a78bfa' : '#6b7280'} />
        ))}
      </div>

      {/* Metric components for top wallet */}
      {wallets[0] && (
        <div className="mt-4 space-y-1">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
            Metric Components (#{1} Wallet)
          </p>
          <ScoreBar value={wallets[0].metrics.winRate}            max={100} label="Win Rate"          color="#34d399" />
          <ScoreBar value={wallets[0].metrics.totalProfitPercent} max={100} label="Profit %"          color="#60a5fa" />
          <ScoreBar value={wallets[0].metrics.sharpeRatio}        max={3}   label="Sharpe Ratio (×3)" color="#fbbf24" />
          <ScoreBar value={wallets[0].metrics.tradeConsistency}   max={1}   label="Consistency"       color="#f472b6" />
          <ScoreBar value={Math.max(0, 30 - wallets[0].metrics.maxDrawdown)} max={30} label="Low Drawdown" color="#fb923c" />
        </div>
      )}
    </EngineSection>
  );
}

// ── §4.3 Exchange Flow Stats ──────────────────────────────────────────────────

function ExchangeFlowStats() {
  const [report, setReport] = useState(flowAnalyzer.analyzeExchangeFlow('ethereum', 'BTC', 1));

  const signalColor = {
    bullish: '#34d399', bearish: '#ef4444', neutral: '#6b7280',
  }[report.overallSignal];

  return (
    <EngineSection icon={<BarChart2 className="h-4 w-4" />} title="§4.3 Exchange Flow Analyzer" color="#34d399">
      <div className="grid sm:grid-cols-3 gap-4 mb-4">
        <div className="text-center">
          <p className="text-2xl font-black" style={{ color: signalColor }}>
            {report.overallSignal.toUpperCase()}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase">Overall Market Signal</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-black text-emerald-400">{report.bullishCount}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Bullish Exchanges</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-black text-red-400">{report.bearishCount}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Bearish Exchanges</p>
        </div>
      </div>

      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
        Per-Exchange Signal
      </p>
      <div className="space-y-1.5">
        {report.entries.map(e => (
          <div key={e.exchange} className="flex items-center gap-2 text-xs">
            <span className="w-20 text-muted-foreground shrink-0">{e.exchange}</span>
            <div className="flex-1 flex items-center gap-1">
              <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full rounded-full"
                  style={{
                    width:      `${Math.min(100, Math.abs(e.netFlow) / e.inflow * 100)}%`,
                    background: e.signal === 'bullish' ? '#34d399' : e.signal === 'bearish' ? '#ef4444' : '#6b7280',
                  }} />
              </div>
            </div>
            <span className="font-mono font-bold w-16 text-right"
              style={{ color: e.signal === 'bullish' ? '#34d399' : e.signal === 'bearish' ? '#ef4444' : '#6b7280' }}>
              {e.signal === 'bullish' ? '+' : e.signal === 'bearish' ? '-' : ''}{fmtUsd(Math.abs(e.netFlow))}
            </span>
            <span className="text-[10px] font-bold w-14 text-right"
              style={{ color: e.signal === 'bullish' ? '#34d399' : e.signal === 'bearish' ? '#ef4444' : '#6b7280' }}>
              {e.signal === 'bullish' ? '🟢' : e.signal === 'bearish' ? '🔴' : '⚪'} {e.signal}
            </span>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground mt-2">
        Rule: signal = 'bullish' when bullishCount ({'>'} bearishCount + 2)
      </p>
    </EngineSection>
  );
}

// ── §4.4 Alert Trigger Stats ──────────────────────────────────────────────────

function AlertTriggerStats({ userId }: { userId: string }) {
  const getUserEvents = useOnChainStore(s => s.getUserEvents);
  const getUserAlerts = useOnChainStore(s => s.getUserAlerts);

  const events  = getUserEvents(userId, { chains: [], whaleTiers: [], alertIds: [], unreadOnly: false, minValue: 0, maxValue: Infinity, search: '', sortBy: 'newest' });
  const alerts  = getUserAlerts(userId);

  const byType  = {
    whale_transaction: alerts.filter(a => (a.alertType ?? 'whale_transaction') === 'whale_transaction').length,
    wallet_activity:   alerts.filter(a => a.alertType === 'wallet_activity').length,
    exchange_flow:     alerts.filter(a => a.alertType === 'exchange_flow').length,
  };

  const avgSig  = events.length > 0
    ? (events.reduce((s, e) => s + (e.significance ?? 0), 0) / events.length).toFixed(2)
    : '—';

  const highSig = events.filter(e => (e.significance ?? 0) >= 0.7).length;

  return (
    <EngineSection icon={<Bell className="h-4 w-4" />} title="§4.4 Alert Trigger System" color="#60a5fa">
      <div className="grid sm:grid-cols-3 gap-4 mb-4">
        <div className="text-center">
          <p className="text-2xl font-black text-blue-400">{events.length}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Total Events Generated</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-black text-amber-400">{highSig}</p>
          <p className="text-[10px] text-muted-foreground uppercase">High Significance Events</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-black text-foreground">{avgSig}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Avg Significance Score</p>
        </div>
      </div>

      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
        Alert Type Distribution
      </p>
      <div className="space-y-1.5">
        <ScoreBar value={byType.whale_transaction} max={Math.max(1, alerts.length)} label="🐋 Whale Transaction" color="#FFD700" />
        <ScoreBar value={byType.wallet_activity}   max={Math.max(1, alerts.length)} label="👁️ Wallet Activity"  color="#a78bfa" />
        <ScoreBar value={byType.exchange_flow}     max={Math.max(1, alerts.length)} label="🏦 Exchange Flow"    color="#34d399" />
      </div>

      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-3 mb-2">
        Recent Trigger Events
      </p>
      <div className="space-y-1.5">
        {events.slice(0, 5).map(e => (
          <div key={e.id} className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground/40 shrink-0">
              {CHAIN_DISPLAY[e.chain]?.icon ?? '⛓'}
            </span>
            <span className="flex-1 min-w-0 text-muted-foreground truncate">
              {e.significanceReason ?? e.tokenSymbol}
            </span>
            <span className="font-mono font-bold text-[11px] shrink-0"
              style={{ color: (e.significance ?? 0) >= 0.7 ? '#FFD700' : '#6b7280' }}>
              {((e.significance ?? 0) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
        {events.length === 0 && <p className="text-xs text-muted-foreground py-1">Waiting for first trigger…</p>}
      </div>
    </EngineSection>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function EngineStatsPanel() {
  const { user }  = useAuthStore();
  const userId    = user?.id ?? 'demo_user';
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);

  // Refresh every 15s when open
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setTick(n => n + 1), 15_000);
    return () => clearInterval(t);
  }, [open]);

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
      {/* Toggle header */}
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/2 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="font-bold text-sm">Business Logic Engines</span>
          <span className="text-xs text-muted-foreground">§4.1 – §4.4 live stats</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={e => { e.stopPropagation(); setTick(n => n + 1); }}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-4 pb-5 pt-1 grid sm:grid-cols-2 gap-4">
              <WhaleEngineStats />
              <SmartMoneyStats />
              <ExchangeFlowStats />
              <AlertTriggerStats userId={userId} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
