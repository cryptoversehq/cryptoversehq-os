import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { BarChart2 } from 'lucide-react';
import { COINS } from '@/lib/coins';

const WATCH_TOP = ['bitcoin', 'ethereum', 'binancecoin', 'solana', 'ripple', 'cardano', 'dogecoin', 'polkadot'];

export function CorrelationMatrixWidget() {
  const items = useMemo(() => WATCH_TOP.map(id => COINS.find(c => c.id === id)!).filter(Boolean), []);
  const matrix = useMemo(() => {
    const m: Record<string, Record<string, number>> = {};
    items.forEach(a => {
      m[a.id] = {};
      items.forEach(b => {
        m[a.id][b.id] = a.id === b.id ? 1 : 0.4 + Math.random() * 0.55;
      });
    });
    return m;
  }, [items]);

  const corrColor = (v: number) => {
    if (v >= 0.8) return 'bg-emerald-500/40';
    if (v >= 0.6) return 'bg-emerald-400/25';
    if (v >= 0.4) return 'bg-amber-400/20';
    return 'bg-red-400/15';
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-white/5 rounded-2xl overflow-hidden p-5">
      <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mb-4">
        <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center"><BarChart2 className="h-4 w-4 text-primary" /></div>
        Correlation Matrix
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr>
              <th className="p-1 text-left text-muted-foreground"></th>
              {items.map(c => <th key={c.id} className="p-1 text-center font-semibold" style={{ color: c.color }}>{c.symbol}</th>)}
            </tr>
          </thead>
          <tbody>
            {items.map(a => (
              <tr key={a.id}>
                <td className="p-1 font-semibold" style={{ color: a.color }}>{a.symbol}</td>
                {items.map(b => {
                  const v = matrix[a.id]?.[b.id] ?? 0;
                  return <td key={b.id} className="p-0.5"><div className={corrColor(v) + ' h-6 w-full rounded flex items-center justify-center font-mono text-foreground/80'}>{v.toFixed(2)}</div></td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}