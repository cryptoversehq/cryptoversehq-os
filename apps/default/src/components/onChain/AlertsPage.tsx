/**
 * AlertsPage.tsx — Spec §3.5
 * Route: /on-chain/alerts
 *
 * Active alerts list + inline Create Alert form + history log.
 */
import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Plus, Settings, Trash2, Bell, BellOff,
  CheckCircle, AlertTriangle, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { useOnChainStore } from '../../lib/onChainStore';
import { useAuthStore } from '../../lib/authStore';
import {
  OnChainAlert, MonitoredChain, AlertCondition, ALERT_TEMPLATES,
} from '../../lib/onChainTypes';
import { ALL_CHAINS, CHAIN_DISPLAY, fmtUsd, timeAgo } from './onChainUtils';
import { cn } from '@/lib/utils';

// ── Alert row ─────────────────────────────────────────────────────────────────

function AlertRow({ alert, userId }: { alert: OnChainAlert; userId: string }) {
  const toggleAlert    = useOnChainStore(s => s.toggleAlert);
  const deleteAlert    = useOnChainStore(s => s.deleteAlert);
  const getAlertEvents = useOnChainStore(s => s.getAlertEvents);
  const chain          = CHAIN_DISPLAY[alert.chain];
  const lastEvent      = getAlertEvents(alert.id, 1)[0];

  return (
    <div className="grid items-center px-4 py-3.5 hover:bg-white/2 transition-colors border-b border-white/4 last:border-0"
      style={{ gridTemplateColumns: '1.5rem 1fr 1fr 6rem 4.5rem', gap: '0.75rem' }}>
      {/* Status dot */}
      <div className={cn('w-2 h-2 rounded-full shrink-0',
        alert.isActive ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground/30')} />

      {/* Name + condition */}
      <div className="min-w-0">
        <p className="font-semibold text-sm text-foreground truncate">{alert.name}</p>
        <p className="text-[11px] text-muted-foreground">
          <span style={{ color: chain.color }}>{chain.icon} {chain.abbr}</span>
          {' '}· {alert.condition === 'above' ? '≥' : '≤'} {fmtUsd(alert.minValue)}
          {alert.address ? ` · ${alert.address.slice(0, 8)}…` : ''}
        </p>
      </div>

      {/* Last trigger */}
      <div className="min-w-0">
        {lastEvent ? (
          <>
            <p className="text-xs font-semibold text-foreground">{fmtUsd(lastEvent.value)}</p>
            <p className="text-[11px] text-muted-foreground">{timeAgo(lastEvent.timestamp)}</p>
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">Never triggered</p>
        )}
      </div>

      {/* Trigger count */}
      <div className="text-center">
        <p className="text-sm font-bold">{alert.triggerCount}</p>
        <p className="text-[10px] text-muted-foreground">triggers</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 justify-end">
        <button onClick={() => { const r = toggleAlert(alert.id, userId); if (r.ok) toast.success(alert.isActive ? 'Alert paused' : 'Alert resumed'); }}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
          title={alert.isActive ? 'Pause alert' : 'Resume alert'}>
          {alert.isActive ? <Bell className="h-4 w-4 text-emerald-400" /> : <BellOff className="h-4 w-4" />}
        </button>
        <button onClick={() => { if (!confirm(`Delete "${alert.name}"?`)) return; const r = deleteAlert(alert.id, userId); if (r.ok) toast.success('Alert deleted'); }}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 transition-colors">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Create form ───────────────────────────────────────────────────────────────

interface CreateFormProps { userId: string; prefillAddress?: string; onCreated: () => void; }

function CreateForm({ userId, prefillAddress, onCreated }: CreateFormProps) {
  const createAlert = useOnChainStore(s => s.createAlert);
  const [form, setForm] = useState({
    name:        '',
    chain:       'ethereum' as MonitoredChain,
    condition:   'above' as AlertCondition,
    minValue:    1_000_000,
    address:     prefillAddress ?? '',
    notifyInApp: true,
    notifyEmail: false,
  });
  const [errors, setErrors] = useState<string[]>([]);

  function applyTemplate(t: typeof ALERT_TEMPLATES[0]) {
    setForm(f => ({ ...f, name: t.name, chain: t.chain, minValue: t.minValue, condition: t.condition }));
  }

  function submit() {
    const r = createAlert({ ...form, userId });
    if (r.ok) {
      toast.success('Alert created!');
      setForm({ name: '', chain: 'ethereum', condition: 'above', minValue: 1_000_000, address: '', notifyInApp: true, notifyEmail: false });
      setErrors([]);
      onCreated();
    } else {
      setErrors(r.errors ?? []);
    }
  }

  return (
    <div className="space-y-4">
      {/* Templates */}
      <div>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Quick Templates</p>
        <div className="flex flex-wrap gap-1.5">
          {ALERT_TEMPLATES.map(t => (
            <button key={t.name} onClick={() => applyTemplate(t)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border border-white/10 hover:border-white/20 transition-all">
              {t.icon} {t.name}
            </button>
          ))}
        </div>
      </div>

      {/* Alert Name */}
      <div>
        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Alert Name</label>
        <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="e.g. BTC Exchange Inflow Alert"
          className="w-full px-4 py-2.5 rounded-xl text-sm border bg-transparent focus:outline-none focus:border-primary/50 transition-colors"
          style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)' }} />
      </div>

      {/* Alert Type row */}
      <div>
        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Alert Type</label>
        <div className="flex gap-3 text-sm">
          {['Whale Transaction', 'Wallet Activity', 'Exchange Flow'].map(t => (
            <label key={t} className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="alertType" className="accent-primary" defaultChecked={t === 'Whale Transaction'} />
              <span className="text-muted-foreground">{t}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Chain */}
      <div>
        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Chain</label>
        <div className="flex flex-wrap gap-1.5">
          {ALL_CHAINS.map(c => (
            <button key={c} onClick={() => setForm(f => ({ ...f, chain: c }))}
              className={cn('px-3 py-2 rounded-xl text-xs font-bold border transition-all',
                form.chain === c ? 'border-transparent' : 'border-white/10 text-muted-foreground hover:border-white/20')}
              style={form.chain === c ? { background: `${CHAIN_DISPLAY[c].color}20`, color: CHAIN_DISPLAY[c].color, borderColor: `${CHAIN_DISPLAY[c].color}40` } : {}}>
              {CHAIN_DISPLAY[c].icon} {CHAIN_DISPLAY[c].name}
            </button>
          ))}
        </div>
      </div>

      {/* Condition */}
      <div className="rounded-2xl p-4 space-y-3"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Condition</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Amount</span>
          <select value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value as AlertCondition }))}
            className="px-3 py-1.5 rounded-xl text-xs font-bold border bg-transparent appearance-none"
            style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)', color: 'white' }}>
            <option value="above" style={{ background: '#0a1929' }}>&gt;</option>
            <option value="below" style={{ background: '#0a1929' }}>&lt;</option>
          </select>
          <input type="number" value={form.minValue} onChange={e => setForm(f => ({ ...f, minValue: +e.target.value }))}
            className="w-28 px-3 py-1.5 rounded-xl text-sm border bg-transparent focus:outline-none font-mono"
            style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)' }} />
          <span className="text-sm text-muted-foreground">USD</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">To/From</span>
          <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
            placeholder="Specific wallet or exchange (optional)"
            className="flex-1 min-w-0 px-3 py-1.5 rounded-xl text-xs border bg-transparent focus:outline-none font-mono"
            style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)' }} />
        </div>
      </div>

      {/* Notifications */}
      <div>
        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Notification</label>
        <div className="flex gap-4">
          {[
            { key: 'notifyInApp', label: 'In-App' },
            { key: 'notifyEmail', label: 'Email' },
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={(form as any)[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
                className="accent-primary" />
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

      <button onClick={submit}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold"
        style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: 'white' }}>
        <Plus className="h-4 w-4" /> Create Alert
      </button>
    </div>
  );
}

// ── History entry ─────────────────────────────────────────────────────────────

function HistoryEntry({ event }: { event: ReturnType<ReturnType<typeof useOnChainStore>['getUserEvents']>[0] }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-white/4 last:border-0">
      <Clock className="h-3.5 w-3.5 text-muted-foreground/40 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground">
          <span className="text-muted-foreground">{CHAIN_DISPLAY[event.chain]?.icon ?? '⛓'}</span>
          {' '}{fmtUsd(event.value)} moved
          {event.fromLabel ? ` from ${event.fromLabel}` : ''}
          {event.toLabel   ? ` to ${event.toLabel}` : ''}
        </p>
        <p className="text-[11px] text-muted-foreground font-mono">{event.txHash.slice(0, 20)}…</p>
      </div>
      <span className="text-[11px] text-muted-foreground shrink-0">{timeAgo(event.timestamp)}</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function AlertsPage() {
  const navigate       = useNavigate();
  const location       = useLocation();
  const { user }       = useAuthStore();
  const userId         = user?.id ?? 'demo_user';

  const getUserAlerts  = useOnChainStore(s => s.getUserAlerts);
  const getUserEvents  = useOnChainStore(s => s.getUserEvents);
  const markAllRead    = useOnChainStore(s => s.markAllRead);
  const getUnreadCount = useOnChainStore(s => s.getUnreadCount);

  const [showCreate, setShowCreate] = useState(false);

  const userAlerts = getUserAlerts(userId);
  const recentEvents = getUserEvents(userId, { chains: [], whaleTiers: [], alertIds: [], unreadOnly: false, minValue: 0, maxValue: Infinity, search: '', sortBy: 'newest' }).slice(0, 10);
  const unread = getUnreadCount(userId);

  const prefillAddress = (location.state as any)?.prefillAddress ?? '';

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-white/5 shrink-0">
        <button onClick={() => navigate('/on-chain')}
          className="p-2 rounded-xl hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="font-bold text-lg">🔔 On-Chain Alerts</h1>
        {unread > 0 && (
          <button onClick={() => markAllRead(userId)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-white/10 text-muted-foreground hover:text-foreground transition-colors">
            <CheckCircle className="h-3.5 w-3.5" /> Mark all read ({unread})
          </button>
        )}
        <button onClick={() => setShowCreate(s => !s)}
          className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold"
          style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: 'white' }}>
          <Plus className="h-4 w-4" /> Create
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">

          {/* ── Active alerts ───────────────────────────────────────── */}
          <section>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
              My Active Alerts ({userAlerts.length})
            </p>
            <div className="rounded-2xl overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {/* Table header */}
              <div className="grid px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-white/5"
                style={{ gridTemplateColumns: '1.5rem 1fr 1fr 6rem 4.5rem', gap: '0.75rem',
                  background: 'rgba(255,255,255,0.03)' }}>
                <span></span>
                <span>Alert Name</span>
                <span>Last Trigger</span>
                <span className="text-center">Triggers</span>
                <span className="text-right">Actions</span>
              </div>

              {userAlerts.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm">
                  No alerts yet — create one below.
                </div>
              ) : (
                userAlerts.map(a => <AlertRow key={a.id} alert={a} userId={userId} />)
              )}
            </div>
          </section>

          {/* ── Create Alert form ────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Create New Alert</p>
              <button onClick={() => setShowCreate(s => !s)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                {showCreate ? '▲ Collapse' : '▼ Expand'}
              </button>
            </div>
            <AnimatePresence>
              {(showCreate || prefillAddress) && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="rounded-2xl p-5"
                    style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <CreateForm userId={userId} prefillAddress={prefillAddress} onCreated={() => setShowCreate(false)} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {/* ── Alert history ────────────────────────────────────────── */}
          {recentEvents.length > 0 && (
            <section>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                Alert History (Last 7 days)
              </p>
              <div className="rounded-2xl p-4"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
                {recentEvents.map(e => <HistoryEntry key={e.id} event={e} />)}
              </div>
            </section>
          )}

        </div>
      </div>
    </div>
  );
}
