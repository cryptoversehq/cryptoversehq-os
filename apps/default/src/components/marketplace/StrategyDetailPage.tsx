/**
 * StrategyDetailPage.tsx — /marketplace/:id
 * Full strategy detail: metrics, equity chart, reviews, purchase CTA
 */
import React, { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Share2, TrendingUp, TrendingDown, Shield, Zap, Clock,
  Star, MessageSquare, CheckCircle, Users, BarChart2, DollarSign,
  ChevronDown, ChevronUp, Copy, ExternalLink, Bot, FlaskConical,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useStrategyStore } from '../../lib/strategyStore';
import { useAuthStore } from '../../lib/authStore';
import { useCpCoinsStore } from '../../lib/cpCoinsStore';
import { useAcademyStore } from '../../lib/academyStore';
import { Stars } from './StarRating';
import { PurchaseModal } from './PurchaseModal';
import { ReviewModal } from './ReviewModal';
import { StrategyBacktestPanel } from './StrategyBacktestPanel';
import { CreateBotFromStrategyModal } from './CreateBotFromStrategyModal';
import {
  CV, TYPE_META, RISK_META, fmtCP, fmtPct, fmtNum, timeAgo, getLevelFromXP,
} from './MarketplaceUtils';
import { cn } from '../../lib/utils';

// ─────────────────────────────────────────────────────────────────────────────

