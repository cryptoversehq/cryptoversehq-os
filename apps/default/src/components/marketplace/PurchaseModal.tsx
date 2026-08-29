/**
 * PurchaseModal.tsx — confirm & execute CP-coin strategy purchase
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { useStrategyStore } from '../../lib/strategyStore';
import { useCpCoinsStore } from '../../lib/cpCoinsStore';
import { useAuthStore } from '../../lib/authStore';
import { useAcademyStore } from '../../lib/academyStore';
import { BottomSheet } from './BottomSheet';
// §4.3: XP reward for first purchase
import { getLevelFromXP, CV, fmtCP, RISK_META, TYPE_META } from './MarketplaceUtils';
import { Stars } from './StarRating';
import type { Strategy } from '../../lib/strategyTypes';

interface Props {
  strategy: Strategy;
  onClose: () => void;
  onSuccess: () => void;
}

export function PurchaseModal({ strategy, onClose, onSuccess }: Props) {
  const { user } = useAuthStore();
  const { totalXP, awardXP } = useAcademyStore();
  const getBalance = useCpCoinsStore(s => s.getBalance);
  const initUser   = useCpCoinsStore(s => s.initUser);
  const purchaseStrategy = useStrategyStore(s => s.purchaseStrategy);
  const userOwnsStrategy = useStrategyStore(s => s.userOwnsStrategy);
  const getUserPurchases = useStrategyStore(s => s.getUserPurchases);

  const [phase, setPhase] = useState<'confirm' | 'loading' | 'success' | 'error'>('confirm');
  const [errorMsg, setErrorMsg] = useState('');

  if (!user) return null;

  // Init wallet if needed
  initUser(user.id);

  const balance = getBalance(user.id);
  const level   = getLevelFromXP(totalXP);
  const owned   = userOwnsStrategy(strategy.id, user.id);
  const canAfford = balance >= strategy.price || strategy.isFree;
  const meetsLevel = level >= strategy.requiredLevel;
  const type = TYPE_META[strategy.type];
  const risk = RISK_META[strategy.riskLevel];

  const handlePurchase = async () => {
    setPhase('loading');
    await new Promise(r => setTimeout(r, 700));

    const result = purchaseStrategy({
      strategyId:      strategy.id,
      buyerId:         user.id,
      buyerName:       user.displayName,
      userCpCoins:     balance,
      userLevel:       level,
      userPlan:        user.plan,
      userKycVerified: false,
    });

    if (result.ok) {
      // §4.3: Award XP for first marketplace purchase
      const priorPurchases = getUserPurchases(user!.id);
      if (priorPurchases.length === 0) {
        awardXP('mkt_first_purchase', 150);
      }
      setPhase('success');
      setTimeout(() => { onSuccess(); }, 1400);
    } else {
      setErrorMsg(result.error ?? 'Purchase failed.');
      setPhase('error');
    }
  };

  const platformFee = Math.floor(strategy.price * 0.20);
  const creatorEarns = strategy.price - platformFee;

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span className="text-xl">{type.emoji}</span>
          <div>
            <p className="font-bold text-sm text-foreground leading-none">{strategy.name}</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,215,0,0.7)' }}>Purchase Strategy</p>
          </div>
        </div>
      }
    >
      {/* Inner wrapper keeps existing content unchanged */}
      <div>
        {/* subheader info */}
        <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ borderColor: CV.border }}>
          <p className="text-xs" style={{ color: CV.gray }}>by {strategy.creatorName}</p>
        </div>

        <AnimatePresence mode="wait">
          {phase === 'confirm' && (
            <motion.div key="confirm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {/* Stats row */}
              <div className="grid grid-cols-2 gap-3 p-5">
                <div className="rounded-xl p-3" style={{ background: CV.surface, border: `1px solid ${CV.border}` }}>
                  <p className="text-xs" style={{ color: CV.gray }}>Your Balance</p>
                  <p className="font-bold text-sm" style={{ color: CV.gold }}>{balance.toLocaleString()} CP</p>
                </div>
                <div className="rounded-xl p-3" style={{ background: CV.surface, border: `1px solid ${CV.border}` }}>
                  <p className="text-xs" style={{ color: CV.gray }}>Strategy Price</p>
                  <p className="font-bold text-sm" style={{ color: strategy.isFree ? CV.green : CV.gold }}>
                    {fmtCP(strategy.price)}
                  </p>
                </div>
              </div>

              {/* Strategy info */}
              <div className="px-5 pb-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Stars rating={strategy.rating} size={14} count={strategy.ratingCount} />
                  <div className="flex gap-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: risk.bg, color: risk.color }}>{risk.label}</span>
                  </div>
                </div>

                {/* What you get */}
                <div className="rounded-xl p-3 space-y-1.5" style={{ background: CV.surface, border: `1px solid ${CV.border}` }}>
                  <p className="text-xs font-semibold text-foreground mb-2">Includes:</p>
                  {['Full strategy configuration', 'Verified backtest results', 'Parameter documentation', '30-day creator support'].map(item => (
                    <p key={item} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      <CheckCircle className="h-3 w-3 shrink-0" style={{ color: CV.green }} /> {item}
                    </p>
                  ))}
                </div>

                {/* Fee breakdown (if paid) */}
                {!strategy.isFree && (
                  <div className="rounded-xl p-3 space-y-1" style={{ background: CV.surface, border: `1px solid ${CV.border}` }}>
                    <div className="flex justify-between text-xs">
                      <span style={{ color: CV.gray }}>Strategy price</span>
                      <span className="font-semibold">{strategy.price.toLocaleString()} CP</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span style={{ color: CV.gray }}>Platform fee (20%)</span>
                      <span style={{ color: CV.gray }}>−{platformFee.toLocaleString()} CP</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span style={{ color: CV.gray }}>Creator earns</span>
                      <span style={{ color: CV.green }}>{creatorEarns.toLocaleString()} CP</span>
                    </div>
                    <div className="flex justify-between text-xs font-bold border-t pt-1" style={{ borderColor: CV.border }}>
                      <span>Your balance after</span>
                      <span style={{ color: canAfford ? CV.green : CV.red }}>
                        {(balance - strategy.price).toLocaleString()} CP
                      </span>
                    </div>
                  </div>
                )}

                {/* Warnings */}
                {!canAfford && (
                  <div className="flex items-center gap-2 rounded-xl p-3"
                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)' }}>
                    <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: CV.red }} />
                    <p className="text-xs" style={{ color: CV.red }}>Insufficient CP Coins. You need {(strategy.price - balance).toLocaleString()} more CP.</p>
                  </div>
                )}
                {!meetsLevel && (
                  <div className="flex items-center gap-2 rounded-xl p-3"
                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)' }}>
                    <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: CV.red }} />
                    <p className="text-xs" style={{ color: CV.red }}>Requires Academy Level {strategy.requiredLevel}. You are Level {level}.</p>
                  </div>
                )}
                {owned && (
                  <div className="flex items-center gap-2 rounded-xl p-3"
                    style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.20)' }}>
                    <CheckCircle className="h-4 w-4 shrink-0" style={{ color: CV.green }} />
                    <p className="text-xs" style={{ color: CV.green }}>You already own this strategy.</p>
                  </div>
                )}
              </div>

              {/* Buttons */}
              <div className="flex gap-3 px-5 pb-5">
                <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: CV.surface, color: CV.gray, border: `1px solid ${CV.border}` }}>
                  Cancel
                </button>
                {!owned && (
                  <button
                    onClick={handlePurchase}
                    disabled={!canAfford || !meetsLevel}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                    style={{
                      background: strategy.isFree ? 'rgba(52,211,153,0.15)' : CV.goldAlpha,
                      color:      strategy.isFree ? CV.green : CV.gold,
                      border:     `1px solid ${strategy.isFree ? 'rgba(52,211,153,0.25)' : CV.goldBorder}`,
                    }}
                  >
                    <ShoppingCart className="h-4 w-4" />
                    {strategy.isFree ? 'Get Free' : `Purchase for ${strategy.price.toLocaleString()} CP`}
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {phase === 'loading' && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="h-10 w-10 animate-spin" style={{ color: CV.gold }} />
              <p className="text-sm font-semibold" style={{ color: CV.gold }}>Processing purchase…</p>
            </motion.div>
          )}

          {phase === 'success' && (
            <motion.div key="success" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-16 gap-4 text-center px-6">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
                <CheckCircle className="h-14 w-14" style={{ color: CV.green }} />
              </motion.div>
              <p className="font-bold text-lg text-foreground">Strategy Purchased!</p>
              <p className="text-sm" style={{ color: CV.gray }}>
                <strong style={{ color: CV.gold }}>{strategy.name}</strong> has been added to your collection.
              </p>
            </motion.div>
          )}

          {phase === 'error' && (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-12 gap-4 px-6 text-center">
              <AlertTriangle className="h-10 w-10" style={{ color: CV.red }} />
              <p className="font-bold text-foreground">Purchase Failed</p>
              <p className="text-sm" style={{ color: CV.gray }}>{errorMsg}</p>
              <button onClick={() => setPhase('confirm')} className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ background: CV.surface, color: CV.gray, border: `1px solid ${CV.border}` }}>Try Again</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </BottomSheet>
  );
}
