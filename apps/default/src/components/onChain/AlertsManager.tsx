/**
 * AlertsManager.tsx — Create and manage on-chain alerts
 *
 * Full CRUD interface for OnChainAlert with templates, form validation,
 * live event history per alert, and toggle/delete actions.
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, Plus, Trash2, ToggleLeft, ToggleRight, ChevronDown, ChevronUp,
  Zap, Shield, Edit3, X, CheckCircle, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useOnChainStore } from '../../lib/onChainStore';
import {
  OnChainAlert, MonitoredChain, ALERT_TEMPLATES, AlertCondition,
} from '../../lib/onChainTypes';
import { ALL_CHAINS, CHAIN_DISPLAY, fmtUsd, timeAgo } from './onChainUtils';
import { cn } from '@/lib/utils';

// ── Create / Edit modal ───────────────────────────────────────────────────────

interface ModalProps {
  existing?: OnChainAlert;
  userId:    string;
  onClose:   () => void;
}

function AlertModal({ existing, userId, onClose }: ModalProps) {
  const createAlert = useOnChainStore(s => s.createAlert);
  const updateAlert = useOnChainStore(s => s.updateAlert);

  const [form, setForm] = useState({
    name:            existing?.name            ?? '',
    chain:           existing?.chain           ?? 'ethereum' as MonitoredChain,
    address:         existing?.address         ?? '',
    minValue:        existing?.minValue        ?? 1_000_000,
    condition:       existing?.condition       ?? 'above' as AlertCondition,
    notifyEmail:     existing?.notifyEmail     ?? false,
    notifyInApp:     existing?.notifyInApp     ?? true,
    tokenAddress:    existing?.tokenAddress    ?? '',
    alertType:       existing?.alertType       ?? 'whale_transaction' as import('../../lib/onChainTypes').AlertType,
    minSignificance: existing?.minSignificance ?? 0.7,
  });
  const [errors, setErrors] = useState<string[]>([]);

  function applyTemplate(t: typeof ALERT_TEMPLATES[0]) {
    setForm(f => ({
      ...f,
      name:            t.name,
      chain:           t.chain,
      minValue:        t.minValue,
      condition:       t.condition,
      alertType:       t.alertType,
      minSignificance: t.minSignificance,
    }));
  }

  function handleSubmit() {
    if (existing) {
      const res = updateAlert(existing.id, userId, {
        name: form.name, address: form.address, minValue: form.minValue,
        condition: form.condition, notifyEmail: form.notifyEmail, notifyInApp: form.notifyInApp,
      });
      if (res.ok) { toast.success('Alert updated!'); onClose(); }
      else        { setErrors([res.error ?? 'Unknown error']); }
    } else {
      const res = createAlert({
        ...form,
        userId,
        alertType:       form.alertType,
        minSignificance: form.minSignificance,
      });
      if (res.ok) {
        toast.success('Alert created! Monitoring started.');
        onClose();
      } else {
        setErrors(res.errors ?? []);
      }
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="fixed inset-4 sm:inset-auto sm:left-1/2 sm:-translate-x-1/2 sm:top-20 sm:w-full sm:max-w-xl z-[55] rounded-2xl flex flex-col"
        style={{ background: '#060F1A', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 30px 80px rgba(0,0,0,0.7)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <h2 className="font-bold">{existing ? 'Edit Alert' : 'Create Alert'}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Templates (only on create) */}
          {!existing && (
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Quick Templates</p>
              <div className="flex flex-wrap gap-1.5">
                {ALERT_TEMPLATES.map(t => (
                  <button key={t.name} onClick={() => applyTemplate(t)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border border-white/10 hover:border-white/20 transition-all">
                    <span>{t.icon}</span>{t.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Alert Name */}
          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Alert Name</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Whale Alert ETH"
              className="w-full px-4 py-2.5 rounded-xl text-sm border bg-transparent transition-colors focus:outline-none focus:border-primary/50"
              style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)' }} />
          </div>

          {/* Chain */}
          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Blockchain</label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_CHAINS.map(c => (
                <button key={c} onClick={() => setForm(f => ({ ...f, chain: c }))}
                  className={cn('px-3 py-2 rounded-xl text-xs font-bold border transition-all',
                    form.chain === c ? 'border-transparent' : 'border-white/10 text-muted-foreground hover:border-white/20')}
                  style={form.chain === c ? {
                    background: `${CHAIN_DISPLAY[c].color}20`,
                    color: CHAIN_DISPLAY[c].color,
                    borderColor: `${CHAIN_DISPLAY[c].color}40`,
                  } : {}}>
                  {CHAIN_DISPLAY[c].icon} {CHAIN_DISPLAY[c].name}
                </button>
              ))}
            </div>
          </div>

          {/* Alert Type */}
          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Alert Type</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: 'whale_transaction', icon: '🐋', label: 'Whale Tx' },
                { value: 'wallet_activity',   icon: '👁️', label: 'Wallet' },
                { value: 'exchange_flow',     icon: '🏦', label: 'Exchange' },
              ] as const).map(opt => (
                <button key={opt.value} onClick={() => setForm(f => ({ ...f, alertType: opt.value }))}
                  className={cn('flex flex-col items-center gap-1 py-2 rounded-xl text-xs font-bold border transition-all',
                    form.alertType === opt.value
                      ? 'border-primary/50 bg-primary/10 text-primary'
                      : 'border-white/10 text-muted-foreground hover:border-white/20')}>
                  <span className="text-sm">{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Condition + Value */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Condition</label>
              <select value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value as AlertCondition }))}
                className="w-full px-4 py-2.5 rounded-xl text-sm border bg-transparent appearance-none"
                style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)', color: 'white' }}>
                <option value="above" style={{ background: '#0a1929' }}>Value Above</option>
                <option value="below" style={{ background: '#0a1929' }}>Value Below</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                Threshold (USD)
              </label>
              <input type="number" value={form.minValue}
                onChange={e => setForm(f => ({ ...f, minValue: +e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl text-sm border bg-transparent focus:outline-none focus:border-primary/50"
                style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)' }} />
            </div>
          </div>

          {/* Significance threshold — only for whale_transaction type */}
          {form.alertType === 'whale_transaction' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Min Significance
                </label>
                <span className="text-xs font-mono font-bold text-primary">
                  {Math.round(form.minSignificance * 100)}%
                </span>
              </div>
              <input type="range" min="0.2" max="1.0" step="0.05"
                value={form.minSignificance}
                onChange={e => setForm(f => ({ ...f, minSignificance: parseFloat(e.target.value) }))}
                className="w-full accent-primary" />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                <span>20% (low)</span><span>70% (recommended)</span><span>100% (strict)</span>
              </div>
            </div>
          )}

          {/* Address (optional) */}
          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
              Wallet Address <span className="text-muted-foreground/50 normal-case font-normal">(optional — blank = any address)</span>
            </label>
            <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              placeholder="0x... or leave blank to monitor all"
              className="w-full px-4 py-2.5 rounded-xl text-sm border bg-transparent focus:outline-none font-mono"
              style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)' }} />
          </div>

          {/* Notifications */}
          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Notifications</label>
            <div className="flex gap-3">
              {[
                { key: 'notifyInApp', label: 'In-App' },
                { key: 'notifyEmail', label: 'Email' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                  <div onClick={() => setForm(f => ({ ...f, [key]: !f[key as keyof typeof f] }))}
                    className={cn('w-10 h-5 rounded-full transition-all flex items-center px-0.5',
                      (form as any)[key] ? 'bg-primary' : 'bg-white/10')}>
                    <div className={cn('w-4 h-4 rounded-full bg-white transition-transform shadow',
                      (form as any)[key] ? 'translate-x-5' : 'translate-x-0')} />
                  </div>
                  <span className="text-sm text-muted-foreground">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div className="rounded-xl p-3 bg-red-500/10 border border-red-500/20">
              {errors.map((e, i) => (
                <p key={i} className="text-sm text-red-400 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{e}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/5 flex justify-end gap-3">
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold border border-white/10 text-muted-foreground hover:text-foreground transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit}
            className="px-5 py-2 rounded-xl text-sm font-bold transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: 'white' }}>
            {existing ? 'Save Changes' : 'Create Alert'}
          </button>
        </div>
      </motion.div>
    </>
  );
}

// ── Alert card ────────────────────────────────────────────────────────────────

function AlertCard({ alert, userId }: { alert: OnChainAlert; userId: string }) {
  const toggleAlert = useOnChainStore(s => s.toggleAlert);
  const deleteAlert = useOnChainStore(s => s.deleteAlert);
  const getAlertEvents = useOnChainStore(s => s.getAlertEvents);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing]   = useState(false);

  const chain  = CHAIN_DISPLAY[alert.chain];
  const events = getAlertEvents(alert.id, 5);

  function handleToggle() {
    const res = toggleAlert(alert.id, userId);
    if (res.ok) toast.success(alert.isActive ? 'Alert paused' : 'Alert resumed');
  }

  function handleDelete() {
    if (!confirm(`Delete alert "${alert.name}"?`)) return;
    const res = deleteAlert(alert.id, userId);
    if (res.ok) toast.success('Alert deleted');
  }

  return (
    <>
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.025)', border: `1px solid ${alert.isActive ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'}` }}>
        {/* Card header */}
        <div className="flex items-center gap-3 px-4 py-3.5">
          {/* Status dot */}
          <div className={cn('w-2 h-2 rounded-full shrink-0', alert.isActive ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground/30')} />

          {/* Chain icon */}
          <span className="text-lg font-bold shrink-0" style={{ color: chain.color }}>{chain.icon}</span>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm truncate">{alert.name}</p>
              {!alert.isActive && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-muted-foreground/10 text-muted-foreground">Paused</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {chain.name} · {alert.condition === 'above' ? '≥' : '≤'} {fmtUsd(alert.minValue)}
              {alert.address && ` · ${alert.address.slice(0, 8)}…`}
            </p>
          </div>

          {/* Trigger count */}
          <div className="text-right shrink-0 hidden sm:block">
            <p className="text-xs font-bold text-foreground">{alert.triggerCount}</p>
            <p className="text-[10px] text-muted-foreground">triggers</p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={handleToggle} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
              {alert.isActive
                ? <ToggleRight className="h-5 w-5 text-emerald-400" />
                : <ToggleLeft  className="h-5 w-5" />}
            </button>
            <button onClick={() => setEditing(true)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
              <Edit3 className="h-4 w-4" />
            </button>
            <button onClick={handleDelete} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 transition-colors">
              <Trash2 className="h-4 w-4" />
            </button>
            <button onClick={() => setExpanded(e => !e)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Expanded event history */}
        <AnimatePresence>
          {expanded && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="border-t border-white/5 px-4 pb-3 pt-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Recent Triggers</p>
                {events.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">No events yet — monitoring is {alert.isActive ? 'active' : 'paused'}.</p>
                ) : (
                  events.map(e => (
                    <div key={e.id} className="flex items-center justify-between py-1.5 border-b border-white/4 last:border-0">
                      <div>
                        <span className="font-mono text-xs text-muted-foreground">{e.txHash.slice(0, 12)}…</span>
                        {e.fromLabel && <span className="text-xs text-muted-foreground ml-2 opacity-60">from {e.fromLabel}</span>}
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-emerald-400">{fmtUsd(e.value)}</span>
                        <span className="text-[10px] text-muted-foreground ml-2">{timeAgo(e.timestamp)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Edit modal */}
      <AnimatePresence>
        {editing && (
          <AlertModal existing={alert} userId={userId} onClose={() => setEditing(false)} />
        )}
      </AnimatePresence>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props { userId: string; }

export function AlertsManager({ userId }: Props) {
  const alerts         = useOnChainStore(s => s.alerts);
  const getUserAlerts  = useOnChainStore(s => s.getUserAlerts);
  const markAllRead    = useOnChainStore(s => s.markAllRead);
  const getUnreadCount = useOnChainStore(s => s.getUnreadCount);
  const [showCreate, setShowCreate] = useState(false);

  const userAlerts = getUserAlerts(userId);
  const unread     = getUnreadCount(userId);
  const active     = userAlerts.filter(a => a.isActive).length;

  return (
    <div className="flex flex-col gap-5">

      {/* ── Summary ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Alerts', value: userAlerts.length, icon: <Bell className="h-4 w-4" />, color: '#60a5fa' },
          { label: 'Active',       value: active,             icon: <Zap className="h-4 w-4" />,  color: '#34d399' },
          { label: 'Unread Events',value: unread,             icon: <Shield className="h-4 w-4" />, color: unread > 0 ? '#FFD700' as string : '#6b7280' as string },
        ].map(s => (
          <div key={s.label} className="rounded-2xl p-4"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center gap-1.5 mb-1" style={{ color: s.color }}>
              {s.icon}
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{s.label}</span>
            </div>
            <p className="font-black text-2xl" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Toolbar ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {unread > 0 && (
            <button onClick={() => markAllRead(userId)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-white/10 text-muted-foreground hover:text-foreground transition-colors">
              <CheckCircle className="h-3.5 w-3.5" />
              Mark all read
            </button>
          )}
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all hover:opacity-90"
          style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: 'white' }}>
          <Plus className="h-4 w-4" />
          New Alert
        </button>
      </div>

      {/* ── Alert list ────────────────────────────────────────────────── */}
      {userAlerts.length === 0 ? (
        <div className="rounded-2xl py-16 text-center"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <Bell className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="text-muted-foreground mb-2">No alerts configured yet.</p>
          <p className="text-sm text-muted-foreground/60 mb-4">Create an alert to start tracking whale movements.</p>
          <button onClick={() => setShowCreate(true)}
            className="px-5 py-2 rounded-xl text-sm font-bold"
            style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: 'white' }}>
            + Create First Alert
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {userAlerts.map(alert => (
            <AlertCard key={alert.id} alert={alert} userId={userId} />
          ))}
        </div>
      )}

      {/* Create modal */}
      <AnimatePresence>
        {showCreate && (
          <AlertModal userId={userId} onClose={() => setShowCreate(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
