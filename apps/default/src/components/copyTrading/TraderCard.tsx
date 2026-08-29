/**
 * TraderCard.tsx — compact card used in the top-traders leaderboard table
 */
import React, { useState } from 'react';
import { Star, Users, TrendingUp, Shield, ChevronRight, Flag, Check } from 'lucide-react';
import { TopTrader } from '../../lib/copyTradingTypes';
import { useAdminPortalStore } from '../../lib/adminPortalStore';
import { useAuthStore } from '../../lib/authStore';
import { CTV, badgeEmoji, fmtPct, starsArr } from './CopyTradingUtils';
import { toast } from 'sonner';

interface Props {
  trader: TopTrader;
  isFollowing: boolean;
  onCopy: (trader: TopTrader) => void;
  onViewDetails: (trader: TopTrader) => void;
}

export function TraderCard({ trader, isFollowing, onCopy, onViewDetails }: Props) {
  const winColor = trader.winRate >= 70 ? CTV.green : trader.winRate >= 60 ? CTV.gold : CTV.red;
  const { user } = useAuthStore();
  const submitReport = useAdminPortalStore(s => s.submitReport);
  const [reported, setReported] = useState(false);

  const handleReport = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (reported) return;
    submitReport({
      reporterId:   user?.id ?? 'anonymous',
      reporterName: user?.displayName ?? 'User',
      targetId:     trader.id,
      targetName:   trader.displayName,
      reason:       `Reported trader "${trader.displayName}" for suspicious activity or policy violation.`,
      category:     'competition',
    });
    setReported(true);
    toast.success(`Report submitted for ${trader.displayName}. An admin will review it.`);
  };

  return (
    <div
      className="flex items-center gap-3 sm:gap-4 px-4 py-3.5 border-b cursor-pointer group transition-colors"
      style={{ borderColor: CTV.border, background: 'transparent' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      onClick={() => onViewDetails(trader)}
    >
      {/* Rank badge */}
      <div className="w-9 text-center shrink-0">
        <span className="text-xl">{badgeEmoji(trader)}</span>
        <p className="text-[10px] font-bold mt-0.5" style={{ color: CTV.gray }}>#{trader.rank}</p>
      </div>

      {/* Avatar + Name */}
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0 font-bold uppercase"
          style={{ background: 'rgba(255,215,0,0.15)', color: CTV.gold, border: `1.5px solid ${CTV.goldBorder}` }}>
          {trader.displayName.slice(0, 2)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-bold text-sm text-foreground truncate">{trader.displayName}</p>
            {trader.isVerified && <Shield className="h-3 w-3 text-blue-400 shrink-0" />}
          </div>
          <div className="flex items-center gap-0.5 mt-0.5">
            {starsArr(trader.rating).map((s, i) => (
              <Star key={i} size={9}
                fill={s === 'full' ? CTV.gold : 'transparent'}
                stroke={s === 'empty' ? 'rgba(255,215,0,0.3)' : CTV.gold} />
            ))}
            <span className="text-[10px] ml-1" style={{ color: CTV.gray }}>({trader.rating})</span>
          </div>
        </div>
      </div>

      {/* Stats — hide some on mobile */}
      <div className="hidden sm:flex items-center gap-6 text-right shrink-0">
        <StatCol label="Win Rate" value={fmtPct(trader.winRate, false)} color={winColor} />
        <StatCol label="Profit" value={fmtPct(trader.totalProfitPct)} color={CTV.green} />
        <div className="flex items-center gap-1 text-xs" style={{ color: CTV.gray }}>
          <Users className="h-3 w-3" /> {trader.totalFollowers.toLocaleString()}
        </div>
        <div className="text-xs font-semibold shrink-0" style={{ color: CTV.gray }}>
          {trader.copyFeePct}% fee
        </div>
      </div>

      {/* Mobile win rate only */}
      <div className="sm:hidden text-right shrink-0">
        <p className="text-sm font-bold" style={{ color: winColor }}>{fmtPct(trader.winRate, false)}</p>
        <p className="text-[10px]" style={{ color: CTV.gray }}>win</p>
      </div>

      {/* CTA */}
      <div className="flex items-center gap-2 shrink-0 ml-2">
        {isFollowing ? (
          <div className="px-3 py-1.5 rounded-xl text-xs font-bold"
            style={{ background: CTV.greenAlpha, color: CTV.green, border: `1px solid ${CTV.greenBorder}` }}>
            ✓ Copying
          </div>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); onCopy(trader); }}
            className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all hover:scale-105"
            style={{ background: CTV.goldAlpha, color: CTV.gold, border: `1px solid ${CTV.goldBorder}` }}>
            Copy
          </button>
        )}
        <button
          onClick={handleReport}
          disabled={reported}
          title={reported ? 'Report submitted' : 'Report this trader'}
          className="h-7 w-7 flex items-center justify-center rounded-lg border transition-all opacity-0 group-hover:opacity-100 duration-150"
          style={{
            borderColor: reported ? 'rgba(239,68,68,0.30)' : CTV.border,
            background: reported ? 'rgba(239,68,68,0.10)' : 'transparent',
            color: reported ? CTV.red : CTV.gray,
          }}
        >
          {reported ? <Check className="h-3.5 w-3.5" /> : <Flag className="h-3.5 w-3.5" />}
        </button>
        <ChevronRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: CTV.gray }} />
      </div>
    </div>
  );
}

function StatCol({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-right">
      <p className="text-xs font-bold" style={{ color }}>{value}</p>
      <p className="text-[10px]" style={{ color: CTV.gray }}>{label}</p>
    </div>
  );
}
