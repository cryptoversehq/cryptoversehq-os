import React, { useState } from 'react';
import { Activity, Search, Clock } from 'lucide-react';
import { useAdminManagementStore } from '@/lib/adminManagementStore';
import { useAdminStore } from '@/lib/adminStore';

export function AdminActivityLog() {
  const { activity: mgmtActivity } = useAdminManagementStore();
  const { auditLog }               = useAdminStore();
  const [search, setSearch]        = useState('');
  const [page, setPage]            = useState(0);
  const PAGE_SIZE = 15;

  // Merge both audit sources
  const combined = [
    ...mgmtActivity.map(e => ({
      id: e.id, adminName: e.adminName, action: e.action,
      targetLabel: e.targetLabel, timestamp: e.timestamp,
    })),
    ...auditLog.map(e => ({
      id: e.id, adminName: e.adminName, action: e.action,
      targetLabel: e.targetLabel, timestamp: e.timestamp,
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const filtered = combined.filter(e => {
    const q = search.toLowerCase();
    return !q || [e.adminName, e.action, e.targetLabel].some(s => s.toLowerCase().includes(q));
  });

  const paged   = filtered.slice(0, (page + 1) * PAGE_SIZE);
  const hasMore = filtered.length > paged.length;

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          placeholder="Search audit log…"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-secondary/30 border border-white/8 text-sm focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all"
        />
      </div>

      {/* Count */}
      <p className="text-xs text-muted-foreground">
        {filtered.length} event{filtered.length !== 1 ? 's' : ''} found
      </p>

      {/* Log entries */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Activity className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No audit events found.</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {paged.map((entry, i) => {
              const date = new Date(entry.timestamp);
              const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const dateStr = date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
              return (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 p-3.5 rounded-xl bg-card border border-white/5 hover:border-white/10 transition-all"
                >
                  {/* Timeline dot */}
                  <div className="flex flex-col items-center gap-1 flex-shrink-0 mt-0.5">
                    <div className="w-2 h-2 rounded-full bg-primary/60" />
                    {i < paged.length - 1 && (
                      <div className="w-px h-full min-h-[12px] bg-white/5" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold">{entry.action}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          by <span className="text-foreground/70 font-medium">{entry.adminName}</span>
                          {entry.targetLabel && <> → <span className="text-foreground/60">{entry.targetLabel}</span></>}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground flex-shrink-0">
                        <Clock className="h-3 w-3" />
                        <span>{timeStr}</span>
                        <span className="text-muted-foreground/50">·</span>
                        <span>{dateStr}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {hasMore && (
            <button
              onClick={() => setPage(p => p + 1)}
              className="w-full py-3 rounded-xl bg-secondary/30 border border-white/8 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all"
            >
              Load more ({filtered.length - paged.length} remaining)
            </button>
          )}
        </>
      )}
    </div>
  );
}
