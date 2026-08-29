/**
 * AdminEvents.tsx — §6.1 Event Management Admin Page
 *
 * Layout (exact spec):
 *   ┌── KPI strip: active / upcoming / total participants / total prize
 *   ├── Active Events table: name | type | participants | status | actions
 *   └── Create New Event form: all fields per spec 6.1
 */
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy, Plus, Play, Square, Edit3, Trash2, AlertTriangle,
  Calendar, Users, DollarSign, Clock, Shield, ChevronDown,
  ChevronUp, Check, X, Zap, BarChart3, Radio, Globe, Terminal,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useEventsStore } from '../../../events/eventStore';
import { LiveEvent, EventType, EventStatus } from '../../../events/eventTypes';
import { useAdminAuthStore } from '@/lib/adminAuthStore';
import { useAuthStore } from '@/lib/authStore';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CreateEventForm {
  name:            string;
  type:            EventType;
  startDate:       string;
  startTime:       string;
  endDate:         string;
  endTime:         string;
  entryFee:        number;
  prizePool:       number;
  maxParticipants: string;     // "Unlimited" or number
  minLevel:        number;
  prizeRank1:      number;
  prizeRank2_5:    number;
  prizeRank6_20:   number;
  prizeRank21_100: number;
  maxLeverage:     number;
  minTrades:       number;
  notes:           string;
}

const DEFAULT_FORM: CreateEventForm = {
  name:            '',
  type:            'weekend_warrior',
  startDate:       '',
  startTime:       '00:00',
  endDate:         '',
  endTime:         '00:00',
  entryFee:        0,
  prizePool:       50000,
  maxParticipants: 'Unlimited',
  minLevel:        1,
  prizeRank1:      10000,
  prizeRank2_5:    5000,
  prizeRank6_20:   1000,
  prizeRank21_100: 250,
  maxLeverage:     10,
  minTrades:       5,
  notes:           '',
};

const EVENT_TYPE_OPTIONS: { value: EventType; label: string; icon: string }[] = [
  { value: 'weekend_warrior',      label: 'Weekend Warrior',      icon: '⚔️' },
  { value: 'monthly_championship', label: 'Monthly Championship', icon: '🏆' },
  { value: 'team_battle',          label: 'Team Battle',          icon: '🛡️' },
  { value: 'flash_challenge',      label: 'Flash Challenge',      icon: '⚡' },
  { value: 'live_webinar',         label: 'Live Webinar',         icon: '📺' },
  { value: 'market_analysis_live', label: 'Market Analysis Live', icon: '📊' },
];

const STATUS_COLORS: Record<EventStatus, string> = {
  upcoming:  'bg-blue-500/10 text-blue-400  border-blue-500/20',
  live:      'bg-red-500/10  text-red-400   border-red-500/20',
  completed: 'bg-white/5    text-white/30  border-white/10',
  cancelled: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
};

// ── KPI strip ──────────────────────────────────────────────────────────────────

function KPIStrip({ events }: { events: LiveEvent[] }) {
  const active   = events.filter(e => e.status === 'live').length;
  const upcoming = events.filter(e => e.status === 'upcoming').length;
  const total    = events.reduce((s, e) => s + e.currentParticipants, 0);
  const prize    = events.reduce((s, e) => s + e.prizePool, 0);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: 'Active',        value: active,                          color: '#ef4444', Icon: Radio },
        { label: 'Upcoming',      value: upcoming,                        color: '#60a5fa', Icon: Calendar },
        { label: 'Participants',  value: total.toLocaleString(),          color: '#a78bfa', Icon: Users },
        { label: 'Total Prizes',  value: `$${(prize/1000).toFixed(0)}K`, color: '#f59e0b', Icon: DollarSign },
      ].map(k => (
        <div key={k.label} className="bg-white/[0.03] border border-white/8 rounded-2xl p-4">
          <k.Icon className="h-4 w-4 mb-2" style={{ color: k.color }} />
          <p className="text-xl font-bold text-white font-mono">{k.value}</p>
          <p className="text-xs text-white/40 mt-0.5">{k.label}</p>
        </div>
      ))}
    </div>
  );
}

// ── Event row ─────────────────────────────────────────────────────────────────

