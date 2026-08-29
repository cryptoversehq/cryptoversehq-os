/**
 * UpgradePaymentModal.tsx
 *
 * ⚠️  LEGACY FILE — manual TX-hash payment system has been completely removed.
 *
 * This file now only exports the plan configuration constants and types
 * used across the app (Profile.tsx, SubscriptionPage.tsx).
 *
 * All payments go through NOWPaymentsButton → NOWPayments crypto checkout.
 * No wallet addresses, no TX hashes, no TRC20 manual flows exist here.
 */
import React from 'react';
import { Star, BadgeCheck, Crown } from 'lucide-react';
import { PLAN_PRICE_USDT } from '@/lib/subscriptionStore';

// ── Types ─────────────────────────────────────────────────────────────────────
export type PlanId = 'bronze' | 'silver' | 'gold';

export interface PlanConfig {
  id: PlanId;
  label: string;
  icon: React.ElementType;
  color: string;
  price: string;
  priceUSD: number;
  perks: string[];
}

// ── Plan Configurations (single source of truth) ──────────────────────────────
export const PLAN_CONFIGS: PlanConfig[] = [
  {
    id:       'bronze',
    label:    'Bronze',
    icon:     Star,
    color:    '#cd7f32',
    price:    'Free',
    priceUSD: 0,
    perks:    ['Up to 10x leverage', 'Basic charts', 'Community access'],
  },
  {
    id:       'silver',
    label:    'Silver',
    icon:     BadgeCheck,
    color:    '#94a3b8',
    price:    '$10/mo',
    priceUSD: PLAN_PRICE_USDT['silver'] ?? 10,
    perks:    ['Up to 50x leverage', 'Advanced charts', 'Priority support', 'AI hints'],
  },
  {
    id:       'gold',
    label:    'Gold',
    icon:     Crown,
    color:    '#f59e0b',
    price:    '$20/mo',
    priceUSD: PLAN_PRICE_USDT['gold'] ?? 20,
    perks:    ['Up to 100x leverage', 'Twin League access', 'Exclusive badges', 'Early features'],
  },
];

// ── Stubs — prevent build errors if old imports remain ────────────────────────

/** @deprecated Manual wallet payments removed. Use NOWPaymentsButton instead. */
export function WalletAddressBlock(_props: {
  accentColor?: string;
  requiredAmount?: number;
  currency?: string;
}) {
  return null;
}

/** @deprecated Manual TX-hash payment removed. Use NOWPaymentsButton instead. */
export function UpgradePaymentModal(_props: {
  plan: PlanConfig;
  currentPlan: PlanId;
  onClose: () => void;
  onConfirmed: (planId: PlanId) => void;
}) {
  return null;
}
