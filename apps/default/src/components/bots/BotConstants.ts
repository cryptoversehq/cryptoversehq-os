/**
 * BotConstants.ts — shared display constants for the Bots feature
 * CV design system tokens, bot-type metadata, status colors.
 */

import type { BotType, BotStatus } from '../../lib/botTypes';

// ─────────────────────────────────────────────────────────────────────────────
// CryptoVerse HQ design tokens
// ─────────────────────────────────────────────────────────────────────────────

export const CV = {
  gold:     '#FFD700',
  green:    '#00C853',
  red:      '#FF3B30',
  orange:   '#FF9500',
  navy:     'var(--bg-card)',
  navyMid:  'var(--bg-secondary)',
  navyHi:   'var(--border-color)',
  white:    '#FFFFFF',
  gray:     'var(--muted-foreground)',
  tooltip:  'var(--bg-card)',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Bot type metadata
// ─────────────────────────────────────────────────────────────────────────────

export interface BotTypeMeta {
  label:        string;
  emoji:        string;
  color:        string;           // primary accent color
  bgAlpha:      string;           // rgba background
  borderAlpha:  string;           // rgba border
  description:  string;
  riskLabel:    string;
}

export const BOT_TYPE_META: Record<BotType, BotTypeMeta> = {
  grid: {
    label:       'Grid Bot',
    emoji:       '📊',
    color:       CV.gold,
    bgAlpha:     'rgba(255,215,0,0.08)',
    borderAlpha: 'rgba(255,215,0,0.22)',
    description: 'Buys low & sells high within a price range using a grid of orders.',
    riskLabel:   'Medium Risk',
  },
  martingale: {
    label:       'Martingale Bot',
    emoji:       '🎯',
    color:       '#818cf8',
    bgAlpha:     'rgba(129,140,248,0.08)',
    borderAlpha: 'rgba(129,140,248,0.22)',
    description: 'Doubles position size after losses to recover faster on reversals.',
    riskLabel:   'High Risk',
  },
  dca: {
    label:       'DCA Bot',
    emoji:       '📈',
    color:       CV.green,
    bgAlpha:     'rgba(0,200,83,0.08)',
    borderAlpha: 'rgba(0,200,83,0.22)',
    description: 'Dollar-cost averages into a position on a regular schedule.',
    riskLabel:   'Low Risk',
  },
  arbitrage: {
    label:       'Arbitrage Bot',
    emoji:       '⚡',
    color:       CV.orange,
    bgAlpha:     'rgba(255,149,0,0.08)',
    borderAlpha: 'rgba(255,149,0,0.22)',
    description: 'Exploits spread between two correlated coin pairs for quick profits.',
    riskLabel:   'Medium Risk',
  },
  rebalancing: {
    label:       'Rebalancing Bot',
    emoji:       '⚖️',
    color:       '#38bdf8',
    bgAlpha:     'rgba(56,189,248,0.08)',
    borderAlpha: 'rgba(56,189,248,0.22)',
    description: 'Keeps your portfolio at target allocations by auto-rebalancing on drift.',
    riskLabel:   'Low Risk',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Status colors
// ─────────────────────────────────────────────────────────────────────────────

export interface StatusMeta {
  label:       string;
  color:       string;
  bg:          string;
  border:      string;
  dot:         string;
}

export const STATUS_META: Record<BotStatus, StatusMeta> = {
  active: {
    label:  'Active',
    color:  CV.green,
    bg:     'rgba(0,200,83,0.10)',
    border: 'rgba(0,200,83,0.25)',
    dot:    CV.green,
  },
  paused: {
    label:  'Paused',
    color:  CV.orange,
    bg:     'rgba(255,149,0,0.10)',
    border: 'rgba(255,149,0,0.25)',
    dot:    CV.orange,
  },
  stopped: {
    label:  'Stopped',
    color:  CV.gray,
    bg:     'rgba(156,163,175,0.10)',
    border: 'rgba(156,163,175,0.20)',
    dot:    CV.gray,
  },
  error: {
    label:  'Error',
    color:  CV.red,
    bg:     'rgba(255,59,48,0.10)',
    border: 'rgba(255,59,48,0.25)',
    dot:    CV.red,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Risk level colors
// ─────────────────────────────────────────────────────────────────────────────

export const RISK_META = {
  low:    { color: CV.green,  bg: 'rgba(0,200,83,0.10)',   border: 'rgba(0,200,83,0.20)',   label: 'Low Risk' },
  medium: { color: CV.orange, bg: 'rgba(255,149,0,0.10)',  border: 'rgba(255,149,0,0.20)',  label: 'Medium Risk' },
  high:   { color: CV.red,    bg: 'rgba(255,59,48,0.10)',  border: 'rgba(255,59,48,0.20)',  label: 'High Risk' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Format helpers
// ─────────────────────────────────────────────────────────────────────────────

export function fmtUsd(n: number, compact = true): string {
  const abs = Math.abs(n);
  if (compact) {
    if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000)     return `$${(abs / 1_000).toFixed(1)}k`;
  }
  return `$${abs.toFixed(2)}`;
}

export function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

export function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtRelative(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)         return 'Just now';
  if (diff < 3_600_000)      return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)     return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}
