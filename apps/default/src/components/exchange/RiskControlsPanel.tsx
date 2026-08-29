/**
 * RiskControlsPanel.tsx — Comprehensive risk management controls per connection
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, AlertTriangle, Zap, Clock, Bell, Check, Save,
  RotateCcw, Info,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useExchangeStore } from '../../lib/exchangeStore';
import { RiskControls } from '../../lib/exchangeTypes';
import { toast } from 'sonner';

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-4.5 w-4.5 text-primary" />
      </div>
      <div>
        <p className="text-sm font-black text-white">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

function NumberInput({
  label, value, min, max, step = 1, unit, prefix, onChange, highlight, tooltip,
}: {
  label: string; value: number; min: number; max: number; step?: number;
  unit?: string; prefix?: string; onChange: (v: number) => void;
  highlight?: 'red' | 'amber' | 'green'; tooltip?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <label className="text-xs font-bold text-white/60">{label}</label>
        {tooltip && (
          <div className="group relative">
            <Info className="h-3 w-3 text-white/20 cursor-help" />
            <div className="absolute bottom-5 left-0 w-48 px-2.5 py-1.5 rounded-lg bg-black/90 text-[10px] text-white/70 border border-white/10 opacity-0 group-hover:opacity-100 pointer-events-none z-10 transition-opacity">
              {tooltip}
            </div>
          </div>
        )}
      </div>
      <div className={cn('flex items-center rounded-xl border overflow-hidden transition-colors',
        highlight === 'red'   ? 'border-red-500/30 bg-red-500/5' :
        highlight === 'amber' ? 'border-amber-500/30 bg-amber-500/5' :
        highlight === 'green' ? 'border-emerald-500/30 bg-emerald-500/5' :
        'border-white/10 bg-white/5',
      )}>
        {prefix && <span className="px-3 text-xs text-white/30 border-r border-white/10">{prefix}</span>}
        <input
          type="number" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Math.min(max, Math.max(min, Number(e.target.value))))}
          className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white focus:outline-none font-mono"
        />
        {unit && <span className="px-3 text-xs text-white/30 border-l border-white/10">{unit}</span>}
      </div>
    </div>
  );
}

function Toggle({ label, desc, value, onChange, danger }: {
  label: string; desc?: string; value: boolean; onChange: (v: boolean) => void; danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div>
        <p className="text-xs font-bold text-white">{label}</p>
        {desc && <p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      <button onClick={() => onChange(!value)}
        className={cn('relative w-10 h-5 rounded-full transition-colors duration-300 shrink-0',
          value ? (danger ? 'bg-red-500' : 'bg-primary') : 'bg-white/10',
        )}>
        <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-300',
          value ? 'translate-x-5' : 'translate-x-0.5',
        )} />
      </button>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function RiskControlsPanel({ connectionId }: { connectionId: string }) {
  const { getRiskControls, updateRiskControls } = useExchangeStore();
  const saved = getRiskControls(connectionId);

  const [draft, setDraft] = useState<RiskControls>({ ...saved });
  const [isDirty, setIsDirty] = useState(false);

  function patch<K extends keyof RiskControls>(key: K, val: RiskControls[K]) {
    setDraft(d => ({ ...d, [key]: val }));
    setIsDirty(true);
  }

  function save() {
    updateRiskControls(connectionId, draft);
    setIsDirty(false);
    toast.success('Risk controls saved ✓');
  }

  function reset() {
    setDraft({ ...saved });
    setIsDirty(false);
  }

  return (
    <div className="space-y-5 max-w-2xl">

      {/* Save bar */}
      {isDirty && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between px-4 py-3 rounded-2xl"
          style={{ background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.25)' }}>
          <span className="text-xs font-bold text-primary">Unsaved changes</span>
          <div className="flex gap-2">
            <button onClick={reset} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/6 text-white/60 text-xs font-bold hover:bg-white/10 transition-colors">
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
            <button onClick={save} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:brightness-110 transition-all">
              <Save className="h-3 w-3" /> Save
            </button>
          </div>
        </motion.div>
      )}

      {/* Position Limits */}
      <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <SectionHeader icon={Shield} title="Position Limits" subtitle="Control maximum exposure per trade and portfolio" />
        <div className="grid sm:grid-cols-2 gap-4">
          <NumberInput label="Max Position Size" value={draft.maxPositionSizeUSD} min={50} max={100000} step={50}
            prefix="$" onChange={v => patch('maxPositionSizeUSD', v)}
            tooltip="Maximum USD value for a single open position" />
          <NumberInput label="Max Position %" value={draft.maxPositionPercent} min={1} max={50}
            unit="%" onChange={v => patch('maxPositionPercent', v)}
            tooltip="Max % of total portfolio in one position" />
          <NumberInput label="Max Open Positions" value={draft.maxOpenPositions} min={1} max={50}
            onChange={v => patch('maxOpenPositions', v)}
            tooltip="Maximum number of positions open simultaneously" />
          <NumberInput label="Max Leverage" value={draft.maxLeverage} min={1} max={125}
            unit="x" onChange={v => patch('maxLeverage', v)}
            highlight={draft.maxLeverage > 10 ? 'red' : draft.maxLeverage > 3 ? 'amber' : 'green'}
            tooltip="Maximum leverage allowed for any trade" />
        </div>
      </div>

      {/* Daily Limits */}
      <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <SectionHeader icon={AlertTriangle} title="Daily Loss Limits" subtitle="Automatic pause when daily losses exceed threshold" />
        <div className="grid sm:grid-cols-2 gap-4">
          <NumberInput label="Max Daily Loss (USD)" value={draft.maxDailyLossUSD} min={10} max={100000} step={10}
            prefix="$" onChange={v => patch('maxDailyLossUSD', v)}
            highlight={draft.maxDailyLossUSD < 100 ? 'amber' : undefined} />
          <NumberInput label="Max Daily Loss %" value={draft.maxDailyLossPercent} min={0.5} max={50} step={0.5}
            unit="%" onChange={v => patch('maxDailyLossPercent', v)}
            highlight={draft.maxDailyLossPercent > 15 ? 'red' : undefined} />
          <NumberInput label="Max Daily Trades" value={draft.maxDailyTradesCount} min={1} max={500}
            onChange={v => patch('maxDailyTradesCount', v)} />
        </div>
      </div>

      {/* Default Trade Settings */}
      <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <SectionHeader icon={Zap} title="Default Trade Settings" subtitle="Applied to all automated trades unless overridden" />
        <div className="grid sm:grid-cols-2 gap-4">
          <NumberInput label="Default Leverage" value={draft.defaultLeverage} min={1} max={draft.maxLeverage}
            unit="x" onChange={v => patch('defaultLeverage', v)} />
          <NumberInput label="Default Stop-Loss" value={draft.stopLossPercent} min={0.1} max={20} step={0.1}
            unit="%" onChange={v => patch('stopLossPercent', v)}
            highlight={draft.stopLossPercent > 10 ? 'red' : undefined} />
          <NumberInput label="Default Take-Profit" value={draft.takeProfitPercent} min={0.5} max={50} step={0.5}
            unit="%" onChange={v => patch('takeProfitPercent', v)} />
        </div>
      </div>

      {/* Kill Switch */}
      <div className="rounded-2xl p-5" style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.12)' }}>
        <SectionHeader icon={Zap} title="Kill Switch" subtitle="Emergency stop: pauses all automated trading instantly" />
        <div className="space-y-3">
          <Toggle label="Enable Kill Switch" desc="Automatically pause all trading when drawdown limit is hit"
            value={draft.killSwitchEnabled} onChange={v => patch('killSwitchEnabled', v)} />
          {draft.killSwitchEnabled && (
            <NumberInput label="Trigger Threshold" value={draft.killSwitchThreshold} min={1} max={50}
              unit="% drawdown" onChange={v => patch('killSwitchThreshold', v)}
              highlight={draft.killSwitchThreshold > 20 ? 'red' : 'amber'} />
          )}
        </div>
      </div>

      {/* Trading Hours */}
      <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <SectionHeader icon={Clock} title="Trading Hours" subtitle="Restrict automated trading to specific hours" />
        <Toggle label="Restrict Trading Hours" desc="Only allow automated trades within the configured window"
          value={draft.tradingHoursEnabled} onChange={v => patch('tradingHoursEnabled', v)} />
        {draft.tradingHoursEnabled && (
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-white/60">Start Time (UTC)</label>
              <input type="time" value={draft.tradingHoursStart}
                onChange={e => patch('tradingHoursStart', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-white/60">End Time (UTC)</label>
              <input type="time" value={draft.tradingHoursEnd}
                onChange={e => patch('tradingHoursEnd', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors" />
            </div>
          </div>
        )}
      </div>

      {/* Notifications */}
      <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <SectionHeader icon={Bell} title="Notifications" subtitle="Get alerted on key trading events" />
        <div className="divide-y divide-white/5">
          <Toggle label="Alert on Trade" desc="Notify when a trade is placed or filled"
            value={draft.alertOnTrade} onChange={v => patch('alertOnTrade', v)} />
          <Toggle label="Alert on Loss" desc="Notify when a position closes at a loss"
            value={draft.alertOnLoss} onChange={v => patch('alertOnLoss', v)} />
          <Toggle label="Alert on Limit Reached" desc="Notify when daily or position limits are hit"
            value={draft.alertOnLimitReached} onChange={v => patch('alertOnLimitReached', v)} />
        </div>
      </div>

      {/* Save button (bottom) */}
      <button onClick={save} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary text-white font-black text-sm hover:brightness-110 transition-all">
        <Save className="h-4 w-4" /> Save Risk Controls
      </button>
    </div>
  );
}
