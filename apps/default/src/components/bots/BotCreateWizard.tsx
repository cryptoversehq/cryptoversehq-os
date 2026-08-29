/**
 * BotCreateWizard.tsx — 3-step modal wizard to create a new bot.
 *
 * Step 1: Template Gallery — pick one of the 5 bot types
 * Step 2: Configure      — edit all parameters for the chosen type
 * Step 3: Confirm        — review summary then submit
 */

import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, ChevronRight, ChevronLeft, Check, Info,
  AlertTriangle, Loader2, FlaskConical,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/utils';
import type { BotTemplate, BotConfig, UserBot } from '../../lib/botTypes';
import { BOT_INTERVAL_OPTIONS } from '../../lib/botTypes';
import { useBotTemplateStore } from '../../lib/botTemplateStore';
import { useBotStore } from '../../lib/botStore';
import { useAuthStore } from '../../lib/authStore';
import { useTradingStore } from '../../lib/tradingStore';
import {
  CV, BOT_TYPE_META, RISK_META, fmtUsd,
} from './BotConstants';
import { botToBacktestConfig } from '../../lib/botBacktestBridge';
import { useBotBacktestContext } from '../../lib/botBacktestContext';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

import type { BotType } from '../../lib/botTypes';

interface Props {
  open:          boolean;
  onClose:       () => void;
  onCreate?:     (bot: UserBot) => void;
  /** Pre-select a specific bot type (skips to step 2 after selecting template) */
  initialType?:  BotType;
}

type WizardStep = 1 | 2 | 3;

