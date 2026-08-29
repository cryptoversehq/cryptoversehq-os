import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { BookOpen, ChevronDown, ChevronRight, Play, X, Target, Lightbulb, Video } from 'lucide-react';
import { useTradingLevelStore } from '@/lib/tradingLevelStore';

const STEPS = [
  { step: 1, title: 'Select a currency',  desc: 'Click the pair name at top to search 10,000+ coins.', hl: 'header-pair' },
  { step: 2, title: 'Read the chart',      desc: 'Green candles = price up. Red = down. Adjust timeframe to zoom.', hl: 'chart-area' },
  { step: 3, title: 'Enter an amount',     desc: 'Type your USDT amount, or use the % buttons for quick fills.', hl: 'trade-panel' },
  { step: 4, title: 'Set Stop Loss (Pro)', desc: 'Protect yourself by setting a Stop Loss to auto-close on big drops.', hl: 'trade-panel' },
  { step: 5, title: 'Click Buy or Sell',   desc: 'Green = expect price up, Red = expect down. Confirm to open!', hl: 'trade-panel' },
];

const GLOSSARY = [
  { term: 'Leverage',     icon: '⚡', def: 'Borrow to control a bigger position. 10x = $100 controls $1,000. Profits and losses both multiply.' },
  { term: 'Stop Loss',    icon: '🛑', def: 'Auto-closes your trade if price moves against you beyond a set level.' },
  { term: 'Take Profit',  icon: '🎯', def: 'Auto-closes trade when price hits your profit target.' },
  { term: 'Limit Order',  icon: '📋', def: 'Order at a specific price — waits until price reaches your level.' },
  { term: 'Market Order', icon: '⚡', def: 'Executes immediately at the current best available price.' },
  { term: 'Order Book',   icon: '📊', def: 'Live list of all buy/sell orders showing supply and demand at each price.' },
  { term: 'Candlestick',  icon: '🕯️', def: 'Shows Open/High/Low/Close. Green = closed higher, Red = closed lower.' },
  { term: 'Liquidation',  icon: '💥', def: 'With leverage, if losses exceed margin the exchange force-closes position.' },
  { term: 'PnL',          icon: '💰', def: 'Profit and Loss — how much you gained or lost on a trade.' },
  { term: 'Spread',       icon: '↔️', def: 'Difference between buy and sell price — this is how exchanges make money.' },
];

const VIDEOS = [
  { title: 'How to make your first trade',      duration: '4:32', vid: 'GmOzih6I1zs', thumb: 'https://img.youtube.com/vi/GmOzih6I1zs/mqdefault.jpg' },
  { title: 'Understanding candlestick charts',   duration: '6:18', vid: 'Hnh3JGorItc', thumb: 'https://img.youtube.com/vi/Hnh3JGorItc/mqdefault.jpg' },
  { title: 'Stop Loss & Take Profit explained',  duration: '3:55', vid: 'z5rNMIBPlfc', thumb: 'https://img.youtube.com/vi/z5rNMIBPlfc/mqdefault.jpg' },
];

type SchoolTab = 'guide' | 'glossary' | 'videos';

interface Props { onHighlight?: (s: string | null) => void; }

