/**
 * NFTAlertsPage.tsx — Custom NFT Alerts
 *
 * Alert types:
 *  1. floor_drop       — floor price drops by X%
 *  2. floor_pump       — floor price rises by X%
 *  3. whale_sale       — any sale > X× floor
 *  4. rare_sale        — sale of epic/legendary NFT
 *  5. listing_surge    — listing rate rises above X%
 *  6. volume_spike     — 24h volume > X ETH/SOL
 *
 * Features:
 *  - Create alert with collection picker + threshold
 *  - List of active alerts
 *  - Triggered history (populated from store tick via notification bridge)
 *  - In-app toast on trigger
 *  - Toggle active/pause
 *  - Delete
 */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, Plus, X, CheckCircle, AlertTriangle, TrendingUp,
  TrendingDown, Star, BarChart3, List, Trash2, ToggleLeft,
  ToggleRight, Clock, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNftStore } from '../../lib/nftStore';
import { useAuthStore } from '../../lib/authStore';
import { NFTCollection, NFT_CHAIN_META } from '../../lib/nftTypes';
import { CHAIN_DISPLAY, fmtNative, fmtUsd, timeAgo } from './nftUtils';
import { cn } from '@/lib/utils';
import { generateId } from '../../lib/strategyUtils';

// ── Alert types ───────────────────────────────────────────────────────────────

type NFTAlertType = 'floor_drop' | 'floor_pump' | 'whale_sale' | 'rare_sale' | 'listing_surge' | 'volume_spike';

const ALERT_TYPE_META: Record<NFTAlertType, {
  label: string; icon: string; color: string; defaultThreshold: number;
  unit: string; description: string;
}> = {
  floor_drop:     { label: 'Floor Drop',      icon: '📉', color: '#f87171', defaultThreshold: 10,  unit: '%',   description: 'Alert when floor price drops by threshold %' },
  floor_pump:     { label: 'Floor Pump',      icon: '🚀', color: '#34d399', defaultThreshold: 20,  unit: '%',   description: 'Alert when floor price rises by threshold %' },
  whale_sale:     { label: 'Whale Sale',      icon: '🐋', color: '#fbbf24', defaultThreshold: 3,   unit: '× floor', description: 'Alert when a sale exceeds X× the floor price' },
  rare_sale:      { label: 'Rare Sale',       icon: '💎', color: '#a78bfa', defaultThreshold: 0,   unit: '',    description: 'Alert on any Epic or Legendary NFT sale' },
  listing_surge:  { label: 'Listing Surge',   icon: '📋', color: '#60a5fa', defaultThreshold: 20,  unit: '%',   description: 'Alert when listing rate exceeds threshold %' },
  volume_spike:   { label: 'Volume Spike',    icon: '⚡', color: '#fb923c', defaultThreshold: 100, unit: 'native', description: 'Alert when 24h volume exceeds threshold' },
};

// ── Stored alert type ─────────────────────────────────────────────────────────

interface NFTAlert {
  id:           string;
  userId:       string;
  collectionId: string | 'all';  // 'all' = any collection
  collectionName: string;
  type:         NFTAlertType;
  threshold:    number;
  isActive:     boolean;
  triggerCount: number;
  lastTriggered: string | null;
  createdAt:    string;
}

interface TriggeredEvent {
  id:           string;
  alertId:      string;
  collectionName: string;
  type:         NFTAlertType;
  message:      string;
  triggeredAt:  string;
}

const ALERTS_KEY   = 'cryptoverse_nft_alerts_v1';
const TRIGGERED_KEY = 'cryptoverse_nft_triggered_v1';

function loadAlerts(): NFTAlert[]         { try { return JSON.parse(localStorage.getItem(ALERTS_KEY) || '[]'); } catch { return []; } }
function saveAlerts(a: NFTAlert[])        { localStorage.setItem(ALERTS_KEY, JSON.stringify(a)); }
function loadTriggered(): TriggeredEvent[]{ try { return JSON.parse(localStorage.getItem(TRIGGERED_KEY) || '[]'); } catch { return []; } }
function saveTriggered(t: TriggeredEvent[]){ localStorage.setItem(TRIGGERED_KEY, JSON.stringify(t.slice(-100))); }

