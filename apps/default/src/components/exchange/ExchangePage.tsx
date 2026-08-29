/**
 * ExchangePage.tsx — Real Exchange Connection feature root
 * Route: /exchange  (sub-pages via internal tab state)
 * Access: Level 10+ Academy graduates only
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Link2, Lock, GraduationCap, ChevronRight, AlertTriangle,
  Wifi, Settings, Rocket, BarChart3, TrendingUp,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useExchangeStore } from '../../lib/exchangeStore';
import { useAcademyStore } from '../../lib/academyStore';


// Sub-pages
import { ExchangeConnectionsPage } from './ExchangeConnectionsPage';
import { ExchangeTradePage }        from './ExchangeTradePage';
import { ExchangeDeployPage }       from './ExchangeDeployPage';
import { ExchangePortfolioPage }    from './ExchangePortfolioPage';
import { ExchangeSettingsPage }     from './ExchangeSettingsPage';

// ── Level gate ─────────────────────────────────────────────────────────────────

function LevelGate({ level, required }: { level: number; required: number }) {
  const pct = Math.min(100, (level / required) * 100);
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 space-y-6 max-w-lg mx-auto text-center">
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="w-24 h-24 rounded-3xl bg-red-500/10 flex items-center justify-center border border-red-500/20">
        <Lock className="h-10 w-10 text-red-400" />
      </motion.div>

      <div>
        <h1 className="text-2xl font-black text-foreground">Advanced Feature Locked</h1>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed max-w-sm mx-auto">
          Real Exchange Connection is available to Level {required}+ Academy graduates.
          This protects newer traders from real-fund risks before they're ready.
        </p>
      </div>

      {/* Progress */}
      <div className="w-full rounded-2xl p-5 space-y-4"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <div className="flex items-center justify-between text-sm">
          <span className="font-bold text-white/60">Your Level</span>
          <span className="font-black text-primary">Lvl {level}</span>
        </div>
        <div className="h-2.5 rounded-full bg-secondary/30 overflow-hidden">
          <motion.div className="h-full rounded-full bg-primary"
            initial={{ width: 0 }} animate={{ width: `${pct}%` }}
            transition={{ duration: 1, ease: 'easeOut' }} />
        </div>
        <div className="flex justify-between text-[10px] text-white/30">
          <span>Lvl {level} (you)</span>
          <span>Lvl {required} required</span>
        </div>
      </div>

      {/* Tips */}
      <div className="grid grid-cols-3 gap-3 w-full">
        {[
          { icon: GraduationCap, label: 'Complete more academy modules' },
          { icon: TrendingUp,    label: 'Study risk management modules' },
          { icon: ChevronRight,  label: `${required - level} more level${required - level !== 1 ? 's' : ''} to unlock` },
        ].map((c, i) => (
          <div key={i} className="rounded-xl p-3 space-y-2 text-center"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <c.icon className="h-5 w-5 text-primary mx-auto" />
            <p className="text-[10px] text-white/40">{c.label}</p>
          </div>
        ))}
      </div>

      <a href="/academy"
        className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-primary text-white font-black text-sm hover:brightness-110 transition-all">
        <GraduationCap className="h-4 w-4" /> Go to Academy
      </a>
    </div>
  );
}

// ── Safety disclaimer ──────────────────────────────────────────────────────────

function SafetyDisclaimer({ onAccept }: { onAccept: () => void }) {
  const [c1, setC1] = useState(false);
  const [c2, setC2] = useState(false);
  const [c3, setC3] = useState(false);
  const canProceed  = c1 && c2 && c3;

  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 space-y-6 max-w-lg mx-auto">
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="w-20 h-20 rounded-3xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
        <AlertTriangle className="h-10 w-10 text-amber-400" />
      </motion.div>

      <div className="text-center">
        <h1 className="text-xl font-black text-white">⚠️ Real Funds Warning</h1>
        <p className="text-sm text-muted-foreground mt-2">Please read and acknowledge before continuing:</p>
      </div>

      <div className="w-full space-y-3">
        {[
          { state: c1, set: setC1, text: 'I understand that real money will be used for trading. CryptoVerse HQ is a training platform and is not a licensed financial advisor. I trade at my own risk.' },
          { state: c2, set: setC2, text: 'I have set appropriate risk limits and will not allocate more than I can afford to lose. Past strategy performance does not guarantee future returns.' },
          { state: c3, set: setC3, text: 'I am solely responsible for all trades executed through connected exchanges. CryptoVerse is not liable for any financial losses.' },
        ].map(({ state, set, text }, i) => (
          <label key={i} className="flex items-start gap-3 cursor-pointer group" onClick={() => set(v => !v)}>
            <div className={cn('w-5 h-5 rounded-lg border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all',
              state ? 'bg-primary border-primary' : 'border-border group-hover:border-white/40',
            )}>
              {state && <span className="text-white text-[10px] font-black">✓</span>}
            </div>
            <p className="text-xs text-white/60 group-hover:text-white/80 transition-colors">{text}</p>
          </label>
        ))}
      </div>

      <button onClick={onAccept} disabled={!canProceed}
        className={cn('w-full py-3 rounded-2xl font-black text-sm transition-all',
          canProceed ? 'bg-primary text-white hover:brightness-110' : 'bg-secondary/30 text-white/20 cursor-not-allowed',
        )}>
        I Understand — Continue
      </button>
    </div>
  );
}

