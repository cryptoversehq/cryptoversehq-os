/**
 * CodeEditorModal.tsx
 *
 * Modal for writing custom JavaScript strategy code.
 * Features: syntax-highlighted display, template presets, indicator docs.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Code2, BookOpen, ChevronDown, CheckCircle2, Copy, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

const TEMPLATES: Array<{ name: string; description: string; code: string }> = [
  {
    name: 'RSI Mean Reversion',
    description: 'Buy on oversold, sell on overbought',
    code: `// RSI Mean Reversion Strategy
function strategy(data) {
  let position = null;
  const trades = [];

  for (let i = 14; i < data.prices.length; i++) {
    const price = data.prices[i];
    const rsi   = data.indicators.rsi[i];

    // Entry: RSI oversold (< 30)
    if (rsi < 30 && position === null) {
      position = { entry: price, date: data.dates[i] };
      trades.push({ action: 'buy', price, date: data.dates[i] });
    }
    // Exit: RSI overbought (> 70)
    else if (rsi > 70 && position !== null) {
      const pnl = (price - position.entry) / position.entry * 100;
      trades.push({ action: 'sell', price, pnl, date: data.dates[i] });
      position = null;
    }
  }

  // Close any open position at end
  if (position !== null) {
    const last  = data.prices[data.prices.length - 1];
    const pnl   = (last - position.entry) / position.entry * 100;
    trades.push({ action: 'sell', price: last, pnl, date: data.dates[data.dates.length - 1] });
  }

  return trades;
}`,
  },
  {
    name: 'MACD Crossover',
    description: 'Enter on golden cross, exit on death cross',
    code: `// MACD Crossover Strategy
function strategy(data) {
  let position = null;
  const trades = [];

  for (let i = 26; i < data.prices.length; i++) {
    const price   = data.prices[i];
    const macd    = data.indicators.macd[i];
    const signal  = data.indicators.macdSignal[i];
    const prevMacd   = data.indicators.macd[i - 1];
    const prevSignal = data.indicators.macdSignal[i - 1];

    // MACD crosses above signal → buy
    if (prevMacd <= prevSignal && macd > signal && position === null) {
      position = { entry: price, date: data.dates[i] };
      trades.push({ action: 'buy', price, date: data.dates[i] });
    }
    // MACD crosses below signal → sell
    else if (prevMacd >= prevSignal && macd < signal && position !== null) {
      const pnl = (price - position.entry) / position.entry * 100;
      trades.push({ action: 'sell', price, pnl, date: data.dates[i] });
      position = null;
    }
  }

  return trades;
}`,
  },
  {
    name: 'Moving Average Crossover',
    description: 'Classic SMA(10) vs SMA(30) crossover',
    code: `// Moving Average Crossover Strategy
function strategy(data) {
  let position = null;
  const trades = [];

  for (let i = 30; i < data.prices.length; i++) {
    const price  = data.prices[i];
    const sma10  = data.indicators.sma10[i];
    const sma30  = data.indicators.sma30[i];
    const pSma10 = data.indicators.sma10[i - 1];
    const pSma30 = data.indicators.sma30[i - 1];

    // Golden cross: SMA10 crosses above SMA30
    if (pSma10 <= pSma30 && sma10 > sma30 && position === null) {
      position = { entry: price, date: data.dates[i] };
      trades.push({ action: 'buy', price, date: data.dates[i] });
    }
    // Death cross: SMA10 crosses below SMA30
    else if (pSma10 >= pSma30 && sma10 < sma30 && position !== null) {
      const pnl = (price - position.entry) / position.entry * 100;
      trades.push({ action: 'sell', price, pnl, date: data.dates[i] });
      position = null;
    }
  }

  return trades;
}`,
  },
  {
    name: 'Bollinger Band Bounce',
    description: 'Buy at lower band, sell at upper band',
    code: `// Bollinger Band Bounce Strategy
function strategy(data) {
  let position = null;
  const trades = [];

  for (let i = 20; i < data.prices.length; i++) {
    const price  = data.prices[i];
    const upper  = data.indicators.bollingerUpper[i];
    const lower  = data.indicators.bollingerLower[i];
    const middle = data.indicators.bollingerMiddle[i];

    // Price touches lower band → buy
    if (price <= lower && position === null) {
      position = { entry: price, date: data.dates[i] };
      trades.push({ action: 'buy', price, date: data.dates[i] });
    }
    // Price touches upper band → sell
    else if (price >= upper && position !== null) {
      const pnl = (price - position.entry) / position.entry * 100;
      trades.push({ action: 'sell', price, pnl, date: data.dates[i] });
      position = null;
    }
    // Stop loss: price falls below 2% of entry
    else if (position !== null && price < position.entry * 0.98) {
      const pnl = (price - position.entry) / position.entry * 100;
      trades.push({ action: 'sell', price, pnl, date: data.dates[i] });
      position = null;
    }
  }

  return trades;
}`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// INDICATOR DOCS
// ─────────────────────────────────────────────────────────────────────────────

const INDICATORS = [
  { name: 'data.prices',                       desc: 'Array of closing prices' },
  { name: 'data.dates',                        desc: 'Array of ISO date strings' },
  { name: 'data.indicators.rsi',               desc: 'RSI(14) values (0–100)' },
  { name: 'data.indicators.macd',              desc: 'MACD line values' },
  { name: 'data.indicators.macdSignal',        desc: 'MACD signal line values' },
  { name: 'data.indicators.sma10',             desc: 'Simple Moving Average (10)' },
  { name: 'data.indicators.sma30',             desc: 'Simple Moving Average (30)' },
  { name: 'data.indicators.bollingerUpper',    desc: 'Bollinger Upper Band' },
  { name: 'data.indicators.bollingerMiddle',   desc: 'Bollinger Middle Band (SMA20)' },
  { name: 'data.indicators.bollingerLower',    desc: 'Bollinger Lower Band' },
  { name: 'data.indicators.volume',            desc: 'Volume data' },
];

// ─────────────────────────────────────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  open:     boolean;
  code:     string;
  onClose:  () => void;
  onChange: (code: string) => void;
  onSave:   (code: string) => void;
}

export function CodeEditorModal({ open, code, onClose, onChange, onSave }: Props) {
  const [showTemplates, setShowTemplates] = useState(false);
  const [showDocs,      setShowDocs]      = useState(false);
  const [copied,        setCopied]        = useState(false);

  function applyTemplate(tpl: typeof TEMPLATES[0]) {
    onChange(tpl.code);
    setShowTemplates(false);
  }

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            className="relative w-full max-w-3xl max-h-[85vh] bg-card border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-10"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <div className="flex items-center gap-2.5">
                <Code2 className="h-5 w-5 text-primary" />
                <h2 className="text-base font-semibold text-foreground">Custom Strategy Code</h2>
              </div>
              <div className="flex items-center gap-2">
                {/* Copy */}
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground bg-secondary/30 hover:bg-secondary/60 transition-colors"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button onClick={onClose} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-white/5 bg-background/30">
              {/* Templates */}
              <div className="relative">
                <button
                  onClick={() => { setShowTemplates(s => !s); setShowDocs(false); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary/40 text-foreground hover:bg-secondary/70 transition-colors"
                >
                  <Code2 className="h-3.5 w-3.5" />
                  Templates
                  <ChevronDown className={cn('h-3 w-3 transition-transform', showTemplates && 'rotate-180')} />
                </button>
                <AnimatePresence>
                  {showTemplates && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      className="absolute top-full left-0 mt-1 z-20 w-64 bg-card border border-white/10 rounded-xl shadow-xl overflow-hidden"
                    >
                      {TEMPLATES.map(tpl => (
                        <button
                          key={tpl.name}
                          onClick={() => applyTemplate(tpl)}
                          className="w-full flex flex-col gap-0.5 px-4 py-3 text-left hover:bg-secondary/40 transition-colors border-b border-white/5 last:border-0"
                        >
                          <span className="text-sm font-medium text-foreground">{tpl.name}</span>
                          <span className="text-xs text-muted-foreground">{tpl.description}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Docs */}
              <button
                onClick={() => { setShowDocs(s => !s); setShowTemplates(false); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary/40 text-foreground hover:bg-secondary/70 transition-colors"
              >
                <BookOpen className="h-3.5 w-3.5" />
                Indicators
                <ChevronDown className={cn('h-3 w-3 transition-transform', showDocs && 'rotate-180')} />
              </button>

              <div className="flex-1" />
              <div className="flex gap-1">
                {['js', 'py'].map(lang => (
                  <span key={lang} className="px-2 py-1 rounded text-[10px] font-mono bg-primary/15 text-primary">{lang}</span>
                ))}
              </div>
            </div>

            {/* Docs panel */}
            <AnimatePresence>
              {showDocs && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden border-b border-white/5"
                >
                  <div className="p-4 bg-background/40 grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
                    {INDICATORS.map(ind => (
                      <div key={ind.name} className="flex flex-col gap-0.5">
                        <code className="text-[10px] font-mono text-primary/90">{ind.name}</code>
                        <span className="text-[10px] text-muted-foreground">{ind.desc}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Code Area */}
            <div className="flex-1 overflow-hidden flex flex-col p-4">
              {/* Line numbers + editor */}
              <div className="flex-1 relative rounded-xl overflow-hidden border border-white/10 bg-[#0d0d14]">
                <div className="absolute left-0 top-0 bottom-0 w-10 bg-black/20 border-r border-white/5 pointer-events-none select-none">
                  {code.split('\n').map((_, i) => (
                    <div key={i} className="text-right pr-2 text-[10px] font-mono text-muted-foreground/30 leading-[1.6rem]">
                      {i + 1}
                    </div>
                  ))}
                </div>
                <textarea
                  value={code}
                  onChange={e => onChange(e.target.value)}
                  spellCheck={false}
                  className="absolute inset-0 pl-12 pr-4 py-2 font-mono text-sm bg-transparent text-[#e2e8f0] resize-none focus:outline-none leading-[1.6rem] w-full h-full"
                  style={{ tabSize: 2 }}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-white/5 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {code.split('\n').length} lines · {code.length} chars
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground bg-secondary/30 hover:bg-secondary/60 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { onSave(code); onClose(); }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors active:scale-95"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Save & Use
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
