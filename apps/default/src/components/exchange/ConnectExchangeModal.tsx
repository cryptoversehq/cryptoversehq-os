/**
 * ConnectExchangeModal.tsx — Multi-step exchange connection wizard
 * Steps: 1. Choose Exchange → 2. Auth / API keys → 3. Permissions → 4. Risk Setup → 5. Done
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, ChevronRight, ChevronLeft, Eye, EyeOff,
  Shield, CheckCircle, AlertTriangle, ExternalLink,
  Loader2, Lock, Key, Globe, Zap,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useExchangeStore } from '../../lib/exchangeStore';
import {
  ExchangeId, EXCHANGE_META, ExchangeMeta,
  TradingMode, ExchangePermission,
} from '../../lib/exchangeTypes';
import { toast } from 'sonner';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  userLevel: number;
}

type Step = 'choose' | 'auth' | 'permissions' | 'risk' | 'done';

// ── Step indicator ─────────────────────────────────────────────────────────────

const STEPS: { id: Step; label: string }[] = [
  { id: 'choose',      label: 'Exchange'    },
  { id: 'auth',        label: 'Connect'     },
  { id: 'permissions', label: 'Permissions' },
  { id: 'risk',        label: 'Risk Setup'  },
  { id: 'done',        label: 'Done'        },
];

function StepBar({ current }: { current: Step }) {
  const idx = STEPS.findIndex(s => s.id === current);
  return (
    <div className="flex items-center gap-0 px-6 pt-5 pb-1">
      {STEPS.map((s, i) => (
        <React.Fragment key={s.id}>
          <div className="flex flex-col items-center">
            <div className={cn(
              'w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-all duration-300',
              i < idx  ? 'bg-primary text-white' :
              i === idx ? 'bg-primary text-white ring-4 ring-primary/20' :
              'bg-white/8 text-white/30',
            )}>
              {i < idx ? <CheckCircle className="h-4 w-4" /> : i + 1}
            </div>
            <span className={cn('text-[9px] mt-1 font-bold tracking-wide',
              i <= idx ? 'text-primary' : 'text-white/20'
            )}>{s.label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={cn('flex-1 h-px mx-1 mb-5 transition-colors duration-300',
              i < idx ? 'bg-primary/50' : 'bg-white/8'
            )} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Step 1: Choose Exchange ───────────────────────────────────────────────────

function ChooseStep({
  userLevel, selected, onSelect
}: { userLevel: number; selected: ExchangeId | null; onSelect: (id: ExchangeId) => void }) {
  const exchanges = Object.values(EXCHANGE_META);
  return (
    <div className="space-y-3">
      <div className="px-6">
        <h2 className="text-base font-black text-foreground">Select Exchange</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Choose the exchange you want to connect to</p>
      </div>
      <div className="px-6 space-y-2">
        {exchanges.map(ex => {
          const locked = userLevel < ex.minLevel;
          const isSelected = selected === ex.id;
          return (
            <button key={ex.id} onClick={() => !locked && onSelect(ex.id)} disabled={locked}
              className={cn(
                'w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left',
                locked ? 'opacity-40 cursor-not-allowed border-border bg-transparent' :
                isSelected ? 'border-primary/50 bg-primary/8' :
                'border-border bg-card hover:border-border/60 hover:bg-secondary/20',
              )}>
              {/* Logo */}
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                style={{ background: `${ex.color}18`, border: `1px solid ${ex.color}30` }}>
                {ex.logo}
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-black text-sm text-white">{ex.name}</span>
                  <span className={cn(
                    'text-[9px] px-1.5 py-0.5 rounded-full font-bold',
                    ex.authMethod === 'oauth2' ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20' :
                    'bg-amber-500/15 text-amber-400 border border-amber-500/20',
                  )}>
                    {ex.authMethod === 'oauth2' ? 'OAuth2' : 'API Key'}
                  </span>
                  {locked && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20 font-bold">
                      Lvl {ex.minLevel}+
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{ex.description}</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {ex.supportedModes.map(m => (
                    <span key={m} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-white/40 font-bold uppercase">
                      {m}
                    </span>
                  ))}
                </div>
              </div>
              {/* Check */}
              {isSelected && <CheckCircle className="h-5 w-5 text-primary shrink-0" />}
            </button>
          );
        })}
      </div>

      {/* Safety notice */}
      <div className="mx-6 px-4 py-3 rounded-xl flex items-start gap-2.5"
        style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
        <Shield className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
        <p className="text-[11px] text-blue-300/80">
          Your API keys are stored locally and encrypted. CryptoVerse never transmits your keys to any server.
        </p>
      </div>
    </div>
  );
}

