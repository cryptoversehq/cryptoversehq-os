import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { CloudDashboard } from '@/lib/cloudData';
import { cloudDataLayer } from '@/lib/cloudData';
import type { CloudMetrics } from '@/lib/cloudData';

export function CloudDashboardPage() {
  const [metrics, setMetrics] = useState<CloudMetrics>(() => cloudDataLayer.getMetrics());
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = useCallback(() => {
    setMetrics(cloudDataLayer.getMetrics());
    setLastUpdated(new Date());
  }, []);

  useEffect(() => {
    refresh();
    const unsubscribeCache = cloudDataLayer.on('CloudCacheUpdated', refresh);
    const unsubscribeSync = cloudDataLayer.on('CloudSyncFinished', refresh);
    const timer = window.setInterval(refresh, 5000);
    return () => {
      unsubscribeCache();
      unsubscribeSync();
      window.clearInterval(timer);
    };
  }, [refresh]);

  const integrityGood = metrics.integrityStatus === 'verified';

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Enterprise CloudDataLayer</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Cloud operations</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">The cloud provider is authoritative. Local storage is used only as a performance cache.</p>
          </div>
          <button type="button" onClick={refresh} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh metrics
          </button>
        </header>
        <div className="flex items-center gap-2 rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
          <span>{integrityGood ? 'Integrity verified during the latest hydration.' : 'Integrity will report verified after the next cloud hydration.'}</span>
          {lastUpdated ? <span className="ml-auto text-xs tabular-nums">Updated {lastUpdated.toLocaleTimeString()}</span> : null}
        </div>
        <CloudDashboard metrics={metrics} />
      </div>
    </main>
  );
}

