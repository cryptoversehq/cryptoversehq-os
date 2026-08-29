/**
 * NFTWatchlistPage.tsx — /nft/watchlist  (§3.5)
 *
 * Sections:
 *  A) Watched Collections — table: name, floor, alert price, current, status
 *  B) Watched NFTs — individual token watchlist
 *  C) Price Alert Settings — toggles for notification preferences
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye, Plus, X, Bell, BellOff, Trash2, CheckCircle2,
  Clock, TrendingUp, TrendingDown, Shield, Star,
  Search, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNftStore } from '../../lib/nftStore';
import { NFTCollection, NFT_CHAIN_META } from '../../lib/nftTypes';
import { CHAIN_DISPLAY, fmtNative, fmtUsd, fmtPct } from './nftUtils';
import { cn } from '@/lib/utils';
import { generateId } from '../../lib/strategyUtils';

// ── Persistence ───────────────────────────────────────────────────────────────

interface WatchedCollection {
  id:           string;
  collectionId: string;
  name:         string;
  slug:         string;
  alertPrice:   number;   // native — alert when floor reaches this
  chain:        string;
  addedAt:      string;
}

interface WatchedNFT {
  id:           string;
  collectionName: string;
  slug:         string;
  tokenId:      string;
  lastPrice:    number;
  alertPrice:   number;
  chain:        string;
  addedAt:      string;
}

interface AlertSettings {
  onFloorChange:  boolean;
  pctThreshold:   number;
  onListed:       boolean;
  dailyDigest:    boolean;
}

const WL_COLL_KEY  = 'cryptoverse_nft_watchlist_cols_v1';
const WL_NFT_KEY   = 'cryptoverse_nft_watchlist_nfts_v1';
const WL_SETTINGS_KEY = 'cryptoverse_nft_watchlist_settings_v1';

function load<T>(key: string, def: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? def; } catch { return def; }
}
function save(key: string, v: unknown) { localStorage.setItem(key, JSON.stringify(v)); }

const DEFAULT_SETTINGS: AlertSettings = { onFloorChange: true, pctThreshold: 5, onListed: true, dailyDigest: true };

// ── Add collection modal ──────────────────────────────────────────────────────

function AddCollectionModal({ onClose, onAdd }: {
  onClose: () => void;
  onAdd: (colId: string, slug: string, name: string, chain: string, alertPrice: number) => void;
}) {
  const { getCollections } = useNftStore();
  const collections = getCollections();
  const [selected, setSelected] = useState('');
  const [alertPrice, setAlertPrice] = useState('');
  const [search, setSearch] = useState('');

  const filtered = collections.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 12);

  const col = collections.find(c => c.id === selected);

  function submit() {
    if (!col) return;
    onAdd(col.id, col.slug, col.name, col.chain, parseFloat(alertPrice) || col.floorPrice * 1.2);
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="fixed inset-4 sm:inset-auto sm:left-1/2 sm:-translate-x-1/2 sm:top-20 sm:w-full sm:max-w-md z-[55] rounded-2xl flex flex-col"
        className="bg-card border border-border">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2"><Eye className="h-5 w-5 text-primary" /><h2 className="font-black">Add to Watchlist</h2></div>
          <button onClick={onClose}><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search collections…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm bg-white/5 border border-white/10 focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto">
            {filtered.map(c => {
              const chain = CHAIN_DISPLAY[c.chain as keyof typeof CHAIN_DISPLAY];
              return (
                <button key={c.id} onClick={() => setSelected(c.id)}
                  className={cn('flex items-center gap-2 p-2.5 rounded-xl text-left text-xs border transition-all',
                    selected === c.id ? 'border-primary/50 bg-primary/10 text-primary' : 'border-white/10 text-muted-foreground hover:border-white/20')}>
                  <span style={{ color: chain?.color }}>{chain?.icon}</span>
                  <span className="truncate">{c.name}</span>
                </button>
              );
            })}
          </div>
          {col && (
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1.5">
                Alert Price ({CHAIN_DISPLAY[col.chain as keyof typeof CHAIN_DISPLAY]?.symbol}) — current floor: {fmtNative(col.floorPrice)}
              </label>
              <input type="number" value={alertPrice}
                onChange={e => setAlertPrice(e.target.value)}
                placeholder={`e.g. ${(col.floorPrice * 1.2).toFixed(2)}`}
                className="w-full px-4 py-2.5 rounded-xl text-sm border bg-white/4 border-white/10 focus:outline-none focus:border-primary/50" />
            </div>
          )}
          <button onClick={submit} disabled={!selected}
            className="w-full py-3 rounded-xl font-black text-sm bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity">
            Add to Watchlist
          </button>
        </div>
      </motion.div>
    </>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ current, alert }: { current: number; alert: number }) {
  const above = current >= alert;
  return (
    <span className={cn('flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full',
      above
        ? 'bg-emerald-500/15 text-emerald-400'
        : 'bg-amber-500/10 text-amber-400')}>
      {above ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
      {above ? '✅ Above target' : '⏳ Waiting'}
    </span>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function NFTWatchlistPage() {
  const navigate = useNavigate();
  const { getCollection } = useNftStore();

  const [watchedCols,  setWatchedCols]  = useState<WatchedCollection[]>(() => load(WL_COLL_KEY, []));
  const [watchedNFTs,  setWatchedNFTs]  = useState<WatchedNFT[]>(() => load(WL_NFT_KEY, []));
  const [settings,     setSettings]     = useState<AlertSettings>(() => load(WL_SETTINGS_KEY, DEFAULT_SETTINGS));
  const [showAdd,      setShowAdd]      = useState(false);

  // Pre-populate with demo items if empty
  useEffect(() => {
    if (watchedCols.length === 0) {
      const { getCollections } = useNftStore.getState();
      const cols = getCollections().slice(0, 3);
      const demo: WatchedCollection[] = cols.map(c => ({
        id:           generateId(),
        collectionId: c.id,
        name:         c.name,
        slug:         c.slug,
        alertPrice:   parseFloat((c.floorPrice * 1.18).toFixed(4)),
        chain:        c.chain,
        addedAt:      new Date().toISOString(),
      }));
      setWatchedCols(demo);
      save(WL_COLL_KEY, demo);

      // Demo NFTs
      const nfts: WatchedNFT[] = cols.slice(0, 2).map((c, i) => ({
        id:             generateId(),
        collectionName: c.name,
        slug:           c.slug,
        tokenId:        `#${1234 + i * 4444}`,
        lastPrice:      c.floorPrice * 1.04,
        alertPrice:     parseFloat((c.floorPrice * 1.17).toFixed(4)),
        chain:          c.chain,
        addedAt:        new Date().toISOString(),
      }));
      setWatchedNFTs(nfts);
      save(WL_NFT_KEY, nfts);
    }
  }, []);

  function addCollection(colId: string, slug: string, name: string, chain: string, alertPrice: number) {
    const entry: WatchedCollection = { id: generateId(), collectionId: colId, name, slug, alertPrice, chain, addedAt: new Date().toISOString() };
    const next = [...watchedCols, entry];
    setWatchedCols(next);
    save(WL_COLL_KEY, next);
    toast.success(`${name} added to watchlist`);
  }

  function removeCol(id: string) {
    const next = watchedCols.filter(x => x.id !== id);
    setWatchedCols(next);
    save(WL_COLL_KEY, next);
  }

  function updateSettings(patch: Partial<AlertSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    save(WL_SETTINGS_KEY, next);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-foreground flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" /> My NFT Watchlist
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">{watchedCols.length} collections · {watchedNFTs.length} NFTs tracked</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-primary text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>

      {/* ── A) Watched Collections ── */}
      <section>
        <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-3">Watched Collections</p>
        <div className="rounded-2xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {watchedCols.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-muted-foreground">No collections watched yet</p>
              <button onClick={() => setShowAdd(true)} className="mt-2 text-xs text-primary hover:underline">+ Add collection</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead style={{ background: 'rgba(0,0,0,0.2)' }}>
                  <tr className="text-[10px] font-black text-muted-foreground uppercase tracking-wider border-b border-white/5">
                    <th className="px-4 py-3 text-left">Collection</th>
                    <th className="px-3 py-3 text-right">Floor</th>
                    <th className="px-3 py-3 text-right">Alert Price</th>
                    <th className="px-3 py-3 text-right">Current</th>
                    <th className="px-3 py-3 text-center">Status</th>
                    <th className="px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {watchedCols.map(wc => {
                    const col   = getCollection(wc.collectionId);
                    const floor = col?.floorPrice ?? wc.alertPrice * 0.84;
                    const chain = CHAIN_DISPLAY[wc.chain as keyof typeof CHAIN_DISPLAY];
                    const toAlert = wc.alertPrice - floor;
                    const toAlertPct = (toAlert / floor) * 100;
                    return (
                      <tr key={wc.id} className="border-b border-white/4 hover:bg-white/2 transition-colors">
                        <td className="px-4 py-3">
                          <button onClick={() => navigate(`/nft/collection/${wc.slug}`)}
                            className="flex items-center gap-2 hover:text-primary transition-colors text-left">
                            <span style={{ color: chain?.color }}>{chain?.icon}</span>
                            <span className="font-semibold text-foreground">{wc.name}</span>
                          </button>
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs">
                          {fmtNative(floor)} <span className="text-muted-foreground">{chain?.symbol}</span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <p className="font-mono text-xs font-bold text-foreground">
                            {fmtNative(wc.alertPrice)} <span className="text-muted-foreground font-normal">{chain?.symbol}</span>
                          </p>
                          <p className={cn('text-[10px]', toAlertPct >= 0 ? 'text-emerald-400' : 'text-muted-foreground')}>
                            ({toAlertPct >= 0 ? '+' : ''}{toAlertPct.toFixed(1)}%)
                          </p>
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs">
                          {fmtNative(floor)} <span className="text-muted-foreground">{chain?.symbol}</span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <StatusBadge current={floor} alert={wc.alertPrice} />
                        </td>
                        <td className="px-3 py-3">
                          <button onClick={() => removeCol(wc.id)}
                            className="p-1 text-muted-foreground/40 hover:text-red-400 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ── B) Watched NFTs ── */}
      <section>
        <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-3">Watched NFTs</p>
        <div className="rounded-2xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {watchedNFTs.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-muted-foreground">No individual NFTs watched yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Browse a collection and click "Track" on any NFT</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead style={{ background: 'rgba(0,0,0,0.2)' }}>
                  <tr className="text-[10px] font-black text-muted-foreground uppercase tracking-wider border-b border-white/5">
                    <th className="px-4 py-3 text-left">NFT</th>
                    <th className="px-3 py-3 text-right">Last Price</th>
                    <th className="px-3 py-3 text-right">Alert Price</th>
                    <th className="px-3 py-3 text-right">Current</th>
                    <th className="px-3 py-3 text-center">Status</th>
                    <th className="px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {watchedNFTs.map(wn => {
                    const chain = CHAIN_DISPLAY[wn.chain as keyof typeof CHAIN_DISPLAY];
                    return (
                      <tr key={wn.id} className="border-b border-white/4 hover:bg-white/2 transition-colors">
                        <td className="px-4 py-3">
                          <button onClick={() => navigate(`/nft/item/${wn.slug}/${wn.tokenId.replace('#','')}`)}
                            className="text-left hover:text-primary transition-colors">
                            <p className="font-semibold text-foreground">{wn.collectionName} {wn.tokenId}</p>
                            <p className="text-[10px] text-muted-foreground">{chain?.icon} {chain?.name}</p>
                          </button>
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs">{fmtNative(wn.lastPrice)} {chain?.symbol}</td>
                        <td className="px-3 py-3 text-right font-mono text-xs font-bold">{fmtNative(wn.alertPrice)} {chain?.symbol}</td>
                        <td className="px-3 py-3 text-right font-mono text-xs">{fmtNative(wn.lastPrice)} {chain?.symbol}</td>
                        <td className="px-3 py-3 text-center">
                          <StatusBadge current={wn.lastPrice} alert={wn.alertPrice} />
                        </td>
                        <td className="px-3 py-3">
                          <button onClick={() => { const next = watchedNFTs.filter(x => x.id !== wn.id); setWatchedNFTs(next); save(WL_NFT_KEY, next); }}
                            className="p-1 text-muted-foreground/40 hover:text-red-400 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ── C) Alert Settings ── */}
      <section>
        <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-3">Price Alert Settings</p>
        <div className="rounded-2xl p-5 space-y-4"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {[
            { key: 'onFloorChange', label: `Notify when floor price changes by`, suffix: `${settings.pctThreshold}%`, desc: '' },
            { key: 'onListed',      label: 'Notify when my watched NFT is listed', suffix: '', desc: '' },
            { key: 'dailyDigest',   label: 'Daily digest of watchlist changes', suffix: '', desc: '' },
          ].map(opt => (
            <label key={opt.key} className="flex items-center gap-3 cursor-pointer group">
              <div onClick={() => updateSettings({ [opt.key]: !settings[opt.key as keyof AlertSettings] })}
                className={cn('w-5 h-5 rounded flex items-center justify-center border-2 transition-all shrink-0',
                  settings[opt.key as keyof AlertSettings]
                    ? 'bg-primary border-primary'
                    : 'border-white/20 group-hover:border-white/40')}>
                {settings[opt.key as keyof AlertSettings] && (
                  <svg viewBox="0 0 10 8" fill="none" className="w-3 h-3">
                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span className="text-sm text-foreground">
                {opt.label}
                {opt.key === 'onFloorChange' && (
                  <>
                    {' ['}
                    <input type="number" value={settings.pctThreshold} min={1} max={50}
                      onClick={e => e.stopPropagation()}
                      onChange={e => updateSettings({ pctThreshold: +e.target.value })}
                      className="w-10 bg-transparent border-b border-primary text-center text-primary font-bold focus:outline-none" />
                    {']%'}
                  </>
                )}
              </span>
            </label>
          ))}
        </div>
      </section>

      <AnimatePresence>
        {showAdd && <AddCollectionModal onClose={() => setShowAdd(false)} onAdd={addCollection} />}
      </AnimatePresence>
    </div>
  );
}
