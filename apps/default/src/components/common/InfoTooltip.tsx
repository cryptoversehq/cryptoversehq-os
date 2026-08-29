/**
 * InfoTooltip.tsx
 *
 * Both trading audits flagged the same gap twice: "No general tooltips —
 * new users won't know what '24h Vol', 'Leverage', 'TP/SL', 'Limit vs
 * Market' orders mean" and recommended an "Explain This" system — a small
 * `?` icon that opens a short, plain-English explanation on demand.
 *
 * Works on both desktop (hover) and mobile (tap, with tap-outside-to-close)
 * since the existing ad-hoc tooltips in this codebase (native `title`
 * attributes, or CSS-only `group-hover`) don't work on touch devices at all.
 */
import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  /** Short, plain-English explanation — 1-2 sentences, no jargon. */
  text: string;
  /** Where the popover opens relative to the icon. */
  side?: 'top' | 'bottom';
  className?: string;
}

export function InfoTooltip({ text, side = 'top', className }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  return (
    <span
      ref={ref}
      className={cn('relative inline-flex items-center group', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        aria-label="More information"
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-white/30 hover:text-amber-400 transition-colors"
      >
        <HelpCircle className="w-3 h-3" />
      </button>
      {open && (
        <span
          role="tooltip"
          className={cn(
            'absolute z-50 w-56 px-3 py-2 rounded-lg text-[10px] leading-relaxed font-normal normal-case tracking-normal text-white/80 shadow-xl border border-white/10 pointer-events-none',
            'left-1/2 -translate-x-1/2',
            side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
          )}
          style={{ background: '#1a1d26' }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
