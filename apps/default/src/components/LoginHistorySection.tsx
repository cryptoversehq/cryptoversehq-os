import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  History, Monitor, Tablet, Smartphone,
  Chrome, Apple, Mail, Fingerprint,
  ChevronDown, ChevronRight,
  BarChart3, CalendarDays, TrendingUp,
  Filter, Search, Trash2, AlertCircle,
  Globe, Clock, Shield, Zap,
  UserPlus, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { type LoginEvent, type LoginMethod } from '@/lib/loginHistoryStore';

// ─── Config ───────────────────────────────────────────────────────────────────

interface MethodConfig {
  label:    string;
  color:    string;
  bg:       string;
  border:   string;
  icon:     React.ElementType;
  gradient: string;
}

const METHOD_CONFIG: Record<LoginMethod, MethodConfig> = {
  email: {
    label:    'Email',
    color:    'text-blue-400',
    bg:       'bg-blue-500/10',
    border:   'border-blue-500/20',
    gradient: 'from-blue-500/20 to-blue-600/10',
    icon:     Mail,
  },
  google: {
    label:    'Google',
    color:    'text-red-400',
    bg:       'bg-red-500/10',
    border:   'border-red-500/20',
    gradient: 'from-red-500/20 to-orange-500/10',
    icon:     Chrome,
  },
  apple: {
    label:    'Apple',
    color:    'text-slate-300',
    bg:       'bg-slate-500/10',
    border:   'border-slate-500/20',
    gradient: 'from-slate-400/20 to-slate-500/10',
    icon:     Apple,
  },
  biometric: {
    label:    'Biometric',
    color:    'text-yellow-400',
    bg:       'bg-yellow-500/10',
    border:   'border-yellow-500/20',
    gradient: 'from-yellow-500/20 to-orange-500/10',
    icon:     Fingerprint,
  },
  register: {
    label:    'Registered',
    color:    'text-green-400',
    bg:       'bg-green-500/10',
    border:   'border-green-500/20',
    gradient: 'from-green-500/20 to-emerald-500/10',
    icon:     UserPlus,
  },
};

const DEVICE_ICONS: Record<string, React.ElementType> = {
  desktop: Monitor,
  tablet:  Tablet,
  mobile:  Smartphone,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): { date: string; time: string; relative: string } {
  const d    = new Date(iso);
  const now  = Date.now();
  const diff = now - d.getTime();

  const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  let relative: string;
  if (diff < 60_000)           relative = 'Just now';
  else if (diff < 3_600_000)   relative = `${Math.floor(diff / 60_000)}m ago`;
  else if (diff < 86_400_000)  relative = `${Math.floor(diff / 3_600_000)}h ago`;
  else if (diff < 604_800_000) relative = `${Math.floor(diff / 86_400_000)}d ago`;
  else                          relative = date;

  return { date, time, relative };
}

function getBrowserIcon(browser: string): string {
  const map: Record<string, string> = {
    Chrome: '🌐', Firefox: '🦊', Safari: '🧭', Edge: '🌀',
    Opera: '🔴', Chromium: '🌐', Samsung: '📱', Yandex: '🟡',
  };
  return map[browser] ?? '🌐';
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon, label, value, color, delay,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="bg-secondary/30 border border-white/6 rounded-xl p-3.5 text-center"
    >
      <Icon className={cn('h-4 w-4 mx-auto mb-1.5', color)} />
      <p className={cn('text-lg font-bold font-mono', color)}>{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{label}</p>
    </motion.div>
  );
}

// ─── Event Row ────────────────────────────────────────────────────────────────

