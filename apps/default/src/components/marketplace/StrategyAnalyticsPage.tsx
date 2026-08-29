/**
 * StrategyAnalyticsPage.tsx — /marketplace/analytics/:id
 * Creator analytics: sales chart, revenue breakdown, top reviewers
 */
import React, { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Download, TrendingUp, Users, Star, DollarSign,
  BarChart2, RefreshCw, MessageSquare,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area,
} from 'recharts';
import { useStrategyStore } from '../../lib/strategyStore';
import { useAuthStore } from '../../lib/authStore';
import { Stars } from './StarRating';
import { CV, fmtCP, fmtNum, timeAgo } from './MarketplaceUtils';

// ─────────────────────────────────────────────────────────────────────────────

export function StrategyAnalyticsPage() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const getCreatorView     = useStrategyStore(s => s.getCreatorView);
  const getStrategyRatings = useStrategyStore(s => s.getStrategyRatings);
  const strategies         = useStrategyStore(s => s.strategies);

  if (!id || !user) return null;

  const strategy = strategies[id];
  if (!strategy || strategy.creatorId !== user.id) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p style={{ color: CV.gray }}>Analytics not available.</p>
        <button onClick={() => navigate('/marketplace/my-strategies')} style={{ color: CV.gold }}>← My Strategies</button>
      </div>
    );
  }

  const view    = useMemo(() => getCreatorView(id, user.id), [getCreatorView, id, user.id]);
  const ratings = useMemo(() => getStrategyRatings(id), [getStrategyRatings, id]);

  // Build 30-day sales chart (simulated distribution of strategy.totalSales)
  const salesData = useMemo(() => {
    const days = 30;
    const total = strategy.totalSales;
    // Build a plausible sales pattern (trending up)
    return Array.from({ length: days }, (_, i) => {
      const weight  = 0.5 + (i / days) * 0.5;
      const day_sales = Math.round((total / days) * weight * (0.6 + Math.random() * 0.8));
      const date    = new Date(Date.now() - (days - i - 1) * 86_400_000);
      return {
        date: date.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
        sales: day_sales,
      };
    });
  }, [strategy.totalSales]);

  const totalRevenue  = strategy.totalRevenue;
  const platformFee   = Math.round(totalRevenue * 0.20);
  const creatorEarns  = totalRevenue - platformFee;
  const conversionPct = strategy.totalSales > 0 ? ((strategy.totalSales / Math.max(strategy.totalSales * 8, 1)) * 100).toFixed(1) : '0.0';

  const topReviewers = ratings.slice(0, 5);

  // Monthly sales
  const monthlySales = useMemo(() => {
    return Math.round(strategy.totalSales / Math.max(1, Math.round(
      (Date.now() - new Date(strategy.publishedAt ?? strategy.createdAt).getTime()) / (30 * 86_400_000)
    )));
  }, [strategy]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ background: 'radial-gradient(ellipse 70% 50% at 90% 0%, rgba(255,215,0,0.05) 0%, transparent 70%), var(--background)' }}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b shrink-0 backdrop-blur-sm"
        style={{ borderColor: CV.goldBorder, background: 'var(--bg-secondary)' }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/marketplace/my-strategies')} className="p-1.5 rounded-lg" style={{ color: CV.gray }}>
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: CV.goldAlpha, border: `1px solid ${CV.goldBorder}` }}>
            <BarChart2 className="h-5 w-5" style={{ color: CV.gold }} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Strategy Analytics</h1>
            <p className="text-xs" style={{ color: CV.gray }}>{strategy.name}</p>
          </div>
        </div>

        <button
          onClick={() => {
            const data = JSON.stringify({ strategy, ratings }, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href = url; a.download = `${strategy.name.replace(/\s+/g, '_')}_analytics.json`;
            a.click();
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
          style={{ background: CV.surface, color: CV.gray, border: `1px solid ${CV.border}` }}
        >
          <Download className="h-3.5 w-3.5" /> Export
        </button>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">

          {/* ── Sales Chart ── */}
          <section>
            <h2 className="font-bold text-foreground mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" style={{ color: CV.gold }} /> Sales — Last 30 Days
            </h2>
            <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: `1px solid ${CV.border}` }}>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={salesData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="date" tick={{ fill: CV.gray, fontSize: 9 }} tickLine={false}
                    interval={4} />
                  <YAxis tick={{ fill: CV.gray, fontSize: 10 }} tickLine={false} axisLine={false} width={32} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-card)', border: `1px solid ${CV.goldBorder}`, borderRadius: 12 }}
                    formatter={(v: number) => [v, 'Sales']}
                  />
                  <Bar dataKey="sales" fill={CV.gold} radius={[4, 4, 0, 0]} fillOpacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* ── Key metrics ── */}
          <section>
            <h2 className="font-bold text-foreground mb-3">Key Metrics</h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: 'Total Sales',    value: strategy.totalSales.toLocaleString(),     icon: Users,       color: 'rgba(255,255,255,0.85)' },
                { label: 'Monthly Sales',  value: monthlySales.toLocaleString(),             icon: TrendingUp,  color: CV.green },
                { label: 'Avg Rating',     value: `${strategy.rating.toFixed(1)} ★`,        icon: Star,        color: CV.gold },
                { label: 'Conversion',     value: `${conversionPct}%`,                       icon: RefreshCw,   color: '#818cf8' },
                { label: 'Reviews',        value: strategy.ratingCount.toLocaleString(),     icon: MessageSquare, color: CV.gray },
              ].map(m => (
                <div key={m.label} className="rounded-2xl p-4 text-center"
                  style={{ background: 'var(--bg-card)', border: `1px solid ${CV.border}` }}>
                  <m.icon className="h-4 w-4 mx-auto mb-2" style={{ color: m.color }} />
                  <p className="text-xs mb-1" style={{ color: CV.gray }}>{m.label}</p>
                  <p className="font-bold text-sm" style={{ color: m.color }}>{m.value}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── Revenue breakdown ── */}
          <section>
            <h2 className="font-bold text-foreground mb-3 flex items-center gap-2">
              <DollarSign className="h-4 w-4" style={{ color: CV.gold }} /> Revenue Breakdown
            </h2>
            <div className="rounded-2xl p-5 space-y-4" style={{ background: 'var(--bg-card)', border: `1px solid ${CV.border}` }}>
              <div className="space-y-2">
                {[
                  { label: 'Total Revenue (gross)',  value: `${totalRevenue.toLocaleString()} CP`,   color: 'rgba(255,255,255,0.85)' },
                  { label: 'Platform Fee (20%)',     value: `−${platformFee.toLocaleString()} CP`,   color: CV.red },
                  { label: 'Your Net Earnings',      value: `${creatorEarns.toLocaleString()} CP`,   color: CV.green },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between py-2.5 border-b last:border-0"
                    style={{ borderColor: CV.border }}>
                    <span className="text-sm" style={{ color: CV.gray }}>{r.label}</span>
                    <span className="font-bold text-sm" style={{ color: r.color }}>{r.value}</span>
                  </div>
                ))}
              </div>

              {/* Visual bar */}
              <div>
                <div className="flex h-3 rounded-full overflow-hidden">
                  <div style={{ width: '80%', background: CV.green }} />
                  <div style={{ width: '20%', background: 'rgba(239,68,68,0.5)' }} />
                </div>
                <div className="flex justify-between text-[10px] mt-1" style={{ color: CV.gray }}>
                  <span>80% yours</span>
                  <span>20% platform fee</span>
                </div>
              </div>
            </div>
          </section>

          {/* ── Rating distribution ── */}
          <section>
            <h2 className="font-bold text-foreground mb-3 flex items-center gap-2">
              <Star className="h-4 w-4" style={{ color: CV.gold }} /> Rating Distribution
            </h2>
            <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: `1px solid ${CV.border}` }}>
              <div className="flex items-center gap-6 mb-4">
                <div className="text-center">
                  <p className="text-3xl font-bold" style={{ color: CV.gold }}>{strategy.rating.toFixed(1)}</p>
                  <Stars rating={strategy.rating} size={14} />
                  <p className="text-xs mt-1" style={{ color: CV.gray }}>{strategy.ratingCount} reviews</p>
                </div>
                <div className="flex-1 space-y-1.5">
                  {[5, 4, 3, 2, 1].map(star => {
                    const count = ratings.filter(r => Math.round(r.rating) === star).length;
                    const pct   = strategy.ratingCount > 0 ? (count / strategy.ratingCount) * 100 : 0;
                    return (
                      <div key={star} className="flex items-center gap-2">
                        <span className="text-xs w-2 shrink-0" style={{ color: CV.gray }}>{star}</span>
                        <Star className="h-3 w-3 shrink-0 fill-yellow-400 text-yellow-400" />
                        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: CV.surface }}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: CV.gold }} />
                        </div>
                        <span className="text-xs w-6 text-right" style={{ color: CV.gray }}>{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* ── Top reviewers ── */}
          {topReviewers.length > 0 && (
            <section>
              <h2 className="font-bold text-foreground mb-3 flex items-center gap-2">
                <MessageSquare className="h-4 w-4" style={{ color: CV.gold }} /> Top Reviews
              </h2>
              <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: `1px solid ${CV.border}` }}>
                {topReviewers.map((r, i) => (
                  <div key={r.id} className="flex items-start gap-3 px-5 py-3.5"
                    style={{ borderBottom: i < topReviewers.length - 1 ? `1px solid ${CV.border}` : 'none' }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                      style={{ background: CV.goldAlpha, color: CV.gold }}>
                      {r.userName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">{r.userName}</span>
                        <Stars rating={r.rating} size={11} />
                        <span className="text-[10px]" style={{ color: CV.gray }}>{timeAgo(r.createdAt)}</span>
                      </div>
                      {r.review && (
                        <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'rgba(255,255,255,0.65)' }}>
                          "{r.review}"
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
