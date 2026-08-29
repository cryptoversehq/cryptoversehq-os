/**
 * BacktestConfigPanel.tsx
 *
 * Left-side configuration panel for the Backtest Engine page.
 * Handles strategy selection mode, parameters, advanced settings,
 * and the run button.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FlaskConical, ChevronDown, ChevronUp, Settings2,
  Play, Save, Layers, Code2, ShoppingBag,
  Loader2, CheckCircle2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { BACKTEST_SYMBOLS, TIMEFRAME_OPTIONS } from '../../lib/backtestTypes';
import { Database, Cpu } from 'lucide-react';
import type { BacktestParams } from '../../lib/backtestTypes';
import type { StrategyType } from '../../lib/strategyTypes';
import type { ErrorInfo } from '../../lib/backtestErrors';
import { BacktestErrorMessage } from './BacktestErrorMessage';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type StrategyMode = 'my_strategy' | 'marketplace' | 'custom_code';
export type DataSource = 'simulated' | 'real';

export interface BacktestConfig {
  mode:            StrategyMode;
  strategyId:      string | null;
  strategyName:    string;
  strategyType:    StrategyType | 'custom';
  params:          BacktestParams;
  enableSlippage:  boolean;
  includeWeekends: boolean;
  customCode:      string;
}

interface Props {
  config:        BacktestConfig;
  onChange:      (c: BacktestConfig) => void;
  onRun:         () => void;
  onOpenMarket:  () => void;
  onOpenCode:    () => void;
  isRunning:     boolean;
  errors:        ErrorInfo[];
  onErrorAction: (actionId: ErrorInfo['actionId'], code?: string) => void;
  onDismissErrors: () => void;
  lastRunOk:     boolean | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SMALL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const Label = ({ children }: { children: React.ReactNode }) => (
  <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
    {children}
  </label>
);

const Input = ({
  value, onChange, type = 'text', placeholder, min, max, step, disabled,
}: {
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}) => (
  <input
    type={type}
    value={value}
    onChange={e => onChange(e.target.value)}
    placeholder={placeholder}
    min={min}
    max={max}
    step={step}
    disabled={disabled}
    className={cn(
      'w-full px-3 py-2 rounded-lg text-sm bg-background border border-white/10',
      'text-foreground placeholder:text-muted-foreground/50',
      'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50',
      'transition-colors disabled:opacity-50',
    )}
  />
);

const Select = ({
  value, onChange, children, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) => (
  <select
    value={value}
    onChange={e => onChange(e.target.value)}
    disabled={disabled}
    className={cn(
      'w-full px-3 py-2 rounded-lg text-sm bg-background border border-white/10',
      'text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50',
      'focus:border-primary/50 transition-colors appearance-none cursor-pointer',
      'disabled:opacity-50',
    )}
  >
    {children}
  </select>
);

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY MODE BUTTON
// ─────────────────────────────────────────────────────────────────────────────

const ModeButton = ({
  mode, current, icon: Icon, label, onClick,
}: {
  mode:    StrategyMode;
  current: StrategyMode;
  icon:    React.ElementType;
  label:   string;
  onClick: () => void;
}) => {
  const active = mode === current;
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 w-full',
        active
          ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
          : 'bg-secondary/30 text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-white/5',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
      {active && <CheckCircle2 className="h-3.5 w-3.5 ml-auto shrink-0" />}
    </button>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG PANEL
// ─────────────────────────────────────────────────────────────────────────────

export function BacktestConfigPanel({
  config, onChange, onRun, onOpenMarket, onOpenCode,
  isRunning, errors, onErrorAction, onDismissErrors, lastRunOk,
}: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const p = config.params;

  function updateParam(key: keyof BacktestParams, val: unknown) {
    onChange({ ...config, params: { ...p, [key]: val } });
  }

  function setMode(mode: StrategyMode) {
    if (mode === 'marketplace') { onOpenMarket(); return; }
    if (mode === 'custom_code') { onOpenCode(); return; }
    onChange({ ...config, mode });
  }

  const strategyTypeOptions: Array<{ label: string; value: StrategyType | 'custom' }> = [
    { label: 'Grid Bot',     value: 'grid' },
    { label: 'DCA Bot',      value: 'dca' },
    { label: 'Martingale',   value: 'martingale' },
    { label: 'Arbitrage',    value: 'arbitrage' },
    { label: 'Custom Logic', value: 'custom' },
  ];

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex-1 space-y-5 p-5">

        {/* ── Header ── */}
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Configuration</h2>
        </div>

        {/* ── Strategy Selection ── */}
        <div>
          <Label>Strategy Source</Label>
          <div className="space-y-2">
            <ModeButton
              mode="my_strategy"
              current={config.mode}
              icon={Layers}
              label="Use built-in strategy"
              onClick={() => setMode('my_strategy')}
            />
            <ModeButton
              mode="marketplace"
              current={config.mode}
              icon={ShoppingBag}
              label="Select from marketplace"
              onClick={() => setMode('marketplace')}
            />
            <ModeButton
              mode="custom_code"
              current={config.mode}
              icon={Code2}
              label="Write custom code"
              onClick={() => setMode('custom_code')}
            />
          </div>

          {/* Selected marketplace strategy badge */}
          {config.mode === 'marketplace' && config.strategyName && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-xs text-primary font-medium"
            >
              ✓ {config.strategyName}
            </motion.div>
          )}
        </div>

        {/* ── Strategy Type (for my_strategy / custom mode) ── */}
        <AnimatePresence>
          {config.mode !== 'marketplace' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <Label>Strategy Type</Label>
              <Select
                value={config.strategyType}
                onChange={v => onChange({ ...config, strategyType: v as StrategyType | 'custom' })}
              >
                {strategyTypeOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Parameters ── */}
        <div>
          <div className="flex items-center gap-1.5 mb-3">
            <div className="h-px flex-1 bg-white/5" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Parameters</span>
            <div className="h-px flex-1 bg-white/5" />
          </div>

          <div className="space-y-3">
            {/* Symbol */}
            <div>
              <Label>Symbol</Label>
              <Select value={p.symbol} onChange={v => {
                const found = BACKTEST_SYMBOLS.find(s => s.value === v);
                if (found) {
                  onChange({
                    ...config,
                    params: { ...p, symbol: found.value, coinId: found.coinId },
                  });
                }
              }}>
                {BACKTEST_SYMBOLS.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </Select>
            </div>

            {/* Timeframe */}
            <div>
              <Label>Timeframe</Label>
              <Select value={p.timeframe} onChange={v => updateParam('timeframe', v)}>
                {TIMEFRAME_OPTIONS.map(tf => (
                  <option key={tf.value} value={tf.value}>{tf.label}</option>
                ))}
              </Select>
            </div>

            {/* Date range */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={p.startDate}
                  onChange={v => updateParam('startDate', v)}
                />
              </div>
              <div>
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={p.endDate}
                  onChange={v => updateParam('endDate', v)}
                />
              </div>
            </div>

            {/* Initial Balance */}
            <div>
              <Label>Initial Balance ($)</Label>
              <Input
                type="number"
                value={p.initialBalance}
                onChange={v => updateParam('initialBalance', Number(v))}
                min={100}
                step={100}
                placeholder="10000"
              />
            </div>

            {/* Fee Rate */}
            <div>
              <Label>Fee Rate (%)</Label>
              <Input
                type="number"
                value={(p.feeRate * 100).toFixed(2)}
                onChange={v => updateParam('feeRate', Number(v) / 100)}
                min={0}
                max={5}
                step={0.01}
                placeholder="0.10"
              />
            </div>
          </div>
        </div>

        {/* ── Advanced Settings ── */}
        <div>
          <button
            onClick={() => setShowAdvanced(s => !s)}
            className="flex items-center gap-2 w-full text-xs font-medium text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            <Settings2 className="h-3.5 w-3.5" />
            <span>Advanced Settings</span>
            <div className="h-px flex-1 bg-white/5 ml-1" />
            {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          <AnimatePresence>
            {showAdvanced && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="pt-3 space-y-3">
                  {/* Enable Slippage */}
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div
                      onClick={() => onChange({ ...config, enableSlippage: !config.enableSlippage })}
                      className={cn(
                        'relative w-9 h-5 rounded-full transition-colors',
                        config.enableSlippage ? 'bg-primary' : 'bg-secondary/50',
                      )}
                    >
                      <div className={cn(
                        'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                        config.enableSlippage ? 'translate-x-4' : 'translate-x-0',
                      )} />
                    </div>
                    <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                      Enable slippage simulation
                    </span>
                  </label>

                  {/* Include Weekends */}
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div
                      onClick={() => onChange({ ...config, includeWeekends: !config.includeWeekends })}
                      className={cn(
                        'relative w-9 h-5 rounded-full transition-colors',
                        config.includeWeekends ? 'bg-primary' : 'bg-secondary/50',
                      )}
                    >
                      <div className={cn(
                        'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                        config.includeWeekends ? 'translate-x-4' : 'translate-x-0',
                      )} />
                    </div>
                    <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                      Include weekend candles
                    </span>
                  </label>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Error Display (Part 12) ── */}
        <BacktestErrorMessage
          errors={errors}
          onAction={onErrorAction}
          onDismiss={onDismissErrors}
        />
      </div>

      {/* ── Run Button (Part 13: Gold CTA) ── */}
      <div className="p-5 border-t border-white/5 bg-card/50">
        <button
          onClick={onRun}
          disabled={isRunning}
          style={isRunning ? {} : {
            background: 'linear-gradient(135deg, #FFD700 0%, #FFA800 100%)',
            boxShadow: '0 4px 20px rgba(255,215,0,0.28), 0 2px 6px rgba(255,168,0,0.18)',
            color: '#0A1929',
          }}
          className={cn(
            'w-full flex items-center justify-center gap-2.5 py-3 rounded-xl font-bold text-sm transition-all duration-300 active:scale-[0.98]',
            isRunning
              ? 'bg-[#FFD700]/30 cursor-not-allowed text-[#FFD700]/60 border border-[#FFD700]/20'
              : 'hover:brightness-105',
          )}
        >
          {isRunning ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-[#FFD700]" />
              <span className="text-[#FFD700]">Simulating…</span>
            </>
          ) : (
            <>
              <Play className="h-4 w-4 fill-current" />
              <span>Run Backtest</span>
            </>
          )}
        </button>

        {/* Last run status — Part 13 spec colors */}
        <AnimatePresence>
          {lastRunOk !== null && !isRunning && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-2 text-center text-xs font-medium"
              style={{ color: lastRunOk ? '#00C853' : '#FF3B30' }}
            >
              {lastRunOk
                ? '✓ Backtest completed successfully'
                : '✗ Backtest failed — check errors above'}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
