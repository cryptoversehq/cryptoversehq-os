/**
 * PositionSizeCalculator.tsx
 *
 * Implements the "risk 1-2% per trade" rule from the report's New Ideas
 * list: instead of a user guessing an Amount and only discovering the
 * real dollar risk after the fact, they pick how much of their portfolio
 * they're willing to lose if their Stop Loss is hit, and this works
 * backwards to the position size that produces exactly that risk.
 *
 * Math: if a position of `qty` coins (post-leverage exposure) is stopped
 * out at `stopLoss`, the dollar loss is qty × |entryPrice − stopLoss|.
 * Solving for the margin amount (what the Amount field actually holds,
 * per this app's convention — see ProTradePanel) that produces a target
 * riskAmount:
 *
 *   margin = riskAmount / (leverage × stopDistancePct)
 *   qty    = margin / entryPrice
 *
 * The result is also clamped to the existing 25%-of-portfolio guardrail
 * (priority #2) so "Apply" can never hand the user a size their own
 * safety rail would immediately reject.
 */
import React, { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Target } from 'lucide-react';
import { InfoTooltip } from '@/components/common/InfoTooltip';

const MAX_POSITION_PCT_OF_BALANCE = 0.25;
const RISK_PRESETS = [0.5, 1, 2] as const;

interface Props {
  balance: number;
  entryPrice: number;
  leverage: number;
  /** Current Stop Loss field value (string, may be empty/invalid). */
  stopLoss: string;
  onApply: (qtyStr: string) => void;
}

export function PositionSizeCalculator({ balance, entryPrice, leverage, stopLoss, onApply }: Props) {
  const [riskPct, setRiskPct] = useState<number>(1);
  const [open, setOpen] = useState(false);

  const slNum = parseFloat(stopLoss);
  const hasValidStop = !isNaN(slNum) && slNum > 0 && entryPrice > 0 && slNum !== entryPrice;

  const calc = useMemo(() => {
    if (!hasValidStop) return null;
    const stopDistancePct = Math.abs(entryPrice - slNum) / entryPrice;
    if (stopDistancePct <= 0) return null;

    const riskAmount = balance * (riskPct / 100);
    let margin = riskAmount / (leverage * stopDistancePct);
    const maxMargin = balance * MAX_POSITION_PCT_OF_BALANCE;
    const wasClamped = margin > maxMargin;
    margin = Math.min(margin, maxMargin);

    const qty = margin / entryPrice;
    return { riskAmount, margin, qty, stopDistancePct, wasClamped };
  }, [hasValidStop, entryPrice, slNum, balance, riskPct, leverage]);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-white/50 hover:text-white/75 transition-colors"
      >
        <Target className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
        <span className="flex-1 text-left font-semibold">Position Size Calculator</span>
        <InfoTooltip text="Picks a trade size so that if your Stop Loss is hit, you lose exactly the % of your portfolio you choose — the standard 'risk 1-2% per trade' rule professional traders use." />
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-white/35 mr-1">Risk:</span>
            {RISK_PRESETS.map(p => (
              <button
                key={p}
                onClick={() => setRiskPct(p)}
                className={cn('px-2 py-1 rounded-lg text-[10px] font-semibold border transition-colors',
                  riskPct === p
                    ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-400'
                    : 'border-white/[0.06] bg-white/[0.03] text-white/40 hover:text-white/70')}
              >
                {p}%
              </button>
            ))}
            <div className="flex items-center flex-1 bg-white/[0.03] border border-white/[0.06] rounded-lg px-2 py-1 ml-1">
              <input
                type="number" min={0.1} max={10} step={0.1}
                value={riskPct}
                onChange={e => setRiskPct(Math.max(0.1, Math.min(10, parseFloat(e.target.value) || 0)))}
                className="w-full bg-transparent text-[10px] font-mono text-white/70 outline-none"
              />
              <span className="text-[9px] text-white/25 ml-1">% custom</span>
            </div>
          </div>

          {!hasValidStop ? (
            <p className="text-[10px] text-white/25 leading-relaxed">
              Set a Stop Loss above, then this works out the trade size that keeps your loss at exactly {riskPct}% of your balance if it's hit.
            </p>
          ) : calc && (
            <div className="bg-white/[0.03] rounded-lg p-2.5 space-y-1.5">
              <div className="flex justify-between text-[10px]">
                <span className="text-white/35">Stop distance</span>
                <span className="font-mono text-white/60">{(calc.stopDistancePct * 100).toFixed(2)}%</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-white/35">Max loss if stopped out</span>
                <span className="font-mono text-red-400">-{calc.riskAmount.toFixed(2)} USDT</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-white/35">Suggested size</span>
                <span className="font-mono text-cyan-400 font-semibold">{calc.qty.toFixed(6)}</span>
              </div>
              {calc.wasClamped && (
                <p className="text-[9px] text-amber-400/70 leading-relaxed">
                  Capped at the 25%-of-portfolio limit — your stop is close enough that the full {riskPct}% risk would need a bigger position than the guardrail allows.
                </p>
              )}
              <button
                onClick={() => onApply(calc.qty.toFixed(6))}
                className="w-full mt-1 py-1.5 rounded-lg bg-cyan-400/10 hover:bg-cyan-400/20 border border-cyan-400/25 text-cyan-400 text-[10px] font-semibold transition-colors"
              >
                Apply to Amount
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
