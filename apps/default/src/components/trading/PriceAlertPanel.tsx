import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  usePriceAlertStore,
  PriceAlert, AlertCondition, AlertSounds,
} from '@/lib/priceAlertStore';
import { CoinMeta } from '@/lib/coins';
import {
  Bell, BellOff, Plus, Trash2, X, Volume2, VolumeX,
  TrendingUp, TrendingDown, ArrowLeftRight, ChevronDown,
  Pencil, Check, AlertTriangle, Zap,
} from 'lucide-react';

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtPrice(p: number): string {
  if (p >= 10_000) return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (p >= 100)    return p.toFixed(4);
  if (p >= 1)      return p.toFixed(5);
  return p.toFixed(8);
}

function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

const CONDITION_META: Record<AlertCondition, { label: string; icon: React.ElementType; color: string; desc: string }> = {
  above: { label: 'Above',  icon: TrendingUp,       color: '#0ecb81', desc: 'Triggers when price rises above target' },
  below: { label: 'Below',  icon: TrendingDown,     color: '#f6465d', desc: 'Triggers when price falls below target' },
  cross: { label: 'Crosses',icon: ArrowLeftRight,   color: '#f0b90b', desc: 'Triggers when price crosses target in either direction' },
};

// ─── Toast notifications ──────────────────────────────────────────────────────

