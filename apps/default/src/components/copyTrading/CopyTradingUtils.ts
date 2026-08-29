/**
 * CopyTradingUtils.ts
 * Shared constants, formatters, and color tokens for the Copy Trading feature.
 */
import { TopTrader, CopyRelationship } from '../../lib/copyTradingTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens (mirrors CV from MarketplaceUtils but copy-trading themed)
// ─────────────────────────────────────────────────────────────────────────────

export const CTV = {
  gold:         'hsl(var(--primary))',
  goldAlpha:    'hsl(var(--primary) / 0.10)',
  goldBorder:   'hsl(var(--primary) / 0.18)',
  navy:         'var(--bg-card)',
  surface:      'var(--bg-secondary)',
  surfaceMid:   'var(--border-color)',
  border:       'var(--border-color)',
  gray:         'hsl(var(--muted-foreground))',
  green:        'hsl(142 76% 45%)',
  greenAlpha:   'hsl(142 76% 45% / 0.12)',
  greenBorder:  'hsl(142 76% 45% / 0.22)',
  red:          'hsl(0 72% 60%)',
  redAlpha:     'hsl(0 72% 60% / 0.12)',
  redBorder:    'hsl(0 72% 60% / 0.22)',
  blue:         'hsl(217 91% 60%)',
  blueAlpha:    'hsl(217 91% 60% / 0.12)',
  orange:       'hsl(25 95% 53%)',
};

// ─────────────────────────────────────────────────────────────────────────────
// Minimum Academy level to start copying
// ─────────────────────────────────────────────────────────────────────────────

export const MIN_COPY_LEVEL = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────────────

export function fmtUsd(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : v > 0 ? '+' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

export function fmtPct(v: number, forceSign = true): string {
  const sign = forceSign ? (v > 0 ? '+' : '') : '';
  return `${sign}${v.toFixed(1)}%`;
}

export function fmtCP(v: number): string {
  return `${v.toLocaleString()} CP`;
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Trader badge helpers
// ─────────────────────────────────────────────────────────────────────────────

export function badgeEmoji(t: TopTrader): string {
  if (t.rank === 1) return '👑';
  if (t.rank === 2) return '🥈';
  if (t.rank === 3) return '🥉';
  return '📈';
}

export function badgeLabel(t: TopTrader): string {
  if (t.rank === 1) return '#1 Top Trader';
  if (t.rank === 2) return '#2 Elite';
  if (t.rank === 3) return '#3 Expert';
  return `#${t.rank}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Star array for rating display
// ─────────────────────────────────────────────────────────────────────────────

export function starsArr(rating: number): Array<'full' | 'half' | 'empty'> {
  return [1, 2, 3, 4, 5].map(i => {
    if (rating >= i) return 'full';
    if (rating >= i - 0.5) return 'half';
    return 'empty';
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Relationship helpers
// ─────────────────────────────────────────────────────────────────────────────

export function relWinRate(rel: CopyRelationship): number {
  const total = rel.winCopied + rel.lossCopied;
  return total === 0 ? 0 : +((rel.winCopied / total) * 100).toFixed(1);
}

export function lastFiveTrades(rel: CopyRelationship): Array<'win' | 'loss' | 'open'> {
  const out: Array<'win' | 'loss' | 'open'> = [];
  const win  = rel.winCopied;
  const loss = rel.lossCopied;
  for (let i = 0; i < 5; i++) {
    if (i < Math.min(5, win)) out.push('win');
    else if (i < Math.min(5, win + loss)) out.push('loss');
    else out.push('open');
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Follower growth seed data (for chart)
// ─────────────────────────────────────────────────────────────────────────────

export function generateFollowerGrowth(total: number): Array<{ date: string; followers: number }> {
  const pts = 30;
  const arr: Array<{ date: string; followers: number }> = [];
  let cur = Math.max(10, total - pts * Math.floor(total / pts));
  for (let i = pts; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    arr.push({ date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), followers: cur });
    cur = Math.min(total, cur + Math.floor(Math.random() * Math.floor(total / pts) * 1.5));
  }
  return arr;
}
