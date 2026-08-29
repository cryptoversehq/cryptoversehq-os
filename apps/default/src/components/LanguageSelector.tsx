import React, { useState, useRef, useEffect } from 'react';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LANGUAGES, LangMeta } from '@/lib/i18n';
import { useI18nStore } from '@/lib/i18nStore';

interface LanguageSelectorProps {
  compact?: boolean; // show only flag+code (for header)
}

export function LanguageSelector({ compact = false }: LanguageSelectorProps) {
  const { lang, setLang } = useI18nStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const current = LANGUAGES.find(l => l.code === lang) ?? LANGUAGES[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = LANGUAGES.filter(
    l =>
      l.name.toLowerCase().includes(query.toLowerCase()) ||
      l.english.toLowerCase().includes(query.toLowerCase()) ||
      l.code.toLowerCase().includes(query.toLowerCase()),
  );

  const handleSelect = (l: LangMeta) => {
    setLang(l.code);
    setOpen(false);
    setQuery('');
  };

  return (
    // data-notranslate: prevents the translation engine from touching any text
    // inside this component — language names must stay in their native script.
    <div ref={ref} className="relative" data-notranslate>
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex items-center gap-2 rounded-xl border border-white/10 bg-secondary/40 hover:bg-secondary/70 transition-colors text-sm font-medium',
          compact ? 'px-2.5 py-2' : 'px-3 py-2.5',
        )}
        title="Change language"
      >
        <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span>{current.flag}</span>
        {!compact && (
          <>
            <span className="text-foreground">{current.name}</span>
            <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
          </>
        )}
        {compact && (
          <span className="text-xs text-muted-foreground uppercase">{current.code}</span>
        )}
      </button>

      {open && (
        <div
          className={cn(
            // Mobile (<sm): a 256px dropdown anchored to the trigger button can run
            // off the left edge of a ~375px phone viewport when the button itself
            // sits away from the screen's right edge (e.g. the compact header
            // selector, which has theme/bell/avatar buttons to its right). Instead
            // of positioning relative to the button, pin it to the viewport with
            // `fixed` + symmetric insets below the header on small screens, then
            // revert to the original button-anchored `absolute` panel at `sm:` and up.
            'fixed inset-x-3 top-20 z-[100] w-auto bg-card border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150',
            'sm:absolute sm:inset-x-auto sm:top-auto sm:mt-2 sm:w-64',
            compact ? 'sm:right-0' : 'sm:left-0',
          )}
        >
          {/* Search */}
          <div className="p-2 border-b border-white/5">
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search language…"
              className="w-full bg-secondary/40 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
            />
          </div>

          {/* List */}
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-center text-muted-foreground text-xs py-6">No languages found</p>
            )}
            {filtered.map(l => (
              <button
                key={l.code}
                onClick={() => handleSelect(l)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-secondary/40 transition-colors text-left',
                  l.code === lang && 'bg-primary/10',
                )}
              >
                <span className="text-base flex-shrink-0">{l.flag}</span>
                <div className="flex-1 min-w-0">
                  <p className={cn('font-medium truncate', l.code === lang && 'text-primary')}>{l.name}</p>
                  <p className="text-xs text-muted-foreground">{l.english}</p>
                </div>
                {l.rtl && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 font-mono flex-shrink-0">RTL</span>
                )}
                {l.code === lang && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
