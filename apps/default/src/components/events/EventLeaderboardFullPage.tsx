/**
 * EventLeaderboardFullPage.tsx — Spec §3.3
 * Full event leaderboard: your position, top traders table, ROI chart
 */
import React, { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, RefreshCw, TrendingUp, TrendingDown, Search,
  Trophy, ChevronUp, ChevronDown,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { cn } from '../../lib/utils';
import { useEventsStore } from './eventStore';
import { useAuthStore } from '../../lib/authStore';
import { EventParticipant, EVENT_TYPE_META } from './eventTypes';
import { Avatar, StatusBadge, fmtPct, fmtNum, fmtUsd } from './eventUtils';

// ── ROI chart data generator ──────────────────────────────────────────────────

function buildChartData(eventId: string, participants: EventParticipant[]) {
  const top3 = participants.slice(0, 3);
  const labels = ['Sat 00:00','Sat 06:00','Sat 12:00','Sat 18:00','Sun 00:00','Sun 06:00','Sun 12:00','Sun 18:00','Mon 00:00'];

  return labels.map((time, i) => {
    const ratio = i / (labels.length - 1);
    const entry: Record<string, string | number> = { time };
    top3.forEach(p => {
      const noise = (Math.sin(i * p.userId.length + 1) * 0.3);
      entry[p.displayName] = parseFloat(Math.max(0, p.score * ratio + noise).toFixed(1));
    });
    return entry;
  });
}

const CHART_COLORS = ['#6366f1', '#f59e0b', '#22c55e'];

// ── Custom tooltip ─────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl p-3 shadow-xl"
      style={{ background: '#0d0d14', border: '1px solid rgba(255,255,255,0.1)' }}>
      <p className="text-[10px] text-muted-foreground mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground truncate max-w-[100px]">{p.name}</span>
          <span className="font-black ml-auto" style={{ color: p.color }}>+{p.value}%</span>
        </div>
      ))}
    </div>
  );
}

// ── Rank delta arrow ──────────────────────────────────────────────────────────