// ─────────────────────────────────────────────────────────────────────────────
// FIELD COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold" style={{ color: CV.gray }}>
        {label}
        {hint && (
          <span className="ml-1.5 font-normal" style={{ color: 'rgba(156,163,175,0.65)' }}>
            ({hint})
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

function NumberInput({
  value, onChange, min, max, step = 1, prefix, suffix,
}: {
  value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number;
  prefix?: string; suffix?: string;
}) {
  return (
    <div
      className="flex items-center rounded-xl overflow-hidden border"
      style={{ borderColor: 'rgba(255,215,0,0.15)', background: 'var(--bg-secondary)' }}
    >
      {prefix && (
        <span className="px-2.5 py-2 text-xs font-mono border-r" style={{ color: CV.gold, borderColor: 'rgba(255,215,0,0.12)' }}>
          {prefix}
        </span>
      )}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 bg-transparent px-2.5 py-2 text-sm font-mono text-foreground outline-none"
      />
      {suffix && (
        <span className="px-2.5 py-2 text-xs border-l" style={{ color: CV.gray, borderColor: 'rgba(255,215,0,0.12)' }}>
          {suffix}
        </span>
      )}
    </div>
  );
}

function SelectInput({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ label: string; value: string }>;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full px-3 py-2 rounded-xl text-sm text-foreground outline-none appearance-none"
      style={{ background: 'var(--bg-secondary)', border: '1px solid rgba(255,215,0,0.15)' }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value} style={{ background: 'var(--bg-card)' }}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — Template Gallery
// ─────────────────────────────────────────────────────────────────────────────

function StepTemplate({
  templates,
  selected,
  onSelect,
}: {
  templates: BotTemplate[];
  selected: BotTemplate | null;
  onSelect: (t: BotTemplate) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs" style={{ color: CV.gray }}>
        Choose a strategy template. You can customise all parameters in the next step.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {templates.map(tpl => {
          const meta    = BOT_TYPE_META[tpl.type];
          const risk    = RISK_META[tpl.riskLevel];
          const isChosen = selected?.id === tpl.id;
          return (
            <button
              key={tpl.id}
              onClick={() => onSelect(tpl)}
              className="flex flex-col gap-2 p-3.5 rounded-xl border text-left transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
              style={{
                background:   isChosen ? meta.bgAlpha : 'var(--bg-secondary)',
                borderColor:  isChosen ? meta.color   : 'var(--border-color)',
                boxShadow:    isChosen ? `0 0 0 1px ${meta.color}` : 'none',
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{meta.emoji}</span>
                  <span className="text-sm font-bold text-foreground">{tpl.name}</span>
                </div>
                {isChosen && <Check className="h-4 w-4" style={{ color: meta.color }} />}
              </div>
              <p className="text-[11px] leading-relaxed" style={{ color: CV.gray }}>
                {tpl.shortDescription}
              </p>
              <div className="flex items-center justify-between">
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{ color: risk.color, background: risk.bg, border: `1px solid ${risk.border}` }}
                >
                  {risk.label}
                </span>
                <span className="text-[10px] font-bold" style={{ color: CV.green }}>
                  +{tpl.estimatedMonthlyReturnPct.toFixed(1)}%/mo est.
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — Configure (per bot type)
// ─────────────────────────────────────────────────────────────────────────────

function StepConfigure({
  template,
  name,
  onNameChange,
  config,
  onConfigChange,
}: {
  template:       BotTemplate;
  name:           string;
  onNameChange:   (v: string) => void;
  config:         BotConfig;
  onConfigChange: (c: BotConfig) => void;
}) {
  const meta = BOT_TYPE_META[template.type];

  function patchConfig(patch: Partial<BotConfig>) {
    onConfigChange({ ...config, ...patch } as BotConfig);
  }

  const COIN_OPTIONS = [
    { label: 'Bitcoin (BTC)',   value: 'bitcoin'  },
    { label: 'Ethereum (ETH)',  value: 'ethereum' },
    { label: 'Solana (SOL)',    value: 'solana'   },
    { label: 'BNB',             value: 'binancecoin' },
    { label: 'XRP',             value: 'ripple'   },
  ];

  const COIN_SYMBOL: Record<string, string> = {
    bitcoin: 'BTC', ethereum: 'ETH', solana: 'SOL', binancecoin: 'BNB', ripple: 'XRP',
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Bot name */}
      <Field label="Bot Name" hint="Max 60 characters">
        <input
          type="text"
          value={name}
          onChange={e => onNameChange(e.target.value)}
          placeholder={`My ${meta.label}`}
          maxLength={60}
          className="w-full px-3 py-2 rounded-xl text-sm text-foreground placeholder:text-muted-foreground outline-none"
          style={{ background: 'var(--bg-secondary)', border: '1px solid rgba(255,215,0,0.15)' }}
        />
      </Field>

      {/* ── Grid Bot fields ── */}
      {config.type === 'grid' && (
        <>
          <Field label="Coin">
            <SelectInput
              value={config.coinId}
              onChange={v => patchConfig({ coinId: v, coinSymbol: COIN_SYMBOL[v] ?? v.toUpperCase() } as any)}
              options={COIN_OPTIONS}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Lower Price" hint="USD">
              <NumberInput value={config.lowerPrice} onChange={v => patchConfig({ lowerPrice: v } as any)} min={0} step={100} prefix="$" />
            </Field>
            <Field label="Upper Price" hint="USD">
              <NumberInput value={config.upperPrice} onChange={v => patchConfig({ upperPrice: v } as any)} min={0} step={100} prefix="$" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Grid Levels" hint="2–100">
              <NumberInput value={config.gridCount} onChange={v => patchConfig({ gridCount: v } as any)} min={2} max={100} />
            </Field>
            <Field label="Total Investment" hint="USD">
              <NumberInput value={config.totalInvestment} onChange={v => patchConfig({ totalInvestment: v } as any)} min={50} step={50} prefix="$" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Stop Loss" hint="0 = disabled">
              <NumberInput value={config.stopLossPrice} onChange={v => patchConfig({ stopLossPrice: v } as any)} min={0} step={100} prefix="$" />
            </Field>
            <Field label="Take Profit Price" hint="0 = disabled">
              <NumberInput value={config.takeProfitPrice} onChange={v => patchConfig({ takeProfitPrice: v } as any)} min={0} step={100} prefix="$" />
            </Field>
          </div>
        </>
      )}

      {/* ── Martingale Bot fields (spec-exact) ── */}
      {config.type === 'martingale' && (
        <>
          {/* Risk callout */}
          <div
            className="flex items-start gap-2 p-3 rounded-xl text-xs"
            style={{ background: 'rgba(255,59,48,0.07)', color: '#FF6B6B', border: '1px solid rgba(255,59,48,0.18)' }}
          >
            <span className="text-base leading-none shrink-0">⚠️</span>
            <span>
              <strong>High Risk Strategy.</strong> After each losing trade the position size is multiplied by the multiplier.
              If {config.maxConsecutiveLosses} consecutive losses occur, the bot stops automatically.
              Max exposure: <strong>${Math.round(config.baseAmount * Math.pow(config.multiplier, config.maxConsecutiveLosses - 1) * 100) / 100}</strong>.
            </span>
          </div>

          <Field label="Coin">
            <SelectInput
              value={config.coinId}
              onChange={v => patchConfig({ coinId: v, coinSymbol: COIN_SYMBOL[v] ?? v.toUpperCase(), baseOrderSize: config.baseAmount, safetyOrderSize: config.baseAmount } as any)}
              options={COIN_OPTIONS}
            />
          </Field>

          {/* Row 1: Base Amount + Multiplier */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Base Amount" hint="$10–$1,000">
              <NumberInput
                value={config.baseAmount}
                onChange={v => patchConfig({ baseAmount: v, baseOrderSize: v, safetyOrderSize: v } as any)}
                min={10} max={1000} step={10} prefix="$"
              />
            </Field>
            <Field label="Multiplier" hint="1.5×–3.0×">
              <NumberInput
                value={config.multiplier}
                onChange={v => patchConfig({ multiplier: v, volumeMultiplier: v } as any)}
                min={1.5} max={3.0} step={0.1} suffix="×"
              />
            </Field>
          </div>

          {/* Row 2: Max Consecutive Losses + Take Profit % */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Max Consecutive Losses" hint="3–10">
              <NumberInput
                value={config.maxConsecutiveLosses}
                onChange={v => patchConfig({ maxConsecutiveLosses: v, maxSafetyOrders: v } as any)}
                min={3} max={10} step={1}
              />
            </Field>
            <Field label="Take Profit %" hint="1%–5% per cycle">
              <NumberInput
                value={config.takeProfitPct}
                onChange={v => patchConfig({ takeProfitPct: v } as any)}
                min={1} max={5} step={0.5} suffix="%"
              />
            </Field>
          </div>

          {/* Direction: long / short / both */}
          <Field label="Trade Direction">
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: 'long',  label: '📈 Long',  desc: 'Always buy',    color: CV.green,  bg: 'rgba(0,200,83,0.12)',  border: 'rgba(0,200,83,0.30)'  },
                { value: 'short', label: '📉 Short', desc: 'Always sell',   color: CV.red,    bg: 'rgba(255,59,48,0.12)', border: 'rgba(255,59,48,0.30)' },
                { value: 'both',  label: '🔄 Both',  desc: 'Alternating',   color: CV.gold,   bg: 'rgba(255,215,0,0.10)', border: 'rgba(255,215,0,0.28)' },
              ] as const).map(opt => {
                const isActive = config.direction === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => patchConfig({ direction: opt.value, side: opt.value === 'short' ? 'short' : 'long' } as any)}
                    className="flex flex-col items-center gap-0.5 py-2.5 rounded-xl text-xs font-bold transition-all"
                    style={isActive ? {
                      background: opt.bg,
                      color:      opt.color,
                      border:     `1px solid ${opt.border}`,
                      boxShadow:  `0 0 0 1px ${opt.color}30`,
                    } : {
                      background: 'rgba(255,255,255,0.03)',
                      color:      CV.gray,
                      border:     '1px solid rgba(255,255,255,0.07)',
                    }}
                  >
                    <span className="text-base">{opt.label.split(' ')[0]}</span>
                    <span>{opt.label.split(' ')[1]}</span>
                    <span className="text-[9px] font-normal opacity-70">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          </Field>

          {/* Live exposure preview */}
          <div
            className="p-3 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <p className="text-[10px] font-semibold mb-2" style={{ color: CV.gray }}>
              Maximum exposure per consecutive-loss sequence:
            </p>
            <div className="grid grid-cols-5 gap-1">
              {Array.from({ length: config.maxConsecutiveLosses }, (_, i) => {
                const size = Math.round(config.baseAmount * Math.pow(config.multiplier, i) * 100) / 100;
                return (
                  <div
                    key={i}
                    className="flex flex-col items-center py-1.5 rounded-lg"
                    style={{ background: `rgba(255,${Math.max(59, 215 - i * 32)},${Math.max(48, 0)},0.${i === 0 ? '06' : '10'})` }}
                  >
                    <span className="text-[9px]" style={{ color: CV.gray }}>#{i + 1}</span>
                    <span className="text-[10px] font-bold" style={{ color: i === 0 ? CV.gold : i < 3 ? CV.orange : CV.red }}>
                      ${size >= 1000 ? `${(size / 1000).toFixed(1)}k` : size.toFixed(0)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ── DCA Bot fields (spec-exact) ── */}
      {config.type === 'dca' && (
        <>
          {/* How it works banner */}
          <div
            className="flex items-start gap-2 p-3 rounded-xl text-xs"
            style={{ background: 'rgba(0,200,83,0.06)', color: '#4ade80', border: '1px solid rgba(0,200,83,0.15)' }}
          >
            <span className="text-base leading-none shrink-0">📈</span>
            <span>
              Places order #1 immediately at market price, then adds orders as price
              drops {config.priceDropPct}% below each entry. Exits at {config.takeProfitPct}% profit above average entry
              {config.partialExit ? ' (50% first, hold rest)' : ' (full exit, bot stops)'}.
            </span>
          </div>

          <Field label="Coin">
            <SelectInput
              value={config.coinId}
              onChange={v => patchConfig({ coinId: v, coinSymbol: COIN_SYMBOL[v] ?? v.toUpperCase(), orderSize: config.initialInvestment } as any)}
              options={COIN_OPTIONS}
            />
          </Field>

          {/* Row 1: Initial Investment + Number of Orders */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Initial Investment" hint="$100–$10,000">
              <NumberInput
                value={config.initialInvestment}
                onChange={v => patchConfig({ initialInvestment: v, orderSize: v, maxTotalInvestment: 0 } as any)}
                min={100} max={10_000} step={100} prefix="$"
              />
            </Field>
            <Field label="Number of Orders" hint="2–20">
              <NumberInput
                value={config.numberOfOrders}
                onChange={v => patchConfig({ numberOfOrders: v } as any)}
                min={2} max={20} step={1}
              />
            </Field>
          </div>

          {/* Row 2: Price Drop % + Take Profit % */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price Drop Between Orders" hint="1%–10%">
              <NumberInput
                value={config.priceDropPct}
                onChange={v => patchConfig({ priceDropPct: v, dipThresholdPct: v } as any)}
                min={1} max={10} step={0.5} suffix="%"
              />
            </Field>
            <Field label="Take Profit %" hint="2%–20%">
              <NumberInput
                value={config.takeProfitPct}
                onChange={v => patchConfig({ takeProfitPct: v } as any)}
                min={2} max={20} step={0.5} suffix="%"
              />
            </Field>
          </div>

          {/* Partial Exit toggle */}
          <Field label="Exit Strategy">
            <div className="grid grid-cols-2 gap-2">
              {[
                { val: true,  label: '50% Exit',  icon: '🔀', desc: 'Sell half, hold rest', color: CV.gold },
                { val: false, label: 'Full Exit',  icon: '✅', desc: 'Sell all, stop bot',  color: CV.green },
              ].map(opt => {
                const isActive = config.partialExit === opt.val;
                return (
                  <button
                    key={String(opt.val)}
                    onClick={() => patchConfig({ partialExit: opt.val } as any)}
                    className="flex flex-col items-center gap-0.5 py-3 rounded-xl text-xs font-bold transition-all"
                    style={isActive ? {
                      background: `${opt.color}12`,
                      color:       opt.color,
                      border:      `1px solid ${opt.color}35`,
                      boxShadow:   `0 0 0 1px ${opt.color}25`,
                    } : {
                      background: 'rgba(255,255,255,0.03)',
                      color:       CV.gray,
                      border:      '1px solid rgba(255,255,255,0.07)',
                    }}
                  >
                    <span className="text-lg">{opt.icon}</span>
                    <span>{opt.label}</span>
                    <span className="text-[9px] font-normal opacity-70">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          </Field>

          {/* Order ladder preview */}
          <div
            className="p-3 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <p className="text-[10px] font-semibold mb-2" style={{ color: CV.gray }}>
              Buy order ladder (simulated at $100,000 entry):
            </p>
            <div className="flex flex-col gap-1">
              {Array.from({ length: Math.min(config.numberOfOrders, 8) }, (_, i) => {
                const dropFactor = Math.pow(1 - config.priceDropPct / 100, i);
                const simPrice   = Math.round(100_000 * dropFactor);
                // Spec: additionalAmount = initialInvestment / ordersPlaced
                // ordersPlaced at moment of buy: i (for subsequent) or fixed for first
                const orderUsd   = i === 0
                  ? config.initialInvestment
                  : Math.round((config.initialInvestment / (i)) * 100) / 100;
                const dropPct    = i === 0 ? 0 : Math.round(((1 - dropFactor) * 10_000)) / 100;
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px]"
                    style={{ background: `rgba(0,200,83,${0.03 + i * 0.02})` }}
                  >
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                      style={{ background: 'rgba(0,200,83,0.15)', color: CV.green }}
                    >
                      {i + 1}
                    </span>
                    <span className="font-mono text-foreground">${simPrice.toLocaleString()}</span>
                    {dropPct > 0 && (
                      <span style={{ color: CV.red }}>−{dropPct}%</span>
                    )}
                    <span className="ml-auto font-bold" style={{ color: CV.gold }}>
                      ${orderUsd.toFixed(0)}
                    </span>
                  </div>
                );
              })}
              {config.numberOfOrders > 8 && (
                <p className="text-center text-[10px] py-1" style={{ color: CV.gray }}>
                  + {config.numberOfOrders - 8} more orders…
                </p>
              )}
            </div>
            <div
              className="mt-2 pt-2 border-t flex items-center justify-between text-[10px]"
              style={{ borderColor: 'rgba(255,255,255,0.06)' }}
            >
              <span style={{ color: CV.gray }}>Max total investment:</span>
              <span className="font-bold" style={{ color: CV.gold }}>
                ≈ ${Array.from({ length: config.numberOfOrders }, (_, i) =>
                  i === 0 ? config.initialInvestment : Math.round((config.initialInvestment / i) * 100) / 100
                ).reduce((s, v) => s + v, 0).toFixed(0)}
              </span>
            </div>
          </div>
        </>
      )}

      {/* ── Arbitrage Bot fields (spec-exact) ── */}
      {config.type === 'arbitrage' && (() => {
        const ALL_ARB_PAIRS = [
          { coinId: 'bitcoin',     symbol: 'BTC', pair: 'BTC/USDT',  color: '#F7931A', icon: '₿'  },
          { coinId: 'ethereum',    symbol: 'ETH', pair: 'ETH/USDT',  color: '#627EEA', icon: 'Ξ'  },
          { coinId: 'solana',      symbol: 'SOL', pair: 'SOL/USDT',  color: '#9945FF', icon: '◎'  },
          { coinId: 'binancecoin', symbol: 'BNB', pair: 'BNB/USDT',  color: '#F3BA2F', icon: 'B'  },
          { coinId: 'ripple',      symbol: 'XRP', pair: 'XRP/USDT',  color: '#00AAE4', icon: 'X'  },
        ];

        const pairs: Array<{ coinId: string; symbol: string; pair: string }> =
          (config as any).monitoredPairs ?? [];

        const isSelected = (coinId: string) => pairs.some(p => p.coinId === coinId);

        const togglePair = (opt: typeof ALL_ARB_PAIRS[0]) => {
          if (isSelected(opt.coinId)) {
            if (pairs.length <= 1) return; // keep at least 1
            patchConfig({ monitoredPairs: pairs.filter(p => p.coinId !== opt.coinId) } as any);
          } else {
            if (pairs.length >= 5) return; // max 5
            patchConfig({ monitoredPairs: [...pairs, { coinId: opt.coinId, symbol: opt.symbol, pair: opt.pair }] } as any);
          }
        };

        // Simulate expected arb frequency at current scan rate
        const scansPerHour   = Math.round(3_600 / ((config as any).scanIntervalSec ?? 10));
        const hitRatePct     = Math.min(80, ((config as any).minProfitPct ?? 0.5) < 0.3 ? 70 : (config as any).minProfitPct < 0.7 ? 45 : 20);
        const tradePerHour   = Math.round(scansPerHour * (hitRatePct / 100) * pairs.length / 3);

        return (
          <>
            {/* How it works */}
            <div
              className="flex items-start gap-2 p-3 rounded-xl text-xs"
              style={{ background: 'rgba(255,215,0,0.06)', color: CV.gold, border: '1px solid rgba(255,215,0,0.15)' }}
            >
              <span className="text-base shrink-0">⚡</span>
              <span>
                Every <strong>{(config as any).scanIntervalSec ?? 10}s</strong> the bot scans all selected pairs for simulated inter-market spreads.
                When a spread ≥ <strong>{(config as any).minProfitPct ?? 0.5}%</strong> is found, it executes an atomic buy + sell on the best opportunity.
              </span>
            </div>

            {/* Pair selector chips */}
            <Field label="Pairs to Monitor" hint={`${pairs.length}/5 selected`}>
              <div className="grid grid-cols-5 gap-1.5">
                {ALL_ARB_PAIRS.map(opt => {
                  const sel     = isSelected(opt.coinId);
                  const maxed   = pairs.length >= 5 && !sel;
                  return (
                    <button
                      key={opt.coinId}
                      onClick={() => togglePair(opt)}
                      disabled={maxed}
                      className="flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-bold transition-all"
                      style={sel ? {
                        background: `${opt.color}18`,
                        color:       opt.color,
                        border:      `1px solid ${opt.color}40`,
                        boxShadow:   `0 0 0 1px ${opt.color}20`,
                      } : maxed ? {
                        background: 'rgba(255,255,255,0.02)',
                        color:      'rgba(156,163,175,0.30)',
                        border:     '1px solid rgba(255,255,255,0.04)',
                        cursor:     'not-allowed',
                      } : {
                        background: 'rgba(255,255,255,0.04)',
                        color:       CV.gray,
                        border:      '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      <span className="text-sm">{opt.icon}</span>
                      <span className="text-[9px]">{opt.symbol}</span>
                      {sel && <span className="text-[8px]">✓</span>}
                    </button>
                  );
                })}
              </div>
            </Field>

            {/* Row: Min Profit % + Max Position */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Min Profit %" hint="0.1%–2%">
                <NumberInput
                  value={(config as any).minProfitPct ?? 0.5}
                  onChange={v => patchConfig({ minProfitPct: v, minSpreadPct: v } as any)}
                  min={0.1} max={2} step={0.05} suffix="%"
                />
              </Field>
              <Field label="Max Position Size" hint="$100–$50,000">
                <NumberInput
                  value={(config as any).maxPositionSize ?? 5_000}
                  onChange={v => patchConfig({ maxPositionSize: v, maxPositionUsd: v } as any)}
                  min={100} max={50_000} step={500} prefix="$"
                />
              </Field>
            </div>

            {/* Scan Interval */}
            <Field label="Scan Interval" hint="5–60 seconds between scans">
              <div className="flex gap-1.5 flex-wrap">
                {[5, 10, 15, 30, 60].map(sec => {
                  const isActive = ((config as any).scanIntervalSec ?? 10) === sec;
                  return (
                    <button
                      key={sec}
                      onClick={() => patchConfig({ scanIntervalSec: sec } as any)}
                      className="flex-1 min-w-[50px] py-2 rounded-xl text-xs font-bold transition-all"
                      style={isActive ? {
                        background: 'rgba(255,215,0,0.12)',
                        color:       CV.gold,
                        border:      '1px solid rgba(255,215,0,0.30)',
                      } : {
                        background: 'rgba(255,255,255,0.03)',
                        color:       CV.gray,
                        border:      '1px solid rgba(255,255,255,0.07)',
                      }}
                    >
                      {sec}s
                    </button>
                  );
                })}
              </div>
            </Field>

            {/* Activity estimate */}
            <div
              className="p-3 rounded-xl grid grid-cols-3 gap-2 text-center"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div>
                <p className="text-[9px]" style={{ color: CV.gray }}>Scans/hour</p>
                <p className="text-sm font-bold" style={{ color: CV.gold }}>{scansPerHour.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[9px]" style={{ color: CV.gray }}>Est. hit rate</p>
                <p className="text-sm font-bold" style={{ color: CV.green }}>{hitRatePct}%</p>
              </div>
              <div>
                <p className="text-[9px]" style={{ color: CV.gray }}>Est. trades/hr</p>
                <p className="text-sm font-bold" style={{ color: CV.blue ?? '#60a5fa' }}>~{tradePerHour}</p>
              </div>
            </div>
          </>
        );
      })()}

      {/* ── Rebalancing Bot fields (spec-exact) ── */}
      {config.type === 'rebalancing' && (() => {
        const ALL_REBAL_ASSETS = [
          { coinId: 'bitcoin',     coinSymbol: 'BTC', coinColor: '#F7931A' },
          { coinId: 'ethereum',    coinSymbol: 'ETH', coinColor: '#627EEA' },
          { coinId: 'binancecoin', coinSymbol: 'BNB', coinColor: '#F3BA2F' },
          { coinId: 'solana',      coinSymbol: 'SOL', coinColor: '#9945FF' },
          { coinId: 'ripple',      coinSymbol: 'XRP', coinColor: '#00AAE4' },
          { coinId: 'cardano',     coinSymbol: 'ADA', coinColor: '#0033AD' },
          { coinId: 'dogecoin',    coinSymbol: 'DOGE', coinColor: '#C2A633' },
          { coinId: 'polkadot',    coinSymbol: 'DOT',  coinColor: '#E6007A' },
          { coinId: 'chainlink',   coinSymbol: 'LINK', coinColor: '#2A5ADA' },
          { coinId: 'avalanche-2', coinSymbol: 'AVAX', coinColor: '#E84142' },
        ];

        const assets: Array<{ coinId: string; coinSymbol: string; coinColor: string; targetPct: number }> =
          (config as any).assets ?? (config as any).allocations ?? [];

        const isSelected = (coinId: string) => assets.some(a => a.coinId === coinId);
        const totalPct   = assets.reduce((s, a) => s + a.targetPct, 0);
        const isBalanced = Math.abs(totalPct - 100) < 0.5;

        const toggleAsset = (opt: typeof ALL_REBAL_ASSETS[0]) => {
          if (isSelected(opt.coinId)) {
            if (assets.length <= 2) return; // min 2
            const remaining = assets.filter(a => a.coinId !== opt.coinId);
            // Redistribute removed % evenly
            const removedPct = assets.find(a => a.coinId === opt.coinId)?.targetPct ?? 0;
            const perAsset   = Math.floor(removedPct / remaining.length);
            const adjusted   = remaining.map((a, i) => ({
              ...a,
              targetPct: a.targetPct + (i === 0 ? removedPct - perAsset * (remaining.length - 1) : perAsset),
            }));
            patchConfig({ assets: adjusted, allocations: adjusted } as any);
          } else {
            if (assets.length >= 10) return; // max 10
            // Give the new asset 10%, take equally from all others
            const steal      = Math.min(10, Math.floor(10 / assets.length));
            const adjusted   = assets.map(a => ({ ...a, targetPct: Math.max(1, a.targetPct - steal) }));
            const newTotal   = adjusted.reduce((s, a) => s + a.targetPct, 0);
            const newAsset   = { ...opt, targetPct: 100 - newTotal };
            const all        = [...adjusted, newAsset];
            patchConfig({ assets: all, allocations: all } as any);
          }
        };

        const updatePct = (idx: number, newPct: number) => {
          const updated = assets.map((a, i) => i === idx ? { ...a, targetPct: newPct } : a);
          patchConfig({ assets: updated, allocations: updated } as any);
        };

        // Interval options (hours)
        const INTERVAL_OPTIONS = [
          { label: '1h',   hours: 1   },
          { label: '4h',   hours: 4   },
          { label: '8h',   hours: 8   },
          { label: '24h',  hours: 24  },
          { label: '48h',  hours: 48  },
          { label: '7d',   hours: 168 },
        ];

        const intervalHours = (config as any).rebalanceIntervalHours ?? 24;
        const threshold     = (config as any).rebalanceThresholdPct ?? 5;
        const minTrade      = (config as any).minTradeSizeUsd ?? 50;

        return (
          <>
            {/* How it works */}
            <div
              className="flex items-start gap-2 p-3 rounded-xl text-xs"
              style={{ background: 'rgba(99,102,241,0.06)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.18)' }}
            >
              <span className="text-base shrink-0">⚖️</span>
              <span>
                Every <strong>{intervalHours}h</strong> the bot checks each asset. If any drifts more than <strong>{threshold}%</strong> from target, it sells overweight and buys underweight — skipping trades &lt; <strong>${minTrade}</strong>.
              </span>
            </div>

            {/* Portfolio value */}
            <Field label="Total Portfolio Value" hint="USD to manage">
              <NumberInput
                value={config.totalPortfolioUsd}
                onChange={v => patchConfig({ totalPortfolioUsd: v } as any)}
                min={500} max={1_000_000} step={500} prefix="$"
              />
            </Field>

            {/* Asset selector chips */}
            <Field label="Portfolio Assets" hint={`${assets.length}/10 assets`}>
              <div className="grid grid-cols-5 gap-1.5">
                {ALL_REBAL_ASSETS.map(opt => {
                  const sel   = isSelected(opt.coinId);
                  const maxed = assets.length >= 10 && !sel;
                  return (
                    <button
                      key={opt.coinId}
                      onClick={() => toggleAsset(opt)}
                      disabled={maxed || (sel && assets.length <= 2)}
                      className="flex flex-col items-center gap-0.5 py-2 rounded-xl text-[10px] font-bold transition-all"
                      style={sel ? {
                        background: `${opt.coinColor}16`,
                        color:       opt.coinColor,
                        border:      `1px solid ${opt.coinColor}40`,
                      } : maxed ? {
                        background: 'rgba(255,255,255,0.02)',
                        color:       'rgba(156,163,175,0.3)',
                        border:      '1px solid rgba(255,255,255,0.04)',
                        cursor:      'not-allowed',
                      } : {
                        background: 'rgba(255,255,255,0.04)',
                        color:       CV.gray,
                        border:      '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      <span className="text-[11px]" style={sel ? { color: opt.coinColor } : {}}>●</span>
                      <span>{opt.coinSymbol}</span>
                      {sel && <span className="text-[8px]">✓</span>}
                    </button>
                  );
                })}
              </div>
            </Field>

            {/* Target allocation sliders */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold" style={{ color: CV.gray }}>Target Allocations</span>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{
                    color:      isBalanced ? CV.green : CV.red,
                    background: isBalanced ? 'rgba(0,200,83,0.10)' : 'rgba(255,59,48,0.10)',
                    border:     `1px solid ${isBalanced ? 'rgba(0,200,83,0.25)' : 'rgba(255,59,48,0.25)'}`,
                  }}
                >
                  {isBalanced ? '✓ Balanced' : `Total: ${totalPct.toFixed(0)}% (need 100%)`}
                </span>
              </div>

              {/* Stacked bar visualisation */}
              <div className="flex h-3 rounded-full overflow-hidden mb-3">
                {assets.map(a => (
                  <div
                    key={a.coinId}
                    className="h-full transition-all duration-300"
                    style={{ width: `${a.targetPct}%`, background: a.coinColor }}
                  />
                ))}
              </div>

              <div className="flex flex-col gap-2">
                {assets.map((a, i) => (
                  <div key={a.coinId} className="flex items-center gap-2.5">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: a.coinColor }}
                    />
                    <span
                      className="text-xs font-bold w-10 shrink-0"
                      style={{ color: a.coinColor }}
                    >
                      {a.coinSymbol}
                    </span>
                    <input
                      type="range"
                      min={1}
                      max={Math.min(95, 100 - (assets.length - 1))}
                      value={a.targetPct}
                      onChange={e => updatePct(i, Number(e.target.value))}
                      className="flex-1 h-1.5"
                      style={{ accentColor: a.coinColor }}
                    />
                    <span
                      className="text-xs font-bold w-10 text-right tabular-nums"
                      style={{ color: CV.gold }}
                    >
                      {a.targetPct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Row: Threshold + Min Trade Size */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Rebalance Threshold" hint="1%–15% deviation">
                <NumberInput
                  value={threshold}
                  onChange={v => patchConfig({ rebalanceThresholdPct: v, driftThresholdPct: v } as any)}
                  min={1} max={15} step={0.5} suffix="%"
                />
              </Field>
              <Field label="Min Trade Size" hint="$10–$500">
                <NumberInput
                  value={minTrade}
                  onChange={v => patchConfig({ minTradeSizeUsd: v } as any)}
                  min={10} max={500} step={10} prefix="$"
                />
              </Field>
            </div>

            {/* Rebalance interval pills */}
            <Field label="Rebalance Interval" hint="hours between checks">
              <div className="flex gap-1.5 flex-wrap">
                {INTERVAL_OPTIONS.map(opt => {
                  const isActive = intervalHours === opt.hours;
                  return (
                    <button
                      key={opt.hours}
                      onClick={() => patchConfig({
                        rebalanceIntervalHours: opt.hours,
                        checkInterval: opt.hours >= 168 ? '7d' : opt.hours >= 24 ? '1d' : opt.hours >= 12 ? '12h' : opt.hours >= 4 ? '4h' : '1h',
                      } as any)}
                      className="flex-1 min-w-[44px] py-2 rounded-xl text-xs font-bold transition-all"
                      style={isActive ? {
                        background: 'rgba(99,102,241,0.14)',
                        color:       '#818cf8',
                        border:      '1px solid rgba(99,102,241,0.32)',
                      } : {
                        background: 'rgba(255,255,255,0.03)',
                        color:       CV.gray,
                        border:      '1px solid rgba(255,255,255,0.07)',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </Field>
          </>
        );
      })()}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — Confirm
// ─────────────────────────────────────────────────────────────────────────────

function StepConfirm({
  template,
  name,
  config,
}: {
  template: BotTemplate;
  name:     string;
  config:   BotConfig;
}) {
  const meta = BOT_TYPE_META[template.type];
  const risk = RISK_META[template.riskLevel];

  const rows: Array<{ label: string; value: string }> = [];
  if (config.type === 'grid') {
    rows.push(
      { label: 'Coin',             value: config.coinSymbol },
      { label: 'Grid Levels',      value: config.gridCount.toString() },
      { label: 'Price Range',      value: `$${config.lowerPrice.toLocaleString()} – $${config.upperPrice.toLocaleString()}` },
      { label: 'Total Investment', value: fmtUsd(config.totalInvestment, false) },
    );
  } else if (config.type === 'martingale') {
    const maxExposure = Math.round(
      config.baseAmount * Math.pow(config.multiplier, config.maxConsecutiveLosses - 1) * 100
    ) / 100;
    rows.push(
      { label: 'Coin',              value: config.coinSymbol },
      { label: 'Base Amount',       value: fmtUsd(config.baseAmount, false) },
      { label: 'Multiplier',        value: `${config.multiplier}×` },
      { label: 'Max Losses',        value: `${config.maxConsecutiveLosses} consecutive` },
      { label: 'Take Profit',       value: `${config.takeProfitPct}% per cycle` },
      { label: 'Direction',         value: config.direction === 'both' ? '🔄 Alternating' : config.direction === 'long' ? '📈 Long' : '📉 Short' },
      { label: 'Max Exposure',      value: fmtUsd(maxExposure, false) },
    );
  } else if (config.type === 'dca') {
    const totalMax = Array.from({ length: config.numberOfOrders }, (_, i) =>
      i === 0 ? config.initialInvestment : Math.round((config.initialInvestment / i) * 100) / 100
    ).reduce((s, v) => s + v, 0);
    rows.push(
      { label: 'Coin',               value: config.coinSymbol },
      { label: 'Initial Investment', value: fmtUsd(config.initialInvestment, false) },
      { label: 'Number of Orders',   value: config.numberOfOrders.toString() },
      { label: 'Price Drop Trigger', value: `${config.priceDropPct}% per order` },
      { label: 'Take Profit',        value: `${config.takeProfitPct}% above avg entry` },
      { label: 'Exit Strategy',      value: config.partialExit ? '🔀 50% partial exit' : '✅ Full exit + stop' },
      { label: 'Max Investment',     value: `~${fmtUsd(totalMax, false)}` },
    );
  } else if (config.type === 'arbitrage') {
    {
      const pairs = (config as any).monitoredPairs as Array<{ symbol: string }> | undefined;
      rows.push(
        { label: 'Pairs',         value: pairs?.map(p => p.symbol).join(', ') ?? `${config.coinASymbol}, ${config.coinBSymbol}` },
        { label: 'Min Profit',    value: `${(config as any).minProfitPct ?? config.minSpreadPct}%` },
        { label: 'Max Position',  value: fmtUsd((config as any).maxPositionSize ?? config.maxPositionUsd, false) },
        { label: 'Scan Interval', value: `${(config as any).scanIntervalSec ?? 10}s` },
      );
    }
  } else if (config.type === 'rebalancing') {
    const assets = (config as any).assets ?? (config as any).allocations ?? [];
    rows.push(
      { label: 'Portfolio Value',    value: fmtUsd(config.totalPortfolioUsd, false) },
      { label: 'Assets',            value: assets.map((a: any) => a.coinSymbol).join(', ') },
      { label: 'Allocations',       value: assets.map((a: any) => `${a.coinSymbol} ${a.targetPct}%`).join(' · ') },
      { label: 'Drift Threshold',   value: `${(config as any).rebalanceThresholdPct ?? config.driftThresholdPct}%` },
      { label: 'Rebalance Every',   value: `${(config as any).rebalanceIntervalHours ?? 24}h` },
      { label: 'Min Trade Size',    value: `${(config as any).minTradeSizeUsd ?? 50}` },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Bot identity card */}
      <div
        className="flex items-center gap-3 p-4 rounded-xl border"
        style={{ background: meta.bgAlpha, borderColor: meta.borderAlpha }}
      >
        <span className="text-3xl">{meta.emoji}</span>
        <div>
          <p className="font-bold text-foreground">{name || `My ${meta.label}`}</p>
          <p className="text-xs mt-0.5" style={{ color: meta.color }}>{meta.label}</p>
        </div>
        <span
          className="ml-auto text-xs font-semibold px-2 py-1 rounded-full"
          style={{ color: risk.color, background: risk.bg, border: `1px solid ${risk.border}` }}
        >
          {risk.label}
        </span>
      </div>

      {/* Config summary */}
      <div className="flex flex-col gap-1">
        {rows.map(({ label, value }) => (
          <div
            key={label}
            className="flex items-center justify-between px-3 py-2 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.03)' }}
          >
            <span className="text-xs" style={{ color: CV.gray }}>{label}</span>
            <span className="text-xs font-semibold text-foreground">{value}</span>
          </div>
        ))}
      </div>

      {/* Fee notice */}
      <div
        className="flex items-start gap-2 p-3 rounded-xl text-xs"
        style={{ background: 'rgba(255,149,0,0.06)', color: CV.orange, border: '1px solid rgba(255,149,0,0.15)' }}
      >
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        A 0.1% fee is applied to each trade. All trading is simulated on the demo engine — no real funds are used.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN WIZARD
// ─────────────────────────────────────────────────────────────────────────────

export function BotCreateWizard({ open, onClose, onCreate, initialType }: Props) {
  const { templates } = useBotTemplateStore();
  const { createBot, startBot } = useBotStore();
  const { user } = useAuthStore();
  const tradingBalance = useTradingStore(s => s.balance);
  const navigate = useNavigate();
  const { setBotBacktestConfig } = useBotBacktestContext();

  const templateList = useMemo(
    () => Object.values(templates).filter(t => t.isActive),
    [templates],
  );

  // If initialType is given, pre-select that template and jump to step 2
  const initialTemplate = useMemo(() =>
    initialType
      ? (templateList.find(t => t.type === initialType) ?? templateList[0] ?? null)
      : (templateList[0] ?? null),
  [initialType, templateList]);

  const [step,        setStep]        = useState<WizardStep>(initialType ? 2 : 1);
  const [template,    setTemplate]    = useState<BotTemplate | null>(initialTemplate);
  const [botName,     setBotName]     = useState('');
  const [config,      setConfig]      = useState<BotConfig | null>(initialTemplate?.defaultConfig ?? null);
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const handleSelectTemplate = useCallback((t: BotTemplate) => {
    setTemplate(t);
    setConfig(JSON.parse(JSON.stringify(t.defaultConfig)));
    setBotName('');
    setError(null);
  }, []);

  const canGoNext = useMemo(() => {
    if (step === 1) return template !== null;
    if (step === 2) return botName.trim().length > 0 && config !== null;
    return true;
  }, [step, template, botName, config]);

  const handleNext = useCallback(() => {
    if (step < 3) setStep(s => (s + 1) as WizardStep);
  }, [step]);

  const handleBack = useCallback(() => {
    setError(null);
    if (step > 1) setStep(s => (s - 1) as WizardStep);
  }, [step]);

  const handleSubmit = useCallback(async () => {
    if (!template || !config || !user) return;
    setSubmitting(true);
    setError(null);

    try {
      const balance = tradingBalance ?? 10_000;
      const result = createBot({
        userId:             user.id,
        templateId:         template.id,
        name:               botName.trim() || `My ${BOT_TYPE_META[template.type].label}`,
        config,
        scheduleType:       'interval',
        scheduleValue:      '1m',
        userTradingBalance: balance,
        userPlan:           (user as any).subscription ?? 'bronze',
        userLevel:          (user as any).level ?? 0,
      });

      if (!result.ok) {
        setError(result.errors?.join(' ') ?? 'Failed to create bot.');
        return;
      }

      // Auto-start the bot immediately
      startBot(result.bot!.id);
      onCreate?.(result.bot!);
      onClose();

      // Reset wizard
      setStep(1);
      setBotName('');
      setConfig(templateList[0]?.defaultConfig ?? null);
      setTemplate(templateList[0] ?? null);
    } finally {
      setSubmitting(false);
    }
  }, [template, config, botName, user, createBot, startBot, onCreate, onClose, tradingBalance, templateList]);

  // ── Spec 6.1: Test with Backtest ─────────────────────────────────────────
  const handleTestWithBacktest = useCallback(() => {
    if (!template || !config) return;
    // Build a fake UserBot shell just to convert config
    const fakeBot = {
      id:           'preview',
      name:         botName.trim() || `My ${BOT_TYPE_META[template.type].label}`,
      templateType: template.type,
      config,
    } as any;
    const btConfig = botToBacktestConfig(fakeBot);
    setBotBacktestConfig(btConfig);
    onClose();
    navigate('/backtest');
  }, [template, config, botName, setBotBacktestConfig, onClose, navigate]);

  const STEP_LABELS = ['Choose Template', 'Configure', 'Confirm'];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.22 }}
        className="relative z-10 w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
        style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,215,0,0.15)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b shrink-0"
          style={{ borderColor: 'rgba(255,215,0,0.10)' }}
        >
          <div>
            <h2 className="text-base font-bold text-foreground">Create New Bot</h2>
            <p className="text-xs mt-0.5" style={{ color: CV.gray }}>
              Step {step} of 3 — {STEP_LABELS[step - 1]}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: CV.gray }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step progress */}
        <div className="flex px-5 pt-3 gap-2 shrink-0">
          {[1, 2, 3].map(s => (
            <div
              key={s}
              className="flex-1 h-1 rounded-full transition-all duration-300"
              style={{
                background: s <= step ? CV.gold : 'rgba(255,255,255,0.08)',
                boxShadow:  s === step ? `0 0 8px rgba(255,215,0,0.40)` : 'none',
              }}
            />
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.18 }}
            >
              {step === 1 && (
                <StepTemplate
                  templates={templateList}
                  selected={template}
                  onSelect={handleSelectTemplate}
                />
              )}
              {step === 2 && template && config && (
                <StepConfigure
                  template={template}
                  name={botName}
                  onNameChange={setBotName}
                  config={config}
                  onConfigChange={setConfig}
                />
              )}
              {step === 3 && template && config && (
                <StepConfirm
                  template={template}
                  name={botName}
                  config={config}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Error */}
        {error && (
          <div
            className="mx-5 mb-3 flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
            style={{ background: 'rgba(255,59,48,0.10)', color: CV.red, border: '1px solid rgba(255,59,48,0.22)' }}
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        {/* Footer */}
        <div
          className="flex items-center gap-3 px-5 py-4 border-t shrink-0"
          style={{ borderColor: 'rgba(255,215,0,0.10)' }}
        >
          {step > 1 && (
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
              style={{ color: CV.gray, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
          )}
          <div className="flex-1" />
          {step < 3 ? (
            <button
              onClick={handleNext}
              disabled={!canGoNext}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-bold transition-all active:scale-[0.97]"
              style={canGoNext ? {
                background: 'linear-gradient(135deg, #FFD700 0%, #FFA800 100%)',
                color:      '#0A1929',
                boxShadow:  '0 3px 14px rgba(255,215,0,0.28)',
              } : {
                background: 'rgba(255,215,0,0.15)',
                color:      'rgba(255,215,0,0.40)',
                cursor:     'not-allowed',
              }}
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <>
              {/* 6.1: Test with Backtest */}
              <button
                onClick={handleTestWithBacktest}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-[0.97]"
                style={{
                  background: 'rgba(96,165,250,0.10)',
                  color:      '#60a5fa',
                  border:     '1px solid rgba(96,165,250,0.25)',
                }}
                title="Open backtest page pre-loaded with this bot's configuration"
              >
                <FlaskConical className="h-4 w-4" />
                <span className="hidden sm:inline">Test with Backtest</span>
                <span className="sm:hidden">Test</span>
              </button>

              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-bold transition-all active:scale-[0.97]"
                style={submitting ? {
                  background: 'rgba(0,200,83,0.15)',
                  color:      CV.green,
                  border:     '1px solid rgba(0,200,83,0.25)',
                } : {
                  background: 'linear-gradient(135deg, #00C853 0%, #00a846 100%)',
                  color:      '#0A1929',
                  boxShadow:  '0 3px 14px rgba(0,200,83,0.28)',
                }}
              >
                {submitting
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
                  : <><Check className="h-4 w-4" /> Create &amp; Start Bot</>}
              </button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
