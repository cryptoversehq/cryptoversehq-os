/**
 * ReviewModal.tsx — submit / update a strategy review
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, Loader2, MessageSquare } from 'lucide-react';
import { useStrategyStore } from '../../lib/strategyStore';
import { useAuthStore } from '../../lib/authStore';
import { useAcademyStore } from '../../lib/academyStore';
import { MobileStarPicker } from './StarRating';
import { CV } from './MarketplaceUtils';
import type { Strategy, StrategyRating } from '../../lib/strategyTypes';

interface Props {
  strategy: Strategy;
  existing?: StrategyRating | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function ReviewModal({ strategy, existing, onClose, onSuccess }: Props) {
  const { user } = useAuthStore();
  const { awardXP } = useAcademyStore();
  const submitRating = useStrategyStore(s => s.submitRating);
  const _notify = useStrategyStore(s => s._notify);

  const [rating, setRating]   = useState(existing?.rating ?? 0);
  const [review, setReview]   = useState(existing?.review ?? '');
  const [phase,  setPhase]    = useState<'form' | 'loading' | 'success'>('form');

  if (!user) return null;

  const handleSubmit = async () => {
    if (rating === 0) return;
    setPhase('loading');
    await new Promise(r => setTimeout(r, 500));
    submitRating({
      strategyId:    strategy.id,
      userId:        user.id,
      userName:      user.displayName,
      userAvatarSeed: user.avatarSeed,
      rating,
      review: review.trim(),
    });
    // §4.3: Award XP for first review
    if (!existing) {
      awardXP('mkt_first_review', 50);
    }
    // §6: Notify strategy creator about new review
    if (strategy.creatorId !== user?.id) {
      _notify({
        type:       'strategy_purchased',  // re-use as generic alert for creator
        userId:     strategy.creatorId,
        strategyId: strategy.id,
        message:    `${user?.displayName ?? 'Someone'} left a ${rating}⭐ review on "${strategy.name}".`,
      });
    }
    setPhase('success');
    setTimeout(() => { onSuccess(); }, 1200);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative w-full max-w-md rounded-2xl overflow-hidden z-10 bg-card border border-border shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: CV.goldBorder }}>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" style={{ color: CV.gold }} />
            <p className="font-bold text-sm">{existing ? 'Edit Review' : 'Write a Review'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: CV.gray }}><X className="h-4 w-4" /></button>
        </div>

        <AnimatePresence mode="wait">
          {phase === 'form' && (
            <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-5 space-y-4">
              <div>
                <p className="text-xs mb-1" style={{ color: CV.gray }}>Strategy</p>
                <p className="font-semibold text-sm text-foreground">{strategy.name}</p>
              </div>

              <div>
                <p className="text-xs mb-2" style={{ color: CV.gray }}>Your Rating</p>
                <MobileStarPicker value={rating} onChange={setRating} />
                {rating > 0 && (
                  <p className="text-xs mt-1" style={{ color: CV.gold }}>
                    {['', 'Terrible', 'Poor', 'Average', 'Good', 'Excellent'][rating]}
                  </p>
                )}
              </div>

              <div>
                <p className="text-xs mb-2" style={{ color: CV.gray }}>Review (optional, max 500 chars)</p>
                <textarea
                  value={review}
                  onChange={e => setReview(e.target.value.slice(0, 500))}
                  rows={4}
                  placeholder="Share your experience with this strategy…"
                  className="w-full resize-none rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-yellow-500/40"
                  style={{ background: CV.surface, border: `1px solid ${CV.border}`, color: 'rgba(255,255,255,0.85)' }}
                />
                <p className="text-[10px] text-right" style={{ color: CV.gray }}>{review.length}/500</p>
              </div>

              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: CV.surface, color: CV.gray, border: `1px solid ${CV.border}` }}>Cancel</button>
                <button
                  onClick={handleSubmit}
                  disabled={rating === 0}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-40"
                  style={{ background: CV.goldAlpha, color: CV.gold, border: `1px solid ${CV.goldBorder}` }}
                >
                  {existing ? 'Update Review' : 'Submit Review'}
                </button>
              </div>
            </motion.div>
          )}

          {phase === 'loading' && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center py-12 gap-4">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: CV.gold }} />
              <p className="text-sm" style={{ color: CV.gold }}>Submitting…</p>
            </motion.div>
          )}

          {phase === 'success' && (
            <motion.div key="success" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center py-12 gap-4 text-center px-6">
              <CheckCircle className="h-12 w-12" style={{ color: CV.green }} />
              <p className="font-bold text-foreground">Review Submitted!</p>
              <p className="text-sm" style={{ color: CV.gray }}>Thank you for your feedback.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