export function TradingSchool({ onHighlight }: Props) {
  const { schoolOpen, setSchoolOpen, schoolDismissed, setSchoolDismissed } = useTradingLevelStore();
  const [tab,        setTab]        = useState<SchoolTab>('guide');
  const [glossTerm,  setGlossTerm]  = useState<string | null>(null);
  const [playVideo,  setPlayVideo]  = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem('cv_school_v2');
    if (!seen) { setShowWelcome(true); localStorage.setItem('cv_school_v2', '1'); }
  }, []);

  if (schoolDismissed) return null;

  const selectedGloss = GLOSSARY.find(g => g.term === glossTerm);

  return (
    <div className="flex flex-col border-t relative flex-shrink-0"
      style={{ width: 272, borderColor: 'var(--border-color)', background: 'var(--bg-card)' }}>

      {/* Welcome toast */}
      <AnimatePresence>
        {showWelcome && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute bottom-full left-0 right-0 mb-2 mx-2 bg-amber-400/10 border border-amber-400/30 rounded-xl p-3 text-[11px] z-20">
            <div className="flex items-start gap-2">
              <BookOpen className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-400">Welcome to Trading School!</p>
                <p className="text-amber-600 dark:text-amber-200/70 mt-0.5">Step-by-step guide. Collapse anytime.</p>
              </div>
              <button onClick={() => setShowWelcome(false)} className="text-amber-400/50 hover:text-amber-400 flex-shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 cursor-pointer border-b select-none"
        style={{ borderColor: 'var(--border-color)' }}
        onClick={() => setSchoolOpen(!schoolOpen)}>
        <BookOpen className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
        <span className="text-[11px] font-semibold text-amber-400 flex-1">📘 Trading School</span>
        <div className="flex items-center gap-1">
          {schoolOpen
            ? <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
            : <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />}
          <button onClick={e => { e.stopPropagation(); setSchoolDismissed(true); }}
            className="ml-1 transition-colors" style={{ color: 'var(--text-muted)' }} title="Close permanently">
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {!schoolOpen && (
        <div className="flex items-center justify-center py-1.5">
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Click to expand</span>
        </div>
      )}

      <AnimatePresence>
        {schoolOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
            className="overflow-hidden flex flex-col">
            {/* Tabs */}
            <div className="flex border-b" style={{ borderColor: 'var(--border-color)' }}>
              {([
                { id: 'guide',    label: 'Guide',  Icon: Target },
                { id: 'glossary', label: 'Terms',  Icon: Lightbulb },
                { id: 'videos',   label: 'Videos', Icon: Video },
              ] as { id: SchoolTab; label: string; Icon: React.ElementType }[]).map(({ id, label, Icon }) => {
                const isActive = tab === id;
                return (
                  <button key={id} onClick={() => setTab(id)}
                    className={cn('flex-1 flex items-center justify-center gap-1 py-2 text-[10px] font-semibold transition-colors border-b-2',
                      isActive ? 'border-amber-400 text-amber-400' : 'border-transparent')}
                    style={!isActive ? { color: 'var(--text-muted)' } : undefined}>
                    <Icon className="w-3 h-3" />{label}
                  </button>
                );
              })}
            </div>

            {/* Content */}
            <div className="overflow-y-auto scrollbar-thin scrollbar-thumb-white/10" style={{ maxHeight: 280 }}>
              {/* Guide */}
              {tab === 'guide' && (
                <div className="p-2 space-y-1.5">
                  {STEPS.map(s => (
                    <button key={s.step}
                      onMouseEnter={() => onHighlight?.(s.hl)}
                      onMouseLeave={() => onHighlight?.(null)}
                      className="w-full text-left p-2.5 rounded-lg transition-colors group border hover:border-amber-400/20"
                      style={{ borderColor: 'var(--border-color)', background: 'transparent' }}
                      onMouseOver={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                      onMouseOut={e => (e.currentTarget.style.background = 'transparent')}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="w-5 h-5 rounded-full bg-amber-400/20 text-amber-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                          {s.step}
                        </span>
                        <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>{s.title}</span>
                      </div>
                      <p className="text-[10px] leading-relaxed pl-7" style={{ color: 'var(--text-muted)' }}>{s.desc}</p>
                    </button>
                  ))}
                </div>
              )}

              {/* Glossary */}
              {tab === 'glossary' && (
                <div>
                  {GLOSSARY.map(g => {
                    const isOpen = g.term === glossTerm;
                    return (
                      <button key={g.term}
                        onClick={() => setGlossTerm(isOpen ? null : g.term)}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 transition-colors text-left border-b"
                        style={{ borderColor: 'var(--border-color)' }}>
                        <span className="text-base flex-shrink-0">{g.icon}</span>
                        <span className={cn('flex-1 text-[12px] font-semibold', isOpen ? 'text-amber-400' : '')}
                          style={!isOpen ? { color: 'var(--text-secondary)' } : undefined}>
                          {g.term}
                        </span>
                        <ChevronDown className={cn('w-3 h-3 transition-transform flex-shrink-0', isOpen && 'rotate-180')}
                          style={{ color: 'var(--text-muted)' }} />
                      </button>
                    );
                  })}
                  {selectedGloss && (
                    <motion.div key={selectedGloss.term} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                      className="mx-2 my-2 p-3 bg-amber-400/[0.07] border border-amber-400/20 rounded-xl">
                      <p className="text-[11px] font-semibold text-amber-400 mb-1">{selectedGloss.icon} {selectedGloss.term}</p>
                      <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{selectedGloss.def}</p>
                    </motion.div>
                  )}
                </div>
              )}

              {/* Videos */}
              {tab === 'videos' && (
                <div className="p-2 space-y-2">
                  {VIDEOS.map(v => {
                    const isPlaying = playVideo === v.vid;
                    return (
                      <div key={v.vid} className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border-color)' }}>
                        {isPlaying ? (
                          <div className="relative" style={{ paddingTop: '56.25%' }}>
                            <iframe className="absolute inset-0 w-full h-full"
                              src={'https://www.youtube.com/embed/' + v.vid + '?autoplay=1&rel=0'}
                              title={v.title}
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
                              allowFullScreen />
                            <button onClick={() => setPlayVideo(null)}
                              className="absolute top-1.5 right-1.5 z-10 w-6 h-6 bg-black/70 rounded-full flex items-center justify-center text-white hover:bg-black">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button className="w-full relative group" onClick={() => setPlayVideo(v.vid)}>
                            <img src={v.thumb} alt={v.title} className="w-full object-cover" style={{ height: 100 }} />
                            <div className="absolute inset-0 bg-black/45 group-hover:bg-black/25 transition-colors flex items-center justify-center">
                              <div className="w-9 h-9 rounded-full bg-amber-400/90 flex items-center justify-center">
                                <Play className="w-4 h-4 text-black ml-0.5" fill="currentColor" />
                              </div>
                            </div>
                            <div className="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
                              {v.duration}
                            </div>
                          </button>
                        )}
                        <div className="px-3 py-2" style={{ background: 'var(--bg-secondary)' }}>
                          <p className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>{v.title}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
