/**
 * SentimentAlerts.tsx — §3.5 Sentiment Alerts Page
 * Route: /sentiment/alerts
 *
 * • My Active Alerts table (name, condition, last trigger, status)
 * • Create New Alert form (named, all 7 condition types, 3 notification channels)
 * • Alert History log
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, Plus, Trash2, ToggleLeft, ToggleRight,
  RefreshCw, History, CheckCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSentimentStore } from '../../lib/sentimentStore';
import {
  CONDITION_META, TRACKED_SYMBOLS, MARKET_SYMBOL,
  type SentimentAlertCondition, type SentimentAlert,
} from '../../lib/sentimentTypes';
import { useAuthStore } from '../../lib/authStore';
import { timeAgoSentiment } from './sentimentUtils';
import { cn } from '@/lib/utils';

const ALL_SYMBOLS    = [MARKET_SYMBOL, ...TRACKED_SYMBOLS];
const ALL_CONDITIONS = Object.keys(CONDITION_META) as SentimentAlertCondition[];

const CONDITION_COLORS: Record<SentimentAlertCondition, string> = {
  fear_above:    '#f97316',
  fear_below:    '#ef4444',
  greed_above:   '#22c55e',
  greed_below:   '#86efac',
  overall_above: '#60a5fa',
  overall_below: '#a78bfa',
  volume_spike:  '#fbbf24',
};

const HISTORY_LOG = [
  { time: 'Jan 15, 14:32', desc: 'Twitter sentiment dropped to -0.6 (Panic)',          type: 'bearish'  },
  { time: 'Jan 14, 09:15', desc: 'Fear & Greed index reached 28 (Fear)',               type: 'neutral'  },
  { time: 'Jan 13, 22:00', desc: 'News sentiment turned strongly positive (+0.8)',     type: 'bullish'  },
  { time: 'Jan 12, 18:45', desc: 'Reddit BTC sentiment spike: +0.75 (Greed)',          type: 'bullish'  },
  { time: 'Jan 11, 07:20', desc: 'Market F&G entered Extreme Fear zone (index: 18)',   type: 'bearish'  },
  { time: 'Jan 10, 14:00', desc: 'Volume spike detected: 280K mentions in 1 hour',    type: 'neutral'  },
];

// ── Create Alert Form ─────────────────────────────────────────────────────────

function CreateAlertForm({ userId, onCreated }: { userId: string; onCreated: () => void }) {
  const { createAlert } = useSentimentStore();

  const [name,        setName]        = useState('');
  const [symbol,      setSymbol]      = useState('BTC');
  const [condition,   setCondition]   = useState<SentimentAlertCondition>('fear_below');
  const [threshold,   setThreshold]   = useState('25');
  const [notifyInApp, setNotifyInApp] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [notifyPush,  setNotifyPush]  = useState(false);
  const [errors,      setErrors]      = useState<string[]>([]);
  const [busy,        setBusy]        = useState(false);

  const condMeta = CONDITION_META[condition];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setErrors(['Alert name is required.']); return; }
    setBusy(true);
    const result = createAlert({
      userId,
      symbol,
      condition,
      threshold: parseFloat(threshold),
      notifyInApp,
      notifyEmail,
    });
    setBusy(false);
    if (result.ok) {
      toast.success(`Alert "${name}" created`);
      setName(''); setErrors([]);
      onCreated();
    } else {
      setErrors(result.errors ?? ['Unknown error']);
    }
  }

  const hasErrors = errors.length > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name */}
      <div>
        <label className="block text-[11px] font-bold text-muted-foreground mb-1.5">Alert Name</label>
        <input
          type="text"
          placeholder="e.g. BTC Panic Alert"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
        />
      </div>

      {/* Alert type quick-pick */}
      <div>
        <label className="block text-[11px] font-bold text-muted-foreground mb-1.5">Alert Type</label>
        <div className="flex flex-wrap gap-1.5">
          {(['fear_below', 'greed_above', 'overall_above', 'overall_below', 'volume_spike'] as SentimentAlertCondition[]).map(c => (
            <button key={c} type="button"
              onClick={() => { setCondition(c); }}
              className={cn(
                'px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all border',
                condition === c ? 'text-white' : 'text-muted-foreground border-white/8 hover:border-white/20',
              )}
              style={condition === c
                ? { background: `${CONDITION_COLORS[c]}15`, borderColor: `${CONDITION_COLORS[c]}35`, color: CONDITION_COLORS[c] }
                : {}}>
              {c === 'fear_below' ? '😱 F&G' : c === 'greed_above' ? '🤑 Greed' : c === 'overall_above' ? '📈 Social' : c === 'overall_below' ? '📉 Panic' : '⚡ Volume'}
            </button>
          ))}
        </div>
      </div>

      {/* Condition builder */}
      <div>
        <label className="block text-[11px] font-bold text-muted-foreground mb-1.5">Condition</label>
        <div className="rounded-xl border border-white/10 overflow-hidden"
          style={{ background: 'rgba(0,0,0,0.2)' }}>
          {/* Main row */}
          <div className="flex flex-wrap items-center gap-3 p-4">
            <span className="text-[11px] text-muted-foreground">When</span>
            <select value={condition}
              onChange={e => setCondition(e.target.value as SentimentAlertCondition)}
              className="px-3 py-1.5 rounded-lg bg-white/8 border border-white/12 text-xs text-foreground focus:outline-none">
              {ALL_CONDITIONS.map(c => (
                <option key={c} value={c}>{CONDITION_META[c].label}</option>
              ))}
            </select>

            <select value={symbol}
              onChange={e => setSymbol(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-white/8 border border-white/12 text-xs text-foreground focus:outline-none">
              {ALL_SYMBOLS.map(s => (
                <option key={s} value={s}>{s === MARKET_SYMBOL ? 'MARKET' : s}</option>
              ))}
            </select>

            <input type="number"
              min={condMeta.min} max={condMeta.max}
              step={condition.includes('overall') ? 0.1 : 1}
              value={threshold}
              onChange={e => setThreshold(e.target.value)}
              className="w-24 px-3 py-1.5 rounded-lg bg-white/8 border border-white/12 text-xs text-foreground focus:outline-none"
            />
            <span className="text-[11px] text-muted-foreground">{condMeta.unit || ''}</span>
          </div>
          {/* Description */}
          <div className="border-t border-white/5 px-4 py-2">
            <p className="text-[10px] text-muted-foreground/60">{condMeta.description} · Range: {condMeta.min}–{condMeta.max}</p>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div>
        <label className="block text-[11px] font-bold text-muted-foreground mb-2">Notification</label>
        <div className="flex items-center gap-6 flex-wrap">
          {[
            { label: '🔔 In-App', value: notifyInApp, set: setNotifyInApp },
            { label: '📧 Email',  value: notifyEmail, set: setNotifyEmail },
            { label: '📲 Push',   value: notifyPush,  set: setNotifyPush  },
          ].map(opt => (
            <label key={opt.label} className="flex items-center gap-2 cursor-pointer select-none">
              <button type="button" onClick={() => opt.set(!opt.value)}>
                {opt.value
                  ? <ToggleRight className="h-6 w-6 text-primary" />
                  : <ToggleLeft  className="h-6 w-6 text-muted-foreground/30" />}
              </button>
              <span className="text-xs text-muted-foreground">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Errors */}
      {hasErrors && (
        <div className="p-3 rounded-xl bg-red-400/6 border border-red-400/20">
          {errors.map(err => <p key={err} className="text-xs text-red-400">{err}</p>)}
        </div>
      )}

      <button type="submit" disabled={busy}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50">
        {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Create Alert
      </button>
    </form>
  );
}

// ── Alert row ─────────────────────────────────────────────────────────────────

function AlertRow({ alert, userId, onChanged }: {
  alert: SentimentAlert; userId: string; onChanged: () => void;
}) {
  const { toggleAlert, deleteAlert } = useSentimentStore();
  const condMeta  = CONDITION_META[alert.condition];
  const condColor = CONDITION_COLORS[alert.condition];

  function handleToggle() {
    const r = toggleAlert(alert.id, userId);
    if (r.ok) { toast.success(alert.isActive ? 'Alert paused' : 'Alert activated'); onChanged(); }
    else toast.error(r.error ?? 'Error');
  }

  function handleDelete() {
    if (!window.confirm(`Delete alert?`)) return;
    const r = deleteAlert(alert.id, userId);
    if (r.ok) { toast.success('Alert deleted'); onChanged(); }
    else toast.error(r.error ?? 'Error');
  }

  const alertName = `${alert.symbol} — ${condMeta.label} ${alert.threshold}${condMeta.unit}`;

  return (
    <tr className={cn('hover:bg-white/2 transition-colors', !alert.isActive && 'opacity-50')}>
      <td className="px-4 py-3 font-semibold text-xs text-foreground">{alertName}</td>
      <td className="px-4 py-3">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: `${condColor}10`, color: condColor, border: `1px solid ${condColor}20` }}>
          {condMeta.label} {alert.threshold}
        </span>
      </td>
      <td className="px-4 py-3 text-[11px] text-muted-foreground">
        {alert.lastTriggeredAt ? timeAgoSentiment(alert.lastTriggeredAt) : 'Never'}
      </td>
      <td className="px-4 py-3">
        <span className={cn(
          'text-[10px] font-bold px-2 py-0.5 rounded-full',
          alert.isActive ? 'bg-emerald-400/10 text-emerald-400' : 'bg-muted/20 text-muted-foreground',
        )}>
          {alert.isActive ? '● Active' : '○ Paused'}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <button onClick={handleToggle}
            className="p-1 rounded hover:bg-white/6 text-muted-foreground hover:text-foreground transition-all">
            {alert.isActive ? <ToggleRight className="h-4 w-4 text-emerald-400" /> : <ToggleLeft className="h-4 w-4" />}
          </button>
          <button onClick={handleDelete}
            className="p-1 rounded hover:bg-red-400/10 text-muted-foreground hover:text-red-400 transition-all">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── History log ───────────────────────────────────────────────────────────────

function AlertHistory({ alerts }: { alerts: SentimentAlert[] }) {
  // Merge triggered alerts with static log
  const triggered = alerts
    .filter(a => a.lastTriggeredAt)
    .sort((a, b) => b.lastTriggeredAt!.localeCompare(a.lastTriggeredAt!))
    .slice(0, 5)
    .map(a => ({
      time: new Date(a.lastTriggeredAt!).toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
      desc: `${a.symbol} — ${CONDITION_META[a.condition].label} ${a.threshold} triggered`,
      type: a.condition.includes('above') || a.condition === 'greed_above' ? 'bullish' : 'bearish',
    }));

  const combined = [...triggered, ...HISTORY_LOG].slice(0, 8);

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-center gap-2 px-5 py-4 border-b border-white/5">
        <History className="h-4 w-4 text-muted-foreground" />
        <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Alert History</p>
      </div>
      <div className="divide-y divide-white/4">
        {combined.map((entry, i) => (
          <div key={i} className="flex items-start gap-3 px-5 py-3 hover:bg-white/2 transition-colors">
            <div className={cn('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0',
              entry.type === 'bullish' ? 'bg-emerald-400' : entry.type === 'bearish' ? 'bg-red-400' : 'bg-amber-400'
            )} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-foreground">{entry.desc}</p>
            </div>
            <span className="text-[10px] text-muted-foreground/50 shrink-0">{entry.time}</span>
          </div>
        ))}
        {combined.length === 0 && (
          <p className="px-5 py-6 text-xs text-muted-foreground text-center">No alert history yet</p>
        )}
      </div>
    </div>
  );
}

// ── Condition legend ──────────────────────────────────────────────────────────

function ConditionLegend() {
  return (
    <div className="rounded-2xl p-5"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-3">Condition Types</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {ALL_CONDITIONS.map(c => (
          <div key={c} className="rounded-xl px-3 py-2.5"
            style={{ background: `${CONDITION_COLORS[c]}08`, border: `1px solid ${CONDITION_COLORS[c]}15` }}>
            <p className="text-[10px] font-bold" style={{ color: CONDITION_COLORS[c] }}>{CONDITION_META[c].label}</p>
            <p className="text-[9px] text-muted-foreground/60 mt-0.5">
              {CONDITION_META[c].unit || 'score'} · {CONDITION_META[c].min}–{CONDITION_META[c].max}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SentimentAlerts() {
  const { user } = useAuthStore();
  const userId   = user?.id ?? 'guest';
  const { getUserAlerts } = useSentimentStore();

  const [showCreate, setShowCreate] = useState(false);
  const [refresh,    setRefresh]    = useState(0);

  const allAlerts    = getUserAlerts(userId);
  const activeAlerts = allAlerts.filter(a => a.isActive);
  const triggered    = allAlerts.filter(a => a.triggerCount > 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-lg text-foreground">🔔 Sentiment Alerts</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {activeAlerts.length} active · {triggered.length} triggered · {allAlerts.length} total
          </p>
        </div>
        <button onClick={() => setShowCreate(s => !s)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
          <Plus className="h-3.5 w-3.5" /> Create
        </button>
      </div>

      {/* My Active Alerts table */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="px-5 py-4 border-b border-white/5">
          <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">My Active Alerts</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[500px]">
            <thead style={{ background: 'rgba(0,0,0,0.15)' }}>
              <tr className="text-[10px] text-muted-foreground uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Alert Name</th>
                <th className="px-4 py-3 text-left">Condition</th>
                <th className="px-4 py-3 text-left">Last Trigger</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/4">
              <AnimatePresence>
                {allAlerts.map(alert => (
                  <AlertRow
                    key={alert.id}
                    alert={alert}
                    userId={userId}
                    onChanged={() => setRefresh(r => r + 1)}
                  />
                ))}
              </AnimatePresence>
              {allAlerts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center">
                    <Bell className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">No alerts yet — create your first one below</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create alert form */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <button
          onClick={() => setShowCreate(s => !s)}
          className="w-full flex items-center justify-between px-5 py-4 border-b border-white/5 hover:bg-white/2 transition-colors">
          <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Create New Alert</p>
          <span className="text-muted-foreground">{showCreate ? '▲' : '▼'}</span>
        </button>
        <AnimatePresence>
          {showCreate && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
              <div className="p-5" style={{ background: 'rgba(96,165,250,0.03)' }}>
                <CreateAlertForm userId={userId} onCreated={() => {
                  setShowCreate(false);
                  setRefresh(r => r + 1);
                }} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* History */}
      <AlertHistory alerts={allAlerts} />

      {/* Condition legend */}
      <ConditionLegend />
    </div>
  );
}
