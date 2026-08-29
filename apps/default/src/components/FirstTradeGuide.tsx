import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, X, Target, Zap, BarChart2, CheckCircle, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

const STEPS = [
  {
    title: 'Welcome to Paper Trading!',
    description: 'This is a risk-free simulated environment. You start with $100,000 in virtual funds. Let us walk you through your first trade.',
    icon: Target,
  },
  {
    title: 'Step 1: Select a Coin',
    description: 'Click on the coin pair name at the top-left of the header (e.g., BTC/USDT). Search or scroll to find any supported cryptocurrency.',
    icon: BarChart2,
    highlight: 'coin-selector',
  },
  {
    title: 'Step 2: Choose Order Type',
    description: 'On the right panel, switch between Limit, Market, and Stop-Limit orders. For your first trade, use Market — it fills instantly at the current price.',
    icon: Zap,
    highlight: 'order-tabs',
  },
  {
    title: 'Step 3: Set Amount & Leverage',
    description: 'Enter how much you want to trade in USDT (or coin amount). Use the % quick-fill buttons. In beginner mode, leverage is capped at 3× for safety.',
    icon: BarChart2,
    highlight: 'amount-input',
  },
  {
    title: 'Step 4: Review & Confirm',
    description: 'Check your order summary — value, quantity, leverage, and fee. When ready, click Buy or Sell. A confirmation dialog ensures you don’t trade accidentally.',
    icon: CheckCircle,
    highlight: 'submit-btn',
  },
  {
    title: 'Step 5: Monitor Your Position',
    description: 'Open positions appear in the bottom panel. You’ll see your entry price, current P&L, and can set Take-Profit / Stop-Loss levels to manage risk.',
    icon: Target,
    highlight: 'bottom-panel',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  onDismiss: () => void;
}

export function FirstTradeGuide({ onDismiss }: Props) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const s = STEPS[step];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}
      >
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="bg-[#1a1e26] border border-white/[0.1] rounded-2xl p-6 w-full max-w-md mx-4 mb-6 sm:mb-0 shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={onDismiss}
            className="absolute top-3 right-3 p-1 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.05] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Step indicator */}
          <div className="flex items-center gap-1.5 mb-4">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-1.5 flex-1 rounded-full transition-all duration-300',
                  i <= step ? 'bg-amber-400' : 'bg-white/[0.08]',
                  i === step && 'shadow-[0_0_6px_rgba(240,185,11,0.4)]',
                )}
              />
            ))}
          </div>

          {/* Icon */}
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-400/10 mb-4">
            <s.icon className="w-6 h-6 text-amber-400" />
          </div>

          {/* Content */}
          <h3 className="text-lg font-bold text-white mb-2">{s.title}</h3>
          <p className="text-[13px] text-white/60 leading-relaxed">{s.description}</p>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-6 gap-3">
            <div className="text-[11px] text-white/30">
              {step + 1} / {STEPS.length}
            </div>
            <div className="flex gap-2">
              {step > 0 && (
                <button
                  onClick={() => setStep(s => s - 1)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-white/[0.08] text-white/50 text-[12px] font-semibold hover:bg-white/[0.05] transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Back
                </button>
              )}
              {!isLast ? (
                <button
                  onClick={() => setStep(s => s + 1)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-400 text-black text-[12px] font-bold hover:bg-amber-300 transition-colors"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  onClick={onDismiss}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 text-black text-[12px] font-bold hover:bg-emerald-400 transition-colors"
                >
                  Start Trading <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
