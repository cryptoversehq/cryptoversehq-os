import type { CloudMetrics } from './types';

interface MetricCardProps {
  label: string;
  value: string;
  detail?: string;
}

function MetricCard({ label, value, detail }: MetricCardProps) {
  return (
    <article className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </article>
  );
}

export function CloudDashboard({ metrics }: { metrics: CloudMetrics }) {
  const totalReads = metrics.cacheHits + metrics.cacheMisses;
  const hitRatio = totalReads === 0 ? 0 : (metrics.cacheHits / totalReads) * 100;
  const integrityLabel = metrics.integrityStatus === 'verified' ? 'Verified' : metrics.integrityStatus === 'failed' ? 'Failed' : 'Pending';

  return (
    <section aria-labelledby="cloud-dashboard-title" className="space-y-4">
      <div>
        <h2 id="cloud-dashboard-title" className="text-xl font-semibold text-foreground">Cloud data health</h2>
        <p className="mt-1 text-sm text-muted-foreground">Operational visibility for the cloud source of truth and its performance cache.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Cache hit ratio" value={`${hitRatio.toFixed(1)}%`} detail={`${metrics.cacheHits} hits / ${metrics.cacheMisses} misses`} />
        <MetricCard label="Cloud latency" value={metrics.cloudLatencyMs === null ? 'n/a' : `${metrics.cloudLatencyMs} ms`} />
        <MetricCard label="Sync duration" value={metrics.syncDurationMs === null ? 'n/a' : `${metrics.syncDurationMs} ms`} />
        <MetricCard label="Integrity" value={integrityLabel} />
        <MetricCard label="Queue length" value={String(metrics.queueLength)} detail={`${metrics.deadLetters} dead letters`} />
        <MetricCard label="Failed writes" value={String(metrics.failedWrites)} />
        <MetricCard label="Retries" value={String(metrics.retries)} />
        <MetricCard label="Conflicts" value={String(metrics.conflicts)} detail={`${metrics.rollbackCount} rollbacks`} />
      </div>
    </section>
  );
}
