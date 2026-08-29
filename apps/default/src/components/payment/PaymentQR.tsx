/**
 * PaymentQR.tsx
 *
 * QR code renderer + payment countdown timer for the crypto payment page.
 * Uses the self-contained encoder in lib/qrcode.ts — no external dependencies.
 *
 *   <PaymentQR value="TRkAYk…" size={220} />
 *   <PaymentCountdown expiresAt={isoString} onExpire={…} />
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Clock } from 'lucide-react';
import { encodeQR } from '@/lib/qrcode';
import { cn } from '@/lib/utils';

// ─── QR Code ──────────────────────────────────────────────────────────────────

interface PaymentQRProps {
  /** String to encode — typically the wallet address */
  value:      string;
  /** Rendered width/height in px (default 220) */
  size?:      number;
  className?: string;
}

export function PaymentQR({ value, size = 220, className }: PaymentQRProps) {
  const qr = useMemo(() => {
    try {
      return encodeQR(value);
    } catch {
      return null;
    }
  }, [value]);

  if (!qr) return null;

  const quiet = 4; // quiet-zone modules on each side (QR spec minimum)
  const view  = qr.size + quiet * 2;

  // Merge consecutive dark modules per row into single rects (fewer DOM nodes)
  const rects: React.ReactNode[] = [];
  for (let r = 0; r < qr.size; r++) {
    let runStart = -1;
    for (let c = 0; c <= qr.size; c++) {
      const dark = c < qr.size && qr.matrix[r * qr.size + c];
      if (dark && runStart === -1) runStart = c;
      if (!dark && runStart !== -1) {
        rects.push(
          <rect key={`${r}-${runStart}`} x={runStart + quiet} y={r + quiet} width={c - runStart} height={1} />,
        );
        runStart = -1;
      }
    }
  }

  return (
    <div
      className={cn('rounded-2xl bg-white p-3 shadow-lg inline-block', className)}
      style={{ width: size, height: size }}
      aria-label={`QR code for ${value}`}
      role="img"
    >
      <svg
        viewBox={`0 0 ${view} ${view}`}
        width="100%"
        height="100%"
        shapeRendering="crispEdges"
        fill="#0a0a0f"
      >
        {rects}
      </svg>
    </div>
  );
}

// ─── Countdown Timer ──────────────────────────────────────────────────────────

interface PaymentCountdownProps {
  /** ISO timestamp when the payment window closes */
  expiresAt:  string;
  /** Fired once when the countdown reaches zero */
  onExpire?:  () => void;
  className?: string;
}

export function PaymentCountdown({ expiresAt, onExpire, className }: PaymentCountdownProps) {
  const total = useMemo(
    () => Math.max(0, new Date(expiresAt).getTime() - Date.now()),
    [expiresAt],
  );
  const [msLeft, setMsLeft] = useState(total);

  useEffect(() => {
    setMsLeft(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    const id = setInterval(() => {
      const left = Math.max(0, new Date(expiresAt).getTime() - Date.now());
      setMsLeft(left);
      if (left <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  // Fire onExpire exactly once
  const expiredRef = React.useRef(false);
  useEffect(() => {
    if (msLeft <= 0 && !expiredRef.current) {
      expiredRef.current = true;
      onExpire?.();
    }
  }, [msLeft, onExpire]);

  const mins = Math.floor(msLeft / 60000);
  const secs = Math.floor((msLeft % 60000) / 1000);
  const pct  = total > 0 ? (msLeft / total) * 100 : 0;
  const isLow     = msLeft > 0 && msLeft < 3 * 60000;
  const isExpired = msLeft <= 0;

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] text-white/40">
          <Clock className={cn('h-3.5 w-3.5', isExpired ? 'text-red-400' : isLow ? 'text-amber-400' : 'text-white/40')} />
          {isExpired ? 'Payment window expired' : 'Time remaining to pay'}
        </span>
        <span
          className={cn(
            'font-mono text-sm font-black tabular-nums',
            isExpired ? 'text-red-400' : isLow ? 'text-amber-400' : 'text-emerald-400',
          )}
        >
          {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-1000 ease-linear',
            isExpired ? 'bg-red-500' : isLow ? 'bg-amber-400' : 'bg-emerald-400',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