export function AlertToastStack() {
  const { toasts, dismissToast } = usePriceAlertStore();

  const handleView = (coinId: string) => {
    window.location.href = `/trading?coin=${coinId}`;
  };

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none" style={{ left: 'auto' }}>
      <AnimatePresence>
        {toasts.map(t => {
          const meta  = CONDITION_META[t.alert.condition];
          const Icon  = meta.icon;

          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 80, scale: 0.92 }}
              animate={{ opacity: 1, x: 0,  scale: 1 }}
              exit={{   opacity: 0, x: 80,  scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className="pointer-events-auto"
            >
              <div
                className="relative flex items-start gap-3 px-4 py-3 rounded-xl shadow-2xl border w-[320px] bg-[hsl(var(--card))] border-[hsl(var(--border))]"
                style={{ boxShadow: `0 0 24px ${meta.color}22, 0 4px 20px rgba(0,0,0,0.5)` }}
              >
                {/* Left accent */}
                <div
                  className="absolute left-0 inset-y-0 w-[3px] rounded-l-xl"
                  style={{ background: meta.color }}
                />

                {/* Icon */}
                <div
                  className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5"
                  style={{ background: meta.color + '22' }}
                >
                  <Icon className="w-4 h-4" style={{ color: meta.color }} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[12px] font-bold" style={{ color: 'var(--cv-dash-text, #eaecef)' }}>
                      {t.alert.coinSymbol}/USDT
                    </span>
                    <span
                      className="text-[10px] font-semibold px-1.5 py-px rounded"
                      style={{ background: meta.color + '22', color: meta.color }}
                    >
                      {meta.label}
                    </span>
                  </div>

                  <p className="text-[11px] leading-snug" style={{ color: 'var(--cv-dash-text-muted, #848e9c)' }}>
                    Hit at&nbsp;
                    <span className="font-mono font-bold" style={{ color: 'var(--cv-dash-text, #eaecef)' }}>{fmtPrice(t.price)}</span>
                  </p>

                  {/* View button */}
                  <button
                    onClick={() => handleView(t.alert.coinId)}
                    className="mt-2 flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold transition-colors"
                    style={{ background: meta.color + '18', color: meta.color }}
                  >
                    View {t.alert.coinSymbol}
                  </button>
                </div>

                {/* Dismiss */}
                <button
                  onClick={() => dismissToast(t.id)}
                  className="flex-shrink-0 p-1.5 rounded-lg transition-colors bg-white/[0.05] hover:bg-red-400/20"
                  style={{ color: 'var(--cv-dash-text-muted, #848e9c)' }}
                  title="Dismiss"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

// ─── Alert Row ────────────────────────────────────────────────────────────────

function AlertRow({
  alert, currentPrice,
}: {
  alert: PriceAlert;
  currentPrice: number;
}) {
  const { removeAlert, toggleAlert, updateAlert } = usePriceAlertStore();
  const [editing, setEditing] = useState(false);
  const [editPrice, setEditPrice] = useState(alert.targetPrice.toString());
  const [editNote, setEditNote]   = useState(alert.note);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const meta     = CONDITION_META[alert.condition];
  const Icon     = meta.icon;
  const isActive = alert.status === 'active';
  const dist     = currentPrice > 0
    ? ((alert.targetPrice - currentPrice) / currentPrice) * 100
    : 0;
  const distAbs = Math.abs(dist);

  const saveEdit = () => {
    const p = parseFloat(editPrice);
    if (p > 0) {
      updateAlert(alert.id, { targetPrice: p, note: editNote });
    }
    setEditing(false);
  };

  return (
    <div
      className={cn(
        'relative rounded-xl border transition-all duration-200 overflow-hidden',
        isActive
          ? 'border-white/8 bg-[#2b2f36]/60'
          : alert.status === 'triggered'
          ? 'border-white/5 bg-[#1e2026]/40 opacity-60'
          : 'border-white/5 bg-[#1e2026]/40 opacity-50',
      )}
    >
      {/* Left accent bar */}
      <div
        className={cn('absolute left-0 inset-y-0 w-[2px] transition-opacity', !isActive && 'opacity-30')}
        style={{ background: meta.color }}
      />

      <div className="pl-3 pr-2 py-2.5">
        <div className="flex items-start gap-2">

          {/* Condition icon */}
          <div
            className={cn('flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5', !isActive && 'opacity-40')}
            style={{ background: meta.color + '18' }}
          >
            <Icon className="w-3.5 h-3.5" style={{ color: meta.color }} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-bold text-[#eaecef]">{alert.coinSymbol}/USDT</span>
              <span
                className="text-[9px] font-semibold px-1.5 py-px rounded-full"
                style={{ background: meta.color + '20', color: meta.color }}
              >
                {meta.label}
              </span>
              {alert.status === 'triggered' && (
                <span className="text-[9px] font-semibold px-1.5 py-px rounded-full bg-[#848e9c]/20 text-[#848e9c]">
                  Triggered {alert.triggeredAt ? timeAgo(alert.triggeredAt) : ''}
                </span>
              )}
              {alert.status === 'paused' && (
                <span className="text-[9px] font-semibold px-1.5 py-px rounded-full bg-[#848e9c]/20 text-[#848e9c]">
                  Paused
                </span>
              )}
            </div>

            {editing ? (
              <div className="mt-1.5 flex flex-col gap-1">
                <input
                  ref={inputRef}
                  type="number"
                  value={editPrice}
                  onChange={e => setEditPrice(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false); }}
                  className="w-full bg-[#161a1e] border border-[#f0b90b]/40 rounded-lg px-2 py-1 text-[11px] font-mono text-[#eaecef] outline-none"
                  placeholder="Target price"
                />
                <input
                  type="text"
                  value={editNote}
                  onChange={e => setEditNote(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false); }}
                  className="w-full bg-[#161a1e] border border-white/10 rounded-lg px-2 py-1 text-[10px] text-[#848e9c] outline-none"
                  placeholder="Note (optional)"
                />
                <div className="flex gap-1">
                  <button
                    onClick={saveEdit}
                    className="flex items-center gap-1 px-2 py-1 bg-[#0ecb81]/15 hover:bg-[#0ecb81]/25 text-[#0ecb81] rounded text-[10px] font-semibold transition-colors"
                  >
                    <Check className="w-3 h-3" /> Save
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="px-2 py-1 bg-white/5 hover:bg-white/10 text-[#848e9c] rounded text-[10px] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mt-0.5">
                  <span
                    className="text-[13px] font-bold font-mono tabular-nums"
                    style={{ color: meta.color }}
                  >
                    {fmtPrice(alert.targetPrice)}
                  </span>
                  {currentPrice > 0 && isActive && (
                    <span className={cn(
                      'text-[10px] font-mono tabular-nums',
                      dist > 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]',
                    )}>
                      {dist > 0 ? '+' : ''}{dist.toFixed(2)}%
                    </span>
                  )}
                </div>
                {alert.note && (
                  <p className="text-[10px] text-[#848e9c] italic truncate mt-0.5">"{alert.note}"</p>
                )}
              </>
            )}
          </div>

          {/* Actions */}
          {!editing && (
            <div className="flex items-center gap-0.5 flex-shrink-0">
              {/* Sound toggle */}
              <button
                onClick={() => updateAlert(alert.id, { soundEnabled: !alert.soundEnabled })}
                title={alert.soundEnabled ? 'Mute alert' : 'Enable sound'}
                className="p-1.5 rounded hover:bg-white/8 transition-colors"
              >
                {alert.soundEnabled
                  ? <Volume2  className="w-3 h-3 text-[#f0b90b]" />
                  : <VolumeX  className="w-3 h-3 text-[#4a4e57]" />}
              </button>

              {/* Edit */}
              {alert.status !== 'triggered' && (
                <button
                  onClick={() => { setEditing(true); setEditPrice(alert.targetPrice.toString()); setEditNote(alert.note); }}
                  className="p-1.5 rounded hover:bg-white/8 transition-colors"
                  title="Edit"
                >
                  <Pencil className="w-3 h-3 text-[#848e9c]" />
                </button>
              )}

              {/* Toggle active/paused */}
              {alert.status !== 'triggered' && (
                <button
                  onClick={() => toggleAlert(alert.id)}
                  title={isActive ? 'Pause alert' : 'Resume alert'}
                  className="p-1.5 rounded hover:bg-white/8 transition-colors"
                >
                  {isActive
                    ? <Bell    className="w-3 h-3 text-[#0ecb81]" />
                    : <BellOff className="w-3 h-3 text-[#848e9c]" />}
                </button>
              )}

              {/* Delete */}
              <button
                onClick={() => removeAlert(alert.id)}
                className="p-1.5 rounded hover:bg-[#f6465d]/15 transition-colors"
                title="Delete"
              >
                <Trash2 className="w-3 h-3 text-[#848e9c] hover:text-[#f6465d]" />
              </button>
            </div>
          )}
        </div>

        {/* Distance progress bar */}
        {isActive && currentPrice > 0 && distAbs < 20 && (
          <div className="mt-2 mx-1">
            <div className="h-[2px] bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width:      `${Math.min(100, (1 - distAbs / 20) * 100)}%`,
                  background: meta.color,
                  opacity:    0.6 + (1 - distAbs / 20) * 0.4,
                }}
              />
            </div>
            <div className="flex justify-between text-[9px] text-[#4a4e57] mt-0.5">
              <span>Current {fmtPrice(currentPrice)}</span>
              <span>{distAbs.toFixed(2)}% away</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

interface Props {
  open:         boolean;
  onClose:      () => void;
  coin:         CoinMeta;
  currentPrice: number;
}

export function PriceAlertPanel({ open, onClose, coin, currentPrice }: Props) {
  const { alerts, addAlert, clearTriggered } = usePriceAlertStore();

  // Form state
  const [targetPrice,  setTargetPrice]  = useState('');
  const [condition,    setCondition]    = useState<AlertCondition>('above');
  const [note,         setNote]         = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showForm,     setShowForm]     = useState(false);
  const [formError,    setFormError]    = useState('');

  // Filter by current coin
  const coinAlerts    = alerts.filter(a => a.coinId === coin.id);
  const triggeredAlerts = coinAlerts.filter(a => a.status === 'triggered');
  const activeAlerts    = coinAlerts.filter(a => a.status === 'active' || a.status === 'paused');

  // Sync default price when coin changes
  useEffect(() => {
    if (currentPrice > 0) setTargetPrice(currentPrice.toFixed(currentPrice > 100 ? 2 : 6));
  }, [coin.id, currentPrice]);

  const handleAdd = () => {
    const p = parseFloat(targetPrice);
    if (!p || p <= 0) { setFormError('Enter a valid price'); return; }
    addAlert({
      coinId:       coin.id,
      coinSymbol:   coin.symbol,
      coinColor:    coin.color,
      targetPrice:  p,
      condition,
      note,
      soundEnabled,
    });
    setFormError('');
    setNote('');
    setShowForm(false);
    if (soundEnabled) AlertSounds.preview();
  };

  const conditionOptions: AlertCondition[] = ['above', 'below', 'cross'];

  return (
    <>
      {/* Backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 bg-black/40 z-[998]"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Drawer */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="drawer"
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0,      opacity: 1 }}
            exit={{   x: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            className="fixed right-0 top-0 bottom-0 w-[360px] bg-[#1e2026] border-l border-white/8 z-[999] flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#f0b90b]/15 flex items-center justify-center">
                  <Bell className="w-3.5 h-3.5 text-[#f0b90b]" />
                </div>
                <div>
                  <h2 className="text-[13px] font-bold text-[#eaecef]">Price Alerts</h2>
                  <p className="text-[10px] text-[#848e9c]">{coin.symbol}/USDT</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {triggeredAlerts.length > 0 && (
                  <button
                    onClick={clearTriggered}
                    className="text-[10px] text-[#848e9c] hover:text-[#eaecef] px-2 py-1 rounded hover:bg-white/5 transition-colors"
                  >
                    Clear triggered
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-1.5 rounded hover:bg-white/8 text-[#848e9c] hover:text-[#eaecef] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">

              {/* Current price pill */}
              <div className="flex items-center justify-between bg-[#2b2f36] rounded-xl px-3 py-2">
                <span className="text-[11px] text-[#848e9c]">Current Price</span>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: coin.color }} />
                  <span className="text-[13px] font-bold font-mono text-[#eaecef] tabular-nums">
                    {fmtPrice(currentPrice)}
                  </span>
                  <span className="text-[10px] text-[#848e9c]">USDT</span>
                </div>
              </div>

              {/* Add alert button / form */}
              {!showForm ? (
                <button
                  onClick={() => setShowForm(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-[#f0b90b]/40 text-[#f0b90b] hover:border-[#f0b90b]/70 hover:bg-[#f0b90b]/8 transition-all text-[12px] font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Alert for {coin.symbol}
                </button>
              ) : (
                <div className="bg-[#2b2f36] rounded-xl p-3 space-y-3 border border-[#f0b90b]/20">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-[#eaecef]">New Alert</span>
                    <button onClick={() => setShowForm(false)} className="p-1 hover:bg-white/8 rounded text-[#848e9c]">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Condition selector */}
                  <div>
                    <label className="text-[10px] text-[#848e9c] mb-1.5 block">Condition</label>
                    <div className="grid grid-cols-3 gap-1">
                      {conditionOptions.map(c => {
                        const m  = CONDITION_META[c];
                        const Ic = m.icon;
                        return (
                          <button
                            key={c}
                            onClick={() => setCondition(c)}
                            className={cn(
                              'flex flex-col items-center gap-1 py-2 rounded-lg border text-[10px] font-semibold transition-all',
                              condition === c
                                ? 'border-current'
                                : 'border-white/8 text-[#848e9c] hover:border-white/20',
                            )}
                            style={condition === c ? { borderColor: m.color, color: m.color, background: m.color + '12' } : {}}
                          >
                            <Ic className="w-3.5 h-3.5" />
                            {m.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-[#848e9c] mt-1">{CONDITION_META[condition].desc}</p>
                  </div>

                  {/* Price input */}
                  <div>
                    <label className="text-[10px] text-[#848e9c] mb-1 block">Target Price (USDT)</label>
                    <div className="flex items-center gap-1">
                      <div className="flex-1 flex items-center bg-[#161a1e] border border-white/10 focus-within:border-[#f0b90b]/50 rounded-lg px-2 py-1.5 transition-colors">
                        <input
                          type="number"
                          value={targetPrice}
                          onChange={e => { setTargetPrice(e.target.value); setFormError(''); }}
                          onKeyDown={e => e.key === 'Enter' && handleAdd()}
                          placeholder="0.00"
                          className="flex-1 bg-transparent text-[12px] font-mono text-[#eaecef] outline-none placeholder-[#4a4e57]"
                        />
                        <span className="text-[10px] text-[#848e9c]">USDT</span>
                      </div>
                      <button
                        onClick={() => setTargetPrice(currentPrice > 100 ? currentPrice.toFixed(2) : currentPrice.toFixed(6))}
                        className="px-2 py-1.5 bg-[#f0b90b]/15 hover:bg-[#f0b90b]/25 text-[#f0b90b] rounded-lg text-[10px] font-semibold transition-colors flex-shrink-0"
                      >
                        Market
                      </button>
                    </div>
                    {formError && <p className="text-[10px] text-[#f6465d] mt-1">{formError}</p>}
                  </div>

                  {/* Note */}
                  <div>
                    <label className="text-[10px] text-[#848e9c] mb-1 block">Note (optional)</label>
                    <input
                      type="text"
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      placeholder="e.g. Key resistance level"
                      className="w-full bg-[#161a1e] border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-[#848e9c] outline-none focus:border-white/20 transition-colors"
                    />
                  </div>

                  {/* Sound toggle */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {soundEnabled
                        ? <Volume2 className="w-3.5 h-3.5 text-[#f0b90b]" />
                        : <VolumeX className="w-3.5 h-3.5 text-[#848e9c]" />}
                      <span className="text-[11px] text-[#eaecef]">Sound notification</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setSoundEnabled(s => !s); if (!soundEnabled) AlertSounds.preview(); }}
                        className={cn(
                          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                          soundEnabled ? 'bg-[#f0b90b]' : 'bg-[#2b2f36] border border-white/10',
                        )}
                      >
                        <span
                          className={cn(
                            'inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
                            soundEnabled ? 'translate-x-[18px]' : 'translate-x-[2px]',
                          )}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Submit */}
                  <button
                    onClick={handleAdd}
                    className="w-full py-2.5 rounded-lg bg-[#f0b90b] hover:bg-[#f0b90b]/90 text-black text-[12px] font-bold transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Create Alert
                  </button>
                </div>
              )}

              {/* Active / paused alerts */}
              {activeAlerts.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] text-[#848e9c] font-semibold uppercase tracking-wide">Active</span>
                    <span className="px-1.5 py-px bg-[#0ecb81]/15 text-[#0ecb81] text-[9px] font-bold rounded-full">
                      {activeAlerts.filter(a => a.status === 'active').length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {activeAlerts.map(a => (
                      <AlertRow key={a.id} alert={a} currentPrice={currentPrice} />
                    ))}
                  </div>
                </div>
              )}

              {/* Triggered alerts */}
              {triggeredAlerts.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] text-[#848e9c] font-semibold uppercase tracking-wide">Triggered</span>
                    <span className="px-1.5 py-px bg-[#848e9c]/15 text-[#848e9c] text-[9px] font-bold rounded-full">
                      {triggeredAlerts.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {triggeredAlerts.map(a => (
                      <AlertRow key={a.id} alert={a} currentPrice={currentPrice} />
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {coinAlerts.length === 0 && !showForm && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-[#2b2f36] flex items-center justify-center">
                    <Bell className="w-6 h-6 text-[#4a4e57]" />
                  </div>
                  <div className="text-center">
                    <p className="text-[12px] font-semibold text-[#848e9c]">No alerts for {coin.symbol}</p>
                    <p className="text-[10px] text-[#4a4e57] mt-1">
                      Set a price level and get instant<br />sound + visual notifications.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer stats */}
            {coinAlerts.length > 0 && (
              <div className="border-t border-white/5 px-4 py-2 flex items-center justify-between flex-shrink-0">
                <span className="text-[10px] text-[#848e9c]">
                  {activeAlerts.filter(a => a.status === 'active').length} watching · {triggeredAlerts.length} triggered
                </span>
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#0ecb81] animate-pulse" />
                  <span className="text-[10px] text-[#0ecb81]">Live</span>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
