/**
 * AdminApiManagement.tsx — Super Admin · API Management
 *
 * Central control room for every external API the app depends on:
 * live status, one-click server-side key verification, kill switches,
 * expiry warnings and a per-API audit trail.
 *
 * NEW: Super admin can now add/edit/rotate/delete API keys directly from
 * this page — changes are saved to Space Settings → Secrets via
 * GenesisClient.secrets.set/delete. No deploy needed.
 *
 * ── Access ──
 * SUPER ADMIN ONLY (Level 6 / role 'super_admin').
 *
 * ── Security ──
 * Keys are saved/rotated server-side via GenesisClient.secrets — raw values
 * are never fetched, cached, or rendered. This page shows only alias names
 * and pass/fail test results.
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldAlert, ShieldCheck, Power, PowerOff, History, ChevronDown,
  RefreshCw, Loader2, AlertTriangle, KeyRound, Lock, ExternalLink,
  CalendarClock, Trash2, CheckCircle2, XCircle, MinusCircle, HelpCircle,
  Plus, Pencil, RotateCcw, Shield, Eye, EyeOff, LogIn,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAdminAuthStore } from '@/lib/adminAuthStore';
import { useAuthStore } from '@/lib/authStore';
import { ApiTestButton } from '@/components/admin/ApiTestButton';
import {
  API_REGISTRY, useApiMgmtStore, expiryLevel, daysUntil, EXPIRY_WARNING_DAYS,
  type ApiDefinition, type ApiHealth, type ApiId, type ApiLogEntry,
} from '@/lib/apiStatusService';
import {
  addSecret, editSecret, rotateSecret, removeSecret,
  getRecentAuditLog,
  type AuditAction, type AuditLogEntry,
} from '@/lib/apiManagementService';

// ─── Status meta ──────────────────────────────────────────────────────────────

const HEALTH_META: Record<ApiHealth, { label: string; emoji: string; cls: string; dot: string }> = {
  active:   { label: 'Active',    emoji: '✅', cls: 'bg-green-500/10 border-green-500/25 text-green-400', dot: 'bg-green-400' },
  inactive: { label: 'Inactive',  emoji: '❌', cls: 'bg-red-500/10 border-red-500/25 text-red-400',       dot: 'bg-red-400' },
  no_key:   { label: 'No key',    emoji: '⚠️', cls: 'bg-amber-500/10 border-amber-500/25 text-amber-400', dot: 'bg-amber-400' },
  unknown:  { label: 'Untested',  emoji: '❔', cls: 'bg-white/5 border-white/10 text-white/40',           dot: 'bg-white/30' },
  disabled: { label: 'Disabled',  emoji: '⏸️', cls: 'bg-white/5 border-white/10 text-white/30',           dot: 'bg-white/20' },
};

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ─── Audit helpers ───────────────────────────────────────────────────────────

const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  add: 'Added', edit: 'Edited', delete: 'Deleted', rotate: 'Rotated',
};

function formatAuditTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function maskEmail(email: string): string {
  if (!email.includes('@')) return email.slice(0, 6) + '…';
  const [local, domain] = email.split('@');
  return local.slice(0, 3) + '…@' + domain;
}

// ─── Add/Edit/Rotate Modal ───────────────────────────────────────────────────

interface SecretModalProps {
  open: boolean;
  mode: 'add' | 'edit' | 'rotate';
  /** For edit/rotate, the existing alias is locked. */
  existingAlias?: string;
  existingName?: string;
  actor: string;
  onClose: () => void;
  onDone: () => void;
}

