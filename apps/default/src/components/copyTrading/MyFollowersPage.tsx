/**
 * MyFollowersPage.tsx — /copy-trading/followers
 * Visible to users who are top traders: shows follower list, earnings, chart, copy fee settings.
 */
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Users, DollarSign, TrendingUp, Star, Settings2, Check,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useCopyTradingStore } from '../../lib/copyTradingStore';
import { useAuthStore } from '../../lib/authStore';
import { CTV, fmtUsd, fmtCP, timeAgo, generateFollowerGrowth, relWinRate } from './CopyTradingUtils';
import { CopyRelationship } from '../../lib/copyTradingTypes';

const FEE_OPTIONS = [1, 2, 3, 5, 7, 10];

export function MyFollowersPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const userId   = user?.id ?? 'demo_follower';

  const traders          = useCopyTradingStore(s => s.traders);
  const getFollowersOf   = useCopyTradingStore(s => s.getFollowersOf);
  const getTraderEarnings = useCopyTradingStore(s => s.getTraderEarnings);
  const updateCopyFee    = useCopyTradingStore(s => s.updateCopyFee);

  // For the demo: use the first seeded trader as "the user's trader profile"
  // In a real app this would be the user's own trader profile
  const myTraderProfile = Object.values(traders).find(t => t.id === 'trader_01')!;
  const earnings         = getTraderEarnings(myTraderProfile.id);
  const followers        = useMemo(() => getFollowersOf(myTraderProfile.id), [myTraderProfile.id]);
  const growthData       = useMemo(() => generateFollowerGrowth(myTraderProfile.totalFollowers), [myTraderProfile.totalFollowers]);

  const [selectedFee, setSelectedFee] = useState(myTraderProfile.copyFeePct);
  const [feeSaved,    setFeeSaved]    = useState(false);

  function saveFee() {
    updateCopyFee(myTraderProfile.id, selectedFee);
    setFeeSaved(true);
    setTimeout(() => setFeeSaved(false), 2_000);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b shrink-0"
        style={{ borderColor: CTV.goldBorder, background: 'var(--bg-card)' }}>
        <button onClick={() => navigate('/copy-trading')}
          className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: CTV.gray }}>
          <ArrowLeft className="h-3.5 w-3.5" /> Copy Trading
        </button>
        <h1 className="font-bold text-foreground flex items-center gap-2">
          <Star className="h-4 w-4" style={{ color: CTV.gold }} /> My Followers & Earnings
        </h1>
        <div className="w-20" />
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-8">

          {/* Earnings Summary */}
          <section>
            <h2 className="font-bold text-foreground mb-3 flex items-center gap-2">
              <DollarSign className="h-4 w-4" style={{ color: CTV.gold }} /> Earnings Summary
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: 'Total Followers',   value: myTraderProfile.totalFollowers.toLocaleString(),  color: 'rgba(255,255,255,0.85)' },
                { label: 'Active Followers',  value: myTraderProfile.activeFollowers.toLocaleString(),  color: CTV.green },
                { label: 'Total Earnings',    value: `${myTraderProfile.totalEarningsCP.toLocaleString()} CP`, color: CTV.gold },
                { label: 'This Month',        value: `${earnings.thisMonthCP.toFixed(0)} CP`,           color: CTV.gold },
                { label: 'Copy Fee',          value: `${myTraderProfile.copyFeePct}%`,                  color: 'rgba(255,255,255,0.85)' },
              ].map(m => (
                <div key={m.label} className="rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: `1px solid ${CTV.border}` }}>
                  <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: CTV.gray }}>{m.label}</p>
                  <p className="font-bold text-base" style={{ color: m.color }}>{m.value}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Follower List */}
          <section>
            <h2 className="font-bold text-foreground mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-400" /> Follower List
              <span className="text-xs font-normal" style={{ color: CTV.gray }}>({followers.length})</span>
            </h2>
            <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${CTV.border}` }}>
              <div className="grid grid-cols-6 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider"
                style={{ background: 'var(--bg-secondary)', color: CTV.gray, borderBottom: `1px solid ${CTV.border}`, gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr' }}>
                <span>Follower</span><span>Copy %</span><span>Copied Trades</span><span>Profit</span><span>Status</span><span>Since</span>
              </div>
              {followers.slice(0, 10).map((rel, i) => (
                <FollowerRow key={rel.id} rel={rel} isLast={i === Math.min(10, followers.length) - 1} />
              ))}
              {followers.length === 0 && (
                <div className="text-center py-10">
                  <p className="text-sm text-muted-foreground">No followers yet. Keep trading!</p>
                </div>
              )}
            </div>
          </section>

          {/* Follower Growth Chart */}
          <section>
            <h2 className="font-bold text-foreground mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-400" /> Follower Growth (30 Days)
            </h2>
            <div className="rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: `1px solid ${CTV.border}` }}>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={growthData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="followerGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={CTV.gold} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={CTV.gold} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: CTV.gray }} axisLine={false} tickLine={false}
                    interval={Math.floor(growthData.length / 6)} />
                  <YAxis tick={{ fontSize: 9, fill: CTV.gray }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip
                    formatter={(v: number) => [v.toLocaleString(), 'Followers']}
                    contentStyle={{ background: '#0A1929', border: `1px solid ${CTV.goldBorder}`, borderRadius: 8, fontSize: 11 }}
                  />
                  <Area type="monotone" dataKey="followers" stroke={CTV.gold} strokeWidth={2} fill="url(#followerGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Copy Fee Settings */}
          <section>
            <h2 className="font-bold text-foreground mb-3 flex items-center gap-2">
              <Settings2 className="h-4 w-4" style={{ color: CTV.gray }} /> Copy Fee Settings
            </h2>
            <div className="rounded-2xl p-5 space-y-4" style={{ background: 'rgba(10,25,41,0.85)', border: `1px solid ${CTV.border}` }}>
              <div>
                <p className="text-sm text-foreground mb-1">Current Copy Fee: <strong style={{ color: CTV.gold }}>{myTraderProfile.copyFeePct}%</strong> of follower profit</p>
                <p className="text-xs text-muted-foreground">Higher fees may reduce new followers. Recommended: 3–5%.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {FEE_OPTIONS.map(f => (
                  <button key={f} onClick={() => setSelectedFee(f)}
                    className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
                    style={{
                      background: selectedFee === f ? CTV.goldAlpha : CTV.surface,
                      color:      selectedFee === f ? CTV.gold : CTV.gray,
                      border:     `1px solid ${selectedFee === f ? CTV.goldBorder : CTV.border}`,
                    }}>
                    {f}%
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <button onClick={saveFee}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-90"
                  style={{ background: feeSaved ? CTV.greenAlpha : 'linear-gradient(135deg,#FFD700,#FFA800)', color: feeSaved ? CTV.green : '#0A1929', border: feeSaved ? `1px solid ${CTV.greenBorder}` : 'none' }}>
                  {feeSaved ? <><Check className="h-4 w-4" /> Saved!</> : 'Apply New Fee'}
                </button>
                <p className="text-xs text-muted-foreground">⚠️ New fee applies to new followers only.</p>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}

function FollowerRow({ rel, isLast }: { rel: CopyRelationship; isLast: boolean }) {
  const profitOk = rel.totalProfitUsd >= 0;
  const isActive = rel.status === 'active';
  const daysSince = Math.round((Date.now() - new Date(rel.startedAt).getTime()) / 86_400_000);
  const sinceLabel = daysSince === 0 ? 'Today' : daysSince === 1 ? '1 day' : `${daysSince} days`;

  return (
    <div className="text-sm px-4 py-3"
      style={{
        gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr',
        display: 'grid',
        background: 'rgba(10,25,41,0.85)',
        borderBottom: isLast ? 'none' : `1px solid ${CTV.border}`,
      }}>
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold uppercase"
          style={{ background: CTV.surface, color: CTV.gray, border: `1px solid ${CTV.border}` }}>
          {rel.followerId.slice(0, 2)}
        </div>
        <span className="text-foreground font-semibold truncate">User {rel.followerId.slice(-4)}</span>
      </div>
      <span className="text-foreground font-bold self-center">{rel.settings.copyPct}%</span>
      <span className="text-foreground self-center">{rel.totalCopiedTrades}</span>
      <span className="font-bold self-center" style={{ color: profitOk ? CTV.green : CTV.red }}>
        {fmtUsd(rel.totalProfitUsd)}
      </span>
      <span className="self-center">
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
          style={{
            background: isActive ? CTV.greenAlpha : 'rgba(251,191,36,0.12)',
            color:      isActive ? CTV.green      : '#fbbf24',
          }}>
          {isActive ? 'Active' : 'Paused'}
        </span>
      </span>
      <span className="text-muted-foreground text-xs self-center">{sinceLabel}</span>
    </div>
  );
}
