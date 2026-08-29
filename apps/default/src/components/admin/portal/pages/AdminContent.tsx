import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Search, Globe, AlertTriangle, FileEdit, Eye, Star, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminPortalStore } from '@/lib/adminPortalStore';

const STATUS_STYLE = {
  published: 'bg-green-500/10 border-green-500/20 text-green-400',
  draft:     'bg-white/5 border-white/10 text-white/40',
  flagged:   'bg-red-500/10 border-red-500/20 text-red-400',
};

export function AdminContent() {
  const { lessons, publishLesson, flagLesson } = useAdminPortalStore();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'published' | 'draft' | 'flagged'>('all');

  const filtered = lessons.filter(l => {
    const matchF = filter === 'all' || l.status === filter;
    const q = search.toLowerCase();
    return matchF && (!q || l.title.toLowerCase().includes(q) || l.category.includes(q));
  });

  const counts = {
    published: lessons.filter(l => l.status === 'published').length,
    draft:     lessons.filter(l => l.status === 'draft').length,
    flagged:   lessons.filter(l => l.status === 'flagged').length,
    total:     lessons.length,
  };

  const completionPct = Math.round((counts.published / Math.max(counts.total, 1)) * 100);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <h1 className="text-lg font-bold text-white flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-sky-400" /> Content Management
      </h1>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Lessons',  value: counts.total,     color: '#60a5fa' },
          { label: 'Published',      value: counts.published,  color: '#34d399' },
          { label: 'Draft',          value: counts.draft,      color: '#94a3b8' },
          { label: 'Flagged',        value: counts.flagged,    color: '#ef4444' },
        ].map(k => (
          <div key={k.label} className="bg-white/[0.03] border border-white/8 rounded-2xl p-4">
            <p className="text-2xl font-bold font-mono" style={{ color: k.color }}>{k.value}</p>
            <p className="text-xs text-white/40 mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4">
        <div className="flex justify-between text-xs text-white/50 mb-2">
          <span>Content completion</span>
          <span>{completionPct}% published</span>
        </div>
        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-sky-500 to-blue-500 rounded-full transition-all duration-700"
            style={{ width: `${completionPct}%` }} />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search lessons…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/3 border border-white/8 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-primary/40 transition-all" />
        </div>
        {(['all', 'published', 'draft', 'flagged'] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={cn('px-4 py-2.5 rounded-xl text-sm font-medium border transition-all capitalize',
              filter === s ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-white/3 border-white/8 text-white/40 hover:text-white/70')}>
            {s}
          </button>
        ))}
      </div>

      {/* Lesson list */}
      <div className="space-y-2">
        {filtered.map(lesson => (
          <motion.div key={lesson.id} layout
            className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="h-9 w-9 rounded-xl bg-sky-500/10 border border-sky-500/15 flex items-center justify-center flex-shrink-0">
                <BookOpen className="h-4 w-4 text-sky-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{lesson.title}</p>
                <p className="text-xs text-white/30 capitalize">Level {lesson.level} · {lesson.category}</p>
              </div>
            </div>

            {/* Stats — not yet tracked; shown as '—' rather than fabricated numbers */}
            <div className="hidden md:flex items-center gap-5 flex-shrink-0 text-[11px] text-white/40">
              <span className="flex items-center gap-1" title="Not yet tracked"><Eye className="h-3.5 w-3.5" />{lesson.views?.toLocaleString() ?? '—'}</span>
              <span className="flex items-center gap-1" title="Not yet tracked"><Users className="h-3.5 w-3.5" />{lesson.completions?.toLocaleString() ?? '—'}</span>
              <span className="flex items-center gap-1" title="Not yet tracked"><Star className="h-3.5 w-3.5 text-amber-400" />{lesson.rating?.toFixed(1) ?? '—'}</span>
            </div>

            {/* Updated */}
            <p className="hidden lg:block text-[11px] text-white/25 flex-shrink-0">
              {lesson.updatedAt ? new Date(lesson.updatedAt).toLocaleDateString() : '—'}
            </p>

            {/* Status + actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={cn('text-[11px] px-2.5 py-1 rounded-full border capitalize', STATUS_STYLE[lesson.status])}>
                {lesson.status}
              </span>
              {lesson.status !== 'published' && (
                <button onClick={() => publishLesson(lesson.id)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-xs hover:bg-green-500/20 transition-all">
                  <Globe className="h-3 w-3" /> Publish
                </button>
              )}
              {lesson.status !== 'flagged' && (
                <button onClick={() => flagLesson(lesson.id)}
                  className="p-1.5 rounded-lg bg-red-500/8 border border-red-500/15 text-red-400 hover:bg-red-500/15 transition-all">
                  <AlertTriangle className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