function SecretModal({ open, mode, existingAlias, existingName, actor, onClose, onDone }: SecretModalProps) {
  const [apiName, setApiName] = useState(existingName ?? '');
  const [alias, setAlias] = useState(existingAlias ?? '');
  const [keyValue, setKeyValue] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setApiName(existingName ?? '');
      setAlias(existingAlias ?? '');
      setKeyValue('');
      setShowKey(false);
      setSaving(false);
    }
  }, [open, existingName, existingAlias]);

  if (!open) return null;

  const isEditOrRotate = mode === 'edit' || mode === 'rotate';
  const aliasLocked = isEditOrRotate;

  const title =
    mode === 'add'    ? 'Add New API Key' :
    mode === 'edit'   ? `Edit Key — ${existingName ?? alias}` :
    mode === 'rotate' ? `Rotate Key — ${existingName ?? alias}` : '';

  const canSave = saving ? false : (
    mode === 'add'
      ? apiName.trim() && alias.trim() && keyValue.trim()
      : keyValue.trim()
  );

  const handleSave = async () => {
    setSaving(true);
    let result;
    const targetAlias = aliasLocked ? (existingAlias!) : alias.trim().toLowerCase();
    if (mode === 'add') {
      result = await addSecret(targetAlias, keyValue, actor);
    } else if (mode === 'edit') {
      result = await editSecret(targetAlias, keyValue, actor);
    } else {
      result = await rotateSecret(targetAlias, keyValue, actor);
    }
    setSaving(false);

    if (result.ok) {
      toast.success(`"${targetAlias}" ${mode === 'add' ? 'saved' : 'updated'} in Space Secrets.`);
      onDone();
    } else {
      toast.error(`Failed to ${mode === 'add' ? 'save' : 'update'} "${targetAlias}": ${result.error ?? 'unknown'}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-[#12121d] shadow-2xl shadow-black/50 max-h-[90vh] overflow-y-auto"
      >
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              {mode === 'add' ? <Plus className="h-4 w-4 text-amber-400" /> : <RotateCcw className="h-4 w-4 text-amber-400" />}
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">{title}</h3>
              <p className="text-[10px] text-white/35">Saved to Space Settings → Secrets</p>
            </div>
          </div>

          {/* API Name (add mode only) */}
          {!isEditOrRotate && (
            <label className="block space-y-1.5">
              <span className="text-[11px] text-white/50">API Name</span>
              <input
                type="text"
                value={apiName}
                onChange={e => setApiName(e.target.value)}
                placeholder='e.g. "Twitter API"'
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-amber-500/40 transition-colors"
              />
            </label>
          )}

          {/* Secret Alias */}
          <label className="block space-y-1.5">
            <span className="text-[11px] text-white/50">Secret Alias {aliasLocked && <span className="text-white/25">(locked)</span>}</span>
            <input
              type="text"
              value={alias}
              onChange={e => setAlias(e.target.value)}
              disabled={aliasLocked}
              placeholder='e.g. "twitter_bearer"'
              className={cn(
                'w-full bg-white/5 border rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/20 outline-none transition-colors font-mono',
                aliasLocked
                  ? 'border-white/8 text-white/40 cursor-not-allowed bg-white/2'
                  : 'border-white/10 focus:border-amber-500/40',
              )}
            />
            <p className="text-[10px] text-white/25">
              {aliasLocked ? 'Alias cannot be changed — creates a new entry in Secrets' : 'Must match the exact alias in Space Settings → Secrets'}
            </p>
          </label>

          {/* Key Value */}
          <label className="block space-y-1.5">
            <span className="text-[11px] text-white/50">API Key / Secret</span>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={keyValue}
                onChange={e => setKeyValue(e.target.value)}
                placeholder={mode === 'add' ? 'sk-…' : 'Enter new key value'}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-3 pr-10 py-2.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-amber-500/40 transition-colors font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey(o => !o)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-white/25 hover:text-white/60 transition-colors"
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </label>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs text-white/40 hover:text-white/60 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className={cn(
                'inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold border transition-all',
                canSave
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-400 hover:bg-amber-500/25 active:scale-[0.97]'
                  : 'bg-white/3 border-white/8 text-white/20 cursor-not-allowed',
              )}
            >
              {saving
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</>
                : mode === 'add' ? <><Plus className="h-3.5 w-3.5" /> Add Key</>
                : mode === 'edit' ? <><Pencil className="h-3.5 w-3.5" /> Save Changes</>
                : <><RotateCcw className="h-3.5 w-3.5" /> Rotate Key</>}
            </button>
          </div>

          {aliasLocked && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-blue-500/5 border border-blue-500/10 text-[10px] text-blue-300/70">
              <Shield className="h-3 w-3 flex-shrink-0 mt-0.5" />
              <span>Editing or rotating only changes the key <b>value</b>. The alias stays the same so existing code (proxy calls) continues to work.</span>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── 403 (defense in depth) ───────────────────────────────────────────────────

function SuperAdminOnly403() {
  return (
    <div className="flex-1 flex items-center justify-center p-8 min-h-[60vh]">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="max-w-sm w-full text-center space-y-5 rounded-3xl border border-red-500/20 bg-red-500/4 p-8">
        <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <ShieldAlert className="h-8 w-8 text-red-400" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-xl font-black text-red-400">403 — Super Admin Only</h1>
          <p className="text-xs text-white/40 leading-relaxed">
            API Management controls production credentials and kill switches.
            Access is restricted to <span className="text-amber-300 font-semibold">Super Admin (Level 6)</span>.
            This access attempt may be logged.
          </p>
        </div>
        <a href="/admin/dashboard"
          className="block w-full py-2.5 rounded-2xl bg-white/5 border border-white/10 text-white/50 text-sm hover:bg-white/10 transition-all">
          Back to Dashboard
        </a>
      </motion.div>
    </div>
  );
}

// ─── Expiry editor ────────────────────────────────────────────────────────────

function ExpiryEditor({ apiId, actor }: { apiId: ApiId; actor: string }) {
  const keyExpiresAt = useApiMgmtStore(s => s.apis[apiId].keyExpiresAt);
  const setKeyExpiry = useApiMgmtStore(s => s.setKeyExpiry);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(keyExpiresAt?.slice(0, 10) ?? '');

  const level = expiryLevel(keyExpiresAt);
  const days  = keyExpiresAt ? daysUntil(keyExpiresAt) : null;

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <input
          type="date"
          value={value}
          onChange={e => setValue(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white/70 outline-none focus:border-blue-500/40 [color-scheme:dark]"
        />
        <button
          onClick={() => { setKeyExpiry(apiId, value ? new Date(value).toISOString() : null, actor); setEditing(false); }}
          className="text-[10px] font-semibold text-green-400 hover:text-green-300 px-1.5 py-1 rounded-md bg-green-500/10">
          Save
        </button>
        <button onClick={() => setEditing(false)}
          className="text-[10px] text-white/30 hover:text-white/60 px-1.5 py-1">
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => { setValue(keyExpiresAt?.slice(0, 10) ?? ''); setEditing(true); }}
      title="Click to record when this key expires"
      className={cn(
        'inline-flex items-center gap-1.5 text-[11px] rounded-lg px-2 py-1 border transition-all hover:border-white/25',
        level === 'expired'  ? 'text-red-400 border-red-500/25 bg-red-500/8' :
        level === 'expiring' ? 'text-amber-400 border-amber-500/25 bg-amber-500/8' :
        level === 'ok'       ? 'text-white/50 border-white/10 bg-white/3' :
                               'text-white/25 border-white/8 bg-transparent',
      )}
    >
      <CalendarClock className="h-3 w-3" />
      {keyExpiresAt
        ? level === 'expired'
          ? `Expired ${Math.abs(days!)}d ago`
          : `Expires ${keyExpiresAt.slice(0, 10)} (${days}d)`
        : 'Set expiry date'}
    </button>
  );
}

// ─── Log row ──────────────────────────────────────────────────────────────────

const KIND_ICON: Record<ApiLogEntry['kind'], React.ReactNode> = {
  test:       <RefreshCw className="h-3 w-3" />,
  enable:     <Power className="h-3 w-3" />,
  disable:    <PowerOff className="h-3 w-3" />,
  expiry_set: <CalendarClock className="h-3 w-3" />,
};

function LogRow({ log }: { log: ApiLogEntry }) {
  return (
    <div className="flex items-start gap-2.5 px-3 py-2 border-b border-white/4 last:border-0 hover:bg-white/2 transition-colors">
      <span className={cn(
        'mt-0.5 p-1 rounded-md flex-shrink-0',
        log.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400',
      )}>
        {KIND_ICON[log.kind]}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-white/60 leading-snug break-words">{log.message}</p>
        <p className="text-[10px] text-white/25 mt-0.5 font-mono">
          {new Date(log.timestamp).toLocaleString()} · {log.actor}
          {log.status != null && <> · HTTP {log.status}</>}
          {log.latencyMs != null && <> · {log.latencyMs}ms</>}
        </p>
      </div>
      {log.ok
        ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500/60 flex-shrink-0 mt-1" />
        : <XCircle className="h-3.5 w-3.5 text-red-500/60 flex-shrink-0 mt-1" />}
    </div>
  );
}

// ─── API card ─────────────────────────────────────────────────────────────────

function ApiCard({ def, actor, onEdit, onRotate, onDelete }: {
  def: ApiDefinition;
  actor: string;
  onEdit: (def: ApiDefinition) => void;
  onRotate: (def: ApiDefinition) => void;
  onDelete: (def: ApiDefinition) => void;
}) {
  const runtime    = useApiMgmtStore(s => s.apis[def.id]);
  const health     = useApiMgmtStore(s => s.healthOf(def.id));
  const setEnabled = useApiMgmtStore(s => s.setEnabled);
  const logs       = useApiMgmtStore(s => s.logsFor(def.id, 30));
  const clearLogs  = useApiMgmtStore(s => s.clearLogs);
  const [showLogs, setShowLogs]              = useState(false);
  const [confirmOff, setConfirmOff]          = useState(false);
  const [confirmRotate, setConfirmRotate]    = useState(false);

  // Last 3 test results for inline history
  const lastTests = useMemo(() => {
    return logs.filter(l => l.kind === 'test').slice(0, 3);
  }, [logs]);

  const meta   = HEALTH_META[health];
  const expiry = expiryLevel(runtime.keyExpiresAt);

  const toggle = () => {
    if (runtime.enabled && !confirmOff) { setConfirmOff(true); return; }
    setEnabled(def.id, !runtime.enabled, actor);
    setConfirmOff(false);
  };

  const successRate = useMemo(() => {
    const tests = logs.filter(l => l.kind === 'test');
    if (!tests.length) return null;
    return Math.round((tests.filter(t => t.ok).length / tests.length) * 100);
  }, [logs]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'rounded-2xl border bg-[#0d0d14] overflow-hidden transition-colors',
        !runtime.enabled ? 'border-white/6 opacity-75' :
        expiry === 'expired' ? 'border-red-500/25' :
        expiry === 'expiring' ? 'border-amber-500/25' : 'border-white/8',
      )}
    >
      {/* Header row */}
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="h-11 w-11 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center text-xl flex-shrink-0">
            {def.icon}
          </div>

          <div className="flex-1 min-w-[180px]">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-white">{def.name}</h3>
              <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border', meta.cls)}>
                <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot, health === 'active' && 'animate-pulse')} />
                {meta.emoji} {meta.label}
              </span>
              {!def.requiresKey && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400">
                  keyless
                </span>
              )}
              {successRate != null && (
                <span className="text-[10px] text-white/30 font-mono" title="Success rate over recent tests">
                  {successRate}% ok
                </span>
              )}
            </div>
            <p className="text-[11px] text-white/40 mt-1 leading-relaxed">{def.description}</p>

            {/* Meta line */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2.5">
              <ExpiryEditor apiId={def.id} actor={actor} />
              <span className="text-[11px] text-white/35 inline-flex items-center gap-1">
                <History className="h-3 w-3" /> Last used: {timeAgo(runtime.lastUsedAt)}
              </span>
              <a href={def.docsUrl} target="_blank" rel="noreferrer"
                className="text-[11px] text-white/25 hover:text-blue-400 inline-flex items-center gap-1 transition-colors">
                <ExternalLink className="h-3 w-3" /> Docs
              </a>
            </div>

            {/* Key handling (never the key itself) */}
            <div className="mt-2.5 flex items-center gap-1.5 text-[10px] text-white/25 font-mono bg-white/3 border border-white/6 rounded-lg px-2 py-1.5 w-fit max-w-full">
              <Lock className="h-3 w-3 text-white/20 flex-shrink-0" />
              <span className="truncate">••••••••  ·  {def.authNote}</span>
            </div>

            {/* Used by */}
            <div className="flex flex-wrap gap-1 mt-2">
              {def.usedBy.map(m => (
                <span key={m} className="text-[9px] px-1.5 py-0.5 rounded-md bg-white/4 border border-white/6 text-white/30 font-mono">
                  {m}
                </span>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col items-end gap-2 ml-auto min-w-fit">
            <ApiTestButton apiId={def.id} actor={actor} />
            {confirmOff ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-amber-400">Disable in app?</span>
                <button onClick={toggle}
                  className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 transition-all">
                  Yes, disable
                </button>
                <button onClick={() => setConfirmOff(false)}
                  className="px-2 py-1.5 rounded-lg text-[10px] text-white/30 hover:text-white/60">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={toggle}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all active:scale-[0.97]',
                  runtime.enabled
                    ? 'bg-white/4 border-white/10 text-white/50 hover:text-red-400 hover:border-red-500/25 hover:bg-red-500/8'
                    : 'bg-green-500/10 border-green-500/25 text-green-400 hover:bg-green-500/20',
                )}
              >
                {runtime.enabled ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                {runtime.enabled ? 'Disable' : 'Enable'}
              </button>
            )}
          </div>
        </div>

        {/* ── CRUD actions row ── */}
        <div className="flex items-center gap-1.5 px-4 sm:px-5 pb-2 pt-1 flex-wrap">
          <button
            onClick={() => onEdit(def)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-white/4 border border-white/10 text-white/40 hover:text-white hover:border-white/20 hover:bg-white/8 transition-all"
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
          {confirmRotate ? (
            <div className="inline-flex items-center gap-1.5">
              <span className="text-[10px] text-amber-400/80">Replace key?</span>
              <button onClick={() => { onRotate(def); setConfirmRotate(false); }}
                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25">
                Yes, rotate
              </button>
              <button onClick={() => setConfirmRotate(false)}
                className="px-2 py-1 rounded-lg text-[10px] text-white/30 hover:text-white/60">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmRotate(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-white/4 border border-white/10 text-white/40 hover:text-amber-400 hover:border-amber-500/25 hover:bg-amber-500/8 transition-all"
            >
              <RotateCcw className="h-3 w-3" /> Rotate
            </button>
          )}
          <button
            onClick={() => onDelete(def)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-white/4 border border-white/10 text-white/40 hover:text-red-400 hover:border-red-500/25 hover:bg-red-500/8 transition-all"
          >
            <Trash2 className="h-3 w-3" /> Delete
          </button>
          <ApiTestButton apiId={def.id} actor={actor} compact />
        </div>

        {/* ── Inline test history (last 3) ── */}
        {lastTests.length > 0 && (
          <div className="flex items-center gap-2 px-4 sm:px-5 pb-4">
            <span className="text-[10px] text-white/25 flex-shrink-0">Last tests:</span>
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {lastTests.map(t => (
                <span
                  key={t.id}
                  title={t.message}
                  className={cn(
                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-mono border',
                    t.ok
                      ? 'bg-green-500/8 border-green-500/20 text-green-400'
                      : 'bg-red-500/8 border-red-500/20 text-red-400',
                  )}
                >
                  <span className={cn('w-1 h-1 rounded-full flex-shrink-0', t.ok ? 'bg-green-400' : 'bg-red-400')} />
                  {new Date(t.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} · {t.status ?? '—'}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Expiry warning strip */}
        {(expiry === 'expiring' || expiry === 'expired') && (
          <div className={cn(
            'mt-3 flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px]',
            expiry === 'expired'
              ? 'bg-red-500/8 border-red-500/25 text-red-400'
              : 'bg-amber-500/8 border-amber-500/25 text-amber-400',
          )}>
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            {expiry === 'expired'
              ? <>This key has <b>expired</b>. Rotate it in Space Settings → Secrets (alias shown above), then run a test.</>
              : <>This key expires in <b>{daysUntil(runtime.keyExpiresAt!)} days</b>. Plan a rotation in Space Settings → Secrets.</>}
          </div>
        )}
      </div>

      {/* History toggle */}
      <button
        onClick={() => setShowLogs(o => !o)}
        className="w-full flex items-center justify-between px-4 sm:px-5 py-2.5 border-t border-white/5 text-[11px] text-white/35 hover:text-white/60 hover:bg-white/2 transition-all"
      >
        <span className="inline-flex items-center gap-1.5">
          <History className="h-3 w-3" /> History ({logs.length})
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showLogs && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {showLogs && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-white/5 bg-black/20"
          >
            {logs.length === 0 ? (
              <p className="text-center text-[11px] text-white/20 py-5">No activity yet — run a test.</p>
            ) : (
              <>
                <div className="max-h-64 overflow-y-auto">
                  {logs.map(l => <LogRow key={l.id} log={l} />)}
                </div>
                <div className="flex justify-end px-3 py-2 border-t border-white/4">
                  <button onClick={() => clearLogs(def.id)}
                    className="inline-flex items-center gap-1 text-[10px] text-white/25 hover:text-red-400 transition-colors">
                    <Trash2 className="h-3 w-3" /> Clear logs
                  </button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function AdminApiManagement() {
  const { session }        = useAdminAuthStore();
  const { user: appUser }  = useAuthStore();
  const apis     = useApiMgmtStore(s => s.apis);
  const testing  = useApiMgmtStore(s => s.testing);
  const testAll  = useApiMgmtStore(s => s.testAll);
  const healthOf = useApiMgmtStore(s => s.healthOf);

  // ── Access control: SUPER ADMIN ONLY (Level 6) ──
  const isSuperAdmin = session?.level === 6 || appUser?.role === 'super_admin';
  const actor = appUser?.email ?? session?.displayName ?? 'Super Admin';

  // ── Modal state ──
  const [modalOpen, setModalOpen]   = useState(false);
  const [modalMode, setModalMode]   = useState<'add' | 'edit' | 'rotate'>('add');
  const [modalDef, setModalDef]     = useState<ApiDefinition | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ApiDefinition | null>(null);

  // ── Audit log ──
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const refreshAuditLog = useCallback(() => { setAuditLog(getRecentAuditLog(5)); }, []);
  useEffect(() => { refreshAuditLog(); }, [refreshAuditLog]);

  const openAdd    = () => { setModalMode('add');    setModalDef(null); setModalOpen(true); };
  const openEdit   = (d: ApiDefinition) => { setModalMode('edit');   setModalDef(d); setModalOpen(true); };
  const openRotate = (d: ApiDefinition) => { setModalMode('rotate'); setModalDef(d); setModalOpen(true); };
  const handleDelete = async (d: ApiDefinition) => {
    const alias = (d.test as { alias?: string }).alias ?? d.id;
    const ok = await removeSecret(alias, actor);
    if (ok) {
      toast.success(`"${alias}" removed from Space Secrets.`);
      refreshAuditLog();
    } else {
      toast.error(`Failed to delete "${alias}".`);
    }
    setConfirmDelete(null);
  };
  const handleModalDone = () => {
    setModalOpen(false);
    refreshAuditLog();
  };

  // Auto health-check on first mount (only untested + enabled APIs).
  useEffect(() => {
    if (!isSuperAdmin) return;
    const untested = API_REGISTRY.filter(d => apis[d.id].enabled && !apis[d.id].lastTest);
    if (untested.length === 0) return;
    (async () => {
      for (const d of untested) {
        await useApiMgmtStore.getState().testApi(d.id, `${actor} (auto)`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin]);

  const anyTesting = Object.values(testing).some(Boolean);

  const summary = useMemo(() => {
    const counts = { active: 0, inactive: 0, no_key: 0, disabled: 0, unknown: 0 };
    for (const d of API_REGISTRY) {
      counts[healthOf(d.id)]++;
    }
    const expiring = API_REGISTRY.filter(d => {
      const lv = expiryLevel(apis[d.id].keyExpiresAt);
      return lv === 'expiring' || lv === 'expired';
    });
    return { counts, expiring };
  }, [apis, healthOf]);

  if (!isSuperAdmin) return <SuperAdminOnly403 />;

  return (
    <>
      {/* ── Add/Edit/Rotate Modal ── */}
      <SecretModal
        open={modalOpen}
        mode={modalMode}
        existingAlias={modalDef ? ((modalDef.test as { alias?: string }).alias) : undefined}
        existingName={modalDef?.name}
        actor={actor}
        onClose={() => setModalOpen(false)}
        onDone={handleModalDone}
      />

      {/* ── Delete confirmation modal ── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setConfirmDelete(null)} />
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="relative z-10 w-full max-w-sm rounded-2xl border border-red-500/20 bg-[#12121d] p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <Trash2 className="h-4 w-4 text-red-400" />
              </div>
              <div>
                <h3 className="font-bold text-white text-sm">Delete Secret?</h3>
                <p className="text-[10px] text-white/35">This removes the key from Space Settings → Secrets.</p>
              </div>
            </div>
            <p className="text-[11px] text-white/50">
              Delete <b className="text-red-400">{confirmDelete.name}</b> alias{' '}
              <code className="text-white/40 bg-white/5 px-1 py-0.5 rounded font-mono">
                {(confirmDelete.test as { alias?: string }).alias ?? confirmDelete.id}
              </code>?
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-xl text-xs text-white/40 hover:text-white/60">Cancel</button>
              <button onClick={() => handleDelete(confirmDelete)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 active:scale-[0.97]">
                Delete Permanently
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <KeyRound className="h-5 w-5 text-amber-400" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <h1 className="text-lg font-black text-white flex items-center gap-2">
              API Management
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-red-500/15 border border-red-500/25 text-red-400 tracking-wide">
                SUPER ADMIN
              </span>
            </h1>
            <p className="text-[11px] text-white/35">Add, edit, rotate &amp; test API keys — saved to Space Settings → Secrets</p>
          </div>
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold border bg-gradient-to-r from-amber-500/15 to-yellow-500/15 border-amber-500/30 text-amber-400 hover:from-amber-500/25 hover:to-yellow-500/25 active:scale-[0.97] transition-all"
          >
            <Plus className="h-4 w-4" /> Add New API Key
          </button>
          <button
            onClick={() => testAll(actor)}
            disabled={anyTesting}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all',
              anyTesting
                ? 'bg-blue-500/8 border-blue-500/20 text-blue-300/60 cursor-wait'
                : 'bg-blue-500/10 border-blue-500/25 text-blue-300 hover:bg-blue-500/20 active:scale-[0.98]',
            )}
          >
            {anyTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {anyTesting ? 'Testing…' : 'Test All'}
          </button>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {([
            ['active',   'Active',   CheckCircle2, 'text-green-400'],
            ['inactive', 'Inactive', XCircle,      'text-red-400'],
            ['no_key',   'No key',   KeyRound,     'text-amber-400'],
            ['disabled', 'Disabled', MinusCircle,  'text-white/30'],
            ['unknown',  'Untested', HelpCircle,   'text-white/30'],
          ] as const).map(([key, label, Icon, cls]) => (
            <div key={key} className="rounded-xl border border-white/6 bg-[#0d0d14] px-3 py-2.5 flex items-center gap-2.5">
              <Icon className={cn('h-4 w-4', cls)} />
              <div>
                <p className="text-sm font-bold text-white leading-none">{summary.counts[key]}</p>
                <p className="text-[10px] text-white/30 mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Global expiry warning banner */}
        {summary.expiring.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/6 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-[11px] text-amber-300/90 leading-relaxed">
              <b>Key rotation needed:</b>{' '}
              {summary.expiring.map((d, i) => {
                const days = daysUntil(apis[d.id].keyExpiresAt!);
                return (
                  <span key={d.id}>
                    {i > 0 && ' · '}
                    {d.name} {days < 0 ? <b className="text-red-400">expired {Math.abs(days)}d ago</b> : <>in <b>{days}d</b></>}
                  </span>
                );
              })}
              . Rotate keys now — warnings trigger from {EXPIRY_WARNING_DAYS} days out.
            </div>
          </motion.div>
        )}

        {/* Security note */}
        <div className="flex items-start gap-3 rounded-2xl border border-white/6 bg-[#0d0d14] px-4 py-3">
          <ShieldCheck className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-white/35 leading-relaxed">
            <span className="text-white/60 font-semibold">Zero key exposure.</span>{' '}
            Keys are stored in Taskade Space Secrets and injected server-side via{' '}
            <code className="text-[10px] px-1 py-0.5 rounded bg-white/5 text-blue-300 font-mono">GenesisClient.proxy()</code>.
            Add, edit or rotate keys directly from this page — changes are saved to Space Settings → Secrets.
            The app picks up new keys immediately without a redeploy.
          </p>
        </div>

        {/* API cards */}
        <div className="space-y-3">
          {API_REGISTRY.map(def => (
            <ApiCard
              key={def.id}
              def={def}
              actor={actor}
              onEdit={openEdit}
              onRotate={openRotate}
              onDelete={d => setConfirmDelete(d)}
            />
          ))}
        </div>

        {/* ── Audit Log ── */}
        <div className="rounded-2xl border border-white/8 bg-[#0d0d14] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
            <History className="h-4 w-4 text-white/35" />
            <h3 className="text-sm font-bold text-white">Audit Log (Last {auditLog.length})</h3>
          </div>
          {auditLog.length === 0 ? (
            <div className="px-4 py-6 text-center text-[11px] text-white/20">
              No changes recorded yet — add, edit or rotate a key to see entries here.
            </div>
          ) : (
            <div className="divide-y divide-white/4">
              {auditLog.map(entry => (
                <div key={entry.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/2 transition-colors">
                  <span className={cn(
                    'w-1.5 h-1.5 rounded-full flex-shrink-0',
                    entry.result === 'success' ? 'bg-green-400' : 'bg-red-400',
                  )} />
                  <span className="text-[11px] text-white/50 font-mono flex-shrink-0 w-[110px]">
                    {formatAuditTime(entry.timestamp)}
                  </span>
                  <span className="text-[11px] text-white/35 flex-shrink-0">
                    {maskEmail(entry.actor)}
                  </span>
                  <span className={cn(
                    'text-[11px] font-semibold flex-shrink-0',
                    entry.result === 'success' ? 'text-white/60' : 'text-red-400',
                  )}>
                    {AUDIT_ACTION_LABEL[entry.action]}
                  </span>
                  <span className="text-[11px] text-white/40 font-mono truncate">
                    &quot;{entry.alias}&quot;
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Adding more APIs */}
        <p className="text-[10px] text-white/20 text-center pb-4">
          To register a new API, add one entry to <code className="font-mono text-white/30">API_REGISTRY</code> in{' '}
          <code className="font-mono text-white/30">lib/apiStatusService.ts</code> and create its secret alias in Space Settings → Secrets.
        </p>
      </div>
    </>
  );
}

export default AdminApiManagement;
