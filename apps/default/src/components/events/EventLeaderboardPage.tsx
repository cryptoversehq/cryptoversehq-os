/**
 * EventLeaderboardPage.tsx — Full leaderboard for any event with filters
 */
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Search, Download, Trophy } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useEventsStore } from './eventStore';
import { useAuthStore } from '../../lib/authStore';
import { LiveEvent, EVENT_TYPE_META, EventParticipant } from './eventTypes';
import { Avatar, StatusBadge, EmptyState, fmtPct, fmtNum, fmtUsd } from './eventUtils';

interface Props {
  event: LiveEvent;
}

type SortKey = 'rank' | 'score' | 'pnl' | 'trades' | 'winRate';

export function EventLeaderboardPage({ event }: Props) {
  const { getLeaderboard, myEntries } = useEventsStore();
  const { user }   = useAuthStore();
  const [search,   setSearch]   = useState('');
  const [sortKey,  setSortKey]  = useState<SortKey>('rank');
  const [page,     setPage]     = useState(1);
  const PER_PAGE = 20;

  const meta     = EVENT_TYPE_META[event.type];
  const raw      = getLeaderboard(event.id);
  const myEntry  = myEntries[event.id];

  // find my position
  const myRow = user ? raw.find(p => p.userId === `user-${event.id}-my`) ?? (myEntry ? {
    userId: user.id, displayName: user.displayName, avatarSeed: user.id, rank: myEntry.currentRank,
    score: myEntry.score, pnl: myEntry.pnl, pnlPct: myEntry.pnlPct, trades: myEntry.trades,
    winRate: myEntry.winRate, status: myEntry.status, joinedAt: myEntry.joinedAt, delta: 0,
  } : null) : null;

  const filtered = useMemo(() => {
    let list = raw.filter(p => !search || p.displayName.toLowerCase().includes(search.toLowerCase()));
    switch (sortKey) {
      case 'score':   list = [...list].sort((a,b) => b.score - a.score); break;
      case 'pnl':     list = [...list].sort((a,b) => b.pnl - a.pnl); break;
      case 'trades':  list = [...list].sort((a,b) => b.trades - a.trades); break;
      case 'winRate': list = [...list].sort((a,b) => b.winRate - a.winRate); break;
      default:        list = [...list].sort((a,b) => a.rank - b.rank);
    }
    return list;
  }, [raw, search, sortKey]);

  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);

  // Top 3 podium
  const top3 = raw.slice(0, 3);

  function Row({ p, highlight }: { p: EventParticipant; highlight?: boolean }) {
    const isTop3 = p.rank <= 3;
    return (
      <tr className={cn(
        'border-b border-white/4 transition-colors',
        highlight ? 'bg-primary/8' : isTop3 ? 'bg-white/3' : 'hover:bg-white/2',
      )}>
        <td className="px-4 py-3 w-12">
          {p.badge
            ? <span className="text-lg">{p.badge}</span>
            : <span className="text-xs font-bold text-muted-foreground">#{p.rank}</span>}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Avatar seed={p.avatarSeed} size={28} />
            <span className={cn('text-sm font-bold', highlight ? 'text-primary' : 'text-foreground')}>{p.displayName}</span>
            {highlight && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-bold">YOU</span>}
            {p.country && <span className="text-base">{p.country}</span>}
          </div>
        </td>
        <td className={cn('px-4 py-3 text-right font-black text-sm tabular-nums', p.pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400')}>
          {fmtPct(p.pnlPct)}
        </td>
        <td className="px-4 py-3 text-right text-xs text-muted-foreground tabular-nums">{fmtNum(p.trades)}</td>
        <td className="px-4 py-3 text-right text-xs tabular-nums">
          <span className={cn('font-bold', p.winRate >= 0.6 ? 'text-emerald-400' : p.winRate >= 0.45 ? 'text-amber-400' : 'text-red-400')}>
            {Math.round(p.winRate * 100)}%
          </span>
        </td>
        <td className="px-4 py-3 text-right text-[11px]">
          {p.delta !== 0 && (
            <span className={cn('font-bold', p.delta > 0 ? 'text-emerald-400' : 'text-red-400')}>
              {p.delta > 0 ? '↑' : '↓'}{Math.abs(p.delta)}
            </span>
          )}
        </td>
      </tr>
    );
  }

  return (
    <div className="space-y-6">
      {/* Event header */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-3xl">{event.icon}</span>
        <div>
          <h2 className="text-lg font-black text-foreground">{event.title}</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <StatusBadge status={event.status} />
            <span className="text-[10px] text-muted-foreground">{fmtNum(event.currentParticipants)} competitors</span>
          </div>
        </div>
      </div>

      {/* Podium */}
      {top3.length >= 3 && (
        <div className="flex items-end justify-center gap-3 py-4">
          {/* 2nd */}
          <div className="flex flex-col items-center gap-2">
            <Avatar seed={top3[1].avatarSeed} size={44} />
            <p className="text-xs font-bold text-muted-foreground truncate max-w-[80px] text-center">{top3[1].displayName}</p>
            <div className="w-20 h-16 rounded-t-xl flex flex-col items-center justify-center bg-slate-700/60 border border-white/10">
              <span className="text-xl">🥈</span>
              <p className="text-xs font-black text-foreground">{fmtPct(top3[1].pnlPct)}</p>
            </div>
          </div>
          {/* 1st */}
          <div className="flex flex-col items-center gap-2 -translate-y-2">
            <Avatar seed={top3[0].avatarSeed} size={56} />
            <p className="text-xs font-bold text-foreground truncate max-w-[90px] text-center">{top3[0].displayName}</p>
            <div className="w-24 h-24 rounded-t-xl flex flex-col items-center justify-center border border-white/15"
              style={{ background: `${meta.color}20` }}>
              <span className="text-3xl">🥇</span>
              <p className="text-sm font-black" style={{ color: meta.color }}>{fmtPct(top3[0].pnlPct)}</p>
            </div>
          </div>
          {/* 3rd */}
          <div className="flex flex-col items-center gap-2">
            <Avatar seed={top3[2].avatarSeed} size={44} />
            <p className="text-xs font-bold text-muted-foreground truncate max-w-[80px] text-center">{top3[2].displayName}</p>
            <div className="w-20 h-12 rounded-t-xl flex flex-col items-center justify-center bg-amber-900/40 border border-white/8">
              <span className="text-xl">🥉</span>
              <p className="text-xs font-black text-foreground">{fmtPct(top3[2].pnlPct)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Search + sort */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search trader…"
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/3 border border-white/8 text-sm focus:outline-none focus:border-primary/30" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {([['rank','Rank'],['score','Return'],['trades','Trades'],['winRate','Win%']] as [SortKey, string][]).map(([k,l]) => (
            <button key={k} onClick={() => setSortKey(k)}
              className={cn('px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all',
                sortKey === k ? 'bg-primary/15 text-primary border border-primary/30' : 'bg-white/3 text-muted-foreground border border-white/5 hover:text-foreground')}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* My position pinned */}
      {myEntry && myRow && (
        <div className="rounded-xl p-3 flex items-center gap-3"
          style={{ background: `${meta.color}10`, border: `1px solid ${meta.color}25` }}>
          <span className="text-[10px] font-black" style={{ color: meta.color }}>YOUR POSITION</span>
          <Avatar seed={user?.id ?? 'me'} size={28} />
          <span className="font-bold text-sm text-foreground">{user?.displayName}</span>
          <span className="font-black text-sm ml-auto" style={{ color: meta.color }}>#{myEntry.currentRank}</span>
          <span className={cn('font-black text-sm', myEntry.pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400')}>{fmtPct(myEntry.pnlPct)}</span>
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl overflow-hidden border border-white/6">
        <table className="w-full text-sm min-w-[500px]">
          <thead style={{ background: 'rgba(0,0,0,0.2)' }}>
            <tr className="text-[10px] text-muted-foreground uppercase tracking-wider">
              <th className="px-4 py-3 text-left w-12">#</th>
              <th className="px-4 py-3 text-left">Trader</th>
              <th className="px-4 py-3 text-right">Return</th>
              <th className="px-4 py-3 text-right">Trades</th>
              <th className="px-4 py-3 text-right">Win %</th>
              <th className="px-4 py-3 text-right">Δ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/3">
            {paginated.map(p => (
              <Row key={p.userId} p={p} highlight={p.userId === user?.id} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: totalPages }, (_, i) => (
            <button key={i} onClick={() => setPage(i + 1)}
              className={cn('w-8 h-8 rounded-lg text-xs font-bold transition-all',
                page === i + 1 ? 'bg-primary text-white' : 'bg-white/4 text-muted-foreground hover:bg-white/8')}>
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
