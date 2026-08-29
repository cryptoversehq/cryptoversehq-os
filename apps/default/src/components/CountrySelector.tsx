import React, {
  useState, useRef, useEffect, useCallback, useMemo,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronDown, X, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { COUNTRIES_SORTED, Country, countryDisplay } from '@/lib/countries';

interface Props {
  value:       string;          // currently selected country name (or '')
  onChange:    (country: string) => void;
  placeholder?: string;
  disabled?:   boolean;
  className?:  string;
}

export function CountrySelector({
  value, onChange, placeholder = 'Select country…', disabled = false, className,
}: Props) {
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const listRef      = useRef<HTMLDivElement>(null);
  const [highlighted, setHighlighted] = useState(0);

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filtered: Country[] = useMemo(() => {
    if (!query.trim()) return COUNTRIES_SORTED;
    const q = query.toLowerCase();
    return COUNTRIES_SORTED.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      c.continent.toLowerCase().includes(q),
    );
  }, [query]);

  // Group by continent for display (only when no query)
  const grouped = useMemo(() => {
    if (query.trim()) return null;   // flat list when searching
    const map = new Map<string, Country[]>();
    map.set('⭐ Popular', COUNTRIES_SORTED.filter(c => {
      const POPULAR = new Set([
        'US','GB','DE','FR','JP','CN','IN','BR','CA','AU',
        'KR','SG','AE','SA','TR','MX','ID','PK','IR','NG',
        'EG','ZA','RU','IT','ES','NL','CH','SE','NO','PL',
        'TH','MY','PH','BD','VN','UA','AR','CO',
      ]);
      return POPULAR.has(c.code);
    }).sort((a, b) => a.name.localeCompare(b.name)));
    // remaining by continent
    for (const c of COUNTRIES_SORTED.filter(c => {
      const POPULAR = new Set([
        'US','GB','DE','FR','JP','CN','IN','BR','CA','AU',
        'KR','SG','AE','SA','TR','MX','ID','PK','IR','NG',
        'EG','ZA','RU','IT','ES','NL','CH','SE','NO','PL',
        'TH','MY','PH','BD','VN','UA','AR','CO',
      ]);
      return !POPULAR.has(c.code);
    })) {
      if (!map.has(c.continent)) map.set(c.continent, []);
      map.get(c.continent)!.push(c);
    }
    return map;
  }, [query]);

  // Flat list for keyboard nav
  const flatFiltered: Country[] = useMemo(() => {
    if (grouped) {
      return Array.from(grouped.values()).flat();
    }
    return filtered;
  }, [grouped, filtered]);

  // Selected country object
  const selected: Country | undefined = useMemo(
    () => COUNTRIES_SORTED.find(c => c.name === value || countryDisplay(c) === value),
    [value],
  );

  // ── Open / close ───────────────────────────────────────────────────────────
  const openDropdown = () => {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    setHighlighted(0);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const closeDropdown = () => {
    setOpen(false);
    setQuery('');
  };

  const select = (c: Country) => {
    onChange(c.name);
    closeDropdown();
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  // Outside click
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault(); openDropdown();
      }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); closeDropdown(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.min(highlighted + 1, flatFiltered.length - 1);
      setHighlighted(next);
      scrollToHighlighted(next);
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = Math.max(highlighted - 1, 0);
      setHighlighted(prev);
      scrollToHighlighted(prev);
    }
    if (e.key === 'Enter' && flatFiltered[highlighted]) {
      e.preventDefault();
      select(flatFiltered[highlighted]);
    }
  }, [open, highlighted, flatFiltered]);

  const scrollToHighlighted = (idx: number) => {
    if (!listRef.current) return;
    const item = listRef.current.querySelector(`[data-idx="${idx}"]`) as HTMLElement | null;
    item?.scrollIntoView({ block: 'nearest' });
  };

  // Reset highlight on query change
  useEffect(() => setHighlighted(0), [query]);

  // ── Render rows helper ─────────────────────────────────────────────────────
  const renderRow = (c: Country, flatIdx: number) => {
    const isHigh = flatIdx === highlighted;
    const isSel  = c.name === selected?.name;
    return (
      <button
        key={c.code}
        data-idx={flatIdx}
        onMouseEnter={() => setHighlighted(flatIdx)}
        onMouseDown={(e) => { e.preventDefault(); select(c); }}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors rounded-lg mx-1',
          isHigh && !isSel && 'bg-white/8',
          isSel             && 'bg-primary/15 text-primary',
        )}
        style={{ width: 'calc(100% - 8px)' }}
      >
        <span className="text-xl leading-none flex-shrink-0">{c.flag}</span>
        <span className={cn('text-sm flex-1 truncate', isSel ? 'font-semibold' : 'text-foreground')}>
          {c.name}
        </span>
        <span className="text-[10px] text-muted-foreground/50 font-mono flex-shrink-0">{c.code}</span>
        {isSel && (
          <svg className="h-3.5 w-3.5 text-primary flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.5 3.5L6 11 2.5 7.5" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        )}
      </button>
    );
  };

  // ── Grouped render ─────────────────────────────────────────────────────────
  const renderGrouped = () => {
    if (!grouped) return null;
    let flatIdx = 0;
    const sections: React.ReactNode[] = [];
    for (const [continent, countries] of grouped.entries()) {
      if (countries.length === 0) continue;
      sections.push(
        <div key={continent}>
          <div className="sticky top-0 px-4 py-1.5 bg-card/95 backdrop-blur-sm z-10">
            <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">
              {continent}
            </span>
          </div>
          <div className="pb-1">
            {countries.map(c => {
              const row = renderRow(c, flatIdx);
              flatIdx++;
              return row;
            })}
          </div>
        </div>
      );
    }
    return sections;
  };

  // ── Render flat search results ─────────────────────────────────────────────
  const renderFlat = () =>
    filtered.map((c, i) => renderRow(c, i));

  return (
    <div
      ref={containerRef}
      className={cn('relative', className)}
      onKeyDown={handleKeyDown}
    >
      {/* ── Trigger button ── */}
      <button
        type="button"
        onClick={openDropdown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'w-full flex items-center justify-between gap-2',
          'bg-secondary/40 border border-white/10 rounded-xl px-4 py-2.5',
          'text-sm transition-all text-left',
          'hover:border-primary/40 focus:outline-none focus:border-primary/50',
          open && 'border-primary/50 ring-1 ring-primary/20',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {selected ? (
            <>
              <span className="text-xl leading-none flex-shrink-0">{selected.flag}</span>
              <span className="text-foreground truncate">{selected.name}</span>
            </>
          ) : (
            <>
              <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-muted-foreground">{placeholder}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {selected && (
            <span
              role="button"
              onClick={clear}
              className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
              title="Clear"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown
            className={cn('h-4 w-4 text-muted-foreground transition-transform duration-200', open && 'rotate-180')}
          />
        </div>
      </button>

      {/* ── Dropdown panel ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0,  scale: 1    }}
            exit={{   opacity: 0, y: -6, scale: 0.98  }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute z-[200] mt-1.5 w-full bg-card border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
            style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)' }}
          >
            {/* Search input */}
            <div className="p-2.5 border-b border-white/6 bg-secondary/20">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search 195 countries…"
                  className="w-full bg-secondary/50 border border-white/8 rounded-xl pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 transition-colors"
                />
                {query && (
                  <button
                    onMouseDown={e => { e.preventDefault(); setQuery(''); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              {query && (
                <p className="text-[10px] text-muted-foreground/50 mt-1.5 px-1">
                  {filtered.length} result{filtered.length !== 1 ? 's' : ''} for "{query}"
                </p>
              )}
            </div>

            {/* Country list */}
            <div
              ref={listRef}
              className="max-h-64 overflow-y-auto overscroll-contain py-1.5 scrollbar-thin scrollbar-thumb-white/10"
            >
              {flatFiltered.length === 0 ? (
                <div className="py-8 text-center">
                  <span className="text-3xl mb-2 block">🌍</span>
                  <p className="text-sm text-muted-foreground">No countries found</p>
                  <p className="text-xs text-muted-foreground/50 mt-1">Try a different search term</p>
                </div>
              ) : query.trim() ? (
                renderFlat()
              ) : (
                renderGrouped()
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-white/5 bg-secondary/10">
              <p className="text-[10px] text-muted-foreground/40 text-center">
                {COUNTRIES_SORTED.length} countries · Type to search
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