// ── Create alert modal ────────────────────────────────────────────────────────

function CreateAlertModal({ onClose, userId }: { onClose: () => void; userId: string }) {
  const { getCollections } = useNftStore();
  const collections = getCollections();

  const [form, setForm] = useState({
    collectionId:   'all',
    collectionName: 'All Collections',
    type:           'floor_drop' as NFTAlertType,
    threshold:      10,
  });

  function handleTypeChange(t: NFTAlertType) {
    setForm(f => ({ ...f, type: t, threshold: ALERT_TYPE_META[t].defaultThreshold }));
  }

  function handleCollectionChange(id: string) {
    const col = collections.find(c => c.id === id);
    setForm(f => ({ ...f, collectionId: id, collectionName: col?.name ?? 'All Collections' }));
  }

  function submit() {
    const alerts = loadAlerts();
    const newAlert: NFTAlert = {
      id:             generateId(),
      userId,
      collectionId:   form.collectionId,
      collectionName: form.collectionName,
      type:           form.type,
      threshold:      form.threshold,
      isActive:       true,
      triggerCount:   0,
      lastTriggered:  null,
      createdAt:      new Date().toISOString(),
    };
    saveAlerts([...alerts, newAlert]);
    toast.success('NFT alert created!');
    onClose();
  }

  const meta = ALERT_TYPE_META[form.type];

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="fixed inset-4 sm:inset-auto sm:left-1/2 sm:-translate-x-1/2 sm:top-20 sm:w-full sm:max-w-lg z-[55] rounded-2xl flex flex-col"
        className="bg-card border border-border shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2"><Bell className="h-5 w-5 text-primary" /><h2 className="font-black">Create NFT Alert</h2></div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Alert type */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">Alert Type</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(Object.entries(ALERT_TYPE_META) as [NFTAlertType, typeof ALERT_TYPE_META[NFTAlertType]][]).map(([type, m]) => (
                <button key={type} onClick={() => handleTypeChange(type)}
                  className={cn('flex flex-col gap-1 p-3 rounded-xl text-xs font-bold border text-left transition-all',
                    form.type === type ? '' : 'border-white/10 text-muted-foreground hover:border-white/20')}
                  style={form.type === type ? { background: `${m.color}12`, borderColor: `${m.color}35`, color: m.color } : {}}>
                  <span className="text-base">{m.icon}</span>
                  {m.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">{meta.description}</p>
          </div>

          {/* Collection */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1.5">Collection</label>
            <select value={form.collectionId} onChange={e => handleCollectionChange(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl text-sm border bg-white/4 border-white/10 text-foreground appearance-none focus:outline-none focus:border-primary/50"
              style={{ background: 'rgba(255,255,255,0.04)' }}>
              <option value="all">All Collections</option>
              {collections.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Threshold */}
          {form.type !== 'rare_sale' && (
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1.5">
                Threshold ({meta.unit})
              </label>
              <input type="number" value={form.threshold} min={0}
                onChange={e => setForm(f => ({ ...f, threshold: +e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl text-sm border bg-white/4 border-white/10 focus:outline-none focus:border-primary/50" />
            </div>
          )}

          <div className="p-3 rounded-xl text-xs"
            style={{ background: `${meta.color}08`, border: `1px solid ${meta.color}18` }}>
            <p style={{ color: meta.color }}>
              <strong>Preview:</strong>{' '}
              {form.type === 'rare_sale'
                ? `Alert when an Epic or Legendary NFT sells in ${form.collectionName}`
                : `Alert when ${form.collectionName} ${meta.label.toLowerCase()} ${form.threshold}${meta.unit !== '' ? ` ${meta.unit}` : ''}`}
            </p>
          </div>

          <button onClick={submit}
            className="w-full py-3 rounded-xl font-black text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
            Create Alert
          </button>
        </div>
      </motion.div>
    </>
  );
}

// ── Alert card ────────────────────────────────────────────────────────────────

function AlertCard({ alert, onToggle, onDelete }: {
  alert: NFTAlert; onToggle: () => void; onDelete: () => void;
}) {
  const meta = ALERT_TYPE_META[alert.type];
  return (
    <div className="rounded-2xl p-4 flex items-center gap-4 transition-all"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <span className="text-2xl shrink-0">{meta.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-bold text-sm" style={{ color: meta.color }}>{meta.label}</p>
          {alert.threshold > 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
              style={{ background: `${meta.color}12`, color: meta.color }}>
              {alert.threshold}{meta.unit}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{alert.collectionName}</p>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-[10px] text-muted-foreground/60">Triggers: {alert.triggerCount}</span>
          {alert.lastTriggered && (
            <span className="text-[10px] text-muted-foreground/60">Last: {timeAgo(alert.lastTriggered)}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={onToggle}
          className={cn('p-1.5 rounded-lg transition-colors', alert.isActive ? 'text-emerald-400' : 'text-muted-foreground/40')}>
          {alert.isActive ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
        </button>
        <button onClick={onDelete} className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-red-400 transition-colors">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function NFTAlertsPage() {
  const { getCollections, getSalesFeed } = useNftStore();
  const { user } = useAuthStore();
  const userId = user?.id ?? 'demo';

  const [alerts, setAlerts]       = useState<NFTAlert[]>(() => loadAlerts().filter(a => a.userId === userId));
  const [triggered, setTriggered] = useState<TriggeredEvent[]>(() => loadTriggered());
  const [showCreate, setShowCreate] = useState(false);
  const [tab, setTab]             = useState<'active' | 'history'>('active');

  // Reload on close (new alert added in modal)
  function reload() { setAlerts(loadAlerts().filter(a => a.userId === userId)); }

  // Auto-check alerts against store every tick
  useEffect(() => {
    const id = setInterval(() => {
      const cols  = getCollections();
      const sales = getSalesFeed({} as any, 20);
      const now   = new Date().toISOString();
      const currentAlerts = loadAlerts();
      const newTriggered  = loadTriggered();
      let changed = false;

      for (const alert of currentAlerts) {
        if (!alert.isActive || alert.userId !== userId) continue;
        const matchCols = alert.collectionId === 'all'
          ? cols
          : cols.filter(c => c.id === alert.collectionId);

        let fired = false;
        let msg   = '';

        for (const col of matchCols) {
          if (alert.type === 'floor_drop'    && col.floorChange24h <= -(alert.threshold)) {
            fired = true; msg = `${col.name} floor dropped ${Math.abs(col.floorChange24h).toFixed(1)}%`; break;
          }
          if (alert.type === 'floor_pump'    && col.floorChange24h >= alert.threshold) {
            fired = true; msg = `${col.name} floor pumped +${col.floorChange24h.toFixed(1)}%`; break;
          }
          if (alert.type === 'listing_surge' && col.listingRate >= alert.threshold) {
            fired = true; msg = `${col.name} listing rate hit ${col.listingRate.toFixed(1)}%`; break;
          }
          if (alert.type === 'volume_spike'  && col.volume24h >= alert.threshold) {
            fired = true; msg = `${col.name} 24h volume: ${fmtNative(col.volume24h)}`; break;
          }
        }

        if (!fired && alert.type === 'whale_sale') {
          const whaleSale = sales.find(s =>
            s.priceVsFloor >= alert.threshold &&
            (alert.collectionId === 'all' || s.collectionId === alert.collectionId)
          );
          if (whaleSale) {
            fired = true;
            msg   = `${whaleSale.collectionSlug} — ${whaleSale.tokenId} sold ${whaleSale.priceVsFloor.toFixed(1)}× floor`;
          }
        }
        if (!fired && alert.type === 'rare_sale') {
          const rareSale = sales.find(s =>
            (s.rarityTier === 'epic' || s.rarityTier === 'legendary') &&
            (alert.collectionId === 'all' || s.collectionId === alert.collectionId)
          );
          if (rareSale) {
            fired = true;
            msg   = `${rareSale.rarityTier!.toUpperCase()} ${rareSale.name} sold for ${fmtNative(rareSale.price)}`;
          }
        }

        // Rate-limit: don't fire same alert more than once per minute
        const cooldown = alert.lastTriggered && (Date.now() - new Date(alert.lastTriggered).getTime() < 60_000);
        if (fired && !cooldown) {
          const ev: TriggeredEvent = {
            id:           generateId(),
            alertId:      alert.id,
            collectionName: alert.collectionName,
            type:         alert.type,
            message:      msg,
            triggeredAt:  now,
          };
          newTriggered.push(ev);
          alert.triggerCount++;
          alert.lastTriggered = now;
          changed = true;
          toast(`${ALERT_TYPE_META[alert.type].icon} ${ALERT_TYPE_META[alert.type].label}`, {
            description: msg,
            duration: 5000,
          });
        }
      }

      if (changed) {
        saveAlerts(currentAlerts);
        saveTriggered(newTriggered);
        setAlerts(currentAlerts.filter(a => a.userId === userId));
        setTriggered(newTriggered);
      }
    }, 20_000);  // Check every 20s (matches NFT tick interval)
    return () => clearInterval(id);
  }, [userId]);

  function handleToggle(id: string) {
    const all = loadAlerts().map(a => a.id === id ? { ...a, isActive: !a.isActive } : a);
    saveAlerts(all);
    setAlerts(all.filter(a => a.userId === userId));
  }

  function handleDelete(id: string) {
    const all = loadAlerts().filter(a => a.id !== id);
    saveAlerts(all);
    setAlerts(all.filter(a => a.userId === userId));
    toast.success('Alert deleted');
  }

  const activeAlerts  = alerts.filter(a => a.isActive);
  const pausedAlerts  = alerts.filter(a => !a.isActive);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-white/5">
        <div className="flex gap-0.5">
          {[
            { id: 'active',  label: `Active (${activeAlerts.length})` },
            { id: 'history', label: `History (${triggered.length})` },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id as any)}
              className={cn('px-4 py-2 rounded-xl text-xs font-bold transition-all',
                tab === t.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}>
              {t.label}
            </button>
          ))}
        </div>
        <button onClick={() => { setShowCreate(true); }}
          className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-primary text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> Create Alert
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {tab === 'active' && (
          <>
            {alerts.length === 0 ? (
              <div className="py-20 text-center">
                <Bell className="h-12 w-12 mx-auto text-muted-foreground/20 mb-4" />
                <p className="text-sm font-semibold text-muted-foreground">No alerts created yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs mx-auto">
                  Create alerts for floor price changes, whale sales, rare NFT sightings, and more.
                </p>
                <button onClick={() => setShowCreate(true)} className="mt-4 text-sm text-primary hover:underline">
                  + Create your first alert
                </button>
              </div>
            ) : (
              <>
                {activeAlerts.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-3">
                      Active ({activeAlerts.length})
                    </p>
                    <div className="space-y-2">
                      {activeAlerts.map(a => (
                        <AlertCard key={a.id} alert={a}
                          onToggle={() => handleToggle(a.id)}
                          onDelete={() => handleDelete(a.id)} />
                      ))}
                    </div>
                  </div>
                )}
                {pausedAlerts.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-3 mt-4">
                      Paused ({pausedAlerts.length})
                    </p>
                    <div className="space-y-2 opacity-50">
                      {pausedAlerts.map(a => (
                        <AlertCard key={a.id} alert={a}
                          onToggle={() => handleToggle(a.id)}
                          onDelete={() => handleDelete(a.id)} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {tab === 'history' && (
          triggered.length === 0 ? (
            <div className="py-20 text-center">
              <Clock className="h-12 w-12 mx-auto text-muted-foreground/20 mb-4" />
              <p className="text-sm text-muted-foreground">No alerts triggered yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {[...triggered].reverse().map(ev => {
                const meta = ALERT_TYPE_META[ev.type];
                return (
                  <div key={ev.id} className="flex items-start gap-3 px-4 py-3 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <span className="text-xl shrink-0">{meta.icon}</span>
                    <div className="flex-1">
                      <p className="font-semibold text-sm" style={{ color: meta.color }}>{meta.label}</p>
                      <p className="text-xs text-muted-foreground">{ev.message}</p>
                    </div>
                    <p className="text-[10px] text-muted-foreground/50 shrink-0">{timeAgo(ev.triggeredAt)}</p>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      <AnimatePresence>
        {showCreate && (
          <CreateAlertModal userId={userId} onClose={() => { setShowCreate(false); reload(); }} />
        )}
      </AnimatePresence>
    </div>
  );
}
