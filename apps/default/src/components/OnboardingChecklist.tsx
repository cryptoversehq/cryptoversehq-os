import React, { useState } from 'react';
import { useAcademyStore } from '@/lib/academyStore';
import { useTradingStore } from '@/lib/tradingStore';
import { lynxMemory } from '@/lib/memoryEngine';
import { CheckCircle, Circle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Step {
  id: string;
  label: string;
  done: boolean;
  xp?: number;
  cp?: number;
}

export function OnboardingChecklist() {
  const [visible, setVisible] = useState(true);
  const { completedLessons } = useAcademyStore();
  const { history, positions } = useTradingStore();

  const askedLynx =
    lynxMemory.getSessionEvents().some(e => e.type === 'CHAT_MESSAGE' && (e as any).role === 'user') ||
    (() => { try { return localStorage.getItem('cv_lynx_asked') === 'true'; } catch { return false; } })();

  const hasSl =
    positions?.some(p => p.stopLoss != null) ||
    history?.some(t => (t as any).stopLoss != null) ||
    (() => { try { return localStorage.getItem('cv_sl_set') === 'true'; } catch { return false; } })();

  const checklist: Step[] = [
    {
      id: 'lesson',
      label: 'Complete Lesson 1 in Academy',
      done: (completedLessons as Set<string>).size > 0,
      xp: 100,
    },
    {
      id: 'trade',
      label: 'Place first simulated Buy Order ($500 BTC)',
      done: (history?.length || 0) > 0 || (positions?.length || 0) > 0,
    },
    {
      id: 'sl',
      label: 'Set Stop-Loss on open position',
      done: hasSl,
      cp: 50,
    },
    {
      id: 'lynx',
      label: 'Ask Lynx AI Coach a question',
      done: askedLynx,
    },
  ];

  const done = checklist.filter(s => s.done).length;
  const pct = Math.round((done / checklist.length) * 100);

  if (pct === 100 || !visible) return null;

  return (
    <div className="mb-6 rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎯</span>
          <h4 className="text-sm font-bold text-foreground">Getting Started — First-Day Checklist</h4>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border">
            {done} / {checklist.length} Completed
          </span>
        </div>
        <button
          onClick={() => setVisible(false)}
          className="p-1 rounded-lg hover:bg-secondary/50 text-muted-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="h-1.5 rounded-full bg-secondary/60 mb-3 overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {checklist.map(s => (
          <div
            key={s.id}
            className={cn(
              'flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs transition-all',
              s.done
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 line-through opacity-80'
                : 'border-border bg-secondary/30 text-foreground'
            )}
          >
            <div className="flex items-center gap-2">
              {s.done ? (
                <CheckCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              ) : (
                <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
              <span>{s.label}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {s.xp != null && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  +{s.xp} XP
                </span>
              )}
              {s.cp != null && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  +{s.cp} CP
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