// ── Internal nav tabs ──────────────────────────────────────────────────────────

type SubPage = 'connections' | 'trade' | 'deploy' | 'portfolio' | 'settings';

const NAV: { id: SubPage; label: string; icon: React.ElementType; desc: string }[] = [
  { id: 'connections', label: 'Connections',  icon: Link2,     desc: 'Manage linked accounts' },
  { id: 'trade',       label: 'Trade',        icon: TrendingUp,desc: 'Real & demo orders'      },
  { id: 'deploy',      label: 'Deploy Bot',   icon: Rocket,    desc: 'Run strategies live'      },
  { id: 'portfolio',   label: 'Portfolio',    icon: BarChart3, desc: 'Sync & track balances'   },
  { id: 'settings',    label: 'Settings',     icon: Settings,  desc: 'Limits & preferences'    },
];

function TopNav({ active, onSelect, connectedCount }: {
  active: SubPage;
  onSelect: (p: SubPage) => void;
  connectedCount: number;
}) {
  return (
    <div className="flex overflow-x-auto gap-1 pb-0.5">
      {NAV.map(n => (
        <button key={n.id} onClick={() => onSelect(n.id)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0',
            active === n.id
              ? 'bg-primary/15 text-primary border border-primary/20'
              : 'text-white/40 hover:text-white hover:bg-secondary/30',
          )}>
          <n.icon className="h-3.5 w-3.5" />
          {n.label}
          {n.id === 'connections' && connectedCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 text-[8px] font-black flex items-center justify-center">
              {connectedCount}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Page Header ────────────────────────────────────────────────────────────────

function PageHeader({ connectedCount }: { connectedCount: number }) {
  return (
    <div className="flex items-center justify-between pb-1">
      <div className="flex items-center gap-2">
        <span className="text-xl">🔗</span>
        <div>
          <h1 className="font-black text-foreground text-base">Real Exchange Connection</h1>
          <p className="text-[10px] text-muted-foreground">Connect Binance · Coinbase · Kraken · OKX</p>
        </div>
        <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25 font-bold uppercase">
          Advanced
        </span>
      </div>
      {connectedCount > 0 && (
        <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold">
          <Wifi className="h-3.5 w-3.5" />
          {connectedCount} connected
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export function ExchangePage() {
  const { totalXP }       = useAcademyStore();
  const { getConnectedCount } = useExchangeStore();

  // Level derived from XP — 500 XP per level
  const userLevel  = Math.max(1, Math.floor(totalXP / 500));
  const MIN_LEVEL  = 10;
  const isLocked   = userLevel < MIN_LEVEL;

  const [disclaimerDone, setDisclaimerDone] = useState(() =>
    localStorage.getItem('exchange_disclaimer_v2') === 'true',
  );

  const [activePage, setActivePage] = useState<SubPage>('connections');

  function acceptDisclaimer() {
    localStorage.setItem('exchange_disclaimer_v2', 'true');
    setDisclaimerDone(true);
  }

  const connectedCount = getConnectedCount();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Fixed top header + nav */}
      <div className="shrink-0 px-4 pt-4 pb-0 border-b border-border space-y-3"
        style={{ background: 'rgba(0,0,0,0.08)', backdropFilter: 'blur(8px)' }}>
        <PageHeader connectedCount={connectedCount} />
        {!isLocked && disclaimerDone && (
          <TopNav active={activePage} onSelect={setActivePage} connectedCount={connectedCount} />
        )}
        <div className="h-px" />
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 sm:p-5 pb-24 lg:pb-8">
          {isLocked ? (
            <LevelGate level={userLevel} required={MIN_LEVEL} />
          ) : !disclaimerDone ? (
            <SafetyDisclaimer onAccept={acceptDisclaimer} />
          ) : (
            <AnimatePresence mode="wait">
              <motion.div key={activePage}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}>
                {activePage === 'connections' && (
                  <ExchangeConnectionsPage onAddNew={() => setActivePage('connections')} />
                )}
                {activePage === 'trade' && (
                  <ExchangeTradePage
                    onGoConnect={() => setActivePage('connections')}
                    onGoSettings={() => setActivePage('settings')} />
                )}
                {activePage === 'deploy' && (
                  <ExchangeDeployPage
                    onViewStrategies={() => setActivePage('portfolio')} />
                )}
                {activePage === 'portfolio' && (
                  <ExchangePortfolioPage />
                )}
                {activePage === 'settings' && (
                  <ExchangeSettingsPage />
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}
