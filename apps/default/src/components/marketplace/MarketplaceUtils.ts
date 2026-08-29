/**
 * MarketplaceUtils.ts — shared helpers for the Strategy Marketplace UI
 */

import type { RiskLevel, StrategyType } from '../../lib/strategyTypes';

// ── Level helpers ─────────────────────────────────────────────────────────────

export function getLevelFromXP(xp: number): number {
  if (xp < 500)  return 1;
  if (xp < 1250) return 2;
  if (xp < 2250) return 3;
  if (xp < 4000) return 4;
  return 5;
}

// ── Formatting ────────────────────────────────────────────────────────────────

export function fmtCP(n: number): string {
  if (n === 0) return 'FREE';
  return `${n.toLocaleString()} CP`;
}

export function fmtPct(n: number, sign = true): string {
  const s = sign && n > 0 ? '+' : '';
  return `${s}${n.toFixed(1)}%`;
}

export function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 60)    return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)    return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30)    return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

// ── Risk ──────────────────────────────────────────────────────────────────────

export const RISK_META: Record<RiskLevel, { label: string; color: string; bg: string }> = {
  'low':       { label: 'Low Risk',   color: '#34d399', bg: 'rgba(52,211,153,0.12)' },
  'medium':    { label: 'Med Risk',   color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
  'high':      { label: 'High Risk',  color: '#f97316', bg: 'rgba(249,115,22,0.12)' },
  'very-high': { label: 'Very High',  color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
};

// ── Strategy type ─────────────────────────────────────────────────────────────

export const TYPE_META: Record<StrategyType, { label: string; emoji: string; color: string }> = {
  grid:       { label: 'Grid',       emoji: '📊', color: '#818cf8' },
  dca:        { label: 'DCA',        emoji: '📈', color: '#34d399' },
  martingale: { label: 'Martingale', emoji: '🎯', color: '#f97316' },
  arbitrage:  { label: 'Arbitrage',  emoji: '⚡', color: '#fbbf24' },
  custom:     { label: 'Custom',     emoji: '🔧', color: '#a78bfa' },
};

// ── Category helpers (for marketplace home) ───────────────────────────────────

export const CATEGORIES = [
  { id: 'grid',       label: 'Grid Trading',  emoji: '📊', count: 201 },
  { id: 'dca',        label: 'DCA / Passive', emoji: '📈', count: 189 },
  { id: 'martingale', label: 'Martingale',    emoji: '🎯', count: 156 },
  { id: 'arbitrage',  label: 'Arbitrage',     emoji: '⚡', count: 234 },
  { id: 'custom',     label: 'AI / Custom',   emoji: '🔧', count: 67 },
] as const;

// ── Stars renderer helper ─────────────────────────────────────────────────────

export function starsArray(rating: number): ('full' | 'half' | 'empty')[] {
  return [1, 2, 3, 4, 5].map(i => {
    if (rating >= i)          return 'full';
    if (rating >= i - 0.5)    return 'half';
    return 'empty';
  });
}

// ── Gold design constants ─────────────────────────────────────────────────────

export const CV = {
  gold:        '#FFD700',
  goldMuted:   '#B8960C',
  goldAlpha:   'rgba(255,215,0,0.10)',
  goldBorder:  'rgba(255,215,0,0.18)',
  goldGlow:    '0 0 20px rgba(255,215,0,0.15)',
  navy:        'var(--bg-card)',
  navyLight:   'var(--bg-card)',
  surface:     'var(--bg-secondary)',
  border:      'var(--border-color)',
  gray:        'hsl(var(--muted-foreground))',
  green:       '#34d399',
  red:         '#ef4444',
};
