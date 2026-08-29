import { useState, useEffect, useRef } from 'react';

interface AnimatedNumberProps {
  value: number;
  format?: string;
  // When true, large values are abbreviated (1.2K / 3.4M / 5.6B / 7.8T)
  // instead of printed in full. Used on narrow mobile cards where a full
  // 13-digit dollar figure ("$2,265,229,952") would overflow the box.
  compact?: boolean;
}

function abbreviate(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  return n.toFixed(0);
}

export function AnimatedNumber({ value, format = '', compact = false }: AnimatedNumberProps) {
  const safeValue = value ?? 0;
  const [display, setDisplay] = useState(safeValue);
  const prevRef = useRef(value);

  useEffect(() => {
    if (safeValue === prevRef.current) { setDisplay(safeValue); return; }
    const start = prevRef.current;
    const duration = 500;
    const t0 = Date.now();
    const animate = () => {
      const elapsed = Date.now() - t0;
      const p = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(start + (safeValue - start) * eased);
      if (p < 1) requestAnimationFrame(animate);
      else prevRef.current = safeValue;
    };
    animate();
  }, [safeValue]);

  let fmt: string;
  if (format === '$') {
    fmt = compact
      ? '$' + abbreviate(display)
      : '$' + display.toLocaleString(undefined, { maximumFractionDigits: 0 });
  } else if (format === '%') {
    fmt = display.toFixed(2) + '%';
  } else if (compact) {
    fmt = abbreviate(display);
  } else {
    fmt = display.toLocaleString();
  }

  return <span>{fmt}</span>;
}