function EventRow({ event, onEdit, onForceStart, onForceEnd, onDelete }: {
  event:        LiveEvent;
  onEdit:       (e: LiveEvent) => void;
  onForceStart: (id: string)  => void;
  onForceEnd:   (id: string)  => void;
  onDelete:     (id: string)  => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const typeOpt = EVENT_TYPE_OPTIONS.find(t => t.value === event.type);

  return (
    <tr className="border-b border-white/4 last:border-0 hover:bg-white/2 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">{event.icon}</span>
          <div>
            <p className="font-bold text-sm text-white">{event.title}</p>
            <p className="text-[10px] text-white/40">{event.subtitle}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-white/60">
        {typeOpt?.icon} {typeOpt?.label}
      </td>
      <td className="px-4 py-3 text-sm text-white/80 font-mono">
        {event.currentParticipants.toLocaleString()}
        {event.maxParticipants && <span className="text-white/30"> / {event.maxParticipants.toLocaleString()}</span>}
      </td>
      <td className="px-4 py-3">
        <span className={cn('text-[10px] px-2 py-0.5 rounded-full border capitalize', STATUS_COLORS[event.status])}>
          {event.status === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse inline-block mr-1" />}
          {event.status}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-amber-400 font-mono">
        ${event.prizePool.toLocaleString()} CP
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          {/* Force Start */}
          {event.status === 'upcoming' && (
            <button onClick={() => onForceStart(event.id)}
              title="Force Start"
              className="p-1.5 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 transition-colors">
              <Play className="h-3 w-3" />
            </button>
          )}
          {/* Force End */}
          {event.status === 'live' && (
            <button onClick={() => onForceEnd(event.id)}
              title="Force End"
              className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 transition-colors">
              <Square className="h-3 w-3" />
            </button>
          )}
          {/* Edit */}
          <button onClick={() => onEdit(event)}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 border border-white/8 transition-colors">
            <Edit3 className="h-3 w-3" />
          </button>
          {/* Delete */}
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)}
              className="p-1.5 rounded-lg bg-red-500/5 hover:bg-red-500/15 text-red-500/60 hover:text-red-400 border border-red-500/10 hover:border-red-500/20 transition-colors">
              <Trash2 className="h-3 w-3" />
            </button>
          ) : (
            <>
              <button onClick={() => { onDelete(event.id); setConfirmDelete(false); }}
                className="p-1.5 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 transition-colors">
                <Check className="h-3 w-3" />
              </button>
              <button onClick={() => setConfirmDelete(false)}
                className="p-1.5 rounded-lg bg-white/5 text-white/40 border border-white/8 transition-colors">
                <X className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Field component ───────────────────────────────────────────────────────────

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-white/60">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = "w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-primary/40 focus:bg-white/8 transition-colors";
const selectCls = inputCls;

// ── Create form ───────────────────────────────────────────────────────────────

function CreateEventForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState<CreateEventForm>(DEFAULT_FORM);
  const [creating, setCreating] = useState(false);
  const [errors, setErrors]   = useState<Partial<Record<keyof CreateEventForm, string>>>({});

  function patch(key: keyof CreateEventForm, value: any) {
    setForm(prev => ({ ...prev, [key]: value }));
    setErrors(prev => ({ ...prev, [key]: undefined }));
  }

  function validate(): boolean {
    const e: typeof errors = {};
    if (!form.name.trim()) e.name = 'Required';
    if (!form.startDate)   e.startDate = 'Required';
    if (!form.endDate)     e.endDate = 'Required';
    if (form.prizePool < 0) e.prizePool = 'Must be ≥ 0';
    if (form.prizeRank1 + form.prizeRank2_5 * 4 + form.prizeRank6_20 * 15 + form.prizeRank21_100 * 80 > form.prizePool && form.prizePool > 0) {
      e.prizePool = 'Prize distribution exceeds pool';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleCreate() {
    if (!validate()) { toast.error('Please fix form errors'); return; }
    setCreating(true);
    await new Promise(r => setTimeout(r, 800));

    // Build a LiveEvent-shaped object and add it via store (getState() safe inside handler)
    const now = new Date();
    const startAt = new Date(`${form.startDate}T${form.startTime}:00Z`).toISOString();
    const endAt   = new Date(`${form.endDate}T${form.endTime}:00Z`).toISOString();
    const diffMs  = new Date(endAt).getTime() - new Date(startAt).getTime();
    const diffH   = Math.round(diffMs / 3600000);
    const durationLabel = diffH >= 720 ? '30 days' : diffH >= 168 ? '7 days' : diffH >= 48 ? '48 hours' : `${diffH}h`;

    const newEvent: LiveEvent = {
      id:              `admin-${Date.now()}`,
      type:            form.type,
      title:           form.name.trim(),
      subtitle:        form.notes.trim() || `${EVENT_TYPE_OPTIONS.find(t => t.value === form.type)?.label} · ${durationLabel}`,
      description:     form.notes.trim() || `Admin-created ${form.type} event with ${form.prizePool.toLocaleString()} CP prize pool.`,
      status:          new Date(startAt) <= now && new Date(endAt) > now ? 'live' : new Date(startAt) > now ? 'upcoming' : 'completed',
      difficulty:      'intermediate',
      startAt,
      endAt,
      durationLabel,
      maxParticipants: form.maxParticipants === 'Unlimited' ? null : parseInt(form.maxParticipants) || null,
      currentParticipants: 0,
      minLevel:        form.minLevel,
      teamSize:        form.type === 'team_battle' ? 5 : null,
      isTeamEvent:     form.type === 'team_battle',
      prize:           `$${(form.prizePool / 1000).toFixed(0)}K prize pool`,
      prizePool:       form.prizePool,
      rewards: [
        { rank: 1,     type: 'virtual_cash', value: form.prizeRank1,      label: '1st Place',     icon: '🥇' },
        { rank: 2,     type: 'virtual_cash', value: form.prizeRank2_5,    label: '2nd–5th Place',  icon: '🥈' },
        { rank: 3,     type: 'virtual_cash', value: form.prizeRank2_5,    label: '2nd–5th Place',  icon: '🥈' },
        { rank: 4,     type: 'virtual_cash', value: form.prizeRank2_5,    label: '2nd–5th Place',  icon: '🥈' },
        { rank: 5,     type: 'virtual_cash', value: form.prizeRank2_5,    label: '2nd–5th Place',  icon: '🥈' },
        { rank: 6,     type: 'virtual_cash', value: form.prizeRank6_20,   label: '6th–20th Place', icon: '🥉' },
        { rank: 'all', type: 'xp',           value: 100,                  label: 'Participant XP', icon: '⭐' },
      ],
      tags:          [form.type, 'admin-created'],
      rules: [
        { label: 'Max Leverage',  value: `${form.maxLeverage}x` },
        { label: 'Min Trades',    value: String(form.minTrades) },
        { label: 'Entry Fee',     value: form.entryFee > 0 ? `${form.entryFee} CP` : 'Free' },
      ],
      coverGradient: 'from-indigo-900 via-purple-900 to-slate-900',
      accentColor:   '#6366f1',
      icon:          EVENT_TYPE_OPTIONS.find(t => t.value === form.type)?.icon ?? '🏆',
      isHot:         false,
      isFeatured:    false,
    };

    useEventsStore.setState(state => ({ events: [newEvent, ...state.events] }));
    setCreating(false);
    setForm(DEFAULT_FORM);
    onCreated();
    toast.success(`✅ "${newEvent.title}" created successfully!`);
  }

  const prizeTotal = form.prizeRank1 + form.prizeRank2_5 * 4 + form.prizeRank6_20 * 15 + form.prizeRank21_100 * 80;
  const prizeOver  = form.prizePool > 0 && prizeTotal > form.prizePool;

  return (
    <div className="space-y-6">

      {/* Row 1 */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Event Name" required>
          <input value={form.name} onChange={e => patch('name', e.target.value)}
            placeholder="e.g. April Weekend Warrior"
            className={cn(inputCls, errors.name && 'border-red-500/50')} />
          {errors.name && <p className="text-red-400 text-[10px]">{errors.name}</p>}
        </Field>

        <Field label="Event Type" required>
          <select value={form.type} onChange={e => patch('type', e.target.value as EventType)} className={selectCls}>
            {EVENT_TYPE_OPTIONS.map(t => (
              <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
            ))}
          </select>
        </Field>
      </div>

      {/* Row 2: times */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Start Time (UTC)" required>
          <div className="flex gap-2">
            <input type="date" value={form.startDate} onChange={e => patch('startDate', e.target.value)}
              className={cn(inputCls, 'flex-1', errors.startDate && 'border-red-500/50')} />
            <input type="time" value={form.startTime} onChange={e => patch('startTime', e.target.value)}
              className={cn(inputCls, 'w-24')} />
          </div>
          {errors.startDate && <p className="text-red-400 text-[10px]">{errors.startDate}</p>}
        </Field>

        <Field label="End Time (UTC)" required>
          <div className="flex gap-2">
            <input type="date" value={form.endDate} onChange={e => patch('endDate', e.target.value)}
              className={cn(inputCls, 'flex-1', errors.endDate && 'border-red-500/50')} />
            <input type="time" value={form.endTime} onChange={e => patch('endTime', e.target.value)}
              className={cn(inputCls, 'w-24')} />
          </div>
          {errors.endDate && <p className="text-red-400 text-[10px]">{errors.endDate}</p>}
        </Field>
      </div>

      {/* Row 3: fees + pool */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Field label="Entry Fee (CP)">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-xs">CP</span>
            <input type="number" min="0" value={form.entryFee} onChange={e => patch('entryFee', +e.target.value)}
              className={cn(inputCls, 'pl-9')} />
          </div>
        </Field>

        <Field label="Prize Pool (CP)" required>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-xs">CP</span>
            <input type="number" min="0" value={form.prizePool} onChange={e => patch('prizePool', +e.target.value)}
              className={cn(inputCls, 'pl-9', errors.prizePool && 'border-red-500/50')} />
          </div>
          {errors.prizePool && <p className="text-red-400 text-[10px]">{errors.prizePool}</p>}
        </Field>

        <Field label="Max Participants">
          <input value={form.maxParticipants}
            onChange={e => patch('maxParticipants', e.target.value)}
            placeholder="Unlimited"
            className={inputCls} />
        </Field>
      </div>

      {/* Row 4: level + leverage + minTrades */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Field label="Min Level Required">
          <input type="number" min="0" max="100" value={form.minLevel}
            onChange={e => patch('minLevel', +e.target.value)}
            className={inputCls} />
        </Field>

        <Field label="Max Leverage">
          <select value={form.maxLeverage} onChange={e => patch('maxLeverage', +e.target.value)} className={selectCls}>
            {[1,2,3,5,10,20,50,100].map(v => (
              <option key={v} value={v}>{v}x</option>
            ))}
          </select>
        </Field>

        <Field label="Min Trades to Qualify">
          <input type="number" min="0" value={form.minTrades}
            onChange={e => patch('minTrades', +e.target.value)}
            className={inputCls} />
        </Field>
      </div>

      {/* Prize Distribution */}
      <div className="rounded-2xl p-5 space-y-4"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-black text-white">Prize Distribution</p>
          <span className={cn('text-xs font-bold', prizeOver ? 'text-red-400' : 'text-white/40')}>
            {prizeTotal.toLocaleString()} CP allocated {prizeOver ? '⚠️ OVER POOL' : ''}
          </span>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { key: 'prizeRank1',      label: '🥇 Rank 1', value: form.prizeRank1 },
            { key: 'prizeRank2_5',    label: '🥈 Rank 2–5 (each)', value: form.prizeRank2_5 },
            { key: 'prizeRank6_20',   label: '🥉 Rank 6–20 (each)', value: form.prizeRank6_20 },
            { key: 'prizeRank21_100', label: '🏅 Rank 21–100 (each)', value: form.prizeRank21_100 },
          ].map(({ key, label, value }) => (
            <Field key={key} label={label}>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-xs">CP</span>
                <input type="number" min="0" value={value}
                  onChange={e => patch(key as keyof CreateEventForm, +e.target.value)}
                  className={cn(inputCls, 'pl-9')} />
              </div>
            </Field>
          ))}
        </div>

        {/* Visual bar */}
        {form.prizePool > 0 && (
          <div className="space-y-1">
            <div className="h-2 rounded-full overflow-hidden flex gap-0.5">
              {[
                { v: form.prizeRank1,       c: '#f59e0b' },
                { v: form.prizeRank2_5 * 4, c: '#94a3b8' },
                { v: form.prizeRank6_20 * 15, c: '#cd7f32' },
                { v: form.prizeRank21_100 * 80, c: '#6366f1' },
              ].map((s, i) => {
                const pct = Math.min(100, (s.v / form.prizePool) * 100);
                return pct > 0 ? <div key={i} className="h-full rounded-sm" style={{ width: `${pct}%`, background: s.c }} /> : null;
              })}
            </div>
            <div className="flex gap-3 text-[10px] text-white/40">
              <span style={{ color: '#f59e0b' }}>■ Rank 1</span>
              <span style={{ color: '#94a3b8' }}>■ Rank 2-5</span>
              <span style={{ color: '#cd7f32' }}>■ Rank 6-20</span>
              <span style={{ color: '#6366f1' }}>■ Rank 21-100</span>
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      <Field label="Notes / Rules">
        <textarea value={form.notes} onChange={e => patch('notes', e.target.value)}
          rows={3} placeholder="Maximum leverage: 10x, Minimum trades: 5, …"
          className={cn(inputCls, 'resize-none')} />
      </Field>

      {/* Create button */}
      <button onClick={handleCreate} disabled={creating}
        className={cn(
          'w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm text-white transition-all',
          creating ? 'opacity-60 cursor-not-allowed' : 'bg-primary hover:brightness-110',
        )}>
        {creating
          ? <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Creating…</>
          : <><Plus className="h-5 w-5" /> Create Event</>}
      </button>
    </div>
  );
}

// ── Edit event modal ───────────────────────────────────────────────────────────

function EditEventModal({ event, onClose }: { event: LiveEvent; onClose: () => void }) {
  const [title, setTitle]             = useState(event.title);
  const [prizePool, setPrizePool]     = useState(event.prizePool);
  const [maxParticipants, setMaxP]    = useState(event.maxParticipants ?? 0);
  const [minLevel, setMinLevel]       = useState(event.minLevel);
  const [status, setStatus]           = useState<EventStatus>(event.status);
  const [saving, setSaving]           = useState(false);

  function handleSave() {
    setSaving(true);
    useEventsStore.setState(state => ({
      events: state.events.map(e =>
        e.id === event.id
          ? {
              ...e,
              title:           title.trim() || e.title,
              prizePool,
              prize:           `${(prizePool / 1000).toFixed(0)}K prize pool`,
              maxParticipants: maxParticipants > 0 ? maxParticipants : null,
              minLevel,
              status,
            }
          : e,
      ),
    }));
    toast.success(`"${title}" updated.`);
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Edit3 className="h-4 w-4 text-primary" /> Edit Event
          </h3>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="h-4 w-4" /></button>
        </div>

        <Field label="Event Name">
          <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Prize Pool (CP)">
            <input type="number" min="0" value={prizePool} onChange={e => setPrizePool(+e.target.value)} className={inputCls} />
          </Field>
          <Field label="Max Participants (0 = Unlimited)">
            <input type="number" min="0" value={maxParticipants} onChange={e => setMaxP(+e.target.value)} className={inputCls} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Min Level">
            <input type="number" min="0" value={minLevel} onChange={e => setMinLevel(+e.target.value)} className={inputCls} />
          </Field>
          <Field label="Status">
            <select value={status} onChange={e => setStatus(e.target.value as EventStatus)} className={selectCls}>
              {(['upcoming', 'live', 'completed', 'cancelled'] as EventStatus[]).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/60 text-sm font-semibold">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:brightness-110 disabled:opacity-60">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function AdminEvents() {
  const { events, triggerEventStart, triggerEventEnd } = useEventsStore();
  const [showCreate, setShowCreate] = useState(false);
  const [editEvent,  setEditEvent]  = useState<LiveEvent | null>(null);
  const [filter,     setFilter]     = useState<EventStatus | 'all'>('all');
  const navigate = useNavigate();

  const { session }     = useAdminAuthStore();
  const { user: appUser } = useAuthStore();
  // Same fallback SectionGuard/AdminPortalLayout already use: prefer the
  // dedicated Admin Portal session's level, but fall back to the main-app
  // role so a superadmin who never logged in through the standalone /admin
  // login form (adminAuthStore.session is null) isn't treated as Level 0
  // and blocked here — this was the root cause of superadmins seeing
  // "Level 4+ admin access required."
  const adminLevel = session?.level
    ?? (appUser?.role === 'super_admin' ? 6 : appUser?.role === 'admin' ? 3 : 1);
  if (adminLevel < 4) {
    return (
      <div className="p-6 flex items-center gap-3 rounded-2xl bg-red-500/5 border border-red-500/20">
        <Shield className="h-5 w-5 text-red-400" />
        <p className="text-white/60 text-sm">Level 4+ admin access required.</p>
      </div>
    );
  }

  const filtered = useMemo(() => {
    if (filter === 'all') return events;
    return events.filter(e => e.status === filter);
  }, [events, filter]);

  const active   = events.filter(e => e.status === 'live');
  const upcoming = events.filter(e => e.status === 'upcoming');

  function handleDelete(id: string) {
    useEventsStore.setState(state => ({ events: state.events.filter(e => e.id !== id) }));
    toast.success('Event deleted.');
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* Page title */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-400" /> Event Management
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/events/verify')}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 text-white/60 text-sm font-bold hover:bg-white/10 border border-white/8 transition-all">
            <Terminal className="h-4 w-4" /> Run Checks
          </button>
          <button onClick={() => setShowCreate(v => !v)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:brightness-110 transition-all">
            <Plus className="h-4 w-4" />
            {showCreate ? 'Cancel' : 'Create Event'}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <KPIStrip events={events} />

      {/* Create form */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="rounded-3xl p-6"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-sm font-black text-white mb-5 flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" /> Create New Event
            </p>
            <CreateEventForm onCreated={() => setShowCreate(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/3 border border-white/6 self-start w-fit">
        {(['all', 'live', 'upcoming', 'completed', 'cancelled'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all',
              filter === f ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70',
            )}>
            {f === 'all' ? `All (${events.length})` : `${f} (${events.filter(e => e.status === f).length})`}
          </button>
        ))}
      </div>

      {/* Active events table */}
      {active.length > 0 && filter === 'all' && (
        <div className="space-y-2">
          <p className="text-xs font-black text-red-400 uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse inline-block" />
            Active Events
          </p>
          <div className="rounded-2xl overflow-hidden border border-white/6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[680px]">
                <thead style={{ background: 'rgba(0,0,0,0.3)' }}>
                  <tr className="text-[10px] text-white/40 uppercase tracking-wider">
                    {['Event Name','Type','Participants','Status','Prize Pool','Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {active.map(ev => (
                    <EventRow key={ev.id} event={ev}
                      onEdit={setEditEvent}
                      onForceStart={triggerEventStart}
                      onForceEnd={triggerEventEnd}
                      onDelete={handleDelete} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* All events table */}
      <div className="space-y-2">
        <p className="text-xs font-black text-white/40 uppercase tracking-wider">
          {filter === 'all' ? 'All Events' : `${filter.charAt(0).toUpperCase() + filter.slice(1)} Events`}
        </p>
        <div className="rounded-2xl overflow-hidden border border-white/6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead style={{ background: 'rgba(0,0,0,0.3)' }}>
                <tr className="text-[10px] text-white/40 uppercase tracking-wider">
                  {['Event Name','Type','Participants','Status','Prize Pool','Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/3">
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-white/30 text-sm">No events</td></tr>
                ) : filtered.map(ev => (
                  <EventRow key={ev.id} event={ev}
                    onEdit={setEditEvent}
                    onForceStart={triggerEventStart}
                    onForceEnd={triggerEventEnd}
                    onDelete={handleDelete} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Upcoming summary */}
      {upcoming.length > 0 && (
        <div className="rounded-2xl p-5 space-y-3"
          style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <p className="text-xs font-black text-blue-400 uppercase tracking-wider">
            <Calendar className="inline h-3.5 w-3.5 mr-1" /> Upcoming Schedule
          </p>
          {upcoming.slice(0, 5).map(ev => (
            <div key={ev.id} className="flex items-center gap-3 text-sm">
              <span className="text-lg">{ev.icon}</span>
              <span className="text-white/80 font-bold flex-1">{ev.title}</span>
              <span className="text-white/40 text-xs">{new Date(ev.startAt).toLocaleDateString()}</span>
              <button onClick={() => triggerEventStart(ev.id)}
                className="px-2.5 py-1 rounded-lg bg-green-500/10 text-green-400 text-xs font-bold border border-green-500/20 hover:bg-green-500/20 transition-colors">
                Force Start
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editEvent && (
        <EditEventModal event={editEvent} onClose={() => setEditEvent(null)} />
      )}
    </div>
  );
}