// ── Step 2: Auth ──────────────────────────────────────────────────────────────

function AuthStep({
  exchange,
  apiKey, setApiKey,
  apiSecret, setApiSecret,
  passphrase, setPassphrase,
  label, setLabel,
}: {
  exchange: ExchangeMeta;
  apiKey: string; setApiKey: (v: string) => void;
  apiSecret: string; setApiSecret: (v: string) => void;
  passphrase: string; setPassphrase: (v: string) => void;
  label: string; setLabel: (v: string) => void;
}) {
  const [showSecret, setShowSecret] = useState(false);
  const [showPass, setShowPass] = useState(false);

  if (exchange.authMethod === 'oauth2') {
    return (
      <div className="px-6 space-y-4">
        <div>
          <h2 className="text-base font-black text-white">Connect via OAuth2</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            You'll be securely redirected to {exchange.name} to authorize access.
          </p>
        </div>
        {/* Label */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-white/60">Account Nickname</label>
          <input value={label} onChange={e => setLabel(e.target.value)}
            placeholder={`e.g. My ${exchange.name} Account`}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-primary/50 transition-colors" />
        </div>
        {/* OAuth card */}
        <div className="rounded-2xl p-5 space-y-3" style={{ background: `${exchange.color}0F`, border: `1px solid ${exchange.color}25` }}>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{exchange.logo}</span>
            <div>
              <p className="font-black text-white text-sm">{exchange.name} OAuth2</p>
              <p className="text-xs text-muted-foreground">Secure authorization without sharing your password</p>
            </div>
          </div>
          <div className="space-y-2">
            {['Read portfolio & balances', 'Place & manage orders', 'View trade history'].map(f => (
              <div key={f} className="flex items-center gap-2 text-xs text-white/60">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                {f}
              </div>
            ))}
          </div>
          <a href={exchange.docsUrl} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline">
            <ExternalLink className="h-3 w-3" /> API Documentation
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 space-y-4">
      <div>
        <h2 className="text-base font-black text-white">API Key Setup</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Enter your {exchange.name} API credentials. Never share these with anyone.
        </p>
      </div>

      {/* How to get keys */}
      <div className="rounded-xl px-4 py-3 flex items-start gap-2.5"
        style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
        <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
        <div className="text-[11px] text-amber-300/80 space-y-0.5">
          <p className="font-bold">Recommended: Create a restricted API key</p>
          <p>Enable only "Read Info" + "Spot Trading". Never enable withdrawals.</p>
          <a href={exchange.docsUrl} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 text-amber-400 hover:underline mt-1">
            <ExternalLink className="h-3 w-3" /> {exchange.name} API Guide
          </a>
        </div>
      </div>

      {/* Label */}
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-white/60">Account Nickname</label>
        <input value={label} onChange={e => setLabel(e.target.value)}
          placeholder={`e.g. My ${exchange.name} Account`}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-primary/50 transition-colors" />
      </div>

      {/* API Key */}
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-white/60 flex items-center gap-1.5">
          <Key className="h-3 w-3" /> API Key
        </label>
        <input value={apiKey} onChange={e => setApiKey(e.target.value)}
          placeholder="Paste your API key here"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-primary/50 transition-colors font-mono" />
      </div>

      {/* API Secret */}
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-white/60 flex items-center gap-1.5">
          <Lock className="h-3 w-3" /> API Secret
        </label>
        <div className="relative">
          <input value={apiSecret} onChange={e => setApiSecret(e.target.value)}
            type={showSecret ? 'text' : 'password'}
            placeholder="Paste your API secret here"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 pr-10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-primary/50 transition-colors font-mono" />
          <button onClick={() => setShowSecret(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
            {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Passphrase (OKX only) */}
      {exchange.requiresPassphrase && (
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-white/60">Passphrase</label>
          <div className="relative">
            <input value={passphrase} onChange={e => setPassphrase(e.target.value)}
              type={showPass ? 'text' : 'password'}
              placeholder="Your OKX API passphrase"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 pr-10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-primary/50 transition-colors font-mono" />
            <button onClick={() => setShowPass(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step 3: Permissions ───────────────────────────────────────────────────────

const PERM_META: { id: ExchangePermission; label: string; desc: string; icon: React.ElementType; danger: boolean }[] = [
  { id: 'read',     label: 'Read',    desc: 'View balances, positions and history', icon: Globe,  danger: false },
  { id: 'trade',    label: 'Trade',   desc: 'Place and cancel orders on your behalf', icon: Zap,    danger: false },
  { id: 'transfer', label: 'Transfer',desc: 'Move funds between accounts (internal)', icon: Shield, danger: true  },
  { id: 'withdraw', label: 'Withdraw',desc: 'Send funds to external addresses', icon: AlertTriangle, danger: true },
];

function PermissionsStep({
  exchange, selectedPerms, setPerms, selectedModes, setModes, isReadOnly, setReadOnly,
}: {
  exchange: ExchangeMeta;
  selectedPerms: ExchangePermission[]; setPerms: (v: ExchangePermission[]) => void;
  selectedModes: TradingMode[];        setModes: (v: TradingMode[]) => void;
  isReadOnly: boolean; setReadOnly: (v: boolean) => void;
}) {
  function togglePerm(p: ExchangePermission) {
    if (p === 'read') return; // always required
    setPerms(selectedPerms.includes(p) ? selectedPerms.filter(x => x !== p) : [...selectedPerms, p]);
  }
  function toggleMode(m: TradingMode) {
    setModes(selectedModes.includes(m) ? selectedModes.filter(x => x !== m) : [...selectedModes, m]);
  }

  return (
    <div className="px-6 space-y-4">
      <div>
        <h2 className="text-base font-black text-white">Permissions & Modes</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Configure what CryptoVerse HQ is allowed to do</p>
      </div>

      {/* Read-only toggle */}
      <div className="flex items-center justify-between p-4 rounded-2xl border border-primary/20 bg-primary/5">
        <div>
          <p className="text-sm font-bold text-white">Read-Only Mode</p>
          <p className="text-xs text-muted-foreground">View data only — no trading actions</p>
        </div>
        <button onClick={() => setReadOnly(!isReadOnly)}
          className={cn('relative w-12 h-6 rounded-full transition-colors duration-300',
            isReadOnly ? 'bg-primary' : 'bg-white/10')}>
          <span className={cn('absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-300',
            isReadOnly ? 'translate-x-7' : 'translate-x-1')} />
        </button>
      </div>

      {/* Permissions */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-white/40 uppercase tracking-wider">Permissions</p>
        {PERM_META.map(p => {
          const isSelected = selectedPerms.includes(p.id) || p.id === 'read';
          const isForced   = p.id === 'read';
          const isDisabled = isForced || isReadOnly && p.id !== 'read';
          return (
            <div key={p.id} onClick={() => !isDisabled && togglePerm(p.id)}
              className={cn(
                'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all',
                isDisabled ? 'opacity-50 cursor-default' : 'cursor-pointer',
                isSelected && !p.danger ? 'border-emerald-500/30 bg-emerald-500/5' :
                isSelected && p.danger  ? 'border-red-500/30 bg-red-500/5' :
                'border-white/6 bg-white/[0.02] hover:border-white/12',
              )}>
              <p.icon className={cn('h-4 w-4 shrink-0', p.danger ? 'text-red-400' : 'text-primary')} />
              <div className="flex-1">
                <p className={cn('text-xs font-bold', p.danger ? 'text-red-300' : 'text-white')}>
                  {p.label} {p.danger && '⚠️'}
                </p>
                <p className="text-[10px] text-muted-foreground">{p.desc}</p>
              </div>
              <div className={cn('w-4 h-4 rounded border flex items-center justify-center transition-all',
                isSelected ? (p.danger ? 'bg-red-500 border-red-500' : 'bg-primary border-primary') : 'border-white/20')}>
                {isSelected && <CheckCircle className="h-3 w-3 text-white" />}
              </div>
            </div>
          );
        })}
      </div>

      {/* Trading modes */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-white/40 uppercase tracking-wider">Trading Modes</p>
        <div className="flex flex-wrap gap-2">
          {exchange.supportedModes.map(m => (
            <button key={m} onClick={() => toggleMode(m)} disabled={isReadOnly}
              className={cn(
                'px-4 py-2 rounded-xl text-xs font-bold border transition-all capitalize',
                selectedModes.includes(m)
                  ? 'bg-primary/15 border-primary/40 text-primary'
                  : 'bg-white/4 border-white/10 text-white/50 hover:border-white/20',
                isReadOnly && 'opacity-40 cursor-default',
              )}>
              {m}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Step 4: Risk Setup ────────────────────────────────────────────────────────

function RiskSetupStep({
  maxPos, setMaxPos, maxLoss, setMaxLoss, sl, setSl, tp, setTp,
}: {
  maxPos: number; setMaxPos: (v: number) => void;
  maxLoss: number; setMaxLoss: (v: number) => void;
  sl: number; setSl: (v: number) => void;
  tp: number; setTp: (v: number) => void;
}) {
  function Slider({ label, value, min, max, step = 1, unit, onChange, color = 'primary' }: {
    label: string; value: number; min: number; max: number; step?: number;
    unit: string; onChange: (v: number) => void; color?: string;
  }) {
    const pct = ((value - min) / (max - min)) * 100;
    return (
      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="font-bold text-white/60">{label}</span>
          <span className="font-black text-white">{value}{unit}</span>
        </div>
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
          style={{ background: `linear-gradient(to right, var(--tw-gradient-stops))`, accentColor: '#6366f1' }} />
        <div className="flex justify-between text-[9px] text-white/20">
          <span>{min}{unit}</span><span>{max}{unit}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 space-y-5">
      <div>
        <h2 className="text-base font-black text-white">Risk Controls</h2>
        <p className="text-xs text-muted-foreground mt-0.5">These limits protect you from excessive losses</p>
      </div>

      <div className="space-y-5">
        <Slider label="Max Position Size (USD)" value={maxPos} min={100} max={10000} step={100} unit=" USD" onChange={setMaxPos} />
        <Slider label="Max Daily Loss" value={maxLoss} min={1} max={20} step={0.5} unit="%" onChange={setMaxLoss} />
        <Slider label="Default Stop-Loss" value={sl} min={0.5} max={10} step={0.5} unit="%" onChange={setSl} />
        <Slider label="Default Take-Profit" value={tp} min={1} max={20} step={0.5} unit="%" onChange={setTp} />
      </div>

      <div className="px-4 py-3 rounded-xl flex items-start gap-2.5"
        style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
        <Shield className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
        <p className="text-[11px] text-emerald-300/80">
          Kill switch is automatically enabled — if drawdown exceeds 10%, all automated trading pauses instantly.
        </p>
      </div>
    </div>
  );
}

// ── Step Done ─────────────────────────────────────────────────────────────────

function DoneStep({ exchange, label }: { exchange: ExchangeMeta; label: string }) {
  return (
    <div className="px-6 space-y-5 text-center py-4">
      <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="w-20 h-20 mx-auto rounded-full flex items-center justify-center text-4xl"
        style={{ background: `${exchange.color}15`, border: `2px solid ${exchange.color}40` }}>
        {exchange.logo}
      </motion.div>
      <div>
        <h2 className="text-lg font-black text-white">Connected!</h2>
        <p className="text-sm text-muted-foreground mt-1">
          <span className="text-white font-bold">{label || `${exchange.name} Account`}</span> is now connected to CryptoVerse HQ
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 text-left">
        {['Portfolio synced', 'Risk limits set', 'Trade history imported', 'Ready to deploy strategies'].map(f => (
          <div key={f} className="flex items-center gap-2 text-xs text-white/60">
            <CheckCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            {f}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export function ConnectExchangeModal({ onClose, userLevel }: Props) {
  const { connectExchange, connectOAuth } = useExchangeStore();

  const [step,       setStep]       = useState<Step>('choose');
  const [exchange,   setExchange]   = useState<ExchangeId | null>(null);
  const [label,      setLabel]      = useState('');
  const [apiKey,     setApiKey]     = useState('');
  const [apiSecret,  setApiSecret]  = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [perms,      setPerms]      = useState<ExchangePermission[]>(['read', 'trade']);
  const [modes,      setModes]      = useState<TradingMode[]>(['spot']);
  const [isReadOnly, setReadOnly]   = useState(false);
  const [maxPos,     setMaxPos]     = useState(1000);
  const [maxLoss,    setMaxLoss]    = useState(5);
  const [sl,         setSl]         = useState(2);
  const [tp,         setTp]         = useState(4);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  const exMeta = exchange ? EXCHANGE_META[exchange] : null;

  async function handleNext() {
    setError('');

    if (step === 'choose') {
      if (!exchange) { setError('Please select an exchange'); return; }
      setStep('auth');
    } else if (step === 'auth') {
      if (exMeta?.authMethod === 'api_key') {
        if (!apiKey || apiKey.length < 8) { setError('Enter a valid API key (min 8 chars)'); return; }
        if (!apiSecret || apiSecret.length < 8) { setError('Enter a valid API secret (min 8 chars)'); return; }
        if (exMeta.requiresPassphrase && !passphrase) { setError('Passphrase is required for OKX'); return; }
      }
      setStep('permissions');
    } else if (step === 'permissions') {
      if (!isReadOnly && !perms.includes('trade')) { setError('Select at least Read + Trade permissions'); return; }
      if (modes.length === 0) { setError('Select at least one trading mode'); return; }
      setStep('risk');
    } else if (step === 'risk') {
      // Connect!
      setLoading(true);
      let result: { success: boolean; connectionId?: string; error?: string };
      if (exMeta?.authMethod === 'oauth2') {
        result = await connectOAuth({ exchangeId: exchange!, label });
      } else {
        result = await connectExchange({
          exchangeId: exchange!, label, apiKey, apiSecret, passphrase,
          modes, permissions: perms, isReadOnly,
        });
      }
      setLoading(false);
      if (!result.success) { setError(result.error ?? 'Connection failed'); return; }
      toast.success(`${exMeta?.name} connected successfully! 🎉`);
      setStep('done');
    } else if (step === 'done') {
      onClose();
    }
  }

  function handleBack() {
    const idx = STEPS.findIndex(s => s.id === step);
    if (idx > 0) setStep(STEPS[idx - 1].id);
  }

  const isLastStep = step === 'done';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
        className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{ background: 'rgba(10,10,14,0.97)', border: '1px solid rgba(255,255,255,0.08)' }}>

        {/* Close */}
        <button onClick={onClose} className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-white/6 hover:bg-white/12 flex items-center justify-center transition-colors">
          <X className="h-4 w-4 text-white/60" />
        </button>

        {/* Step bar */}
        <StepBar current={step} />

        {/* Content */}
        <div className="py-5 overflow-y-auto max-h-[70vh]">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.15 }}>
              {step === 'choose' && (
                <ChooseStep userLevel={userLevel} selected={exchange} onSelect={id => { setExchange(id); setModes([EXCHANGE_META[id].supportedModes[0]]); }} />
              )}
              {step === 'auth' && exMeta && (
                <AuthStep exchange={exMeta} apiKey={apiKey} setApiKey={setApiKey}
                  apiSecret={apiSecret} setApiSecret={setApiSecret}
                  passphrase={passphrase} setPassphrase={setPassphrase}
                  label={label} setLabel={setLabel} />
              )}
              {step === 'permissions' && exMeta && (
                <PermissionsStep exchange={exMeta} selectedPerms={perms} setPerms={setPerms}
                  selectedModes={modes} setModes={setModes} isReadOnly={isReadOnly} setReadOnly={setReadOnly} />
              )}
              {step === 'risk' && (
                <RiskSetupStep maxPos={maxPos} setMaxPos={setMaxPos} maxLoss={maxLoss} setMaxLoss={setMaxLoss}
                  sl={sl} setSl={setSl} tp={tp} setTp={setTp} />
              )}
              {step === 'done' && exMeta && <DoneStep exchange={exMeta} label={label} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mb-3 px-3 py-2 rounded-xl flex items-center gap-2 text-xs text-red-400 bg-red-500/8 border border-red-500/15">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {error}
          </div>
        )}

        {/* Footer buttons */}
        <div className="flex items-center gap-3 px-6 pb-6 pt-2">
          {step !== 'choose' && step !== 'done' && (
            <button onClick={handleBack} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/6 text-white/60 hover:bg-white/10 text-sm font-bold transition-colors">
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
          )}
          <button onClick={handleNext} disabled={loading}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-sm transition-all',
              loading ? 'bg-white/10 text-white/40 cursor-not-allowed' : 'bg-primary text-white hover:brightness-110',
            )}>
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Connecting…</>
            ) : isLastStep ? (
              'Go to Dashboard'
            ) : step === 'risk' ? (
              <>{exMeta?.authMethod === 'oauth2' ? 'Authorize with OAuth' : 'Connect Exchange'} <ChevronRight className="h-4 w-4" /></>
            ) : (
              <>Continue <ChevronRight className="h-4 w-4" /></>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
