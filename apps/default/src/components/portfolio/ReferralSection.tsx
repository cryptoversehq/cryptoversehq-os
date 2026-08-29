import React, { useState, useEffect } from 'react';
import { Gift, Copy, CheckCheck, Users, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { referralService } from '@/lib/referralService';

interface Props {
  userId: string;
}

export function ReferralSection({ userId }: Props) {
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState({ totalReferrals: 0, activeReferrals: 0, totalEarnings: 0 });

  useEffect(() => {
    if (userId) setStats(referralService.getReferralStats(userId));
  }, [userId]);

  const referralLink = userId ? referralService.generateReferralLink(userId) : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* fallback */ }
  };

  return (
    <div className="bg-card border border-white/5 rounded-2xl p-5 shadow-lg">
      <div className="flex items-center gap-2 mb-4">
        <Gift className="h-4 w-4 text-emerald-400" />
        <h3 className="font-semibold">Invite Friends & Earn</h3>
        <span className="text-xs text-muted-foreground">50 CP per referral</span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">For every friend you invite who signs up, you earn 50 CP. They earn 20 CP too!</p>

      <div className="flex gap-2 mb-4">
        <input type="text" value={referralLink} readOnly className="flex-1 h-9 px-3 rounded-lg bg-secondary/30 border border-border text-xs text-foreground focus:outline-none" />
        <button onClick={handleCopy} className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all shrink-0', copied ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-primary/15 text-primary border-primary/30 hover:bg-primary/25')}>
          {copied ? <CheckCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-secondary/20 rounded-xl p-3">
          <Users className="h-4 w-4 text-primary mx-auto mb-1" />
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-lg font-bold font-mono">{stats.totalReferrals}</p>
        </div>
        <div className="bg-secondary/20 rounded-xl p-3">
          <TrendingUp className="h-4 w-4 text-green-400 mx-auto mb-1" />
          <p className="text-xs text-muted-foreground">Active</p>
          <p className="text-lg font-bold font-mono">{stats.activeReferrals}</p>
        </div>
        <div className="bg-secondary/20 rounded-xl p-3">
          <Gift className="h-4 w-4 text-amber-400 mx-auto mb-1" />
          <p className="text-xs text-muted-foreground">Earned</p>
          <p className="text-lg font-bold font-mono text-emerald-400">{stats.totalEarnings} CP</p>
        </div>
      </div>
    </div>
  );
}

export default ReferralSection;