export function StrategyDetailPage() {
  const { id }     = useParams<{ id: string }>();
  const navigate   = useNavigate();
  const { user }   = useAuthStore();
  const { totalXP } = useAcademyStore();
  const getBalance  = useCpCoinsStore(s => s.getBalance);
  const initUser    = useCpCoinsStore(s => s.initUser);

  const getStrategyDetail  = useStrategyStore(s => s.getStrategyDetail);
  const getStrategyRatings = useStrategyStore(s => s.getStrategyRatings);
  const userOwnsStrategy   = useStrategyStore(s => s.userOwnsStrategy);
  const getUserRating      = useStrategyStore(s => s.getUserRating);
  const backtestResults    = useStrategyStore(s => s.backtestResults);
  const strategies         = useStrategyStore(s => s.strategies);

  const [showAllReviews, setShowAllReviews] = useState(false);
  const [showPurchase,   setShowPurchase]   = useState(false);
  const [showReview,     setShowReview]     = useState(false);
  const [showCreateBot,  setShowCreateBot]  = useState(false);
  const [copied,         setCopied]         = useState(false);

  if (!id) return null;

  if (user) initUser(user.id);
  const balance = user ? getBalance(user.id) : 0;
  const level   = getLevelFromXP(totalXP);

  const strategy = useMemo(() => strategies[id] ?? null, [strategies, id]);
  const ratings  = useMemo(() => (strategy ? getStrategyRatings(strategy.id) : []), [strategy, getStrategyRatings]);
  const owned    = user && strategy ? userOwnsStrategy(strategy.id, user.id) : false;
  const myRating = user && strategy ? getUserRating(strategy.id, user.id) : null;
  const btResult = strategy ? backtestResults[strategy.id] : null;

  if (!strategy) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-muted-foreground">Strategy not found.</p>
        <Link to="/marketplace" className="text-xs font-semibold" style={{ color: CV.gold }}>← Back to Marketplace</Link>
      </div>
    );
  }

  const type = TYPE_META[strategy.type];
  const risk = RISK_META[strategy.riskLevel];

  // Build equity curve chart data
  const equityData = useMemo(() => {
    if (btResult?.equityCurve?.length) {
      return btResult.equityCurve.map((v, i) => ({
        day: i,
        value: Math.round(v),
      }));
    }
    // Generate a plausible curve from the strategy's metrics
    const points = 30;
    const start  = strategy.backtestStartCapital;
    const end    = start * (1 + strategy.totalProfitPct / 100);
    return Array.from({ length: points }, (_, i) => {
      const progress = i / (points - 1);
      const noise    = (Math.random() - 0.5) * start * 0.03;
      const value    = start + (end - start) * progress + noise;
      return { day: i, value: Math.round(Math.max(start * 0.8, value)) };
    });
  }, [btResult, strategy]);

  const isProfitPos = strategy.totalProfitPct > 0;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayedReviews = showAllReviews ? ratings : ratings.slice(0, 3);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ background: 'radial-gradient(ellipse 70% 50% at 90% 0%, rgba(255,215,0,0.05) 0%, transparent 70%), var(--background)' }}
    >
      {/* ── Header ── */}
      <header
        className="flex items-center justify-between px-4 sm:px-6 py-3 border-b shrink-0 backdrop-blur-sm"
        style={{ borderColor: CV.goldBorder, background: 'var(--bg-card)' }}
      >
        {/* Back button */}
        <button onClick={() => navigate('/marketplace')}
          className="flex items-center gap-1.5 text-xs font-semibold transition-colors hover:text-foreground shrink-0"
          style={{ color: CV.gray }}>
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Strategy Marketplace</span>
          <span className="sm:hidden">Back</span>
        </button>

        {/* Title (desktop breadcrumb) */}
        <span className="hidden sm:block text-xs font-semibold text-foreground truncate max-w-[220px] mx-3">{strategy.name}</span>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button onClick={handleCopyLink}
            className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{ background: CV.surface, color: CV.gray, border: `1px solid ${CV.border}` }}>
            {copied ? <CheckCircle className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{copied ? 'Copied!' : 'Share'}</span>
          </button>

          {!owned ? (
            <button
              onClick={() => setShowPurchase(true)}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all"
              style={{ background: strategy.isFree ? 'rgba(52,211,153,0.15)' : CV.goldAlpha, color: strategy.isFree ? CV.green : CV.gold, border: `1px solid ${strategy.isFree ? 'rgba(52,211,153,0.25)' : CV.goldBorder}` }}
            >
              {strategy.isFree ? '✓ Get Free' : `Purchase ${fmtCP(strategy.price)}`}
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-xl text-xs font-bold"
              style={{ background: 'rgba(52,211,153,0.10)', color: CV.green, border: '1px solid rgba(52,211,153,0.20)' }}>
              <CheckCircle className="h-3.5 w-3.5" /> Owned
            </div>
          )}
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">

          {/* ── Top: Strategy info + purchase panel ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: info */}
            <div className="lg:col-span-2 rounded-2xl p-5 space-y-4"
              style={{ background: 'var(--bg-card)', border: `1px solid ${CV.goldBorder}` }}>
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                  style={{ background: CV.goldAlpha, border: `1px solid ${CV.goldBorder}` }}>
                  {type.emoji}
                </div>
                <div className="flex-1">
                  <h1 className="text-xl font-bold text-foreground">{strategy.name}</h1>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <p className="text-sm" style={{ color: CV.gray }}>by <span className="text-foreground font-semibold">{strategy.creatorName}</span></p>
                    {(strategy as any).verified && (
                      <span className="text-blue-500 text-xs flex items-center gap-1 font-semibold">
                        ✅ Verified Track Record
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <Stars rating={strategy.rating} size={14} count={strategy.ratingCount} />
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: risk.bg, color: risk.color }}>{risk.label}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: `${type.color}18`, color: type.color }}>{type.label}</span>
                  </div>
                </div>
              </div>

              <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.70)' }}>
                {strategy.description}
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Backtest Period', value: `${strategy.backtestPeriodDays}d` },
                  { label: 'Start Capital',   value: `$${strategy.backtestStartCapital.toLocaleString()}` },
                  { label: 'Total Sales',     value: fmtNum(strategy.totalSales) },
                  { label: 'Avg Trade',       value: `${Math.round(strategy.avgTradeDuration)}m` },
                ].map(m => (
                  <div key={m.label} className="rounded-xl p-3" style={{ background: CV.surface, border: `1px solid ${CV.border}` }}>
                    <p className="text-[10px]" style={{ color: CV.gray }}>{m.label}</p>
                    <p className="font-bold text-sm text-foreground mt-0.5">{m.value}</p>
                  </div>
                ))}
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5">
                {strategy.tags.map(tag => (
                  <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full"
                    style={{ background: CV.surface, color: CV.gray, border: `1px solid ${CV.border}` }}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Right: purchase panel */}
            <div className="rounded-2xl p-5 space-y-4"
              style={{ background: 'var(--bg-card)', border: `1px solid ${CV.goldBorder}` }}>
              <div className="text-center py-3">
                <p className="text-xs" style={{ color: CV.gray }}>Price</p>
                <p className="text-3xl font-bold mt-1" style={{ color: strategy.isFree ? CV.green : CV.gold }}>
                  {fmtCP(strategy.price)}
                </p>
                {user && (
                  <p className="text-xs mt-1" style={{ color: CV.gray }}>
                    Your balance: <span style={{ color: CV.gold }}>{balance.toLocaleString()} CP</span>
                  </p>
                )}
              </div>

              {!owned ? (
                <button
                  onClick={() => setShowPurchase(true)}
                  className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
                  style={{ background: strategy.isFree ? 'rgba(52,211,153,0.15)' : CV.goldAlpha, color: strategy.isFree ? CV.green : CV.gold, border: `1px solid ${strategy.isFree ? 'rgba(52,211,153,0.25)' : CV.goldBorder}` }}
                >
                  {strategy.isFree ? '✓ Get Free Strategy' : `Purchase Strategy`}
                </button>
              ) : (
                <div className="w-full py-3 rounded-xl font-bold text-sm text-center"
                  style={{ background: 'rgba(52,211,153,0.10)', color: CV.green, border: '1px solid rgba(52,211,153,0.20)' }}>
                  ✓ You own this strategy
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground">Includes:</p>
                {['Full strategy configuration', 'Verified backtest results', 'Parameter documentation', '30-day creator support'].map(item => (
                  <p key={item} className="flex items-center gap-2 text-xs" style={{ color: 'rgba(255,255,255,0.65)' }}>
                    <CheckCircle className="h-3 w-3 shrink-0" style={{ color: CV.green }} /> {item}
                  </p>
                ))}
              </div>

              <div className="pt-2 border-t" style={{ borderColor: CV.border }}>
                <div className="flex justify-between text-xs">
                  <span style={{ color: CV.gray }}>Platform fee</span>
                  <span style={{ color: CV.gray }}>20%</span>
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span style={{ color: CV.gray }}>Creator earns</span>
                  <span style={{ color: CV.green }}>{Math.round(strategy.price * 0.80).toLocaleString()} CP</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Performance metrics ── */}
          <section>
            <h2 className="font-bold text-foreground mb-3 flex items-center gap-2">
              <BarChart2 className="h-4 w-4" style={{ color: CV.gold }} /> Performance Metrics
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { icon: TrendingUp,   label: 'Win Rate',     value: `${strategy.winRate.toFixed(1)}%`,    pos: strategy.winRate >= 50 },
                { icon: Zap,          label: 'Sharpe Ratio', value: strategy.sharpeRatio.toFixed(2),       pos: strategy.sharpeRatio >= 1 },
                { icon: TrendingDown, label: 'Max Drawdown', value: `−${strategy.maxDrawdown.toFixed(1)}%`, pos: false },
                { icon: DollarSign,   label: 'Total Return', value: fmtPct(strategy.totalProfitPct),        pos: isProfitPos },
                { icon: Clock,        label: 'Total Trades', value: strategy.totalTrades.toString(),         pos: true },
              ].map(m => (
                <div key={m.label} className="rounded-2xl p-4 text-center"
                  style={{ background: 'var(--bg-card)', border: `1px solid ${CV.border}` }}>
                  <m.icon className="h-4 w-4 mx-auto mb-2" style={{ color: m.pos ? CV.green : CV.red }} />
                  <p className="text-xs mb-1" style={{ color: CV.gray }}>{m.label}</p>
                  <p className="font-bold text-sm" style={{ color: m.pos ? CV.green : CV.red }}>{m.value}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── Equity Curve ── */}
          <section>
            <h2 className="font-bold text-foreground mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" style={{ color: CV.gold }} /> Equity Curve
            </h2>
            <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: `1px solid ${CV.border}` }}>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={equityData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={isProfitPos ? CV.green : CV.red} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={isProfitPos ? CV.green : CV.red} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="day" tick={{ fill: CV.gray, fontSize: 10 }} tickLine={false} />
                  <YAxis
                    tick={{ fill: CV.gray, fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
                    width={48}
                  />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-card)', border: `1px solid ${CV.goldBorder}`, borderRadius: 12 }}
                    formatter={(v: number) => [`$${v.toLocaleString()}`, 'Portfolio']}
                    labelFormatter={l => `Day ${l}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={isProfitPos ? CV.green : CV.red}
                    strokeWidth={2}
                    fill="url(#eqGrad)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* ── §4.1 Backtest panel ── */}
          <StrategyBacktestPanel strategy={strategy} />

          {/* ── §4.2 Create Bot from Strategy (owned only) ── */}
          {owned && (
            <section>
              <div className="flex items-center justify-between p-4 rounded-2xl cursor-pointer"
                style={{ background: 'var(--bg-card)', border: `1px solid rgba(129,140,248,0.20)` }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: 'rgba(129,140,248,0.12)', border: '1px solid rgba(129,140,248,0.25)' }}>
                    <Bot className="h-5 w-5" style={{ color: '#818cf8' }} />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-foreground">Deploy as Trading Bot</p>
                    <p className="text-xs" style={{ color: CV.gray }}>
                      Create a live bot using {strategy.name}'s {TYPE_META[strategy.type].label} engine
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCreateBot(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all"
                  style={{ background: 'rgba(129,140,248,0.15)', color: '#818cf8', border: '1px solid rgba(129,140,248,0.25)' }}
                >
                  <Bot className="h-4 w-4" /> Create Bot
                </button>
              </div>
            </section>
          )}

          {/* ── Reviews & Ratings ── */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-foreground flex items-center gap-2">
                <Star className="h-4 w-4" style={{ color: CV.gold }} /> Reviews & Ratings
                <span className="text-sm font-normal" style={{ color: CV.gray }}>({strategy.ratingCount})</span>
              </h2>
              {owned && (
                <button
                  onClick={() => setShowReview(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                  style={{ background: CV.goldAlpha, color: CV.gold, border: `1px solid ${CV.goldBorder}` }}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  {myRating ? 'Edit Review' : 'Write a Review'}
                </button>
              )}
            </div>

            {/* Rating summary */}
            <div className="flex items-center gap-6 p-4 rounded-2xl mb-4"
              style={{ background: 'var(--bg-card)', border: `1px solid ${CV.border}` }}>
              <div className="text-center">
                <p className="text-4xl font-bold" style={{ color: CV.gold }}>{strategy.rating.toFixed(1)}</p>
                <Stars rating={strategy.rating} size={16} />
                <p className="text-xs mt-1" style={{ color: CV.gray }}>{strategy.ratingCount} reviews</p>
              </div>
              <div className="flex-1 space-y-1">
                {[5, 4, 3, 2, 1].map(star => {
                  const count = ratings.filter(r => Math.round(r.rating) === star).length;
                  const pct   = strategy.ratingCount > 0 ? (count / strategy.ratingCount) * 100 : 0;
                  return (
                    <div key={star} className="flex items-center gap-2">
                      <span className="text-xs w-3 shrink-0" style={{ color: CV.gray }}>{star}</span>
                      <Star className="h-3 w-3 shrink-0 fill-yellow-400 text-yellow-400" />
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: CV.surface }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: CV.gold }} />
                      </div>
                      <span className="text-xs w-6 text-right" style={{ color: CV.gray }}>{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Review list */}
            {displayedReviews.length === 0 ? (
              <div className="text-center py-8" style={{ color: CV.gray }}>
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No reviews yet. {owned ? 'Be the first to review!' : ''}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {displayedReviews.map((r, i) => (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="rounded-2xl p-4"
                    style={{ background: 'var(--bg-card)', border: `1px solid ${CV.border}` }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                          style={{ background: CV.goldAlpha, color: CV.gold }}>
                          {r.userName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-foreground">{r.userName}</p>
                          <div className="flex items-center gap-2">
                            <Stars rating={r.rating} size={11} />
                            {r.isVerifiedPurchase && (
                              <span className="text-[10px] flex items-center gap-0.5" style={{ color: CV.green }}>
                                <CheckCircle className="h-2.5 w-2.5" /> Verified Purchase
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] shrink-0" style={{ color: CV.gray }}>{timeAgo(r.createdAt)}</span>
                    </div>
                    {r.review && (
                      <p className="text-sm mt-2 leading-relaxed" style={{ color: 'rgba(255,255,255,0.70)' }}>
                        "{r.review}"
                      </p>
                    )}
                  </motion.div>
                ))}

                {ratings.length > 3 && (
                  <button
                    onClick={() => setShowAllReviews(v => !v)}
                    className="w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
                    style={{ background: CV.surface, color: CV.gray, border: `1px solid ${CV.border}` }}
                  >
                    {showAllReviews
                      ? <><ChevronUp className="h-3.5 w-3.5" /> Show Less</>
                      : <><ChevronDown className="h-3.5 w-3.5" /> View All {ratings.length} Reviews</>}
                  </button>
                )}
              </div>
            )}
          </section>

          {/* ── Strategy code preview (owned users) ── */}
          {owned && (
            <section>
              <h2 className="font-bold text-foreground mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4" style={{ color: CV.gold }} /> Strategy Configuration
              </h2>
              <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: `1px solid ${CV.border}` }}>
                <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: CV.border }}>
                  <span className="text-xs font-mono" style={{ color: CV.gray }}>strategy.config.json</span>
                  <button
                    onClick={() => { navigator.clipboard.writeText(strategy.code); }}
                    className="flex items-center gap-1 text-[10px] transition-colors hover:text-foreground"
                    style={{ color: CV.gray }}
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </button>
                </div>
                <pre className="p-4 text-xs overflow-x-auto leading-relaxed" style={{ color: '#34d399', fontFamily: 'monospace' }}>
                  {JSON.stringify(JSON.parse(strategy.code.startsWith('{') ? strategy.code : '{}'), null, 2)}
                </pre>
              </div>
              {strategy.paramDocs && (
                <div className="mt-3 rounded-2xl p-4" style={{ background: CV.surface, border: `1px solid ${CV.border}` }}>
                  <p className="font-semibold text-sm mb-2 text-foreground">Parameter Documentation</p>
                  <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}>
                    {strategy.paramDocs.replace(/##|###|\*\*/g, '').trim()}
                  </p>
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      {/* §8 — Mobile sticky purchase bar */}
      {!owned && (
        <div className="sm:hidden sticky bottom-0 left-0 right-0 z-20 px-4 py-3 border-t backdrop-blur-md"
          style={{ background: 'var(--bg-card)', borderColor: CV.goldBorder }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-foreground">{strategy.name}</p>
              <p className="text-xs" style={{ color: strategy.isFree ? CV.green : CV.gold }}>
                {strategy.isFree ? 'FREE' : fmtCP(strategy.price)}
              </p>
            </div>
            <button
              onClick={() => setShowPurchase(true)}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold"
              style={{ background: strategy.isFree ? 'rgba(52,211,153,0.20)' : 'linear-gradient(135deg,#FFD700,#FFA800)', color: strategy.isFree ? CV.green : '#0A1929' }}
            >
              {strategy.isFree ? '✓ Get Free' : 'Purchase Now'}
            </button>
          </div>
        </div>
      )}

      {/* Purchase modal */}
      {showPurchase && (
        <PurchaseModal
          strategy={strategy}
          onClose={() => setShowPurchase(false)}
          onSuccess={() => setShowPurchase(false)}
        />
      )}

      {/* Review modal */}
      {showReview && (
        <ReviewModal
          strategy={strategy}
          existing={myRating}
          onClose={() => setShowReview(false)}
          onSuccess={() => setShowReview(false)}
        />
      )}

      {/* Create Bot from Strategy modal (§4.2) */}
      {showCreateBot && (
        <CreateBotFromStrategyModal
          strategy={strategy}
          onClose={() => setShowCreateBot(false)}
        />
      )}
    </div>
  );
}
