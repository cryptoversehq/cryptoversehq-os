import React from 'react';
import type { BotStatus } from '../../lib/botTypes';
import { STATUS_META } from './BotConstants';

interface Props {
  status: BotStatus;
  size?: 'sm' | 'md';
}

export function BotStatusBadge({ status, size = 'sm' }: Props) {
  const m = STATUS_META[status];
  const cls = size === 'md' ? 'text-xs px-2.5 py-1' : 'text-[10px] px-2 py-0.5';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${cls}`}
      style={{ color: m.color, background: m.bg, border: `1px solid ${m.border}` }}
    >
      <span
        className={`rounded-full ${status === 'active' ? 'animate-pulse' : ''}`}
        style={{ width: 6, height: 6, background: m.dot, display: 'inline-block' }}
      />
      {m.label}
    </span>
  );
}
