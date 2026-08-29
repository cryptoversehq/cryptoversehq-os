/**
 * LiveTradeSimulator.tsx
 *
 * Developer/demo widget that lets users trigger the full CopyTradeEngine
 * pipeline in-browser. Each click picks an active relationship and fires
 * a simulated trade through all 9 engine steps (filters → balance → daily
 * loss → execution → fee distribution → risk checks → toast).
 *
 * The widget is collapsible and lives in the corner of the Copy Trading home page.
 */
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, ChevronDown, ChevronUp, Loader2, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { useCopyTradingStore } from '../../lib/copyTradingStore';
import { CTV, fmtUsd } from './CopyTradingUtils';
import { CopyExecution } from '../../lib/copyTradingTypes';

interface SimRun {
  id:       string;
  relName:  string;
  exec:     CopyExecution | null;
  blocked:  boolean;
  ts:       string;
}

const DEMO_USER = 'demo_follower';

export function LiveTradeSimulator() {
  const [open,    setOpen]    = useState(false);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<SimRun[]>([]);

  const relationships        = useCopyTradingStore(s => s.relationships);
  const simulateCopyExecution = useCopyTradingStore(s => s.simulateCopyExecution);
  const traders              = useCopyTradingStore(s => s.traders);

  const activeRels = useMemo(
    () => Object.values(relationships).filter(r => r.followerId === DEMO_USER && r.status === 'active'),
    [relationships],
  );

  async function runSim() {
    if (!activeRels.length || running) return;
    setRunning(true);

    // Pick a random active relationship
    const rel = activeRels[Math.floor(Math.random() * activeRels.length)];

    const exec = await simulateCopyExecution(rel.id);

    const run: SimRun = {
      id:      `${Date.now()}`,
      relName: rel.traderName,
      exec,
      blocked: exec === null,
      ts:      new Date().toLocaleTimeString(),
    };

    setHistory(h => [run, ...h].slice(0, 8));
    setRunning(false);
  }

  return (
    <div className="fixed bottom-20 left-4 lg:bottom-6 lg:left-6 z-30 w-72">
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full px-4 py-2.5 rounded-2xl text-sm font-bold shadow-xl transition-all"
        style={{
          background:  'linear-gradient(135deg,#FFD700,#FFA800)',
          color:       '#0A1929',
          boxShadow:   '0 8px 32px rgba(255,215,0,0.25)',
        }}
      >
        <Zap className="h-4 w-4" />
        <span>Live Engine Simulator</span>
        {open ? <ChevronDown className="h-4 w-4 ml-auto" /> : <ChevronUp className="h-4 w-4 ml-auto" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{   opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className="mt-2 rounded-2xl overflow-hidden shadow-2xl"
            style={{ background: 'var(--bg-card)', border: `1px solid ${CTV.border}` }}
          >
            {/* Header */}
            <div className="px-4 py-3 border-b" style={{ borderColor: CTV.border }}>
              <p className="text-xs font-bold text-foreground">CopyTradeEngine Demo</p>
              <p className="text-[10px] mt-0.5 text-muted-foreground">
                Fires a random trade through all 9 engine steps
              </p>
            </div>

            {/* Stats */}
            <div className="px-4 py-2 grid grid-cols-2 gap-2 border-b" style={{ borderColor: CTV.border }}>
              <div>
                <p className="text-[10px]" style={{ color: CTV.gray }}>Active rels</p>
                <p className="font-bold text-sm" style={{ color: CTV.gold }}>{activeRels.length}</p>
              </div>
              <div>
                <p className="text-[10px]" style={{ color: CTV.gray }}>Simulations</p>
                <p className="font-bold text-sm text-foreground">{history.length}</p>
              </div>
            </div>

            {/* Run button */}
            <div className="px-4 py-3">
              <button
                onClick={runSim}
                disabled={running || activeRels.length === 0}
                className="w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                style={{ background: CTV.goldAlpha, color: CTV.gold, border: `1px solid ${CTV.goldBorder}` }}
              >
                {running
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Running…</>
                  : <><RefreshCw className="h-4 w-4" /> Fire Trade</>
                }
              </button>
              {activeRels.length === 0 && (
                <p className="text-[10px] mt-1 text-center" style={{ color: CTV.red }}>
                  No active relationships to simulate
                </p>
              )}
            </div>

            {/* History */}
            {history.length > 0 && (
              <div className="border-t" style={{ borderColor: CTV.border }}>
                <p className="text-[10px] font-bold px-4 py-2" style={{ color: CTV.gray }}>Recent Runs</p>
                <div className="max-h-48 overflow-y-auto">
                  {history.map(run => (
                    <div key={run.id}
                      className="flex items-start gap-2 px-4 py-2 border-b last:border-0"
                      style={{ borderColor: CTV.border }}>
                      {run.blocked
                        ? <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: CTV.red }} />
                        : <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-400" />
                      }
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold text-foreground truncate">{run.relName}</p>
                        {run.exec ? (
                          <p className="text-[10px]" style={{ color: CTV.gray }}>
                            {run.exec.type} {run.exec.symbol} · {fmtUsd(run.exec.copiedAmountUsd)}
                            {run.exec.pnlUsd !== null && (
                              <span style={{ color: run.exec.pnlUsd >= 0 ? CTV.green : CTV.red }}>
                                {' '}· PnL {fmtUsd(run.exec.pnlUsd)}
                              </span>
                            )}
                          </p>
                        ) : (
                          <p className="text-[10px]" style={{ color: CTV.red }}>Blocked by engine</p>
                        )}
                      </div>
                      <span className="text-[9px] shrink-0 mt-0.5" style={{ color: CTV.gray }}>{run.ts}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