function RankDelta({ delta }: { delta: number }) {
  if (delta === 0) return <span className="text-[10px] text-muted-foreground">—</span>;
  return (
    <span className={cn('text-[10px] font-black flex items-center gap-0.5', delta > 0 ? 'text-emerald-400' : 'text-red-400')}>
      {delta > 0 ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      {Math.abs(delta)}
    </span>
  );
}

// ── Prize for rank ────────────────────────────────────────────────────────────

function prizeForRank(rank: number, event: ReturnType<typeof useEventsStore.getState>['events'][0]) {
  const match = event.rewards.find(r => r.rank === rank && r.type === 'virtual_cash');
  return match ? `${fmtUsd(match.value)} CP` : '0 CP';
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function EventLeaderboardFullPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getEvent, getLeaderboard, myEntries, refreshTick } = useEventsStore();
  const { user } = useAuthStore();
  const [search, setSearch]   = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const PER_PAGE = 20;

  const event = getEvent(id ?? '');
  if (!event) return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <button onClick={() => navigate('/events')} className="text-primary underline">← Back</button>
    </div>
  );

  const meta = EVENT_TYPE_META[event.type];
  const lb   = getLeaderboard(event.id);
  const myEntry = myEntries[event.id];

  // My position
  const myRank = myEntry?.currentRank ?? null;
  const myRoi  = myEntry?.pnlPct ?? null;

  // Filter & paginate
  const filtered  = useMemo(() => lb.filter(p =>
    !search || p.displayName.toLowerCase().includes(search.toLowerCase())),
    [lb, search]);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const totalPages= Math.ceil(filtered.length / PER_PAGE);

  const chartData = buildChartData(event.id, lb.slice(0, 3));
  const top3      = lb.slice(0, 3);

  async function handleRefresh() {
    setRefreshing(true);
    await new Promise(r => setTimeout(r, 600));
    refreshTick();
    setRefreshing(false);
  }

  function targetPrize() {
    if (!myRank) return '';
    const top20 = event.rewards.find(r => typeof r.rank === 'number' && r.rank <= 20);
    if (top20 && myRank > 20) return `Top 20 for ${fmtUsd(top20.value)} CP`;
    const top5  = event.rewards.find(r => typeof r.rank === 'number' && r.rank <= 5);
    if (top5  && myRank > 5)  return `Top 5 for ${fmtUsd(top5.value)} CP`;
    return '';
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/events/${event.id}`)}
            className="p-2 rounded-xl bg-white/4 hover:bg-white/8 transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">{event.icon}</span>
              <h1 className="text-lg font-black text-foreground">{event.title}</h1>
              <StatusBadge status={event.status} />
            </div>
            <p className="text-xs text-muted-foreground">Live Leaderboard</p>
          </div>
        </div>
        <button onClick={handleRefresh}
          className={cn('flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-white/4 border border-white/8 transition-colors hover:bg-white/8',
            refreshing && 'opacity-60 cursor-not-allowed')}>
          <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} /> Refresh
        </button>
      </div>

      {/* Your position banner */}
      {myRank != null && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex items-center gap-4 px-5 py-4 rounded-2xl flex-wrap"
          style={{ background: `${meta.color}10`, border: `1px solid ${meta.color}25` }}>
          <div className="flex items-center gap-3">
            <Avatar seed={user?.id ?? 'me'} size={36} />
            <div>
              <p className="text-xs text-muted-foreground">Your Position</p>
              <div className="flex items-center gap-2">
                <span className="font-black text-xl" style={{ color: meta.color }}>#{myRank}</span>
                <span className={cn('font-black text-sm', myRoi != null && myRoi >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {myRoi != null ? fmtPct(myRoi) : '—'}
                </span>
              </div>
            </div>
          </div>
          {targetPrize() && (
            <div className="ml-auto text-xs text-muted-foreground">
              🎯 Target: <span className="font-bold text-foreground">{targetPrize()}</span>
            </div>
          )}
        </motion.div>
      )}

      {/* Podium */}
      {top3.length >= 3 && (
        <div className="rounded-2xl p-6"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-xs font-black text-muted-foreground uppercase tracking-wider mb-5 text-center">Top Traders</p>
          <div className="flex items-end justify-center gap-4">
            {/* 2nd */}
            <div className="flex flex-col items-center gap-2">
              <Avatar seed={top3[1].avatarSeed} size={44} />
              <p className="text-xs font-bold text-muted-foreground max-w-[80px] truncate text-center">{top3[1].displayName}</p>
              <div className="w-20 h-16 rounded-t-xl flex flex-col items-center justify-center bg-white/5 border border-white/10">
                <span className="text-xl">🥈</span>
                <p className={cn('text-xs font-black', top3[1].pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400')}>{fmtPct(top3[1].pnlPct)}</p>
              </div>
            </div>
            {/* 1st */}
            <div className="flex flex-col items-center gap-2 -translate-y-4">
              <Avatar seed={top3[0].avatarSeed} size={56} />
              <p className="text-sm font-bold text-foreground max-w-[90px] truncate text-center">{top3[0].displayName} 👑</p>
              <div className="w-24 h-24 rounded-t-xl flex flex-col items-center justify-center border border-white/15"
                style={{ background: `${meta.color}20` }}>
                <span className="text-3xl">🥇</span>
                <p className="text-sm font-black" style={{ color: meta.color }}>{fmtPct(top3[0].pnlPct)}</p>
              </div>
            </div>
            {/* 3rd */}
            <div className="flex flex-col items-center gap-2">
              <Avatar seed={top3[2].avatarSeed} size={44} />
              <p className="text-xs font-bold text-muted-foreground max-w-[80px] truncate text-center">{top3[2].displayName}</p>
              <div className="w-20 h-12 rounded-t-xl flex flex-col items-center justify-center bg-amber-900/30 border border-white/8">
                <span className="text-xl">🥉</span>
                <p className={cn('text-xs font-black', top3[2].pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400')}>{fmtPct(top3[2].pnlPct)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ROI chart */}
      <div className="rounded-2xl p-5"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-xs font-black text-foreground mb-4">Historical ROI — Top 3 Traders</p>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              {top3.map((p, i) => (
                <linearGradient key={p.userId} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLORS[i]} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={CHART_COLORS[i]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false}
              tickFormatter={v => `${v}%`} />
            <Tooltip content={<CustomTooltip />} />
            <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
            {top3.map((p, i) => (
              <Area key={p.userId} type="monotone" dataKey={p.displayName}
                stroke={CHART_COLORS[i]} strokeWidth={2}
                fill={`url(#grad-${i})`} dot={false} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search trader…"
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/3 border border-white/8 text-xs focus:outline-none focus:border-primary/30" />
          </div>
          <span className="text-xs text-muted-foreground shrink-0">{fmtNum(filtered.length)} traders</span>
        </div>

        <div className="rounded-2xl overflow-hidden border border-white/6">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[540px]">
              <thead style={{ background: 'rgba(0,0,0,0.25)' }}>
                <tr className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  <th className="px-4 py-3 text-left w-12">Rank</th>
                  <th className="px-4 py-3 text-left">Trader</th>
                  <th className="px-4 py-3 text-right">ROI</th>
                  <th className="px-4 py-3 text-right">Trades</th>
                  <th className="px-4 py-3 text-right">Win Rate</th>
                  <th className="px-4 py-3 text-right">Prize</th>
                  <th className="px-4 py-3 text-right w-10">Δ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/3">
                {paginated.map(p => {
                  const isMe   = p.userId === user?.id;
                  const isTop3 = p.rank <= 3;
                  return (
                    <tr key={p.userId} className={cn(
                      'transition-colors',
                      isMe   ? 'bg-primary/8 hover:bg-primary/12'
                             : isTop3 ? 'bg-white/3 hover:bg-white/5'
                             : 'hover:bg-white/2',
                    )}>
                      <td className="px-4 py-3">
                        {p.badge
                          ? <span className="text-lg">{p.badge}</span>
                          : <span className="font-bold text-muted-foreground">#{p.rank}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar seed={p.avatarSeed} size={26} />
                          <span className={cn('font-bold', isMe ? 'text-primary' : 'text-foreground')}>{p.displayName}</span>
                          {isMe && <span className="text-[9px] px-1.5 rounded-full bg-primary/20 text-primary font-black">YOU</span>}
                          {p.country && <span>{p.country}</span>}
                        </div>
                      </td>
                      <td className={cn('px-4 py-3 text-right font-black tabular-nums', p.pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {fmtPct(p.pnlPct)}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">{p.trades}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span className={cn('font-bold', p.winRate >= 0.6 ? 'text-emerald-400' : p.winRate >= 0.45 ? 'text-amber-400' : 'text-red-400')}>
                          {Math.round(p.winRate * 100)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-amber-400 font-bold tabular-nums">
                        {prizeForRank(p.rank, event)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <RankDelta delta={p.delta} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1.5 pt-1">
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              const p = i + 1;
              return (
                <button key={p} onClick={() => setPage(p)}
                  className={cn('w-7 h-7 rounded-lg text-xs font-bold transition-all',
                    page === p ? 'bg-primary text-white' : 'bg-white/4 text-muted-foreground hover:bg-white/8')}>
                  {p}
                </button>
              );
            })}
            {totalPages > 7 && <span className="text-muted-foreground text-xs">…{totalPages}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
