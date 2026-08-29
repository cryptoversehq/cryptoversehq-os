/**
 * FlashChallengePage.tsx — Spec §3.6
 * Live countdown bar, performance stats, quick trade panel, mini leaderboard
 */
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, X, TrendingUp, TrendingDown, Zap, Trophy } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useEventsStore } from './eventStore';
import { useAuthStore } from '../../lib/authStore';
import { EVENT_TYPE_META } from './eventTypes';
import { Avatar, StatusBadge, fmtPct, fmtNum } from './eventUtils';
import { toast } from 'sonner';

// ── Quick trade panel ─────────────────────────────────────────────────────────

const SYMBOLS = ['BTC/USDT','ETH/USDT','SOL/USDT','BNB/USDT','ARB/USDT'];
const LEVERAGES = ['1x','2x','3x','5x','10x'];

function QuickTradePanel({ onTrade }: { onTrade: (side: 'buy' | 'sell') => void }) {
  const [symbol,   setSymbol]   = useState(SYMBOLS[0]);
  const [amount,   setAmount]   = useState('1000');
  const [leverage, setLeverage] = useState('5x');
  const [pct,      setPct]      = useState<25 | 50 | 100 | null>(null);

  function setQuick(p: 25 | 50 | 100) {
    setPct(p);
    const base = 10000;
    setAmount(String(Math.floor(base * p / 100)));
  }

  return (
    <div className="rounded-3xl p-5 space-y-4"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <p className="text-xs font-black text-muted-foreground uppercase tracking-wider">Quick Trade</p>

      {/* Symbol + Amount + Leverage */}
      <div className="flex gap-2 flex-wrap">
        <select value={symbol} onChange={e => setSymbol(e.target.value)}
          className="flex-1 min-w-[120px] px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-foreground focus:outline-none focus:border-primary/30">
          {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <div className="relative flex-1 min-w-[100px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
          <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
            className="w-full pl-7 pr-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/30" />
        </div>

        <select value={leverage} onChange={e => setLeverage(e.target.value)}
          className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-foreground focus:outline-none focus:border-primary/30">
          {LEVERAGES.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      {/* Quick % buttons */}
      <div className="flex gap-2">
        {([25, 50, 100] as const).map(p => (
          <button key={p} onClick={() => setQuick(p)}
            className={cn(
              'flex-1 py-2 rounded-xl text-sm font-bold transition-all',
              pct === p ? 'bg-primary text-white' : 'bg-white/5 text-muted-foreground hover:bg-white/10 border border-white/8',
            )}>
            {p}%
          </button>
        ))}
      </div>

      {/* Buy / Sell */}
      <div className="flex gap-3">
        <button onClick={() => onTrade('buy')}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm text-white transition-all hover:brightness-110 bg-emerald-500">
          <TrendingUp className="h-5 w-5" /> BUY / LONG 🟢
        </button>
        <button onClick={() => onTrade('sell')}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm text-white transition-all hover:brightness-110 bg-red-500">
          <TrendingDown className="h-5 w-5" /> SELL / SHORT 🔴
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function FlashChallengePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getEvent, getLeaderboard, myEntries, refreshTick, isJoined, joinEvent } = useEventsStore();
  const { user } = useAuthStore();

  const event  = getEvent(id ?? '');
  const joined = isJoined(id ?? '');
  const [tradeCount, setTradeCount] = useState(0);
  const [myRoi,      setMyRoi]      = useState(8.5);

  // Countdown
  const [secs, setSecs] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [totalSecs, setTotalSecs] = useState(0);

  useEffect(() => {
    if (!event) return;
    const total = Math.max(1, Math.floor((new Date(event.endAt).getTime() - new Date(event.startAt).getTime()) / 1000));
    setTotalSecs(total);
    const calc = () => {
      const remaining = Math.max(0, Math.floor((new Date(event.endAt).getTime() - Date.now()) / 1000));
      const elap = total - remaining;
      setSecs(remaining);
      setElapsed(elap);
    };
    calc();
    const timer = setInterval(calc, 1000);
    return () => clearInterval(timer);
  }, [event]);

  if (!event) return <div className="flex items-center justify-center h-full"><button onClick={() => navigate('/events')} className="text-primary underline">← Back</button></div>;

  const meta   = EVENT_TYPE_META[event.type];
  const lb     = getLeaderboard(event.id).slice(0, 10);
  const entry  = myEntries[event.id];
  const myRank = entry?.currentRank ?? 23;

  const progressPct  = totalSecs > 0 ? Math.min(100, (elapsed / totalSecs) * 100) : 0;

  const fmt = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sc = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}`;
    return `${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}`;
  };

  function handleTrade(side: 'buy' | 'sell') {
    if (!joined) {
      toast.info('Join the event first!');
      return;
    }
    const roi = side === 'buy'
      ? parseFloat((myRoi + (Math.random() * 2 - 0.5)).toFixed(2))
      : parseFloat((myRoi - Math.random() * 1.5).toFixed(2));
    setMyRoi(roi);
    setTradeCount(t => t + 1);
    toast.success(`${side === 'buy' ? '🟢 Long' : '🔴 Short'} position opened!`);
    refreshTick();
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/events/${event.id}`)}
            className="p-2 rounded-xl bg-white/4 hover:bg-white/8 transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5" style={{ color: meta.color }} />
            <span className="font-black text-foreground">{event.title}</span>
            <StatusBadge status={event.status} />
          </div>
        </div>
        <button onClick={() => navigate('/events')}
          className="p-2 rounded-xl bg-white/4 hover:bg-white/8 transition-colors text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Countdown bar */}
      <div className="rounded-2xl p-5"
        style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${meta.color}25` }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-black text-foreground">
            Challenge Active: <span style={{ color: meta.color }}>{fmt(secs)} remaining</span>
          </p>
          <p className="text-[10px] text-muted-foreground">{fmt(elapsed)} elapsed</p>
        </div>
        <div className="h-3 rounded-full bg-white/5 overflow-hidden">
          <motion.div className="h-full rounded-full transition-all"
            style={{ width: `${progressPct}%`, background: `linear-gradient(90deg, ${meta.color}, ${meta.color}aa)` }} />
        </div>
        <div className="flex justify-between mt-1.5 text-[9px] text-muted-foreground">
          <span>{Math.round(progressPct)}% elapsed</span>
          <span>{Math.round(100 - progressPct)}% remaining</span>
        </div>
      </div>

      {/* Your performance */}
      <div className="grid sm:grid-cols-3 gap-3">
        {[
          { label: 'Current ROI', value: fmtPct(myRoi), color: myRoi >= 0 ? '#22c55e' : '#ef4444' },
          { label: 'Trades',      value: String(tradeCount + (entry?.trades ?? 12)), color: '#f59e0b' },
          { label: 'Your Rank',   value: `#${myRank}/156`, color: meta.color },
        ].map(s => (
          <div key={s.label} className="rounded-2xl p-4 text-center"
            style={{ background: `${s.color}08`, border: `1px solid ${s.color}15` }}>
            <p className="text-xl font-black" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Target banner */}
      {myRank > 10 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl"
          style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
          <Trophy className="h-5 w-5 text-primary shrink-0" />
          <p className="text-sm text-muted-foreground">
            Target: <span className="text-foreground font-bold">Top 10</span> for <span className="text-primary font-black">1,000 CP</span> prize
          </p>
        </div>
      )}

      {/* Quick trade */}
      {event.status === 'live' && <QuickTradePanel onTrade={handleTrade} />}

      {/* Join if not joined */}
      {!joined && event.status === 'live' && (
        <button onClick={() => user && joinEvent(event.id, user.id, user.displayName)}
          className="w-full py-3.5 rounded-2xl font-black text-sm text-white"
          style={{ background: meta.color }}>
          ⚡ Join Challenge Now
        </button>
      )}

      {/* Mini leaderboard */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <p className="text-xs font-black text-foreground">Live Leaderboard — Top 10</p>
          <button onClick={() => navigate(`/events/${event.id}/leaderboard`)}
            className="text-[10px] text-primary hover:underline font-bold">Full board →</button>
        </div>
        <div className="grid sm:grid-cols-2 gap-0">
          {lb.map((p, i) => {
            const isMe = (i + 1) === myRank;
            return (
              <div key={p.userId} className={cn(
                'flex items-center gap-3 px-4 py-2.5 border-b border-white/3 last:border-0',
                isMe && 'bg-primary/8',
              )}>
                <span className="text-[11px] font-black text-muted-foreground w-6 shrink-0">
                  {p.badge ?? `#${i + 1}`}
                </span>
                <Avatar seed={p.avatarSeed} size={22} />
                <span className={cn('text-xs font-bold flex-1 truncate', isMe ? 'text-primary' : 'text-foreground')}>
                  {isMe ? 'You' : p.displayName}
                </span>
                <span className={cn('text-xs font-black tabular-nums shrink-0', p.pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {fmtPct(isMe ? myRoi : p.pnlPct)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
