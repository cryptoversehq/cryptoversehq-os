import { cn } from '@/lib/utils';
import { InfoTooltip } from './InfoTooltip';

type DataStatus = 'simulated' | 'liveExchange' | 'livePortfolio';

const STATUS_COPY: Record<DataStatus, { label: string; dot: string; classes: string }> = {
  simulated: {
    label: 'Simulated',
    dot: 'bg-amber-400',
    classes: 'border-amber-400/25 bg-amber-400/10 text-amber-400',
  },
  liveExchange: {
    label: 'Live Exchange',
    dot: 'bg-emerald-400',
    classes: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-400',
  },
  livePortfolio: {
    label: 'Live Portfolio',
    dot: 'bg-emerald-400',
    classes: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-400',
  },
};

export function DataStatusBadge({
  type,
  explanation,
  className,
}: {
  type: DataStatus;
  explanation: string;
  className?: string;
}) {
  const status = STATUS_COPY[type];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] whitespace-nowrap',
        status.classes,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', status.dot)} aria-hidden="true" />
      {status.label}
      <InfoTooltip text={explanation} side="bottom" />
    </span>
  );
}
