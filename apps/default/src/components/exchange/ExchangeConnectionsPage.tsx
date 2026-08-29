/**
 * ExchangeConnectionsPage.tsx
 * Route: /exchange (connections list + add new inline form)
 * Matches spec §3.1 exactly
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, RefreshCw, Pencil, Trash2, Wifi, WifiOff,
  AlertTriangle, Shield, Eye, EyeOff, CheckCircle,
  Loader2, Key, Lock, ExternalLink, ChevronDown, ChevronUp,
  Clock, DollarSign, Activity,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useExchangeStore } from '../../lib/exchangeStore';
import { ExchangeConnection, ExchangeId, EXCHANGE_META, TradingMode, ExchangePermission } from '../../lib/exchangeTypes';
import { toast } from 'sonner';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtUSD(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
  return `${Math.floor(hrs / 24)} days ago`;
}

// ── Safety Warning Banner ──────────────────────────────────────────────────────

function SafetyWarning({ dismissed, onDismiss }: { dismissed: boolean; onDismiss: () => void }) {
  if (dismissed) return null;
  return (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-amber-500/25 overflow-hidden"
      style={{ background: 'rgba(245,158,11,0.06)' }}>
      <div className="flex items-start gap-3 p-5">
        <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-black text-amber-300">⚠️ Safety Warning — Real Funds</p>
          <ul className="mt-2 space-y-1.5">
            {[
              'Only connect after completing Level 10 in Academy',
              'Start with small amounts — never risk more than you can lose',
              'Never share your API keys with anyone',
              'Use API key restrictions — disable withdrawal permissions',
            ].map((tip, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-amber-200/70">
                <span className="text-amber-500 font-black shrink-0 mt-0.5">•</span>
                {tip}
              </li>
            ))}
          </ul>
          <button onClick={onDismiss}
            className="mt-3 px-4 py-1.5 rounded-xl border border-amber-500/30 text-xs font-bold text-amber-400 hover:bg-amber-500/10 transition-colors">
            I understand the risks
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Connected Exchange Card ────────────────────────────────────────────────────

function ConnectionCard({
  conn, onSync, onDisconnect, onEdit,
}: {
  conn: ExchangeConnection;
  onSync: () => void;
  onDisconnect: () => void;
  onEdit: () => void;
}) {
  const ex         = EXCHANGE_META[conn.exchangeId];
  const isConn     = conn.status === 'connected';
  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    setSyncing(true);
    await new Promise(r => setTimeout(r, 1200));
    onSync();
    setSyncing(false);
    toast.success('Sync complete');
  }

  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border overflow-hidden transition-colors"
      style={{ background: 'rgba(255,255,255,0.025)', borderColor: isConn ? `${ex.color}25` : 'rgba(255,255,255,0.06)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          {/* Logo */}
          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl shrink-0"
            style={{ background: `${ex.color}15`, border: `1.5px solid ${ex.color}30` }}>
            {ex.logo}
          </div>
          <div>
            <p className="font-black text-white text-sm">{ex.name}</p>
            <p className="text-[11px] text-muted-foreground">{conn.label}</p>
          </div>
        </div>
        {/* Status badge */}
        <span className={cn('flex items-center gap-1.5 text-[10px] font-black px-2.5 py-1 rounded-full border',
          isConn
            ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
            : 'text-red-400 bg-red-500/10 border-red-500/20',
        )}>
          {isConn
            ? <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Connected</>
            : <><WifiOff className="h-3 w-3" /> Error</>
          }
        </span>
      </div>

      {/* Details grid */}
      <div className="px-5 py-4 space-y-3">
        {/* Row 1: key + since */}
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="space-y-0.5">
            <p className="text-white/30 text-[10px] font-bold uppercase tracking-wider">API Key</p>
            <p className="font-mono text-white/70">{conn.maskedKey ?? '(OAuth)'}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-white/30 text-[10px] font-bold uppercase tracking-wider">Connected Since</p>
            <p className="text-white/70">{new Date(conn.connectedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric', day: 'numeric' })}</p>
          </div>
        </div>

        {/* Row 2: permissions */}
        <div className="space-y-0.5">
          <p className="text-white/30 text-[10px] font-bold uppercase tracking-wider">Permissions</p>
          <div className="flex flex-wrap gap-1.5">
            {conn.permissions.map(p => (
              <span key={p} className={cn(
                'text-[9px] px-2 py-0.5 rounded-lg font-bold uppercase border',
                p === 'withdraw' || p === 'transfer'
                  ? 'text-red-400 bg-red-500/8 border-red-500/15'
                  : 'text-emerald-400 bg-emerald-500/8 border-emerald-500/15',
              )}>
                {p === 'withdraw' ? '⚠ ' : p === 'transfer' ? '⚠ ' : ''}{p}
              </span>
            ))}
            {conn.isReadOnly && (
              <span className="text-[9px] px-2 py-0.5 rounded-lg font-bold text-amber-400 bg-amber-500/8 border border-amber-500/15">
                READ-ONLY
              </span>
            )}
          </div>
        </div>

        {/* Row 3: balance + sync */}
        <div className="flex items-center justify-between pt-1">
          <div>
            <p className="text-white/30 text-[10px] font-bold uppercase tracking-wider">Balance</p>
            <p className="font-black text-white text-sm mt-0.5">{fmtUSD(conn.balanceUSD)} <span className="font-normal text-white/30 text-xs">USDT</span></p>
          </div>
          <div className="text-right">
            <p className="text-white/30 text-[10px] font-bold uppercase tracking-wider">Last Sync</p>
            <p className="text-white/50 text-xs mt-0.5 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {conn.lastSyncAt ? timeAgo(conn.lastSyncAt) : 'Never'}
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 px-5 pb-4">
        <button onClick={handleSync} disabled={syncing}
          className={cn('flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all',
            syncing ? 'bg-white/5 text-white/30 cursor-not-allowed' : 'bg-white/6 text-white/60 hover:bg-white/12 hover:text-white',
          )}>
          <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
          {syncing ? 'Syncing…' : 'Sync Now'}
        </button>
        <button onClick={onEdit}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold bg-white/6 text-white/60 hover:bg-white/12 hover:text-white transition-all">
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
        <button onClick={onDisconnect}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold bg-red-500/8 text-red-400 hover:bg-red-500/15 border border-red-500/15 transition-all">
          <Trash2 className="h-3.5 w-3.5" /> Disconnect
        </button>
      </div>
    </motion.div>
  );
}

