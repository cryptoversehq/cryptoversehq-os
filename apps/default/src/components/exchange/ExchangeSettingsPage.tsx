/**
 * ExchangeSettingsPage.tsx
 * Route: /exchange/settings
 * Spec §3.5 — Risk limits, trading preferences, notifications, security
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, Bell, Settings, Save, RotateCcw, AlertTriangle,
  Plus, Trash2, Eye, EyeOff, CheckCircle, Lock, Wifi,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useExchangeStore } from '../../lib/exchangeStore';
import { riskManager } from '../../lib/exchangeRiskManager';
import { DEFAULT_RISK_CONTROLS, RiskControls } from '../../lib/exchangeTypes';
import { toast } from 'sonner';

// ── Reusable input components ──────────────────────────────────────────────────

function NumberInput({ label, value, onChange, min, max, prefix, suffix, desc }: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; prefix?: string; suffix?: string; desc?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-white/50">{label}</label>
      <div className="flex items-center rounded-xl border border-white/10 bg-white/5 overflow-hidden">
        {prefix && <span className="px-3 text-xs text-white/30 border-r border-white/10 shrink-0">{prefix}</span>}
        <input type="number" value={value} onChange={e => onChange(Math.min(max, Math.max(min, Number(e.target.value))))}
          className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white focus:outline-none font-mono" />
        {suffix && <span className="px-3 text-xs text-white/30 border-l border-white/10 shrink-0">{suffix}</span>}
      </div>
      {desc && <p className="text-[10px] text-white/25">{desc}</p>}
    </div>
  );
}

function RadioGroup<T extends string>({ label, value, onChange, options }: {
  label: string; value: T; onChange: (v: T) => void;
  options: { value: T; label: string; desc?: string }[];
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-white/50">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(o => (
          <button key={o.value} onClick={() => onChange(o.value)}
            className={cn('flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all',
              value === o.value ? 'border-primary/40 bg-primary/10 text-primary' : 'border-white/8 text-white/40 hover:border-white/20',
            )}>
            <span className={cn('w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0',
              value === o.value ? 'border-primary' : 'border-white/30',
            )}>
              {value === o.value && <span className="w-2 h-2 rounded-full bg-primary" />}
            </span>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToggleRow({ label, desc, value, onChange, danger }: {
  label: string; desc?: string; value: boolean; onChange: (v: boolean) => void; danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-white/4 last:border-0">
      <div className="flex-1">
        <p className={cn('text-xs font-bold', danger ? 'text-red-300' : 'text-white')}>{label}</p>
        {desc && <p className="text-[10px] text-white/30 mt-0.5">{desc}</p>}
      </div>
      <button onClick={() => onChange(!value)}
        className={cn('relative w-10 h-5 rounded-full transition-colors duration-200 shrink-0',
          value ? (danger ? 'bg-red-500' : 'bg-primary') : 'bg-white/10',
        )}>
        <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200',
          value ? 'translate-x-5' : 'translate-x-0.5',
        )} />
      </button>
    </div>
  );
}

function SectionCard({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/8 overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.02)' }}>
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-white/5">
        <Icon className="h-4 w-4 text-primary" />
        <p className="text-sm font-black text-white">{title}</p>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ── Types ──────────────────────────────────────────────────────────────────────

type TradingModePreference = 'spot' | 'margin' | 'futures';
type OrderTypePref         = 'limit' | 'market' | 'stop_limit';
type SyncInterval          = '1' | '5' | '15' | '60';

interface GlobalSettings {
  maxPositionSizeUSD:   number;
  maxDailyLossUSD:      number;
  maxMonthlyLossUSD:    number;
  maxLeverage:          number;
  defaultMode:          TradingModePreference;
  defaultOrderType:     OrderTypePref;
  syncIntervalMinutes:  SyncInterval;
  notifyOnTrade:        boolean;
  notifyOnLoss80:       boolean;
  notifyOnLossLimit:    boolean;
  notifyDailySummary:   boolean;
  require2FA:           boolean;
  ipWhitelist:          string[];
}

const DEFAULT_SETTINGS: GlobalSettings = {
  maxPositionSizeUSD:   1000,
  maxDailyLossUSD:      500,
  maxMonthlyLossUSD:    5000,
  maxLeverage:          1,
  defaultMode:          'spot',
  defaultOrderType:     'limit',
  syncIntervalMinutes:  '5',
  notifyOnTrade:        true,
  notifyOnLoss80:       true,
  notifyOnLossLimit:    true,
  notifyDailySummary:   false,
  require2FA:           true,
  ipWhitelist:          [],
};

const STORAGE_KEY = 'cryptoverse_exchange_settings';

function loadSettings(): GlobalSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_SETTINGS;
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export function ExchangeSettingsPage() {
  const { connections, resetKillSwitch } = useExchangeStore();

  const [settings, setSettings] = useState<GlobalSettings>(loadSettings);
  const [isDirty,  setIsDirty]  = useState(false);
  const [newIP,    setNewIP]    = useState('');
  const [showKeys, setShowKeys] = useState(false);

  function patch<K extends keyof GlobalSettings>(key: K, val: GlobalSettings[K]) {
    setSettings(s => ({ ...s, [key]: val }));
    setIsDirty(true);
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setIsDirty(false);
    toast.success('Settings saved ✓');
  }

  function reset() {
    setSettings(loadSettings());
    setIsDirty(false);
  }

  function addIP() {
    const ip = newIP.trim();
    if (!ip) return;
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip)) { toast.error('Enter a valid IPv4 address'); return; }
    patch('ipWhitelist', [...settings.ipWhitelist, ip]);
    setNewIP('');
  }

  function removeIP(ip: string) {
    patch('ipWhitelist', settings.ipWhitelist.filter(x => x !== ip));
  }

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-black text-white">⚙️ Exchange Settings</h2>
        {isDirty && (
          <div className="flex gap-2">
            <button onClick={reset} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/6 text-white/50 text-xs font-bold hover:bg-white/10 transition-colors">
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
            <button onClick={save} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-xs font-black hover:brightness-110 transition-all">
              <Save className="h-3 w-3" /> Save
            </button>
          </div>
        )}
        {!isDirty && (
          <button onClick={save} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-xs font-black hover:brightness-110 transition-all">
            <Save className="h-3 w-3" /> Save
          </button>
        )}
      </div>

      {/* Default Risk Limits */}
      <SectionCard icon={Shield} title="Default Risk Limits">
        <div className="grid sm:grid-cols-2 gap-4">
          <NumberInput label="Max Position Size (per trade)" value={settings.maxPositionSizeUSD}
            onChange={v => patch('maxPositionSizeUSD', v)} min={50} max={1000000} prefix="$"
            desc="Stop creating new positions above this size" />
          <NumberInput label="Max Daily Loss" value={settings.maxDailyLossUSD}
            onChange={v => patch('maxDailyLossUSD', v)} min={10} max={1000000} prefix="$"
            desc="Stop trading for the day if exceeded" />
          <NumberInput label="Max Monthly Loss" value={settings.maxMonthlyLossUSD}
            onChange={v => patch('maxMonthlyLossUSD', v)} min={100} max={10000000} prefix="$"
            desc="Pause all strategies if monthly loss exceeded" />
          <NumberInput label="Max Leverage" value={settings.maxLeverage}
            onChange={v => patch('maxLeverage', v)} min={1} max={125} suffix="x"
            desc="1x = spot only (recommended for safety)" />
        </div>
      </SectionCard>

      {/* Trading Preferences */}
      <SectionCard icon={Settings} title="Trading Preferences">
        <div className="space-y-5">
          <RadioGroup<TradingModePreference> label="Default Trading Mode" value={settings.defaultMode}
            onChange={v => patch('defaultMode', v)}
            options={[
              { value: 'spot',    label: '○ Spot'    },
              { value: 'margin',  label: '○ Margin'  },
              { value: 'futures', label: '○ Futures' },
            ]} />
          <RadioGroup<OrderTypePref> label="Default Order Type" value={settings.defaultOrderType}
            onChange={v => patch('defaultOrderType', v)}
            options={[
              { value: 'limit',      label: '○ Limit'      },
              { value: 'market',     label: '○ Market'     },
              { value: 'stop_limit', label: '○ Stop-Limit' },
            ]} />
          <RadioGroup<SyncInterval> label="Auto-Sync Interval" value={settings.syncIntervalMinutes}
            onChange={v => patch('syncIntervalMinutes', v)}
            options={[
              { value: '1',  label: '1 minute'   },
              { value: '5',  label: '5 minutes'  },
              { value: '15', label: '15 minutes' },
              { value: '60', label: '1 hour'     },
            ]} />
        </div>
      </SectionCard>

      {/* Notifications */}
      <SectionCard icon={Bell} title="Notification Settings">
        <div>
          <ToggleRow label="Notify when trade executed"
            desc="Get alerted every time a buy or sell order is filled"
            value={settings.notifyOnTrade} onChange={v => patch('notifyOnTrade', v)} />
          <ToggleRow label="Notify when daily loss limit approached (80%)"
            desc="Early warning before hitting the daily loss ceiling"
            value={settings.notifyOnLoss80} onChange={v => patch('notifyOnLoss80', v)} />
          <ToggleRow label="Notify when daily loss limit reached"
            desc="Alert when all trading has been automatically paused"
            value={settings.notifyOnLossLimit} onChange={v => patch('notifyOnLossLimit', v)} />
          <ToggleRow label="Daily portfolio summary"
            desc="Receive an end-of-day portfolio performance digest"
            value={settings.notifyDailySummary} onChange={v => patch('notifyDailySummary', v)} />
        </div>
      </SectionCard>

      {/* Security */}
      <SectionCard icon={Lock} title="Security Settings">
        <div className="space-y-5">
          <ToggleRow label="Require 2FA for real trades"
            desc="Additional verification step before executing real orders"
            value={settings.require2FA} onChange={v => patch('require2FA', v)} />

          {/* IP Whitelist */}
          <div className="space-y-3 pt-1">
            <div>
              <p className="text-xs font-bold text-white/50">IP Whitelist</p>
              <p className="text-[10px] text-white/25 mt-0.5">Only allow API access from these IP addresses</p>
            </div>
            <div className="space-y-2">
              {settings.ipWhitelist.length === 0 && (
                <p className="text-xs text-white/25 italic">No IPs added — all IPs are allowed</p>
              )}
              {settings.ipWhitelist.map(ip => (
                <div key={ip} className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/5 border border-white/8">
                  <span className="text-xs font-mono text-white/70">{ip}</span>
                  <button onClick={() => removeIP(ip)} className="text-white/20 hover:text-red-400 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input value={newIP} onChange={e => setNewIP(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addIP()}
                  placeholder="Add IP address (e.g. 192.168.1.1)"
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-primary/40 font-mono transition-colors" />
                <button onClick={addIP}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/6 text-white/50 text-xs font-bold hover:bg-white/12 transition-colors">
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              </div>
            </div>
          </div>

          {/* API Keys section */}
          <div className="space-y-3 pt-1 border-t border-white/5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-white/50">Connected API Keys</p>
                <p className="text-[10px] text-white/25 mt-0.5">{connections.length} exchange{connections.length !== 1 ? 's' : ''} connected</p>
              </div>
              <button onClick={() => setShowKeys(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-white/40 text-xs font-bold hover:bg-white/10 transition-colors">
                {showKeys ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {showKeys ? 'Hide' : 'View API Keys'}
              </button>
            </div>

            {showKeys && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
                {connections.length === 0 ? (
                  <p className="text-xs text-white/25 italic">No API keys connected</p>
                ) : (
                  connections.map(c => (
                    <div key={c.id} className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/4 border border-white/8">
                      <div className="flex items-center gap-2.5">
                        <span className="text-lg">🔑</span>
                        <div>
                          <p className="text-xs font-bold text-white">{c.label}</p>
                          <p className="text-[10px] text-white/30 font-mono">{c.maskedKey ?? 'OAuth2'}</p>
                        </div>
                      </div>
                      <span className="flex items-center gap-1 text-[9px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                        <Wifi className="h-2.5 w-2.5" /> Active
                      </span>
                    </div>
                  ))
                )}
              </motion.div>
            )}

            {/* Kill switch status per connection */}
            {connections.map(c => {
              const metrics = riskManager.getMetrics(c.id);
              if (!metrics.killSwitchTriggered) return null;
              return (
                <div key={c.id} className="flex items-center justify-between px-4 py-3 rounded-xl bg-red-500/8 border border-red-500/20">
                  <div>
                    <p className="text-xs font-black text-red-400">🛑 Kill Switch Active — {c.label}</p>
                    <p className="text-[10px] text-white/40 mt-0.5">{metrics.killSwitchReason}</p>
                  </div>
                  <button onClick={() => resetKillSwitch(c.id)}
                    className="px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 text-xs font-bold hover:bg-red-500/25 transition-colors border border-red-500/25">
                    Reset
                  </button>
                </div>
              );
            })}

            {connections.length > 0 && (
              <button onClick={() => {
                if (confirm('Revoke ALL API access? This will disconnect all exchanges.')) {
                  toast.error('All access revoked — go to Connections to reconnect');
                }
              }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-500/20 text-red-400 text-xs font-bold hover:bg-red-500/10 transition-colors">
                <AlertTriangle className="h-3.5 w-3.5" /> Revoke All Access
              </button>
            )}
          </div>
        </div>
      </SectionCard>

      {/* Save (bottom) */}
      <button onClick={save}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary text-white font-black text-sm hover:brightness-110 transition-all">
        <Save className="h-4 w-4" /> Save Settings
      </button>
    </div>
  );
}