function EventRow({
  event,
  isExpanded,
  onToggle,
  index,
}: {
  event: LoginEvent;
  isExpanded: boolean;
  onToggle: () => void;
  index: number;
}) {
  const cfg    = METHOD_CONFIG[event.method];
  const Icon   = cfg.icon;
  const ts     = formatTimestamp(event.timestamp);
  const DevIco = DEVICE_ICONS[event.deviceType] ?? Monitor;

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
      className="group"
    >
      {/* Main row */}
      <button
        onClick={onToggle}
        className={cn(
          'w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all duration-200 text-left',
          isExpanded
            ? `bg-gradient-to-r ${cfg.gradient} ${cfg.border}`
            : 'border-white/5 bg-secondary/20 hover:bg-secondary/40 hover:border-white/10',
        )}
      >
        {/* Method icon */}
        <div className={cn(
          'h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 border',
          cfg.bg, cfg.border,
        )}>
          <Icon className={cn('h-4 w-4', cfg.color)} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('text-xs font-bold', cfg.color)}>
              {cfg.label}
            </span>
            {event.isNewUser && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/20">
                NEW
              </span>
            )}
            <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
              <DevIco className="h-2.5 w-2.5 inline" />
              {event.os}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
            {getBrowserIcon(event.browser)} {event.browser} {event.browserVersion && `${event.browserVersion.split('.')[0]}`}
            {' · '}
            <Clock className="h-2.5 w-2.5 inline" />
            {' '}{ts.relative}
          </p>
        </div>

        {/* Timestamp */}
        <div className="text-right flex-shrink-0 hidden sm:block">
          <p className="text-[10px] text-muted-foreground">{ts.date}</p>
          <p className="text-[10px] text-muted-foreground/60">{ts.time}</p>
        </div>

        {/* Chevron */}
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex-shrink-0"
        >
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/50" />
        </motion.div>
      </button>

      {/* Expanded device details */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className={cn(
              'mx-1 mb-1 px-4 py-3 rounded-b-xl border-x border-b grid grid-cols-2 sm:grid-cols-3 gap-2.5',
              cfg.border, `bg-gradient-to-br ${cfg.gradient}`,
            )}>
              {[
                { icon: DevIco,      label: 'Device',      value: event.deviceType.charAt(0).toUpperCase() + event.deviceType.slice(1) },
                { icon: Globe,       label: 'OS',          value: event.os },
                { icon: Chrome,      label: 'Browser',     value: `${event.browser} ${event.browserVersion?.split('.')[0] ?? ''}`.trim() },
                { icon: Monitor,     label: 'Resolution',  value: event.screenRes },
                { icon: Globe,       label: 'Timezone',    value: event.timezone },
                { icon: Shield,      label: 'Language',    value: event.language.toUpperCase() },
              ].map(({ icon: DIcon, label, value }) => (
                <div key={label} className="flex items-start gap-2">
                  <DIcon className="h-3 w-3 text-muted-foreground/50 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[9px] text-muted-foreground/50 uppercase tracking-wide">{label}</p>
                    <p className="text-[11px] font-medium text-foreground/80 truncate">{value || '—'}</p>
                  </div>
                </div>
              ))}

              {/* Full timestamp */}
              <div className="col-span-2 sm:col-span-3 flex items-center gap-2 pt-1 border-t border-white/5 mt-1">
                <Clock className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" />
                <p className="text-[10px] text-muted-foreground/50 font-mono">
                  {new Date(event.timestamp).toLocaleString(undefined, {
                    weekday: 'short', day: 'numeric', month: 'short',
                    year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
                  })}
                </p>
                <span className="ml-auto text-[9px] font-mono text-muted-foreground/30 truncate max-w-[120px]">
                  id:{event.id.split('_')[0]}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Method Filter Pill ───────────────────────────────────────────────────────

function FilterPill({
  method, active, count, onClick,
}: {
  method: LoginMethod | 'all';
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  const cfg  = method !== 'all' ? METHOD_CONFIG[method] : null;
  const Icon = cfg?.icon;

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 whitespace-nowrap',
        active
          ? cfg
            ? `${cfg.bg} ${cfg.border} ${cfg.color}`
            : 'bg-primary/15 border-primary/30 text-primary'
          : 'border-white/8 bg-secondary/20 text-muted-foreground hover:text-foreground hover:border-white/15',
      )}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {method === 'all' ? 'All' : cfg!.label}
      <span className={cn(
        'text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center',
        active
          ? cfg ? `${cfg.bg} ${cfg.color}` : 'bg-primary/20 text-primary'
          : 'bg-white/8 text-muted-foreground/60',
      )}>
        {count}
      </span>
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface LoginHistorySectionProps {
  events:          LoginEvent[];
  filteredEvents:  LoginEvent[];
  pagedEvents:     LoginEvent[];
  hasMore:         boolean;
  stats:           ReturnType<typeof import('@/lib/loginHistoryStore').getLoginStats> | null;
  filter:          LoginMethod | 'all';
  search:          string;
  expandedEvent:   string | null;
  showClearConfirm: boolean;
  onFilterChange:  (f: LoginMethod | 'all') => void;
  onSearchChange:  (s: string) => void;
  onToggleExpand:  (id: string) => void;
  onLoadMore:      () => void;
  onClearRequest:  () => void;
  onClearConfirm:  () => void;
  onClearCancel:   () => void;
}

export function LoginHistorySection({
  events, filteredEvents, pagedEvents, hasMore, stats,
  filter, search, expandedEvent, showClearConfirm,
  onFilterChange, onSearchChange, onToggleExpand,
  onLoadMore, onClearRequest, onClearConfirm, onClearCancel,
}: LoginHistorySectionProps) {

  const allMethods: LoginMethod[] = ['email', 'google', 'apple', 'biometric', 'register'];

  return (
    <div className="bg-card border border-white/5 rounded-2xl shadow-lg overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center">
            <History className="h-4 w-4 text-violet-400" />
          </div>
          <div>
            <h3 className="font-semibold text-sm leading-tight">Login History</h3>
            <p className="text-xs text-muted-foreground leading-tight">
              {events.length} session{events.length !== 1 ? 's' : ''} recorded on this device
            </p>
          </div>
        </div>

        {events.length > 0 && (
          <button
            onClick={onClearRequest}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      <div className="p-5 space-y-4">

        {/* ── Clear confirmation ── */}
        <AnimatePresence>
          {showClearConfirm && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0,  scale: 1    }}
              exit={{ opacity: 0,    y: -6, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="p-4 rounded-xl border-2 border-red-500/30 bg-red-500/5"
            >
              <div className="flex items-start gap-3 mb-3">
                <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-red-400">Clear all login history?</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    This will permanently delete {events.length} recorded session{events.length !== 1 ? 's' : ''} from this device.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClearConfirm}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-bold transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Yes, clear all
                </button>
                <button
                  onClick={onClearCancel}
                  className="px-4 py-2 rounded-xl bg-secondary/60 text-muted-foreground text-xs font-semibold hover:text-foreground hover:bg-secondary transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Stats cards ── */}
        {stats && events.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <StatCard icon={TrendingUp}   label="Total Logins"  value={stats.total}       color="text-violet-400" delay={0.0} />
            <StatCard icon={CalendarDays} label="Active Days"   value={stats.uniqueDays}  color="text-blue-400"   delay={0.06} />
            <StatCard icon={Fingerprint}  label="Biometric"     value={stats.byMethod.biometric} color="text-yellow-400" delay={0.12} />
            <StatCard icon={Shield}       label="Most Used"
              value={
                Object.entries(stats.byMethod)
                  .filter(([, n]) => n > 0)
                  .sort((a, b) => b[1] - a[1])[0]
                  ?.[0]
                  ?.replace(/^./, s => s.toUpperCase()) ?? '—'
              }
              color="text-green-400"
              delay={0.18}
            />
          </div>
        )}

        {/* ── Method breakdown bar ── */}
        {stats && events.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="p-3.5 bg-secondary/20 border border-white/5 rounded-xl"
          >
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <BarChart3 className="h-3 w-3" /> Method breakdown
            </p>
            {/* Stacked bar */}
            <div className="flex h-2 rounded-full overflow-hidden mb-2.5 gap-px">
              {allMethods
                .filter(m => stats.byMethod[m] > 0)
                .map(m => {
                  const cfg = METHOD_CONFIG[m];
                  const pct = (stats.byMethod[m] / stats.total) * 100;
                  return (
                    <motion.div
                      key={m}
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                      style={{ width: `${pct}%` }}
                      className={cn('h-full origin-left rounded-sm', cfg.bg.replace('/10', '/60'))}
                      title={`${cfg.label}: ${stats.byMethod[m]}`}
                    />
                  );
                })}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {allMethods
                .filter(m => stats.byMethod[m] > 0)
                .map(m => {
                  const cfg = METHOD_CONFIG[m];
                  const Icon = cfg.icon;
                  return (
                    <span key={m} className={cn('flex items-center gap-1 text-[10px]', cfg.color)}>
                      <Icon className="h-2.5 w-2.5" />
                      {cfg.label} · {stats.byMethod[m]}
                    </span>
                  );
                })}
            </div>
          </motion.div>
        )}

        {/* ── Filters & search ── */}
        {events.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-2.5"
          >
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
              <input
                type="text"
                placeholder="Search by browser, OS, timezone…"
                value={search}
                onChange={e => onSearchChange(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-secondary/30 border border-white/8 text-sm focus:outline-none focus:border-violet-400/30 focus:ring-1 focus:ring-violet-400/15 transition-all placeholder:text-muted-foreground/40 text-sm"
              />
            </div>

            {/* Filter pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <Filter className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />
              <FilterPill
                method="all"
                active={filter === 'all'}
                count={events.length}
                onClick={() => onFilterChange('all')}
              />
              {allMethods
                .filter(m => stats && stats.byMethod[m] > 0)
                .map(m => (
                  <FilterPill
                    key={m}
                    method={m}
                    active={filter === m}
                    count={stats!.byMethod[m]}
                    onClick={() => onFilterChange(m)}
                  />
                ))}
            </div>
          </motion.div>
        )}

        {/* ── Timeline ── */}
        {pagedEvents.length > 0 ? (
          <div className="space-y-1.5">
            {pagedEvents.map((event, i) => (
              <EventRow
                key={event.id}
                event={event}
                isExpanded={expandedEvent === event.id}
                onToggle={() => onToggleExpand(event.id)}
                index={i}
              />
            ))}

            {/* Load more */}
            {hasMore && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={onLoadMore}
                className="w-full py-2.5 mt-1 rounded-xl border border-white/8 bg-secondary/20 hover:bg-secondary/40 text-xs font-medium text-muted-foreground hover:text-foreground transition-all flex items-center justify-center gap-2"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Load more ({filteredEvents.length - pagedEvents.length} remaining)
              </motion.button>
            )}
          </div>
        ) : events.length === 0 ? (
          /* Empty state */
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="py-10 text-center"
          >
            <div className="h-14 w-14 rounded-2xl bg-secondary/40 border border-white/8 flex items-center justify-center mx-auto mb-3">
              <History className="h-7 w-7 text-muted-foreground/30" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">No login history yet</p>
            <p className="text-xs text-muted-foreground/50 mt-1">
              Your next sign-in will appear here automatically.
            </p>
          </motion.div>
        ) : (
          /* No search results */
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="py-8 text-center"
          >
            <Search className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No sessions match your filter</p>
          </motion.div>
        )}

        {/* ── Footer note ── */}
        {events.length > 0 && (
          <p className="text-[10px] text-muted-foreground/35 text-center pt-1 flex items-center justify-center gap-1.5">
            <Shield className="h-3 w-3" />
            History is stored locally on this device only — never sent to any server.
          </p>
        )}

      </div>
    </div>
  );
}