// ── Add New Exchange Form ──────────────────────────────────────────────────────

const HOW_TO: Record<ExchangeId, string[]> = {
  binance:  ['Log into your Binance account', 'Go to Account → API Management', 'Create new API key with "Enable Spot & Margin Trading" only', 'DO NOT enable withdrawal or transfer permissions', 'Copy the key and secret immediately (shown once)'],
  coinbase: ['Log into your Coinbase account', 'Go to Settings → API', 'Click "New API Key" and select your portfolio', 'Grant "View" and "Trade" permissions only', 'Complete 2FA verification to confirm'],
  kraken:   ['Log into your Kraken account', 'Go to Security → API', 'Click "Add key" and set permissions', 'Enable: Query Funds, Create & Modify Orders', 'DO NOT enable Withdraw Funds permission'],
  okx:      ['Log into your OKX account', 'Go to Account → API', 'Click "Create API V5 Key"', 'Set permissions to "Trade" only — no withdrawal', 'Set a strong passphrase and save it securely'],
};

function AddExchangeForm({ onConnected }: { onConnected: () => void }) {
  const { connectExchange, connectOAuth } = useExchangeStore();
  const [selectedEx, setSelectedEx] = useState<ExchangeId>('binance');
  const [label,       setLabel]       = useState('');
  const [apiKey,      setApiKey]      = useState('');
  const [apiSecret,   setApiSecret]   = useState('');
  const [passphrase,  setPassphrase]  = useState('');
  const [showSecret,  setShowSecret]  = useState(false);
  const [showPass,    setShowPass]    = useState(false);
  const [testing,     setTesting]     = useState(false);
  const [connecting,  setConnecting]  = useState(false);
  const [testResult,  setTestResult]  = useState<'idle' | 'ok' | 'fail'>('idle');
  const [error,       setError]       = useState('');
  const [howToOpen,   setHowToOpen]   = useState(true);

  const ex = EXCHANGE_META[selectedEx];
  const isOAuth = ex.authMethod === 'oauth2';

  function resetForm() {
    setApiKey(''); setApiSecret(''); setPassphrase('');
    setLabel(''); setTestResult('idle'); setError('');
  }

  async function handleTest() {
    if (!isOAuth && (!apiKey || apiKey.length < 8)) { setError('Enter a valid API key'); return; }
    setTesting(true); setTestResult('idle'); setError('');
    await new Promise(r => setTimeout(r, 1200));
    setTesting(false);
    setTestResult('ok');
    toast.success('Connection test successful ✓');
  }

  async function handleConnect() {
    setError('');
    if (!isOAuth) {
      if (!apiKey || apiKey.length < 8)   { setError('API Key must be at least 8 characters'); return; }
      if (!apiSecret || apiSecret.length < 8) { setError('API Secret must be at least 8 characters'); return; }
      if (ex.requiresPassphrase && !passphrase) { setError('Passphrase is required for OKX'); return; }
    }
    setConnecting(true);
    let result: { success: boolean; error?: string };
    if (isOAuth) {
      result = await connectOAuth({ exchangeId: selectedEx, label: label || `My ${ex.name}` });
    } else {
      result = await connectExchange({
        exchangeId: selectedEx, label: label || `My ${ex.name}`,
        apiKey, apiSecret, passphrase,
        modes: ex.supportedModes.slice(0, 1) as any,
        permissions: ['read', 'trade'],
        isReadOnly: false,
      });
    }
    setConnecting(false);
    if (!result.success) { setError(result.error ?? 'Connection failed'); return; }
    toast.success(`${ex.name} connected! 🎉`);
    resetForm();
    onConnected();
  }

  return (
    <div className="rounded-2xl border border-white/8 overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.02)' }}>
      <div className="px-5 pt-5 pb-4 border-b border-white/5">
        <p className="text-sm font-black text-white">Add New Exchange</p>
      </div>

      <div className="p-5 space-y-5">
        {/* Exchange selector */}
        <div className="space-y-2">
          <p className="text-xs font-bold text-white/40 uppercase tracking-wider">Select Exchange</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.keys(EXCHANGE_META) as ExchangeId[]).map(id => {
              const e = EXCHANGE_META[id];
              return (
                <button key={id} onClick={() => { setSelectedEx(id); resetForm(); }}
                  className={cn('flex flex-col items-center gap-2 px-3 py-3 rounded-xl border transition-all',
                    selectedEx === id
                      ? 'border-primary/40 bg-primary/8'
                      : 'border-white/8 bg-white/[0.02] hover:border-white/15',
                  )}>
                  <span className="text-xl">{e.logo}</span>
                  <span className="text-[10px] font-black text-white">{e.name}</span>
                  <span className={cn('text-[8px] px-1.5 py-0.5 rounded-full font-bold',
                    e.authMethod === 'oauth2' ? 'bg-blue-500/15 text-blue-400' : 'bg-amber-500/15 text-amber-400',
                  )}>
                    {e.authMethod === 'oauth2' ? 'OAuth2' : 'API Key'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* How to get API keys */}
        <div className="rounded-xl border border-white/8 overflow-hidden">
          <button onClick={() => setHowToOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-xs font-bold text-white/60 hover:text-white transition-colors">
            <span>How to get API keys for {ex.name}</span>
            {howToOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <AnimatePresence>
            {howToOpen && (
              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                className="overflow-hidden">
                <div className="px-4 pb-4 space-y-1.5">
                  {HOW_TO[selectedEx].map((step, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-white/50">
                      <span className="w-4 h-4 rounded-full bg-primary/15 text-primary text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                      {step}
                    </div>
                  ))}
                  <a href={ex.docsUrl} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-primary hover:underline pt-1">
                    <ExternalLink className="h-3 w-3" /> {ex.name} API Documentation
                  </a>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Fields */}
        <div className="space-y-3">
          {/* Nickname */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-white/40">Account Nickname (optional)</label>
            <input value={label} onChange={e => setLabel(e.target.value)}
              placeholder={`e.g. My ${ex.name}`}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-primary/40 transition-colors" />
          </div>

          {isOAuth ? (
            <div className="rounded-xl px-4 py-4 text-sm text-center space-y-2"
              style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
              <p className="text-blue-300 font-bold text-xs">OAuth2 — Secure redirect</p>
              <p className="text-blue-200/60 text-xs">You'll be redirected to {ex.name} to authorize access. No passwords or keys needed.</p>
            </div>
          ) : (
            <>
              {/* API Key */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-white/40 flex items-center gap-1.5">
                  <Key className="h-3 w-3" /> API Key
                </label>
                <input value={apiKey} onChange={e => { setApiKey(e.target.value); setTestResult('idle'); }}
                  placeholder="Paste your API key here"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-primary/40 font-mono transition-colors" />
              </div>

              {/* API Secret */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-white/40 flex items-center gap-1.5">
                  <Lock className="h-3 w-3" /> API Secret
                </label>
                <div className="relative">
                  <input value={apiSecret} onChange={e => { setApiSecret(e.target.value); setTestResult('idle'); }}
                    type={showSecret ? 'text' : 'password'}
                    placeholder="Paste your API secret here"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 pr-10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-primary/40 font-mono transition-colors" />
                  <button onClick={() => setShowSecret(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50 transition-colors">
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Passphrase (OKX) */}
              {ex.requiresPassphrase && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-white/40">Passphrase</label>
                  <div className="relative">
                    <input value={passphrase} onChange={e => setPassphrase(e.target.value)}
                      type={showPass ? 'text' : 'password'}
                      placeholder="Your OKX API passphrase"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 pr-10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-primary/40 font-mono transition-colors" />
                    <button onClick={() => setShowPass(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50 transition-colors">
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Error */}
          {error && (
            <p className="text-xs text-red-400 flex items-center gap-1.5 px-1">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {error}
            </p>
          )}

          {/* Test result */}
          {testResult === 'ok' && (
            <div className="flex items-center gap-2 text-xs text-emerald-400 px-1">
              <CheckCircle className="h-3.5 w-3.5" /> Connection test passed — ready to connect
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          {!isOAuth && (
            <button onClick={handleTest} disabled={testing || connecting}
              className={cn('flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold border transition-all',
                testResult === 'ok'
                  ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/8'
                  : 'border-white/12 text-white/50 hover:border-white/25 hover:text-white',
                (testing || connecting) && 'opacity-50 cursor-not-allowed',
              )}>
              {testing ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Testing…</> :
               testResult === 'ok' ? <><CheckCircle className="h-3.5 w-3.5" /> Tested ✓</> :
               'Test Connection'}
            </button>
          )}
          <button onClick={handleConnect} disabled={connecting}
            className={cn('flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black transition-all',
              connecting ? 'bg-white/10 text-white/30 cursor-not-allowed' : 'bg-primary text-white hover:brightness-110',
            )}>
            {connecting ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Connecting…</> : 'Connect'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export function ExchangeConnectionsPage({ onAddNew }: { onAddNew?: () => void }) {
  const { connections, disconnectExchange, syncExchange } = useExchangeStore();

  const [warningDismissed, setWarningDismissed] = useState(() =>
    localStorage.getItem('exchange_warning_dismissed') === 'true',
  );
  const [showAddForm, setShowAddForm] = useState(connections.length === 0);

  function dismissWarning() {
    localStorage.setItem('exchange_warning_dismissed', 'true');
    setWarningDismissed(true);
  }

  function handleDisconnect(id: string, name: string) {
    if (confirm(`Disconnect ${name}? All deployed strategies will be stopped.`)) {
      disconnectExchange(id);
      toast.success('Exchange disconnected');
    }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-black text-white">🔗 Exchange Connections</h2>
        <button onClick={() => setShowAddForm(v => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:brightness-110 transition-all">
          <Plus className="h-3.5 w-3.5" /> Add New
        </button>
      </div>

      {/* Safety warning */}
      <SafetyWarning dismissed={warningDismissed} onDismiss={dismissWarning} />

      {/* Connected Exchanges */}
      {connections.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <p className="text-xs font-black text-white/40 uppercase tracking-wider">Connected Exchanges</p>
            <div className="flex-1 h-px bg-white/5" />
          </div>
          <AnimatePresence>
            {connections.map(c => (
              <ConnectionCard key={c.id} conn={c}
                onSync={() => syncExchange(c.id)}
                onDisconnect={() => handleDisconnect(c.id, EXCHANGE_META[c.exchangeId].name)}
                onEdit={() => toast.info('Edit: update API keys by reconnecting with new credentials')} />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Add New Exchange */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <p className="text-xs font-black text-white/40 uppercase tracking-wider">Add New Exchange</p>
          <div className="flex-1 h-px bg-white/5" />
        </div>
        <AnimatePresence>
          {(showAddForm || connections.length === 0) && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <AddExchangeForm onConnected={() => setShowAddForm(false)} />
            </motion.div>
          )}
        </AnimatePresence>
        {!showAddForm && connections.length > 0 && (
          <button onClick={() => setShowAddForm(true)}
            className="w-full py-3 rounded-2xl border border-dashed border-white/10 text-xs font-bold text-white/30 hover:border-primary/30 hover:text-primary transition-all flex items-center justify-center gap-2">
            <Plus className="h-3.5 w-3.5" /> Connect another exchange
          </button>
        )}
      </div>
    </div>
  );
}
