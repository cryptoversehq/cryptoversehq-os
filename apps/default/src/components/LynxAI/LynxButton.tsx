/**
 * LynxButton.tsx — Floating AI button (bottom-right).
 * Just the image of the Lynx cat, no circles around or around it.
 */

import React from 'react';
import { LynxLogo } from './LynxLogo';

interface LynxButtonProps {
  unreadCount?: number;
  isOnline?: boolean;
  onClick: () => void;
}

export function LynxButton({ onClick }: LynxButtonProps) {
  return (
    <button
      onClick={onClick}
      className="lynx-button fixed bottom-6 right-6 z-50 group"
      aria-label="Open Lynx AI chat"
    >
      <div className="relative transition-all hover:scale-110">
        <LynxLogo size={52} state="idle" />
      </div>
      <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
        Lynx AI
      </span>
    </button>
  );
}
