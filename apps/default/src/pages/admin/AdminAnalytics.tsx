import React, { useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, CalendarDays, CheckCircle2, Clock3, RefreshCw, Users, Zap } from 'lucide-react';
import { getProductAnalyticsRows, type AnalyticsRow } from '@/lib/productAnalytics';

function dayKey(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function uniqueUsers(rows: AnalyticsRow[]): Set<string> {
  return new Set(rows.map(row => row.userId || row.email).filter(Boolean));
}

function percent(value: number): string {
  return `${Math.round(value)}%`;
}

export function AdminAnalytics() {
  const [rows, setRows] = useState<AnalyticsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await getProductAnalyticsRows());
    } catch {
      setError('Analytics could not be loaded. Refresh to try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const metrics = useMemo(() => {
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const activeDay = rows.filter(row => new Date(row.occurredAt).getTime() >= dayAgo);
    const activeWeek = rows.filter(row => new Date(row.occurredAt).getTime() >= weekAgo);
    const signups = uniqueUsers(rows.filter(row => row.type === 'signup_completed'));
    const firstLogins = uniqueUsers(rows.filter(row => row.type === 'first_login'));
    const firstLessons = uniqueUsers(rows.filter(row => row.type === 'lesson_completed'));
    const firstTrades = uniqueUsers(rows.filter(row => row.type === 'first_trade'));
    const features = new Map<string, number>();
    rows.filter(row => row.type === 'feature_used' && row.feature).forEach(row => {
      features.set(row.feature, (features.get(row.feature) ?? 0) + 1);
    });
    const featureList = [...features.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const retentionUsers = new Set([...firstLogins].filter(user =>
      activeWeek.some(row => (row.userId || row.email) === user && row.type !== 'first_login'),
    ));
    return {
      dau: uniqueUsers(activeDay).size,
      wau: uniqueUsers(activeWeek).size,
      totalEvents: rows.length,
      signups: signups.size,
      activation: firstLogins.size,
      lessonRate: firstLogins.size ? (firstLessons.size / firstLogins.size) * 100 : 0,
      tradeRate: firstLogins.size ? (firstTrades.size / firstLogins.size) * 100 : 0,
      retention: firstLogins.size ? (retentionUsers.size / firstLogins.size) * 100 : 0,
      featureList,
    };
  }, [rows]);

  const dayCounts = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach(row => {
      const key = dayKey(row.occurredAt);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7).reverse();
  }, [rows]);

  const cards = [
    { label: 'Daily active users', value: metrics.dau, detail: 'Last 24 hours', icon: Activity, tone: 'text-cyan-300' },
    { label: 'Weekly active users', value: metrics.wau, detail: 'Last 7 days', icon: Users, tone: 'text-violet-300' },
    { label: 'New signups', value: metrics.signups, detail: 'Verified registrations', icon: CheckCircle2, tone: 'text-emerald-300' },
    { label: '7-day retention', value: percent(metrics.retention), detail: 'Returned after first login', icon: CalendarDays, tone: 'text-amber-300' },
  ];

  return (
    <main className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 text-white">
      <header className="flex flex-col sm:flex-row sm:items-end gap-4 justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/70">Product intelligence</p>
          <h1 className="text-2xl font-black mt-1">Analytics overview</h1>
          <p className="text-sm text-white/45 mt-1">See where users activate, return, and spend time.</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="min-h-11 inline-flex items-center justify-center gap-2 px-4 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-white/70 hover:text-white transition-colors disabled:opacity-50">
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Refresh data
        </button>
      </header>

      {error && <div className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div>}
      {loading && !rows.length ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">{[1, 2, 3, 4].map(item => <div key={item} className="h-28 rounded-2xl bg-white/[0.05] animate-pulse" />)}</div>
      ) : (
        <>
          <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3" aria-label="Key metrics">
            {cards.map(card => (
              <div key={card.label} className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4">
                <card.icon className={`h-5 w-5 ${card.tone}`} />
                <p className="text-3xl font-black tabular-nums mt-4">{card.value}</p>
                <p className="text-sm text-white/70 mt-1">{card.label}</p>
                <p className="text-xs text-white/35 mt-1">{card.detail}</p>
              </div>
            ))}
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
              <div className="flex items-center justify-between mb-5"><div><h2 className="font-bold">Activation funnel</h2><p className="text-xs text-white/35 mt-1">First-time milestones from observed events</p></div><Zap className="h-5 w-5 text-amber-300" /></div>
              <div className="space-y-3">
                {[['Verified signups', metrics.signups, 100], ['First login', metrics.activation, metrics.signups ? (metrics.activation / metrics.signups) * 100 : 0], ['First lesson', null, metrics.lessonRate], ['First trade', null, metrics.tradeRate]].map(([label, value, rate]) => (
                  <div key={String(label)}><div className="flex justify-between text-sm mb-1"><span className="text-white/65">{label}</span><span className="text-white font-semibold tabular-nums">{value == null ? percent(Number(rate)) : value}</span></div><div className="h-2 rounded-full bg-white/[0.07] overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400" style={{ width: `${Math.min(100, Number(rate))}%` }} /></div></div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
              <div className="flex items-center justify-between mb-5"><div><h2 className="font-bold">Feature reach</h2><p className="text-xs text-white/35 mt-1">Most-used surfaces by event count</p></div><BarChart3 className="h-5 w-5 text-cyan-300" /></div>
              {metrics.featureList.length ? <div className="space-y-3">{metrics.featureList.map(([feature, count], index) => <div key={feature}><div className="flex justify-between text-sm mb-1"><span className="text-white/65 truncate pr-4">{feature}</span><span className="text-white/80 tabular-nums">{count}</span></div><div className="h-2 rounded-full bg-white/[0.07] overflow-hidden"><div className="h-full rounded-full bg-cyan-300/80" style={{ width: `${Math.max(8, (count / metrics.featureList[0][1]) * 100)}%`, opacity: 1 - index * 0.1 }} /></div></div>)}</div> : <p className="text-sm text-white/35 py-8">Feature events will appear as users explore the app.</p>}
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
            <div className="flex items-center justify-between mb-4"><div><h2 className="font-bold">Engagement pulse</h2><p className="text-xs text-white/35 mt-1">Events recorded per day</p></div><Clock3 className="h-5 w-5 text-violet-300" /></div>
            {dayCounts.length ? <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 items-end">{dayCounts.map(([day, count]) => { const max = Math.max(...dayCounts.map(item => item[1])); return <div key={day} className="space-y-2"><div className="h-28 rounded-lg bg-white/[0.04] flex items-end overflow-hidden"><div className="w-full bg-gradient-to-t from-violet-400/80 to-cyan-300/80" style={{ height: `${Math.max(8, (count / max) * 100)}%` }} /></div><p className="text-[11px] text-white/40 text-center">{day.slice(5)}</p><p className="text-xs text-white/70 text-center tabular-nums">{count}</p></div>; })}</div> : <p className="text-sm text-white/35 py-8">Your first events will create the engagement trend.</p>}
          </section>

          <p className="text-xs text-white/30">{metrics.totalEvents} total events in the analytics stream. Metrics update from the project when you refresh.</p>
        </>
      )}
    </main>
  );
}

export default AdminAnalytics;
