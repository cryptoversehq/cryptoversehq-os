/**
 * StarRating.tsx — reusable star display + interactive rating picker
 */
import React from 'react';
import { Star } from 'lucide-react';
import { starsArray, CV } from './MarketplaceUtils';

// Display-only stars
export function Stars({ rating, size = 14, count }: { rating: number; size?: number; count?: number }) {
  const stars = starsArray(rating);
  return (
    <span className="inline-flex items-center gap-0.5">
      {stars.map((s, i) => (
        <Star
          key={i}
          size={size}
          fill={s === 'full' ? CV.gold : s === 'half' ? 'url(#half)' : 'transparent'}
          stroke={s === 'empty' ? 'rgba(255,215,0,0.30)' : CV.gold}
        />
      ))}
      {count != null && (
        <span className="ml-1 text-xs" style={{ color: CV.gray }}>({count.toLocaleString()})</span>
      )}
    </span>
  );
}

// Interactive rating picker — touch & mouse friendly
export function StarPicker({
  value,
  onChange,
  size = 24,
}: {
  value: number;
  onChange: (v: number) => void;
  size?: number;
}) {
  const [hover, setHover] = React.useState(0);
  const display = hover || value;
  // Touch-swipe: track touch start position then compute star from delta
  const containerRef = React.useRef<HTMLSpanElement>(null);
  const touchStart = React.useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x    = e.touches[0].clientX - rect.left;
    const star = Math.max(1, Math.min(5, Math.ceil((x / rect.width) * 5)));
    setHover(star);
  };

  const handleTouchEnd = () => {
    if (hover) onChange(hover);
    setHover(0);
  };

  return (
    <span
      ref={containerRef}
      className="inline-flex items-center gap-1 touch-none"
      onMouseLeave={() => setHover(0)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          type="button"
          onMouseEnter={() => setHover(i)}
          onClick={() => onChange(i)}
          className="transition-transform hover:scale-110 active:scale-125"
          style={{ minWidth: size + 8, minHeight: size + 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          aria-label={`${i} star${i > 1 ? 's' : ''}`}
        >
          <Star
            size={size}
            fill={i <= display ? CV.gold : 'transparent'}
            stroke={i <= display ? CV.gold : 'rgba(255,215,0,0.30)'}
          />
        </button>
      ))}
    </span>
  );
}

// Compact mobile star picker (larger tap targets, horizontal scroll safe)
export function MobileStarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-2 py-2">
      <StarPicker value={value} onChange={onChange} size={36} />
      <span className="text-sm font-bold" style={{ color: value ? '#FFD700' : 'rgba(255,255,255,0.3)' }}>
        {value > 0 ? ['', '😞', '😐', '😊', '😍', '🤩'][value] : '—'}
      </span>
    </div>
  );
}
